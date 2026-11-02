// Окно сделок (кружки) в скальпинге: сделки по WebSocket ложатся кружками на свою цену.
import { chromium, setupPage, makeResults, URL0 } from "./harness.mjs";
const R = makeResults(); const browser = await chromium.launch();
const { page, errors } = await setupPage(browser, { width: 1600, height: 900 }, { exchange: [] }, { theme: "dark" });
await page.goto(URL0 + "/#trade"); await page.waitForTimeout(6000);
await page.click('[data-cp="scalp"]'); await page.waitForTimeout(4000);
R.ok("окно сделок есть рядом со стаканом", await page.isVisible("#scTicks"));
// подкидываем сделки по ценам на лестнице
await page.evaluate(() => {
  const rows = [...document.querySelectorAll("#scLadder .sc-row")].map((r) => Number(r.dataset.px));
  const mid = rows[Math.floor(rows.length / 2)], now = Date.now(), list = [];
  for (let k = 0; k < 40; k++) list.push({ coin: "BTC", px: String(mid + ((k % 7) - 3) * (rows[0] - rows[1])), sz: String(0.001 * (1 + (k % 5) * 3)), side: k % 3 ? "B" : "A", time: now - (40 - k) * 1200, tid: k });
  window.__ticksTest = list;
});
await page.evaluate(() => window.__totum.onTrades ? window.__totum.onTrades(window.__ticksTest) : null);
await page.waitForTimeout(800);
const painted = await page.evaluate(() => { const c = document.getElementById("scTicks"), g = c.getContext("2d"), d = g.getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) d[i] > 100 && n++; return n; });
R.ok("кружки нарисованы", painted > 2000, String(painted));
await page.locator(".sc-dom").screenshot({ path: "tests/out-ticks.png" });
R.ok("без ошибок", errors.length === 0, errors.join(" | ").slice(0, 300));
await browser.close(); R.print();
