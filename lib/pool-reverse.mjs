import { createRequire } from "module";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { relayer, encodeApprove, usdcBalance, usdcAllowance, sendCall, estimateGas } from "./fund-credit.mjs";

const TON_USDT = "EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs";
const USDT_EVM = "0x9328Eb759596C38a25f59028B146Fecdc3621Dfe";
const USDC = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";
const NATIVE = "EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c";
const quoteCache = new Map();

function loadSwap() {
  const file = join(dirname(fileURLToPath(import.meta.url)), "gram-swap.cjs");
  const loaded = createRequire(import.meta.url)(file);
  if (typeof loaded.houseSend !== "function" || typeof loaded.gramBuy !== "function" || typeof loaded.tonGasWallet !== "function") {
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

async function ston(units, from) {
  const url = `https://api.ston.fi/v1/swap/simulate?offer_address=${encodeURIComponent(TON_USDT)}&ask_address=${encodeURIComponent(NATIVE)}&units=${units}&slippage_tolerance=0.01&user_wallet_address=${encodeURIComponent(from)}`;
  const r = await fetch(url, { method: "POST", signal: AbortSignal.timeout(12e3) });
  const j = await r.json().catch(() => ({}));
  const ask = BigInt(j.ask_units || "0");
  const min = BigInt(j.min_ask_units || "0");
  if (!r.ok || ask <= 0n) throw new Error("GRAM сейчас не посчитался");
  return { ask, min };
}

async function gramNano(uq) {
  const r = await fetch(`https://tonapi.io/v2/accounts/${encodeURIComponent(uq)}`, { signal: AbortSignal.timeout(8e3) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.balance == null) return 0n;
  return BigInt(j.balance);
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

export async function quotePool(amountRaw) {
  const whole = human(amountRaw);
  if (whole == null || whole < 8000000n) throw new Error("Минимум 8 USDC: комиссия вывода и обмена");
  const bridgeIn = whole - 1000000n;
  const key = bridgeIn.toString();
  const hit = quoteCache.get(key);
  if (hit && Date.now() - hit.at < 20000) return hit.value;
  const { gas, ton } = desk();
  const q = await symbiosis(bridgeIn, gas.address, ton.uq);
  const usdt = BigInt(q.tokenAmountOut.amount);
  const swap = await ston(usdt, ton.uq);
  const value = {
    ok: true,
    receive: dec(swap.ask, 9),
    minReceive: dec(swap.min, 9),
    payUsd: dec(whole, 6),
    recvUsd: dec(usdt, 6),
    rate: (Number(swap.ask) / 1e9 / (Number(whole) / 1e6)).toFixed(4),
    impact: "обмен USDC на GRAM",
    seconds: Number(q.estimatedTime) || 60,
    desk: gas.address,
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

async function credit(user, add) {
  await kv([
    ["INCRBY", "totum:gram:locked", add.toString()],
    ["HINCRBY", "totum:gram:bal", user, add.toString()],
  ]);
  return BigInt((await kv([["HGET", "totum:gram:bal", user]]))[0] || 0);
}

export async function armPool({ user, amount }) {
  if (!/^0x[0-9a-f]{40}$/.test(user)) throw new Error("Сначала подключите кошелёк, которым торгуете");
  const usdc = Number(amount);
  if (!(usdc >= 8)) throw new Error("Минимум 8 USDC");
  const { gas } = desk();
  const job = await jobOf(user);
  if (job && job.status !== "done" && Math.abs(Number(job.amount) - usdc) < 0.001) {
    return { ok: true, desk: gas.address, step: "Обмен уже идёт" };
  }
  await saveJob(user, { status: "wait", amount: usdc, withdraw: `arm:${Date.now()}`, started: Date.now() });
  return { ok: true, desk: gas.address, step: "Ждём, пока USDC выйдут со счёта" };
}

export async function stepPool({ user, amount, look }) {
  if (!/^0x[0-9a-f]{40}$/.test(user)) throw new Error("Сначала подключите кошелёк, которым торгуете");
  const usdc = Number(amount);
  if (!(usdc >= 8)) throw new Error("Минимум 8 USDC");
  const { gas, ton } = desk();
  let job = await jobOf(user);
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
  if (!job || Math.abs(Number(job.amount) - usdc) > 0.001) {
    const hit = await findWithdraw(user, usdc);
    if (!hit) return look ? { ok: true, idle: true, desk: gas.address, step: "" } : { ok: true, step: "Ждём, пока USDC выйдут со счёта", desk: gas.address };
    const id = hit.hash || String(hit.time);
    job = { status: "wait", amount: usdc, withdraw: id, started: Date.now() };
    await saveJob(user, job);
  }
  if (job.status === "wait" || job.status === "sending") {
    const usdtAlready = await usdtNano(ton.uq);
    if (usdtAlready >= 1000000n) {
      job = { ...job, status: "bridged", baseGram: job.baseGram || (await gramNano(ton.uq)).toString() };
      await saveJob(user, job);
    } else if (job.phase === "swap" && Date.now() - Number(job.sentAt || 0) < 25000) {
      return { ok: true, step: "Отправляем обмен", desk: gas.address };
    } else if (job.phase === "approve" && Date.now() - Number(job.sentAt || 0) < 15000) {
      return { ok: true, step: "Разрешаем перевод", desk: gas.address };
    } else {
      const bal = await usdcBalance(gas.address);
      if (job.status === "sending" && bal < 1000000n) {
        job = { ...job, status: "bridged", baseGram: job.baseGram || (await gramNano(ton.uq)).toString() };
        await saveJob(user, job);
      } else {
        const cap = BigInt(Math.round(usdc * 1e6));
        const sendAmt = bal > cap ? cap : bal;
        if (sendAmt < 5000000n) return { ok: true, step: "USDC ещё идут", desk: gas.address };
        const q = await symbiosis(sendAmt, gas.address, ton.uq);
        const spender = q.approveTo || q.tx.to;
        const allow = await usdcAllowance(gas.address, spender);
        if (allow < sendAmt) {
          job = { ...job, status: "sending", phase: "approve", sentAt: Date.now() };
          await saveJob(user, job);
          await sendCall({ to: USDC, data: encodeApprove(spender, sendAmt), gasLimit: 120000n });
          return { ok: true, step: "Разрешение дано. Отправляем обмен", desk: gas.address };
        }
        let limit = 1500000n;
        try { limit = await estimateGas({ from: gas.address, to: q.tx.to, data: q.tx.data }); } catch { /* запасной лимит */ }
        job = { ...job, status: "sending", phase: "swap", sentAt: Date.now() };
        await saveJob(user, job);
        const sent = await sendCall({ to: q.tx.to, data: q.tx.data, gasLimit: limit });
        job = { ...job, status: "bridged", tx: sent.hash, baseGram: (await gramNano(ton.uq)).toString() };
        await saveJob(user, job);
        return { ok: true, step: "Обмен идёт. Около минуты", desk: gas.address };
      }
    }
  }
  if (job.status === "bridged") {
    const usdt = await usdtNano(ton.uq);
    const now = await gramNano(ton.uq);
    const got = now - BigInt(job.baseGram || "0");
    if (usdt < 1000000n) {
      if (got >= 100000000n) {
        const yours = await credit(user, got);
        job = { ...job, status: "done", got: dec(got, 9), yours: dec(yours, 9) };
        await saveJob(user, job);
        return { ok: true, done: true, got: job.got, yours: job.yours, step: "Готово", desk: gas.address };
      }
      return { ok: true, step: "Обмен ещё идёт", desk: gas.address };
    }
    const swap = await ston(usdt, ton.uq);
    const msg = await loadSwap().gramBuy({ from: ton.uq, amount: usdt.toString(), minAsk: swap.min.toString() });
    await loadSwap().houseSend({ to: msg.address, amount: msg.amount, payload: msg.payload });
    job = { ...job, status: "swapping", baseGram: job.baseGram || now.toString() };
    await saveJob(user, job);
    return { ok: true, step: "Покупаем GRAM", desk: gas.address };
  }
  if (job.status === "swapping") {
    const now = await gramNano(ton.uq);
    const got = now - BigInt(job.baseGram || "0");
    if (got < 100000000n) return { ok: true, step: "GRAM ещё в пути", desk: gas.address };
    const yours = await credit(user, got);
    job = { ...job, status: "done", got: dec(got, 9), yours: dec(yours, 9) };
    await saveJob(user, job);
    return { ok: true, done: true, got: job.got, yours: job.yours, step: "Готово", desk: gas.address };
  }
  return { ok: true, step: "Мост идёт", desk: gas.address };
}
