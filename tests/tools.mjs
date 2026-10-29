// Инструменты: сканер фандинга и арбитраж (данные подменяем, формат — как у /api/funding).
import { chromium, setupPage, makeResults, URL0 } from "./harness.mjs";
const R = makeResults(); const browser = await chromium.launch(); const now = Date.now();
const venues = [["hyperliquid", "Hyperliquid", "dex"], ["binance", "Binance", "cex"], ["bybit", "Bybit", "cex"], ["okx", "OKX", "cex"], ["dydx", "dYdX", "dex"]].map(([id, name, type]) => ({ id, name, type, ok: true, n: 3 }));
const row = (v, base, rate, ih, mark, vol = 5e7, mult = 1, sym = base) => ({ v, sym, base, rate, ih, next: now + 36e5, mark, vol, oi: null, mult });
const data = { t: now, venues, rows: [
  row("hyperliquid", "BTC", 0.0000125, 1, 80000), row("binance", "BTC", 0.0001, 8, 80040), row("bybit", "BTC", 0.00005, 8, 80010), row("okx", "BTC", 0.0002, 8, 80100), row("dydx", "BTC", 0, 1, 79990),
  row("hyperliquid", "PEPE", -0.00005, 1, 0.0105, 5e7, 1000, "kPEPE"), row("binance", "PEPE", 0.0008, 4, 0.0106, 5e7, 1000, "1000PEPEUSDT"), row("bybit", "PEPE", 0.0001, 8, 0.0000105, 5e7, 1, "PEPEUSDT"),
  row("hyperliquid", "LOWVOL", 0.001, 1, 1, 5e4), row("binance", "LOWVOL", -0.001, 8, 1.1, 5e4),
] };
const { page, errors } = await setupPage(browser, { width: 1440, height: 1000 }, { exchange: [] }, { theme: "dark" });
await page.addInitScript(() => { localStorage.setItem("totum.theme", "dark"); localStorage.removeItem("totum.tools"); });
await page.route("**/api/funding", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify(data) }));
await page.goto(URL0 + "/#trade"); await page.waitForTimeout(4500);
await page.click('[data-cp="tools"]'); await page.waitForTimeout(1500);
const heads = await page.locator(".tl-table th").allTextContents();
R.ok("сканер фандинга: колонки бирж", heads.join("|").includes("Binance") && heads.join("|").includes("dYdX"), heads.join("|"));
const btc = await page.locator(".tl-table tbody tr", { hasText: "BTC" }).textContent();
// за 1 ч: OKX 0.0002/8 = +0.0025%, dYdX 0 → разница 0.0025%
R.ok("BTC: ставки приведены к 1 ч, разница 0,0025%, шорт OKX / лонг dYdX", /\+0\.0025%/.test(btc) && /Шорт OKX · лонг dYdX/.test(btc), btc);
R.ok("монеты с объёмом ниже $1M скрыты", !(await page.locator(".tl-table").textContent()).includes("LOWVOL"));
await page.click('[data-tlnorm="8"]'); await page.waitForTimeout(400);
R.ok("за 8 ч: Hyperliquid BTC +0,0100%", /\+0\.0100%/.test(await page.locator(".tl-table tbody tr", { hasText: "BTC" }).textContent()));
await page.screenshot({ path: "tests/out-tools-funding.png" });
await page.click('[data-tlv="okx"]'); await page.waitForTimeout(300);
R.ok("биржу можно выключить", !(await page.locator(".tl-table th").allTextContents()).includes("OKX"));
await page.click('[data-tl="arb"]'); await page.waitForTimeout(500);
const arb = await page.locator(".tl-table.arb tbody").textContent();
R.ok("арбитраж: PEPE сравнивается за одну монету (kPEPE и 1000PEPE и PEPE)", /PEPE/.test(arb) && !/LOWVOL/.test(arb), arb.slice(0, 200));
const pepe = await page.locator(".tl-table.arb tbody tr", { hasText: "PEPE" }).textContent();
R.ok("PEPE: спред ≈ 0,95%, лонг Hyperliquid/Bybit, шорт Binance", /0\.95%/.test(pepe) && /шорт Binance/.test(pepe), pepe);
await page.screenshot({ path: "tests/out-tools-arb.png" });
await page.click(".tl-table.arb [data-tlcoin='BTC']"); await page.waitForTimeout(800);
R.ok("клик по монете открывает её график", (await page.evaluate(() => [window.__totum.S.coin, document.body.dataset.cp])).join() === "BTC,chart");
R.ok("без ошибок", errors.length === 0, errors.join(" | ").slice(0, 300));
await browser.close(); R.print();
