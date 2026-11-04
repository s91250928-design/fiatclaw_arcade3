// Покупки/продажи по свечам для графика Original — посредник к сборщику на Cloudflare.
// Адрес сборщика — в переменной Vercel DELTA_URL (наружу не светится). Нет адреса — пусто.
export default async function handler(req, res) {
  const base = (process.env.DELTA_URL || "").replace(/\/+$/, "");
  res.setHeader("content-type", "application/json; charset=utf-8");
  if (!base) return res.status(200).setHeader("cache-control", "public, s-maxage=60").send('{"rows":[],"off":true}');
  const q = new URL(req.url, "http://x").searchParams, coin = q.get("coin") || "", i = Number(q.get("i") || 60), from = Number(q.get("from") || 0), to = Number(q.get("to") || 0);
  if (!/^[A-Za-z0-9:@._-]{1,30}$/.test(coin) || !(i >= 60)) return res.status(400).send('{"error":"params"}');
  try {
    const r = await fetch(`${base}/delta?coin=${encodeURIComponent(coin)}&i=${i}&from=${from}&to=${to}`, { signal: AbortSignal.timeout(8e3) });
    const txt = await r.text();
    res.setHeader("cache-control", r.ok ? "public, s-maxage=15, stale-while-revalidate=60" : "no-store");
    res.status(r.ok ? 200 : 502).send(txt);
  } catch (e) {
    res.setHeader("cache-control", "no-store");
    res.status(502).send(JSON.stringify({ error: String(e?.message || e) }));
  }
}
