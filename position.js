/* Лимит Про на уже открытой позиции.
   Кнопка в строке позиции открывает окно TP/SL с этим режимом.
   Рыночное закрытие идёт в обычное окно закрытия, не в плашку. */

import { validatePositionLadder, splitSize, legOrder } from "./ladder.js";

function boot() {
  const T = window.__totumTrade;
  const el = id => document.getElementById(id);
  if (!T || !el("dlgLadder")) return;

  document.addEventListener("click", e => {
    const btn = e.target.closest("[data-pro]");
    if (!btn) return;
    const coin = btn.dataset.pro;
    const open = document.createElement("button");
    open.hidden = true;
    open.dataset.tpsl = coin;
    document.body.appendChild(open);
    open.click();
    open.remove();
    const box = el("dlgLadder");
    if (!box || !el("tpslDialog")?.open) return;
    box.checked = true;
    box.dispatchEvent(new Event("change"));
  });

  const frac = () => Number(document.querySelector("#dlgFrac button.on")?.dataset.frac) || 0.5;

  function dlgLevels() {
    const d = T.dlg();
    const pos = d && T.pos(d.coin);
    if (!pos) return { error: "Позиция уже закрыта" };
    const plan = { entry: pos.entry, sz: pos.sz, long: pos.long, margin: pos.margin };
    const sl = T.readDlg("psl", "sl", plan);
    const tp1 = T.readDlg("ptp", "tp", plan);
    const profit = T.readDlg("dlgP", "tp", plan);
    const tp2 = T.readDlg("dlgTp2", "tp", plan);
    const notional = pos.value > 0 ? pos.value : pos.sz * pos.mark;
    const error = validatePositionLadder({
      long: pos.long, entry: pos.entry, mark: pos.mark, sl, tp1, profit, tp2, notional, frac: frac(),
    });
    return { error, pos, sl, tp1, profit, tp2, notional };
  }

  function paintDlg() {
    const on = el("dlgLadder").checked;
    el("dlgLadderBox").hidden = !on;
    const note = el("tpslNote");
    if (note) note.hidden = on;
    const lab = el("ptpLab");
    if (lab) lab.textContent = on ? "Первый тейк" : "Тейк-профит";
    const live = el("dlgLadderLive");
    if (!on) { live.innerHTML = ""; return; }
    const any = ["ptp", "psl", "dlgP", "dlgTp2"].some(id => Number(el(id)?.value) > 0);
    if (!any) { live.innerHTML = ""; return; }
    const L = dlgLevels();
    live.innerHTML = L.error
      ? `<span class="th-chip"><b class="neg">${L.error}</b></span>`
      : `<span class="th-chip">стоп ${T.px(L.sl)} → тейк ${T.px(L.tp1)} (${Math.round(frac() * 100)}%) → стоп ${T.px(L.profit)} и тейк ${T.px(L.tp2)}</span>`;
  }

  window.__totumDlgLadderReset = () => {
    el("dlgLadder").checked = false;
    el("dlgP").value = "";
    el("dlgTp2").value = "";
    paintDlg();
  };
  el("dlgLadder").addEventListener("change", paintDlg);
  el("dlgFrac").addEventListener("click", e => {
    const b = e.target.closest("button[data-frac]");
    if (!b) return;
    el("dlgFrac").querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b));
    paintDlg();
  });
  el("tpslDialog").addEventListener("input", paintDlg);
  document.querySelector("[data-unit-for='dlg']")?.addEventListener("click", () => setTimeout(paintDlg, 0));

  window.__totumPosLadder = async () => {
    const L = dlgLevels();
    if (L.error) { T.toast(L.error, "err"); return; }
    const asset = T.assetOf(L.pos.coin);
    const ex = T.ex();
    if (!asset || !ex?.trailingStop) { T.toast("Трейлинг-стоп в этом клиенте недоступен", "err"); return; }
    const btn = el("tpslGo");
    T.busy(btn, true, "Сохраняем…");
    try {
      const split = splitSize(String(L.pos.sz), frac(), asset.szDecimals);
      if (split.error) throw new Error(split.error);
      const part = T.fmtSz(Number(split.part), asset.szDecimals);
      const rest = T.fmtSz(Number(split.rest), asset.szDecimals);
      const full = T.fmtSz(L.pos.sz, asset.szDecimals);
      const dist = T.fmtPx(Math.abs(L.tp1 - L.profit), asset);
      const act = T.fmtPx(L.tp1, asset);
      if (!(Number(dist) > 0)) throw new Error("Стоп в плюсе слишком близко к первому тейку");
      const old = T.orders(L.pos.coin).filter(o => (o.isTrigger && o.reduceOnly) || /trail/i.test(o.orderType));
      if (old.length) await T.cancel(L.pos.coin, old.map(o => o.oid));
      const slip = T.slip();
      const legs = [
        ["Стоп", legOrder(asset, L.pos.long, "sl", L.sl, full, T.fmtPx, slip)],
        ["Первый тейк", legOrder(asset, L.pos.long, "tp", L.tp1, part, T.fmtPx, slip)],
        ["Второй тейк", legOrder(asset, L.pos.long, "tp", L.tp2, rest, T.fmtPx, slip)],
      ];
      const bad = [];
      for (const [name, order] of legs) {
        try {
          const res = await ex.order({ orders: [order], grouping: "na", builder: T.builder() });
          const st = res?.response?.data?.statuses?.[0];
          if (st?.error) throw new Error(typeof st.error === "string" ? st.error : JSON.stringify(st.error));
        } catch (e) { bad.push(`${name}: ${T.err(e)}`); }
      }
      try {
        await ex.trailingStop({
          asset: asset.index, isBuy: !L.pos.long, sz: rest, reduceOnly: true,
          retracement: { px: dist }, activationPx: act,
        });
      } catch (e) { bad.push(`Стоп в плюсе: ${T.err(e)}`); }
      if (bad.length) T.toast(`Не всё встало: ${bad.join("; ")}. Проверьте открытые ордера.`, "err");
      else {
        T.toast("Лимит Про на бирже. Вкладку можно закрыть.", "ok");
        el("tpslDialog").close();
      }
      T.touch();
      await T.refresh();
    } catch (e) {
      T.toast(T.err(e), "err");
    } finally { T.busy(btn, false); }
  };
}

let started = false;
function start() { if (started || !window.__totumTrade) return; started = true; boot(); }
if (typeof document !== "undefined") {
  start();
  window.addEventListener("totum-ready", start);
  const timer = setInterval(() => { start(); if (started) clearInterval(timer); }, 50);
  setTimeout(() => clearInterval(timer), 10000);
}
