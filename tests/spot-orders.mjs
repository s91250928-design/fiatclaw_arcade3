// Спот: свои вкладки ордеров и PnL-карточка только для монет, купленных и проданных через Totum.
import { chromium, setupPage, connect, makeResults, URL0 } from "./harness.mjs";
const R = makeResults(); const browser = await chromium.launch(); const now = Date.now(); let agent = null;
let fills = [];
const state = { exchange: [], onExchange: (b) => { if (b.action.type === "approveAgent") agent = b.action.agentAddress; return null; },
  onUserInfo: (b) => { switch (b.type) { case "maxBuilderFee": return 25; case "extraAgents": return agent ? [{ address: agent, name: "totum", validUntil: now + 1e9 }] : [];
    case "userAbstraction": return "unifiedAccount"; case "clearinghouseState": return { marginSummary: { accountValue: "0", totalMarginUsed: "0" }, crossMarginSummary: { accountValue: "0" }, crossMaintenanceMarginUsed: "0", withdrawable: "0", assetPositions: [] };
    case "spotClearinghouseState": return { balances: [{ coin: "USDC", token: 0, total: "500", hold: "0", entryNtl: "0" }] };
    case "userFills": return fills; case "frontendOpenOrders": case "openOrders": case "userFunding": case "historicalOrders": case "portfolio": return []; } } };
const { page, errors } = await setupPage(browser, { width: 1440, height: 900 }, state);
await page.goto(URL0 + "/#trade"); await page.waitForTimeout(5000);
const sp = await page.evaluate(() => { const m = window.__totum.S.spot.find((x) => x.quote === "USDC" && x.base !== "USDC"); return { name: m.name, base: m.base }; });
const f = (o) => ({ coin: sp.name, crossed: true, startPosition: "0", dir: o.side === "B" ? "Buy" : "Sell", hash: "0x", tid: Math.random(), ...o });
fills = [
  f({ side: "B", px: "10", sz: "10", time: now - 5e6, oid: 1, fee: "0.007", feeToken: sp.base, builderFee: "0.0025" }), // купил через Totum 10 по 10
  f({ side: "B", px: "8", sz: "5", time: now - 4e6, oid: 2, fee: "0.003", feeToken: sp.base }),                       // купил в другом месте — не считается
  f({ side: "A", px: "12", sz: "4", time: now - 3e6, oid: 3, fee: "0.03", feeToken: "USDC", builderFee: "0.01" }),    // продал через Totum 4 по 12
  f({ side: "A", px: "9", sz: "3", time: now - 2e6, oid: 4, fee: "0.02", feeToken: "USDC" }),                         // продал не через Totum — без PnL
].reverse();
await connect(page); await page.waitForTimeout(3500);
await page.evaluate((c) => window.__totum.switchCoin(c), sp.name); await page.waitForTimeout(1500);
await page.click("#btnOrdersInfo"); await page.waitForTimeout(1200);
const tabs = (await page.locator("#opTabs button:visible").allTextContents()).map((s) => s.trim());
R.ok("у спота свои вкладки: открытые, история ордеров, история сделок — без позиций и фандинга", tabs.includes("История сделок") && !tabs.includes("История позиций") && !tabs.includes("История фандинга"), tabs.join(" | "));
R.ok("заголовок «Спот · ордера»", (await page.textContent("#opTitle")) === "Спот · ордера");
await page.click('[data-op="sorders"]'); await page.waitForTimeout(1500);
const cards = await page.locator("#opList .op-card").count(), shares = await page.locator("#opList [data-share]").count();
R.ok("4 ордера, PnL-кнопка только у продажи через Totum", cards === 4 && shares === 1, `${cards} / ${shares}`);
const hero = await page.textContent("#opList .op-hero");
// себестоимость: 10 куплено за 100, комиссия токеном 0.007 → 9.993 шт; 4 шт по 10.007 → 40.028; выручка 48; комиссия 0.03 → PnL ≈ 7.94
R.ok("PnL продажи ≈ +7,94 $ с комиссиями", /\+7,9/.test(hero), hero);
await page.locator("#ordersPage").screenshot({ path: "tests/out-spot-orders.png" });
await page.click("#opList [data-share]"); await page.waitForTimeout(1200);
R.ok("открывается PnL-карточка", await page.isVisible("#pnlDialog"));
await page.locator("#pnlDialog").screenshot({ path: "tests/out-spot-pnlcard.png" });
await page.keyboard.press("Escape"); await page.waitForTimeout(300);
await page.click('[data-op="strades"]'); await page.waitForTimeout(1200);
R.ok("история сделок: 4 исполнения", (await page.locator("#opList .op-card").count()) === 4);
await page.keyboard.press("Escape"); await page.waitForTimeout(300);
await page.evaluate(() => window.__totum.switchCoin("BTC")); await page.waitForTimeout(1200);
await page.click("#btnOrdersInfo"); await page.waitForTimeout(800);
const t2 = (await page.locator("#opTabs button:visible").allTextContents()).map((s) => s.trim());
R.ok("у фьючерсов — прежние вкладки", t2.includes("История позиций") && !t2.includes("История сделок"), t2.join(" | "));
await page.click('[data-op="fills"]'); await page.waitForTimeout(1500);
R.ok("спотовые сделки не попадают во фьючерсы", (await page.locator("#opList .op-card").count()) === 0);
R.ok("без ошибок", errors.length === 0, errors.join(" | ").slice(0, 300));
await browser.close(); R.print();
