import { TonConnect, toUserFriendlyAddress } from "./vendor/tonconnect.js";

const HL_GRAM = "https://app.hyperliquid.xyz/coins/GRAM.svg";
const PREFERRED = ["tonkeeper", "mytonwallet", "telegram", "telegram-wallet", "tonhub", "binanceWeb3TonWallet", "okxTonWallet", "bybitTonWallet", "bitgetTonWallet", "hot"];
const dlg = document.getElementById("gramDialog");
const connector = new TonConnect({ manifestUrl: location.origin + "/api/ton-manifest" });

let assets = [];
let pay = null;
let recv = null;
let tonAddr = "";
let quoteTimer = 0;
let searchTimer = 0;
let pickSide = "pay";
let tf = 1;
let balances = new Map();

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

function iconOf(a) {
  if (!a) return "";
  if (a.native || a.symbol === "GRAM") return HL_GRAM;
  return typeof a.image === "string" && a.image.startsWith("https://asset.ston.fi/") ? a.image : "";
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
    if (sym) sym.textContent = asset?.symbol || "—";
    if (!img) continue;
    const src = iconOf(asset);
    img.hidden = !src;
    if (src) img.src = src;
  }
  const pair = document.getElementById("tsPair");
  if (pair && recv) pair.textContent = recv.symbol;
  paintMax();
}

function paintGramPrice(price) {
  if (!price) return;
  document.querySelectorAll("[data-ton-px]").forEach((n) => { n.textContent = `$${fmt(price, 4)}`; });
}

function humanBalance(raw, asset) {
  const n = Number(raw) / 10 ** asset.decimals;
  if (!Number.isFinite(n) || n <= 0) return "";
  return n.toLocaleString("ru-RU", { maximumFractionDigits: n >= 1 ? 4 : 6 });
}

function paintMax() {
  const btn = document.getElementById("tsMax");
  const sub = document.getElementById("tsPayUsd");
  if (!btn || !pay) return;
  const raw = balances.get(pay.address);
  const shown = raw ? humanBalance(raw, pay) : "";
  btn.hidden = !shown;
  if (sub && !sub.dataset.usd) sub.textContent = shown ? `Доступно ${shown}` : "";
}

async function loadBalances() {
  if (!tonAddr) { balances = new Map(); paintMax(); return; }
  try {
    const j = await api({ action: "balance", from: tonAddr });
    balances = new Map((j.balances || []).map((b) => [b.address, b.amount]));
  } catch { balances = new Map(); }
  paintMax();
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
  svg.innerHTML = `<defs><linearGradient id="tsFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity="0.28"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs><path d="${line}L${w},${h}L0,${h}Z" fill="url(#tsFill)"/><path d="${line}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
  if (px) px.textContent = `$${fmt(last)}`;
  if (ch) {
    const p = (last / first - 1) * 100;
    ch.textContent = `${p >= 0 ? "+" : ""}${p.toFixed(2).replace(".", ",")}%`;
    ch.className = p >= 0 ? "pos" : "neg";
  }
  if (recv?.symbol === "GRAM") paintGramPrice(last);
}

async function loadChart() {
  if (!recv) return;
  try {
    const j = await api({ action: "chart", address: recv.address, days: tf });
    drawChart(j.points || []);
  } catch {
    drawChart([]);
  }
}

function setMeta(lines) {
  const box = document.getElementById("gramQuote");
  if (!box) return;
  box.replaceChildren();
  for (const text of lines) {
    const s = document.createElement("span");
    s.textContent = text;
    box.appendChild(s);
  }
}

async function refresh() {
  if (!pay || !recv) return;
  const amount = document.getElementById("gramAmt")?.value || "";
  const out = document.getElementById("tsRecv");
  if (out) out.textContent = "…";
  try {
    const j = await api({ action: "quote", offer: pay.address, ask: recv.address, amount });
    if (out) out.textContent = j.receive;
    const payUsd = document.getElementById("tsPayUsd");
    const recvUsd = document.getElementById("tsRecvUsd");
    if (payUsd) {
      payUsd.dataset.usd = j.payUsd || "";
      const avail = balances.get(pay.address);
      const shown = avail ? humanBalance(avail, pay) : "";
      payUsd.textContent = [j.payUsd ? `≈ $${j.payUsd}` : "", shown ? `доступно ${shown}` : ""].filter(Boolean).join(" · ");
    }
    if (recvUsd) recvUsd.textContent = j.recvUsd ? `≈ $${j.recvUsd}` : "";
    const rate = Number(j.rate);
    setMeta([
      Number.isFinite(rate) ? `1 ${j.paySymbol} ≈ ${fmt(rate)} ${j.askSymbol}` : "Курс",
      `минимум ${j.minReceive} ${j.askSymbol}`,
      `влияние ${j.impact}`,
    ]);
    say("");
  } catch (err) {
    if (out) out.textContent = "—";
    setMeta([err.message || "Курс не пришёл"]);
  }
}

function schedule() {
  clearTimeout(quoteTimer);
  quoteTimer = setTimeout(refresh, 320);
}

async function loadAssets(q) {
  const j = await api({ action: "assets", q: q || "" });
  const list = j.assets || [];
  if (!q) {
    assets = list;
    if (!pay) pay = list.find((a) => a.symbol === "USDT") || list[0] || null;
    if (!recv) recv = list.find((a) => a.symbol === "GRAM") || list.find((a) => a.address !== pay?.address) || null;
    const gram = list.find((a) => a.symbol === "GRAM" && a.native);
    if (gram?.price) paintGramPrice(gram.price);
    paintIcons();
  }
  return list;
}

function renderList(list) {
  const box = document.getElementById("tsList");
  if (!box) return;
  box.replaceChildren();
  if (!list.length) {
    const p = document.createElement("p");
    p.className = "muted small";
    p.textContent = "Ничего не найдено";
    box.appendChild(p);
    return;
  }
  const current = pickSide === "pay" ? pay : recv;
  for (const a of list) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = a.address === current?.address ? "ts-opt on" : "ts-opt";
    const src = iconOf(a);
    if (src) {
      const img = document.createElement("img");
      img.alt = "";
      img.src = src;
      b.appendChild(img);
    }
    const span = document.createElement("span");
    const name = document.createElement("b");
    name.textContent = a.symbol;
    const sub = document.createElement("small");
    sub.textContent = a.name;
    span.append(name, sub);
    const em = document.createElement("em");
    em.textContent = a.price ? `$${fmt(a.price)}` : "";
    b.append(span, em);
    b.onclick = () => choose(a);
    box.appendChild(b);
  }
}

function showPick(on) {
  document.getElementById("tsPick").hidden = !on;
  document.getElementById("tsMain").hidden = on;
  document.getElementById("tsBack").hidden = !on;
  document.getElementById("tsTitle").textContent = on ? "Токен" : "TON Swap";
}

function choose(a) {
  if (pickSide === "pay") {
    if (recv && a.address === recv.address) recv = pay;
    pay = a;
  } else {
    if (pay && a.address === pay.address) pay = recv;
    recv = a;
  }
  showPick(false);
  paintIcons();
  loadChart();
  refresh();
}

function openPick(side) {
  pickSide = side;
  const input = document.getElementById("tsSearch");
  if (input) input.value = "";
  renderList(assets);
  showPick(true);
  input?.focus();
}

function openGram() {
  if (!dlg) return;
  say("");
  showPick(false);
  dlg.showModal();
  if (!assets.length) {
    loadAssets().then(() => { loadChart(); refresh(); }).catch((err) => say(err.message || "Список не открылся", true));
  } else {
    paintIcons();
    loadChart();
    refresh();
  }
  if (tonAddr) loadBalances();
}

async function showWallets() {
  const box = document.getElementById("gramWallets");
  if (!box) return;
  if (!box.hidden && box.childElementCount) { box.hidden = true; return; }
  box.hidden = false;
  box.replaceChildren();
  const wait = document.createElement("p");
  wait.className = "muted small";
  wait.textContent = "Открываем список…";
  box.appendChild(wait);
  try {
    const all = await connector.getWallets();
    const rank = (w) => { const i = PREFERRED.indexOf(w.appName); return i < 0 ? 99 : i; };
    const list = all.slice().sort((a, b) => rank(a) - rank(b)).slice(0, 8);
    box.replaceChildren();
    for (const w of list) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "btn ghost";
      b.textContent = w.name;
      b.onclick = async () => {
        try {
          if (w.jsBridgeKey && (w.injected || w.embedded)) await connector.connect({ jsBridgeKey: w.jsBridgeKey });
          else {
            const link = await connector.connect({ universalLink: w.universalLink, bridgeUrl: w.bridgeUrl });
            if (typeof link === "string") window.open(link, "_blank", "noopener");
          }
          box.hidden = true;
        } catch (err) {
          say(err.message || "Кошелёк не открылся", true);
        }
      };
      box.appendChild(b);
    }
  } catch (err) {
    box.replaceChildren();
    const p = document.createElement("p");
    p.className = "neg small";
    p.textContent = err.message || "Список кошельков не открылся";
    box.appendChild(p);
  }
}

document.querySelectorAll("[data-gram-open]").forEach((n) => n.addEventListener("click", (e) => {
  e.preventDefault();
  e.stopPropagation();
  openGram();
}));
document.getElementById("gramClose")?.addEventListener("click", () => dlg?.close());
document.getElementById("tsBack")?.addEventListener("click", () => showPick(false));
document.getElementById("tsPayBtn")?.addEventListener("click", () => openPick("pay"));
document.getElementById("tsRecvBtn")?.addEventListener("click", () => openPick("recv"));
document.getElementById("tsFlip")?.addEventListener("click", () => {
  const next = pay;
  pay = recv;
  recv = next;
  paintIcons();
  loadChart();
  refresh();
});
document.getElementById("tsTf")?.addEventListener("click", (e) => {
  const b = e.target.closest("[data-tf]");
  if (!b) return;
  tf = Number(b.dataset.tf) === 7 ? 7 : 1;
  document.querySelectorAll("#tsTf button").forEach((n) => n.classList.toggle("on", n === b));
  loadChart();
});
document.getElementById("gramAmt")?.addEventListener("input", () => {
  const sub = document.getElementById("tsPayUsd");
  if (sub) delete sub.dataset.usd;
  schedule();
});
document.getElementById("tsMax")?.addEventListener("click", () => {
  if (!pay) return;
  const raw = balances.get(pay.address);
  if (!raw) return;
  let n = Number(raw) / 10 ** pay.decimals;
  if (pay.native) n = Math.max(0, n - 0.4);
  const input = document.getElementById("gramAmt");
  if (!input || !(n > 0)) return;
  input.value = n.toFixed(Math.min(pay.decimals, 6)).replace(/\.?0+$/, "");
  schedule();
});
document.getElementById("tsSearch")?.addEventListener("input", (e) => {
  const q = e.target.value.trim();
  clearTimeout(searchTimer);
  searchTimer = setTimeout(async () => {
    if (q.length < 2) { renderList(assets.filter((a) => !q || `${a.symbol} ${a.name}`.toLowerCase().includes(q.toLowerCase()))); return; }
    try { renderList(await loadAssets(q)); } catch { renderList([]); }
  }, 250);
});
document.getElementById("gramWallet")?.addEventListener("click", () => {
  if (tonAddr) { connector.disconnect(); return; }
  showWallets();
});
document.getElementById("gramGo")?.addEventListener("click", async () => {
  const btn = document.getElementById("gramGo");
  if (!pay || !recv) return;
  if (!tonAddr) { say("Сначала выбери TON-кошелёк", true); showWallets(); return; }
  say("");
  btn.disabled = true;
  const prev = btn.textContent;
  btn.textContent = "Собираем обмен…";
  try {
    const j = await api({
      action: "quote",
      offer: pay.address,
      ask: recv.address,
      amount: document.getElementById("gramAmt")?.value || "",
      from: tonAddr,
      build: true,
    });
    if (!j.sign) throw new Error("Обмен не собрался");
    btn.textContent = "Ждём кошелёк…";
    await connector.sendTransaction({
      validUntil: Math.floor(Date.now() / 1000) + 600,
      messages: [{ address: j.sign.address, amount: String(j.sign.amount), payload: j.sign.payload }],
    });
    say(`${j.askSymbol || recv.symbol} придёт на этот TON-кошелёк.`);
  } catch (err) {
    say(err.message || "Не отправилось", true);
  } finally {
    btn.disabled = false;
    btn.textContent = prev;
  }
});

function paintWallet() {
  const b = document.getElementById("gramWallet");
  if (!b) return;
  b.textContent = tonAddr ? `${tonAddr.slice(0, 4)}…${tonAddr.slice(-4)} · сменить` : "Выбрать TON-кошелёк";
}

connector.onStatusChange((w) => {
  tonAddr = w?.account?.address ? toUserFriendlyAddress(w.account.address) : "";
  paintWallet();
  if (dlg?.open) loadBalances();
});
connector.restoreConnection().catch(() => {});
loadAssets().catch(() => {});
