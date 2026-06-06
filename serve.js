const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const root = __dirname;
const port = Number(process.env.PORT) || 5501;
const {
  getAdminPassword,
  isAdminAuthed,
  setAdminCookie,
  clearAdminCookie,
  getClientIp,
} = require("./lib/admin");
const { readHistory, writeHistory } = require("./lib/history");
const { buildWalletSummary, buildStats } = require("./lib/wallets");

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

    const data = await readHistory();
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

    data.events = data.events || [];
    data.events.unshift(event);
    if (data.events.length > 5000) data.events.length = 5000;
    await writeHistory(data);

    json(res, 200, { ok: true, id: event.id });
  } catch {
    json(res, 400, { error: "invalid request" });
  }
}

async function handleAdminLogin(req, res) {
  try {
    const raw = await readBody(req);
    const body = raw ? JSON.parse(raw) : {};
    if (body.password !== getAdminPassword()) {
      json(res, 401, { ok: false, error: "invalid password" });
      return;
    }
    setAdminCookie(req, res);
    json(res, 200, { ok: true });
  } catch {
    json(res, 400, { error: "invalid request" });
  }
}

function handleAdminLogout(req, res) {
  clearAdminCookie(req, res);
  json(res, 200, { ok: true });
}

async function handleAdminData(req, res) {
  if (!isAdminAuthed(req)) {
    json(res, 401, { error: "unauthorized" });
    return;
  }

  const data = await readHistory();
  const events = data.events || [];
  const wallets = buildWalletSummary(events);

  json(res, 200, {
    ok: true,
    stats: buildStats(events),
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
    await handleAdminData(req, res);
    return;
  }

  if (req.method === "GET" && urlPath === "/api/admin/check") {
    json(res, 200, { allowed: isAdminAuthed(req) });
    return;
  }

  if (urlPath === "/admin" || urlPath === "/admin.html" || urlPath === "/admin/") {
    serveStatic("/admin/index.html", res);
    return;
  }

  serveStatic(urlPath, res);
});

server.listen(port, "0.0.0.0", () => {
  console.log(`World Kup site running at http://127.0.0.1:${port}/`);
  console.log(`Admin panel: http://127.0.0.1:${port}/admin`);
});
