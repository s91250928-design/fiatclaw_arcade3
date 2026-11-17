// USDT на TON делится на два перевода, оба подписывает человек.
// Основная часть → нативный USDC на его торговый адрес.
// 1.3 USDT → ETH на тот же адрес, чтобы хватило на комиссию сети.
// Сейчас это около $0.80. Если котировка выходит из $0.50–$1, подпись не отдаём.
// Сообщение в кошелёк отдаём только с его собственного кошелька USDT.

import { createRequire } from "module";

function loadGram() {
  const { gramSwap } = createRequire(import.meta.url)("../lib/gram-swap.cjs");
  return gramSwap;
}

const USDT = "0x9328Eb759596C38a25f59028B146Fecdc3621Dfe";
const USDC = "0xaf88d065e77c8cc2239327c5edb3a432268e5831";
const TON_USDT = "EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs";
const USDT_RAW = "0:b113a994b5024a16719f69139328eb759596c38a25f59028b146fecdc3621dfe";
const GAS_USDT = 1300000n;
const MIN = 22n * 1000000n;
const MAX = 5000n * 1000000n;
const GAS_CAP = 500000000n;

function units(raw, decimals = 6) {
  const t = String(raw ?? "").trim().replace(",", ".");
  if (!new RegExp(`^\\d+(\\.\\d{1,${decimals}})?$`).test(t)) return null;
  const [a, b = ""] = t.split(".");
  return BigInt(a) * 10n ** BigInt(decimals) + BigInt(b.padEnd(decimals, "0"));
}

function dec(amount, decimals) {
  const n = BigInt(amount);
  const d = 10n ** BigInt(decimals);
  const w = n / d;
  const f = (n % d).toString().padStart(Number(decimals), "0").replace(/0+$/, "");
  return f ? `${w}.${f}` : `${w}`;
}

async function tonRaw(friendly) {
  const r = await fetch(`https://tonapi.io/v2/accounts/${encodeURIComponent(friendly)}`, { signal: AbortSignal.timeout(8e3) });
  if (!r.ok) return "";
  const j = await r.json();
  return String(j.address || "").toLowerCase();
}

async function ownUsdtWallet(wallet, ownerFriendly) {
  const [data, owner] = await Promise.all([
    fetch(`https://tonapi.io/v2/blockchain/accounts/${encodeURIComponent(wallet)}/methods/get_wallet_data`, { signal: AbortSignal.timeout(8e3) }).then(r => r.ok ? r.json() : null).catch(() => null),
    tonRaw(ownerFriendly),
  ]);
  const d = data?.decoded;
  if (!d || !owner) return false;
  return String(d.jetton || "").toLowerCase() === USDT_RAW && String(d.owner || "").toLowerCase() === owner;
}

async function quote(amount, tokenOut, from, to) {
  const headers = { "content-type": "application/json" };
  if (process.env.SYMBIOSIS_KEY) headers["X-Api-Key"] = process.env.SYMBIOSIS_KEY;
  const r = await fetch("https://api.symbiosis.finance/crosschain/v2/quote", {
    method: "POST",
    headers,
    signal: AbortSignal.timeout(12e3),
    body: JSON.stringify({
      tokenAmountIn: {
        address: USDT, amount: amount.toString(), chainId: 85918, decimals: 6, symbol: "USDT",
        attributes: { ton: TON_USDT },
      },
      tokenOut, from, to, slippage: 100,
    }),
  });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, j };
}

async function signOf(j, to, from) {
  const msg = j.tx?.messages;
  let gas = null;
  try { if (msg?.length === 1) gas = BigInt(msg[0].amount || "0"); } catch { gas = null; }
  const payload = msg?.[0]?.payload || "";
  const until = Number(j.tx?.validUntil) || 0;
  const now = Math.floor(Date.now() / 1000);
  const hasAddr = payload && Buffer.from(payload, "base64").includes(Buffer.from(to.slice(2), "hex"));
  const fresh = until > now && until < now + 10 * 86400;
  if (!(gas > 0n && gas <= GAS_CAP && hasAddr && fresh && payload.length < 12000)) {
    return { signError: "Подпись закрыта: маршрут не прошёл проверку адреса" };
  }
  const wallet = String(msg[0].address || "");
  if (!/^(EQ|UQ)[A-Za-z0-9_-]{46}$/.test(wallet) || !await ownUsdtWallet(wallet, from)) {
    return { signError: "Подпись закрыта: перевод шёл не с вашего кошелька USDT" };
  }
  return { sign: { address: wallet, amount: gas.toString(), payload, validUntil: until } };
}

export default async function handler(req, res) {
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  if (req.method !== "POST") return res.status(405).send('{"error":"method"}');
  let b = req.body;
  if (!b || typeof b !== "object") {
    try { b = JSON.parse(req.body || "{}"); } catch { b = {}; }
  }
  const to = String(b.to || "").toLowerCase();
  const from = String(b.from || "").trim();
  if (!/^0x[0-9a-f]{40}$/.test(to)) return res.status(400).send('{"error":"Сначала подключите кошелёк, на котором торгуете"}');
  if (!/^(EQ|UQ)[A-Za-z0-9_-]{46}$/.test(from)) return res.status(400).send('{"error":"Подключите кошелёк, с которого списываем"}');
  if (b.asset === "gram") {
    const g = units(b.amount, 9);
    if (g == null || g < 25n * 1000000000n || g > 5000n * 1000000000n) return res.status(400).send('{"error":"Сумма от 25 до 5000 GRAM"}');
    let sim, s;
    try {
      sim = await fetch(`https://api.ston.fi/v1/swap/simulate?offer_address=EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c&ask_address=${encodeURIComponent(TON_USDT)}&units=${g}&slippage_tolerance=0.01&user_wallet_address=${encodeURIComponent(from)}`, { method: "POST", signal: AbortSignal.timeout(12e3) });
      s = await sim.json();
    } catch {
      return res.status(502).send('{"error":"Обмен GRAM не ответил. Деньги не уходили"}');
    }
    const ask = BigInt(s.ask_units || "0");
    const minAsk = BigInt(s.min_ask_units || "0");
    if (!sim.ok || ask < 22n * 1000000n) return res.status(422).send('{"error":"Этой суммы GRAM мало для зачисления"}');
    let sign;
    try {
      sign = await loadGram()({ from, amount: g.toString(), minAsk: minAsk.toString() });
    } catch (e) {
      const why = String(e?.message || e || "").replace(/\s+/g, " ").slice(0, 160);
      return res.status(422).send(JSON.stringify({ error: why ? `Обмен GRAM не собрался: ${why}` : "Обмен GRAM не собрался" }));
    }
    return res.status(200).send(JSON.stringify({ ok: true, step: "swap", from, to, askUsdt: dec(ask, 6), sign }));
  }
  const amt = units(b.amount);
  if (amt == null || amt < MIN || amt > MAX) return res.status(400).send('{"error":"Сумма от 22 до 5000 USDT"}');
  const trade = amt - GAS_USDT;

  let eth, usdc;
  try {
    eth = await quote(GAS_USDT, { chainId: 42161, address: "", symbol: "ETH", decimals: 18 }, from, to);
    usdc = await quote(trade, { chainId: 42161, address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", symbol: "USDC", decimals: 6 }, from, to);
  } catch {
    return res.status(502).send('{"error":"Мост сейчас не ответил. Деньги не уходили"}');
  }
  if (eth.status === 429 || usdc.status === 429) return res.status(429).send('{"error":"Слишком частые расчёты. Подождите минуту"}');

  const eOut = eth.j?.tokenAmountOut;
  const px = Number(eOut?.priceUsd || 0);
  const ethAmt = BigInt(eOut?.amount || "0");
  const ethUsd = Number(ethAmt) / 1e18 * px;
  if (eth.status !== 200 || eOut?.chainId !== 42161 || eOut?.address || eOut?.symbol !== "ETH" || !(ethUsd >= 0.5 && ethUsd <= 1.05)) {
    return res.status(422).send('{"error":"Сейчас не получилось посчитать зачисление. Попробуйте через минуту"}');
  }
  const uOut = usdc.j?.tokenAmountOut;
  if (usdc.status !== 200 || !uOut?.amount || uOut.chainId !== 42161 || String(uOut.address || "").toLowerCase() !== USDC) {
    const msg = usdc.j?.errors?.[0]?.message || usdc.j?.message || "Маршрут в USDC не посчитался";
    return res.status(422).send(JSON.stringify({ error: msg }));
  }

  const gasSign = await signOf(eth.j, to, from);
  const sign = await signOf(usdc.j, to, from);
  const min = usdc.j.tokenAmountOutMin?.amount ? dec(usdc.j.tokenAmountOutMin.amount, usdc.j.tokenAmountOutMin.decimals || 6) : null;
  res.status(200).send(JSON.stringify({
    ok: true,
    out: dec(uOut.amount, uOut.decimals || 6),
    min,
    seconds: Number(usdc.j.estimatedTime) || null,
    to, from,
    gasUsdt: dec(GAS_USDT, 6),
    tradeUsdt: dec(trade, 6),
    gasEth: dec(ethAmt, 18),
    gasUsd: ethUsd.toFixed(2),
    ...sign,
    gasSign: gasSign.sign || null,
    gasSignError: gasSign.signError || null,
  }));
}
