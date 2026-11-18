/* Карта ликвидаций.
   У Hyperliquid нет открытой ленты — уровни оценка по интересу и плечу 5–50x.
   Полосы стоят справа от свечей. На линии и при наведении — сумма в деньгах.
   Колесо масштабирует, перетаскивание двигает, как обычный график. */
(function () {
  const LEV = [[5, .07], [10, .24], [20, .28], [25, .18], [40, .13], [50, .10]];
  const MMR = .004;
  const state = { tip: null, pin: null };
  const cam = { key: "", i0: 0, i1: 1, lo: 0, hi: 1, moved: false };
  const view = { bands: [], rails: [], box: null, meta: null, reset: null };
  let drag = null;
  let suppressClick = false;

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
    return a >= 1e9 ? (a / 1e9).toFixed(2).replace(".", ",") + " млрд"
      : a >= 1e6 ? (a / 1e6).toFixed(1).replace(".", ",") + " млн"
      : a >= 1e3 ? Math.round(a / 1e3) + " тыс"
      : String(Math.round(a));
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

  function mix(t) {
    const u = Math.max(0, Math.min(1, t));
    const stops = [[0, 250, 204, 21], [.32, 132, 204, 22], [.62, 251, 146, 60], [1, 220, 50, 50]];
    let i = 1;
    while (i < stops.length && stops[i][0] < u) i++;
    const a = stops[i - 1], b = stops[i] || a;
    const f = b[0] === a[0] ? 0 : (u - a[0]) / (b[0] - a[0]);
    return {
      r: Math.round(a[1] + (b[1] - a[1]) * f),
      g: Math.round(a[2] + (b[2] - a[2]) * f),
      b: Math.round(a[3] + (b[3] - a[3]) * f),
      a: .15 + .22 * Math.pow(u, .8),
    };
  }

  function rgba(c, a) {
    return `rgba(${c.r},${c.g},${c.b},${(a == null ? c.a : a).toFixed(3)})`;
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
    const weights = vol.map((v, i) => (Math.sqrt(Math.max(0, v)) + .2) * (.6 + .4 * (n <= 1 ? 1 : i / (n - 1))));
    for (let i = 2; i < n - 1; i++) {
      const b = bars[i];
      if (b.high >= bars[i - 1].high && b.high >= bars[i + 1].high) weights[i] *= 1.35;
      if (b.low <= bars[i - 1].low && b.low <= bars[i + 1].low) weights[i] *= 1.35;
    }
    const wsum = weights.reduce((a, b) => a + b, 0) || 1;
    const lo = px * .78, hi = px * 1.22;
    const step = Math.max(px * .0036, (hi - lo) / 90);
    const cells = new Map();
    const priced = oi > 0;
    const purse = priced ? oi : 1;
    for (let i = 0; i < n; i++) {
      const entry = +bars[i].close;
      if (!(entry > 0)) continue;
      const slice = weights[i] / wsum * purse;
      for (const [L, share] of LEV) {
        const usd = slice * share * .5;
        put(entry * (1 - 1 / L + MMR), "long", usd);
        put(entry * (1 + 1 / L - MMR), "short", usd);
      }
    }
    function put(price, side, usd) {
      if (!(price > lo && price < hi) || !(usd > 0)) return;
      const y = Math.min(1e9, Math.max(0, Math.floor((price - lo) / step)));
      let c = cells.get(y);
      if (!c) { c = { long: 0, short: 0, y }; cells.set(y, c); }
      c[side] += usd;
    }
    const list = [...cells.values()].map((c) => ({
      price: lo + (c.y + .5) * step,
      long: c.long,
      short: c.short,
      usd: c.long + c.short,
      side: c.short >= c.long ? "short" : "long",
    }));
    const max = list.reduce((m, b) => Math.max(m, b.usd), 0) || 1;
    return {
      list, max, step, priced,
      longUsd: list.reduce((s, b) => s + b.long, 0),
      shortUsd: list.reduce((s, b) => s + b.short, 0),
    };
  }

  function framePrice(bars, px) {
    let lo = px, hi = px;
    for (const b of bars) {
      lo = Math.min(lo, +b.low || +b.close || px);
      hi = Math.max(hi, +b.high || +b.close || px);
    }
    const span = Math.max(hi - lo, px * .012);
    const pad = span * .18;
    return { lo: lo - pad, hi: hi + pad };
  }

  function clampCam(n, px) {
    let span = cam.i1 - cam.i0;
    span = Math.max(12, Math.min(Math.max(n, 12) * 2.4, span));
    if (cam.i0 < -span * .35) cam.i0 = -span * .35;
    if (cam.i0 > n - span * .25) cam.i0 = n - span * .25;
    cam.i1 = cam.i0 + span;
    let ps = cam.hi - cam.lo;
    ps = Math.max(px * .003, Math.min(px * .55, ps || px * .04));
    if (cam.lo < px * .45) cam.lo = px * .45;
    if (cam.lo > px * 1.45) cam.lo = px * 1.45;
    cam.hi = cam.lo + ps;
  }

  function ink(color, a) {
    const s = String(color).trim();
    const m = s.match(/rgba?\(([^)]+)\)/i);
    let r, g, b;
    if (m) {
      const p = m[1].split(",").map((x) => Number(x.trim()));
      r = p[0]; g = p[1]; b = p[2];
    } else {
      let h = s.replace("#", "");
      if (h.length === 3) h = h.replace(/./g, (ch) => ch + ch);
      const n = parseInt(h.slice(0, 6), 16);
      if (!Number.isFinite(n)) return `rgba(148,163,184,${a})`;
      r = (n >> 16) & 255; g = (n >> 8) & 255; b = n & 255;
    }
    return `rgba(${r},${g},${b},${a})`;
  }

  function xOf(i, box) {
    const w = box.candleW || box.plotW;
    return box.left + (i - cam.i0) / (cam.i1 - cam.i0) * w;
  }

  function yOf(price, box) {
    return box.top + (cam.hi - price) / (cam.hi - cam.lo) * box.plotH;
  }

  function priceAt(y) {
    const b = view.box;
    return cam.hi - (y - b.top) / b.plotH * (cam.hi - cam.lo);
  }

  function indexAt(x) {
    const b = view.box;
    const w = b.candleW || b.plotW;
    return cam.i0 + (x - b.left) / w * (cam.i1 - cam.i0);
  }

  function timeAt(bars, idx) {
    if (!bars.length) return 0;
    if (bars.length === 1) return bars[0].time || 0;
    const i = Math.max(0, Math.min(bars.length - 2, Math.floor(idx)));
    const a = bars[i], b = bars[i + 1];
    return (a.time || 0) + (idx - i) * ((b.time || 0) - (a.time || 0));
  }

  function zoomTime(x, factor) {
    const b = view.box;
    const span = cam.i1 - cam.i0;
    const w = b.candleW || b.plotW;
    const f = Math.min(1, Math.max(0, (x - b.left) / w));
    const next = span * factor;
    const at = cam.i0 + f * span;
    cam.i0 = at - f * next;
    cam.i1 = cam.i0 + next;
  }

  function zoomPrice(y, factor) {
    const b = view.box;
    const span = cam.hi - cam.lo;
    const f = Math.min(1, Math.max(0, (y - b.top) / b.plotH));
    const next = span * factor;
    const at = cam.hi - f * span;
    cam.hi = at + f * next;
    cam.lo = cam.hi - next;
  }

  function zoneAt(x, y) {
    const b = view.box;
    if (!b) return "out";
    if (b.railX < b.w && x >= b.railX) return "rail";
    if (y >= b.top && y <= b.top + b.plotH && x >= b.left && x <= b.left + b.plotW) return "plot";
    if (x > b.left + b.plotW && x < b.railX && y >= b.top && y <= b.top + b.plotH) return "price";
    if (y > b.top + b.plotH && x >= b.left && x <= b.left + b.plotW) return "time";
    return "out";
  }

  function inside(r, p) {
    return r && p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
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
    view.reset = null;

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
      view.box = null;
      g.fillText("На споте ликвидаций нет. Открой бессрочный контракт.", 12, h / 2);
      return;
    }
    const src = m.bars || [];
    const srcVol = m.vols || [];
    const paired = [];
    for (let i = 0; i < src.length; i++) {
      const b = src[i];
      if (!b || !(+b.close > 0)) continue;
      paired.push([b, +srcVol[i]?.value || 0]);
    }
    const use = paired.slice(-280);
    const bars = use.map((x) => x[0]);
    const vol = use.map((x) => x[1]);
    const px = +m.mark || +bars.at(-1)?.close || 0;
    const key = (m.coin || "") + "|" + (m.iv || "");
    if (cam.key !== key) { cam.key = key; cam.moved = false; state.pin = null; state.tip = null; }
    if (bars.length < 8 || !px) {
      view.box = null;
      g.fillText("Копим свечи этой пары…", 12, h / 2);
      return;
    }
    const model = build(bars, vol, +m.oiUsd || 0, px);
    if (!cam.moved) {
      const fr = framePrice(bars, px);
      cam.i0 = 0;
      cam.i1 = bars.length;
      cam.lo = fr.lo;
      cam.hi = fr.hi;
    } else clampCam(bars.length, px);
    view.meta = { n: bars.length, px, bars, step: model.step, priced: model.priced };

    const railW = w >= 920 ? 236 : 0;
    const gutter = 64;
    const left = 10, top = 46, bot = h - 22;
    const plotW = Math.max(80, w - railW - gutter - left - 8);
    const plotH = Math.max(40, bot - top);
    const laneW = plotW < 420 ? Math.max(108, plotW * .36) : Math.min(220, Math.max(148, plotW * .32));
    const candleW = Math.max(72, plotW - laneW);
    const box = { left, top, plotW, plotH, bot, railX: railW ? w - railW : w, w, h, gutter, candleW, laneL: left + candleW };
    view.box = box;

    g.font = "12px Manrope, sans-serif";
    g.fillStyle = theme.muted;
    g.fillText("колесо — масштаб, зажми и веди", 12, 36);
    g.textAlign = "left";
    g.fillText("ликвидации, $", left + candleW + 8, 36);

    if (cam.moved) {
      g.font = "600 11px Manrope, sans-serif";
      const tw = g.measureText("сброс").width + 16;
      const rx = left + plotW - tw, ry = 6;
      g.fillStyle = theme.rail;
      g.strokeStyle = theme.line;
      g.beginPath();
      g.roundRect(rx, ry, tw, 18, 4);
      g.fill();
      g.stroke();
      g.fillStyle = theme.text;
      g.textAlign = "center";
      g.fillText("сброс", rx + tw / 2, ry + 13);
      view.reset = { x: rx, y: ry, w: tw, h: 18 };
    }

    g.save();
    g.beginPath();
    g.rect(left, top, candleW, plotH);
    g.clip();

    g.strokeStyle = theme.line;
    g.globalAlpha = .45;
    g.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      const y = top + plotH * i / 4;
      g.beginPath();
      g.moveTo(left, y);
      g.lineTo(left + candleW, y);
      g.stroke();
    }
    g.globalAlpha = 1;

    const iA = Math.max(0, Math.floor(cam.i0) - 1);
    const iB = Math.min(bars.length - 1, Math.ceil(cam.i1) + 1);
    const cw = candleW / (cam.i1 - cam.i0);
    for (let i = iA; i <= iB; i++) {
      const bar = bars[i];
      const x = xOf(i + .5, box);
      const up = +bar.close >= +bar.open;
      g.strokeStyle = up ? theme.buy : theme.sell;
      g.fillStyle = up ? theme.buy : theme.sell;
      g.lineWidth = 1.15;
      g.beginPath();
      g.moveTo(x, yOf(+bar.high || +bar.close, box));
      g.lineTo(x, yOf(+bar.low || +bar.close, box));
      g.stroke();
      const bw = Math.max(1.6, Math.min(14, cw * .62));
      const yA = yOf(+bar.open || +bar.close, box), yB = yOf(+bar.close, box);
      g.fillRect(x - bw / 2, Math.min(yA, yB), bw, Math.max(1, Math.abs(yB - yA)));
    }
    g.restore();

    g.strokeStyle = theme.line;
    g.globalAlpha = .9;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(box.laneL + .5, top);
    g.lineTo(box.laneL + .5, top + plotH);
    g.stroke();
    g.globalAlpha = 1;

    const laneL = box.laneL + 8;
    const laneR = left + plotW - 4;
    const marks = [];
    for (const b of model.list) {
      if (b.price < cam.lo || b.price > cam.hi) continue;
      const side = b.price >= px ? "short" : "long";
      const usd = side === "short" ? b.short : b.long;
      const t = usd / model.max;
      if (!(t > .12)) continue;
      const y = yOf(b.price, box);
      if (y < top + 2 || y > top + plotH - 2) continue;
      const col = side === "short" ? theme.sell : theme.buy;
      const thick = 1.15 + 1.7 * Math.pow(t, .75);
      const grd = g.createLinearGradient(laneL, 0, laneR, 0);
      grd.addColorStop(0, ink(col, 0));
      grd.addColorStop(.22, ink(col, .2 + .45 * t));
      grd.addColorStop(1, ink(col, .45 + .5 * t));
      g.strokeStyle = grd;
      g.lineWidth = thick;
      g.lineCap = "round";
      g.beginPath();
      g.moveTo(laneL, y);
      g.lineTo(laneR, y);
      g.stroke();
      view.bands.push({ x: laneL, y, w: laneR - laneL, h: 10, price: b.price, side, usd });
      marks.push({ y, t, usd, col });
    }
    marks.sort((a, b) => b.t - a.t);
    const used = [];
    g.font = "600 11px Manrope, sans-serif";
    g.textAlign = "right";
    g.textBaseline = "alphabetic";
    for (const mk of marks) {
      if (used.length >= 8 || used.some((yy) => Math.abs(yy - mk.y) < 15)) continue;
      if (!(model.priced && mk.usd > 0)) continue;
      const text = money(mk.usd);
      const tw = g.measureText(text).width + 8;
      g.fillStyle = theme.bg;
      g.globalAlpha = .82;
      g.fillRect(laneR - tw, mk.y - 13, tw, 13);
      g.globalAlpha = 1;
      g.fillStyle = mk.col;
      g.fillText(text, laneR - 2, mk.y - 3);
      used.push(mk.y);
    }

    const mine = ownLiq(px);
    if (mine && mine > cam.lo && mine < cam.hi) {
      const y = yOf(mine, box);
      g.strokeStyle = "#d97706";
      g.setLineDash([5, 4]);
      g.lineWidth = 1.15;
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
    if (state.pin && state.pin > cam.lo && state.pin < cam.hi) {
      const y = yOf(state.pin, box);
      g.strokeStyle = theme.text;
      g.globalAlpha = .7;
      g.lineWidth = 1;
      g.setLineDash([2, 3]);
      g.beginPath();
      g.moveTo(left, y);
      g.lineTo(left + plotW, y);
      g.stroke();
      g.setLineDash([]);
      g.globalAlpha = 1;
    }

    const yPx = yOf(px, box);
    if (yPx > top && yPx < top + plotH) {
      g.strokeStyle = theme.text;
      g.globalAlpha = .4;
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
      g.roundRect(left + candleW - pw, yPx - 9, pw, 18, 4);
      g.fill();
      g.fillStyle = theme.bg;
      g.textAlign = "right";
      g.fillText(pill, left + candleW - 6, yPx + 4);
    }

    g.fillStyle = theme.muted;
    g.font = "11px Manrope, sans-serif";
    g.textAlign = "left";
    for (let i = 0; i <= 4; i++) {
      const price = cam.lo + (cam.hi - cam.lo) * i / 4;
      const y = yOf(price, box);
      if (Math.abs(y - yPx) < 14) continue;
      g.fillText(pxText(price), left + plotW + 8, y + 3);
    }

    const spanT = Math.abs(timeAt(bars, cam.i1) - timeAt(bars, cam.i0));
    const label = (sec) => {
      if (!sec) return "";
      const d = new Date(sec * 1000);
      return spanT > 86400 * 2
        ? d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" })
        : d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
    };
    for (let i = 0; i < 4; i++) {
      const idx = cam.i0 + (cam.i1 - cam.i0) * (i / 3);
      const x = xOf(idx, box);
      g.fillStyle = theme.muted;
      g.font = "11px Manrope, sans-serif";
      g.textAlign = i === 0 ? "left" : i === 3 ? "right" : "center";
      g.fillText(label(timeAt(bars, idx)), Math.min(left + candleW - 4, Math.max(left, x)), h - 8);
    }

    if (state.tip && state.tip.zone === "plot") {
      const tip = state.tip;
      const y = yOf(tip.price, box);
      const x = tip.x;
      g.strokeStyle = theme.muted;
      g.globalAlpha = .55;
      g.lineWidth = 1;
      g.setLineDash([2, 3]);
      g.beginPath();
      g.moveTo(left, y);
      g.lineTo(left + plotW, y);
      if (x < box.laneL) {
        g.moveTo(x, top);
        g.lineTo(x, top + plotH);
      }
      g.stroke();
      g.setLineDash([]);
      g.globalAlpha = 1;
      const pt = pxText(tip.price);
      g.font = "600 11px Manrope, sans-serif";
      const pw = g.measureText(pt).width + 10;
      g.fillStyle = theme.text;
      g.beginPath();
      g.roundRect(left + plotW + 4, y - 8, pw, 16, 3);
      g.fill();
      g.fillStyle = theme.bg;
      g.textAlign = "left";
      g.fillText(pt, left + plotW + 9, y + 4);
      const tt = label(tip.time);
      if (tt && tip.x < box.laneL) {
        const tw = g.measureText(tt).width + 10;
        const tx = Math.min(Math.max(left, x - tw / 2), left + candleW - tw);
        g.fillStyle = theme.text;
        g.beginPath();
        g.roundRect(tx, top + plotH + 2, tw, 16, 3);
        g.fill();
        g.fillStyle = theme.bg;
        g.textAlign = "center";
        g.fillText(tt, tx + tw / 2, top + plotH + 14);
      }
      if (tip.band) {
        const side = tip.band.price >= px ? "шорты" : "лонги";
        const line1 = (model.priced ? money(tip.band.usd) : "оценка") + " · " + side;
        const line2 = pxText(tip.band.price) + " · " + pctText(tip.band.price, px);
        g.font = "12px Manrope, sans-serif";
        const tw = Math.max(g.measureText(line1).width, g.measureText(line2).width) + 16;
        const tx = tip.x >= box.laneL
          ? Math.max(left, box.laneL - tw - 8)
          : Math.min(Math.max(left, tip.x + 12), left + candleW - tw);
        const ty = Math.max(top, tip.y - 44);
        g.fillStyle = theme.rail;
        g.strokeStyle = theme.line;
        g.textAlign = "left";
        g.beginPath();
        g.roundRect(tx, ty, tw, 36, 6);
        g.fill();
        g.stroke();
        g.fillStyle = theme.text;
        g.fillText(line1, tx + 8, ty + 15);
        g.fillStyle = theme.muted;
        g.fillText(line2, tx + 8, ty + 29);
      }
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
      g.globalAlpha = 1;
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
      const peak = Math.max(...arr.map((v) => side === "short" ? v.short : v.long)) || 1;
      for (const v of arr) {
        const usd = side === "short" ? v.short : v.long;
        const rowY = y;
        const on = v.price >= cam.lo && v.price <= cam.hi;
        const pinned = state.pin && Math.abs(state.pin - v.price) < model.step;
        if (pinned) {
          g.globalAlpha = 1;
          g.fillStyle = theme.bg;
          g.fillRect(rx + 4, rowY + 4, railW - 8, 28);
        }
        g.globalAlpha = on ? 1 : .4;
        g.fillStyle = color;
        g.fillRect(x, rowY + 22, barW * Math.max(.08, usd / peak) * .42, 3);
        g.fillStyle = theme.text;
        g.font = "600 12px Manrope, sans-serif";
        g.textAlign = "left";
        g.fillText(pxText(v.price), x, rowY + 16);
        g.textAlign = "right";
        g.fillStyle = theme.muted;
        g.font = "11px Manrope, sans-serif";
        g.fillText((model.priced ? money(usd) + "  " : "") + pctText(v.price, px), w - 12, rowY + 16);
        g.globalAlpha = 1;
        view.rails.push({ x: rx, y: rowY, w: railW, h: 30, price: v.price, side, usd, rail: true });
        y += 30;
      }
      y += 12;
    };
    section("Выше · шорты", theme.sell, above, "short");
    section("Ниже · лонги", theme.buy, below, "long");
    if (mine) {
      g.globalAlpha = 1;
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
    let best = null, dist = 10;
    for (const b of view.bands) {
      if (x < b.x || x > b.x + b.w) continue;
      const d = Math.abs(y - b.y);
      if (d < dist) { dist = d; best = b; }
    }
    return best;
  }

  function setTip(x, y, zone) {
    if (!view.box || !view.meta) { state.tip = null; return; }
    const band = hitAt(x, y);
    state.tip = {
      x, y, zone,
      price: priceAt(y),
      time: timeAt(view.meta.bars, indexAt(x)),
      band: band && !band.rail ? band : null,
    };
  }

  function applyDrag(x, y) {
    const b = view.box;
    if (!b || !drag) return;
    const dx = x - drag.x, dy = y - drag.y;
    if (drag.zone === "price") {
      const mid = (drag.lo + drag.hi) / 2;
      let span = (drag.hi - drag.lo) * Math.exp(dy * .0065);
      cam.lo = mid - span / 2;
      cam.hi = mid + span / 2;
    } else if (drag.zone === "time") {
      const mid = (drag.i0 + drag.i1) / 2;
      let span = (drag.i1 - drag.i0) * Math.exp(dx * .005);
      cam.i0 = mid - span / 2;
      cam.i1 = cam.i0 + span;
    } else {
      const iSpan = drag.i1 - drag.i0;
      const pSpan = drag.hi - drag.lo;
      cam.i0 = drag.i0 - dx / (b.candleW || b.plotW) * iSpan;
      cam.i1 = cam.i0 + iSpan;
      cam.lo = drag.lo + dy / b.plotH * pSpan;
      cam.hi = cam.lo + pSpan;
    }
    cam.moved = true;
    if (view.meta) clampCam(view.meta.n, view.meta.px);
  }

  function onMove(e) {
    const p = local(e);
    if (!p) return;
    if (drag) {
      if (Math.abs(p.x - drag.x) + Math.abs(p.y - drag.y) > 3) drag.did = true;
      applyDrag(p.x, p.y);
      if (drag.zone === "plot") setTip(p.x, p.y, "plot");
      p.c.style.cursor = "grabbing";
      draw();
      return;
    }
    const zone = zoneAt(p.x, p.y);
    const hit = hitAt(p.x, p.y);
    p.c.style.cursor = zone === "price" ? "ns-resize"
      : zone === "time" ? "ew-resize"
      : inside(view.reset, p) || hit ? "pointer"
      : "crosshair";
    if (zone === "plot") setTip(p.x, p.y, "plot");
    else if (state.tip) state.tip = null;
    else return;
    draw();
  }

  function onDown(e) {
    if (e.button != null && e.button !== 0) return;
    const p = local(e);
    if (!p || !view.box) return;
    const zone = zoneAt(p.x, p.y);
    if (zone === "rail" || zone === "out" || inside(view.reset, p)) return;
    drag = { x: p.x, y: p.y, i0: cam.i0, i1: cam.i1, lo: cam.lo, hi: cam.hi, zone, did: false };
    try { p.c.setPointerCapture(e.pointerId); } catch {}
  }

  function onUp() {
    if (drag?.did) suppressClick = true;
    drag = null;
  }

  function onClick(e) {
    if (suppressClick) { suppressClick = false; return; }
    const p = local(e);
    if (!p) return;
    if (inside(view.reset, p)) { cam.moved = false; state.tip = null; draw(); return; }
    const hit = hitAt(p.x, p.y);
    if (!hit) { state.pin = null; draw(); return; }
    const same = state.pin && Math.abs(state.pin - hit.price) < 1e-6;
    state.pin = same ? null : hit.price;
    if (!same && view.meta && (hit.price < cam.lo || hit.price > cam.hi)) {
      const span = Math.max(cam.hi - cam.lo, view.meta.px * .02);
      cam.lo = hit.price - span * .5;
      cam.hi = hit.price + span * .5;
      cam.moved = true;
      clampCam(view.meta.n, view.meta.px);
    }
    draw();
  }

  function onWheel(e) {
    const p = local(e);
    if (!p || !view.box || !view.meta) return;
    e.preventDefault();
    const b = view.box;
    if (Math.abs(e.deltaX || 0) > Math.abs(e.deltaY || 0) + 2) {
      const iSpan = cam.i1 - cam.i0;
      cam.i0 += e.deltaX / (b.candleW || b.plotW) * iSpan;
      cam.i1 = cam.i0 + iSpan;
      cam.moved = true;
      clampCam(view.meta.n, view.meta.px);
      draw();
      return;
    }
    let dy = e.deltaY || 0;
    if (e.deltaMode === 1) dy *= 16;
    else if (e.deltaMode === 2) dy *= 320;
    const factor = Math.exp(Math.max(-.45, Math.min(.45, dy * .00115)));
    const zone = zoneAt(p.x, p.y);
    if (zone === "price" || e.shiftKey) zoomPrice(p.y, factor);
    else if (zone === "time") zoomTime(p.x, factor);
    else { zoomTime(p.x, factor); zoomPrice(p.y, factor); }
    cam.moved = true;
    clampCam(view.meta.n, view.meta.px);
    if (zone === "plot") setTip(p.x, p.y, "plot");
    draw();
  }

  function onDbl() {
    cam.moved = false;
    state.tip = null;
    draw();
  }

  function bind() {
    const c = document.getElementById("liqmap");
    if (!c || c.dataset.bound) return !!c;
    c.dataset.bound = "1";
    c.style.touchAction = "none";
    c.addEventListener("pointerdown", onDown);
    c.addEventListener("pointermove", onMove);
    c.addEventListener("pointerup", onUp);
    c.addEventListener("pointercancel", onUp);
    c.addEventListener("pointerleave", () => { if (!drag && state.tip) { state.tip = null; draw(); } });
    c.addEventListener("click", onClick);
    c.addEventListener("dblclick", onDbl);
    c.addEventListener("wheel", onWheel, { passive: false });
    if (window.ResizeObserver) new window.ResizeObserver(() => draw()).observe(c);
    return true;
  }

  window.totumLiq = draw;
  addEventListener("resize", draw);
  setInterval(() => { bind(); if (!drag) draw(); }, 2000);
  bind();
})();
