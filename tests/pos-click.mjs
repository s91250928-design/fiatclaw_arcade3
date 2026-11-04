// Нажатие на позицию открывает график её монеты; кнопки позиции работают как раньше.
import { chromium, setupPage, connect, makeResults, URL0 } from "./harness.mjs";
const R = makeResults(); const browser = await chromium.launch(); const now = Date.now(); let agent = null;
const pos = { position: { coin: "ETH", szi: "-0.0061", entryPx: "2423.5", positionValue: "14.7", unrealizedPnl: "0", returnOnEquity: "0", liquidationPx: "4750", marginUsed: "14.78", leverage: { type: "isolated", value: 1 }, cumFunding: { sinceOpen: "0" }, maxLeverage: 25 }, type: "oneWay" };
const state = { exchange: [], onExchange: (b) => { if (b.action.type === "approveAgent") agent = b.action.agentAddress; return null; },
  onUserInfo: (b) => ({ maxBuilderFee: 25, extraAgents: agent ? [{ address: agent, name: "totum", validUntil: now + 1e9 }] : [], userAbstraction: "disabled", clearinghouseState: { marginSummary: { accountValue: "100", totalMarginUsed: "15" }, crossMarginSummary: { accountValue: "100" }, crossMaintenanceMarginUsed: "0", withdrawable: "85", assetPositions: [pos] }, spotClearinghouseState: { balances: [] } })[b.type] ?? (["frontendOpenOrders", "openOrders", "userFunding", "historicalOrders", "userFills", "userFillsByTime"].includes(b.type) ? [] : undefined) };
const { page, errors } = await setupPage(browser, { width: 1600, height: 900 }, state);
await page.goto(URL0 + "/#trade"); await page.waitForTimeout(5000); await connect(page); await page.waitForTimeout(4000);
await page.evaluate(() => window.__totum.switchCoin("BTC")); await page.waitForTimeout(1500);
await page.click('[data-cp="scalp"]'); await page.waitForTimeout(800);
await page.click('#posBody .pos-row td:nth-child(3)'); await page.waitForTimeout(1500);
const st = await page.evaluate(() => ({ coin: window.__totum.S.coin, cp: document.body.dataset.cp }));
R.ok("нажатие на позицию → график ETH", st.coin === "ETH" && st.cp === "chart", JSON.stringify(st));
await page.evaluate(() => window.__totum.switchCoin("BTC")); await page.waitForTimeout(1200);
await page.click('#posBody .pos-row button:has-text("Лимит")'); await page.waitForTimeout(500);
R.ok("кнопка «Лимит» в позиции открывает окно закрытия, а не график", (await page.evaluate(() => document.getElementById("closeDialog").open)) && (await page.evaluate(() => window.__totum.S.coin)) === "BTC");
R.ok("без ошибок", errors.length === 0, errors.join(" | ").slice(0, 300));
await browser.close(); R.print();
