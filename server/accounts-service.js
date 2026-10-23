// ACCOUNTS SERVICE (port 3001)
// Vodi korisnike, login i racune. Drugi servisi ga zovu preko /internal endpointa.
// Pokretanje: node accounts-service.js

const http = require("http");
const crypto = require("crypto");

const PORT = process.env.ACCOUNTS_PORT || 3001;
const SERVICE_KEY = "internal-secret";

const USERS = [
  { id: 1, username: "lamija", password: "Test123!" },
  { id: 2, username: "amar", password: "Test123!" },
];
const tokens = new Map();

let accounts, nextAccountNumber, outage, failCreditsFor;
function resetData() {
  accounts = [
    { id: "ACC-1001", ownerId: 1, type: "CHECKING", balance: 100000 },
    { id: "ACC-2001", ownerId: 2, type: "CHECKING", balance: 75000 },
  ];
  nextAccountNumber = 5001;
  outage = false;
  failCreditsFor = null;
}
resetData();

const toCents = (n) => Math.round(n * 100);
const fromCents = (c) => c / 100;
const pub = (a) => ({ id: a.id, type: a.type, balance: fromCents(a.balance) });

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
function userFromToken(req) {
  const m = (req.headers["authorization"] || "").match(/^Bearer (.+)$/);
  if (!m) return null;
  const id = tokens.get(m[1]);
  return USERS.find((u) => u.id === id) || null;
}

const server = http.createServer(async (req, res) => {
  const started = Date.now();
  res.on("finish", () =>
    console.log(`[accounts] ${req.method} ${req.url} -> ${res.statusCode} (${Date.now() - started}ms)`),
  );
  try {
    const path = new URL(req.url, "http://x").pathname;
    const m = req.method;

    // ---------- javni endpointi ----------
    if (m === "GET" && path === "/api/health") return send(res, 200, { status: "ok", service: "accounts" });

    if (m === "POST" && path === "/api/login") {
      const b = await readBody(req);
      const u = USERS.find((x) => x.username === b.username && x.password === b.password);
      if (!u) return send(res, 401, { error: "Invalid username or password" });
      const token = crypto.randomUUID();
      tokens.set(token, u.id);
      return send(res, 200, { token });
    }

    // ---------- admin (samo za testiranje) ----------
    if (m === "POST" && path === "/admin/reset") { resetData(); return send(res, 200, { status: "reset" }); }
    if (m === "POST" && path === "/admin/outage") {
      outage = !!(await readBody(req)).enabled;
      return send(res, 200, { outage });
    }
    // Simulira kvar: svaki credit na ovaj racun ce pasti (accountId: null iskljucuje)
    if (m === "POST" && path === "/admin/fail-credits") {
      failCreditsFor = (await readBody(req)).accountId || null;
      return send(res, 200, { failCreditsFor });
    }

    // ---------- interni endpointi (servis-servisu) ----------
    if (path.startsWith("/internal/")) {
      if (req.headers["x-service-key"] !== SERVICE_KEY) return send(res, 401, { error: "Invalid service key" });
      if (outage) return send(res, 503, { error: "Accounts service is down for maintenance" });

      if (m === "GET" && path === "/internal/validate-token") {
        const u = userFromToken(req);
        if (!u) return send(res, 401, { error: "Missing or invalid token" });
        return send(res, 200, { userId: u.id });
      }

      let r = path.match(/^\/internal\/accounts\/([^/]+)$/);
      if (m === "GET" && r) {
        const a = accounts.find((x) => x.id === r[1]);
        if (!a) return send(res, 404, { error: "Account not found" });
        return send(res, 200, { account: { ...pub(a), ownerId: a.ownerId } });
      }

      r = path.match(/^\/internal\/accounts\/([^/]+)\/(debit|credit)$/);
      if (m === "POST" && r) {
        const a = accounts.find((x) => x.id === r[1]);
        if (!a) return send(res, 404, { error: "Account not found" });
        const cents = toCents((await readBody(req)).amount);
        if (r[2] === "debit") {
          if (a.balance < cents) return send(res, 422, { error: "Insufficient funds" });
          a.balance -= cents;
        } else {
          if (failCreditsFor === a.id) return send(res, 500, { error: "Credit failed" });
          a.balance += cents;
        }
        return send(res, 200, { account: pub(a) });
      }
      return send(res, 404, { error: "Not found" });
    }

    // ---------- javni endpointi s tokenom ----------
    const user = userFromToken(req);
    if (!user) return send(res, 401, { error: "Missing or invalid token" });

    if (m === "POST" && path === "/api/accounts") {
      const b = await readBody(req);
      if (b.type !== "CHECKING" && b.type !== "SAVINGS") return send(res, 400, { error: "type must be CHECKING or SAVINGS" });
      const dep = b.initialDeposit ?? 0;
      if (typeof dep !== "number" || dep < 0) return send(res, 400, { error: "initialDeposit must be a number >= 0" });
      const a = { id: `ACC-${nextAccountNumber++}`, ownerId: user.id, type: b.type, balance: toCents(dep) };
      accounts.push(a);
      return send(res, 201, { account: pub(a) });
    }

    const r = path.match(/^\/api\/accounts\/([^/]+)$/);
    if (m === "GET" && r) {
      const a = accounts.find((x) => x.id === r[1]);
      if (!a) return send(res, 404, { error: "Account not found" });
      if (a.ownerId !== user.id) return send(res, 403, { error: "You do not have access to this account" });
      return send(res, 200, { account: pub(a) });
    }

    send(res, 404, { error: "Not found" });
  } catch (e) {
    if (e instanceof SyntaxError) return send(res, 400, { error: "Invalid JSON body" });
    console.error(e);
    send(res, 500, { error: "Internal server error" });
  }
});

server.listen(PORT, () => console.log(`Accounts service radi na http://localhost:${PORT}`));
