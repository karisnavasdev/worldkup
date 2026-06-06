const fs = require("fs");
const path = require("path");

const HISTORY_KEY = "worldkup:wallet-history";
const HISTORY_FILE = path.join(process.cwd(), "data", "wallet-history.json");

function hasKv() {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

function ensureDataFile() {
  const dir = path.dirname(HISTORY_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(HISTORY_FILE)) {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify({ events: [] }, null, 2));
  }
}

async function readHistory() {
  if (hasKv()) {
    const { kv } = require("@vercel/kv");
    const data = await kv.get(HISTORY_KEY);
    return data || { events: [] };
  }

  ensureDataFile();
  try {
    return JSON.parse(fs.readFileSync(HISTORY_FILE, "utf8"));
  } catch {
    return { events: [] };
  }
}

async function writeHistory(data) {
  if (hasKv()) {
    const { kv } = require("@vercel/kv");
    await kv.set(HISTORY_KEY, data);
    return;
  }

  ensureDataFile();
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(data, null, 2));
}

module.exports = { readHistory, writeHistory, hasKv };
