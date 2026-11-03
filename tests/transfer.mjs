// Перевод фьючерсы → спот: окно, подпись кошелька, запрос на биржу.
import { chromium, setupPage, connect, makeResults, URL0 } from "./harness.mjs";
const R = makeResults(); const browser = await chromium.launch(); const now = Date.now();
let agent = null; const signs = [];
const state = { exchange: [], onExchange: (b) => { if (b.action.type === "approveAgent") agent = b.action.agentAddress; return null; },
  onUserInfo: (b) => ({ maxBuilderFee: 25, extraAgents: agent ? [{ address: agent, name: "totum", validUntil: now + 1e9 }] : [], userAbstraction: "disabled", clearinghouseState: { marginSummary: { accountValue: "100", totalMarginUsed: "0" }, crossMarginSummary: { accountValue: "100" }, crossMaintenanceMarginUsed: "0", withdrawable: "100", assetPositions: [] }, spotClearinghouseState: { balances: [{ coin: "USDC", token: 0, total: "5", hold: "0", entryNtl: "0" }] } })[b.type] ?? (["frontendOpenOrders", "openOrders", "userFunding", "historicalOrders", "userFills", "userFillsByTime"].includes(b.type) ? [] : undefined) };
const { page, errors } = await setupPage(browser, { width: 390, height: 844 }, state);
await page.goto(URL0 + "/#trade"); await page.waitForTimeout(5000);
await page.evaluate(() => document.getElementById("btnConnect").click()); await page.waitForTimeout(4000);
const n0 = state.exchange.length;
await page.evaluate(() => document.querySelector('#mnav [data-app="assets"]').click()); await page.waitForTimeout(1500);
await page.evaluate(() => document.querySelector('#pgAssets [data-act="transfer"]').click()); await page.waitForTimeout(500);
await page.fill("#trAmt", "3"); await page.click("#trGo"); await page.waitForTimeout(3000);
console.log("TOAST", await page.evaluate(() => [...document.querySelectorAll(".toast")].map((t) => t.textContent).join(" | ")), "ACT", state.exchange.slice(n0).map((e) => e.action.type).join());
const tr = state.exchange.slice(n0).find((e) => e.action.type === "usdClassTransfer");
R.ok("перевод ушёл на биржу с подписью кошелька", !!tr && tr.action.toPerp === false && tr.action.amount === "3" && !!tr.signature, JSON.stringify(tr?.action));
await page.evaluate(() => document.querySelector('#pgAssets [data-act="transfer"]').click()); await page.waitForTimeout(400);
const lab0 = await page.textContent("#trFrom"); await page.click("#trSwap"); await page.waitForTimeout(200);
const lab1 = [await page.textContent("#trFrom"), await page.textContent("#trTo")];
await page.screenshot({ path: "tests/out-transfer.png" });
R.ok("одна кнопка меняет направление", lab0 === "Фьючерсы" && lab1[0] === "Спот" && lab1[1] === "Фьючерсы" && (await page.textContent("#trInfo")).includes("На споте"), JSON.stringify([lab0, ...lab1]));
// кошелёк отказал — на экране настоящая причина, а не «Failed to sign…»
state.signFail = "Request timed out in OKX Wallet";
await page.fill("#trAmt", "1"); await page.click("#trGo"); await page.waitForTimeout(2500);
const tx = await page.evaluate(() => [...document.querySelectorAll(".toast")].map((t) => t.textContent).join(" | "));
R.ok("ошибка кошелька — понятным текстом", /Кошелёк не подписал запрос/.test(tx) && /OKX/.test(tx), tx.slice(-200));
R.ok("без ошибок", errors.length === 0, errors.join(" | ").slice(0, 300));
await browser.close(); R.print();
