/* Пополнение. С другого кошелька TON приходит USDC на торговый адрес.
   На биржу его зачисляет подпись разрешения: газ платит наш пустой адрес, не человек. */

import { TonConnect, toUserFriendlyAddress } from "./vendor/tonconnect.js";

const BRIDGE = "0x2df1c51e09aecf9cacb7bc98cb1742757f163df7";
const PREFERRED = ["tonkeeper", "mytonwallet", "telegram", "telegram-wallet", "tonhub", "binanceWeb3TonWallet", "okxTonWallet", "bybitTonWallet", "bitgetTonWallet", "hot"];
const fundDlg = document.getElementById("fundDialog");
const connector = new TonConnect({ manifestUrl: location.origin + "/api/ton-manifest" });
let fundAsset = "usdt";
let fundTimer = 0;
let tonAddr = "";
let run = 0;
let crediting = 0;

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

let fundSnd;
function fundUnlock() {
  try {
    fundSnd ||= new Audio("fund-ok.wav?v=1795119000");
    fundSnd.volume = 0.9;
    const play = fundSnd.play();
    if (play) play.then(() => { fundSnd.pause(); fundSnd.currentTime = 0; }).catch(() => {});
  } catch { /* звук не обязателен */ }
}
function fundChime() {
  if (!fundSnd) fundUnlock();
  if (!fundSnd) return;
  try {
    fundSnd.currentTime = 0;
    fundSnd.play().catch(() => {});
  } catch { /* звук не обязателен */ }
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
  if (to) to.textContent = addr ? `Кошелёк ${fundShort(addr)}. USDC с него зачисляется на биржу.` : "Сначала подключите торговый счёт";
  fundHide("fundOut");
  fundHide("fundErr");
  const hl = document.getElementById("fundHlBox");
  if (hl) hl.hidden = !addr;
  const other = document.getElementById("fundOtherBox");
  if (other) other.hidden = true;
  fundDlg.showModal();
  fundUnlock();
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
  out.classList.toggle("ok", !bad && text === "Успешно");
  if (!bad && text === "Успешно") fundChime();
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

function human(e) {
  const m = String(e?.message || e || "").trim();
  if (!m) return "";
  if (/does not exist|not available|unsupported method|not supported/i.test(m)) return "Кошелёк не дал подписать разрешение. Отключите его и подключите ещё раз.";
  if (/user rejected|reject|denied|cancel|отклон/i.test(m)) return "Подпись отменена. Деньги не уходили.";
  return m;
}

function gone(e) {
  return /does not exist|not available|unsupported method|not supported|missing or invalid/i.test(String(e?.message || e || ""));
}

async function usdcNow() {
  const to = fundAddr();
  if (!to) return 0n;
  const r = await fetch("/api/fund-status?address=" + to);
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.ok) return null;
  return units(j.usdc || "0") || 0n;
}

function reqOf(p) {
  return (m, a) => p.req ? p.req(m, a) : p.request({ method: m, params: a });
}

async function sameWallet(p, from) {
  try {
    const acc = await p.request({ method: "eth_accounts" });
    return acc?.[0]?.toLowerCase() === from;
  } catch { return false; }
}

async function signPermit(p, from, typed) {
  const req = reqOf(p);
  const json = JSON.stringify(typed);
  try {
    return await req("eth_signTypedData_v4", [from, json]);
  } catch (e) {
    if (/reject|denied|cancel|отклон/i.test(String(e?.message || ""))) throw e;
    return req("eth_signTypedData_v4", [from, typed]);
  }
}

async function hlCredit(want) {
  if (crediting) throw new Error("");
  crediting = 1;
  try {
    const from = fundAddr();
    const w = window.totumWallet;
    if (!w || !from) throw new Error("Подключите торговый счёт.");
    const live = await usdcNow();
    let amt = want;
    if (live != null && (amt == null || amt > live)) amt = live;
    if (amt == null || amt < 5000000n) throw new Error("Меньше 5 USDC биржа не зачислит. Не отправляем.");
    const prep = await fetch("/api/fund-quote", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ op: "permit", address: from, amount: amt.toString() }),
    });
    const ready = await prep.json().catch(() => ({}));
    if (!prep.ok || !ready.ok) throw new Error(ready.error || "Зачисление не собралось");
    if (String(ready.typed?.message?.owner || "").toLowerCase() !== from) throw new Error("Подпись собрана не на ваш счёт. Отменено.");
    if (String(ready.typed?.message?.spender || "").toLowerCase() !== BRIDGE) throw new Error("Подпись ведёт не на биржу. Отменено.");
    const tryList = [];
    if (window.okxwallet?.request && await sameWallet(window.okxwallet, from)) tryList.push(window.okxwallet);
    if (window.ethereum?.request && window.ethereum !== window.okxwallet && await sameWallet(window.ethereum, from)) tryList.push(window.ethereum);
    tryList.push(w);
    let sig = "";
    let last = null;
    for (const p of tryList) {
      try { sig = await signPermit(p, from, ready.typed); break; } catch (e) {
        last = e;
        if (!gone(e)) throw e;
      }
    }
    if (!sig) throw last || new Error("Кошелёк не дал подписать разрешение.");
    const sent = await fetch("/api/fund-quote", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ op: "relay", address: from, usd: ready.usd, deadline: ready.deadline, nonce: ready.nonce, sig }),
    });
    const done = await sent.json().catch(() => ({}));
    if (!sent.ok || !done.ok || !done.hash) throw new Error(done.error || "Зачисление не ушло. Деньги на месте.");
    return done.hash;
  } finally {
    crediting = 0;
  }
}

async function waitArrived(mine, before) {
  for (let i = 0; i < 30; i++) {
    await sleep(8000);
    if (mine !== run) throw new Error("");
    const live = await usdcNow();
    if (live == null) continue;
    if (live - before >= 5000000n) return live - before;
  }
  throw new Error("USDC ещё идёт на кошелёк. Как появится — нажмите «Зачислить на биржу». Отдельно покупать ничего не нужно.");
}

document.getElementById("fundGo")?.addEventListener("click", async () => {
  const btn = document.getElementById("fundGo");
  if (!tonAddr) { showWallets(); return; }
  fundUnlock();
  const mine = ++run;
  btn.disabled = true;
  const prev = btn.textContent;
  btn.textContent = "Считаем…";
  try {
    const before = (await usdcNow()) || 0n;
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
    say("Подтвердите обмен в кошельке. Как USDC придёт, сразу зачислим его на биржу.");
    btn.textContent = "Ждём кошелёк…";
    await send(j.sign);
    if (mine !== run) return;
    say("Обмен подписан. Ждём USDC на кошелёк и сразу отправляем на биржу.");
    btn.textContent = "Ждём USDC…";
    const credit = await waitArrived(mine, before);
    if (mine !== run) return;
    btn.textContent = "Зачисляем…";
    say("USDC на кошельке. Подтвердите разрешение — комиссию сети платим мы, с вас ETH не нужен.");
    const hash = await hlCredit(credit);
    if (mine !== run) return;
    const hl = document.getElementById("fundHlAmt");
    if (hl) hl.value = "";
    say("Успешно");
  } catch (e) {
    if (mine === run && e?.message) say(human(e), true);
  } finally {
    if (mine === run) {
      btn.disabled = false;
      btn.textContent = prev;
    }
  }
});

document.getElementById("fundHl")?.addEventListener("click", async () => {
  const btn = document.getElementById("fundHl");
  if (crediting) return;
  fundUnlock();
  const mine = ++run;
  btn.disabled = true;
  btn.textContent = "Ждём подпись…";
  fundHide("fundErr");
  try {
    const hash = await hlCredit(units(document.getElementById("fundHlAmt").value));
    if (mine !== run) return;
    say("Успешно");
    const amt = document.getElementById("fundHlAmt");
    if (amt) amt.value = "";
  } catch (e) {
    if (mine === run && e?.message) say(human(e), true);
  } finally {
    if (mine === run) {
      btn.disabled = false;
      btn.textContent = "Зачислить на биржу";
    }
  }
});
