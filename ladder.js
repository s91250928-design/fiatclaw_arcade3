/* Лестница: первый стоп и два тейка живут на Hyperliquid.
   Стоп в плюсе — трейлинг с ценой активации на первом тейке.
   Биржа включает его сама, вкладку можно закрыть. Ключ с сервера не уходит. */

export function validateLadder({ long, entry, sl, tp1, profit, tp2, notional, frac }) {
  if (!(entry > 0)) return "Нет цены входа";
  if (!(frac > 0 && frac < 1)) return "Доля первого тейка должна быть между 0 и 100%";
  const part = notional * frac, rest = notional * (1 - frac);
  if (!(part >= 10 && rest >= 10)) return `Каждая часть лестницы минимум $10. Сейчас первый тейк $${part.toFixed(2)}, остаток $${rest.toFixed(2)}`;
  if (!(sl > 0 && tp1 > 0 && profit > 0 && tp2 > 0)) return "Заполните стоп, оба тейка и стоп в плюсе";
  if (long) {
    if (!(sl < entry)) return "Для лонга стоп должен быть ниже входа";
    if (!(profit > entry)) return "Стоп в плюсе должен быть выше входа";
    if (!(tp1 > profit)) return "Первый тейк должен быть выше стопа в плюсе";
    if (!(tp2 > tp1)) return "Второй тейк должен быть выше первого";
  } else {
    if (!(sl > entry)) return "Для шорта стоп должен быть выше входа";
    if (!(profit < entry)) return "Стоп в плюсе должен быть ниже входа";
    if (!(tp1 < profit)) return "Первый тейк должен быть ниже стопа в плюсе";
    if (!(tp2 < tp1)) return "Второй тейк должен быть ниже первого";
  }
  return "";
}

// Уже открытая позиция: стоп сверяем с текущей ценой, «в плюсе» — с ценой входа.
export function validatePositionLadder({ long, entry, mark, sl, tp1, profit, tp2, notional, frac }) {
  if (!(entry > 0 && mark > 0)) return "Нет цены позиции";
  if (!(frac > 0 && frac < 1)) return "Доля первого тейка должна быть между 0 и 100%";
  const part = notional * frac, rest = notional * (1 - frac);
  if (!(part >= 10 && rest >= 10)) return `Каждая часть лестницы минимум $10. Сейчас первый тейк $${part.toFixed(2)}, остаток $${rest.toFixed(2)}`;
  if (!(sl > 0 && tp1 > 0 && profit > 0 && tp2 > 0)) return "Заполните стоп, оба тейка и стоп в плюсе";
  if (long) {
    if (!(sl < mark)) return "Стоп должен быть ниже текущей цены";
    if (!(tp1 > mark)) return "Первый тейк должен быть выше текущей цены";
    if (!(profit > entry)) return "Стоп в плюсе должен быть выше цены входа";
    if (!(profit < tp1)) return "Стоп в плюсе должен быть ниже первого тейка";
    if (!(tp2 > tp1)) return "Второй тейк должен быть выше первого";
  } else {
    if (!(sl > mark)) return "Стоп должен быть выше текущей цены";
    if (!(tp1 < mark)) return "Первый тейк должен быть ниже текущей цены";
    if (!(profit < entry)) return "Стоп в плюсе должен быть ниже цены входа";
    if (!(profit > tp1)) return "Стоп в плюсе должен быть выше первого тейка";
    if (!(tp2 < tp1)) return "Второй тейк должен быть ниже первого";
  }
  return "";
}

export function legOrder(asset, long, kind, triggerPx, sz, fmtPx, slip) {
  const worse = triggerPx * (long ? 1 - slip * 3 : 1 + slip * 3);
  return {
    a: asset.index,
    b: !long,
    p: fmtPx(worse, asset),
    s: sz,
    r: true,
    t: { trigger: { isMarket: true, triggerPx: fmtPx(triggerPx, asset), tpsl: kind } },
  };
}

export function splitSize(totalStr, frac, decimals) {
  const scale = 10 ** decimals;
  const total = Math.round(Number(totalStr) * scale);
  if (!Number.isFinite(total) || total < 2) return { error: "Размер слишком мал, чтобы делить на два ордера" };
  let part = Math.floor(total * frac + 1e-8);
  if (part < 1) part = 1;
  if (part > total - 1) part = total - 1;
  const rest = total - part;
  const fmt = n => (n / scale).toFixed(decimals);
  return { part: fmt(part), rest: fmt(rest) };
}

function boot() {
  const T = window.__totumTrade;
  const el = id => document.getElementById(id);
  if (!T || !el("ladderOn")) return;

  const frac = () => {
    const b = document.querySelector("#ladderFrac button.on");
    return Number(b?.dataset.frac) || 0.5;
  };

  function levels(long) {
    const plan = T.plan(long);
    if (!plan) return { error: "Рынок ещё не загружен" };
    const sl = T.readPx("sl", "sl", plan);
    const tp1 = T.readPx("tp", "tp", plan);
    const profit = T.readPx("ladP", "tp", plan);
    const tp2 = T.readPx("ladTp2", "tp", plan);
    const notional = Number(el("size")?.value) || 0;
    const error = validateLadder({ long, entry: plan.entry, sl, tp1, profit, tp2, notional, frac: frac() });
    return error ? { error, plan } : { plan, sl, tp1, profit, tp2, notional, frac: frac() };
  }

  window.__totumLadderCheck = long => {
    if (!el("ladderOn").checked || !T.isPerp() || T.mode() === "close") return "";
    if (T.orderType() === "limit") return "Лестница ставится рыночным входом: иначе защитные ордера не встанут, пока лимит не исполнится. Для лимита оставьте обычные ТП/СЛ.";
    return levels(!!long).error || "";
  };

  window.__totumLadderRows = (rows, long) => {
    const L = levels(!!long);
    if (L.error) { rows.push(["Лестница", L.error, "warn"]); return; }
    const pct = Math.round(L.frac * 100);
    rows.push(["Стоп на всю позицию", T.px(L.sl), "neg"]);
    rows.push(["Первый тейк", `${T.px(L.tp1)} · ${pct}%`, "pos"]);
    rows.push(["Стоп в плюсе", `${T.px(L.profit)} · включится на первом тейке и пойдёт за ценой`, "pos"]);
    rows.push(["Второй тейк", `${T.px(L.tp2)} · остаток`, "pos"]);
  };

  function trigger(asset, long, kind, triggerPx, sz) {
    return legOrder(asset, long, kind, triggerPx, sz, T.fmtPx, T.slip());
  }

  async function one(ex, order) {
    const res = await ex.order({ orders: [order], grouping: "na", builder: T.builder() });
    const st = res?.response?.data?.statuses?.[0];
    if (st?.error) throw new Error(typeof st.error === "string" ? st.error : JSON.stringify(st.error));
    if (!st || st.error) throw new Error("Биржа не приняла ордер");
  }

  window.__totumLadder = async ({ long, asset, limitPx, sz }) => {
    const err = window.__totumLadderCheck(long);
    if (err) throw new Error(err);
    const L = levels(!!long);
    if (L.error) throw new Error(L.error);
    const ex = T.ex();
    if (!ex?.trailingStop) throw new Error("Трейлинг-стоп в этом клиенте недоступен");

    const entry = await ex.order({
      orders: [{ a: asset.index, b: !!long, p: limitPx, s: sz, r: false, t: { limit: { tif: "Ioc" } } }],
      grouping: "na",
      builder: T.builder(),
    });
    const st = entry?.response?.data?.statuses?.[0];
    if (st?.error) throw new Error(typeof st.error === "string" ? st.error : JSON.stringify(st.error));
    if (!st?.filled) throw new Error("Вход не исполнился, защитные ордера не ставились");
    T.sound(!!long);
    T.touch();

    const filled = st.filled.totalSz;
    let part, rest, dist, act;
    try {
      const split = splitSize(filled, L.frac, asset.szDecimals);
      if (split.error) throw new Error(split.error);
      part = T.fmtSz(Number(split.part), asset.szDecimals);
      rest = T.fmtSz(Number(split.rest), asset.szDecimals);
      dist = T.fmtPx(Math.abs(L.tp1 - L.profit), asset);
      act = T.fmtPx(L.tp1, asset);
      if (!(Number(dist) > 0)) throw new Error("Стоп в плюсе слишком близко к первому тейку");
    } catch (e) {
      T.toast(`Позиция открыта, лестница не собралась: ${T.err(e)}. Поставьте стоп вручную.`, "err");
      T.sheet();
      await T.refresh();
      return;
    }
    const avg = Number(st.filled.avgPx) || L.plan.entry;
    const partN = Number(part) * L.tp1, restN = Number(rest) * Math.min(L.tp2, L.tp1);
    if (partN < 10 || restN < 10) {
      try {
        await one(ex, trigger(asset, long, "sl", L.sl, filled));
        T.toast("Позиция открыта. Части меньше $10 — тейки не выставлены. Стоп на всю позицию стоит.", "err");
      } catch (e) {
        T.toast(`Позиция открыта, части меньше $10, и стоп не встал: ${T.err(e)}`, "err");
      }
      T.sheet();
      await T.refresh();
      return;
    }

    const legs = [
      ["Стоп", () => one(ex, trigger(asset, long, "sl", L.sl, filled))],
      ["Первый тейк", () => one(ex, trigger(asset, long, "tp", L.tp1, part))],
      ["Второй тейк", () => one(ex, trigger(asset, long, "tp", L.tp2, rest))],
      ["Стоп в плюсе", () => ex.trailingStop({
        asset: asset.index,
        isBuy: !long,
        sz: rest,
        reduceOnly: true,
        retracement: { px: dist },
        activationPx: act,
      })],
    ];
    const bad = [];
    for (const [name, run] of legs) {
      try { await run(); }
      catch (e) { bad.push(`${name}: ${T.err(e)}`); }
    }
    const sideNote = long && L.profit <= avg ? " Стоп в плюсе не выше фактического входа — проверьте цену." : !long && L.profit >= avg ? " Стоп в плюсе не ниже фактического входа — проверьте цену." : "";
    if (bad.length) T.toast(`Позиция открыта. Не встало: ${bad.join("; ")}.${sideNote}`, "err");
    else T.toast(`Лестница на бирже: стоп, ${Math.round(L.frac * 100)}% на первом тейке, стоп в плюсе и второй тейк. Вкладку можно закрыть.${sideNote}`, "ok");
    T.sheet();
    await T.refresh();
  };

  function paint() {
    const on = el("ladderOn").checked;
    el("ladderBox").hidden = !on;
    const lab = el("tpLab");
    if (lab) lab.textContent = on ? "Первый тейк" : "Тейк-профит";
    const live = el("ladderLive");
    if (!on) { live.innerHTML = ""; return; }
    const longL = levels(true), shortL = levels(false);
    const chip = (name, L) => `<span class="th-chip">${name} ${L.error ? `<b class="neg">${L.error}</b>` : `стоп ${T.px(L.sl)} → тейк ${T.px(L.tp1)} (${Math.round(L.frac * 100)}%) → стоп ${T.px(L.profit)} и тейк ${T.px(L.tp2)}`}</span>`;
    if (longL.error && shortL.error) live.innerHTML = chip("Лонг", longL) + chip("Шорт", shortL);
    else live.innerHTML = (!longL.error ? chip("Лонг", longL) : "") + (!shortL.error ? chip("Шорт", shortL) : "");
  }

  el("ladderOn").addEventListener("change", paint);
  el("ladderFrac").addEventListener("click", e => {
    const b = e.target.closest("button[data-frac]");
    if (!b) return;
    el("ladderFrac").querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b));
    paint();
  });
  el("tpslRow")?.addEventListener("input", paint);
  document.querySelector("[data-unit-for='ord']")?.addEventListener("click", () => setTimeout(paint, 0));
  paint();
}

if (typeof document !== "undefined") {
  let started = false;
  const start = () => {
    if (started || !window.__totumTrade) return;
    started = true;
    boot();
  };
  start();
  window.addEventListener("totum-ready", start);
  const timer = setInterval(() => { start(); if (started) clearInterval(timer); }, 50);
  setTimeout(() => clearInterval(timer), 10000);
}
