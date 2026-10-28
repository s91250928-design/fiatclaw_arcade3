// Вход от риска: размер считается от «готов потерять» и стопа, линии плана тянутся мышью.
import { chromium, setupPage, connect, makeResults, URL0 } from "./harness.mjs";
const R = makeResults();
const browser = await chromium.launch();
const now = Date.now();
let agent = null;
const state = { exchange: [] };
state.onExchange = (b) => {
  if (b.action.type === "approveAgent") agent = b.action.agentAddress;
  if (b.action.type === "order") return { status: "ok", response: { type: "order", data: { statuses: b.action.orders.map((_, k) => ({ resting: { oid: 100 + k } })) } } };
  return null;
};
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
await page.goto(URL0 + "/#trade"); await page.waitForTimeout(5000);
await connect(page);
if (await page.isVisible("#btnEnable")) { await page.check("#consent").catch(() => {}); await page.click("#btnEnable"); await page.waitForTimeout(3000); }
await page.waitForTimeout(2500);
const coin = await page.evaluate(() => window.__totum.S.coin);
const mid = await page.evaluate(() => Number(window.__totum.S.ctx[window.__totum.S.coin].midPx));
const fee = 0.00045 + 25 / 1e5;

await page.check("#tpslOn");
await page.check("#riskOn");
R.ok("при включении стоп поставлен сам (1% ниже цены) и есть линия плана", await page.evaluate(() => window.__totum.lines().some((l) => l.kind === "plan-sl")));
await page.fill("#riskUsd", "20");
const sl = Number((mid * 0.99).toPrecision(6));
await page.fill("#sl", String(sl)); await page.waitForTimeout(300);
const size1 = Number(await page.inputValue("#size"));
const entry = await page.evaluate(() => Number(window.__totum.S.ctx[window.__totum.S.coin].midPx));
const expect = (20 / Math.abs(entry - sl)) * entry;
R.ok(`размер посчитан от риска $20 и стопа −1% (~${expect.toFixed(0)} USDC)`, Math.abs(size1 - expect) / expect < 0.02, `${size1} vs ${expect.toFixed(2)}`);
R.ok("поле суммы закрыто для ручного ввода", await page.evaluate(() => document.getElementById("size").readOnly));
const hint1 = await page.textContent("#riskHint");
R.ok("подсказка: лонг, −$20 на стопе", /Лонг/.test(hint1) && /20/.test(hint1), hint1);
R.ok("кнопка шорта приглушена", await page.evaluate(() => document.getElementById("btnSell").classList.contains("risk-dim")));
// нужно плечо: при 1000$ депозита позиция ~2000$ требует плеча ≥2
const lev = await page.inputValue("#lev");
R.ok("предупреждение про плечо, если маржи не хватает", Number(lev) * 1000 >= size1 || /плечо от/.test(hint1), `lev ${lev}, ${hint1}`);

const tp = Number((mid * 1.03).toPrecision(6));
await page.fill("#tp", String(tp)); await page.waitForTimeout(300);
const hint2 = await page.textContent("#riskHint");
R.ok("с тейком +3% и стопом −1% показано «прибыль/риск 1 : 3.0»", /прибыль\/риск 1 : (2\.9|3\.0|3\.1)/.test(hint2) && /Комиссия за вход и выход/.test(hint2), hint2);

// тянем линию стопа на −2% — размер должен уменьшиться примерно вдвое
const y0 = await page.evaluate((p) => window.__totum.priceToY(p), sl);
const y1 = await page.evaluate((p) => window.__totum.priceToY(p), mid * 0.98);
const box = await page.locator("#chart").boundingBox();
if (y0 != null && y1 != null) {
  const x = box.x + box.width * 0.5;
  await page.mouse.move(x, box.y + y0); await page.mouse.down();
  await page.mouse.move(x, box.y + (y0 + y1) / 2, { steps: 4 }); await page.mouse.move(x, box.y + y1, { steps: 4 });
  await page.mouse.up(); await page.waitForTimeout(300);
  const slNew = Number(await page.inputValue("#sl")), size2 = Number(await page.inputValue("#size"));
  R.ok("перетаскивание стопа на графике меняет стоп", Math.abs(slNew / mid - 0.98) < 0.003, `${slNew} / ${mid}`);
  R.ok("и пересчитывает размер (~вдвое меньше)", size2 < size1 * 0.6 && size2 > size1 * 0.4, `${size1} → ${size2}`);
} else R.ok("линия стопа видна на графике", false, "нет координаты");
await page.locator("#paneChart").screenshot({ path: "tests/out-risk-chart.png" });
await page.locator("#orderForm, .order-form, aside").first().screenshot({ path: "tests/out-risk-form.png" }).catch(() => {});

// шорт против стопа — нельзя
await page.click("#btnSell"); await page.waitForTimeout(500);
R.ok("шорт со стопом ниже цены не отправляется", !state.exchange.some((e) => e.action.type === "order"));
// лонг — подтверждение с «прибыль/риск» и ордер с SL/TP
await page.click("#btnBuy"); await page.waitForTimeout(700);
const cf = (await page.textContent("#cfRows").catch(() => "")) || "";
R.ok("в подтверждении есть «Прибыль / риск»", /Прибыль \/ риск/.test(cf), cf.slice(0, 200));
await page.click("#cfOk").catch(() => {}); await page.waitForTimeout(1500);
const ord = state.exchange.find((e) => e.action.type === "order");
R.ok("ушёл лонг + стоп + тейк", ord && ord.action.orders.length === 3 && ord.action.orders[0].b === true, JSON.stringify(ord?.action.orders?.map((o) => [o.b, o.s, o.t]))?.slice(0, 300));
const sz = Number(ord?.action.orders[0].s || 0), slPx = Number(ord?.action.orders.find((o) => o.t.trigger?.tpsl === "sl")?.t.trigger.triggerPx || 0);
const loss = sz * Math.abs(mid - slPx);
R.ok(`если сработает стоп, убыток по цене ≈ $20 (${loss.toFixed(2)}), как считает Hyperliquid`, Math.abs(loss - 20) < 0.6);
R.ok("в подтверждении комиссия вход+выход отдельной строкой", /Комиссия вход \+ выход/.test(cf));
R.ok(`без ошибок (${coin})`, errors.length === 0, errors.join(" | ").slice(0, 300));
await browser.close(); R.print();
