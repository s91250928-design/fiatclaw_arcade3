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
  const min = document.getElementById("fundMin");
  if (min) min.textContent = fundAsset === "gram" ? "Минимум на 10 USDT в GRAM" : "Минимум 10 USDT";
});

function fundHide(id) {
  const n = document.getElementById(id);
  if (n) n.hidden = true;
}

let fundSnd;
function fundUnlock() {
  try {
    fundSnd ||= new Audio("fund-ok.wav?v=1795123000");
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
  for (const id of ["fundHlAmt", "fundAmt", "wdAmt"]) {
    const amt = document.getElementById(id);
    if (!amt || amt.dataset.arm) continue;
    amt.dataset.arm = "1";
    amt.readOnly = false;
    const open = () => amt.focus();
    amt.addEventListener("pointerdown", open);
    amt.addEventListener("click", open);
  }
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

function keeperTrade() {
  if (/Keeper|Tonkeeper/i.test(navigator.userAgent || "")) return true;
  const eth = window.ethereum;
  if (eth && (eth.isKeeper || eth.isTonkeeper || /keeper|tonkeeper/i.test(String(eth.name || "")))) return true;
  try {
    const rdns = JSON.parse(localStorage.getItem("totum.conn") || "{}").rdns || "";
    return /keeper|tonkeeper/i.test(rdns);
  } catch { return false; }
}

function fundKeeperNote() {
  const box = document.getElementById("fundKeeper");
  const go = document.getElementById("fundKeeperGo");
  const addr = fundAddr();
  const here = keeperTrade();
  if (box) {
    box.textContent = here && addr
      ? "Это Keeper. Обмен и зачисление подтверждаются в нём — второй кошелёк не нужен."
      : here
        ? "Вы в браузере Keeper. Подключите этот кошелёк: оба подтверждения придут сюда."
        : addr
          ? "Сейчас подключён другой кошелёк. Отключите его и выберите Keeper — тогда обмен и зачисление придут в одно приложение."
          : "Keeper держит и TON, и Arbitrum. Откройте сайт в его браузере или подключите его как торговый кошелёк — обмен и зачисление придут в одно приложение, не в OKX.";
  }
  if (go) go.hidden = !!addr;
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
  fundKeeperNote();
  fundDlg.showModal();
  fundUnlock();
  fundArm();
  fundWatch();
}

document.getElementById("btnFund")?.addEventListener("click", fundShow);
document.getElementById("fundKeeperGo")?.addEventListener("click", () => {
  fundDlg.close();
  document.getElementById("btnConnect")?.click();
});
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
  const ok = !bad && text === "Успешно";
  out.classList.remove("ok");
  if (ok) {
    out.innerHTML = '<span class="fund-mark" aria-hidden="true"><svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="13"/><path d="M10 16.5l4 4 8-9"/></svg></span><span>Успешно</span>';
    void out.offsetWidth;
    out.classList.add("ok");
    fundChime();
  } else {
    out.textContent = text;
  }
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

const wdDlg = document.getElementById("withdrawDialog");

function wdHide(id) {
  const n = document.getElementById(id);
  if (n) n.hidden = true;
}

function wdSay(text, bad) {
  const out = document.getElementById(bad ? "wdErr" : "wdOut");
  const other = document.getElementById(bad ? "wdOut" : "wdErr");
  if (other) other.hidden = true;
  if (!out) return;
  out.hidden = false;
  out.classList.remove("ok");
  if (!bad && text === "Успешно") {
    out.innerHTML = '<span class="fund-mark" aria-hidden="true"><svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="13"/><path d="M10 16.5l4 4 8-9"/></svg></span><span>Успешно</span>';
    void out.offsetWidth;
    out.classList.add("ok");
    fundChime();
  } else {
    out.textContent = text;
  }
}

function wdHuman(e) {
  const m = String(e?.message || e || "").trim();
  if (!m) return "Вывод не прошёл. Деньги на бирже.";
  if (/reject|denied|cancel|отклон/i.test(m)) return "Подпись отменена. Деньги на бирже.";
  if (/does not exist|not available|unsupported method|not supported/i.test(m)) return "Кошелёк не дал подписать. Отключите его и подключите ещё раз.";
  if (/insufficient|withdrawable|not enough/i.test(m)) return "Этой суммы нет в доступном балансе. Деньги в открытых позициях вывести нельзя.";
  return m;
}

function money(n) {
  const v = Math.floor(Number(n) * 1e6) / 1e6;
  if (!(v > 0)) return "0";
  return String(v);
}

function wdPaint(info) {
  const avail = document.getElementById("wdAvail");
  const spot = document.getElementById("wdSpot");
  const net = document.getElementById("wdNet");
  const max = info ? (info.unified ? info.spot : info.perp) : 0;
  if (avail) avail.textContent = info ? `Доступно ${money(max)} USDC. Минимум больше 1: биржа удерживает 1.` : "Минимум больше 1 USDC";
  if (spot) {
    const extra = info && !info.unified && info.spot > 0.01;
    spot.hidden = !extra;
    spot.textContent = extra ? `На споте ещё ${money(info.spot)} USDC. Сначала переведите их на фьючерсы — вывод идёт оттуда.` : "";
  }
  const n = Number(String(document.getElementById("wdAmt")?.value || "").replace(",", "."));
  if (net) net.textContent = n > 1 ? `На кошелёк придёт около ${money(n - 1)} USDC.` : "";
  return max;
}

async function wdOpen() {
  wdHide("wdErr");
  wdHide("wdOut");
  const to = document.getElementById("wdTo");
  const addr = fundAddr();
  if (to) {
    to.textContent = addr
      ? `USDC вернётся только на ${fundShort(addr)} в сети Arbitrum. Другой адрес подставить нельзя.`
      : "Сначала подключите кошелёк. Вывод пойдёт только на него, в сети Arbitrum.";
  }
  let info = null;
  try { info = window.totumWallet?.out?.() || null; } catch { info = null; }
  wdPaint(info);
  wdDlg.showModal();
  fundUnlock();
  fundArm();
  try { await window.totumWallet?.refresh?.(); } catch { /* баланс обновится сам */ }
  try { info = window.totumWallet?.out?.() || info; } catch { /* старые цифры */ }
  if (wdDlg.open) wdPaint(info);
}

document.getElementById("btnWithdraw")?.addEventListener("click", wdOpen);
document.getElementById("wdClose")?.addEventListener("click", () => wdDlg.close());
document.getElementById("wdAmt")?.addEventListener("input", () => {
  try { wdPaint(window.totumWallet?.out?.() || null); } catch { wdPaint(null); }
});
document.getElementById("wdMax")?.addEventListener("click", () => {
  let info = null;
  try { info = window.totumWallet?.out?.() || null; } catch { info = null; }
  const max = wdPaint(info);
  const amt = document.getElementById("wdAmt");
  if (amt) amt.value = max > 1 ? money(max) : "";
  wdPaint(info);
});

document.getElementById("wdGo")?.addEventListener("click", async () => {
  const btn = document.getElementById("wdGo");
  if (!btn || btn.disabled) return;
  fundUnlock();
  const addr = fundAddr();
  if (!addr) {
    wdDlg.close();
    document.getElementById("btnConnect")?.click();
    return;
  }
  const ex = window.totumWallet?.ex?.();
  if (!ex || typeof ex.withdraw3 !== "function") {
    wdSay("Подключите кошелёк ещё раз. Ключ для сделок вывод не подписывает.", true);
    return;
  }
  let info = null;
  try { info = window.totumWallet.out(); } catch { info = null; }
  const max = info ? (info.unified ? info.spot : info.perp) : 0;
  const raw = String(document.getElementById("wdAmt")?.value || "").trim().replace(",", ".");
  const n = Number(raw);
  if (!(n > 1)) { wdSay("Сумма должна быть больше 1 USDC: биржа удерживает 1.", true); return; }
  if (n > max + 1e-8) { wdSay(`Можно вывести ${money(max)} USDC.`, true); return; }
  const amount = money(n);
  btn.disabled = true;
  const prev = btn.textContent;
  btn.textContent = "Ждём подпись…";
  wdHide("wdErr");
  let before = null;
  try {
    const r = await fetch("/api/fund-status?address=" + addr);
    const j = await r.json().catch(() => ({}));
    if (r.ok && j.ok) before = String(j.usdc || "0");
  } catch { /* без снимка прогресс всё равно по времени */ }
  try {
    const live = String(window.totumWallet.addr() || "").toLowerCase();
    if (live !== addr) throw new Error("Кошелёк сменился. Откройте вывод ещё раз.");
    const res = await ex.withdraw3({ destination: window.totumWallet.addr(), amount });
    if (res && res.status && res.status !== "ok") throw new Error("Биржа не приняла вывод. Деньги на месте.");
    wdSave({
      addr,
      amount,
      net: money(n - 1),
      started: Date.now(),
      before,
      phase: "wait",
      chimed: false,
    });
    const amt = document.getElementById("wdAmt");
    if (amt) amt.value = "";
    wdDlg.close();
    cashOpen();
    cashWatch();
    try { await window.totumWallet.refresh?.(); } catch { /* баланс биржи обновится сам */ }
  } catch (e) {
    if (e?.message) wdSay(wdHuman(e), true);
  } finally {
    btn.disabled = false;
    btn.textContent = prev;
  }
});

const WDKEY = "totum.wd";
const WD_MS = 5 * 60 * 1000;

function wdLoad() {
  try {
    const j = JSON.parse(localStorage.getItem(WDKEY) || "null");
    return j && j.addr ? j : null;
  } catch { return null; }
}
function wdSave(job) {
  try { localStorage.setItem(WDKEY, JSON.stringify(job)); } catch { /* прогресс останется на экране */ }
}

function cashLeft(job) {
  return Math.max(0, WD_MS - (Date.now() - Number(job.started || 0)));
}

function cashPaint() {
  const job = wdLoad();
  const show = job && (job.phase === "wait" || Date.now() - Number(job.doneAt || job.started) < 6 * 3600e3);
  const text = !show ? "" : job.phase === "ok" ? "Успешно" : "Вывод в процессе";
  for (const n of document.querySelectorAll("[data-cash-note], #cashNote")) {
    n.hidden = !show;
    n.classList.toggle("ok", !!show && job.phase === "ok");
    n.textContent = text;
  }
  const dlg = document.getElementById("cashDlg");
  if (!dlg?.open || !job) return;
  const title = document.getElementById("cashTitle");
  const addr = document.getElementById("cashAddr");
  const eta = document.getElementById("cashEta");
  const bar = document.getElementById("cashBar");
  const wrap = document.getElementById("cashBarWrap");
  const ok = document.getElementById("cashOk");
  const left = cashLeft(job);
  const pct = job.phase === "ok" ? 100 : Math.min(92, 8 + Math.round((1 - left / WD_MS) * 84));
  if (bar) bar.style.width = pct + "%";
  if (wrap) wrap.classList.toggle("ok", job.phase === "ok");
  const step = job.phase === "ok" ? 3 : left < WD_MS * 0.55 ? 2 : 1;
  document.querySelectorAll("#cashSteps span").forEach(n => {
    const k = Number(n.dataset.step);
    n.classList.toggle("done", k < step || job.phase === "ok");
    n.classList.toggle("on", k === step && job.phase !== "ok");
  });
  if (title) title.textContent = job.phase === "ok" ? "Успешно" : "Вывод в процессе";
  if (addr) {
    addr.textContent = job.phase === "ok"
      ? `${job.net} USDC на ${fundShort(job.addr)}.`
      : `На ${fundShort(job.addr)} придёт ${job.net} USDC. С биржи списано ${job.amount}, комиссия 1.`;
  }
  if (eta) {
    eta.hidden = job.phase === "ok";
    const min = Math.max(1, Math.ceil(left / 60000));
    eta.textContent = left > 0
      ? `Перевод в процессе. На кошелёк примерно через ${min} мин.`
      : "Мост ещё подтверждает перевод. Обычно это уже последние минуты.";
  }
  if (ok) {
    if (job.phase !== "ok") { ok.hidden = true; ok.classList.remove("ok"); ok.textContent = ""; }
    else if (!ok.classList.contains("ok")) {
      ok.hidden = false;
      ok.classList.add("ok");
      ok.innerHTML = `<span class="fund-mark" aria-hidden="true"><svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="13"/><path d="M10 16.5l4 4 8-9"/></svg></span><span>Успешно · ${fundShort(job.addr)}</span>`;
    }
  }
}

async function cashArrive(job) {
  if (!job || job.phase === "ok") return job;
  let next = job;
  if (job.before != null) {
    try {
      const r = await fetch("/api/fund-status?address=" + job.addr);
      const j = await r.json().catch(() => ({}));
      const was = units(job.before) || 0n;
      const now = units(j.usdc || "0") || 0n;
      const need = units(job.net) || 0n;
      if (r.ok && j.ok && now >= was + need - 5000n) next = { ...job, phase: "ok", doneAt: Date.now() };
    } catch { /* проверим следующим заходом */ }
  }
  if (next.phase !== "ok" && Date.now() - Number(job.started) >= WD_MS + 3 * 60 * 1000) {
    next = { ...job, phase: "ok", doneAt: Date.now() };
  }
  if (next !== job) {
    wdSave(next);
    if (!next.chimed) {
      next.chimed = true;
      wdSave(next);
      fundChime();
    }
  }
  return next;
}

let cashTimer = 0;
let cashHit = 0;
function cashWatch() {
  clearInterval(cashTimer);
  cashHit = 0;
  cashTimer = setInterval(async () => {
    const job = wdLoad();
    if (!job || job.phase === "ok") { cashPaint(); if (job?.phase === "ok") clearInterval(cashTimer); return; }
    if (++cashHit % 4 === 1) await cashArrive(job);
    cashPaint();
  }, 3000);
}

function cashOpen() {
  const dlg = document.getElementById("cashDlg");
  if (!dlg) return;
  const list = document.getElementById("cashHistList");
  if (list) list.hidden = true;
  cashPaint();
  if (!dlg.open) dlg.showModal();
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&", "<": "<", ">": ">", "\"": """, "'": "&#39;" }[c]));
}

async function cashHistory() {
  const box = document.getElementById("cashHistList");
  const addr = fundAddr();
  if (!box) return;
  box.hidden = false;
  if (!addr) { box.innerHTML = `<p class="muted small">Сначала подключите кошелёк.</p>`; return; }
  box.innerHTML = `<p class="muted small">Загружаем операции…</p>`;
  try {
    const r = await fetch("https://api.hyperliquid.xyz/info", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "userNonFundingLedgerUpdates", user: addr }),
    });
    const rows = await r.json();
    const list = (Array.isArray(rows) ? rows : []).filter(x => x?.delta?.type === "deposit" || x?.delta?.type === "withdraw");
    list.sort((a, b) => b.time - a.time);
    if (!list.length) { box.innerHTML = `<p class="muted small">Пополнений и выводов пока не было.</p>`; return; }
    const saved = wdLoad();
    box.innerHTML = list.slice(0, 40).map(x => {
      const d = x.delta;
      const out = d.type === "withdraw";
      const sum = Number(d.usdc);
      const fee = Number(d.fee || 0);
      const net = out ? Math.max(0, sum - (fee || 1)) : sum;
      const where = (out && saved?.addr) ? saved.addr : addr;
      const when = new Date(x.time).toLocaleString("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
      const route = out
        ? `Откуда биржа · куда ${fundShort(where)} · USDC`
        : `Откуда ${fundShort(where)} · куда биржа · USDC`;
      const extra = out ? ` · на кошелёк ${money(net)}` : "";
      return `<div class="cash-row"><b>${out ? "Вывод" : "Пополнение"}</b><small>${esc(when)} · ${esc(route)}${esc(extra)}</small><em class="${out ? "neg" : "pos"}">${out ? "−" : "+"}${esc(money(sum))} USDC</em></div>`;
    }).join("");
  } catch {
    box.innerHTML = `<p class="muted small">История сейчас не открылась. Нажмите ещё раз.</p>`;
  }
}

document.addEventListener("click", e => {
  if (e.target.closest("[data-cash-note], #cashNote")) cashOpen();
});
document.getElementById("cashClose")?.addEventListener("click", () => document.getElementById("cashDlg")?.close());
document.getElementById("cashHist")?.addEventListener("click", cashHistory);
window.totumCash = { paint: cashPaint, open: cashOpen };

cashPaint();
if (wdLoad()?.phase === "wait") cashWatch();
else if (wdLoad()?.phase !== "ok") {
  const addr = fundAddr();
  if (addr) {
    fetch("https://api.hyperliquid.xyz/info", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "userNonFundingLedgerUpdates", user: addr }),
    }).then(r => r.json()).then(rows => {
      if (wdLoad()?.phase === "wait") return;
      const last = (Array.isArray(rows) ? rows : []).filter(x => x?.delta?.type === "withdraw").sort((a, b) => b.time - a.time)[0];
      if (!last || Date.now() - last.time > WD_MS || Date.now() - last.time < 0) return;
      const sum = Number(last.delta.usdc);
      wdSave({
        addr,
        amount: money(sum),
        net: money(Math.max(0, sum - Number(last.delta.fee || 1))),
        started: last.time,
        before: null,
        phase: "wait",
        chimed: false,
        hash: last.hash,
      });
      cashWatch();
      cashPaint();
    }).catch(() => {});
  }
}
