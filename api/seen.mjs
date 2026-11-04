// Запоминаем адреса, которые подключали кошелёк к Totum: по ним сервер выплат ищет трейдеров
// (дневные файлы сделок Hyperliquid публикуются не всегда). Ничего, кроме адреса, не храним;
// доля считается только по настоящим сделкам с комиссией Totum, поэтому лишний адрес ничего не даст.
const env = (end) => process.env[`KV_${end}`] || Object.entries(process.env).find(([k]) => k.endsWith(`_${end}`) && !k.includes("READ_ONLY"))?.[1];
export default async function handler(req, res) {
  res.setHeader("cache-control", "no-store");
  const URL_ = env("REST_API_URL"), TOKEN = env("REST_API_TOKEN");
  if (req.method !== "POST" || !URL_ || !TOKEN) return res.status(204).end();
  try {
    const b = typeof req.body === "object" && req.body ? req.body : JSON.parse(req.body || "{}");
    const u = String(b.user || "").toLowerCase();
    if (!/^0x[0-9a-f]{40}$/.test(u)) return res.status(400).send('{"error":"адрес"}');
    await fetch(`${URL_}/pipeline`, { method: "POST", headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" }, body: JSON.stringify([["SADD", "totum:users", u]]) });
    res.status(204).end();
  } catch {
    res.status(204).end();
  }
}
