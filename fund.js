/* Пополнение. Сначала человек подписывает обмен USDT в Tonkeeper:
   USDC придёт на его торговый адрес в Arbitrum. Потом он сам, тем же
   кошельком, отправляет этот USDC на официальный мост Hyperliquid.
   Чужой адрес и сумма меньше 5 USDC отсюда не уходят. */

const BRIDGE = "0x2df1c51e09aecf9cacb7bc98cb1742757f163df7";
const USDC = "0xaf88d065e77c8cc2239327c5edb3a432268e5831";
const fundDlg = document.getElementById("fundDialog");

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

function payloadHas(payload, evm) {
  try {
    const bin = atob(payload);
    let hex = "";
    for (let i = 0; i < bin.length; i++) hex += bin.charCodeAt(i).toString(16).padStart(2, "0");
    return hex.includes(evm.slice(2));
  } catch { return false; }
}

function tonLink(sign, evm) {
  if (!sign || !/^(EQ|UQ)[A-Za-z0-9_-]{46}$/.test(sign.address)) return "";
  if (!/^\d+$/.test(sign.amount) || BigInt(sign.amount) > 500000000n) return "";
  if (!payloadHas(sign.payload, evm)) return "";
  const bin = sign.payload.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `https://app.tonkeeper.com/transfer/${sign.address}?amount=${sign.amount}&bin=${encodeURIComponent(bin)}`;
}

function fundShow() {
  document.getElementById("fundTo").textContent = fundAddr() || "Сначала подключите кошелёк, на котором торгуете";
  document.getElementById("fundOut").hidden = true;
  document.getElementById("fundErr").hidden = true;
  document.getElementById("fundSign").hidden = true;
  document.getElementById("fundGas").hidden = true;
  fundDlg.showModal();
}

document.getElementById("btnFund")?.addEventListener("click", fundShow);
document.getElementById("fundClose")?.addEventListener("click", () => fundDlg.close());

document.getElementById("fundGo")?.addEventListener("click", async () => {
  const err = document.getElementById("fundErr");
  const out = document.getElementById("fundOut");
  const sign = document.getElementById("fundSign");
  const gas = document.getElementById("fundGas");
  const btn = document.getElementById("fundGo");
  err.hidden = true;
  out.hidden = true;
  sign.hidden = true;
  gas.hidden = true;
  sign.removeAttribute("href");
  gas.removeAttribute("href");
  const to = fundAddr();
  if (!to) { err.hidden = false; err.textContent = "Подключите торговый кошелёк. На чужой адрес не считаем."; return; }
  btn.disabled = true;
  btn.textContent = "Считаем…";
  try {
    const r = await fetch("/api/fund-quote", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        amount: document.getElementById("fundAmt").value,
        from: document.getElementById("fundFrom").value.trim(),
        to,
      }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) throw new Error(j.error || "Не посчиталось");
    if (j.to !== to) throw new Error("Адрес в ответе не совпал с кошельком. Расчёт отменён.");
    const link = tonLink(j.sign, to);
    const gasLink = tonLink(j.gasSign, to);
    out.hidden = false;
    out.innerHTML = `Из суммы <b>${j.tradeUsdt} USDT</b> придёт <b>${j.out} USDC</b> на ${fundShort(to)}.<br>Не меньше ${j.min || j.out}. Ещё <b>${j.gasUsdt} USDT</b> заложены на комиссию: <b>${j.gasEth} ETH</b>, это $${j.gasUsd}.<br>${link && gasLink ? "Сначала подпишите комиссию, потом обмен. На счёте нужен ещё примерно 0.4 TON на две комиссии сети." : (j.signError || j.gasSignError || "Подпись пока закрыта.")}`;
    if (link && gasLink) {
      gas.href = gasLink;
      sign.href = link;
      gas.hidden = false;
      sign.hidden = false;
      document.getElementById("fundHlAmt").value = j.min || j.out;
    }
  } catch (e) {
    err.hidden = false;
    err.textContent = e.message || "Не посчиталось";
  } finally {
    btn.disabled = false;
    btn.textContent = "Посчитать";
  }
});

document.getElementById("fundHl")?.addEventListener("click", async () => {
  const err = document.getElementById("fundErr");
  const btn = document.getElementById("fundHl");
  err.hidden = true;
  const w = window.totumWallet;
  const from = fundAddr();
  const amt = units(document.getElementById("fundHlAmt").value);
  if (!w || !from) { err.hidden = false; err.textContent = "Подключите кошелёк, на котором торгуете."; return; }
  if (amt == null || amt < 5000000n) { err.hidden = false; err.textContent = "Меньше 5 USDC Hyperliquid не зачислит, перевод сгорит. Не отправляем."; return; }
  btn.disabled = true;
  btn.textContent = "Ждём подпись…";
  try {
    try { await w.req("wallet_switchEthereumChain", [{ chainId: "0xa4b1" }]); } catch { /* сеть проверим ниже */ }
    const chain = await w.req("eth_chainId", []);
    if (BigInt(chain) !== 42161n) throw new Error("Кошелёк не на Arbitrum. Перевод отменён.");
    const bal = await w.req("eth_call", [{ to: USDC, data: "0x70a08231" + from.slice(2).padStart(64, "0") }, "latest"]);
    if (BigInt(bal) < amt) throw new Error("На Arbitrum меньше USDC, чем вы зачисляете.");
    const data = "0xa9059cbb" + BRIDGE.slice(2).padStart(64, "0") + amt.toString(16).padStart(64, "0");
    if (!data.includes(BRIDGE.slice(2)) || data.slice(0, 10) !== "0xa9059cbb") throw new Error("Сборка перевода сломалась.");
    const hash = await w.req("eth_sendTransaction", [{ from, to: USDC, data, value: "0x0" }]);
    err.hidden = false;
    err.style.color = "";
    err.textContent = `Отправлено ${hash}. Зачисление на счёт занимает меньше минуты. На кошельке Arbitrum нужен немного ETH для комиссии.`;
  } catch (e) {
    err.hidden = false;
    err.textContent = e?.message || "Кошелёк отклонил перевод";
  } finally {
    btn.disabled = false;
    btn.textContent = "Зачислить на Hyperliquid";
  }
});
