// Запись «Как начать» для лендинга: настоящий сайт на iPhone. Кошелёк и биржа — подставные
// (деньги не трогаются), цены и стакан — настоящие с Hyperliquid.
import pw from "/opt/npm-tools/node_modules/playwright/index.js";
import { privateKeyToAccount } from "viem/accounts";
import fs from "fs";
const OUT = process.argv[2] || "/tmp/claude-0/rec", SHOT = process.env.SHOT === "1";
const user = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
const now = Date.now(); let agent = null, filled = false, mid = 0;
const b = await pw.chromium.launch();
const ctx = await b.newContext({ ...pw.devices["iPhone 13"], deviceScaleFactor: 2, colorScheme: "dark" });
const p = await ctx.newPage();
await p.exposeFunction("__ethReq", async (method, params) => {
  if (method === "eth_requestAccounts" || method === "eth_accounts") return method === "eth_accounts" && !globalThis.__conn ? [] : ((globalThis.__conn = 1), [user.address]);
  if (method === "eth_chainId") return "0xa4b1";
  if (method === "eth_signTypedData_v4") { await new Promise((r) => setTimeout(r, 2400)); const td = JSON.parse(params[1]); const { EIP712Domain, ...types } = td.types; return user.signTypedData({ domain: td.domain, types, primaryType: td.primaryType, message: td.message }); }
  return null;
});
await p.addInitScript(() => {
  const prov = { request: ({ method, params }) => window.__ethReq(method, params), on() {}, removeListener() {} };
  const icon = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" rx="10" fill="#0b0b0b"/><g fill="#fff"><rect x="9" y="9" width="7" height="7" rx="1"/><rect x="24" y="9" width="7" height="7" rx="1"/><rect x="16.5" y="16.5" width="7" height="7" rx="1"/><rect x="9" y="24" width="7" height="7" rx="1"/><rect x="24" y="24" width="7" height="7" rx="1"/></g></svg>');
  const ann = () => window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: Object.freeze({ info: { uuid: "1", name: "OKX Wallet", icon, rdns: "com.okex.wallet" }, provider: prov }) }));
  window.addEventListener("eip6963:requestProvider", ann);
  try { localStorage.setItem("totum.consent", "1"); localStorage.setItem("totum.theme", "dark"); localStorage.removeItem("totum.conn"); } catch {}
  /* касание пальцем — видно на записи */
  addEventListener("pointerdown", (e) => { const d = document.createElement("i"); d.style.cssText = `position:fixed;z-index:99999;left:${e.clientX - 22}px;top:${e.clientY - 22}px;width:44px;height:44px;border-radius:50%;background:rgba(255,255,255,.35);border:2px solid rgba(255,255,255,.85);pointer-events:none;transition:transform .45s ease,opacity .45s ease`; document.body.appendChild(d); requestAnimationFrame(() => { d.style.transform = "scale(1.6)"; d.style.opacity = "0"; }); setTimeout(() => d.remove(), 600); }, true);
});
await p.route("**/config.js", (r) => r.fulfill({ contentType: "text/javascript", body: `window.TERM_CONFIG={isTestnet:false,builder:"0xa02a1872ebbf3a5d2f0d8b236ef16f0fe62b16d0",feeTenthBps:25};` }));
const pos = () => filled ? [{ position: { coin: "BTC", szi: "0.00319", entryPx: String(mid), positionValue: "250", unrealizedPnl: "0.21", returnOnEquity: "0.0021", liquidationPx: null, marginUsed: "250", leverage: { type: "isolated", value: 1 }, cumFunding: { sinceOpen: "0" }, maxLeverage: 40 }, type: "oneWay" }] : [];
const U = (t) => ({ maxBuilderFee: 25, extraAgents: agent ? [{ address: agent, name: "totum", validUntil: now + 1e9 }] : [], userAbstraction: "unifiedAccount", referral: { referredBy: null },
  clearinghouseState: { marginSummary: { accountValue: filled ? "1000.21" : "1000", totalMarginUsed: filled ? "100" : "0" }, crossMarginSummary: { accountValue: "1000" }, crossMaintenanceMarginUsed: "0", withdrawable: filled ? "900" : "1000", assetPositions: pos() },
  spotClearinghouseState: { balances: [{ coin: "USDC", token: 0, total: "1000", hold: filled ? "100" : "0", entryNtl: "0" }] } })[t];
await p.route("https://api.hyperliquid.xyz/**", async (r) => {
  const url = r.request().url(), body = JSON.parse(r.request().postData() || "{}");
  if (url.endsWith("/exchange")) {
    const a = body.action;
    if (a.type === "approveAgent") agent = a.agentAddress;
    if (a.type === "order") { filled = true; return r.fulfill({ contentType: "application/json", body: JSON.stringify({ status: "ok", response: { type: "order", data: { statuses: [{ filled: { totalSz: a.orders[0].s, avgPx: a.orders[0].p, oid: 7 } }] } } }) }); }
    return r.fulfill({ contentType: "application/json", body: JSON.stringify({ status: "ok", response: { type: "default" } }) });
  }
  if (body.user) { const v = U(body.type); if (v !== undefined) return r.fulfill({ contentType: "application/json", body: JSON.stringify(v) }); if (["frontendOpenOrders", "openOrders", "userFunding", "historicalOrders", "userFills", "userFillsByTime", "userNonFundingLedgerUpdates", "portfolio"].includes(body.type)) return r.fulfill({ contentType: "application/json", body: "[]" }); }
  return r.continue();
});
await p.goto("http://127.0.0.1:8765/trade"); await p.waitForTimeout(7000);
await p.evaluate(() => document.querySelector('#mnav [data-app="futures"]')?.click()); await p.waitForTimeout(2500);
mid = await p.evaluate(() => Math.round(Number(window.__totum?.S?.ctx?.BTC?.midPx || 78000)));
if (SHOT) { await p.screenshot({ path: OUT + "/s0.png" }); }
/* запись кадров (CDP screencast) */
const cdp = await ctx.newCDPSession(p); const frames = []; let t0 = 0, mark = [];
cdp.on("Page.screencastFrame", async (f) => { frames.push({ t: f.metadata.timestamp, d: f.data }); cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {}); });
const start = async () => { await cdp.send("Page.startScreencast", { format: "jpeg", quality: 88, everyNthFrame: 1 }); };
const tap = async (sel) => { const bb = await p.locator(sel).first().boundingBox(); await p.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await p.mouse.down(); await p.waitForTimeout(90); await p.mouse.up(); };
const stamp = (n) => mark.push({ n, t: Date.now() / 1e3 });
await start(); await p.waitForTimeout(400);
stamp(0); await p.waitForTimeout(700); await tap("#btnConnect"); await p.waitForTimeout(1100);
if (SHOT) await p.screenshot({ path: OUT + "/s1.png" });
await tap("#walletPick button, .wp-dlg button"); await p.waitForTimeout(900);
stamp(1); await p.waitForTimeout(700);
if (SHOT) await p.screenshot({ path: OUT + "/s1b.png" });
await p.waitForTimeout(1000);
if (SHOT) await p.screenshot({ path: OUT + "/s2.png" });
await p.waitForTimeout(1800);
stamp(2);
await p.evaluate(() => { const i = document.getElementById("size"); i && i.scrollIntoView({ block: "center" }); });
await p.waitForTimeout(500); await tap("#size"); await p.keyboard.press("Control+A"); await p.keyboard.press("Backspace"); await p.keyboard.type("250", { delay: 140 }); await p.waitForTimeout(500);
await tap("#btnBuy"); await p.waitForTimeout(500); await p.locator("#cfOk").click({ timeout: 800 }).catch(() => {}); await p.waitForTimeout(2600);
if (SHOT) await p.screenshot({ path: OUT + "/s3.png" });
stamp(3);
await cdp.send("Page.stopScreencast");
fs.mkdirSync(OUT + "/f", { recursive: true }); fs.readdirSync(OUT + "/f").forEach((x) => fs.unlinkSync(OUT + "/f/" + x));
const T0 = frames[0].t; let list = "";
frames.forEach((f, k) => { fs.writeFileSync(`${OUT}/f/${String(k).padStart(5, "0")}.jpg`, Buffer.from(f.d, "base64")); const dur = (frames[k + 1]?.t ?? f.t + 0.1) - f.t; list += `file '${OUT}/f/${String(k).padStart(5, "0")}.jpg'\nduration ${dur.toFixed(3)}\n`; });
fs.writeFileSync(OUT + "/list.txt", list);
fs.writeFileSync(OUT + "/marks.json", JSON.stringify(mark.map((m) => ({ n: m.n, t: +(m.t - T0).toFixed(2) }))));
console.log("кадров", frames.length, "длина", (frames.at(-1).t - T0).toFixed(1), "с", "метки", JSON.stringify(mark.map((m) => +(m.t - T0).toFixed(2))));
await b.close();
