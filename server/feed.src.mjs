// Лента трейдеров Totum. Пост подписан ключом для сделок (без окна кошелька):
// сервер проверяет подпись и что этот ключ на Hyperliquid выдан именно этим кошельком.
// К посту можно приложить позицию — её цифры сервер берёт с Hyperliquid сам, подделать нельзя.
// База — Upstash Redis (Vercel → Storage), переменные KV_REST_API_URL / KV_REST_API_TOKEN.
import { verifyMessage, getAddress } from "viem";

const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const ADMIN = "0xa02a1872ebbf3a5d2f0d8b236ef16f0fe62b16d0"; /* может удалять посты */
const HL = "https://api.hyperliquid.xyz/info";
const MAX = 600, PAGE = 30, KEEP = 3000, GAP = 20; /* символов, постов на страницу, хранить, секунд между постами */

const isAddr = (a) => /^0x[0-9a-fA-F]{40}$/.test(a || "");
async function redis(cmds) {
  const r = await fetch(`${URL_}/pipeline`, { method: "POST", headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" }, body: JSON.stringify(cmds) });
  if (!r.ok) throw new Error(`база ${r.status}`);
  return (await r.json()).map((x) => x.result);
}
const hl = (b) => fetch(HL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) }).then((r) => (r.ok ? r.json() : null));

/* подпись: ключ для сделок подписал сообщение, и Hyperliquid подтверждает, что ключ — этого кошелька */
async function checkAuth(b) {
  const { user, agent, ts, sig, act } = b;
  if (!isAddr(user) || !isAddr(agent) || !sig) throw new Error("нет подписи");
  if (Math.abs(Date.now() - Number(ts)) > 5 * 6e4) throw new Error("подпись устарела — обновите страницу");
  const msg = `Totum feed\n${act}\n${user.toLowerCase()}\n${ts}\n${b.payload || ""}`;
  if (!(await verifyMessage({ address: getAddress(agent), message: msg, signature: sig }))) throw new Error("подпись не сходится");
  const ags = (await hl({ type: "extraAgents", user })) || [];
  const ok = ags.some((a) => a.address?.toLowerCase() === agent.toLowerCase() && (!a.validUntil || a.validUntil > Date.now()));
  if (!ok) throw new Error("ключ для сделок не найден у этого кошелька — включите торговлю заново");
  return user.toLowerCase();
}

/* позиция для поста — с Hyperliquid, а не из текста */
async function position(user, coin) {
  if (!coin || !/^[A-Za-z0-9:@._-]{1,30}$/.test(coin)) return null;
  const dex = coin.includes(":") ? coin.split(":")[0] : "";
  const st = await hl({ type: "clearinghouseState", user, ...(dex ? { dex } : {}) });
  const p = (st?.assetPositions || []).map((x) => x.position).find((x) => x.coin === coin);
  if (!p) return null;
  return { coin, szi: p.szi, entry: p.entryPx, lev: p.leverage?.value, pnl: p.unrealizedPnl, roe: p.returnOnEquity, at: Date.now() };
}

const clean = (t) => String(t || "").replace(/\r/g, "").replace(/[\u0000-\u0008\u000b-\u001f]/g, "").replace(/\n{3,}/g, "\n\n").trim().slice(0, MAX);

export default async function handler(req, res) {
  const send = (c, o) => { res.setHeader("content-type", "application/json; charset=utf-8"); res.setHeader("cache-control", "no-store"); res.status(c).send(JSON.stringify(o)); };
  if (!URL_ || !TOKEN) return send(503, { error: "nodb" });
  try {
    if (req.method === "GET") {
      const q = new URL(req.url, "http://x").searchParams, from = Math.max(0, Number(q.get("from")) || 0), me = (q.get("me") || "").toLowerCase();
      const [ids] = await redis([["LRANGE", "feed:ids", String(from), String(from + PAGE - 1)]]);
      if (!ids?.length) return send(200, { posts: [], more: false });
      const r = await redis([["MGET", ...ids.map((id) => `feed:p:${id}`)], ...ids.map((id) => ["SCARD", `feed:l:${id}`]), ...(isAddr(me) ? ids.map((id) => ["SISMEMBER", `feed:l:${id}`, me]) : [])]);
      const posts = r[0].map((j, k) => {
        if (!j) return null;
        const p = JSON.parse(j);
        return { ...p, likes: r[1 + k] || 0, liked: isAddr(me) ? !!r[1 + ids.length + k] : false };
      }).filter(Boolean);
      return send(200, { posts, more: ids.length === PAGE });
    }
    if (req.method !== "POST") return send(405, { error: "method" });
    const b = typeof req.body === "object" && req.body ? req.body : JSON.parse(req.body || "{}");
    const user = await checkAuth(b);
    if (b.act === "post") {
      const p = JSON.parse(b.payload || "{}"), text = clean(p.text);
      if (text.length < 2) return send(400, { error: "Пустой пост" });
      const [free] = await redis([["SET", `feed:rl:${user}`, "1", "NX", "EX", String(GAP)]]);
      if (free !== "OK") return send(429, { error: `Не чаще одного поста в ${GAP} секунд` });
      const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
      const post = { id, user, text, ts: Date.now(), pos: await position(user, p.coin).catch(() => null) };
      await redis([["SET", `feed:p:${id}`, JSON.stringify(post)], ["LPUSH", "feed:ids", id], ["LTRIM", "feed:ids", "0", String(KEEP - 1)]]);
      return send(200, { post: { ...post, likes: 0, liked: false } });
    }
    if (b.act === "like") {
      const id = String(JSON.parse(b.payload || "{}").id || "");
      if (!/^[a-z0-9]{6,20}$/.test(id)) return send(400, { error: "id" });
      const [had] = await redis([["SISMEMBER", `feed:l:${id}`, user]]);
      const [, n] = await redis([[had ? "SREM" : "SADD", `feed:l:${id}`, user], ["SCARD", `feed:l:${id}`]]);
      return send(200, { likes: n, liked: !had });
    }
    if (b.act === "delete") {
      const id = String(JSON.parse(b.payload || "{}").id || "");
      const [j] = await redis([["GET", `feed:p:${id}`]]);
      if (!j) return send(404, { error: "нет поста" });
      if (JSON.parse(j).user !== user && user !== ADMIN) return send(403, { error: "можно удалить только свой пост" });
      await redis([["DEL", `feed:p:${id}`, `feed:l:${id}`], ["LREM", "feed:ids", "0", id]]);
      return send(200, { ok: true });
    }
    send(400, { error: "act" });
  } catch (e) {
    send(400, { error: String(e?.message || e).slice(0, 200) });
  }
}
