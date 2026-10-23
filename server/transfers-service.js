// TRANSFERS SERVICE (port 3002)
// Prima zahtjeve za transfer i obradjuje ih ASINHRONO:
// odmah vrati status PENDING, a novac pomjeri malo kasnije,
// tako sto zove Accounts service (debit pa credit).
// Pokretanje: node transfers-service.js

const http = require("http");

const PORT = process.env.TRANSFERS_PORT || 3002;
const ACCOUNTS_URL = process.env.ACCOUNTS_URL || "http://localhost:3001";
const SERVICE_KEY = "internal-secret";
const PROCESSING_DELAY_MS = 1500;

let transfers = [];
let nextId = 1;

function send(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let d = "";
    req.on("data", (c) => (d += c));
    req.on("end", () => {
      if (!d) return resolve({});
      try { resolve(JSON.parse(d)); } catch { reject(new SyntaxError("Invalid JSON")); }
    });
  });
}

class AccountsUnavailable extends Error {}

// Poziv prema Accounts servisu. Ako ne odgovori ili je u kvaru, baci AccountsUnavailable.
async function callAccounts(method, path, { token, body } = {}) {
  const headers = { "x-service-key": SERVICE_KEY, "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  let r;
  try {
    r = await fetch(`${ACCOUNTS_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    throw new AccountsUnavailable();
  }
  if (r.status === 503) throw new AccountsUnavailable();
  return { status: r.status, body: await r.json() };
}

async function processTransfer(t) {
  try {
    const debit = await callAccounts("POST", `/internal/accounts/${t.fromAccountId}/debit`, { body: { amount: t.amount } });
    if (debit.status !== 200) {
      t.status = "REJECTED";
      t.reason = debit.body.error;
      return;
    }
    const credit = await callAccounts("POST", `/internal/accounts/${t.toAccountId}/credit`, { body: { amount: t.amount } });
    if (credit.status !== 200) {
      // Kompenzacija: vrati novac na racun s kojeg je skinut
      await callAccounts("POST", `/internal/accounts/${t.fromAccountId}/credit`, { body: { amount: t.amount } });
      t.status = "FAILED";
      t.reason = "Credit failed, debit reversed";
      return;
    }
    t.status = "COMPLETED";
  } catch {
    t.status = "FAILED";
    t.reason = "Accounts service unavailable during processing";
  } finally {
    t.updatedAt = new Date().toISOString();
    console.log(`[transfers] ${t.id} -> ${t.status}${t.reason ? " (" + t.reason + ")" : ""}`);
  }
}

const server = http.createServer(async (req, res) => {
  const started = Date.now();
  res.on("finish", () =>
    console.log(`[transfers] ${req.method} ${req.url} -> ${res.statusCode} (${Date.now() - started}ms)`),
  );
  try {
    const path = new URL(req.url, "http://x").pathname;
    const m = req.method;

    if (m === "GET" && path === "/api/health") return send(res, 200, { status: "ok", service: "transfers" });

    const token = ((req.headers["authorization"] || "").match(/^Bearer (.+)$/) || [])[1];
    if (!token) return send(res, 401, { error: "Missing or invalid token" });

    // Ko je korisnik? Pitamo Accounts service.
    const who = await callAccounts("GET", "/internal/validate-token", { token });
    if (who.status !== 200) return send(res, 401, { error: "Missing or invalid token" });
    const userId = who.body.userId;

    if (m === "POST" && path === "/api/transfers") {
      const { fromAccountId, toAccountId, amount, description } = await readBody(req);
      if (!fromAccountId || !toAccountId || amount === undefined)
        return send(res, 400, { error: "fromAccountId, toAccountId and amount are required" });
      if (typeof amount !== "number" || amount <= 0)
        return send(res, 400, { error: "amount must be a number greater than 0" });
      if (fromAccountId === toAccountId) return send(res, 400, { error: "Cannot transfer to the same account" });

      const from = await callAccounts("GET", `/internal/accounts/${fromAccountId}`);
      const to = await callAccounts("GET", `/internal/accounts/${toAccountId}`);
      if (from.status === 404 || to.status === 404) return send(res, 404, { error: "Account not found" });
      if (from.body.account.ownerId !== userId)
        return send(res, 403, { error: "You do not have access to this account" });

      const t = {
        id: `TRF-${nextId++}`,
        fromAccountId,
        toAccountId,
        amount,
        description: description || "",
        status: "PENDING",
        createdBy: userId,
        createdAt: new Date().toISOString(),
      };
      transfers.push(t);
      setTimeout(() => processTransfer(t), PROCESSING_DELAY_MS);
      const { createdBy, ...publicTransfer } = t;
      return send(res, 202, { transfer: publicTransfer });
    }

    const r = path.match(/^\/api\/transfers\/([^/]+)$/);
    if (m === "GET" && r) {
      const t = transfers.find((x) => x.id === r[1] && x.createdBy === userId);
      if (!t) return send(res, 404, { error: "Transfer not found" });
      const { createdBy, ...publicTransfer } = t;
      return send(res, 200, { transfer: publicTransfer });
    }

    send(res, 404, { error: "Not found" });
  } catch (e) {
    if (e instanceof AccountsUnavailable) return send(res, 503, { error: "Accounts service unavailable" });
    if (e instanceof SyntaxError) return send(res, 400, { error: "Invalid JSON body" });
    console.error(e);
    send(res, 500, { error: "Internal server error" });
  }
});

server.listen(PORT, () => console.log(`Transfers service radi na http://localhost:${PORT} (Accounts: ${ACCOUNTS_URL})`));
