function json(res, status, payload) {
  res.status(status).json(payload);
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    if (req.body !== undefined && req.body !== null) {
      if (typeof req.body === "string") {
        resolve(req.body);
        return;
      }
      if (Buffer.isBuffer(req.body)) {
        resolve(req.body.toString("utf8"));
        return;
      }
      if (typeof req.body === "object") {
        resolve(JSON.stringify(req.body));
        return;
      }
    }

    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 1e6) reject(new Error("Body too large"));
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

async function readJsonBody(req) {
  const raw = await readRawBody(req);
  if (!raw) return {};
  return JSON.parse(raw);
}

module.exports = { json, readJsonBody };
