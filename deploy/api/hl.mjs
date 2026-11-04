// Списки рынков Hyperliquid через наш сервер: Hyperliquid отдаёт их несжатыми и издалека,
// а Vercel сжимает ответ (~в 6 раз) и держит свежую копию рядом с человеком несколько секунд.
// Только чтение и только эти виды запросов — ничего, что касается счёта или сделок.
const OK = new Set(["spotMetaAndAssetCtxs", "metaAndAssetCtxs", "allPerpMetas", "perpCategories", "perpDexs", "spotMeta", "meta"]);
export default async function handler(req, res) {
  const q = new URL(req.url, "http://x").searchParams, type = q.get("type") || "";
  if (!OK.has(type)) return res.status(400).send('{"error":"type"}');
  const body = { type }, dex = q.get("dex");
  dex && /^[a-z0-9]{1,12}$/i.test(dex) && (body.dex = dex);
  try {
    const r = await fetch("https://api.hyperliquid.xyz/info", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(15e3) });
    const txt = await r.text();
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.setHeader("cache-control", r.ok ? "public, s-maxage=4, stale-while-revalidate=30" : "no-store");
    res.status(r.status).send(txt);
  } catch (e) {
    res.setHeader("cache-control", "no-store");
    res.status(502).send(JSON.stringify({ error: String(e?.message || e) }));
  }
}
