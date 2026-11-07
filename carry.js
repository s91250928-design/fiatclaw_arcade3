/* Хедж: купить спот и открыть шорт фьючерса того же размера.
   Положительный фандинг получает шорт. Ключ остаётся в браузере. */

export function floorSize(amount, decimals) {
  const scale = 10 ** decimals;
  const units = Math.floor(Number(amount) * scale + 1e-8);
  if (!Number.isFinite(units) || units < 1) return { error: "Размер слишком мал" };
  return { sz: (units / scale).toFixed(decimals), units, scale };
}

export function carryNumbers({ notional, perpPx, spotPx, funding, perpFee, spotFee, decimals }) {
  if (!(notional >= 10)) return { error: "Минимум $10" };
  if (!(perpPx > 0 && spotPx > 0)) return { error: "Нет цены спота или фьючерса" };
  const sized = floorSize(notional / perpPx, decimals);
  if (sized.error) return sized;
  const base = sized.units / sized.scale;
  const perpN = base * perpPx;
  const spotN = base * spotPx;
  if (perpN < 10 || spotN < 10) return { error: `Каждая нога минимум $10. Сейчас спот $${spotN.toFixed(2)}, фьючерс $${perpN.toFixed(2)}` };
  const hour = perpN * funding;
  const day = hour * 24;
  const roundTrip = (perpN * perpFee + spotN * spotFee) * 2;
  const hours = funding > 0 ? roundTrip / (perpN * funding) : Infinity;
  let warn = "";
  if (!(funding > 0)) warn = "Фандинг сейчас против хеджа: шорт платит лонгам.";
  else if (hours > 24 * 14) warn = "Комиссии отобьются дольше двух недель.";
  return { sz: sized.sz, base, perpN, spotN, hour, day, roundTrip, hours, warn, error: "" };
}

function boot() {
  const T = window.__totumTrade;
  const el = id => document.getElementById(id);
  if (!T || !el("carryOn")) return;

  const twin = () => {
    if (!T.isPerp() || T.mode() === "close") return null;
    const coin = T.coin();
    const spots = T.spots?.() || [];
    return spots.find(s => s.quote === "USDC" && s.base === coin)
      || spots.find(s => s.quote === "USDC" && s.base === "U" + coin)
      || null;
  };

  function quote(notional) {
    const spot = twin();
    if (!spot) return { error: "Для этой монеты нет спота к USDC" };
    if (T.orderType() === "limit") return { error: "Хедж ставится только по рынку" };
    const perp = T.asset();
    if (!perp) return { error: "Рынок ещё не загружен" };
    const dec = Math.min(perp.szDecimals, spot.szDecimals);
    return {
      spot,
      ...carryNumbers({
        notional,
        perpPx: T.mid(T.coin()),
        spotPx: T.mid(spot.name),
        funding: T.funding(T.coin()),
        perpFee: T.fee(T.coin()),
        spotFee: T.fee(spot.name),
        decimals: dec,
      }),
    };
  }

  window.__totumCarryCheck = open => {
    if (!el("carryOn").checked) return "";
    if (!open) {
      const spot = twin();
      const pos = T.pos(T.coin());
      const free = spot ? T.spotFree(spot.base) : 0;
      if (!spot) return "Для этой монеты нет спота к USDC";
      if (!(pos && !pos.long && pos.sz > 0 && free > 0)) return "Закрывать нечего: нужен шорт фьючерса и спот на балансе";
      return "";
    }
    return quote(Number(el("size")?.value) || 0).error || "";
  };

  window.__totumCarryRows = (rows, open) => {
    if (!open) {
      rows.push(["Хедж", "Продать спот и закрыть шорт фьючерса", "warn"]);
      return;
    }
    const q = quote(Number(el("size")?.value) || 0);
    if (q.error) { rows.push(["Хедж", q.error, "warn"]); return; }
    const fund = T.funding(T.coin());
    rows.push(["Спот", `купить ${q.sz} ${q.spot.base}`, "pos"]);
    rows.push(["Фьючерс", `шорт ${q.sz} ${T.coin()}`, "neg"]);
    rows.push(["Фандинг", `${fund >= 0 ? "+" : "−"}${Math.abs(fund * 100).toFixed(4)}% в час · ${T.signed(q.day)} в день`, q.hour >= 0 ? "pos" : "neg"]);
    rows.push(["Комиссии туда-обратно", T.money(q.roundTrip), "warn"]);
    if (q.warn) rows.push(["Внимание", q.warn, "warn"]);
  };

  function paint() {
    const spot = twin();
    const toggle = el("carryToggle");
    if (toggle) toggle.hidden = !spot;
    if (!spot && el("carryOn").checked) el("carryOn").checked = false;
    const on = !!el("carryOn").checked && !!spot;
    el("carryBox").hidden = !on;
    const tpsl = el("tpslToggle");
    if (tpsl) tpsl.hidden = on || T.mode() === "close";
    if (on && el("tpslOn")?.checked) {
      el("tpslOn").checked = false;
      el("tpslRow").hidden = true;
    }
    const buy = el("btnBuy"), sell = el("btnSell");
    if (on && buy && sell) {
      buy.textContent = "Открыть хедж";
      sell.textContent = "Закрыть хедж";
    }
    const live = el("carryLive");
    if (!on) { if (live) live.innerHTML = ""; return; }
    const q = quote(Number(el("size")?.value) || 0);
    if (q.error) { live.innerHTML = `<span class="th-chip"><b class="neg">${q.error}</b></span>`; return; }
    const fund = T.funding(T.coin());
    const hours = Number.isFinite(q.hours) ? `${Math.ceil(q.hours)} ч` : "не окупается";
    const hourTxt = fund > 0 ? T.signed(q.hour) : T.money(Math.abs(q.hour));
    const dayTxt = fund > 0 ? T.signed(q.day) : T.money(Math.abs(q.day));
    const verb = fund > 0 ? "шорт получает" : "шорт платит";
    live.innerHTML = `<span class="th-chip">${verb} <b class="${fund > 0 ? "pos" : "neg"}">${hourTxt}</b> в час · ${dayTxt} в день</span><span class="th-chip">комиссии туда-обратно ${T.money(q.roundTrip)} · окупаемость ${hours}</span>${q.warn ? `<span class="th-chip"><b class="neg">${q.warn}</b></span>` : ""}`;
  }

  window.__totumCarryLabels = paint;

  async function ioc(assetIndex, isBuy, px, sz, reduceOnly) {
    const ex = T.ex();
    if (!ex?.order) throw new Error("Сначала подтвердите доступ к сделкам");
    const res = await ex.order({
      orders: [{ a: assetIndex, b: !!isBuy, p: px, s: sz, r: !!reduceOnly, t: { limit: { tif: "Ioc" } } }],
      grouping: "na",
      builder: T.builder(),
    });
    const st = res?.response?.data?.statuses?.[0];
    if (st?.error) throw new Error(typeof st.error === "string" ? st.error : JSON.stringify(st.error));
    if (!st?.filled || !(Number(st.filled.totalSz) > 0)) throw new Error("Ордер не исполнился");
    return st.filled;
  }

  function sameSize(fill, decimals) {
    const sz = T.fmtSz(Number(fill.totalSz), decimals);
    if (!(Number(sz) > 0)) throw new Error("Ордер не исполнился");
    return sz;
  }

  window.__totumCarry = async ({ open, notional }) => {
    const err = window.__totumCarryCheck(open);
    if (err) throw new Error(err);
    const spot = twin();
    const perp = T.asset();
    const dec = Math.min(perp.szDecimals, spot.szDecimals);
    if (open) {
      const q = quote(notional);
      if (q.error) throw new Error(q.error);
      const buy = T.mkt(spot.name, true, notional);
      const sell = T.mkt(T.coin(), false, notional);
      const sz = T.fmtSz(Number(q.sz), dec);
      const need = Number(buy.px) * Number(sz);
      const free = T.spotFree("USDC");
      if (free + 1e-6 < need) throw new Error(`На споте ${T.money(free)}, для покупки нужно около ${T.money(need)}. Переведите USDC с фьючерсного счёта.`);
      const buyFill = await ioc(spot.index, true, buy.px, sz, false);
      let bought;
      try { bought = sameSize(buyFill, dec); }
      catch (e) {
        T.toast(`Спот куплен (${buyFill.totalSz} ${spot.base}), но размер не подходит для шорта: ${T.err(e)}. Хедж не собран.`, "err");
        await T.refresh();
        return;
      }
      let shorted;
      try {
        shorted = sameSize(await ioc(perp.index, false, sell.px, bought, false), dec);
      } catch (e) {
        T.toast(`Спот куплен (${bought} ${spot.base}), шорт фьючерса не открылся: ${T.err(e)}. Хедж не собран.`, "err");
        await T.refresh();
        return;
      }
      if (Number(shorted) + 1e-8 < Number(bought)) T.toast(`Спот ${bought}, шорт только ${shorted}. Шорт меньше спота.`, "err");
      else if (Number(bought) + 1e-8 < Number(sz)) T.toast(`Хедж открыт частично: ${bought} ${spot.base} и шорт ${T.coin()}.`, "ok");
      else T.toast(`Хедж открыт: ${bought} ${spot.base} и шорт ${T.coin()}. Вкладку можно закрыть.`, "ok");
    } else {
      const pos = T.pos(T.coin());
      const free = T.spotFree(spot.base);
      const cap = Math.min(pos.sz, free);
      const mid = T.mid(T.coin());
      const spotMid = T.mid(spot.name);
      const want = mid > 0 ? Math.min(cap, notional / mid) : cap;
      const sized = floorSize(want, dec);
      if (sized.error) throw new Error(sized.error);
      const sz = T.fmtSz(Number(sized.sz), dec);
      if (Number(sz) * mid < 10 || Number(sz) * spotMid < 10) throw new Error("Каждая нога минимум $10");
      const cover = T.mkt(T.coin(), true, Number(sz) * mid);
      const dump = T.mkt(spot.name, false, Number(sz) * spotMid);
      const coverFill = await ioc(perp.index, true, cover.px, sz, true);
      let closed;
      try { closed = sameSize(coverFill, dec); }
      catch (e) {
        T.toast(`Шорт закрыт на ${coverFill.totalSz}, спот не продан: ${T.err(e)}.`, "err");
        await T.refresh();
        return;
      }
      let sold;
      try {
        sold = sameSize(await ioc(spot.index, false, dump.px, closed, false), dec);
      } catch (e) {
        T.toast(`Шорт закрыт на ${closed}, спот не продан: ${T.err(e)}.`, "err");
        await T.refresh();
        return;
      }
      if (Number(sold) + 1e-8 < Number(closed)) T.toast(`Шорт закрыт на ${closed}, спот продан только ${sold}.`, "err");
      else T.toast(`Хедж закрыт: ${sold} ${T.coin()}.`, "ok");
    }
    T.touch();
    await T.refresh();
  };

  el("carryOn").addEventListener("change", paint);
  el("size")?.addEventListener("input", paint);
  setInterval(paint, 2000);
  paint();
}

if (typeof document !== "undefined") {
  let started = false;
  const start = () => { if (started || !window.__totumTrade?.mkt) return; started = true; boot(); };
  start();
  window.addEventListener("totum-ready", start);
  const timer = setInterval(() => { start(); if (started) clearInterval(timer); }, 50);
  setTimeout(() => clearInterval(timer), 10000);
}
