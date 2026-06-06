const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const root = __dirname;
const port = Number(process.env.PORT) || 5501;
const ADMIN_PASSWORD = "worldcupcoins";
const SESSION_COOKIE = "worldkup_admin";
const SESSION_TOKEN = crypto
  .createHash("sha256")
  .update(`${ADMIN_PASSWORD}:worldkup-admin`)
  .digest("hex");
const DATA_DIR = path.join(root, "data");
const HISTORY_FILE = path.join(DATA_DIR, "wallet-history.json");

const mime = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".json": "application/json",
};

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) return forwarded.split(",")[0].trim();
  const ip = req.socket.remoteAddress || "";
  return ip.replace(/^::ffff:/, "");
}

function parseCookies(req) {
  const header = req.headers.cookie || "";
  const cookies = {};
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq);
    const value = trimmed.slice(eq + 1);
    cookies[key] = decodeURIComponent(value);
  }
  return cookies;
}

function isAdminAuthed(req) {
  return parseCookies(req)[SESSION_COOKIE] === SESSION_TOKEN;
}

function setAdminCookie(res) {
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=${SESSION_TOKEN}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400`
  );
}

function clearAdminCookie(res) {
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`
  );
}

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(HISTORY_FILE)) {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify({ events: [] }, null, 2));
  }
}

function readHistory() {
  ensureDataFile();
  try {
    return JSON.parse(fs.readFileSync(HISTORY_FILE, "utf8"));
  } catch {
    return { events: [] };
  }
}

function writeHistory(data) {
  ensureDataFile();
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(data, null, 2));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 1e6) reject(new Error("Body too large"));
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function json(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
}

function buildWalletSummary(events) {
  const wallets = {};

  for (const event of events) {
    if (!event.address) continue;
    const key = event.address;
    if (!wallets[key]) {
      wallets[key] = {
        address: key,
        walletType: event.walletType || "phantom",
        firstSeen: event.timestamp,
        lastSeen: event.timestamp,
        connectCount: 0,
        disconnectCount: 0,
        accountChanges: 0,
        ips: new Set(),
        userAgents: new Set(),
        sessions: new Set(),
      };
    }

    const w = wallets[key];
    w.lastSeen = event.timestamp;
    w.walletType = event.walletType || w.walletType;
    if (event.ip) w.ips.add(event.ip);
    if (event.userAgent) w.userAgents.add(event.userAgent);
    if (event.sessionId) w.sessions.add(event.sessionId);

    if (event.action === "connect") w.connectCount += 1;
    if (event.action === "disconnect") w.disconnectCount += 1;
    if (event.action === "account_change") w.accountChanges += 1;
  }

  return Object.values(wallets)
    .map((w) => ({
      ...w,
      ips: [...w.ips],
      userAgents: [...w.userAgents],
      sessions: [...w.sessions],
    }))
    .sort((a, b) => new Date(b.lastSeen) - new Date(a.lastSeen));
}

async function handleWalletEvent(req, res) {
  try {
    const raw = await readBody(req);
    const body = raw ? JSON.parse(raw) : {};
    const address = typeof body.address === "string" ? body.address.trim() : "";
    const action = ["connect", "disconnect", "account_change"].includes(body.action)
      ? body.action
      : "connect";

    if (!address && action !== "disconnect") {
      json(res, 400, { error: "address required" });
      return;
    }

    const data = readHistory();
    const event = {
      id: crypto.randomUUID(),
      address: address || body.previousAddress || "unknown",
      walletType: body.walletType || "phantom",
      action,
      ip: getClientIp(req),
      userAgent: req.headers["user-agent"] || "",
      referrer: body.referrer || req.headers.referer || "",
      pageUrl: body.pageUrl || "",
      sessionId: body.sessionId || "",
      previousAddress: body.previousAddress || "",
      timestamp: new Date().toISOString(),
    };

    data.events.unshift(event);
    if (data.events.length > 5000) data.events.length = 5000;
    writeHistory(data);

    json(res, 200, { ok: true, id: event.id });
  } catch {
    json(res, 400, { error: "invalid request" });
  }
}

async function handleAdminLogin(req, res) {
  try {
    const raw = await readBody(req);
    const body = raw ? JSON.parse(raw) : {};
    if (body.password !== ADMIN_PASSWORD) {
      json(res, 401, { ok: false, error: "invalid password" });
      return;
    }
    setAdminCookie(res);
    json(res, 200, { ok: true });
  } catch {
    json(res, 400, { error: "invalid request" });
  }
}

function handleAdminLogout(req, res) {
  clearAdminCookie(res);
  json(res, 200, { ok: true });
}

function handleAdminData(req, res) {
  if (!isAdminAuthed(req)) {
    json(res, 401, { error: "unauthorized" });
    return;
  }

  const data = readHistory();
  const events = data.events || [];
  const wallets = buildWalletSummary(events);

  json(res, 200, {
    ok: true,
    stats: {
      totalEvents: events.length,
      uniqueWallets: wallets.length,
      uniqueIps: new Set(events.map((e) => e.ip).filter(Boolean)).size,
      connects: events.filter((e) => e.action === "connect").length,
      disconnects: events.filter((e) => e.action === "disconnect").length,
    },
    wallets,
    events,
  });
}

function serveStatic(urlPath, res) {
  let filePath = urlPath;
  if (filePath === "/") filePath = "/index.html";
  if (filePath.endsWith("/")) filePath += "index.html";

  const absPath = path.normalize(path.join(root, filePath));

  if (!absPath.startsWith(root)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(absPath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end(`Not found: ${urlPath}`);
      return;
    }

    res.writeHead(200, {
      "Content-Type": mime[path.extname(absPath).toLowerCase()] || "application/octet-stream",
    });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const urlPath = decodeURIComponent(req.url.split("?")[0]);

  if (req.method === "POST" && urlPath === "/api/wallet/event") {
    await handleWalletEvent(req, res);
    return;
  }

  if (req.method === "POST" && urlPath === "/api/admin/login") {
    await handleAdminLogin(req, res);
    return;
  }

  if (req.method === "POST" && urlPath === "/api/admin/logout") {
    handleAdminLogout(req, res);
    return;
  }

  if (req.method === "GET" && urlPath === "/api/admin/wallets") {
    handleAdminData(req, res);
    return;
  }

  if (req.method === "GET" && urlPath === "/api/admin/check") {
    json(res, 200, { allowed: isAdminAuthed(req) });
    return;
  }

  if (urlPath === "/admin" || urlPath === "/admin.html") {
    serveStatic("/admin.html", res);
    return;
  }

  serveStatic(urlPath, res);
});

ensureDataFile();

server.listen(port, "0.0.0.0", () => {
  console.log(`World Kup site running at http://127.0.0.1:${port}/`);
  console.log(`Admin panel: http://127.0.0.1:${port}/admin`);
});
