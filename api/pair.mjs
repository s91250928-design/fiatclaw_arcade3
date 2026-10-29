/* Totum · история связки «Totum ↔ биржа»: ставки фандинга и почасовые цены
   обеих сторон. Клиент из цен строит график спреда. f — [время, ставка за период],
   p — [время, цена закрытия часа]. */
const T = 8000;
const j = async (url, opt = {}) => {
  const r = await fetch(url, { ...opt, signal: AbortSignal.timeout(T), headers: { accept: "application/json", "user-agent": "totum-scanner/1.0", ...(opt.headers || {}) } });
  if (!r.ok) throw new Error(`${r.status} ${url.split("?")[0]}`);
  return r.json();
};
const n = (v) => (v === null || v === undefined || v === "" ? null : Number(v));
const hl = (body) => j("https://api.hyperliquid.xyz/info", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

const binLike = (host) => ({
  f: async (s, from) => (await j(`${host}/fapi/v1/fundingRate?symbol=${s}&startTime=${from}&limit=1000`)).map((x) => [n(x.fundingTime), n(x.fundingRate)]),
  p: async (s, from) => (await j(`${host}/fapi/v1/klines?symbol=${s}&interval=1h&startTime=${from}&limit=1000`)).map((x) => [n(x[0]), n(x[4])]),
});
const H = {
  binance: binLike("https://fapi.binance.com"),
  aster: binLike("https://fapi.asterdex.com"),
  bybit: {
    f: async (s, from) => ((await j(`https://api.bybit.com/v5/market/funding/history?category=linear&symbol=${s}&startTime=${from}&limit=200`))?.result?.list || []).map((x) => [n(x.fundingRateTimestamp), n(x.fundingRate)]),
    p: async (s, from) => ((await j(`https://api.bybit.com/v5/market/kline?category=linear&symbol=${s}&interval=60&start=${from}&limit=1000`))?.result?.list || []).map((x) => [n(x[0]), n(x[4])]),
  },
  okx: {
    f: async (s) => ((await j(`https://www.okx.com/api/v5/public/funding-rate-history?instId=${s}&limit=100`))?.data || []).map((x) => [n(x.fundingTime), n(x.realizedRate ?? x.fundingRate)]),
    p: async (s) => ((await j(`https://www.okx.com/api/v5/market/history-candles?instId=${s}&bar=1H&limit=100`))?.data || []).concat(((await j(`https://www.okx.com/api/v5/market/candles?instId=${s}&bar=1H&limit=300`).catch(() => null))?.data) || []).map((x) => [n(x[0]), n(x[4])]),
  },
  bitget: {
    f: async (s) => ((await j(`https://api.bitget.com/api/v2/mix/market/history-fund-rate?symbol=${s}&productType=USDT-FUTURES&pageSize=100`))?.data || []).map((x) => [n(x.fundingTime), n(x.fundingRate)]),
    p: async (s, from) => ((await j(`https://api.bitget.com/api/v2/mix/market/candles?symbol=${s}&productType=USDT-FUTURES&granularity=1H&startTime=${from}&limit=1000`))?.data || []).map((x) => [n(x[0]), n(x[4])]),
  },
  gate: {
    f: async (s) => (await j(`https://api.gateio.ws/api/v4/futures/usdt/funding_rate?contract=${s}&limit=200`)).map((x) => [n(x.t) * 1000, n(x.r)]),
    p: async (s, from) => (await j(`https://api.gateio.ws/api/v4/futures/usdt/candlesticks?contract=${s}&interval=1h&from=${Math.floor(from / 1000)}`)).map((x) => [n(x.t) * 1000, n(x.c)]),
  },
  mexc: {
    f: async (s) => ((await j(`https://contract.mexc.com/api/v1/contract/funding_rate/history?symbol=${s}&page_num=1&page_size=100`))?.data?.resultList || []).map((x) => [n(x.settleTime), n(x.fundingRate)]),
    p: async (s, from) => {
      const d = (await j(`https://contract.mexc.com/api/v1/contract/kline/${s}?interval=Min60&start=${Math.floor(from / 1000)}&end=${Math.floor(Date.now() / 1000)}`))?.data || {};
      return (d.time || []).map((t, k) => [t * 1000, n(d.close?.[k])]);
    },
  },
  kucoin: {
    f: async (s, from) => ((await j(`https://api-futures.kucoin.com/api/v1/contract/funding-rates?symbol=${s}&from=${from}&to=${Date.now()}`))?.data || []).map((x) => [n(x.timepoint), n(x.fundingRate)]),
    p: async (s, from) => ((await j(`https://api-futures.kucoin.com/api/v1/kline/query?symbol=${s}&granularity=60&from=${from}&to=${Date.now()}`))?.data || []).map((x) => [n(x[0]), n(x[4])]),
  },
  bingx: {
    f: async (s, from) => ((await j(`https://open-api.bingx.com/openApi/swap/v2/quote/fundingRate?symbol=${s}&startTime=${from}&limit=1000`))?.data || []).map((x) => [n(x.fundingTime), n(x.fundingRate)]),
    p: async (s, from) => ((await j(`https://open-api.bingx.com/openApi/swap/v3/quote/klines?symbol=${s}&interval=1h&startTime=${from}&limit=1000`))?.data || []).map((x) => (Array.isArray(x) ? [n(x[0]), n(x[4])] : [n(x.time), n(x.close)])),
  },
  dydx: {
    f: async (s, from) => ((await j(`https://indexer.dydx.trade/v4/historicalFunding/${s}?limit=200`))?.historicalFunding || []).map((x) => [Date.parse(x.effectiveAt), n(x.rate)]).filter((x) => x[0] >= from),
    p: async (s) => ((await j(`https://indexer.dydx.trade/v4/candles/perpetualMarkets/${s}?resolution=1HOUR&limit=200`))?.candles || []).map((x) => [Date.parse(x.startedAt), n(x.close)]),
  },
};

export default async function handler(req, res) {
  const q = req.query || {},
    v = String(q.v || ""),
    sym = String(q.sym || ""),
    coin = String(q.coin || ""),
    days = Math.min(30, Math.max(1, Number(q.days) || 7)),
    from = Date.now() - days * 864e5;
  if (!/^[\w.\-]{1,40}$/.test(sym) || !/^[\w.\-:]{1,40}$/.test(coin)) return res.status(400).json({ error: "bad-params" });
  const tasks = [
    hl({ type: "fundingHistory", coin, startTime: from }).then((r) => r.map((x) => [x.time, n(x.fundingRate)])),
    hl({ type: "candleSnapshot", req: { coin, interval: "1h", startTime: from, endTime: Date.now() } }).then((r) => r.map((x) => [x.t, n(x.c)])),
    H[v] ? H[v].f(sym, from) : Promise.reject(new Error("no-history")),
    H[v] ? H[v].p(sym, from) : Promise.reject(new Error("no-history")),
  ];
  const [a, b, c, d] = await Promise.allSettled(tasks);
  const ok = (r) => (r.status === "fulfilled" ? r.value.filter((x) => Number.isFinite(x[0]) && Number.isFinite(x[1]) && x[0] >= from - 36e5).sort((x, y) => x[0] - y[0]) : null);
  res.setHeader("cache-control", "public, s-maxage=300, stale-while-revalidate=600");
  res.status(200).json({
    t: Date.now(),
    hl: { f: ok(a), p: ok(b) },
    x: { f: ok(c), p: ok(d), err: [c, d].filter((r) => r.status === "rejected").map((r) => String(r.reason?.message || r.reason).slice(0, 120)) },
  });
}
