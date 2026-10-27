// Отметки сделок на графике и итог «Ваши активы» в едином счёте.
import { chromium, setupPage, connect, makeResults, URL0 } from "./harness.mjs";
const R = makeResults();
const browser = await chromium.launch();
const now = Date.now();
let agent = null, pxNow = 0;
const state = { exchange: [] };
state.onExchange = (b) => { if (b.action.type === "approveAgent") agent = b.action.agentAddress; return null; };
state.onUserInfo = (b) => {
  switch (b.type) {
    case "maxBuilderFee": return 25;
    case "extraAgents": return agent ? [{ address: agent, name: "totum", validUntil: now + 1e9 }] : [];
    case "userAbstraction": return "unifiedAccount";
    case "clearinghouseState": return { marginSummary: { accountValue: "727.71", totalMarginUsed: "0" }, crossMarginSummary: { accountValue: "727.71" }, crossMaintenanceMarginUsed: "0", withdrawable: "727.71", assetPositions: [] };
    case "spotClearinghouseState": return { balances: [{ coin: "USDC", token: 0, total: "727.71", hold: "0", entryNtl: "0" }] };
    case "userFills": return [
      { coin: "BTC", px: String(pxNow * 1.002), sz: "0.05", side: "A", dir: "Open Short", time: now - 3 * 36e5, closedPnl: "0", fee: "0.1", feeToken: "USDC", oid: 1, tid: 1 },
      { coin: "BTC", px: String(pxNow * 0.998), sz: "0.03", side: "B", dir: "Close Short", time: now - 36e5, closedPnl: "3", fee: "0.1", feeToken: "USDC", oid: 2, tid: 2 },
      { coin: "BTC", px: String(pxNow * 0.998), sz: "0.02", side: "B", dir: "Close Short", time: now - 36e5 + 1000, closedPnl: "2", fee: "0.1", feeToken: "USDC", oid: 2, tid: 3 },
      { coin: "ETH", px: "3000", sz: "1", side: "B", dir: "Open Long", time: now - 36e5, closedPnl: "0", fee: "0.1", feeToken: "USDC", oid: 3, tid: 4 },
    ];
    case "frontendOpenOrders": case "openOrders": case "userFunding": case "historicalOrders": return [];
  }
};
for (const vp of [{ width: 1440, height: 900, name: "desktop" }, { width: 390, height: 844, name: "mobile" }]) {
  agent = null;
  const { page, errors } = await setupPage(browser, vp, state);
  await page.goto(URL0 + "/#trade"); await page.waitForTimeout(5000);
  pxNow = await page.evaluate(() => Number(window.__totum.S.ctx.BTC?.markPx || 80000));
  await connect(page);
  if (await page.isVisible("#btnEnable")) { await page.check("#consent").catch(() => {}); await page.click("#btnEnable"); await page.waitForTimeout(3000); }
  await page.waitForTimeout(3000);
  const marks = await page.evaluate(() => window.__totum.marks?.() || null);
  if (vp.name === "desktop") {
    R.ok("на графике 2 отметки BTC (сделки ETH не попали, части одной сделки объединены)", marks?.length === 2, JSON.stringify(marks?.map((m) => m.text)));
    R.ok("продажа — красная стрелка вниз над ценой: «Sell · Шорт»", marks?.[0]?.shape === "arrowDown" && marks[0].text === "Sell · Шорт");
    R.ok("покупка — зелёная стрелка вверх под ценой: «Buy · Закрыл шорт»", marks?.[1]?.shape === "arrowUp" && marks[1].text === "Buy · Закрыл шорт");
    await page.evaluate(() => window.__totum.S && document.querySelector(".chart-wrap"));
    await page.locator("#paneChart").screenshot({ path: "tests/out-marks.png" });
  } else {
    await page.click("#mnav [data-app=home]"); await page.waitForTimeout(1200);
    const sum = await page.textContent("#pgHome .hc-sum"), sub = await page.textContent("#pgHome .hc-sub");
    R.ok("главная: единый счёт не удваивается", /727,71/.test(sum) && !/1\s?455/.test(sum), `${sum} | ${sub}`);
    await page.locator("#pgHome .hero-card").screenshot({ path: "tests/out-home-sum.png" });
  }
  R.ok(`[${vp.name}] без ошибок`, errors.length === 0, errors.join(" | ").slice(0, 300));
  await page.close();
}
await browser.close(); R.print();
