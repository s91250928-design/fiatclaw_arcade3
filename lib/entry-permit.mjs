import { prepare } from "./fund-credit.mjs";

function body(req) {
  let b = req.body;
  if (!b || typeof b !== "object") {
    try { b = JSON.parse(req.body || "{}"); } catch { b = {}; }
  }
  return b || {};
}

function say(res, status, payload) {
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.status(status).send(JSON.stringify(payload));
}

export default async function handler(req, res) {
  if (req.method !== "POST") return say(res, 405, { error: "method" });
  try {
    const b = body(req);
    say(res, 200, await prepare({ address: b.address, amount: b.amount }));
  } catch (e) {
    const msg = String(e?.message || "Не собралось").replace(/\s+/g, " ").slice(0, 220);
    say(res, e.status || 502, { error: msg });
  }
}
