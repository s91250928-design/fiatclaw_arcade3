// Плохая связь: ответ на ордер не дошёл. Сайт проверяет заявку по cloid и не дублирует её.
import { chromium, setupPage, connect, makeResults, URL0 } from "./harness.mjs";
const R = makeResults(); const browser = await chromium.launch(); const now = Date.now();
let agent = null, known = null, mode = "lost-but-placed";
const state = { exchange: [] };
state.onExchange = (b) => {
  if (b.action.type === "approveAgent") agent = b.action.agentAddress;
  if (b.action.type === "order") return { status: "ok", response: { type: "order", data: { statuses: [{ resting: { oid: 900 } }] } } };
  return null;
};
state.onUserInfo = (b) => {
  switch (b.type) {
    case "maxBuilderFee": return 25;
    case "extraAgents": return agent ? [{ address: agent, name: "totum", validUntil: now + 1e9 }] : [];
    case "userAbstraction": return "default";
    case "orderStatus": return known && b.oid === known ? { status: "order", order: { order: { oid: 901, origSz: "0.00129", limitPx: "77000", coin: "BTC" }, status: "open" } } : { status: "unknownOid" };
    case "clearinghouseState": return { marginSummary: { accountValue: "1000", totalMarginUsed: "0" }, crossMarginSummary: { accountValue: "1000" }, crossMaintenanceMarginUsed: "0", withdrawable: "1000", assetPositions: [] };
    case "spotClearinghouseState": return { balances: [{ coin: "USDC", token: 0, total: "1000", hold: "0", entryNtl: "0" }] };
    case "frontendOpenOrders": case "openOrders": case "userFunding": case "historicalOrders": case "userFills": return [];
  }
};
const { page, errors } = await setupPage(browser, { width: 1440, height: 900 }, state);
let drops = 0; const sent = [];
await page.route("https://api.hyperliquid-testnet.xyz/exchange", async (r) => {
  const b = JSON.parse(r.request().postData() || "{}");
  if (b.action?.type === "order") {
    sent.push(b.action.orders[0].c);
    if (drops < 1) { drops++; if (mode === "lost-but-placed") known = b.action.orders[0].c; return r.abort("failed"); }
  }
  return r.fallback();
});
await page.goto(URL0 + "/#trade"); await page.waitForTimeout(5000);
await connect(page); await page.waitForTimeout(4000);
await page.fill("#size", "100");
await page.click("#btnBuy"); await page.waitForTimeout(700); await page.click("#cfOk").catch(() => {}); await page.waitForTimeout(4000);
R.ok("ответ потерян, ордер на бирже есть → повторно НЕ отправляем", sent.length === 1 && /^0x746f74756d/.test(sent[0]), JSON.stringify(sent));
const t1 = await page.evaluate(() => [...document.querySelectorAll(".toast")].map((t) => t.textContent).join(" | "));
R.ok("пользователь видит успех, а не ошибку", !/медленно|ошибк/i.test(t1) || /Лимит|Исполнено|выставлен/i.test(t1), t1.slice(0, 200));
// второй случай: ордер не дошёл до биржи — повтор с тем же cloid
mode = "not-placed"; drops = 0; known = null; sent.length = 0;
await page.click("#btnBuy"); await page.waitForTimeout(700); await page.click("#cfOk").catch(() => {}); await page.waitForTimeout(4500);
R.ok("ордер не дошёл → повтор с тем же номером (без дубля)", sent.length === 2 && sent[0] === sent[1], JSON.stringify(sent));
R.ok("без ошибок", errors.length === 0, errors.join(" | ").slice(0, 300));
await browser.close(); R.print();
