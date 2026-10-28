// Главная на телефоне: кнопки под балансом.
import { chromium, setupPage, connect, makeResults, URL0 } from "./harness.mjs";
const R = makeResults(); const browser = await chromium.launch(); const now = Date.now(); let agent = null;
const state = { exchange: [], onExchange: (b) => { if (b.action.type === "approveAgent") agent = b.action.agentAddress; return null; },
  onUserInfo: (b) => { switch (b.type) { case "maxBuilderFee": return 25; case "extraAgents": return agent ? [{ address: agent, name: "totum", validUntil: now + 1e9 }] : [];
    case "userAbstraction": return "unifiedAccount"; case "clearinghouseState": return { marginSummary: { accountValue: "0", totalMarginUsed: "0" }, crossMarginSummary: { accountValue: "0" }, crossMaintenanceMarginUsed: "0", withdrawable: "0", assetPositions: [] };
    case "spotClearinghouseState": return { balances: [{ coin: "USDC", token: 0, total: "710.67", hold: "0", entryNtl: "0" }] };
    case "frontendOpenOrders": case "openOrders": case "userFunding": case "historicalOrders": case "userFills": return []; } } };
for (const theme of ["dark", "light"]) {
  const { page, errors } = await setupPage(browser, { width: 390, height: 844 }, state, { theme });
  await page.addInitScript((t) => localStorage.setItem("totum.theme", t), theme);
  await page.goto(URL0 + "/#trade"); await page.waitForTimeout(5000); await connect(page); await page.waitForTimeout(4000);
  await page.click("#mnav [data-app=home]"); await page.waitForTimeout(1200);
  const n = await page.locator("#pgHome .quick button:visible").count();
  R.ok(`[${theme}] 4 кнопки во всю ширину, кнопки в карточке баланса`, n === 4 && (await page.isVisible("#pgHome .hc-cta [data-act=deposit]")));
  await page.screenshot({ path: `tests/out-home-${theme}.png` });
  await page.click("#pgHome .quick [data-act=assets]"); await page.waitForTimeout(600);
  R.ok(`[${theme}] «Активы» открывает раздел активов`, (await page.evaluate(() => document.body.dataset.app)) === "assets");
  R.ok(`[${theme}] без ошибок`, errors.length === 0, errors.join(" | ").slice(0, 200));
  await page.close();
}
await browser.close(); R.print();
