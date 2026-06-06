const { getAdminPassword, setAdminCookie } = require("../../lib/admin");
const { json, readJsonBody } = require("../../lib/http");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    json(res, 405, { error: "method not allowed" });
    return;
  }

  try {
    const body = await readJsonBody(req);
    if (body.password !== getAdminPassword()) {
      json(res, 401, { ok: false, error: "invalid password" });
      return;
    }

    setAdminCookie(req, res);
    json(res, 200, { ok: true });
  } catch {
    json(res, 400, { error: "invalid request" });
  }
};
