// График: история догружается при прокрутке влево; последняя свеча идёт за лентой сделок.
import { chromium, setupPage, makeResults, URL0 } from "./harness.mjs";
const R = makeResults(); const browser = await chromium.launch();
const { page, errors } = await setupPage(browser, { width: 1440, height: 900 }, { exchange: [] });
await page.goto(URL0 + "/#trade"); await page.waitForTimeout(7000);
const n0 = await page.evaluate(() => window.__totum.S.bars.length);
const t0 = await page.evaluate(() => window.__totum.S.bars[0].time);
const before = await page.evaluate(() => { const ts = window.__totum.chart().timeScale(); ts.scrollToPosition(-(window.__totum.S.bars.length - 20), false); return new Promise((ok) => requestAnimationFrame(() => ok(ts.getVisibleRange()))); });
await page.waitForTimeout(4000);
const after = await page.evaluate(() => ({ n: window.__totum.S.bars.length, t: window.__totum.S.bars[0].time, vr: window.__totum.chart().timeScale().getVisibleRange() }));
console.log({ n0, n1: after.n, t0, t1: after.t, before, vr: after.vr });
R.ok("при прокрутке влево догрузились старые свечи", after.n > n0 && after.t < t0, `${n0} → ${after.n}`);
R.ok("вид не прыгнул", after.vr.to === before.to, JSON.stringify({ b: before.to, a: after.vr.to }));
// сделка двигает последнюю свечу сразу
const r = await page.evaluate(() => { const S = window.__totum.S, last = S.bars.at(-1), px = last.close * 1.003; window.__totum.onTrades([{ coin: S.coin, px: String(px), sz: "0.01", side: "B", time: Date.now(), tid: 1 }]); const b = S.bars.at(-1); return { px, close: b.close, high: b.high }; });
R.ok("цена сделки сразу в свече", Math.abs(r.close - r.px) < 1e-9 && r.high >= r.px, JSON.stringify(r));
R.ok("без ошибок", errors.length === 0, errors.join(" | ").slice(0, 300));
await browser.close(); R.print();
