// «Твоя доля в Totum»: половина комиссии Totum, открытие за 12 месяцев, при ликвидации — сразу.
import { chromium, setupPage, connect, makeResults, URL0 } from "./harness.mjs";
const R = makeResults(); const browser = await chromium.launch(); const now = Date.now(), D = 864e5;
let agent = null;
const fill = (t, fee, extra = {}) => ({ coin: "BTC", px: "77000", sz: "0.01", side: "B", time: t, dir: "Open Long", closedPnl: "0", hash: "0x", oid: 1, crossed: true, fee: "0.5", builderFee: String(fee), tid: t, feeToken: "USDC", cloid: "0x746f74756d00112233445566778899aa", ...extra });
let fills = [fill(now - 73 * D, 2), fill(now - 10 * D, 4, { cloid: "0xdeadbeef00112233445566778899aabb" }), fill(now - 2 * D, 1)];
const state = { exchange: [] };
state.onExchange = (b) => { if (b.action.type === "approveAgent") agent = b.action.agentAddress; return null; };
state.onUserInfo = (b) => {
  switch (b.type) {
    case "maxBuilderFee": return 25;
    case "extraAgents": return agent ? [{ address: agent, name: "totum", validUntil: now + 1e9 }] : [];
    case "userAbstraction": return "default";
    case "userFillsByTime": return fills;
    case "clearinghouseState": return { marginSummary: { accountValue: "1000", totalMarginUsed: "0" }, crossMarginSummary: { accountValue: "1000" }, crossMaintenanceMarginUsed: "0", withdrawable: "1000", assetPositions: [] };
    case "spotClearinghouseState": return { balances: [{ coin: "USDC", token: 0, total: "1000", hold: "0", entryNtl: "0" }] };
    case "frontendOpenOrders": case "openOrders": case "userFunding": case "historicalOrders": case "userFills": return [];
  }
};
const { page, errors } = await setupPage(browser, { width: 390, height: 844 }, state);
await page.goto(URL0 + "/#trade"); await page.waitForTimeout(5000);
await page.evaluate(() => document.getElementById("btnConnect").click()); await page.waitForTimeout(4000);
await page.evaluate(() => document.querySelector('#mnav [data-app="assets"]').click()); await page.waitForTimeout(3000);
let t = (await page.textContent(".rw-card")).replace(/\s+/g, " ");
// свои сделки Totum: 2 + 1 = $3 комиссии → начислено $1,50; чужая (другой cloid) не считается
// открыто: 1·73/365 + 0,5·2/365 = 0,2 + 0,00274 ≈ $0,2027
R.ok("начислено — половина своей комиссии Totum ($1,50), чужие сделки не считаются", /Начислено\$1,50/.test(t), t.slice(0, 160));
R.ok("открыто по стажу ≈ $0,20", /Открыто\$0,2027/.test(t), t.slice(0, 160));
// ликвидация после этих сделок → всё накопленное открыто сразу
fills = [...fills, fill(now - 1 * D, 0, { cloid: null, liquidation: { liquidatedUser: "x", markPx: "70000", method: "market" } })];
await page.evaluate(() => window.__totum.S && 0);
await page.evaluate(() => document.querySelector('#mnav [data-app="home"]').click()); await page.waitForTimeout(500);
await page.evaluate(() => (window.__rwForce = 1));
await page.waitForTimeout(61000);
await page.evaluate(() => document.querySelector('#mnav [data-app="assets"]').click()); await page.waitForTimeout(3000);
t = (await page.textContent(".rw-card")).replace(/\s+/g, " ");
R.ok("после ликвидации всё накопленное открыто сразу ($1,50)", /Открыто\$1,50/.test(t) && /ликвидации/.test(t), t.slice(0, 220));
await page.locator(".rw-card").screenshot({ path: "tests/out-reward.png" });
R.ok("без ошибок", errors.length === 0, errors.join(" | ").slice(0, 300));
await browser.close(); R.print();
