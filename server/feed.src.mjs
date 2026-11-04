// Лента трейдеров Totum. Пост подписан ключом для сделок (без окна кошелька):
// сервер проверяет подпись и что этот ключ на Hyperliquid выдан именно этим кошельком.
// Позицию к посту (открытую или закрытую сделку) сервер берёт с Hyperliquid сам — подделать нельзя.
// База — Upstash Redis (Vercel → Storage). Фото хранятся в той же базе (сжатые, до 600 КБ),
// видео — в Vercel Blob, если он подключён (переменная BLOB_READ_WRITE_TOKEN).
import { verifyMessage, getAddress } from "viem";
import { put } from "@vercel/blob";

/* ключи базы: Vercel называет их по приставке, которую выбрали при подключении */
const envBy = (end) => process.env[`KV_${end}`] || process.env[`UPSTASH_REDIS_${end.replace("REST_API_", "REST_")}`] || Object.entries(process.env).find(([k]) => k.endsWith(`_${end}`) && !k.includes("READ_ONLY"))?.[1];
const URL_ = envBy("REST_API_URL"), TOKEN = envBy("REST_API_TOKEN");
const BLOB = process.env.BLOB_READ_WRITE_TOKEN || Object.entries(process.env).find(([k]) => k.endsWith("BLOB_READ_WRITE_TOKEN"))?.[1];
const ADMIN = "0xa02a1872ebbf3a5d2f0d8b236ef16f0fe62b16d0"; /* может удалять посты */
const HL = "https://api.hyperliquid.xyz/info";
const MAX = 600, PAGE = 30, KEEP = 3000, GAP = 20, IMG_MAX = 600e3, VID_MAX = 3.2e6;

const isAddr = (a) => /^0x[0-9a-fA-F]{40}$/.test(a || "");
async function redis(cmds) {
  const r = await fetch(`${URL_}/pipeline`, { method: "POST", headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" }, body: JSON.stringify(cmds) });
  if (!r.ok) throw new Error(`база ${r.status}`);
  return (await r.json()).map((x) => x.result);
}
const hl = (b) => fetch(HL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) }).then((r) => (r.ok ? r.json() : null));

async function checkAuth(b) {
  const { user, agent, ts, sig, act } = b;
  if (!isAddr(user) || !isAddr(agent) || !sig) throw new Error("нет подписи");
  if (Math.abs(Date.now() - Number(ts)) > 5 * 6e4) throw new Error("подпись устарела — обновите страницу");
  const msg = `Totum feed\n${act}\n${user.toLowerCase()}\n${ts}\n${b.payload || ""}`;
  if (!(await verifyMessage({ address: getAddress(agent), message: msg, signature: sig }))) throw new Error("подпись не сходится");
  const ags = (await hl({ type: "extraAgents", user })) || [];
  if (!ags.some((a) => a.address?.toLowerCase() === agent.toLowerCase() && (!a.validUntil || a.validUntil > Date.now()))) throw new Error("ключ для сделок не найден у этого кошелька — включите торговлю заново");
  return user.toLowerCase();
}

/* открытая позиция — с Hyperliquid в момент публикации */
async function openPos(user, coin) {
  if (!coin || !/^[A-Za-z0-9:@._-]{1,30}$/.test(coin)) return null;
  const dex = coin.includes(":") ? coin.split(":")[0] : "";
  const st = await hl({ type: "clearinghouseState", user, ...(dex ? { dex } : {}) });
  const p = (st?.assetPositions || []).map((x) => x.position).find((x) => x.coin === coin);
  return p ? { kind: "open", coin, szi: p.szi, entry: p.entryPx, lev: p.leverage?.value, pnl: p.unrealizedPnl, roe: p.returnOnEquity, at: Date.now() } : null;
}
/* закрытая сделка — по номеру заявки из истории сделок этого кошелька на Hyperliquid */
async function closedTrade(user, oid) {
  if (!/^\d{1,20}$/.test(String(oid))) return null;
  const fills = ((await hl({ type: "userFillsByTime", user, startTime: Date.now() - 180 * 864e5, aggregateByTime: true })) || []).filter((f) => String(f.oid) === String(oid));
  if (!fills.length) return null;
  const sz = fills.reduce((a, f) => a + Number(f.sz), 0), ntl = fills.reduce((a, f) => a + Number(f.sz) * Number(f.px), 0);
  const pnl = fills.reduce((a, f) => a + Number(f.closedPnl || 0), 0), fee = fills.reduce((a, f) => a + Number(f.fee || 0), 0);
  const f0 = fills[0], px = ntl / sz;
  const entry = /Long/.test(f0.dir) ? px - pnl / sz : /Short/.test(f0.dir) ? px + pnl / sz : null;
  return { kind: "closed", coin: f0.coin, dir: f0.dir, sz: String(sz), px: String(px), entry: entry ? String(entry) : null, pnl: String(pnl - fee), roe: entry ? String((pnl / (entry * sz))) : null, at: f0.time };
}

const clean = (t) => String(t || "").replace(/\r/g, "").replace(/[\u0000-\u0008\u000b-\u001f]/g, "").replace(/\n{3,}/g, "\n\n").trim().slice(0, MAX);
const mediaOk = (m) => Array.isArray(m) ? m.filter((x) => x && /^(img|vid)$/.test(x.k) && typeof x.u === "string" && (/^\/api\/feed\?m=[a-z0-9]{6,24}$/.test(x.u) || /^https:\/\/[a-z0-9]+\.public\.blob\.vercel-storage\.com\//.test(x.u))).slice(0, 4).map((x) => ({ k: x.k, u: x.u, w: Number(x.w) || 0, h: Number(x.h) || 0 })) : [];

export default async function handler(req, res) {
  const send = (c, o) => { res.setHeader("content-type", "application/json; charset=utf-8"); res.setHeader("cache-control", "no-store"); res.status(c).send(JSON.stringify(o)); };
  if (!URL_ || !TOKEN) return send(503, { error: "nodb" });
  try {
    const q = new URL(req.url, "http://x").searchParams;
    if (req.method === "GET" && q.get("m")) {
      const id = q.get("m");
      if (!/^[a-z0-9]{6,24}$/.test(id)) return send(400, { error: "id" });
      const [j] = await redis([["GET", `feed:img:${id}`]]);
      if (!j) return send(404, { error: "нет файла" });
      const { t, d } = JSON.parse(j);
      res.setHeader("content-type", t);
      res.setHeader("cache-control", "public, max-age=31536000, immutable");
      return res.status(200).send(Buffer.from(d, "base64"));
    }
    if (req.method === "GET" && q.get("u")) {
      /* профиль трейдера: ник, описание, его посты */
      const u = q.get("u").toLowerCase(), me = (q.get("me") || "").toLowerCase();
      if (!isAddr(u)) return send(400, { error: "адрес" });
      const [pj, ids, n] = await redis([["GET", `feed:u:${u}`], ["LRANGE", `feed:uids:${u}`, "0", String(PAGE - 1)], ["LLEN", `feed:uids:${u}`]]);
      const prof = pj ? JSON.parse(pj) : {};
      let posts = [], likes = 0;
      if (ids?.length) {
        const r = await redis([["MGET", ...ids.map((id) => `feed:p:${id}`)], ["HMGET", "feed:lc", ...ids], ...(isAddr(me) ? [["SMISMEMBER", `feed:ul:${me}`, ...ids]] : [])]);
        posts = r[0].map((j, k) => (j ? { ...JSON.parse(j), nick: prof.nick || "", likes: Number(r[1]?.[k] || 0), liked: isAddr(me) ? !!r[2]?.[k] : false } : null)).filter(Boolean);
        likes = posts.reduce((a, p) => a + p.likes, 0);
      }
      return send(200, { user: u, nick: prof.nick || "", bio: prof.bio || "", since: prof.since || posts.at(-1)?.ts || null, posts, count: Number(n || 0), likes });
    }
    if (req.method === "GET") {
      const from = Math.max(0, Number(q.get("from")) || 0), me = (q.get("me") || "").toLowerCase();
      const [ids] = await redis([["LRANGE", "feed:ids", String(from), String(from + PAGE - 1)]]);
      if (!ids?.length) return send(200, { posts: [], more: false });
      /* 3–4 команды базы на страницу (лайки — в одном хеше, «мои лайки» — в одном наборе) */
      const r = await redis([["MGET", ...ids.map((id) => `feed:p:${id}`)], ["HMGET", "feed:lc", ...ids], ...(isAddr(me) ? [["SMISMEMBER", `feed:ul:${me}`, ...ids]] : [])]);
      let posts = r[0].map((j, k) => (j ? { ...JSON.parse(j), likes: Number(r[1]?.[k] || 0), liked: isAddr(me) ? !!r[2]?.[k] : false } : null)).filter(Boolean);
      /* ники авторов — одним запросом */
      const au = [...new Set(posts.map((p) => p.user))];
      if (au.length) {
        const [nk] = await redis([["HMGET", "feed:nicks", ...au]]);
        const m = Object.fromEntries(au.map((a, k) => [a, nk?.[k] || ""]));
        posts = posts.map((p) => ({ ...p, nick: m[p.user] }));
      }
      const myNick = isAddr(me) ? (await redis([["HGET", "feed:nicks", me]]))[0] || "" : "";
      return send(200, { posts, more: ids.length === PAGE, video: !!BLOB, myNick });
    }
    if (req.method !== "POST") return send(405, { error: "method" });
    const b = typeof req.body === "object" && req.body ? req.body : JSON.parse(req.body || "{}");
    const user = await checkAuth(b);
    const p = JSON.parse(b.payload || "{}");
    if (b.act === "upload") {
      /* файл прислан вместе с подписью: в подписи — его размер и тип, сверяем */
      const data = String(b.data || ""), buf = Buffer.from(data, "base64"), type = String(p.type || "");
      if (buf.length !== Number(p.size)) return send(400, { error: "файл повреждён — попробуйте ещё раз" });
      const [okRate] = await redis([["INCR", `feed:up:${user}`], ["EXPIRE", `feed:up:${user}`, "3600", "NX"]]);
      if (okRate > 30) return send(429, { error: "Слишком много файлов за час" });
      const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
      if (/^image\/(webp|jpeg|png|gif)$/.test(type)) {
        if (buf.length > IMG_MAX) return send(400, { error: "Картинка слишком большая" });
        await redis([["SET", `feed:img:${id}`, JSON.stringify({ t: type, d: data, u: user })]]);
        return send(200, { k: "img", u: `/api/feed?m=${id}` });
      }
      if (/^video\/(mp4|webm|quicktime)$/.test(type)) {
        if (!BLOB) return send(400, { error: "Видео включится, когда подключат хранилище файлов" });
        if (buf.length > VID_MAX) return send(400, { error: "Видео до 3 МБ (около 15–20 секунд)" });
        const r = await put(`feed/${id}.${type.split("/")[1].replace("quicktime", "mov")}`, buf, { access: "public", contentType: type, token: BLOB });
        return send(200, { k: "vid", u: r.url });
      }
      return send(400, { error: "Такой файл не подходит: нужны фото или видео" });
    }
    if (b.act === "post") {
      const text = clean(p.text), media = mediaOk(p.media);
      if (text.length < 2 && !media.length && !p.att) return send(400, { error: "Пустой пост" });
      const [free] = await redis([["SET", `feed:rl:${user}`, "1", "NX", "EX", String(GAP)]]);
      if (free !== "OK") return send(429, { error: `Не чаще одного поста в ${GAP} секунд` });
      const att = p.att?.kind === "closed" ? await closedTrade(user, p.att.oid).catch(() => null) : p.att?.kind === "open" || p.coin ? await openPos(user, p.att?.coin || p.coin).catch(() => null) : null;
      const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
      const post = { id, user, text, ts: Date.now(), pos: att, media };
      const [, , , , nk] = await redis([["SET", `feed:p:${id}`, JSON.stringify(post)], ["LPUSH", "feed:ids", id], ["LTRIM", "feed:ids", "0", String(KEEP - 1)], ["LPUSH", `feed:uids:${user}`, id], ["HGET", "feed:nicks", user]]);
      return send(200, { post: { ...post, nick: nk || "", likes: 0, liked: false } });
    }
    if (b.act === "profile") {
      /* ник уникальный (без учёта регистра): 3–20 символов — буквы, цифры, _ . - */
      const nick = String(p.nick || "").trim(), bio = clean(p.bio).slice(0, 160);
      if (!/^[A-Za-zА-Яа-яЁё0-9_.-]{3,20}$/.test(nick)) return send(400, { error: "Ник: 3–20 символов — буквы, цифры, _ . -" });
      if (/^0x[0-9a-f]{6,}/i.test(nick) || /totum|admin|support|hyperliquid/i.test(nick) && user !== ADMIN) return send(400, { error: "Такой ник занят" });
      const low = nick.toLowerCase(), [owner, pj] = await redis([["GET", `feed:nick:${low}`], ["GET", `feed:u:${user}`]]);
      if (owner && owner !== user) return send(409, { error: "Этот ник уже занят" });
      const old = pj ? JSON.parse(pj) : {};
      const [got] = await redis([["SET", `feed:nick:${low}`, user, "NX"]]);
      if (got !== "OK" && owner !== user) return send(409, { error: "Этот ник уже занят" });
      const prof = { nick, bio, since: old.since || Date.now() };
      await redis([
        ...(old.nick && old.nick.toLowerCase() !== low ? [["DEL", `feed:nick:${old.nick.toLowerCase()}`]] : []),
        ["SET", `feed:u:${user}`, JSON.stringify(prof)],
        ["HSET", "feed:nicks", user, nick],
      ]);
      return send(200, prof);
    }
    if (b.act === "like") {
      const id = String(p.id || "");
      if (!/^[a-z0-9]{6,20}$/.test(id)) return send(400, { error: "id" });
      const [added] = await redis([["SADD", `feed:ul:${user}`, id]]);
      const [n] = await redis([["HINCRBY", "feed:lc", id, added ? "1" : "-1"], ...(added ? [] : [["SREM", `feed:ul:${user}`, id]])]);
      return send(200, { likes: Math.max(0, n), liked: !!added });
    }
    if (b.act === "delete") {
      const id = String(p.id || "");
      const [j] = await redis([["GET", `feed:p:${id}`]]);
      if (!j) return send(404, { error: "нет поста" });
      if (JSON.parse(j).user !== user && user !== ADMIN) return send(403, { error: "можно удалить только свой пост" });
      await redis([["DEL", `feed:p:${id}`], ["HDEL", "feed:lc", id], ["LREM", "feed:ids", "0", id], ["LREM", `feed:uids:${JSON.parse(j).user}`, "0", id]]);
      return send(200, { ok: true });
    }
    send(400, { error: "act" });
  } catch (e) {
    send(400, { error: String(e?.message || e).slice(0, 200) });
  }
}
