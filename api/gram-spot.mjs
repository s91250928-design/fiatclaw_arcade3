import { createRequire } from "module";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const USDT = "EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs";
const GRAM = "EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c";

function loadSwap() {
  const file = join(dirname(fileURLToPath(import.meta.url)), "..", "lib", "gram-swap.cjs");
  const loaded = createRequire(import.meta.url)(file);
  if (typeof loaded.gramSwap !== "function" || typeof loaded.gramBuy !== "function") {
    throw new Error("обмен GRAM не загрузился");
  }
  return loaded;
}

function units(raw, decimals) {
  const t = String(raw ?? "").trim().replace(",", ".");
  if (!new RegExp(`^\\d+(\\.\\d{1,${decimals}})?$`).test(t)) return null;
  const [a, b = ""] = t.split(".");
  return BigInt(a) * 10n ** BigInt(decimals) + BigInt(b.padEnd(decimals, "0"));
}

function human(raw, decimals, dp = 4) {
  const n = Number(raw) / 10 ** decimals;
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString("ru-RU", { maximumFractionDigits: dp });
}

async function simulate(offer, ask, amount) {
  const url = new URL("https://api.ston.fi/v1/swap/simulate");
  url.searchParams.set("offer_address", offer);
  url.searchParams.set("ask_address", ask);
  url.searchParams.set("units", amount.toString());
  url.searchParams.set("slippage_tolerance", "0.01");
  const r = await fetch(url, { method: "POST", signal: AbortSignal.timeout(12e3) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.ask_units) throw new Error(j.error || "STON.fi не дал курс");
  return j;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const side = body.side === "sell" ? "sell" : "buy";
    const decimals = side === "buy" ? 6 : 9;
    const amount = units(body.amount, decimals);
    if (amount == null || amount <= 0n) throw new Error("Введите сумму");
    if (side === "buy" && amount < 1_000_000n) throw new Error("Минимум 1 USDT");
    if (side === "sell" && amount < 100_000_000n) throw new Error("Минимум 0.1 GRAM");
    const offer = side === "buy" ? USDT : GRAM;
    const ask = side === "buy" ? GRAM : USDT;
    const quote = await simulate(offer, ask, amount);
    const outDec = side === "buy" ? 9 : 6;
    const result = {
      ok: true,
      side,
      pay: human(amount, decimals),
      receive: human(quote.ask_units, outDec),
      minReceive: human(quote.min_ask_units, outDec),
      rate: quote.swap_rate,
      impact: quote.price_impact,
    };
    if (body.build && body.from) {
      const { gramBuy, gramSwap } = loadSwap();
      const built = side === "buy"
        ? await gramBuy({ from: body.from, amount: amount.toString(), minAsk: quote.min_ask_units })
        : await gramSwap({ from: body.from, amount: amount.toString(), minAsk: quote.min_ask_units });
      result.sign = built;
    }
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.status(200).send(JSON.stringify(result));
  } catch (err) {
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.status(400).send(JSON.stringify({ ok: false, error: err.message || "Не посчиталось" }));
  }
}
