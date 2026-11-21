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
let fundGen = 0;
function fundUnlock() {
  const gen = ++fundGen;
  try {
    fundSnd ||= new Audio("fund-ok.wav?v=1795123000");
    fundSnd.volume = 0;
    const play = fundSnd.play();
    if (play) play.then(() => {
      if (gen !== fundGen) return;
      fundSnd.pause();
      fundSnd.currentTime = 0;
      fundSnd.volume = 0.9;
    }).catch(() => {});
  } catch { /* звук не обязателен */ }
}
function fundChime() {
  fundGen++;
  try {
    fundSnd ||= new Audio("fund-ok.wav?v=1795123000");
    fundSnd.volume = 0.9;
    fundSnd.currentTime = 0;
    const play = fundSnd.play();
    if (play) play.catch(() => {});
  } catch { /* звук не обязателен */ }
}

function focusAmt(el) {
  if (!el) return;
  const scroller = el.closest(".dlg-body") || el.closest("dialog");
  if (scroller && innerWidth <= 900) {
    const box = scroller.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const room = Math.min(box.bottom, innerHeight * 0.46);
    if (r.bottom > room) scroller.scrollTop += r.bottom - room;
    else if (r.top < box.top) scroller.scrollTop += r.top - box.top;
  }
  try { el.focus({ preventScroll: true }); }
  catch { try { el.focus(); } catch { /* поле ещё не на экране */ } }
}

function fundArm() {
  for (const id of ["fundHlAmt", "fundAmt", "wdAmt"]) {
    const amt = document.getElementById(id);
    if (!amt || amt.dataset.arm) continue;
    amt.dataset.arm = "1";
    amt.readOnly = false;
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
      ? "Это Keeper. USDC отправляйте из него на адрес ниже — тогда они придут на этот счёт."
      : here
        ? "Вы в браузере Keeper. Подключите кошелёк и отправьте USDC на адрес ниже."
        : addr
          ? "Отправляйте USDC с подключённого кошелька на адрес ниже. Тогда они придут на этот счёт Totum."
          : "Сеть Arbitrum One, токен USDC. Сканируйте код или скопируйте адрес и отправьте сами.";
  }
  if (go) go.hidden = !!addr;
}

function fundShow() {
  const to = document.getElementById("fundTo");
  const addr = fundAddr();
  if (to) to.textContent = addr ? `Счёт Totum для ${fundShort(addr)}. Отправьте USDC с этого же кошелька.` : "Отправьте USDC. Счёт откроется у кошелька, с которого ушёл перевод.";
  fundHide("fundOut");
  fundHide("fundErr");
  const other = document.getElementById("fundOtherBox");
  if (other) other.hidden = true;
  fundKeeperNote();
  fundDlg.showModal();
  pinDlg(fundDlg);
  fundArm();
  fundWatch();
}

document.getElementById("fundCopy")?.addEventListener("click", async () => {
  const btn = document.getElementById("fundCopy");
  const addr = btn?.dataset.addr || "";
  if (!addr) return;
  try { await navigator.clipboard.writeText(addr); } catch {
    const t = document.createElement("textarea");
    t.value = addr;
    document.body.appendChild(t);
    t.select();
    try { document.execCommand("copy"); } catch {}
    t.remove();
  }
  const prev = btn.textContent;
  btn.textContent = "Адрес скопирован";
  setTimeout(() => { if (btn.textContent === "Адрес скопирован") btn.textContent = prev; }, 1600);
});
document.getElementById("fundKeeperGo")?.addEventListener("click", () => {
  fundDlg.close();
  document.getElementById("btnConnect")?.click();
});
document.getElementById("fundOther")?.addEventListener("click", () => {
  const box = document.getElementById("fundOtherBox");
  if (!box) return;
  const show = box.hidden;
  box.hidden = !box.hidden;
  if (show) focusAmt(document.getElementById("fundAmt"));
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

const ARB = { chainId: "0xa4b1", chainName: "Arbitrum One", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: ["https://arb1.arbitrum.io/rpc"], blockExplorerUrls: ["https://arbiscan.io"] };

async function onArbitrum(p) {
  const req = reqOf(p);
  let cur = "";
  try { cur = String(await req("eth_chainId", [])).toLowerCase(); } catch {}
  if (cur === "0xa4b1" || cur === "42161") return;
  try {
    await req("wallet_switchEthereumChain", [{ chainId: "0xa4b1" }]);
  } catch (e) {
    const m = String(e?.message || e || "");
    if (e?.code === 4902 || /4902|unrecognized|not added|not configured/i.test(m)) {
      await req("wallet_addEthereumChain", [ARB]);
      return;
    }
    if (/reject|denied|cancel|отклон/i.test(m)) throw e;
    throw new Error("Переключите кошелёк на сеть Arbitrum One и подтвердите ещё раз.");
  }
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
      try { await onArbitrum(p); sig = await signPermit(p, from, ready.typed); break; } catch (e) {
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
  throw new Error("USDC ещё идёт на кошелёк. Как появится, отправьте его на адрес Totum выше.");
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
    say("Подтвердите обмен в кошельке. Когда USDC придёт, отправьте его на адрес Totum выше.");
    btn.textContent = "Ждём кошелёк…";
    await send(j.sign);
    if (mine !== run) return;
    say("Обмен подписан. Ждём USDC на кошелёк.");
    btn.textContent = "Ждём USDC…";
    const credit = await waitArrived(mine, before);
    if (mine !== run) return;
    btn.textContent = "Готово";
    say("USDC уже на кошельке. Отправьте его обычным переводом на адрес Totum выше, сеть Arbitrum One.");
  } catch (e) {
    if (mine === run && e?.message) say(human(e), true);
  } finally {
    if (mine === run) {
      btn.disabled = false;
      btn.textContent = prev;
    }
  }
});

document.getElementById("fundHl")?.addEventListener("click", () => {
  say("Отправьте USDC на адрес выше. Разрешение в кошельке не нужно.");
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

const KC_RC = [
  0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an,
  0x8000000080008000n, 0x000000000000808bn, 0x0000000080000001n,
  0x8000000080008081n, 0x8000000000008009n, 0x000000000000008an,
  0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
  0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n,
  0x8000000000008003n, 0x8000000000008002n, 0x8000000000000080n,
  0x000000000000800an, 0x800000008000000an, 0x8000000080008081n,
  0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n,
];
const KC_RHO = [
  [0, 36, 3, 41, 18],
  [1, 44, 10, 45, 2],
  [62, 6, 43, 15, 61],
  [28, 55, 25, 21, 56],
  [27, 20, 39, 8, 14],
];
const KC_MASK = (1n << 64n) - 1n;
function kcRot(x, n) {
  const s = BigInt(n);
  if (s === 0n) return x & KC_MASK;
  return ((x << s) | (x >> (64n - s))) & KC_MASK;
}
function kcF(A) {
  for (let round = 0; round < 24; round++) {
    const C = [0n, 0n, 0n, 0n, 0n];
    for (let x = 0; x < 5; x++) C[x] = A[x] ^ A[x + 5] ^ A[x + 10] ^ A[x + 15] ^ A[x + 20];
    const D = [0n, 0n, 0n, 0n, 0n];
    for (let x = 0; x < 5; x++) D[x] = C[(x + 4) % 5] ^ kcRot(C[(x + 1) % 5], 1);
    for (let i = 0; i < 25; i++) A[i] = (A[i] ^ D[i % 5]) & KC_MASK;
    const B = new Array(25);
    for (let x = 0; x < 5; x++) {
      for (let y = 0; y < 5; y++) B[y + 5 * ((2 * x + 3 * y) % 5)] = kcRot(A[x + 5 * y], KC_RHO[x][y]);
    }
    for (let i = 0; i < 25; i++) A[i] = B[i];
    for (let y = 0; y < 5; y++) {
      const row = [A[5 * y], A[1 + 5 * y], A[2 + 5 * y], A[3 + 5 * y], A[4 + 5 * y]];
      for (let x = 0; x < 5; x++) A[x + 5 * y] = (row[x] ^ ((~row[(x + 1) % 5]) & row[(x + 2) % 5])) & KC_MASK;
    }
    A[0] = (A[0] ^ KC_RC[round]) & KC_MASK;
  }
}
function keccak256(bytes) {
  const rate = 136;
  const st = Array(25).fill(0n);
  const msg = bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes);
  const tmp = new Uint8Array(Math.ceil((msg.length + 1) / rate) * rate);
  tmp.set(msg);
  tmp[msg.length] = 0x01;
  tmp[tmp.length - 1] ^= 0x80;
  for (let off = 0; off < tmp.length; off += rate) {
    for (let i = 0; i < rate; i += 8) {
      let v = 0n;
      for (let b = 0; b < 8; b++) v |= BigInt(tmp[off + i + b]) << BigInt(8 * b);
      st[i / 8] ^= v;
    }
    kcF(st);
  }
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) out[i] = Number((st[Math.floor(i / 8)] >> BigInt((i % 8) * 8)) & 0xffn);
  return out;
}
function checksumAddress(addr) {
  const lower = String(addr).slice(2).toLowerCase();
  const hash = keccak256(new TextEncoder().encode(lower));
  let out = "0x";
  for (let i = 0; i < 40; i++) {
    const byte = hash[i >> 1];
    const nibble = i % 2 === 0 ? byte >> 4 : byte & 0xf;
    const ch = lower[i];
    out += nibble >= 8 ? ch.toUpperCase() : ch;
  }
  return out;
}
function addrState(raw) {
  const s = String(raw || "").trim().replace(/\s+/g, "").replace(/^ethereum:/i, "");
  if (!s) return { ok: false, empty: true, addr: "", text: "Вставьте адрес" };
  if (!/^0x[0-9a-fA-F]{40}$/.test(s) || /^0x0{40}$/i.test(s)) return { ok: false, empty: false, addr: "", text: "Адрес недействителен" };
  const good = checksumAddress(s);
  const body = s.slice(2);
  if (body !== body.toLowerCase() && body !== body.toUpperCase() && good !== s) {
    return { ok: false, empty: false, addr: "", text: "Адрес недействителен" };
  }
  return { ok: true, empty: false, addr: good, text: "Адрес действителен" };
}
function wdModeOther() {
  return document.querySelector("#wdDest button.on")?.dataset.dest === "other";
}
function wdAmount() {
  const raw = String(document.getElementById("wdAmt")?.value || "").trim().replace(",", ".");
  const n = Number(raw);
  return { n, amount: Number.isFinite(n) ? money(n) : "" };
}
function wdDestination() {
  const mine = fundAddr();
  if (!wdModeOther()) {
    const state = mine ? addrState(mine) : { ok: false, empty: true, addr: "", text: "Сначала подключите кошелёк" };
    return { own: true, dest: state.addr || "", state };
  }
  const state = addrState(document.getElementById("wdAddr")?.value || "");
  return { own: false, dest: state.ok ? state.addr : "", state };
}
let wdPending = null;
function wdOwnText() {
  const n = document.getElementById("wdOwn");
  const addr = fundAddr();
  if (n) n.textContent = addr ? `Кошелёк ${fundShort(addr)}` : "Сначала подключите кошелёк";
}
function wdChecks() {
  return {
    own: !!document.getElementById("wdOwnOk")?.checked,
    arb: !!document.getElementById("wdArb")?.checked,
    mine: !!document.getElementById("wdMine")?.checked,
  };
}
function wdResetDest() {
  document.querySelectorAll("#wdDest button").forEach(n => n.classList.toggle("on", n.dataset.dest === "own"));
  const other = document.getElementById("wdOther");
  if (other) other.hidden = true;
  const own = document.getElementById("wdOwn");
  if (own) own.hidden = false;
  const ownOk = document.getElementById("wdOwnOkWrap");
  if (ownOk) ownOk.hidden = false;
  for (const id of ["wdArb", "wdMine", "wdOwnOk"]) {
    const box = document.getElementById(id);
    if (box) box.checked = false;
  }
  const field = document.getElementById("wdAddr");
  if (field) field.value = "";
  wdOwnText();
  wdGate();
}
function wdGate() {
  const btn = document.getElementById("wdGo");
  const st = document.getElementById("wdAddrState");
  const c = wdChecks();
  if (!wdModeOther()) {
    if (btn) { btn.disabled = !(c.own && fundAddr()); btn.textContent = "Дальше"; }
    return;
  }
  const state = addrState(document.getElementById("wdAddr")?.value || "");
  const ready = c.arb && c.mine && state.ok;
  if (st) {
    st.textContent = !state.ok ? state.text : ready ? "Адрес действителен" : "Подтвердите, что адрес ваш и он в сети Arbitrum One";
    st.classList.toggle("pos", ready);
    st.classList.toggle("neg", !state.empty && !state.ok);
  }
  if (btn) {
    btn.disabled = !ready;
    btn.textContent = "Подтвердить адрес";
  }
}
function wdRow(k, v, cls) {
  return `<div class="wd-row ${cls || ""}"><span>${esc(k)}</span><b>${esc(v)}</b></div>`;
}
function wdOpenReview() {
  wdHide("wdErr");
  wdHide("wdOut");
  const { n, amount } = wdAmount();
  let info = null;
  try { info = window.totumWallet?.out?.() || null; } catch { info = null; }
  const max = info ? (info.unified ? info.spot : info.perp) : 0;
  if (!(n > 1)) { wdSay("Сумма должна быть больше 1 USDC: биржа удерживает 1.", true); return; }
  if (n > max + 1e-8) { wdSay(`Можно вывести ${money(max)} USDC.`, true); return; }
  const picked = wdDestination();
  if (!picked.dest || !picked.state.ok) {
    wdSay(picked.own ? "Сначала подключите кошелёк." : "Адрес недействителен.", true);
    return;
  }
  const c = wdChecks();
  if (picked.own && !c.own) {
    wdSay("Подтвердите, что это ваш адрес.", true);
    return;
  }
  if (!picked.own && (!c.arb || !c.mine)) {
    wdSay("Подтвердите, что адрес ваш и он в сети Arbitrum One.", true);
    return;
  }
  const mine = fundAddr();
  wdPending = {
    dest: picked.dest,
    own: picked.own,
    amount,
    net: money(n - 1),
    mine,
    same: !!mine && picked.dest.toLowerCase() === mine.toLowerCase(),
  };
  const box = document.getElementById("wdReview");
  if (box) {
    const warn = wdPending.own
      ? "Вы подтвердили: это ваш адрес в сети Arbitrum One."
      : "Вы подтвердили: адрес ваш и он в сети Arbitrum One. На чужой адрес деньги не вернуть.";
    box.innerHTML = `<div class="wd-grid">${[
      wdRow("Откуда", "Totum"),
      wdRow("Куда", wdPending.own ? "На подключённый кошелёк" : "На другой адрес"),
    ].join("")}</div>` + [
      wdRow("Адрес", wdPending.dest, "addr"),
      wdRow("Сеть", "Arbitrum One", "net"),
    ].join("") + `<div class="wd-grid">${[
      wdRow("Списывается", `${wdPending.amount} USDC`),
      wdRow("Придёт", `${wdPending.net} USDC`),
      wdRow("Комиссия", "1 USDC"),
      wdRow("Время", "Около 5 минут"),
    ].join("")}</div>` + wdRow("Адрес действителен", "Да", "ok") + `<p class="wd-warn">${esc(warn)}</p>`;
  }
  const err = document.getElementById("wdFinalErr");
  if (err) { err.hidden = true; err.textContent = ""; }
  const fin = document.getElementById("wdFinal");
  fin?.showModal();
  pinDlg(fin);
  const body = fin?.querySelector(".dlg-body");
  if (body) body.scrollTop = 0;
}

function wdPaint(info) {
  const avail = document.getElementById("wdAvail");
  const spot = document.getElementById("wdSpot");
  const net = document.getElementById("wdNet");
  const max = info ? (info.unified ? info.spot : info.perp) : 0;
  if (avail) avail.textContent = info ? `Доступно ${money(max)} USDC` : "";
  if (spot) {
    const extra = info && !info.unified && info.spot > 0.01;
    spot.hidden = !extra;
    spot.textContent = extra ? `На споте ${money(info.spot)} USDC. Сначала переведите на фьючерсы.` : "";
  }
  const n = Number(String(document.getElementById("wdAmt")?.value || "").replace(",", "."));
  if (net) net.textContent = n > 1 ? `Придёт ${money(n - 1)} USDC. Комиссия 1. Сеть Arbitrum One.` : "";
  return max;
}

async function wdOpen() {
  wdHide("wdErr");
  wdHide("wdOut");
  wdResetDest();
  let info = null;
  try { info = window.totumWallet?.out?.() || null; } catch { info = null; }
  wdPaint(info);
  wdDlg.showModal();
  pinDlg(wdDlg);
  fundArm();
  try { await window.totumWallet?.refresh?.(); } catch { /* баланс обновится сам */ }
  try { info = window.totumWallet?.out?.() || info; } catch { /* старые цифры */ }
  if (wdDlg.open) { wdOwnText(); wdPaint(info); }
}

document.getElementById("btnWithdraw")?.addEventListener("click", wdOpen);
document.getElementById("wdClose")?.addEventListener("click", () => wdDlg.close());
document.getElementById("wdAmt")?.addEventListener("input", () => {
  try { wdPaint(window.totumWallet?.out?.() || null); } catch { wdPaint(null); }
});
document.getElementById("wdDest")?.addEventListener("click", (e) => {
  const b = e.target.closest("[data-dest]");
  if (!b) return;
  document.querySelectorAll("#wdDest button").forEach(n => n.classList.toggle("on", n === b));
  const other = b.dataset.dest === "other";
  const box = document.getElementById("wdOther");
  if (box) box.hidden = !other;
  const own = document.getElementById("wdOwn");
  if (own) own.hidden = other;
  const ownOk = document.getElementById("wdOwnOkWrap");
  if (ownOk) ownOk.hidden = other;
  wdHide("wdErr");
  wdGate();
});
document.getElementById("wdArb")?.addEventListener("change", wdGate);
document.getElementById("wdMine")?.addEventListener("change", wdGate);
document.getElementById("wdOwnOk")?.addEventListener("change", wdGate);
document.getElementById("wdAddr")?.addEventListener("input", wdGate);
document.getElementById("wdMax")?.addEventListener("click", () => {
  let info = null;
  try { info = window.totumWallet?.out?.() || null; } catch { info = null; }
  const max = wdPaint(info);
  const amt = document.getElementById("wdAmt");
  if (amt) amt.value = max > 1 ? money(max) : "";
  wdPaint(info);
});
document.getElementById("wdGo")?.addEventListener("click", () => wdOpenReview());
document.getElementById("wdBack")?.addEventListener("click", () => document.getElementById("wdFinal")?.close());
document.getElementById("wdSend")?.addEventListener("click", async () => {
  const btn = document.getElementById("wdSend");
  const err = document.getElementById("wdFinalErr");
  if (!btn || btn.disabled) return;
  fundUnlock();
  const fail = (text) => { if (err) { err.hidden = false; err.textContent = text; } };
  const pending = wdPending;
  if (!pending?.dest) { fail("Сначала проверьте адрес."); return; }
  const again = wdDestination();
  const { n, amount } = wdAmount();
  if (again.dest.toLowerCase() !== pending.dest.toLowerCase() || amount !== pending.amount || !(n > 1)) {
    fail("Сумма или адрес изменились. Нажмите «Изменить» и проверьте ещё раз.");
    return;
  }
  const c = wdChecks();
  if (again.own && !c.own) {
    fail("Подтверждение адреса снято. Вывод остановлен.");
    return;
  }
  if (!again.own && (!c.arb || !c.mine)) {
    fail("Подтверждение адреса снято. Вывод остановлен.");
    return;
  }
  const ex = window.totumWallet?.ex?.();
  if (!ex || typeof ex.withdraw3 !== "function") {
    fail("Подключите кошелёк ещё раз. Ключ для сделок вывод не подписывает.");
    return;
  }
  btn.disabled = true;
  const prev = btn.textContent;
  btn.textContent = "Ждём подпись…";
  if (err) err.hidden = true;
  let before = null;
  try {
    const r = await fetch("/api/fund-status?address=" + pending.dest);
    const j = await r.json().catch(() => ({}));
    if (r.ok && j.ok) before = String(j.usdc || "0");
  } catch { /* без снимка прогресс всё равно по времени */ }
  try {
    const live = String(window.totumWallet.addr() || "").toLowerCase();
    if (live !== String(pending.mine || "").toLowerCase()) throw new Error("Кошелёк сменился. Откройте вывод ещё раз.");
    const res = await ex.withdraw3({ destination: pending.dest, amount: pending.amount });
    if (res && res.status && res.status !== "ok") throw new Error("Биржа не приняла вывод. Деньги на месте.");
    wdSave({
      addr: pending.dest,
      amount: pending.amount,
      net: pending.net,
      started: Date.now(),
      before,
      phase: "wait",
      chimed: false,
    });
    const amt = document.getElementById("wdAmt");
    if (amt) amt.value = "";
    wdPending = null;
    wdResetDest();
    document.getElementById("wdFinal")?.close();
    wdDlg.close();
    cashOpen();
    cashWatch();
    try { await window.totumWallet.refresh?.(); } catch { /* баланс биржи обновится сам */ }
  } catch (e) {
    if (e?.message) fail(wdHuman(e));
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
      ? `${job.net} USDC на ${job.addr} в сети Arbitrum One.`
      : `На ${job.addr} в сети Arbitrum One придёт ${job.net} USDC. С биржи списано ${job.amount}, комиссия 1.`;
  }
  if (eta) {
    eta.hidden = job.phase === "ok";
    const min = Math.max(1, Math.ceil(left / 60000));
    eta.textContent = left > 0
      ? `Перевод в сети Arbitrum One ещё идёт. На адрес примерно через ${min} мин.`
      : "Мост ещё подтверждает перевод. Обычно это уже последние минуты.";
  }
  if (ok) {
    if (job.phase !== "ok") { ok.hidden = true; ok.classList.remove("ok"); ok.textContent = ""; }
    else if (!ok.classList.contains("ok")) {
      ok.hidden = false;
      ok.classList.add("ok");
      ok.innerHTML = `<span class="fund-mark" aria-hidden="true"><svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="13"/><path d="M10 16.5l4 4 8-9"/></svg></span><span>Успешно · ${fundShort(job.addr)} · Arbitrum One</span>`;
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
  if (!dlg.open) dlg.showModal();
  pinDlg(dlg);
  cashPaint();
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => "&#" + c.charCodeAt(0) + ";");
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
        ? `Откуда Totum · куда ${fundShort(where)} · Arbitrum One · USDC`
        : `Откуда ${fundShort(where)} · куда Totum · USDC`;
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
window.totumFund = { open: fundShow, withdraw: wdOpen };

function syncDlgLock() {
  document.documentElement.classList.toggle("dlg-lock", !!document.querySelector("dialog[open]"));
}
document.addEventListener("toggle", (e) => {
  if (e.target?.tagName === "DIALOG") syncDlgLock();
}, true);
new MutationObserver(syncDlgLock).observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ["open"] });
document.addEventListener("touchmove", (e) => {
  const dlg = document.querySelector("dialog[open]");
  if (!dlg || dlg.contains(e.target)) return;
  e.preventDefault();
}, { passive: false });

function pinDlg(dlg) {
  if (!dlg || innerWidth > 900) return;
  if (!dlg.dataset.pinH) dlg.dataset.pinH = innerHeight + "px";
  dlg.style.height = dlg.dataset.pinH;
  dlg.style.maxHeight = dlg.dataset.pinH;
}

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
