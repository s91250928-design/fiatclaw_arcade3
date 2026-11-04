/* Ядро сборщика: сделки → минутные корзины «куплено / продано / сделок» по каждой монете.
   Отдельно от Cloudflare, чтобы проверять обычными тестами. */
export const MIN = 60;
export function addTrades(buf, seen, trades) {
  let n = 0;
  for (const t of trades || []) {
    const id = t.tid ?? `${t.time}|${t.px}|${t.sz}|${t.side}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const m = Math.floor(t.time / 6e4) * MIN, k = `${t.coin}|${m}`, usd = +t.px * +t.sz;
    if (!(usd > 0)) continue;
    const o = buf.get(k) || { coin: t.coin, t: m, b: 0, s: 0, n: 0 };
    t.side === "B" ? (o.b += usd) : (o.s += usd);
    o.n++;
    buf.set(k, o);
    n++;
  }
  if (seen.size > 2e5) { const keep = [...seen].slice(-5e4); seen.clear(); keep.forEach((x) => seen.add(x)); }
  return n;
}
export const SCHEMA = "CREATE TABLE IF NOT EXISTS m (coin TEXT NOT NULL, t INTEGER NOT NULL, b REAL NOT NULL, s REAL NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (coin, t)) WITHOUT ROWID";
export function flush(sql, buf) {
  let n = 0;
  for (const o of buf.values()) {
    sql.exec("INSERT INTO m (coin, t, b, s, n) VALUES (?, ?, ?, ?, ?) ON CONFLICT (coin, t) DO UPDATE SET b = b + excluded.b, s = s + excluded.s, n = n + excluded.n", o.coin, o.t, o.b, o.s, o.n);
    n++;
  }
  buf.clear();
  return n;
}
/* корзины под свечу интервала i секунд (60, 300, 900, 3600, 14400, 86400): начало свечи = как у Hyperliquid (UTC) */
export function query(sql, coin, i, from, to) {
  i = Math.max(60, Math.floor(i / 60) * 60);
  return sql
    .exec("SELECT CAST(t / ? AS INTEGER) * ? AS k, SUM(b) AS b, SUM(s) AS s, SUM(n) AS n FROM m WHERE coin = ? AND t >= ? AND t < ? GROUP BY k ORDER BY k LIMIT 5000", i, i, coin, from, to)
    .toArray()
    .map((r) => [r.k, Math.round(r.b), Math.round(r.s), r.n]);
}
