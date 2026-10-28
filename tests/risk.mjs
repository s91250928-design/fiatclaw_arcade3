// Вход от риска: стоп и тейк ставятся сами, соотношение прибыль/риск, направление, цена с графика.
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
const warns = []; page.on("console", (m) => m.type() === "warning" && /ws /.test(m.text()) && warns.push(m.text()));
await page.goto(URL0 + "/#trade"); await page.waitForTimeout(5000);
await connect(page);
if (await page.isVisible("#btnEnable")) { await page.check("#consent").catch(() => {}); await page.click("#btnEnable"); await page.waitForTimeout(3000); }
await page.waitForTimeout(2500);
const mid = () => page.evaluate(() => Number(window.__totum.S.ctx[window.__totum.S.coin].midPx));
const val = async (id) => Number(await page.inputValue(id));
const near = (a, b, tol = 0.01) => Math.abs(a / b - 1) < tol;

await page.check("#tpslOn");
await page.check("#riskOn");
await page.fill("#riskUsd", "10"); await page.waitForTimeout(400);
let m = await mid(), sl = await val("#sl"), tp = await val("#tp"), size = await val("#size");
R.ok("стоп поставился сам ниже цены (лонг)", sl > 0 && sl < m, `${sl} / ${m}`);
R.ok("тейк поставился сам по 1 : 2", tp > m && near((tp - m) / (m - sl), 2, 0.03), `${tp}`);
R.ok("размер = $10 / расстояние до стопа", near(size, (10 / (m - sl)) * m, 0.02), `${size}`);

// проценты: пишу тейк 5% → стоп 2,5% сам
await page.click('[data-unit-for="ord"] [data-unit="pct"]'); await page.waitForTimeout(200);
await page.fill("#tp", "5"); await page.waitForTimeout(400);
R.ok("тейк 5% → стоп 2,5% сам (1 : 2)", Math.abs((await val("#sl")) - 2.5) < 0.05, await page.inputValue("#sl"));
await page.click('[data-rr="3"]'); await page.waitForTimeout(400);
R.ok("1 : 3 → стоп 1,67%", Math.abs((await val("#sl")) - 1.67) < 0.05, await page.inputValue("#sl"));
const hint = await page.textContent("#riskHint");
R.ok("подсказка: стоп −$10, тейк ≈ +$30, 1 : 3.0", /−10/.test(hint) && /1 : 3\.0/.test(hint), hint);
await page.click('[data-rside="short"]'); await page.waitForTimeout(400);
R.ok("Шорт: проценты те же, приглушён лонг", (await val("#tp")) === 5 && (await page.evaluate(() => document.getElementById("btnBuy").classList.contains("risk-dim"))));
const lines = await page.evaluate(() => window.__totum.lines().filter((l) => l.kind.startsWith("plan")));
m = await mid();
R.ok("на графике план шорта: стоп выше, тейк ниже", lines.find((l) => l.kind === "plan-sl")?.price > m && lines.find((l) => l.kind === "plan-tp")?.price < m, JSON.stringify(lines.map((l) => [l.kind, l.price])));

// цена с графика: ⌖ у стопа → клик по графику на −2% → лонг, тейк сам (1 : 3)
await page.click('[data-unit-for="ord"] [data-unit="px"]'); await page.waitForTimeout(200);
await page.click('[data-pick="sl"]'); await page.waitForTimeout(200);
m = await mid();
const y = await page.evaluate((p) => window.__totum.priceToY(p), m * 0.98);
const box = await page.locator("#chart").boundingBox();
await page.mouse.click(box.x + box.width * 0.4, box.y + y); await page.waitForTimeout(500);
sl = await val("#sl"); tp = await val("#tp");
R.ok("клик по графику поставил стоп ≈ −2%", near(sl, m * 0.98, 0.003), `${sl}`);
R.ok("направление стало лонг, тейк сам ≈ +6%", !(await page.evaluate(() => document.getElementById("btnSell").classList.contains("risk-dim"))) === false && near(tp, m * 1.06, 0.004), `${tp}`);
await page.locator("#paneChart").screenshot({ path: "tests/out-risk-chart.png" });
await page.locator("#tpslRow").screenshot({ path: "tests/out-risk-form.png" });

// не хватает маржи: риск $300 → предупреждение с кнопками, «Риск $X» подставляет сумму, которая влезает
await page.fill("#riskUsd", "300"); await page.waitForTimeout(400);
R.ok("предупреждение «Не хватает маржи» или «не влезает» с кнопками", await page.isVisible(".rk-alert .rk-acts button"), await page.textContent("#riskHint"));
await page.locator("#tpslRow").screenshot({ path: "tests/out-risk-alert.png" });
await page.click("[data-rk-risk]"); await page.waitForTimeout(400);
R.ok("кнопка «Риск $X» убрала предупреждение", !(await page.isVisible(".rk-alert")) , await page.inputValue("#riskUsd"));
await page.fill("#riskUsd", "10"); await page.waitForTimeout(400);
await page.click("#btnBuy"); await page.waitForTimeout(700);
await page.click("#cfOk").catch(() => {}); await page.waitForTimeout(1500);
const ord = state.exchange.find((e) => e.action.type === "order");
const sz = Number(ord?.action.orders[0].s || 0), slPx = Number(ord?.action.orders.find((o) => o.t.trigger?.tpsl === "sl")?.t.trigger.triggerPx || 0);
R.ok("ушёл лонг со стопом и тейком", ord?.action.orders.length === 3 && ord.action.orders[0].b === true);
R.ok(`при стопе убыток по цене ≈ $10 (${(sz * Math.abs(m - slPx)).toFixed(2)})`, Math.abs(sz * Math.abs(m - slPx) - 10) < 0.5);
R.ok("нет ошибок подписок WS", !warns.some((w) => /Already subscribed/.test(w)), warns.join(" | ").slice(0, 200));
R.ok("без ошибок", errors.length === 0, errors.join(" | ").slice(0, 300));
await browser.close(); R.print();
