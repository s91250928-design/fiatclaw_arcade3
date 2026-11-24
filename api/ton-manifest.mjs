import { createRequire } from "module";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const NATIVE = "EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c";
const ADDR = /^EQ[A-Za-z0-9_-]{46}$/;
const WALLET = /^[EU]Q[A-Za-z0-9_-]{46}$/;

function loadSwap() {
  const file = join(dirname(fileURLToPath(import.meta.url)), "..", "lib", "gram-swap.cjs");
  const loaded = createRequire(import.meta.url)(file);
  if (typeof loaded.gramSwap !== "function" || typeof loaded.gramBuy !== "function" || typeof loaded.tonSwap !== "function") {
    throw new Error("обмен не загрузился");
  }
  return loaded;
}

function units(raw, decimals) {
  const t = String(raw ?? "").trim().replace(",", ".");
  if (!new RegExp(`^\\d+(\\.\\d{1,${decimals}})?$`).test(t)) return null;
  const [a, b = ""] = t.split(".");
  return BigInt(a) * 10n ** BigInt(decimals) + BigInt(b.padEnd(decimals, "0"));
}

function human(raw, decimals) {
  const n = Number(raw) / 10 ** decimals;
  if (!Number.isFinite(n)) return "0";
  const dp = n >= 1000 ? 2 : n >= 1 ? 4 : n >= 0.0001 ? 6 : 8;
  return n.toLocaleString("ru-RU", { maximumFractionDigits: dp });
}

function money(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "";
  return x.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function normAsset(raw) {
  const a = raw?.asset || raw;
  if (!a || a.blacklisted || a.deprecated || a.taxable) return null;
  const meta = a.meta || a;
  const tags = a.tags || [];
  const verified = a.default_symbol || tags.includes("default_symbol") || tags.includes("asset:default_symbol");
  if (!verified) return null;
  const address = a.contract_address;
  if (!ADDR.test(address || "")) return null;
  let symbol = String(meta.symbol || "");
  if (symbol === "USD₮") symbol = "USDT";
  if (!symbol || symbol.length > 16) return null;
  const decimals = Number(meta.decimals);
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) return null;
  const price = Number(a.dex_price_usd || a.dex_usd_price || a.third_party_usd_price);
  const imageUrl = meta.image_url || a.image_url || "";
  return {
    address,
    symbol,
    name: String(meta.display_name || symbol).slice(0, 48),
    decimals,
    kind: a.kind === "Ton" ? "Ton" : "Jetton",
    image: address === NATIVE || !String(imageUrl).startsWith("https://asset.ston.fi/") ? "" : imageUrl,
    price: Number.isFinite(price) && price > 0 ? price : null,
    native: address === NATIVE,
  };
}

let popularCache = { at: 0, list: [] };

async function queryAssets(body) {
  const r = await fetch("https://api.ston.fi/v1/assets/query", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(12e3),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error("Список токенов не пришёл");
  const seen = new Set();
  const list = [];
  for (const raw of j.asset_list || []) {
    const a = normAsset(raw);
    if (!a || seen.has(a.address)) continue;
    seen.add(a.address);
    list.push(a);
  }
  list.sort((a, b) => (a.native ? -2 : a.symbol === "USDT" ? -1 : 0) - (b.native ? -2 : b.symbol === "USDT" ? -1 : 0));
  return list;
}

async function popularAssets() {
  if (popularCache.list.length && Date.now() - popularCache.at < 60_000) return popularCache.list;
  const list = await queryAssets({ condition: "asset:popular" });
  popularCache = { at: Date.now(), list };
  return list;
}

async function getAsset(address) {
  if (!ADDR.test(address || "")) throw new Error("Токен не найден");
  const r = await fetch(`https://api.ston.fi/v1/assets/${address}`, { signal: AbortSignal.timeout(12e3) });
  const j = await r.json().catch(() => ({}));
  const a = normAsset(j.asset || j);
  if (!r.ok || !a) throw new Error("Этот токен нельзя обменять");
  return a;
}

async function simulate(offer, ask, amount) {
  const url = new URL("https://api.ston.fi/v1/swap/simulate");
  url.searchParams.set("offer_address", offer);
  url.searchParams.set("ask_address", ask);
  url.searchParams.set("units", amount.toString());
  url.searchParams.set("slippage_tolerance", "0.01");
  const r = await fetch(url, { method: "POST", signal: AbortSignal.timeout(12e3) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.ask_units) throw new Error(j.error || "Курс не пришёл");
  return j;
}

function addrHash(s) {
  const text = String(s || "");
  const raw = text.match(/^-?\d+:([0-9a-fA-F]{64})$/);
  if (raw) return raw[1].toLowerCase();
  try {
    const buf = Buffer.from(text.replace(/-/g, "+").replace(/_/g, "/"), "base64");
    if (buf.length === 36) return buf.subarray(2, 34).toString("hex");
  } catch { /* не адрес */ }
  return "";
}

async function walletBalances(from) {
  if (!WALLET.test(from)) throw new Error("Адрес TON неверный");
  const [accR, jetR] = await Promise.all([
    fetch(`https://tonapi.io/v2/accounts/${encodeURIComponent(from)}`, { signal: AbortSignal.timeout(8e3) }),
    fetch(`https://tonapi.io/v2/accounts/${encodeURIComponent(from)}/jettons`, { signal: AbortSignal.timeout(8e3) }),
  ]);
  const acc = await accR.json().catch(() => ({}));
  const jets = await jetR.json().catch(() => ({}));
  if (!accR.ok) throw new Error("Баланс кошелька не пришёл");
  const assets = await popularAssets().catch(() => []);
  const byHash = new Map(assets.map((a) => [addrHash(a.address), a.address]));
  const balances = [{ address: NATIVE, amount: String(acc.balance || "0") }];
  for (const row of jets.balances || []) {
    const address = byHash.get(addrHash(row.jetton?.address));
    if (address) balances.push({ address, amount: String(row.balance || "0") });
  }
  return balances;
}

async function chart(address, days) {
  const asset = await getAsset(address);
  const end = Math.floor(Date.now() / 1000);
  const start = end - days * 86400;
  const token = asset.native ? "ton" : asset.address;
  const url = new URL("https://tonapi.io/v2/rates/chart");
  url.searchParams.set("token", token);
  url.searchParams.set("currency", "usd");
  url.searchParams.set("start_date", String(start));
  url.searchParams.set("end_date", String(end));
  url.searchParams.set("points_count", days === 1 ? "48" : "84");
  const r = await fetch(url, { signal: AbortSignal.timeout(12e3) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !Array.isArray(j.points)) throw new Error("График не пришёл");
  const points = j.points
    .map((p) => [Number(p[0]), Number(p[1])])
    .filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]) && p[1] > 0)
    .sort((a, b) => a[0] - b[0])
    .map((p) => p[1]);
  return { ok: true, symbol: asset.symbol, points };
}

async function quoteSwap(body) {
  const offer = await getAsset(body.offer);
  const ask = await getAsset(body.ask);
  if (offer.address === ask.address) throw new Error("Выберите два разных токена");
  const amount = units(body.amount, offer.decimals);
  if (amount == null || amount <= 0n) throw new Error("Введите сумму");
  const humanAmt = Number(String(body.amount).trim().replace(",", "."));
  if (offer.price && humanAmt * offer.price < 0.99) throw new Error("Минимум около 1 USD");
  if (!offer.price && offer.native && humanAmt < 0.1) throw new Error("Минимум 0.1 GRAM");
  const quote = await simulate(offer.address, ask.address, amount);
  const impact = Number(quote.price_impact) * 100;
  const impactText = !Number.isFinite(impact) ? "—" : impact > 0 && impact < 0.01 ? "< 0,01%" : `${impact.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}%`;
  const result = {
    ok: true,
    pay: human(amount, offer.decimals),
    receive: human(quote.ask_units, ask.decimals),
    minReceive: human(quote.min_ask_units, ask.decimals),
    rate: quote.swap_rate,
    impact: impactText,
    payUsd: offer.price ? money(humanAmt * offer.price) : "",
    recvUsd: ask.price ? money(Number(quote.ask_units) / 10 ** ask.decimals * ask.price) : "",
    paySymbol: offer.symbol,
    askSymbol: ask.symbol,
  };
  if (body.build) {
    if (!WALLET.test(body.from || "")) throw new Error("Сначала выбери TON-кошелёк");
    const { tonSwap } = loadSwap();
    result.sign = await tonSwap({
      from: body.from,
      offer: offer.address,
      ask: ask.address,
      amount: amount.toString(),
      minAsk: quote.min_ask_units,
      router: quote.router,
    });
  }
  return result;
}

async function legacyGram(body) {
  const side = body.side === "sell" ? "sell" : "buy";
  const decimals = side === "buy" ? 6 : 9;
  const amount = units(body.amount, decimals);
  if (amount == null || amount <= 0n) throw new Error("Введите сумму");
  if (side === "buy" && amount < 1_000_000n) throw new Error("Минимум 1 USDT");
  if (side === "sell" && amount < 100_000_000n) throw new Error("Минимум 0.1 GRAM");
  const usdt = "EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs";
  const quote = await simulate(side === "buy" ? usdt : NATIVE, side === "buy" ? NATIVE : usdt, amount);
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
    result.sign = side === "buy"
      ? await gramBuy({ from: body.from, amount: amount.toString(), minAsk: quote.min_ask_units })
      : await gramSwap({ from: body.from, amount: amount.toString(), minAsk: quote.min_ask_units });
  }
  return result;
}

function manifest(req, res) {
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim();
  const proto = String(req.headers["x-forwarded-proto"] || "https").split(",")[0].trim();
  const origin = host ? `${proto}://${host}` : "";
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("access-control-allow-origin", "*");
  res.status(200).send(JSON.stringify({
    url: origin,
    name: "Totum",
    iconUrl: origin ? `${origin}/icon.png` : "",
  }));
}

function send(res, status, body) {
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.status(status).send(JSON.stringify(body));
}

export default async function handler(req, res) {
  if (req.method !== "POST") return manifest(req, res);
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    if (body.kind === "gram-spot") return send(res, 200, await legacyGram(body));
    if (body.kind !== "ton-swap") return manifest(req, res);
    if (body.action === "assets") {
      const q = String(body.q || "").trim().slice(0, 32);
      const list = q
        ? (await queryAssets({ condition: "asset:default_symbol", search_terms: [q] }))
          .filter((a) => `${a.symbol} ${a.name}`.toLowerCase().includes(q.toLowerCase()))
          .slice(0, 40)
        : await popularAssets();
      return send(res, 200, { ok: true, assets: list });
    }
    if (body.action === "chart") {
      const days = Number(body.days) === 7 ? 7 : 1;
      return send(res, 200, await chart(body.address, days));
    }
    if (body.action === "balance") return send(res, 200, { ok: true, balances: await walletBalances(body.from) });
    if (body.action === "quote") return send(res, 200, await quoteSwap(body));
    throw new Error("Неизвестный запрос");
  } catch (err) {
    send(res, 400, { ok: false, error: err.message || "Не посчиталось" });
  }
}
