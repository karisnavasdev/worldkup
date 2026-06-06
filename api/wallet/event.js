const crypto = require("crypto");
const { getClientIp } = require("../../lib/admin");
const { readHistory, writeHistory } = require("../../lib/history");
const { json, readJsonBody } = require("../../lib/http");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    json(res, 405, { error: "method not allowed" });
    return;
  }

  try {
    const body = await readJsonBody(req);
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
};
