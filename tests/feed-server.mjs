// Сервер ленты: подпись, позиции с Hyperliquid, картинки, лайки — с подставной базой и биржей.
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
process.env.STORAGE_KV_REST_API_URL = "http://kv"; process.env.STORAGE_KV_REST_API_TOKEN = "t"; /* другая приставка — сервер должен найти */
const db = new Map(), now = Date.now();
const user = privateKeyToAccount(generatePrivateKey()), agent = privateKeyToAccount(generatePrivateKey()), evil = privateKeyToAccount(generatePrivateKey());
const H = (k) => db.get(k) || {}, L = (k) => db.get(k) || [], St = (k) => db.get(k) || new Set();
const run = ([op, k, ...a]) => { switch (op) {
  case "LRANGE": return L(k).slice(+a[0], +a[1] + 1); case "MGET": return [k, ...a].map((x) => db.get(x) ?? null);
  case "HMGET": return a.map((f) => H(k)[f] ?? null); case "SMISMEMBER": return a.map((x) => (St(k).has(x) ? 1 : 0));
  case "SET": if (a.includes("NX") && db.has(k)) return null; db.set(k, a[0]); return "OK"; case "GET": return db.get(k) ?? null;
  case "LPUSH": db.set(k, [a[0], ...L(k)]); return 1; case "LTRIM": return "OK"; case "INCR": { const v = (Number(db.get(k)) || 0) + 1; db.set(k, v); return v; } case "EXPIRE": return 1;
  case "SADD": { const s = St(k), had = s.has(a[0]); s.add(a[0]); db.set(k, s); return had ? 0 : 1; } case "SREM": { const s = St(k); s.delete(a[0]); return 1; }
  case "HINCRBY": { const h = H(k); h[a[0]] = (Number(h[a[0]]) || 0) + Number(a[1]); db.set(k, h); return h[a[0]]; } case "HDEL": { const h = H(k); delete h[a[0]]; return 1; }
  case "DEL": db.delete(k); return 1; case "LREM": db.set(k, L(k).filter((x) => x !== a[1])); return 1; } };
globalThis.fetch = async (url, o = {}) => { const b = JSON.parse(o.body || "{}"); const j = (x) => new Response(JSON.stringify(x), { status: 200, headers: { "content-type": "application/json" } });
  if (String(url).startsWith("http://kv")) return j(b.map((c) => ({ result: run(c) })));
  if (b.type === "extraAgents") return j(b.user.toLowerCase() === user.address.toLowerCase() ? [{ name: "totum ab", address: agent.address, validUntil: now + 1e9 }] : []);
  if (b.type === "userFillsByTime") return j([{ coin: "ETH", oid: 555, dir: "Close Long", sz: "0.5", px: "2400", closedPnl: "100", fee: "0.5", time: now - 864e5 }, { coin: "ETH", oid: 555, dir: "Close Long", sz: "0.5", px: "2400", closedPnl: "100", fee: "0.5", time: now - 864e5 }]);
  return j(null); };
const { default: h } = await import("../deploy/api/feed.mjs");
const call = async (method, body, url = "/api/feed") => { let out, code, raw; await h({ method, url, body }, { setHeader() {}, status(c) { code = c; return this; }, send(s) { raw = s; try { out = JSON.parse(s); } catch { out = {}; } } }); return { code, raw, ...out }; };
const sign = async (acc, act, payload, extra = {}) => { const ts = Date.now(); return { user: user.address, agent: acc.address, ts, act, payload, ...extra, sig: await acc.signMessage({ message: `Totum feed\n${act}\n${user.address.toLowerCase()}\n${ts}\n${payload}` }) }; };
const ok = (n, c, x = "") => console.log(`${c ? "PASS" : "FAIL"} ${n} ${x}`);
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
let r = await call("POST", await sign(agent, "upload", JSON.stringify({ size: png.length, type: "image/png" }), { data: png.toString("base64") }));
ok("картинка загружена в базу", r.code === 200 && r.k === "img" && /^\/api\/feed\?m=/.test(r.u), r.u || r.error);
const img = await call("GET", null, r.u); ok("картинка отдаётся", img.code === 200 && img.raw.length === png.length);
const bad = await call("POST", await sign(agent, "upload", JSON.stringify({ size: 999, type: "image/png" }), { data: png.toString("base64") })); ok("размер не совпал с подписью — отказ", bad.code === 400);
const v = await call("POST", await sign(agent, "upload", JSON.stringify({ size: 3, type: "video/mp4" }), { data: Buffer.from("abc").toString("base64") })); ok("видео без хранилища — понятный отказ", v.code === 400 && /хранилище/.test(v.error), v.error);
r = await call("POST", await sign(agent, "post", JSON.stringify({ text: "", att: { kind: "closed", oid: 555 }, media: [{ k: "img", u: r.u }, { k: "img", u: "https://evil.com/x.png" }] })));
ok("пост с закрытой сделкой: PnL с Hyperliquid", r.code === 200 && r.post.pos.kind === "closed" && Number(r.post.pos.pnl) === 199 && r.post.pos.coin === "ETH", JSON.stringify(r.post?.pos));
ok("чужие ссылки на картинки отброшены", r.post?.media.length === 1);
const id = r.post.id;
r = await call("POST", await sign(agent, "like", JSON.stringify({ id }))); ok("лайк", r.likes === 1 && r.liked);
r = await call("GET", null, `/api/feed?me=${user.address}`); ok("лента: 1 лайк, «я лайкнул»", r.posts[0].likes === 1 && r.posts[0].liked === true);
r = await call("POST", await sign(agent, "like", JSON.stringify({ id }))); ok("снять лайк", r.likes === 0 && !r.liked);
r = await call("POST", await sign(evil, "post", JSON.stringify({ text: "подделка" }))); ok("чужой ключ — отказ", r.code === 400);
