import { createRequire } from "module";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { relayer, encodeApprove, usdcBalance, usdcAllowance, sendCall, estimateGas } from "./fund-credit.mjs";
import { hlPay, BRIDGE } from "./arb-relay.mjs";

const TON_USDT = "EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs";
const USDT_EVM = "0x9328Eb759596C38a25f59028B146Fecdc3621Dfe";
const USDC = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";
const NATIVE = "EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c";
const quoteCache = new Map();

function loadSwap() {
  const file = join(dirname(fileURLToPath(import.meta.url)), "gram-swap.cjs");
  const loaded = createRequire(import.meta.url)(file);
  if (typeof loaded.houseSend !== "function" || typeof loaded.tonSwap !== "function" || typeof loaded.tonGasWallet !== "function") {
    throw new Error("обмен не загрузился");
  }
  return loaded;
}

function kvEnv() {
  const pick = (end) => process.env[`KV_${end}`] || Object.entries(process.env).find(([k]) => k.endsWith(`_${end}`) && !k.includes("READ_ONLY"))?.[1];
  const url = pick("REST_API_URL");
  const token = pick("REST_API_TOKEN");
  return url && token ? { url, token } : null;
}

async function kv(cmds) {
  const k = kvEnv();
  if (!k) throw new Error("Запись моста не настроена");
  const r = await fetch(`${k.url}/pipeline`, {
    method: "POST",
    headers: { authorization: `Bearer ${k.token}`, "content-type": "application/json" },
    body: JSON.stringify(cmds),
    signal: AbortSignal.timeout(8e3),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok || !Array.isArray(j)) throw new Error("Запись моста не ответила");
  return j.map((row) => row?.result);
}

function dec(amount, decimals) {
  const n = BigInt(amount);
  const d = 10n ** BigInt(decimals);
  const w = n / d;
  const f = (n % d).toString().padStart(decimals, "0").replace(/0+$/, "");
  return f ? `${w}.${f}` : `${w}`;
}

function human(raw) {
  const t = String(raw ?? "").trim().replace(",", ".");
  if (!/^\d+(\.\d{1,6})?$/.test(t)) return null;
  const [a, b = ""] = t.split(".");
  return BigInt(a) * 1000000n + BigInt(b.padEnd(6, "0"));
}

async function symbiosis(amount, from, to) {
  const headers = { "content-type": "application/json", accept: "application/json", "user-agent": "Totum" };
  if (process.env.SYMBIOSIS_KEY) headers["X-Api-Key"] = process.env.SYMBIOSIS_KEY;
  const r = await fetch("https://api.symbiosis.finance/crosschain/v2/quote", {
    method: "POST",
    headers,
    signal: AbortSignal.timeout(12e3),
    body: JSON.stringify({
      tokenAmountIn: { address: USDC, amount: amount.toString(), chainId: 42161, decimals: 6, symbol: "USDC" },
      tokenOut: { chainId: 85918, address: USDT_EVM, decimals: 6, symbol: "USDT", attributes: { ton: TON_USDT } },
      from, to, slippage: 100,
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (r.status === 429) throw new Error("Обмен занят. Подождите минуту");
  if (!r.ok || !j.tx?.to || !j.tx?.data || !j.tokenAmountOut?.amount) {
    throw new Error(j.message || j.errors?.[0]?.message || "Мост не посчитал USDC в TON");
  }
  return j;
}

async function stonOffer(offer, ask, units, from) {
  const url = `https://api.ston.fi/v1/swap/simulate?offer_address=${encodeURIComponent(offer)}&ask_address=${encodeURIComponent(ask)}&units=${units}&slippage_tolerance=0.01&user_wallet_address=${encodeURIComponent(from)}`;
  const r = await fetch(url, { method: "POST", signal: AbortSignal.timeout(12e3) });
  const j = await r.json().catch(() => ({}));
  const out = BigInt(j.ask_units || "0");
  const min = BigInt(j.min_ask_units || "0");
  if (!r.ok || out <= 0n) throw new Error("Токен сейчас не посчитался");
  return { ask: out, min, router: j.router || null };
}

async function ston(units, from, ask = NATIVE) {
  return stonOffer(TON_USDT, ask, units, from);
}

async function tokenOf(raw) {
  const address = /^EQ[A-Za-z0-9_-]{46}$/.test(String(raw || "")) ? String(raw) : NATIVE;
  const r = await fetch(`https://api.ston.fi/v1/assets/${address}`, { signal: AbortSignal.timeout(8e3) });
  const j = await r.json().catch(() => ({}));
  const a = j.asset || j;
  if (!r.ok || !a?.contract_address) throw new Error("Этот токен нельзя купить");
  return {
    address: a.contract_address,
    symbol: String(a.symbol || "TON").slice(0, 16),
    decimals: Number(a.decimals) || 9,
    native: a.kind === "Ton" || a.contract_address === NATIVE,
    image: String(a.image_url || "").startsWith("https://asset.ston.fi/") ? a.image_url : "",
  };
}

async function gramNano(uq) {
  const r = await fetch(`https://tonapi.io/v2/accounts/${encodeURIComponent(uq)}`, { signal: AbortSignal.timeout(8e3) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.balance == null) return 0n;
  return BigInt(j.balance);
}

async function tokenNano(uq, token) {
  if (!token || token.native || token.address === NATIVE) return gramNano(uq);
  const r = await fetch(`https://tonapi.io/v2/accounts/${encodeURIComponent(uq)}/jettons/${token.address}`, { signal: AbortSignal.timeout(8e3) });
  if (!r.ok) return 0n;
  const j = await r.json().catch(() => ({}));
  return BigInt(j.balance || "0");
}
async function usdtNano(uq) {
  const r = await fetch(`https://tonapi.io/v2/accounts/${encodeURIComponent(uq)}/jettons/${TON_USDT}`, { signal: AbortSignal.timeout(8e3) });
  if (!r.ok) return 0n;
  const j = await r.json().catch(() => ({}));
  return BigInt(j.balance || "0");
}

function desk() {
  const gas = relayer();
  const ton = loadSwap().tonGasWallet(process.env.GAS_RELAYER_KEY);
  return { gas, ton };
}

export async function quotePool(amountRaw, tokenRaw) {
  const whole = human(amountRaw);
  if (whole == null || whole < 8000000n) throw new Error("Минимум 8 USDC: комиссия вывода и обмена");
  const token = await tokenOf(tokenRaw);
  const bridgeIn = whole - 1000000n;
  const key = `${bridgeIn}:${token.address}`;
  const hit = quoteCache.get(key);
  if (hit && Date.now() - hit.at < 20000) return hit.value;
  const { gas, ton } = desk();
  const q = await symbiosis(bridgeIn, gas.address, ton.uq);
  const usdt = BigInt(q.tokenAmountOut.amount);
  const swap = token.address === TON_USDT ? { ask: usdt, min: usdt * 99n / 100n } : await ston(usdt, ton.uq, token.address);
  const value = {
    ok: true,
    receive: dec(swap.ask, token.decimals),
    minReceive: dec(swap.min, token.decimals),
    payUsd: dec(whole, 6),
    recvUsd: dec(usdt, 6),
    rate: (Number(swap.ask) / 10 ** token.decimals / (Number(whole) / 1e6)).toFixed(4),
    impact: `обмен USDC на ${token.symbol}. Токен останется в активах`,
    seconds: Number(q.estimatedTime) || 60,
    desk: gas.address,
    token,
  };
  quoteCache.set(key, { at: Date.now(), value });
  return value;
}

async function jobOf(user) {
  const raw = (await kv([["GET", `totum:pool:${user}`]]))[0];
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

async function saveJob(user, job) {
  await kv([["SET", `totum:pool:${user}`, JSON.stringify(job)]]);
}

async function findWithdraw(user, amount) {
  const r = await fetch("https://api.hyperliquid.xyz/info", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type: "userNonFundingLedgerUpdates", user, startTime: Date.now() - 24 * 60 * 60 * 1000 }),
    signal: AbortSignal.timeout(12e3),
  });
  const rows = r.ok ? await r.json() : [];
  const seen = new Set((await kv([["SMEMBERS", "totum:pool:seen"]]))[0] || []);
  const hits = [];
  for (const row of rows || []) {
    const d = row.delta || {};
    if (d.type !== "withdraw") continue;
    const id = row.hash || String(row.time);
    if (seen.has(id)) continue;
    const left = Number(d.usdc);
    const fee = Number(d.fee || 0);
    if (Math.abs(left - amount) > 0.05 && Math.abs(left + fee - amount) > 0.05) continue;
    hits.push(row);
  }
  hits.sort((a, b) => b.time - a.time);
  return hits[0] || null;
}

function owed(got, paidUsd, decimals) {
  const paid = Number(paidUsd);
  if (!(paid > 0) || got <= 0n) return 0n;
  const cap = BigInt(Math.round(paid * 1.08 * 1e6)) * (10n ** BigInt(decimals)) / 1000000n;
  if (cap <= 0n) return 0n;
  return got > cap ? cap : got;
}

async function credit(user, token, add, usd) {
  const field = `${user}:${token.address}`;
  const cmds = [
    ["HINCRBY", "totum:ton:hold", field, add.toString()],
    ["HSET", "totum:ton:meta", token.address, JSON.stringify({ symbol: token.symbol, decimals: token.decimals, image: token.image || "", native: !!token.native })],
  ];
  const paid = BigInt(Math.round(Number(usd || 0) * 1e6));
  if (paid > 0n) cmds.push(["HINCRBY", "totum:ton:cost", field, paid.toString()]);
  if (token.native) cmds.push(["HINCRBY", "totum:gram:bal", user, add.toString()]);
  await kv(cmds);
  return BigInt((await kv([["HGET", "totum:ton:hold", field]]))[0] || 0);
}

function flat(result) {
  if (!result) return [];
  if (Array.isArray(result)) {
    const out = [];
    for (let i = 0; i < result.length; i += 2) out.push([String(result[i]), result[i + 1]]);
    return out;
  }
  return Object.entries(result);
}

const pxCache = new Map();
async function usdPrice(address) {
  const hit = pxCache.get(address);
  if (hit && Date.now() - hit.at < 30000) return hit;
  const r = await fetch(`https://api.ston.fi/v1/assets/${address}`, { signal: AbortSignal.timeout(8e3) });
  const j = await r.json().catch(() => ({}));
  const a = j.asset || j;
  const meta = a.meta || {};
  const px = Number(a.dex_price_usd || a.dex_usd_price || a.third_party_usd_price);
  const image = String(meta.image_url || a.image_url || "");
  const row = {
    at: Date.now(),
    px: Number.isFinite(px) && px > 0 ? px : 0,
    image: image.startsWith("https://asset.ston.fi/") ? image : "",
  };
  pxCache.set(address, row);
  return row;
}

export async function holdings(user) {
  if (!/^0x[0-9a-f]{40}$/.test(user)) return { ok: true, assets: [] };
  const [hold, meta, cost, pxRaw] = await kv([
    ["HGETALL", "totum:ton:hold"],
    ["HGETALL", "totum:ton:meta"],
    ["HGETALL", "totum:ton:cost"],
    ["GET", "totum:ton:px"],
  ]);
  const info = new Map(flat(meta).map(([k, v]) => {
    try { return [k, JSON.parse(v)]; } catch { return [k, null]; }
  }));
  const paid = new Map(flat(cost));
  let saved = {};
  try { saved = JSON.parse(pxRaw || "{}"); } catch { saved = {}; }
  const rows = [];
  for (const [field, raw] of flat(hold)) {
    if (!field.startsWith(`${user}:`)) continue;
    const units = BigInt(raw || 0);
    if (units <= 0n) continue;
    const address = field.slice(user.length + 1);
    rows.push({ field, address, units, token: info.get(address) || { symbol: "TON", decimals: 9, image: "" } });
  }
  if (!rows.some((row) => row.address === NATIVE)) {
    const old = (await kv([["HGET", "totum:gram:bal", user]]))[0];
    const units = BigInt(old || 0);
    if (units > 0n) rows.unshift({ field: `${user}:${NATIVE}`, address: NATIVE, units, token: { symbol: "GRAM", decimals: 9, image: "" } });
  }
  const now = Date.now();
  const quotes = {};
  const stale = [];
  for (const row of rows) {
    const hit = saved[row.address];
    if (hit && now - Number(hit.at) < 10 * 60 * 1000) quotes[row.address] = hit;
    else stale.push(row.address);
  }
  if (stale.length) {
    await Promise.all(stale.map(async (address) => {
      try {
        const quote = await Promise.race([
          usdPrice(address),
          new Promise((_, reject) => setTimeout(() => reject(new Error("px")), 1000)),
        ]);
        quotes[address] = { ...quote, at: Date.now() };
      } catch {
        quotes[address] = saved[address] || { px: 0, image: "", at: 0 };
      }
    }));
    await kv([["SET", "totum:ton:px", JSON.stringify({ ...saved, ...quotes })]]);
  }
  const assets = [];
  for (const row of rows) {
    const quote = quotes[row.address] || { px: 0, image: "" };
    const amount = dec(row.units, row.token.decimals || 9);
    let micros = BigInt(paid.get(row.field) || 0);
    if (micros === 0n && row.units === 9176067295n) {
      micros = 9000000n;
      await kv([["HSET", "totum:ton:cost", row.field, micros.toString()]]);
    }
    const price = Number(quote.px) || 0;
    assets.push({
      address: row.address,
      symbol: row.token.symbol || "GRAM",
      decimals: row.token.decimals || 9,
      image: row.token.image || quote.image || "",
      amount,
      price,
      usd: Number(amount) * price,
      entry: Number(micros) / 1e6,
    });
  }
  return { ok: true, assets };
}

function tokenUnits(raw, decimals) {
  const t = String(raw ?? "").trim().replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const [whole, frac = ""] = t.split(".");
  if (frac.length > decimals) return null;
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt((frac + "0".repeat(decimals)).slice(0, decimals));
}

export async function withdrawTon({ user, address, token: tokenRaw, amount }) {
  if (!/^0x[0-9a-f]{40}$/.test(user)) throw new Error("Сначала подключите кошелёк");
  if (!/^(EQ|UQ)[A-Za-z0-9_-]{46}$/.test(String(address || ""))) throw new Error("Нужен адрес сети TON: он начинается с UQ или EQ");
  const token = await tokenOf(tokenRaw);
  const want = tokenUnits(amount, token.decimals || 9);
  if (want == null || want <= 0n) throw new Error("Введите сумму");
  const field = `${user}:${token.address}`;
  const [locked] = await kv([["SET", `totum:ton:wd:${user}`, token.address, "NX", "EX", "45"]]);
  if (locked !== "OK") throw new Error("Вывод уже идёт");
  try {
    const [holdRaw, gramRaw, costRaw] = await kv([
      ["HGET", "totum:ton:hold", field],
      ["HGET", "totum:gram:bal", user],
      ["HGET", "totum:ton:cost", field],
    ]);
    const hold = BigInt(holdRaw || 0);
    const gram = BigInt(gramRaw || 0);
    const have = hold > 0n ? hold : (token.native ? gram : 0n);
    if (want > have) throw new Error("Этой суммы нет на балансе");
    const { ton } = desk();
    const swap = loadSwap();
    if (token.native) {
      const house = await gramNano(ton.uq);
      if (house - want < 500000000n) throw new Error("Сейчас нельзя отправить всю сумму: на сети должен остаться запас для комиссии");
      await swap.houseSend({ to: address, amount: want.toString(), bounce: String(address).startsWith("EQ") });
    } else {
      if (typeof swap.houseJetton !== "function") throw new Error("Вывод этого токена ещё не подключён");
      const house = await gramNano(ton.uq);
      if (house < 600000000n) throw new Error("На сети не хватает TON для комиссии перевода");
      await swap.houseJetton({ master: token.address, to: address, amount: want.toString() });
    }
    const cmds = [];
    if (hold > 0n) cmds.push(["HINCRBY", "totum:ton:hold", field, (-want).toString()]);
    if (token.native && gram > 0n) cmds.push(["HINCRBY", "totum:gram:bal", user, (-(want > gram ? gram : want)).toString()]);
    const cost = BigInt(costRaw || 0);
    if (cost > 0n && have > 0n) cmds.push(["HINCRBY", "totum:ton:cost", field, (-(cost * want / have)).toString()]);
    if (cmds.length) await kv(cmds);
    return { ok: true, symbol: token.symbol, amount: dec(want, token.decimals || 9), address };
  } finally {
    await kv([["DEL", `totum:ton:wd:${user}`]]).catch(() => {});
  }
}

export async function armPool({ user, amount, token: tokenRaw }) {
  if (!/^0x[0-9a-f]{40}$/.test(user)) throw new Error("Сначала подключите кошелёк, которым торгуете");
  const usdc = Number(amount);
  if (!(usdc >= 8)) throw new Error("Минимум 8 USDC");
  const token = await tokenOf(tokenRaw);
  const { gas } = desk();
  const job = await jobOf(user);
  if (job && job.status !== "done" && Math.abs(Number(job.amount) - usdc) < 0.001) {
    return { ok: true, desk: gas.address, step: "Обмен уже идёт" };
  }
  await saveJob(user, { status: "wait", amount: usdc, token, withdraw: `arm:${Date.now()}`, started: Date.now() });
  return { ok: true, desk: gas.address, since: Date.now(), step: "Hyperliquid выпускает USDC. Обычно 3–5 минут" };
}

export async function stepPool({ user, amount, look, token: tokenRaw }) {
  if (!/^0x[0-9a-f]{40}$/.test(user)) throw new Error("Сначала подключите кошелёк, которым торгуете");
  const usdc = Number(amount);
  if (!(usdc >= 8)) throw new Error("Минимум 8 USDC");
  const { gas, ton } = desk();
  let job = await jobOf(user);
  const token = await tokenOf(tokenRaw || job?.token?.address);
  if (job?.status === "done") {
    await kv([["DEL", `totum:pool:${user}`], ["SADD", "totum:pool:seen", job.withdraw || ""]]);
    if (look) return { ok: true, idle: true, desk: gas.address, step: "" };
    return { ok: true, done: true, got: job.got, yours: job.yours, step: "Готово", desk: gas.address };
  }
  if (job && (job.status === "wait" || job.status === "sending") && Date.now() - Number(job.started || 0) > 30 * 60 * 1000) {
    const bal = await usdcBalance(gas.address);
    const usdt = await usdtNano(ton.uq);
    if (bal < 5000000n && usdt < 1000000n) {
      await kv([["DEL", `totum:pool:${user}`]]);
      job = null;
    }
  }
  if (job && job.status === "wait" && String(job.withdraw || "").startsWith("arm:")) {
    const hit = await findWithdraw(user, Number(job.amount));
    const bal = await usdcBalance(gas.address);
    if (!hit && bal < 5000000n && Date.now() - Number(job.started || 0) > 90 * 1000) {
      await kv([["DEL", `totum:pool:${user}`]]);
      job = null;
    }
  }
  if (!job || Math.abs(Number(job.amount) - usdc) > 0.001) {
    const hit = await findWithdraw(user, usdc);
    if (!hit) return look ? { ok: true, idle: true, desk: gas.address, step: "" } : { ok: true, since: Date.now(), step: "Hyperliquid выпускает USDC. Обычно 3–5 минут", desk: gas.address };
    const id = hit.hash || String(hit.time);
    job = { status: "wait", amount: usdc, token, withdraw: id, started: Date.now() };
    await saveJob(user, job);
  }
  if (job.status === "wait" || job.status === "sending") {
    if (job.phase === "swap" && !job.tx && Date.now() - Number(job.sentAt || 0) < 25000) {
      return { ok: true, since: job.started, step: "USDC пришли. Меняем их на TON", desk: gas.address };
    } else if (job.phase === "approve" && Date.now() - Number(job.sentAt || 0) < 15000) {
      return { ok: true, since: job.started, step: "Разрешаем перевод USDC", desk: gas.address };
    } else {
      const bal = await usdcBalance(gas.address);
      const buy = job.token || token;
      const bridgeSent = !!(job.tx || (job.status === "sending" && job.phase === "swap" && bal < 1000000n));
      if (bridgeSent) {
        let baseUsdt = job.baseUsdt;
        let base = job.base;
        if (baseUsdt == null || base == null || base === "") {
          const usdtNow = await usdtNano(ton.uq);
          if (baseUsdt == null) baseUsdt = usdtNow.toString();
          if (base == null || base === "") base = buy.address === TON_USDT ? String(baseUsdt) : (await tokenNano(ton.uq, buy)).toString();
        }
        job = { ...job, status: "bridged", token: buy, base, baseUsdt };
        await saveJob(user, job);
      } else {
        const cap = BigInt(Math.round(usdc * 1e6));
        const sendAmt = bal > cap ? cap : bal;
        if (sendAmt < 5000000n) return { ok: true, since: job.started, step: "Hyperliquid выпускает USDC. Обычно 3–5 минут", desk: gas.address };
        const q = await symbiosis(sendAmt, gas.address, ton.uq);
        const spender = q.approveTo || q.tx.to;
        const allow = await usdcAllowance(gas.address, spender);
        if (allow < sendAmt) {
          job = { ...job, status: "sending", phase: "approve", sentAt: Date.now(), token: buy };
          await saveJob(user, job);
          await sendCall({ to: USDC, data: encodeApprove(spender, sendAmt), gasLimit: 120000n });
          return { ok: true, since: job.started, step: "USDC пришли. Меняем их на TON", desk: gas.address };
        }
        let limit = 1500000n;
        try { limit = await estimateGas({ from: gas.address, to: q.tx.to, data: q.tx.data }); } catch { /* запасной лимит */ }
        const usdtNow = await usdtNano(ton.uq);
        const base = buy.address === TON_USDT ? usdtNow.toString() : (await tokenNano(ton.uq, buy)).toString();
        job = { ...job, status: "sending", phase: "swap", sentAt: Date.now(), token: buy, base, baseUsdt: usdtNow.toString() };
        await saveJob(user, job);
        const sent = await sendCall({ to: q.tx.to, data: q.tx.data, gasLimit: limit });
        job = { ...job, status: "bridged", tx: sent.hash };
        await saveJob(user, job);
        return { ok: true, since: job.started, step: "USDC пришли. Меняем их на TON", desk: gas.address };
      }
    }
  }
  if (job.status === "bridged") {
    const buy = job.token || token;
    if (job.base == null || job.base === "") {
      const snap = buy.address === TON_USDT ? await usdtNano(ton.uq) : await tokenNano(ton.uq, buy);
      job = { ...job, base: snap.toString() };
      await saveJob(user, job);
      return { ok: true, since: job.started, step: "Ждём новый перевод. Старый баланс биржи не зачисляем", desk: gas.address };
    }
    const usdt = await usdtNano(ton.uq);
    if (buy.address === TON_USDT) {
      const got = owed(usdt - BigInt(job.base), job.amount, buy.decimals || 6);
      if (got < 1000000n) return { ok: true, since: job.started, step: "USDT ещё в пути. Зачислим в активы", desk: gas.address };
      const yours = await credit(user, buy, got, Number(job.amount));
      job = { ...job, status: "done", got: dec(got, buy.decimals), yours: dec(yours, buy.decimals), symbol: buy.symbol };
      await saveJob(user, job);
      return { ok: true, done: true, got: job.got, yours: job.yours, symbol: buy.symbol, step: `Готово: ${job.got} ${buy.symbol} в активах`, desk: gas.address };
    }
    const now = await tokenNano(ton.uq, buy);
    if (job.baseUsdt == null) {
      job = { ...job, baseUsdt: usdt.toString() };
      await saveJob(user, job);
      return { ok: true, since: job.started, step: "Ждём новый перевод. Старый баланс биржи не зачисляем", desk: gas.address };
    }
    const arrived = usdt - BigInt(job.baseUsdt);
    if (arrived < 1000000n) return { ok: true, since: job.started, step: `${buy.symbol} ещё в пути. Зачислим в активы`, desk: gas.address };
    const swapAmt = owed(arrived, job.amount, 6);
    if (swapAmt < 1000000n) return { ok: true, since: job.started, step: `${buy.symbol} ещё в пути. Зачислим в активы`, desk: gas.address };
    const swap = await ston(swapAmt, ton.uq, buy.address);
    const msg = await loadSwap().tonSwap({
      from: ton.uq, offer: TON_USDT, ask: buy.address, amount: swapAmt.toString(), minAsk: swap.min.toString(), router: swap.router,
    });
    await loadSwap().houseSend({ to: msg.address, amount: msg.amount, payload: msg.payload });
    job = { ...job, status: "swapping", token: buy, base: now.toString() };
    await saveJob(user, job);
    return { ok: true, since: job.started, step: `Покупаем ${buy.symbol}. Токен останется в активах`, desk: gas.address };
  }
  if (job.status === "swapping") {
    const buy = job.token || token;
    if (job.base == null || job.base === "") {
      job = { ...job, base: (await tokenNano(ton.uq, buy)).toString() };
      await saveJob(user, job);
      return { ok: true, since: job.started, step: `${buy.symbol} ещё в пути. Зачислим в активы`, desk: gas.address };
    }
    const now = await tokenNano(ton.uq, buy);
    const give = owed(now - BigInt(job.base), job.amount, buy.decimals || 9);
    if (give <= 0n) return { ok: true, since: job.started, step: `${buy.symbol} ещё в пути. Зачислим в активы`, desk: gas.address };
    const yours = await credit(user, buy, give, Number(job.amount));
    job = { ...job, status: "done", got: dec(give, buy.decimals), yours: dec(yours, buy.decimals), symbol: buy.symbol };
    await saveJob(user, job);
    return { ok: true, done: true, got: job.got, yours: job.yours, symbol: buy.symbol, step: `Готово: ${job.got} ${buy.symbol} в активах`, desk: gas.address };
  }
  return { ok: true, since: job.started, step: "Обмен идёт", desk: gas.address };
}

function encodeTransfer(to, amount) {
  const addr = String(to).toLowerCase().replace(/^0x/, "").padStart(64, "0");
  return "0xa9059cbb" + addr + BigInt(amount).toString(16).padStart(64, "0");
}

async function readJob(key) {
  const raw = (await kv([["GET", key]]))[0];
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

async function debitGram(user, want) {
  const token = await tokenOf(NATIVE);
  const field = `${user}:${token.address}`;
  const [holdRaw, gramRaw, costRaw] = await kv([
    ["HGET", "totum:ton:hold", field],
    ["HGET", "totum:gram:bal", user],
    ["HGET", "totum:ton:cost", field],
  ]);
  const hold = BigInt(holdRaw || 0);
  const gram = BigInt(gramRaw || 0);
  const have = hold > 0n ? hold : gram;
  if (want > have) throw new Error("Этой суммы нет в активах");
  const cmds = [];
  if (hold > 0n) cmds.push(["HINCRBY", "totum:ton:hold", field, (-want).toString()]);
  if (gram > 0n) cmds.push(["HINCRBY", "totum:gram:bal", user, (-(want > gram ? gram : want)).toString()]);
  const cost = BigInt(costRaw || 0);
  if (cost > 0n && have > 0n) cmds.push(["HINCRBY", "totum:ton:cost", field, (-(cost * want / have)).toString()]);
  if (cmds.length) await kv(cmds);
  return token;
}

async function symbiosisBack(amount, from, to) {
  const headers = { "content-type": "application/json", accept: "application/json", "user-agent": "Totum" };
  if (process.env.SYMBIOSIS_KEY) headers["X-Api-Key"] = process.env.SYMBIOSIS_KEY;
  const r = await fetch("https://api.symbiosis.finance/crosschain/v2/quote", {
    method: "POST",
    headers,
    signal: AbortSignal.timeout(12e3),
    body: JSON.stringify({
      tokenAmountIn: { chainId: 85918, address: USDT_EVM, amount: amount.toString(), decimals: 6, symbol: "USDT", attributes: { ton: TON_USDT } },
      tokenOut: { chainId: 42161, address: USDC, decimals: 6, symbol: "USDC" },
      from, to, slippage: 100,
    }),
  });
  const j = await r.json().catch(() => ({}));
  const msg = j.tx?.messages?.[0];
  if (r.status === 429) throw new Error("Обмен занят. Подождите минуту");
  if (!r.ok || !msg?.address || !msg.payload) throw new Error(j.message || "Мост не посчитал GRAM в USDC");
  return { msg, out: BigInt(j.tokenAmountOut?.amount || "0") };
}

export async function quoteSell(amountRaw) {
  const nano = tokenUnits(amountRaw, 9);
  if (nano == null || nano < 1000000000n) throw new Error("Минимум 1 GRAM");
  const { ton } = desk();
  const swap = await stonOffer(NATIVE, TON_USDT, nano, ton.uq);
  if (swap.ask < 12000000n) throw new Error("Минимум около 12 GRAM: меньшую сумму мост в USDC не проводит");
  const est = swap.ask * 95n / 100n;
  const grams = Number(nano) / 1e9;
  return {
    ok: true,
    receive: dec(est, 6),
    minReceive: dec(swap.ask * 90n / 100n, 6),
    rate: grams > 0 ? Number(est) / 1e6 / grams : 0,
    impact: "—",
    payUsd: dec(swap.ask, 6),
    recvUsd: dec(est, 6),
    paySymbol: "GRAM",
    askSymbol: "USDC",
  };
}

export async function armSell({ user, amount }) {
  if (!/^0x[0-9a-f]{40}$/.test(user)) throw new Error("Сначала подключите кошелёк, которым торгуете");
  const nano = tokenUnits(amount, 9);
  if (nano == null || nano <= 0n) throw new Error("Введите сумму");
  const key = `totum:sell:${user}`;
  const [locked] = await kv([["SET", `totum:sell:lock:${user}`, "1", "NX", "EX", "40"]]);
  if (locked !== "OK") throw new Error("Обмен уже идёт");
  try {
    const existing = await readJob(key);
    if (existing && existing.status !== "done") return { ok: true, since: existing.started, step: "Обмен уже идёт. Подтверждение не нужно" };
    const { ton } = desk();
    const swap = await stonOffer(NATIVE, TON_USDT, nano, ton.uq);
    if (swap.ask < 12000000n) throw new Error("Минимум около 12 GRAM: меньшую сумму мост в USDC не проводит");
    const msg = await loadSwap().tonSwap({
      from: ton.uq, offer: NATIVE, ask: TON_USDT, amount: nano.toString(), minAsk: swap.min.toString(), router: swap.router,
    });
    const house = await gramNano(ton.uq);
    if (house - BigInt(msg.amount) < 400000000n) throw new Error("Сейчас эту сумму не обменять: на сети должен остаться запас");
    const token = await debitGram(user, nano);
    const base = (await usdtNano(ton.uq)).toString();
    const job = { status: "send", nano: nano.toString(), base, started: Date.now(), token, msg, expect: swap.ask.toString() };
    await kv([["SET", key, JSON.stringify(job)]]);
    return { ok: true, since: job.started, step: "GRAM списаны. Меняем на USDC, кошелёк больше не нужен" };
  } finally {
    await kv([["DEL", `totum:sell:lock:${user}`]]).catch(() => {});
  }
}

export async function stepSell({ user }) {
  if (!/^0x[0-9a-f]{40}$/.test(user)) throw new Error("Сначала подключите кошелёк, которым торгуете");
  const key = `totum:sell:${user}`;
  let job = await readJob(key);
  if (!job || job.status === "done") return { ok: true, idle: !job, done: job?.status === "done", got: job?.got || "", step: job?.status === "done" ? `Готово: ${job.got} USDC на фьючерсах` : "" };
  const { gas, ton } = desk();
  if (job.status === "send") {
    if (job.inflight && Date.now() - Number(job.inflight) < 25000) return { ok: true, since: job.started, step: "Меняем GRAM на USDC. Подтверждение не нужно" };
    job = { ...job, inflight: Date.now() };
    await kv([["SET", key, JSON.stringify(job)]]);
    try {
      await loadSwap().houseSend({ to: job.msg.address, amount: job.msg.amount, payload: job.msg.payload });
    } catch (err) {
      if (Date.now() - Number(job.started) < 20000) {
        await credit(user, job.token, BigInt(job.nano), 0);
        await kv([["DEL", key]]);
      }
      throw err;
    }
    job = { ...job, status: "usdt", sentAt: Date.now() };
    await kv([["SET", key, JSON.stringify(job)]]);
    return { ok: true, since: job.started, step: "Меняем GRAM на USDC. Подтверждение не нужно" };
  }
  if (job.status === "usdt") {
    const usdt = await usdtNano(ton.uq);
    if (job.base == null || job.base === "") {
      job = { ...job, base: usdt.toString() };
      await kv([["SET", key, JSON.stringify(job)]]);
      return { ok: true, since: job.started, step: "Меняем GRAM на USDC. Подтверждение не нужно" };
    }
    const got = usdt - BigInt(job.base);
    if (got < 1000000n) return { ok: true, since: job.started, step: "Меняем GRAM на USDC. Подтверждение не нужно" };
    const cap = job.expect ? BigInt(job.expect) * 105n / 100n : got;
    let send = got > usdt ? usdt : got;
    if (send > cap) send = cap;
    if (send < 1000000n) return { ok: true, since: job.started, step: "Меняем GRAM на USDC. Подтверждение не нужно" };
    const q = await symbiosisBack(send, ton.uq, gas.address);
    const before = (await usdcBalance(gas.address)).toString();
    await loadSwap().houseSend({ to: q.msg.address, amount: q.msg.amount, payload: q.msg.payload });
    job = { ...job, status: "bridge", usdt: send.toString(), baseUsdc: before, bridgedAt: Date.now() };
    await kv([["SET", key, JSON.stringify(job)]]);
    return { ok: true, since: job.started, step: "USDC идут на счёт. Обычно несколько минут" };
  }
  if (job.status === "bridge") {
    const now = await usdcBalance(gas.address);
    if (job.baseUsdc == null || job.baseUsdc === "") {
      job = { ...job, baseUsdc: now.toString() };
      await kv([["SET", key, JSON.stringify(job)]]);
      return { ok: true, since: job.started, step: "USDC идут на счёт. Обычно несколько минут" };
    }
    let got = now - BigInt(job.baseUsdc);
    if (got <= 0n) return { ok: true, since: job.started, step: "USDC идут на счёт. Обычно несколько минут" };
    if (job.expect) {
      const cap = BigInt(job.expect) * 105n / 100n;
      if (got > cap) got = cap;
    }
    if (got < 5000000n) return { ok: true, since: job.started, step: "USDC идут на счёт. Обычно несколько минут" };
    await sendCall({ to: USDC, data: encodeTransfer(BRIDGE, got), gasLimit: 120000n });
    job = { ...job, status: "pay", credit: got.toString(), paidAt: Date.now() };
    await kv([["SET", key, JSON.stringify(job)]]);
    return { ok: true, since: job.started, step: "Зачисляем USDC на фьючерсы" };
  }
  if (job.status === "pay") {
    if (Date.now() - Number(job.paidAt || 0) < 20000) return { ok: true, since: job.started, step: "Зачисляем USDC на фьючерсы" };
    const amt = dec(job.credit, 6);
    try {
      await hlPay({ priv: gas.priv, destination: user, amount: amt });
    } catch (err) {
      if (Date.now() - Number(job.paidAt || 0) < 8 * 60 * 1000) return { ok: true, since: job.started, step: "Зачисляем USDC на фьючерсы" };
      throw err;
    }
    job = { ...job, status: "done", got: amt };
    await kv([["SET", key, JSON.stringify(job)]]);
    return { ok: true, done: true, got: amt, step: `Готово: ${amt} USDC на фьючерсах` };
  }
  return { ok: true, since: job.started, step: "Обмен идёт" };
}

async function incomingGram(uq) {
  const r = await fetch(`https://tonapi.io/v2/blockchain/accounts/${encodeURIComponent(uq)}/transactions?limit=20`, { signal: AbortSignal.timeout(8e3) });
  const j = await r.json().catch(() => ({}));
  return (j.transactions || []).map((tx) => {
    const msg = tx.in_msg || {};
    const body = msg.decoded_body || {};
    return {
      hash: String(tx.hash || ""),
      from: String(msg.source?.address || "").toLowerCase(),
      value: BigInt(msg.value || "0"),
      text: String(body.text || body.comment || "").toLowerCase(),
      utime: Number(tx.utime || 0) * 1000,
    };
  }).filter((tx) => tx.hash && tx.value > 0n);
}

export async function armGramIn({ user, from, raw, amount }) {
  if (!/^0x[0-9a-f]{40}$/.test(user)) throw new Error("Сначала подключите счёт Totum");
  if (!/^(EQ|UQ)[A-Za-z0-9_-]{46}$/.test(String(from || ""))) throw new Error("Подключите кошелёк TON");
  const nano = tokenUnits(amount, 9);
  if (nano == null || nano < 1000000000n) throw new Error("Минимум 1 GRAM");
  const { ton } = desk();
  const note = loadSwap().depositNote(user);
  const job = { from: String(raw || "").toLowerCase(), friendly: from, nano: nano.toString(), since: Date.now(), status: "wait" };
  await kv([["SET", `totum:gramin:${user}`, JSON.stringify(job)]]);
  return { ok: true, to: ton.uq, amount: nano.toString(), payload: note, step: "Подтвердите перевод в кошельке" };
}

export async function stepGramIn({ user }) {
  if (!/^0x[0-9a-f]{40}$/.test(user)) throw new Error("Сначала подключите счёт Totum");
  const key = `totum:gramin:${user}`;
  const job = await readJob(key);
  if (!job) return { ok: true, idle: true, step: "" };
  if (job.status === "done") return { ok: true, done: true, got: job.got, step: `Готово: ${job.got} GRAM в активах` };
  const { ton } = desk();
  const rows = await incomingGram(ton.uq);
  const want = BigInt(job.nano);
  const hit = rows.find((tx) => {
    const mine = (job.from && tx.from === job.from) || tx.text.replace(/\s+/g, "") === user || tx.text.includes(user);
    return mine && tx.value + tx.value / 20n >= want && tx.utime >= Number(job.since) - 20000;
  });
  if (!hit) return { ok: true, since: job.since, step: "Ждём перевод. После подтверждения GRAM появятся в активах" };
  const [added] = await kv([["SADD", "totum:gram:in", hit.hash]]);
  if (Number(added) !== 1) return { ok: true, since: job.since, step: "Ждём перевод. После подтверждения GRAM появятся в активах" };
  const token = await tokenOf(NATIVE);
  try {
    await credit(user, token, hit.value, 0);
  } catch (err) {
    await kv([["SREM", "totum:gram:in", hit.hash]]);
    throw err;
  }
  const got = dec(hit.value, 9);
  await kv([["SET", key, JSON.stringify({ ...job, status: "done", got })]]);
  return { ok: true, done: true, got, step: `Готово: ${got} GRAM в активах` };
}
