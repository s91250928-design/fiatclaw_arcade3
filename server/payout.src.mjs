// Выплаты «Твоя доля в Totum»: 50% комиссии Totum — трейдерам, открывается за 12 месяцев,
// после ликвидации — сразу. Считаем так же, как карточка на сайте, по данным Hyperliquid.
//
//   /api/payout            — отчёт (без ключа): кто сколько заработал, сколько выплачено,
//                            сколько нужно положить на кошелёк выплат. Адреса скрыты.
//   /api/payout?user=0x…   — цифры одного трейдера (для карточки на сайте).
//   cron 1-го числа        — выплата. Только с заголовком Vercel Cron (CRON_SECRET),
//                            только если PAYOUT_KEY — ключ именно кошелька выплат
//                            и денег хватает на всех сразу.
//
// Уже выплаченное берём из истории самого кошелька выплат на Hyperliquid, поэтому
// повторный запуск не платит дважды, и всё можно проверить в обозревателе.
import { privateKeyToAccount } from "viem/accounts";
import { HttpTransport, ExchangeClient } from "@nktkas/hyperliquid";

const BUILDER = "0xa02a1872ebbf3a5d2f0d8b236ef16f0fe62b16d0";
const PAYOUT = "0x390fab5e62025b2f53a090b3761d3c737e751107";
const START = Date.UTC(2026, 10, 2), SHARE = 0.5, VEST = 365 * 864e5, CLOID = "0x746f74756d";
const MIN = Number(process.env.PAYOUT_MIN || 1); /* меньше $1 не шлём — копится до следующего раза */
const MAX_TOTAL = Number(process.env.PAYOUT_MAX_TOTAL || 1000); /* страховка: за один раз не больше */
const API = "https://api.hyperliquid.xyz/info";

const post = async (b) => {
  const r = await fetch(API, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });
  if (!r.ok) throw new Error(`Hyperliquid ${r.status}`);
  return r.json();
};
const mask = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const isAddr = (a) => /^0x[0-9a-f]{40}$/i.test(a || "");

/* ── LZ4 (формат frame) — Hyperliquid сжимает дневные файлы сделок ── */
function lz4(src) {
  let p = 0;
  const u32 = () => (src[p++] | (src[p++] << 8) | (src[p++] << 16) | (src[p++] << 24)) >>> 0;
  const out = [];
  let o = new Uint8Array(1 << 20), n = 0;
  const need = (k) => { if (n + k > o.length) { const b = new Uint8Array(Math.max(o.length * 2, n + k)); b.set(o.subarray(0, n)); o = b; } };
  while (p < src.length) {
    if (u32() !== 0x184d2204) throw new Error("не LZ4");
    const flg = src[p++]; p++; /* BD */
    if (flg & 8) p += 8; if (flg & 1) p += 4; p++; /* HC */
    for (;;) {
      const sz = u32();
      if (sz === 0) break;
      const raw = sz & 0x80000000, len = sz & 0x7fffffff, end = p + len;
      if (raw) { need(len); o.set(src.subarray(p, end), n); n += len; p = end; }
      else {
        while (p < end) {
          const tok = src[p++];
          let l = tok >> 4;
          if (l === 15) { let b; do { b = src[p++]; l += b; } while (b === 255); }
          need(l); o.set(src.subarray(p, p + l), n); n += l; p += l;
          if (p >= end) break;
          const off = src[p++] | (src[p++] << 8);
          let m = tok & 15;
          if (m === 15) { let b; do { b = src[p++]; m += b; } while (b === 255); }
          m += 4; need(m);
          for (let i = 0; i < m; i++, n++) o[n] = o[n - off];
        }
      }
      if (flg & 16) p += 4;
    }
    if (flg & 4) p += 4;
  }
  out.push(o.subarray(0, n));
  return out[0];
}

/* кто торговал через Totum: дневные файлы сделок строителя от Hyperliquid */
async function discover() {
  const users = new Set(), days = [], log = { files: 0, missing: 0, errors: [] };
  for (let t = START; t < Date.now(); t += 864e5) days.push(new Date(t).toISOString().slice(0, 10).replace(/-/g, ""));
  for (let i = 0; i < days.length; i += 12)
    await Promise.all(days.slice(i, i + 12).map(async (d) => {
      try {
        const r = await fetch(`https://stats-data.hyperliquid.xyz/Mainnet/builder_fills/${BUILDER}/${d}.csv.lz4`);
        if (r.status === 404 || r.status === 403) return void log.missing++;
        if (!r.ok) return void log.errors.push(`${d}: ${r.status}`);
        const csv = new TextDecoder().decode(lz4(new Uint8Array(await r.arrayBuffer()))).trim().split("\n");
        const head = csv[0].split(","), ui = head.indexOf("user");
        log.files++;
        log.columns = head;
        for (const l of csv.slice(1)) { const u = l.split(",")[ui]; isAddr(u) && users.add(u.toLowerCase()); }
      } catch (e) { log.errors.push(`${d}: ${e.message}`); }
    }));
  for (const u of String(process.env.PAYOUT_EXTRA || "").split(",")) isAddr(u.trim()) && users.add(u.trim().toLowerCase());
  /* запасной способ: адреса, подключавшие кошелёк к Totum (база Upstash) */
  try {
    const env = (end) => process.env[`KV_${end}`] || Object.entries(process.env).find(([k]) => k.endsWith(`_${end}`) && !k.includes("READ_ONLY"))?.[1];
    const U = env("REST_API_URL"), T = env("REST_API_TOKEN");
    if (U && T) {
      const r = await fetch(`${U}/pipeline`, { method: "POST", headers: { authorization: `Bearer ${T}`, "content-type": "application/json" }, body: JSON.stringify([["SMEMBERS", "totum:users"]]) });
      const list = r.ok ? (await r.json())[0]?.result || [] : [];
      list.forEach((u) => isAddr(u) && users.add(u.toLowerCase()));
      log.seen = list.length;
    }
  } catch (e) { log.errors.push(`база: ${e.message}`); }
  users.delete(BUILDER); users.delete(PAYOUT);
  return { users: [...users], log };
}

/* что уже выплачено: переводы с кошелька выплат по его истории на Hyperliquid */
async function paidMap() {
  const paid = {};
  let st = START;
  for (let k = 0; k < 30; k++) {
    const l = (await post({ type: "userNonFundingLedgerUpdates", user: PAYOUT, startTime: st })) || [];
    for (const x of l) {
      const d = x.delta || {};
      if (!["send", "spotTransfer", "usdSend"].includes(d.type) || !isAddr(d.destination)) continue;
      if ((d.user || PAYOUT).toLowerCase() !== PAYOUT) continue;
      if (d.token && d.token !== "USDC") continue;
      const v = Number(d.usdcValue ?? d.amount ?? d.usdc ?? 0);
      paid[d.destination.toLowerCase()] = (paid[d.destination.toLowerCase()] || 0) + v;
    }
    if (l.length < 2000) break;
    st = Math.max(...l.map((x) => x.time)) + 1;
  }
  return paid;
}

/* доля одного трейдера — как в карточке на сайте */
async function share(user) {
  const fills = [];
  let st = START;
  for (let k = 0; k < 20; k++) {
    const f = (await post({ type: "userFillsByTime", user, startTime: st, endTime: Date.now() })) || [];
    fills.push(...f);
    if (f.length < 2000) break;
    st = Math.max(...f.map((x) => x.time)) + 1;
  }
  const mine = fills.filter((f) => String(f.cloid || "").toLowerCase().startsWith(CLOID) && Number(f.builderFee) > 0);
  const liqs = fills.filter((f) => f.liquidation).map((f) => f.time).sort((a, b) => a - b);
  const now = Date.now();
  let acc = 0, open = 0;
  for (const f of mine) {
    const v = Number(f.builderFee) * SHARE;
    acc += v;
    open += liqs.find((t) => t >= f.time) ? v : v * Math.min(1, (now - f.time) / VEST);
  }
  return { acc, open, trades: mine.length };
}

async function balance() {
  const [ab, ch, sp] = await Promise.all([
    post({ type: "userAbstraction", user: PAYOUT }).catch(() => "disabled"),
    post({ type: "clearinghouseState", user: PAYOUT }),
    post({ type: "spotClearinghouseState", user: PAYOUT }),
  ]);
  const usdc = (sp.balances || []).find((b) => b.coin === "USDC");
  const spot = usdc ? Number(usdc.total) - Number(usdc.hold) : 0;
  return ["unifiedAccount", "portfolioMargin"].includes(ab) ? spot : Number(ch.withdrawable || 0);
}

async function report() {
  const [{ users, log }, paid, bal] = await Promise.all([discover(), paidMap(), balance()]);
  const rows = [];
  for (let i = 0; i < users.length; i += 8)
    rows.push(...(await Promise.all(users.slice(i, i + 8).map(async (u) => {
      const s = await share(u), p = paid[u] || 0, due = Math.floor(Math.max(0, s.open - p) * 100) / 100;
      return { user: u, ...s, paid: p, due };
    }))));
  const toPay = rows.filter((r) => r.due >= MIN);
  return { rows, toPay, total: toPay.reduce((a, r) => a + r.due, 0), bal, log };
}

async function pay(rep) {
  const key = (process.env.PAYOUT_KEY || "").trim();
  if (!key) return { ok: false, why: "PAYOUT_KEY не задан в Vercel" };
  const acc = privateKeyToAccount(key.startsWith("0x") ? key : `0x${key}`);
  if (acc.address.toLowerCase() !== PAYOUT) return { ok: false, why: `ключ от другого кошелька (${mask(acc.address)}), нужен ${mask(PAYOUT)}` };
  if (!rep.toPay.length) return { ok: true, sent: [], why: "некому платить (у всех меньше минимума)" };
  if (rep.total > MAX_TOTAL) return { ok: false, why: `к выплате $${rep.total.toFixed(2)} — больше страховки PAYOUT_MAX_TOTAL ($${MAX_TOTAL})` };
  if (rep.total > rep.bal) return { ok: false, why: `на кошельке выплат $${rep.bal.toFixed(2)}, нужно $${rep.total.toFixed(2)} — пополните и выплата пройдёт` };
  const ex = new ExchangeClient({ transport: new HttpTransport({ timeout: 2e4 }), wallet: acc, signatureChainId: "0xa4b1" });
  const sent = [];
  for (const r of rep.toPay) {
    try {
      await ex.usdSend({ destination: r.user, amount: r.due.toFixed(2) });
      sent.push({ user: mask(r.user), amount: r.due, ok: true });
    } catch (e) {
      sent.push({ user: mask(r.user), amount: r.due, ok: false, error: String(e?.message || e).slice(0, 160) });
    }
  }
  return { ok: sent.every((s) => s.ok), sent };
}

/* ключ от кошелька выплат? — только «да/нет», сам ключ и адрес не показываем */
function keyOk() {
  const k = process.env.PAYOUT_KEY;
  if (!k) return false;
  try {
    return privateKeyToAccount(k.trim().startsWith("0x") ? k.trim() : `0x${k.trim()}`).address.toLowerCase() === PAYOUT;
  } catch {
    return false;
  }
}
export default async function handler(req, res) {
  const q = new URL(req.url, "http://x").searchParams;
  const send = (code, body) => {
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.setHeader("cache-control", "no-store");
    res.status(code).send(JSON.stringify(body, null, 1));
  };
  try {
    const user = (q.get("user") || "").toLowerCase();
    if (user) {
      if (!isAddr(user)) return send(400, { error: "нужен адрес 0x…" });
      const [s, paid] = await Promise.all([share(user), paidMap()]);
      return send(200, { ...s, paid: paid[user] || 0 });
    }
    const cron = !!process.env.CRON_SECRET && req.headers.authorization === `Bearer ${process.env.CRON_SECRET}`;
    const rep = await report();
    const out = {
      date: new Date().toISOString(),
      payoutWallet: PAYOUT,
      balance: rep.bal,
      traders: rep.rows.length,
      accrued: rep.rows.reduce((a, r) => a + r.acc, 0),
      unlocked: rep.rows.reduce((a, r) => a + r.open, 0),
      paid: rep.rows.reduce((a, r) => a + r.paid, 0),
      dueNow: rep.total,
      needTopUp: Math.max(0, rep.total - rep.bal),
      minPayout: MIN,
      setup: { keySet: !!process.env.PAYOUT_KEY, keyMatchesWallet: keyOk(), cronSecretSet: !!process.env.CRON_SECRET },
      files: rep.log,
      list: rep.rows.map((r) => ({ user: mask(r.user), trades: r.trades, accrued: +r.acc.toFixed(4), unlocked: +r.open.toFixed(4), paid: r.paid, due: r.due })),
    };
    if (cron && q.get("k") === "pay") out.payout = await pay(rep);
    send(200, out);
  } catch (e) {
    send(500, { error: String(e?.message || e) });
  }
}
