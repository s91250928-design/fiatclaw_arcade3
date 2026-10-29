// Инструменты: связки Totum ↔ биржа, графики связки, предупреждение ADL.
import { chromium, setupPage, makeResults, URL0 } from "./harness.mjs";
const R = makeResults(); const browser = await chromium.launch(); const now = Date.now();
const venues = [["hyperliquid", "Totum", "dex"], ["binance", "Binance", "cex"], ["bybit", "Bybit", "cex"], ["kucoin", "KuCoin", "cex"], ["weex", "WEEX", "cex", false]].map(([id, name, type, ok = true]) => ({ id, name, type, ok, n: ok ? 3 : 0, err: ok ? undefined : "503" }));
const row = (v, base, rate, ih, mark, idx, vol = 5e7, mult = 1, sym = base) => ({ v, sym, base, rate, ih, next: now + 36e5, mark, idx, vol, oi: null, mult });
const data = { t: now, venues, rows: [
  row("hyperliquid", "BTC", 0.0000125, 1, 80000, 80010), row("binance", "BTC", 0.0001, 8, 80040, 80020, 5e7, 1, "BTCUSDT"), row("bybit", "BTC", 0.00005, 8, 80010, 80015, 5e7, 1, "BTCUSDT"), row("kucoin", "BTC", 0.0002, 8, 80100, 80050, 5e7, 1, "XBTUSDTM"),
  row("hyperliquid", "BLUR", -0.0025, 1, 0.0078, 0.0079), row("binance", "BLUR", -0.0096, 4, 0.00779, 0.0079, 6e7, 1, "BLURUSDT"), row("bybit", "BLUR", -0.004, 1, 0.0080, 0.0079, 2e7, 1, "BLURUSDT"),
  row("binance", "NOTONTOTUM", 0.01, 8, 1, 1),
] };
const hist = { t: now, hl: { f: Array.from({ length: 48 }, (_, k) => [now - (48 - k) * 36e5, -0.002 + k * 1e-5]), p: Array.from({ length: 48 }, (_, k) => [Math.floor((now - (48 - k) * 36e5) / 36e5) * 36e5, 0.0078 + k * 1e-6]) },
  x: { f: Array.from({ length: 12 }, (_, k) => [now - (48 - k * 4) * 36e5, -0.009 + k * 1e-4]), p: Array.from({ length: 48 }, (_, k) => [Math.floor((now - (48 - k) * 36e5) / 36e5) * 36e5, 0.00785 + k * 1e-6]), err: [] } };
const { page, errors } = await setupPage(browser, { width: 1440, height: 1000 }, { exchange: [] }, { theme: "dark" });
await page.addInitScript(() => { localStorage.setItem("totum.theme", "dark"); localStorage.removeItem("totum.tools"); });
await page.route("**/api/funding", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify(data) }));
let pairReq = ""; await page.route("**/api/pair**", (r) => { pairReq = r.request().url(); r.fulfill({ contentType: "application/json", body: JSON.stringify(hist) }); });
await page.goto(URL0 + "/#trade"); await page.waitForTimeout(4500);
await page.click('[data-cp="tools"]'); await page.waitForTimeout(1500);
const rows = await page.locator(".tl-table.bundles tbody tr").allTextContents();
R.ok("только связки с Totum (монеты без Totum не показываются)", rows.length === 5 && !rows.join().includes("NOTONTOTUM"), String(rows.length));
R.ok("Hyperliquid подписан как Totum", rows.every((r) => r.includes("Totum")) && !(await page.textContent("#paneTools")).includes("Hyperliquid"));
R.ok("сортировка по спреду фандинга: первой BLUR Bybit (−0,40% против −0,25% за 1 ч)", /BLUR[\s\S]*Bybit/.test(rows[0]), rows[0].slice(0, 120));
R.ok("в строке есть цены обеих бирж и индексы", /инд\./.test(rows[0]));
R.ok("биржа без данных (WEEX) зачёркнута", await page.isVisible('[data-tlv="weex"].bad'));
await page.screenshot({ path: "tests/out-tools-funding.png" });
await page.click(".tl-table.bundles tbody tr:first-child [data-tlopen]"); await page.waitForTimeout(2000);
R.ok("по кнопке графика — запрос истории связки", /v=bybit&sym=BLURUSDT&coin=BLUR/.test(pairReq), pairReq);
R.ok("два графика: спред и ставки", (await page.locator("#tlChS canvas").count()) > 0 && (await page.locator("#tlChF canvas").count()) > 0);
await page.screenshot({ path: "tests/out-tools-charts.png" });
await page.click('[data-tl="arb"]'); await page.waitForTimeout(500);
const a0 = await page.locator(".tl-table.bundles tbody tr").first().textContent();
R.ok("арбитраж: сортировка по спреду цены (BLUR Bybit +2,56%)", /BLUR[\s\S]*Bybit[\s\S]*\+2\.56%/.test(a0), a0.slice(0, 160));
await page.screenshot({ path: "tests/out-tools-arb.png" });
R.ok("без ошибок", errors.length === 0, errors.join(" | ").slice(0, 300));
await browser.close(); R.print();
