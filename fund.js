/* Пополнение с уже подключённого торгового счёта. Другой кошелёк — только по маленькой кнопке.
   С того кошелька приходит USDC, отдельно ничего не докупаем. */

import { TonConnect, toUserFriendlyAddress } from "./vendor/tonconnect.js";

const BRIDGE = "0x2df1c51e09aecf9cacb7bc98cb1742757f163df7";
const USDC = "0xaf88d065e77c8cc2239327c5edb3a432268e5831";
const PREFERRED = ["tonkeeper", "mytonwallet", "telegram", "telegram-wallet", "tonhub", "binanceWeb3TonWallet", "okxTonWallet", "bybitTonWallet", "bitgetTonWallet", "hot"];
const fundDlg = document.getElementById("fundDialog");
const connector = new TonConnect({ manifestUrl: location.origin + "/api/ton-manifest" });
let fundAsset = "usdt";
let fundTimer = 0;
let tonAddr = "";
let run = 0;

function fundAddr() {
  const live = window.totumWallet?.addr?.();
  if (typeof live === "string" && /^0x[0-9a-fA-F]{40}$/.test(live)) return live.toLowerCase();
  if (!document.body.classList.contains("connected")) return "";
  try {
    const a = JSON.parse(localStorage.getItem("totum.conn") || "{}").addr || "";
    return /^0x[0-9a-fA-F]{40}$/.test(a) ? a.toLowerCase() : "";
  } catch { return ""; }
}

function fundShort(a) {
  return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "кошелёк не подключён";
}

function units(raw) {
  const t = String(raw ?? "").trim().replace(",", ".");
  if (!/^\d+(\.\d{1,6})?$/.test(t)) return null;
  const [a, b = ""] = t.split(".");
  return BigInt(a) * 1000000n + BigInt(b.padEnd(6, "0"));
}

function setTon(wallet) {
  const raw = wallet?.account?.address || "";
  tonAddr = raw ? toUserFriendlyAddress(raw) : "";
  const btn = document.getElementById("fundTon");
  if (btn) btn.textContent = tonAddr ? fundShort(tonAddr) : "Выбрать кошелёк";
  document.getElementById("fundWallets").hidden = true;
}

connector.onStatusChange(setTon);
connector.restoreConnection().catch(() => {});

async function showWallets() {
  const box = document.getElementById("fundWallets");
  if (!box.hidden && box.childElementCount) { box.hidden = true; return; }
  box.hidden = false;
  box.innerHTML = `<p class="muted small">Открываем список…</p>`;
  try {
    const all = await connector.getWallets();
    const rank = w => { const i = PREFERRED.indexOf(w.appName); return i < 0 ? 99 : i; };
    const list = all.slice().sort((a, b) => rank(a) - rank(b)).slice(0, 10);
    box.innerHTML = "";
    for (const w of list) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "btn ghost";
      if (w.imageUrl) {
        const img = document.createElement("img");
        img.src = w.imageUrl;
        img.alt = "";
        b.appendChild(img);
      }
      b.appendChild(document.createTextNode(w.name));
      b.onclick = async () => {
        try {
          if (w.jsBridgeKey && (w.injected || w.embedded)) {
            await connector.connect({ jsBridgeKey: w.jsBridgeKey });
            return;
          }
          const link = await connector.connect({ universalLink: w.universalLink, bridgeUrl: w.bridgeUrl });
          if (typeof link === "string") window.open(link, "_blank", "noopener");
        } catch (err) {
          box.insertAdjacentHTML("beforeend", `<p class="neg small">${err.message || "Кошелёк не открылся"}</p>`);
        }
      };
      box.appendChild(b);
    }
  } catch (e) {
    box.innerHTML = `<p class="neg small">${e.message || "Список кошельков не открылся"}</p>`;
  }
}

document.getElementById("fundTon")?.addEventListener("click", () => {
  if (tonAddr) { connector.disconnect(); setTon(null); return; }
  showWallets();
});

document.getElementById("fundAssets")?.addEventListener("click", (e) => {
  const b = e.target.closest("[data-asset]");
  if (!b) return;
  fundAsset = b.dataset.asset;
  for (const n of document.querySelectorAll("#fundAssets button")) n.classList.toggle("on", n === b);
});

function fundHide(id) {
  const n = document.getElementById(id);
  if (n) n.hidden = true;
}

function fundArm() {
  const amt = document.getElementById("fundHlAmt");
  if (!amt || amt.dataset.arm) return;
  amt.dataset.arm = "1";
  /* пока поле не тронули, браузер не подставляет сумму и не красит его в белый */
  amt.readOnly = true;
  const unlock = () => { amt.readOnly = false; };
  amt.addEventListener("pointerdown", unlock);
  amt.addEventListener("focus", unlock);
}

async function fundLook() {
  const hl = document.getElementById("fundHlBox");
  const to = fundAddr();
  if (hl) hl.hidden = !to;
  if (!to) return;
  try {
    const r = await fetch("/api/fund-status?address=" + to);
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) return;
    const amt = document.getElementById("fundHlAmt");
    if (j.usdcOk && amt && !amt.value) amt.value = j.usdc;
  } catch { /* сеть ещё не ответила */ }
}

function fundWatch() {
  clearInterval(fundTimer);
  fundLook();
  fundTimer = setInterval(fundLook, 15000);
}

function fundShow() {
  const to = document.getElementById("fundTo");
  const addr = fundAddr();
  if (to) to.textContent = addr ? `На счёт ${fundShort(addr)}` : "Сначала подключите торговый счёт";
  fundHide("fundOut");
  fundHide("fundErr");
  const hl = document.getElementById("fundHlBox");
  if (hl) hl.hidden = !addr;
  const other = document.getElementById("fundOtherBox");
  if (other) other.hidden = true;
  fundDlg.showModal();
  fundArm();
  fundWatch();
}

document.getElementById("btnFund")?.addEventListener("click", fundShow);
document.getElementById("fundOther")?.addEventListener("click", () => {
  const box = document.getElementById("fundOtherBox");
  if (box) box.hidden = !box.hidden;
});
document.getElementById("fundClose")?.addEventListener("click", () => { clearInterval(fundTimer); run++; fundDlg.close(); });
fundDlg?.addEventListener("close", () => { clearInterval(fundTimer); run++; });

function say(text, bad) {
  const out = document.getElementById(bad ? "fundErr" : "fundOut");
  const other = document.getElementById(bad ? "fundOut" : "fundErr");
  if (other) other.hidden = true;
  if (!out) return;
  out.hidden = false;
  out.textContent = text;
}

async function send(sign) {
  if (!tonAddr) throw new Error("Выберите кошелёк");
  await connector.sendTransaction({
    validUntil: Math.floor(Date.now() / 1000) + 600,
    messages: [{ address: sign.address, amount: String(sign.amount), payload: sign.payload }],
  });
}

async function quote(asset, amount) {
  const to = fundAddr();
  if (!to) throw new Error("Подключите торговый счёт.");
  if (!tonAddr) throw new Error("Выберите кошелёк");
  const r = await fetch("/api/fund-quote", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ amount, from: tonAddr, to, asset }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.ok) throw new Error(j.error || "Не посчиталось");
  if (j.to !== to) throw new Error("Приход идёт не на ваш счёт. Отменено.");
  return j;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function waitUsdt(mine) {
  for (let i = 0; i < 20; i++) {
    await sleep(8000);
    if (mine !== run) throw new Error("");
    const r = await fetch("/api/fund-status?ton=" + encodeURIComponent(tonAddr));
    const j = await r.json().catch(() => ({}));
    if (j.usdtOk) return j.usdt;
  }
  throw new Error("Обмен ещё в пути. Через минуту нажмите «Пополнить» ещё раз.");
}

function pickAsset(asset) {
  fundAsset = asset;
  for (const n of document.querySelectorAll("#fundAssets button")) n.classList.toggle("on", n.dataset.asset === asset);
}

document.getElementById("fundGo")?.addEventListener("click", async () => {
  const btn = document.getElementById("fundGo");
  if (!tonAddr) { showWallets(); return; }
  const mine = ++run;
  btn.disabled = true;
  const prev = btn.textContent;
  btn.textContent = "Считаем…";
  try {
    let j = await quote(fundAsset, document.getElementById("fundAmt").value);
    if (mine !== run) return;
    if (j.step === "swap") {
      say("Подтвердите в кошельке");
      btn.textContent = "Ждём кошелёк…";
      await send(j.sign);
      if (mine !== run) return;
      pickAsset("usdt");
      say("Обмен идёт в том же кошельке.");
      btn.textContent = "Ждём…";
      const got = await waitUsdt(mine);
      if (mine !== run) return;
      const amt = document.getElementById("fundAmt");
      if (amt) amt.value = got;
      j = await quote("usdt", got);
      if (mine !== run) return;
    }
    if (!j.sign) throw new Error("Перевод не собрался");
    say("Подтвердите в кошельке");
    btn.textContent = "Ждём кошелёк…";
    await send(j.sign);
    if (mine !== run) return;
    say("Подписано. USDC придёт на этот счёт.");
    const hl = document.getElementById("fundHlAmt");
    if (hl && j.min) hl.value = j.min;
  } catch (e) {
    if (mine === run && e?.message) say(e.message, true);
  } finally {
    if (mine === run) {
      btn.disabled = false;
      btn.textContent = prev;
    }
  }
});

document.getElementById("fundHl")?.addEventListener("click", async () => {
  const err = document.getElementById("fundErr");
  const btn = document.getElementById("fundHl");
  err.hidden = true;
  const w = window.totumWallet;
  const from = fundAddr();
  const amt = units(document.getElementById("fundHlAmt").value);
  if (!w || !from) { err.hidden = false; err.textContent = "Подключите торговый счёт."; return; }
  if (amt == null || amt < 5000000n) { err.hidden = false; err.textContent = "Меньше 5 USDC Hyperliquid не зачислит. Не отправляем."; return; }
  btn.disabled = true;
  btn.textContent = "Ждём подпись…";
  try {
    try { await w.req("wallet_switchEthereumChain", [{ chainId: "0xa4b1" }]); } catch { /* сеть проверим ниже */ }
    const chain = await w.req("eth_chainId", []);
    if (BigInt(chain) !== 42161n) throw new Error("Кошелёк в другой сети. Перевод отменён.");
    const bal = await w.req("eth_call", [{ to: USDC, data: "0x70a08231" + from.slice(2).padStart(64, "0") }, "latest"]);
    if (BigInt(bal) < amt) throw new Error("На счёте меньше USDC, чем вы зачисляете.");
    const data = "0xa9059cbb" + BRIDGE.slice(2).padStart(64, "0") + amt.toString(16).padStart(64, "0");
    if (!data.includes(BRIDGE.slice(2)) || data.slice(0, 10) !== "0xa9059cbb") throw new Error("Сборка перевода сломалась.");
    const hash = await w.req("eth_sendTransaction", [{ from, to: USDC, data, value: "0x0" }]);
    err.hidden = false;
    err.textContent = `Отправлено ${hash}. На Hyperliquid сумма появится меньше чем через минуту.`;
  } catch (e) {
    err.hidden = false;
    err.textContent = e?.message || "Кошелёк отклонил перевод";
  } finally {
    btn.disabled = false;
    btn.textContent = "Зачислить";
  }
});
