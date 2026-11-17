// Расчёт пополнения: USDT на TON → нативный USDC на Arbitrum.
// Только цифра. Calldata моста наружу не отдаём, перевод отсюда не уходит.
// Адрес получения — тот, что прислал терминал (торговый кошелёк), мы свой не подставляем.

const USDT = "0x9328Eb759596C38a25f59028B146Fecdc3621Dfe";
const USDC = "0xaf88d065e77c8cc2239327c5edb3a432268e5831";
const TON_USDT = "EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs";
const MIN = 20n * 1000000n;
const MAX = 5000n * 1000000n;

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
  const outAddr = String(out.address || "").toLowerCase();
  if (out.chainId !== 42161 || outAddr !== USDC) {
    return res.status(422).send('{"error":"Маршрут вёл не в нативный USDC на Arbitrum. Его не показываем"}');
  }
  const min = j.tokenAmountOutMin?.amount ? dec(j.tokenAmountOutMin.amount, j.tokenAmountOutMin.decimals || 6) : null;
  res.status(200).send(JSON.stringify({
    ok: true,
    out: dec(out.amount, out.decimals || 6),
    min,
    seconds: Number(j.estimatedTime) || null,
    to, from,
  }));
}
