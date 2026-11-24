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

function accountUsdc() {
  try {
    const info = window.totumWallet?.out?.();
    if (!info) return null;
    const n = info.unified ? Number(info.spot) : Number(info.perp);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return null;
  }
}

function available() {
  if (pay.account) return accountUsdc();
  return 0;
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
  const sub = document.getElementById("tsPayUsd");
  const max = document.getElementById("tsMax");
  if (sub && !sub.dataset.usd) {
    if (pay.account) sub.textContent = have == null ? "На счёте" : `На счёте ${fmt(have, 2)} USDC`;
    else sub.textContent = "На споте 0 GRAM";
  }
  if (max) max.hidden = !(pay.account && have > 0);
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
      const where = pay.account ? (have == null ? "" : ` · на счёте ${fmt(have, 2)}`) : " · на споте 0";
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
  if (input && (!input.value || input.value === "10" || input.value === "5")) input.value = pay.account ? "10" : "5";
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
  const have = accountUsdc();
  const input = document.getElementById("gramAmt");
  if (!input || !(have > 0)) return;
  input.value = String(Math.floor(have * 100) / 100);
  schedule();
});
document.getElementById("gramGo")?.addEventListener("click", () => {
  const raw = Number(amount());
  if (!(raw > 0)) { say("Введите сумму", true); return; }
  if (!window.totumWallet?.addr?.()) {
    say("Сначала подключите кошелёк, которым торгуете", true);
    document.getElementById("btnConnect")?.click();
    return;
  }
  if (pay.account) {
    const have = accountUsdc();
    if (have == null) { say("Баланс счёта не виден", true); return; }
    if (raw > have + 1e-8) { say(`На счёте ${fmt(have, 2)} USDC`, true); return; }
    say("Со счёта в GRAM на спот пока нельзя: биржа хранит только USDC.", true);
    return;
  }
  say("На споте GRAM нет. Меняют USDC со счёта.", true);
});

api({ action: "assets" }).then((j) => {
  const g = (j.assets || []).find((a) => a.symbol === "GRAM");
  if (g?.price) paintGramPrice(g.price);
}).catch(() => {});
paintIcons();
