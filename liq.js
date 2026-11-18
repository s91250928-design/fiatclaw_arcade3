/* Карта ликвидаций. У Hyperliquid нет открытой ленты ликвидаций,
   поэтому это оценка: открытый интерес раскладывается по типичному плечу.
   Своя цена ликвидации, если позиция открыта, рисуется отдельно. */
(function () {
  const LEV = [[3, .08], [5, .18], [10, .34], [20, .22], [25, .12], [50, .06]];
  const MMR = .005;

  function num(text) {
    if (!text) return 0;
    let s = String(text).replace(/\s/g, "").replace("−", "-").replace(",", ".");
    s = s.replace(/[^0-9.+\-]/g, "");
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  }

  function usd(text) {
    if (!text) return 0;
    const t = String(text).toLowerCase().replace(/\s/g, "").replace(",", ".");
    const n = parseFloat(t.replace(/[^0-9.]/g, ""));
    if (!Number.isFinite(n)) return 0;
    if (t.includes("млрд")) return n * 1e9;
    if (t.includes("млн")) return n * 1e6;
    if (t.includes("тыс")) return n * 1e3;
    return n;
  }

  function ownLiq(px) {
    const pair = (document.getElementById("pairName")?.textContent || "").split("-")[0].trim();
    if (!pair) return null;
    for (const tr of document.querySelectorAll("#posBody tr")) {
      const name = tr.querySelector("b")?.textContent || "";
      if (!name.includes(pair)) continue;
      const cells = tr.querySelectorAll("td");
      const liq = num(cells[6]?.textContent);
      if (liq > 0 && Math.abs(liq / px - 1) < .8) return liq;
    }
    return null;
  }

  function draw() {
    const c = document.getElementById("liqmap");
    const pane = document.getElementById("paneChart");
    if (!c || !pane?.classList.contains("liq-on")) return;
    const dpr = window.devicePixelRatio || 1;
    const w = c.clientWidth, h = c.clientHeight;
    if (!w || !h) return;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
    }
    const g = c.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cs = getComputedStyle(document.documentElement);
    const bg = cs.getPropertyValue("--panel").trim() || "#0e1116";
    const buy = cs.getPropertyValue("--buy").trim() || "#16a34a";
    const sell = cs.getPropertyValue("--sell").trim() || "#e11d48";
    const muted = cs.getPropertyValue("--muted").trim() || "#9aa3b2";
    const text = cs.getPropertyValue("--text").trim() || "#eef1f5";
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);

    const spot = (document.getElementById("pairType")?.textContent || "").toLowerCase().includes("спот");
    const px = num(document.getElementById("mkPrice")?.textContent);
    const oi = usd(document.getElementById("mkOi")?.textContent);
    const pad = 16;
    if (spot || !px) {
      g.fillStyle = muted;
      g.font = "14px Manrope, sans-serif";
      g.textAlign = "center";
      g.fillText(spot ? "На споте позиций с ликвидацией нет" : "Ждём цену…", w / 2, h / 2);
      return;
    }

    const lo = px * .8, hi = px * 1.2, bins = 36;
    const step = (hi - lo) / bins;
    const long = new Array(bins).fill(0), short = new Array(bins).fill(0);
    const half = oi > 0 ? oi / 2 : px * 1e4;
    for (const [L, wgt] of LEV) {
      const dl = px * (1 - 1 / L + MMR);
      const ds = px * (1 + 1 / L - MMR);
      const bl = Math.floor((dl - lo) / step), bs = Math.floor((ds - lo) / step);
      if (bl >= 0 && bl < bins) long[bl] += half * wgt;
      if (bs >= 0 && bs < bins) short[bs] += half * wgt;
    }
    const max = Math.max(1, ...long, ...short);
    const top = 36, bot = h - 28, plotH = bot - top;
    const mid = w * .42;
    const barW = (w - mid - pad);

    g.font = "12px Manrope, sans-serif";
    g.textAlign = "left";
    g.fillStyle = text;
    g.fillText("Ликвидации · оценка по открытому интересу", pad, 22);
    g.fillStyle = muted;
    g.font = "11px Manrope, sans-serif";
    g.fillText(oi ? "не лента сделок: у биржи нет открытых ликвидаций" : "открытый интерес ещё не пришёл — шкала условная", pad + 280, 22);

    for (let i = 0; i < bins; i++) {
      const y = bot - ((i + .5) / bins) * plotH;
      const bh = Math.max(2, plotH / bins - 1);
      if (long[i]) {
        g.fillStyle = sell;
        g.globalAlpha = .35 + .65 * (long[i] / max);
        g.fillRect(mid - barW * (long[i] / max), y - bh / 2, barW * (long[i] / max), bh);
      }
      if (short[i]) {
        g.fillStyle = buy;
        g.globalAlpha = .35 + .65 * (short[i] / max);
        g.fillRect(mid, y - bh / 2, barW * (short[i] / max), bh);
      }
    }
    g.globalAlpha = 1;
    const yPx = bot - ((px - lo) / (hi - lo)) * plotH;
    g.strokeStyle = text;
    g.globalAlpha = .85;
    g.beginPath();
    g.moveTo(pad, yPx);
    g.lineTo(w - pad, yPx);
    g.stroke();
    g.globalAlpha = 1;
    g.fillStyle = text;
    g.font = "12px ui-monospace, monospace";
    g.textAlign = "right";
    g.fillText(px.toLocaleString("ru-RU"), w - pad, yPx - 6);

    const mine = ownLiq(px);
    if (mine && mine > lo && mine < hi) {
      const y = bot - ((mine - lo) / (hi - lo)) * plotH;
      g.strokeStyle = "#f59e0b";
      g.setLineDash([4, 4]);
      g.beginPath();
      g.moveTo(pad, y);
      g.lineTo(w - pad, y);
      g.stroke();
      g.setLineDash([]);
      g.fillStyle = "#f59e0b";
      g.textAlign = "left";
      g.fillText("твоя " + mine.toLocaleString("ru-RU"), pad, y - 6);
    }

    g.fillStyle = muted;
    g.font = "11px Manrope, sans-serif";
    g.textAlign = "left";
    g.fillText("лонги ликвидирует ниже", pad, h - 10);
    g.textAlign = "right";
    g.fillText("шорты — выше", w - pad, h - 10);
  }

  window.totumLiq = draw;
  addEventListener("resize", draw);
  setInterval(draw, 2000);
})();
