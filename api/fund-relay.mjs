import { submit } from "../lib/fund-credit.mjs";

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

function human(msg) {
  const m = String(msg || "").replace(/\s+/g, " ").slice(0, 220);
  if (/insufficient funds/i.test(m)) return "На газовом адресе кончился ETH. Ваши USDC на месте.";
  if (/nonce too low|replacement transaction|already known/i.test(m)) return "Зачисление уже уходит. Подождите минуту и нажмите ещё раз, если сумма не появилась.";
  if (/max fee per gas less than block base fee/i.test(m)) return "Сеть Arbitrum сейчас дорогая. Повторите через минуту. Деньги на месте.";
  return m;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return say(res, 405, { error: "method" });
  try {
    const b = body(req);
    const ip = String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "").split(",")[0].trim();
    say(res, 200, await submit({ address: b.address, usd: b.usd, deadline: b.deadline, nonce: b.nonce, sig: b.sig, ip }));
  } catch (e) {
    say(res, e.status || 502, { error: human(e.message) });
  }
}
