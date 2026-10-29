/* Totum · сканер фандинга и цен по биржам (основная сеть).
   Сервер собирает публичные данные бирж (без ключей), приводит к одному виду
   и отдаёт сайту одним ответом. Кэш на 30 с, чтобы не упираться в лимиты бирж.
   Ставка — за один период выплаты биржи (ih — длина периода в часах). */
const T = 8000;
const j = async (url, opt = {}) => {
  const r = await fetch(url, { ...opt, signal: AbortSignal.timeout(T), headers: { accept: "application/json", "user-agent": "totum-scanner/1.0", ...(opt.headers || {}) } });
  if (!r.ok) throw new Error(`${r.status} ${url.split("?")[0]}`);
  return r.json();
};
const num = (v) => (v === null || v === undefined || v === "" ? null : Number(v));
const nextHour = () => Math.ceil(Date.now() / 36e5) * 36e5;
const usdt = (s, suf = "USDT") => (s.endsWith(suf) ? s.slice(0, -suf.length) : null);
/* 1000PEPE → PEPE и т.п.: множитель не трогаем в цене, но монета одна */
const baseOf = (b) => b.replace(/^(1000000|100000|10000|1000|1M)(?=[A-Z])/, "").replace(/^k(?=[A-Z])/, "");
/* во сколько монет один контракт: 1000PEPE → 1000, kPEPE → 1000 (нужно для сравнения цен) */
const multOf = (b) => {
  const m = /^(1000000|100000|10000|1000|1M|k)(?=[A-Z])/.exec(b);
  return !m ? 1 : m[1] === "1M" ? 1e6 : m[1] === "k" ? 1000 : Number(m[1]);
};

/* Binance и биржи с таким же API (Aster) */
async function binLike(host) {
    const [pi, fi, tk] = await Promise.all([
      j(`${host}/fapi/v1/premiumIndex`),
      j(`${host}/fapi/v1/fundingInfo`).catch(() => []),
      j(`${host}/fapi/v1/ticker/24hr`).catch(() => []),
    ]);
    const ih = Object.fromEntries(fi.map((x) => [x.symbol, num(x.fundingIntervalHours)]));
    const vol = Object.fromEntries(tk.map((x) => [x.symbol, num(x.quoteVolume)]));
    return pi.map((x) => {
      const b = usdt(x.symbol);
      if (!b || !num(x.nextFundingTime)) return null;
      return { sym: x.symbol, base: baseOf(b), rate: num(x.lastFundingRate), ih: ih[x.symbol] || 8, next: num(x.nextFundingTime), mark: num(x.markPrice), idx: num(x.indexPrice), vol: vol[x.symbol] ?? null, oi: null };
    });
  }

const VENUES = {
  hyperliquid: { name: "Totum", type: "dex", async load() {
    const [meta, ctx] = await j("https://api.hyperliquid.xyz/info", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "metaAndAssetCtxs" }) });
    return meta.universe.map((u, k) => {
      const c = ctx[k] || {};
      if (u.isDelisted) return null;
      const mark = num(c.markPx);
      return { sym: u.name, base: baseOf(u.name), rate: num(c.funding), ih: 1, next: nextHour(), mark, idx: num(c.oraclePx), vol: num(c.dayNtlVlm), oi: num(c.openInterest) * mark };
    });
  } },
  binance: { name: "Binance", type: "cex", load: () => binLike("https://fapi.binance.com") },
  aster: { name: "Aster", type: "dex", load: () => binLike("https://fapi.asterdex.com") },
  kucoin: { name: "KuCoin", type: "cex", async load() {
    const r = await j("https://api-futures.kucoin.com/api/v1/contracts/active");
    return (r?.data || []).map((x) => {
      if (x.quoteCurrency !== "USDT" || x.status !== "Open") return null;
      const b = x.baseCurrency === "XBT" ? "BTC" : x.baseCurrency;
      const gran = num(x.fundingRateGranularity);
      const nt = num(x.nextFundingRateDateTime) || (num(x.nextFundingRateTime) != null ? Date.now() + num(x.nextFundingRateTime) : null);
      const mark = num(x.markPrice);
      return { sym: x.symbol, base: baseOf(b), rate: num(x.fundingFeeRate), ih: gran ? gran / 36e5 : 8, next: nt, mark, idx: num(x.indexPrice), vol: num(x.turnoverOf24h), oi: num(x.openInterest) && num(x.multiplier) ? num(x.openInterest) * num(x.multiplier) * mark : null };
    });
  } },
  bingx: { name: "BingX", type: "cex", async load() {
    const [pi, tk] = await Promise.all([
      j("https://open-api.bingx.com/openApi/swap/v2/quote/premiumIndex"),
      j("https://open-api.bingx.com/openApi/swap/v2/quote/ticker").catch(() => null),
    ]);
    const t = Object.fromEntries((tk?.data || []).map((x) => [x.symbol, x]));
    return (pi?.data || []).map((x) => {
      const m = /^(.+)-USDT$/.exec(x.symbol || "");
      if (!m) return null;
      const k = t[x.symbol] || {};
      return { sym: x.symbol, base: baseOf(m[1]), rate: num(x.lastFundingRate), ih: num(x.fundingIntervalHours) || num(x.fundingRateInterval) || 8, next: num(x.nextFundingTime), mark: num(x.markPrice), idx: num(x.indexPrice), vol: num(k.quoteVolume), oi: null };
    });
  } },
  kraken: { name: "Kraken", type: "cex", async load() {
    const r = await j("https://futures.kraken.com/derivatives/api/v3/tickers");
    return (r?.tickers || []).map((x) => {
      const m = /^PF_(.+)USD$/.exec(x.symbol || "");
      if (!m || x.suspended) return null;
      const b = m[1] === "XBT" ? "BTC" : m[1],
        idx = num(x.indexPrice);
      /* у Kraken ставка — в долларах за монету в час; переводим в долю от цены */
      return { sym: x.symbol, base: baseOf(b), rate: num(x.fundingRate) != null && idx ? num(x.fundingRate) / idx : null, ih: 1, next: nextHour(), mark: num(x.markPrice), idx, vol: num(x.volumeQuote), oi: num(x.openInterest) * num(x.markPrice) };
    });
  } },
  htx: { name: "HTX", type: "cex", async load() {
    const [fr, tk] = await Promise.all([
      j("https://api.hbdm.com/linear-swap-api/v1/swap_batch_funding_rate"),
      j("https://api.hbdm.com/linear-swap-ex/market/detail/batch_merged?business_type=swap").catch(() => null),
    ]);
    const t = Object.fromEntries((tk?.ticks || []).map((x) => [x.contract_code, x]));
    return (fr?.data || []).map((x) => {
      const m = /^(.+)-USDT$/.exec(x.contract_code || "");
      if (!m) return null;
      const k = t[x.contract_code] || {},
        ft = num(x.funding_time), nt = num(x.next_funding_time);
      return { sym: x.contract_code, base: baseOf(m[1]), rate: num(x.funding_rate), ih: ft && nt && nt > ft ? (nt - ft) / 36e5 : 8, next: ft, mark: num(k.close), idx: null, vol: num(k.trade_turnover), oi: null };
    });
  } },
  whitebit: { name: "WhiteBIT", type: "cex", async load() {
    const r = await j("https://whitebit.com/api/v4/public/futures");
    return (r?.result || []).map((x) => {
      const m = /^(.+)_PERP$/.exec(x.ticker_id || "");
      if (!m || (x.money_currency && x.money_currency !== "USDT")) return null;
      const iv = num(x.funding_interval_minutes);
      return { sym: x.ticker_id, base: baseOf(m[1]), rate: num(x.funding_rate), ih: iv ? iv / 60 : 8, next: num(x.next_funding_rate_timestamp), mark: num(x.last_price), idx: num(x.index_price), vol: num(x.quote_volume), oi: num(x.open_interest) * num(x.last_price) || null };
    });
  } },
  weex: { name: "WEEX", type: "cex", async load() {
    const [tk, fr] = await Promise.all([
      j("https://api-contract.weex.com/capi/v2/market/tickers"),
      j("https://api-contract.weex.com/capi/v2/market/currentFundRate").catch(() => null),
    ]);
    const f = Object.fromEntries((Array.isArray(fr) ? fr : fr?.data || []).map((x) => [x.symbol, x]));
    return (Array.isArray(tk) ? tk : tk?.data || []).map((x) => {
      const m = /^cmt_(.+)usdt$/i.exec(x.symbol || "");
      if (!m) return null;
      const c = f[x.symbol] || {};
      const cyc = num(c.collectCycle);
      return { sym: x.symbol, base: baseOf(m[1].toUpperCase()), rate: num(c.fundingRate ?? x.fundingRate), ih: cyc ? (cyc > 24 ? cyc / 60 : cyc) : 8, next: num(c.nextFundingTime ?? c.timestamp), mark: num(x.markPrice) || num(x.last), idx: num(x.indexPrice), vol: num(x.volume_24h), oi: null };
    });
  } },
  ourbit: { name: "Ourbit", type: "cex", async load() {
    const [tk, fr] = await Promise.all([
      j("https://futures.ourbit.com/api/v1/contract/ticker"),
      j("https://futures.ourbit.com/api/v1/contract/funding_rate").catch(() => null),
    ]);
    const iv = Object.fromEntries((Array.isArray(fr?.data) ? fr.data : []).map((x) => [x.symbol, x]));
    return (tk?.data || []).map((x) => {
      const m = /^(.+)_USDT$/.exec(x.symbol || "");
      if (!m) return null;
      const c = iv[x.symbol] || {};
      return { sym: x.symbol, base: baseOf(m[1]), rate: num(x.fundingRate), ih: num(c.collectCycle) || 8, next: num(c.nextSettleTime), mark: num(x.fairPrice) || num(x.lastPrice), idx: num(x.indexPrice), vol: num(x.amount24), oi: null };
    });
  } },
  paradex: { name: "Paradex", type: "dex", async load() {
    const r = await j("https://api.prod.paradex.trade/v1/markets/summary?market=ALL");
    return (r?.results || []).map((x) => {
      const m = /^(.+)-USD-PERP$/.exec(x.symbol || "");
      if (!m) return null;
      return { sym: x.symbol, base: baseOf(m[1]), rate: num(x.funding_rate), ih: 8, next: null, mark: num(x.mark_price), idx: num(x.underlying_price), vol: num(x.volume_24h), oi: num(x.open_interest) * num(x.mark_price) || null };
    });
  } },
  bybit: { name: "Bybit", type: "cex", async load() {
    const tk = await j("https://api.bybit.com/v5/market/tickers?category=linear");
    const iv = {};
    let cursor = "";
    for (let n = 0; n < 5; n++) {
      const r = await j(`https://api.bybit.com/v5/market/instruments-info?category=linear&limit=1000${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`).catch(() => null);
      for (const x of r?.result?.list || []) iv[x.symbol] = num(x.fundingInterval);
      cursor = r?.result?.nextPageCursor;
      if (!cursor) break;
    }
    return (tk?.result?.list || []).map((x) => {
      const b = usdt(x.symbol);
      if (!b || x.fundingRate === "") return null;
      return { sym: x.symbol, base: baseOf(b), rate: num(x.fundingRate), ih: iv[x.symbol] ? iv[x.symbol] / 60 : 8, next: num(x.nextFundingTime), mark: num(x.markPrice), idx: num(x.indexPrice), vol: num(x.turnover24h), oi: num(x.openInterestValue) };
    });
  } },
  okx: { name: "OKX", type: "cex", async load() {
    const [fr, tk] = await Promise.all([
      j("https://www.okx.com/api/v5/public/funding-rate?instId=ANY"),
      j("https://www.okx.com/api/v5/market/tickers?instType=SWAP").catch(() => null),
    ]);
    const t = Object.fromEntries((tk?.data || []).map((x) => [x.instId, x]));
    return (fr?.data || []).map((x) => {
      const m = /^(.+)-USDT-SWAP$/.exec(x.instId || "");
      if (!m) return null;
      const ft = num(x.fundingTime), nt = num(x.nextFundingTime), k = t[x.instId] || {};
      const last = num(k.last);
      return { sym: x.instId, base: baseOf(m[1]), rate: num(x.fundingRate), ih: ft && nt && nt > ft ? (nt - ft) / 36e5 : 8, next: ft, mark: last, vol: num(k.volCcy24h) && last ? num(k.volCcy24h) * last : null, oi: null };
    });
  } },
  bitget: { name: "Bitget", type: "cex", async load() {
    const [tk, cf] = await Promise.all([
      j("https://api.bitget.com/api/v2/mix/market/tickers?productType=USDT-FUTURES"),
      j("https://api.bitget.com/api/v2/mix/market/current-fund-rate?productType=USDT-FUTURES").catch(() => null),
    ]);
    const iv = Object.fromEntries((cf?.data || []).map((x) => [x.symbol, x]));
    return (tk?.data || []).map((x) => {
      const b = usdt(x.symbol);
      if (!b) return null;
      const c = iv[x.symbol] || {};
      return { sym: x.symbol, base: baseOf(b), rate: num(x.fundingRate), ih: num(c.fundingRateInterval) || 8, next: num(c.nextUpdate), mark: num(x.markPrice) || num(x.lastPr), idx: num(x.indexPrice), vol: num(x.usdtVolume) || num(x.quoteVolume), oi: num(x.holdingAmount) && num(x.lastPr) ? num(x.holdingAmount) * num(x.lastPr) : null };
    });
  } },
  gate: { name: "Gate", type: "cex", async load() {
    const [cs, tk] = await Promise.all([
      j("https://api.gateio.ws/api/v4/futures/usdt/contracts"),
      j("https://api.gateio.ws/api/v4/futures/usdt/tickers").catch(() => []),
    ]);
    const t = Object.fromEntries(tk.map((x) => [x.contract, x]));
    return cs.map((x) => {
      const m = /^(.+)_USDT$/.exec(x.name || "");
      if (!m || x.in_delisting) return null;
      const k = t[x.name] || {};
      return { sym: x.name, base: baseOf(m[1]), rate: num(x.funding_rate), ih: num(x.funding_interval) ? num(x.funding_interval) / 3600 : 8, next: num(x.funding_next_apply) ? num(x.funding_next_apply) * 1000 : null, mark: num(x.mark_price), idx: num(x.index_price), vol: num(k.volume_24h_quote) || num(k.volume_24h_settle), oi: null };
    });
  } },
  mexc: { name: "MEXC", type: "cex", async load() {
    const [tk, fr] = await Promise.all([
      j("https://contract.mexc.com/api/v1/contract/ticker"),
      j("https://contract.mexc.com/api/v1/contract/funding_rate").catch(() => null),
    ]);
    const iv = Object.fromEntries((Array.isArray(fr?.data) ? fr.data : []).map((x) => [x.symbol, x]));
    return (tk?.data || []).map((x) => {
      const m = /^(.+)_USDT$/.exec(x.symbol || "");
      if (!m) return null;
      const c = iv[x.symbol] || {};
      return { sym: x.symbol, base: baseOf(m[1]), rate: num(x.fundingRate), ih: num(c.collectCycle) || 8, next: num(c.nextSettleTime), mark: num(x.fairPrice) || num(x.lastPrice), idx: num(x.indexPrice), vol: num(x.amount24), oi: null };
    });
  } },
  dydx: { name: "dYdX", type: "dex", async load() {
    const r = await j("https://indexer.dydx.trade/v4/perpetualMarkets");
    return Object.values(r?.markets || {}).map((x) => {
      const m = /^(.+)-USD$/.exec(x.ticker || "");
      if (!m || x.status !== "ACTIVE") return null;
      const p = num(x.oraclePrice);
      return { sym: x.ticker, base: baseOf(m[1]), rate: num(x.nextFundingRate), ih: 1, next: nextHour(), mark: p, idx: p, vol: num(x.volume24H), oi: num(x.openInterest) * p };
    });
  } },
};

/* «сырой» тикер без котировки: 1000PEPEUSDT → 1000PEPE, cmt_1000pepeusdt → 1000PEPE, kPEPE → kPEPE */
const rawBase = (sym) => {
  let s = String(sym || "");
  /^cmt_/i.test(s) && (s = s.slice(4).toUpperCase());
  return s.replace(/^PF_/, "").replace(/(USDTM|-USDT-SWAP|[-_]USDT|USDT|-USD-PERP|-USD|_PERP|USD)$/, "");
};
let CACHE = null;
export default async function handler(req, res) {
  const debug = String(req.query?.debug || "") === "1";
  if (!debug && CACHE && Date.now() - CACHE.t < 25e3) return send(res, CACHE);
  const ids = Object.keys(VENUES);
  const out = await Promise.allSettled(ids.map((id) => VENUES[id].load()));
  const venues = [],
    rows = [];
  out.forEach((r, k) => {
    const id = ids[k],
      v = VENUES[id];
    if (r.status === "fulfilled") {
      const list = (r.value || []).filter((x) => x && x.base && Number.isFinite(x.rate));
      list.forEach((x) => rows.push({ v: id, ...x, mult: multOf(rawBase(x.sym)) }));
      venues.push({ id, name: v.name, type: v.type, ok: list.length > 0, n: list.length, sample: debug ? list.slice(0, 2) : undefined });
    } else venues.push({ id, name: v.name, type: v.type, ok: !1, n: 0, err: String(r.reason?.message || r.reason).slice(0, 160) });
  });
  const body = { t: Date.now(), venues, rows };
  rows.length && (CACHE = body);
  send(res, debug ? { t: body.t, venues } : body);
}
function send(res, body) {
  res.setHeader("cache-control", "public, s-maxage=30, stale-while-revalidate=60");
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.status(200).send(JSON.stringify(body));
}
