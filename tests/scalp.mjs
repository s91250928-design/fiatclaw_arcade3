// Скальпинг: стакан-лестница — клики ставят заявки, горячие клавиши, снятие заявок, шаг цены.
import { chromium, setupPage, connect, makeResults, URL0 } from "./harness.mjs";
const R = makeResults();
const browser = await chromium.launch();
const now = Date.now();
let agent = null, open = [];
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
    case "clearinghouseState": return { marginSummary: { accountValue: "1000", totalMarginUsed: "0" }, crossMarginSummary: { accountValue: "1000" }, crossMaintenanceMarginUsed: "0", withdrawable: "1000", assetPositions: [] };
    case "spotClearinghouseState": return { balances: [{ coin: "USDC", token: 0, total: "1000", hold: "0", entryNtl: "0" }] };
    case "frontendOpenOrders": case "openOrders": return open;
    case "userFunding": case "historicalOrders": case "userFills": return [];
  }
};
const { page, errors } = await setupPage(browser, { width: 1440, height: 900 }, state, { theme: "dark" });
await page.addInitScript(() => { localStorage.setItem("totum.theme", "dark"); localStorage.removeItem("totum.scalp"); });
await page.goto(URL0 + "/#trade"); await page.waitForTimeout(5000);
await connect(page); await page.waitForTimeout(3000);
await page.click('[data-cp="scalp"]'); await page.waitForTimeout(3500);
const rows = await page.locator("#scLadder .sc-row").count();
R.ok("стакан-лестница заполнила высоту", rows >= 25, String(rows));
const pxs = await page.$$eval("#scLadder .sc-row", (r) => r.map((x) => Number(x.dataset.px)));
const steps = new Set(pxs.slice(1).map((p, k) => (pxs[k] - p).toPrecision(6)));
R.ok("цены идут сверху вниз с одним шагом", steps.size === 1 && pxs[0] > pxs[1], [...steps].join());
R.ok("есть зоны продажи и покупки", (await page.locator(".sc-row.z-a").count()) > 3 && (await page.locator(".sc-row.z-b").count()) > 3);
R.ok("боковая панель скрыта, лестница широкая", await page.isHidden("#sidePanel"));
await page.screenshot({ path: "tests/out-scalp.png" });
// клик в колонке «Покупка» на 6 рядов ниже середины → лимитная покупка
const bidRow = page.locator("#scLadder .sc-row.z-b").nth(5);
const bpx = Number(await bidRow.getAttribute("data-px"));
await bidRow.locator(".bc").click(); await page.waitForTimeout(1500);
let o = state.exchange.filter((e) => e.action.type === "order").at(-1)?.action.orders[0];
R.ok("клик → лимитная покупка по цене строки", o && o.b === true && o.t.limit.tif === "Gtc" && Math.abs(Number(o.p) / bpx - 1) < 1e-4, JSON.stringify(o));
R.ok("размер = рабочий объём $100 / цена", o && Math.abs(Number(o.s) * bpx - 100) < 3, o?.s);
R.ok("комиссия Totum в ордере", !!state.exchange.filter((e) => e.action.type === "order").at(-1)?.action.builder);
await page.waitForTimeout(1500);
R.ok("своя заявка видна на лестнице", (await page.locator(".sc-my").count()) === 1);
R.ok("и в списке заявок справа", /Покупка/.test(await page.textContent("#scOrd")));
await page.screenshot({ path: "tests/out-scalp-order.png" });
await page.locator(".sc-my").first().click(); await page.waitForTimeout(1500);
R.ok("клик по заявке → снята", state.exchange.some((e) => e.action.type === "cancel" && e.action.cancels[0].o === 777));
// Shift + правая кнопка ниже рынка → стоп на продажу
const sr = page.locator("#scLadder .sc-row.z-b").nth(8);
const spx = Number(await sr.getAttribute("data-px"));
await sr.locator(".pc").click({ button: "right", modifiers: ["Shift"] }); await page.waitForTimeout(1500);
o = state.exchange.filter((e) => e.action.type === "order").at(-1)?.action.orders[0];
R.ok("Shift+ПКМ → стоп-ордер на продажу (sl)", o && o.b === false && o.t.trigger?.tpsl === "sl" && Math.abs(Number(o.t.trigger.triggerPx) / spx - 1) < 1e-4, JSON.stringify(o?.t));
// правая кнопка выше рынка → лимитная продажа
const ar = page.locator("#scLadder .sc-row.z-a").nth(3);
const apx = Number(await ar.getAttribute("data-px"));
await ar.locator(".bc").click({ button: "right" }); await page.waitForTimeout(1500);
o = state.exchange.filter((e) => e.action.type === "order").at(-1)?.action.orders[0];
R.ok("ПКМ выше спреда → лимитная продажа (в любой колонке)", o && o.b === false && o.t.limit?.tif === "Gtc" && Math.abs(Number(o.p) / apx - 1) < 1e-4, JSON.stringify(o));
await page.waitForTimeout(1200);
await page.locator(".sc-my").first().click({ button: "middle" }); await page.waitForTimeout(1200);
R.ok("колесо по заявке → снята", state.exchange.filter((e) => e.action.type === "cancel").length === 2);
// левая кнопка выше спреда → покупка по рынку
await page.locator("#scLadder .sc-row.z-a").nth(2).locator(".ac").click(); await page.waitForTimeout(1500);
o = state.exchange.filter((e) => e.action.type === "order").at(-1)?.action.orders[0];
R.ok("ЛКМ выше спреда → покупка по рынку", o && o.b === true && o.t.limit?.tif === "Ioc", JSON.stringify(o));
// стоп и тейк при входе: 1% и 2% — дочерние заявки, включаются после исполнения
await page.fill("#scAsl", "1"); await page.dispatchEvent("#scAsl", "change");
await page.fill("#scAtp", "2"); await page.dispatchEvent("#scAtp", "change");
const br = page.locator("#scLadder .sc-row.z-b").nth(4); const brp = Number(await br.getAttribute("data-px"));
await br.locator(".bc").click(); await page.waitForTimeout(1500);
const act = state.exchange.filter((e) => e.action.type === "order").at(-1)?.action;
const sl = act?.orders.find((x) => x.t.trigger?.tpsl === "sl"), tp = act?.orders.find((x) => x.t.trigger?.tpsl === "tp");
R.ok("вход с авто-стопом −1% и авто-тейком +2% (ставятся после исполнения)", act?.grouping === "normalTpsl" && sl?.r && tp?.r && Math.abs(Number(sl.t.trigger.triggerPx) / (brp * 0.99) - 1) < 2e-4 && Math.abs(Number(tp.t.trigger.triggerPx) / (brp * 1.02) - 1) < 2e-4, JSON.stringify(act?.orders.map((x) => x.t)));
await page.fill("#scAsl", "0"); await page.dispatchEvent("#scAsl", "change"); await page.fill("#scAtp", "0"); await page.dispatchEvent("#scAtp", "change");
// горячие клавиши: 3 → $250, S → продажа по рынку
await page.locator("#scLadder").focus();
await page.keyboard.press("3"); await page.keyboard.press("s"); await page.waitForTimeout(1500);
o = state.exchange.filter((e) => e.action.type === "order").at(-1)?.action.orders[0];
const mid = await page.evaluate(() => Number(window.__totum.S.ctx[window.__totum.S.coin].midPx));
R.ok("клавиши 3 + S → продажа по рынку на $250", o && o.b === false && o.t.limit?.tif === "Ioc" && Math.abs(Number(o.s) * mid - 250) < 10, JSON.stringify(o));
R.ok("плечо выставлено один раз", state.exchange.filter((e) => e.action.type === "updateLeverage").length === 1);
// шаг ×10
await page.click('[data-scagg="3"]'); await page.waitForTimeout(3000);
const p2 = await page.$$eval("#scLadder .sc-row", (r) => r.slice(0, 2).map((x) => Number(x.dataset.px)));
const st1 = pxs[0] - pxs[1], st2 = p2[0] - p2[1];
R.ok("шаг ×10 — строки реже", st2 > st1 * 5, `${st1} → ${st2}`);
await page.screenshot({ path: "tests/out-scalp-x10.png" });
// колесо листает и выключает автоцентр
const before = Number(await page.locator("#scLadder .sc-row").first().getAttribute("data-px"));
await page.locator("#scLadder").hover(); await page.mouse.wheel(0, -200); await page.waitForTimeout(300);
const after = Number(await page.locator("#scLadder .sc-row").first().getAttribute("data-px"));
R.ok("колесо листает цены вверх", after > before && !(await page.isChecked("#scAuto")), `${before} → ${after}`);
await page.keyboard.press("Space"); await page.waitForTimeout(300);
R.ok("Пробел — снова в центр", await page.isChecked("#scAuto"));
R.ok("без ошибок", errors.length === 0, errors.join(" | ").slice(0, 300));
// телефон
const m = await browser.newPage({ viewport: { width: 390, height: 844 } });
const merr = []; m.on("pageerror", (e) => merr.push(String(e)));
await m.goto(URL0 + "/#trade"); await m.waitForTimeout(4500);
await m.evaluate(() => { document.body.dataset.mv = "full"; document.querySelector('[data-cp="scalp"]').click(); }); await m.waitForTimeout(8000);
R.ok("телефон: лестница видна", (await m.locator("#scLadder .sc-row").count()) > 15);
await m.screenshot({ path: "tests/out-scalp-mobile.png" });
R.ok("телефон: без ошибок", merr.length === 0, merr.join(" | "));
await browser.close(); R.print();
