// Mini Bank API - lokalni bank API for practice
// Run: node server/server.js


const http = require("http");
const crypto = require("crypto");

const PORT = process.env.PORT || 3000;
const TRANSFER_LIMIT_CENTS = 1000000; // 10 000.00 po transferu
const MAX_INITIAL_DEPOSIT_CENTS = 10000000; // 100 000.00

const USERS = [
  { id: 1, username: "lamija", password: "Test123!", name: "Lamija Pehilj" },
  { id: 2, username: "amar", password: "Test123!", name: "Amar Hodzic" },
];

// Tokeni prezivljavaju reset, da reset u jednom testu ne izloguje druge
const tokens = new Map();

let accounts, transactions, transfers, idempotencyKeys;
let nextAccountNumber, nextTransferId, nextTransactionId;

function resetData() {
  // Iznosi se cuvaju u centima, da nema gresaka s decimalama
  accounts = [
    { id: "ACC-1001", ownerId: 1, type: "CHECKING", currency: "BAM", balance: 100000 },
    { id: "ACC-1002", ownerId: 1, type: "SAVINGS", currency: "BAM", balance: 50000 },
    { id: "ACC-2001", ownerId: 2, type: "CHECKING", currency: "BAM", balance: 75000 },
  ];
  transactions = [];
  transfers = [];
  idempotencyKeys = new Map();
  nextAccountNumber = 3001;
  nextTransferId = 1;
  nextTransactionId = 1;
}
resetData();

// ---------- Pomocne funkcije ----------

const toCents = (amount) => Math.round(amount * 100);
const fromCents = (cents) => cents / 100;
const hasMaxTwoDecimals = (n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-9;

function publicAccount(a) {
  return { id: a.id, type: a.type, currency: a.currency, balance: fromCents(a.balance) };
}

function publicTransfer(t) {
  return { ...t, amount: fromCents(t.amount) };
}

function publicTransaction(t) {
  return { ...t, amount: fromCents(t.amount), balanceAfter: fromCents(t.balanceAfter) };
}

function send(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(body === undefined ? "" : JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (e) {
        reject(new SyntaxError("Invalid JSON"));
      }
    });
  });
}

function authenticate(req) {
  const header = req.headers["authorization"] || "";
  const match = header.match(/^Bearer (.+)$/);
  if (!match) return null;
  const userId = tokens.get(match[1]);
  return USERS.find((u) => u.id === userId) || null;
}

// ---------- Handleri ----------

async function login(req, res) {
  const body = await readBody(req);
  if (!body.username || !body.password) {
    return send(res, 400, { error: "username and password are required" });
  }
  const user = USERS.find((u) => u.username === body.username && u.password === body.password);
  if (!user) {
    return send(res, 401, { error: "Invalid username or password" });
  }
  const token = crypto.randomUUID();
  tokens.set(token, user.id);
  send(res, 200, { token, user: { id: user.id, username: user.username, name: user.name } });
}

function listAccounts(req, res, user) {
  const own = accounts.filter((a) => a.ownerId === user.id).map(publicAccount);
  send(res, 200, { accounts: own });
}

async function createAccount(req, res, user) {
  const body = await readBody(req);
  const type = body.type;
  const initialDeposit = body.initialDeposit === undefined ? 0 : body.initialDeposit;

  if (type !== "CHECKING" && type !== "SAVINGS") {
    return send(res, 400, { error: "type must be CHECKING or SAVINGS" });
  }
  if (typeof initialDeposit !== "number" || !Number.isFinite(initialDeposit) || initialDeposit < 0) {
    return send(res, 400, { error: "initialDeposit must be a number greater than or equal to 0" });
  }
  if (!hasMaxTwoDecimals(initialDeposit)) {
    return send(res, 400, { error: "initialDeposit can have at most 2 decimal places" });
  }
  if (toCents(initialDeposit) > MAX_INITIAL_DEPOSIT_CENTS) {
    return send(res, 400, { error: "initialDeposit cannot be greater than 100000.00" });
  }

  const account = {
    id: `ACC-${nextAccountNumber++}`,
    ownerId: user.id,
    type,
    currency: "BAM",
    balance: toCents(initialDeposit),
  };
  accounts.push(account);
  send(res, 201, { account: publicAccount(account) });
}

function getAccount(req, res, user, accountId) {
  const account = accounts.find((a) => a.id === accountId);
  if (!account) return send(res, 404, { error: "Account not found" });
  if (account.ownerId !== user.id) {
    return send(res, 403, { error: "You do not have access to this account" });
  }
  send(res, 200, { account: publicAccount(account) });
}

function getAccountTransactions(req, res, user, accountId) {
  const account = accounts.find((a) => a.id === accountId);
  if (!account) return send(res, 404, { error: "Account not found" });
  if (account.ownerId !== user.id) {
    return send(res, 403, { error: "You do not have access to this account" });
  }
  const list = transactions
    .filter((t) => t.accountId === accountId)
    .slice()
    .reverse()
    .map(publicTransaction);
  send(res, 200, { transactions: list });
}

async function createTransfer(req, res, user) {
  const body = await readBody(req);
  const { fromAccountId, toAccountId, amount, description } = body;

  // Idempotency: isti kljuc od istog korisnika vraca isti transfer, bez novog skidanja novca
  const idemKeyHeader = req.headers["idempotency-key"];
  const idemKey = idemKeyHeader ? `${user.id}:${idemKeyHeader}` : null;
  if (idemKey && idempotencyKeys.has(idemKey)) {
    const existing = transfers.find((t) => t.id === idempotencyKeys.get(idemKey));
    return send(res, 200, { transfer: publicTransfer(existing) });
  }

  if (!fromAccountId || !toAccountId || amount === undefined) {
    return send(res, 400, { error: "fromAccountId, toAccountId and amount are required" });
  }
  if (typeof amount !== "number" || !Number.isFinite(amount)) {
    return send(res, 400, { error: "amount must be a number" });
  }
  if (amount <= 0) {
    return send(res, 400, { error: "amount must be greater than 0" });
  }
  if (!hasMaxTwoDecimals(amount)) {
    return send(res, 400, { error: "amount can have at most 2 decimal places" });
  }
  if (fromAccountId === toAccountId) {
    return send(res, 400, { error: "Cannot transfer to the same account" });
  }

  const from = accounts.find((a) => a.id === fromAccountId);
  const to = accounts.find((a) => a.id === toAccountId);
  if (!from || !to) {
    return send(res, 404, { error: "Account not found" });
  }
  if (from.ownerId !== user.id) {
    return send(res, 403, { error: "You do not have access to this account" });
  }

  const cents = toCents(amount);
  if (cents > TRANSFER_LIMIT_CENTS) {
    return send(res, 422, { error: "amount exceeds the transfer limit of 10000.00" });
  }
  if (from.balance < cents) {
    return send(res, 422, { error: "Insufficient funds" });
  }

  from.balance -= cents;
  to.balance += cents;

  const transfer = {
    id: `TRF-${nextTransferId++}`,
    fromAccountId,
    toAccountId,
    amount: cents,
    description: description || "",
    status: "COMPLETED",
    createdAt: new Date().toISOString(),
  };
  transfers.push(transfer);

  transactions.push({
    id: `TRX-${nextTransactionId++}`,
    accountId: from.id,
    type: "DEBIT",
    amount: cents,
    balanceAfter: from.balance,
    transferId: transfer.id,
    description: transfer.description,
    createdAt: transfer.createdAt,
  });
  transactions.push({
    id: `TRX-${nextTransactionId++}`,
    accountId: to.id,
    type: "CREDIT",
    amount: cents,
    balanceAfter: to.balance,
    transferId: transfer.id,
    description: transfer.description,
    createdAt: transfer.createdAt,
  });

  if (idemKey) idempotencyKeys.set(idemKey, transfer.id);

  send(res, 201, { transfer: publicTransfer(transfer) });
}

function getTransfer(req, res, user, transferId) {
  const transfer = transfers.find((t) => t.id === transferId);
  const ownedIds = accounts.filter((a) => a.ownerId === user.id).map((a) => a.id);
  // Tudji transfer vraca 404, da se ne otkrije ni da postoji
  if (!transfer || (!ownedIds.includes(transfer.fromAccountId) && !ownedIds.includes(transfer.toAccountId))) {
    return send(res, 404, { error: "Transfer not found" });
  }
  send(res, 200, { transfer: publicTransfer(transfer) });
}

// ---------- Router ----------

const server = http.createServer(async (req, res) => {
  const started = Date.now();
  res.on("finish", () => {
    console.log(`${req.method} ${req.url} -> ${res.statusCode} (${Date.now() - started}ms)`);
  });

  try {
    const path = new URL(req.url, "http://localhost").pathname;
    const method = req.method;

    if (method === "GET" && path === "/api/health") return send(res, 200, { status: "ok" });
    if (method === "POST" && path === "/api/login") return await login(req, res);
    if (method === "POST" && path === "/api/reset") {
      resetData();
      return send(res, 200, { status: "reset" });
    }

    // Sve ispod trazi token
    const user = authenticate(req);
    if (!user) return send(res, 401, { error: "Missing or invalid token" });

    if (method === "GET" && path === "/api/accounts") return listAccounts(req, res, user);
    if (method === "POST" && path === "/api/accounts") return await createAccount(req, res, user);

    let m = path.match(/^\/api\/accounts\/([^/]+)$/);
    if (method === "GET" && m) return getAccount(req, res, user, m[1]);

    m = path.match(/^\/api\/accounts\/([^/]+)\/transactions$/);
    if (method === "GET" && m) return getAccountTransactions(req, res, user, m[1]);

    if (method === "POST" && path === "/api/transfers") return await createTransfer(req, res, user);

    m = path.match(/^\/api\/transfers\/([^/]+)$/);
    if (method === "GET" && m) return getTransfer(req, res, user, m[1]);

    send(res, 404, { error: "Not found" });
  } catch (err) {
    if (err instanceof SyntaxError) return send(res, 400, { error: "Invalid JSON body" });
    console.error(err);
    send(res, 500, { error: "Internal server error" });
  }
});

server.listen(PORT, () => {
  console.log(`Mini Bank API radi na http://localhost:${PORT}`);
});