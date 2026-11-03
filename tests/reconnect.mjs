// После обновления страницы кошелёк подключается сам, без окон и без новых подписей.
import { chromium, setupPage, connect, makeResults, URL0 } from "./harness.mjs";
const R = makeResults(); const browser = await chromium.launch(); const now = Date.now();
let agent = null;
const state = { exchange: [] };
state.onExchange = (b) => { if (b.action.type === "approveAgent") agent = b.action.agentAddress; return null; };
state.onUserInfo = (b) => {
  switch (b.type) {
    case "maxBuilderFee": return 25;
    case "extraAgents": return agent ? [{ address: agent, name: "totum", validUntil: now + 1e9 }] : [];
    case "userAbstraction": return "default";
    case "clearinghouseState": return { marginSummary: { accountValue: "1000", totalMarginUsed: "0" }, crossMarginSummary: { accountValue: "1000" }, crossMaintenanceMarginUsed: "0", withdrawable: "1000", assetPositions: [] };
    case "spotClearinghouseState": return { balances: [{ coin: "USDC", token: 0, total: "1000", hold: "0", entryNtl: "0" }] };
    case "frontendOpenOrders": case "openOrders": case "userFunding": case "historicalOrders": case "userFills": return [];
  }
};
const { page, errors } = await setupPage(browser, { width: 1440, height: 900 }, state);
const asks = []; await page.exposeFunction("__countReq", (m) => asks.push(m));
await page.addInitScript(() => { const w = window.ethereum; if (!w) return; const r = w.request; w.request = (a) => (window.__countReq(a.method), r(a)); });
await page.goto(URL0 + "/#trade"); await page.waitForTimeout(5000);
R.ok("первый заход: кошелёк не подключён сам", !(await page.evaluate(() => document.body.classList.contains("connected"))));
await connect(page); await page.waitForTimeout(4000);
const signs1 = state.exchange.length;
R.ok("подключился и включил торговлю", await page.evaluate(() => document.body.classList.contains("ready")));
asks.length = 0;
await page.reload(); await page.waitForTimeout(7000);
R.ok("после обновления страницы кошелёк подключён сам", await page.evaluate(() => document.body.classList.contains("connected") && document.body.classList.contains("ready")));
R.ok("без окна подключения (только тихая проверка eth_accounts)", asks.includes("eth_accounts") && asks.filter((m) => m === "eth_signTypedData_v4").length === 0, asks.join(","));
R.ok("без новых подписей кошелька", !state.exchange.slice(signs1).some((e) => ["approveAgent", "approveBuilderFee"].includes(e.action.type)), state.exchange.slice(signs1).map((e) => e.action.type).join());
// отключение — после обновления не подключается
page.once("dialog", (d) => d.accept());
await page.click("#btnConnect"); await page.waitForTimeout(800);
await page.reload(); await page.waitForTimeout(6000);
R.ok("после «Отключить» и обновления — не подключается сам", !(await page.evaluate(() => document.body.classList.contains("connected"))));
R.ok("без ошибок", errors.length === 0, errors.join(" | ").slice(0, 300));
await browser.close(); R.print();
