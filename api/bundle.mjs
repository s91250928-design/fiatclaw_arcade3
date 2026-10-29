/* Totum · окно связки «Totum ↔ биржа».
   ?k=hist&v&sym&coin&i=1m|5m|15m|1h — цены закрытия обеих сторон (≈1000 свечей)
                                       и история ставок фандинга за тот же период;
   ?k=book&v&sym&coin               — стаканы обеих сторон (20 уровней, объём в монетах). */
const T = 8000;
const j = async (url, opt = {}) => {
  const r = await fetch(url, { ...opt, signal: AbortSignal.timeout(T), headers: { accept: "application/json", "user-agent": "totum-scanner/1.0", ...(opt.headers || {}) } });
  if (!r.ok) throw new Error(`${r.status} ${url.split("?")[0]}`);
  return r.json();
};
const n = (v) => (v === null || v === undefined || v === "" ? null : Number(v));
const hl = (body) => j("https://api.hyperliquid.xyz/info", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const MIN = { "1m": 1, "5m": 5, "15m": 15, "1h": 60 };
const lv = (a, f = (x) => [x[0], x[1]]) => (a || []).map(f).map(([p, q]) => [n(p), n(q)]).filter(([p, q]) => p > 0 && q > 0);

/* сколько монет в одном контракте (у части бирж стакан в контрактах) */
const CT = new Map();
const ctSize = async (key, load) => {
  const c = CT.get(key);
  if (c && Date.now() - c.t < 36e5) return c.v;
  const v = Number(await load().catch(() => 1)) || 1;
  CT.set(key, { t: Date.now(), v });
  return v;
};
const scale = (b, k) => ({ b: b.b.map(([p, q]) => [p, q * k]), a: b.a.map(([p, q]) => [p, q * k]), ct: k });

const binLike = (host) => ({
  f: async (s, from) => (await j(`${host}/fapi/v1/fundingRate?symbol=${s}&startTime=${from}&limit=1000`)).map((x) => [n(x.fundingTime), n(x.fundingRate)]),
  c: async (s, i) => (await j(`${host}/fapi/v1/klines?symbol=${s}&interval=${i}&limit=1000`)).map((x) => [n(x[0]), n(x[1]), n(x[2]), n(x[3]), n(x[4])]),
  b: async (s) => {
    const d = await j(`${host}/fapi/v1/depth?symbol=${s}&limit=20`);
    return { b: lv(d.bids), a: lv(d.asks) };
  },
});
const mexcLike = (host) => ({
  f: async (s) => ((await j(`${host}/api/v1/contract/funding_rate/history?symbol=${s}&page_num=1&page_size=100`))?.data?.resultList || []).map((x) => [n(x.settleTime), n(x.fundingRate)]),
  c: async (s, i) => {
    const m = MIN[i],
      end = Math.floor(Date.now() / 1000);
    const d = (await j(`${host}/api/v1/contract/kline/${s}?interval=Min${m}&start=${end - m * 60 * 1000}&end=${end}`))?.data || {};
    return (d.time || []).map((t, k) => [t * 1000, n(d.open?.[k]), n(d.high?.[k]), n(d.low?.[k]), n(d.close?.[k])]);
  },
  b: async (s) => {
    const [d, k] = await Promise.all([j(`${host}/api/v1/contract/depth/${s}?limit=20`), ctSize(`${host}|${s}`, async () => (await j(`${host}/api/v1/contract/detail?symbol=${s}`))?.data?.contractSize)]);
    return scale({ b: lv(d?.data?.bids), a: lv(d?.data?.asks) }, k);
  },
});
export const H = {
  binance: binLike("https://fapi.binance.com"),
  aster: binLike("https://fapi.asterdex.com"),
  mexc: mexcLike("https://contract.mexc.com"),
  ourbit: mexcLike("https://futures.ourbit.com"),
  bybit: {
    f: async (s, from) => ((await j(`https://api.bybit.com/v5/market/funding/history?category=linear&symbol=${s}&startTime=${from}&endTime=${Date.now()}&limit=200`))?.result?.list || []).map((x) => [n(x.fundingRateTimestamp), n(x.fundingRate)]),
    c: async (s, i) => ((await j(`https://api.bybit.com/v5/market/kline?category=linear&symbol=${s}&interval=${MIN[i]}&limit=1000`))?.result?.list || []).map((x) => [n(x[0]), n(x[1]), n(x[2]), n(x[3]), n(x[4])]),
    b: async (s) => {
      const d = (await j(`https://api.bybit.com/v5/market/orderbook?category=linear&symbol=${s}&limit=25`))?.result || {};
      return { b: lv(d.b), a: lv(d.a) };
    },
  },
  okx: {
    f: async (s) => ((await j(`https://www.okx.com/api/v5/public/funding-rate-history?instId=${s}&limit=100`))?.data || []).map((x) => [n(x.fundingTime), n(x.realizedRate ?? x.fundingRate)]),
    c: async (s, i) => {
      const bar = i === "1h" ? "1H" : i;
      let out = (await j(`https://www.okx.com/api/v5/market/candles?instId=${s}&bar=${bar}&limit=300`))?.data || [];
      for (let p = 0; p < 4 && out.length; p++) {
        const old = out[out.length - 1][0];
        const more = (await j(`https://www.okx.com/api/v5/market/history-candles?instId=${s}&bar=${bar}&after=${old}&limit=100`).catch(() => null))?.data || [];
        if (!more.length) break;
        out = out.concat(more);
      }
      return out.map((x) => [n(x[0]), n(x[1]), n(x[2]), n(x[3]), n(x[4])]);
    },
    b: async (s) => {
      const [d, k] = await Promise.all([
        j(`https://www.okx.com/api/v5/market/books?instId=${s}&sz=20`),
        ctSize(`okx|${s}`, async () => (await j(`https://www.okx.com/api/v5/public/instruments?instType=SWAP&instId=${s}`))?.data?.[0]?.ctVal),
      ]);
      const x = d?.data?.[0] || {};
      return scale({ b: lv(x.bids), a: lv(x.asks) }, k);
    },
  },
  bitget: {
    f: async (s) => ((await j(`https://api.bitget.com/api/v2/mix/market/history-fund-rate?symbol=${s}&productType=USDT-FUTURES&pageSize=100`))?.data || []).map((x) => [n(x.fundingTime), n(x.fundingRate)]),
    c: async (s, i) => ((await j(`https://api.bitget.com/api/v2/mix/market/candles?symbol=${s}&productType=USDT-FUTURES&granularity=${i === "1h" ? "1H" : i}&limit=1000`))?.data || []).map((x) => [n(x[0]), n(x[1]), n(x[2]), n(x[3]), n(x[4])]),
    b: async (s) => {
      const d = (await j(`https://api.bitget.com/api/v2/mix/market/merge-depth?symbol=${s}&productType=USDT-FUTURES&limit=15`))?.data || {};
      return { b: lv(d.bids), a: lv(d.asks) };
    },
  },
  gate: {
    f: async (s) => (await j(`https://api.gateio.ws/api/v4/futures/usdt/funding_rate?contract=${s}&limit=200`)).map((x) => [n(x.t) * 1000, n(x.r)]),
    c: async (s, i) => (await j(`https://api.gateio.ws/api/v4/futures/usdt/candlesticks?contract=${s}&interval=${i}&limit=1000`)).map((x) => [n(x.t) * 1000, n(x.o), n(x.h), n(x.l), n(x.c)]),
    b: async (s) => {
      const [d, k] = await Promise.all([
        j(`https://api.gateio.ws/api/v4/futures/usdt/order_book?contract=${s}&limit=20`),
        ctSize(`gate|${s}`, async () => (await j(`https://api.gateio.ws/api/v4/futures/usdt/contracts/${s}`))?.quanto_multiplier),
      ]);
      const f = (x) => [x.p, x.s];
      return scale({ b: lv(d.bids, f), a: lv(d.asks, f) }, k);
    },
  },
  kucoin: {
    f: async (s, from) => ((await j(`https://api-futures.kucoin.com/api/v1/contract/funding-rates?symbol=${s}&from=${from}&to=${Date.now()}`))?.data || []).map((x) => [n(x.timepoint), n(x.fundingRate)]),
    c: async (s, i) => {
      const m = MIN[i];
      return ((await j(`https://api-futures.kucoin.com/api/v1/kline/query?symbol=${s}&granularity=${m}&from=${Date.now() - m * 6e4 * 500}&to=${Date.now()}`))?.data || []).map((x) => [n(x[0]), n(x[1]), n(x[2]), n(x[3]), n(x[4])]);
    },
    b: async (s) => {
      const [d, k] = await Promise.all([
        j(`https://api-futures.kucoin.com/api/v1/level2/depth20?symbol=${s}`),
        ctSize(`kucoin|${s}`, async () => (await j(`https://api-futures.kucoin.com/api/v1/contracts/${s}`))?.data?.multiplier),
      ]);
      return scale({ b: lv(d?.data?.bids), a: lv(d?.data?.asks) }, k);
    },
  },
  bingx: {
    f: async (s, from) => ((await j(`https://open-api.bingx.com/openApi/swap/v2/quote/fundingRate?symbol=${s}&startTime=${from}&limit=1000`))?.data || []).map((x) => [n(x.fundingTime), n(x.fundingRate)]),
    c: async (s, i) => ((await j(`https://open-api.bingx.com/openApi/swap/v3/quote/klines?symbol=${s}&interval=${i}&limit=1000`))?.data || []).map((x) => (Array.isArray(x) ? [n(x[0]), n(x[1]), n(x[2]), n(x[3]), n(x[4])] : [n(x.time), n(x.open), n(x.high), n(x.low), n(x.close)])),
    b: async (s) => {
      const d = (await j(`https://open-api.bingx.com/openApi/swap/v2/quote/depth?symbol=${s}&limit=20`))?.data || {};
      return { b: lv(d.bids), a: lv(d.asks) };
    },
  },
  kraken: {
    /* у Kraken ставка «relative» — доля от цены за час */
    f: async (s, from) => ((await j(`https://futures.kraken.com/derivatives/api/v4/historicalfundingrates?symbol=${s}`))?.rates || []).map((x) => [Date.parse(x.timestamp), n(x.relativeFundingRate)]).filter((x) => x[0] >= from),
    c: async (s, i) => ((await j(`https://futures.kraken.com/api/charts/v1/trade/${s}/${i}?from=${Math.floor(Date.now() / 1000) - MIN[i] * 60 * 1000}`))?.candles || []).map((x) => [n(x.time), n(x.open), n(x.high), n(x.low), n(x.close)]),
    b: async (s) => {
      const d = (await j(`https://futures.kraken.com/derivatives/api/v3/orderbook?symbol=${s}`))?.orderBook || {};
      return { b: lv(d.bids).slice(0, 20), a: lv(d.asks).slice(0, 20) };
    },
  },
  htx: {
    f: async (s) => ((await j(`https://api.hbdm.com/linear-swap-api/v1/swap_historical_funding_rate?contract_code=${s}&page_size=50`))?.data?.data || []).map((x) => [n(x.funding_time), n(x.funding_rate)]),
    c: async (s, i) => ((await j(`https://api.hbdm.com/linear-swap-ex/market/history/kline?contract_code=${s}&period=${MIN[i]}min&size=1000`))?.data || []).map((x) => [n(x.id) * 1000, n(x.open), n(x.high), n(x.low), n(x.close)]),
    b: async (s) => {
      const [d, k] = await Promise.all([
        j(`https://api.hbdm.com/linear-swap-ex/market/depth?contract_code=${s}&type=step0`),
        ctSize(`htx|${s}`, async () => (await j(`https://api.hbdm.com/linear-swap-api/v1/swap_contract_info?contract_code=${s}`))?.data?.[0]?.contract_size),
      ]);
      return scale({ b: lv(d?.tick?.bids).slice(0, 20), a: lv(d?.tick?.asks).slice(0, 20) }, k);
    },
  },
  whitebit: {
    c: async (s, i) => ((await j(`https://whitebit.com/api/v1/public/kline?market=${s}&interval=${i}&limit=1440`))?.result || []).map((x) => [n(x[0]) * 1000, n(x[1]), n(x[3]), n(x[4]), n(x[2])]),
    b: async (s) => {
      const d = await j(`https://whitebit.com/api/v4/public/orderbook/${s}?limit=20`);
      return { b: lv(d.bids), a: lv(d.asks) };
    },
  },
  paradex: {
    c: async (s, i) => ((await j(`https://api.prod.paradex.trade/v1/markets/klines?symbol=${s}&resolution=${MIN[i]}&start_at=${Date.now() - MIN[i] * 6e4 * 1000}&end_at=${Date.now()}`))?.results || []).map((x) => [n(x[0]), n(x[1]), n(x[2]), n(x[3]), n(x[4])]),
    b: async (s) => {
      const d = await j(`https://api.prod.paradex.trade/v1/orderbook/${s}?depth=20`);
      return { b: lv(d.bids), a: lv(d.asks) };
    },
  },
  dydx: {
    f: async (s, from) => ((await j(`https://indexer.dydx.trade/v4/historicalFunding/${s}?limit=1000`))?.historicalFunding || []).map((x) => [Date.parse(x.effectiveAt), n(x.rate)]).filter((x) => x[0] >= from),
    c: async (s, i) => ((await j(`https://indexer.dydx.trade/v4/candles/perpetualMarkets/${s}?resolution=${{ "1m": "1MIN", "5m": "5MINS", "15m": "15MINS", "1h": "1HOUR" }[i]}&limit=1000`))?.candles || []).map((x) => [Date.parse(x.startedAt), n(x.open), n(x.high), n(x.low), n(x.close)]),
    b: async (s) => {
      const d = await j(`https://indexer.dydx.trade/v4/orderbooks/perpetualMarket/${s}`);
      const f = (x) => [x.price, x.size];
      return { b: lv(d.bids, f).slice(0, 20), a: lv(d.asks, f).slice(0, 20) };
    },
  },
};

const clean = (a, from) => a.filter((x) => Number.isFinite(x[0]) && x.slice(1).every(Number.isFinite) && x[0] >= from).sort((x, y) => x[0] - y[0]);
const why = (r) => String(r.reason?.message || r.reason).slice(0, 120);

export default async function handler(req, res) {
  const q = req.query || {},
    k = String(q.k || "hist"),
    v = String(q.v || ""),
    sym = String(q.sym || ""),
    coin = String(q.coin || "");
  if (!/^[\w.\-]{1,40}$/.test(sym) || !/^[\w.\-:]{1,40}$/.test(coin) || !/^\w{1,20}$/.test(v)) return res.status(400).json({ error: "bad-params" });
  const X = H[v];
  if (k === "book") {
    const [a, b] = await Promise.allSettled([
      hl({ type: "l2Book", coin }).then((d) => ({ b: lv(d.levels?.[0], (x) => [x.px, x.sz]).slice(0, 20), a: lv(d.levels?.[1], (x) => [x.px, x.sz]).slice(0, 20) })),
      X?.b ? X.b(sym) : Promise.reject(new Error("no-book")),
    ]);
    res.setHeader("cache-control", "public, s-maxage=2, stale-while-revalidate=4");
    return res.status(200).json({ t: Date.now(), hl: a.status === "fulfilled" ? a.value : null, x: b.status === "fulfilled" ? b.value : null, err: [a, b].filter((r) => r.status === "rejected").map(why) });
  }
  const i = MIN[q.i] ? String(q.i) : "5m",
    from = Date.now() - MIN[i] * 6e4 * 1000;
  const [a, b, c, d] = await Promise.allSettled([
    hl({ type: "candleSnapshot", req: { coin, interval: i, startTime: from, endTime: Date.now() } }).then((r) => r.map((x) => [x.t, n(x.o), n(x.h), n(x.l), n(x.c)])),
    hl({ type: "fundingHistory", coin, startTime: from }).then((r) => r.map((x) => [x.time, n(x.fundingRate)])),
    X?.c ? X.c(sym, i) : Promise.reject(new Error("no-candles")),
    X?.f ? X.f(sym, from) : Promise.reject(new Error("no-funding-history")),
  ]);
  const ok = (r) => (r.status === "fulfilled" ? clean(r.value, from - 36e5) : null);
  res.setHeader("cache-control", `public, s-maxage=${i === "1m" ? 20 : 60}, stale-while-revalidate=120`);
  res.status(200).json({ t: Date.now(), i, hl: { c: ok(a), f: ok(b) }, x: { c: ok(c), f: ok(d), err: [c, d].filter((r) => r.status === "rejected").map(why) } });
}

/* самопроверка для /api/funding?debug=1: по BTC на каждой бирже — стакан, свечи, ставки */
export async function selftest(rows) {
  const out = {};
  await Promise.all(
    Object.keys(H).map(async (v) => {
      const r = rows.find((x) => x.v === v && x.base === "BTC");
      if (!r) return (out[v] = "no BTC");
      const X = H[v],
        [b, c, f] = await Promise.allSettled([X.b ? X.b(r.sym) : Promise.reject(new Error("-")), X.c ? X.c(r.sym, "5m") : Promise.reject(new Error("-")), X.f ? X.f(r.sym, Date.now() - 2 * 864e5) : Promise.reject(new Error("-"))]);
      out[v] = {
        sym: r.sym,
        mark: r.mark,
        book: b.status === "fulfilled" ? `${b.value.b.length}/${b.value.a.length} bid ${b.value.b[0]?.[0]} $${Math.round((b.value.b[0]?.[0] || 0) * (b.value.b[0]?.[1] || 0))} ask ${b.value.a[0]?.[0]}` : why(b),
        candles: c.status === "fulfilled" ? `${c.value.length} last ${JSON.stringify(c.value.sort((x, y) => x[0] - y[0]).at(-1))}` : why(c),
        funding: f.status === "fulfilled" ? `${f.value.length} last ${JSON.stringify(f.value.sort((x, y) => x[0] - y[0]).at(-1))}` : why(f),
      };
    }),
  );
  return out;
}
