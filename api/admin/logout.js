const { clearAdminCookie } = require("../../lib/admin");
const { json } = require("../../lib/http");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    json(res, 405, { error: "method not allowed" });
    return;
  }

  clearAdminCookie(req, res);
  json(res, 200, { ok: true });
};
