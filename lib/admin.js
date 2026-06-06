const crypto = require("crypto");

const SESSION_COOKIE = "worldkup_admin";

function getAdminPassword() {
  return process.env.ADMIN_PASSWORD || "worldcupcoins";
}

function getSessionToken() {
  return crypto
    .createHash("sha256")
    .update(`${getAdminPassword()}:worldkup-admin`)
    .digest("hex");
}

function parseCookies(req) {
  const header = req.headers.cookie || "";
  const cookies = {};
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    cookies[trimmed.slice(0, eq)] = decodeURIComponent(trimmed.slice(eq + 1));
  }
  return cookies;
}

function isAdminAuthed(req) {
  return parseCookies(req)[SESSION_COOKIE] === getSessionToken();
}

function isSecureRequest(req) {
  if (req.headers["x-forwarded-proto"] === "https") return true;
  return Boolean(req.socket && req.socket.encrypted);
}

function adminCookieFlags(req) {
  const secure = isSecureRequest(req) ? "; Secure" : "";
  return `Path=/; HttpOnly; SameSite=Lax${secure}; Max-Age=`;
}

function setAdminCookie(req, res) {
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=${getSessionToken()}; ${adminCookieFlags(req)}86400`
  );
}

function clearAdminCookie(req, res) {
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=; ${adminCookieFlags(req)}0`
  );
}

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) return String(forwarded).split(",")[0].trim();
  const ip = (req.socket && req.socket.remoteAddress) || "";
  return ip.replace(/^::ffff:/, "");
}

module.exports = {
  SESSION_COOKIE,
  getAdminPassword,
  getSessionToken,
  parseCookies,
  isAdminAuthed,
  setAdminCookie,
  clearAdminCookie,
  getClientIp,
};
