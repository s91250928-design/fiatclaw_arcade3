/* Скраб линии PnL на карточке активов: точка, баланс и короткие толчки. */
(function () {
  let active = null;
  let lastIdx = -1;
  let lastX = -1;
  let lastTick = 0;

  function series(el) {
    try {
      const raw = JSON.parse(decodeURIComponent(el.getAttribute("data-pts") || ""));
      return Array.isArray(raw) ? raw : [];
    } catch {
      return [];
    }
  }

  function buzz() {
    const now = Date.now();
    if (now - lastTick < 32) return;
    lastTick = now;
    const h = window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.HapticFeedback;
    try {
      if (h && typeof h.selectionChanged === "function") {
        h.selectionChanged();
        return;
      }
    } catch { /* обычная вибрация ниже */ }
    try { if (navigator.vibrate) navigator.vibrate(10); } catch { /* нет вибрации */ }
  }

  function show(el, on) {
    el.querySelectorAll(".hc-scrub-line,.hc-scrub-dot,.hc-scrub-tip").forEach((n) => n.classList.toggle("on", on));
  }

  function place(el, clientX) {
    if (!el.isConnected) return;
    const list = series(el);
    if (list.length < 2) return;
    const box = el.getBoundingClientRect();
    if (!(box.width > 0)) return;
    const x = Math.min(Math.max(clientX - box.left, 0), box.width);
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < list.length; i++) {
      const px = (Number(list[i].x) / 320) * box.width;
      const d = Math.abs(px - x);
      if (d < bestD) { bestD = d; best = i; }
    }
    const p = list[best];
    const left = (Number(p.x) / 320) * 100;
    const top = (Number(p.y) / 64) * 100;
    const line = el.querySelector(".hc-scrub-line");
    const dot = el.querySelector(".hc-scrub-dot");
    const tip = el.querySelector(".hc-scrub-tip");
    if (line) line.style.left = left + "%";
    if (dot) { dot.style.left = left + "%"; dot.style.top = top + "%"; }
    if (tip) {
      tip.textContent = p.b || "—";
      const shift = left < 14 ? "0%" : left > 86 ? "100%" : "50%";
      tip.style.left = left + "%";
      tip.style.top = top + "%";
      tip.style.transform = top < 36
        ? `translate(-${shift}, 10px)`
        : `translate(-${shift}, calc(-100% - 10px))`;
    }
    show(el, true);
    if (best !== lastIdx || Math.abs(x - lastX) >= 12) {
      lastIdx = best;
      lastX = x;
      buzz();
    }
  }

  function stop() {
    if (active) show(active, false);
    active = null;
    lastIdx = -1;
    lastX = -1;
  }

  document.addEventListener("pointerdown", (e) => {
    const el = e.target.closest && e.target.closest(".hc-scrub");
    if (!el || e.target.closest("button,a")) return;
    active = el;
    lastIdx = -1;
    lastX = -1;
    try { el.setPointerCapture(e.pointerId); } catch { /* старый вебвью */ }
    try { e.preventDefault(); } catch { /* passive */ }
    place(el, e.clientX);
  }, { passive: false });

  document.addEventListener("pointermove", (e) => {
    if (!active) return;
    if (e.pointerType === "mouse" && e.buttons === 0) return;
    place(active, e.clientX);
  }, { passive: true });

  document.addEventListener("pointerup", stop);
  document.addEventListener("pointercancel", stop);
})();
