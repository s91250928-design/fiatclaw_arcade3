// ADL: при спокойном рынке не выше 2 делений; окно пояснения открывается.
import { chromium, setupPage, connect, makeResults, URL0 } from "./harness.mjs";
const R = makeResults();
const browser = await chromium.launch();
const state = { exchange: [], fee: 25 };
let agent = null;
state.onExchange = (b) => { if (b.action.type === "approveAgent") agent = b.action.agentAddress; return null; };
state.onUserInfo = (b) => {
  switch (b.type) {
    case "maxBuilderFee": return 25;
    case "extraAgents": return agent ? [{ address: agent, name: "totum", validUntil: Date.now() + 1e9 }] : [];
    case "userAbstraction": return "unifiedAccount";
    case "clearinghouseState":
      return b.dex ? { marginSummary: { accountValue: "0", totalMarginUsed: "0" }, crossMarginSummary: { accountValue: "0" }, crossMaintenanceMarginUsed: "0", withdrawable: "0", assetPositions: [] }
        : { marginSummary: { accountValue: "735", totalMarginUsed: "233" }, crossMarginSummary: { accountValue: "735" }, crossMaintenanceMarginUsed: "50", withdrawable: "0",
          assetPositions: [{ type: "oneWay", position: { coin: "BTC", szi: "0.1166", entryPx: "60000", unrealizedPnl: "17.95", liquidationPx: "54000", leverage: { type: "cross", value: 40 }, cumFunding: { allTime: "0", sinceOpen: "0", sinceChange: "0" }, positionValue: "9329", returnOnEquity: "0.077", marginUsed: "233", maxLeverage: 40 } }] };
    case "spotClearinghouseState": return { balances: [{ coin: "USDC", token: 0, total: "717", hold: "233", entryNtl: "0" }] };
    case "frontendOpenOrders": case "openOrders": case "userFills": case "userFunding": case "historicalOrders": return [];
  }
};
const { page, errors } = await setupPage(browser, { width: 1440, height: 900 }, state);
await page.goto(URL0 + "/#trade"); await page.waitForTimeout(4000);
await connect(page);
if (await page.isVisible("#btnEnable")) { await page.check("#consent").catch(() => {}); await page.click("#btnEnable"); await page.waitForTimeout(3000); }
await page.waitForTimeout(3000);
const on = await page.locator("#posBody .adl i.on").count();
const cls = await page.getAttribute("#posBody .adl", "class");
R.ok("спокойный рынок, 40x в прибыли: не выше 2 делений, зелёный", on <= 2 && /lv[12]/.test(cls), `делений=${on} ${cls}`);
await page.click("#posBody .adl"); await page.waitForTimeout(300);
R.ok("окно пояснения ADL открывается", await page.isVisible("#adlDialog"));
await page.locator("#adlDialog").screenshot({ path: "tests/out-adl.png" });
await page.click("#adlClose"); await page.waitForTimeout(200);
await page.click(".th-help"); await page.waitForTimeout(300);
R.ok("пояснение и по кнопке в заголовке колонки", await page.isVisible("#adlDialog"));
// резкое движение в пользу лонга → индикатор растёт
await page.evaluate(() => { const S = window.__totum.S; S.adlMove.BTC = { up: 0.04, down: 0, at: Date.now() }; });
await page.click("#adlClose"); await page.evaluate(() => window.__totum.S.positions.length);
await page.waitForTimeout(5500);
const cls2 = await page.getAttribute("#posBody .adl", "class");
R.ok("при резком движении +4% за 15 мин уровень выше", /lv[3-5]/.test(cls2), cls2);
R.ok("без ошибок", errors.length === 0, errors.join(" | ").slice(0, 300));
await browser.close(); R.print();
