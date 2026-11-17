// USDT на TON → нативный USDC на Arbitrum, затем человек сам зачисляет его на Hyperliquid.
// Сервер не шлёт транзакцию. Подпись в Tonkeeper отдаём только если:
//  сообщение одно, это кошелёк USDT самого человека, газ мелкий,
//  а его торговый адрес лежит внутри тела перевода.

const USDT = "0x9328Eb759596C38a25f59028B146Fecdc3621Dfe";
const USDC = "0xaf88d065e77c8cc2239327c5edb3a432268e5831";
const TON_USDT = "EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs";
const USDT_RAW = "0:b113a994b5024a16719f69139328eb759596c38a25f59028b146fecdc3621dfe";
const MIN = 20n * 1000000n;
const MAX = 5000n * 1000000n;
const GAS_CAP = 500000000n;

function units(raw) {
  const t = String(raw ?? "").trim().replace(",", ".");
  if (!/^\d+(\.\d{1,6})?$/.test(t)) return null;
  const [a, b = ""] = t.split(".");
  return BigInt(a) * 1000000n + BigInt(b.padEnd(6, "0"));
}

function dec(amount, decimals) {
  const n = BigInt(amount);
  const d = 10n ** BigInt(decimals);
  const w = n / d;
  const f = (n % d).toString().padStart(decimals, "0").replace(/0+$/, "");
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
  if (!/^(EQ|UQ)[A-Za-z0-9_-]{46}$/.test(from)) return res.status(400).send('{"error":"Нужен адрес Tonkeeper, с которого спишут USDT"}');
  const amt = units(b.amount);
  if (amt == null || amt < MIN || amt > MAX) return res.status(400).send('{"error":"Сумма от 20 до 5000 USDT. Меньше съест комиссия моста"}');

  const headers = { "content-type": "application/json" };
  if (process.env.SYMBIOSIS_KEY) headers["X-Api-Key"] = process.env.SYMBIOSIS_KEY;
  let r, j;
  try {
    r = await fetch("https://api.symbiosis.finance/crosschain/v2/quote", {
      method: "POST",
      headers,
      signal: AbortSignal.timeout(12e3),
      body: JSON.stringify({
        tokenAmountIn: {
          address: USDT, amount: amt.toString(), chainId: 85918, decimals: 6, symbol: "USDT",
          attributes: { ton: TON_USDT },
        },
        tokenOut: { chainId: 42161, address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", symbol: "USDC", decimals: 6 },
        from, to, slippage: 100,
      }),
    });
    j = await r.json();
  } catch {
    return res.status(502).send('{"error":"Мост сейчас не ответил. Деньги не уходили"}');
  }
  if (r.status === 429) return res.status(429).send('{"error":"Слишком частые расчёты. Подождите минуту"}');
  if (!r.ok || !j?.tokenAmountOut?.amount) {
    const msg = j?.errors?.[0]?.message || j?.message || "Маршрут не посчитался";
    return res.status(422).send(JSON.stringify({ error: msg }));
  }
  const out = j.tokenAmountOut;
  if (out.chainId !== 42161 || String(out.address || "").toLowerCase() !== USDC) {
    return res.status(422).send('{"error":"Маршрут вёл не в нативный USDC на Arbitrum. Его не показываем"}');
  }
  const min = j.tokenAmountOutMin?.amount ? dec(j.tokenAmountOutMin.amount, j.tokenAmountOutMin.decimals || 6) : null;
  const body = { ok: true, out: dec(out.amount, out.decimals || 6), min, seconds: Number(j.estimatedTime) || null, to, from };

  const msg = j.tx?.messages;
  let gas = null;
  try { if (msg?.length === 1) gas = BigInt(msg[0].amount || "0"); } catch { gas = null; }
  const payload = msg?.[0]?.payload || "";
  const until = Number(j.tx?.validUntil) || 0;
  const now = Math.floor(Date.now() / 1000);
  const hasAddr = payload && Buffer.from(payload, "base64").includes(Buffer.from(to.slice(2), "hex"));
  const fresh = until > now && until < now + 10 * 86400;
  if (gas != null && gas > 0n && gas <= GAS_CAP && hasAddr && fresh && payload.length < 12000) {
    const wallet = String(msg[0].address || "");
    if (/^(EQ|UQ)[A-Za-z0-9_-]{46}$/.test(wallet) && await ownUsdtWallet(wallet, from)) {
      body.sign = { address: wallet, amount: gas.toString(), payload, validUntil: until };
    } else body.signError = "Подпись закрыта: перевод шёл не с вашего кошелька USDT";
  } else body.signError = "Подпись закрыта: маршрут не прошёл проверку адреса";

  res.status(200).send(JSON.stringify(body));
}
