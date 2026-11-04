// Лента: публикация без окна кошелька (подпись ключом для сделок), позиция, лайк, экранирование.
import { chromium, setupPage, connect, makeResults, URL0 } from "./harness.mjs";
import { verifyMessage } from "viem";
const R = makeResults(); const browser = await chromium.launch(); const now = Date.now();
let agent = null; const posts = []; const signsBefore = { n: 0 };
const state = { exchange: [], onExchange: (b) => { if (b.action.type === "approveAgent") agent = b.action.agentAddress; return null; },
  onUserInfo: (b) => ({ maxBuilderFee: 25, extraAgents: agent ? [{ address: agent, name: "totum", validUntil: now + 1e9 }] : [], userAbstraction: "disabled", clearinghouseState: { marginSummary: { accountValue: "100", totalMarginUsed: "0" }, crossMarginSummary: { accountValue: "100" }, crossMaintenanceMarginUsed: "0", withdrawable: "100", assetPositions: [] }, spotClearinghouseState: { balances: [] } })[b.type] ?? (["frontendOpenOrders", "openOrders", "userFunding", "historicalOrders", "userFills", "userFillsByTime"].includes(b.type) ? [] : undefined) };
const { page, errors } = await setupPage(browser, { width: 1440, height: 900 }, state);
let lastSig = null;
await page.route("**/api/feed**", async (r) => {
  const q = r.request();
  if (q.method() === "GET") return r.fulfill({ contentType: "application/json", body: JSON.stringify({ posts, more: false }) });
  const b = JSON.parse(q.postData()); lastSig = b;
  const okSig = await verifyMessage({ address: b.agent, message: `Totum feed\n${b.act}\n${b.user.toLowerCase()}\n${b.ts}\n${b.payload}`, signature: b.sig });
  if (!okSig) return r.fulfill({ status: 400, contentType: "application/json", body: '{"error":"подпись не сходится"}' });
  const p = JSON.parse(b.payload);
  if (b.act === "post") { const post = { id: "abc123def", user: b.user.toLowerCase(), text: p.text, ts: Date.now(), pos: { coin: "BTC", szi: "0.01", entry: "70000", lev: 5, pnl: "42.5", roe: "0.31" }, likes: 0, liked: false }; posts.unshift(post); return r.fulfill({ contentType: "application/json", body: JSON.stringify({ post }) }); }
  if (b.act === "like") return r.fulfill({ contentType: "application/json", body: '{"likes":1,"liked":true}' });
  r.fulfill({ contentType: "application/json", body: '{"ok":true}' });
});
await page.goto(URL0 + "/#trade"); await page.waitForTimeout(5000);
await connect(page); await page.waitForTimeout(4000);
await page.click('[data-cp="feed"]'); await page.waitForTimeout(1500);
R.ok("пустая лента — приглашение написать", (await page.textContent("#feedList")).includes("пока пусто"));
const nSign = await page.evaluate(() => 0);
await page.fill("#feedText", "Взял лонг <img src=x onerror=alert(1)> 🚀\nвторая строка"); await page.click("#feedGo"); await page.waitForTimeout(1500);
R.ok("пост подписан ключом для сделок (не кошельком)", lastSig && lastSig.agent.toLowerCase() === String(agent).toLowerCase(), lastSig?.agent);
R.ok("пост появился", (await page.textContent("#feedList")).includes("Взял лонг"));
R.ok("HTML в тексте не выполняется", (await page.locator("#feedList img[src='x']").count()) === 0 && (await page.textContent(".fd-post p")).includes("<img"));
R.ok("позиция с отметкой Hyperliquid и PnL", (await page.textContent(".fd-pos")).includes("+31.0%") && (await page.isVisible(".fd-ok")));
await page.click(".fd-like"); await page.waitForTimeout(800);
R.ok("лайк", (await page.getAttribute(".fd-like", "class")).includes("on") && (await page.textContent(".fd-like span")) === "1");
await page.locator("#paneFeed").screenshot({ path: "tests/out-feed.png" });
R.ok("без ошибок", errors.length === 0, errors.join(" | ").slice(0, 300));
await browser.close(); R.print();
