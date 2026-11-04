// Скальпинг: лента и пузыри заполнены сразу при открытии (сделки копятся заранее).
import { chromium, URL0, makeResults } from "./harness.mjs";
const R = makeResults(); const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1600, height: 900 } }); const errs = []; p.on("pageerror", (e) => errs.push(String(e)));
await p.route("**/config.js", (r) => r.fulfill({ contentType: "text/javascript", body: `window.TERM_CONFIG={isTestnet:false,builder:"0xa02a1872ebbf3a5d2f0d8b236ef16f0fe62b16d0",feeTenthBps:25,debug:true};` }));
await p.goto(URL0 + "/trade"); await p.waitForTimeout(6000);
/* пока скальпинг закрыт — приходят сделки */
await p.evaluate(() => { const T = window.__totum, S = T.S, now = Date.now(), m = Number(S.ctx.BTC.midPx); const l = []; for (let k = 0; k < 60; k++) l.push({ coin: "BTC", px: String(Math.round(m + ((k % 9) - 4))), sz: String(0.002 + (k % 7) * 0.01), side: k % 3 ? "B" : "A", time: now - (60 - k) * 800, tid: 9e9 + k }); T.onTrades(l); T.onTrades(l.slice(0, 10)); });
const t0 = Date.now(); await p.click('[data-cp="scalp"]'); await p.waitForTimeout(700);
const st = await p.evaluate(() => ({ tape: document.querySelectorAll("#scTape > *").length, txt: document.getElementById("scTape").textContent.slice(0, 40) }));
await p.waitForTimeout(500);
const painted = await p.evaluate(() => { const c = document.getElementById("scTicks"), d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) d[i] > 100 && n++; return n; });
R.ok("лента сделок заполнена сразу при открытии", st.tape >= 30 && !/Ждём/.test(st.txt), JSON.stringify(st));
R.ok("пузыри нарисованы сразу", painted > 2000, String(painted));
R.ok("повторы не задвоились", (await p.evaluate(() => window.__totum.S && document.querySelectorAll("#scTape > *").length)) <= 150);
R.ok("без ошибок", errs.length === 0, errs.join(" | ").slice(0, 300));
await p.screenshot({ path: "tests/out-scalp-seed.png", clip: { x: 0, y: 80, width: 900, height: 700 } });
await b.close(); R.print();
