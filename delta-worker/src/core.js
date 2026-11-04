/* Ядро сборщика: сделки → минутные корзины «куплено / продано / сделок» по каждой монете.
   Отдельно от Cloudflare, чтобы проверять обычными тестами.

   Экономия записей (бесплатный лимит Cloudflare — 100 000 записей в сутки):
   - текущий час живёт в памяти (buf);
   - в базу пишем раз в час: одна строка на монету, внутри все её минуты этого часа;
   - раз в минуту — одна страховочная строка с тем, что в памяти (на случай перезапуска). */
export const MIN = 60, HOUR = 3600;
export function addTrades(buf, seen, trades, notBefore = 0) {
  let n = 0;
  for (const t of trades || []) {
    if (t.time < notBefore) continue; /* уже учтено до перезапуска */
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
export const SCHEMA = [
  /* h — час монеты: d = {"минута_от_начала_часа": [куплено, продано, сделок]} */
  "CREATE TABLE IF NOT EXISTS h (coin TEXT NOT NULL, h INTEGER NOT NULL, d TEXT NOT NULL, PRIMARY KEY (coin, h)) WITHOUT ROWID",
  /* ck — одна страховочная строка: всё, что сейчас в памяти */
  "CREATE TABLE IF NOT EXISTS ck (id INTEGER PRIMARY KEY, at INTEGER NOT NULL, d TEXT NOT NULL)",
];
export function setup(sql) {
  for (const q of SCHEMA) sql.exec(q);
  migrateOld(sql);
}
const hasTable = (sql, name) => sql.exec("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?", name).toArray().length > 0;
/* старая таблица m (одна строка на минуту) → новые часовые строки, один раз */
function migrateOld(sql) {
  if (!hasTable(sql, "m")) return 0;
  const tmp = new Map();
  for (const r of sql.exec("SELECT coin, t, b, s, n FROM m").toArray()) tmp.set(`${r.coin}|${r.t}`, { coin: r.coin, t: r.t, b: r.b, s: r.s, n: r.n });
  const n = writeHours(sql, tmp, () => true);
  sql.exec("DROP TABLE m");
  return n;
}
/* пишет в базу минуты, для которых pick(час) = true, и убирает их из памяти; уже записанный час дополняется */
function writeHours(sql, buf, pick) {
  const groups = new Map();
  for (const [k, o] of buf) {
    const h = Math.floor(o.t / HOUR) * HOUR;
    if (!pick(h)) continue;
    const g = `${o.coin}|${h}`;
    groups.has(g) || groups.set(g, { coin: o.coin, h, list: [] });
    groups.get(g).list.push(o);
    buf.delete(k);
  }
  for (const { coin, h, list } of groups.values()) {
    const old = sql.exec("SELECT d FROM h WHERE coin = ? AND h = ?", coin, h).toArray()[0];
    const d = old ? JSON.parse(old.d) : {};
    for (const o of list) {
      const m = (o.t - h) / MIN, x = d[m] || [0, 0, 0];
      d[m] = [Math.round(x[0] + o.b), Math.round(x[1] + o.s), x[2] + o.n];
    }
    sql.exec("INSERT INTO h (coin, h, d) VALUES (?, ?, ?) ON CONFLICT (coin, h) DO UPDATE SET d = excluded.d", coin, h, JSON.stringify(d));
  }
  return groups.size;
}
/* закрытые часы (раньше текущего) — в базу */
export function flushHours(sql, buf, nowSec) {
  const cur = Math.floor(nowSec / HOUR) * HOUR;
  return writeHours(sql, buf, (h) => h < cur);
}
export function checkpoint(sql, buf, atMs) {
  const d = [...buf.values()].map((o) => [o.coin, o.t, Math.round(o.b), Math.round(o.s), o.n]);
  sql.exec("INSERT INTO ck (id, at, d) VALUES (1, ?, ?) ON CONFLICT (id) DO UPDATE SET at = excluded.at, d = excluded.d", atMs, JSON.stringify(d));
}
/* после перезапуска: вернуть в память то, что было; вернёт время страховки (сделки раньше — уже учтены) */
export function restore(sql, buf) {
  const r = sql.exec("SELECT at, d FROM ck WHERE id = 1").toArray()[0];
  if (!r) return 0;
  for (const [coin, t, b, s, n] of JSON.parse(r.d)) {
    const k = `${coin}|${t}`, o = buf.get(k) || { coin, t, b: 0, s: 0, n: 0 };
    o.b += b; o.s += s; o.n += n;
    buf.set(k, o);
  }
  return r.at;
}
export function prune(sql, beforeSec) {
  sql.exec("DELETE FROM h WHERE h < ?", Math.floor(beforeSec / HOUR) * HOUR);
}
/* корзины под свечу интервала i секунд (60, 300, 900, 3600, 14400, 86400): начало свечи = как у Hyperliquid (UTC) */
export function query(sql, buf, coin, i, from, to) {
  i = Math.max(60, Math.floor(i / 60) * 60);
  const acc = new Map(), add = (t, b, s, n) => {
    if (t < from || t >= to) return;
    const k = Math.floor(t / i) * i, x = acc.get(k) || [k, 0, 0, 0];
    x[1] += b; x[2] += s; x[3] += n;
    acc.set(k, x);
  };
  const rows = sql.exec("SELECT h, d FROM h WHERE coin = ? AND h >= ? AND h < ? ORDER BY h LIMIT 2000", coin, Math.floor(from / HOUR) * HOUR, to).toArray();
  for (const r of rows) for (const [m, v] of Object.entries(JSON.parse(r.d))) add(r.h + m * MIN, v[0], v[1], v[2]);
  for (const o of buf.values()) o.coin === coin && add(o.t, o.b, o.s, o.n);
  return [...acc.values()].sort((a, b) => a[0] - b[0]).slice(-5000).map((x) => [x[0], Math.round(x[1]), Math.round(x[2]), x[3]]);
}
export function stats(sql) {
  const [{ c, oldest }] = sql.exec("SELECT COUNT(*) AS c, MIN(h) AS oldest FROM h").toArray();
  return { hourRows: c, since: oldest };
}
