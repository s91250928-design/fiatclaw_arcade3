// Спот: продажа «всего» не больше баланса (комиссия при покупке в монете), вкладка «Активы».
import { chromium, setupPage, connect, makeResults, URL0 } from "./harness.mjs";
const R = makeResults(); const browser = await chromium.launch(); const now = Date.now();
let agent = null, coin = null, base = null, bal = 0;
const state = { exchange: [], onExchange: (b) => { if (b.action.type === "approveAgent") agent = b.action.agentAddress; if (b.action.type === "order") return { status: "ok", response: { type: "order", data: { statuses: [{ filled: { totalSz: b.action.orders[0].s, avgPx: b.action.orders[0].p, oid: 1 } }] } } }; return null; },
  onUserInfo: (b) => ({ maxBuilderFee: 25, extraAgents: agent ? [{ address: agent, name: "totum", validUntil: now + 1e9 }] : [], userAbstraction: "disabled", clearinghouseState: { marginSummary: { accountValue: "100", totalMarginUsed: "0" }, crossMarginSummary: { accountValue: "100" }, crossMaintenanceMarginUsed: "0", withdrawable: "100", assetPositions: [] }, spotClearinghouseState: { balances: [{ coin: "USDC", token: 0, total: "100", hold: "0", entryNtl: "0" }, ...(base ? [{ coin: base, token: 1, total: String(bal), hold: "0", entryNtl: "50" }] : [])] } })[b.type] ?? (["frontendOpenOrders", "openOrders", "userFunding", "historicalOrders", "userFills", "userFillsByTime"].includes(b.type) ? [] : undefined) };
const { page, errors } = await setupPage(browser, { width: 1440, height: 900 }, state);
await page.goto(URL0 + "/#trade"); await page.waitForTimeout(6000);
const pick = await page.evaluate(() => { const S = window.__totum.S; const m = S.spot.filter((x) => x.quote === "USDC" && x.szDecimals >= 2 && Number(S.ctx[x.name]?.midPx) > 1).sort((a, b) => Number(S.ctx[b.name]?.dayNtlVlm || 0) - Number(S.ctx[a.name]?.dayNtlVlm || 0))[0]; return m ? { name: m.name, base: m.base, d: m.szDecimals, px: Number(S.ctx[m.name].midPx) } : null; });
coin = pick.name; base = pick.base;
const k = 10 ** pick.d; bal = (Math.max(3, Math.round((80 / pick.px) * k)) - 0.4) / k; /* «после комиссии» — чуть меньше круглого числа */
await connect(page); await page.waitForTimeout(3000);
await page.evaluate((c) => window.__totum.switchCoin(c), coin); await page.waitForTimeout(3000);
R.ok("на спот-паре вкладка «Активы» вместо «Позиций»", (await page.isVisible('.b-tabs [data-b="spot"] .sp-spot')) && !(await page.isVisible('.b-tabs [data-b="pos"]')) && (await page.getAttribute('.b-tabs [data-b="spot"]', "class")).includes("on"));
await page.click('[data-sside="sell"]').catch(() => {}); await page.waitForTimeout(300);
await page.click('[data-pct="100"]').catch(async () => { await page.fill("#pct", "100"); await page.dispatchEvent("#pct", "input"); }); await page.waitForTimeout(400);
await page.click("#btnSell"); await page.waitForTimeout(700); await page.click("#cfOk").catch(() => {}); await page.waitForTimeout(2000);
console.log("TOAST", await page.evaluate(() => [...document.querySelectorAll(".toast")].map((t) => t.textContent).join(" | ")), "pct", await page.inputValue("#pct"), "size", await page.inputValue("#size"), "px", JSON.stringify(pick));
const o = state.exchange.filter((e) => e.action.type === "order").at(-1)?.action.orders[0];
R.ok(`продажа 100%: количество не больше баланса (${bal})`, o && Number(o.s) <= bal + 1e-12 && Number(o.s) > 0, `${pick.base} баланс ${bal} → заявка ${o?.s}`);
R.ok("без ошибок", errors.length === 0, errors.join(" | ").slice(0, 300));
await browser.close(); R.print();
