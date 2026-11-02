// Скальпинг: стакан-лестница — клики ставят заявки, горячие клавиши, снятие заявок, шаг цены.
import { chromium, setupPage, connect, makeResults, URL0 } from "./harness.mjs";
const R = makeResults();
const browser = await chromium.launch();
const now = Date.now();
let agent = null, open = [], ENT = 0;
const state = { exchange: [] };
state.onExchange = (b) => {
  if (b.action.type === "approveAgent") agent = b.action.agentAddress;
  if (b.action.type === "order") {
    const o = b.action.orders[0];
    if (o.t.limit?.tif === "Gtc") open.push({ coin: "BTC", oid: 777, side: o.b ? "B" : "A", limitPx: o.p, sz: o.s, isTrigger: false, orderType: "Limit", timestamp: now });
    return { status: "ok", response: { type: "order", data: { statuses: [o.t.limit?.tif === "Ioc" ? { filled: { totalSz: o.s, avgPx: o.p, oid: 5 } } : { resting: { oid: 777 } }] } } };
  }
  if (b.action.type === "cancel") { open = open.filter((o) => !b.action.cancels.some((c) => c.o === o.oid)); return { status: "ok", response: { type: "cancel", data: { statuses: ["success"] } } }; }
  return null;
};
state.onUserInfo = (b) => {
  switch (b.type) {
    case "maxBuilderFee": return 25;
    case "extraAgents": return agent ? [{ address: agent, name: "totum", validUntil: now + 1e9 }] : [];
    case "userAbstraction": return "default";
    case "clearinghouseState": return { marginSummary: { accountValue: "1000", totalMarginUsed: "50" }, crossMarginSummary: { accountValue: "1000" }, crossMaintenanceMarginUsed: "5", withdrawable: "900", assetPositions: ENT ? [{ type: "oneWay", position: { coin: "BTC", szi: "0.01", entryPx: String(ENT), positionValue: "780", unrealizedPnl: "15", returnOnEquity: "0.2", liquidationPx: "40000", marginUsed: "78", leverage: { type: "cross", value: 10 }, cumFunding: { allTime: "0", sinceOpen: "0" } } }] : [] };
    case "spotClearinghouseState": return { balances: [{ coin: "USDC", token: 0, total: "1000", hold: "0", entryNtl: "0" }] };
    case "frontendOpenOrders": case "openOrders": return open;
    case "userFunding": case "historicalOrders": case "userFills": return [];
  }
};
const { page, errors } = await setupPage(browser, { width: 1440, height: 900 }, state, { theme: "dark" });
await page.addInitScript(() => { localStorage.setItem("totum.theme", "dark"); localStorage.removeItem("totum.scalp"); });
await page.goto(URL0 + "/#trade"); await page.waitForTimeout(6000);
const mid0 = await page.evaluate(() => Number(window.__totum.S.ctx.BTC.midPx));
ENT = Math.round(mid0 * 0.98);
await connect(page); await page.waitForTimeout(4000);
R.ok("в позициях есть кнопка Б/У", await page.isVisible("[data-be]"));
await page.click("[data-be]"); await page.waitForTimeout(2000);
const act = state.exchange.filter((e) => e.action.type === "order").at(-1)?.action, o = act?.orders[0];
const trig = Number(o?.t?.trigger?.triggerPx), minBe = ENT * (1 + 7e-4) / (1 - 7e-4);
R.ok("стоп в безубыток: на всю позицию, ниже цены, выше входа на комиссии", act?.grouping === "positionTpsl" && o.b === false && o.r && o.t.trigger.tpsl === "sl" && o.s === "0.01" && trig >= minBe * 0.99999 && trig < ENT * 1.01, `вход ${ENT}, стоп ${trig}, минимум ${minBe.toFixed(1)}`);
const toastT = await page.evaluate(() => [...document.querySelectorAll(".toast")].map((t) => t.textContent).join(" | "));
R.ok("в сообщении — из чего сложилась цена", /комиссии[\s\S]*проскальзывание/.test(toastT), toastT.slice(0, 200));
// позиция в минусе — стоп не ставим
ENT = Math.round(mid0 * 1.02);
await page.evaluate(() => window.__totum.refresh && window.__totum.refresh());
await page.waitForTimeout(6500);
const n0 = state.exchange.filter((e) => e.action.type === "order").length;
await page.click("[data-be]"); await page.waitForTimeout(1500);
R.ok("позиция в минусе — стоп не ставится, понятное сообщение", state.exchange.filter((e) => e.action.type === "order").length === n0);
R.ok("без ошибок", errors.length === 0, errors.join(" | ").slice(0, 300));
await browser.close(); R.print();
