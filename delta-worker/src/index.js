/* Totum: сборщик покупок/продаж для графика Original.
   Один «вечно живой» объект (Durable Object) держит WebSocket к Hyperliquid, слушает сделки
   самых торгуемых монет и складывает их по минутам: текущий час — в памяти, закрытые часы —
   во встроенную базу SQLite (30 дней), раз в минуту — страховочная копия памяти.
   GET /delta?coin=BTC&i=900&from=...&to=...  →  [[начало свечи, куплено $, продано $, сделок], ...] */
import { DurableObject } from "cloudflare:workers";
import { addTrades, flushHours, checkpoint, restore, prune, query, setup, stats } from "./core.js";

const HL = "https://api.hyperliquid.xyz";
const ALWAYS = ["BTC", "ETH", "SOL", "HYPE"], TOP = 60, KEEP_DAYS = 30;

export class Collector extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.buf = new Map();
    setup(this.sql);
    this.notBefore = restore(this.sql, this.buf);
    this.dirty = false;
    this.ckAt = Date.now();
    this.seen = new Set();
    this.ws = null;
    this.coins = [];
    this.coinsAt = 0;
    this.prunedAt = 0;
    this.lastMsg = 0;
  }
  async pickCoins() {
    try {
      const r = await fetch(`${HL}/info`, { method: "POST", headers: { "content-type": "application/json" }, body: '{"type":"metaAndAssetCtxs"}' });
      const [meta, ctx] = await r.json();
      const list = meta.universe.map((u, k) => ({ c: u.name, v: Number(ctx[k]?.dayNtlVlm || 0), d: u.isDelisted })).filter((x) => !x.d).sort((a, b) => b.v - a.v).slice(0, TOP).map((x) => x.c);
      this.coins = [...new Set([...ALWAYS, ...list])];
      this.coinsAt = Date.now();
    } catch {
      this.coins.length || (this.coins = ALWAYS);
    }
  }
  async connect() {
    if (this.ws && this.ws.readyState <= 1 && Date.now() - this.lastMsg < 9e4) return;
    try { this.ws?.close(); } catch {}
    this.ws = null;
    if (!this.coins.length || Date.now() - this.coinsAt > 36e5) await this.pickCoins();
    const r = await fetch(`${HL}/ws`, { headers: { Upgrade: "websocket" } });
    const ws = r.webSocket;
    if (!ws) throw new Error(`нет WebSocket: ${r.status}`);
    ws.accept();
    ws.addEventListener("message", (e) => {
      this.lastMsg = Date.now();
      try {
        const m = JSON.parse(e.data);
        m.channel === "trades" && addTrades(this.buf, this.seen, m.data, this.notBefore) && (this.dirty = true);
      } catch {}
    });
    const drop = () => this.ws === ws && (this.ws = null);
    ws.addEventListener("close", drop);
    ws.addEventListener("error", drop);
    for (const coin of this.coins) ws.send(JSON.stringify({ method: "subscribe", subscription: { type: "trades", coin } }));
    this.ws = ws;
    this.lastMsg = Date.now();
  }
  async tick() {
    const now = Date.now();
    const closed = flushHours(this.sql, this.buf, now / 1e3); /* закрытый час ушёл в базу — страховку обновить сразу, иначе он посчитается дважды */
    if (closed || (this.dirty && now - this.ckAt >= 6e4)) {
      checkpoint(this.sql, this.buf, now);
      this.ckAt = now;
      this.dirty = false;
    }
    try { this.ws?.readyState === 1 && this.ws.send('{"method":"ping"}'); } catch {}
    await this.connect().catch(() => {});
    if (Date.now() - this.prunedAt > 36e5) {
      prune(this.sql, Math.floor(Date.now() / 1e3) - KEEP_DAYS * 86400);
      this.prunedAt = Date.now();
    }
    const a = await this.ctx.storage.getAlarm();
    (!a || a < Date.now()) && (await this.ctx.storage.setAlarm(Date.now() + 15e3));
  }
  async alarm() {
    await this.tick();
    await this.ctx.storage.setAlarm(Date.now() + 15e3);
  }
  async fetch(req) {
    const u = new URL(req.url);
    await this.tick();
    if (u.pathname === "/delta") {
      const coin = u.searchParams.get("coin") || "", i = Number(u.searchParams.get("i") || 60), now = Math.floor(Date.now() / 1e3);
      const from = Number(u.searchParams.get("from") || now - 86400), to = Number(u.searchParams.get("to") || now + 60);
      if (!/^[A-Za-z0-9:@._-]{1,30}$/.test(coin)) return Response.json({ error: "coin" }, { status: 400 });
      return Response.json({ coin, i, rows: query(this.sql, this.buf, coin, i, from, to), tracked: this.coins.includes(coin) });
    }
    const st = stats(this.sql), all = [st.since, ...[...this.buf.values()].map((o) => o.t)].filter((x) => x != null);
    return Response.json({ ok: true, coins: this.coins.length, ws: this.ws?.readyState === 1, lastMsgAgo: Math.round((Date.now() - this.lastMsg) / 1e3), memMinutes: this.buf.size, hourRows: st.hourRows, since: all.length ? Math.min(...all) : null });
  }
}

const cors = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET" };
export default {
  async fetch(req, env, ctx) {
    if (req.method !== "GET") return new Response(null, { status: 405, headers: cors });
    const u = new URL(req.url);
    if (!["/delta", "/status"].includes(u.pathname)) return new Response("Totum delta", { headers: cors });
    /* ответ кешируем на 15 с — сотни трейдеров не будят базу каждую секунду */
    const cache = caches.default, key = new Request(u.toString());
    if (u.pathname === "/delta") { const hit = await cache.match(key); if (hit) return hit; }
    const stub = env.COLLECTOR.get(env.COLLECTOR.idFromName("main"));
    const r = await stub.fetch(req);
    const out = new Response(r.body, { status: r.status, headers: { ...cors, "content-type": "application/json", "cache-control": u.pathname === "/delta" ? "public, max-age=15" : "no-store" } });
    u.pathname === "/delta" && r.ok && ctx.waitUntil(cache.put(key, out.clone()));
    return out;
  },
  /* раз в минуту будим сборщик — если соединение оборвалось, он переподключится */
  async scheduled(ev, env) {
    await env.COLLECTOR.get(env.COLLECTOR.idFromName("main")).fetch("https://do/status");
  },
};
