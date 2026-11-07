/* Подтверждение рыночного закрытия на плашке позиции
   и лестница для уже открытой позиции (окно TP/SL). */

import { validatePositionLadder, splitSize, legOrder } from "./ladder.js";

export function closePreview(pos, feeRate) {
  const value = pos.value > 0 ? pos.value : pos.sz * pos.mark;
  const fee = value * (Number(feeRate) || 0);
  return { value, fee, net: pos.pnl - fee };
}

function boot() {
  const T = window.__totumTrade;
  const el = id => document.getElementById(id);
  if (!T || !el("posBody") || !el("dlgLadder")) return;

  const pending = { coin: null, szi: null };
  let painting = false;

  function askNode(pos) {
    const view = closePreview(pos, T.fee(pos.coin));
    const box = document.createElement("div");
    box.className = "pos-ask";
    box.dataset.act = "1";
    const text = document.createElement("div");
    const head = document.createElement("div");
    head.className = "pa-h";
    head.textContent = `Закрыть ${pos.long ? "лонг" : "шорт"} ${pos.coin} по рынку?`;
    const sub = document.createElement("div");
    sub.className = "pa-sub";
    const netCls = view.net >= 0 ? "pos" : "neg";
    const pnlCls = pos.pnl >= 0 ? "pos" : "neg";
    sub.innerHTML = `Сейчас <b class="${pnlCls}">${T.signed(pos.pnl)}</b> · комиссия выхода ≈ ${T.money(view.fee)}<br>После выхода ≈ <b class="num ${netCls}">${T.signed(view.net)}</b>`;
    const tiny = document.createElement("div");
    tiny.className = "pa-sub";
    tiny.textContent = "Оценка по маркировке, без проскальзывания. Ордер ещё не отправлен.";
    text.append(head, sub, tiny);
    const acts = document.createElement("div");
    acts.className = "pa-acts";
    const no = document.createElement("button");
    no.type = "button";
    no.className = "btn small ghost";
    no.dataset.posCancel = "1";
    no.textContent = "Отмена";
    const yes = document.createElement("button");
    yes.type = "button";
    yes.className = "btn small sell";
    yes.dataset.posGo = "1";
    yes.textContent = "Закрыть по рынку";
    acts.append(no, yes);
    box.append(text, acts);
    return box;
  }

  function mount() {
    if (painting) return;
    painting = true;
    try {
      document.querySelectorAll("[data-pos-confirm]").forEach(n => {
        if (!pending.coin || n.dataset.coin !== pending.coin) n.remove();
      });
      if (!pending.coin) return;
      const pos = T.pos(pending.coin);
      if (!pos) { pending.coin = null; return; }
      document.querySelectorAll(`[data-pos-coin="${CSS.escape(pending.coin)}"]`).forEach(root => {
        if (root.tagName === "TR") {
          const next = root.nextElementSibling;
          if (next?.dataset.posConfirm === "1" && next.dataset.coin === pending.coin) {
            next.querySelector("td").replaceChildren(askNode(pos));
            return;
          }
          const tr = document.createElement("tr");
          tr.dataset.posConfirm = "1";
          tr.dataset.coin = pending.coin;
          tr.className = "pos-confirm";
          const td = document.createElement("td");
          td.colSpan = root.children.length || 12;
          td.appendChild(askNode(pos));
          tr.appendChild(td);
          root.after(tr);
        } else if (!root.querySelector("[data-pos-confirm]")) {
          const wrap = document.createElement("div");
          wrap.dataset.posConfirm = "1";
          wrap.dataset.coin = pending.coin;
          wrap.appendChild(askNode(pos));
          root.appendChild(wrap);
        } else {
          root.querySelector("[data-pos-confirm]").replaceChildren(askNode(pos));
        }
      });
    } finally { painting = false; }
  }

  document.addEventListener("click", e => {
    const btn = e.target.closest("[data-close]");
    if (!btn || btn.dataset.skipconfirm === "1") return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (pending.coin === btn.dataset.close) pending.coin = null;
    else { pending.coin = btn.dataset.close; pending.szi = btn.dataset.szi; }
    mount();
  }, true);

  document.addEventListener("click", e => {
    if (e.target.closest("[data-pos-cancel]")) {
      pending.coin = null;
      mount();
      return;
    }
    const go = e.target.closest("[data-pos-go]");
    if (!go || !pending.coin) return;
    e.preventDefault();
    e.stopPropagation();
    const coin = pending.coin, szi = pending.szi;
    pending.coin = null;
    mount();
    const b = document.createElement("button");
    b.hidden = true;
    b.dataset.close = coin;
    b.dataset.szi = szi;
    b.dataset.skipconfirm = "1";
    document.body.appendChild(b);
    b.click();
    b.remove();
  }, true);

  const watch = new MutationObserver(() => { if (pending.coin && !painting) mount(); });
  watch.observe(el("posBody"), { childList: true });
  const cards = el("posCards");
  if (cards) watch.observe(cards, { childList: true });

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
        T.toast("Лестница на бирже. Вкладку можно закрыть.", "ok");
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
