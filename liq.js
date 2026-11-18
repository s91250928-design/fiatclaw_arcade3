/* Тепловая карта ликвидаций.
   У Hyperliquid нет открытой ленты, поэтому уровни — оценка:
   открытый интерес раскладывается по свечам графика и плечу 5–50x.
   Полоса начинается на свече входа и тянется вправо. */
(function () {
  const LEV = [[5, .07], [10, .24], [20, .28], [25, .18], [40, .13], [50, .10]];
  const MMR = .004;
  const state = { tip: null, pin: null, coin: "" };
  const view = { bands: [], rails: [], lo: 0, hi: 0 };

  function cssVar(name, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }

  function pal() {
    return {
      bg: cssVar("--panel", "#ffffff"),
      rail: cssVar("--panel2", "#f5f7fb"),
      text: cssVar("--text", "#0f172a"),
      muted: cssVar("--muted", "#64748b"),
      line: cssVar("--line", "#e2e8f0"),
      buy: cssVar("--buy", "#16a34a"),
      sell: cssVar("--sell", "#e11d48"),
    };
  }

  function money(n) {
    const a = Math.abs(n);
    const s = a >= 1e9 ? (a / 1e9).toFixed(2).replace(".", ",") + " млрд"
      : a >= 1e6 ? (a / 1e6).toFixed(1).replace(".", ",") + " млн"
      : a >= 1e3 ? Math.round(a / 1e3) + " тыс"
      : String(Math.round(a));
    return s;
  }

  function pxText(n) {
    if (!n) return "—";
    const d = n >= 1000 ? 0 : n >= 100 ? 1 : n >= 1 ? 2 : 4;
    return n.toLocaleString("ru-RU", { minimumFractionDigits: d, maximumFractionDigits: d });
  }

  function pctText(price, px) {
    const v = (price / px - 1) * 100;
    return (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(1).replace(".", ",") + "%";
  }

  function heat(t) {
    const u = Math.max(0, Math.min(1, t));
    const stops = [[0, 250, 204, 21], [.28, 132, 204, 22], [.55, 251, 146, 60], [.78, 239, 68, 68], [1, 185, 28, 28]];
    let i = 1;
    while (i < stops.length && stops[i][0] < u) i++;
    const a = stops[i - 1], b = stops[i] || stops[i - 1];
    const f = b[0] === a[0] ? 0 : (u - a[0]) / (b[0] - a[0]);
    const ch = (k) => Math.round(a[k] + (b[k] - a[k]) * f);
    const alpha = .34 + .62 * Math.pow(u, .55);
    return `rgba(${ch(1)},${ch(2)},${ch(3)},${alpha.toFixed(3)})`;
  }

  function ownLiq(px) {
    const pair = (document.getElementById("pairName")?.textContent || "").split(/[-/]/)[0].trim();
    if (!pair) return null;
    for (const tr of document.querySelectorAll("#posBody tr")) {
      const name = tr.querySelector("b")?.textContent || "";
      if (!name.includes(pair)) continue;
      const raw = (tr.querySelectorAll("td")[6]?.textContent || "").replace(/\s/g, "").replace(",", ".").replace("−", "-");
      const liq = Number(raw.replace(/[^0-9.]/g, ""));
      if (liq > 0 && Math.abs(liq / px - 1) < .85) return liq;
    }
    return null;
  }

  function build(bars, vol, oi, px) {
    const n = bars.length;
    const weights = vol.map((v, i) => (Math.sqrt(Math.max(0, v)) + .2) * (.55 + .45 * (n <= 1 ? 1 : i / (n - 1))));
    for (let i = 2; i < n - 1; i++) {
      const b = bars[i];
      if (b.high >= bars[i - 1].high && b.high >= bars[i + 1].high) weights[i] *= 1.4;
      if (b.low <= bars[i - 1].low && b.low <= bars[i + 1].low) weights[i] *= 1.4;
    }
    const wsum = weights.reduce((a, b) => a + b, 0) || 1;
    let loC = px, hiC = px;
    for (const b of bars) {
      loC = Math.min(loC, +b.low || +b.close || px);
      hiC = Math.max(hiC, +b.high || +b.close || px);
    }
    const pad = Math.max(px * .075, (hiC - loC) * .45);
    let lo = Math.max(px * .88, Math.min(px - pad, loC * .995));
    let hi = Math.min(px * 1.12, Math.max(px + pad, hiC * 1.005));
    if (!(hi > lo)) { lo = px * .94; hi = px * 1.06; }
    const rows = 42;
    const step = (hi - lo) / rows;
    const cells = new Map();
    const priced = oi > 0;
    const purse = priced ? oi : 1;
    for (let i = 0; i < n; i++) {
      const entry = +bars[i].close;
      if (!(entry > 0)) continue;
      const slice = weights[i] / wsum * purse;
      for (const [L, share] of LEV) {
        const usd = slice * share * .5;
        put(entry * (1 - 1 / L + MMR), "long", usd, i);
        put(entry * (1 + 1 / L - MMR), "short", usd, i);
      }
    }
    function put(price, side, usd, i) {
      if (!(price > lo && price < hi) || !(usd > 0)) return;
      const y = Math.min(rows - 1, Math.max(0, Math.floor((price - lo) / step)));
      let c = cells.get(y);
      if (!c) { c = { long: 0, short: 0, i, y }; cells.set(y, c); }
      c[side] += usd;
      if (i < c.i) c.i = i;
    }
    const list = [...cells.values()].map((c) => ({
      price: lo + (c.y + .5) * step,
      long: c.long,
      short: c.short,
      usd: c.long + c.short,
      side: c.short >= c.long ? "short" : "long",
      i: c.i,
    }));
    const max = list.reduce((m, b) => Math.max(m, b.usd), 0) || 1;
    return {
      lo, hi, step, list, max, priced, n,
      longUsd: list.reduce((s, b) => s + b.long, 0),
      shortUsd: list.reduce((s, b) => s + b.short, 0),
    };
  }

  function draw() {
    const c = document.getElementById("liqmap");
    const pane = document.getElementById("paneChart");
    if (!c || !pane?.classList.contains("liq-on")) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = c.clientWidth, h = c.clientHeight;
    if (w < 40 || h < 40) return;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
    }
    const g = c.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.globalAlpha = 1;
    const theme = pal();
    g.fillStyle = theme.bg;
    g.fillRect(0, 0, w, h);
    view.bands = [];
    view.rails = [];

    const m = window.totumMkt;
    const name = document.getElementById("pairName")?.textContent || m?.coin || "";
    g.font = "700 13px Manrope, sans-serif";
    g.fillStyle = theme.text;
    g.textAlign = "left";
    g.textBaseline = "alphabetic";
    g.fillText(name ? name + " · ликвидации" : "Ликвидации", 12, 18);
    g.font = "12px Manrope, sans-serif";
    g.fillStyle = theme.muted;

    if (!m || m.spot) {
      g.fillText("На споте ликвидаций нет. Открой бессрочный контракт.", 12, h / 2);
      return;
    }
    if (state.coin !== m.coin) { state.coin = m.coin; state.pin = null; state.tip = null; }
    const src = m.bars || [];
    const srcVol = m.vols || [];
    const paired = [];
    for (let i = 0; i < src.length; i++) {
      const b = src[i];
      if (!b || !(+b.close > 0)) continue;
      paired.push([b, +srcVol[i]?.value || 0]);
    }
    const use = paired.slice(-160);
    const bars = use.map((x) => x[0]);
    const vol = use.map((x) => x[1]);
    const px = +m.mark || +bars.at(-1)?.close || 0;
    if (bars.length < 8 || !px) {
      g.fillText("Копим свечи этой пары…", 12, h / 2);
      return;
    }
    const model = build(bars, vol, +m.oiUsd || 0, px);
    view.lo = model.lo;
    view.hi = model.hi;
    const railW = w >= 920 ? 236 : 0;
    const gutter = 62;
    const left = 10, top = 46, bot = h - 22;
    const plotW = Math.max(80, w - railW - gutter - left - 8);
    const plotH = Math.max(40, bot - top);
    const yOf = (price) => top + (model.hi - price) / (model.hi - model.lo) * plotH;
    const cw = plotW / model.n;

    g.font = "12px Manrope, sans-serif";
    g.fillStyle = theme.muted;
    const iv = m.iv ? " · " + m.iv : "";
    g.fillText("оценка по интересу" + iv + " · плечо 5–50×, не лента биржи", 12, 36);

    if (plotW > 220) {
      const lx = left + plotW - 118;
      const grd = g.createLinearGradient(lx, 0, lx + 64, 0);
      grd.addColorStop(0, heat(.12));
      grd.addColorStop(.5, heat(.55));
      grd.addColorStop(1, heat(1));
      g.fillStyle = grd;
      g.beginPath();
      g.roundRect(lx, 28, 64, 7, 3);
      g.fill();
      g.fillStyle = theme.muted;
      g.font = "10px Manrope, sans-serif";
      g.textAlign = "right";
      g.fillText("мало", lx - 4, 35);
      g.textAlign = "left";
      g.fillText("много", lx + 68, 35);
    }

    g.save();
    g.beginPath();
    g.rect(left, top, plotW, plotH);
    g.clip();
    for (const b of model.list) {
      const t = b.usd / model.max;
      if (t < .1) continue;
      const y = yOf(b.price);
      const x = left + b.i * cw;
      const bw = left + plotW - x;
      const thick = Math.max(3, Math.min(plotH / 42 * .78, 2.4 + 6.5 * Math.pow(t, .8)));
      if (bw < 2) continue;
      g.fillStyle = heat(t);
      g.beginPath();
      g.roundRect(x, y - thick / 2, bw, thick, 1.4);
      g.fill();
      view.bands.push({ x, y, w: bw, h: thick, price: b.price, side: b.side, usd: b.usd });
    }
    bars.forEach((bar, i) => {
      const x = left + (i + .5) * cw;
      const up = +bar.close >= +bar.open;
      g.strokeStyle = up ? theme.buy : theme.sell;
      g.fillStyle = up ? theme.buy : theme.sell;
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(x, yOf(+bar.high || +bar.close));
      g.lineTo(x, yOf(+bar.low || +bar.close));
      g.stroke();
      const bw = Math.max(1.5, Math.min(8, cw * .55));
      const yA = yOf(+bar.open || +bar.close), yB = yOf(+bar.close);
      g.globalAlpha = .92;
      g.fillRect(x - bw / 2, Math.min(yA, yB), bw, Math.max(1, Math.abs(yB - yA)));
      g.globalAlpha = 1;
    });
    const mine = ownLiq(px);
    if (mine && mine > model.lo && mine < model.hi) {
      const y = yOf(mine);
      g.strokeStyle = "#d97706";
      g.setLineDash([5, 4]);
      g.lineWidth = 1.25;
      g.beginPath();
      g.moveTo(left, y);
      g.lineTo(left + plotW, y);
      g.stroke();
      g.setLineDash([]);
      g.fillStyle = "#d97706";
      g.font = "11px Manrope, sans-serif";
      g.textAlign = "left";
      g.fillText("твоя " + pxText(mine), left + 6, y - 5);
    }
    if (state.pin && state.pin > model.lo && state.pin < model.hi) {
      const y = yOf(state.pin);
      g.strokeStyle = theme.text;
      g.lineWidth = 1.25;
      g.beginPath();
      g.moveTo(left, y);
      g.lineTo(left + plotW, y);
      g.stroke();
    }
    g.restore();

    const yPx = yOf(px);
    g.strokeStyle = theme.text;
    g.globalAlpha = .55;
    g.setLineDash([3, 4]);
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(left, yPx);
    g.lineTo(left + plotW, yPx);
    g.stroke();
    g.setLineDash([]);
    g.globalAlpha = 1;
    const pill = pxText(px);
    g.font = "700 11px Manrope, sans-serif";
    const pw = g.measureText(pill).width + 12;
    g.fillStyle = theme.text;
    g.beginPath();
    g.roundRect(left + plotW - pw, yPx - 9, pw, 18, 4);
    g.fill();
    g.fillStyle = theme.bg;
    g.textAlign = "right";
    g.fillText(pill, left + plotW - 6, yPx + 4);

    g.fillStyle = theme.muted;
    g.font = "11px Manrope, sans-serif";
    g.textAlign = "left";
    for (let i = 0; i <= 4; i++) {
      const price = model.lo + (model.hi - model.lo) * i / 4;
      const y = yOf(price);
      if (Math.abs(y - yPx) < 12) continue;
      g.fillText(pxText(price), left + plotW + 8, y + 3);
    }

    const span = (bars.at(-1).time || 0) - (bars[0].time || 0);
    const label = (sec) => {
      if (!sec) return "";
      const d = new Date(sec * 1000);
      return span > 86400 * 2
        ? d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" })
        : d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
    };
    g.fillStyle = theme.muted;
    g.font = "11px Manrope, sans-serif";
    for (let i = 0; i < 4; i++) {
      const k = Math.round(i / 3 * (bars.length - 1));
      const x = left + (k + .5) * cw;
      g.textAlign = i === 0 ? "left" : i === 3 ? "right" : "center";
      g.fillText(label(bars[k].time), x, h - 8);
    }

    if (state.tip && state.tip.y > top && state.tip.y < bot && state.tip.x < left + plotW) {
      const tip = state.tip;
      const side = tip.price >= px ? "шорты" : "лонги";
      const line1 = pxText(tip.price) + " · " + side;
      const line2 = (model.priced ? money(tip.usd) + " · " : "") + pctText(tip.price, px);
      g.font = "12px Manrope, sans-serif";
      const tw = Math.max(g.measureText(line1).width, g.measureText(line2).width) + 16;
      const tx = Math.min(Math.max(left, tip.x + 12), left + plotW - tw);
      const ty = Math.max(top, tip.y - 42);
      g.fillStyle = theme.rail;
      g.strokeStyle = theme.line;
      g.beginPath();
      g.roundRect(tx, ty, tw, 36, 6);
      g.fill();
      g.stroke();
      g.fillStyle = theme.text;
      g.textAlign = "left";
      g.fillText(line1, tx + 8, ty + 15);
      g.fillStyle = theme.muted;
      g.fillText(line2, tx + 8, ty + 29);
    }

    if (!railW) return;
    const rx = w - railW;
    g.fillStyle = theme.rail;
    g.fillRect(rx, 0, railW, h);
    g.fillStyle = theme.line;
    g.fillRect(rx, 0, 1, h);
    const x = rx + 12;
    g.textAlign = "left";
    g.fillStyle = theme.text;
    g.font = "700 13px Manrope, sans-serif";
    g.fillText("Уровни", x, 20);
    const total = model.longUsd + model.shortUsd || 1;
    const lp = model.longUsd / total;
    g.font = "11px Manrope, sans-serif";
    g.fillStyle = theme.buy;
    g.fillText("лонги " + Math.round(lp * 100) + "%", x, 40);
    g.textAlign = "right";
    g.fillStyle = theme.sell;
    g.fillText("шорты " + Math.round((1 - lp) * 100) + "%", w - 12, 40);
    g.textAlign = "left";
    const barW = railW - 24;
    g.fillStyle = theme.sell;
    g.fillRect(x, 48, barW, 4);
    g.fillStyle = theme.buy;
    g.fillRect(x, 48, Math.max(2, barW * lp), 4);
    g.fillStyle = theme.muted;
    g.font = "11px Manrope, sans-serif";
    g.fillText(model.priced ? "интерес " + money(m.oiUsd) : "интерес ещё считается", x, 68);

    const slots = h < 430 ? 3 : 5;
    const above = model.list.filter((v) => v.price > px && v.short > 0)
      .sort((a, b) => b.short - a.short).slice(0, slots).sort((a, b) => b.price - a.price);
    const below = model.list.filter((v) => v.price < px && v.long > 0)
      .sort((a, b) => b.long - a.long).slice(0, slots).sort((a, b) => b.price - a.price);
    let y = 92;
    const section = (title, color, arr, side) => {
      g.fillStyle = color;
      g.font = "700 11px Manrope, sans-serif";
      g.textAlign = "left";
      g.fillText(title, x, y);
      y += 8;
      if (!arr.length) {
        g.fillStyle = theme.muted;
        g.font = "12px Manrope, sans-serif";
        g.fillText("в окне нет", x, y + 16);
        y += 32;
        return;
      }
      const peak = arr[0] ? Math.max(...arr.map((v) => side === "short" ? v.short : v.long)) : 1;
      for (const v of arr) {
        const usd = side === "short" ? v.short : v.long;
        const rowY = y;
        const pinned = state.pin && Math.abs(state.pin - v.price) < model.step;
        if (pinned) {
          g.fillStyle = theme.bg;
          g.fillRect(rx + 4, rowY + 4, railW - 8, 28);
        }
        g.fillStyle = color;
        g.globalAlpha = .85;
        g.fillRect(x, rowY + 22, barW * Math.max(.08, usd / (peak || 1)) * .42, 3);
        g.globalAlpha = 1;
        g.fillStyle = theme.text;
        g.font = "600 12px Manrope, sans-serif";
        g.textAlign = "left";
        g.fillText(pxText(v.price), x, rowY + 16);
        g.textAlign = "right";
        g.fillStyle = theme.muted;
        g.font = "11px Manrope, sans-serif";
        const right = model.priced ? money(usd) + "  " + pctText(v.price, px) : pctText(v.price, px);
        g.fillText(right, w - 12, rowY + 16);
        view.rails.push({ x: rx, y: rowY, w: railW, h: 30, price: v.price, side, usd });
        y += 30;
      }
      y += 12;
    };
    section("Выше · шорты", theme.sell, above, "short");
    section("Ниже · лонги", theme.buy, below, "long");
    if (mine) {
      g.textAlign = "left";
      g.fillStyle = "#d97706";
      g.font = "600 12px Manrope, sans-serif";
      g.fillText("Твоя " + pxText(mine), x, Math.min(h - 14, y + 4));
    }
  }

  function local(e) {
    const c = document.getElementById("liqmap");
    if (!c) return null;
    const r = c.getBoundingClientRect();
    return { c, x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function hitAt(x, y) {
    for (const row of view.rails) {
      if (x >= row.x && x <= row.x + row.w && y >= row.y && y <= row.y + row.h) return row;
    }
    let best = null, dist = 12;
    for (const b of view.bands) {
      if (x < b.x || x > b.x + b.w) continue;
      const d = Math.abs(y - b.y);
      if (d < dist) { dist = d; best = b; }
    }
    return best;
  }

  function onMove(e) {
    const p = local(e);
    if (!p) return;
    const hit = hitAt(p.x, p.y);
    p.c.style.cursor = hit && view.rails.includes(hit) ? "pointer" : "crosshair";
    const next = hit ? { x: p.x, y: p.y, price: hit.price, side: hit.side, usd: hit.usd } : null;
    const same = next && state.tip
      ? Math.abs(next.price - state.tip.price) < 1e-8 && Math.abs(next.x - state.tip.x) < 3 && Math.abs(next.y - state.tip.y) < 3
      : !next && !state.tip;
    if (same) return;
    state.tip = next;
    draw();
  }

  function onClick(e) {
    const p = local(e);
    if (!p) return;
    const hit = hitAt(p.x, p.y);
    if (!hit) { state.pin = null; draw(); return; }
    state.pin = state.pin && Math.abs(state.pin - hit.price) < 1e-6 ? null : hit.price;
    draw();
  }

  function bind() {
    const c = document.getElementById("liqmap");
    if (!c || c.dataset.bound) return !!c;
    c.dataset.bound = "1";
    c.addEventListener("pointermove", onMove);
    c.addEventListener("pointerleave", () => { if (state.tip) { state.tip = null; draw(); } });
    c.addEventListener("click", onClick);
    if (window.ResizeObserver) new ResizeObserver(() => draw()).observe(c);
    return true;
  }

  window.totumLiq = draw;
  addEventListener("resize", draw);
  setInterval(() => { bind(); draw(); }, 2000);
  bind();
})();
