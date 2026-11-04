// Проверка ядра сборщика на настоящей SQLite (node:sqlite) — без Cloudflare.
import { DatabaseSync } from "node:sqlite";
import { addTrades, flush, query, SCHEMA } from "./src/core.js";
const db = new DatabaseSync(":memory:");
const sql = { exec: (q, ...a) => { const st = db.prepare(q); if (/^\s*SELECT/i.test(q)) { const rows = st.all(...a); return { toArray: () => rows }; } st.run(...a); return { toArray: () => [] }; } };
sql.exec(SCHEMA);
const buf = new Map(), seen = new Set(), T = Date.UTC(2026, 10, 4, 12, 0, 0);
const tr = [];
for (let k = 0; k < 900; k++) tr.push({ coin: "BTC", px: "80000", sz: "0.01", side: k % 3 ? "B" : "A", time: T + k * 1000, tid: k });
addTrades(buf, seen, tr); addTrades(buf, seen, tr.slice(0, 100)); /* повторы из снимка — не считаются */
flush(sql, buf);
addTrades(buf, seen, [{ coin: "BTC", px: "80000", sz: "0.01", side: "B", time: T + 5, tid: 99999 }]); flush(sql, buf);
const q15 = query(sql, "BTC", 900, T / 1e3, T / 1e3 + 3600), q1 = query(sql, "BTC", 60, T / 1e3, T / 1e3 + 120);
const ok = (n, c, x = "") => console.log(`${c ? "PASS" : "FAIL"} ${n} ${x}`);
ok("15-минутная свеча: все 900 сделок + 1 дозапись", q15.length === 1 && q15[0][3] === 901 && q15[0][0] === T / 1e3, JSON.stringify(q15));
ok("покупки 2/3, продажи 1/3", q15[0][1] === 480800 && q15[0][2] === 240000, JSON.stringify(q15[0]));
ok("минутные корзины", q1.length === 2 && q1[0][3] === 61, JSON.stringify(q1));
