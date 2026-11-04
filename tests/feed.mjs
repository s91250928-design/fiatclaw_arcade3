// Лента: публикация без окна кошелька (подпись ключом для сделок), позиция, лайк, экранирование.
import { chromium, setupPage, connect, makeResults, URL0 } from "./harness.mjs";
import { verifyMessage } from "viem";
const R = makeResults(); const browser = await chromium.launch(); const now = Date.now();
let agent = null; const posts = []; const signsBefore = { n: 0 };
const state = { exchange: [], onExchange: (b) => { if (b.action.type === "approveAgent") agent = b.action.agentAddress; return null; },
  onUserInfo: (b) => ({ maxBuilderFee: 25, extraAgents: agent ? [{ address: agent, name: "totum", validUntil: now + 1e9 }] : [], userAbstraction: "disabled", clearinghouseState: { marginSummary: { accountValue: "100", totalMarginUsed: "0" }, crossMarginSummary: { accountValue: "100" }, crossMaintenanceMarginUsed: "0", withdrawable: "100", assetPositions: [{ position: { coin: "BTC", szi: "0.01", entryPx: "70000", positionValue: "700", unrealizedPnl: "42.5", returnOnEquity: "0.31", liquidationPx: "50000", marginUsed: "140", leverage: { type: "isolated", value: 5 }, cumFunding: { sinceOpen: "0" }, maxLeverage: 40 }, type: "oneWay" }] }, spotClearinghouseState: { balances: [] },
    userFills: [{ coin: "ETH", oid: 555, dir: "Close Long", sz: "1", px: "2400", closedPnl: "200", fee: "1", time: now - 864e5, side: "A", tid: 1, hash: "0x1" }] })[b.type] ?? (["frontendOpenOrders", "openOrders", "userFunding", "historicalOrders", "userFillsByTime"].includes(b.type) ? [] : undefined) };
const { page, errors } = await setupPage(browser, { width: 1440, height: 900 }, state);
let lastSig = null;
await page.route("**/api/feed**", async (r) => {
  const q = r.request();
  if (q.method() === "GET" && q.url().includes("u=")) return r.fulfill({ contentType: "application/json", body: JSON.stringify({ user: posts[0]?.user || "0x1", nick: state.nick || "", bio: state.bio || "", since: Date.now(), posts: posts.map((x) => ({ ...x, nick: state.nick })), count: posts.length, likes: 1 }) });
  if (q.method() === "GET") return r.fulfill({ contentType: "application/json", body: JSON.stringify({ posts: posts.map((x) => ({ ...x, nick: state.nick || "" })), more: false, myNick: state.nick || "" }) });
  const b = JSON.parse(q.postData()); lastSig = b;
  const okSig = await verifyMessage({ address: b.agent, message: `Totum feed\n${b.act}\n${b.user.toLowerCase()}\n${b.ts}\n${b.payload}`, signature: b.sig });
  if (!okSig) return r.fulfill({ status: 400, contentType: "application/json", body: '{"error":"подпись не сходится"}' });
  const p = JSON.parse(b.payload);
  if (b.act === "upload") { state.up = b; return r.fulfill({ contentType: "application/json", body: JSON.stringify({ k: "img", u: "/brand/howto.webp" }) }); }
  if (b.act === "post") { state.post = p; const pos = p.att?.kind === "closed" ? { kind: "closed", coin: "ETH", dir: "Close Long", sz: "1", px: "2400", entry: "2200", pnl: "199", roe: "0.09", at: Date.now() - 864e5 } : { kind: "open", coin: "BTC", szi: "0.01", entry: "70000", lev: 5, pnl: "42.5", roe: "0.31" }; const post = { id: "abc123def" + posts.length, user: b.user.toLowerCase(), text: p.text, ts: Date.now(), pos, media: p.media, likes: 0, liked: false }; posts.unshift(post); return r.fulfill({ contentType: "application/json", body: JSON.stringify({ post }) }); }
  if (b.act === "profile") { state.nick = p.nick; state.bio = p.bio; return r.fulfill({ contentType: "application/json", body: JSON.stringify({ nick: p.nick, bio: p.bio, since: Date.now() }) }); }
  if (b.act === "like") return r.fulfill({ contentType: "application/json", body: '{"likes":1,"liked":true}' });
  r.fulfill({ contentType: "application/json", body: '{"ok":true}' });
});
await page.goto(URL0 + "/#trade"); await page.waitForTimeout(5000);
await connect(page); await page.waitForTimeout(4000);
await page.click('[data-cp="feed"]'); await page.waitForTimeout(1500);
R.ok("пустая лента — приглашение написать", (await page.textContent("#feedList")).includes("пока пусто"));
const nSign = await page.evaluate(() => 0);
await page.click("#feedText"); await page.keyboard.type("Взял лонг <img src=x onerror=alert(1)>"); await page.keyboard.press("Shift+Enter"); await page.keyboard.type("вторая строка");
R.ok("текст печатается с клавиатуры", (await page.inputValue("#feedText")).includes("вторая строка"), await page.inputValue("#feedText")); await page.click("#feedPosBtn"); await page.waitForTimeout(600);
R.ok("выбор позиции: открытая BTC", (await page.textContent("#fpList")).includes("BTC"));
await page.click('[data-fpi="0"]'); await page.waitForTimeout(300);
R.ok("позиция приложена", (await page.textContent("#feedAtts")).includes("BTC"));
await page.click("#feedGo"); await page.waitForTimeout(1500);
R.ok("пост подписан ключом для сделок (не кошельком)", lastSig && lastSig.agent.toLowerCase() === String(agent).toLowerCase(), lastSig?.agent);
R.ok("пост появился", (await page.textContent("#feedList")).includes("Взял лонг"));
R.ok("HTML в тексте не выполняется", (await page.locator("#feedList img[src='x']").count()) === 0 && (await page.textContent(".fd-post p")).includes("<img"));
R.ok("позиция с отметкой Hyperliquid и PnL", (await page.textContent(".fd-pos")).includes("+31.0%") && (await page.isVisible(".fd-ok")));
await page.click(".fd-like"); await page.waitForTimeout(800);
R.ok("лайк", (await page.getAttribute(".fd-like", "class")).includes("on") && (await page.textContent(".fd-like span")) === "1");
// второй пост: закрытая сделка + фото
await page.waitForTimeout(500);
await page.click("#feedPosBtn"); await page.waitForTimeout(500); await page.click('[data-fp="closed"]'); await page.waitForTimeout(300);
R.ok("закрытые сделки из истории", (await page.textContent("#fpList")).includes("ETH"), await page.textContent("#fpList"));
await page.click('[data-fpi="0"]');
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
await page.setInputFiles("#feedFile", { name: "pnl.png", mimeType: "image/png", buffer: png }); await page.waitForTimeout(1500);
R.ok("фото сжато и загружено (WebP, подписано ключом)", state.up && JSON.parse(state.up.payload).type === "image/webp" && !!state.up.data, state.up?.payload);
await page.click("#feedGo"); await page.waitForTimeout(1500);
R.ok("в посте закрытая сделка и фото", state.post?.att?.kind === "closed" && state.post.att.oid === 555 && state.post.media?.length === 1, JSON.stringify(state.post));
R.ok("карточка «закрыта» и фото в ленте", (await page.textContent("#feedList")).includes("закрыта") && (await page.locator(".fd-media img").count()) === 1);
// профиль: задать ник
await page.click('[data-feed="me"]'); await page.waitForTimeout(700);
await page.fill("#pfNick", "btc_scalper"); await page.fill("#pfBio", "Скальпинг BTC"); await page.click("#pfSave"); await page.waitForTimeout(1500);
R.ok("ник сохранён и виден в профиле", state.nick === "btc_scalper" && (await page.textContent("#pfBody")).includes("btc_scalper"));
await page.locator("#profDlg").screenshot({ path: "tests/out-profile.png" });
await page.click('[data-pf="close"]'); await page.waitForTimeout(800);
R.ok("ник в ленте вместо адреса", (await page.textContent(".fd-au b")) === "btc_scalper", await page.textContent(".fd-au b"));
await page.locator("#paneFeed").screenshot({ path: "tests/out-feed.png" });
R.ok("без ошибок", errors.length === 0, errors.join(" | ").slice(0, 300));
await browser.close(); R.print();
