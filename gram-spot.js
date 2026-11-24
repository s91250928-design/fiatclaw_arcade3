import { TonConnect, toUserFriendlyAddress } from "./vendor/tonconnect.js";

const PREFERRED = ["tonkeeper", "mytonwallet", "telegram", "telegram-wallet", "tonhub", "binanceWeb3TonWallet", "okxTonWallet", "bybitTonWallet", "bitgetTonWallet", "hot"];
const dlg = document.getElementById("gramDialog");
const connector = new TonConnect({ manifestUrl: location.origin + "/api/ton-manifest" });
let side = "buy";
let tonAddr = "";
let quoteTimer = 0;

function say(text, bad) {
  const n = document.getElementById("gramErr");
  if (!n) return;
  n.hidden = !text;
  n.textContent = text || "";
  n.className = bad ? "neg small" : "muted small";
}

function setSide(next) {
  side = next;
  document.querySelectorAll("#gramSide button").forEach((b) => b.classList.toggle("on", b.dataset.side === side));
  const label = document.getElementById("gramAmtLabel");
  const go = document.getElementById("gramGo");
  const amt = document.getElementById("gramAmt");
  if (label) label.textContent = side === "buy" ? "Отдаёшь, USDT" : "Отдаёшь, GRAM";
  if (go) go.textContent = side === "buy" ? "Купить GRAM" : "Продать GRAM";
  if (amt && !amt.value) amt.value = side === "buy" ? "10" : "5";
  refresh();
}

function paintWallet() {
  const b = document.getElementById("gramWallet");
  if (!b) return;
  b.textContent = tonAddr ? `${tonAddr.slice(0, 4)}…${tonAddr.slice(-4)} · сменить` : "Выбрать TON-кошелёк";
}

async function quote(build) {
  const amount = document.getElementById("gramAmt")?.value || "";
  const r = await fetch("/api/ton-manifest", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind: "gram-spot", side, amount, from: build ? tonAddr : "", build: !!build }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.ok) throw new Error(j.error || "Не посчиталось");
  return j;
}

async function refresh() {
  const box = document.getElementById("gramQuote");
  if (!box) return;
  box.textContent = "Считаем курс…";
  try {
    const j = await quote(false);
    const pay = side === "buy" ? "USDT" : "GRAM";
    const get = side === "buy" ? "GRAM" : "USDT";
    box.textContent = `Получишь около ${j.receive} ${get} за ${j.pay} ${pay}. Минимум ${j.minReceive} ${get}.`;
  } catch (err) {
    box.textContent = err.message || "Курс не пришёл";
  }
}

function openGram() {
  if (!dlg) return;
  say("");
  dlg.showModal();
  refresh();
}

async function showWallets() {
  const box = document.getElementById("gramWallets");
  if (!box) return;
  if (!box.hidden && box.childElementCount) { box.hidden = true; return; }
  box.hidden = false;
  box.innerHTML = `<p class="muted small">Открываем список…</p>`;
  try {
    const all = await connector.getWallets();
    const rank = (w) => { const i = PREFERRED.indexOf(w.appName); return i < 0 ? 99 : i; };
    const list = all.slice().sort((a, b) => rank(a) - rank(b)).slice(0, 8);
    box.innerHTML = "";
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
    box.innerHTML = `<p class="neg small">${err.message || "Список кошельков не открылся"}</p>`;
  }
}

document.querySelectorAll("[data-gram-open]").forEach((n) => n.addEventListener("click", (e) => {
  e.preventDefault();
  e.stopPropagation();
  openGram();
}));
document.getElementById("gramClose")?.addEventListener("click", () => dlg?.close());
document.getElementById("gramSide")?.addEventListener("click", (e) => {
  const b = e.target.closest("[data-side]");
  if (b) setSide(b.dataset.side);
});
document.getElementById("gramAmt")?.addEventListener("input", () => {
  clearTimeout(quoteTimer);
  quoteTimer = setTimeout(refresh, 350);
});
document.getElementById("gramWallet")?.addEventListener("click", () => {
  if (tonAddr) { connector.disconnect(); return; }
  showWallets();
});
document.getElementById("gramGo")?.addEventListener("click", async () => {
  const btn = document.getElementById("gramGo");
  if (!tonAddr) { say("Сначала выбери TON-кошелёк", true); showWallets(); return; }
  say("");
  btn.disabled = true;
  const prev = btn.textContent;
  btn.textContent = "Собираем обмен…";
  try {
    const j = await quote(true);
    if (!j.sign) throw new Error("Обмен не собрался");
    btn.textContent = "Ждём кошелёк…";
    await connector.sendTransaction({
      validUntil: Math.floor(Date.now() / 1000) + 600,
      messages: [{ address: j.sign.address, amount: String(j.sign.amount), payload: j.sign.payload }],
    });
    say(side === "buy" ? "Подписано. GRAM придёт на этот TON-кошелёк." : "Подписано. USDT придёт на этот TON-кошелёк.");
  } catch (err) {
    say(err.message || "Не отправилось", true);
  } finally {
    btn.disabled = false;
    btn.textContent = prev;
  }
});

connector.onStatusChange((w) => {
  tonAddr = w?.account?.address ? toUserFriendlyAddress(w.account.address) : "";
  paintWallet();
});
connector.restoreConnection().catch(() => {});
