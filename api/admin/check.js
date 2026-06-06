const { isAdminAuthed } = require("../../lib/admin");
const { json } = require("../../lib/http");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    json(res, 405, { error: "method not allowed" });
    return;
  }

  json(res, 200, { allowed: isAdminAuthed(req) });
};
