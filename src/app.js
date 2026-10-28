/* ============================================================
   Totum — торговый терминал на Hyperliquid (фьючерсы и спот).
   Исходник восстановлен из собранной версии 26.10.2026.
   ============================================================ */
import { HttpTransport, InfoClient, SubscriptionClient, WebSocketTransport, ExchangeClient } from "@nktkas/hyperliquid";
import { formatPrice, formatSize } from "@nktkas/hyperliquid/utils";
import {
  createChart,
  createSeriesMarkers,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  BarSeries,
  AreaSeries,
  BaselineSeries,
  ColorType,
  CrosshairMode,
  LineStyle,
  LineType,
} from "lightweight-charts";
import { createWalletClient, custom, getAddress, isAddress } from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";

var USER_CFG = window.TERM_CONFIG || {},
  CFG = {
    isTestnet: USER_CFG.isTestnet !== !1,
    builder: USER_CFG.builder || "",
    feeTenthBps: Number(USER_CFG.feeTenthBps ?? 25),
    slippage: Number(USER_CFG.slippage ?? 0.01),
    confirmAboveUsd: Number(USER_CFG.confirmAboveUsd ?? 1e3),
    agentName: "totum",
    refreshMs: 5e3,
    hlTakerFee: 45e-5,
    hlMakerFee: 15e-5,
  },
  feePercentStr = (i) => `${(i / 1e3).toFixed(3).replace(/0+$/, "").replace(/\.$/, "")}%`,
  FEE_PCT = feePercentStr(CFG.feeTenthBps),
  transport = new HttpTransport({
    isTestnet: CFG.isTestnet,
  }),
  info = new InfoClient({
    transport: transport,
  }),
  infoHeavy = new InfoClient({
    transport: new HttpTransport({
      isTestnet: CFG.isTestnet,
      timeout: 3e4,
    }),
  }),
  subs = null;
try {
  subs = new SubscriptionClient({
    transport: new WebSocketTransport({
      isTestnet: CFG.isTestnet,
    }),
  });
} catch {
  subs = null;
}
var S = {
    user: null,
    userExchange: null,
    agent: null,
    agentExchange: null,
    approvedFee: 0,
    agentOk: !1,
    meta: [],
    ctx: {},
    coin: "BTC",
    interval: "15m",
    orderType: "market",
    book: null,
    trades: [],
    withdrawable: 0,
    positions: [],
    timer: null,
    live: {
      book: !1,
      trades: !1,
      candle: !1,
    },
    unsub: [],
  },
  SET = {
    remember: !0,
    confirmOn: !0,
    confirmUsd: CFG.confirmAboveUsd,
    slippage: CFG.slippage,
    bookMode: "both",
  };
try {
  Object.assign(SET, JSON.parse(localStorage.getItem("totum.settings") || "{}"));
} catch {}
function saveSettings() {
  try {
    localStorage.setItem("totum.settings", JSON.stringify(SET));
  } catch {}
}
var $ = (i) => document.getElementById(i),
  short = (i) => (i ? `${i.slice(0, 6)}…${i.slice(-4)}` : ""),
  usd = (i) =>
    `${Number(i).toLocaleString("ru-RU", {
      maximumFractionDigits: 2,
    })} $`,
  pct = (i, t = 4) => `${(Number(i) * 100).toFixed(t)}%`,
  num = (i, t = 2) =>
    Number(i).toLocaleString("ru-RU", {
      maximumFractionDigits: t,
    }),
  compact = (i) => {
    let t = Number(i);
    return t >= 1e9
      ? `${(t / 1e9).toFixed(2)} млрд $`
      : t >= 1e6
        ? `${(t / 1e6).toFixed(2)} млн $`
        : t >= 1e3
          ? `${(t / 1e3).toFixed(1)} тыс $`
          : usd(t);
  },
  pxDecimals = (i) => {
    let t = Number(i);
    return t >= 1e3 ? 1 : t >= 100 ? 2 : t >= 1 ? 4 : 6;
  },
  fmtPx = (i) => num(i, pxDecimals(i)),
  esc = (i) =>
    String(i).replace(
      /[&<>"']/g,
      (t) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[t],
    );
function toast(i, t = "info") {
  let e = document.createElement("div");
  ((e.className = `toast ${t}`),
    (e.textContent = i),
    $("toasts").appendChild(e),
    setTimeout(() => e.remove(), t === "err" ? 9e3 : 4500));
}
function humanError(i) {
  let t = String(i?.message || i),
    e = [
      [
        /Builder has insufficient balance/i,
        "У кошелька-строителя (касса Totum из config.js) меньше 100 USDC на фьючерсном счёте Hyperliquid. Пополните его.",
      ],
      [
        /builder fee has not been approved|Builder fee/i,
        "Комиссия Totum не разрешена. Нажмите «Включить торговлю» ещё раз.",
      ],
      [/does not exist|User or API Wallet/i, "Ключ для сделок устарел. Нажмите «Включить торговлю» ещё раз."],
      [/must deposit|insufficient|Insufficient margin/i, "Недостаточно средств на счёте Hyperliquid."],
      [/User rejected|denied|4001/i, "Вы отменили подпись в кошельке."],
      [/wallet-timeout/i, "Кошелёк не ответил на запрос подписи. Откройте кошелёк и нажмите кнопку ещё раз."],
      [
        /origin not allowed|Connection request reset|Proposal expired|relay|pairing|session/i,
        "Не удалось подключить кошелёк. Попробуйте ещё раз или выберите другой кошелёк.",
      ],
      [/chainId|chain id/i, "Кошелёк не смог подписать: проверьте выбранную сеть в кошельке."],
      [
        /could not immediately match/i,
        "Ордер не исполнился: по такой цене нет встречных заявок (тонкий стакан или широкий спред). Увеличьте проскальзывание или выставьте лимитный ордер.",
      ],
      [/never placed|already canceled|already cancelled|was canceled/i, "Этот ордер уже исполнен или отменён."],
      [/Order has invalid price|tick|invalid price/i, "Биржа не приняла такую цену. Попробуйте чуть другую."],
      [/min.*notional|minimum value|\$10/i, "Слишком маленький ордер: на Hyperliquid минимум 10 USDC."],
      [
        /timed out|timeout|Failed to fetch|NetworkError|TransportError|WebSocket|network/i,
        "Биржа отвечает медленно. Попробуйте ещё раз через несколько секунд.",
      ],
    ];
  console.warn("[ошибка биржи]", t);
  for (let [n, s] of e) if (n.test(t)) return s;
  return "Биржа не выполнила запрос. Попробуйте ещё раз.";
}
var NET = {};
function netShow() {
  let i = $("netState");
  i && (i.hidden = !Object.values(NET).some((t) => Date.now() - t > 4e3));
}
function netBad(i, t = "api") {
  (console.warn("[связь]", t, i?.message || i), NET[t] || (NET[t] = Date.now()), netShow());
}
function netGood(i = "api") {
  (delete NET[i], netShow());
}
function setBusy(i, t, e) {
  i &&
    (t
      ? ((i.dataset.label = i.textContent), (i.textContent = e || "Подождите…"), (i.disabled = !0))
      : ((i.textContent = i.dataset.label || i.textContent), (i.disabled = !1)));
}
S.spot = [];
S.spotBal = [];
var HL_SPOT_TAKER = 7e-4,
  mkt = (i = S.coin) => S.meta.find((t) => t.name === i) || S.spot.find((t) => t.name === i) || null,
  isSpot = (i = S.coin) => !!S.spot.find((t) => t.name === i) || /^@\d+$/.test(i) || i.includes("/"),
  pairLabel = (i) => {
    let t = S.spot.find((e) => e.name === i);
    if (t) return t.label;
    if (/^@\d+$/.test(i)) return i;
    const m = S.meta.find((e) => e.name === i);
    return `${dexBase(i)}-${m?.dex ? collName(m) : "USDC"}`;
  },
  // HIP-3: «xyz:TSLA» → площадка «xyz», монета «TSLA»
  dexOf = (i) => (i && i.includes(":") ? i.split(":")[0] : ""),
  dexBase = (i) => (i && i.includes(":") ? i.slice(i.indexOf(":") + 1) : i),
  collName = (m) => (m?.collToken ? S.tokenNames?.[m.collToken] || "USDC" : "USDC"),
  baseOf = (i = S.coin) => S.spot.find((t) => t.name === i)?.base || dexBase(i),
  fmtP = (i, t) => formatPrice(i, t.szDecimals, t.spot ? "spot" : "perp"),
  spotBal = (i) => {
    let t = S.spotBal.find((e) => e.coin === i);
    return t ? Math.max(0, Number(t.total) - Number(t.hold)) : 0;
  },
  MKT_CACHE_KEY = `totum.mkts.v2.${CFG.isTestnet ? "t" : "m"}`,
  PERP_REFRESH_MS = 6e4,
  SPOT_REFRESH_MS = 6e5;
S.loadedAt = {
  perp: 0,
  spot: 0,
};
S.wsCtx = {
  perp: 0,
  spot: 0,
};
/* Категории фьючерсов Hyperliquid (perpCategories): stocks, indices, commodities, fx, preipo, rates, crypto…
   Сводим к двум группам вкладок: «Крипто» и «Традфи» (RWA). */
const TRADFI_CATS = new Set(["stocks", "stock", "equity", "equities", "indices", "index", "commodities", "commodity", "fx", "preipo", "rates", "rwa", "bonds"]);
const CAT_RU = { stocks: "Акции", stock: "Акции", equity: "Акции", equities: "Акции", indices: "Индекс", index: "Индекс", commodities: "Сырьё", commodity: "Сырьё", fx: "Валюта", preipo: "Pre-IPO", rates: "Ставки", rwa: "RWA", bonds: "Облигации" };
function catOf(name, dex) {
  const c = String(S.cats?.[name] || "").toLowerCase();
  if (TRADFI_CATS.has(c)) return { group: "tradfi", raw: c };
  if (c === "crypto" || !dex) return { group: "crypto", raw: "crypto" };
  return { group: "other", raw: c };
}
var perpCtxLite = (i) => ({
    markPx: i.markPx,
    midPx: i.midPx || i.markPx,
    funding: i.funding,
    openInterest: i.openInterest,
    prevDayPx: i.prevDayPx,
    dayNtlVlm: i.dayNtlVlm,
    oraclePx: i.oraclePx,
    premium: i.premium,
  }),
  spotCtxLite = (i) => ({
    markPx: i.markPx,
    midPx: i.midPx || i.markPx,
    prevDayPx: i.prevDayPx,
    dayNtlVlm: i.dayNtlVlm,
    circulatingSupply: i.circulatingSupply,
    spot: !0,
  });
async function loadSpotMarkets() {
  let [i, t] = await infoHeavy.spotMetaAndAssetCtxs(),
    e = new Map(i.tokens.map((s) => [s.index, s])),
    _tn = (S.tokenNames = Object.fromEntries(i.tokens.map((s) => [s.index, s.name]))),
    n = new Map(t.map((s) => [s.coin, s]));
  ((S.spot = i.universe
    .map((s) => {
      let r = e.get(s.tokens[0]),
        o = e.get(s.tokens[1]);
      if (!r || !o) return null;
      let a = n.get(s.name);
      return (
        a && (S.ctx[s.name] = spotCtxLite(a)),
        {
          name: s.name,
          label: `${r.name}/${o.name}`,
          base: r.name,
          quote: o.name,
          szDecimals: r.szDecimals,
          index: 1e4 + s.index,
          spot: !0,
        }
      );
    })
    .filter(Boolean)),
    (S.loadedAt.spot = Date.now()));
}
/* Фьючерсы: основная площадка Hyperliquid + все площадки HIP-3 (акции, индексы, сырьё и т.д.).
   Номер актива для ордера: основная — индекс в meta; HIP-3 — 100000 + номер площадки × 10000 + индекс. */
const DEX_META_MS = 10 * 6e4;
async function loadPerpMarkets() {
  const needDex = !S.dexMetaAt || Date.now() - S.dexMetaAt > DEX_META_MS;
  const [[i, t], all, cats] = await Promise.all([
    infoHeavy.metaAndAssetCtxs(),
    needDex ? infoHeavy.allPerpMetas().catch((e) => (console.warn("[hip3]", e?.message || e), null)) : Promise.resolve(null),
    S.cats ? Promise.resolve(null) : info.perpCategories().catch(() => null),
  ]);
  if (cats) S.cats = Object.fromEntries(cats);
  S.perpUniverse = i.universe.map((e) => e.name);
  const main = i.universe
    .map((e, n) => ({
      name: e.name,
      szDecimals: e.szDecimals,
      maxLeverage: e.maxLeverage,
      index: n,
      dex: "",
      cat: catOf(e.name, "").raw,
      group: catOf(e.name, "").group,
      delisted: e.isDelisted,
      onlyIsolated: !!e.onlyIsolated,
    }))
    .filter((e) => !e.delisted);
  if (all) {
    S.dexUniverse = {};
    S.dexMarkets = [];
    all.forEach((m, di) => {
      if (di === 0 || !m?.universe?.length) return;
      const dex = dexOf(m.universe[0].name);
      S.dexUniverse[dex] = m.universe.map((u) => u.name);
      m.universe.forEach((u, k) => {
        if (u.isDelisted) return;
        const c = catOf(u.name, dex);
        S.dexMarkets.push({
          name: u.name,
          szDecimals: u.szDecimals,
          maxLeverage: u.maxLeverage,
          index: 1e5 + di * 1e4 + k,
          dex,
          collToken: m.collateralToken || 0,
          cat: c.raw,
          group: c.group,
          onlyIsolated: !!u.onlyIsolated,
          marginMode: u.marginMode || null,
        });
      });
    });
    S.dexMetaAt = Date.now();
  }
  S.meta = [...main, ...(S.dexMarkets || [])];
  i.universe.forEach((e, n) => {
    t[n] && (S.ctx[e.name] = perpCtxLite(t[n]));
  });
  S.loadedAt.perp = Date.now();
  netGood("markets");
}
function saveMarketsCache() {
  try {
    let i = {};
    for (let [t, e] of Object.entries(S.ctx))
      i[t] = {
        midPx: e.midPx,
        markPx: e.markPx,
        prevDayPx: e.prevDayPx,
        dayNtlVlm: e.dayNtlVlm,
        funding: e.funding,
        openInterest: e.openInterest,
        spot: e.spot,
      };
    localStorage.setItem(
      MKT_CACHE_KEY,
      JSON.stringify({
        t: Date.now(),
        meta: S.meta,
        spot: S.spot,
        perpUniverse: S.perpUniverse,
        dexUniverse: S.dexUniverse,
        dexMarkets: S.dexMarkets,
        tokenNames: S.tokenNames,
        cats: S.cats,
        ctx: i,
      }),
    );
  } catch {}
}
function loadMarketsCache() {
  try {
    let i = JSON.parse(localStorage.getItem(MKT_CACHE_KEY) || "null");
    return !i || !i.meta?.length
      ? !1
      : ((S.meta = i.meta),
        (S.spot = i.spot || []),
        (S.perpUniverse = i.perpUniverse || []),
        (S.dexUniverse = i.dexUniverse || {}),
        (S.dexMarkets = i.dexMarkets || []),
        (S.tokenNames = i.tokenNames || {}),
        (S.cats = i.cats || null),
        (S.ctx = i.ctx || {}),
        !0);
  } catch {
    return !1;
  }
}
function afterMarkets() {
  (document.body.dataset.view === "landing" && setTimeout(renderLanding, 0),
    !mkt(S.coin) && S.meta.length && (S.coin = S.meta[0].name),
    setPairLabel(),
    $("pairPop").hidden || updatePairPrices(),
    renderTicker());
}
async function loadMarkets() {
  let i = loadSpotMarkets()
    .then(() => {
      (afterMarkets(), saveMarketsCache());
    })
    .catch((t) => console.warn("[spot]", t?.message || t));
  return (await loadPerpMarkets(), afterMarkets(), saveMarketsCache(), i);
}
async function refreshMarkets() {
  let i = Date.now(),
    t = i - S.wsCtx.perp < 15e3,
    e = i - S.wsCtx.spot < 3e4,
    n = isSpot() || (!$("pairPop").hidden && PP.mk === "spot"),
    s = [];
  (i - S.loadedAt.perp > (t ? PERP_REFRESH_MS : 15e3) && s.push(loadPerpMarkets()),
    i - S.loadedAt.spot > (e ? SPOT_REFRESH_MS : n ? 3e4 : SPOT_REFRESH_MS) && s.push(loadSpotMarkets()),
    s.length && (await Promise.allSettled(s), afterMarkets(), saveMarketsCache()));
}
var ctxBatchAt = 0;
function onCtxBatch() {
  let i = Date.now();
  i - ctxBatchAt < 1e3 ||
    ((ctxBatchAt = i),
    renderTicker(),
    $("pairPop").hidden || updatePairPrices(),
    ["home", "markets"].includes(document.body.dataset.app) && renderAppPage(),
    document.body.dataset.view === "landing" && renderLanding());
}
async function subscribeRetry(i, t, e = 0) {
  try {
    return await t();
  } catch (n) {
    console.warn(`[ws ${i}]`, n?.message || n);
    let s = Math.min(6e4, 5e3 * 2 ** e);
    return (await new Promise((r) => setTimeout(r, s)), subscribeRetry(i, t, e + 1));
  }
}
async function subscribeAllPrices() {
  subs &&
    (subscribeRetry("assetCtxs", () =>
      subs.assetCtxs((i) => {
        if (i?.dex) return;
        let t = S.perpUniverse || [];
        ((i?.ctxs || []).forEach((e, n) => {
          let s = t[n];
          s &&
            e &&
            (S.ctx[s] = {
              ...S.ctx[s],
              ...perpCtxLite(e),
            });
        }),
          (S.wsCtx.perp = Date.now()),
          onCtxBatch());
      }),
    ),
    // цены всех площадок HIP-3 (приходят раз в ~10 с; основная площадка — отдельной быстрой подпиской выше)
    subscribeRetry("allDexsAssetCtxs", () =>
      subs.allDexsAssetCtxs((i) => {
        for (const [dex, ctxs] of i?.ctxs || []) {
          if (!dex) continue;
          const names = S.dexUniverse?.[dex] || [];
          (ctxs || []).forEach((e, n) => {
            const s = names[n];
            s && e && (S.ctx[s] = { ...S.ctx[s], ...perpCtxLite(e) });
          });
        }
        ((S.wsCtx.dex = Date.now()), onCtxBatch());
      }),
    ),
    subscribeRetry("spotAssetCtxs", () =>
      subs.spotAssetCtxs((i) => {
        for (let t of i || [])
          t?.coin &&
            (S.ctx[t.coin] = {
              ...S.ctx[t.coin],
              ...spotCtxLite(t),
            });
        ((S.wsCtx.spot = Date.now()), onCtxBatch());
      }),
    ));
}
function renderTicker() {
  let i = S.ctx[S.coin],
    t = mkt(S.coin);
  if (!i || !t) return;
  let e = Number(i.midPx),
    n = i.prevDayPx ? e / Number(i.prevDayPx) - 1 : 0;
  (($("mkPrice").textContent = fmtPx(e)),
    ($("mkPrice").className = n >= 0 ? "pos" : "neg"),
    ($("mkChange").textContent = `${n >= 0 ? "+" : ""}${(n * 100).toFixed(2)}%`),
    ($("mkChange").className = `small ${n >= 0 ? "pos" : "neg"}`),
    ($("mkMark").textContent = fmtPx(i.markPx)),
    ($("mkVol").textContent = i.dayNtlVlm ? compact(i.dayNtlVlm) : "—"),
    ($("mkOi").textContent = i.openInterest ? compact(Number(i.openInterest) * Number(i.markPx)) : "—"),
    t.spot ||
      (($("mkFunding").textContent = pct(i.funding)),
      ($("mkFunding").className = Number(i.funding) >= 0 ? "pos" : "neg"),
      ($("bfRate").textContent = pct(i.funding)),
      ($("bfRate").className = Number(i.funding) >= 0 ? "pos" : "neg"),
      Number($("lev").max) !== t.maxLeverage && (($("lev").max = t.maxLeverage), renderLevChips(t.maxLeverage)),
      Number($("lev").value) > t.maxLeverage && setLeverage(t.maxLeverage)),
    document.body.dataset.cp === "info" && renderInfo(),
    (document.title = `${fmtPx(e)} \xB7 ${pairLabel(S.coin)} \xB7 Totum`),
    updateOrderInfo());
}
function renderCountdown() {
  let i = new Date(),
    t = 3600 - (i.getUTCMinutes() * 60 + i.getUTCSeconds()),
    e = String(Math.floor(t / 60)).padStart(2, "0"),
    n = String(t % 60).padStart(2, "0");
  (($("mkCountdown").textContent = `${e}:${n}`), ($("bfCd").textContent = `${e}:${n}`));
}
var chart = null,
  candleSeries = null,
  volSeries = null,
  INTERVAL_MS = {
    "1m": 6e4,
    "5m": 3e5,
    "15m": 9e5,
    "1h": 36e5,
    "4h": 144e5,
    "1d": 864e5,
  },
  CHART_THEMES = {
    light: {
      bg: "#ffffff",
      text: "#64748b",
      grid: "#eef2f7",
      border: "#e2e8f0",
    },
    dark: {
      bg: "#0f1623",
      text: "#8a94a6",
      grid: "#1a2333",
      border: "#243044",
    },
  };
function applyChartTheme() {
  if (!chart) return;
  let i = CHART_THEMES[document.documentElement.dataset.theme === "dark" ? "dark" : "light"];
  chart.applyOptions({
    layout: {
      background: {
        type: ColorType.Solid,
        color: i.bg,
      },
      textColor: i.text,
    },
    grid: {
      vertLines: {
        color: i.grid,
      },
      horzLines: {
        color: i.grid,
      },
    },
    rightPriceScale: {
      borderColor: i.border,
    },
    timeScale: {
      borderColor: i.border,
    },
  });
}
function initChart() {
  let i = $("chart");
  ((chart = createChart(i, {
    autoSize: !0,
    layout: {
      fontSize: 11,
    },
    crosshair: {
      mode: CrosshairMode.Normal,
    },
    timeScale: {
      timeVisible: !0,
      secondsVisible: !1,
    },
    localization: {
      locale: "ru-RU",
    },
  })),
    applyChartTheme(),
    createMainSeries());
}
var toBar = (i) => ({
    time: Math.floor(i.t / 1e3),
    open: +i.o,
    high: +i.h,
    low: +i.l,
    close: +i.c,
  }),
  toVol = (i) => ({
    time: Math.floor(i.t / 1e3),
    value: +i.v,
    color: +i.c >= +i.o ? "rgba(22,163,74,.35)" : "rgba(225,29,72,.35)",
  });
async function loadCandles() {
  if (!chart) return;
  let i = S.coin,
    t = S.interval;
  $("chartLoader").classList.remove("done");
  try {
    let e = Date.now(),
      n = await info.candleSnapshot({
        coin: i,
        interval: t,
        startTime: e - INTERVAL_MS[t] * 300,
        endTime: e,
      });
    if (i !== S.coin || t !== S.interval) return;
    let s = (n || []).filter((a) => a && a.t);
    ((S.bars = s.map(toBar)),
      (S.vols = s.map(toVol)),
      setSeriesData(),
      renderIndicators(),
      drawPrimitive.refresh(),
      updUndoBtns());
    let r = mkt(i),
      o = s.length ? pxDecimals(s.at(-1).c) : 2;
    ((S.priceFormat = {
      type: "price",
      precision: o,
      minMove: 1 / 10 ** o,
    }),
      candleSeries.applyOptions({
        priceFormat: S.priceFormat,
      }),
      r && chart.timeScale().scrollToRealTime(),
      drawChartLines());
  } catch (e) {
    console.warn("[candles]", e);
  } finally {
    i === S.coin && setTimeout(() => $("chartLoader").classList.add("done"), 250);
  }
}
async function pollCandles() {
  let i = S.coin;
  try {
    let t = Date.now(),
      e =
        (await info.candleSnapshot({
          coin: i,
          interval: "1h",
          startTime: t - 864e5,
          endTime: t,
        })) || [];
    if (i !== S.coin || !e.length) return;
    (($("mkHigh").textContent = fmtPx(Math.max(...e.map((n) => +n.h)))),
      ($("mkLow").textContent = fmtPx(Math.min(...e.map((n) => +n.l)))));
  } catch {}
}
var chartLines = [];
function drawChartLines() {
  if (!candleSeries) return;
  for (let n of chartLines)
    try {
      candleSeries.removePriceLine(n.line);
    } catch {}
  chartLines = [];
  let i = (n, s, r, o, a, c = null) => {
      Number(n) > 0 &&
        chartLines.push({
          kind: a,
          price: Number(n),
          coin: S.coin,
          order: c,
          line: candleSeries.createPriceLine({
            price: Number(n),
            color: s,
            lineWidth: a === "tp" || a === "sl" ? 2 : 1,
            lineStyle: o,
            axisLabelVisible: !0,
            title: r,
          }),
        });
    },
    t = S.positions.find((n) => n.coin === S.coin);
  if (t) {
    let n = Number(t.szi) > 0;
    (i(
      t.entryPx,
      n ? "#16a34a" : "#e11d48",
      `${n ? "Лонг" : "Шорт"} ${Math.abs(Number(t.szi))} · тяните для TP/SL`,
      0,
      "entry",
    ),
      i(t.liquidationPx, "#f59e0b", "Ликвидация", 2, "liq"));
  }
  let e = orderGroups(S.coin);
  if (t)
    for (let n of e.all) {
      let s = isTpType(n) ? "tp" : "sl";
      i(n.triggerPx, s === "tp" ? "#16a34a" : "#e11d48", pnlAt(s, Number(n.triggerPx), t), 2, s);
    }
  for (let n of (S.orders || []).filter((s) => s.coin === S.coin && !(s.isTrigger && s.reduceOnly))) {
    let s = n.isTrigger ? n.triggerPx : n.limitPx,
      r = t && Number(t.szi) > 0 != (n.side === "B"),
      o = isSpot()
        ? n.side === "B"
          ? "Лимит покупка"
          : "Лимит продажа"
        : n.side === "B"
          ? r
            ? "Лимит покупка (сократит шорт)"
            : "Лимит лонг"
          : r
            ? "Лимит продажа (сократит лонг)"
            : "Лимит шорт",
      a = e.pending.get(n.oid);
    a &&
      (o += `${a.tp ? ` \xB7 TP ${fmtPx(a.tp.triggerPx)}` : ""}${a.sl ? ` \xB7 SL ${fmtPx(a.sl.triggerPx)}` : ""} после входа`);
    let c = filledPct(n);
    i(
      s,
      "#2563eb",
      `${o}${c ? ` · исполнено ${c.toLocaleString("ru-RU")}%` : ""} · тяните, чтобы переместить`,
      2,
      n.isTrigger ? "trig" : "limit",
      n,
    );
  }
  /* План сделки до входа: стоп и тейк из формы — их можно тянуть мышью */
  if (!isSpot() && S.mode !== "close" && $("tpslOn")?.checked) {
    const en = planEntry();
    if (en > 0) {
      const lg = planSide(en),
        sz = riskActive() && !riskPlan().err ? riskPlan().sz : (Number($("size").value) || 0) / en,
        pv = { entry: en, sz, long: lg },
        slp = readTrig("sl", "ord", "sl", pv),
        tpp = readTrig("tp", "ord", "tp", pv),
        lbl = (k, px) => {
          const v = sz > 0 ? pxPnl(en, px, sz, lg) : 0;
          return `${k} · ${v >= 0 ? "+" : "−"}${usd(Math.abs(v))} · тяните`;
        };
      S.orderType === "limit" && Number($("px").value) > 0 && i(en, "#64748b", `Вход ${lg ? "лонг" : "шорт"}`, 1, "plan-entry");
      slp > 0 && i(slp, "#e11d48", lbl("План SL", slp), 2, "plan-sl");
      tpp > 0 && i(tpp, "#16a34a", lbl("План TP", tpp), 2, "plan-tp");
    }
  }
}
var FEE_RATE = (i = S.coin) => (isSpot(i) ? HL_SPOT_TAKER : CFG.hlTakerFee) + CFG.feeTenthBps / 1e5;
/* PnL как на Hyperliquid: только разница цен × размер. Комиссии
   биржа списывает отдельно, и показываем их отдельной строкой. */
function pxPnl(i, t, e, n) {
  return (t - i) * e * (n ? 1 : -1);
}
/* Комиссии за вход и выход, $: вход лимитом — мейкер, маркетом — тейкер;
   выход по TP/SL — всегда маркет (тейкер). Ставки: Hyperliquid + Totum. */
const MAKER_RATE = () => CFG.hlMakerFee + CFG.feeTenthBps / 1e5;
function roundFee(entry, exit, sz, makerEntry = S.orderType === "limit") {
  return entry * sz * (makerEntry ? MAKER_RATE() : FEE_RATE()) + exit * sz * FEE_RATE();
}
function pnlAt(i, t, e) {
  let n = Number(e.szi) > 0,
    s = pxPnl(Number(e.entryPx), t, Math.abs(Number(e.szi)), n);
  return `${i === "tp" ? "TP" : "SL"} \xB7 ${s >= 0 ? "+" : ""}${usd(s)}`;
}
var DRAG = {
  active: null,
  preview: null,
};
function bindTpslDrag() {
  let i = $("chart"),
    t = (n) => {
      let s = null;
      for (let r of chartLines) {
        if (!["tp", "sl", "entry", "limit", "plan-sl", "plan-tp"].includes(r.kind)) continue;
        if (!S.agentExchange && !r.kind.startsWith("plan")) continue;
        let o = candleSeries.priceToCoordinate(r.price);
        o != null &&
          Math.abs(o - n) <= 6 &&
          (!s || Math.abs(o - n) < s.d) &&
          (s = {
            l: r,
            d: Math.abs(o - n),
          });
      }
      return s?.l || null;
    },
    e = (n) => n.clientY - i.getBoundingClientRect().top;
  (i.addEventListener(
    "mousedown",
    (n) => {
      if (DRAW.tool !== "cursor") return;
      let s = t(e(n));
      s &&
        (n.preventDefault(),
        n.stopPropagation(),
        (DRAG.active = s),
        chart.applyOptions({
          handleScroll: !1,
          handleScale: !1,
        }),
        i.classList.add("dragging"));
    },
    !0,
  ),
    i.addEventListener("mousemove", (n) => {
      let s = e(n);
      if (!DRAG.active) {
        i.classList.toggle("drag-hover", DRAW.tool === "cursor" && !!t(s));
        return;
      }
      let r = candleSeries.coordinateToPrice(s);
      if (r == null) return;
      if (DRAG.active.kind === "plan-sl" || DRAG.active.kind === "plan-tp") {
        const k = DRAG.active.kind === "plan-sl" ? "sl" : "tp",
          en = planEntry(),
          v = UNITS.ord === "pct" ? +pctFromPx(k, r, { entry: en, long: planSide(en) }).toFixed(2) : Number(r.toFixed(pxDecimals(r)));
        $(k).value = v;
        DRAG.kind = "plan";
        updateOrderInfo();
        drawChartLines();
        return;
      }
      if (DRAG.active.kind === "limit") {
        let f = `${DRAG.active.order.side === "B" ? "Покупка" : "Продажа"} → ${fmtPx(r)}`;
        (DRAG.preview
          ? DRAG.preview.applyOptions({
              price: r,
              title: f,
            })
          : (DRAG.preview = candleSeries.createPriceLine({
              price: r,
              color: "#2563eb",
              lineWidth: 2,
              lineStyle: 0,
              axisLabelVisible: !0,
              title: f,
            })),
          (DRAG.kind = "limit"),
          (DRAG.price = r));
        return;
      }
      let o = S.positions.find((p) => p.coin === S.coin);
      if (!o) return;
      let a = Number(o.szi) > 0,
        c = Number(o.entryPx),
        l = DRAG.active.kind;
      l === "entry" && (l = r > c === a ? "tp" : "sl");
      let h = pnlAt(l, r, o);
      (DRAG.preview
        ? DRAG.preview.applyOptions({
            price: r,
            title: h,
            color: l === "tp" ? "#16a34a" : "#e11d48",
          })
        : (DRAG.preview = candleSeries.createPriceLine({
            price: r,
            color: l === "tp" ? "#16a34a" : "#e11d48",
            lineWidth: 2,
            lineStyle: 0,
            axisLabelVisible: !0,
            title: h,
          })),
        (DRAG.kind = l),
        (DRAG.price = r));
    }),
    window.addEventListener("mouseup", () => {
      if (!DRAG.active) return;
      let { kind: n, price: s } = DRAG,
        r = DRAG.active.order;
      if (DRAG.preview)
        try {
          candleSeries.removePriceLine(DRAG.preview);
        } catch {}
      if (
        ((DRAG.active = null),
        (DRAG.preview = null),
        (DRAG.kind = null),
        (DRAG.price = null),
        chart.applyOptions({
          handleScroll: !0,
          handleScale: !0,
        }),
        i.classList.remove("dragging"),
        n === "plan")
      )
        return;
      if (
        n === "limit" && r && s
      ) {
        moveLimitOrder(r, s);
        return;
      }
      n &&
        s &&
        openTpsl(S.coin, {
          [n]: s,
        });
    }));
}
function onCandle(i) {
  if (!i || i.s !== S.coin || i.i !== S.interval) return;
  S.live.candle = !0;
  let t = toBar(i);
  if ((updateSeriesBar(t), volSeries))
    try {
      volSeries.update(toVol(i));
    } catch {}
  if (S.vols?.length) {
    let e = toVol(i);
    S.vols.at(-1).time === e.time ? (S.vols[S.vols.length - 1] = e) : S.vols.push(e);
  }
  S.bars?.length &&
    (S.bars.at(-1).time === t.time ? (S.bars[S.bars.length - 1] = t) : S.bars.push(t), scheduleIndicators());
}
function onBook(i) {
  if (!i) return;
  let [t, e] = i;
  ((S.book = {
    bids: t.map((n) => ({
      px: +n.px,
      sz: +n.sz,
    })),
    asks: e.map((n) => ({
      px: +n.px,
      sz: +n.sz,
    })),
  }),
    renderBook());
}
function renderBook() {
  if (!S.book) return;
  let i = SET.bookMode || "both",
    t = isMobile() ? 9 : 20,
    e = i === "both" ? t : i === "asks" ? t * 2 : 0,
    n = i === "both" ? t : i === "bids" ? t * 2 : 0,
    s = S.book.asks.slice(0, e),
    r = S.book.bids.slice(0, n),
    o = (q) => {
      let U = 0;
      return q.map((V) => (U += V.sz * V.px));
    },
    a = o(s),
    c = o(r),
    l = Math.max(a.at(-1) || 0, c.at(-1) || 0) || 1,
    h = mkt(S.coin),
    p = h ? Math.min(h.szDecimals, 4) : 4;
  $("obSzHead").textContent = `Размер (${baseOf()})`;
  {
    const m = mkt(), q = m?.spot ? m.quote : m?.dex ? collName(m) : "USDC";
    document.querySelectorAll(".q-px").forEach((e) => (e.textContent = `Цена (${q})`));
    document.querySelectorAll(".q-sum").forEach((e) => (e.textContent = `Сумма (${q})`));
  }
  let f = new Map();
  for (let q of S.orders || []) {
    if (q.coin !== S.coin || q.isTrigger) continue;
    let U = Number(q.limitPx);
    f.set(U, (f.get(U) || 0) + Number(q.sz));
  }
  let b = (q, U) => {
    let V = f.get(q.px);
    return `<div class="ob-row${V ? " mine" : ""}" data-px="${q.px}"${V ? ` title="Ваш ордер: ${num(V, p)} ${esc(baseOf())}"` : ""}><span>${fmtPx(q.px)}</span><span>${num(q.sz, p)}</span><span>${num(U, 0)}</span><i style="width:${((U / l) * 100).toFixed(1)}%"></i></div>`;
  };
  (($("asks").innerHTML = s
    .map((q, U) => b(q, a[U]))
    .reverse()
    .join("")),
    ($("bids").innerHTML = r.map((q, U) => b(q, c[U])).join("")),
    ($("asks").hidden = i === "bids"),
    ($("bids").hidden = i === "asks"));
  let w = S.book.asks[0]?.px,
    _ = S.book.bids[0]?.px;
  if (w && _) {
    let q = (w + _) / 2;
    (($("obMid").textContent = fmtPx(q)), ($("obSpread").textContent = `спред ${(((w - _) / q) * 100).toFixed(3)}%`));
  }
  let P = (q) => q.slice(0, 20).reduce((U, V) => U + V.sz * V.px, 0),
    N = P(S.book.bids),
    O = P(S.book.asks),
    R = N + O > 0 ? (N / (N + O)) * 100 : 50;
  (($("ratioB").textContent = `B ${R.toFixed(2)}%`),
    ($("ratioS").textContent = `${(100 - R).toFixed(2)}% S`),
    ($("ratioFill").style.width = `${R}%`),
    S.chartView === "depth" && renderDepth());
}
var depthRaf = null;
function renderDepth() {
  let i = $("depth");
  if (!i || !S.book || i.offsetParent === null) return;
  let t = window.devicePixelRatio || 1,
    e = i.clientWidth,
    n = i.clientHeight;
  if (!e || !n) return;
  (i.width !== e * t || i.height !== n * t) && ((i.width = e * t), (i.height = n * t));
  let s = i.getContext("2d");
  (s.setTransform(t, 0, 0, t, 0, 0), s.clearRect(0, 0, e, n));
  let r = getComputedStyle(document.documentElement),
    o = r.getPropertyValue("--buy").trim() || "#16a34a",
    a = r.getPropertyValue("--sell").trim() || "#e11d48",
    c = r.getPropertyValue("--muted").trim() || "#64748b",
    l = r.getPropertyValue("--line").trim() || "#e2e8f0",
    h = (U) => {
      let V = 0;
      return U.slice(0, 20).map((et) => ({
        px: et.px,
        sz: (V += et.sz),
      }));
    },
    p = h(S.book.bids),
    f = h(S.book.asks);
  if (!p.length || !f.length) return;
  let b = p.at(-1).px,
    w = f.at(-1).px,
    _ = Math.max(p.at(-1).sz, f.at(-1).sz) || 1,
    P = 22,
    N = 54,
    O = (U) => ((U - b) / (w - b || 1)) * (e - N),
    R = (U) => n - P - (U / _) * (n - P - 12),
    q = (U, V, et) => {
      (s.beginPath(), s.moveTo(O(U[0].px), n - P));
      let it = n - P;
      for (let xt of U) (s.lineTo(O(xt.px), it), (it = R(xt.sz)), s.lineTo(O(xt.px), it));
      (s.lineTo(et < 0 ? 0 : e - N, it),
        s.lineTo(et < 0 ? 0 : e - N, n - P),
        s.closePath(),
        (s.fillStyle = V + "33"),
        s.fill(),
        (s.strokeStyle = V),
        (s.lineWidth = 1.5),
        s.stroke());
    };
  (q(p, o, -1), q(f, a, 1), (s.fillStyle = c), (s.font = "11px ui-monospace,monospace"), (s.textAlign = "center"));
  for (let U = 0; U <= 4; U++) {
    let V = b + ((w - b) * U) / 4;
    s.fillText(fmtPx(V), O(V), n - 6);
  }
  s.textAlign = "left";
  for (let U = 1; U <= 4; U++) {
    let V = (_ * U) / 4;
    (s.fillText(num(V, 2), e - N + 6, R(V) + 4),
      (s.strokeStyle = l),
      s.beginPath(),
      s.moveTo(0, R(V)),
      s.lineTo(e - N, R(V)),
      s.stroke());
  }
  if (depthRaf) {
    let U = b + (depthRaf.x / (e - N)) * (w - b),
      V = (S.book.bids[0].px + S.book.asks[0].px) / 2,
      et = U <= V ? p : f,
      it = U <= V ? [...et].reverse().find((Z) => Z.px <= U) || et.at(-1) : et.find((Z) => Z.px >= U) || et.at(-1),
      xt = O(it.px),
      se = R(it.sz);
    ((s.strokeStyle = c),
      s.setLineDash([4, 4]),
      s.beginPath(),
      s.moveTo(xt, 0),
      s.lineTo(xt, n - P),
      s.stroke(),
      s.setLineDash([]),
      (s.fillStyle = U <= V ? o : a),
      s.beginPath(),
      s.arc(xt, se, 4, 0, Math.PI * 2),
      s.fill());
    let Ht = [
        `Диапазон ${((it.px / V - 1) * 100).toFixed(4)}%`,
        `Цена ${fmtPx(it.px)}`,
        `Сумма ${num(it.sz, 4)} ${baseOf()}`,
      ],
      ye = 170,
      fe = 58,
      Te = Math.min(Math.max(xt + 10, 4), e - N - ye - 4),
      vt = Math.max(se - fe - 10, 6);
    ((s.fillStyle = r.getPropertyValue("--panel").trim() || "#fff"),
      (s.strokeStyle = l),
      s.beginPath(),
      s.roundRect(Te, vt, ye, fe, 8),
      s.fill(),
      s.stroke(),
      (s.fillStyle = r.getPropertyValue("--text").trim() || "#0f172a"),
      (s.font = "12px ui-sans-serif,system-ui"),
      Ht.forEach((Z, li) => s.fillText(Z, Te + 10, vt + 18 + li * 16)));
  }
}
function setChartView(i) {
  ((S.chartView = i),
    document.querySelectorAll("[data-view]").forEach((t) => t.classList.toggle("on", t.dataset.view === i)),
    $("paneChart").classList.toggle("depth-on", i === "depth"),
    i === "depth" && requestAnimationFrame(renderDepth));
}
function onTrades(i) {
  if (!i?.length) return;
  let t = i.filter((n) => n.coin === S.coin),
    e = new Set();
  ((S.trades = [...t, ...S.trades]
    .filter((n) => {
      let s = `${n.tid ?? ""}-${n.time}-${n.px}-${n.sz}`;
      return e.has(s) ? !1 : (e.add(s), !0);
    })
    .sort((n, s) => s.time - n.time)
    .slice(0, 40)),
    renderTrades());
}
function renderTrades() {
  let i = mkt(S.coin),
    t = i ? Math.min(i.szDecimals, 4) : 4;
  $("tradesList").innerHTML =
    S.trades
      .map((e) => {
        let s = new Date(e.time).toLocaleTimeString("ru-RU", {
          hour12: !1,
        });
        return `<div class="ob-row"><span class="${e.side === "B" ? "pos" : "neg"}">${fmtPx(e.px)}</span><span>${num(Number(e.sz) * Number(e.px), 2)}</span><span class="muted">${s}</span></div>`;
      })
      .join("") || '<div class="ob-row muted"><span>Нет сделок</span></div>';
}
async function subscribeCoin() {
  for (let n of S.unsub.splice(0))
    try {
      await n.unsubscribe();
    } catch {}
  ((S.live = {
    book: !1,
    trades: !1,
    candle: !1,
  }),
    (S.book = null),
    (S.trades = []),
    ($("asks").innerHTML = $("bids").innerHTML = ""),
    renderTrades());
  let i = S.coin;
  if ((await Promise.all([loadCandles(), pollBook(), pollTrades()]), !subs)) return;
  let t = S.interval,
    e = (n, s = 0) =>
      n()
        .then((r) => {
          if (i !== S.coin || t !== S.interval) {
            r.unsubscribe().catch(() => {});
            return;
          }
          S.unsub.push(r);
        })
        .catch((r) => {
          (console.warn("[ws]", r?.message || r),
            i === S.coin && t === S.interval && setTimeout(() => e(n, s + 1), Math.min(3e4, 3e3 * 2 ** s)));
        });
  (e(() =>
    subs.l2Book(
      {
        coin: i,
      },
      (n) => {
        n.coin === S.coin && ((S.live.book = !0), onBook(n.levels));
      },
    ),
  ),
    e(() =>
      subs.trades(
        {
          coin: i,
        },
        (n) => {
          ((S.live.trades = !0), onTrades(n));
        },
      ),
    ),
    e(() =>
      subs.candle(
        {
          coin: i,
          interval: S.interval,
        },
        onCandle,
      ),
    ));
}
async function pollBook() {
  try {
    let i = await info.l2Book({
      coin: S.coin,
    });
    i && i.coin === S.coin && onBook(i.levels);
  } catch {}
}
async function pollTrades() {
  try {
    let i = await info.recentTrades({
      coin: S.coin,
    });
    ((S.trades = []), onTrades(i || []));
  } catch {}
}
var PROVIDERS = [];
window.addEventListener("eip6963:announceProvider", (i) => {
  let t = i.detail;
  t?.provider && !PROVIDERS.some((e) => e.info?.uuid === t.info?.uuid) && PROVIDERS.push(t);
});
window.dispatchEvent(new Event("eip6963:requestProvider"));
var WC_PROJECT_ID = USER_CFG.walletConnectProjectId || "",
  wcProvider = null,
  wcInit = null;
function preloadWalletConnect() {
  return (
    !WC_PROJECT_ID ||
      wcInit ||
      (wcInit = initWalletConnect().catch((i) => {
        throw ((wcInit = null), i);
      })),
    wcInit
  );
}
async function getWalletConnect() {
  if (!WC_PROJECT_ID)
    return (toast("Вход через WalletConnect не настроен: в config.js не указан walletConnectProjectId.", "err"), null);
  let i = await preloadWalletConnect();
  if (!i.session)
    try {
      await i.connect();
    } catch (t) {
      if (/reject|closed|cancel/i.test(String(t?.message || t))) return null;
      throw t;
    }
  return i;
}
async function initWalletConnect() {
  if (!wcProvider) {
    let { EthereumProvider: i } = await import("@walletconnect/ethereum-provider");
    ((wcProvider = await i.init({
      projectId: WC_PROJECT_ID,
      optionalChains: [42161, 1, 8453, 10, 137, 56],
      showQrModal: !0,
      qrModalOptions: {
        themeMode: document.documentElement.dataset.theme === "dark" ? "dark" : "light",
      },
      optionalMethods: ["eth_signTypedData_v4", "personal_sign", "wallet_switchEthereumChain"],
      metadata: {
        name: "Totum",
        description: "Totum — торговый терминал на Hyperliquid",
        url: location.origin,
        icons: [`${location.origin}/icon.png`],
      },
    })),
      wcProvider.on("disconnect", () => {
        (toast("Кошелёк отключился", "info"),
          (S.provider = null),
          (S.user = null),
          document.body.classList.remove("connected", "ready"),
          ($("btnConnect").textContent = "Подключить кошелёк"));
      }));
  }
  return wcProvider;
}
/* ═══════════ Подписи через WalletConnect ═══════════
   На телефоне запрос подписи «терялся через раз»: пока человек в кошельке,
   браузер усыпляет страницу и рвёт связь с сервером WalletConnect, и второй
   запрос (их два при включении торговли) уходил в никуда. Теперь перед каждой
   подписью проверяем связь и переподключаемся, а на телефоне сами открываем
   кошелёк, когда запрос уже отправлен. */
const isPhone = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
const wcRelay = () => wcProvider?.signer?.client?.core?.relayer || null;
async function wcEnsureRelay() {
  const r = wcRelay();
  if (!r || r.connected) return;
  try {
    await r.transportOpen();
  } catch {
    try {
      await r.restartTransport();
    } catch {}
  }
}
function wcOpenWallet() {
  const link = wcProvider?.session?.peer?.metadata?.redirect?.native;
  if (link && /^[a-z][a-z0-9+.-]*:\/\//i.test(link) && !/^https?:/i.test(link)) location.href = link;
}
const WC_SIGN = ["eth_signTypedData_v4", "eth_signTypedData", "personal_sign", "eth_sendTransaction", "wallet_switchEthereumChain"];
function wcSigner(p) {
  return {
    on: (...a) => p.on(...a),
    removeListener: (...a) => p.removeListener?.(...a),
    request: async (args) => {
      if (!WC_SIGN.includes(args?.method)) return p.request(args);
      await wcEnsureRelay();
      const req = p.request(args);
      toast("Подтвердите подпись в кошельке", "info");
      isPhone() && setTimeout(wcOpenWallet, 400);
      let timer;
      const slow = new Promise((_, rej) => {
        timer = setTimeout(() => rej(new Error("wallet-timeout")), 120e3);
      });
      try {
        return await Promise.race([req, slow]);
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
document.addEventListener("visibilitychange", () => {
  document.visibilityState === "visible" && wcEnsureRelay();
});
async function disconnectWallet() {
  if (confirm("Отключить кошелёк?")) {
    try {
      S.provider && S.provider === wcProvider && (await wcProvider.disconnect());
    } catch {}
    ((S.provider = null),
      (S.user = null),
      (S.userExchange = null),
      (S.agent = null),
      (S.agentExchange = null),
      document.body.classList.remove("connected", "ready"),
      ($("btnConnect").textContent = "Подключить кошелёк"),
      ($("btnConnect").dataset.label = "Подключить кошелёк"),
      toast("Кошелёк отключён", "info"));
  }
}
async function connectWallet() {
  let i = $("btnConnect"),
    t = (USER_CFG.debug || !WC_PROJECT_ID) && window.ethereum,
    e = S.provider;
  if (!e)
    if (t) e = window.ethereum;
    else {
      setBusy(i, !0, "Открываем…");
      try {
        e = await getWalletConnect();
      } catch (n) {
        toast(humanError(n), "err");
      } finally {
        setBusy(i, !1);
      }
    }
  if (!e) {
    !WC_PROJECT_ID &&
      !window.ethereum &&
      toast(
        "Кошелёк не найден. На компьютере установите OKX Wallet, MetaMask или Rabby. На телефоне откройте сайт во встроенном браузере кошелька.",
        "err",
      );
    return;
  }
  setBusy(i, !0, "Подключаем…");
  try {
    let [n] = await e.request({
      method: "eth_requestAccounts",
    });
    if (!n) throw new Error("Кошелёк не вернул адрес");
    (S.provider ||
      ((S.provider = e),
      e.on?.("accountsChanged", () => {
        S.user && ((S.user = null), connectWallet());
      })),
      (S.user = getAddress(n)));
    let s = createWalletClient({
      account: S.user,
      transport: custom(e === wcProvider ? wcSigner(e) : e),
    });
    ((S.userExchange = new ExchangeClient({
      transport: transport,
      wallet: s,
    })),
      await restoreAgent(),
      (i.dataset.label = short(S.user)),
      document.body.classList.add("connected"),
      await refreshStatus(),
      startLoop());
  } catch (n) {
    toast(humanError(n), "err");
  } finally {
    setBusy(i, !1);
  }
}
function agentStoreKey() {
  return `totum.agent.${S.user?.toLowerCase()}.${CFG.isTestnet ? "t" : "m"}`;
}
var b64 = (i) => btoa(String.fromCharCode(...i)),
  unb64 = (i) => Uint8Array.from(atob(i), (t) => t.charCodeAt(0));
function idb() {
  return new Promise((i, t) => {
    let e = indexedDB.open("totum-vault", 1);
    ((e.onupgradeneeded = () => e.result.createObjectStore("keys")),
      (e.onsuccess = () => i(e.result)),
      (e.onerror = () => t(e.error)));
  });
}
async function idbReq(i, t) {
  let e = await idb();
  return new Promise((n, s) => {
    let r = e.transaction("keys", i),
      o = t(r.objectStore("keys"));
    ((o.onsuccess = () => n(o.result)), (o.onerror = () => s(o.error)));
  });
}
async function deviceKey() {
  let i = await idbReq("readonly", (t) => t.get("aes"));
  return (
    i ||
      ((i = await crypto.subtle.generateKey(
        {
          name: "AES-GCM",
          length: 256,
        },
        !1,
        ["encrypt", "decrypt"],
      )),
      await idbReq("readwrite", (t) => t.put(i, "aes"))),
    i
  );
}
async function saveAgent(i, t) {
  if ((forgetAgent(), !SET.remember)) {
    try {
      sessionStorage.setItem(
        agentStoreKey(),
        JSON.stringify({
          pk: i,
          validUntil: t,
        }),
      );
    } catch {}
    return;
  }
  try {
    let e = await deviceKey(),
      n = crypto.getRandomValues(new Uint8Array(12)),
      s = new Uint8Array(
        await crypto.subtle.encrypt(
          {
            name: "AES-GCM",
            iv: n,
          },
          e,
          new TextEncoder().encode(i),
        ),
      );
    localStorage.setItem(
      agentStoreKey(),
      JSON.stringify({
        iv: b64(n),
        ct: b64(s),
        validUntil: t,
      }),
    );
  } catch {
    try {
      sessionStorage.setItem(
        agentStoreKey(),
        JSON.stringify({
          pk: i,
          validUntil: t,
        }),
      );
    } catch {}
  }
}
async function loadAgent() {
  try {
    let i = JSON.parse(sessionStorage.getItem(agentStoreKey()) || "null");
    if (i?.pk && (!i.validUntil || i.validUntil > Date.now())) return i.pk;
  } catch {}
  try {
    let i = JSON.parse(localStorage.getItem(agentStoreKey()) || "null");
    if (!i) return null;
    if (i.validUntil && i.validUntil < Date.now()) return (forgetAgent(), null);
    let t = await deviceKey(),
      e = await crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: unb64(i.iv),
        },
        t,
        unb64(i.ct),
      );
    return new TextDecoder().decode(e);
  } catch {
    return null;
  }
}
function forgetAgent() {
  try {
    sessionStorage.removeItem(agentStoreKey());
  } catch {}
  try {
    localStorage.removeItem(agentStoreKey());
  } catch {}
}
async function restoreAgent() {
  ((S.agent = null), (S.agentExchange = null));
  let i = await loadAgent();
  i &&
    ((S.agent = privateKeyToAccount(i)),
    (S.agentExchange = new ExchangeClient({
      transport: transport,
      wallet: S.agent,
    })));
}
async function refreshStatus() {
  if (S.user) {
    try {
      let i = isAddress(CFG.builder),
        [t, e, _abs] = await Promise.all([
          i
            ? info.maxBuilderFee({
                user: S.user,
                builder: CFG.builder,
              })
            : Promise.resolve(0),
          info.extraAgents({
            user: S.user,
          }),
          info.userAbstraction({ user: S.user }).catch(() => S.abstraction || null),
        ]);
      S.abstraction = _abs || S.abstraction || null;
      S.approvedFee = Number(t) || 0;
      let n = Date.now();
      S.agentOk = !!(
        S.agent &&
        e.some(
          (s) =>
            s.address.toLowerCase() === S.agent.address.toLowerCase() && (s.validUntil === null || s.validUntil > n),
        )
      );
    } catch (i) {
      netBad(i);
    }
    (updateSetupUI(), document.body.classList.toggle("unified", isUnified()), await refreshAccount(), ensureUnified());
  }
}
/* Единый счёт: один баланс USDC на фьючерсы, все площадки HIP-3 и спот.
   Включаем сами ключом агента (без подписи в кошельке). Если не вышло — кнопка с одной подписью. */
async function ensureUnified(viaWallet = !1) {
  if (!S.user || isUnified() || S.unifiedBusy) return;
  if (!viaWallet && (!S.agentExchange || !S.agentOk || S.unifiedTried)) return;
  S.unifiedBusy = !0;
  try {
    viaWallet
      ? await S.userExchange.userSetAbstraction({ user: S.user, abstraction: "unifiedAccount" })
      : ((S.unifiedTried = !0), await S.agentExchange.agentSetAbstraction({ abstraction: "u" }));
    S.abstraction = "unifiedAccount";
    document.body.classList.add("unified");
    document.body.classList.remove("need-unified");
    toast("Включён единый счёт: один баланс на фьючерсы, HIP-3 и спот", "ok");
    await refreshAccount();
  } catch (e) {
    console.warn("[unified]", e?.message || e);
    document.body.classList.add("need-unified");
    viaWallet && toast(humanError(e), "err");
  } finally {
    S.unifiedBusy = !1;
  }
}
function updateSetupUI() {
  let i = S.approvedFee >= CFG.feeTenthBps,
    t = i && S.agentOk;
  (document.body.classList.toggle("ready", t),
    ($("btnBuy").disabled = $("btnSell").disabled = !t),
    ($("btnEnable").disabled = !$("consent").checked || !isAddress(CFG.builder) || !S.user),
    ($("setupState").textContent = isAddress(CFG.builder)
      ? i && !S.agentOk
        ? "Осталась одна подпись"
        : ""
      : "В config.js не указан адрес строителя"));
}
async function enableTrading() {
  if (!$("consent").checked) return;
  try {
    localStorage.setItem("totum.consent", "1");
  } catch {}
  let i = $("btnEnable");
  try {
    if (
      (S.approvedFee < CFG.feeTenthBps &&
        (setBusy(i, !0, "Подпись 1 из 2 в кошельке…"),
        await S.userExchange.approveBuilderFee({
          maxFeeRate: FEE_PCT,
          builder: CFG.builder,
        }),
        (S.approvedFee = CFG.feeTenthBps),
        setBusy(i, !1)),
      !S.agentOk)
    ) {
      setBusy(i, !0, "Подпись 2 из 2 в кошельке…");
      let t = generatePrivateKey(),
        e = privateKeyToAccount(t),
        n = Date.now() + 168 * 3600 * 1e3;
      (await S.userExchange.approveAgent({
        agentAddress: e.address,
        agentName: `${CFG.agentName} valid_until ${n}`,
      }),
        await saveAgent(t, n),
        (S.agent = e),
        (S.agentExchange = new ExchangeClient({
          transport: transport,
          wallet: e,
        })));
    }
    (toast("Торговля включена", "ok"), await refreshStatus());
  } catch (t) {
    toast(humanError(t), "err");
  } finally {
    (setBusy(i, !1), updateSetupUI());
  }
}
var FAVS = [];
try {
  FAVS = JSON.parse(localStorage.getItem("totum.favs") || "[]");
} catch {
  FAVS = [];
}
var PP = {
    tab: "all",
    sort: "vol",
    q: "",
    mk: "perp",
    limit: 60,
  },
  ICON_CDN = "https://app.hyperliquid.xyz/coins/",
  ICON_FAIL = new Set();
try {
  ICON_FAIL = new Set(JSON.parse(localStorage.getItem("totum.iconfail") || "[]"));
} catch {}
var iconFailSaveT = null;
function rememberIconFail(i) {
  (ICON_FAIL.add(i),
    clearTimeout(iconFailSaveT),
    (iconFailSaveT = setTimeout(() => {
      try {
        localStorage.setItem("totum.iconfail", JSON.stringify([...ICON_FAIL].slice(-3e3)));
      } catch {}
    }, 1500)));
}
var ICON_LOCAL = null,
  iconsReady = fetch("icons.json")
    .then((i) => (i.ok ? i.json() : null))
    .then((i) => {
      i && Array.isArray(i.names) && i.names.length && (ICON_LOCAL = new Set(i.names));
    })
    .catch(() => {}),
  coinIcon = (i) => {
    let t = baseOf(i),
      e = esc(t.replace(/^k/, "").slice(0, 1));
    return ICON_LOCAL
      ? ICON_LOCAL.has(t)
        ? `<span class="coin-ic" data-letter="${e}"><img alt="" decoding="async" src="icons/${encodeURIComponent(t)}.svg"></span>`
        : `<span class="coin-ic">${e}</span>`
      : ICON_FAIL.has(t)
        ? `<span class="coin-ic">${e}</span>`
        : `<span class="coin-ic" data-letter="${e}" data-name="${esc(t)}"><img alt="" loading="lazy" decoding="async" src="${ICON_CDN}${encodeURIComponent(t)}.svg"></span>`;
  };
function fixIcons(i) {
  i.querySelectorAll(".coin-ic img").forEach((t) => {
    let e = () => {
      let n = t.parentElement;
      n && (n.dataset.name && rememberIconFail(n.dataset.name), (n.textContent = n.dataset.letter || "?"));
    };
    t.complete && t.naturalWidth === 0 && t.src
      ? e()
      : t.addEventListener("error", e, {
          once: !0,
        });
  });
}
function setPairLabel() {
  (($("pairName").textContent = pairLabel(S.coin)),
    ($("pairType").textContent = isSpot() ? "Спот" : "Бессрочный"),
    document.body.classList.toggle("spot-mode", isSpot()));
  let i = $("pairIc");
  ((i.outerHTML = coinIcon(S.coin).replace('class="coin-ic"', 'class="coin-ic" id="pairIc"')), fixIcons($("pairBtn")));
}
/* Разделы рынков: Все · Фьючерсы · Спот · Крипто · Традфи (RWA) · HIP-3 · В тренде */
const MK_TABS = ["all", "perp", "spot", "crypto", "tradfi", "hip3", "trend"];
function marketsFor(mk) {
  if (mk === "spot") return S.spot;
  if (mk === "perp") return S.meta;
  if (mk === "crypto") return S.meta.filter((m) => m.group === "crypto");
  if (mk === "tradfi") return S.meta.filter((m) => m.group === "tradfi");
  if (mk === "hip3") return S.meta.filter((m) => m.dex);
  return [...S.meta, ...S.spot]; // all, trend
}
function pairRows(i = PP) {
  let t = i,
    e = t.q.trim().toUpperCase(),
    n = marketsFor(t.mk).map((r) => {
      let o = S.ctx[r.name] || {},
        a = Number(o.midPx || o.markPx || 0),
        c = o.prevDayPx && Number(o.prevDayPx) ? a / Number(o.prevDayPx) - 1 : 0;
      return {
        name: r.name,
        label: r.dex ? dexBase(r.name) : pairLabel(r.name),
        mid: a,
        ch: c,
        vol: Number(o.dayNtlVlm || 0),
        lev: r.spot ? null : r.maxLeverage || null,
        dex: r.dex || "",
        cat: r.cat && r.group === "tradfi" ? CAT_RU[r.cat] || "" : "",
      };
    });
  // площадки HIP-3 без цены (пустые тестовые) не показываем
  n = n.filter((r) => r.mid > 0 || !r.dex);
  (e && (n = n.filter((r) => r.label.toUpperCase().includes(e) || r.name.toUpperCase().includes(e))),
    t.tab === "fav" && (n = n.filter((r) => FAVS.includes(r.name))),
    t.tab === "gain" && (n = n.filter((r) => r.ch > 0)),
    t.tab === "loss" && (n = n.filter((r) => r.ch < 0)));
  if (t.mk === "trend") {
    // «В тренде»: сильное движение за сутки при заметном объёме
    const vols = n.map((r) => r.vol).filter((v) => v > 0).sort((a, b) => a - b);
    const floor = vols.length ? vols[Math.floor(vols.length * 0.5)] : 0;
    n = n.filter((r) => r.vol >= floor && r.vol > 0);
    n.forEach((r) => (r.score = Math.abs(r.ch) * Math.log10(10 + r.vol)));
    n.sort((a, b) => b.score - a.score);
    n = n.slice(0, 40);
    if (t.sort === "vol") return n;
  }
  let s = {
    vol: (r) => -r.vol,
    px: (r) => -r.mid,
    ch: (r) => -r.ch,
  }[t.sort];
  return (t.tab === "loss" && t.sort === "ch" ? n.sort((r, o) => r.ch - o.ch) : n.sort((r, o) => s(r) - s(o)), n);
}
const rowTags = (e) => (e.lev ? `<span class="tag lev">${e.lev}x</span>` : '<span class="tag lev">Спот</span>');
// вторая строка: объём, площадка HIP-3 и категория
const rowSub = (e) =>
  `${e.vol ? compact(e.vol) : "—"}${e.dex ? `<span class="tag dex" title="Площадка HIP-3">${esc(e.dex)}</span>` : ""}${e.cat ? `<span class="tag cat">${esc(e.cat)}</span>` : ""}`;
function renderPairList() {
  let i = pairRows(),
    t = i.slice(0, PP.limit);
  ((PP.more = i.length > t.length),
    ($("pairList").innerHTML = t.length
      ? t
          .map(
            (e) => `
    <div class="pp-row${e.name === S.coin ? " cur" : ""}" data-coin="${esc(e.name)}">
      <button class="star${FAVS.includes(e.name) ? " on" : ""}" data-fav="${esc(e.name)}" type="button" aria-label="В избранное">★</button>
      <div class="pp-name">${coinIcon(e.name)}
        <div><div class="pp-l1"><b>${esc(e.label)}</b>${rowTags(e)}</div><small class="pp-sub">${rowSub(e)}</small></div></div>
      <div class="pp-px">${e.mid ? fmtPx(e.mid) : "—"}</div>
      <div class="pp-ch ${e.ch >= 0 ? "pos" : "neg"}">${e.ch >= 0 ? "+" : ""}${(e.ch * 100).toFixed(2)}%</div>
    </div>`,
          )
          .join("")
      : `<div class="pp-empty">${PP.tab === "fav" ? "Добавьте пары в избранное звёздочкой" : "Ничего не найдено"}</div>`),
    fixIcons($("pairList")));
}
function updatePairPrices() {
  let i = $("pairList");
  if (!i.firstElementChild || i.querySelector(".pp-empty")) {
    renderPairList();
    return;
  }
  i.querySelectorAll(".pp-row[data-coin]").forEach((t) => {
    let e = S.ctx[t.dataset.coin];
    if (!e) return;
    let n = Number(e.midPx || e.markPx || 0),
      s = e.prevDayPx && Number(e.prevDayPx) ? n / Number(e.prevDayPx) - 1 : 0,
      r = t.querySelector(".pp-px"),
      o = t.querySelector(".pp-ch"),
      a = n ? fmtPx(n) : "—",
      c = `${s >= 0 ? "+" : ""}${(s * 100).toFixed(2)}%`;
    (r.textContent !== a && (r.textContent = a),
      o.textContent !== c && ((o.textContent = c), (o.className = `pp-ch ${s >= 0 ? "pos" : "neg"}`)));
  });
}
function setPairMarket(i) {
  ((PP.mk = i),
    (PP.limit = 60),
    document.querySelectorAll("[data-mk]").forEach((t) => t.classList.toggle("on", t.dataset.mk === i)),
    renderPairList());
}
function openPairPop(i) {
  ($("pairPop").hidden && !PP.touched && setPairMarket(isSpot() ? "spot" : "perp"),
    ($("pairPop").hidden = !1),
    renderPairList(),
    i && setTimeout(() => $("pairSearch").focus(), 0));
}
function closePairPop() {
  $("pairPop").hidden = !0;
}
function bindPairPicker() {
  let i = $("pairBox"),
    t = window.matchMedia("(hover:hover)").matches,
    e = null;
  (t &&
    (i.addEventListener("mouseenter", () => {
      (clearTimeout(e), openPairPop(!1));
    }),
    i.addEventListener("mouseleave", () => {
      e = setTimeout(() => {
        document.activeElement !== $("pairSearch") && closePairPop();
      }, 180);
    })),
    ($("pairBtn").onclick = () => {
      $("pairPop").hidden ? openPairPop(!0) : t ? $("pairSearch").focus() : closePairPop();
    }),
    ($("pairSearch").oninput = (n) => {
      ((PP.q = n.target.value), (PP.limit = 60), renderPairList());
    }),
    $("pairList").addEventListener("scroll", (n) => {
      let s = n.currentTarget;
      PP.more && s.scrollTop + s.clientHeight > s.scrollHeight - 200 && ((PP.limit += 60), renderPairList());
    }),
    document.querySelectorAll("[data-mk]").forEach((n) => (n.onclick = () => ((PP.touched = !0), setPairMarket(n.dataset.mk)))),
    ($("pairSearch").onblur = () => {
      t && !i.matches(":hover") && closePairPop();
    }),
    document.querySelectorAll("[data-pt]").forEach(
      (n) =>
        (n.onclick = () => {
          ((PP.tab = n.dataset.pt),
            (PP.limit = 60),
            document.querySelectorAll("[data-pt]").forEach((s) => s.classList.toggle("on", s === n)),
            renderPairList());
        }),
    ),
    document.querySelectorAll("[data-sort]").forEach(
      (n) =>
        (n.onclick = () => {
          ((PP.sort = n.dataset.sort),
            (PP.limit = 60),
            document.querySelectorAll("[data-sort]").forEach((s) => s.classList.toggle("on", s === n)),
            renderPairList());
        }),
    ),
    ($("pairList").onclick = (n) => {
      let s = n.target.closest("[data-fav]");
      if (s) {
        let o = s.dataset.fav;
        FAVS = FAVS.includes(o) ? FAVS.filter((a) => a !== o) : [...FAVS, o];
        try {
          localStorage.setItem("totum.favs", JSON.stringify(FAVS));
        } catch {}
        renderPairList();
        return;
      }
      let r = n.target.closest("[data-coin]");
      r && (closePairPop(), (PP.q = ""), ($("pairSearch").value = ""), switchCoin(r.dataset.coin));
    }),
    document.addEventListener("keydown", (n) => {
      n.key === "Escape" && closePairPop();
    }),
    document.addEventListener("click", (n) => {
      n.composedPath().includes(i) || closePairPop();
    }));
}
var IND = {
  ma: !1,
  ema: !1,
  boll: !1,
  vol: !0,
  rsi: !1,
  macd: !1,
};
try {
  Object.assign(IND, JSON.parse(localStorage.getItem("totum.ind") || "{}"));
} catch {}
var indSeries = [],
  sma = (i, t) => i.map((e, n) => (n + 1 < t ? null : i.slice(n + 1 - t, n + 1).reduce((s, r) => s + r, 0) / t));
function ema(i, t) {
  let e = 2 / (t + 1),
    n = [],
    s = null;
  return (
    i.forEach((r, o) => {
      if (r == null) {
        n.push(null);
        return;
      }
      if (s == null) {
        if (o + 1 >= t) {
          let a = i.slice(o + 1 - t, o + 1);
          a.every((c) => c != null) && (s = a.reduce((c, l) => c + l, 0) / t);
        }
        n.push(s);
        return;
      }
      ((s = r * e + s * (1 - e)), n.push(s));
    }),
    n
  );
}
function rsi(i, t = 14) {
  let e = i.map(() => null),
    n = 0,
    s = 0;
  for (let r = 1; r < i.length; r++) {
    let o = i[r] - i[r - 1];
    if (r <= t) {
      ((n += Math.max(o, 0)),
        (s += Math.max(-o, 0)),
        r === t && ((n /= t), (s /= t), (e[r] = s === 0 ? 100 : 100 - 100 / (1 + n / s))));
      continue;
    }
    ((n = (n * (t - 1) + Math.max(o, 0)) / t),
      (s = (s * (t - 1) + Math.max(-o, 0)) / t),
      (e[r] = s === 0 ? 100 : 100 - 100 / (1 + n / s)));
  }
  return e;
}
var toLine = (i, t) =>
    i.map((e, n) =>
      t[n] == null
        ? {
            time: e.time,
          }
        : {
            time: e.time,
            value: t[n],
          },
    ),
  indT = null;
function scheduleIndicators() {
  (clearTimeout(indT), (indT = setTimeout(renderIndicators, 300)));
}
function renderIndicators() {
  if (!chart || !S.bars) return;
  for (let s of indSeries)
    try {
      chart.removeSeries(s);
    } catch {}
  indSeries = [];
  try {
    for (; chart.panes().length > 1;) chart.removePane(chart.panes().length - 1);
  } catch {}
  let i = S.bars,
    t = i.map((s) => s.close),
    e = (s, r, o = 0, a = 1) => {
      let c = chart.addSeries(
        LineSeries,
        {
          color: r,
          lineWidth: a,
          priceLineVisible: !1,
          lastValueVisible: !1,
          crosshairMarkerVisible: !1,
        },
        o,
      );
      return (c.setData(toLine(i, s)), indSeries.push(c), c);
    };
  if (
    (IND.ma && (e(sma(t, 7), "#f59e0b"), e(sma(t, 25), "#a855f7"), e(sma(t, 99), "#06b6d4")),
    IND.ema && (e(ema(t, 12), "#ec4899"), e(ema(t, 26), "#14b8a6")),
    IND.boll)
  ) {
    let s = sma(t, 20),
      r = t.map((o, a) =>
        a < 19 ? null : Math.sqrt(t.slice(a - 19, a + 1).reduce((c, l) => c + (l - s[a]) ** 2, 0) / 20),
      );
    (e(s, "#64748b"),
      e(
        s.map((o, a) => (o == null ? null : o + 2 * r[a])),
        "#3b82f6",
      ),
      e(
        s.map((o, a) => (o == null ? null : o - 2 * r[a])),
        "#3b82f6",
      ));
  }
  let n = 1;
  if (
    ((volSeries = null),
    IND.vol &&
      ((volSeries = chart.addSeries(
        HistogramSeries,
        {
          priceFormat: {
            type: "volume",
          },
          priceLineVisible: !1,
          lastValueVisible: !0,
        },
        n,
      )),
      volSeries.setData(S.vols || []),
      indSeries.push(volSeries),
      n++),
    IND.rsi)
  ) {
    let s = e(rsi(t, 14), "#a855f7", n);
    (s.createPriceLine({
      price: 70,
      color: "#94a3b8",
      lineStyle: LineStyle.Dashed,
      lineWidth: 1,
      axisLabelVisible: !1,
    }),
      s.createPriceLine({
        price: 30,
        color: "#94a3b8",
        lineStyle: LineStyle.Dashed,
        lineWidth: 1,
        axisLabelVisible: !1,
      }),
      n++);
  }
  if (IND.macd) {
    let s = ema(t, 12),
      r = ema(t, 26),
      o = s.map((h, p) => (h == null || r[p] == null ? null : h - r[p])),
      a = o.findIndex((h) => h != null),
      c = o.map(() => null);
    a >= 0 &&
      ema(o.slice(a), 9).forEach((h, p) => {
        c[a + p] = h;
      });
    let l = chart.addSeries(
      HistogramSeries,
      {
        priceLineVisible: !1,
        lastValueVisible: !1,
      },
      n,
    );
    (l.setData(
      i.map((h, p) =>
        o[p] == null || c[p] == null
          ? {
              time: h.time,
            }
          : {
              time: h.time,
              value: o[p] - c[p],
              color: o[p] - c[p] >= 0 ? "rgba(22,163,74,.6)" : "rgba(225,29,72,.6)",
            },
      ),
    ),
      indSeries.push(l),
      e(o, "#2563eb", n),
      e(c, "#f59e0b", n));
  }
  try {
    chart
      .panes()
      .slice(1)
      .forEach((s) => s.setHeight(IND.vol && s === chart.panes()[1] ? 80 : 100));
  } catch {}
}
function bindIndicators() {
  (document.querySelectorAll("[data-ind]").forEach((i) => {
    ((i.checked = !!IND[i.dataset.ind]),
      (i.onchange = () => {
        IND[i.dataset.ind] = i.checked;
        try {
          localStorage.setItem("totum.ind", JSON.stringify(IND));
        } catch {}
        renderIndicators();
      }));
  }),
    ($("indBtn").onclick = () => {
      $("indMenu").hidden = !$("indMenu").hidden;
    }),
    document.addEventListener("click", (i) => {
      i.target.closest("#ddInd") || ($("indMenu").hidden = !0);
    }));
}
var CHART_TYPES = {
    candles: "Свечи",
    hollow: "Пустые свечи",
    bars: "Бары",
    heikin: "Хейкен Аши",
    line: "Линия",
    markers: "Линия с маркерами",
    step: "Линия шага",
    area: "Область",
    baseline: "Базовая линия",
    columns: "Колонны",
  },
  chartType = "candles";
try {
  chartType = localStorage.getItem("totum.ctype") || "candles";
} catch {}
CHART_TYPES[chartType] || (chartType = "candles");
var UP_COLOR = "#16a34a",
  DOWN_COLOR = "#e11d48";
function createMainSeries() {
  let i = {
    priceLineVisible: !0,
    lastValueVisible: !0,
  };
  switch (chartType) {
    case "hollow":
      candleSeries = chart.addSeries(CandlestickSeries, {
        ...i,
        upColor: "rgba(0,0,0,0)",
        downColor: DOWN_COLOR,
        borderUpColor: UP_COLOR,
        borderDownColor: DOWN_COLOR,
        wickUpColor: UP_COLOR,
        wickDownColor: DOWN_COLOR,
      });
      break;
    case "bars":
      candleSeries = chart.addSeries(BarSeries, {
        ...i,
        upColor: UP_COLOR,
        downColor: DOWN_COLOR,
        thinBars: !1,
      });
      break;
    case "line":
      candleSeries = chart.addSeries(LineSeries, {
        ...i,
        color: "#2563eb",
        lineWidth: 2,
      });
      break;
    case "markers":
      candleSeries = chart.addSeries(LineSeries, {
        ...i,
        color: "#2563eb",
        lineWidth: 2,
        pointMarkersVisible: !0,
        pointMarkersRadius: 2.5,
      });
      break;
    case "step":
      candleSeries = chart.addSeries(LineSeries, {
        ...i,
        color: "#2563eb",
        lineWidth: 2,
        lineType: LineType.WithSteps,
      });
      break;
    case "area":
      candleSeries = chart.addSeries(AreaSeries, {
        ...i,
        lineColor: "#2563eb",
        topColor: "rgba(37,99,235,.35)",
        bottomColor: "rgba(37,99,235,.02)",
        lineWidth: 2,
      });
      break;
    case "baseline":
      candleSeries = chart.addSeries(BaselineSeries, {
        ...i,
        topLineColor: UP_COLOR,
        topFillColor1: "rgba(22,163,74,.28)",
        topFillColor2: "rgba(22,163,74,.04)",
        bottomLineColor: DOWN_COLOR,
        bottomFillColor1: "rgba(225,29,72,.04)",
        bottomFillColor2: "rgba(225,29,72,.28)",
      });
      break;
    case "columns":
      candleSeries = chart.addSeries(HistogramSeries, {
        ...i,
        color: "#2563eb",
      });
      break;
    default:
      candleSeries = chart.addSeries(CandlestickSeries, {
        ...i,
        upColor: UP_COLOR,
        downColor: DOWN_COLOR,
        borderVisible: !1,
        wickUpColor: UP_COLOR,
        wickDownColor: DOWN_COLOR,
      });
  }
  (S.priceFormat &&
    candleSeries.applyOptions({
      priceFormat: S.priceFormat,
    }),
    candleSeries.attachPrimitive(drawPrimitive));
}
function heikinAshi(i) {
  let t = [];
  return (
    i.forEach((e, n) => {
      let s = (e.open + e.high + e.low + e.close) / 4,
        r = n ? (t[n - 1].open + t[n - 1].close) / 2 : (e.open + e.close) / 2;
      t.push({
        time: e.time,
        open: r,
        close: s,
        high: Math.max(e.high, r, s),
        low: Math.min(e.low, r, s),
      });
    }),
    t
  );
}
function seriesData() {
  let i = S.bars || [];
  return ["candles", "hollow", "bars"].includes(chartType)
    ? i
    : chartType === "heikin"
      ? heikinAshi(i)
      : chartType === "columns"
        ? i.map((t) => ({
            time: t.time,
            value: t.close,
            color: t.close >= t.open ? "rgba(22,163,74,.7)" : "rgba(225,29,72,.7)",
          }))
        : i.map((t) => ({
            time: t.time,
            value: t.close,
          }));
}
/* Отметки сделок на графике, как на биржах: где открыли и где закрыли позицию.
   Покупка — зелёная стрелка вверх под ценой (лонг или закрытие шорта).
   Продажа — красная стрелка вниз над ценой (шорт или закрытие лонга).
   Несколько сделок одной стороны в одной свече объединяются в одну отметку. */
let tradeMarks = null,
  tradeMarksSeries = null,
  fillsAt = 0;
S.fills = [];
const MARK_TEXT = {
  "Open Long": "Лонг",
  "Close Long": "Закрыл лонг",
  "Open Short": "Шорт",
  "Close Short": "Закрыл шорт",
  "Long > Short": "Разворот в шорт",
  "Short > Long": "Разворот в лонг",
  Buy: "Покупка",
  Sell: "Продажа",
};
async function loadFills(force = !1) {
  if (!S.user || (!force && Date.now() - fillsAt < 1e4)) return;
  fillsAt = Date.now();
  try {
    S.fills = (await info.userFills({ user: S.user })) || [];
    drawTradeMarks();
  } catch (e) {
    console.warn("[fills]", e?.message || e);
  }
}
function drawTradeMarks() {
  if (!candleSeries) return;
  if (tradeMarksSeries !== candleSeries) {
    try {
      tradeMarks?.detach();
    } catch {
      /* серия уже удалена */
    }
    tradeMarks = createSeriesMarkers(candleSeries, []);
    tradeMarksSeries = candleSeries;
  }
  const bars = S.bars || [];
  if (!bars.length || !S.fills?.length || SET.showTrades === !1) return tradeMarks.setMarkers([]);
  const step = barSec(),
    first = bars[0].time,
    last = bars[bars.length - 1].time;
  const groups = new Map();
  for (const f of S.fills) {
    if (f.coin !== S.coin) continue;
    const t = Math.floor(f.time / 1e3 / step) * step;
    if (t < first || t > last + step) continue;
    const k = `${t}|${f.side}`,
      sz = Number(f.sz),
      px = Number(f.px);
    const g = groups.get(k) || { time: Math.min(t, last), side: f.side, sz: 0, ntl: 0, dirs: new Set() };
    g.sz += sz;
    g.ntl += sz * px;
    g.dirs.add(f.dir);
    groups.set(k, g);
  }
  const marks = [...groups.values()]
    .sort((a, b) => a.time - b.time)
    .map((g) => {
      const buy = g.side === "B",
        d = [...g.dirs],
        word = d.length === 1 ? MARK_TEXT[d[0]] || (buy ? "Покупка" : "Продажа") : buy ? "Покупка" : "Продажа";
      return {
        time: g.time,
        position: buy ? "atPriceBottom" : "atPriceTop",
        price: g.ntl / g.sz,
        shape: buy ? "arrowUp" : "arrowDown",
        color: buy ? UP_COLOR : DOWN_COLOR,
        text: `${buy ? "Buy" : "Sell"} · ${word}`,
      };
    });
  tradeMarks.setMarkers(marks);
}
function setSeriesData() {
  (candleSeries.setData(seriesData()),
    drawTradeMarks(),
    chartType === "baseline" &&
      S.bars?.length &&
      candleSeries.applyOptions({
        baseValue: {
          type: "price",
          price: S.bars[0].close,
        },
      }));
}
function updateSeriesBar(i) {
  if (["candles", "hollow", "bars"].includes(chartType)) candleSeries.update(i);
  else if (chartType === "heikin") {
    let t = heikinAshi(S.bars || [i]);
    candleSeries.update(t.at(-1));
  } else
    chartType === "columns"
      ? candleSeries.update({
          time: i.time,
          value: i.close,
          color: i.close >= i.open ? "rgba(22,163,74,.7)" : "rgba(225,29,72,.7)",
        })
      : candleSeries.update({
          time: i.time,
          value: i.close,
        });
}
function setChartType(i) {
  if (!(!CHART_TYPES[i] || !chart)) {
    chartType = i;
    try {
      localStorage.setItem("totum.ctype", i);
    } catch {}
    try {
      candleSeries.detachPrimitive(drawPrimitive);
    } catch {}
    (chart.removeSeries(candleSeries),
      (chartLines = []),
      createMainSeries(),
      setSeriesData(),
      drawChartLines(),
      ($("ctypeLabel").textContent = CHART_TYPES[i]),
      document.querySelectorAll("[data-ctype]").forEach((t) => t.classList.toggle("on", t.dataset.ctype === i)));
  }
}
var DRAWINGS = {};
try {
  DRAWINGS = JSON.parse(localStorage.getItem("totum.draw2") || "{}");
} catch {
  DRAWINGS = {};
}
var HIST = {},
  histFor = () => {
    var i;
    return (
      HIST[(i = S.coin)] ||
      (HIST[i] = {
        undo: [],
        redo: [],
      })
    );
  },
  snapDrawings = () => JSON.parse(JSON.stringify(coinDrawings()));
function pushUndo() {
  let i = histFor();
  (i.undo.push(snapDrawings()), i.undo.length > 100 && i.undo.shift(), (i.redo.length = 0), updUndoBtns());
}
function updUndoBtns() {
  let i = histFor();
  ($("drawUndo") && ($("drawUndo").disabled = !i.undo.length && !coinDrawings().length),
    $("drawRedo") && ($("drawRedo").disabled = !i.redo.length));
}
var DRAW = {
    tool: "cursor",
    pts: [],
    magnet: !1,
    locked: !1,
    hidden: !1,
    preview: null,
    brush: null,
  },
  FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1],
  coinDrawings = () => {
    var i;
    return DRAWINGS[(i = S.coin)] || (DRAWINGS[i] = []);
  },
  saveDrawings = () => {
    try {
      localStorage.setItem("totum.draw2", JSON.stringify(DRAWINGS));
    } catch {}
  },
  barSec = () => INTERVAL_MS[S.interval] / 1e3;
function timeToLogical(i) {
  let t = S.bars;
  if (!t?.length) return null;
  let e = (i - t[0].time) / barSec();
  return chart.timeScale().logicalToCoordinate(e);
}
function logicalToTime(i) {
  let t = S.bars;
  if (!t?.length) return null;
  let e = chart.timeScale().coordinateToLogical(i);
  return e == null ? null : t[0].time + Math.round(e) * barSec();
}
function pointFromXY(i, t, e = !1) {
  let n = logicalToTime(i),
    s = candleSeries.coordinateToPrice(t);
  if (e && S.bars?.length) {
    let r = chart.timeScale().coordinateToLogical(i);
    r != null && (n = S.bars[0].time + r * barSec());
  }
  if (e)
    return n == null || s == null
      ? null
      : {
          t: n,
          p: s,
        };
  if (n == null || s == null) return null;
  if (DRAW.magnet && S.bars?.length) {
    let r = S.bars.reduce((o, a) => (Math.abs(a.time - n) < Math.abs(o.time - n) ? a : o));
    s = [r.open, r.high, r.low, r.close].reduce((o, a) => (Math.abs(a - s) < Math.abs(o - s) ? a : o));
  }
  return {
    t: n,
    p: s,
  };
}
var drawPrimitive = {
  _req: null,
  attached(i) {
    this._req = i.requestUpdate;
  },
  detached() {
    this._req = null;
  },
  refresh() {
    this._req?.();
  },
  updateAllViews() {},
  paneViews() {
    return [
      {
        zOrder: () => "top",
        renderer: () => ({
          draw: (i) => i.useMediaCoordinateSpace((t) => drawShapes(t.context, t.mediaSize)),
        }),
      },
    ];
  },
};
function drawShapes(i, t) {
  if (!candleSeries) return;
  let e = getComputedStyle(document.documentElement),
    n = e.getPropertyValue("--accent").trim() || "#2563eb",
    s = e.getPropertyValue("--text").trim() || "#0f172a",
    r = (a) => candleSeries.priceToCoordinate(a),
    o = DRAW.hidden ? [] : [...coinDrawings()];
  (DRAW.preview && o.push(DRAW.preview),
    (i.lineWidth = 1.5),
    (i.font = "12px ui-sans-serif,system-ui"),
    (i.textBaseline = "middle"));
  for (let a of o) {
    ((i.strokeStyle = a.color || n), (i.fillStyle = a.color || n), i.setLineDash(a.kind === "measure" ? [4, 3] : []));
    let c = (f) => ({
        x: timeToLogical(f.t),
        y: r(f.p),
      }),
      [l, h, p] = (a.pts || []).map(c);
    if (!(l && (l.x == null || l.y == null))) {
      switch ((i.beginPath(), a.kind)) {
        case "trend":
          h && (i.moveTo(l.x, l.y), i.lineTo(h.x, h.y));
          break;
        case "ray":
          if (h) {
            let f = h.x - l.x,
              b = h.y - l.y,
              w = f ? (t.width - l.x) / f : 0;
            (i.moveTo(l.x, l.y), i.lineTo(f >= 0 ? t.width : 0, l.y + b * (f >= 0 ? w : -l.x / (f || -1))));
          }
          break;
        case "hline":
          (i.moveTo(0, l.y), i.lineTo(t.width, l.y), i.fillText(fmtPx(a.pts[0].p), 6, l.y - 8));
          break;
        case "vline":
          (i.moveTo(l.x, 0), i.lineTo(l.x, t.height));
          break;
        case "rect":
          h &&
            (i.rect(Math.min(l.x, h.x), Math.min(l.y, h.y), Math.abs(h.x - l.x), Math.abs(h.y - l.y)),
            (i.globalAlpha = 0.1),
            i.fill(),
            (i.globalAlpha = 1));
          break;
        case "channel":
          if (h && (i.moveTo(l.x, l.y), i.lineTo(h.x, h.y), p)) {
            let f = p.y - (l.y + (h.y - l.y) * ((p.x - l.x) / (h.x - l.x || 1)));
            (i.moveTo(l.x, l.y + f), i.lineTo(h.x, h.y + f));
          }
          break;
        case "fib":
          if (h) {
            let f = Math.min(l.x, h.x),
              b = Math.max(l.x, h.x, f + 40);
            FIB_LEVELS.forEach((w) => {
              let _ = a.pts[1].p + (a.pts[0].p - a.pts[1].p) * w,
                P = r(_);
              P != null && (i.moveTo(f, P), i.lineTo(b, P), i.fillText(`${w} \xB7 ${fmtPx(_)}`, b + 4, P));
            });
          }
          break;
        case "brush":
          a.pts.map(c).forEach((b, w) => (w ? i.lineTo(b.x, b.y) : i.moveTo(b.x, b.y)));
          break;
        case "text":
          ((i.fillStyle = s), (i.font = "600 13px ui-sans-serif,system-ui"), i.fillText(a.text || "", l.x, l.y));
          break;
        case "measure":
          if (h) {
            i.rect(Math.min(l.x, h.x), Math.min(l.y, h.y), Math.abs(h.x - l.x), Math.abs(h.y - l.y));
            let f = a.pts[1].p - a.pts[0].p,
              b = (f / a.pts[0].p) * 100,
              w = Math.round((a.pts[1].t - a.pts[0].t) / barSec());
            ((i.globalAlpha = 0.12),
              (i.fillStyle = f >= 0 ? UP_COLOR : DOWN_COLOR),
              i.fill(),
              (i.globalAlpha = 1),
              (i.fillStyle = f >= 0 ? UP_COLOR : DOWN_COLOR),
              (i.font = "600 12px ui-sans-serif,system-ui"),
              i.fillText(
                `${f >= 0 ? "+" : ""}${fmtPx(f)} (${b >= 0 ? "+" : ""}${b.toFixed(2)}%) \xB7 ${w} бар.`,
                Math.min(l.x, h.x) + 4,
                Math.min(l.y, h.y) - 10,
              ));
          }
          break;
      }
      if ((i.stroke(), i.setLineDash([]), a === DRAW.preview || DRAW.tool !== "cursor"))
        for (let f of [l, h, p]) f && f.x != null && (i.beginPath(), i.arc(f.x, f.y, 3, 0, Math.PI * 2), i.fill());
    }
  }
}
var TOOL_POINTS = {
  trend: 2,
  ray: 2,
  hline: 1,
  vline: 1,
  rect: 2,
  channel: 3,
  fib: 2,
  text: 1,
  measure: 2,
};
function setTool(i) {
  if (i === "magnet") return ((DRAW.magnet = !DRAW.magnet), updToolBtns());
  if (i === "lock")
    return (
      (DRAW.locked = !DRAW.locked),
      toast(DRAW.locked ? "Рисунки закреплены: новые фигуры не добавляются" : "Рисование снова доступно", "info"),
      updToolBtns()
    );
  if (i === "hide") return ((DRAW.hidden = !DRAW.hidden), drawPrimitive.refresh(), updToolBtns());
  if (i === "zoom") {
    chart.timeScale().fitContent();
    return;
  }
  if (i === "clear") {
    coinDrawings().length &&
      confirm("Удалить все рисунки на этой паре?") &&
      (pushUndo(), (DRAWINGS[S.coin] = []), saveDrawings(), drawPrimitive.refresh(), updUndoBtns());
    return;
  }
  if (DRAW.locked && i !== "cursor") {
    toast("Сначала снимите замок", "info");
    return;
  }
  ((DRAW.tool = i),
    (DRAW.pts = []),
    (DRAW.preview = null),
    (DRAW.brush = null),
    updToolBtns(),
    drawPrimitive.refresh());
}
function updToolBtns() {
  (document.querySelectorAll("[data-tool]").forEach((i) => {
    let t = i.dataset.tool;
    i.classList.toggle(
      "on",
      t === DRAW.tool ||
        (t === "magnet" && DRAW.magnet) ||
        (t === "lock" && DRAW.locked) ||
        (t === "hide" && DRAW.hidden),
    );
  }),
    $("chart").classList.toggle("drawing", DRAW.tool !== "cursor"),
    chart?.applyOptions({
      handleScroll: DRAW.tool !== "brush",
      handleScale: DRAW.tool !== "brush",
    }));
}
function commitShape(i) {
  (i.kind !== "measure" ? (pushUndo(), coinDrawings().push(i), saveDrawings(), updUndoBtns()) : (DRAW.lastMeasure = i),
    (DRAW.preview = i.kind === "measure" ? i : null),
    (DRAW.pts = []),
    i.kind !== "measure" ? setTool("cursor") : drawPrimitive.refresh());
}
function undoDraw() {
  let i = histFor();
  if (DRAW.lastMeasure || (DRAW.preview && DRAW.preview.kind === "measure")) {
    ((DRAW.lastMeasure = null), (DRAW.preview = null), drawPrimitive.refresh());
    return;
  }
  if (i.undo.length) (i.redo.push(snapDrawings()), (DRAWINGS[S.coin] = i.undo.pop()));
  else if (coinDrawings().length) (i.redo.push(snapDrawings()), (DRAWINGS[S.coin] = coinDrawings().slice(0, -1)));
  else return;
  (saveDrawings(), drawPrimitive.refresh(), updUndoBtns());
}
function redoDraw() {
  let i = histFor();
  i.redo.length &&
    (i.undo.push(snapDrawings()),
    (DRAWINGS[S.coin] = i.redo.pop()),
    saveDrawings(),
    drawPrimitive.refresh(),
    updUndoBtns());
}
function bindDrawing() {
  (document.querySelectorAll("[data-tool]").forEach((e) => (e.onclick = () => setTool(e.dataset.tool))),
    ($("drawUndo").onclick = undoDraw),
    ($("drawRedo").onclick = redoDraw),
    updUndoBtns());
  let i = $("chart"),
    t = (e) => {
      let n = i.getBoundingClientRect();
      return {
        x: e.clientX - n.left,
        y: e.clientY - n.top,
      };
    };
  (i.addEventListener("click", (e) => {
    let n = DRAW.tool;
    if (n === "cursor" || n === "brush") return;
    let { x: s, y: r } = t(e),
      o = pointFromXY(s, r);
    if (o) {
      if (n === "text") {
        let a = prompt("Текст на графике:");
        a
          ? commitShape({
              kind: "text",
              pts: [o],
              text: a.slice(0, 80),
            })
          : setTool("cursor");
        return;
      }
      (DRAW.pts.push(o),
        DRAW.pts.length >= TOOL_POINTS[n] &&
          commitShape({
            kind: n,
            pts: [...DRAW.pts],
          }));
    }
  }),
    i.addEventListener("mousemove", (e) => {
      let n = DRAW.tool;
      if (n === "cursor") return;
      let { x: s, y: r } = t(e),
        o = pointFromXY(s, r, n === "brush");
      if (o) {
        if (n === "brush" && DRAW.brush) {
          (DRAW.brush.pts.push(o), (DRAW.preview = DRAW.brush), drawPrimitive.refresh());
          return;
        }
        DRAW.pts.length &&
          TOOL_POINTS[n] > 1 &&
          ((DRAW.preview = {
            kind: n,
            pts: [...DRAW.pts, o],
          }),
          drawPrimitive.refresh());
      }
    }),
    i.addEventListener("mousedown", (e) => {
      if (DRAW.tool !== "brush") return;
      let { x: n, y: s } = t(e),
        r = pointFromXY(n, s, !0);
      r &&
        (DRAW.brush = {
          kind: "brush",
          pts: [r],
        });
    }),
    window.addEventListener("mouseup", () => {
      DRAW.tool !== "brush" ||
        !DRAW.brush ||
        (DRAW.brush.pts.length > 1 && (pushUndo(), coinDrawings().push(DRAW.brush), saveDrawings(), updUndoBtns()),
        (DRAW.brush = null),
        (DRAW.preview = null),
        drawPrimitive.refresh());
    }),
    document.addEventListener("keydown", (e) => {
      e.target.matches("input,textarea") ||
        (e.key === "Escape" && setTool("cursor"),
        (e.ctrlKey || e.metaKey) &&
          e.key.toLowerCase() === "z" &&
          (e.preventDefault(), e.shiftKey ? redoDraw() : undoDraw()));
    }),
    ($("ctypeList").innerHTML = Object.entries(CHART_TYPES)
      .map(([e, n]) => `<button type="button" data-ctype="${e}">${n}</button>`)
      .join("")),
    document.querySelectorAll("[data-ctype]").forEach(
      (e) =>
        (e.onclick = () => {
          (setChartType(e.dataset.ctype), ($("ctypeMenu").hidden = !0));
        }),
    ),
    ($("ctypeBtn").onclick = () => {
      $("ctypeMenu").hidden = !$("ctypeMenu").hidden;
    }),
    document.addEventListener("click", (e) => {
      e.target.closest("#ddCtype") || ($("ctypeMenu").hidden = !0);
    }),
    ($("ctypeLabel").textContent = CHART_TYPES[chartType]),
    document.querySelectorAll("[data-ctype]").forEach((e) => e.classList.toggle("on", e.dataset.ctype === chartType)),
    updToolBtns());
}
S.orders = [];
S.fundingAcc = {};
var fundingAt = 0;
/* Площадки HIP-3, по которым нужно спрашивать состояние счёта:
   где есть позиции или ордера, площадка открытой пары и то, что прислал WebSocket. */
function userDexes() {
  const d = new Set(S.wsDexes || []);
  for (const p of S.positions || []) dexOf(p.coin) && d.add(dexOf(p.coin));
  for (const o of S.orders || []) dexOf(o.coin) && d.add(dexOf(o.coin));
  dexOf(S.coin) && d.add(dexOf(S.coin));
  return [...d].slice(0, 12);
}
function watchAllDexes() {
  if (!subs || !S.user || S.chSubUser === S.user) return;
  S.chSubUser = S.user;
  subscribeRetry("allDexsClearinghouseState", () =>
    subs.allDexsClearinghouseState({ user: S.user }, (ev) => {
      const had = (S.wsDexes || []).join();
      S.wsDexes = (ev?.clearinghouseStates || [])
        .filter(([d, st]) => d && (st?.assetPositions?.length || Number(st?.marginSummary?.accountValue || 0) > 0))
        .map(([d]) => d);
      S.wsDexes.join() !== had && refreshAccount();
    }),
  );
}
async function refreshAccount(i = {}) {
  if (S.user)
    try {
      watchAllDexes();
      let t = !i.light || Date.now() - (S.ordersAt || 0) > 15e3,
        dexes = userDexes(),
        [e, n, s, dexStates, dexOrders] = await Promise.all([
          info.clearinghouseState({ user: S.user }),
          t
            ? info.frontendOpenOrders({ user: S.user }).catch(() => info.openOrders({ user: S.user }))
            : Promise.resolve(null),
          info.spotClearinghouseState({ user: S.user }).catch(() => null),
          Promise.all(dexes.map((d) => info.clearinghouseState({ user: S.user, dex: d }).catch(() => null))),
          t
            ? Promise.all(dexes.map((d) => info.frontendOpenOrders({ user: S.user, dex: d }).catch(() => [])))
            : Promise.resolve(null),
        ]);
      s && ((S.spotBal = s.balances || []), renderSpotBalances());
      n && ((S.ordersAt = Date.now()), (S.orders = [...n, ...(dexOrders || []).flat()]), renderBook());
      // позиции со всех площадок
      const states = [e, ...dexStates.filter(Boolean)];
      S.dexWithdrawable = {};
      dexes.forEach((d, k) => dexStates[k] && (S.dexWithdrawable[d] = Number(dexStates[k].withdrawable) || 0));
      S.positions = states.flatMap((st) => (st.assetPositions || []).map((r) => r.position)).filter((r) => Number(r.szi) !== 0);
      const sum = (f) => states.reduce((a, st) => a + (Number(f(st)) || 0), 0);
      S.marginUsed = sum((st) => st.marginSummary?.totalMarginUsed);
      S.crossMaint = sum((st) => st.crossMaintenanceMarginUsed);
      if (isUnified()) {
        // единый счёт: деньги лежат одним балансом (спот), к нему добавляется нереализованный PnL позиций
        const upnl = S.positions.reduce((a, p) => a + Number(p.unrealizedPnl || 0), 0);
        S.withdrawable = spotBal("USDC");
        S.accountValue = spotTotal() + upnl;
        S.crossValue = S.withdrawable + S.marginUsed + upnl;
      } else {
        S.withdrawable = Number(e.withdrawable) || 0;
        S.accountValue = sum((st) => st.marginSummary?.accountValue);
        S.crossValue = Number(e.crossMarginSummary?.accountValue ?? e.marginSummary.accountValue) || 0;
      }
      $("accValue").textContent = usd(S.accountValue);
      (["home", "assets"].includes(document.body.dataset.app) && renderAppPage(),
        Date.now() - fundingAt > 6e4 && loadFundingAccrued(),
        updateAdlMoves(),
        loadFills(!i.light),
        renderPositions(),
        renderOrders(),
        drawChartLines(),
        updateOrderInfo(),
        netGood("account"));
    } catch (t) {
      netBad(t, "account");
    }
}
function filledPct(i) {
  let t = Number(i.origSz || 0),
    e = Number(i.sz || 0);
  return t > 0 && e >= 0 && e < t ? Math.round((1 - e / t) * 1e3) / 10 : 0;
}
var fillBar = (i) => {
    let t = filledPct(i);
    return `<span class="fill"><i style="width:${t}%"></i></span><span class="fill-t">${t ? `${t.toLocaleString("ru-RU")}%` : "0%"}</span>`;
  },
  isTpType = (i) => /take|tp/i.test(i.orderType || "");
function orderGroups(i) {
  let t = S.orders.filter((l) => l.coin === i),
    e = S.positions.find((l) => l.coin === i),
    n = e ? (Number(e.szi) > 0 ? "A" : "B") : null,
    s = t.filter((l) => !l.isTrigger && !l.reduceOnly),
    r = new Map(),
    o = new Map();
  for (let l of t) {
    l.isTrigger && l.reduceOnly && o.set(l.oid, l);
    for (let h of l.children || [])
      (r.set(h.oid, l),
        o.has(h.oid) ||
          o.set(h.oid, {
            ...h,
            coin: i,
          }));
  }
  let a = [],
    c = new Map();
  for (let l of o.values()) {
    let h = r.get(l.oid) || null;
    if (!h && n && l.side === n) {
      (a.push(l), (l._pendingFor = null));
      continue;
    }
    (h ||
      (h = s.find((f) => f.side !== l.side) || {
        oid: `none-${l.side}`,
        side: l.side === "B" ? "A" : "B",
        limitPx: null,
      }),
      (l._pendingFor = h));
    let p = c.get(h.oid) || {
      parent: h,
      tp: null,
      sl: null,
    };
    ((p[isTpType(l) ? "tp" : "sl"] = l), c.set(h.oid, p));
  }
  return {
    tp: a.find(isTpType) || null,
    sl: a.find((l) => !isTpType(l)) || null,
    all: a,
    pending: c,
  };
}
function tpslFor(i) {
  return orderGroups(i);
}
var maintRate = (i) => {
  let t = mkt(i);
  return t && t.maxLeverage ? 1 / (2 * t.maxLeverage) : 0.01;
};
function estLiq(i, t, e, n, s, r) {
  if (!(e > 0 && n > 0)) return 0;
  let o = e * n,
    a = maintRate(i),
    c;
  if (r) c = o / s - o * a;
  else {
    if (!S.user) return 0;
    let h = S.positions
      .filter((p) => p.coin !== i && p.leverage?.type !== "isolated")
      .reduce((p, f) => p + Math.abs(Number(f.positionValue || 0)) * maintRate(f.coin), 0);
    c = (S.crossValue || S.accountValue || 0) - h - o * a - o * FEE_RATE();
  }
  let l = t ? e - c / n : e + c / n;
  return l > 0 ? l : 0;
}
function marginRatio(i) {
  if (i.leverage?.type === "isolated") {
    let t = Math.abs(Number(i.positionValue || 0)) * maintRate(i.coin),
      e = Number(i.marginUsed || 0);
    return e > 0 ? t / e : 0;
  }
  return S.crossValue > 0 ? S.crossMaint / S.crossValue : 0;
}
var sgnUsd = (i) => {
    let t = Math.round(Number(i) * 100) / 100;
    return t === 0 ? usd(0) : `${t > 0 ? "+" : ""}${usd(t)}`;
  },
  clsOf = (i) => (i >= 0 ? "pos" : "neg");
/* ============================================================
   ADL (автоделеверидж) — оценка риска для каждой позиции.

   Как работает на Hyperliquid: если чью-то позицию ликвидировали, а закрыть её
   в рынок не получилось (убыток больше залога), биржа принудительно закрывает
   ПРИБЫЛЬНЫЕ позиции на другой стороне по маркировке. Кого первым — решает очередь:
   (маркировка / цена входа) × (размер позиции / стоимость счёта).
   Чем больше прибыль и плечо, тем ближе к началу очереди.

   Сама очередь включается редко: только при резком обвале или взлёте, когда
   ликвидации не успевают закрываться. Поэтому уровень = место в очереди,
   ограниченное условиями рынка:
   • спокойно (за 15 мин цена ушла в вашу сторону меньше чем на 1,5%) — не выше 2 делений;
   • резкое движение 1,5–3% — не выше 3;
   • от 3% — полная шкала, красный при начале очереди.
   ============================================================ */
const ADL_STRESS_MID = 0.015, ADL_STRESS_HIGH = 0.03;
S.adlMove = {};
let adlMoveAt = 0;
async function updateAdlMoves() {
  if (Date.now() - adlMoveAt < 6e4 || !S.positions?.length) return;
  adlMoveAt = Date.now();
  const since = Date.now() - 15 * 6e4;
  await Promise.all(
    [...new Set(S.positions.map((p) => p.coin))].slice(0, 8).map(async (coin) => {
      try {
        const bars = await info.candleSnapshot({ coin, interval: "1m", startTime: since });
        if (!bars?.length) return;
        const hi = Math.max(...bars.map((b) => +b.h)), lo = Math.min(...bars.map((b) => +b.l)), last = +bars[bars.length - 1].c;
        S.adlMove[coin] = { up: lo > 0 ? last / lo - 1 : 0, down: hi > 0 ? 1 - last / hi : 0, at: Date.now() };
      } catch {
        /* нет данных — считаем рынок спокойным */
      }
    }),
  );
  renderPositions();
}
function adlRisk(p) {
  const mark = Number(S.ctx[p.coin]?.markPx || 0), entry = Number(p.entryPx || 0), long = Number(p.szi) > 0;
  if (!mark || !entry) return null;
  const ratio = long ? mark / entry : entry / mark;
  const notional = Math.abs(Number(p.szi)) * mark;
  const equity = p.leverage?.type === "isolated" ? Number(p.marginUsed || 0) : S.accountValue || S.crossValue || 0;
  if (!(equity > 0)) return null;
  const score = ratio * (notional / equity);
  // место в очереди: 1 — в конце, 5 — среди первых (убыточные позиции — всегда в конце)
  const queue = ratio <= 1 ? 1 : score < 3 ? 1 : score < 8 ? 2 : score < 15 ? 3 : score < 25 ? 4 : 5;
  // условия для ADL: резкое движение цены в сторону вашей прибыли за 15 минут
  const mv = S.adlMove[p.coin], move = mv ? (long ? mv.up : mv.down) : 0;
  const stress = move >= ADL_STRESS_HIGH ? 2 : move >= ADL_STRESS_MID ? 1 : 0;
  const cap = stress === 2 ? 5 : stress === 1 ? 3 : 2;
  return { level: Math.min(queue, cap), queue, stress, move, score, inProfit: ratio > 1 };
}
const ADL_TEXT = ["", "низкий", "низкий", "умеренный", "высокий", "очень высокий"];
const ADL_STRESS_TEXT = ["рынок спокойный", "цена резко движется", "резкое движение — возможны ADL"];
const adlBars = (lv) => [1, 2, 3, 4, 5].map((k) => `<i class="${k <= lv ? "on" : ""}"></i>`).join("");
function adlBadge(p) {
  const r = adlRisk(p);
  if (!r) return "—";
  const tip = `Риск ADL: ${ADL_TEXT[r.level]}. Место в очереди: ${r.queue} из 5. Сейчас: ${ADL_STRESS_TEXT[r.stress]}. Нажмите, чтобы узнать подробнее.`;
  return `<button type="button" class="adl lv${r.level}" data-adl="${esc(p.coin)}" title="${esc(tip)}">${adlBars(r.level)}</button>`;
}
function openAdlInfo(coin) {
  const p = coin && S.positions.find((x) => x.coin === coin), r = p && adlRisk(p);
  const pct = (x) => `${(x * 100).toFixed(2).replace(".", ",")}%`;
  $("adlBody").innerHTML = `
    ${r ? `<div class="adl-now"><span class="adl lv${r.level}">${adlBars(r.level)}</span>
      <div><b>${esc(pairLabel(coin))}: риск ${ADL_TEXT[r.level]}</b><small>Место в очереди ${r.queue} из 5 · ${ADL_STRESS_TEXT[r.stress]}${r.move > 0.001 ? ` (${pct(r.move)} за 15 мин в вашу сторону)` : ""}</small></div></div>` : ""}
    <h3>Что такое ADL</h3>
    <p>ADL — автоделеверидж. Иногда при резком обвале или взлёте позицию проигравшего трейдера не успевают закрыть по рынку, и его убыток становится больше залога. Тогда биржа закрывает часть <b>прибыльных</b> позиций на другой стороне по текущей цене, чтобы покрыть этот убыток.</p>
    <h3>Что это значит для вас</h3>
    <p>Если ADL сработает, позиция закроется <b>с прибылью</b> по текущей маркировке. Денег вы не теряете, но позиция закроется раньше, чем вы планировали.</p>
    <h3>Как читать индикатор</h3>
    <p><b>Место в очереди.</b> Считается по формуле биржи: чем больше прибыль и плечо относительно счёта, тем раньше закроют. Убыточные позиции — всегда в конце.</p>
    <p><b>Условия на рынке.</b> ADL бывает только при резком движении. Пока рынок спокойный, индикатор не поднимается выше 2 зелёных делений, даже при большом плече. Жёлтый — цена резко движется в вашу сторону (от 1,5% за 15 минут). Красный — от 3% за 15 минут и вы в начале очереди.</p>
    <p class="muted small">Это оценка Totum: точное место в очереди биржа не публикует. Снизить риск: уменьшить плечо или зафиксировать часть прибыли.</p>`;
  $("adlDialog").showModal();
}
function renderPositions() {
  (($("cntPos").textContent = S.positions.length ? `(${S.positions.length})` : ""),
    ($("btnCloseAll").disabled = !S.positions.length || !S.agentExchange));
  let i = S.positions.map((s) => {
      let r = Number(s.szi) > 0,
        o = S.ctx[s.coin];
      return {
        p: s,
        long: r,
        c: o,
        pnl: Number(s.unrealizedPnl),
        roe: Number(s.returnOnEquity || 0) * 100,
        next: o ? -Number(s.szi) * Number(o.markPx) * Number(o.funding) : 0,
        acc: S.fundingAcc[s.coin],
        real: S.realized[s.coin],
        tpsl: tpslFor(s.coin),
        lev: s.leverage ? `${s.leverage.type === "isolated" ? "Изол." : "Кросс"} ${s.leverage.value}x` : "",
      };
    }),
    t = (s) => `data-coin="${esc(s.p.coin)}" data-szi="${esc(s.p.szi)}"`;
  ((S.posShare = {}),
    i.forEach((s) => {
      S.posShare[s.p.coin] = {
        coin: s.p.coin,
        long: s.long,
        lev: s.p.leverage?.value,
        entry: Number(s.p.entryPx),
        exit: Number(s.c?.markPx || s.p.entryPx),
        exitLabel: "Маркировка",
        time: Date.now(),
        pnl: s.pnl,
        pnlLabel: "Нереализованный PnL",
        pct: s.roe,
        pctLabel: "ROE",
      };
    }));
  let e = (s, r = "") =>
    `<button class="share-btn pos-share" type="button" data-pos-share="${esc(s.p.coin)}" title="Картинка PnL по позиции">${SHARE_IC}${r}</button>`;
  $("posBody").innerHTML = i.length
    ? i
        .map(
          (s) => `<tr>
      <td><b>${esc(pairLabel(s.p.coin))}</b><span class="tag ${s.long ? "pos" : "neg"}">${s.long ? "Лонг" : "Шорт"} ${esc(s.lev)}</span>${e(s)}</td>
      <td class="${s.long ? "pos" : "neg"}">${Math.abs(Number(s.p.szi))}</td>
      <td>${fmtPx(s.p.entryPx)}</td><td>${s.c ? fmtPx(s.c.markPx) : "—"}</td>
      <td class="${clsOf(s.pnl)}">${sgnUsd(s.pnl)} (${s.roe >= 0 ? "+" : ""}${s.roe.toFixed(2)}%)</td>
      <td class="${clsOf(s.real ?? 0)}">${s.real === void 0 ? "…" : sgnUsd(s.real)}</td>
      <td>${s.p.liquidationPx ? fmtPx(s.p.liquidationPx) : "—"}</td>
      <td>${adlBadge(s.p)}</td>
      <td>${usd(s.p.marginUsed || 0)}</td>
      <td class="fund-cell"><b class="${clsOf(s.acc ?? 0)}">${s.acc === void 0 ? "…" : sgnUsd(s.acc)}</b> / <span class="${clsOf(s.next)}">${sgnUsd(s.next)}</span></td>
      <td><div class="tpsl-cell">${s.tpsl.tp ? fmtPx(s.tpsl.tp.triggerPx) : "—"} / ${s.tpsl.sl ? fmtPx(s.tpsl.sl.triggerPx) : "—"}
        <button class="icon-btn" data-tpsl="${esc(s.p.coin)}" title="Задать TP / SL">✎</button></div></td>
      <td><div class="pos-actions">
        <button class="btn small ghost" data-close="${esc(s.p.coin)}" data-szi="${esc(s.p.szi)}" title="Закрыть всю позицию по рынку">Маркет</button>
        <button class="btn small ghost" data-close-dlg ${t(s)} data-ct="limit">Лимит</button>
        <button class="btn small ghost" data-reverse ${t(s)} title="Закрыть и открыть в обратную сторону">Разворот</button></div></td></tr>`,
        )
        .join("")
    : `<tr><td colspan="12" class="muted">${S.user ? "Открытых позиций нет" : "Подключите кошелёк"}</td></tr>`;
  let n = (s, r, o = "") => `<div><span>${s}</span><b class="${o}">${r}</b></div>`;
  $("posCards").innerHTML = i.length
    ? i
        .map((s) => {
          let r = marginRatio(s.p) * 100;
          return `<article class="pos-card">
      <header><span class="side-ic ${s.long ? "b" : "s"}">${s.long ? "Л" : "Ш"}</span><b>${esc(pairLabel(s.p.coin))}</b><span class="muted small">Бессрочный</span>${e(s, "PnL")}</header>
      <div class="pc-tags"><span class="tag lev">${esc(s.lev)}</span></div>
      <div class="pc-pnl"><span>Нереализованный PnL (USDC)</span><b class="${clsOf(s.pnl)}">${sgnUsd(s.pnl)} (${s.roe >= 0 ? "+" : ""}${s.roe.toFixed(2)}%)</b></div>
      <div class="pc-grid">
        ${n("Позиция (USDC)", num(Math.abs(Number(s.p.positionValue || 0)), 2))}
        ${n("Маржа (USDC)", num(s.p.marginUsed || 0, 2))}
        ${n("Коэфф. маржи", `${r.toFixed(2)}%`)}
        ${n("Цена входа", fmtPx(s.p.entryPx))}
        ${n("Маркировка", s.c ? fmtPx(s.c.markPx) : "—")}
        ${n("Расч. цена ликв.", s.p.liquidationPx ? fmtPx(s.p.liquidationPx) : "—", "warn")}
        ${n("Риск ADL", `${adlBadge(s.p)} <small>${ADL_TEXT[adlRisk(s.p)?.level || 0] || ""}</small>`)}
        ${n("Реализ. PnL (USDC)", s.real === void 0 ? "…" : sgnUsd(s.real), clsOf(s.real ?? 0))}
        ${n("Фандинг: начисл. / след.", `${s.acc === void 0 ? "…" : sgnUsd(s.acc)} / ${sgnUsd(s.next)}`)}
        ${n("TP / SL", `<span class="pos">${s.tpsl.tp ? fmtPx(s.tpsl.tp.triggerPx) : "--"}</span> / <span class="neg">${s.tpsl.sl ? fmtPx(s.tpsl.sl.triggerPx) : "--"}</span>`)}
      </div>
      <div class="pc-actions">
        <button class="btn small ghost" data-tpsl="${esc(s.p.coin)}">TP/SL</button>
        <button class="btn small ghost" data-reverse ${t(s)}>Разворот</button>
        <button class="btn small ghost" data-close-dlg ${t(s)}>Закрыть</button>
        <button class="btn small flash" data-close="${esc(s.p.coin)}" data-szi="${esc(s.p.szi)}">Быстро закрыть</button>
      </div></article>`;
        })
        .join("")
    : `<p class="muted small pad">${S.user ? "Открытых позиций нет" : "Подключите кошелёк"}</p>`;
}
function spotPriceOf(i) {
  if (i === "USDC") return 1;
  let t = S.spot.find((e) => e.base === i && e.quote === "USDC");
  return t ? Number(S.ctx[t.name]?.midPx || 0) : 0;
}
function renderSpotBalances() {
  let i = S.spotBal.filter((n) => Number(n.total) > 0),
    t = (n) => {
      if (n === "USDC") return 1;
      let s = S.spot.find((r) => r.base === n && r.quote === "USDC");
      return s ? Number(S.ctx[s.name]?.midPx || 0) : 0;
    },
    e = 0;
  (($("spotBody").innerHTML = i.length
    ? i
        .map((n) => {
          let s = Number(n.total),
            r = Number(n.hold),
            o = t(n.coin),
            a = s * o;
          e += a;
          let c = Number(n.entryNtl || 0),
            l = n.coin !== "USDC" && c > 0 ? a - c : null,
            h = S.spot.find((p) => p.base === n.coin && p.quote === "USDC");
          return `<tr><td><div class="pp-name">${coinIcon(h ? h.name : n.coin)}<b>${esc(n.coin)}</b></div></td>
      <td>${num(s, 6)}</td><td>${num(s - r, 6)}</td><td>${r ? num(r, 6) : "—"}</td>
      <td>${o ? usd(a) : "—"}</td><td>${l != null && s ? fmtPx(c / s) : "—"}</td>
      <td class="${l == null ? "" : clsOf(l)}">${l == null ? "—" : `${sgnUsd(l)} (${sgnNum((l / c) * 100)})`}</td>
      <td>${h ? `<button class="btn small ghost" data-spot-trade="${esc(h.name)}">Торговать</button>` : ""}</td></tr>`;
        })
        .join("") +
      `<tr><td colspan="4" class="muted">Итого на споте</td><td><b>${usd(e)}</b></td><td colspan="3"></td></tr>`
    : `<tr><td colspan="8" class="muted">${S.user ? "На спот-счёте пусто. Переведите USDC: «Фьючерсы ⇄ Спот» в панели ордера на спот-паре." : "Подключите кошелёк"}</td></tr>`),
    fixIcons($("spotBody")));
}
function setSpotSide(i) {
  ((S.spotSide = i),
    document.body.classList.toggle("spot-sell", i === "sell"),
    document.querySelectorAll("[data-sside]").forEach((t) => t.classList.toggle("on", t.dataset.sside === i)),
    applyPct(0));
}
function renderOrders() {
  let i = S.orders;
  for (let t of new Set(i.map((e) => e.coin))) orderGroups(t);
  (($("cntOrd").textContent = i.length ? `(${i.length})` : ""),
    ($("ordBody").innerHTML = i.length
      ? i
          .map(
            (t) => `<tr><td><b>${esc(pairLabel(t.coin))}</b></td>
    <td>${esc(ORDER_TYPES_RU[t.orderType] || t.orderType || "Лимит")}${t.isTrigger ? ` \xB7 ${fmtPx(t.triggerPx)}` : ""}</td>
    <td class="${t.side === "B" ? "pos" : "neg"}">${t.side === "B" ? "Покупка" : "Продажа"}${t.reduceOnly ? " · закрытие" : ""}${t._pendingFor ? ` <span class="tag wait">ждёт входа${t._pendingFor.limitPx ? ` по ${fmtPx(t._pendingFor.limitPx)}` : ""}</span>` : ""}</td>
    <td>${t.isTrigger && t.isPositionTpsl ? "по рынку" : fmtPx(t.limitPx)}</td><td>${Number(t.sz) ? `${t.sz}${Number(t.origSz) > Number(t.sz) ? ` <span class="muted">из ${t.origSz}</span>` : ""}` : "вся позиция"}</td>
    <td>${t.isTrigger ? "—" : `<div class="fill-cell">${fillBar(t)}</div>`}</td>
    <td><button class="btn small ghost" data-cancel="${t.oid}" data-coin="${esc(t.coin)}">Отменить</button></td></tr>`,
          )
          .join("")
      : '<tr><td colspan="7" class="muted">Открытых ордеров нет</td></tr>'));
}
S.realized = {};
async function loadFundingAccrued() {
  if (!(!S.user || !S.positions.length)) {
    fundingAt = Date.now();
    try {
      let i =
        (await info.userFills({
          user: S.user,
        })) || [];
      S.fills = i;
      let t = {};
      for (let o of S.positions) {
        let a = i.filter((c) => c.coin === o.coin && Number(c.startPosition) === 0).sort((c, l) => l.time - c.time)[0];
        t[o.coin] = a ? a.time : Date.now() - 7 * 864e5;
      }
      let e = Math.min(...Object.values(t)),
        n =
          (await info.userFunding({
            user: S.user,
            startTime: e,
          })) || [],
        s = {},
        r = {};
      for (let o of S.positions) ((s[o.coin] = 0), (r[o.coin] = 0));
      for (let o of n) {
        let a = o.delta || o;
        !(a.coin in s) || o.time < t[a.coin] || (s[a.coin] += fundingUsd(a));
      }
      for (let o of i)
        !(o.coin in r) || o.time < t[o.coin] || (r[o.coin] += Number(o.closedPnl || 0) - Number(o.fee || 0));
      for (let o in r) r[o] += s[o];
      ((S.fundingAcc = s), (S.realized = r), renderPositions());
    } catch (i) {
      console.warn("[funding]", i);
    }
  }
}
var fundingUsd = (i) => -Math.sign(Number(i.szi)) * Math.sign(Number(i.fundingRate)) * Math.abs(Number(i.usdc));
async function loadHistory() {
  if (S.user)
    try {
      let i =
        (await info.userFills({
          user: S.user,
        })) || [];
      $("histBody").innerHTML =
        i
          .slice(0, 50)
          .map((t) => {
            let e = new Date(t.time),
              n = Number(t.closedPnl || 0),
              s = Number(t.builderFee || 0);
            return `<tr><td>${e.toLocaleString("ru-RU", {
              hour12: !1,
            })}</td><td>${esc(pairLabel(t.coin))}</td>
        <td class="${t.side === "B" ? "pos" : "neg"}">${esc(DIR_RU[t.dir] || t.dir || (t.side === "B" ? "Покупка" : "Продажа"))}</td>
        <td>${fmtPx(t.px)}</td><td>${t.sz}</td><td>${num(t.fee, 4)} ${esc(t.feeToken || "")}${s ? ` <span class="muted">(Totum ${num(s, 4)})</span>` : ""}</td>
        <td class="${n >= 0 ? "pos" : "neg"}">${n ? usd(n) : "—"}</td></tr>`;
          })
          .join("") || '<tr><td colspan="7" class="muted">Сделок пока нет</td></tr>';
    } catch (i) {
      netBad(i);
    }
}
var OP = {
    tab: "open",
    filter: "all",
  },
  isBuilderUser = () => S.user && isAddress(CFG.builder) && S.user.toLowerCase() === CFG.builder.toLowerCase();
var kvRow = (i, t, e = "") => `<div><span>${i}</span><b class="${e}">${t}</b></div>`;
function openOrdersPage(i) {
  if (!S.user) {
    toast("Подключите кошелёк", "err");
    return;
  }
  (($("opBuilderTab").hidden = !isBuilderUser()),
    setOpTab(i || OP.tab),
    $("ordersPage").open || $("ordersPage").showModal());
}
function setOpTab(i) {
  ((OP.tab = i),
    document.querySelectorAll("[data-op]").forEach((t) => t.classList.toggle("on", t.dataset.op === i)),
    loadOpTab());
}
var opFilter = (i) => OP.filter === "all" || i === S.coin,
  SHARE_IC =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v7a1 1 0 001 1h14a1 1 0 001-1v-7"/><path d="M12 3v12M7 8l5-5 5 5"/></svg>',
  EMPTY_IC =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>',
  kvOp = (i, t, e = "") => `<div><span>${i}</span><b class="${e}">${t}</b></div>`,
  opEmpty = (i) => `<div class="op-empty">${EMPTY_IC}${i}</div>`,
  fmtTime = (i) =>
    new Date(i).toLocaleString("ru-RU", {
      hour12: !1,
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }),
  sgnNum = (i) =>
    `${i >= 0 ? "+" : "−"}${Math.abs(i).toLocaleString("ru-RU", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}%`;
OP.share = [];
function logLeverage(i, t) {
  try {
    let e = JSON.parse(localStorage.getItem("totum.levlog") || "[]");
    (e.push({
      coin: i,
      lev: t,
      t: Date.now(),
    }),
      localStorage.setItem("totum.levlog", JSON.stringify(e.slice(-300))));
  } catch {}
}
function leverageAt(i, t) {
  try {
    let n = JSON.parse(localStorage.getItem("totum.levlog") || "[]")
      .filter((s) => s.coin === i && s.t <= t + 12e4)
      .sort((s, r) => r.t - s.t)[0];
    return n ? n.lev : null;
  } catch {
    return null;
  }
}
async function loadOpTab() {
  let i = OP.tab,
    t = $("opList"),
    e = $("opNote");
  ((t.innerHTML = opEmpty("Загружаем…")), (e.textContent = ""), (OP.share = []));
  try {
    if (i === "open") {
      for (let h of new Set(S.orders.map((p) => p.coin))) orderGroups(h);
      let l = S.orders.filter((h) => opFilter(h.coin));
      ((e.textContent = "Лимитные ордера и TP/SL, которые ждут исполнения."),
        (t.innerHTML =
          l
            .map(
              (h) => `<article class="op-card ${h.side === "B" ? "win" : "loss"}">
        <header>${coinIcon(h.coin)}<b class="pair">${esc(pairLabel(h.coin))}</b>
          <span class="tag ${h.side === "B" ? "pos" : "neg"}">${h.side === "B" ? "Покупка" : "Продажа"}${h.reduceOnly ? " · закрытие" : ""}</span>
          ${h._pendingFor ? `<span class="tag wait">ждёт входа${h._pendingFor.limitPx ? ` по ${fmtPx(h._pendingFor.limitPx)}` : ""}</span>` : ""}
          <span class="when">${fmtTime(h.timestamp)}</span></header>
        <div class="op-grid" style="margin-top:12px">${kvOp("Тип", esc(ORDER_TYPES_RU[h.orderType] || h.orderType || "Лимит"))}
          ${h.isTrigger ? kvOp("Срабатывание", fmtPx(h.triggerPx)) : kvOp("Цена", fmtPx(h.limitPx))}
          ${kvOp("Размер", Number(h.sz) ? `${h.sz} ${esc(baseOf(h.coin))}` : "вся позиция")}</div>
        ${h.isTrigger ? "" : `<div class="fill-cell fill-wide">${fillBar(h)}<span class="muted small">${Number(h.origSz) > Number(h.sz) ? `исполнено ${num(Number(h.origSz) - Number(h.sz), 6)} из ${h.origSz}` : "ещё не исполнялся"}</span></div>`}
        <div class="op-foot"><span class="muted">№ ${h.oid}</span><button class="btn small ghost" style="margin-left:auto" data-cancel="${h.oid}" data-coin="${esc(h.coin)}">Отменить</button></div></article>`,
            )
            .join("") || opEmpty("Открытых ордеров нет")),
        fixIcons(t));
      return;
    }
    if (i === "builder") return loadBuilderTab();
    let n = (
      (await info.userFills({
        user: S.user,
      })) || []
    ).slice();
    if (i === "fills") {
      e.textContent =
        "Как исполнились ордера: PnL здесь — только разница цен, БЕЗ комиссий и фандинга. Чистый результат — во вкладке «История позиций».";
      let l = new Map();
      for (let p of n) {
        if (!opFilter(p.coin)) continue;
        let f = l.get(p.oid) || {
          ...p,
          sz: 0,
          ntl: 0,
          closedPnl: 0,
          fee: 0,
          builderFee: 0,
          taker: !1,
        };
        ((f.sz += Number(p.sz)),
          (f.ntl += Number(p.sz) * Number(p.px)),
          (f.closedPnl += Number(p.closedPnl || 0)),
          (f.fee += Number(p.fee || 0)),
          (f.builderFee += Number(p.builderFee || 0)),
          (f.taker = f.taker || p.crossed),
          (f.time = Math.max(f.time, p.time)),
          l.set(p.oid, f));
      }
      let h = [...l.values()].sort((p, f) => f.time - p.time).slice(0, 200);
      ((t.innerHTML =
        h
          .map((p) => {
            let f = /Close/.test(p.dir || ""),
              b = p.ntl / p.sz,
              w = "";
            if (f && p.closedPnl) {
              let _ = p.side === "A",
                P = _ ? b - p.closedPnl / p.sz : b + p.closedPnl / p.sz,
                N = leverageAt(p.coin, p.time);
              (OP.share.push({
                coin: p.coin,
                long: _,
                lev: N,
                entry: P,
                exit: b,
                time: p.time,
                pnl: p.closedPnl,
                pnlLabel: "PnL сделки (без комиссий)",
                pct: N ? (p.closedPnl / ((P * p.sz) / N)) * 100 : (b / P - 1) * 100 * (_ ? 1 : -1),
                pctLabel: N ? "ROE" : "Изменение цены",
              }),
                (w = `<button class="share-btn" type="button" data-share="${OP.share.length - 1}">${SHARE_IC}PnL</button>`));
            }
            return `<article class="op-card ${f ? (p.closedPnl >= 0 ? "win" : "loss") : ""}">
        <header>${coinIcon(p.coin)}<b class="pair">${esc(pairLabel(p.coin))}</b><span class="tag ${p.side === "B" ? "pos" : "neg"}">${esc(DIR_RU[p.dir] || p.dir || (p.side === "B" ? "Покупка" : "Продажа"))}</span><span class="when">${fmtTime(p.time)}</span></header>
        ${f ? `<div class="op-hero"><div><div class="lbl">PnL без комиссий</div><div class="val ${clsOf(p.closedPnl)}">${sgnUsd(p.closedPnl)}</div></div></div>` : '<div style="height:12px"></div>'}
        <div class="op-grid">${kvOp("Сумма", `${num(p.ntl, 2)} USDC`)}${kvOp("Размер", `${num(p.sz, 6)} ${esc(p.coin)}`)}${kvOp("Цена исполнения", fmtPx(b))}
          ${kvOp("Исполнение", p.taker ? "по рынку" : "лимит (мейкер)")}${kvOp("Комиссия", `${num(p.fee, 4)} USDC`)}${kvOp("из неё Totum", p.builderFee ? `${num(p.builderFee, 4)} USDC` : "—")}</div>
        <div class="op-foot"><span class="muted">Исполнен · 100%</span>${w}</div></article>`;
          })
          .join("") || opEmpty("Сделок пока нет")),
        fixIcons(t));
      return;
    }
    let s = n.length ? Math.min(...n.map((l) => l.time)) : Date.now() - 30 * 864e5,
      r =
        (await info.userFunding({
          user: S.user,
          startTime: Math.max(s, Date.now() - 90 * 864e5),
        })) || [];
    if (i === "funding") {
      let l = r
          .map((f) => ({
            time: f.time,
            ...(f.delta || f),
          }))
          .filter((f) => opFilter(f.coin))
          .sort((f, b) => b.time - f.time),
        h = l.reduce((f, b) => f + Math.max(0, fundingUsd(b)), 0),
        p = l.reduce((f, b) => f + Math.min(0, fundingUsd(b)), 0);
      ((e.textContent = "Ставка финансирования выплачивается каждый час: + получили, − заплатили."),
        (t.innerHTML =
          (l.length
            ? `<div class="op-sum">${kvOp("Итого", sgnUsd(h + p), clsOf(h + p))}${kvOp("Получено", sgnUsd(h), "pos")}${kvOp("Заплачено", sgnUsd(p), "neg")}${kvOp("Выплат", l.length)}</div>`
            : "") +
            l
              .slice(0, 300)
              .map((f) => {
                let b = fundingUsd(f);
                return `<article class="op-card ${b >= 0 ? "win" : "loss"}"><header>${coinIcon(f.coin)}<b class="pair">${esc(pairLabel(f.coin))}</b><span class="tag ${Number(f.szi) > 0 ? "pos" : "neg"}">${Number(f.szi) > 0 ? "Лонг" : "Шорт"} ${Math.abs(Number(f.szi))}</span><span class="when">${fmtTime(f.time)}</span></header>
            <div class="op-hero" style="margin-bottom:0"><div><div class="lbl">Начисление</div><div class="val ${clsOf(b)}">${sgnUsd(b)}</div></div><div class="pctv">${pct(f.fundingRate)}<div class="lbl">ставка за час</div></div></div></article>`;
              })
              .join("") || opEmpty("Начислений фандинга пока нет")),
        fixIcons(t));
      return;
    }
    let o = buildPositionHistory(n, r).filter((l) => opFilter(l.coin));
    e.textContent = "Чистый результат каждой закрытой позиции: с учётом всех комиссий (вход, выход, Totum) и фандинга.";
    let a = o.reduce((l, h) => l + h.net, 0),
      c = o.filter((l) => l.net > 0).length;
    ((t.innerHTML =
      (o.length
        ? `<div class="op-sum">${kvOp("Итого за период", sgnUsd(a), clsOf(a))}${kvOp("Позиций", o.length)}${kvOp("В плюс", `${c} из ${o.length}`)}</div>`
        : "") +
        o
          .map((l) => {
            let h = leverageAt(l.coin, l.openTime),
              p = l.openNtl / l.openSz,
              f = l.closeNtl / l.closeSz,
              b = h ? (l.net / (l.openNtl / h)) * 100 : (f / p - 1) * 100 * (l.long ? 1 : -1);
            return (
              OP.share.push({
                coin: l.coin,
                long: l.long,
                lev: h,
                entry: p,
                exit: f,
                time: l.closeTime,
                pnl: l.net,
                pnlLabel: "Реализованный PnL",
                pct: b,
                pctLabel: h ? "ROE" : "Изменение цены",
              }),
              `<article class="op-card ${l.net >= 0 ? "win" : "loss"}">
          <header>${coinIcon(l.coin)}<b class="pair">${esc(pairLabel(l.coin))}</b><span class="tag ${l.long ? "pos" : "neg"}">${l.long ? "Лонг" : "Шорт"}</span>${h ? `<span class="tag lev">${h}x</span>` : ""}<span class="when">${fmtTime(l.closeTime)}</span></header>
          <div class="op-hero"><div><div class="lbl">Реализованный PnL</div><div class="val ${clsOf(l.net)}">${sgnUsd(l.net)}</div></div>
            <div class="pctv ${clsOf(b)}">${sgnNum(b)}<div class="lbl">${h ? "ROE" : "изменение цены"}</div></div></div>
          <div class="op-grid">${kvOp("Цена входа", fmtPx(p))}${kvOp("Цена закрытия", fmtPx(f))}${kvOp("Объём", `${num(l.closeNtl, 2)} $`)}
            ${kvOp("PnL по цене", sgnUsd(l.pnl), clsOf(l.pnl))}${kvOp("Комиссии", `−${usd(l.fee)}`)}${kvOp("Фандинг", sgnUsd(l.funding), clsOf(l.funding))}</div>
          <div class="op-foot"><span class="muted">${fmtTime(l.openTime)} → ${fmtTime(l.closeTime)}${l.builderFee ? ` \xB7 Totum ${usd(l.builderFee)}` : ""}</span>
            <button class="share-btn" type="button" data-share="${OP.share.length - 1}">${SHARE_IC}Поделиться PnL</button></div></article>`
            );
          })
          .join("") || opEmpty("Закрытых позиций пока нет")),
      fixIcons(t));
  } catch (n) {
    t.innerHTML = `<p class="neg small pad">${esc(humanError(n))}</p>`;
  }
}
function buildPositionHistory(i, t) {
  let e = i.slice().sort((o, a) => o.time - a.time || (o.tid ?? 0) - (a.tid ?? 0)),
    n = {},
    s = [],
    r = (o, a, c) => ({
      coin: o.coin,
      long: a,
      openTime: o.time,
      openSz: 0,
      openNtl: 0,
      closeSz: 0,
      closeNtl: 0,
      pnl: 0,
      fee: 0,
      builderFee: 0,
    });
  for (let o of e) {
    if (isSpot(o.coin)) continue;
    let a = Number(o.startPosition),
      c = Number(o.sz),
      l = Number(o.px),
      h = (o.side === "B" ? 1 : -1) * c,
      p = a + h,
      f = Number(o.fee || 0),
      b = Number(o.builderFee || 0),
      w = n[o.coin];
    if (!w) {
      if (Math.abs(a) > 1e-12) continue;
      w = n[o.coin] = r(o, h > 0);
    }
    let _ = Math.abs(a) > 1e-12 && Math.abs(p) > 1e-12 && Math.sign(p) !== Math.sign(a),
      P = Math.sign(h) !== Math.sign(a) && Math.abs(a) > 1e-12 ? Math.min(Math.abs(a), c) : 0,
      N = c - P,
      O = c > 0 ? P / c : 0;
    if (
      ((w.closeSz += P),
      (w.closeNtl += P * l),
      (w.openSz += _ ? 0 : N),
      (w.openNtl += _ ? 0 : N * l),
      (w.pnl += Number(o.closedPnl || 0)),
      (w.fee += _ ? f * O : f),
      (w.builderFee += _ ? b * O : b),
      (Math.abs(p) < 1e-12 || _) &&
        ((w.closeTime = o.time),
        (w.funding = t
          .map((R) => ({
            time: R.time,
            ...(R.delta || R),
          }))
          .filter((R) => R.coin === w.coin && R.time >= w.openTime && R.time <= w.closeTime)
          .reduce((R, q) => R + fundingUsd(q), 0)),
        (w.net = w.pnl - w.fee + w.funding),
        w.openSz > 0 && w.closeSz > 0 && s.push(w),
        (n[o.coin] = null),
        _))
    ) {
      let R = (n[o.coin] = r(o, p > 0));
      ((R.openSz = N), (R.openNtl = N * l), (R.fee = f * (1 - O)), (R.builderFee = b * (1 - O)));
    }
  }
  return s.reverse();
}
async function loadBuilderTab() {
  let i = await info.referral({
      user: S.user,
    }),
    t = Number(i.unclaimedRewards || 0),
    e = Number(i.claimedRewards || 0),
    n = Number(i.builderRewards || 0);
  (($("opNote").textContent =
    "Комиссия Totum копится на Hyperliquid как награды. На кошелёк сама не приходит — её нужно забрать: она зачислится на фьючерсный счёт Hyperliquid этого адреса, оттуда — вывод на кошелёк."),
    ($("opList").innerHTML =
      `<article class="op-card"><header><b>Касса Totum</b><span class="muted small">${short(S.user)}</span></header>
    <div class="kv">${kvRow("Всего заработано комиссий Totum", `${num(n, 4)} USDC`, "pos")}
      ${kvRow("Можно забрать сейчас", `<span class="big">${num(t, 4)} USDC</span>`)}
      ${kvRow("Уже забрано", `${num(e, 4)} USDC`)}</div>
    <button id="btnClaim" class="btn wide-btn" type="button" ${t > 0 ? "" : "disabled"}>Забрать на счёт Hyperliquid</button></article>`),
    ($("btnClaim").onclick = claimBuilder));
}
async function claimBuilder() {
  let i = $("btnClaim");
  setBusy(i, !0, "Забираем…");
  try {
    (await (S.agentExchange || S.userExchange).claimRewards(),
      toast("Комиссия зачислена на ваш счёт Hyperliquid", "ok"),
      await loadBuilderTab(),
      refreshAccount());
  } catch (t) {
    (toast(humanError(t), "err"), setBusy(i, !1));
  }
}
var ORDER_TYPES_RU = {
    Limit: "Лимит",
    Market: "Маркет",
    "Stop Market": "Стоп-лосс",
    "Stop Limit": "Стоп-лимит",
    "Take Profit Market": "Тейк-профит",
    "Take Profit Limit": "Тейк-профит лимит",
    "Twap Slice": "TWAP",
  },
  DIR_RU = {
    "Open Long": "Открытие лонга",
    "Close Long": "Закрытие лонга",
    "Open Short": "Открытие шорта",
    "Close Short": "Закрытие шорта",
    Buy: "Покупка (спот)",
    Sell: "Продажа (спот)",
  };
S.mode = "open";
S.margin = "cross";
function paintRange(i) {
  let t = ((Number(i.value) - Number(i.min || 0)) / ((Number(i.max) || 100) - Number(i.min || 0))) * 100;
  i.style.setProperty("--p", `${t}%`);
}
function setLeverage(i) {
  ((i = Math.max(1, Math.min(Number($("lev").max) || 50, Number(i) || 1))),
    ($("lev").value = i),
    paintRange($("lev")),
    ($("levVal").textContent = `${i}x`),
    ($("levPopVal").textContent = `${i}x`),
    document.querySelectorAll("#levChips button").forEach((t) => t.classList.toggle("on", Number(t.dataset.lv) === i)),
    updateOrderInfo());
}
function renderLevChips(i) {
  let t = [1, 2, 5, 10, 20, 50].filter((e) => e <= i);
  (t.includes(i) || t.push(i),
    ($("levChips").innerHTML = t.map((e) => `<button type="button" data-lv="${e}">${e}x</button>`).join("")),
    document
      .querySelectorAll("#levChips button")
      .forEach((e) => (e.onclick = () => setLeverage(Number(e.dataset.lv)))));
}
function setMargin(i) {
  if (i === "cross" && mkt()?.onlyIsolated) {
    toast("На этом рынке доступна только изолированная маржа", "info");
    i = "isolated";
  }
  ((S.margin = i),
    ($("marginVal").textContent = i === "isolated" ? (isMobile() ? "Изолир." : "Изолированная") : "Кросс"),
    document.querySelectorAll("[data-margin]").forEach((t) => t.classList.toggle("on", t.dataset.margin === i)));
}
function setMode(i) {
  (isSpot() && (i = "open"),
    (S.mode = i),
    document.querySelectorAll("[data-mode]").forEach((t) => t.classList.toggle("on", t.dataset.mode === i)),
    isSpot()
      ? (($("btnBuy").textContent = `Купить ${baseOf()}`), ($("btnSell").textContent = `Продать ${baseOf()}`))
      : (($("btnBuy").textContent = i === "open" ? "Открыть лонг" : "Закрыть шорт"),
        ($("btnSell").textContent = i === "open" ? "Открыть шорт" : "Закрыть лонг")),
    ($("tpslToggle").hidden = i === "close"),
    i === "close" ? ($("tpslRow").hidden = !0) : ($("tpslRow").hidden = !$("tpslOn").checked),
    ($("availLabel").textContent = i === "open" ? "Доступно" : "Позиция"),
    applyPct(i === "close" ? 100 : 0));
}
function setOrderType(i) {
  ((S.orderType = i),
    document.querySelectorAll("[data-ot]").forEach((t) => t.classList.toggle("on", t.dataset.ot === i)),
    ($("pxRow").hidden = i !== "limit"),
    i === "limit" && !$("px").value && fillMidPrice(),
    updateOrderInfo());
}
function fillMidPrice() {
  let i = S.ctx[S.coin];
  (i && ($("px").value = Number(i.midPx).toFixed(pxDecimals(i.midPx))), updateOrderInfo());
}
var curPosition = () => S.positions.find((i) => i.coin === S.coin);
/* Сколько залога доступно для фьючерсов на этом рынке.
   Единый счёт: один баланс на всё — свободный остаток токена-залога (USDC, а для части рынков HIP-3 — USDH/USDT0/USDE).
   Обычный счёт: свободные средства фьючерсного счёта нужной площадки. */
const isUnified = () => ["unifiedAccount", "portfolioMargin"].includes(S.abstraction);
function availFor(coin = S.coin) {
  const m = mkt(coin);
  if (isUnified()) return spotBal(m?.dex ? collName(m) : "USDC");
  return m?.dex ? S.dexWithdrawable?.[m.dex] ?? 0 : S.withdrawable;
}
function applyPct(i) {
  if ((($("pct").value = i), paintRange($("pct")), isSpot())) {
    let t = Number(S.ctx[S.coin]?.midPx || 0),
      e = spotBal("USDC"),
      n = spotBal(baseOf()) * t;
    $("size").value = Math.floor(((Math.max(S.spotSide === "sell" ? n : e, 0) * i) / 100) * 100) / 100;
  } else if (S.mode === "close") {
    let t = curPosition(),
      e = Number(S.ctx[S.coin]?.midPx || 0);
    $("size").value = t ? Math.floor(((Math.abs(Number(t.szi)) * e * i) / 100) * 100) / 100 : 0;
  } else
    availFor() > 0 &&
      ($("size").value = Math.floor(((availFor() * Number($("lev").value) * i) / 100) * 100) / 100);
  updateOrderInfo();
}
function updateOrderInfo() {
  riskSync();
  $("tpslOn")?.checked && updateTpslHints();
  let i = curPosition();
  isSpot()
    ? ($("avail").textContent = `${num(spotBal("USDC"), 2)} USDC \xB7 ${num(spotBal(baseOf()), 6)} ${baseOf()}`)
    : ($("avail").textContent =
        S.mode === "close"
          ? i
            ? `${Number(i.szi) > 0 ? "Лонг" : "Шорт"} ${Math.abs(Number(i.szi))} ${S.coin}`
            : "нет позиции"
          : `${num(availFor(), 2)} ${mkt()?.dex ? collName(mkt()) : "USDC"}`);
  let t = Number($("size").value) || 0,
    e = Number($("lev").value) || 1;
  if (!t) {
    $("infoValue").textContent =
      $("infoMargin").textContent =
      $("infoFee").textContent =
      $("infoLiq").textContent =
        "—";
    return;
  }
  let n = t * (S.orderType === "limit" && !isSpot() ? MAKER_RATE() : FEE_RATE()),
    s = "";
  try {
    s = ` \xB7 ${sizeFor(!0, t).sz} ${baseOf()}`;
  } catch {}
  if (
    (($("infoValue").textContent = `${usd(t)}${s}`),
    ($("infoMargin").textContent = S.mode === "close" ? "—" : usd(t / e)),
    ($("infoFee").textContent = usd(n)),
    S.mode === "close" || isSpot())
  ) {
    $("infoLiq").textContent = "—";
    return;
  }
  let r = orderPreview(!0),
    o = S.margin === "isolated",
    a = (c) => {
      let l = r ? estLiq(S.coin, c, r.entry, r.sz, e, o) : 0;
      return l ? fmtPx(l) : "—";
    };
  $("infoLiq").innerHTML = `<span class="pos">${a(!0)}</span> / <span class="neg">${a(!1)}</span>`;
}
function bookFill(i, t, { sz: e = null, usdc: n = null } = {}) {
  let s = S.ctx[i],
    r = Number(s?.midPx || 0),
    o = i === S.coin && S.book ? (t ? S.book.asks : S.book.bids) : null;
  if (!o?.length)
    return {
      worst: r,
      avg: r,
      enough: !1,
      fromBook: !1,
    };
  let a = 0,
    c = 0,
    l = o[0].px;
  for (let p of o) {
    let f = e != null ? e - a : (n - c) / p.px;
    if (f <= 1e-12) break;
    let b = Math.min(p.sz, f);
    ((a += b), (c += b * p.px), (l = p.px));
  }
  let h = e != null ? a >= e - 1e-12 : c >= n - 1e-9;
  return {
    worst: l,
    avg: a ? c / a : o[0].px,
    enough: h,
    fromBook: !0,
    qty: a,
  };
}
var marketPx = (i, t, e) => {
  let n = Number(SET.slippage) || CFG.slippage,
    s = bookFill(i, t, e);
  return {
    px: s.worst * (t ? 1 + n : 1 - n),
    ...s,
  };
};
function sizeFor(i, t, e = S.coin) {
  let n = mkt(e),
    s = S.ctx[e];
  if (!n || !s) throw new Error("Рынок не загружен");
  let r = Number(s.midPx),
    o = S.orderType === "limit" && Number($("px").value) > 0 ? Number($("px").value) : null;
  if (o)
    return {
      m: n,
      px: fmtP(o, n),
      sz: formatSize(t / o, n.szDecimals),
      mid: r,
      avg: o,
      enough: !0,
    };
  let a = marketPx(e, i, {
    usdc: t,
  });
  return {
    m: n,
    px: fmtP(a.px, n),
    sz: formatSize(t / a.avg, n.szDecimals),
    mid: r,
    avg: a.avg,
    enough: a.enough || !a.fromBook,
  };
}
var DEFAULT_LONG = !0;
function orderPreview(i = DEFAULT_LONG) {
  let t = S.ctx[S.coin];
  if (!t) return null;
  let e = Number($("size").value) || 0,
    n =
      S.orderType === "limit" && Number($("px").value) > 0
        ? Number($("px").value)
        : (e
            ? bookFill(S.coin, i, {
                usdc: e,
              }).avg
            : Number(t.midPx)) || Number(t.midPx),
    s = Number($("lev").value) || 1;
  return {
    entry: n,
    sz: e / n,
    long: i,
    margin: e / s,
  };
}
function updateTpslHints() {
  let i = orderPreview(!0),
    t = orderPreview(!1);
  if (!i) return;
  let e = (n) => {
    let s = readTrig(n, "ord", n, i),
      r = readTrig(n, "ord", n, t);
    if (!s && !r) return "";
    let o = (a, c) => {
      let l = pxPnl(a.entry, c, a.sz, a.long);
      return `<b class="${l >= 0 ? "pos" : "neg"}">${l >= 0 ? "+" : ""}${usd(l)}</b>`;
    };
    return UNITS.ord === "pct"
      ? `Лонг: ${fmtPx(s)} → ${o(i, s)} · Шорт: ${fmtPx(r)} → ${o(t, r)}`
      : `Если лонг: ${o(i, s)} · если шорт: ${o(t, r)}`;
  };
  (($("tpHint").innerHTML = e("tp")), ($("slHint").innerHTML = e("sl")));
}
/* ═══════════ Вход от риска ═══════════
   Человек говорит «готов потерять $20» и ставит стоп — терминал сам
   считает размер позиции. Направление следует из стопа: стоп ниже
   цены входа — лонг, выше — шорт. Убыток на стопе — по цене, как
   считает Hyperliquid; комиссии показываем отдельной строкой. */
const riskActive = () =>
  !isSpot() && S.mode !== "close" && $("tpslOn")?.checked && $("riskOn")?.checked;
function planEntry() {
  const c = S.ctx[S.coin];
  if (!c) return 0;
  return S.orderType === "limit" && Number($("px").value) > 0 ? Number($("px").value) : Number(c.midPx) || 0;
}
/* Сторона плана: из стопа, иначе из тейка, иначе лонг */
function planSide(entry) {
  const sl = UNITS.ord === "px" ? Number($("sl").value) : 0,
    tp = UNITS.ord === "px" ? Number($("tp").value) : 0;
  if (sl > 0 && entry > 0 && sl !== entry) return sl < entry;
  if (tp > 0 && entry > 0 && tp !== entry) return tp > entry;
  return true;
}
function riskPlan() {
  const entry = planEntry();
  if (!(entry > 0)) return { err: "Нет цены рынка" };
  const risk = Number($("riskUsd").value) || 0;
  const sl = Number($("sl").value) || 0;
  if (!(sl > 0) || sl === entry) return { err: "Поставьте стоп-лосс — от него считается размер" };
  if (!(risk > 0)) return { err: "Укажите, сколько готовы потерять" };
  const long = sl < entry;
  const perUnit = Math.abs(entry - sl);
  const sz = risk / perUnit;
  const notional = sz * entry;
  const tp = Number($("tp").value) || 0;
  const tpOk = tp > 0 && (long ? tp > entry : tp < entry);
  const reward = tpOk ? pxPnl(entry, tp, sz, long) : 0;
  const avail = availFor();
  const lev = Number($("lev").value) || 1;
  const maxLev = Number(mkt()?.maxLeverage) || lev;
  const needLev = avail > 0 ? notional / avail : Infinity;
  const liq = estLiq(S.coin, long, entry, sz, lev, S.margin === "isolated");
  const liqFirst = liq > 0 && (long ? liq >= sl : liq <= sl);
  const feeSl = roundFee(entry, sl, sz),
    feeTp = tpOk ? roundFee(entry, tp, sz) : 0;
  return { entry, sl, tp: tpOk ? tp : 0, long, sz, notional, risk, reward, avail, lev, maxLev, needLev, liq, liqFirst, feeSl, feeTp };
}
function riskSync() {
  const on = riskActive();
  $("riskRow") && ($("riskRow").hidden = !on);
  $("size").readOnly = !!on;
  $("pctSteps")?.classList.toggle("off", !!on);
  ["btnBuy", "btnSell"].forEach((id) => $(id)?.classList.remove("risk-dim"));
  if (!on) {
    $("riskHint") && ($("riskHint").innerHTML = "");
    return;
  }
  const r = riskPlan();
  if (r.err) {
    $("riskHint").innerHTML = `<span class="muted">${r.err}</span>`;
    return;
  }
  $("size").value = Math.floor(r.notional * 100) / 100;
  $("pct").value = 0;
  paintRange($("pct"));
  $(r.long ? "btnSell" : "btnBuy")?.classList.add("risk-dim");
  const base = baseOf();
  const lines = [
    `<b class="${r.long ? "pos" : "neg"}">${r.long ? "Лонг" : "Шорт"}</b> · ${num(r.sz, 4)} ${base} на ${usd(r.notional)} · маржа ${usd(r.notional / r.lev)} при ${r.lev}x`,
    `Стоп: <b class="neg">−${usd(r.risk)}</b>` +
      (r.tp ? ` · тейк: <b class="pos">+${usd(r.reward)}</b> · прибыль/риск <b>1 : ${(r.reward / r.risk).toFixed(1)}</b>` : ""),
    `Комиссия за вход и выход ≈ ${usd(r.feeSl)} (${((r.feeSl / (r.notional / r.lev)) * 100).toFixed(2)}% от маржи) — списывается отдельно`,
  ];
  if (r.needLev > r.maxLev)
    lines.push(`<span class="neg">Стоп слишком близко: даже на ${r.maxLev}x депозита не хватит. Отодвиньте стоп или уменьшите риск.</span>`);
  else if (r.needLev > r.lev)
    lines.push(
      `<span class="warn">Маржи не хватает — нужно плечо от ${Math.ceil(r.needLev)}x.</span> <button type="button" class="link-btn" id="riskLev" data-lv="${Math.ceil(r.needLev)}">Поставить</button>`,
    );
  if (r.liqFirst)
    lines.push(`<span class="neg">Ликвидация (${fmtPx(r.liq)}) наступит раньше стопа — уменьшите плечо.</span>`);
  $("riskHint").innerHTML = lines.join("<br>");
  const b = $("riskLev");
  b && (b.onclick = () => setLeverage(Number(b.dataset.lv)));
}
function toggleRisk(on) {
  SET.riskOn = !!on;
  saveSettings();
  if (on) {
    $("tpslOn").checked = true;
    $("tpslRow").hidden = false;
    UNITS.ord !== "px" && setUnit("ord", "px");
    /* Стопа ещё нет — ставим в 1% ниже цены, чтобы линия появилась на графике и её можно было тянуть */
    if (!(Number($("sl").value) > 0)) {
      const e = planEntry();
      e > 0 && ($("sl").value = Number((e * 0.99).toFixed(pxDecimals(e))));
    }
  }
  updateOrderInfo();
  drawChartLines();
}
var builderParam = () => ({
  b: CFG.builder.toLowerCase(),
  f: CFG.feeTenthBps,
});
async function placeOrder(i) {
  let t = S.mode === "close",
    e = Number($("size").value);
  if (!e || e <= 0) {
    toast("Введите сумму ордера в USDC", "err");
    return;
  }
  if (isSpot()) return placeSpotOrder(i, e);
  if (!t && riskActive()) {
    const rp = riskPlan();
    if (rp.err) {
      toast(rp.err, "err");
      return;
    }
    if (rp.long !== i) {
      toast(rp.long ? "Стоп ниже цены входа — это сделка в лонг" : "Стоп выше цены входа — это сделка в шорт", "err");
      return;
    }
    if (rp.needLev > rp.lev) {
      toast(`Маржи не хватает — поставьте плечо от ${Math.ceil(rp.needLev)}x`, "err");
      return;
    }
  }
  let n = curPosition();
  if (t && (!n || Number(n.szi) > 0 === i)) {
    toast(`Нет ${i ? "шорт" : "лонг"}-позиции по ${S.coin}, закрывать нечего`, "err");
    return;
  }
  if (SET.confirmOn && !(await confirmOrder(i, t, e))) return;
  let s = $(i ? "btnBuy" : "btnSell");
  setBusy(s, !0, "Отправляем…");
  try {
    let { m: r, px: o, sz: a } = sizeFor(i, e);
    if (t) {
      let f = Math.abs(Number(n.szi));
      (Number(a) > f || Number($("pct").value) === 100) && (a = formatSize(f, r.szDecimals));
    } else
      (await S.agentExchange.updateLeverage({
        asset: r.index,
        isCross: S.margin === "cross",
        leverage: Number($("lev").value),
      }),
        logLeverage(S.coin, Number($("lev").value)));
    let l = [
      {
        a: r.index,
        b: i,
        p: o,
        s: a,
        r: t,
        t: {
          limit: {
            tif: S.orderType === "limit" ? "Gtc" : "Ioc",
          },
        },
      },
    ];
    if (!t && $("tpslOn").checked) {
      let f = orderPreview(i);
      for (let b of ["tp", "sl"]) {
        let w = f ? readTrig(b, "ord", b, f) : 0;
        if (!w) continue;
        let _ = fmtP(w * (i ? 1 - CFG.slippage * 3 : 1 + CFG.slippage * 3), r);
        l.push({
          a: r.index,
          b: !i,
          p: _,
          s: a,
          r: !0,
          t: {
            trigger: {
              isMarket: !0,
              triggerPx: fmtP(w, r),
              tpsl: b,
            },
          },
        });
      }
    }
    let p = (
      await S.agentExchange.order({
        orders: l,
        grouping: l.length > 1 ? "normalTpsl" : "na",
        builder: builderParam(),
      })
    ).response.data.statuses[0];
    (p?.filled
      ? toast(`Исполнено: ${p.filled.totalSz} ${S.coin} по ${p.filled.avgPx}`, "ok")
      : p?.resting
        ? toast("Лимитный ордер выставлен", "ok")
        : p?.error
          ? toast(humanError(p.error), "err")
          : toast(`Ответ биржи: ${JSON.stringify(p)}`, "info"),
      (fundingAt = 0),
      closeSheet(),
      await refreshAccount());
  } catch (r) {
    toast(humanError(r), "err");
  } finally {
    setBusy(s, !1);
  }
}
async function placeSpotOrder(i, t) {
  let e = baseOf(),
    n = Number(S.ctx[S.coin]?.midPx || 0);
  if (i && t > spotBal("USDC") + 1e-9) {
    toast(
      `На споте ${num(spotBal("USDC"), 2)} USDC. Переведите USDC с фьючерсного счёта кнопкой «Фьючерсы ⇄ Спот».`,
      "err",
    );
    return;
  }
  if (!i && spotBal(e) * n < t * 0.999 && Number($("pct").value) !== 100) {
    toast(`Доступно только ${num(spotBal(e), 6)} ${e}`, "err");
    return;
  }
  if (SET.confirmOn && !(await confirmOrder(i, !1, t))) return;
  let s = $(i ? "btnBuy" : "btnSell");
  setBusy(s, !0, "Отправляем…");
  try {
    let { m: r, px: o, sz: a } = sizeFor(i, t);
    if (!i) {
      let h = spotBal(e);
      (Number(a) > h || Number($("pct").value) === 100) && (a = formatSize(h, r.szDecimals));
    }
    if (!(Number(a) > 0)) throw new Error("Слишком маленький объём");
    let l = (
      await S.agentExchange.order({
        orders: [
          {
            a: r.index,
            b: i,
            p: o,
            s: a,
            r: !1,
            t: {
              limit: {
                tif: S.orderType === "limit" ? "Gtc" : "Ioc",
              },
            },
          },
        ],
        grouping: "na",
        builder: builderParam(),
      })
    ).response.data.statuses[0];
    (l?.filled
      ? toast(`${i ? "Куплено" : "Продано"}: ${l.filled.totalSz} ${e} по ${l.filled.avgPx}`, "ok")
      : l?.resting
        ? toast("Лимитный ордер выставлен", "ok")
        : l?.error && toast(humanError(l.error), "err"),
      closeSheet(),
      await refreshAccount());
  } catch (r) {
    toast(humanError(r), "err");
  } finally {
    setBusy(s, !1);
  }
}
var isGoneErr = (i) => /never placed|already canceled|already cancelled|filled/i.test(String(i || ""));
async function safeCancel(i, t) {
  let e = mkt(i);
  if (!e || !t.length)
    return {
      ok: !0,
      gone: [],
    };
  let n = [];
  for (let s of t)
    try {
      let o = (
        await S.agentExchange.cancel({
          cancels: [
            {
              a: e.index,
              o: s.oid,
            },
          ],
        })
      )?.response?.data?.statuses?.[0];
      if (o?.error)
        if (isGoneErr(o.error)) n.push(s.oid);
        else throw new Error(o.error);
    } catch (r) {
      if (isGoneErr(r?.message || r)) n.push(s.oid);
      else throw r;
    }
  return {
    ok: !0,
    gone: n,
  };
}
async function moveLimitOrder(i, t) {
  let e = mkt(i.coin);
  if (!e) return;
  let n = i.side === "B",
    s = fmtP(t, e);
  if (Number(s) === Number(i.limitPx)) return;
  let r = Number(S.ctx[i.coin]?.midPx || 0),
    o = r && (n ? Number(s) >= r : Number(s) <= r),
    a = orderGroups(i.coin).pending.get(i.oid),
    c = a ? [a.tp, a.sl].filter(Boolean) : [],
    l = i.sz;
  if (
    (SET.confirmOn || o) &&
    !(await confirmBox({
      title: "Переместить лимитный ордер?",
      pair: `${pairLabel(i.coin)}`,
      tag: n ? "Покупка" : "Продажа",
      tagCls: n ? "pos" : "neg",
      rows: [
        ["Было", fmtPx(i.limitPx)],
        ["Станет", fmtPx(Number(s)), o ? "warn" : ""],
        ["Размер", `${l} ${baseOf(i.coin)}`],
        ...(c.length ? [["TP / SL после входа", c.map((p) => fmtPx(p.triggerPx)).join(" / ")]] : []),
        ...(o ? [["Внимание", "цена по ту сторону рынка — ордер исполнится сразу", "warn"]] : []),
      ],
      okLabel: "Переместить",
      allowSkip: !o,
    }))
  ) {
    drawChartLines();
    return;
  }
  try {
    if ((await safeCancel(i.coin, [i])).gone.includes(i.oid)) {
      (toast("Ордер уже исполнился или отменён — переносить нечего.", "info"), await refreshAccount());
      return;
    }
    await safeCancel(i.coin, c);
    let p = [
      {
        a: e.index,
        b: n,
        p: s,
        s: l,
        r: !!i.reduceOnly,
        t: {
          limit: {
            tif: i.tif === "Alo" ? "Alo" : "Gtc",
          },
        },
      },
    ];
    for (let w of c) {
      let _ = Number(w.triggerPx),
        P = fmtP(_ * (n ? 1 - CFG.slippage * 3 : 1 + CFG.slippage * 3), e);
      p.push({
        a: e.index,
        b: !n,
        p: P,
        s: l,
        r: !0,
        t: {
          trigger: {
            isMarket: !0,
            triggerPx: fmtP(_, e),
            tpsl: isTpType(w) ? "tp" : "sl",
          },
        },
      });
    }
    let b = (
      await S.agentExchange.order({
        orders: p,
        grouping: c.length ? "normalTpsl" : "na",
        builder: builderParam(),
      })
    )?.response?.data?.statuses?.[0];
    if (b?.error) throw new Error(b.error);
    toast(
      b?.filled ? `Ордер исполнился по ${b.filled.avgPx}` : `Лимитный ордер перенесён на ${fmtPx(Number(s))}`,
      "ok",
    );
  } catch (h) {
    toast(`Не удалось перенести ордер. ${humanError(h)} Проверьте «Открытые ордера».`, "err");
  }
  await refreshAccount();
}
var trToPerp = !1;
function openTransfer() {
  if (!S.userExchange) {
    toast("Подключите кошелёк", "err");
    return;
  }
  (setTrDir(!1), ($("trAmt").value = ""), $("transferDialog").showModal());
}
function setTrDir(i) {
  ((trToPerp = i),
    document.querySelectorAll("[data-tr]").forEach((t) => t.classList.toggle("on", (t.dataset.tr === "toPerp") === i)),
    ($("trInfo").textContent = i
      ? `На споте: ${num(spotBal("USDC"), 2)} USDC`
      : `На фьючерсах можно перевести: ${num(S.withdrawable, 2)} USDC`));
}
async function submitTransfer() {
  let i = Number($("trAmt").value),
    t = trToPerp ? spotBal("USDC") : S.withdrawable;
  if (!(i > 0)) {
    toast("Введите сумму", "err");
    return;
  }
  if (i > t + 1e-9) {
    toast(`Максимум ${num(t, 2)} USDC`, "err");
    return;
  }
  let e = $("trGo");
  setBusy(e, !0, "Подпись в кошельке…");
  try {
    (await S.userExchange.usdClassTransfer({
      amount: String(Math.floor(i * 1e6) / 1e6),
      toPerp: trToPerp,
    }),
      toast(`Переведено ${num(i, 2)} USDC ${trToPerp ? "на фьючерсы" : "на спот"}`, "ok"),
      $("transferDialog").close(),
      await refreshAccount());
  } catch (n) {
    toast(humanError(n), "err");
  } finally {
    setBusy(e, !1);
  }
}
async function closePosition(i, t, e = 1, n = !1) {
  let s = Number(t) < 0,
    r = mkt(i),
    o = S.ctx[i];
  if (!r || !o) return !1;
  try {
    let a = Number(SET.slippage) || CFG.slippage,
      c = formatSize(Math.abs(Number(t)) * e, r.szDecimals),
      l = fmtP(
        marketPx(i, s, {
          sz: Number(c),
        }).px,
        r,
      ),
      p = (
        await S.agentExchange.order({
          orders: [
            {
              a: r.index,
              b: s,
              p: l,
              s: c,
              r: !0,
              t: {
                limit: {
                  tif: "Ioc",
                },
              },
            },
          ],
          grouping: "na",
          builder: builderParam(),
        })
      )?.response?.data?.statuses?.[0];
    if (p?.error) throw new Error(p.error);
    return (
      n || toast(e >= 1 ? `Позиция ${i} закрыта` : `Закрыто ${Math.round(e * 100)}% позиции ${i}`, "ok"),
      (fundingAt = 0),
      n || (await refreshAccount()),
      !0
    );
  } catch (a) {
    return (toast(humanError(a), "err"), !1);
  }
}
async function closeAll() {
  if (
    !S.positions.length ||
    !(await confirmBox({
      title: "Закрыть все позиции?",
      pair: `${S.positions.length} ${S.positions.length === 1 ? "позиция" : "позиции"}`,
      tag: "По рынку",
      tagCls: "neg",
      rows: S.positions.map((e) => [
        `${e.coin} ${Number(e.szi) > 0 ? "лонг" : "шорт"} ${Math.abs(Number(e.szi))}`,
        sgnUsd(Number(e.unrealizedPnl)),
        clsOf(Number(e.unrealizedPnl)),
      ]),
      okLabel: "Закрыть всё",
      okCls: "sell",
      allowSkip: !1,
    }))
  )
    return;
  let t = $("btnCloseAll");
  setBusy(t, !0, "Закрываем…");
  try {
    let e = Number(SET.slippage) || CFG.slippage,
      n = S.positions.map((o) => {
        let a = mkt(o.coin),
          c = S.ctx[o.coin],
          l = Number(o.szi) < 0;
        return {
          a: a.index,
          b: l,
          p: fmtP(
            marketPx(o.coin, l, {
              sz: Math.abs(Number(o.szi)),
            }).px,
            a,
          ),
          s: formatSize(Math.abs(Number(o.szi)), a.szDecimals),
          r: !0,
          t: {
            limit: {
              tif: "Ioc",
            },
          },
        };
      }),
      r = (
        (
          await S.agentExchange.order({
            orders: n,
            grouping: "na",
            builder: builderParam(),
          })
        )?.response?.data?.statuses || []
      ).filter((o) => o?.error);
    (r.length ? toast(humanError(r[0].error), "err") : toast("Все позиции закрыты", "ok"),
      (fundingAt = 0),
      await refreshAccount());
  } catch (e) {
    toast(humanError(e), "err");
  } finally {
    (setBusy(t, !1), renderPositions());
  }
}
async function reversePosition(i, t) {
  let e = S.positions.find((c) => c.coin === i);
  if (!e) return;
  let n = Number(e.szi) > 0,
    s = Math.abs(Number(e.szi)),
    r = mkt(i),
    o = S.ctx[i],
    a = Number(o?.midPx || 0);
  if (!(
    SET.confirmOn &&
    !(await confirmBox({
      title: "Развернуть позицию?",
      pair: `${pairLabel(i)} Бессрочный`,
      tag: `${n ? "Лонг → шорт" : "Шорт → лонг"} \xB7 ${e.leverage?.type === "isolated" ? "Изол." : "Кросс"} ${e.leverage?.value ?? ""}x`,
      tagCls: n ? "neg" : "pos",
      rows: [
        ["Цена", "Маркет"],
        ["Закрыть", `${s} ${i}`],
        ["Открыть", `${s} ${i} ≈ ${usd(s * a)}`],
        ["Комиссия ≈", usd(2 * s * a * FEE_RATE())],
      ],
      okLabel: "Развернуть",
      okCls: n ? "sell" : "buy",
    }))
  ))
    try {
      let c = !n,
        l = Number(SET.slippage) || CFG.slippage,
        p = (
          await S.agentExchange.order({
            orders: [
              {
                a: r.index,
                b: c,
                p: fmtP(
                  marketPx(i, c, {
                    sz: s * 2,
                  }).px,
                  r,
                ),
                s: formatSize(s * 2, r.szDecimals),
                r: !1,
                t: {
                  limit: {
                    tif: "Ioc",
                  },
                },
              },
            ],
            grouping: "na",
            builder: builderParam(),
          })
        )?.response?.data?.statuses?.[0];
      if (p?.error) throw new Error(p.error);
      (toast(`Позиция ${i} развёрнута: теперь ${n ? "шорт" : "лонг"}`, "ok"), (fundingAt = 0), await refreshAccount());
    } catch (c) {
      toast(humanError(c), "err");
    }
}
var CLOSE = null;
function openCloseLimit(i, t, e = "market") {
  CLOSE = {
    coin: i,
    szi: Number(t),
    type: e,
  };
  let n = S.ctx[i];
  (($("closeTitle").textContent = `Закрыть ${Number(t) > 0 ? "лонг" : "шорт"} ${i}`),
    ($("closePx").value = n ? Number(n.midPx).toFixed(pxDecimals(n.midPx)) : ""),
    ($("closePct").value = 100),
    paintRange($("closePct")),
    setCloseType(e),
    $("closeDialog").showModal());
}
function setCloseType(i) {
  CLOSE &&
    ((CLOSE.type = i),
    document.querySelectorAll("[data-ct]").forEach((t) => {
      t.closest("#closeTabs") && t.classList.toggle("on", t.dataset.ct === i);
    }),
    ($("closePxRow").hidden = i !== "limit"),
    ($("closeGo").textContent = i === "limit" ? "Выставить ордер" : "Закрыть по рынку"),
    updateCloseInfo());
}
function updateCloseInfo() {
  if (!CLOSE) return;
  let i = S.positions.find((s) => s.coin === CLOSE.coin),
    t = (Math.abs(CLOSE.szi) * Number($("closePct").value)) / 100,
    e = CLOSE.type === "limit" ? Number($("closePx").value) || 0 : Number(S.ctx[CLOSE.coin]?.midPx || 0),
    n = "";
  if (i && e) {
    let s = pxPnl(Number(i.entryPx), e, t, Number(i.szi) > 0);
    n = ` · PnL ≈ ${sgnUsd(s)} · комиссия ≈ ${usd(t * e * (CLOSE.type === "limit" ? MAKER_RATE() : FEE_RATE()))}`;
  }
  $("closeInfo").textContent = `Закрыть ${num(t, 6)} ${CLOSE.coin} (${$("closePct").value}%) ≈ ${usd(t * e)}${n}`;
}
async function submitClose() {
  let { coin: i, szi: t, type: e } = CLOSE,
    n = mkt(i),
    s = $("closeGo"),
    r = Number($("closePct").value) / 100;
  if (e === "market") {
    setBusy(s, !0, "Закрываем…");
    let a = await closePosition(i, t, r);
    (setBusy(s, !1), a && $("closeDialog").close());
    return;
  }
  let o = Number($("closePx").value);
  if (!n || !(o > 0)) {
    toast("Укажите цену", "err");
    return;
  }
  setBusy(s, !0, "Отправляем…");
  try {
    let a = Math.abs(t) * r;
    (await S.agentExchange.order({
      orders: [
        {
          a: n.index,
          b: t < 0,
          p: fmtP(o, n),
          s: formatSize(a, n.szDecimals),
          r: !0,
          t: {
            limit: {
              tif: "Gtc",
            },
          },
        },
      ],
      grouping: "na",
      builder: builderParam(),
    }),
      $("closeDialog").close(),
      toast("Лимитный ордер на закрытие выставлен", "ok"),
      await refreshAccount());
  } catch (a) {
    toast(humanError(a), "err");
  } finally {
    setBusy(s, !1);
  }
}
function confirmBox({
  title: i,
  pair: t,
  tag: e,
  tagCls: n = "",
  rows: s = [],
  okLabel: r = "Подтвердить",
  okCls: o = "",
  allowSkip: a = !0,
}) {
  return new Promise((c) => {
    let l = $("confirmDialog");
    (($("cfTitle").textContent = i),
      ($("cfPair").textContent = t || ""),
      ($("cfTag").textContent = e || ""),
      ($("cfTag").className = `tag ${n}`),
      ($("cfTag").hidden = !e),
      ($("cfRows").innerHTML = s.map(([p, f, b]) => kvRow(esc(p), f, b || "")).join("")),
      ($("cfSkip").checked = !1),
      ($("cfSkipRow").hidden = !a),
      ($("cfOk").textContent = r),
      ($("cfOk").className = `btn grow ${o}`));
    let h = (p) => {
      (p &&
        a &&
        $("cfSkip").checked &&
        ((SET.confirmOn = !1),
        saveSettings(),
        ($("setConfirm").checked = !1),
        toast("Подтверждение отключено. Включить снова — в настройках", "info")),
        l.close(),
        c(p));
    };
    (($("cfOk").onclick = () => h(!0)),
      ($("cfCancel").onclick = () => h(!1)),
      (l.oncancel = (p) => {
        (p.preventDefault(), h(!1));
      }),
      l.showModal());
  });
}
function expectedRow(i, t) {
  if (S.orderType === "limit") return null;
  let e = Number(S.ctx[S.coin]?.midPx || 0),
    n = bookFill(S.coin, i, {
      usdc: t,
    });
  if (!n.fromBook || !e) return null;
  let s = Math.abs(n.avg / e - 1) * 100;
  return [
    "Ожидаемая цена",
    `${fmtPx(n.avg)}${s >= 0.05 ? ` (${s.toFixed(2)}% от средней)` : ""}${n.enough ? "" : " · в стакане не хватает объёма, исполнится частично"}`,
    s >= 1 || !n.enough ? "warn" : "",
  ];
}
function confirmOrder(i, t, e) {
  if (isSpot()) {
    let h = "";
    try {
      h = ` ≈ ${sizeFor(i, e).sz} ${baseOf()}`;
    } catch {}
    return confirmBox({
      title: "Подтверждение ордера",
      pair: `${pairLabel(S.coin)} Спот`,
      tag: i ? `Купить ${baseOf()}` : `Продать ${baseOf()}`,
      tagCls: i ? "pos" : "neg",
      rows: [
        ["Цена", S.orderType === "limit" ? `${fmtPx(Number($("px").value))} (лимит)` : "Маркет"],
        expectedRow(i, e),
        ["Сумма", `${num(e, 2)} USDC${h}`],
        ["Комиссия за вход", usd(e * (S.orderType === "limit" ? MAKER_RATE() : FEE_RATE()))],
      ].filter(Boolean),
      okLabel: i ? `Купить ${baseOf()}` : `Продать ${baseOf()}`,
      okCls: i ? "buy" : "sell",
    });
  }
  let n = Number($("lev").value) || 1,
    s = S.margin === "isolated",
    r = orderPreview(i),
    o = t ? (i ? "Закрыть шорт" : "Закрыть лонг") : i ? "Открыть лонг" : "Открыть шорт",
    a = [["Цена", S.orderType === "limit" ? `${fmtPx(Number($("px").value))} (лимит)` : "Маркет"]],
    c = "";
  try {
    c = ` ≈ ${sizeFor(i, e).sz} ${S.coin}`;
  } catch {}
  let l = expectedRow(i, e);
  if ((l && a.push(l), a.push(["Количество", `${num(e, 2)} USDC${c}`]), !t)) {
    let h = $("tpslOn").checked,
      p = h && r ? readTrig("tp", "ord", "tp", r) : 0,
      f = h && r ? readTrig("sl", "ord", "sl", r) : 0;
    (a.push(["Тейк-профит", p ? `${fmtPx(p)} \xB7 ${sgnUsd(pxPnl(r.entry, p, r.sz, i))}` : "--", "pos"]),
      a.push(["Стоп-лосс", f ? `${fmtPx(f)} \xB7 ${sgnUsd(pxPnl(r.entry, f, r.sz, i))}` : "--", "neg"]));
    if (p && f) {
      const rw = pxPnl(r.entry, p, r.sz, i),
        rk = -pxPnl(r.entry, f, r.sz, i);
      rw > 0 && rk > 0 && a.push(["Прибыль / риск", `1 : ${(rw / rk).toFixed(1)}`]);
    }
    (p || f) && r && a.push(["Комиссия вход + выход ≈", usd(roundFee(r.entry, f || p, r.sz))]);
    let b = r ? estLiq(S.coin, i, r.entry, r.sz, n, s) : 0;
    (a.push(["Расч. цена ликвидации", b ? fmtPx(b) : "—", "warn"]),
      a.push(["Расч. цена входа", r ? fmtPx(r.entry) : "—"]),
      a.push(["Маржа", `${num(e / n, 2)} USDC`]));
  }
  return (
    a.push(["Комиссия за вход", usd(e * (S.orderType === "limit" ? MAKER_RATE() : FEE_RATE()))]),
    confirmBox({
      title: "Подтверждение ордера",
      pair: `${pairLabel(S.coin)} ${isSpot() ? "Спот" : "Бессрочный"}`,
      tag: `${o} \xB7 ${s ? "Изол." : "Кросс"} ${n}x`,
      tagCls: i ? "pos" : "neg",
      rows: a,
      okLabel: o,
      okCls: i ? "buy" : "sell",
    })
  );
}
var TPSL = null,
  UNITS = {
    dlg: "px",
    ord: "px",
  };
function setUnit(i, t) {
  let e = document.querySelector(`[data-unit-for="${i}"]`),
    n = i === "dlg" ? ["ptp", "psl"] : ["tp", "sl"];
  if (UNITS[i] === t) return;
  let r = i === "dlg" ? tpslPos() : orderPreview();
  (n.forEach((o) => {
    let a = Number($(o).value);
    if (!a || !r) return;
    let c = o.endsWith("tp") ? "tp" : "sl";
    $(o).value = t === "pct" ? +pctFromPx(c, a, r).toFixed(2) : Number(pxFromPct(c, a, r).toFixed(pxDecimals(a)));
  }),
    (UNITS[i] = t),
    e.querySelectorAll("[data-unit]").forEach((o) => o.classList.toggle("on", o.dataset.unit === t)),
    e.parentElement.querySelectorAll(".u").forEach((o) => (o.textContent = t === "pct" ? "%" : "USDC")),
    n.forEach((o) => ($(o).placeholder = t === "pct" ? (o.endsWith("tp") ? "напр. 5" : "напр. 2") : "цена")),
    i === "dlg" ? updateTpslDlg() : updateTpslHints());
}
var pxFromPct = (i, t, e) => e.entry * (1 + ((i === "tp" ? 1 : -1) * (e.long ? 1 : -1) * t) / 100),
  pctFromPx = (i, t, e) => (t / e.entry - 1) * 100 * (i === "tp" ? 1 : -1) * (e.long ? 1 : -1),
  readTrig = (i, t, e, n) => {
    let s = Number($(i).value);
    return s ? (UNITS[t] === "pct" ? pxFromPct(e, s, n) : s) : 0;
  };
function trigHint(i, t, e) {
  if (!t || !e) return "";
  let n = pxPnl(e.entry, t, e.sz, e.long),
    s = e.margin ? (n / e.margin) * 100 : null;
  return `${trigLabel(i)} ${fmtPx(t)} \xB7 PnL <b class="${n >= 0 ? "pos" : "neg"}">${n >= 0 ? "+" : ""}${usd(n)}</b>${s != null ? ` (${s >= 0 ? "+" : ""}${s.toFixed(1)}% ROE)` : ""}`;
}
var trigLabel = (i) => (i === "tp" ? "Цена TP" : "Цена SL");
function tpslPos() {
  if (!TPSL) return null;
  let i = S.positions.find((t) => t.coin === TPSL.coin);
  return i
    ? {
        entry: Number(i.entryPx),
        sz: Math.abs(Number(i.szi)),
        long: Number(i.szi) > 0,
        margin: Number(i.marginUsed) || 0,
      }
    : null;
}
function updateTpslDlg() {
  let i = tpslPos();
  (($("ptpHint").innerHTML = trigHint("tp", readTrig("ptp", "dlg", "tp", i || {}), i)),
    ($("pslHint").innerHTML = trigHint("sl", readTrig("psl", "dlg", "sl", i || {}), i)));
}
function openTpsl(i, t = {}) {
  let e = S.positions.find((o) => o.coin === i);
  if (!e) return;
  TPSL = {
    coin: i,
    szi: Number(e.szi),
  };
  let { tp: n, sl: s } = tpslFor(i);
  (setUnit("dlg", "px"),
    ($("tpslTitle").textContent = `TP / SL \xB7 ${Number(e.szi) > 0 ? "Лонг" : "Шорт"} ${i}`),
    ($("tpslInfo").textContent =
      `Вход ${fmtPx(e.entryPx)} · маркировка ${fmtPx(S.ctx[i]?.markPx || 0)} · размер ${Math.abs(Number(e.szi))} ${i}`));
  let r = (o) => (o ? Number(Number(o).toFixed(pxDecimals(o))) : "");
  (($("ptp").value = r(t.tp ?? (n ? n.triggerPx : ""))),
    ($("psl").value = r(t.sl ?? (s ? s.triggerPx : ""))),
    updateTpslDlg(),
    $("tpslDialog").open || $("tpslDialog").showModal());
}
async function saveTpsl() {
  let { coin: i, szi: t } = TPSL,
    e = mkt(i),
    n = t > 0,
    s = tpslPos(),
    r = s ? readTrig("ptp", "dlg", "tp", s) : 0,
    o = s ? readTrig("psl", "dlg", "sl", s) : 0,
    a = Number(S.ctx[i]?.markPx || 0);
  if (r && ((n && r <= a) || (!n && r >= a))) {
    toast(`Тейк-профит для ${n ? "лонга" : "шорта"} должен быть ${n ? "выше" : "ниже"} текущей цены`, "err");
    return;
  }
  if (o && ((n && o >= a) || (!n && o <= a))) {
    toast(`Стоп-лосс для ${n ? "лонга" : "шорта"} должен быть ${n ? "ниже" : "выше"} текущей цены`, "err");
    return;
  }
  let c = $("tpslGo");
  setBusy(c, !0, "Сохраняем…");
  try {
    let { all: l } = tpslFor(i);
    l.length && (await safeCancel(i, l));
    let h = formatSize(Math.abs(t), e.szDecimals),
      p = [];
    for (let [f, b] of [
      ["tp", r],
      ["sl", o],
    ]) {
      if (!b) continue;
      let w = fmtP(b * (n ? 1 - CFG.slippage * 3 : 1 + CFG.slippage * 3), e);
      p.push({
        a: e.index,
        b: !n,
        p: w,
        s: h,
        r: !0,
        t: {
          trigger: {
            isMarket: !0,
            triggerPx: fmtP(b, e),
            tpsl: f,
          },
        },
      });
    }
    (p.length &&
      (await S.agentExchange.order({
        orders: p,
        grouping: "positionTpsl",
        builder: builderParam(),
      })),
      $("tpslDialog").close(),
      toast(p.length ? "TP / SL сохранены" : "TP / SL сняты", "ok"),
      await refreshAccount());
  } catch (l) {
    toast(humanError(l), "err");
  } finally {
    setBusy(c, !1);
  }
}
async function cancelOrder(i, t) {
  if (mkt(i))
    try {
      if (
        (
          await safeCancel(i, [
            {
              oid: Number(t),
            },
          ])
        ).gone.length
      ) {
        (toast("Ордер уже исполнен или отменён.", "info"), await refreshAccount());
        return;
      }
      (toast("Ордер отменён", "ok"), await refreshAccount(), $("ordersPage").open && OP.tab === "open" && loadOpTab());
    } catch (n) {
      toast(humanError(n), "err");
    }
}
var isMobile = () => window.matchMedia("(max-width:900px)").matches;
function setMView(i) {
  if (((document.body.dataset.mv = i), closeSheet(), i === "full")) {
    setCpTab(document.body.dataset.cp || "chart");
    try {
      history.pushState(
        {
          totum: "full",
        },
        "",
      );
    } catch {}
  } else ["book", "trades"].includes(document.body.dataset.cp) && setCpTab("chart");
  (renderBook(), window.scrollTo(0, 0));
}
function toggleInlineChart(i) {
  let t = i ?? !document.body.classList.contains("chart-open");
  (document.body.classList.toggle("chart-open", t),
    $("btnChartToggle").classList.toggle("on", t),
    t && S.interval !== "15m" && !S.userPickedIv && pickInterval("15m"));
}
function setCpTab(i) {
  (!isMobile() && (i === "book" || i === "trades") && (i = "chart"),
    (document.body.dataset.cp = i),
    document.querySelectorAll("#cpTabs [data-cp]").forEach((t) => t.classList.toggle("on", t.dataset.cp === i)),
    $("sidePanel").classList.toggle("show-trades", i === "trades"),
    i === "info" && renderInfo(),
    i === "book" && renderBook(),
    i === "chart" && S.chartView === "depth" && requestAnimationFrame(renderDepth));
}
function openSheet(i) {
  (S.mode !== i && setMode(i), document.body.classList.add("sheet"));
}
function closeSheet() {
  document.body.classList.remove("sheet");
}
function renderInfo() {
  let i = mkt(S.coin),
    t = S.ctx[S.coin];
  if (!i || !t) {
    $("infoBody").innerHTML = '<p class="muted">Загружаем…</p>';
    return;
  }
  if (i.spot) {
    let o = Number(t.midPx),
      a = Number(t.prevDayPx) ? (o / Number(t.prevDayPx) - 1) * 100 : 0,
      c = Number(t.circulatingSupply || 0),
      l = [
        ["Пара", `${i.label} · спот`],
        ["Токен", i.base],
        ["Котировка", i.quote],
        ["Последняя цена", fmtPx(o)],
        ["Изменение за 24ч", `${a >= 0 ? "+" : ""}${a.toFixed(2)}%`, clsOf(a)],
        ["Объём за 24ч", t.dayNtlVlm ? compact(t.dayNtlVlm) : "—"],
        ["В обращении", c ? `${num(c, 0)} ${i.base}` : "—"],
        ["Капитализация", c ? compact(c * o) : "—"],
        ["Плечо", "нет (спот)"],
        ["Шаг размера", `${(1 / 10 ** i.szDecimals).toFixed(i.szDecimals)} ${i.base}`],
        ["Комиссия (маркет / лимит)", `${(FEE_RATE() * 100).toFixed(3)}% / ${(MAKER_RATE() * 100).toFixed(3)}%`],
        ["Идентификатор на Hyperliquid", `${i.name} · актив ${i.index}`],
      ];
    $("infoBody").innerHTML = l
      .map(([h, p, f]) => `<div><span>${h}</span><b class="${f || ""}">${p}</b></div>`)
      .join("");
    return;
  }
  let e = Number(t.midPx),
    n = t.prevDayPx ? (e / Number(t.prevDayPx) - 1) * 100 : 0,
    s = `знаков после запятой: до ${Math.max(0, 6 - i.szDecimals)}; значащих цифр: до 5`,
    r = [
      ["Контракт", `${pairLabel(S.coin)} · бессрочный (perpetual)`],
      ["Расчёты и маржа", i.dex ? collName(i) : "USDC"],
      ...(i.dex ? [["Площадка HIP-3", `${i.dex} — рынок запущен сторонней командой на Hyperliquid`], ["Категория", CAT_RU[i.cat] || i.cat || "—"]] : []),
      ...(i.onlyIsolated ? [["Маржа", "только изолированная"]] : []),
      ["Последняя цена", fmtPx(e)],
      ["Маркировочная цена", fmtPx(t.markPx)],
      ["Цена оракула (индекс)", t.oraclePx ? fmtPx(t.oraclePx) : "—"],
      ["Изменение за 24ч", `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`, clsOf(n)],
      ["Объём за 24ч", t.dayNtlVlm ? compact(t.dayNtlVlm) : "—"],
      [
        "Открытый интерес",
        t.openInterest
          ? `${num(t.openInterest, 2)} ${baseOf(S.coin)} ≈ ${compact(Number(t.openInterest) * Number(t.markPx))}`
          : "—",
      ],
      ["Ставка фандинга за час", pct(t.funding), clsOf(Number(t.funding))],
      ["Выплата фандинга", "каждый час"],
      ["Премия к индексу", t.premium != null ? pct(t.premium) : "—"],
      ["Максимальное плечо", `${i.maxLeverage}x`],
      ["Поддерживающая маржа", `${(maintRate(S.coin) * 100).toFixed(2)}% от позиции`],
      ["Режим маржи", i.onlyIsolated ? "только изолированная" : "кросс и изолированная"],
      ["Шаг размера", `${(1 / 10 ** i.szDecimals).toFixed(i.szDecimals)} ${S.coin}`],
      ["Точность цены", s],
      ["Комиссия (маркет / лимит)", `${(FEE_RATE() * 100).toFixed(3)}% / ${(MAKER_RATE() * 100).toFixed(3)}%`],
      ["Биржа исполнения", `Hyperliquid ${CFG.isTestnet ? "(тестовая сеть)" : ""}`],
    ];
  $("infoBody").innerHTML = r.map(([o, a, c]) => `<div><span>${o}</span><b class="${c || ""}">${a}</b></div>`).join("");
}
var MP = {
    tab: "all",
    sort: "vol",
    q: "",
    mk: "perp",
    limit: 60,
  },
  topSpotCoin = () =>
    (
      S.spot.slice().sort((i, t) => Number(S.ctx[t.name]?.dayNtlVlm || 0) - Number(S.ctx[i.name]?.dayNtlVlm || 0))[0] ||
      {}
    ).name;
function setApp(i, t = {}) {
  document.body.dataset.app = i;
  try {
    localStorage.setItem("totum.app", i);
  } catch {}
  if (
    (document.body.dataset.mv === "full" && setMView("trade"),
    document.querySelectorAll("#mnav [data-app]").forEach((e) => e.classList.toggle("on", e.dataset.app === i)),
    moveNavPill(),
    i === "trade" && !isSpot() && !t.keepCoin)
  ) {
    let e = S.lastSpot || topSpotCoin();
    e && switchCoin(e);
  }
  (i === "futures" && isSpot() && !t.keepCoin && switchCoin(S.lastPerp || "BTC"),
    i === "markets" && ((MP.mk = isSpot() ? "spot" : "perp"), markMarketTabs()),
    renderAppPage(),
    window.scrollTo(0, 0));
}
function moveNavPill() {
  let i = document.querySelector("#mnav [data-app].on"),
    t = $("mnavPill");
  !i || !t || ((t.style.width = `${i.offsetWidth}px`), (t.style.transform = `translateX(${i.offsetLeft}px)`));
}
var appRenderT = 0;
function renderAppPage() {
  let i = document.body.dataset.app;
  if (!isMobile() || !["home", "markets", "assets"].includes(i)) return;
  let t = Date.now();
  (t - appRenderT < 800 && i !== "markets") ||
    ((appRenderT = t),
    i === "home" && renderHome(),
    i === "markets" && renderMarketsPage(),
    i === "assets" && renderAssets());
}
function spotTotal() {
  return S.spotBal.reduce((i, t) => i + Number(t.total || 0) * spotPriceOf(t.coin), 0);
}
function moverRows(i) {
  let t = S.meta
    .map((e) => {
      let n = S.ctx[e.name] || {},
        s = Number(n.midPx || n.markPx || 0);
      return {
        name: e.name,
        mid: s,
        ch: Number(n.prevDayPx) ? s / Number(n.prevDayPx) - 1 : 0,
        vol: Number(n.dayNtlVlm || 0),
      };
    })
    .filter((e) => e.mid > 0 && e.vol >= (CFG.isTestnet ? 1e3 : 1e4));
  return (
    t.sort(i === "gain" ? (e, n) => n.ch - e.ch : i === "loss" ? (e, n) => e.ch - n.ch : (e, n) => n.vol - e.vol),
    t.slice(0, 6)
  );
}
S.homeTab = "gain";
/* Сколько всего денег. Единый счёт: баланс общий (спот = залог фьючерсов),
   поэтому складывать «фьючерсы + спот» нельзя — получится вдвое больше. */
const upnlTotal = () => (S.positions || []).reduce((a, p) => a + Number(p.unrealizedPnl || 0), 0);
const totalEquity = () => (isUnified() ? S.accountValue || 0 : (S.accountValue || 0) + spotTotal());
const equitySub = () =>
  isUnified()
    ? `Баланс ${usd(spotTotal())} · PnL позиций ${sgnUsd(upnlTotal())}`
    : `Фьючерсы ${usd(S.accountValue || 0)} · Спот ${usd(spotTotal())}`;
function renderHome() {
  let i = totalEquity(),
    t = moverRows(S.homeTab);
  (($("pgHome").innerHTML = `
    <div class="hero-card">
      <div class="hc-top"><img src="brand/mark-128.webp" alt="" class="hc-mark"><span>${S.user ? "Ваши активы" : "Добро пожаловать в Totum"}</span>${CFG.isTestnet ? '<span class="badge">ТЕСТ</span>' : ""}</div>
      ${S.user ? `<div class="hc-sum">${usd(i)}</div><div class="hc-sub">${equitySub()}</div>` : '<div class="hc-lead">Фьючерсы, спот и акции в одном приложении. Деньги под вашим контролем: доступ к счёту только у вашего кошелька.</div><button class="btn wide-btn" type="button" data-act="connect">Подключить кошелёк</button>'}
    </div>
    <div class="quick">
      <button type="button" data-act="futures"><i>${NAV_IC.futures}</i>Фьючерсы</button>
      <button type="button" data-act="trade"><i>${NAV_IC.trade}</i>Спот</button>
      <button type="button" data-act="transfer"><i>${NAV_IC.swap}</i>Перевод</button>
      <button type="button" data-act="orders"><i>${NAV_IC.doc}</i>Ордера</button>
    </div>
    <div class="card-block">
      <div class="seg mini-seg" id="homeSeg"><button data-ht="gain" class="${S.homeTab === "gain" ? "on" : ""}" type="button">Растут</button><button data-ht="loss" class="${S.homeTab === "loss" ? "on" : ""}" type="button">Падают</button><button data-ht="vol" class="${S.homeTab === "vol" ? "on" : ""}" type="button">По объёму</button></div>
      <div class="movers">${t.map((e) => `<div class="mv-row" data-go="${esc(e.name)}">${coinIcon(e.name)}<b>${esc(dexBase(e.name))}</b><span class="muted small">${compact(e.vol)}</span><span class="mv-px">${fmtPx(e.mid)}</span><span class="mv-ch ${e.ch >= 0 ? "pos" : "neg"}">${e.ch >= 0 ? "+" : ""}${(e.ch * 100).toFixed(2)}%</span></div>`).join("") || '<p class="muted small pad">Загружаем рынки…</p>'}</div>
    </div>
    ${CFG.isTestnet ? '<a class="faucet" href="https://app.hyperliquid-testnet.xyz/drip" target="_blank" rel="noopener">Нужны тестовые USDC? Кран тестовой сети →</a>' : ""}`),
    fixIcons($("pgHome")));
}
function markMarketTabs() {
  (document.querySelectorAll("[data-mmk]").forEach((i) => i.classList.toggle("on", i.dataset.mmk === MP.mk)),
    document.querySelectorAll("[data-mt]").forEach((i) => i.classList.toggle("on", i.dataset.mt === MP.tab)),
    document.querySelectorAll("[data-ms]").forEach((i) => i.classList.toggle("on", i.dataset.ms === MP.sort)));
}
function renderMarketsPage() {
  let i = pairRows(MP),
    t = i.slice(0, MP.limit);
  MP.more = i.length > t.length;
  let e = $("mList");
  if (e.dataset.sig === `${MP.mk}|${MP.tab}|${MP.sort}|${MP.q}|${MP.limit}|${t.length}`) {
    e.querySelectorAll(".pp-row[data-coin]").forEach((s) => {
      let r = S.ctx[s.dataset.coin];
      if (!r) return;
      let o = Number(r.midPx || r.markPx || 0),
        a = Number(r.prevDayPx) ? o / Number(r.prevDayPx) - 1 : 0;
      s.querySelector(".pp-px").textContent = o ? fmtPx(o) : "—";
      let c = s.querySelector(".pp-ch");
      ((c.textContent = `${a >= 0 ? "+" : ""}${(a * 100).toFixed(2)}%`),
        (c.className = `pp-ch ${a >= 0 ? "pos" : "neg"}`));
    });
    return;
  }
  ((e.dataset.sig = `${MP.mk}|${MP.tab}|${MP.sort}|${MP.q}|${MP.limit}|${t.length}`),
    (e.innerHTML = t.length
      ? t
          .map(
            (s) => `
    <div class="pp-row" data-coin="${esc(s.name)}">
      <button class="star${FAVS.includes(s.name) ? " on" : ""}" data-fav="${esc(s.name)}" type="button" aria-label="В избранное">★</button>
      <div class="pp-name">${coinIcon(s.name)}<div><div class="pp-l1"><b>${esc(s.label)}</b>${rowTags(s)}</div><small class="pp-sub">${rowSub(s)}</small></div></div>
      <div class="pp-px">${s.mid ? fmtPx(s.mid) : "—"}</div>
      <div class="pp-ch ${s.ch >= 0 ? "pos" : "neg"}">${s.ch >= 0 ? "+" : ""}${(s.ch * 100).toFixed(2)}%</div>
    </div>`,
          )
          .join("")
      : `<div class="pp-empty">${MP.tab === "fav" ? "Добавьте пары в избранное звёздочкой" : S.meta.length ? "Ничего не найдено" : "Загружаем рынки…"}</div>`),
    fixIcons(e));
}
function renderAssets() {
  let i = S.positions || [],
    t = i.reduce((n, s) => n + Number(s.unrealizedPnl || 0), 0),
    e = S.spotBal.filter((n) => Number(n.total) > 0);
  (($("pgAssets").innerHTML =
    '<h1 class="pg-title">Активы</h1>' +
    (S.user
      ? `
    <div class="hero-card">
      <div class="hc-top"><span>Всего</span></div>
      <div class="hc-sum">${usd(totalEquity())}</div><div class="hc-sub">${equitySub()}</div>
      <div class="hc-actions"><button class="btn" type="button" data-act="transfer">Перевести</button><button class="btn ghost" type="button" data-act="orders">История</button></div>
    </div>
    <div class="card-block">
      <div class="cb-head"><b>Фьючерсный счёт</b><button class="link-btn" type="button" data-act="futures">Торговать →</button></div>
      <div class="kv">${kvRow("Стоимость счёта", usd(S.accountValue || 0))}${kvRow("Доступно", usd(availFor("BTC") || 0))}${kvRow("Маржа в позициях", usd(S.marginUsed || 0))}${kvRow("Нереализованный PnL", sgnUsd(t), clsOf(t))}${kvRow("Открытых позиций", i.length)}</div>
    </div>
    <div class="card-block">
      <div class="cb-head"><b>Спот</b><span class="muted small">${usd(spotTotal())}</span></div>
      ${
        e.length
          ? e
              .map((n) => {
                let s = spotPriceOf(n.coin),
                  r = S.spot.find((o) => o.base === n.coin && o.quote === "USDC");
                return `<div class="as-row"${r && n.coin !== "USDC" ? ` data-go-spot="${esc(r.name)}"` : ""}>${coinIcon(r ? r.name : n.coin)}<div><b>${esc(n.coin)}</b><small class="muted">${num(Number(n.total), 6)}</small></div><span>${s ? usd(Number(n.total) * s) : "—"}</span></div>`;
              })
              .join("")
          : '<p class="muted small">На спот-счёте пусто. Нажмите «Перевести», чтобы перевести USDC с фьючерсного счёта.</p>'
      }
    </div>`
      : '<div class="hero-card"><div class="hc-lead">Подключите кошелёк, чтобы увидеть балансы фьючерсного и спот-счёта.</div><button class="btn wide-btn" type="button" data-act="connect">Подключить кошелёк</button></div>')),
    fixIcons($("pgAssets")));
}
var NAV_IC = {
  futures:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M7 5.5v3.2M7 16v3"/><rect x="4.4" y="8.7" width="5.2" height="7.3" rx="1.6" fill="currentColor" fill-opacity=".28"/><path d="M15.5 2.8v2.4M15.5 11.6v1.6"/><rect x="12.9" y="5.2" width="5.2" height="6.4" rx="1.6" fill="currentColor" fill-opacity=".28"/><path d="M13.5 20.5 20.5 14"/><path d="M16.8 13.8h3.9v3.9"/></svg>',
  trade:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="12" r="5"/><path d="M14.5 7.2a5 5 0 1 1 0 9.6"/></svg>',
  swap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 8.5h12.5L14.5 5.5"/><path d="M19 15.5H6.5l3 3"/></svg>',
  doc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/></svg>',
};
function bindApp() {
  (document.querySelectorAll("#mnav [data-app]").forEach((t) => (t.onclick = () => setApp(t.dataset.app))),
    window.addEventListener("resize", moveNavPill),
    document.addEventListener("click", (t) => {
      let e = t.target.closest("[data-act]");
      if (e) {
        let o = e.dataset.act;
        (o === "connect" &&
          (setApp(isSpot() ? "trade" : "futures", {
            keepCoin: !0,
          }),
          connectWallet()),
          (o === "futures" || o === "trade") && setApp(o),
          o === "transfer" && openTransfer(),
          o === "orders" && openOrdersPage());
      }
      let n = t.target.closest("[data-go]");
      n &&
        (switchCoin(n.dataset.go),
        setApp("futures", {
          keepCoin: !0,
        }));
      let s = t.target.closest("[data-go-spot]");
      s &&
        (switchCoin(s.dataset.goSpot),
        setApp("trade", {
          keepCoin: !0,
        }));
      let r = t.target.closest("[data-ht]");
      r && ((S.homeTab = r.dataset.ht), (appRenderT = 0), renderHome());
    }),
    document.querySelectorAll("[data-mmk]").forEach(
      (t) =>
        (t.onclick = () => {
          ((MP.mk = t.dataset.mmk), (MP.limit = 60), markMarketTabs(), renderMarketsPage());
        }),
    ),
    document.querySelectorAll("[data-mt]").forEach(
      (t) =>
        (t.onclick = () => {
          ((MP.tab = t.dataset.mt), (MP.limit = 60), markMarketTabs(), renderMarketsPage());
        }),
    ),
    document.querySelectorAll("[data-ms]").forEach(
      (t) =>
        (t.onclick = () => {
          ((MP.sort = t.dataset.ms), (MP.limit = 60), markMarketTabs(), renderMarketsPage());
        }),
    ),
    ($("mSearch").oninput = (t) => {
      ((MP.q = t.target.value), (MP.limit = 60), renderMarketsPage());
    }),
    window.addEventListener("scroll", () => {
      document.body.dataset.app !== "markets" ||
        !MP.more ||
        (window.innerHeight + window.scrollY > document.body.scrollHeight - 300 &&
          ((MP.limit += 60), renderMarketsPage()));
    }),
    ($("mList").onclick = (t) => {
      let e = t.target.closest("[data-fav]");
      if (e) {
        let s = e.dataset.fav;
        FAVS = FAVS.includes(s) ? FAVS.filter((r) => r !== s) : [...FAVS, s];
        try {
          localStorage.setItem("totum.favs", JSON.stringify(FAVS));
        } catch {}
        e.classList.toggle("on", FAVS.includes(s));
        return;
      }
      let n = t.target.closest("[data-coin]");
      if (n) {
        let s = isSpot(n.dataset.coin);
        (switchCoin(n.dataset.coin),
          setApp(s ? "trade" : "futures", {
            keepCoin: !0,
          }));
      }
    }));
  let i = "futures";
  try {
    i = localStorage.getItem("totum.app") || "futures";
  } catch {}
  ((document.body.dataset.app = i),
    document.querySelectorAll("#mnav [data-app]").forEach((t) => t.classList.toggle("on", t.dataset.app === i)),
    requestAnimationFrame(() => {
      (moveNavPill(), renderAppPage());
    }));
}
var LN = {
    mk: "perp",
    sig: "",
    rsig: "",
    mob: null,
  },
  isDesk = () => matchMedia("(min-width: 901px)").matches,
  wantLanding = () =>
    isDesk() && (location.pathname === "/" || location.pathname === "/index.html") && location.hash !== "#trade";
function setView(i, t = !1) {
  ((document.body.dataset.view = i),
    ($("landing").hidden = i !== "landing"),
    t && history.pushState(null, "", i === "landing" ? "/" : "/trade"),
    i === "landing"
      ? ((document.title = "Totum — фьючерсы, спот и акции в одном окне"),
        renderLanding(),
        LN.mob ||
          ((LN.mob = "loading"),
          import("./mobius.js")
            .then(({ mountMobius: e }) => {
              LN.mob = e($("lnMark")) || "none";
            })
            .catch(() => {
              LN.mob = "none";
            })),
        window.scrollTo(0, 0))
      : ((document.title = CFG.isTestnet ? "Totum — testnet" : "Totum"), window.scrollTo(0, 0)));
}
function lnRows() {
  return (LN.mk === "spot" ? S.spot : S.meta)
    .map((t) => {
      let e = S.ctx[t.name] || {},
        n = Number(e.midPx || e.markPx || 0);
      return {
        name: t.name,
        mid: n,
        ch: Number(e.prevDayPx) ? n / Number(e.prevDayPx) - 1 : 0,
        vol: Number(e.dayNtlVlm || 0),
        fund: e.funding != null ? Number(e.funding) : null,
      };
    })
    .filter((t) => t.mid > 0 && !mkt(t.name)?.delisted)
    .sort((t, e) => e.vol - t.vol);
}
var pctTxt2 = (i) =>
  `${i >= 0 ? "+" : "−"}${Math.abs(i * 100)
    .toFixed(2)
    .replace(".", ",")}%`;
/* Итоговая комиссия для пользователя (биржа + Totum), базовый уровень Hyperliquid:
   фьючерсы 0,045% / 0,015%, спот 0,07% / 0,04% (тейкер / мейкер) + комиссия Totum из config.js. */
function totalFeeText() {
  const t = CFG.feeTenthBps / 1e5, f = (x) => `${(x * 100).toFixed(3).replace(/0+$/, "").replace(/\.$/, "").replace(".", ",")}%`;
  return `фьючерсы — <b>${f(45e-5 + t)}</b> по рынку и <b>${f(15e-5 + t)}</b> лимитом, спот — <b>${f(7e-4 + t)}</b> и <b>${f(4e-4 + t)}</b>`;
}
function renderLanding() {
  if (document.body.dataset.view !== "landing") return;
  (($("lnNet").hidden = !CFG.isTestnet), ($("lnFee").innerHTML = totalFeeText()));
  let i = Math.max(0, ...S.meta.map((a) => Number(a.maxLeverage || 0)));
  (i && ($("lnMaxLev").textContent = i),
    ($("lnStep3").textContent = CFG.isTestnet
      ? "В тестовой сети возьмите бесплатные тестовые USDC в кране и откройте первую сделку."
      : "Пополните счёт в USDC и откройте первую сделку."));
  let t = S.meta
      .map((a) => {
        let c = S.ctx[a.name] || {};
        return {
          name: a.name,
          vol: Number(c.dayNtlVlm || 0),
        };
      })
      .sort((a, c) => c.vol - a.vol)
      .slice(0, 24),
    e = t.map((a) => a.name).join(","),
    n = $("lnTrack");
  if (e && e !== LN.rsig) {
    LN.rsig = e;
    let a = (l) =>
        `<button type="button" class="ln-tk" data-ln-coin="${esc(l.name)}">${coinIcon(l.name)}<b>${esc(l.name)}</b><span class="px"></span><span class="ch"></span></button>`,
      c = t.map(a).join("");
    ((n.innerHTML = `<div class="ln-run">${c}</div><div class="ln-run" aria-hidden="true">${c}</div>`), fixIcons(n));
  }
  n.querySelectorAll("[data-ln-coin]").forEach((a) => {
    let c = S.ctx[a.dataset.lnCoin];
    if (!c) return;
    let l = Number(c.midPx || c.markPx || 0),
      h = Number(c.prevDayPx) ? l / Number(c.prevDayPx) - 1 : 0;
    a.querySelector(".px").textContent = fmtPx(l);
    let p = a.querySelector(".ch");
    ((p.textContent = pctTxt2(h)), (p.className = `ch ${h >= 0 ? "up" : "dn"}`));
  });
  let s = lnRows().slice(0, 10),
    r = $("lnRows");
  document.querySelector(".ln-table").classList.toggle("spot", LN.mk === "spot");
  let o = LN.mk + s.map((a) => a.name).join(",");
  if (!s.length) {
    ((LN.sig = ""), (r.innerHTML = '<tr><td colspan="6" class="ln-empty">Загружаем рынки…</td></tr>'));
    return;
  }
  (o !== LN.sig &&
    ((LN.sig = o),
    (r.innerHTML = s
      .map(
        (a) => `<tr data-ln-coin="${esc(a.name)}" tabindex="0">
      <td><span class="ln-pair">${coinIcon(a.name)}<b>${esc(pairLabel(a.name))}</b></span></td>
      <td class="px"></td><td class="ch"></td><td class="vol"></td><td class="fund"></td>
      <td><span class="ln-trade">Торговать</span></td></tr>`,
      )
      .join("")),
    fixIcons(r)),
    s.forEach((a) => {
      let c = r.querySelector(`tr[data-ln-coin="${CSS.escape(a.name)}"]`);
      if (!c) return;
      c.querySelector(".px").textContent = fmtPx(a.mid);
      let l = c.querySelector(".ch");
      ((l.textContent = pctTxt2(a.ch)),
        (l.className = `ch ${a.ch >= 0 ? "up" : "dn"}`),
        (c.querySelector(".vol").textContent = compact(a.vol)));
      let h = c.querySelector(".fund");
      ((h.textContent =
        a.fund == null
          ? "—"
          : `${a.fund >= 0 ? "+" : "−"}${Math.abs(a.fund * 100)
              .toFixed(4)
              .replace(".", ",")}%`),
        (h.className = `fund ${a.fund == null ? "" : a.fund >= 0 ? "up" : "dn"}`));
    }));
}
function bindLanding() {
  let i = (t) => {
    (t && switchCoin(t), setView("app", !0));
  };
  ($("landing").addEventListener("click", (t) => {
    if (t.target.closest("[data-open-term]")) {
      (t.preventDefault(), i());
      return;
    }
    let n = t.target.closest("[data-ln-coin]");
    if (n) {
      i(n.dataset.lnCoin);
      return;
    }
    let s = t.target.closest("[data-lnm]");
    if (s) {
      ((LN.mk = s.dataset.lnm),
        (LN.sig = ""),
        document.querySelectorAll("[data-lnm]").forEach((o) => o.classList.toggle("on", o === s)),
        renderLanding());
      return;
    }
    t.target.closest(".ln-brand") &&
      (t.preventDefault(),
      window.scrollTo({
        top: 0,
        behavior: "smooth",
      }));
  }),
    $("lnRows").addEventListener("keydown", (t) => {
      let e = t.target.closest("[data-ln-coin]");
      e && (t.key === "Enter" || t.key === " ") && (t.preventDefault(), i(e.dataset.lnCoin));
    }),
    document.querySelector(".top .brand").addEventListener("click", () => {
      isDesk() && setView("landing", !0);
    }),
    addEventListener("popstate", () => setView(wantLanding() ? "landing" : "app")),
    setView(wantLanding() ? "landing" : "app"));
}
function pickInterval(i) {
  ((S.interval = i),
    document.querySelectorAll("[data-iv]").forEach((t) => t.classList.toggle("on", t.dataset.iv === i)),
    subscribeCoin());
}
function bindMobile() {
  (($("btnChartToggle").onclick = () => toggleInlineChart()),
    ($("btnFull").onclick = () => setMView("full")),
    ($("btnBack").onclick = () => {
      history.state?.totum === "full" ? history.back() : setMView("trade");
    }),
    window.addEventListener("popstate", () => {
      document.body.dataset.mv === "full" && setMView("trade");
    }),
    document.querySelectorAll("#cpTabs [data-cp]").forEach((i) => (i.onclick = () => setCpTab(i.dataset.cp))),
    ($("fbOpen").onclick = () => openSheet("open")),
    ($("fbClose").onclick = () => openSheet("close")),
    ($("sheetBack").onclick = closeSheet),
    ($("sheetClose").onclick = closeSheet),
    window.matchMedia("(max-width:900px)").addEventListener?.("change", () => {
      (closeSheet(), renderBook());
    }));
}
var pnlData = null,
  RU2 = (i, t = 2) =>
    Math.abs(i).toLocaleString("ru-RU", {
      minimumFractionDigits: t,
      maximumFractionDigits: t,
    }),
  MARK_IMG = new Image();
MARK_IMG.src = "brand/mark-512.webp";
function drawMark(i, t, e, n, s = 1) {
  !MARK_IMG.complete ||
    !MARK_IMG.naturalWidth ||
    (i.save(), (i.globalAlpha = s), i.drawImage(MARK_IMG, t, e, n, n), i.restore());
}
function rng(i) {
  let t = Math.abs(Math.floor(i)) % 2147483647 || 1;
  return () => (t = (t * 16807) % 2147483647) / 2147483647;
}
function drawPnlBackground(i, t, e, n, s) {
  let r = n
      ? {
          a: "#03101d",
          b: "#04221f",
          blob1: "rgba(16,185,129,.38)",
          blob2: "rgba(37,99,235,.36)",
          line: "#34D399",
          glow: "rgba(52,211,153,.9)",
        }
      : {
          a: "#12040c",
          b: "#1b0726",
          blob1: "rgba(244,63,94,.34)",
          blob2: "rgba(124,58,237,.34)",
          line: "#FB7185",
          glow: "rgba(251,113,133,.85)",
        },
    o = i.createLinearGradient(0, 0, t, e);
  (o.addColorStop(0, r.a), o.addColorStop(1, r.b), (i.fillStyle = o), i.fillRect(0, 0, t, e));
  let a = (q, U, V, et) => {
    let it = i.createRadialGradient(q, U, 0, q, U, V);
    (it.addColorStop(0, et), it.addColorStop(1, "rgba(0,0,0,0)"), (i.fillStyle = it), i.fillRect(0, 0, t, e));
  };
  (a(t * 0.88, e * (n ? 0.12 : 0.85), 560, r.blob1),
    a(t * 0.08, e * (n ? 1 : 0.05), 620, r.blob2),
    i.save(),
    (i.strokeStyle = "rgba(255,255,255,.045)"),
    (i.lineWidth = 1));
  for (let q = 0; q <= t; q += 48) (i.beginPath(), i.moveTo(q, 0), i.lineTo(q, e), i.stroke());
  for (let q = 0; q <= e; q += 48) (i.beginPath(), i.moveTo(0, q), i.lineTo(t, q), i.stroke());
  (i.restore(), drawMark(i, t - 500, e - 560, 680, 0.13));
  let c = rng(s),
    l = [],
    h = 46,
    p = t * 0.47,
    f = t + 10,
    b = n ? e * 0.86 : e * 0.22,
    w = n ? e * 0.2 : e * 0.84,
    _ = 0;
  for (let q = 0; q <= h; q++) {
    let U = q / h;
    _ = _ * 0.55 + (c() - 0.5) * 46;
    let V = U * U * (3 - 2 * U);
    l.push([p + (f - p) * U, b + (w - b) * V + _ * (1 - U * 0.4)]);
  }
  let P = i.createLinearGradient(0, Math.min(b, w), 0, e);
  (P.addColorStop(0, n ? "rgba(52,211,153,.30)" : "rgba(251,113,133,.26)"),
    P.addColorStop(1, "rgba(0,0,0,0)"),
    i.beginPath(),
    i.moveTo(l[0][0], e),
    l.forEach(([q, U]) => i.lineTo(q, U)),
    i.lineTo(f, e),
    i.closePath(),
    (i.fillStyle = P),
    i.fill(),
    i.save(),
    (i.shadowColor = r.glow),
    (i.shadowBlur = 26),
    (i.lineWidth = 4),
    (i.lineJoin = "round"),
    (i.strokeStyle = r.line),
    i.beginPath(),
    l.forEach(([q, U], V) => (V ? i.lineTo(q, U) : i.moveTo(q, U))),
    i.stroke(),
    i.restore());
  let [N, O] = l[l.length - 6];
  (i.save(),
    (i.shadowColor = r.glow),
    (i.shadowBlur = 30),
    (i.fillStyle = "#fff"),
    i.beginPath(),
    i.arc(N, O, 7, 0, Math.PI * 2),
    i.fill(),
    i.restore());
  for (let q = 0; q < 26; q++)
    ((i.fillStyle = `rgba(255,255,255,${0.15 + c() * 0.5})`),
      i.beginPath(),
      i.arc(p + c() * (t - p), c() * e, c() * 1.8 + 0.4, 0, Math.PI * 2),
      i.fill());
  let R = i.createLinearGradient(0, 0, t * 0.6, 0);
  (R.addColorStop(0, "rgba(0,0,0,.45)"), R.addColorStop(1, "rgba(0,0,0,0)"), (i.fillStyle = R), i.fillRect(0, 0, t, e));
}
function pill(i, t, e, n, s, r, o = "700 22px Manrope") {
  i.font = o;
  let a = i.measureText(n).width + 28;
  return (
    (i.fillStyle = s),
    i.beginPath(),
    i.roundRect(t, e, a, 38, 19),
    i.fill(),
    (i.fillStyle = r),
    (i.textBaseline = "middle"),
    i.fillText(n, t + 14, e + 20),
    (i.textBaseline = "alphabetic"),
    t + a + 10
  );
}
async function renderPnlCard() {
  let i = pnlData;
  if (!i) return;
  let t = $("pnlCanvas"),
    e = t.getContext("2d"),
    n = t.width,
    s = t.height;
  try {
    await Promise.all(
      ["700 40px Unbounded", "700 40px Manrope", "500 20px Manrope"].map((f) =>
        document.fonts.load(f, "totum ROE +0123456789,% Лонг"),
      ),
    );
  } catch {}
  try {
    await MARK_IMG.decode();
  } catch {}
  let r = i.pnl >= 0;
  (e.clearRect(0, 0, n, s), drawPnlBackground(e, n, s, r, Math.round(Math.abs(i.pnl) * 1e3) + (i.time % 1e5)));
  let o = 72;
  (drawMark(e, o - 6, 46, 64),
    (e.fillStyle = "#fff"),
    (e.font = "700 38px Unbounded"),
    e.fillText("totum", o + 70, 92),
    CFG.isTestnet &&
      pill(
        e,
        o + 70 + e.measureText("totum").width + 16,
        64,
        "TESTNET",
        "rgba(253,230,138,.16)",
        "#FDE68A",
        "700 18px Manrope",
      ),
    (e.font = "500 22px Manrope"),
    (e.fillStyle = "rgba(255,255,255,.6)"),
    (e.textAlign = "right"),
    e.fillText(
      new Date(i.time).toLocaleString("ru-RU", {
        hour12: !1,
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
      n - 60,
      92,
    ),
    (e.textAlign = "left"),
    (e.fillStyle = "#fff"),
    (e.font = "700 40px Manrope"),
    e.fillText(pairLabel(i.coin), o, 200));
  let a = o + e.measureText(pairLabel(i.coin)).width + 18;
  ((a = pill(
    e,
    a,
    170,
    i.long ? "Лонг" : "Шорт",
    i.long ? "rgba(52,211,153,.18)" : "rgba(251,113,133,.18)",
    i.long ? "#6EE7B7" : "#FDA4AF",
  )),
    i.lev && pill(e, a, 170, `${i.lev}x`, "rgba(255,255,255,.1)", "#fff"),
    (e.font = "500 26px Manrope"),
    (e.fillStyle = "rgba(255,255,255,.62)"),
    e.fillText(i.pctLabel, o, 286));
  let c = `${i.pct >= 0 ? "+" : "−"}${RU2(i.pct)}%`,
    l = 118;
  for (e.font = `700 ${l}px Unbounded`; e.measureText(c).width > n * 0.58 && l > 60;)
    ((l -= 6), (e.font = `700 ${l}px Unbounded`));
  (e.save(), (e.shadowColor = r ? "rgba(52,211,153,.55)" : "rgba(251,113,133,.5)"), (e.shadowBlur = 34));
  let h = e.createLinearGradient(o, 300, o, 410);
  (h.addColorStop(0, r ? "#A7F3D0" : "#FECDD3"),
    h.addColorStop(1, r ? "#10B981" : "#F43F5E"),
    (e.fillStyle = h),
    e.fillText(c, o - 4, 400),
    e.restore());
  let p = 470;
  if (
    ($("pnlShowUsd").checked
      ? ((e.font = "700 40px Manrope"),
        (e.fillStyle = "#fff"),
        e.fillText(`${i.pnl >= 0 ? "+" : "−"}${RU2(i.pnl)} USDC`, o, p),
        (e.font = "500 20px Manrope"),
        (e.fillStyle = "rgba(255,255,255,.55)"),
        e.fillText(i.pnlLabel, o, p + 32),
        (p += 90))
      : (p += 30),
    $("pnlShowPx").checked)
  ) {
    let f = (b, w, _) => {
      ((e.font = "500 20px Manrope"),
        (e.fillStyle = "rgba(255,255,255,.55)"),
        e.fillText(w, b, p),
        (e.font = "700 30px Manrope"),
        (e.fillStyle = "#fff"),
        e.fillText(_, b, p + 38));
    };
    (f(o, "Цена входа", fmtPx(i.entry)), f(o + 260, i.exitLabel || "Цена закрытия", fmtPx(i.exit)));
  }
  ((e.font = "500 20px Manrope"),
    (e.fillStyle = "rgba(255,255,255,.55)"),
    (e.textAlign = "right"),
    e.fillText(r ? "Профит зафиксирован на Totum" : "Рынок учит — Totum помогает", n - 60, s - 74),
    (e.font = "700 22px Manrope"),
    (e.fillStyle = "rgba(255,255,255,.85)"),
    e.fillText(location.host || "totum", n - 60, s - 44),
    (e.textAlign = "left"));
}
function openPnlCard(i) {
  ((pnlData = i), $("pnlDialog").open || $("pnlDialog").showModal(), renderPnlCard());
}
var pnlBlob = () => new Promise((i) => $("pnlCanvas").toBlob(i, "image/png")),
  pnlName = () =>
    `totum-pnl-${pnlData?.coin || ""}-${new Date(pnlData?.time || Date.now()).toISOString().slice(0, 10)}.png`;
async function pnlDownload() {
  let i = URL.createObjectURL(await pnlBlob()),
    t = document.createElement("a");
  ((t.href = i),
    (t.download = pnlName()),
    document.body.appendChild(t),
    t.click(),
    t.remove(),
    setTimeout(() => URL.revokeObjectURL(i), 4e3));
}
async function pnlShare() {
  let i = new File([await pnlBlob()], pnlName(), {
    type: "image/png",
  });
  if (
    navigator.canShare?.({
      files: [i],
    })
  )
    try {
      await navigator.share({
        files: [i],
        title: "Мой PnL на Totum",
      });
    } catch {}
  else (await pnlDownload(), toast("Браузер не умеет «Поделиться» картинкой — сохранили PNG", "info"));
}
async function pnlCopy() {
  try {
    (await navigator.clipboard.write([
      new ClipboardItem({
        "image/png": await pnlBlob(),
      }),
    ]),
      toast("Картинка скопирована", "ok"));
  } catch {
    toast("Браузер не дал скопировать картинку — используйте «Скачать PNG»", "err");
  }
}
function startLoop() {
  (clearInterval(S.timer),
    (S.timer = setInterval(async () => {
      if (!document.hidden) {
        try {
          await refreshMarkets();
        } catch (i) {
          netBad(i, "markets");
        }
        (S.live.book || pollBook(),
          (S.tick = (S.tick || 0) + 1),
          !S.live.trades && S.tick % 3 === 0 && pollTrades(),
          S.user &&
            (await refreshAccount({
              light: !0,
            })));
      }
    }, CFG.refreshMs)),
    setInterval(() => {
      document.hidden || pollCandles();
    }, 6e4));
}
function switchCoin(i) {
  ((S.coin = i),
    isSpot(i) ? (S.lastSpot = i) : (S.lastPerp = i),
    setPairLabel(),
    ($("px").value = ""),
    ($("mkHigh").textContent = $("mkLow").textContent = "—"),
    S.orderType === "limit" && fillMidPrice());
  let t = mkt(i);
  // рынки HIP-3 часто только с изолированной маржой
  document.querySelectorAll('[data-margin="cross"]').forEach((b) => (b.disabled = !!t?.onlyIsolated));
  t?.onlyIsolated ? S.margin !== "isolated" && setMargin("isolated") : S.marginWanted && S.margin !== S.marginWanted && setMargin(S.marginWanted);
  (t && !t.spot && renderLevChips(t.maxLeverage),
    t?.spot
      ? (setMode("open"), setSpotSide(S.spotSide || "buy"), ["info"].includes(document.body.dataset.cp) && renderInfo())
      : setMode(S.mode || "open"),
    renderTicker(),
    subscribeCoin(),
    pollCandles(),
    S.mode === "close" && applyPct(Number($("pct").value)));
}
function setTheme(i) {
  document.documentElement.dataset.theme = i;
  try {
    localStorage.setItem("totum.theme", i);
  } catch {}
  (($("btnTheme").textContent = i === "dark" ? "☀" : "☾"), applyChartTheme());
}
function initSettings() {
  (($("setRemember").checked = SET.remember),
    ($("setConfirm").checked = SET.confirmOn),
    ($("btnSettings").onclick = () => {
      $("settingsPop").hidden = !$("settingsPop").hidden;
    }),
    ($("setRemember").onchange = (i) => {
      ((SET.remember = i.target.checked),
        saveSettings(),
        !SET.remember &&
          S.user &&
          (forgetAgent(),
          toast(
            "Ключ для сделок больше не хранится на устройстве: после закрытия вкладки понадобится включить торговлю заново.",
            "info",
          )));
    }),
    ($("setConfirm").onchange = (i) => {
      ((SET.confirmOn = i.target.checked), saveSettings());
    }),
    ($("setForget").onclick = () => {
      (forgetAgent(),
        (S.agent = null),
        (S.agentExchange = null),
        (S.agentOk = !1),
        updateSetupUI(),
        toast("Ключ для сделок удалён с этого устройства", "ok"));
    }));
}
function setSlippage(i) {
  ((i = Math.min(0.1, Math.max(5e-4, Number(i) || CFG.slippage))),
    (SET.slippage = i),
    saveSettings(),
    document.querySelectorAll("[data-slip]").forEach((t) => t.classList.toggle("on", Number(t.dataset.slip) === i)),
    ($("slipVal").textContent = `${(i * 100).toLocaleString("ru-RU", {
      maximumFractionDigits: 2,
    })}%`));
}
function setBookMode(i) {
  ((SET.bookMode = i),
    saveSettings(),
    document.querySelectorAll("[data-book]").forEach((t) => t.classList.toggle("on", t.dataset.book === i)),
    renderBook());
}
function bindSettings() {
  (initSettings(),
    document.querySelectorAll("[data-slip]").forEach(
      (i) =>
        (i.onclick = () => {
          (setSlippage(Number(i.dataset.slip)), ($("slipCustom").value = ""));
        }),
    ),
    ($("slipCustom").oninput = (i) => {
      Number(i.target.value) > 0 && setSlippage(Number(i.target.value) / 100);
    }),
    ($("slipOn").onchange = (i) => {
      $("slipRow").hidden = !i.target.checked;
    }),
    setSlippage(Number(SET.slippage) || CFG.slippage),
    document.querySelectorAll("[data-book]").forEach((i) => (i.onclick = () => setBookMode(i.dataset.book))),
    setBookMode(SET.bookMode || "both"),
    document.querySelectorAll("[data-view]").forEach((i) => (i.onclick = () => setChartView(i.dataset.view))),
    $("depth").addEventListener("mousemove", (i) => {
      let t = i.target.getBoundingClientRect();
      ((depthRaf = {
        x: i.clientX - t.left,
      }),
        renderDepth());
    }),
    $("depth").addEventListener("mouseleave", () => {
      ((depthRaf = null), renderDepth());
    }),
    window.addEventListener("resize", () => {
      S.chartView === "depth" && renderDepth();
    }),
    ($("btnTheme").onclick = () => setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark")),
    ($("btnConnect").onclick = () => (S.user ? disconnectWallet() : connectWallet())),
    ($("btnConnect2").onclick = connectWallet),
    ($("btnEnable").onclick = enableTrading),
    ($("adlClose").onclick = () => $("adlDialog").close()),
    ($("btnUnified").onclick = () => ensureUnified(!0)));
  try {
    $("consent").checked = localStorage.getItem("totum.consent") === "1";
  } catch {}
  (($("consent").onchange = updateSetupUI),
    ($("termsLink").onclick = (i) => {
      (i.preventDefault(), $("termsDialog").showModal());
    }),
    ($("termsClose").onclick = () => $("termsDialog").close()),
    ($("btnBuy").onclick = () => placeOrder(!0)),
    ($("btnSell").onclick = () => placeOrder(!1)),
    bindPairPicker(),
    ($("size").oninput = () => {
      (($("pct").value = 0), paintRange($("pct")), updateOrderInfo());
    }),
    ($("pct").oninput = (i) => applyPct(Number(i.target.value))),
    document.querySelectorAll("[data-p]").forEach((i) => (i.onclick = () => applyPct(Number(i.dataset.p)))),
    document.querySelectorAll("[data-ot]").forEach((i) => (i.onclick = () => setOrderType(i.dataset.ot))),
    document.querySelectorAll("[data-mode]").forEach((i) => (i.onclick = () => setMode(i.dataset.mode))),
    document.querySelectorAll("[data-margin]").forEach(
      (i) =>
        (i.onclick = () => {
          ((S.marginWanted = i.dataset.margin), setMargin(i.dataset.margin), (i.closest(".dd-menu").hidden = !0));
        }),
    ),
    ($("marginBtn").onclick = () => {
      let i = $("ddMargin").querySelector(".dd-menu");
      ((i.hidden = !i.hidden), ($("levPop").hidden = !0));
    }),
    ($("levBtn").onclick = () => {
      (($("levPop").hidden = !$("levPop").hidden), ($("ddMargin").querySelector(".dd-menu").hidden = !0));
    }),
    ($("lev").oninput = (i) => setLeverage(Number(i.target.value))),
    ($("pxMid").onclick = fillMidPrice),
    ($("px").oninput = updateOrderInfo),
    ($("tpslOn").onchange = (i) => {
      $("tpslRow").hidden = !i.target.checked;
      updateOrderInfo();
      drawChartLines();
    }),
    ($("riskOn").onchange = (i) => toggleRisk(i.target.checked)),
    ($("riskUsd").oninput = (i) => {
      SET.riskUsd = i.target.value;
      saveSettings();
      updateOrderInfo();
      drawChartLines();
    }),
    ($("closePx").oninput = updateCloseInfo),
    ($("closePct").oninput = (i) => {
      (paintRange(i.target), updateCloseInfo());
    }),
    document.querySelectorAll("[data-cp]").forEach(
      (i) =>
        (i.onclick = () => {
          (($("closePct").value = i.dataset.cp), paintRange($("closePct")), updateCloseInfo());
        }),
    ),
    ($("closeMid").onclick = () => {
      let i = CLOSE && S.ctx[CLOSE.coin];
      i && (($("closePx").value = Number(i.midPx).toFixed(pxDecimals(i.midPx))), updateCloseInfo());
    }),
    ($("closeCancel").onclick = () => $("closeDialog").close()),
    document.querySelectorAll("#closeTabs [data-ct]").forEach((i) => (i.onclick = () => setCloseType(i.dataset.ct))),
    ($("btnCloseAll").onclick = closeAll),
    document.querySelectorAll("[data-sside]").forEach((i) => (i.onclick = () => setSpotSide(i.dataset.sside))),
    ($("btnTransfer").onclick = openTransfer),
    document.querySelectorAll("[data-tr]").forEach((i) => (i.onclick = () => setTrDir(i.dataset.tr === "toPerp"))),
    ($("trMax").onclick = () => {
      $("trAmt").value = Math.floor((trToPerp ? spotBal("USDC") : S.withdrawable) * 100) / 100;
    }),
    ($("trCancel").onclick = () => $("transferDialog").close()),
    ($("trGo").onclick = submitTransfer),
    $("spotBody").addEventListener("click", (i) => {
      let t = i.target.closest("[data-spot-trade]");
      t && switchCoin(t.dataset.spotTrade);
    }),
    $("opList").addEventListener("click", (i) => {
      let t = i.target.closest("[data-share]");
      t && openPnlCard(OP.share[Number(t.dataset.share)]);
    }),
    ($("pnlClose").onclick = () => $("pnlDialog").close()),
    ($("pnlShowUsd").onchange = $("pnlShowPx").onchange = renderPnlCard),
    ($("pnlDownload").onclick = pnlDownload),
    ($("pnlShare").onclick = pnlShare),
    ($("pnlCopy").onclick = pnlCopy),
    ($("btnOrdersInfo").onclick = () => openOrdersPage()),
    ($("opBack").onclick = () => $("ordersPage").close()),
    ($("opRefresh").onclick = async () => {
      (OP.tab === "open" && (await refreshAccount()), loadOpTab());
    }),
    document.querySelectorAll("[data-op]").forEach((i) => (i.onclick = () => setOpTab(i.dataset.op))),
    document.querySelectorAll("[data-opf]").forEach(
      (i) =>
        (i.onclick = () => {
          ((OP.filter = i.dataset.opf),
            document.querySelectorAll("[data-opf]").forEach((t) => t.classList.toggle("on", t === i)),
            loadOpTab());
        }),
    ),
    ($("closeGo").onclick = submitClose),
    ($("tpslCancel").onclick = () => $("tpslDialog").close()),
    ($("ptp").oninput = $("psl").oninput = updateTpslDlg),
    ($("tp").oninput = $("sl").oninput = () => {
      updateOrderInfo();
      drawChartLines();
    }),
    ($("riskOn").checked = !!SET.riskOn),
    SET.riskUsd && ($("riskUsd").value = SET.riskUsd),
    SET.riskOn && (($("tpslOn").checked = !0), ($("tpslRow").hidden = !1)),
    document
      .querySelectorAll("[data-unit-for]")
      .forEach((i) =>
        i
          .querySelectorAll("[data-unit]")
          .forEach((t) => (t.onclick = () => setUnit(i.dataset.unitFor, t.dataset.unit))),
      ),
    ($("tpslGo").onclick = saveTpsl),
    document.querySelectorAll("[data-iv]").forEach(
      (i) =>
        (i.onclick = () => {
          ((S.userPickedIv = !0), pickInterval(i.dataset.iv));
        }),
    ),
    document.querySelectorAll("[data-side]").forEach(
      (i) =>
        (i.onclick = () => {
          (document.querySelectorAll("[data-side]").forEach((t) => t.classList.toggle("on", t === i)),
            $("sidePanel").classList.toggle("show-trades", i.dataset.side === "trades"));
        }),
    ),
    bindMobile(),
    bindApp(),
    bindLanding(),
    WC_PROJECT_ID &&
      !USER_CFG.debug &&
      (window.requestIdleCallback || ((i) => setTimeout(i, 2500)))(() => preloadWalletConnect()?.catch(() => {}), {
        timeout: 4e3,
      }),
    document.querySelectorAll("[data-b]").forEach(
      (i) =>
        (i.onclick = () => {
          (document.querySelectorAll("[data-b]").forEach((t) => t.classList.toggle("on", t === i)),
            document.querySelectorAll("[data-b-pane]").forEach((t) => (t.hidden = t.dataset.bPane !== i.dataset.b)),
            i.dataset.b === "hist" && loadHistory());
        }),
    ),
    ($("asks").onclick = $("bids").onclick =
      (i) => {
        let t = i.target.closest("[data-px]");
        t && (setOrderType("limit"), ($("px").value = t.dataset.px), updateOrderInfo());
      }),
    document.addEventListener("click", (i) => {
      let t = i.target.closest("[data-close]");
      t && closePosition(t.dataset.close, t.dataset.szi);
      let e = i.target.closest("[data-close-dlg]");
      e && openCloseLimit(e.dataset.coin, e.dataset.szi, e.dataset.ct || "market");
      let n = i.target.closest("[data-reverse]");
      n && reversePosition(n.dataset.coin, n.dataset.szi);
      let ad = i.target.closest("[data-adl]");
      ad && openAdlInfo(ad.dataset.adl);
      let s = i.target.closest("[data-pos-share]");
      s &&
        S.posShare?.[s.dataset.posShare] &&
        openPnlCard({
          ...S.posShare[s.dataset.posShare],
          time: Date.now(),
        });
      let r = i.target.closest("[data-tpsl]");
      r && openTpsl(r.dataset.tpsl);
      let o = i.target.closest("[data-cancel]");
      (o && cancelOrder(o.dataset.coin, o.dataset.cancel),
        i.target.closest("#ddLev") || ($("levPop").hidden = !0),
        i.target.closest("#ddMargin") || ($("ddMargin").querySelector(".dd-menu").hidden = !0),
        !i.target.closest("#settingsPop") && !i.target.closest("#btnSettings") && ($("settingsPop").hidden = !0));
    }),
    ($("netBadge").textContent = isMobile() ? "ТЕСТ" : "ТЕСТОВАЯ СЕТЬ"),
    ($("setThemeBtn").onclick = () => setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark")),
    ($("netBadge").hidden = !CFG.isTestnet),
    ($("feeLabel").textContent = FEE_PCT),
    ($("termsFee").textContent = FEE_PCT),
    paintRange($("pct")),
    paintRange($("lev")));
}
async function init() {
  (bindSettings(), initChart(), bindIndicators(), bindDrawing(), bindTpslDrag());
  let i = "light";
  try {
    i = localStorage.getItem("totum.theme") || "light";
  } catch {}
  (setTheme(i),
    setCpTab("chart"),
    updateSetupUI(),
    setMargin("cross"),
    renderCountdown(),
    setInterval(renderCountdown, 1e3),
    iconsReady.then(() => {
      ICON_LOCAL && (setPairLabel(), $("pairPop").hidden || renderPairList());
    }));
  let t = loadMarketsCache();
  (t && afterMarkets(), subscribeCoin(), pollCandles());
  let e = loadMarkets().catch((s) => netBad(s, "markets"));
  t || (await e);
  let n = mkt(S.coin);
  (renderLevChips(n?.maxLeverage || 50),
    setLeverage(10),
    subscribeAllPrices(),
    startLoop(),
    USER_CFG.debug &&
      (window.__totum = {
        S: S,
        priceToY: (s) => candleSeries.priceToCoordinate(s),
        lines: () =>
          chartLines.map((s) => ({
            kind: s.kind,
            price: s.price,
            title: s.line.options().title,
          })),
        openPnlCard: openPnlCard,
        switchCoin: switchCoin,
        marks: () => tradeMarks?.markers?.() || null,
      }));
}
init();
/*! Bundled license information:

decimal.js/decimal.mjs:
  (*!
   *  decimal.js v10.6.0
   *  An arbitrary-precision Decimal type for JavaScript.
   *  https://github.com/MikeMcl/decimal.js
   *  Copyright (c) 2025 Michael Mclaughlin <M8ch88l@gmail.com>
   *  MIT Licence
   *)

lightweight-charts/dist/lightweight-charts.production.mjs:
  (*!
   * @license
   * TradingView Lightweight Charts™ v5.1.0
   * Copyright (c) 2025 TradingView, Inc.
   * Licensed under Apache License 2.0 https://www.apache.org/licenses/LICENSE-2.0
   *)
*/
