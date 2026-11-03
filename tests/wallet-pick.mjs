// Выбор кошелька: несколько расширений в браузере + вариант «QR-код». Выбор запоминается.
import { chromium, setupPage, makeResults, URL0, BUILDER } from "./harness.mjs";
const R = makeResults(); const browser = await chromium.launch(); const now = Date.now();
let agent = null;
const state = { exchange: [], onExchange: (b) => { if (b.action.type === "approveAgent") agent = b.action.agentAddress; return null; },
  onUserInfo: (b) => ({ maxBuilderFee: 25, extraAgents: agent ? [{ address: agent, name: "totum", validUntil: now + 1e9 }] : [], userAbstraction: "default", clearinghouseState: { marginSummary: { accountValue: "1000", totalMarginUsed: "0" }, crossMarginSummary: { accountValue: "1000" }, crossMaintenanceMarginUsed: "0", withdrawable: "1000", assetPositions: [] }, spotClearinghouseState: { balances: [] } })[b.type] ?? (["frontendOpenOrders", "openOrders", "userFunding", "historicalOrders", "userFills", "userFillsByTime"].includes(b.type) ? [] : undefined) };
const { page, errors } = await setupPage(browser, { width: 1440, height: 900 }, state);
await page.route("**/config.js", (r) => r.fulfill({ contentType: "text/javascript", body: `window.TERM_CONFIG={isTestnet:true,builder:"${BUILDER}",feeTenthBps:25,walletConnectProjectId:"x"};` }));
await page.addInitScript(() => {
  const good = window.ethereum, bad = { request: async () => { throw new Error("Unexpected error"); }, on() {} };
  window.ethereum = bad; /* «захвативший» window.ethereum кошелёк ломается — как у пользователя */
  const ann = (p, name, rdns) => window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: { info: { uuid: rdns, name, rdns, icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'/>" }, provider: p } }));
  window.addEventListener("eip6963:requestProvider", () => { ann(bad, "Phantom", "app.phantom"); ann(good, "OKX Wallet", "com.okex.wallet"); });
});
await page.goto(URL0 + "/#trade"); await page.waitForTimeout(5000);
await page.click("#btnConnect"); await page.waitForTimeout(600);
const items = await page.locator("#walletPick button").allTextContents();
R.ok("выбор: найденные кошельки и «QR-код»", items.some((t) => /OKX/.test(t)) && items.some((t) => /Phantom/.test(t)) && items.some((t) => /QR/.test(t)), items.join(" | "));
await page.click("#walletPick button:has-text('OKX Wallet')"); await page.waitForTimeout(5000);
R.ok("через OKX подключился и включил торговлю", await page.evaluate(() => document.body.classList.contains("ready")));
await page.reload(); await page.waitForTimeout(7000);
R.ok("после обновления — снова OKX, сам, без выбора", await page.evaluate(() => document.body.classList.contains("connected")) && !(await page.isVisible("#walletPick")));
R.ok("без ошибок", errors.length === 0, errors.join(" | ").slice(0, 300));
await browser.close(); R.print();
