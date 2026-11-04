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
  /* на основной сети биржа иногда отвечает дольше 10 с (особенно с телефона) —
     ждём до 20 с, иначе подключение и подписи срывались «через раз» */
  transport = new HttpTransport({
    isTestnet: CFG.isTestnet,
    timeout: 2e4,
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
      /* подписка на весь спот тестнета подтверждается дольше 10 с: при коротком
         ожидании библиотека бросала её, а сервер считал «уже подписан» */
      timeout: 45e3,
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
  /* библиотека заворачивает ответ кошелька в «Failed to sign the typed data…» —
     достаём настоящую причину (отмена, нет ответа, ошибка кошелька) из цепочки cause */
  let t = String(i?.message || i);
  for (let c = i?.cause, k = 0; c && k < 4; c = c.cause, k++) t += ` | ${c?.shortMessage || c?.message || c}`;
  if (/Failed to sign the typed data/i.test(t) && !/reject|denied|cancel|отмен|timeout/i.test(t))
    return `Кошелёк не подписал запрос: ${t.split(" | ").slice(1).join(" — ").slice(0, 140) || "без объяснения"}. Откройте кошелёк и попробуйте ещё раз.`;
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
      [/Size is too small/i, "Объём меньше минимального шага этой монеты — увеличьте сумму."],
      [/Insufficient spot balance/i, "Не хватает средств на споте. При покупке комиссия списывается в купленной монете, поэтому монет чуть меньше, чем куплено."],
      [/Slicprice|could not immediately match/i, "Заявка по рынку не нашла встречных ордеров. Попробуйте ещё раз или поставьте лимитную."],
      [/Reduce only order would increase position/i, "Позиции уже нет (или она меньше) — закрывать нечего. Обновляем данные…"],
      [/Order has invalid price|tick|invalid price/i, "Биржа не приняла такую цену. Попробуйте чуть другую."],
      [/min.*notional|minimum value|\$10/i, "Слишком маленький ордер: на Hyperliquid минимум 10 USDC."],
      [
        /timed out|timeout|Failed to fetch|NetworkError|TransportError|WebSocket|network/i,
        "Биржа отвечает медленно. Попробуйте ещё раз через несколько секунд.",
      ],
    ];
  console.warn("[ошибка биржи]", t);
  for (let [n, s] of e) if (n.test(t)) return s;
  /* неизвестная ошибка — показываем и исходный текст биржи, чтобы было понятно, что не так */
  return `Биржа не выполнила запрос: ${String(t).slice(0, 140)}`;
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
/* Hyperliquid отдаёт списки рынков несжатыми (только спот ~360 КБ) и издалека.
   Наш сервер на Vercel берёт их, сжимает в ~6 раз и держит копию рядом с человеком.
   Не ответил за 8 с — идём напрямую к Hyperliquid, как раньше. */
async function cdnInfo(type, direct) {
  if (CFG.isTestnet) return direct();
  try {
    const r = await fetch(`/api/hl?type=${type}`, { signal: AbortSignal.timeout(8e3) });
    if (!r.ok) throw new Error(String(r.status));
    return await r.json();
  } catch (e) {
    console.warn("[рынки через сервер]", type, e?.message || e);
    return direct();
  }
}
async function loadSpotMarkets() {
  let [i, t] = await cdnInfo("spotMetaAndAssetCtxs", () => infoHeavy.spotMetaAndAssetCtxs()),
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
    cdnInfo("metaAndAssetCtxs", () => infoHeavy.metaAndAssetCtxs()),
    needDex ? cdnInfo("allPerpMetas", () => infoHeavy.allPerpMetas()).catch((e) => (console.warn("[hip3]", e?.message || e), null)) : Promise.resolve(null),
    S.cats ? Promise.resolve(null) : cdnInfo("perpCategories", () => info.perpCategories()).catch(() => null),
  ]);
  if (cats) S.cats = Object.fromEntries(cats);
  S.mtables = S.mtables || {};
  (i.marginTables || []).forEach(([id, t]) => (S.mtables[`|${id}`] = t?.marginTiers || []));
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
      mt: e.marginTableId != null ? `|${e.marginTableId}` : null,
    }))
    .filter((e) => !e.delisted);
  if (all) {
    S.dexUniverse = {};
    S.dexMarkets = [];
    all.forEach((m, di) => {
      if (di === 0 || !m?.universe?.length) return;
      const dex = dexOf(m.universe[0].name);
      S.dexUniverse[dex] = m.universe.map((u) => u.name);
      (m.marginTables || []).forEach(([id, t]) => (S.mtables[`${dex}|${id}`] = t?.marginTiers || []));
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
          mt: u.marginTableId != null ? `${dex}|${u.marginTableId}` : null,
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
  loadHip3Ctx(S.coin);
  netGood("markets");
}
/* рынки HIP-3 (io:ANTH, xyz:GOLD…): данные выбранного рынка обычным запросом,
   а не только через WebSocket — иначе без сделок в шапке была цена 0 */
function loadHip3Ctx(c) {
  const d = dexOf(c);
  d &&
    info
      .metaAndAssetCtxs({ dex: d })
      .then((r) => {
        const [o, a] = r || [];
        (o?.universe || []).forEach((l, u) => {
          a?.[u] && (S.ctx[l.name] = { ...S.ctx[l.name], ...perpCtxLite(a[u]) });
        });
        c === S.coin && renderTicker();
      })
      .catch(() => {});
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
/* Пока палец на экране или страница прокручивается, списки не перерисовываем
   (строки «Растут/Падают» прыгали под пальцем) и ставим украшения на паузу. */
var UI = { until: 0, t: 0, pending: 0 };
function uiHold() {
  UI.until = performance.now() + 700;
  UI.t || (document.body.classList.add("is-scrolling"), (UI.t = setTimeout(uiIdle, 750)));
}
function uiIdle() {
  if (performance.now() < UI.until) return void (UI.t = setTimeout(uiIdle, 200));
  UI.t = 0;
  document.body.classList.remove("is-scrolling");
  UI.pending && ((UI.pending = 0), renderAppPage());
}
["touchstart", "touchmove", "scroll", "wheel"].forEach((ev) => addEventListener(ev, uiHold, { passive: !0, capture: !0 }));
function renderAppPageLive() {
  performance.now() < UI.until ? (UI.pending = 1) : renderAppPage();
}
var ctxBatchAt = 0;
function onCtxBatch() {
  let i = Date.now();
  i - ctxBatchAt < 1e3 ||
    ((ctxBatchAt = i),
    renderTicker(),
    $("pairPop").hidden || updatePairPrices(),
    ["home", "markets"].includes(document.body.dataset.app) && renderAppPageLive(),
    document.body.dataset.view === "landing" && renderLanding());
}
async function subscribeRetry(i, t, e = 0) {
  try {
    return await t();
  } catch (n) {
    if (/Already subscribed/i.test(String(n?.message || n))) return null; /* подписка уже действует на сервере */
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
  /* нет сделок за сутки — пишем «Торгов сейчас нет», цена — справедливая */
  let nt = !Number(i.dayNtlVlm),
    e = Number(i.midPx) || Number(i.markPx) || 0,
    n = !nt && i.prevDayPx ? e / Number(i.prevDayPx) - 1 : 0;
  (($("mkPrice").textContent = fmtPx(e)),
    ($("mkPrice").className = nt ? "" : n >= 0 ? "pos" : "neg"),
    ($("mkChange").textContent = nt ? "Торгов сейчас нет" : `${n >= 0 ? "+" : ""}${(n * 100).toFixed(2)}%`),
    ($("mkChange").className = nt ? "small" : `small ${n >= 0 ? "pos" : "neg"}`),
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
  chart.subscribeCrosshairMove((p) => chartType === "original" && cvLegend(p));
  chartType === "original" && setTimeout(() => setChartView("original"), 0);
  /* догружаем историю, когда человек листает график влево почти до начала */
  chart.timeScale().subscribeVisibleLogicalRangeChange((r) => {
    r && r.from < 40 && loadOlder();
  });
}
var CHIST = { busy: !1, done: "" };
async function loadOlder() {
  const key = `${S.coin}|${S.interval}`;
  if (CHIST.busy || CHIST.done === key || !S.bars?.length || !INTERVAL_MS[S.interval]) return;
  CHIST.busy = !0;
  const coin = S.coin,
    iv = S.interval,
    first = S.bars[0].time * 1e3;
  try {
    const n = await info.candleSnapshot({ coin, interval: iv, startTime: first - INTERVAL_MS[iv] * 500, endTime: first - 1 });
    if (coin !== S.coin || iv !== S.interval || !S.bars?.length || S.bars[0].time * 1e3 !== first) return;
    const add = (n || []).filter((a) => a && a.t && a.t < first);
    if (!add.length) return void (CHIST.done = key); /* дальше истории у биржи нет */
    const ts = chart.timeScale(),
      lr = ts.getVisibleLogicalRange();
    S.bars = [...add.map(toBar), ...S.bars];
    S.vols = [...add.map(toVol), ...S.vols];
    setSeriesData();
    renderIndicators();
    drawPrimitive.refresh();
    /* оставляем на экране тот же участок, что смотрел человек */
    lr && ts.setVisibleLogicalRange({ from: lr.from + add.length, to: lr.to + add.length });
  } catch (e) {
    console.warn("[history]", e);
  } finally {
    CHIST.busy = !1;
  }
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
  $("chartEmpty") && ($("chartEmpty").hidden = !0);
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
    $("chartEmpty") && ($("chartEmpty").hidden = s.length > 0);
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
  /* Стоп и тейк из формы на графике не рисуем, пока позиции нет: они появятся
     линиями TP / SL после входа (биржа ставит их, когда ордер исполнится). */
}
var FEE_RATE = (i = S.coin) => (isSpot(i) ? HL_SPOT_TAKER : CFG.hlTakerFee) + CFG.feeTenthBps / 1e5;
/* PnL как на Hyperliquid: только разница цен × размер. Комиссии
   биржа списывает отдельно, и показываем их отдельной строкой. */
function pxPnl(i, t, e, n) {
  return (t - i) * e * (n ? 1 : -1);
}
/* Комиссии за вход и выход, $: вход лимитом — мейкер, маркетом — тейкер;
   выход по TP/SL — всегда маркет (тейкер). Ставки: Hyperliquid + Totum. */
const HL_SPOT_MAKER = 4e-4;
const MAKER_RATE = (i = S.coin) => (isSpot(i) ? HL_SPOT_MAKER : CFG.hlMakerFee) + CFG.feeTenthBps / 1e5;
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
function bindChartPick() {
  chart.subscribeClick((p) => {
    if (!S.pick || !p?.point) return;
    const px = candleSeries.coordinateToPrice(p.point.y);
    if (!(px > 0)) return;
    const k = S.pick;
    S.pick = null;
    document.querySelectorAll("[data-pick]").forEach((x) => x.classList.remove("on"));
    $("chart").classList.remove("picking");
    if (k === "px") {
      setOrderType("limit");
      $("px").value = Number(px.toFixed(pxDecimals(px)));
    } else {
      const en = planEntry();
      if (riskActive()) {
        const lg = k === "sl" ? px < en : px > en;
        lg !== (S.riskSide !== false) && ((S.riskSide = lg), (SET.riskSide = lg ? "long" : "short"), saveSettings());
      }
      setTrigField(k, px, en, planSide(en));
      S.riskAnchor = k;
    }
    updateOrderInfo();
    drawChartLines();
  });
}
function bindTpslDrag() {
  let i = $("chart"),
    t = (n) => {
      let s = null;
      for (let r of chartLines) {
        if (!["tp", "sl", "entry", "limit", "plan-sl", "plan-tp"].includes(r.kind)) continue;
        if (!S.agentExchange && !r.kind.startsWith("plan")) continue;
        let o = candleSeries.priceToCoordinate(r.price);
        /* линии стоят вплотную — сначала берём заявку, потом TP/SL, линию позиции — последней
           (раньше вместо лимитки можно было схватить позицию и случайно поставить тейк) */
        const w = Math.abs(o - n) + (r.kind === "entry" ? 5 : r.kind === "tp" || r.kind === "sl" ? 2 : 0);
        o != null &&
          Math.abs(o - n) <= 6 &&
          (!s || w < s.d) &&
          (s = {
            l: r,
            d: w,
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
        (DRAG.y0 = e(n)),
        (DRAG.moved = !1),
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
      /* пока мышь сдвинулась меньше чем на 5 px — это клик, а не перетаскивание */
      if (!DRAG.moved && Math.abs(s - DRAG.y0) < 5) return;
      DRAG.moved = !0;
      let r = candleSeries.coordinateToPrice(s);
      if (r == null) return;
      if (DRAG.active.kind === "plan-sl" || DRAG.active.kind === "plan-tp") {
        const k = DRAG.active.kind === "plan-sl" ? "sl" : "tp",
          en = planEntry(),
          v = UNITS.ord === "pct" ? +pctFromPx(k, r, { entry: en, long: planSide(en) }).toFixed(2) : Number(r.toFixed(pxDecimals(r)));
        $(k).value = v;
        S.riskAnchor = k;
        if (riskActive()) {
          const lg = k === "sl" ? r < en : r > en;
          lg !== (S.riskSide !== false) && ((S.riskSide = lg), (SET.riskSide = lg ? "long" : "short"), saveSettings());
        }
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
/* последняя свеча двигается по ленте сделок: она приходит раньше, чем поток свечей */
var TICK = { bar: null, at: 0 };
function tradeTick(list) {
  const ms = INTERVAL_MS[S.interval];
  if (!ms || !S.bars?.length || !candleSeries || !list.length) return;
  let last = S.bars.at(-1),
    fresh = !1;
  for (const tr of [...list].sort((a, b) => a.time - b.time)) {
    const px = +tr.px,
      bt = (Math.floor(tr.time / ms) * ms) / 1e3;
    if (!(px > 0) || bt < last.time) continue;
    if (bt > last.time) {
      last = { time: bt, open: px, high: px, low: px, close: px };
      S.bars.push(last);
      S.vols?.push({ time: bt, value: 0, color: "rgba(22,163,74,.35)" });
      fresh = !0;
    } else {
      last = { ...last, high: Math.max(last.high, px), low: Math.min(last.low, px), close: px };
      S.bars[S.bars.length - 1] = last;
    }
  }
  TICK.bar = last;
  TICK.at = Date.now();
  try {
    updateSeriesBar(last);
  } catch {}
  fresh ? scheduleIndicators() : scheduleIndicatorsLazy();
}
var indLazyT = 0;
/* внутри одной свечи индикаторы пересчитываем не чаще раза в 2 с — иначе график подтормаживает */
function scheduleIndicatorsLazy() {
  indLazyT || (indLazyT = setTimeout(() => ((indLazyT = 0), renderIndicators()), 2e3));
}
function onCandle(i) {
  if (!i || i.s !== S.coin || i.i !== S.interval) return;
  S.live.candle = !0;
  let t = { ...toBar(i), v: +i.v };
  /* поток свечей отстаёт от сделок: свежую цену из сделок не откатываем назад */
  if (TICK.bar && TICK.bar.time === t.time && Date.now() - TICK.at < 2500)
    t = { ...t, close: TICK.bar.close, high: Math.max(t.high, TICK.bar.high), low: Math.min(t.low, TICK.bar.low) };
  if ((updateSeriesBar(t), volSeries))
    try {
      volSeries.update(toVol(i));
    } catch {}
  if (S.vols?.length) {
    let e = toVol(i);
    S.vols.at(-1).time === e.time ? (S.vols[S.vols.length - 1] = e) : S.vols.push(e);
  }
  if (S.bars?.length) {
    const same = S.bars.at(-1).time === t.time;
    same ? (S.bars[S.bars.length - 1] = t) : S.bars.push(t);
    same ? scheduleIndicatorsLazy() : scheduleIndicators();
  }
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
  scOn() && (SC.agg === 0 && scBook(S.book), scRender());
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
  /* «Original» — наш вид свечей с объёмом; «Обычный» возвращает прежний вид */
  if (i === "original") (chartType !== "original" && ((S.prevType = chartType), setChartType("original")), (i = "candles"), (S.cvOn = 1));
  else if (i === "candles" && chartType === "original") (setChartType(S.prevType && S.prevType !== "original" ? S.prevType : "candles"), (S.cvOn = 0));
  const on = i === "candles" && chartType === "original" ? "original" : i;
  ((S.chartView = i),
    document.querySelectorAll("[data-view]").forEach((t) => t.classList.toggle("on", t.dataset.view === on)),
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
    renderTrades(),
    scTrades(t),
    cvDeltaAdd(t),
    tradeTick(t));
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
  scOn() && scOpen();
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
        n.coin === S.coin && ((S.live.book = !0), (S.bookAt = Date.now()), onBook(n.levels));
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
    i && i.coin === S.coin && ((S.bookAt = Date.now()), onBook(i.levels));
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
/* Telegram: модуль WalletConnect открывает кошелёк «в новой вкладке» (ссылка okx://main/…),
   и Telegram оставлял пустую белую вкладку «main». Открываем приложение кошелька прямо
   с этой страницы; если за 1,5 с оно не открылось — как раньше, новой вкладкой. */
function tgOpenFix() {
  const tg = !!(window.TelegramWebviewProxy || window.TelegramWebviewProxyProto || window.Telegram);
  if (!tg || window.__tgOpenFix) return;
  window.__tgOpenFix = 1;
  const orig = window.open.bind(window);
  window.open = (url, target, feat) => {
    const u = String(url || "");
    if (!/^[a-z][a-z0-9+.-]*:/i.test(u) || /^(https?|about|blob|data|javascript):/i.test(u)) return orig(url, target, feat);
    let left = !1;
    const off = () => (left = !0);
    addEventListener("blur", off, { once: !0 });
    document.addEventListener("visibilitychange", off, { once: !0 });
    try {
      location.href = u;
    } catch {}
    setTimeout(() => {
      removeEventListener("blur", off);
      left || document.hidden || orig(url, target, feat);
    }, 1500);
    return null;
  };
}
async function initWalletConnect() {
  tgOpenFix();
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
/* Окно «ждём подпись»: подпись часто «не приходит», потому что запрос уже в
   кошельке, а человек его не видит. При входе по QR-коду запрос уходит в
   приложение на телефоне без уведомления — его надо открыть самому. */
function signWait(wc) {
  let d = $("signWait");
  d || ((d = document.createElement("div")), (d.id = "signWait"), (d.className = "sign-wait"), document.body.appendChild(d));
  let cancel = null;
  const t0 = Date.now();
  d.innerHTML = `<div class="sw-box"><div class="sw-ic"><i></i></div><b>Подтвердите в кошельке</b><p>${
    wc
      ? isPhone()
        ? "Сейчас откроется приложение кошелька. Если не открылось — откройте его сами: запрос подписи уже там."
        : "Запрос подписи отправлен в кошелёк на телефоне. Откройте приложение кошелька (например, OKX) — уведомления может не быть, запрос ждёт внутри."
      : isPhone()
        ? "Окно подписи откроется в кошельке поверх страницы. Проверьте и подтвердите."
        : "Откройте окно кошелька: значок расширения в правом верхнем углу браузера (иногда окно открывается за этой вкладкой)."
  }</p><small id="swT">0:00</small><button type="button" class="btn ghost" id="swCancel">Отмена</button></div>`;
  d.hidden = !1;
  const iv = setInterval(() => {
    const s = Math.floor((Date.now() - t0) / 1e3);
    $("swT") && ($("swT").textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`);
  }, 1e3);
  const p = new Promise((_, rej) => (cancel = () => rej(new Error("user rejected: отменено"))));
  $("swCancel").onclick = () => cancel();
  return { p, done: () => (clearInterval(iv), (d.hidden = !0)) };
}
function wcSigner(p, wc = !0) {
  return {
    on: (...a) => p.on?.(...a),
    removeListener: (...a) => p.removeListener?.(...a),
    request: async (args) => {
      if (!WC_SIGN.includes(args?.method) || args?.method === "wallet_switchEthereumChain") return p.request(args);
      wc && (await wcEnsureRelay());
      const req = p.request(args),
        w = signWait(wc);
      wc && isPhone() && setTimeout(wcOpenWallet, 400);
      let timer;
      const slow = new Promise((_, rej) => {
        timer = setTimeout(() => rej(new Error("wallet-timeout")), 120e3);
      });
      const t0 = performance.now();
      try {
        return await Promise.race([req, slow, w.p]);
      } finally {
        /* сколько кошелёк держал подпись — видно в консоли (F12), для разбора «долго» */
        console.info(`[подпись] ${args.method}: ${((performance.now() - t0) / 1e3).toFixed(1)} с`);
        clearTimeout(timer);
        w.done();
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
    (connSave(null),
      (S.provider = null),
      (S.user = null),
      ($("btnShare").hidden = !0),
      (S.userExchange = null),
      (S.agent = null),
      (S.agentExchange = null),
      document.body.classList.remove("connected", "ready"),
      ($("btnConnect").textContent = "Подключить кошелёк"),
      ($("btnConnect").dataset.label = "Подключить кошелёк"),
      toast("Кошелёк отключён", "info"));
  }
}
/* Подключение. Есть расширение кошелька (OKX, MetaMask, Rabby) — работаем через
   него напрямую: быстрее и без сервера WalletConnect, который у части людей рвётся.
   Нет расширения (телефон) — WalletConnect. silent — тихое восстановление после
   обновления страницы: без окон, только если кошелёк уже разрешил этот сайт. */
const CONN_KEY = "totum.conn";
const connSave = (v) => {
  try {
    v ? localStorage.setItem(CONN_KEY, JSON.stringify(v)) : localStorage.removeItem(CONN_KEY);
  } catch {}
};
/* Выбор кошелька. В браузере может стоять несколько расширений (OKX, MetaMask,
   Phantom…), и window.ethereum часто «захватывает» не тот — отсюда «Unexpected
   error». Поэтому показываем список найденных кошельков (EIP-6963) и вариант
   «Кошелёк на телефоне (QR-код)». Выбор запоминаем. */
const injById = (rdns) => PROVIDERS.find((p) => p.info?.rdns === rdns)?.provider || null;
function pickWallet() {
  const list = PROVIDERS.filter((p) => p.provider && p.info?.name),
    hasWc = !!WC_PROJECT_ID;
  if (!list.length && !window.ethereum) return Promise.resolve(hasWc ? { wc: !0 } : null);
  return new Promise((res) => {
    let d = $("walletPick");
    d || ((d = document.createElement("dialog")), (d.id = "walletPick"), (d.className = "wp-dlg"), document.body.appendChild(d));
    const items = list.length ? list.map((p, k) => `<button type="button" data-wp="${k}"><img src="${esc(p.info.icon || "")}" alt="">${esc(p.info.name)}</button>`).join("") : '<button type="button" data-wp="eth"><span class="wp-ic">⬡</span>Кошелёк в браузере</button>';
    d.innerHTML = `<h3>Подключить кошелёк</h3>${items}${hasWc ? '<button type="button" data-wp="wc"><span class="wp-ic">⌁</span>Кошелёк на телефоне (QR-код)</button>' : ""}<button type="button" class="wp-cancel" data-wp="x">Отмена</button>`;
    const done = (v) => (d.close(), res(v));
    d.querySelectorAll("[data-wp]").forEach(
      (b) =>
        (b.onclick = () => {
          const k = b.dataset.wp;
          k === "x" ? done(null) : k === "wc" ? done({ wc: !0 }) : k === "eth" ? done({ prov: window.ethereum, rdns: "" }) : done({ prov: list[Number(k)].provider, rdns: list[Number(k)].info.rdns || "" });
        }),
    );
    d.onclose = () => res(null);
    d.showModal();
  });
}
async function connectWallet(silent = !1) {
  let i = $("btnConnect"),
    t = window.ethereum,
    e = S.provider;
  if (silent) {
    let saved = null;
    try {
      saved = JSON.parse(localStorage.getItem(CONN_KEY) || "null");
    } catch {}
    if (!saved) return;
    if (saved.via === "inj") {
      await new Promise((r) => setTimeout(r, 300)); /* кошельки успевают объявить себя */
      const pv = (saved.rdns && injById(saved.rdns)) || t;
      if (!pv) return;
      const acc = await pv.request({ method: "eth_accounts" }).catch(() => []);
      if (!acc?.length || acc[0].toLowerCase() !== String(saved.addr || "").toLowerCase()) return;
      e = pv;
      S.rdns = saved.rdns || "";
    } else {
      if (!WC_PROJECT_ID) return;
      const wc = await preloadWalletConnect().catch(() => null);
      if (!wc?.session || !wc.accounts?.length) return;
      e = wc;
    }
  }
  if (!e && !silent && !(USER_CFG.debug && t)) {
    const ch = await pickWallet();
    if (!ch) return;
    ch.prov ? ((e = ch.prov), (S.rdns = ch.rdns)) : (t = null);
  }
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
      transport: custom(e === wcProvider ? wcSigner(e) : USER_CFG.debug ? e : wcSigner(e, !1)),
    });
    ((S.userExchange = new ExchangeClient({
      transport: transport,
      wallet: s,
    })),
      await restoreAgent(),
      (i.dataset.label = short(S.user)),
      document.body.classList.add("connected"),
      ($("btnShare").hidden = !1),
      connSave({ via: e === wcProvider ? "wc" : "inj", addr: S.user, rdns: S.rdns || "" }),
      await refreshStatus(),
      startLoop(),
      autoEnable());
  } catch (n) {
    silent
      ? console.warn("[кошелёк] не восстановили подключение", n?.message || n)
      : /reject|denied|cancel/i.test(String(n?.message || n))
        ? toast("Подключение отменено в кошельке", "info")
        : (toast(`${humanError(n)} Если не выходит — выберите «Кошелёк на телефоне (QR-код)».`, "err"), (S.provider = null));
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
    /* Встроенный браузер (например, в Telegram) не дал зашифрованное хранилище.
       Ключ агента не может выводить деньги — только торговать, поэтому
       сохраняем его как есть, чтобы не просить подпись при каждом входе. */
    try {
      localStorage.setItem(agentStoreKey(), JSON.stringify({ pk: i, validUntil: t }));
      return;
    } catch {}
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
    if (i.pk) return i.pk;
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
    (S.agentExchange = safeOrders(
      new ExchangeClient({
        transport: transport,
        wallet: S.agent,
      }),
    )));
}
async function refreshStatus(retry = 1) {
  if (S.user) {
    S.statusOk = !1;
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
      S.statusOk = !0;
    } catch (i) {
      netBad(i);
      /* не узнали состояние — пробуем ещё раз, а не просим лишние подписи */
      if (retry > 0) return (await new Promise((r) => setTimeout(r, 1500)), refreshStatus(retry - 1));
    }
    (updateSetupUI(), document.body.classList.toggle("unified", isUnified()), await refreshAccount(), ensureUnified());
  }
}
/* Единый счёт: один баланс USDC на фьючерсы, все площадки HIP-3 и спот.
   Включаем сами ключом агента (без подписи в кошельке). Если не вышло — кнопка с одной подписью. */
async function ensureUnified(viaWallet = !1) {
  /* кошелёк кассы Totum держим в обычном режиме: Hyperliquid засчитывает строителю
     только фьючерсный счёт (≥ 100 USDC), единый счёт ломает приём комиссии */
  if (isBuilderUser()) return void document.body.classList.remove("need-unified");
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
    ($("btnEnable").disabled = !isAddress(CFG.builder) || !S.user || S.enabling),
    ($("setupState").textContent = isAddress(CFG.builder)
      ? i && !S.agentOk
        ? "Осталась одна подпись"
        : ""
      : "В config.js не указан адрес строителя"));
}
/* Почему нужна подпись, хотя кошелёк уже подключён. Подключение даёт сайту
   только адрес — подписывать он ничего не может. Hyperliquid принимает ордер
   лишь с подписью, поэтому один раз кошелёк выдаёт сайту ключ для сделок
   (и разрешает комиссию Totum — так требует биржа). Дальше сделки идут без
   окон в кошельке. Ключ живёт 180 дней — максимум, который даёт Hyperliquid. */
const AGENT_DAYS = 179;
function deviceTag() {
  try {
    let d = localStorage.getItem("totum.dev");
    d || ((d = Math.random().toString(36).slice(2, 6)), localStorage.setItem("totum.dev", d));
    return d;
  } catch {
    return "web";
  }
}
/* Hyperliquid даёт до 3 именованных ключей на аккаунт. Своё имя устройства;
   если мест нет — заменяем самый старый ключ Totum. */
async function agentNameFor() {
  const mine = `${CFG.agentName} ${deviceTag()}`;
  try {
    const list = (await info.extraAgents({ user: S.user })) || [];
    if (list.some((a) => a.name === mine) || list.filter((a) => a.name).length < 3) return mine;
    const old = list.filter((a) => (a.name || "").startsWith(CFG.agentName)).sort((a, b) => (a.validUntil || 0) - (b.validUntil || 0))[0];
    return old ? old.name : mine;
  } catch {
    return mine;
  }
}
async function enableTrading() {
  if (S.enabling) return;
  S.enabling = !0;
  try {
    localStorage.setItem("totum.consent", "1");
  } catch {}
  let i = $("btnEnable");
  try {
    if (
      (S.approvedFee < CFG.feeTenthBps &&
        (setBusy(i, !0, "Подпись 1 из 2 в кошельке…"),
        await S.userExchange.approveBuilderFee({ maxFeeRate: FEE_PCT, builder: CFG.builder }).catch(async (err) => {
          await new Promise((r) => setTimeout(r, 2e3));
          const f = Number(await info.maxBuilderFee({ user: S.user, builder: CFG.builder }).catch(() => 0));
          if (f < CFG.feeTenthBps) throw err;
        }),
        (S.approvedFee = CFG.feeTenthBps),
        setBusy(i, !1)),
      !S.agentOk)
    ) {
      setBusy(i, !0, "Подпись 2 из 2 в кошельке…");
      let t = generatePrivateKey(),
        e = privateKeyToAccount(t),
        n = Date.now() + AGENT_DAYS * 864e5;
      const nm = `${await agentNameFor()} valid_until ${n}`;
      try {
        await S.userExchange.approveAgent({ agentAddress: e.address, agentName: nm });
      } catch (err) {
        /* кошелёк подписал, но ответ биржи не дошёл (медленная связь) — проверяем,
           принят ли ключ на самом деле, прежде чем показывать ошибку */
        await new Promise((r) => setTimeout(r, 2e3));
        const list = (await info.extraAgents({ user: S.user }).catch(() => [])) || [];
        if (!list.some((a) => a.address?.toLowerCase() === e.address.toLowerCase())) throw err;
      }
      (await saveAgent(t, n),
        (S.agent = e),
        (S.agentExchange = safeOrders(
          new ExchangeClient({
            transport: transport,
            wallet: e,
          }),
        )));
    }
    (toast("Готово — можно торговать. Следующие сделки без подписей в кошельке", "ok"), await refreshStatus());
  } catch (t) {
    toast(humanError(t), "err");
  } finally {
    ((S.enabling = !1), setBusy(i, !1), updateSetupUI());
  }
}
/* Сразу после подключения: если торговля ещё не включена — просим подпись сами,
   без отдельной кнопки и галочки */
function autoEnable() {
  if (!S.user || !isAddress(CFG.builder) || S.enabling) return;
  if (!S.statusOk) return void toast("Биржа отвечает медленно. Нажмите «Включить торговлю», когда связь наладится.", "info");
  if (S.approvedFee >= CFG.feeTenthBps && S.agentOk) return;
  toast("Подтвердите в кошельке доступ к сделкам — это один раз, дальше без подписей", "info");
  enableTrading();
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
const SPOT_ICON = { UFART: "FARTCOIN", HPENGU: "PENGU", FXRP: "XRP", ONEAR: "NEAR", USDT0: "USDT", KHYPE: "HYPE" };
function spotIconName(t) {
  if (!ICON_LOCAL) return null;
  const c = [SPOT_ICON[t], t.replace(/^U(?=[A-Z0-9]{2})/, ""), t.replace(/\d+$/, ""), t.replace(/^EQ(?=[A-Z])/, ""), t.replace(/X$/, "")];
  for (const x of c) if (x && x !== t && ICON_LOCAL.has(x)) return x;
  /* токены акций (NVDAX, EQGOOG) — иконка с площадки акций HIP-3 */
  for (const x of c.slice(3)) {
    if (!x || x.length < 2) continue;
    for (const n of ICON_LOCAL) if (n.endsWith(`:${x}`)) return n;
  }
  return null;
}
var ICON_LOCAL = null,
  iconsReady = fetch("icons.json")
    .then((i) => (i.ok ? i.json() : null))
    .then((i) => {
      i && Array.isArray(i.names) && i.names.length && (ICON_LOCAL = new Set(i.names));
    })
    .catch(() => {}),
  /* у каждой монеты свой цвет аватарки (по названию) — пока иконка грузится и если её нет нигде */
  icHue = (t) => {
    let h = 0;
    for (const c of String(t)) h = (h * 31 + c.charCodeAt(0)) % 360;
    return h;
  },
  coinIcon = (i) => coinIcon0(i).replaceAll('<span class="coin-ic"', `<span class="coin-ic" style="--h:${icHue(baseOf(i))}"`),
  coinIcon0 = (i) => {
    let t = baseOf(i),
      e = esc(t.replace(/^k(?=[A-Z])/, "").replace(/^U(?=[A-Z]{3})/, "").slice(0, 2));
    /* HIP-3: иконка лежит под полным именем «биржа:монета» (файл xyz__GOLD.svg) */
    if (i && String(i).includes(":"))
      return ICON_LOCAL && ICON_LOCAL.has(i)
        ? `<span class="coin-ic" data-letter="${e}"><img alt="" decoding="async" src="icons/${encodeURIComponent(i.replace(":", "__"))}.svg"></span>`
        : ICON_FAIL.has(i)
          ? `<span class="coin-ic">${e}</span>`
          : `<span class="coin-ic" data-letter="${e}" data-name="${esc(i)}"><img alt="" loading="lazy" decoding="async" src="${ICON_CDN}${encodeURIComponent(i)}.svg"></span>`;
    return ICON_LOCAL
      ? ICON_LOCAL.has(t)
        ? `<span class="coin-ic" data-letter="${e}"><img alt="" decoding="async" src="icons/${encodeURIComponent(t)}.svg"></span>`
        : /* спот-токен: сначала иконка той же монеты с фьючерсов (UBTC → BTC) */
          isSpot(i) && spotIconName(t)
          ? `<span class="coin-ic" data-letter="${e}"><img alt="" decoding="async" src="icons/${encodeURIComponent(spotIconName(t).replace(":", "__"))}.svg"></span>`
          : /* иначе иконка спота прямо у Hyperliquid, потом буква */
          isSpot(i) && !ICON_FAIL.has(`${t}_spot`)
          ? `<span class="coin-ic" data-letter="${e}" data-name="${esc(t)}_spot"><img alt="" loading="lazy" decoding="async" src="${ICON_CDN}${encodeURIComponent(t)}_spot.svg"></span>`
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
  /* на споте вместо «Позиций» — «Активы»: монеты на балансе с прибылью/убытком */
  {
    const on = document.querySelector(".b-tabs [data-b].on")?.dataset.b;
    isSpot() && on === "pos" && document.querySelector('.b-tabs [data-b="spot"]')?.click();
    !isSpot() && on === "spot" && document.querySelector('.b-tabs [data-b="pos"]')?.click();
  }
  let i = $("pairIc");
  ((i.outerHTML = coinIcon(S.coin).replace('class="coin-ic"', 'class="coin-ic" id="pairIc"')), fixIcons($("pairBtn")));
}
/* Разделы рынков: Все · Фьючерсы · Спот · Крипто · Традфи (RWA) · HIP-3 · В тренде */
const MK_TABS = ["all", "perp", "spot", "crypto", "tradfi", "hip3", "trend"];
/* площадки HIP-3 с залогом USDe повторяют обычные рынки (тот же BTC, ETH…) — не показываем */
const isUsdeDex = (m) => !!m.dex && /^USDE/i.test(collName(m));
function marketsFor(mk) {
  const M = S.meta.filter((m) => !isUsdeDex(m));
  if (mk === "spot") return S.spot;
  if (mk === "perp") return M;
  if (mk === "crypto") return M.filter((m) => m.group === "crypto");
  if (mk === "tradfi") return M.filter((m) => m.group === "tradfi");
  if (mk === "hip3") return M.filter((m) => m.dex);
  return [...M, ...S.spot]; // all, trend
}
/* поиск по-человечески: ANTH находит Anthropic, «золото» — GOLD/XAU и т. п. */
const SEARCH_ALIAS = [
  [/ANTH/, "ANTHROPIC АНТРОПИК"],
  [/OAI|OPENAI/, "OPENAI ОПЕНАИ"],
  [/GOLD|XAU/, "GOLD XAU ЗОЛОТО"],
  [/SILVER|XAG/, "SILVER XAG СЕРЕБРО"],
  [/OIL|WTI|BRENT/, "OIL НЕФТЬ"],
  [/TSLA/, "TESLA ТЕСЛА"],
  [/NVDA/, "NVIDIA"],
  [/SPX|SP500/, "SP500 S&P"],
];
const searchText = (r) => {
  const n = `${r.label} ${r.name}`.toUpperCase();
  return n + " " + SEARCH_ALIAS.filter(([re]) => re.test(n)).map(([, a]) => a).join(" ");
};
function pairRows(i = PP) {
  let t = i,
    e = t.q.trim().toUpperCase(),
    n = marketsFor(e ? "all" : t.mk).map((r) => {
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
  (e && (n = n.filter((r) => searchText(r).includes(e))),
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
      .forEach((s) => s.setStretchFactor(IND.vol && s === chart.panes()[1] ? 0.22 : 0.3));
    /* доли, а не пиксели: на телефоне график маленький, и объём на 80 px съедал свечи целиком */
    chart.panes()[0]?.setStretchFactor(1);
  } catch {}
}
/* меню над графиком рисуем поверх страницы (position: fixed): полоса инструментов
   прокручивается и обрезала всё, что ниже неё, — меню было не видно */
function placeMenu(btn, menu) {
  if (menu.hidden) return;
  const r = btn.getBoundingClientRect(),
    w = menu.offsetWidth || 220;
  menu.style.position = "fixed";
  menu.style.top = `${Math.round(r.bottom + 6)}px`;
  menu.style.left = `${Math.round(Math.max(8, Math.min(r.left, innerWidth - w - 8)))}px`;
  menu.style.right = "auto";
  menu.style.zIndex = "60";
  menu.style.maxHeight = `${Math.max(160, innerHeight - r.bottom - 20)}px`;
  menu.style.overflowY = "auto";
}
addEventListener("resize", () => document.querySelectorAll(".chart-bar .dd-menu").forEach((m) => (m.hidden = !0)));
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
      placeMenu($("indBtn"), $("indMenu"));
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
    original: "Original — объём в свече",
  },
  chartType = "candles";
try {
  chartType = localStorage.getItem("totum.ctype") || "candles";
} catch {}
CHART_TYPES[chartType] || (chartType = "candles");
var UP_COLOR = "#16a34a",
  DOWN_COLOR = "#e11d48";
/* ═══════════ График Original: объём виден в каждой свече ═══════════
   Ширина и яркость свечи — от её объёма (широкая и яркая — торговали много, узкая и
   тусклая — почти не торговали). Под свечой — полоска «покупки / продажи» по живым
   сделкам (собирается, пока открыт сайт). Точка над свечой — всплеск объёма. */
var CV = { delta: new Map() };
function cvDeltaAdd(list) {
  const ms = INTERVAL_MS[S.interval];
  if (!ms) return;
  for (const t of list) {
    const bt = (Math.floor(t.time / ms) * ms) / 1e3,
      usd = +t.px * +t.sz,
      o = CV.delta.get(bt) || { b: 0, s: 0, n: 0 };
    t.side === "B" ? (o.b += usd) : (o.s += usd);
    o.n++;
    CV.delta.set(bt, o);
  }
  CV.delta.size > 3e3 && CV.delta.delete(CV.delta.keys().next().value);
}
const cvCompact = (v) => (v >= 1e9 ? `${(v / 1e9).toFixed(1)}B` : v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(v >= 1e4 ? 0 : 1)}K` : v.toFixed(0));
class CvRenderer {
  draw(target, conv) {
    const d = this.d;
    if (!d?.visibleRange || !d.bars.length) return;
    target.useBitmapCoordinateSpace(({ context: c, horizontalPixelRatio: hr, verticalPixelRatio: vr }) => {
      const { from, to } = d.visibleRange,
        vis = d.bars.slice(Math.max(0, from), Math.min(d.bars.length, to + 1));
      if (!vis.length) return;
      const vols = vis.map((b) => b.originalData.usd || 0),
        mx = Math.max(...vols, 1),
        avg = vols.reduce((a, v) => a + v, 0) / vols.length || 1,
        sp = d.barSpacing * (d.conflationFactor || 1),
        up = this.o.upColor,
        dn = this.o.downColor;
      c.save();
      for (const b of vis) {
        const o = b.originalData,
          v = o.usd || 0,
          rel = Math.sqrt(v / mx),
          w = Math.max(1, Math.min(sp * 0.92, sp * (0.22 + 0.7 * rel))) * hr,
          x = Math.round(b.x * hr),
          yo = conv(o.open) * vr,
          yc = conv(o.close) * vr,
          yh = conv(o.high) * vr,
          yl = conv(o.low) * vr,
          isUp = o.close >= o.open,
          a = Math.max(0.28, Math.min(1, 0.3 + 0.7 * (v / (avg * 1.6))));
        if ([yo, yc, yh, yl].some((y) => !Number.isFinite(y))) continue;
        c.globalAlpha = a;
        c.fillStyle = c.strokeStyle = isUp ? up : dn;
        c.fillRect(x - Math.max(1, hr) / 2, Math.min(yh, yl), Math.max(1, hr), Math.abs(yl - yh));
        const top = Math.min(yo, yc),
          h = Math.max(Math.abs(yc - yo), 1 * vr);
        c.fillRect(x - w / 2, top, w, h);
        c.globalAlpha = 1;
        /* покупки / продажи под свечой */
        const dl = CV.delta.get(o.time);
        if (dl && dl.b + dl.s > 0 && sp > 4) {
          const bw = Math.max(w, 3 * hr),
            yb = yl + 4 * vr,
            fb = dl.b / (dl.b + dl.s);
          c.fillStyle = up;
          c.fillRect(x - bw / 2, yb, bw * fb, 3 * vr);
          c.fillStyle = dn;
          c.fillRect(x - bw / 2 + bw * fb, yb, bw * (1 - fb), 3 * vr);
        }
        /* всплеск объёма */
        if (v > avg * 2.6) {
          const r = Math.max(2, Math.min(4, sp / 6)) * hr;
          c.fillStyle = isUp ? up : dn;
          c.globalAlpha = 0.25;
          c.beginPath();
          c.arc(x, yh - 9 * vr, r * 2.2, 0, Math.PI * 2);
          c.fill();
          c.globalAlpha = 1;
          c.beginPath();
          c.arc(x, yh - 9 * vr, r, 0, Math.PI * 2);
          c.fill();
        }
        /* сумма объёма — когда свечи крупные */
        if (sp >= 30 && v > 0) {
          c.font = `${10 * vr}px "Manrope",system-ui,sans-serif`;
          c.textAlign = "center";
          c.fillStyle = this.o.textColor;
          c.fillText(`$${cvCompact(v)}`, x, yh - (v > avg * 2.6 ? 18 : 6) * vr);
        }
      }
      c.restore();
    });
  }
}
class CvView {
  constructor() {
    this.r = new CvRenderer();
  }
  renderer() {
    return this.r;
  }
  update(d, o) {
    this.r.d = d;
    this.r.o = o;
  }
  priceValueBuilder(b) {
    return [b.low, b.high, b.close];
  }
  isWhitespace(b) {
    return b.close === void 0;
  }
  defaultOptions() {
    return { upColor: UP_COLOR, downColor: DOWN_COLOR, textColor: "rgba(148,163,184,.9)", priceLineVisible: !0, lastValueVisible: !0, color: UP_COLOR };
  }
}
const cvRow = (b, v) => ({ ...b, usd: (v ?? 0) * ((b.high + b.low) / 2) });
function cvVolOf(t) {
  const v = S.vols?.length && S.vols.at(-1).time === t ? S.vols.at(-1) : S.vols?.find((x) => x.time === t);
  return v ? v.value : 0;
}
/* подсказка над графиком: объём, покупки/продажи, число сделок */
function cvLegend(p) {
  let el = $("cvLegend");
  if (chartType !== "original") return el && (el.hidden = !0);
  el || ((el = document.createElement("div")), (el.id = "cvLegend"), (el.className = "cv-legend"), $("chart").appendChild(el));
  const b = p?.time ? S.bars?.find((x) => x.time === p.time) : S.bars?.at(-1);
  if (!b) return void (el.hidden = !0);
  const v = cvVolOf(b.time) * ((b.high + b.low) / 2),
    dl = CV.delta.get(b.time),
    ch = (b.close / b.open - 1) * 100;
  el.hidden = !1;
  el.innerHTML = `<b class="${ch >= 0 ? "pos" : "neg"}">${ch >= 0 ? "+" : ""}${ch.toFixed(2)}%</b><span>Объём <b>$${cvCompact(v)}</b></span>${
    dl ? `<span>Покупки <b class="pos">$${cvCompact(dl.b)}</b></span><span>Продажи <b class="neg">$${cvCompact(dl.s)}</b></span><span>Сделок <b>${dl.n}</b></span>` : '<span class="muted">покупки/продажи появятся по живым сделкам</span>'
  }`;
}
function createMainSeries() {
  let i = {
    priceLineVisible: !0,
    lastValueVisible: !0,
  };
  if (chartType === "original") {
    candleSeries = chart.addCustomSeries(new CvView(), { ...i, upColor: UP_COLOR, downColor: DOWN_COLOR });
    S.priceFormat && candleSeries.applyOptions({ priceFormat: S.priceFormat });
    try {
      candleSeries.attachPrimitive(drawPrimitive);
    } catch {}
    return void cvLegend();
  }
  $("cvLegend") && ($("cvLegend").hidden = !0);
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
  if (chartType === "original") {
    const vm = new Map((S.vols || []).map((v) => [v.time, v.value]));
    return i.map((b) => cvRow(b, vm.get(b.time)));
  }
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
      const buy = g.side === "B";
      return {
        time: g.time,
        position: buy ? "atPriceBottom" : "atPriceTop",
        price: g.ntl / g.sz,
        shape: buy ? "arrowUp" : "arrowDown",
        color: buy ? UP_COLOR : DOWN_COLOR,
        text: buy ? "Buy" : "Sell",
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
  if (chartType === "original") return candleSeries.update(cvRow(i, i.v ?? cvVolOf(i.time))), cvLegend();
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
      /* при замене основной серии библиотека сдвигала панель объёма на место цены — перестраиваем панели сразу */
      renderIndicators(),
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
      placeMenu($("ctypeBtn"), $("ctypeMenu"));
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
      (["home", "assets"].includes(document.body.dataset.app) && renderAppPageLive(),
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
      /* связь подвела — не ждём следующего круга (10 с), пробуем ещё раз через 2 с */
      i.retried || setTimeout(() => refreshAccount({ ...i, retried: !0 }), 2e3);
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
  checkAdlAlerts();
}
/* Предупреждение об ADL: уровень 4–5 из 5 («высокий» — по нашей оценке это
   примерно 70% и выше). Один раз на позицию и уровень за 30 минут:
   уведомление на сайте, звук и системное уведомление, если разрешено. */
const ADL_SEEN = {};
function checkAdlAlerts() {
  if (SET.adlAlert === !1) return;
  for (const p of S.positions || []) {
    const r = adlRisk(p);
    if (!r || r.level < 4) continue;
    const k = `${p.coin}|${r.level}`;
    if (ADL_SEEN[k] && Date.now() - ADL_SEEN[k] < 30 * 6e4) continue;
    ADL_SEEN[k] = Date.now();
    const txt = `${pairLabel(p.coin)}: риск ADL ${ADL_TEXT[r.level]} — позиция может закрыться автоматически. Проверьте её.`;
    adlToast(p.coin, txt);
    try {
      SET.sound !== !1 && new Audio("sounds/sell.mp3").play().catch(() => {});
    } catch {}
    try {
      "Notification" in window && Notification.permission === "granted" && document.visibilityState !== "visible" && new Notification("Totum · риск ADL", { body: txt, icon: "icon.png", tag: `adl-${p.coin}` });
    } catch {}
  }
}
function adlToast(coin, txt) {
  const e = document.createElement("div");
  e.className = "toast err adl-toast";
  e.innerHTML = `<b>⚠ Риск ADL</b><span>${esc(txt)}</span><button type="button">Подробнее</button>`;
  e.querySelector("button").onclick = () => (openAdlInfo(coin), e.remove());
  $("toasts").appendChild(e);
  setTimeout(() => e.remove(), 2e4);
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
        exitLabel: "Маркировочная цена",
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
        <button class="btn small ghost" data-reverse ${t(s)} title="Закрыть и открыть в обратную сторону">Разворот</button>
        <button class="btn small ghost" data-be="${esc(s.p.coin)}" title="Стоп в безубыток с учётом комиссий и проскальзывания">Б/У</button></div></td></tr>`,
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
        ${n("Маркировочная цена", s.c ? fmtPx(s.c.markPx) : "—")}
        ${n("Расч. цена ликв.", s.p.liquidationPx ? fmtPx(s.p.liquidationPx) : "—", "warn")}
        ${n("Риск ADL", `${adlBadge(s.p)} <small>${ADL_TEXT[adlRisk(s.p)?.level || 0] || ""}</small>`)}
        ${n("Реализ. PnL (USDC)", s.real === void 0 ? "…" : sgnUsd(s.real), clsOf(s.real ?? 0))}
        ${n("Фандинг: начисл. / след.", `${s.acc === void 0 ? "…" : sgnUsd(s.acc)} / ${sgnUsd(s.next)}`)}
        ${n("TP / SL", `<span class="pos">${s.tpsl.tp ? fmtPx(s.tpsl.tp.triggerPx) : "--"}</span> / <span class="neg">${s.tpsl.sl ? fmtPx(s.tpsl.sl.triggerPx) : "--"}</span>`)}
      </div>
      <div class="pc-actions">
        <button class="btn small ghost" data-tpsl="${esc(s.p.coin)}">TP/SL</button>
        <button class="btn small ghost" data-reverse ${t(s)}>Разворот</button>
        <button class="btn small ghost" data-be="${esc(s.p.coin)}">Б/У</button>
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
  /* Спот и фьючерсы — разные наборы вкладок, как на MEXC: у спота нет позиций и фандинга */
  OP.kind = isSpot() ? "spot" : "perp";
  document.querySelectorAll("#opTabs .op-perp").forEach((b) => (b.hidden = OP.kind === "spot"));
  document.querySelectorAll("#opTabs .op-spot").forEach((b) => (b.hidden = OP.kind !== "spot"));
  $("opTitle").textContent = OP.kind === "spot" ? "Спот · ордера" : "Фьючерсы · ордера";
  const ok = OP.kind === "spot" ? ["open", "sorders", "strades"] : ["open", "pos", "fills", "funding", "builder"];
  (($("opBuilderTab").hidden = OP.kind === "spot" || !isBuilderUser()),
    setOpTab(ok.includes(i || OP.tab) ? i || OP.tab : "open"),
    $("ordersPage").open || $("ordersPage").showModal());
}
function setOpTab(i) {
  ((OP.tab = i),
    document.querySelectorAll("[data-op]").forEach((t) => t.classList.toggle("on", t.dataset.op === i)),
    loadOpTab());
}
var isSpotName = (c) => !!mkt(c)?.spot || /^@|\//.test(String(c || "")),
  opFilter = (i) => (OP.kind === "spot") === isSpotName(i) && (OP.filter === "all" || i === S.coin),
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
    if (i === "sorders" || i === "strades") return loadSpotTab(i);
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
/* ═══════════ Баланс: график и PnL за период ═══════════
   Источник — portfolio Hyperliquid: история стоимости счёта и PnL
   за день / неделю / месяц / всё время. Рисуем SVG — карточка
   перерисовывается каждую секунду, и SVG это переносит легко. */
const PF_WIN = [
  ["day", "1Д", "за день"],
  ["week", "7Д", "за неделю"],
  ["month", "30Д", "за месяц"],
  ["allTime", "Всё", "за всё время"],
];
try {
  S.pfWin = localStorage.getItem("totum.pfwin") || "day";
} catch {
  S.pfWin = "day";
}
async function loadPortfolio(force = !1) {
  if (!S.user || (!force && S.pfAt && Date.now() - S.pfAt < 6e4)) return;
  S.pfAt = Date.now();
  try {
    const r = await info.portfolio({ user: S.user });
    S.portfolio = Object.fromEntries(r || []);
    appRenderT = 0;
    renderAppPage();
  } catch (e) {
    console.warn("[portfolio]", e?.message || e);
  }
}
function heroSpark(pts, up) {
  if (pts.length < 2) return '<div class="hc-spark empty"></div>';
  const W = 320,
    H = 64,
    xs = pts.map((p) => p[0]),
    ys = pts.map((p) => p[1]),
    x0 = Math.min(...xs),
    x1 = Math.max(...xs),
    y0 = Math.min(...ys),
    y1 = Math.max(...ys),
    sx = (x) => ((x - x0) / (x1 - x0 || 1)) * W,
    sy = (y) => H - 4 - ((y - y0) / (y1 - y0 || 1)) * (H - 8),
    line = pts.map((p, k) => `${k ? "L" : "M"}${sx(p[0]).toFixed(1)},${sy(p[1]).toFixed(1)}`).join(""),
    c = up ? "#4ade80" : "#fb7185";
  return `<svg class="hc-spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
    <defs><linearGradient id="hcg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c}" stop-opacity=".45"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></linearGradient></defs>
    <path d="${line}L${W},${H}L0,${H}Z" fill="url(#hcg)"/><path d="${line}" fill="none" stroke="${c}" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg>`;
}
function heroPnl() {
  loadPortfolio();
  const w = S.portfolio?.[S.pfWin],
    av = (w?.accountValueHistory || []).map(([t, v]) => [t, Number(v)]),
    ph = w?.pnlHistory || [],
    pnl = ph.length ? Number(ph.at(-1)[1]) - Number(ph[0][1]) : 0,
    base = av.find((p) => p[1] > 0)?.[1] || 0,
    pc = base ? (pnl / base) * 100 : 0,
    lbl = PF_WIN.find((x) => x[0] === S.pfWin)?.[2] || "";
  return `<div class="hc-pnl ${pnl >= 0 ? "up" : "down"}">PnL ${lbl} <b>${w ? `${pnl >= 0 ? "+" : "−"}${usd(Math.abs(pnl))}` : "…"}</b>${base ? `<i>${pnl >= 0 ? "+" : "−"}${Math.abs(pc).toFixed(2)}%</i>` : ""}</div>
    ${w ? heroSpark(ph.map(([t, v]) => [t, Number(v)]), pnl >= 0) : '<div class="hc-spark empty"></div>'}
    <div class="hc-row"><div class="hc-wins">${PF_WIN.map(([k, l]) => `<button type="button" data-pfwin="${k}" class="${k === S.pfWin ? "on" : ""}">${l}</button>`).join("")}</div>
    <button type="button" class="hc-cal" data-act="calendar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>Календарь PnL</button></div>`;
}
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-pfwin]");
  if (!b) return;
  S.pfWin = b.dataset.pfwin;
  try {
    localStorage.setItem("totum.pfwin", S.pfWin);
  } catch {}
  appRenderT = 0;
  renderAppPage();
});

/* ═══════════ Календарь PnL ═══════════
   PnL дня = закрытые сделки (closedPnl) − комиссии + фандинг, по местному времени.
   Открытые позиции в календарь не входят, как в календарях PnL на биржах. */
const CAL = { y: 0, m: 0, sel: null, pick: null, days: {}, loaded: {}, busy: !1 };
const MONTHS = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
const MONTHS_G = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const keyDate = (k) => {
  const [y, m, d] = k.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const fmtDay = (d) => `${d.getDate()} ${MONTHS_G[d.getMonth()]}`;
async function calLoad(from, to) {
  /* грузим по месяцам, каждый месяц один раз (текущий — раз в минуту) */
  const jobs = [];
  for (let d = new Date(from.getFullYear(), from.getMonth(), 1); d <= to; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
    const mk = `${d.getFullYear()}-${d.getMonth()}`,
      cur = d.getFullYear() === new Date().getFullYear() && d.getMonth() === new Date().getMonth();
    if (CAL.loaded[mk] && (!cur || Date.now() - CAL.loaded[mk] < 6e4)) continue;
    jobs.push(calLoadMonth(d.getFullYear(), d.getMonth()).then(() => (CAL.loaded[mk] = Date.now())));
  }
  await Promise.all(jobs);
}
async function calLoadMonth(y, m) {
  const start = new Date(y, m, 1).getTime(),
    end = new Date(y, m + 1, 1).getTime() - 1;
  const days = {};
  const add = (t, k, v) => {
    const key = dayKey(new Date(t));
    const d = (days[key] = days[key] || { pnl: 0, fee: 0, fund: 0, n: 0 });
    d[k] += v;
  };
  let st = start;
  for (let n = 0; n < 10; n++) {
    const f = (await info.userFillsByTime({ user: S.user, startTime: st, endTime: end, aggregateByTime: !0 })) || [];
    for (const x of f) {
      add(x.time, "pnl", Number(x.closedPnl || 0));
      add(x.time, "fee", Number(x.fee || 0));
      Number(x.closedPnl) !== 0 && add(x.time, "n", 1);
    }
    if (f.length < 2000) break;
    st = f.at(-1).time + 1;
  }
  st = start;
  for (let n = 0; n < 10; n++) {
    const f = (await info.userFunding({ user: S.user, startTime: st, endTime: end })) || [];
    for (const x of f) add(x.time, "fund", Number(x.delta?.usdc || 0));
    if (f.length < 500) break;
    st = f.at(-1).time + 1;
  }
  for (const k of Object.keys(CAL.days)) {
    const d = keyDate(k);
    d.getFullYear() === y && d.getMonth() === m && delete CAL.days[k];
  }
  for (const [k, v] of Object.entries(days)) CAL.days[k] = { ...v, net: v.pnl - v.fee + v.fund };
}
function calSum(a, b) {
  const r = { net: 0, pnl: 0, fee: 0, fund: 0, n: 0, win: 0, loss: 0, best: null, worst: null };
  for (let d = new Date(a); d <= b; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    const v = CAL.days[dayKey(d)];
    if (!v) continue;
    for (const k of ["net", "pnl", "fee", "fund", "n"]) r[k] += v[k];
    v.net > 0 && r.win++;
    v.net < 0 && r.loss++;
    (!r.best || v.net > r.best.v) && (r.best = { d: new Date(d), v: v.net });
    (!r.worst || v.net < r.worst.v) && (r.worst = { d: new Date(d), v: v.net });
  }
  return r;
}
function calPreset(k) {
  const t = new Date(),
    d0 = new Date(t.getFullYear(), t.getMonth(), t.getDate()),
    wd = (d0.getDay() + 6) % 7,
    sh = (n) => new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() + n);
  const map = {
    today: [d0, d0],
    yday: [sh(-1), sh(-1)],
    week: [sh(-wd), d0],
    pweek: [sh(-wd - 7), sh(-wd - 1)],
    month: [new Date(d0.getFullYear(), d0.getMonth(), 1), d0],
    pmonth: [new Date(d0.getFullYear(), d0.getMonth() - 1, 1), new Date(d0.getFullYear(), d0.getMonth(), 0)],
  };
  if (k === "custom") {
    CAL.sel = null;
    CAL.pick = "start";
    CAL.preset = "custom";
    return renderCal();
  }
  CAL.sel = map[k];
  CAL.preset = k;
  CAL.pick = null;
  CAL.y = CAL.sel[1].getFullYear();
  CAL.m = CAL.sel[1].getMonth();
  renderCal();
}
function openCalendar() {
  if (!S.user) return toast("Подключите кошелёк, чтобы видеть свой PnL", "info");
  const t = new Date();
  CAL.y = t.getFullYear();
  CAL.m = t.getMonth();
  $("calDialog").open || $("calDialog").showModal();
  calPreset("month");
}
async function renderCal() {
  const box = $("calBody"),
    first = new Date(CAL.y, CAL.m, 1),
    last = new Date(CAL.y, CAL.m + 1, 0),
    today = dayKey(new Date());
  const selA = CAL.sel?.[0],
    selB = CAL.sel?.[1];
  const draw = () => {
    const ms = calSum(first, last),
      lead = (first.getDay() + 6) % 7,
      cells = [];
    const maxAbs = Math.max(1e-9, ...Object.entries(CAL.days).filter(([k]) => k.startsWith(`${CAL.y}-${String(CAL.m + 1).padStart(2, "0")}`)).map(([, v]) => Math.abs(v.net)));
    for (let k = 0; k < lead; k++) cells.push('<div class="cal-c pad"></div>');
    for (let d = 1; d <= last.getDate(); d++) {
      const dt = new Date(CAL.y, CAL.m, d),
        key = dayKey(dt),
        v = CAL.days[key],
        inSel = selA && dt >= selA && dt <= (selB || selA),
        edge = selA && (key === dayKey(selA) || (selB && key === dayKey(selB))),
        fut = key > today,
        a = v ? Math.min(1, Math.abs(v.net) / maxAbs) : 0;
      cells.push(
        `<button type="button" class="cal-c${v ? (v.net >= 0 ? " up" : " down") : ""}${inSel ? " sel" : ""}${edge ? " edge" : ""}${key === today ? " today" : ""}${fut ? " fut" : ""}" data-day="${key}" style="--a:${(0.12 + a * 0.5).toFixed(2)}" ${fut ? "disabled" : ""}><span>${d}</span>${v ? `<b>${v.net >= 0 ? "+" : "−"}${compactUsd(Math.abs(v.net))}</b>` : ""}</button>`,
      );
    }
    const ss = selA && CAL.pick !== "end" ? calSum(selA, selB || selA) : null,
      selLbl = selA ? (selB && dayKey(selB) !== dayKey(selA) ? `${fmtDay(selA)} — ${fmtDay(selB)}` : fmtDay(selA)) : "";
    box.innerHTML = `
      <div class="cal-presets">${[["today", "Сегодня"], ["yday", "Вчера"], ["week", "Эта неделя"], ["pweek", "Прошлая неделя"], ["month", "Этот месяц"], ["pmonth", "Прошлый месяц"], ["custom", "Свой период"]]
        .map(([k, l]) => `<button type="button" data-calp="${k}" class="${CAL.preset === k ? "on" : ""}">${l}</button>`)
        .join("")}</div>
      ${
        ss
          ? `<section class="cal-sum ${ss.net >= 0 ? "up" : "down"}">
        <div class="cal-sum-h"><span>PnL · ${selLbl}</span><b>${ss.net >= 0 ? "+" : "−"}${usd(Math.abs(ss.net))}</b></div>
        <div class="cal-sum-g">
          <div><span>Сделки</span><b>${sgnUsd(ss.pnl)}</b></div>
          <div><span>Комиссии</span><b>−${usd(ss.fee)}</b></div>
          <div><span>Фандинг</span><b>${sgnUsd(ss.fund)}</b></div>
          <div><span>Дни в плюс / минус</span><b>${ss.win} / ${ss.loss}</b></div>
        </div></section>`
          : `<section class="cal-sum pick"><b>${CAL.pick === "end" ? `Начало: ${fmtDay(selA)}. Теперь нажмите последний день периода` : "Нажмите первый день периода"}</b></section>`
      }
      <div class="cal-nav"><button type="button" data-calm="-1" aria-label="Предыдущий месяц">‹</button><b>${MONTHS[CAL.m]} ${CAL.y}</b><span class="${ms.net >= 0 ? "pos" : "neg"}">${ms.net >= 0 ? "+" : "−"}${usd(Math.abs(ms.net))}</span><button type="button" data-calm="1" aria-label="Следующий месяц" ${CAL.y === new Date().getFullYear() && CAL.m === new Date().getMonth() ? "disabled" : ""}>›</button></div>
      <div class="cal-grid">${["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((w) => `<div class="cal-w">${w}</div>`).join("")}${cells.join("")}</div>
      ${CAL.busy ? '<p class="muted small cal-load">Загружаем сделки…</p>' : ""}
      <div class="cal-best">${ms.best ? `<div><span>Лучший день месяца</span><b class="pos">${fmtDay(ms.best.d)} · ${sgnUsd(ms.best.v)}</b></div>` : ""}${ms.worst && ms.worst.v < 0 ? `<div><span>Худший день месяца</span><b class="neg">${fmtDay(ms.worst.d)} · ${sgnUsd(ms.worst.v)}</b></div>` : ""}</div>
      <p class="inf-note">PnL дня — закрытые сделки, минус комиссии, плюс фандинг, по вашему местному времени. Открытые позиции не входят, пока не закрыты. Нажмите день, чтобы увидеть его итог, или выберите «Свой период».</p>`;
    box.querySelectorAll("[data-calp]").forEach((b) => (b.onclick = () => calPreset(b.dataset.calp)));
    box.querySelectorAll("[data-calm]").forEach(
      (b) =>
        (b.onclick = () => {
          const d = new Date(CAL.y, CAL.m + Number(b.dataset.calm), 1);
          CAL.y = d.getFullYear();
          CAL.m = d.getMonth();
          renderCal();
        }),
    );
    box.querySelectorAll("[data-day]").forEach(
      (b) =>
        (b.onclick = () => {
          const d = keyDate(b.dataset.day);
          if (CAL.pick === "start") {
            CAL.sel = [d, null];
            CAL.pick = "end";
          } else if (CAL.pick === "end") {
            const a = CAL.sel[0];
            CAL.sel = d < a ? [d, a] : [a, d];
            CAL.pick = null;
          } else {
            CAL.sel = [d, d];
            CAL.preset = "";
          }
          renderCal();
        }),
    );
  };
  draw();
  const from = new Date(Math.min(first, selA || first)),
    to = new Date(Math.max(last, selB || selA || last));
  CAL.busy = !0;
  try {
    await calLoad(from, to);
  } catch (e) {
    toast("Не удалось загрузить историю сделок. Попробуйте ещё раз.", "err");
  }
  CAL.busy = !1;
  $("calDialog").open && draw();
}
const compactUsd = (v) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e4 ? `${(v / 1e3).toFixed(0)}K` : v >= 1e3 ? `${(v / 1e3).toFixed(1)}K` : v >= 100 ? v.toFixed(0) : v.toFixed(2)).replace(".", ",");
/* ═══════════ Спот: история ордеров и сделок ═══════════
   PnL по споту считаем только для монет, купленных И проданных через Totum
   (у таких сделок есть комиссия нашего строителя). Себестоимость — средняя
   цена покупок через Totum; продажа в другом месте уменьшает остаток без PnL. */
function spotPnlByOrder(fills) {
  const lots = {},
    byOid = {};
  for (const f of fills.slice().sort((a, b) => a.time - b.time)) {
    if (!isSpotName(f.coin)) continue;
    const m = mkt(f.coin),
      base = m?.base || "",
      sz = Number(f.sz),
      px = Number(f.px),
      fee = Number(f.fee || 0),
      ours = viaTotum(f),
      L = (lots[f.coin] = lots[f.coin] || { q: 0, c: 0 });
    if (f.side === "B") {
      if (!ours) continue;
      L.q += sz - (f.feeToken === base ? fee : 0);
      L.c += sz * px + (f.feeToken === "USDC" ? fee : 0);
    } else {
      const q = Math.min(sz, L.q);
      if (q <= 0) continue;
      const avg = L.c / L.q;
      if (ours) {
        const o = (byOid[f.oid] = byOid[f.oid] || { q: 0, cost: 0, proceeds: 0, fee: 0 });
        o.q += q;
        o.cost += q * avg;
        o.proceeds += q * px;
        o.fee += f.feeToken === "USDC" ? fee * (q / sz) : 0;
      }
      L.c -= q * avg;
      L.q -= q;
    }
  }
  for (const o of Object.values(byOid)) {
    o.avg = o.cost / o.q;
    o.exit = o.proceeds / o.q;
    o.pnl = o.proceeds - o.cost - o.fee;
  }
  return byOid;
}
async function loadSpotTab(tab) {
  const t = $("opList"),
    e = $("opNote");
  const fills = ((await info.userFills({ user: S.user })) || []).slice();
  const mine = fills.filter((f) => opFilter(f.coin));
  if (tab === "strades") {
    e.textContent = "Каждое исполнение по споту: цена, количество и комиссия.";
    t.innerHTML =
      mine
        .sort((a, b) => b.time - a.time)
        .slice(0, 300)
        .map((f) => {
          const m = mkt(f.coin),
            buy = f.side === "B";
          return `<article class="op-card st-row"><header>${coinIcon(f.coin)}<b class="pair">${esc(pairLabel(f.coin))}</b><span class="tag ${buy ? "pos" : "neg"}">${buy ? "Покупка" : "Продажа"}</span><span class="when">${fmtTime(f.time)}</span></header>
          <div class="op-grid" style="margin-top:10px">${kvOp("Цена", fmtPx(Number(f.px)))}${kvOp("Количество", `${num(Number(f.sz), 6)} ${esc(m?.base || "")}`)}${kvOp("Сумма", `${num(Number(f.sz) * Number(f.px), 2)} USDC`)}${kvOp("Роль", f.crossed ? "тейкер" : "мейкер")}${kvOp("Комиссия", `${num(Number(f.fee || 0), 6)} ${esc(f.feeToken || "")}`)}</div></article>`;
        })
        .join("") || opEmpty("Сделок по споту пока нет");
    return fixIcons(t);
  }
  e.textContent = "Ордера по споту. PnL показывается у продаж монет, которые вы купили через Totum.";
  const pnl = spotPnlByOrder(fills),
    by = new Map();
  for (const f of mine) {
    const o = by.get(f.oid) || { ...f, sz: 0, ntl: 0, fee: 0, taker: !1 };
    o.sz += Number(f.sz);
    o.ntl += Number(f.sz) * Number(f.px);
    o.fee += Number(f.fee || 0);
    o.taker = o.taker || f.crossed;
    o.time = Math.max(o.time, f.time);
    by.set(f.oid, o);
  }
  const rows = [...by.values()].sort((a, b) => b.time - a.time).slice(0, 200);
  t.innerHTML =
    rows
      .map((o) => {
        const m = mkt(o.coin),
          buy = o.side === "B",
          px = o.ntl / o.sz,
          r = !buy && pnl[o.oid];
        let share = "";
        if (r) {
          OP.share.push({
            coin: o.coin,
            long: !0,
            sideLabel: "Спот",
            lev: null,
            entry: r.avg,
            exit: r.exit,
            time: o.time,
            pnl: r.pnl,
            pnlLabel: "Прибыль с комиссиями",
            pct: (r.pnl / r.cost) * 100,
            pctLabel: "Доходность",
          });
          share = `<button class="share-btn" type="button" data-share="${OP.share.length - 1}">${SHARE_IC}PnL</button>`;
        }
        return `<article class="op-card ${r ? (r.pnl >= 0 ? "win" : "loss") : ""}">
        <header>${coinIcon(o.coin)}<b class="pair">${esc(pairLabel(o.coin))}</b><span class="tag ${buy ? "pos" : "neg"}">${buy ? "Покупка" : "Продажа"}</span><span class="when">${fmtTime(o.time)}</span></header>
        ${r ? `<div class="op-hero"><div><div class="lbl">Прибыль с комиссиями</div><div class="val ${clsOf(r.pnl)}">${sgnUsd(r.pnl)}</div></div><div class="pctv">${sgnNum((r.pnl / r.cost) * 100)}<div class="lbl">доходность</div></div></div>` : '<div style="height:12px"></div>'}
        <div class="op-grid">${kvOp("Сумма", `${num(o.ntl, 2)} USDC`)}${kvOp("Количество", `${num(o.sz, 6)} ${esc(m?.base || "")}`)}${kvOp("Цена исполнения", fmtPx(px))}
          ${r ? kvOp("Средняя цена покупки", fmtPx(r.avg)) : ""}${kvOp("Исполнение", o.taker ? "по рынку" : "лимит (мейкер)")}${kvOp("Комиссия", `${num(o.fee, 6)} ${esc(o.feeToken || "")}`)}</div>
        <div class="op-foot"><span class="muted">Исполнен</span>${share}</div></article>`;
      })
      .join("") || opEmpty("Ордеров по споту пока нет");
  fixIcons(t);
}
/* ═══════════ История счёта ═══════════
   Анимированная линия стоимости счёта (рисуется слева направо) и список
   пополнений, выводов, переводов и наград из журнала Hyperliquid. */
const AH = { win: "month" };
function openAccHist() {
  if (!S.user) return toast("Подключите кошелёк", "info");
  $("histDialog").open || $("histDialog").showModal();
  renderAccHist();
}
function ledgerRow(x) {
  const d = x.delta || {},
    me = S.user?.toLowerCase();
  let title = "",
    amt = 0,
    note = "";
  switch (d.type) {
    case "deposit":
      (title = "Пополнение"), (amt = Number(d.usdc));
      break;
    case "withdraw":
      (title = "Вывод"), (amt = -Number(d.usdc)), (note = d.fee ? `комиссия ${usd(Number(d.fee))}` : "");
      break;
    case "rewardsClaim":
      (title = "Награды Hyperliquid"), (amt = Number(d.amount));
      break;
    case "accountClassTransfer":
      (title = d.toPerp ? "Перевод: спот → фьючерсы" : "Перевод: фьючерсы → спот"), (note = usd(Number(d.usdc)));
      break;
    case "send":
    case "spotTransfer": {
      const from = String(d.user || "").toLowerCase(),
        to = String(d.destination || "").toLowerCase(),
        v = Number(d.usdcValue || d.amount || 0);
      if (from === me && to === me) (title = "Перевод между счетами"), (note = `${num(Number(d.amount), 4)} ${esc(d.token || "")}`);
      else if (from === me) (title = "Отправка"), (amt = -v), (note = `на ${short(d.destination)}`);
      else (title = "Получено"), (amt = v), (note = `от ${short(d.user)}`);
      break;
    }
    case "internalTransfer":
      title = String(d.destination || "").toLowerCase() === me ? "Получено" : "Отправка";
      amt = (title === "Получено" ? 1 : -1) * Number(d.usdc);
      break;
    default:
      title = d.type || "Операция";
  }
  return { time: x.time, title, amt, note };
}
async function renderAccHist() {
  const box = $("accHistBody");
  S.portfolio || (await loadPortfolio(!0));
  const w = S.portfolio?.[AH.win],
    av = (w?.accountValueHistory || []).map(([t, v]) => [t, Number(v)]).filter((p) => p[1] > 0 || w.accountValueHistory.length < 3);
  const first = av[0]?.[1] || 0,
    last = av.at(-1)?.[1] || totalEquity(),
    ch = last - first;
  const W = 640,
    H = 220,
    P = 8;
  let svg = '<div class="ah-empty">История появится после первых операций</div>';
  if (av.length > 1) {
    const xs = av.map((p) => p[0]),
      ys = av.map((p) => p[1]),
      x0 = Math.min(...xs),
      x1 = Math.max(...xs),
      y0 = Math.min(...ys),
      y1 = Math.max(...ys),
      sx = (x) => P + ((x - x0) / (x1 - x0 || 1)) * (W - 2 * P),
      sy = (y) => H - P - ((y - y0) / (y1 - y0 || 1)) * (H - 2 * P),
      line = av.map((p, k) => `${k ? "L" : "M"}${sx(p[0]).toFixed(1)},${sy(p[1]).toFixed(1)}`).join(""),
      d0 = (t) => new Date(t).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
    svg = `<div class="ah-chart"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
      <defs><linearGradient id="ahg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--accent)" stop-opacity=".35"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>
      <path class="ah-area" d="${line}L${sx(x1)},${H}L${sx(x0)},${H}Z" fill="url(#ahg)"/>
      <path class="ah-line" d="${line}" pathLength="1000" fill="none" stroke="var(--accent)" stroke-width="2.5" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round"/>
      <circle class="ah-dot" cx="${sx(x1)}" cy="${sy(av.at(-1)[1])}" r="5" fill="var(--accent)"/></svg>
      <div class="ah-y"><span>${usd(y1)}</span><span>${usd(y0)}</span></div>
      <div class="ah-x"><span>${d0(x0)}</span><span>${d0((x0 + x1) / 2)}</span><span>${d0(x1)}</span></div></div>`;
  }
  box.innerHTML = `
    <div class="ah-head"><div><span>Стоимость счёта</span><b>${usd(last)}</b><i class="${clsOf(ch)}">${ch >= 0 ? "+" : "−"}${usd(Math.abs(ch))} за период</i></div>
      <div class="hc-wins ah-wins">${[["week", "7Д"], ["month", "30Д"], ["allTime", "Всё"]].map(([k, l]) => `<button type="button" data-ahw="${k}" class="${k === AH.win ? "on" : ""}">${l}</button>`).join("")}</div></div>
    ${svg}
    <p class="inf-note">Линия — сколько всего было на счёте: пополнения и выводы тоже её двигают. Результат торговли — в календаре PnL.</p>
    <div class="ah-list" id="ahList"><p class="muted small">Загружаем операции…</p></div>`;
  box.querySelectorAll("[data-ahw]").forEach((b) => (b.onclick = () => ((AH.win = b.dataset.ahw), renderAccHist())));
  try {
    const rows = ((await info.userNonFundingLedgerUpdates({ user: S.user, startTime: 0 })) || []).map(ledgerRow).sort((a, b) => b.time - a.time);
    const el = $("ahList");
    el &&
      (el.innerHTML =
        rows
          .slice(0, 200)
          .map(
            (r) =>
              `<div class="ah-row"><div><b>${r.title}</b><span>${fmtTime(r.time)}${r.note ? ` · ${r.note}` : ""}</span></div>${r.amt ? `<em class="${clsOf(r.amt)}">${r.amt >= 0 ? "+" : "−"}${usd(Math.abs(r.amt))}</em>` : ""}</div>`,
          )
          .join("") || '<p class="muted small">Пополнений и выводов пока не было</p>');
  } catch {
    $("ahList") && ($("ahList").innerHTML = '<p class="muted small">Не удалось загрузить операции</p>');
  }
}
/* ═══════════ Инструменты: связки Totum ↔ биржа ═══════════
   Данные основной сети собирает наш сервер (/api/funding) с 16 площадок.
   Показываем только связки с Totum: у монеты на Totum и на другой бирже —
   цены (и индекс), ставки фандинга, спред цены и спред ставки. По кнопке
   графика — история спреда и ставок обеих сторон (/api/pair). Годовых нет. */
const TL = { page: 0, ps: 50, sk: null, sd: -1, tab: "funding", data: null, at: 0, busy: !1, norm: 1, q: "", minVol: 0, off: new Set(), timer: null, open: null, days: 2, hist: {} };
try {
  const z = JSON.parse(localStorage.getItem("totum.tools") || "{}");
  z.norm && (TL.norm = z.norm);
  z.v === 2 && z.minVol != null && (TL.minVol = z.minVol); /* раньше по умолчанию был фильтр $1M — он прятал связки */
  z.ps && (TL.ps = z.ps);
  z.off && (TL.off = new Set(z.off));
  z.tab && (TL.tab = z.tab);
} catch {}
const tlSave = () => {
  try {
    localStorage.setItem("totum.tools", JSON.stringify({ v: 2, norm: TL.norm, minVol: TL.minVol, off: [...TL.off], tab: TL.tab, ps: TL.ps }));
  } catch {}
};
async function loadTools(force) {
  if (TL.busy || (!force && TL.data && Date.now() - TL.at < 9e3)) return;
  TL.busy = !0;
  try {
    const r = await fetch("/api/funding", { cache: "no-store" });
    if (!r.ok) throw new Error(r.status);
    TL.data = await r.json();
    TL.at = Date.now();
    TL.err = "";
  } catch {
    TL.err = "Не удалось загрузить данные бирж. Попробуем ещё раз через минуту.";
  }
  TL.busy = !1;
  document.body.dataset.cp === "tools" && renderTools();
}
const tlRate = (r) => (r.rate / (r.ih || 1)) * TL.norm;
const tlPct = (x, d = 4) => `${x > 0 ? "+" : x < 0 ? "−" : ""}${Math.abs(x * 100).toFixed(d)}%`;
const tlPx = (p) => (p > 0 ? Number(p.toPrecision(6)).toLocaleString("ru-RU", { maximumSignificantDigits: 6 }) : "—");
const tlLeft = (t) => {
  if (!t) return "";
  const s = Math.max(0, Math.floor((t - Date.now()) / 1e3));
  return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};
const tlVName = (id) => (TL.data?.venues || []).find((v) => v.id === id)?.name || id;
/* связки: монета на Totum × каждая другая биржа */
function tlPairs() {
  const T = new Map(),
    by = new Map();
  for (const r of TL.data?.rows || []) {
    if (r.v === "hyperliquid") T.has(r.base) ? T.get(r.base).push(r) : T.set(r.base, [r]); /* у монеты может быть несколько рынков Totum (основной и HIP-3) */
    else {
      if (TL.off.has(r.v)) continue;
      const k = `${r.base}|${r.v}`,
        o = by.get(k);
      (!o || (r.vol || 0) > (o.vol || 0)) && by.set(k, r);
    }
  }
  const cnt = {},
    out = [];
  for (const x of by.values()) {
    const ts = T.get(x.base);
    if (!ts) continue;
    if (TL.minVol && x.vol != null && x.vol < TL.minVol) continue;
    for (const t of ts) {
      const tp = t.mark / (t.mult || 1),
        xp = x.mark / (x.mult || 1);
      if (!(tp > 0 && xp > 0)) continue;
      const ps = xp / tp - 1;
      if (Math.abs(ps) > 0.3) continue; /* скорее всего разные монеты или разная шкала цены */
      cnt[t.sym] = (cnt[t.sym] || 0) + 1;
      out.push({ coin: t.sym, base: x.base, t, x, tp, xp, ps, fs: tlRate(x) - tlRate(t) });
    }
  }
  out.forEach((r) => (r.n = cnt[r.coin] + 1));
  return out;
}
function renderTools(open) {
  const body = $("tlBody");
  if (!body) return;
  open && (clearInterval(TL.timer), (TL.timer = setInterval(() => (document.body.dataset.cp === "tools" ? loadTools() : clearInterval(TL.timer)), 1e4)));
  document.querySelectorAll("#tlTabs [data-tl]").forEach((b) => {
    b.classList.toggle("on", b.dataset.tl === TL.tab);
    b.onclick = () => ((TL.tab = b.dataset.tl), (TL.open = null), tlSave(), renderTools());
  });
  if (!TL.data) {
    loadTools(!0);
    body.innerHTML = `<div class="tl-empty">${TL.err || "Собираем данные с бирж…"}</div>`;
    return;
  }
  loadTools();
  const V = (TL.data.venues || []).filter((v) => v.id !== "hyperliquid"),
    q = TL.q.trim().toUpperCase();
  let rows = tlPairs().filter((r) => !q || r.base.includes(q) || r.coin.toUpperCase().includes(q));
  /* сортировка: по умолчанию — самые большие разницы по модулю; нажатие на заголовок —
     по убыванию, повторное — по возрастанию */
  const SV = { coin: (r) => r.base, ps: (r) => r.ps, tr: (r) => tlRate(r.t), xr: (r) => tlRate(r.x), fs: (r) => r.fs, vol: (r) => r.x.vol ?? -1 };
  if (TL.sk && SV[TL.sk]) {
    const f = SV[TL.sk];
    rows.sort((a, c) => (TL.sk === "coin" ? a.base.localeCompare(c.base) * TL.sd : (f(c) - f(a)) * -TL.sd));
  } else rows.sort((a, c) => (TL.tab === "arb" ? Math.abs(c.ps) - Math.abs(a.ps) : Math.abs(c.fs) - Math.abs(a.fs)));
  const total = rows.length,
    pages = Math.max(1, Math.ceil(total / TL.ps));
  TL.page = Math.min(TL.page, pages - 1);
  rows = rows.slice(TL.page * TL.ps, (TL.page + 1) * TL.ps);
  const ctrl = `<div class="tl-ctrl">
      <input class="tl-q" type="search" placeholder="Монета, например BTC" value="${esc(TL.q)}" id="tlQ">
      <div class="tl-seg"><button type="button" data-tlnorm="1" class="${TL.norm === 1 ? "on" : ""}">ставка за 1 ч</button><button type="button" data-tlnorm="8" class="${TL.norm === 8 ? "on" : ""}">за 8 ч</button></div>
      <label class="tl-sel">Объём биржи от <select id="tlVol">${[[0, "любой"], [1e5, "$100K"], [1e6, "$1M"], [1e7, "$10M"]].map(([v, l]) => `<option value="${v}" ${TL.minVol === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>
      <span class="tl-upd">${TL.busy ? "обновляем…" : `обновлено ${new Date(TL.at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`}</span>
    </div>
    <div class="tl-venues">${V.map((v) => `<button type="button" data-tlv="${v.id}" class="${TL.off.has(v.id) ? "" : "on"} ${v.ok ? "" : "bad"}" title="${v.ok ? `${v.n} рынков` : `нет данных: ${esc(v.err || "")}`}"><i class="${v.type}"></i>${esc(v.name)}</button>`).join("")}</div>`;
  const N = TL.norm === 1 ? "1 ч" : "8 ч";
  const line = (r) => {
    const key = `${r.coin}|${r.x.v}`,
      xn = esc(tlVName(r.x.v)),
      fIdea = r.fs > 0 ? `Лонг <b>Totum</b> · шорт <b>${xn}</b>` : `Шорт <b>Totum</b> · лонг <b>${xn}</b>`,
      pIdea = r.ps > 0 ? `Лонг <b>Totum</b> · шорт <b>${xn}</b>` : `Шорт <b>Totum</b> · лонг <b>${xn}</b>`,
      warn = TL.tab === "funding" && Math.abs(r.ps) > Math.abs(r.fs / TL.norm) * 24 ? `<i class="tl-warn" title="Разница в цене больше, чем фандинг даст за сутки — можно потерять на цене">!</i>` : "";
    return `<tr class="${TL.open === key ? "open" : ""}">
      <td><div class="tl-c">${coinIcon(r.coin)}<div><button type="button" class="tl-coin" data-tlcoin="${esc(r.coin)}">${esc(r.base)}${r.coin.includes(":") ? ` · ${esc(r.coin.split(":")[0])}` : ""}</button><small>${r.n} бирж</small></div></div></td>
      <td class="tl-v"><b>${vAva("hyperliquid")}Totum</b><b>${vAva(r.x.v)}${xn}</b></td>
      <td class="fr"><span>${tlPx(r.tp)}<em>инд. ${tlPx((r.t.idx || 0) / (r.t.mult || 1))}</em></span><span>${tlPx(r.xp)}<em>инд. ${tlPx((r.x.idx || 0) / (r.x.mult || 1))}</em></span></td>
      <td class="spr ${TL.tab === "arb" ? "main" : ""} ${r.ps >= 0 ? "pos" : "neg"}">${r.ps >= 0 ? "+" : "−"}${Math.abs(r.ps * 100).toFixed(2)}%</td>
      <td class="fr"><span class="${r.t.rate > 0 ? "pos" : r.t.rate < 0 ? "neg" : ""}">${tlPct(tlRate(r.t))}<em>${r.t.ih} ч · ${tlLeft(r.t.next)}</em></span><span class="${r.x.rate > 0 ? "pos" : r.x.rate < 0 ? "neg" : ""}">${tlPct(tlRate(r.x))}<em>${r.x.ih} ч${r.x.next ? ` · ${tlLeft(r.x.next)}` : ""}</em></span></td>
      <td class="spr ${TL.tab === "funding" ? "main" : ""}" title="Ставка биржи минус ставка Totum">${tlPct(r.fs)}${warn}</td>
      <td>${r.x.vol != null ? compact(r.x.vol) : "—"}</td>
      <td class="idea">${TL.tab === "arb" ? pIdea : fIdea}</td>
      <td><button type="button" class="tl-chart-btn" data-tlopen="${esc(key)}" title="Открыть связку: график спреда, вход и выход, фандинг, стаканы">📈</button></td></tr>`;
  };
  const ar = (k) => (TL.sk === k ? `<i class="tl-arr">${TL.sd < 0 ? "↓" : "↑"}</i>` : '<i class="tl-arr off">↕</i>'),
    th = (k, l, extra = "") => `<button type="button" class="tl-sort ${TL.sk === k ? "on" : ""}" data-tlsk="${k}" title="Сортировать: по убыванию / по возрастанию">${l}${ar(k)}</button>${extra}`,
    dflt = !TL.sk;
  const html = `<div class="tl-wrap"><table class="tl-table bundles"><thead><tr><th>${th("coin", "Монета")}</th><th>Связка</th><th>Цена</th><th class="${dflt && TL.tab === "arb" ? "on" : ""}">${th("ps", "Спред цены")}</th><th>Фандинг за ${N}<div class="tl-sub">${th("tr", "Totum")}${th("xr", "биржа")}</div></th><th class="${dflt && TL.tab === "funding" ? "on" : ""}">${th("fs", "Спред фандинга")}</th><th>${th("vol", "Объём биржи")}</th><th>Идея</th><th>${TL.sk ? '<button type="button" class="tl-sort reset" data-tlsk="" title="Сбросить сортировку">✕</button>' : ""}</th></tr></thead><tbody>
      ${rows.map(line).join("") || '<tr><td colspan="9" class="na">Ничего не нашли</td></tr>'}</tbody></table></div>
    <div class="tl-pager"><span>Показано ${total ? TL.page * TL.ps + 1 : 0}–${Math.min(total, (TL.page + 1) * TL.ps)} из ${total} связок</span>
      <span class="tl-pg"><button type="button" data-tlpg="-1" ${TL.page ? "" : "disabled"}>‹</button><b>${TL.page + 1} / ${pages}</b><button type="button" data-tlpg="1" ${TL.page < pages - 1 ? "" : "disabled"}>›</button></span>
      <label class="tl-sel">На странице <select id="tlPs">${[25, 50, 100, 200].map((n) => `<option value="${n}" ${TL.ps === n ? "selected" : ""}>${n}</option>`).join("")}</select></label></div>
    <p class="inf-note">${
      TL.tab === "funding"
        ? `Связки Totum с другими биржами по разнице ставок. Ставка приведена к ${N}; под ней — период выплаты биржи и время до выплаты. Идея: на одной бирже лонг, на другой шорт на ту же сумму — получаете разницу ставок. Знак «!» — разница в цене больше, чем фандинг принесёт за сутки: можно потерять на цене.`
        : "Связки Totum с другими биржами по разнице цен (за одну монету). Идея: купить там, где дешевле, продать там, где дороже, и закрыть обе позиции, когда цены сойдутся. Учитывайте комиссии и проскальзывание."
    }</p>`;
  const qFocus = document.activeElement?.id === "tlQ",
    pos = qFocus ? document.activeElement.selectionStart : 0,
    sx = body.querySelector(".tl-wrap")?.scrollLeft || 0,
    sy = body.querySelector(".tl-wrap")?.scrollTop || 0;
  body.innerHTML = ctrl + html;
  fixIcons(body);
  if (qFocus) {
    const qi = $("tlQ");
    qi.focus();
    qi.setSelectionRange(pos, pos);
  }
  const w = body.querySelector(".tl-wrap");
  w && ((w.scrollLeft = sx), (w.scrollTop = sy));
  $("tlQ").oninput = (e) => ((TL.q = e.target.value), (TL.page = 0), renderTools());
  $("tlVol").onchange = (e) => ((TL.minVol = Number(e.target.value)), (TL.page = 0), tlSave(), renderTools());
  $("tlPs").onchange = (e) => ((TL.ps = Number(e.target.value)), (TL.page = 0), tlSave(), renderTools());
  body.querySelectorAll("[data-tlpg]").forEach((b) => (b.onclick = () => ((TL.page += Number(b.dataset.tlpg)), (TL.open = null), renderTools(), body.querySelector(".tl-wrap") && (body.querySelector(".tl-wrap").scrollTop = 0))));
  body.querySelectorAll("[data-tlnorm]").forEach((b) => (b.onclick = () => ((TL.norm = Number(b.dataset.tlnorm)), tlSave(), renderTools())));
  body.querySelectorAll("[data-tlv]").forEach(
    (b) =>
      (b.onclick = () => {
        const id = b.dataset.tlv;
        TL.page = 0;
        TL.off.has(id) ? TL.off.delete(id) : TL.off.add(id);
        tlSave();
        renderTools();
      }),
  );
  body.querySelectorAll("[data-tlsk]").forEach(
    (b) =>
      (b.onclick = () => {
        const k = b.dataset.tlsk;
        if (!k) TL.sk = null;
        else if (TL.sk === k) TL.sd = -TL.sd;
        else ((TL.sk = k), (TL.sd = k === "coin" ? 1 : -1));
        TL.page = 0;
        renderTools();
      }),
  );
  body.querySelectorAll("[data-tlopen]").forEach((b) => (b.onclick = () => bxOpen(b.dataset.tlopen)));
  body.querySelectorAll("[data-tlcoin]").forEach((b) => (b.onclick = () => (switchCoin(b.dataset.tlcoin), setCpTab("chart"))));
  BX.key && $("bx") && !$("bx").hidden && bxHead();
}
/* ═══════════ Скальпинг: стакан-лестница (как в MetaScalp) ═══════════
   Цены идут сверху вниз с постоянным шагом. Клик в колонке «Покупка» —
   лимитная покупка по этой цене, в «Продажа» — лимитная продажа. Shift+клик —
   стоп-ордер. Клик по своей заявке — снять её. Слева лента сделок, рядом —
   объём сделок на каждой цене. Работает на той сети, на которой стоит сайт. */
var SC_AGG = [
  ["точно", null],
  ["×2", { nSigFigs: 5, mantissa: 2 }],
  ["×5", { nSigFigs: 5, mantissa: 5 }],
  ["×10", { nSigFigs: 4 }],
  ["×100", { nSigFigs: 3 }],
];
var SC = { ticks: [], tkRaf: 0, asl: 0, aslU: "pct", atp: 0, agg: 0, center: null, step: 0, vols: [50, 100, 250, 500], vi: 1, hot: !0, confirm: !1, auto: !0, book: null, sub: null, subKey: "", tape: [], tv: new Map(), coin: null, levKey: "", raf: 0, sideAt: 0, busy: 0 };
try {
  const z = JSON.parse(localStorage.getItem("totum.scalp") || "{}");
  Array.isArray(z.vols) && z.vols.length === 4 && z.vols.every((v) => v > 0) && (SC.vols = z.vols);
  z.vi >= 0 && z.vi < 4 && (SC.vi = z.vi);
  z.hot === !1 && (SC.hot = !1);
  z.confirm === !0 && (SC.confirm = !0);
  z.auto === !1 && (SC.auto = !1);
  z.agg >= 0 && z.agg < SC_AGG.length && (SC.agg = z.agg);
  z.asl >= 0 && (SC.asl = z.asl);
  z.atp >= 0 && (SC.atp = z.atp);
  z.aslU === "usd" && (SC.aslU = "usd");
} catch {}
const scSave = () => {
  try {
    localStorage.setItem("totum.scalp", JSON.stringify({ vols: SC.vols, vi: SC.vi, hot: SC.hot, confirm: SC.confirm, auto: SC.auto, agg: SC.agg, asl: SC.asl, atp: SC.atp, aslU: SC.aslU }));
  } catch {}
};
function scOn() {
  return document.body.dataset.cp === "scalp";
}
const scRound = (p) => (SC.step ? Math.round(p / SC.step) * SC.step : p);
const scKey = (p) => scRound(p).toFixed(10);
function scOpen() {
  const el = $("paneScalp");
  if (!el) return;
  if (!el.dataset.built) {
    el.dataset.built = "1";
    el.innerHTML = `<div class="sc">
      <section class="sc-tape"><header>Лента сделок</header><div class="sc-tape-h"><span>Цена</span><span>Объём $</span><span>Время</span></div><div id="scTape"></div></section>
      <section class="sc-dom">
        <div class="sc-bar">
          <div class="tl-seg" id="scAgg">${SC_AGG.map(([l], k) => `<button type="button" data-scagg="${k}">${l}</button>`).join("")}</div>
          <button type="button" class="sc-center" id="scCenter" title="В центр (Пробел)">⦿ В центр</button>
          <span class="sc-hint" id="scHint"></span>
        </div>
        <div class="sc-body">
          <div class="sc-tk"><div class="sc-tk-h">Сделки <small>последняя минута · кружок = объём</small></div><canvas id="scTicks"></canvas></div>
          <div class="sc-col"><div class="sc-head"><span>Объём</span><span class="b">Покупки</span><span>Цена</span><span class="s">Продажи</span></div>
          <div class="sc-ladder" id="scLadder" tabindex="0"></div></div>
        </div>
      </section>
      <aside class="sc-side">
        <div class="sc-card"><b class="sc-t">Рабочий объём</b>
          <div class="sc-vols" id="scVols"></div>
          <label class="sc-edit">Изменить выбранный, $ <input id="scVolEdit" type="number" min="10" step="10" inputmode="decimal"></label>
          <div class="sc-lev" id="scLev"></div>
          <div class="sc-mk"><button type="button" class="btn buy" id="scBuyM">Купить по рынку <kbd>B</kbd></button><button type="button" class="btn sell" id="scSellM">Продать по рынку <kbd>S</kbd></button></div>
        </div>
        <div class="sc-card"><b class="sc-t">Стоп и тейк при входе</b>
          <p class="muted small sc-note">Ставятся на бирже сами, когда заявка исполнится и откроется позиция. До этого их нет. 0 — не ставить.</p>
          <label class="sc-edit">Стоп-лосс <span class="sc-u"><input id="scAsl" type="number" min="0" step="0.1" inputmode="decimal"><span class="tl-seg"><button type="button" data-scu="pct">%</button><button type="button" data-scu="usd">$</button></span></span></label>
          <label class="sc-edit">Тейк-профит, % <input id="scAtp" type="number" min="0" step="0.1" inputmode="decimal"></label>
        </div>
        <div class="sc-card" id="scPos"></div>
        <div class="sc-card" id="scOrd"></div>
        <div class="sc-card sc-set">
          <label class="chk"><input type="checkbox" id="scHot"><span class="box"></span> Горячие клавиши</label>
          <label class="chk"><input type="checkbox" id="scConfirm"><span class="box"></span> Подтверждать сделки</label>
          <label class="chk"><input type="checkbox" id="scAuto"><span class="box"></span> Держать цену в центре</label>
          <div class="sc-keys"><span><kbd>1</kbd>–<kbd>4</kbd> объём</span><span><kbd>B</kbd> / <kbd>S</kbd> по рынку</span><span><kbd>X</kbd> закрыть позицию</span><span><kbd>C</kbd> снять заявки</span><span><kbd>E</kbd> стоп в безубыток</span><span><kbd>Пробел</kbd> в центр</span><span><kbd>колесо</kbd> листать цены</span></div>
        </div>
      </aside></div>`;
    el.querySelectorAll("[data-scagg]").forEach((b) => (b.onclick = () => ((SC.agg = Number(b.dataset.scagg)), scSave(), scResetData(), scSubscribe())));
    $("scCenter").onclick = () => ((SC.auto = !0), ($("scAuto").checked = !0), scSave(), (SC.center = null), scRender());
    $("scVolEdit").onchange = (e) => {
      const v = Number(e.target.value);
      v >= 10 ? ((SC.vols[SC.vi] = v), scSave(), scVolsUi()) : ((e.target.value = SC.vols[SC.vi]), toast("Минимальный ордер на бирже — $10", "err"));
    };
    $("scBuyM").onclick = () => scOrder(!0, 0, "market");
    $("scSellM").onclick = () => scOrder(!1, 0, "market");
    [["scHot", "hot"], ["scConfirm", "confirm"], ["scAuto", "auto"]].forEach(([id, k]) => {
      $(id).checked = SC[k];
      $(id).onchange = (e) => ((SC[k] = e.target.checked), scSave(), k === "auto" && SC.auto && ((SC.center = null), scRender()));
    });
    $("scAsl").value = SC.asl;
    $("scAtp").value = SC.atp;
    $("scAsl").onchange = (e) => ((SC.asl = Math.max(0, Number(e.target.value) || 0)), scSave());
    $("scAtp").onchange = (e) => ((SC.atp = Math.max(0, Number(e.target.value) || 0)), scSave());
    const scU = () => document.querySelectorAll("[data-scu]").forEach((b) => b.classList.toggle("on", b.dataset.scu === SC.aslU));
    document.querySelectorAll("[data-scu]").forEach((b) => (b.onclick = (e) => (e.preventDefault(), (SC.aslU = b.dataset.scu), scSave(), scU())));
    scU();
    $("scHint").textContent = scTouch() ? "Нажмите в колонке «Покупки» — купить, «Продажи» — продать · нажмите на заявку — снять" : "ЛКМ — купить · ПКМ — продать (ниже/выше спреда — лимит, через спред — по рынку) · Shift — стоп · Alt — закрыть позицию · колесо по заявке — снять";
    const lad = $("scLadder");
    lad.addEventListener("click", (e) => scTouch() && scClick(e));
    lad.addEventListener("mousedown", (e) => !scTouch() && scMouse(e));
    lad.addEventListener("contextmenu", (e) => e.preventDefault());
    lad.addEventListener(
      "wheel",
      (e) => {
        if (!SC.step || SC.center == null) return;
        e.preventDefault();
        SC.auto = !1;
        $("scAuto").checked = !1;
        SC.center = scRound(SC.center + (e.deltaY < 0 ? 1 : -1) * SC.step * Math.max(1, Math.round(Math.abs(e.deltaY) / 40)));
        scRender();
      },
      { passive: !1 },
    );
    new ResizeObserver(() => scOn() && scRender()).observe(lad);
    document.addEventListener("keydown", scKeys);
  }
  scVolsUi();
  scSubscribe();
  scRender();
  scSideRender(!0);
}
function scVolsUi() {
  const el = $("scVols");
  if (!el) return;
  el.innerHTML = SC.vols.map((v, k) => `<button type="button" data-scv="${k}" class="${k === SC.vi ? "on" : ""}"><kbd>${k + 1}</kbd>$${v.toLocaleString("ru-RU")}</button>`).join("");
  el.querySelectorAll("[data-scv]").forEach((b) => (b.onclick = () => ((SC.vi = Number(b.dataset.scv)), scSave(), scVolsUi())));
  $("scVolEdit").value = SC.vols[SC.vi];
}
function scResetData() {
  SC.book = null;
  SC.step = 0;
  SC.center = null;
  SC.tv = new Map();
  document.querySelectorAll("#scAgg [data-scagg]").forEach((b) => b.classList.toggle("on", Number(b.dataset.scagg) === SC.agg));
}
/* стакан: «точно» — общий поток терминала; крупнее — своя подписка с округлением */
async function scSubscribe() {
  if (SC.coin !== S.coin) ((SC.coin = S.coin), (SC.tape = []), (SC.ticks = []), scResetData(), scTapeRender());
  scTicksLoop();
  document.querySelectorAll("#scAgg [data-scagg]").forEach((b) => b.classList.toggle("on", Number(b.dataset.scagg) === SC.agg));
  const p = SC_AGG[SC.agg][1],
    key = p ? `${S.coin}|${JSON.stringify(p)}` : "";
  /* стакан «точно» — тот же, что уже загружен: показываем сразу, не ждём следующего обновления */
  if (SC.subKey === key && (SC.sub || !p)) return void (!p && S.book && (scBook(S.book), scRender()));
  scUnsub();
  SC.subKey = key;
  if (!p) return (S.book && scBook(S.book), scRender());
  const coin = S.coin;
  info
    .l2Book({ coin, ...p })
    .then((d) => SC.subKey === key && d && scLevels(d.levels))
    .catch(() => {});
  if (subs)
    try {
      const s = await subs.l2Book({ coin, ...p }, (d) => SC.subKey === key && d.coin === coin && scLevels(d.levels));
      SC.subKey === key ? (SC.sub = s) : s.unsubscribe().catch(() => {});
    } catch {}
}
function scUnsub() {
  if (!SC) return;
  SC.sub && SC.sub.unsubscribe().catch(() => {});
  SC.sub = null;
  SC.subKey = "";
}
const scLevels = (lv) => lv && scBook({ bids: lv[0].map((n) => ({ px: +n.px, sz: +n.sz })), asks: lv[1].map((n) => ({ px: +n.px, sz: +n.sz })) });
function scBook(b) {
  if (!scOn() || !b?.bids || !b?.asks) return;
  if (!SC.step) {
    /* шаг цены — наименьшая разница между соседними уровнями */
    const ps = [...b.asks, ...b.bids].map((x) => x.px).sort((x, y) => x - y);
    let d = Infinity;
    for (let k = 1; k < ps.length; k++) {
      const v = ps[k] - ps[k - 1];
      v > 1e-12 && v < d && (d = v);
    }
    if (!Number.isFinite(d)) return;
    const e = 10 ** Math.floor(Math.log10(d));
    SC.step = Math.round(d / e) * e;
  }
  SC.book = b;
  scRender();
}
function scTrades(list) {
  if (!scOn() || SC.coin !== S.coin) return;
  for (const t of list) {
    if (t.coin !== S.coin) continue;
    const px = +t.px,
      usd = px * +t.sz;
    SC.tape.unshift({ px, usd, b: t.side === "B", time: t.time });
    /* для окна сделок: подряд идущие сделки по одной цене и стороне — один кружок */
    const lt = SC.ticks[SC.ticks.length - 1];
    lt && lt.px === px && lt.b === (t.side === "B") && t.time - lt.t < 300 ? (lt.usd += usd) : SC.ticks.push({ px, usd, b: t.side === "B", t: t.time });
    if (SC.step) {
      const k = scKey(px),
        o = SC.tv.get(k) || { b: 0, s: 0 };
      t.side === "B" ? (o.b += usd) : (o.s += usd);
      SC.tv.set(k, o);
    }
    SC.last = px;
  }
  SC.tape.length > 150 && (SC.tape.length = 150);
  SC.ticks.length > 600 && SC.ticks.splice(0, SC.ticks.length - 600);
  scTapeRender();
  scRender();
}
function scTapeRender() {
  const el = $("scTape");
  if (!el) return;
  const avg = SC.tape.reduce((a, t) => a + t.usd, 0) / (SC.tape.length || 1);
  el.innerHTML =
    SC.tape
      .slice(0, 80)
      .map((t) => `<div class="sc-tr ${t.b ? "b" : "s"}${t.usd >= avg * 4 && t.usd >= 1e3 ? " big" : ""}"><span>${fmtPx(t.px)}</span><span>${compactUsd(t.usd)}</span><span>${new Date(t.time).toLocaleTimeString("ru-RU", { hour12: !1 })}</span></div>`)
      .join("") || '<p class="muted small">Ждём сделки…</p>';
}
function scRender() {
  if (SC.raf || !scOn()) return;
  SC.raf = requestAnimationFrame(() => {
    SC.raf = 0;
    scDraw();
    Date.now() - SC.sideAt > 700 && scSideRender();
  });
}
function scDraw() {
  const lad = $("scLadder"),
    b = SC.book;
  if (!lad) return;
  if (isSpot()) return void (lad.innerHTML = '<p class="sc-empty">Скальпинг-стакан работает для фьючерсов. Выберите фьючерсную пару.</p>');
  if (!b || !SC.step || !b.asks[0] || !b.bids[0]) return void (lad.innerHTML = '<p class="sc-empty">Загружаем стакан…</p>');
  const RH = 20,
    n = Math.max(10, Math.floor(lad.clientHeight / RH)),
    half = Math.floor(n / 2);
  SC.geo = { RH, n, half };
  const
    ask = b.asks[0].px,
    bid = b.bids[0].px,
    mid = scRound((ask + bid) / 2);
  if (SC.center == null || (SC.auto && Math.abs(mid - SC.center) > SC.step * n * 0.3)) SC.center = mid;
  const A = new Map(),
    B = new Map();
  b.asks.forEach((x) => A.set(scKey(x.px), (A.get(scKey(x.px)) || 0) + x.px * x.sz));
  b.bids.forEach((x) => B.set(scKey(x.px), (B.get(scKey(x.px)) || 0) + x.px * x.sz));
  const vis = [...A.values(), ...B.values()],
    mx = Math.max(...vis, 1),
    avg = vis.reduce((a, v) => a + v, 0) / (vis.length || 1),
    tvMax = Math.max(1, ...[...SC.tv.values()].map((o) => o.b + o.s));
  /* свои заявки, стопы и позиция */
  const my = new Map();
  for (const o of S.orders || []) {
    if (o.coin !== S.coin) continue;
    const px = Number(o.isTrigger ? o.triggerPx : o.limitPx),
      k = scKey(px),
      a = my.get(k) || [];
    a.push(o);
    my.set(k, a);
  }
  const pos = curPosition(),
    entK = pos ? scKey(Number(pos.entryPx)) : null,
    liqK = pos?.liquidationPx ? scKey(Number(pos.liquidationPx)) : null,
    lastK = SC.last ? scKey(SC.last) : null,
    pd = Math.max(0, -Math.floor(Math.log10(SC.step) + 1e-9)),
    md = mkt(S.coin),
    szD = md ? Math.min(md.szDecimals, 4) : 4;
  let html = "";
  for (let i = 0; i < n; i++) {
    const px = SC.center + (half - i) * SC.step,
      k = scKey(px),
      av = A.get(k),
      bv = B.get(k),
      tv = SC.tv.get(k),
      mine = my.get(k) || [],
      mb = mine.filter((o) => o.side === "B"),
      ms = mine.filter((o) => o.side !== "B"),
      zone = px >= ask - SC.step / 2 ? "a" : px <= bid + SC.step / 2 ? "b" : "sp",
      badge = (arr) =>
        arr
          .map((o) => {
            const tp = /take/i.test(o.orderType || ""),
              lbl = o.isTrigger ? (o.reduceOnly ? (tp ? "TP " : "SL ") : "⚡") : "";
            return `<em class="sc-my${o.isTrigger ? (o.reduceOnly ? (tp ? " tp" : " sl") : " trg") : ""}" data-oid="${o.oid}" title="${o.isTrigger ? (o.reduceOnly ? (tp ? "Тейк-профит" : "Стоп-лосс") : "Стоп-ордер") : "Ваша заявка"} — нажмите, чтобы снять">${lbl}${num(Number(o.sz), szD)} ✕</em>`;
          })
          .join(""),
      bar = (v, cls) => (v ? `<i class="${cls}" style="width:${Math.min(100, (v / mx) * 100).toFixed(1)}%"></i>` : ""),
      big = (v) => (v && v >= avg * 3 ? " big" : "");
    html += `<div class="sc-row z-${zone}${k === entK ? " ent" : ""}${k === liqK ? " liq" : ""}${k === lastK ? " last" : ""}" data-px="${px}">
      <span class="sc-c tv">${tv ? `<i style="width:${(((tv.b + tv.s) / tvMax) * 100).toFixed(1)}%"></i><b>${compactUsd(tv.b + tv.s)}</b>` : ""}</span>
      <span class="sc-c bc${big(bv)}" data-side="b">${bar(bv, "bb")}<b>${bv ? compactUsd(bv) : ""}</b>${badge(mb)}</span>
      <span class="sc-c pc">${px.toFixed(pd)}${k === entK ? `<small class="${clsOf(Number(pos.unrealizedPnl))}">${usd(Number(pos.unrealizedPnl))}</small>` : ""}${k === liqK ? "<small>ликв.</small>" : ""}</span>
      <span class="sc-c ac${big(av)}" data-side="a">${bar(av, "ab")}<b>${av ? compactUsd(av) : ""}</b>${badge(ms)}</span></div>`;
  }
  lad.innerHTML = html;
}
/* окно сделок как в MetaScalp: кружок на уровне цены сделки, зелёный — покупка,
   красный — продажа, площадь — объём; справа «сейчас», влево — минута назад */
function scTicksLoop() {
  if (SC.tkRaf) return;
  const loop = () => {
    if (!scOn()) return void (SC.tkRaf = 0);
    SC.tkRaf = requestAnimationFrame(loop);
    const now = performance.now();
    if (now - (SC.tkAt || 0) < 50) return;
    SC.tkAt = now;
    scTicksDraw();
  };
  SC.tkRaf = requestAnimationFrame(loop);
}
function scTicksDraw() {
  const cv = $("scTicks"),
    lad = $("scLadder");
  if (!cv || !lad || !cv.clientWidth || !SC.geo || !SC.step || SC.center == null) return;
  const dpr = window.devicePixelRatio || 1,
    W = cv.clientWidth,
    H = lad.clientHeight;
  (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) && ((cv.width = Math.round(W * dpr)), (cv.height = Math.round(H * dpr)), (cv.style.height = `${H}px`));
  const g = cv.getContext("2d"),
    css = getComputedStyle(document.documentElement),
    up = css.getPropertyValue("--buy").trim() || "#16a34a",
    dn = css.getPropertyValue("--sell").trim() || "#e11d48",
    mu = css.getPropertyValue("--muted").trim() || "#888",
    line = css.getPropertyValue("--line").trim() || "#333",
    { RH, half } = SC.geo,
    SPAN = 60e3,
    t1 = Date.now(),
    xOf = (t) => W - 34 - ((t1 - t) / SPAN) * (W - 44),
    yOf = (px) => (half - (px - SC.center) / SC.step) * RH + RH / 2;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, H);
  /* сетка времени: каждые 10 секунд */
  g.font = "10px Manrope, sans-serif";
  g.textAlign = "center";
  for (let k = 0; k <= 6; k++) {
    const x = xOf(t1 - k * 10e3);
    g.strokeStyle = line;
    g.globalAlpha = 0.5;
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, H - 14);
    g.stroke();
    g.globalAlpha = 1;
    g.fillStyle = mu;
    g.fillText(k ? `−${k * 10}с` : "сейчас", x, H - 3);
  }
  const vis = SC.ticks.filter((t) => t1 - t.t < SPAN),
    mx = Math.max(1, ...vis.map((t) => t.usd));
  let prev = null;
  /* линия цены сделок */
  g.strokeStyle = mu;
  g.globalAlpha = 0.35;
  g.beginPath();
  for (const t of vis) {
    const x = xOf(t.t),
      y = yOf(scRound(t.px));
    prev ? g.lineTo(x, y) : g.moveTo(x, y);
    prev = t;
  }
  g.stroke();
  g.globalAlpha = 1;
  for (const t of vis) {
    const x = xOf(t.t),
      y = yOf(scRound(t.px));
    if (y < -20 || y > H + 20) continue;
    const r = 3 + 15 * Math.sqrt(t.usd / mx);
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fillStyle = t.b ? up : dn;
    g.globalAlpha = 0.75;
    g.fill();
    g.globalAlpha = 1;
    if (r >= 10) {
      g.fillStyle = "#fff";
      g.font = "bold 9px Manrope, sans-serif";
      g.fillText(compactUsd(t.usd).replace(/,\d+$/, ""), x, y + 3);
    }
  }
}
function scSideRender(force) {
  SC.sideAt = Date.now();
  const P = $("scPos"),
    O = $("scOrd"),
    L = $("scLev");
  if (!P || !O) return;
  const pos = curPosition(),
    lev = Number($("lev")?.value) || 1;
  L && (L.innerHTML = `<span>Плечо <b>${lev}x</b> · ${S.margin === "cross" ? "кросс" : "изолированная"}</span><span class="muted small">меняется в обычной панели сделки</span>`);
  if (pos) {
    const sz = Number(pos.szi),
      pnl = Number(pos.unrealizedPnl);
    P.innerHTML = `<b class="sc-t">Позиция ${esc(S.coin)}</b>
      <div class="bx-kv"><span>Размер</span><b class="${sz > 0 ? "pos" : "neg"}">${sz > 0 ? "Лонг" : "Шорт"} ${num(Math.abs(sz), 4)}</b></div>
      <div class="bx-kv"><span>Цена входа</span><b>${fmtPx(Number(pos.entryPx))}</b></div>
      <div class="bx-kv"><span>Прибыль / убыток</span><b class="${clsOf(pnl)}">${usd(pnl)} · ${(Number(pos.returnOnEquity) * 100).toFixed(2)}%</b></div>
      ${pos.liquidationPx ? `<div class="bx-kv"><span>Ликвидация</span><b>${fmtPx(Number(pos.liquidationPx))}</b></div>` : ""}
      <div class="sc-mk"><button type="button" class="btn ghost" id="scClose">Закрыть по рынку <kbd>X</kbd></button><button type="button" class="btn ghost" id="scRev">Развернуть</button><button type="button" class="btn ghost" id="scBe" title="С учётом комиссий и проскальзывания">Стоп в Б/У <kbd>E</kbd></button></div>
      ${(() => {
        const b = beCalc(S.coin);
        return b ? `<p class="muted small">Безубыток с комиссиями: <b>${fmtPx(b.px)}</b></p>` : "";
      })()}`;
    $("scBe").onclick = () => beStop(S.coin);
    $("scClose").onclick = () => scClosePos();
    $("scRev").onclick = () => reversePosition(S.coin);
  } else P.innerHTML = `<b class="sc-t">Позиция ${esc(S.coin)}</b><p class="muted small">Позиции нет</p>`;
  const ords = (S.orders || []).filter((o) => o.coin === S.coin);
  O.innerHTML = `<b class="sc-t">Заявки ${esc(S.coin)} <small>${ords.length || ""}</small></b>${
    ords.length
      ? ords
          .map((o) => `<div class="sc-o"><span class="${o.side === "B" ? "pos" : "neg"}">${o.side === "B" ? "Покупка" : "Продажа"}${o.isTrigger ? " · стоп" : ""}</span><span>${fmtPx(Number(o.isTrigger ? o.triggerPx : o.limitPx))}</span><span>${num(Number(o.sz), 4)}</span><button type="button" data-sccancel="${o.oid}" title="Снять">✕</button></div>`)
          .join("") + `<button type="button" class="btn ghost small wide-btn" id="scCancelAll">Снять все <kbd>C</kbd></button>`
      : '<p class="muted small">Заявок нет</p>'
  }`;
  O.querySelectorAll("[data-sccancel]").forEach((b) => (b.onclick = () => scCancel([Number(b.dataset.sccancel)])));
  $("scCancelAll") && ($("scCancelAll").onclick = () => scCancel(ords.map((o) => o.oid)));
}
const scTouch = () => matchMedia("(pointer: coarse)").matches;
/* как в MetaScalp: левая кнопка — покупка, правая — продажа. Ниже спреда покупка —
   лимит, выше — по рынку; у продажи наоборот. Shift — стоп-ордер, Alt — заявка на
   закрытие всей позиции по этой цене, колесо (или клик) по своей заявке — снять. */
function scMouse(e) {
  const my = e.target.closest(".sc-my");
  if (my && (e.button === 1 || e.button === 0)) return e.preventDefault(), scCancel([Number(my.dataset.oid)]);
  const row = e.target.closest(".sc-row");
  if (!row || (e.button !== 0 && e.button !== 2)) return;
  e.preventDefault();
  const px = Number(row.dataset.px),
    buy = e.button === 0;
  if (e.altKey) return scCloseAt(px);
  if (e.shiftKey) return scOrder(buy, px, "stop");
  const ask = SC.book?.asks?.[0]?.px,
    bid = SC.book?.bids?.[0]?.px,
    through = buy ? ask && px >= ask : bid && px <= bid;
  scOrder(buy, px, through ? "market" : "limit");
}
function scClick(e) {
  const my = e.target.closest(".sc-my");
  if (my) return scCancel([Number(my.dataset.oid)]);
  const cell = e.target.closest("[data-side]"),
    row = e.target.closest(".sc-row");
  if (!cell || !row) return;
  const px = Number(row.dataset.px),
    buy = cell.dataset.side === "b";
  scOrder(buy, px, e.shiftKey ? "stop" : "limit");
}
function scKeys(e) {
  if (!scOn() || !SC.hot || e.ctrlKey || e.metaKey || e.altKey) return;
  const t = e.target;
  if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
  if (document.querySelector("dialog[open]") || ($("bx") && !$("bx").hidden)) return;
  const k = e.key.toLowerCase();
  if (["1", "2", "3", "4"].includes(k)) ((SC.vi = Number(k) - 1), scSave(), scVolsUi());
  else if (k === "b" || k === "и") scOrder(!0, 0, "market");
  else if (k === "s" || k === "ы") scOrder(!1, 0, "market");
  else if (k === "x" || k === "ч") scClosePos();
  else if (k === "e" || k === "у") scBreakeven();
  else if (k === "c" || k === "с") scCancel((S.orders || []).filter((o) => o.coin === S.coin).map((o) => o.oid));
  else if (k === " ") ((SC.auto = !0), ($("scAuto").checked = !0), (SC.center = null), scRender());
  else return;
  e.preventDefault();
}
async function scReady() {
  if (isSpot()) return toast("Скальпинг-стакан — только для фьючерсов", "err"), !1;
  if (!S.user || !S.agentExchange) return toast("Подключите кошелёк, чтобы торговать", "err"), !1;
  return !0;
}
async function scOrder(buy, px, kind) {
  if (!(await scReady())) return;
  const m = mkt(S.coin),
    usdAmt = SC.vols[SC.vi];
  if (!m) return;
  try {
    let price = px,
      o;
    const slip = Number(SET.slippage) || CFG.slippage;
    if (kind === "market") {
      const mp = marketPx(S.coin, buy, { usdc: usdAmt });
      price = mp.avg || Number(S.ctx[S.coin]?.midPx);
      o = { a: m.index, b: buy, p: fmtP(mp.px, m), s: formatSize(usdAmt / price, m.szDecimals), r: !1, t: { limit: { tif: "Ioc" } } };
    } else if (kind === "stop") {
      const mid = Number(S.ctx[S.coin]?.midPx || px),
        tpsl = buy ? (px > mid ? "sl" : "tp") : px < mid ? "sl" : "tp";
      o = { a: m.index, b: buy, p: fmtP(px * (buy ? 1 + slip : 1 - slip), m), s: formatSize(usdAmt / px, m.szDecimals), r: !1, t: { trigger: { isMarket: !0, triggerPx: fmtP(px, m), tpsl } } };
    } else o = { a: m.index, b: buy, p: fmtP(px, m), s: formatSize(usdAmt / px, m.szDecimals), r: !1, t: { limit: { tif: "Gtc" } } };
    if (!(Number(o.s) > 0) || Number(o.s) * price < 10) return toast("Минимальный ордер на бирже — $10. Увеличьте рабочий объём.", "err");
    const what = kind === "market" ? "по рынку" : kind === "stop" ? `стоп по ${fmtPx(px)}` : `лимит по ${fmtPx(px)}`;
    if (
      SC.confirm &&
      !(await confirmBox({ title: buy ? "Купить?" : "Продать?", pair: pairLabel(S.coin), tag: buy ? "Покупка" : "Продажа", tagCls: buy ? "pos" : "neg", rows: [["Тип", what], ["Объём", `$${usdAmt} · ${o.s} ${baseOf()}`]], okLabel: buy ? "Купить" : "Продать" }))
    )
      return;
    const lev = Number($("lev")?.value) || 1,
      lk = `${S.coin}|${lev}|${S.margin}`;
    if (SC.levKey !== lk) {
      await S.agentExchange.updateLeverage({ asset: m.index, isCross: S.margin === "cross", leverage: lev });
      logLeverage(S.coin, lev);
      SC.levKey = lk;
    }
    /* стоп и тейк при входе: «дочерние» заявки, биржа включает их, только когда
       заявка исполнится (позиции до этого нет — и стопа с тейком тоже) */
    const orders = [o],
      pos0 = curPosition(),
      opening = !pos0 || Number(pos0.szi) > 0 === buy,
      ent = kind === "market" ? price : px,
      szN = Number(o.s);
    if (opening && !pos0 && (SC.asl > 0 || SC.atp > 0)) {
      const dSl = SC.asl > 0 ? (SC.aslU === "usd" ? SC.asl / szN : (ent * SC.asl) / 100) : 0,
        dTp = SC.atp > 0 ? (ent * SC.atp) / 100 : 0,
        child = (trig, tpsl) => ({ a: m.index, b: !buy, p: fmtP(trig * (buy ? 1 - slip * 3 : 1 + slip * 3), m), s: o.s, r: !0, t: { trigger: { isMarket: !0, triggerPx: fmtP(trig, m), tpsl } } });
      dSl > 0 && dSl < ent && orders.push(child(buy ? ent - dSl : ent + dSl, "sl"));
      dTp > 0 && orders.push(child(buy ? ent + dTp : ent - dTp, "tp"));
    }
    const st = (await S.agentExchange.order({ orders, grouping: orders.length > 1 ? "normalTpsl" : "na", builder: builderParam() })).response.data.statuses[0];
    if (st?.error) throw new Error(st.error);
    (st?.filled || st?.resting) && tradeSound(buy);
    st?.filled ? toast(`${buy ? "Куплено" : "Продано"}: ${st.filled.totalSz} ${baseOf()} по ${st.filled.avgPx}`, "ok") : toast(`${buy ? "Покупка" : "Продажа"}: ${what}`, "ok");
    fundingAt = 0;
    refreshAccount().then(() => (scRender(), scSideRender()));
  } catch (err) {
    toast(humanError(err), "err");
  }
}
async function scCancel(oids) {
  if (!oids.length) return;
  if (!(await scReady())) return;
  try {
    await safeCancel(S.coin, oids.map((oid) => ({ oid })));
    toast(oids.length > 1 ? `Снято заявок: ${oids.length}` : "Заявка снята", "ok");
  } catch (err) {
    toast(humanError(err), "err");
  }
  refreshAccount().then(() => (scRender(), scSideRender()));
}
/* Alt+клик: заявка на закрытие всей позиции по цене клика (только уменьшает позицию) */
async function scCloseAt(px) {
  const pos = curPosition();
  if (!pos) return toast(`Позиции по ${S.coin} нет — закрывать нечего`, "info");
  if (!(await scReady())) return;
  const m = mkt(S.coin),
    long = Number(pos.szi) > 0,
    o = { a: m.index, b: !long, p: fmtP(px, m), s: formatSize(Math.abs(Number(pos.szi)), m.szDecimals), r: !0, t: { limit: { tif: "Gtc" } } };
  try {
    const st = (await S.agentExchange.order({ orders: [o], grouping: "na", builder: builderParam() })).response.data.statuses[0];
    if (st?.error) throw new Error(st.error);
    toast(st?.filled ? `Позиция закрыта по ${st.filled.avgPx}` : `Заявка на закрытие позиции по ${fmtPx(px)}`, "ok");
    refreshAccount().then(() => (scRender(), scSideRender()));
  } catch (err) {
    toast(humanError(err), "err");
  }
}
/* Стоп в безубыток с учётом комиссий и проскальзывания: при срабатывании стопа
   итог сделки после всех комиссий ≈ 0. Комиссия входа и выхода — тейкер Totum,
   проскальзывание — по нынешнему стакану на размер позиции (не меньше 0,01%).
   Лонг:  стоп = вход × (1 + комиссия) / ((1 − комиссия) × (1 − проскальз.))
   Шорт:  стоп = вход × (1 − комиссия) / ((1 + комиссия) × (1 + проскальз.)) */
function beCalc(coin) {
  const pos = S.positions.find((p) => p.coin === coin);
  if (!pos) return null;
  const long = Number(pos.szi) > 0,
    sz = Math.abs(Number(pos.szi)),
    ent = Number(pos.entryPx),
    f = FEE_RATE(coin),
    mid = Number(S.ctx[coin]?.midPx || S.ctx[coin]?.markPx || 0);
  let slip = 1e-4;
  try {
    const bf = coin === S.coin ? bookFill(coin, !long, { sz }) : null;
    bf?.avg && mid && (slip = Math.max(slip, Math.abs(bf.avg / mid - 1)));
  } catch {}
  const px = long ? (ent * (1 + f)) / ((1 - f) * (1 - slip)) : (ent * (1 - f)) / ((1 + f) * (1 + slip));
  return { pos, long, sz, ent, f, slip, px, mid, ok: long ? mid > px : mid < px };
}
async function beStop(coin = S.coin) {
  const b = beCalc(coin);
  if (!b) return toast(`Позиции по ${coin} нет`, "info");
  if (!S.agentExchange) return toast("Подключите кошелёк", "err");
  if (!b.ok)
    return toast(`Цена ещё не дошла до безубытка с комиссиями (${fmtPx(b.px)}). Стоп там сработал бы сразу — подождите, пока позиция уйдёт в плюс дальше.`, "info");
  const m = mkt(coin),
    slipP = Number(SET.slippage) || CFG.slippage,
    old = (S.orders || []).filter((o) => o.coin === coin && o.isTrigger && o.reduceOnly && /stop/i.test(o.orderType || ""));
  try {
    old.length && (await safeCancel(coin, old));
    const o = { a: m.index, b: !b.long, p: fmtP(b.px * (b.long ? 1 - slipP * 3 : 1 + slipP * 3), m), s: formatSize(b.sz, m.szDecimals), r: !0, t: { trigger: { isMarket: !0, triggerPx: fmtP(b.px, m), tpsl: "sl" } } };
    const st = (await S.agentExchange.order({ orders: [o], grouping: "positionTpsl", builder: builderParam() })).response.data.statuses[0];
    if (st?.error) throw new Error(st.error);
    toast(`Стоп в безубыток: ${fmtPx(b.px)} (вход ${fmtPx(b.ent)} + комиссии ${(b.f * 200).toFixed(3)}% + проскальзывание ~${(b.slip * 100).toFixed(3)}%)`, "ok");
  } catch (err) {
    toast(humanError(err), "err");
  }
  await refreshAccount();
  scOn() && (scRender(), scSideRender());
}
const scBreakeven = () => beStop(S.coin);
async function scClosePos() {
  const pos = curPosition();
  if (!pos) return toast(`Позиции по ${S.coin} нет`, "info");
  if (!(await scReady())) return;
  (await closePosition(S.coin, pos.szi)) && scRender();
}
/* ═══════════ Окно связки «Totum ↔ биржа» на весь экран ═══════════
   Сверху — фандинг каждой биржи, суммарный фандинг связки, вход и выход по
   стаканам. Слева — график: свечи спреда (таймфреймы 5м/15м/1ч/4ч), линии
   входа и выхода, фандинг; снизу — ставки обеих бирж. Справа — расчёт на
   объём и стаканы обеих бирж (на телефоне стаканы — по кнопке).
   Вход = продаём по bid там, где шорт, покупаем по ask там, где лонг.
   Выход = обратные сделки. Итог по цене ≈ вход + выход. */
const V_AVA = {
  binance: ["#F0B90B", "B", "#1e2026"], bybit: ["#17181E", "BY", "#F7A600"], okx: ["#000", "OK", "#fff"], bitget: ["#00B8C8", "BG", "#fff"],
  gate: ["#2354E6", "G", "#fff"], mexc: ["#1972F5", "M", "#fff"], kucoin: ["#23AF91", "KC", "#fff"], bingx: ["#2A54FF", "BX", "#fff"],
  kraken: ["#7132F5", "K", "#fff"], htx: ["#2CA6E0", "H", "#fff"], whitebit: ["#16181d", "W", "#fff"], aster: ["#E8B27A", "A", "#1e2026"],
  ourbit: ["#00B386", "O", "#fff"], paradex: ["#6C3BF5", "P", "#fff"], dydx: ["#6966FF", "dY", "#fff"], weex: ["#16181d", "WX", "#fff"],
};
function vAva(id) {
  if (id === "hyperliquid") return '<img class="vava" src="brand/mark-128.webp" alt="">';
  const [bg, t, fg] = V_AVA[id] || ["#64748b", String(id || "?").slice(0, 2).toUpperCase(), "#fff"];
  return `<i class="vava" style="background:${bg};color:${fg}">${t}</i>`;
}
/* обычная комиссия тейкера без скидок (для оценки) */
const V_TAKER = { hyperliquid: 7e-4, binance: 5e-4, aster: 3.5e-4, bybit: 5.5e-4, okx: 5e-4, bitget: 6e-4, gate: 5e-4, mexc: 2e-4, ourbit: 2e-4, kucoin: 6e-4, bingx: 5e-4, kraken: 5e-4, htx: 5e-4, whitebit: 5.5e-4, paradex: 3e-4, dydx: 5e-4, weex: 6e-4 };
const BX_TF = { "5m": ["1m", 300], "15m": ["5m", 900], "1h": ["15m", 3600], "4h": ["1h", 14400] };
const BX = { key: null, r: null, dir: 1, mode: "candles", tf: "15m", vol: 1000, hist: {}, book: null, ee: {}, bt: null, ct: null, chart: null, S: {}, busy: !1, bbusy: !1 };
try {
  const z = JSON.parse(localStorage.getItem("totum.bx") || "{}");
  BX_TF[z.tf] && (BX.tf = z.tf);
  ["candles", "ee", "funding"].includes(z.mode) && (BX.mode = z.mode);
  z.vol > 0 && (BX.vol = z.vol);
} catch {}
const bxSave = () => {
  try {
    localStorage.setItem("totum.bx", JSON.stringify({ tf: BX.tf, mode: BX.mode, vol: BX.vol }));
  } catch {}
};
const bxP = (x, d = 3) => (Number.isFinite(x) ? `${x > 0 ? "+" : x < 0 ? "−" : ""}${Math.abs(x * 100).toFixed(d)}%` : "—");
const bxCls = (x) => (x > 0 ? "pos" : x < 0 ? "neg" : "");
const bxUsd = (x) => (Number.isFinite(x) ? `${x < 0 ? "−" : x > 0 ? "+" : ""}$${Math.abs(x).toLocaleString("ru-RU", { maximumFractionDigits: 2 })}` : "—");
const bxMob = () => matchMedia("(max-width: 900px)").matches;
/* стороны связки: L — где лонг, S — где шорт */
function bxSides() {
  const r = BX.r,
    T = { id: "hyperliquid", name: "Totum", row: r.t, m: r.t.mult || 1, bk: BX.book?.hl },
    X = { id: r.x.v, name: tlVName(r.x.v), row: r.x, m: r.x.mult || 1, bk: BX.book?.x };
  return BX.dir > 0 ? { L: T, S: X, T, X } : { L: X, S: T, T, X };
}
const bxMid = (s) => (s.bk?.a?.[0] && s.bk?.b?.[0] ? (s.bk.a[0][0] + s.bk.b[0][0]) / 2 / s.m : NaN);
const bxHr = (row) => (row.rate || 0) / (row.ih || 1);
/* средняя цена исполнения на сумму usd по уровням стакана [[цена, кол-во]] */
function bxVwap(lv, usd) {
  let cost = 0,
    qty = 0;
  for (const [p, q] of lv || []) {
    const take = Math.min(q, (usd - cost) / p);
    cost += take * p;
    qty += take;
    if (cost >= usd - 1e-9) return { px: cost / qty, full: !0 };
  }
  return qty ? { px: cost / qty, full: !1, have: cost } : null;
}
function bxEE(usd) {
  const { L, S } = bxSides();
  if (!L.bk || !S.bk) return null;
  const pick = (bk, side) => (usd ? bxVwap(bk[side], usd) : bk[side]?.[0] ? { px: bk[side][0][0], full: !0 } : null);
  const aL = pick(L.bk, "a"),
    bS = pick(S.bk, "b"),
    bL = pick(L.bk, "b"),
    aS = pick(S.bk, "a");
  if (!aL || !bS || !bL || !aS) return null;
  return { en: bS.px / S.m / (aL.px / L.m) - 1, ex: bL.px / L.m / (aS.px / S.m) - 1, full: aL.full && bS.full && bL.full && aS.full, have: Math.min(...[aL, bS, bL, aS].map((x) => (x.full ? Infinity : x.have))) };
}
function bxOpen(key) {
  const r = tlPairs().find((p) => `${p.coin}|${p.x.v}` === key);
  if (!r) return;
  BX.key = key;
  BX.r = r;
  BX.book = null;
  BX.dir = (TL.tab === "arb" ? r.ps : r.fs) >= 0 ? 1 : -1;
  let el = $("bx");
  if (!el) {
    el = document.createElement("div");
    el.id = "bx";
    el.className = "bx";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "true");
    el.innerHTML = `<div class="bx-top" id="bxTop"></div>
      <div class="bx-main">
        <section class="bx-chart">
          <div class="bx-tools">
            <div class="tl-seg" id="bxModes">${[["candles", "Свечи"], ["ee", "Вход/Выход"], ["funding", "Фандинг"]].map(([k, l]) => `<button type="button" data-bxm="${k}">${l}</button>`).join("")}</div>
            <div class="tl-seg" id="bxTf">${Object.keys(BX_TF).map((k) => `<button type="button" data-bxtf="${k}">${k.replace("m", "м").replace("h", "ч")}</button>`).join("")}</div>
            <span class="bx-leg" id="bxLeg"></span>
            <button type="button" class="bx-bookbtn" id="bxBookBtn"></button>
          </div>
          <div class="bx-ch" id="bxCh"><div class="bx-tip" id="bxTip" hidden></div><div class="bx-msg" id="bxMsg" hidden></div></div>
        </section>
        <aside class="bx-side">
          <div class="bx-calc"><label class="bx-vol">Объём на каждую биржу <span><input id="bxVol" type="number" inputmode="decimal" min="1" step="100"> $</span></label>
            <div class="bx-volq">${[100, 1000, 5000, 20000].map((v) => `<button type="button" data-bxv="${v}">$${v.toLocaleString("ru-RU")}</button>`).join("")}</div>
            <div id="bxCalc"></div></div>
          <div class="bx-books" id="bxBooks"></div>
        </aside>
      </div>`;
    document.body.appendChild(el);
    el.querySelectorAll("[data-bxm]").forEach((b) => (b.onclick = () => ((BX.mode = b.dataset.bxm), bxSave(), bxDraw())));
    el.querySelectorAll("[data-bxtf]").forEach((b) => (b.onclick = () => ((BX.tf = b.dataset.bxtf), bxSave(), bxLoad())));
    el.querySelectorAll("[data-bxv]").forEach((b) => (b.onclick = () => (($("bxVol").value = b.dataset.bxv), (BX.vol = Number(b.dataset.bxv)), bxSave(), bxCalc())));
    $("bxVol").oninput = (e) => ((BX.vol = Math.max(0, Number(e.target.value) || 0)), bxSave(), bxCalc());
    $("bxBookBtn").onclick = () => el.classList.toggle("sheet");
    el.addEventListener("click", (e) => e.target.closest("[data-bxclose]") && bxClose());
    el.addEventListener("click", (e) => e.target.closest("[data-bxsheet]") && el.classList.remove("sheet"));
    document.addEventListener("keydown", (e) => e.key === "Escape" && !$("bx").hidden && ($("bx").classList.contains("sheet") ? $("bx").classList.remove("sheet") : bxClose()));
  }
  el.hidden = !1;
  el.classList.remove("sheet");
  document.body.classList.add("bx-on");
  $("bxVol").value = BX.vol;
  bxHead();
  bxCalc();
  bxBooks();
  bxLoad();
  bxBook();
  clearInterval(BX.bt);
  clearInterval(BX.ct);
  bxWsStart();
  BX.bt = setInterval(() => !document.hidden && bxBook(), 2e3);
  BX.ct = setInterval(() => {
    if (document.hidden) return;
    bxHead();
    const h = BX.hist[bxHKey()];
    h && Date.now() - h.at > 6e4 && bxLoad(!0);
  }, 1e3);
}
function bxClose() {
  const el = $("bx");
  if (!el) return;
  el.hidden = !0;
  document.body.classList.remove("bx-on");
  clearInterval(BX.bt);
  clearInterval(BX.ct);
  bxWsStop();
  BX.chart && (BX.chart.remove(), (BX.chart = null));
  BX.key = null;
}
function bxHead() {
  if (!BX.r) return;
  const fresh = tlPairs().find((p) => `${p.coin}|${p.x.v}` === BX.key);
  fresh && (BX.r = fresh);
  const r = BX.r,
    { L, S, T, X } = bxSides(),
    net = bxHr(S.row) - bxHr(L.row),
    ee = bxEE(0),
    day = bxFundDay();
  const fchip = (s) => {
    const role = s === L ? "лонг" : "шорт",
      pay = s === L ? -s.row.rate : s.row.rate;
    return `<div class="bx-f">${vAva(s.id)}<div><span>${esc(s.name)} <em class="bx-role ${role === "лонг" ? "l" : "s"}">${role}</em></span>
      <b class="${bxCls(s.row.rate)}">${bxP(s.row.rate, 4)}<small> за ${s.row.ih} ч</small></b>
      <small>${s.row.next ? `выплата через ${tlLeft(s.row.next)} · ` : ""}${pay >= 0 ? "получаете" : "платите"} ${bxP(Math.abs(pay), 4).replace(/^[+−]/, "")}</small></div></div>`;
  };
  $("bxTop").innerHTML = `<div class="bx-title">${coinIcon(r.coin)}<div><b>${esc(r.base)}</b><span>${vAva("hyperliquid")}Totum <i>↔</i> ${vAva(r.x.v)}${esc(X.name)}</span></div></div>
    <div class="tl-seg bx-dir"><button type="button" data-bxdir="1" class="${BX.dir > 0 ? "on" : ""}">Лонг Totum · шорт ${esc(X.name)}</button><button type="button" data-bxdir="-1" class="${BX.dir < 0 ? "on" : ""}">Лонг ${esc(X.name)} · шорт Totum</button></div>
    <div class="bx-chips">${fchip(T)}${fchip(X)}
      <div class="bx-f sum"><div><span>Фандинг связки</span><b class="${bxCls(net)}">${bxP(net * 8, 4)}<small> за 8 ч</small></b><small>${bxP(net * 24, 3)} в сутки${day != null ? ` · за прошлые 24 ч ${bxP(day, 3)}` : ""}</small></div></div>
      <div class="bx-f ee"><div><span>Вход · Выход (по стаканам)</span><b><em class="${bxCls(ee?.en)}">${bxP(ee?.en)}</em> · <em class="${bxCls(ee?.ex)}">${bxP(ee?.ex)}</em></b><small>Спред цены ${bxP(BX.dir > 0 ? r.ps : 1 / (1 + r.ps) - 1, 2)}${ee ? ` · войти и сразу выйти ${bxP(ee.en + ee.ex, 2)}` : ""}</small></div></div>
    </div>
    <button type="button" class="bx-x" data-bxclose title="Закрыть (Esc)">✕</button>`;
  fixIcons($("bxTop"));
  $("bxTop").querySelectorAll("[data-bxdir]").forEach((b) => (b.onclick = () => ((BX.dir = Number(b.dataset.bxdir)), bxHead(), bxCalc(), bxBooks(), bxDraw())));
  $("bxBookBtn").innerHTML = `${vAva(L.id)}${vAva(S.id)}<span>Стакан</span>`;
  document.querySelectorAll("#bxModes [data-bxm]").forEach((b) => b.classList.toggle("on", b.dataset.bxm === BX.mode));
  document.querySelectorAll("#bxTf [data-bxtf]").forEach((b) => b.classList.toggle("on", b.dataset.bxtf === BX.tf));
}
/* фактический фандинг связки за последние 24 ч по истории ставок */
function bxFundDay() {
  const h = BX.hist[bxHKey()];
  if (!h?.hl?.f || !h?.x?.f) return null;
  const from = Date.now() - 864e5,
    { L } = bxSides(),
    sum = (a) => a.filter(([t]) => t >= from).reduce((s, [, v]) => s + v, 0),
    t = sum(h.hl.f),
    x = sum(h.x.f);
  return L.id === "hyperliquid" ? x - t : t - x;
}
function bxCalc() {
  const el = $("bxCalc");
  if (!el || !BX.r) return;
  const { L, S } = bxSides(),
    v = BX.vol || 0,
    ee = bxEE(v),
    fee = 2 * ((V_TAKER[L.id] ?? 5e-4) + (V_TAKER[S.id] ?? 5e-4)),
    net = bxHr(S.row) - bxHr(L.row),
    now = ee ? ee.en + ee.ex - fee : null,
    be = now != null && now < 0 && net > 0 ? -now / net : null,
    row = (l, val, cls = "", sub = "") => `<div class="bx-kv"><span>${l}${sub ? `<small>${sub}</small>` : ""}</span><b class="${cls}">${val}</b></div>`;
  el.innerHTML = !ee
    ? '<p class="muted small">Загружаем стаканы…</p>'
    : `${row("Вход на этот объём", bxP(ee.en), bxCls(ee.en), `покупка на ${esc(L.name)}, продажа на ${esc(S.name)}`)}
      ${row("Выход на этот объём", bxP(ee.ex), bxCls(ee.ex), "закрыть обе позиции сейчас")}
      ${row("Комиссия за 4 сделки", `−${(fee * 100).toFixed(3)}% · ${bxUsd(-fee * v)}`, "neg", "открыть и закрыть на обеих биржах")}
      ${row("Фандинг за 8 ч", `${bxP(net * 8, 4)} · ${bxUsd(net * 8 * v)}`, bxCls(net))}
      ${row("Если войти и сразу выйти", `${bxP(now, 3)} · ${bxUsd(now * v)}`, bxCls(now))}
      ${be != null ? row("Фандинг покроет это за", be < 1 ? "меньше часа" : `≈ ${be < 48 ? `${be.toFixed(0)} ч` : `${(be / 24).toFixed(0)} дн.`}`) : ""}
      ${ee.full ? "" : `<p class="bx-warn">В стакане меньше, чем нужно: хватает примерно на $${Math.floor(ee.have).toLocaleString("ru-RU")}</p>`}
      <p class="muted small">Итог по цене ≈ вход + выход. Комиссии — обычные ставки тейкера без скидок, у Totum ${(V_TAKER.hyperliquid * 100).toFixed(2)}%.</p>`;
}
function bxBooks() {
  const el = $("bxBooks");
  if (!el || !BX.r) return;
  const { L, S } = bxSides();
  const one = (s) => {
    const bk = s.bk,
      role = s === L ? "лонг" : "шорт";
    if (!bk) return `<div class="bx-book"><header>${vAva(s.id)}<b>${esc(s.name)}</b><em class="bx-role ${role === "лонг" ? "l" : "s"}">${role}</em></header><p class="muted small">${BX.book ? (BX.W && BX_WS[BX.r.x.v] && s !== bxSides().T ? "Подключаемся к бирже напрямую…" : "Стакан недоступен") : "Загружаем…"}</p></div>`;
    const a = bk.a.slice(0, 10).reverse(),
      b = bk.b.slice(0, 10),
      mx = Math.max(...a.concat(b).map(([p, q]) => p * q), 1),
      ln = (cls) => ([p, q]) => `<div class="bx-lv ${cls}"><i style="width:${((p * q) / mx) * 100}%"></i><span>${tlPx(p / s.m)}</span><span>$${compactUsd(p * q)}</span></div>`,
      sp = bk.a[0] && bk.b[0] ? bk.a[0][0] / bk.b[0][0] - 1 : null;
    return `<div class="bx-book"><header>${vAva(s.id)}<b>${esc(s.name)}</b><em class="bx-role ${role === "лонг" ? "l" : "s"}">${role}</em><small>спред ${sp != null ? `${(sp * 100).toFixed(3)}%` : "—"}</small></header>
      <div class="bx-lvh"><span>Цена</span><span>Объём $</span></div>${a.map(ln("ask")).join("")}<div class="bx-mid">${tlPx(((bk.a[0]?.[0] || 0) + (bk.b[0]?.[0] || 0)) / 2 / s.m)}</div>${b.map(ln("bid")).join("")}</div>`;
  };
  el.innerHTML = `<div class="bx-sheet-h"><b>Стаканы</b><button type="button" data-bxsheet>✕</button></div><div class="bx-books-in">${one(L)}${one(S)}</div>`;
  fixIcons(el);
}
/* ── живые стаканы связки: прямые WebSocket-потоки бирж в браузер ──
   Биржа сама присылает каждое изменение (10 раз в секунду и чаще). Для бирж
   без потока (и пока поток не подключился) — запасной путь через наш сервер. */
function bxSock(url, onOpen, onMsg, ping, every = 2e4) {
  let ws,
    timer,
    closed = !1,
    tries = 0;
  const go = () => {
    try {
      ws = new WebSocket(url);
    } catch {
      return;
    }
    ws.onopen = () => {
      tries = 0;
      onOpen(ws);
      ping && (timer = setInterval(() => ws.readyState === 1 && ws.send(typeof ping === "function" ? ping() : ping), every));
    };
    ws.onmessage = (e) => {
      if (typeof e.data !== "string" || e.data === "pong") return;
      let d;
      try {
        d = JSON.parse(e.data);
      } catch {
        return;
      }
      onMsg(d);
    };
    ws.onclose = () => {
      clearInterval(timer);
      !closed && tries++ < 8 && setTimeout(go, Math.min(1e4, 800 * tries));
    };
    ws.onerror = () => {};
  };
  go();
  return {
    close() {
      closed = !0;
      clearInterval(timer);
      try {
        ws && ws.close();
      } catch {}
    },
  };
}
const bxLB = () => ({ b: new Map(), a: new Map() });
const bxLSet = (m, arr, f = (x) => x) => (arr || []).forEach((x) => {
  const [p, q] = f(x).map(Number);
  p > 0 && (q > 0 ? m.set(p, q) : m.delete(p));
});
const bxSnap = (L, b, a, f) => (L.b.clear(), L.a.clear(), bxLSet(L.b, b, f), bxLSet(L.a, a, f));
const bxTop = (L, k = 1) => ({ b: [...L.b].sort((x, y) => y[0] - x[0]).slice(0, 20).map(([p, q]) => [p, q * k]), a: [...L.a].sort((x, y) => x[0] - y[0]).slice(0, 20).map(([p, q]) => [p, q * k]) });
const BX_CT = new Set(["okx", "gate", "mexc"]); /* стакан в контрактах — нужен размер контракта */
const binWs = (host) => (sym, L, up) => bxSock(`${host}/ws/${sym.toLowerCase()}@depth20@100ms`, () => {}, (d) => d.b && (bxSnap(L, d.b, d.a), up()));
const BX_WS = {
  binance: binWs("wss://fstream.binance.com"),
  aster: binWs("wss://fstream.asterdex.com"),
  bybit: (sym, L, up) =>
    bxSock("wss://stream.bybit.com/v5/public/linear", (ws) => ws.send(JSON.stringify({ op: "subscribe", args: [`orderbook.50.${sym}`] })), (d) => {
      if (!String(d.topic || "").startsWith("orderbook")) return;
      d.type === "snapshot" ? bxSnap(L, d.data.b, d.data.a) : (bxLSet(L.b, d.data.b), bxLSet(L.a, d.data.a));
      up();
    }, JSON.stringify({ op: "ping" })),
  okx: (sym, L, up) =>
    bxSock("wss://ws.okx.com:8443/ws/v5/public", (ws) => ws.send(JSON.stringify({ op: "subscribe", args: [{ channel: "books5", instId: sym }] })), (d) => {
      const x = d.arg?.channel === "books5" && d.data?.[0];
      x && (bxSnap(L, x.bids, x.asks, (v) => [v[0], v[1]]), up());
    }, "ping"),
  bitget: (sym, L, up) =>
    bxSock("wss://ws.bitget.com/v2/ws/public", (ws) => ws.send(JSON.stringify({ op: "subscribe", args: [{ instType: "USDT-FUTURES", channel: "books15", instId: sym }] })), (d) => {
      const x = d.arg?.channel === "books15" && d.data?.[0];
      x && (bxSnap(L, x.bids, x.asks), up());
    }, "ping"),
  gate: (sym, L, up) =>
    bxSock("wss://fx-ws.gateio.ws/v4/ws/usdt", (ws) => ws.send(JSON.stringify({ time: Math.floor(Date.now() / 1e3), channel: "futures.order_book", event: "subscribe", payload: [sym, "20", "0"] })), (d) => {
      const x = d.channel === "futures.order_book" && d.event === "all" && d.result;
      x && (bxSnap(L, x.bids, x.asks, (v) => [v.p, Math.abs(v.s)]), up());
    }, () => JSON.stringify({ time: Math.floor(Date.now() / 1e3), channel: "futures.ping" })),
  mexc: (sym, L, up) =>
    bxSock("wss://contract.mexc.com/edge", (ws) => ws.send(JSON.stringify({ method: "sub.depth.full", param: { symbol: sym, limit: 20 } })), (d) => {
      const x = d.channel === "push.depth.full" && d.data;
      x && (bxSnap(L, x.bids, x.asks, (v) => [v[0], v[1]]), up());
    }, JSON.stringify({ method: "ping" }), 15e3),
  kraken: (sym, L, up) =>
    bxSock("wss://futures.kraken.com/ws/v1", (ws) => ws.send(JSON.stringify({ event: "subscribe", feed: "book", product_ids: [sym] })), (d) => {
      if (d.feed === "book_snapshot") (bxSnap(L, d.bids, d.asks, (v) => [v.price, v.qty]), up());
      else if (d.feed === "book" && d.price != null) (bxLSet(d.side === "buy" ? L.b : L.a, [[d.price, d.qty]]), up());
    }),
  dydx: (sym, L, up) =>
    bxSock("wss://indexer.dydx.trade/v4/ws", (ws) => ws.send(JSON.stringify({ type: "subscribe", channel: "v4_orderbook", id: sym })), (d) => {
      const c = d.contents;
      if (!c) return;
      if (d.type === "subscribed") bxSnap(L, c.bids, c.asks, (v) => [v.price, v.size]);
      else if (d.type === "channel_data") (bxLSet(L.b, c.bids, (v) => (Array.isArray(v) ? v : [v.price, v.size])), bxLSet(L.a, c.asks, (v) => (Array.isArray(v) ? v : [v.price, v.size])));
      else return;
      /* у dYdX бывают «пересёкшиеся» уровни — убираем всё, что хуже лучшей встречной цены */
      const bb = Math.max(...L.b.keys()),
        ba = Math.min(...L.a.keys());
      if (bb >= ba) for (const p of [...L.b.keys()]) p >= ba && L.b.delete(p);
      up();
    }),
};
function bxWsStart() {
  bxWsStop();
  const r = BX.r,
    key = BX.key,
    W = (BX.W = { hl: bxLB(), x: bxLB(), at: { hl: 0, x: 0 }, socks: [], ct: r.x.ct || null, pend: 0 });
  const up = (side) => () => {
    if (BX.key !== key || BX.W !== W) return;
    W.at[side] = Date.now();
    W.pend ||
      (W.pend = setTimeout(() => {
        W.pend = 0;
        if (BX.W !== W) return;
        const book = { ...(BX.book || {}) };
        W.at.hl && (book.hl = bxTop(W.hl));
        W.at.x && (!BX_CT.has(r.x.v) || W.ct) && (book.x = bxTop(W.x, BX_CT.has(r.x.v) ? W.ct : 1));
        BX.book = book;
        bxOnBook();
      }, 150));
  };
  W.socks.push(
    bxSock("wss://api.hyperliquid.xyz/ws", (ws) => ws.send(JSON.stringify({ method: "subscribe", subscription: { type: "l2Book", coin: r.coin } })), (d) => {
      const lv = d.channel === "l2Book" && d.data?.coin === r.coin && d.data.levels;
      lv && (bxSnap(W.hl, lv[0], lv[1], (v) => [v.px, v.sz]), up("hl")());
    }, JSON.stringify({ method: "ping" }), 3e4),
  );
  BX_WS[r.x.v] && W.socks.push(BX_WS[r.x.v](r.x.sym, W.x, up("x")));
}
function bxWsStop() {
  if (!BX.W) return;
  BX.W.socks.forEach((s) => s.close());
  clearTimeout(BX.W.pend);
  BX.W = null;
}
/* поток считается живым, если обновлялся последние 5 с */
const bxLive2 = (side) => BX.W && Date.now() - BX.W.at[side] < 5e3;
function bxOnBook() {
  /* запоминаем вход/выход: из них строится линия «Вход/Выход» */
  const ee = bxEE(0);
  if (ee) {
    const k = `${BX.key}|${BX.dir}`,
      a = (BX.ee[k] = BX.ee[k] || []),
      t = Math.floor(Date.now() / 1e3),
      p = { time: t, en: ee.en * 100, ex: ee.ex * 100 };
    !a.length || a[a.length - 1].time < t ? a.push(p) : (a[a.length - 1] = p);
    a.length > 5000 && a.splice(0, a.length - 5000);
  }
  bxCalc();
  bxBooks();
  bxLive();
  bxHeadEE();
}
/* быстро обновляем только «Вход · Выход» в шапке, не перерисовывая её целиком */
function bxHeadEE() {
  const el = document.querySelector("#bxTop .bx-f.ee b"),
    ee = bxEE(0);
  el && ee && (el.innerHTML = `<em class="${bxCls(ee.en)}">${bxP(ee.en)}</em> · <em class="${bxCls(ee.ex)}">${bxP(ee.ex)}</em>`);
}
async function bxBook() {
  if (!BX.r || BX.bbusy) return;
  if (BX.W && bxLive2("hl") && (bxLive2("x") || !BX_WS[BX.r.x.v]) && BX.W.ct != null && BX_WS[BX.r.x.v]) return;
  BX.bbusy = !0;
  const r = BX.r,
    key = BX.key;
  try {
    const res = await fetch(`/api/bundle?k=book&v=${encodeURIComponent(r.x.v)}&sym=${encodeURIComponent(r.x.sym)}&coin=${encodeURIComponent(r.coin)}`);
    const d = await res.json();
    if (BX.key !== key) return;
    BX.W && BX.W.ct == null && (BX.W.ct = d.x?.ct || 1);
    const book = { ...(BX.book || {}) };
    (!bxLive2("hl") && d.hl) && (book.hl = d.hl);
    (!bxLive2("x") && d.x) && (book.x = d.x);
    BX.book = book;
    bxOnBook();
  } catch {}
  BX.bbusy = !1;
}
const bxHKey = () => `${BX.key}|${BX_TF[BX.tf][0]}`;
async function bxLoad(quiet) {
  const r = BX.r;
  if (!r) return;
  const hk = bxHKey(),
    h = BX.hist[hk];
  bxHead();
  if (h && Date.now() - h.at < 6e4) return bxDraw();
  if (BX.busy) return;
  BX.busy = !0;
  quiet || (bxMsg("Загружаем историю…"), !h && BX.chart && (BX.chart.remove(), (BX.chart = null)));
  try {
    const res = await fetch(`/api/bundle?k=hist&v=${encodeURIComponent(r.x.v)}&sym=${encodeURIComponent(r.x.sym)}&coin=${encodeURIComponent(r.coin)}&i=${BX_TF[BX.tf][0]}`);
    BX.hist[hk] = { at: Date.now(), ...(await res.json()) };
  } catch {
    h ? (h.at = Date.now()) : bxMsg("Не удалось загрузить историю. Попробуем ещё раз через минуту.");
  }
  BX.busy = !1;
  BX.key && bxHKey() === hk && bxDraw();
}
function bxMsg(t) {
  const m = $("bxMsg");
  m && ((m.hidden = !t), (m.textContent = t || ""));
}
/* свечи спреда (шорт / лонг − 1, %) из цен закрытия обеих бирж */
function bxCandles(h) {
  /* спред по полным свечам обеих бирж (открытие, макс., мин., закрытие).
     Если на одной бирже в эту минуту не было сделок — берём её последнюю цену,
     чтобы не было дыр. Свечи мельче таймфрейма собираются в одну. */
  const { T, X } = bxSides(),
    tf = BX_TF[BX.tf][1],
    step = (MIN_OF[h.i] || 5) * 6e4,
    q = (a, m) => new Map((a || []).map((x) => [x[0], x.length > 2 ? [x[1] / m, x[2] / m, x[3] / m, x[4] / m] : [x[1] / m, x[1] / m, x[1] / m, x[1] / m]])),
    tm = q(h.hl?.c, T.m),
    xm = q(h.x?.c, X.m),
    out = [];
  if (!tm.size || !xm.size) return out;
  const t0 = Math.max(Math.min(...tm.keys()), Math.min(...xm.keys())),
    t1 = Math.max(Math.max(...tm.keys()), Math.max(...xm.keys()));
  let pt = null,
    px = null;
  for (let t = Math.floor(t0 / step) * step; t <= t1; t += step) {
    const a = tm.get(t),
      b = xm.get(t);
    a ? (pt = a) : pt && (pt = [pt[3], pt[3], pt[3], pt[3]]);
    b ? (px = b) : px && (px = [px[3], px[3], px[3], px[3]]);
    if (!pt || !px || !(pt[3] > 0 && px[3] > 0)) continue;
    const [S, L] = BX.dir > 0 ? [px, pt] : [pt, px],
      r = (i, j) => (S[i] / L[j] - 1) * 100,
      o = r(0, 0),
      c = r(3, 3),
      hi = Math.max(o, c, r(1, 1), r(2, 2)),
      lo = Math.min(o, c, r(1, 1), r(2, 2)),
      tb = Math.floor(t / 1e3 / tf) * tf,
      last = out[out.length - 1];
    if (last && last.time === tb) ((last.high = Math.max(last.high, hi)), (last.low = Math.min(last.low, lo)), (last.close = c));
    else out.push({ time: tb, open: o, high: hi, low: lo, close: c });
  }
  return out;
}
const MIN_OF = { "1m": 1, "5m": 5, "15m": 15, "1h": 60 };
const bxFund = (a, ih, from) => {
  const out = [];
  for (const [t, v] of a || []) {
    const time = Math.floor(t / 1e3);
    time >= from && (!out.length || time > out[out.length - 1].time) && out.push({ time, value: (v / (ih || 1)) * TL.norm * 100 });
  }
  return out;
};
const bxAt = (a, t) => {
  let v = null;
  for (const p of a) {
    if (p.time > t) break;
    v = p.value;
  }
  return v;
};
function bxDraw() {
  const box = $("bxCh"),
    h = BX.hist[bxHKey()];
  bxHead();
  if (!box || !BX.r) return;
  BX.chart && (BX.chart.remove(), (BX.chart = null));
  BX.S = {};
  if (!h) return;
  const { T, X, L } = bxSides(),
    theme = document.documentElement.dataset.theme === "dark" ? "dark" : "light",
    th = CHART_THEMES[theme],
    css = getComputedStyle(document.documentElement),
    blue = css.getPropertyValue("--accent").trim() || "#2563eb",
    orange = "#f59e0b",
    up = css.getPropertyValue("--buy").trim() || "#16a34a",
    dn = css.getPropertyValue("--sell").trim() || "#e11d48",
    fmt = (dg) => ({ type: "custom", minMove: 1e-6, formatter: (v) => `${v > 0 ? "+" : ""}${v.toFixed(dg)}%` });
  const cs = bxCandles(h),
    from = cs.length ? cs[0].time : Math.floor(Date.now() / 1e3) - 864e5,
    fT = bxFund(h.hl?.f, T.row.ih, from),
    fX = bxFund(h.x?.f, X.row.ih, from);
  const c = createChart(box, {
    autoSize: !0,
    layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: th.text, fontSize: 11, panes: { separatorColor: th.grid, separatorHoverColor: th.grid } },
    grid: { vertLines: { color: th.grid }, horzLines: { color: th.grid } },
    rightPriceScale: { borderVisible: !1 },
    timeScale: { borderVisible: !1, timeVisible: !0, secondsVisible: !1, rightOffset: 4 },
    crosshair: { mode: CrosshairMode.Normal },
    localization: { locale: "ru-RU" },
  });
  BX.chart = c;
  const fLine = (data, color, pane, w = 2) => {
    if (!data.length) return null;
    const s = c.addSeries(LineSeries, { color, lineWidth: w, lineType: LineType.WithSteps, priceFormat: fmt(4), lastValueVisible: !0, priceLineVisible: !1 }, pane);
    s.setData(data);
    return s;
  };
  let sX = null;
  let leg = "";
  if (BX.mode === "candles") {
    if (cs.length < 2) bxMsg(`${esc(X.name)} не отдаёт историю цен для этой монеты — смотрите «Вход/Выход».`);
    else bxMsg("");
    const s = c.addSeries(CandlestickSeries, { upColor: up, downColor: dn, wickUpColor: up, wickDownColor: dn, borderVisible: !1, priceFormat: fmt(3) }, 0);
    s.setData(cs);
    BX.S.c = s;
    s.createPriceLine({ price: 0, color: th.text + "55", lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: !1 });
    BX.S.pe = s.createPriceLine({ price: 0, color: up, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: !0, title: "вход" });
    BX.S.px = s.createPriceLine({ price: 0, color: dn, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: !0, title: "выход" });
    fLine(fT, blue, 1);
    sX = fLine(fX, orange, 1);
    leg = `<i class="lg c">Спред ${BX.dir > 0 ? `${esc(X.name)} / Totum` : `Totum / ${esc(X.name)}`}</i>`;
  } else if (BX.mode === "ee") {
    /* вход и выход свечами: история — свечи спреда с поправкой на нынешние
       стаканы, последняя свеча обновляется по стаканам каждые 3 с */
    const ee0 = bxEE(0),
      { S: Sd } = bxSides();
    BX.S.est = !!ee0;
    if (ee0 && cs.length > 1) {
      const m0 = (bxMid(Sd) / bxMid(L) - 1) * 100,
        dEn = ee0.en * 100 - m0,
        dEx = ee0.ex * 100 + m0,
        one = (col) => ({ upColor: col, downColor: col, wickUpColor: col, wickDownColor: col, borderVisible: !1, priceFormat: fmt(3), priceLineVisible: !0, priceLineColor: col, priceLineStyle: LineStyle.Dotted });
      BX.S.ce = c.addSeries(CandlestickSeries, { ...one(up), title: "вход" }, 0);
      BX.S.cx = c.addSeries(CandlestickSeries, { ...one(dn), title: "выход" }, 0);
      BX.S.ce.setData(cs.map((k) => ({ time: k.time, open: k.open + dEn, high: k.high + dEn, low: k.low + dEn, close: k.close + dEn })));
      BX.S.cx.setData(cs.map((k) => ({ time: k.time, open: -k.open + dEx, high: -k.low + dEx, low: -k.high + dEx, close: -k.close + dEx })));
      BX.S.ce.createPriceLine({ price: 0, color: th.text + "55", lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: !1 });
      bxMsg("");
    } else {
      const a = BX.ee[`${BX.key}|${BX.dir}`] || [];
      BX.S.en = c.addSeries(LineSeries, { color: up, lineWidth: 2, priceFormat: fmt(3), priceLineVisible: !1, title: "вход" }, 0);
      BX.S.ex = c.addSeries(LineSeries, { color: dn, lineWidth: 2, priceFormat: fmt(3), priceLineVisible: !1, title: "выход" }, 0);
      BX.S.en.setData(a.map((p) => ({ time: p.time, value: p.en })));
      BX.S.ex.setData(a.map((p) => ({ time: p.time, value: p.ex })));
      bxMsg(ee0 ? (a.length < 3 ? "У биржи нет истории свечей — вход и выход рисуем по стаканам, пока окно открыто." : "") : "Загружаем стаканы…");
    }
    fLine(fT, blue, 1);
    sX = fLine(fX, orange, 1);
    leg = `<i class="lg en">вход</i><i class="lg ex">выход</i>`;
  } else {
    bxMsg(fT.length || fX.length ? "" : "Нет истории ставок.");
    fLine(fT, blue, 0, 2);
    sX = fLine(fX, orange, 0, 2);
    /* накопленный фандинг связки: каждый час — ставка шорта минус ставка лонга */
    const sh = fT.length || fX.length ? [] : null;
    if (sh) {
      const t0 = Math.ceil(from / 3600) * 3600,
        now = Math.floor(Date.now() / 1e3);
      let acc = 0;
      for (let t = t0; t <= now; t += 3600) {
        const rt = bxAt(fT, t),
          rx = bxAt(fX, t);
        if (rt == null || rx == null) continue;
        acc += ((L.id === "hyperliquid" ? rx - rt : rt - rx) / TL.norm);
        sh.push({ time: t, value: acc });
      }
      sh.length &&
        c.addSeries(BaselineSeries, { baseValue: { type: "price", price: 0 }, lineWidth: 2, topLineColor: up, topFillColor1: up + "33", topFillColor2: up + "05", bottomLineColor: dn, bottomFillColor1: dn + "05", bottomFillColor2: dn + "33", priceFormat: fmt(3), priceLineVisible: !1, title: "накоплено" }, 1).setData(sh);
    }
    leg = `<i class="lg acc">накопленный фандинг связки</i>`;
  }
  {
    /* ставка биржи подписью у каждой её выплаты (если выплаты не каждый час) */
    sX &&
      X.row.ih >= 4 &&
      fX.length < 200 &&
      createSeriesMarkers(sX, fX.map((p) => ({ time: p.time, position: "aboveBar", color: orange, shape: "circle", size: 0.5, text: `${p.value > 0 ? "+" : ""}${p.value.toFixed(3)}%` })));
  }
  const panes = c.panes();
  panes[1] && panes[1].setStretchFactor(BX.mode === "funding" ? 0.6 : 0.28);
  panes[0] && panes[0].setStretchFactor(1);
  $("bxLeg").innerHTML = `${leg}<i class="lg t">Totum ${TL.norm === 1 ? "за 1 ч" : "за 8 ч"}</i><i class="lg x">${esc(X.name)}</i>`;
  const nBars = BX.mode === "funding" ? 0 : cs.length;
  nBars > 150 ? c.timeScale().setVisibleLogicalRange({ from: nBars - 150, to: nBars + 4 }) : c.timeScale().fitContent();
  /* подсказка под курсором: спред и ставки обеих бирж */
  const tip = $("bxTip");
  c.subscribeCrosshairMove((p) => {
    if (!p.time || !p.point || p.point.x < 0) return void (tip.hidden = !0);
    const d = new Date(p.time * 1e3).toLocaleString("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", second: BX.mode === "ee" ? "2-digit" : void 0 }),
      f2 = (v) => (v == null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(3)}%`),
      f4 = (v) => (v == null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(4)}%`);
    let rows = "";
    if (BX.S.c) {
      const k = p.seriesData.get(BX.S.c);
      k && (rows += `<div><span>Открытие</span><b>${f2(k.open)}</b></div><div><span>Макс.</span><b>${f2(k.high)}</b></div><div><span>Мин.</span><b>${f2(k.low)}</b></div><div><span>Закрытие</span><b>${f2(k.close)}</b></div>`);
    }
    if (BX.S.ce) {
      const a = p.seriesData.get(BX.S.ce),
        b = p.seriesData.get(BX.S.cx);
      a && (rows += `<div><span><i class="dot en"></i>Вход</span><b>${f2(a.close)}</b></div>`);
      b && (rows += `<div><span><i class="dot ex"></i>Выход</span><b>${f2(b.close)}</b></div>`);
    }
    if (BX.S.en) {
      const a = p.seriesData.get(BX.S.en),
        b = p.seriesData.get(BX.S.ex);
      a && (rows += `<div><span><i class="dot en"></i>Вход</span><b>${f2(a.value)}</b></div>`);
      b && (rows += `<div><span><i class="dot ex"></i>Выход</span><b>${f2(b.value)}</b></div>`);
    }
    rows += `<div><span><i class="dot t"></i>Фандинг Totum</span><b>${f4(bxAt(fT, p.time))}</b></div><div><span><i class="dot x"></i>Фандинг ${esc(X.name)}</span><b>${f4(bxAt(fX, p.time))}</b></div>`;
    tip.innerHTML = `<header>${d}</header>${rows}`;
    tip.hidden = !1;
    const W = box.clientWidth,
      x = p.point.x + 16 + 210 > W ? p.point.x - 226 : p.point.x + 16;
    tip.style.transform = `translate(${Math.max(4, x)}px, ${Math.max(4, Math.min(p.point.y - 20, box.clientHeight - 220))}px)`;
  });
  bxLive();
}
/* живое обновление: последняя свеча и линии входа/выхода по стаканам */
function bxLive() {
  if (!BX.chart) return;
  const ee = bxEE(0);
  if (!ee) return;
  if (BX.S.c) {
    BX.S.pe.applyOptions({ price: ee.en * 100 });
    BX.S.px.applyOptions({ price: -ee.ex * 100 });
    const { L, S } = bxSides(),
      v = (bxMid(S) / bxMid(L) - 1) * 100,
      tf = BX_TF[BX.tf][1],
      t = Math.floor(Date.now() / 1e3 / tf) * tf,
      d = BX.S.c.data(),
      last = d[d.length - 1];
    if (last && t >= last.time && Number.isFinite(v))
      try {
        BX.S.c.update(last.time === t ? { time: t, open: last.open, high: Math.max(last.high, v), low: Math.min(last.low, v), close: v } : { time: t, open: last.close, high: Math.max(last.close, v), low: Math.min(last.close, v), close: v });
      } catch {}
  }
  if (BX.S.ce) {
    const tf = BX_TF[BX.tf][1],
      t = Math.floor(Date.now() / 1e3 / tf) * tf,
      upd = (ser, v) => {
        const d = ser.data(),
          last = d[d.length - 1];
        if (!last || t < last.time || !Number.isFinite(v)) return;
        try {
          ser.update(last.time === t ? { time: t, open: last.open, high: Math.max(last.high, v), low: Math.min(last.low, v), close: v } : { time: t, open: last.close, high: Math.max(last.close, v), low: Math.min(last.close, v), close: v });
        } catch {}
      };
    upd(BX.S.ce, ee.en * 100);
    upd(BX.S.cx, ee.ex * 100);
  }
  if (BX.S.en) {
    const a = BX.ee[`${BX.key}|${BX.dir}`] || [],
      p = a[a.length - 1];
    if (p)
      try {
        BX.S.en.update({ time: p.time, value: p.en });
        BX.S.ex.update({ time: p.time, value: p.ex });
      } catch {}
  }
  BX.mode === "ee" && !BX.S.est && bxDraw();
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
S.margin = "isolated"; /* по умолчанию — изолированная маржа и плечо 1x: безопаснее для новичка */
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
  if (riskActive()) {
    /* в режиме риска направление уже выбрано — подсказки «если лонг / если шорт» не нужны */
    $("tpHint").innerHTML = $("slHint").innerHTML = "";
    return;
  }
  let i = orderPreview(!0),
    t = orderPreview(!1);
  if (!i) return;
  let e = (n) => {
    let s = readTrig(n, "ord", n, i),
      r = readTrig(n, "ord", n, t);
    if (!s && !r) return "";
    let o = (a, c) => {
      let l = pxPnl(a.entry, c, a.sz, a.long);
      return `<b class="${l >= 0 ? "pos" : "neg"}">${l >= 0 ? "+" : "−"}${usd(Math.abs(l))}</b>`;
    };
    return UNITS.ord === "pct"
      ? `<span class="th-chip">Лонг ${fmtPx(s)} ${o(i, s)}</span><span class="th-chip">Шорт ${fmtPx(r)} ${o(t, r)}</span>`
      : `<span class="th-chip">Если лонг ${o(i, s)}</span><span class="th-chip">Если шорт ${o(t, r)}</span>`;
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
  if (riskActive()) return S.riskSide !== false;
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
  const long = S.riskSide !== false,
    pv0 = { entry, long };
  const sl = readTrig("sl", "ord", "sl", pv0);
  if (!(sl > 0) || sl === entry || (long ? sl >= entry : sl <= entry))
    return { err: "Поставьте стоп-лосс — от него считается размер" };
  if (!(risk > 0)) return { err: "Укажите, сколько готовы потерять" };
  const perUnit = Math.abs(entry - sl);
  const sz = risk / perUnit;
  const notional = sz * entry;
  const tp = readTrig("tp", "ord", "tp", pv0);
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
/* Средний размах свечи (ATR 14) на открытом графике — для стопа по умолчанию */
function atr14() {
  const b = S.bars || [];
  if (b.length < 15) return 0;
  let sum = 0;
  for (let k = b.length - 14; k < b.length; k++) {
    const pc = b[k - 1].close;
    sum += Math.max(b[k].high - b[k].low, Math.abs(b[k].high - pc), Math.abs(b[k].low - pc));
  }
  return sum / 14;
}
function setTrigField(k, px, entry, long) {
  if (!(px > 0)) return;
  $(k).value =
    UNITS.ord === "pct" ? +pctFromPx(k, px, { entry, long }).toFixed(2) : Number(px.toFixed(pxDecimals(px)));
}
/* Стоп и тейк сами: человек задаёт одно из двух (или ничего) — второе
   считается по выбранному соотношению прибыль/риск. Ничего не задано —
   стоп по волатильности графика (1,5 × ATR, не ближе 0,3% от цены). */
function riskAuto() {
  const entry = planEntry();
  if (!(entry > 0)) return;
  const long = S.riskSide !== false,
    pv = { entry, long },
    rr = Number(SET.riskRR) || 2,
    dir = long ? 1 : -1;
  let sl = readTrig("sl", "ord", "sl", pv),
    tp = readTrig("tp", "ord", "tp", pv);
  const slOk = sl > 0 && (long ? sl < entry : sl > entry),
    tpOk = tp > 0 && (long ? tp > entry : tp < entry);
  if (S.riskAnchor === "tp" && tpOk) {
    setTrigField("sl", entry - (dir * Math.abs(tp - entry)) / rr, entry, long);
  } else if (S.riskAnchor === "sl" && slOk) {
    setTrigField("tp", entry + dir * Math.abs(entry - sl) * rr, entry, long);
  } else if (!slOk) {
    const d = Math.max(1.5 * atr14(), entry * 0.003);
    setTrigField("sl", entry - dir * d, entry, long);
    setTrigField("tp", entry + dir * d * rr, entry, long);
  } else if (!tpOk) {
    setTrigField("tp", entry + dir * Math.abs(entry - sl) * rr, entry, long);
  }
}
function setRiskSide(long) {
  if ((S.riskSide !== false) === long) return;
  S.riskSide = long;
  SET.riskSide = long ? "long" : "short";
  saveSettings();
  /* направление сменилось — стоп и тейк перестраиваем по той же логике */
  /* в процентах это расстояния — переносятся как есть; в ценах — строим заново */
  if (UNITS.ord === "px") {
    $("sl").value = "";
    $("tp").value = "";
    S.riskAnchor = null;
  }
  updateOrderInfo();
  drawChartLines();
}
function riskSync() {
  const on = riskActive();
  if (on) {
    document.querySelectorAll("[data-rside]").forEach((b) => b.classList.toggle("on", (b.dataset.rside === "long") === (S.riskSide !== false)));
    document.querySelectorAll("[data-rr]").forEach((b) => b.classList.toggle("on", Number(b.dataset.rr) === (Number(SET.riskRR) || 2)));
    riskAuto();
  }
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
    $("riskHint").innerHTML = `<div class="rk-empty">${r.err}</div>`;
    return;
  }
  $("size").value = Math.floor(r.notional * 100) / 100;
  $("pct").value = 0;
  paintRange($("pct"));
  $(r.long ? "btnSell" : "btnBuy")?.classList.add("risk-dim");
  const base = baseOf(),
    rr = r.tp ? r.reward / r.risk : 0,
    lossW = rr ? 100 / (1 + rr) : 100,
    /* сколько можно рискнуть, чтобы позиция влезла в депозит при текущем плече */
    riskFit = Math.floor(((r.avail * r.lev * Math.abs(r.entry - r.sl)) / r.entry) * 100) / 100;
  let html = `<div class="rk-card ${r.long ? "long" : "short"}">
    <div class="rk-head"><span class="rk-side">${r.long ? "Лонг" : "Шорт"}</span>${rr ? `<span class="rk-rr">прибыль / риск <b>1 : ${rr.toFixed(1)}</b></span>` : ""}</div>
    <div class="rk-grid">
      <div><span>Позиция</span><b>${num(r.sz, 4)} ${esc(base)}</b><em>${usd(r.notional)}</em></div>
      <div><span>Маржа</span><b>${usd(r.notional / r.lev)}</b><em>плечо ${r.lev}x</em></div>
      <div class="neg"><span>Если стоп</span><b>−${usd(r.risk)}</b></div>
      <div class="pos"><span>Если тейк</span><b>${r.tp ? `+${usd(r.reward)}` : "—"}</b></div>
    </div>
    <div class="rk-bar"><i class="l" style="width:${lossW}%"></i><i class="w" style="width:${100 - lossW}%"></i></div>
    <div class="rk-fee">Комиссия за вход и выход ≈ <b>${usd(r.feeSl)}</b> · ${((r.feeSl / (r.notional / r.lev)) * 100).toFixed(2)}% от маржи</div>
  </div>`;
  const alert = (kind, title, text, btns = "") =>
    `<div class="rk-alert ${kind}"><div><b>${title}</b><span>${text}</span></div>${btns ? `<div class="rk-acts">${btns}</div>` : ""}</div>`;
  const fitBtn = riskFit > 0 && riskFit < r.risk ? `<button type="button" data-rk-risk="${riskFit}">Риск ${usd(riskFit)}</button>` : "";
  if (r.needLev > r.maxLev)
    html += alert("danger", "Позиция не влезает в депозит", `Даже на максимальном плече ${r.maxLev}x не хватит маржи. Уменьшите риск или отодвиньте стоп.`, fitBtn);
  else if (r.needLev > r.lev)
    html += alert(
      "warn",
      "Не хватает маржи",
      `Нужно плечо от ${Math.ceil(r.needLev)}x или меньший риск.`,
      `<button type="button" data-rk-lev="${Math.ceil(r.needLev)}">Плечо ${Math.ceil(r.needLev)}x</button>${fitBtn}`,
    );
  if (r.liqFirst) html += alert("danger", "Ликвидация раньше стопа", `Цена ликвидации ${fmtPx(r.liq)} ближе стопа — уменьшите плечо.`);
  $("riskHint").innerHTML = html;
  $("riskHint").querySelectorAll("[data-rk-lev]").forEach((b) => (b.onclick = () => setLeverage(Number(b.dataset.rkLev))));
  $("riskHint").querySelectorAll("[data-rk-risk]").forEach(
    (b) =>
      (b.onclick = () => {
        $("riskUsd").value = b.dataset.rkRisk;
        SET.riskUsd = b.dataset.rkRisk;
        saveSettings();
        updateOrderInfo();
        drawChartLines();
      }),
  );
}
function toggleRisk(on) {
  SET.riskOn = !!on;
  saveSettings();
  if (on) {
    $("tpslOn").checked = true;
    $("tpslRow").hidden = false;
    S.riskAnchor = null;
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
    ((p?.filled || p?.resting) && (tradeSound(i), SET.adlAlert !== !1 && "Notification" in window && Notification.permission === "default" && Notification.requestPermission().catch(() => {})),
    p?.filled
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
/* Звук сделки: монеты вверх — покупка/лонг, вниз — продажа/шорт */
const SOUNDS = {};
function tradeSound(buy) {
  if (SET.sound === !1) return;
  try {
    const k = buy ? "buy" : "sell";
    SOUNDS[k] = SOUNDS[k] || new Audio(`sounds/${k}.mp3`);
    SOUNDS[k].volume = 0.6;
    SOUNDS[k].currentTime = 0;
    SOUNDS[k].play().catch(() => {});
  } catch {}
}
const TOTUM_CLOID = "0x746f74756d"; /* «totum» в начале идентификатора ордера */
const totumCloid = () =>
  TOTUM_CLOID + [...crypto.getRandomValues(new Uint8Array(11))].map((b) => b.toString(16).padStart(2, "0")).join("");
/* Ордер не теряется и не дублируется при плохой связи. Каждой заявке — свой
   идентификатор (cloid). Если ответ биржи не дошёл, через 1,5 с спрашиваем биржу,
   есть ли заявка с этим cloid: есть — считаем отправленной, нет — шлём ещё раз
   с тем же cloid (биржа не примет второй ордер с тем же номером). */
function safeOrders(ex) {
  const orig = ex.order.bind(ex);
  ex.order = async (params, ...rest) => {
    const orders = (params.orders || []).map((o) => (o.c ? o : { ...o, c: totumCloid() }));
    params = { ...params, orders };
    const net = (e) => /Failed to fetch|timed out|timeout|NetworkError|network|Load failed/i.test(String(e?.message || e));
    for (let k = 0; ; k++) {
      try {
        return await orig(params, ...rest);
      } catch (err) {
        if (!net(err) || k >= 2 || !S.user) throw err;
        await new Promise((r) => setTimeout(r, 1500));
        const st = await info.orderStatus({ user: S.user, oid: orders[0].c }).catch(() => null);
        if (st?.status === "order" && st.order?.order) {
          const o = st.order.order;
          const filled = st.order.status === "filled";
          console.warn("[связь] ответ не дошёл, но ордер на бирже есть:", st.order.status);
          return { status: "ok", response: { type: "order", data: { statuses: [filled ? { filled: { totalSz: o.origSz, avgPx: o.limitPx, oid: o.oid } } : { resting: { oid: o.oid } }] } } };
        }
        console.warn("[связь] ордер не дошёл до биржи — отправляем ещё раз");
      }
    }
  };
  return ex;
}
const viaTotum = (f) => Number(f.builderFee || 0) > 0 || String(f.cloid || "").toLowerCase().startsWith(TOTUM_CLOID);
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
    /* количество — только вниз: при покупке комиссия списывается в купленной монете
       (купил 0,34 HYPE — пришло 0,3398), и округление вверх давало «не хватает баланса» */
    const fl = (x) => {
      const k = 10 ** r.szDecimals;
      return formatSize(Math.floor(x * k + 1e-9) / k, r.szDecimals);
    };
    if (!i) {
      let h = spotBal(e);
      (Number(a) > h || Number($("pct").value) === 100) && (a = fl(h));
    } else {
      const usdc = spotBal("USDC");
      Number(a) * Number(o) > usdc && (a = fl(usdc / Number(o)));
    }
    if (Number(a) * Number(o) < 10) throw new Error("Слишком маленький ордер: на Hyperliquid минимум 10 USDC. Остаток дешевле $10 продать нельзя — докупите до $10 или оставьте как есть.");
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
            c: totumCloid(),
          },
        ],
        grouping: "na",
        builder: builderParam(),
      })
    ).response.data.statuses[0];
    ((l?.filled || l?.resting) && tradeSound(i),
    l?.filled
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
    ($("trFrom").textContent = i ? "Спот" : "Фьючерсы"),
    ($("trTo").textContent = i ? "Фьючерсы" : "Спот"),
    ($("trAmt").value = ""),
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
  /* при медленной связи кнопку жали много раз — пока закрытие идёт, повтор не шлём */
  S.closing = S.closing || {};
  if (S.closing[i]) return (toast("Закрытие уже отправлено — ждём ответ биржи", "info"), !1);
  S.closing[i] = !0;
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
    /* сразу убираем закрытую позицию с экрана, не дожидаясь обновления счёта */
    e >= 1 && ((S.positions = S.positions.filter((q) => q.coin !== i)), renderPositions(), scOn() && (scRender(), scSideRender()));
    return (
      n || toast(e >= 1 ? `Позиция ${i} закрыта` : `Закрыто ${Math.round(e * 100)}% позиции ${i}`, "ok"),
      (fundingAt = 0),
      n || (await refreshAccount()),
      !0
    );
  } catch (a) {
    /* позиции уже нет — обновим счёт, чтобы кнопка «закрыть» пропала */
    /Reduce only/i.test(String(a?.message || a)) && refreshAccount();
    return (toast(humanError(a), "err"), !1);
  } finally {
    S.closing[i] = !1;
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
      `Вход ${fmtPx(e.entryPx)} · маркировка ${fmtPx(S.ctx[i]?.markPx || 0)} · размер ${Math.abs(Number(e.szi))} ${i}. Тейк и стоп закроют всю позицию.`));
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
/* ═══════════ Лента трейдеров ═══════════
   Пост подписывается ключом для сделок (он уже на устройстве) — окна кошелька нет.
   Сервер проверяет на Hyperliquid, что ключ выдан этим кошельком. Позицию к посту
   сервер тоже берёт с Hyperliquid сам — нарисовать прибыль нельзя. */
var FEED = { posts: [], more: !1, busy: 0, t: 0, nodb: !1, err: "", att: null, media: [], up: 0, video: !1, fp: "open" };
const agoRu = (t) => {
  const s = Math.max(1, Math.floor((Date.now() - t) / 1e3));
  return s < 60 ? "только что" : s < 3600 ? `${Math.floor(s / 60)} мин назад` : s < 86400 ? `${Math.floor(s / 3600)} ч назад` : new Date(t).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
};
function feedOpen() {
  feedCompose();
  feedLoad();
  clearInterval(FEED.t);
  FEED.t = setInterval(() => document.body.dataset.cp === "feed" && !document.hidden && feedLoad(!1, !0), 2e4);
}
function feedCompose() {
  feedAttsRender();
  $("feedHint").textContent = !S.user
    ? "Подключите кошелёк, чтобы писать в ленту"
    : !S.agent
      ? "Включите торговлю — пост подписывается ключом для сделок, без окна кошелька"
      : "Пост подписан вашим ключом — подделать автора нельзя";
}
async function feedLoad(more = !1, quiet = !1) {
  if (FEED.busy) return;
  FEED.busy = 1;
  try {
    const r = await fetch(`/api/feed?from=${more ? FEED.posts.length : 0}&me=${S.user || ""}`, { signal: AbortSignal.timeout(12e3) });
    if (r.status === 503 || r.status === 404) FEED.nodb = !0;
    else {
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || r.status);
      FEED.nodb = !1;
      FEED.err = "";
      FEED.posts = more ? [...FEED.posts, ...d.posts] : d.posts;
      FEED.video = !!d.video;
      FEED.more = d.more;
    }
  } catch (e) {
    quiet || (FEED.err = "Лента не загрузилась — проверьте интернет");
  }
  FEED.busy = 0;
  feedRender();
}
async function feedSigned(act, payload, extra = {}) {
  if (!S.user) throw new Error("Подключите кошелёк");
  if (!S.agent) throw new Error("Включите торговлю: пост подписывается ключом для сделок");
  const ts = Date.now(),
    msg = `Totum feed\n${act}\n${S.user.toLowerCase()}\n${ts}\n${payload}`,
    sig = await S.agent.signMessage({ message: msg });
  const r = await fetch("/api/feed", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ user: S.user, agent: S.agent.address, ts, sig, act, payload, ...extra }) });
  const d = await r.json().catch(() => ({}));
  if (r.status === 503) throw new Error("Лента ещё не подключена к базе");
  if (!r.ok) throw new Error(d.error || `Ошибка ${r.status}`);
  return d;
}
function feedAvatar(u) {
  return `<span class="fd-av" style="--h:${icHue(u)}">${esc(u.slice(2, 4))}</span>`;
}
function feedMedia(m) {
  if (!m?.length) return "";
  return `<div class="fd-media n${Math.min(m.length, 4)}">${m
    .map((x) => (x.k === "vid" ? `<video src="${esc(x.u)}" controls playsinline preload="metadata"></video>` : `<img src="${esc(x.u)}" alt="" loading="lazy" decoding="async" data-feed="view">`))
    .join("")}</div>`;
}
function feedPos(p) {
  if (!p) return "";
  if (p.kind === "closed") {
    const pnl = Number(p.pnl),
      roe = p.roe != null ? Number(p.roe) * 100 : null,
      long = /Long/.test(p.dir || "");
    return `<div class="fd-pos ${pnl >= 0 ? "up" : "dn"}" data-go="${esc(p.coin)}">
    ${coinIcon(p.coin)}<div><b>${esc(dexBase(p.coin))} <em class="fd-cl">закрыта</em></b><small>${long ? "Лонг" : "Шорт"} · ${p.entry ? `вход ${fmtPx(p.entry)} → ` : ""}выход ${fmtPx(p.px)}</small></div>
    <div class="fd-pnl"><b>${roe != null ? `${roe >= 0 ? "+" : ""}${roe.toFixed(1)}%` : sgnUsd(pnl)}</b><small>${sgnUsd(pnl)} · ${new Date(p.at).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}</small></div>
    <span class="fd-ok" title="Сделка найдена в истории Hyperliquid">✓ Hyperliquid</span></div>`;
  }
  const long = Number(p.szi) > 0,
    pnl = Number(p.pnl),
    roe = Number(p.roe) * 100;
  return `<div class="fd-pos ${pnl >= 0 ? "up" : "dn"}" data-go="${esc(p.coin)}">
    ${coinIcon(p.coin)}<div><b>${esc(dexBase(p.coin))}</b><small>${long ? "Лонг" : "Шорт"} ${p.lev ? `${esc(p.lev)}x` : ""} · вход ${fmtPx(p.entry)}</small></div>
    <div class="fd-pnl"><b>${pnl >= 0 ? "+" : ""}${roe.toFixed(1)}%</b><small>${sgnUsd(pnl)}</small></div>
    <span class="fd-ok" title="Цифры взяты с Hyperliquid в момент публикации">✓ Hyperliquid</span></div>`;
}
function feedRender() {
  const el = $("feedList");
  if (!el) return;
  if (FEED.nodb) return void (el.innerHTML = '<div class="empty-state"><b>Лента почти готова</b><p>Осталось подключить базу данных — тогда посты начнут сохраняться.</p></div>');
  if (FEED.err && !FEED.posts.length) return void (el.innerHTML = `<div class="empty-state"><b>${esc(FEED.err)}</b><p><button class="btn small ghost" type="button" data-feed="reload">Повторить</button></p></div>`);
  if (!FEED.posts.length) return void (el.innerHTML = '<div class="empty-state"><b>Здесь пока пусто</b><p>Будьте первым: расскажите о сделке или идее. Приложенная позиция покажет настоящий PnL с Hyperliquid.</p></div>');
  const me = (S.user || "").toLowerCase();
  morphInto(
    el,
    FEED.posts
      .map(
        (p) => `<article class="fd-post" data-id="${esc(p.id)}">
      <header>${feedAvatar(p.user)}<div><b>${esc(short(p.user))}</b><small>${agoRu(p.ts)}</small></div>${p.user === me ? `<button class="fd-del" type="button" data-feed="del" title="Удалить пост">✕</button>` : ""}</header>
      ${p.text ? `<p>${esc(p.text).replace(/\n/g, "<br>")}</p>` : ""}
      ${feedPos(p.pos)}${feedMedia(p.media)}
      <footer><button type="button" class="fd-like${p.liked ? " on" : ""}" data-feed="like"><svg viewBox="0 0 24 24"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg><span>${p.likes || ""}</span></button></footer>
    </article>`,
      )
      .join("") + (FEED.more ? '<button class="btn ghost small fd-more" type="button" data-feed="more">Показать ещё</button>' : ""),
  ) && fixIcons(el);
}
async function feedPublish() {
  const t = $("feedText").value.trim(),
    b = $("feedGo");
  if (t.length < 2 && !FEED.att && !FEED.media.length) return toast("Напишите пару слов, приложите позицию или фото", "err");
  if (FEED.up) return toast("Подождите — файл ещё загружается", "info");
  setBusy(b, !0, "Публикуем…");
  try {
    const d = await feedSigned("post", JSON.stringify({ text: t, att: FEED.att, media: FEED.media.filter((x) => x.u) }));
    $("feedText").value = "";
    FEED.att = null;
    FEED.media = [];
    feedAttsRender();
    FEED.posts = [d.post, ...FEED.posts.filter((x) => x.id !== d.post.id)];
    FEED.nodb = !1;
    feedRender();
  } catch (e) {
    toast(e.message || String(e), "err");
  }
  setBusy(b, !1);
}
function feedView(src) {
  $("fvBody").innerHTML = `<img src="${esc(src)}" alt="">`;
  $("feedView").showModal();
}
/* вложения в черновике: позиция и файлы */
function feedAttsRender() {
  const el = $("feedAtts");
  if (!el) return;
  const a = FEED.att;
  el.innerHTML =
    (a ? `<span class="fc-chip">${coinIcon(a.coin)}<b>${esc(dexBase(a.coin))}</b><small>${esc(a.label)}</small><button type="button" data-fcx="att" aria-label="Убрать">✕</button></span>` : "") +
    FEED.media.map((m, k) => `<span class="fc-thumb${m.u ? "" : " up"}">${m.k === "vid" ? `<video src="${esc(m.prev)}" muted></video>` : `<img src="${esc(m.prev)}" alt="">`}${m.u ? "" : "<i></i>"}<button type="button" data-fcx="${k}" aria-label="Убрать">✕</button></span>`).join("");
  el.hidden = !el.innerHTML;
}
function feedPickRender() {
  const list = $("fpList"),
    tab = FEED.fp;
  document.querySelectorAll("[data-fp]").forEach((b) => b.classList.toggle("on", b.dataset.fp === tab));
  let rows = [];
  if (tab === "open")
    rows = S.positions.map((p) => {
      const c = S.ctx[p.coin],
        pnl = Number(p.unrealizedPnl || 0),
        long = Number(p.szi) > 0;
      return { kind: "open", coin: p.coin, label: `${long ? "Лонг" : "Шорт"} ${p.leverage?.value || ""}x`, pnl, sub: `вход ${fmtPx(p.entryPx)}${c ? ` · сейчас ${fmtPx(c.markPx)}` : ""}` };
    });
  else {
    /* закрытые сделки: заявки, у которых есть закрытый PnL (из истории сделок) */
    const by = new Map();
    for (const f of S.fills || []) {
      if (!Number(f.closedPnl) || !/Close|>/.test(f.dir || "")) continue;
      const o = by.get(f.oid) || { kind: "closed", oid: f.oid, coin: f.coin, dir: f.dir, pnl: 0, sz: 0, time: f.time, px: f.px };
      o.pnl += Number(f.closedPnl) - Number(f.fee || 0);
      o.sz += Number(f.sz);
      by.set(f.oid, o);
    }
    rows = [...by.values()].sort((a, b) => b.time - a.time).slice(0, 40).map((o) => ({ ...o, label: /Long/.test(o.dir) ? "Лонг закрыт" : "Шорт закрыт", sub: `${new Date(o.time).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · выход ${fmtPx(o.px)}` }));
  }
  FEED.fpRows = rows;
  list.innerHTML = rows.length
    ? rows.map((r, k) => `<button type="button" class="fp-row" data-fpi="${k}">${coinIcon(r.coin)}<div><b>${esc(dexBase(r.coin))} <small>${esc(r.label)}</small></b><span>${esc(r.sub)}</span></div><em class="${r.pnl >= 0 ? "pos" : "neg"}">${sgnUsd(r.pnl)}</em></button>`).join("")
    : `<p class="muted pad">${tab === "open" ? "Открытых позиций нет" : "Закрытых сделок пока нет"}</p>`;
  fixIcons(list);
}
async function feedOpenPick() {
  if (!S.user) return toast("Подключите кошелёк", "err");
  FEED.fp = S.positions.length ? "open" : "closed";
  if (!S.fills?.length)
    try {
      S.fills = (await info.userFills({ user: S.user })) || [];
    } catch {}
  feedPickRender();
  $("feedPick").showModal();
}
/* фото сжимаем в браузере (до 1600 px, WebP) — пост грузится быстро даже на мобильном интернете */
async function feedShrink(file) {
  const img = await createImageBitmap(file).catch(() => null);
  if (!img) throw new Error("Не получилось открыть картинку");
  const k = Math.min(1, 1600 / Math.max(img.width, img.height)),
    c = document.createElement("canvas");
  c.width = Math.round(img.width * k);
  c.height = Math.round(img.height * k);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  for (const q of [0.82, 0.7, 0.55, 0.4]) {
    const b = await new Promise((r) => c.toBlob(r, "image/webp", q));
    if (b && b.size < 580e3) return { blob: b, w: c.width, h: c.height };
  }
  throw new Error("Картинка слишком большая");
}
const blob64 = (blob) => new Promise((r) => { const f = new FileReader(); f.onload = () => r(String(f.result).split(",")[1]); f.readAsDataURL(blob); });
async function feedFiles(files) {
  for (const file of [...files].slice(0, 4 - FEED.media.length)) {
    const vid = /^video\//.test(file.type),
      m = { k: vid ? "vid" : "img", prev: URL.createObjectURL(file), u: "" };
    if (vid && !FEED.video) {
      toast("Видео включится, когда подключат хранилище файлов. Пока можно фото.", "info");
      continue;
    }
    if (vid && file.size > 3.2e6) {
      toast("Видео до 3 МБ (около 15–20 секунд)", "err");
      continue;
    }
    FEED.media.push(m);
    FEED.up++;
    feedAttsRender();
    try {
      const { blob, w, h } = vid ? { blob: file, w: 0, h: 0 } : await feedShrink(file);
      const type = vid ? file.type : "image/webp",
        data = await blob64(blob);
      const d = await feedSigned("upload", JSON.stringify({ size: blob.size, type }), { data });
      Object.assign(m, { u: d.u, w, h });
    } catch (e) {
      FEED.media = FEED.media.filter((x) => x !== m);
      toast(e.message || String(e), "err");
    }
    FEED.up--;
    feedAttsRender();
  }
}
async function feedClick(e) {
  const a = e.target.closest("[data-feed]"),
    go = e.target.closest("[data-go]");
  if (!a) return void (go && switchCoin(go.dataset.go));
  const id = a.closest("[data-id]")?.dataset.id,
    k = a.dataset.feed;
  if (k === "view") return feedView(a.src);
  if (k === "more") return feedLoad(!0);
  if (k === "reload") return feedLoad();
  const p = FEED.posts.find((x) => x.id === id);
  if (!p) return;
  try {
    if (k === "like") {
      p.liked = !p.liked;
      p.likes = (p.likes || 0) + (p.liked ? 1 : -1);
      feedRender();
      const d = await feedSigned("like", JSON.stringify({ id }));
      Object.assign(p, { likes: d.likes, liked: d.liked });
      feedRender();
    }
    if (k === "del" && confirm("Удалить пост?")) {
      await feedSigned("delete", JSON.stringify({ id }));
      FEED.posts = FEED.posts.filter((x) => x.id !== id);
      feedRender();
    }
  } catch (err) {
    toast(err.message || String(err), "err");
    feedLoad(!1, !0);
  }
}
function setCpTab(i) {
  (!isMobile() && (i === "book" || i === "trades") && (i = "chart"),
    (document.body.dataset.cp = i),
    document.querySelectorAll("#cpTabs [data-cp]").forEach((t) => t.classList.toggle("on", t.dataset.cp === i)),
    $("sidePanel").classList.toggle("show-trades", i === "trades"),
    i === "info" && renderInfo(),
    i === "tools" && renderTools(!0),
    i === "scalp" ? scOpen() : scUnsub(),
    i === "feed" ? feedOpen() : clearInterval(FEED.t),
    i === "book" && renderBook(),
    i === "chart" && S.chartView === "depth" && requestAnimationFrame(renderDepth));
}
function openSheet(i) {
  (S.mode !== i && setMode(i), document.body.classList.add("sheet"));
}
function closeSheet() {
  document.body.classList.remove("sheet");
}
/* ═══════════ Информация о рынке ═══════════
   Подразделы как на крупных биржах: обзор, детали контракта, плечо и маржа,
   история фандинга, индекс и премия. Всё — из данных Hyperliquid. */
const INF_TABS = [
  ["overview", "Обзор"],
  ["contract", "Детали контракта"],
  ["margin", "Плечо и маржа"],
  ["funding", "История фандинга"],
  ["index", "Индекс и справедливая цена"],
];
const INF = { chart: null, key: "", hist: {}, cdT: null };
try {
  S.infTab = localStorage.getItem("totum.inftab") || "overview";
} catch {
  S.infTab = "overview";
}
const nextFundingMs = () => 36e5 - (Date.now() % 36e5);
const mmss = (ms) => {
  const t = Math.max(0, Math.floor(ms / 1e3));
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
};
const fPct = (x, d = 4) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(d)}%`;
function infKV(rows) {
  return `<div class="inf-kv">${rows
    .map(([k, v, c, hint]) => `<div><span${hint ? ` title="${esc(hint)}" class="dot"` : ""}>${k}</span><b class="${c || ""}">${v}</b></div>`)
    .join("")}</div>`;
}
function infTiers(m) {
  const t = (m?.mt && S.mtables?.[m.mt]) || [];
  return t.length ? t.map((x) => ({ from: Number(x.lowerBound) || 0, lev: Number(x.maxLeverage) || 1 })) : [{ from: 0, lev: Number(m?.maxLeverage) || 1 }];
}
function infHead(m, spot) {
  const tags = spot
    ? `<i>Спот</i>`
    : `<i>Бессрочный</i>${m.dex ? `<i>HIP-3 · ${esc(m.dex)}</i>` : ""}${CAT_RU[m.cat] ? `<i>${esc(CAT_RU[m.cat])}</i>` : ""}`;
  return `<div class="inf-title">${coinIcon(S.coin)}<b>${esc(pairLabel(S.coin))}</b><span class="inf-tags">${tags}</span></div>`;
}
function renderInfo() {
  const m = mkt(S.coin),
    c = S.ctx[S.coin],
    body = $("infoBody");
  if (!m || !c) {
    body.innerHTML = '<p class="muted">Загружаем…</p>';
    return;
  }
  const spot = !!m.spot,
    tabs = spot ? INF_TABS.slice(0, 1) : INF_TABS;
  tabs.some((t) => t[0] === S.infTab) || (S.infTab = "overview");
  const tb = $("infTabs"),
    tsig = tabs.map((t) => t[0]).join() + S.infTab;
  if (tb.dataset.sig !== tsig) {
    tb.dataset.sig = tsig;
    tb.innerHTML = tabs.map(([k, l]) => `<button type="button" data-inf="${k}" class="${k === S.infTab ? "on" : ""}">${l}</button>`).join("");
    tb.querySelectorAll("[data-inf]").forEach(
      (b) =>
        (b.onclick = () => {
          S.infTab = b.dataset.inf;
          try {
            localStorage.setItem("totum.inftab", S.infTab);
          } catch {}
          renderInfo();
        }),
    );
  }
  infCountdown();
  const px = Number(c.midPx || c.markPx || 0),
    ch = Number(c.prevDayPx) ? px / Number(c.prevDayPx) - 1 : 0,
    fr = Number(c.funding || 0),
    hi = $("mkHigh")?.textContent || "—",
    lo = $("mkLow")?.textContent || "—";
  /* графики строим один раз на рынок и раздел — дальше обновляем только цифры */
  if (S.infTab === "funding" || S.infTab === "index") return infHistory(m, c);
  infDropChart();
  if (S.infTab === "overview") {
    const oi = Number(c.openInterest || 0) * Number(c.markPx || 0);
    body.innerHTML = `<div class="inf-grid2">
      <section class="inf-card">
        ${infHead(m, spot)}
        <div class="inf-price"><b>${fmtPx(px)}</b><span class="inf-ch ${clsOf(ch)}">${ch >= 0 ? "+" : ""}${(ch * 100).toFixed(2)}%</span></div>
        <div class="inf-stats">
          ${(spot
            ? [
                ["Объём за 24ч", c.dayNtlVlm ? compact(c.dayNtlVlm) : "—"],
                ["Капитализация", Number(c.circulatingSupply) ? compact(Number(c.circulatingSupply) * px) : "—"],
                ["Макс. за 24ч", hi],
                ["Мин. за 24ч", lo],
                ["В обращении", Number(c.circulatingSupply) ? `${num(Number(c.circulatingSupply), 0)} ${esc(m.base)}` : "—"],
                ["Котировка", esc(m.quote)],
              ]
            : [
                ["Маркировочная цена", fmtPx(c.markPx)],
                ["Оракул (индекс)", c.oraclePx ? fmtPx(c.oraclePx) : "—"],
                ["Макс. за 24ч", hi],
                ["Мин. за 24ч", lo],
                ["Объём за 24ч", c.dayNtlVlm ? compact(c.dayNtlVlm) : "—"],
                ["Открытый интерес", oi ? compact(oi) : "—"],
              ]
          )
            .map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`)
            .join("")}
        </div>
      </section>
      <div class="inf-col">
        ${
          spot
            ? ""
            : `<section class="inf-card inf-fund ${clsOf(fr)}">
          <div class="inf-ct">Фандинг сейчас<span class="inf-cd" data-cd>${mmss(nextFundingMs())}</span></div>
          <div class="inf-big">${fPct(fr)}<small>за час</small></div>
          <p>${fr >= 0 ? "Лонги платят шортам" : "Шорты платят лонгам"} · позиция $1 000 за час: <b>${fr >= 0 ? "−" : "+"}${usd(Math.abs(fr) * 1000)}</b> для лонга</p>
          <button type="button" class="inf-link" data-inf-go="funding">История фандинга →</button>
        </section>`
        }
        <section class="inf-card">
          <div class="inf-ct">Торговые условия</div>
          ${infKV([
            ...(spot ? [["Плечо", "нет (спот)"]] : [["Макс. плечо", `${m.maxLeverage}x`], ["Маржа", m.onlyIsolated ? "только изолированная" : "кросс и изолированная"]]),
            ["Комиссия тейкер / мейкер", `${(FEE_RATE() * 100).toFixed(3)}% / ${(MAKER_RATE() * 100).toFixed(3)}%`, "", "Тейкер — ордер исполняется сразу: маркет или лимит по текущей цене. Мейкер — лимитный ордер, который встаёт в стакан и ждёт. Ставки включают комиссию Hyperliquid и Totum."],
            ["Шаг размера", `${(1 / 10 ** m.szDecimals).toFixed(m.szDecimals)} ${esc(baseOf(S.coin))}`],
          ])}
        </section>
      </div>
    </div>`;
  } else if (S.infTab === "contract") {
    const tiers = infTiers(m);
    body.innerHTML = `<section class="inf-card">
      ${infHead(m, !1)}
      <div class="inf-2col">
        ${infKV([
          ["Тип контракта", "Бессрочный, без даты экспирации"],
          ["Расчёты и маржа", m.dex ? esc(collName(m)) : "USDC"],
          ["Шаг размера", `${(1 / 10 ** m.szDecimals).toFixed(m.szDecimals)} ${esc(baseOf(S.coin))}`],
          ["Точность цены", `до 5 значащих цифр, до ${Math.max(0, 6 - m.szDecimals)} знаков после запятой`],
          ["Макс. плечо", `${m.maxLeverage}x`],
          ["Поддерживающая маржа", `${(50 / tiers[0].lev).toFixed(2)}% (1-й уровень)`, "", "Половина начальной маржи при максимальном плече уровня"],
          ["Режим маржи", m.onlyIsolated ? "только изолированная" : "кросс и изолированная"],
        ])}
        ${infKV([
          ["Ставка фандинга", `${fPct(fr)} за час`, clsOf(fr)],
          ["Следующий фандинг", `<span data-cd>${mmss(nextFundingMs())}</span>`],
          ["Интервал фандинга", "1 час"],
          ["Предел ставки фандинга", "4% за час"],
          ["Цена для TP/SL и ликвидаций", "справедливая цена"],
          ["Комиссия тейкер / мейкер", `${(FEE_RATE() * 100).toFixed(3)}% / ${(MAKER_RATE() * 100).toFixed(3)}%`, "", "Тейкер — ордер исполняется сразу: маркет или лимит по текущей цене. Мейкер — лимитный ордер, который встаёт в стакан и ждёт. Ставки включают комиссию Hyperliquid и Totum."],
          ["Биржа исполнения", `Hyperliquid${CFG.isTestnet ? " · тестовая сеть" : ""}${m.dex ? ` · площадка ${esc(m.dex)}` : ""}`],
        ])}
      </div>
    </section>`;
  } else if (S.infTab === "margin") {
    const tiers = infTiers(m),
      pos = S.positions.find((p) => p.coin === S.coin),
      pv = pos ? Math.abs(Number(pos.positionValue || 0)) : 0;
    let cur = 0;
    tiers.forEach((t, k) => pv >= t.from && (cur = k));
    body.innerHTML = `<section class="inf-card">
      <div class="inf-ct">Уровни плеча и маржи · ${esc(pairLabel(S.coin))}</div>
      <p class="inf-note">Чем больше позиция, тем меньше доступное плечо. Поддерживающая маржа — половина начальной: если залог опустится ниже неё, позицию ликвидируют.</p>
      <div class="inf-table" role="table">
        <div class="th"><span>Уровень</span><span>Размер позиции</span><span>Макс. плечо</span><span>Начальная маржа</span><span>Поддерживающая</span></div>
        ${tiers
          .map((t, k) => {
            const to = tiers[k + 1]?.from;
            return `<div class="${pos && k === cur ? "on" : ""}"><span>${k + 1}${pos && k === cur ? '<em>ваша позиция</em>' : ""}</span><span>${to ? `${compact(t.from)} – ${compact(to)}` : `от ${compact(t.from)}`}</span><span><b>${t.lev}x</b></span><span>${(100 / t.lev).toFixed(2)}%</span><span>${(50 / t.lev).toFixed(2)}%</span></div>`;
          })
          .join("")}
      </div>
    </section>
    <section class="inf-card">
      <div class="inf-ct">Какое плечо — до какого размера позиции</div>
      <p class="inf-note">Плечо можно ставить любое от 1x до ${m.maxLeverage}x. Чем выше плечо, тем меньше максимальная позиция и тем ближе ликвидация.</p>
      <div class="inf-table lev" role="table">
        <div class="th"><span>Плечо</span><span>Макс. позиция</span><span>Начальная маржа</span><span>Ликвидация при движении против вас</span></div>
        ${[1, 2, 3, 5, 10, 15, 20, 25, 30, 35, 40, 50]
          .filter((L) => L <= m.maxLeverage)
          .concat(m.maxLeverage)
          .filter((L, k, a) => a.indexOf(L) === k)
          .sort((a, b) => a - b)
          .map((L) => {
            /* максимум позиции: начало первого уровня, где плечо L уже не разрешено */
            const cap = tiers.find((t) => t.lev < L)?.from;
            /* грубо: на изолированной марже позиция ликвидируется, когда убыток съест начальную маржу минус поддерживающую */
            const mm = 0.5 / tiers[0].lev,
              move = 1 / L - mm;
            return `<div><span><b>${L}x</b></span><span>${cap != null ? `до ${compact(cap)}` : "без ограничения"}</span><span>${(100 / L).toFixed(2)}%</span><span>≈ ${(move * 100).toFixed(1)}%</span></div>`;
          })
          .join("")}
      </div>
      <p class="inf-note small2">Последняя колонка — примерно: изолированная маржа, позиция первого уровня, без комиссий и фандинга. В кросс-марже ликвидацию отодвигает весь свободный баланс.</p>
    </section>`;
  }
  body.querySelectorAll("[data-inf-go]").forEach(
    (b) =>
      (b.onclick = () => {
        S.infTab = b.dataset.infGo;
        renderInfo();
      }),
  );
  fixIcons(body);
}
function infCountdown() {
  clearInterval(INF.cdT);
  INF.cdT = setInterval(() => {
    if (document.body.dataset.cp !== "info") return clearInterval(INF.cdT);
    document.querySelectorAll("#infoBody [data-cd]").forEach((e) => (e.textContent = mmss(nextFundingMs())));
  }, 1e3);
}
function infDropChart() {
  if (INF.chart) {
    try {
      INF.chart.remove();
    } catch {}
    INF.chart = null;
  }
  INF.key = "";
}
/* История фандинга и премии: Hyperliquid отдаёт до 500 часов за запрос — берём частями */
async function loadFundingHist(coin, days) {
  const k = `${coin}|${days}`;
  if (INF.hist[k] && Date.now() - INF.hist[k].at < 10 * 6e4) return INF.hist[k].rows;
  let start = Date.now() - days * 864e5,
    rows = [];
  for (let n = 0; n < 4; n++) {
    const part = (await info.fundingHistory({ coin, startTime: start })) || [];
    rows = rows.concat(part);
    if (part.length < 500) break;
    start = part.at(-1).time + 1;
  }
  INF.hist[k] = { at: Date.now(), rows };
  return rows;
}
async function infHistory(m, c) {
  const body = $("infoBody"),
    kind = S.infTab,
    rng = (kind === "funding" ? INF.fRange : INF.pRange) || (kind === "funding" ? "40" : "7"),
    days = rng === "40" ? 2 : Number(rng),
    theme = document.documentElement.dataset.theme === "dark" ? "dark" : "light",
    key = `${S.coin}|${kind}|${rng}|${theme}`,
    fr = Number(c.funding || 0),
    prem = Number(c.premium || 0);
  const head =
    kind === "funding"
      ? `<div class="inf-hh"><div><span>Ставка сейчас</span><b class="${clsOf(fr)}">${fPct(fr)} <small>за час</small></b></div><div><span>До выплаты</span><b data-cd>${mmss(nextFundingMs())}</b></div><div data-stat="avg"><span>Средняя за период</span><b>—</b></div><div data-stat="sum"><span>Сумма за период</span><b>—</b></div></div>`
      : `<div class="inf-hh"><div><span>Цена оракула (индекс)</span><b>${c.oraclePx ? fmtPx(c.oraclePx) : "—"}</b></div><div><span>Маркировочная цена</span><b>${fmtPx(c.markPx)}</b></div><div><span>Разница с индексом</span><b class="${clsOf(prem)}">${fPct(prem, 3)}</b></div><div data-stat="avg"><span>Средняя разница</span><b>—</b></div></div>`;
  if (INF.key === key && INF.chart) {
    const h = body.querySelector(".inf-hh");
    if (h) {
      const keep = [...h.querySelectorAll("[data-stat]")].map((e) => e.outerHTML);
      h.outerHTML = head;
      const h2 = body.querySelector(".inf-hh");
      keep.forEach((html) => {
        const t = document.createElement("div");
        t.innerHTML = html;
        const n = t.firstChild,
          old = h2.querySelector(`[data-stat="${n.dataset.stat}"]`);
        old && old.replaceWith(n);
      });
    }
    return;
  }
  infDropChart();
  INF.key = key;
  body.innerHTML = `<section class="inf-card">
    <div class="inf-ct">${kind === "funding" ? "История ставки фандинга" : "Разница цены фьючерса с индексом"} · ${esc(pairLabel(S.coin))}
      <span class="inf-range">${(kind === "funding" ? [["40", "Последние 40"], ["7", "7 дн."], ["30", "30 дн."]] : [["7", "7 дн."], ["30", "30 дн."]])
        .map(([v, l]) => `<button type="button" data-rng="${v}" class="${v === rng ? "on" : ""}">${l}</button>`)
        .join("")}</span></div>
    ${head}
    <div class="inf-chart" id="infChart"><p class="muted">Загружаем историю…</p></div>
    <p class="inf-note">${
      kind === "funding"
        ? "Фандинг платится каждый час. Плюс — лонги платят шортам, минус — шорты лонгам. Точка — ставка за конкретный час."
        : "График — насколько фьючерс был дороже (+) или дешевле (−) индекса, в среднем за каждый час."
    }</p>
  </section>
  ${
    kind === "index"
      ? `<section class="inf-card inf-explain">
    <div class="inf-ct">Что такое индекс и справедливая цена</div>
    <div class="inf-steps">
      <div><i>1</i><span><b>Индекс (оракул)</b> — средняя цена монеты на крупных спотовых биржах. Обновляется примерно каждые 3 секунды.</span></div>
      <div><i>2</i><span><b>Маркировочная цена (mark price)</b> — сглаженная цена фьючерса. Hyperliquid берёт среднее из трёх: индекс с поправкой на стакан, цену в стакане Hyperliquid и цены фьючерсов на пяти крупных биржах. Так один резкий прокол в стакане её не двигает.</span></div>
      <div><i>3</i><span>По справедливой цене считаются <b>PnL, ликвидации и срабатывание TP/SL</b>. Поэтому стоп не сработает от случайной «свечи-иглы» на одной бирже.</span></div>
    </div>
    <div class="inf-ct">Разница с индексом (премия)</div>
    <p>Показывает, насколько фьючерс сейчас дороже (+) или дешевле (−) индекса. Из неё за час складывается ставка фандинга: <b class="pos">плюс</b> — лонги платят шортам, <b class="neg">минус</b> — шорты лонгам. Так фандинг притягивает цену фьючерса к споту.</p>
  </section>`
      : ""
  }`;
  body.querySelectorAll("[data-rng]").forEach(
    (b) =>
      (b.onclick = () => {
        kind === "funding" ? (INF.fRange = b.dataset.rng) : (INF.pRange = b.dataset.rng);
        INF.key = "";
        renderInfo();
      }),
  );
  let rows;
  try {
    rows = await loadFundingHist(S.coin, days);
  } catch (e) {
    $("infChart") && ($("infChart").innerHTML = `<p class="muted">Не удалось загрузить историю. Попробуйте позже.</p>`);
    return;
  }
  if (INF.key !== key || !$("infChart")) return;
  let vals = rows.map((r) => ({ time: Math.floor(r.time / 1e3), v: Number(kind === "funding" ? r.fundingRate : r.premium) })).filter((r) => Number.isFinite(r.v));
  rng === "40" && (vals = vals.slice(-40));
  const box = $("infChart");
  if (!vals.length) {
    box.innerHTML = `<p class="muted">История пока пустая.</p>`;
    return;
  }
  box.innerHTML = "";
  const th = CHART_THEMES[theme],
    css = getComputedStyle(document.documentElement),
    up = css.getPropertyValue("--buy").trim() || "#16a34a",
    dn = css.getPropertyValue("--sell").trim() || "#e11d48";
  const ch = createChart(box, {
    height: 260,
    autoSize: !0,
    layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: th.text, fontSize: 11 },
    grid: { vertLines: { visible: !1 }, horzLines: { color: th.grid } },
    rightPriceScale: { borderVisible: !1 },
    timeScale: { borderVisible: !1, timeVisible: !0 },
    crosshair: { mode: CrosshairMode.Normal },
    handleScroll: !1,
    handleScale: !1,
  });
  const fmt = { type: "custom", minMove: 1e-6, formatter: (x) => {
      const d = kind === "funding" ? 4 : 3,
        t = Math.abs(x) < 0.5 / 10 ** d ? 0 : x;
      return `${t > 0 ? "+" : ""}${t.toFixed(d)}%`;
    } };
  if (kind === "funding") {
    const gold = css.getPropertyValue("--accent").trim() || "#2563eb";
    ch.addSeries(LineSeries, {
      priceFormat: fmt,
      color: gold,
      lineWidth: 2,
      lineType: vals.length <= 200 ? LineType.Curved : LineType.Simple,
      pointMarkersVisible: vals.length <= 200,
      pointMarkersRadius: 3,
      lastValueVisible: !1,
      priceLineVisible: !1,
      crosshairMarkerRadius: 5,
    }).setData(vals.map((r) => ({ time: r.time, value: r.v * 100 })));
  } else {
    ch.addSeries(BaselineSeries, {
      priceFormat: fmt,
      lastValueVisible: !1,
      priceLineVisible: !1,
      baseValue: { type: "price", price: 0 },
      topLineColor: up,
      topFillColor1: up + "40",
      topFillColor2: up + "05",
      bottomLineColor: dn,
      bottomFillColor1: dn + "05",
      bottomFillColor2: dn + "40",
      lineWidth: 2,
    }).setData(vals.map((r) => ({ time: r.time, value: r.v * 100 })));
  }
  ch.timeScale().fitContent();
  INF.chart = ch;
  const avg = vals.reduce((a, r) => a + r.v, 0) / vals.length,
    sum = vals.reduce((a, r) => a + r.v, 0),
    put = (k, html) => {
      const e = body.querySelector(`[data-stat="${k}"] b`);
      e && (e.outerHTML = html);
    };
  put("avg", `<b class="${clsOf(avg)}">${fPct(avg, kind === "funding" ? 4 : 3)}${kind === "funding" ? " <small>за час</small>" : ""}</b>`);
  kind === "funding" && put("sum", `<b class="${clsOf(sum)}">${fPct(sum, 2)}</b>`);
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
/* Обновление страницы без пересоздания: меняем только то, что изменилось.
   Раньше вся главная пересобиралась раз в секунду — на телефоне это давало
   рывки при прокрутке и дёрганье нижней панели. */
function morphNode(a, b) {
  if (a.nodeType !== b.nodeType || a.nodeName !== b.nodeName) return a.replaceWith(b.cloneNode(!0));
  if (a.nodeType === 3 || a.nodeType === 8) {
    a.nodeValue !== b.nodeValue && (a.nodeValue = b.nodeValue);
    return;
  }
  if (a.nodeType !== 1) return;
  for (const at of [...a.attributes]) b.hasAttribute(at.name) || a.removeAttribute(at.name);
  for (const at of [...b.attributes]) a.getAttribute(at.name) !== at.value && a.setAttribute(at.name, at.value);
  /* картинку, которую уже заменили на букву (нет иконки), не трогаем */
  if (a.classList?.contains("coin-ic") && !a.querySelector("img") && b.querySelector("img")) return;
  morphKids(a, b);
}
function morphKids(a, b) {
  const ac = [...a.childNodes],
    bc = [...b.childNodes];
  bc.forEach((n, k) => (ac[k] ? morphNode(ac[k], n) : a.appendChild(n.cloneNode(!0))));
  for (let k = bc.length; k < ac.length; k++) ac[k].remove();
}
function morphInto(el, html) {
  if (el.__html === html) return !1;
  el.__html = html;
  if (!el.firstChild) {
    el.innerHTML = html;
    return !0;
  }
  const t = document.createElement(el.tagName);
  t.innerHTML = html;
  morphKids(el, t);
  return !0;
}
function renderHome() {
  let i = totalEquity(),
    t = moverRows(S.homeTab);
  (morphInto($("pgHome"), `
    <div class="hero-card">
      <div class="hc-top"><img src="brand/mark-128.webp" alt="" class="hc-mark"><span>${S.user ? "Ваши активы" : "Добро пожаловать в Totum"}</span>${CFG.isTestnet ? '<span class="badge">ТЕСТ</span>' : ""}</div>
      ${S.user ? `<div class="hc-sum">${usd(i)}</div>${heroPnl()}<div class="hc-cta"><button class="hc-btn main" type="button" data-act="deposit"><i>${NAV_IC.plus}</i>Пополнить</button><button class="hc-btn" type="button" data-act="futures"><i>${NAV_IC.bolt}</i>Торговать</button></div>` : '<div class="hc-lead">Фьючерсы, спот и акции в одном приложении. Деньги под вашим контролем: доступ к счёту только у вашего кошелька.</div><button class="btn wide-btn" type="button" data-act="connect">Подключить кошелёк</button>'}
    </div>
    <div class="quick">
      <button type="button" data-act="futures"><i>${NAV_IC.futures}</i><span>Фьючерсы</span></button>
      <button type="button" data-act="trade"><i>${NAV_IC.trade}</i><span>Спот</span></button>
      <button type="button" data-act="assets"><i>${NAV_IC.wallet}</i><span>Активы</span></button>
      <button type="button" data-act="orders"><i>${NAV_IC.doc}</i><span>Ордера</span></button>
    </div>
    <div class="card-block">
      <div class="seg mini-seg" id="homeSeg"><button data-ht="gain" class="${S.homeTab === "gain" ? "on" : ""}" type="button">Растут</button><button data-ht="loss" class="${S.homeTab === "loss" ? "on" : ""}" type="button">Падают</button><button data-ht="vol" class="${S.homeTab === "vol" ? "on" : ""}" type="button">По объёму</button></div>
      <div class="movers">${t.map((e) => `<div class="mv-row" data-go="${esc(e.name)}">${coinIcon(e.name)}<b>${esc(dexBase(e.name))}</b><span class="muted small">${compact(e.vol)}</span><span class="mv-px">${fmtPx(e.mid)}</span><span class="mv-ch ${e.ch >= 0 ? "pos" : "neg"}">${e.ch >= 0 ? "+" : ""}${(e.ch * 100).toFixed(2)}%</span></div>`).join("") || '<p class="muted small pad">Загружаем рынки…</p>'}</div>
    </div>
`) && fixIcons($("pgHome")));
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
/* ═══════════ «Твоя доля в Totum» ═══════════
   50% комиссии Totum возвращается трейдерам. Делим пропорционально уплаченной
   комиссии — значит, каждому достаётся ровно половина его собственной комиссии
   Totum (builderFee в его сделках через Totum, их узнаём по cloid «totum…»).
   Доля открывается равномерно за 12 месяцев с момента сделки. При ликвидации
   всё накопленное до неё открывается сразу. Выплаты — с кошелька выплат. */
const RW = { start: Date.UTC(2026, 10, 2), share: 0.5, vest: 365 * 864e5, payout: "0x390fab5e62025b2f53a090b3761d3c737e751107", data: null, at: 0, busy: !1, user: null };
async function loadReward(force) {
  if (!S.user || RW.busy) return;
  if (!force && RW.user === S.user && Date.now() - RW.at < 6e4) return;
  RW.busy = !0;
  try {
    const fills = [];
    let st = RW.start;
    for (let k = 0; k < 20; k++) {
      const f = (await info.userFillsByTime({ user: S.user, startTime: st, endTime: Date.now() })) || [];
      fills.push(...f);
      if (f.length < 2000) break;
      st = Math.max(...f.map((x) => x.time)) + 1;
    }
    const mine = fills.filter((f) => String(f.cloid || "").toLowerCase().startsWith(TOTUM_CLOID) && Number(f.builderFee) > 0),
      liqs = fills.filter((f) => f.liquidation).map((f) => f.time).sort((a, b) => a - b),
      now = Date.now();
    let acc = 0,
      open = 0;
    const byMonth = {};
    for (const f of mine) {
      const v = Number(f.builderFee) * RW.share,
        liq = liqs.find((t) => t >= f.time);
      acc += v;
      open += liq ? v : v * Math.min(1, (now - f.time) / RW.vest);
      const m = new Date(f.time).toISOString().slice(0, 7);
      byMonth[m] = (byMonth[m] || 0) + v;
    }
    /* сколько уже выплачено — сервер смотрит историю кошелька выплат на Hyperliquid */
    let paid = 0;
    try {
      const r = await fetch(`/api/payout?user=${S.user}`);
      r.ok && (paid = Number((await r.json()).paid) || 0);
    } catch {}
    RW.data = { acc, open, paid, trades: mine.length, liqs: liqs.length, byMonth, fees: acc / RW.share };
    RW.user = S.user;
    RW.at = Date.now();
  } catch (e) {
    console.warn("[доля]", e?.message || e);
  }
  RW.busy = !1;
  document.body.dataset.app === "assets" && renderAssets();
  RW.onLoad && RW.onLoad();
}
function rewardCard() {
  if (!S.user) return "";
  RW.user !== S.user || Date.now() - RW.at > 6e4 ? loadReward() : 0;
  const d = RW.user === S.user ? RW.data : null,
    pct = d && d.acc > 0 ? Math.min(100, (d.open / d.acc) * 100) : 0,
    now = new Date(),
    next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)),
    days = Math.max(0, Math.ceil((next - now) / 864e5)),
    R = 34,
    C = 2 * Math.PI * R,
    num = (v, k) => `<b class="rw-n" data-count="${(v || 0).toFixed(6)}" data-dp="${(v || 0) < 1 ? 4 : 2}">$0</b>`;
  return `<div class="rw-card${d ? " ready" : ""}">
      <i class="rw-glow"></i>
      <div class="rw-top">
        <div class="rw-ttl"><span class="rw-coin"><img src="brand/mark-128.webp" alt=""></span><div><b>Твоя доля в Totum</b><small>50% комиссии биржи — трейдерам</small></div></div>
        <span class="rw-pay">Выплата через <b>${days}</b> ${days % 10 === 1 && days % 100 !== 11 ? "день" : days % 10 >= 2 && days % 10 <= 4 && (days % 100 < 12 || days % 100 > 14) ? "дня" : "дней"}</span>
      </div>
      ${
        d
          ? `<div class="rw-main">
        <div class="rw-ring" style="--C:${C.toFixed(2)};--off:${(C * (1 - pct / 100)).toFixed(2)}">
          <svg viewBox="0 0 80 80"><circle cx="40" cy="40" r="${R}" class="bg"/><circle cx="40" cy="40" r="${R}" class="fg"/></svg>
          <div><b>${pct < 10 ? pct.toFixed(1) : Math.round(pct)}%</b><small>открыто</small></div>
        </div>
        <div class="rw-nums">
          <div><span>Начислено</span>${num(d.acc)}</div>
          <div class="op"><span>Открыто</span>${num(d.open)}</div>
          <div><span>Выплачено</span>${num(d.paid)}</div>
        </div>
      </div>
      <p class="rw-sub">${d.trades ? `Сделок через Totum: <b>${d.trades}</b> · комиссия Totum $${d.fees.toFixed(d.fees < 1 ? 4 : 2)} — половина твоя.` : "Доля начнёт копиться с первой сделки через Totum."}${d.liqs ? " После ликвидации накопленное открыто сразу." : ""}</p>`
          : '<div class="rw-skel"><i></i><i></i><i></i></div>'
      }
      <details class="rw-rules"><summary>Как это работает</summary>
        <ol>
          <li><b>Половина комиссии — твоя.</b> Каждый месяц 50% всей комиссии Totum возвращается трейдерам пропорционально тому, кто сколько заплатил.</li>
          <li><b>Чем дольше с нами — тем больше открыто.</b> Доля каждой сделки открывается равномерно за 12 месяцев.</li>
          <li><b>Ликвидировало — получаешь сразу.</b> Всё, что накопилось до ликвидации, открывается и уходит в ближайшую выплату.</li>
          <li><b>Всё проверяемо.</b> Комиссия записана в каждой сделке на Hyperliquid. Кошелёк выплат: <code>${RW.payout.slice(0, 6)}…${RW.payout.slice(-4)}</code>.</li>
        </ol>
      </details>
    </div>`;
}
/* счётчики «набегают» от 0 до значения */
function rwAnimate(root = document) {
  root.querySelectorAll(".rw-n[data-count]:not([data-done])").forEach((el) => {
    el.dataset.done = "1";
    const to = Number(el.dataset.count),
      dp = Number(el.dataset.dp),
      t0 = performance.now(),
      f = (t) => {
        const k = Math.min(1, (t - t0) / 1100),
          e = 1 - Math.pow(1 - k, 3);
        el.textContent = `$${(to * e).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: dp })}`;
        k < 1 && requestAnimationFrame(f);
      };
    requestAnimationFrame(f);
  });
}
/* на компьютере раздела «Активы» нет — карточка доли открывается окном из шапки */
function openShare() {
  $("rwBody").innerHTML = rewardCard();
  $("rwDialog").open || $("rwDialog").showModal();
  rwAnimate($("rwBody"));
  RW.onLoad = () => $("rwDialog").open && (($("rwBody").innerHTML = rewardCard()), rwAnimate($("rwBody")));
}
function renderAssets() {
  let i = S.positions || [],
    t = i.reduce((n, s) => n + Number(s.unrealizedPnl || 0), 0),
    e = S.spotBal.filter((n) => Number(n.total) > 0);
  (morphInto($("pgAssets"),
    '<h1 class="pg-title">Активы</h1>' +
    (S.user
      ? `
    <div class="hero-card">
      <div class="hc-top"><span>Всего</span></div>
      <div class="hc-sum">${usd(totalEquity())}</div>${heroPnl()}
      <div class="hc-actions"><button class="btn" type="button" data-act="transfer">Перевести</button><button class="btn ghost" type="button" data-act="acchist">История счёта</button></div>
    </div>
    ${rewardCard()}
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
      : '<div class="hero-card"><div class="hc-lead">Подключите кошелёк, чтобы увидеть балансы фьючерсного и спот-счёта.</div><button class="btn wide-btn" type="button" data-act="connect">Подключить кошелёк</button></div>')) &&
    fixIcons($("pgAssets")),
    rwAnimate($("pgAssets")));
}
var NAV_IC = {
  futures:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M7 5.5v3.2M7 16v3"/><rect x="4.4" y="8.7" width="5.2" height="7.3" rx="1.6" fill="currentColor" fill-opacity=".28"/><path d="M15.5 2.8v2.4M15.5 11.6v1.6"/><rect x="12.9" y="5.2" width="5.2" height="6.4" rx="1.6" fill="currentColor" fill-opacity=".28"/><path d="M13.5 20.5 20.5 14"/><path d="M16.8 13.8h3.9v3.9"/></svg>',
  trade:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="12" r="5"/><path d="M14.5 7.2a5 5 0 1 1 0 9.6"/></svg>',
  swap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 8.5h12.5L14.5 5.5"/><path d="M19 15.5H6.5l3 3"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  bolt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 3 5 13.5h6L10 21l8-10.5h-6z"/></svg>',
  wallet:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="6" width="17" height="13" rx="3"/><path d="M3.5 10h17M16 14.5h1.5"/><path d="M7 6l8.5-2.5 1.5 2.5"/></svg>',
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
          o === "assets" && setApp("assets"),
          o === "calendar" && openCalendar(),
          o === "acchist" && openAccHist(),
          /* Пополнение: в тестовой сети — кран тестовых USDC; в основной — раздел пополнения Hyperliquid тем же кошельком */
          o === "deposit" &&
            window.open(CFG.isTestnet ? "https://app.hyperliquid-testnet.xyz/drip" : "https://app.hyperliquid.xyz/portfolio", "_blank", "noopener"),
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
  wantLanding = () => (location.pathname === "/" || location.pathname === "/index.html") && location.hash !== "#trade";
function setView(i, t = !1) {
  /* пока скрипт грузится, виден только знак Totum (без «каркаса» терминала) */
  document.body.classList.remove("boot");
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
/* Карточки инструментов на лендинге показывают живые данные биржи, а не картинки */
function lnLive() {
  if (Date.now() - (LN.liveAt || 0) < 1200) return;
  LN.liveAt = Date.now();
  const set = (id, html) => {
      const el = $(id);
      if (!el) return;
      const tag = el.querySelector(".lv-live")?.outerHTML || "";
      let body = el.querySelector(".lv-body");
      body || ((body = document.createElement("div")), (body.className = "lv-body"), (el.innerHTML = tag), el.appendChild(body));
      body.innerHTML = html;
    },
    c = S.ctx.BTC || {},
    px = Number(c.midPx || c.markPx || 0),
    f = FEE_RATE("BTC");
  /* стакан BTC */
  const b = S.coin === "BTC" ? S.book : null;
  if (b?.asks?.length && b?.bids?.length) {
    const a3 = b.asks.slice(0, 3).reverse(),
      b3 = b.bids.slice(0, 3),
      mx = Math.max(...a3.concat(b3).map((x) => x.px * x.sz), 1),
      row = (x, cls) => `<div class="lv-r ${cls}"><i style="width:${Math.min(100, ((x.px * x.sz) / mx) * 100).toFixed(0)}%"></i><span>${fmtPx(x.px)}</span><span>$${compactUsd(x.px * x.sz)}</span></div>`;
    set("lvBook", a3.map((x) => row(x, "a")).join("") + `<div class="lv-mid">${fmtPx((b.asks[0].px + b.bids[0].px) / 2)}</div>` + b3.map((x) => row(x, "b")).join(""));
  }
  /* связки по фандингу и арбитраж */
  if (!TL.data && !TL.busy && !LN.fundTried) ((LN.fundTried = !0), loadTools(!0));
  if (!TL.data) {
    const w = '<div class="lv-wait"><i></i><i></i><i></i></div>';
    set("lvFund", w);
    set("lvArb", w);
  }
  if (TL.data) {
    const pr = tlPairs().filter((r) => (r.x.vol || 0) > 1e6 && (r.t.vol || 0) > 1e5);
    const top = [...pr].sort((x, y) => Math.abs(y.fs) - Math.abs(x.fs)).slice(0, 3);
    top.length &&
      set("lvFund", top.map((r) => `<div class="lv-f"><b>${esc(r.base)}</b><span>Totum ↔ ${esc(tlVName(r.x.v))}</span><em class="up">+${((Math.abs(r.fs) * 24) * 100).toFixed(3)}%<small>/сутки</small></em></div>`).join(""));
    const arb = [...pr].sort((x, y) => Math.abs(y.ps) - Math.abs(x.ps))[0];
    arb && set("lvArb", `<div class="lv-big"><b>${(Math.abs(arb.ps) * 100).toFixed(2)}%</b><span>${esc(arb.base)}: Totum ${fmtPx(arb.tp)} · ${esc(tlVName(arb.x.v))} ${fmtPx(arb.xp)}</span></div>`);
  }
  if (px > 0) {
    const stop = px * 0.985,
      sz = 10 / (px - stop);
    set("lvRisk", `<div class="lv-calc"><div><span>Риск</span><b>$10</b></div><div><span>Стоп</span><b>${fmtPx(stop)}</b></div><div><span>Размер</span><b>${sz.toFixed(5)} BTC</b></div></div>`);
    const be = (px * (1 + f)) / ((1 - f) * (1 - 2e-4));
    set("lvBe", `<div class="lv-calc"><div><span>Вход</span><b>${fmtPx(px)}</b></div><div><span>Безубыток</span><b class="up">${fmtPx(be)}</b></div><div><span>С учётом</span><b>${(f * 200).toFixed(2)}% + проскальз.</b></div></div>`);
  }
  /* акции, золото, индексы — живые цены */
  const want = [/GOLD$/, /NVDA$/, /ANTH/, /TSLA$/, /SP500$/, /SILVER$/],
    picks = [];
  for (const re of want) {
    const m = S.meta.filter((x) => x.dex && re.test(x.name) && !isUsdeDex(x)).sort((x, y) => Number(S.ctx[y.name]?.dayNtlVlm || 0) - Number(S.ctx[x.name]?.dayNtlVlm || 0))[0];
    m && S.ctx[m.name] && picks.push(m.name);
  }
  picks.length &&
    set(
      "lvAssets",
      picks
        .slice(0, 6)
        .map((n) => {
          const q = S.ctx[n],
            v = Number(q.midPx || q.markPx || 0),
            ch = Number(q.prevDayPx) ? v / Number(q.prevDayPx) - 1 : 0;
          return `<div class="lv-a"><b>${esc(dexBase(n))}</b><span>${fmtPx(v)}</span><em class="${ch >= 0 ? "up" : "dn"}">${ch >= 0 ? "+" : "−"}${Math.abs(ch * 100).toFixed(1)}%</em></div>`;
        })
        .join(""),
    );
}
function renderLanding() {
  if (document.body.dataset.view !== "landing") return;
  lnLive();
  $("lnFee") && ($("lnFee").textContent = `${(FEE_RATE("BTC") * 100).toFixed(2).replace(".", ",")}% / ${(MAKER_RATE("BTC") * 100).toFixed(2).replace(".", ",")}%`);
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
    setView(wantLanding() ? "landing" : "app"),
    lnReveal());
}
/* блоки лендинга плавно появляются при прокрутке */
/* Живые разделы лендинга: схема ключа, задержка до биржи, экран «Как начать», финальная сцена.
   Каждый работает только пока виден на экране. */
function lnFx() {
  if (LN.fx) return;
  LN.fx = 1;
  const seen = (el, on) => {
    if (!el) return;
    if (!("IntersectionObserver" in window)) return on(!0);
    new IntersectionObserver(([x]) => on(x.isIntersecting), { threshold: 0.25 }).observe(el);
  };
  /* схема ключа: этапы сменяются каждые 3 с, по нажатию — сразу */
  const kf = $("kf"),
    viz = kf?.querySelector(".kf-viz"),
    svg = viz?.querySelector("svg");
  let kst = 0, kt = 0, kon = !1;
  const kset = (n) => {
    kst = n;
    viz.dataset.st = n;
    kf.querySelectorAll(".kf-st").forEach((b, k) => {
      b.classList.toggle("on", k === n);
      const bar = b.querySelector(".kf-bar i");
      bar.style.animation = "none";
      bar.offsetWidth;
      bar.style.animation = "";
    });
    clearTimeout(kt);
    kon && (kt = setTimeout(() => kset((kst + 1) % 3), 3e3));
  };
  kf && (kf.querySelectorAll(".kf-st").forEach((b) => (b.onclick = () => kset(Number(b.dataset.kf)))),
    seen(kf, (v) => {
      kon = v;
      kf.classList.toggle("paused", !v);
      v ? (svg.unpauseAnimations?.(), kset(kst)) : (clearTimeout(kt), svg.pauseAnimations?.());
    }));
  /* задержка до биржи — меряем прямо у посетителя крошечным запросом */
  const pg = [];
  let pt = 0;
  const ping = async () => {
    const t0 = performance.now();
    try {
      await fetch(`${CFG.isTestnet ? "https://api.hyperliquid-testnet.xyz" : "https://api.hyperliquid.xyz"}/info`, { method: "POST", headers: { "content-type": "application/json" }, body: '{"type":"exchangeStatus"}', cache: "no-store" });
      pg.push(performance.now() - t0);
      pg.length > 24 && pg.shift();
      const last = pg.slice(-5).sort((a, b) => a - b),
        med = last[Math.floor(last.length / 2)];
      $("puPing") && ($("puPing").textContent = Math.round(med));
      const mx = Math.max(...pg) * 1.15,
        mn = Math.min(...pg) * 0.85;
      $("puLine")?.setAttribute("points", pg.map((v, k) => `${(k / Math.max(1, pg.length - 1)) * 160},${30 - ((v - mn) / (mx - mn || 1)) * 26}`).join(" "));
    } catch {}
  };
  seen($("lnFast"), (v) => (clearInterval(pt), v && (ping(), (pt = setInterval(ping, 1500)))));
  /* «Как начать»: запись настоящего сайта на телефоне; шаги слева идут в такт видео,
     нажатие на шаг перематывает к нему. Видео грузится, только когда раздел рядом. */
  const gs = $("gs"),
    vid = $("gsVid");
  if (gs && vid) {
    const mk = [0, ...vid.dataset.marks.split(",").map(Number)];
    const mark = (n) => {
      gs.dataset.step = n;
      gs.querySelectorAll("[data-gs]").forEach((li, k) => (li.classList.toggle("on", k === n), li.classList.toggle("done", k < n)));
    };
    vid.addEventListener("timeupdate", () => {
      const t = vid.currentTime;
      mark(t >= mk[2] ? 2 : t >= mk[1] ? 1 : 0);
    });
    gs.querySelectorAll("[data-gs]").forEach((li) => (li.onclick = () => {
      const n = Number(li.dataset.gs);
      vid.src || ((vid.src = vid.dataset.src), vid.load());
      vid.currentTime = mk[n] + 0.05;
      mark(n);
      vid.play().catch(() => {});
    }));
    new IntersectionObserver(([x]) => x.isIntersecting && !vid.src && ((vid.src = vid.dataset.src), vid.load()), { rootMargin: "600px" }).observe(gs);
    seen(gs, (v) => (v ? (vid.src || ((vid.src = vid.dataset.src), vid.load()), vid.play().catch(() => {})) : vid.pause()));
  }
  /* финал: слова заголовка по очереди, живой 3D-знак на компьютере, кнопка тянется за курсором */
  const fin = $("lnFinal");
  seen(fin, (v) => {
    v && fin.classList.add("in");
    if (v && !isMobile() && !LN.fnMob)
      ((LN.fnMob = 1),
        import("./mobius.js")
          .then(({ mountMobius: m }) => m($("fnMark")) && $("fnMark").classList.add("live"))
          .catch(() => {}));
  });
  const cta = fin?.querySelector(".fn-cta");
  cta &&
    matchMedia("(hover:hover)").matches &&
    (fin.addEventListener("pointermove", (e) => {
      const r = cta.getBoundingClientRect(),
        dx = e.clientX - (r.left + r.width / 2),
        dy = e.clientY - (r.top + r.height / 2),
        d = Math.hypot(dx, dy);
      cta.style.transform = d < 220 ? `translate(${dx * 0.18}px,${dy * 0.25}px)` : "";
    }),
    fin.addEventListener("pointerleave", () => (cta.style.transform = "")));
}
function lnReveal() {
  lnFx();
  const els = document.querySelectorAll(".ln-reveal");
  if (!("IntersectionObserver" in window)) return els.forEach((e) => e.classList.add("in"));
  const io = new IntersectionObserver((list) => list.forEach((x) => x.isIntersecting && (x.target.classList.add("in"), io.unobserve(x.target))), { threshold: 0.15 });
  els.forEach((e) => io.observe(e));
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
    i.sideLabel || (i.long ? "Лонг" : "Шорт"),
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
/* сторож стакана: живое соединение может тихо оборваться — если свежего стакана нет 3 с,
   берём его запросом раз в 1,5 с, пока соединение не вернётся */
setInterval(() => {
  document.hidden || document.body.dataset.view === "landing" || (isMobile() && ["home", "markets", "assets"].includes(document.body.dataset.app)) || (Date.now() - (S.bookAt || 0) > 3e3 && !S.bookBusy && ((S.bookBusy = 1), pollBook().finally(() => (S.bookBusy = 0))));
}, 1500);
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
          /* счёт — раз в 10 с (после своих сделок обновляем сразу); меньше запросов —
             меньше шансов упереться в лимит Hyperliquid на один IP */
          S.user &&
            S.tick % 2 === 0 &&
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
  loadHip3Ctx(i);
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
  (document.querySelectorAll("[data-theme-set]").forEach((b) => b.classList.toggle("on", b.dataset.themeSet === i)), applyChartTheme());
}
function initSettings() {
  (($("setRemember").checked = SET.remember),
    ($("setConfirm").checked = SET.confirmOn),
    ($("setSound").checked = SET.sound !== !1),
    ($("setAdl").checked = SET.adlAlert !== !1),
    ($("setAdl").onchange = (i) => {
      SET.adlAlert = i.target.checked;
      saveSettings();
      i.target.checked && "Notification" in window && Notification.permission === "default" && Notification.requestPermission().catch(() => {});
    }),
    ($("setSound").onchange = (i) => {
      SET.sound = i.target.checked;
      saveSettings();
      i.target.checked && tradeSound(!0);
    }),
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
    document.querySelectorAll("[data-theme-set]").forEach((b) => (b.onclick = () => setTheme(b.dataset.themeSet))),
    ($("btnConnect").onclick = () => (S.user ? disconnectWallet() : connectWallet())),
    ($("btnConnect2").onclick = connectWallet),
    ($("btnEnable").onclick = enableTrading),
    ($("btnShare").onclick = openShare),
    ($("rwClose").onclick = () => $("rwDialog").close()),
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
    document.querySelectorAll("#closeDialog [data-cp]").forEach(
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
    ($("feedGo").onclick = feedPublish),
    ($("feedPosBtn").onclick = feedOpenPick),
    ($("fpCancel").onclick = () => $("feedPick").close()),
    document.querySelectorAll("[data-fp]").forEach((b) => (b.onclick = () => ((FEED.fp = b.dataset.fp), feedPickRender()))),
    ($("fpList").onclick = (e) => {
      const r = FEED.fpRows?.[Number(e.target.closest("[data-fpi]")?.dataset.fpi)];
      if (!r) return;
      FEED.att = r.kind === "open" ? { kind: "open", coin: r.coin, label: r.label } : { kind: "closed", oid: r.oid, coin: r.coin, label: r.label };
      $("feedPick").close();
      feedAttsRender();
    }),
    ($("feedFile").onchange = (e) => (feedFiles(e.target.files), (e.target.value = ""))),
    ($("feedAtts").onclick = (e) => {
      const x = e.target.closest("[data-fcx]")?.dataset.fcx;
      if (x == null) return;
      x === "att" ? (FEED.att = null) : FEED.media.splice(Number(x), 1);
      feedAttsRender();
    }),
    ($("fvClose").onclick = () => $("feedView").close()),
    ($("feedView").onclick = (e) => e.target === $("feedView") && $("feedView").close()),
    ($("feedList").onclick = feedClick),
    /* обработчик ничего не возвращает: «false» из onkeydown браузер считает отменой нажатия */
    ($("feedText").onkeydown = (e) => {
      (e.ctrlKey || e.metaKey) && e.key === "Enter" && feedPublish();
    }),
    document.querySelectorAll("#closeTabs [data-ct]").forEach((i) => (i.onclick = () => setCloseType(i.dataset.ct))),
    ($("btnCloseAll").onclick = closeAll),
    document.querySelectorAll("[data-sside]").forEach((i) => (i.onclick = () => setSpotSide(i.dataset.sside))),
    ($("btnTransfer").onclick = openTransfer),
    ($("trSwap").onclick = () => setTrDir(!trToPerp)),
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
    ($("btnCalendar").onclick = () => openCalendar()),
    ($("opBack").onclick = () => $("ordersPage").close()),
    ($("calBack").onclick = () => $("calDialog").close()),
    ($("histBack").onclick = () => $("histDialog").close()),
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
    ($("tp").oninput = $("sl").oninput = (ev) => {
      const k = ev.target.id;
      S.riskAnchor = k;
      if (riskActive() && UNITS.ord === "px") {
        const v = Number(ev.target.value),
          en = planEntry();
        if (v > 0 && en > 0 && v !== en) {
          const lg = k === "sl" ? v < en : v > en;
          if (lg !== (S.riskSide !== false)) {
            S.riskSide = lg;
            SET.riskSide = lg ? "long" : "short";
            saveSettings();
          }
        }
      }
      updateOrderInfo();
      drawChartLines();
    }),
    document.querySelectorAll("[data-rside]").forEach((b) => (b.onclick = () => setRiskSide(b.dataset.rside === "long"))),
    document.querySelectorAll("[data-rr]").forEach(
      (b) =>
        (b.onclick = () => {
          SET.riskRR = Number(b.dataset.rr);
          saveSettings();
          S.riskAnchor === "tp" || ($("tp").value = "");
          S.riskAnchor === "tp" && ($("sl").value = "");
          updateOrderInfo();
          drawChartLines();
        }),
    ),
    document.querySelectorAll("[data-pick]").forEach(
      (b) =>
        (b.onclick = (ev) => {
          ev.preventDefault();
          S.pick = S.pick === b.dataset.pick ? null : b.dataset.pick;
          document.querySelectorAll("[data-pick]").forEach((x) => x.classList.toggle("on", x.dataset.pick === S.pick));
          $("chart").classList.toggle("picking", !!S.pick);
          S.pick && toast("Нажмите на графике нужную цену", "info");
        }),
    ),
    (S.riskSide = SET.riskSide !== "short"),
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
      let be = i.target.closest("[data-be]");
      be && beStop(be.dataset.be);
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

    ($("feeLabel").textContent = FEE_PCT),
    ($("termsFee").textContent = FEE_PCT),
    paintRange($("pct")),
    paintRange($("lev")));
}
async function init() {
  (bindSettings(), initChart(), bindIndicators(), bindDrawing(), bindTpslDrag(), bindChartPick());
  let i = "light";
  try {
    i = localStorage.getItem("totum.theme") || "light";
  } catch {}
  (setTheme(i),
    setCpTab("chart"),
    updateSetupUI(),
    setMargin("isolated"),
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
    setLeverage(1),
    subscribeAllPrices(),
    startLoop(),
    /* после обновления страницы — тихо возвращаем подключённый кошелёк */
    connectWallet(!0).catch(() => {}),
    USER_CFG.debug &&
      (window.__totum = {
        S: S,
        onTrades: (t) => onTrades(t),
        chart: () => chart,
        coinIcon: (c) => coinIcon(c),
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
        adlCheck: () => checkAdlAlerts(),
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
