// Инструменты: связки Totum ↔ биржа, графики связки, предупреждение ADL.
import { chromium, setupPage, makeResults, URL0 } from "./harness.mjs";
const R = makeResults(); const browser = await chromium.launch(); const now = Date.now();
const venues = [["hyperliquid", "Totum", "dex"], ["binance", "Binance", "cex"], ["bybit", "Bybit", "cex"], ["kucoin", "KuCoin", "cex"], ["weex", "WEEX", "cex", false], ["kraken", "Kraken", "cex"], ["okx", "OKX", "cex"], ["aster", "Aster", "dex"]].map(([id, name, type, ok = true]) => ({ id, name, type, ok, n: ok ? 3 : 0, err: ok ? undefined : "503" }));
const row = (v, base, rate, ih, mark, idx, vol = 5e7, mult = 1, sym = base) => ({ v, sym, base, rate, ih, next: now + 36e5, mark, idx, vol, oi: null, mult });
const data = { t: now, venues, rows: [
  row("hyperliquid", "BTC", 0.0000125, 1, 80000, 80010), row("binance", "BTC", 0.0001, 8, 80040, 80020, 5e7, 1, "BTCUSDT"), row("bybit", "BTC", 0.00005, 8, 80010, 80015, 5e7, 1, "BTCUSDT"), row("kucoin", "BTC", 0.0002, 8, 80100, 80050, 5e7, 1, "XBTUSDTM"),
  row("hyperliquid", "BLUR", -0.0025, 1, 0.0078, 0.0079), row("binance", "BLUR", -0.0096, 4, 0.00779, 0.0079, 6e7, 1, "BLURUSDT"), row("bybit", "BLUR", -0.004, 1, 0.0080, 0.0079, 2e7, 1, "BLURUSDT"),
  row("binance", "NOTONTOTUM", 0.01, 8, 1, 1),
  row("hyperliquid", "NEIRO", 0.0000125, 1, 0.06761, 0.06775, 9e4, 1000, "kNEIRO"), row("kraken", "NEIRO", 0.00143, 1, 0.00006819, 0.00006766, 7e3, 1, "PF_NEIROUSD"),
  row("okx", "NEIRO", -0.0000815, 4, 0.00006758, 0.00006769, 6e5, 1, "NEIRO-USDT-SWAP"), row("aster", "NEIRO", 0.0000366, 4, 0.00006762, 0.00006772, 1.1e4, 1, "NEIROUSDT"),
] };
const t5 = Math.floor(now / 3e5) * 3e5, wave = (k) => Math.sin(k / 9) * 3e-5;
const hist = { t: now, i: "5m", hl: { c: Array.from({ length: 300 }, (_, k) => { const v = 0.0078 + wave(k); return [t5 - (300 - k) * 3e5, v, v * 1.002, v * 0.998, v * 1.0005]; }), f: Array.from({ length: 24 }, (_, k) => [now - (24 - k) * 36e5, -0.0025 + k * 1e-5]) },
  x: { c: Array.from({ length: 300 }, (_, k) => { const v = 0.00800 - wave(k) * 0.5; return [t5 - (300 - k) * 3e5, v, v * 1.003, v * 0.997, v * 0.9995]; }).filter((_, k) => k % 7), f: Array.from({ length: 24 }, (_, k) => [now - (24 - k) * 36e5, -0.004 + k * 1e-4]), err: [] } };
const book = { t: now, hl: { b: [[0.00779, 50000], [0.00778, 90000]], a: [[0.00781, 40000], [0.00782, 80000]] }, x: { b: [[0.00800, 60000], [0.00799, 70000]], a: [[0.00802, 30000], [0.00803, 200000]] }, err: [] };
const _x = 0;
const { page, errors } = await setupPage(browser, { width: 1440, height: 1000 }, { exchange: [] }, { theme: "dark" });
await page.addInitScript(() => { localStorage.setItem("totum.theme", "dark"); localStorage.removeItem("totum.tools"); });
await page.route("**/api/funding", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify(data) }));
const reqs = []; await page.route("**/api/bundle**", (r) => { const u = r.request().url(); reqs.push(u); r.fulfill({ contentType: "application/json", body: JSON.stringify(/k=book/.test(u) ? book : hist) }); });
const sent = { hl: [], by: [] }; let hlWs, byWs;
await page.routeWebSocket("wss://api.hyperliquid.xyz/ws", (ws) => { hlWs = ws; ws.onMessage((m) => sent.hl.push(m)); });
await page.routeWebSocket("wss://stream.bybit.com/v5/public/linear", (ws) => { byWs = ws; ws.onMessage((m) => sent.by.push(m)); });
await page.goto(URL0 + "/#trade"); await page.waitForTimeout(4500);
await page.click('[data-cp="tools"]'); await page.waitForTimeout(1500);
const rows = await page.locator(".tl-table.bundles tbody tr").allTextContents();
R.ok("только связки с Totum (монеты без Totum не показываются)", rows.length === 8 && !rows.join().includes("NOTONTOTUM"), String(rows.length));
R.ok("Hyperliquid подписан как Totum", rows.every((r) => r.includes("Totum")) && !(await page.textContent("#paneTools")).includes("Hyperliquid"));
R.ok("сортировка по спреду фандинга: первой BLUR Bybit (−0,40% против −0,25% за 1 ч)", /BLUR[\s\S]*Bybit/.test(rows[0]), rows[0].slice(0, 120));
R.ok("в строке есть цены обеих бирж и индексы", /инд\./.test(rows[0]));
R.ok("биржа без данных (WEEX) зачёркнута", await page.isVisible('[data-tlv="weex"].bad'));
await page.screenshot({ path: "tests/out-tools-funding.png" });
// живые потоки: Totum (Hyperliquid) и Bybit по WebSocket
await page.click(".tl-table.bundles tbody tr:first-child [data-tlopen]"); await page.waitForTimeout(2500);
R.ok("подписка на стакан Totum по WebSocket", sent.hl.some((m) => /l2Book.*BLUR/.test(m)), sent.hl.join());
R.ok("подписка на стакан Bybit orderbook.50", sent.by.some((m) => /orderbook\.50\.BLURUSDT/.test(m)), sent.by.join());
hlWs.send(JSON.stringify({ channel: "l2Book", data: { coin: "BLUR", levels: [[{ px: "0.00700", sz: "100000" }], [{ px: "0.00702", sz: "100000" }]] } }));
byWs.send(JSON.stringify({ topic: "orderbook.50.BLURUSDT", type: "snapshot", data: { b: [["0.00710", "100000"], ["0.00709", "5"]], a: [["0.00712", "100000"]] } }));
await page.waitForTimeout(600);
let top = await page.textContent("#bxTop");
// лонг Bybit (ask 0.00712), шорт Totum (bid 0.00700): вход = 0.00700/0.00712−1 = −1.685%; выход = 0.00710/0.00702−1 = +1.140%
R.ok("вход/выход посчитаны по живым потокам", /−1\.685%[\s\S]*\+1\.140%/.test(top), top.slice(-200));
byWs.send(JSON.stringify({ topic: "orderbook.50.BLURUSDT", type: "delta", data: { b: [["0.00710", "0"], ["0.00715", "50000"]], a: [] } }));
await page.waitForTimeout(600);
top = await page.textContent("#bxTop");
// новая лучшая покупка Bybit 0.00715: выход = 0.00715/0.00702−1 = +1.852%
R.ok("изменения (delta) применяются сразу", /\+1\.852%/.test(top), top.slice(-200));
const t0 = Date.now(); let n = 0;
for (let k = 0; k < 10; k++) { hlWs.send(JSON.stringify({ channel: "l2Book", data: { coin: "BLUR", levels: [[{ px: String(0.0070 + k * 1e-5), sz: "100000" }], [{ px: "0.00702", sz: "100000" }]] } })); await page.waitForTimeout(100); }
await page.waitForTimeout(400);
R.ok("стакан в окне показывает последнюю цену потока", (await page.textContent("#bxBooks")).includes("0,00709"));
R.ok("без ошибок", errors.length === 0, errors.join(" | ").slice(0, 300));
await browser.close(); R.print();
