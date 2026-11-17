/* Пополнение из TON. Этот шаг только считает, сколько USDC придёт
   на уже подключённый торговый адрес. Подписи нет, кнопка отправки
   специально не сделана: сначала человек должен видеть сумму и адрес. */

const fundDlg = document.getElementById("fundDialog");
const fundOpen = document.getElementById("btnFund");

function fundAddr() {
  if (!document.body.classList.contains("connected")) return "";
  try {
    const a = JSON.parse(localStorage.getItem("totum.conn") || "{}").addr || "";
    return /^0x[0-9a-fA-F]{40}$/.test(a) ? a : "";
  } catch { return ""; }
}

function fundShort(a) {
  return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "кошелёк не подключён";
}

function fundShow() {
  const a = fundAddr();
  document.getElementById("fundTo").textContent = a || "Сначала подключите кошелёк, на котором торгуете";
  document.getElementById("fundOut").hidden = true;
  document.getElementById("fundErr").hidden = true;
  fundDlg.showModal();
}

fundOpen?.addEventListener("click", fundShow);
document.getElementById("fundClose")?.addEventListener("click", () => fundDlg.close());

document.getElementById("fundGo")?.addEventListener("click", async () => {
  const err = document.getElementById("fundErr");
  const out = document.getElementById("fundOut");
  const btn = document.getElementById("fundGo");
  err.hidden = true;
  out.hidden = true;
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
    if (j.to !== to.toLowerCase()) throw new Error("Адрес в ответе не совпал с кошельком. Расчёт отменён.");
    const mins = j.seconds ? `около ${Math.max(1, Math.round(j.seconds / 60))} мин` : "обычно пара минут";
    out.hidden = false;
    out.innerHTML = `<b>${j.out} USDC</b> на Arbitrum, на ${fundShort(to)}.<br>Не меньше ${j.min || j.out} USDC, иначе маршрут не должен пройти. Время моста: ${mins}.<br>Это ещё не перевод. На счёт Hyperliquid эта сумма сама не зачислится.`;
  } catch (e) {
    err.hidden = false;
    err.textContent = e.message || "Не посчиталось";
  } finally {
    btn.disabled = false;
    btn.textContent = "Посчитать";
  }
});
