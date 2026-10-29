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
const { page, errors } = await setupPage(browser, { width: 1440, height: 1000 }, { exchange: [] }, { theme: "dark" });
await page.addInitScript(() => { localStorage.setItem("totum.theme", "dark"); localStorage.removeItem("totum.tools"); });
await page.route("**/api/funding", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify(data) }));
const reqs = []; await page.route("**/api/bundle**", (r) => { const u = r.request().url(); reqs.push(u); r.fulfill({ contentType: "application/json", body: JSON.stringify(/k=book/.test(u) ? book : hist) }); });
await page.goto(URL0 + "/#trade"); await page.waitForTimeout(4500);
await page.click('[data-cp="tools"]'); await page.waitForTimeout(1500);
const rows = await page.locator(".tl-table.bundles tbody tr").allTextContents();
R.ok("только связки с Totum (монеты без Totum не показываются)", rows.length === 8 && !rows.join().includes("NOTONTOTUM"), String(rows.length));
R.ok("Hyperliquid подписан как Totum", rows.every((r) => r.includes("Totum")) && !(await page.textContent("#paneTools")).includes("Hyperliquid"));
R.ok("сортировка по спреду фандинга: первой BLUR Bybit (−0,40% против −0,25% за 1 ч)", /BLUR[\s\S]*Bybit/.test(rows[0]), rows[0].slice(0, 120));
R.ok("в строке есть цены обеих бирж и индексы", /инд\./.test(rows[0]));
R.ok("биржа без данных (WEEX) зачёркнута", await page.isVisible('[data-tlv="weex"].bad'));
await page.screenshot({ path: "tests/out-tools-funding.png" });
// окно связки на весь экран
await page.click(".tl-table.bundles tbody tr:first-child [data-tlopen]"); await page.waitForTimeout(2500);
const bb = await page.locator("#bx").boundingBox();
R.ok("окно связки открылось на весь экран", bb && bb.width === 1440 && bb.height === 1000);
R.ok("запрос истории: 15м строим из 5-минутных свечей", reqs.some((u) => /k=hist&v=bybit&sym=BLURUSDT&coin=BLUR&i=5m/.test(u)), reqs.join(" "));
R.ok("запрос стаканов обеих бирж", reqs.some((u) => /k=book&v=bybit/.test(u)));
const top = await page.textContent("#bxTop");
R.ok("направление по идее: лонг Bybit, шорт Totum", (await page.textContent("#bxTop .bx-dir .on")).includes("Лонг Bybit"));
R.ok("суммарный фандинг связки: +1.2000% за 8 ч", /Фандинг связки\+1\.2000% за 8 ч/.test(top), top.slice(0, 400));
R.ok("фандинг каждой биржи с отсчётом до выплаты", (top.match(/выплата через/g) || []).length === 2);
R.ok("вход −2.868% и выход +2.433% по стаканам", /−2\.868%[\s\S]*\+2\.433%/.test(top), top.slice(-260));
R.ok("свечи спреда и панель фандинга на графике", (await page.locator("#bxCh canvas").count()) > 2);
const calc = await page.textContent("#bxCalc");
R.ok("расчёт на объём: комиссия 4 сделок −0.250%", /−0\.250%/.test(calc), calc.slice(0, 300));
R.ok("стаканы обеих бирж с ролями", (await page.locator(".bx-book").count()) === 2 && /лонг/.test(await page.textContent("#bxBooks")));
const box = await page.locator("#bxCh").boundingBox();
await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.3); await page.waitForTimeout(300);
R.ok("подсказка под курсором: спред и фандинг обеих бирж", /Фандинг Totum[\s\S]*Фандинг Bybit/.test(await page.textContent("#bxTip")) && await page.isVisible("#bxTip"));
await page.screenshot({ path: "tests/out-bx-candles.png" });
await page.click('[data-bxtf="1h"]'); await page.waitForTimeout(1200);
R.ok("таймфрейм 1ч → 15-минутные свечи", reqs.some((u) => /k=hist.*i=15m/.test(u)));
await page.click('[data-bxm="ee"]'); await page.waitForTimeout(7000);
R.ok("Вход/Выход: свечи входа и выхода", (await page.evaluate(() => document.querySelector("#bxLeg").textContent)).includes("выход") && await page.isHidden("#bxMsg"));
await page.screenshot({ path: "tests/out-bx-ee.png" });
await page.click('[data-bxm="funding"]'); await page.waitForTimeout(800);
R.ok("Фандинг: накопленный фандинг связки", (await page.textContent("#bxLeg")).includes("накопленный"));
await page.screenshot({ path: "tests/out-bx-funding.png" });
await page.click('[data-bxdir="1"]'); await page.waitForTimeout(400);
R.ok("смена направления: фандинг связки −1.2000%", /−1\.2000% за 8 ч/.test(await page.textContent("#bxTop")));
await page.click('[data-bxm="candles"]'); await page.keyboard.press("Escape"); await page.waitForTimeout(300);
R.ok("Esc закрывает окно", await page.isHidden("#bx"));
await page.click('[data-tl="arb"]'); await page.waitForTimeout(500);
const a0 = await page.locator(".tl-table.bundles tbody tr").first().textContent();
R.ok("арбитраж: сортировка по спреду цены (BLUR Bybit +2,56%)", /BLUR[\s\S]*Bybit[\s\S]*\+2\.56%/.test(a0), a0.slice(0, 160));
await page.screenshot({ path: "tests/out-tools-arb.png" });
// сортировка по столбцам: спред фандинга по убыванию, затем по возрастанию
await page.click('[data-tl="funding"]'); await page.waitForTimeout(300);
const fsOf = async () => (await page.locator(".tl-table.bundles tbody tr td:nth-child(6)").allTextContents()).map((t) => Number(t.replace(/[^\d.+−-]/g, "").replace("−", "-")));
await page.click('[data-tlsk="fs"]'); await page.waitForTimeout(300);
const d1 = await fsOf();
await page.click('[data-tlsk="fs"]'); await page.waitForTimeout(300);
const d2 = await fsOf();
R.ok("спред фандинга: по убыванию, потом по возрастанию", d1.join() === [...d1].sort((a, b) => b - a).join() && d2.join() === [...d2].sort((a, b) => a - b).join(), `${d1} | ${d2}`);
await page.click('[data-tlsk="coin"]'); await page.waitForTimeout(300);
const coins = (await page.locator(".tl-table.bundles tbody .tl-coin").allTextContents());
R.ok("по монете — по алфавиту", coins.join() === [...coins].sort().join(), coins.join());
await page.click('[data-tlsk="xr"]'); await page.waitForTimeout(300);
R.ok("стрелка показывает направление", (await page.textContent('[data-tlsk="xr"]')).includes("↓"));
await page.screenshot({ path: "tests/out-tools-sort.png" });
// мелкие биржи и малый объём тоже видны: у NEIRO (на Totum это kNEIRO) три связки
await page.click('[data-tlsk=""]').catch(() => {}); await page.fill("#tlQ", "NEIRO"); await page.waitForTimeout(400);
const nr = await page.locator(".tl-table.bundles tbody tr").allTextContents();
R.ok("NEIRO: связки с Kraken, OKX и Aster (объём ниже $1M не прячется)", nr.length === 3 && /Kraken/.test(nr.join()) && /Aster/.test(nr.join()), nr.map((r) => r.slice(0, 40)).join(" | "));
R.ok("пагинация: «Показано 1–3 из 3»", /Показано 1–3 из 3/.test(await page.textContent(".tl-pager")));
// телефон: стаканы по кнопке
const m = await browser.newPage({ viewport: { width: 390, height: 844 } });
const merr = []; m.on("pageerror", (e) => merr.push(String(e)));
await m.addInitScript(() => localStorage.setItem("totum.theme", "dark"));
await m.route("**/api/funding", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify(data) }));
await m.route("**/api/bundle**", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify(/k=book/.test(r.request().url()) ? book : hist) }));
await m.goto(URL0 + "/#trade"); await m.waitForTimeout(4000);
await m.evaluate(() => document.querySelector('[data-cp="tools"]')?.click()); await m.waitForTimeout(1500);
await m.evaluate(() => document.querySelector("[data-tlopen]")?.click()); await m.waitForTimeout(2500);
const inView = async () => { const b = await m.locator("#bxBooks").boundingBox(); return b && b.y < 844; };
R.ok("телефон: стаканы спрятаны, есть кнопка «Стакан»", (await m.isVisible("#bxBookBtn")) && !(await inView()));
await m.screenshot({ path: "tests/out-bx-mobile.png" });
await m.click("#bxBookBtn"); await m.waitForTimeout(500);
R.ok("телефон: по кнопке стаканы выезжают снизу", await inView());
await m.screenshot({ path: "tests/out-bx-mobile-book.png" });
R.ok("телефон: без ошибок", merr.length === 0, merr.join(" | "));
R.ok("без ошибок", errors.length === 0, errors.join(" | ").slice(0, 300));
await browser.close(); R.print();
