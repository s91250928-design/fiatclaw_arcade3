// Проверка ядра сборщика на настоящей SQLite (node:sqlite) — без Cloudflare.
import { DatabaseSync } from "node:sqlite";
import { addTrades, flushHours, checkpoint, restore, prune, query, setup, stats } from "./src/core.js";
const mk = () => {
  const db = new DatabaseSync(":memory:");
  let writes = 0;
  const sql = { exec: (q, ...a) => { const st = db.prepare(q); if (/^\s*SELECT/i.test(q)) { const rows = st.all(...a); return { toArray: () => rows }; } writes += Number(st.run(...a).changes || 0); return { toArray: () => [] }; } };
  return { db, sql, writes: () => writes };
};
const ok = (n, c, x = "") => { console.log(`${c ? "PASS" : "FAIL"} ${n} ${x}`); c || (process.exitCode = 1); };
const T = Date.UTC(2026, 10, 4, 12, 0, 0);

/* 1. подсчёт: текущий час в памяти, закрытый — в базе, ответ одинаковый */
{
  const { sql } = mk(); setup(sql);
  const buf = new Map(), seen = new Set(), tr = [];
  for (let k = 0; k < 900; k++) tr.push({ coin: "BTC", px: "80000", sz: "0.01", side: k % 3 ? "B" : "A", time: T + k * 1000, tid: k });
  addTrades(buf, seen, tr); addTrades(buf, seen, tr.slice(0, 100)); /* повторы из снимка — не считаются */
  addTrades(buf, seen, [{ coin: "BTC", px: "80000", sz: "0.01", side: "B", time: T + 5, tid: 99999 }]);
  const mem15 = query(sql, buf, "BTC", 900, T / 1e3, T / 1e3 + 3600);
  ok("15-мин свеча из памяти: 901 сделка", mem15.length === 1 && mem15[0][3] === 901 && mem15[0][0] === T / 1e3, JSON.stringify(mem15));
  ok("покупки 2/3, продажи 1/3", mem15[0][1] === 480800 && mem15[0][2] === 240000, JSON.stringify(mem15[0]));
  ok("пока час не закрыт — в базу ничего", flushHours(sql, buf, T / 1e3 + 1800) === 0 && stats(sql).hourRows === 0);
  ok("час закрыт — одна строка в базе", flushHours(sql, buf, T / 1e3 + 3601) === 1 && buf.size === 0 && stats(sql).hourRows === 1);
  const db15 = query(sql, buf, "BTC", 900, T / 1e3, T / 1e3 + 3600), q1 = query(sql, buf, "BTC", 60, T / 1e3, T / 1e3 + 120);
  ok("из базы — то же самое", JSON.stringify(db15) === JSON.stringify(mem15), JSON.stringify(db15));
  ok("минутные корзины", q1.length === 2 && q1[0][3] === 61, JSON.stringify(q1));
  /* опоздавшая сделка в уже записанный час — дописывается, не затирает */
  addTrades(buf, seen, [{ coin: "BTC", px: "100", sz: "1", side: "A", time: T + 10, tid: "late" }]);
  flushHours(sql, buf, T / 1e3 + 3700);
  const late = query(sql, buf, "BTC", 3600, T / 1e3, T / 1e3 + 3600);
  ok("опоздавшая сделка дописана", late[0][3] === 902 && late[0][2] === 240100, JSON.stringify(late));
  /* память + база в одном ответе (свеча 4ч охватывает оба) */
  addTrades(buf, seen, [{ coin: "BTC", px: "1000", sz: "1", side: "B", time: T + 3600e3 + 5e3, tid: "next" }]);
  const h4 = query(sql, buf, "BTC", 14400, T / 1e3 - 3600 * 4, T / 1e3 + 14400);
  ok("свеча 4ч = база + память", h4.length === 1 && h4[0][3] === 903, JSON.stringify(h4));
  prune(sql, T / 1e3 + 3600);
  ok("старые часы удаляются", stats(sql).hourRows === 0);
}

/* 2. перезапуск: страховка возвращает память, повторы из снимка не считаются */
{
  const { sql } = mk(); setup(sql);
  const a = new Map(), tr = [];
  for (let k = 0; k < 30; k++) tr.push({ coin: "ETH", px: "3000", sz: "1", side: "B", time: T + k * 1000, tid: k });
  addTrades(a, new Set(), tr);
  checkpoint(sql, a, T + 30e3);
  const b = new Map(), at = restore(sql, b);
  addTrades(b, new Set(), tr.slice(-10), at); /* после переподключения биржа снова шлёт последние сделки */
  addTrades(b, new Set(), [{ coin: "ETH", px: "3000", sz: "1", side: "A", time: T + 31e3, tid: 31 }], at);
  const q = query(sql, b, "ETH", 60, T / 1e3, T / 1e3 + 60);
  ok("после перезапуска: 30 старых + 1 новая", q[0][3] === 31 && q[0][1] === 90000 && q[0][2] === 3000, JSON.stringify(q));
}

/* 3. переезд со старой таблицы m */
{
  const { db, sql } = mk();
  db.exec("CREATE TABLE m (coin TEXT NOT NULL, t INTEGER NOT NULL, b REAL NOT NULL, s REAL NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (coin, t)) WITHOUT ROWID");
  for (let k = 0; k < 90; k++) db.prepare("INSERT INTO m VALUES (?,?,?,?,?)").run(k % 2 ? "BTC" : "SOL", T / 1e3 + k * 60, 10, 5, 1);
  setup(sql);
  const gone = db.prepare("SELECT name FROM sqlite_master WHERE name='m'").all().length === 0;
  const q = query(sql, new Map(), "BTC", 3600, T / 1e3, T / 1e3 + 7200);
  ok("старые минуты перенесены, таблица m удалена", gone && stats(sql).hourRows === 4 && q.length === 2 && q[0][3] + q[1][3] === 45, JSON.stringify(q));
}

/* 4. сутки работы: сколько записей в базу (лимит бесплатного Cloudflare — 100 000) */
{
  const { sql, writes } = mk(); setup(sql);
  const buf = new Map(), seen = new Set(), coins = Array.from({ length: 62 }, (_, k) => `C${k}`);
  let tid = 0, ckAt = 0;
  const day0 = T / 1e3;
  for (let s = 0; s < 86400; s += 15) { /* тик каждые 15 с, в каждой монете по сделке */
    addTrades(buf, seen, coins.map((c) => ({ coin: c, px: "1", sz: "10", side: "B", time: (day0 + s) * 1e3, tid: tid++ })));
    const closed = flushHours(sql, buf, day0 + s + 15);
    if (closed || s - ckAt >= 60) { checkpoint(sql, buf, (day0 + s) * 1e3); ckAt = s; }
    s % 3600 === 0 && prune(sql, day0 + s - 30 * 86400);
  }
  ok("записей за сутки < 5 000", writes() < 5000, `= ${writes()}`);
}
