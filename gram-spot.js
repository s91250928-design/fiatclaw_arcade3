const HL = "https://app.hyperliquid.xyz/coins/";
const USDT = "EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs";
const GRAM = "EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c";
const USDC = {
  symbol: "USDC",
  name: "USDC",
  address: USDT,
  decimals: 6,
  image: `${HL}USDC.svg`,
  account: true,
};
const GRAM_ASSET = {
  symbol: "GRAM",
  name: "GRAM",
  address: GRAM,
  decimals: 9,
  image: `${HL}GRAM.svg`,
  native: true,
  account: false,
};

const dlg = document.getElementById("gramDialog");
let pay = USDC;
let recv = GRAM_ASSET;
let quoteTimer = 0;
let tf = 1;
let source = "spot";
let gramBal = 0;
let desk = null;

function say(text, bad) {
  const n = document.getElementById("gramErr");
  if (!n) return;
  n.hidden = !text;
  n.textContent = text || "";
  n.className = bad ? "neg small" : "muted small";
}

function fmt(n, dp) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  const d = dp ?? (x >= 1000 ? 2 : x >= 1 ? 4 : x >= 0.01 ? 4 : 6);
  return x.toLocaleString("ru-RU", { maximumFractionDigits: d });
}

function accountBook() {
  try {
    const info = window.totumWallet?.out?.();
    if (!info) return null;
    const perp = Number(info.perp);
    const spot = Number(info.spot);
    return {
      perp: Number.isFinite(perp) ? perp : 0,
      spot: Number.isFinite(spot) ? spot : 0,
    };
  } catch {
    return null;
  }
}

function available() {
  if (!pay.account) return gramBal;
  const book = accountBook();
  if (!book) return null;
  return source === "spot" ? book.spot : book.perp;
}

function maxAmount() {
  return available();
}

async function loadDesk() {
  const user = window.totumWallet?.addr?.() || "";
  try {
    desk = await api({ action: "gram-desk", user });
    gramBal = Number(desk.yours) || 0;
  } catch {
    desk = null;
  }
  if (dlg?.open) paintIcons();
}

function usdStr(n) {
  return (Math.floor(Number(n) * 1e6) / 1e6).toFixed(6).replace(/\.?0+$/, "");
}

async function swap() {
  const raw = Number(amount());
  const have = available();
  const addr = window.totumWallet?.addr?.();
  if (!addr) {
    say("Сначала подключите кошелёк, которым торгуете", true);
    document.getElementById("btnConnect")?.click();
    return;
  }
  if (!pay.account) {
    say("Продажа с активов вернёт USDC на фьючерсы. Сейчас покупайте: токен останется в активах, не на кошельке.", true);
    return;
  }
  if (!(have > 0) || !(raw > 0) || raw > have + 1e-8) { say("Нет денег", true); return; }
  if (raw < 8) { say("Минимум 8 USDC", true); return; }
  const amt = usdStr(raw);
  let j = await api({ action: "pool-step", user: addr, amount: amt, look: true });
  if (j.idle) {
    const ex = window.totumWallet.ex?.();
    if (!ex?.withdraw3 || !j.desk) { say("Подключите кошелёк ещё раз", true); return; }
    say("Подтвердите в кошельке транзакцию");
    if (source === "spot") {
      try { await ex.usdClassTransfer({ amount: amt, toPerp: true }); }
      catch (err) {
        if (/insufficient|balance/i.test(String(err?.message || ""))) throw err;
      }
    }
    await ex.withdraw3({ destination: j.desk, amount: amt });
    await api({ action: "pool-arm", user: addr, amount: amt, token: recv.address });
  }
  for (let i = 0; i < 60; i++) {
    try {
      j = await api({ action: "pool-step", user: addr, amount: amt, token: recv.address });
    } catch (err) {
      say(err.message || "Обмен идёт");
      await new Promise((r) => setTimeout(r, 5000));
      continue;
    }
    if (j.done) {
      say(j.step || `Готово: ${j.got} ${recv.symbol} в активах`);
      const input = document.getElementById("gramAmt");
      if (input) input.value = "";
      schedule();
      loadHoldings();
      window.totumWallet?.refresh?.().catch(() => {});
      return;
    }
    say(progress(j));
    await new Promise((r) => setTimeout(r, 5000));
  }
  say("Обмен ещё идёт. Откройте его снова: повторно деньги не спишутся.", true);
}

function progress(j) {
  let text = j.step || "Обмен идёт";
  const min = j.since ? Math.floor((Date.now() - Number(j.since)) / 60000) : 0;
  if (min >= 1) text += `. Уже ${min} мин`;
  return text;
}

async function api(body) {
  const r = await fetch("/api/ton-manifest", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind: "ton-swap", ...body }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.ok) throw new Error(j.error || "Не посчиталось");
  return j;
}

function paintIcons() {
  for (const [img, sym, asset] of [
    [document.getElementById("tsPayIc"), document.getElementById("tsPaySym"), pay],
    [document.getElementById("tsRecvIc"), document.getElementById("tsRecvSym"), recv],
  ]) {
    if (sym) sym.textContent = asset.symbol;
    if (img) img.src = asset.image;
  }
  const pair = document.getElementById("tsPair");
  if (pair) pair.textContent = recv.symbol;
  const have = available();
  const book = accountBook();
  const sub = document.getElementById("tsPayUsd");
  const max = document.getElementById("tsMax");
  const src = document.getElementById("tsSource");
  if (src) src.hidden = !pay.account;
  const spotB = document.getElementById("tsSpotBal");
  const perpB = document.getElementById("tsPerpBal");
  if (spotB) spotB.textContent = book ? `${fmt(book.spot, 2)} USDC` : "—";
  if (perpB) perpB.textContent = book ? `${fmt(book.perp, 2)} USDC` : "—";
  src?.querySelectorAll("[data-src]").forEach((b) => b.classList.toggle("on", b.dataset.src === source));
  if (sub && !sub.dataset.usd) {
    if (!pay.account) sub.textContent = have > 0 ? `На споте ${fmt(have, 4)} GRAM` : "Нет денег";
    else if (have == null) sub.textContent = "На счёте";
    else if (!(have > 0)) sub.textContent = "Нет денег";
    else sub.textContent = source === "spot" ? `На споте ${fmt(have, 2)} USDC` : `На фьючерсах ${fmt(have, 2)} USDC`;
  }
  if (max) max.hidden = !(have > 0);
  const where = document.getElementById("tsRecvUsd");
  if (where && !where.dataset.usd) where.textContent = "В активы";
}

function paintGramPrice(price) {
  if (!price) return;
  document.querySelectorAll("[data-ton-px]").forEach((n) => { n.textContent = `$${fmt(price, 4)}`; });
}

function drawChart(points) {
  const svg = document.getElementById("tsChart");
  const px = document.getElementById("tsPx");
  const ch = document.getElementById("tsCh");
  if (!svg) return;
  if (!points || points.length < 2) {
    svg.innerHTML = "";
    if (px) px.textContent = "—";
    if (ch) ch.textContent = "";
    return;
  }
  const first = points[0];
  const last = points[points.length - 1];
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || Math.abs(max) * 0.02 || 1;
  const w = 320;
  const h = 84;
  const pad = 4;
  const coords = points.map((y, i) => {
    const x = (i / (points.length - 1)) * w;
    const yy = pad + (1 - (y - min) / span) * (h - pad * 2);
    return [x, yy];
  });
  const up = last >= first;
  const color = up ? "#22c55e" : "#f43f5e";
  const line = coords.map((c, i) => `${i ? "L" : "M"}${c[0].toFixed(1)},${c[1].toFixed(1)}`).join("");
  svg.innerHTML = `<defs><linearGradient id="tsFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity="0.35"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs><path d="${line}L${w},${h}L0,${h}Z" fill="url(#tsFill)"/><path d="${line}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
  if (px) px.textContent = `$${fmt(last, 4)}`;
  if (ch && first) {
    const p = (last / first - 1) * 100;
    ch.textContent = `${p >= 0 ? "+" : ""}${p.toFixed(2).replace(".", ",")}%`;
    ch.className = p >= 0 ? "pos" : "neg";
  }
  paintGramPrice(last);
}

async function loadChart() {
  try {
    const j = await api({ action: "chart", address: recv.address || GRAM, days: tf });
    drawChart(j.points || []);
  } catch {
    drawChart([]);
  }
}

function amount() {
  return String(document.getElementById("gramAmt")?.value || "").trim().replace(",", ".");
}

async function refresh() {
  const box = document.getElementById("gramQuote");
  const out = document.getElementById("tsRecv");
  const payUsd = document.getElementById("tsPayUsd");
  const recvUsd = document.getElementById("tsRecvUsd");
  const raw = amount();
  if (!raw || Number(raw) <= 0) {
    if (out) out.textContent = "—";
    if (box) box.replaceChildren();
    return;
  }
  if (!pay.account) {
    if (out) out.textContent = "—";
    if (box) box.textContent = "Продажа с активов вернёт USDC на фьючерсы. Пока покупайте: токен останется в активах.";
    return;
  }
  try {
    const j = await api({ action: "pool-quote", amount: raw, token: recv.address });
    if (out) out.textContent = j.receive;
    if (payUsd) {
      payUsd.dataset.usd = "1";
      const have = available();
      const where = !pay.account
        ? " · нет денег"
        : have == null ? "" : ` · ${source === "spot" ? "на споте" : "на фьючерсах"} ${fmt(have, 2)}`;
      payUsd.textContent = `≈ $${j.payUsd || "—"}${where}`;
    }
    if (recvUsd) {
      recvUsd.dataset.usd = "1";
      recvUsd.textContent = `≈ $${j.recvUsd || "—"} · в активах`;
    }
    if (box) {
      box.replaceChildren();
      for (const text of [
        `1 ${pay.symbol} ≈ ${fmt(j.rate)} ${recv.symbol}`,
        `минимум ${j.minReceive} ${recv.symbol}`,
        `влияние ${j.impact}`,
      ]) {
        const s = document.createElement("span");
        s.textContent = text;
        box.appendChild(s);
      }
    }
  } catch (err) {
    if (out) out.textContent = "—";
    if (box) box.textContent = err.message || "Курс не пришёл";
  }
}

function schedule() {
  const sub = document.getElementById("tsPayUsd");
  const recvUsd = document.getElementById("tsRecvUsd");
  if (sub) delete sub.dataset.usd;
  if (recvUsd) delete recvUsd.dataset.usd;
  paintIcons();
  clearTimeout(quoteTimer);
  quoteTimer = setTimeout(refresh, 320);
}

function flip() {
  const next = pay;
  pay = recv;
  recv = next;
  const input = document.getElementById("gramAmt");
  if (input && !(available() > 0)) input.value = "";
  say("");
  schedule();
}

function openGram() {
  if (!dlg) return;
  say("");
  dlg.showModal();
  paintIcons();
  loadChart();
  refresh();
  loadDesk();
  loadHoldings();
  window.totumWallet?.refresh?.().then(() => { if (dlg.open) paintIcons(); }).catch(() => {});
}

document.querySelectorAll("[data-gram-open]").forEach((n) => n.addEventListener("click", (e) => {
  e.preventDefault();
  e.stopPropagation();
  openGram();
}));
document.getElementById("gramClose")?.addEventListener("click", () => dlg?.close());
document.getElementById("tsFlip")?.addEventListener("click", flip);
document.getElementById("tsTf")?.addEventListener("click", (e) => {
  const b = e.target.closest("[data-tf]");
  if (!b) return;
  tf = Number(b.dataset.tf) === 7 ? 7 : 1;
  document.querySelectorAll("#tsTf button").forEach((n) => n.classList.toggle("on", n === b));
  loadChart();
});
document.getElementById("gramAmt")?.addEventListener("input", schedule);
document.getElementById("tsMax")?.addEventListener("click", () => {
  const have = maxAmount();
  const input = document.getElementById("gramAmt");
  if (!input || !(have > 0)) return;
  input.value = have.toFixed(pay.account ? 2 : 4).replace(/\.?0+$/, "");
  schedule();
});
document.getElementById("tsSource")?.addEventListener("click", (e) => {
  const b = e.target.closest("[data-src]");
  if (!b || b.dataset.src === source) return;
  source = b.dataset.src === "perp" ? "perp" : "spot";
  say("");
  schedule();
});
document.getElementById("gramGo")?.addEventListener("click", async () => {
  const btn = document.getElementById("gramGo");
  if (btn) btn.disabled = true;
  try {
    await swap();
  } catch (err) {
    say(err.message || "Обмен не прошёл", true);
  } finally {
    if (btn) btn.disabled = false;
  }
});

function esc(s) {
  const amp = String.fromCharCode(38) + "amp;";
  const lt = String.fromCharCode(38) + "lt;";
  const gt = String.fromCharCode(38) + "gt;";
  const quot = String.fromCharCode(38) + "quot;";
  return String(s ?? "").replace(/&/g, amp).replace(/</g, lt).replace(/>/g, gt).replace(/"/g, quot);
}

let held = [];
let painting = false;

function paintHoldings() {
  if (painting) return;
  painting = true;
  document.querySelectorAll("[data-ton-hold]").forEach((n) => n.remove());
  const rows = held.filter((row) => Number(row.amount) > 0);
  const body = document.getElementById("spotBody");
  if (body) {
    for (const row of rows) {
      const tr = document.createElement("tr");
      tr.dataset.tonHold = "1";
      const img = String(row.image || "").startsWith("https://asset.ston.fi/") ? `<img src="${esc(row.image)}" alt="" width="18" height="18">` : "";
      tr.innerHTML = `<td><div class="pp-name">${img}<b>${esc(row.symbol)}</b></div></td><td>${esc(row.amount)}</td><td>${esc(row.amount)}</td><td>0</td><td>—</td><td>—</td><td>—</td><td class="muted">TON</td>`;
      body.appendChild(tr);
    }
  }
  const page = document.getElementById("pgAssets");
  const spotCard = [...(page?.querySelectorAll(".card-block") || [])].find((n) => n.querySelector(".cb-head")?.textContent?.includes("Спот"));
  if (spotCard) {
    for (const row of rows) {
      const div = document.createElement("div");
      div.className = "as-row";
      div.dataset.tonHold = "1";
      const img = String(row.image || "").startsWith("https://asset.ston.fi/") ? `<img src="${esc(row.image)}" alt="" width="28" height="28">` : "";
      div.innerHTML = `${img}<div><b>${esc(row.symbol)}</b><small class="muted">${esc(row.amount)} · сеть TON</small></div><span>в активах</span>`;
      spotCard.appendChild(div);
    }
  }
  painting = false;
}

async function loadHoldings() {
  const user = window.totumWallet?.addr?.();
  if (!user) return;
  try {
    const j = await api({ action: "holdings", user });
    held = j.assets || [];
    paintHoldings();
  } catch { /* активы подтянутся следующим заходом */ }
}

function watchHoldings() {
  const spot = document.getElementById("spotBody");
  const page = document.getElementById("pgAssets");
  const kick = () => { if (!painting && held.length && !document.querySelector("#spotBody [data-ton-hold], #pgAssets [data-ton-hold]")) paintHoldings(); };
  if (spot) new MutationObserver(kick).observe(spot, { childList: true });
  if (page) new MutationObserver(kick).observe(page, { childList: true });
  setInterval(loadHoldings, 20000);
  loadHoldings();
}

let catalog = [];
function drawList(list) {
  const box = document.getElementById("tsList");
  if (!box) return;
  box.replaceChildren();
  for (const a of list) {
    if (a.symbol === "USDC") continue;
    const b = document.createElement("button");
    b.type = "button";
    b.className = "ts-opt";
    const img = String(a.image || "").startsWith("https://asset.ston.fi/") ? `<img src="${esc(a.image)}" alt="">` : "";
    b.innerHTML = `${img}<span><b>${esc(a.symbol)}</b><small>${esc(a.name || "")}</small></span><em>${a.price ? "$" + fmt(a.price, 4) : ""}</em>`;
    b.addEventListener("click", () => {
      recv = {
        symbol: a.symbol,
        name: a.name,
        address: a.address,
        decimals: a.decimals,
        image: a.image || "",
        native: !!a.native,
        account: false,
      };
      document.getElementById("tsMain").hidden = false;
      document.getElementById("tsPick").hidden = true;
      document.getElementById("tsBack").hidden = true;
      paintIcons();
      loadChart();
      schedule();
    });
    box.appendChild(b);
  }
}

document.getElementById("tsRecvBtn")?.addEventListener("click", async () => {
  document.getElementById("tsMain").hidden = true;
  document.getElementById("tsPick").hidden = false;
  document.getElementById("tsBack").hidden = false;
  try {
    if (!catalog.length) catalog = (await api({ action: "assets" })).assets || [];
    drawList(catalog);
  } catch (err) {
    const box = document.getElementById("tsList");
    if (box) box.textContent = err.message || "Список не пришёл";
  }
});
document.getElementById("tsBack")?.addEventListener("click", () => {
  document.getElementById("tsMain").hidden = false;
  document.getElementById("tsPick").hidden = true;
  document.getElementById("tsBack").hidden = true;
});
document.getElementById("tsSearch")?.addEventListener("input", (e) => {
  const q = e.target.value.trim().toLowerCase();
  drawList(catalog.filter((a) => `${a.symbol} ${a.name}`.toLowerCase().includes(q)));
});

watchHoldings();

api({ action: "assets" }).then((j) => {
  const g = (j.assets || []).find((a) => a.symbol === "GRAM");
  if (g?.price) paintGramPrice(g.price);
}).catch(() => {});
paintIcons();
