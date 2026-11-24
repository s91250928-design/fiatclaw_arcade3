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
  if (!pay.account) return 0;
  const book = accountBook();
  if (!book) return null;
  return source === "spot" ? book.spot : book.perp;
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
  if (pair) pair.textContent = "GRAM";
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
  if (where && !where.dataset.usd) where.textContent = recv.account ? "На счёт" : "На спот";
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
    const j = await api({ action: "chart", address: GRAM, days: tf });
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
  try {
    const j = await api({ action: "quote", offer: pay.address, ask: recv.address, amount: raw });
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
      recvUsd.textContent = `≈ $${j.recvUsd || "—"} · ${recv.account ? "на счёт" : "на спот"}`;
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
  const have = available();
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
document.getElementById("gramGo")?.addEventListener("click", () => {
  const raw = Number(amount());
  const have = available();
  if (!window.totumWallet?.addr?.()) {
    say("Сначала подключите кошелёк, которым торгуете", true);
    document.getElementById("btnConnect")?.click();
    return;
  }
  if (!(have > 0) || !(raw > 0)) { say("Нет денег", true); return; }
  if (raw > have + 1e-8) { say("Нет денег", true); return; }
  if (!pay.account) { say("Нет денег", true); return; }
  say("В GRAM на спот Totum пока не зачисляет: на счёте только USDC.", true);
});

api({ action: "assets" }).then((j) => {
  const g = (j.assets || []).find((a) => a.symbol === "GRAM");
  if (g?.price) paintGramPrice(g.price);
}).catch(() => {});
paintIcons();
