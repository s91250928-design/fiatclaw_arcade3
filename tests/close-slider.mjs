// Окно «Закрыть позицию»: ползунок не прыгает обратно, пока обновляется счёт.
import { chromium, setupPage, connect, makeResults, URL0 } from "./harness.mjs";
const R = makeResults(); const browser = await chromium.launch(); const now = Date.now();
let agent = null;
const pos = { position: { coin: "BTC", szi: "0.00025", entryPx: "77698", positionValue: "19.4", unrealizedPnl: "0", returnOnEquity: "0", liquidationPx: "55", marginUsed: "19.4", leverage: { type: "isolated", value: 1 }, cumFunding: { sinceOpen: "0" }, maxLeverage: 40 }, type: "oneWay" };
const state = { exchange: [], onExchange: (b) => { if (b.action.type === "approveAgent") agent = b.action.agentAddress; return null; },
  onUserInfo: (b) => ({ maxBuilderFee: 25, extraAgents: agent ? [{ address: agent, name: "totum", validUntil: now + 1e9 }] : [], userAbstraction: "disabled", clearinghouseState: { marginSummary: { accountValue: "100", totalMarginUsed: "19" }, crossMarginSummary: { accountValue: "100" }, crossMaintenanceMarginUsed: "0", withdrawable: "80", assetPositions: [pos] }, spotClearinghouseState: { balances: [{ coin: "USDC", token: 0, total: "0", hold: "0", entryNtl: "0" }] } })[b.type] ?? (["frontendOpenOrders", "openOrders", "userFunding", "historicalOrders", "userFills", "userFillsByTime"].includes(b.type) ? [] : undefined) };
const { page, errors } = await setupPage(browser, { width: 1440, height: 900 }, state);
await page.goto(URL0 + "/#trade"); await page.waitForTimeout(6000);
await connect(page); await page.waitForTimeout(4000);
await page.evaluate(() => window.__totum.switchCoin("BTC")); await page.waitForTimeout(2000);
if (0) await page.evaluate(() => { const d = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value"); window.__set = []; Object.defineProperty(document.getElementById("closePct"), "value", { get() { return d.get.call(this); }, set(v) { window.__set.push(String(v) + " @ " + new Error().stack.split("\n").slice(2, 4).join(" ")); d.set.call(this, v); } }); });
await page.click('#posBody [data-cl="limit"], #posBody button:has-text("Лимит")'); await page.waitForTimeout(500);
const bb = await page.locator("#closePct").boundingBox();
await page.mouse.move(bb.x + bb.width * 0.99, bb.y + bb.height / 2); await page.mouse.down();
await page.mouse.move(bb.x + bb.width * 0.3, bb.y + bb.height / 2, { steps: 10 }); await page.mouse.up();
const v1 = await page.inputValue("#closePct");
await page.waitForTimeout(12000);
const v2 = await page.inputValue("#closePct");
await page.mouse.click(5, 5).catch(() => {}); await page.click('#closeDialog [data-cp="75"]'); await page.waitForTimeout(300);
const v3 = await page.inputValue("#closePct");
await page.waitForTimeout(11000);
const v4 = await page.inputValue("#closePct");
console.log({ v1, v2, v3, v4, info: await page.textContent("#closeInfo") });
R.ok("ползунок держит значение", Math.abs(v1 - 30) < 3 && v1 === v2 && v3 === "75" && v4 === "75", JSON.stringify({ v1, v2, v3, v4 }));
R.ok("без ошибок", errors.length === 0, errors.join(" | ").slice(0, 300));
await browser.close(); R.print();
