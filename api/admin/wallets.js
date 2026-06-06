const { isAdminAuthed } = require("../../lib/admin");
const { readHistory } = require("../../lib/history");
const { buildWalletSummary, buildStats } = require("../../lib/wallets");
const { json } = require("../../lib/http");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    json(res, 405, { error: "method not allowed" });
    return;
  }

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
};
