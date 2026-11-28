/* Компьютер: меню шапки, обзор рынков и адрес. На телефоне молчит. */
(function () {
  var nav = document.getElementById("xnav");
  var board = document.getElementById("deskBoard");
  if (!nav || !board) return;

  function wide() { return matchMedia("(min-width:901px)").matches; }

  function mark() {
    var app = document.body.dataset.app || "";
    nav.querySelectorAll(".xn").forEach(function (n) {
      n.classList.toggle("on", n.dataset.xn === app);
    });
  }

  function syncUrl(app) {
    if (!wide() || !app) return;
    var trade = app === "futures" || app === "trade";
    var isTrade = /\/trade\/?$/.test(location.pathname);
    if (trade && !isTrade) history.pushState({ totum: app }, "", "/trade");
    else if (!trade && isTrade) history.pushState({ totum: app }, "", "/");
  }

  function go(name) {
    var btn = document.querySelector('#mnav [data-app="' + name + '"]');
    if (btn) btn.click();
  }

  function openTool(name) {
    if (document.body.dataset.app !== "futures") go("futures");
    setTimeout(function () {
      var card = document.querySelector('#landing [data-ln-tool="' + name + '"]');
      if (card) card.click();
    }, 60);
  }

  nav.addEventListener("click", function (e) {
    var desk = e.target.closest("[data-desk]");
    if (desk && nav.contains(desk)) {
      if (desk.dataset.desk === "positions") {
        go("futures");
        setTimeout(function () {
          var b = document.querySelector(".bottom");
          if (b) b.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 80);
      } else go(desk.dataset.desk);
    }
    var tool = e.target.closest("[data-tool]");
    if (tool && nav.contains(tool)) openTool(tool.dataset.tool);
    var item = e.target.closest(".xn-pop button");
    if (item) {
      var xn = item.closest(".xn");
      if (xn) xn.classList.add("shut");
    }
  });

  nav.addEventListener("mouseout", function (e) {
    var xn = e.target.closest && e.target.closest(".xn");
    if (!xn || xn.contains(e.relatedTarget)) return;
    xn.classList.remove("shut");
  });

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return "&#" + c.charCodeAt(0) + ";";
    });
  }
  function vol(n) {
    n = Number(n) || 0;
    if (n >= 1e9) return (n / 1e9).toFixed(1).replace(".", ",") + " млрд";
    if (n >= 1e6) return (n / 1e6).toFixed(1).replace(".", ",") + " млн";
    if (n >= 1e3) return Math.round(n / 1e3) + " тыс";
    return n ? String(Math.round(n)) : "";
  }
  function px(n) {
    n = Number(n) || 0;
    if (!n) return "—";
    var d = n >= 1000 ? 1 : n >= 1 ? 2 : n >= 0.01 ? 4 : 6;
    return n.toLocaleString("ru-RU", { maximumFractionDigits: d });
  }
  function hue(s) {
    var h = 0;
    s = String(s || "");
    for (var i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) >>> 0;
    return h % 360;
  }
  function letter(s) {
    s = String(s || "").replace(/[^A-Za-z0-9]/g, "");
    return (s.slice(0, 1) || "?").toUpperCase();
  }
  var tradfi = { stocks: 1, stock: 1, equity: 1, equities: 1, indices: 1, index: 1, commodities: 1, commodity: 1, fx: 1, preipo: 1, rates: 1, rwa: 1, bonds: 1, tradfi: 1 };

  function isTradfi(m, cats) {
    var raw = String((cats && m && cats[m.name]) || (m && (m.cat || m.group)) || "").toLowerCase();
    return !!tradfi[raw];
  }

  function pack(list, ctx, cats, spot) {
    return (list || []).map(function (m) {
      var name = m && m.name;
      if (!name) return null;
      var c = (ctx && ctx[name]) || {};
      var mid = Number(c.midPx || c.markPx || 0);
      var prev = Number(c.prevDayPx || 0);
      var cut = name.indexOf(":");
      var base = spot ? (m.base || name) : (cut >= 0 ? name.slice(cut + 1) : name);
      return {
        name: name,
        label: spot ? (m.label || name) : (cut >= 0 ? name.slice(cut + 1) : name),
        base: base,
        dex: !spot && cut >= 0 ? name.slice(0, cut) : "",
        quote: spot ? (m.quote || "USDC") : "USDC",
        mid: mid,
        ch: prev ? mid / prev - 1 : 0,
        vol: Number(c.dayNtlVlm || 0),
        fund: c.funding == null || c.spot ? null : Number(c.funding),
        tradfi: isTradfi(m, cats),
        spot: !!spot
      };
    }).filter(function (x) { return x && x.mid > 0; }).sort(function (a, b) { return b.vol - a.vol; });
  }

  function row(x, spot) {
    var attr = spot ? "data-go-spot" : "data-go";
    var ch = x.ch ? '<em class="' + (x.ch >= 0 ? "pos" : "neg") + '">' + (x.ch >= 0 ? "+" : "−") + Math.abs(x.ch * 100).toFixed(2) + "%</em>" : "";
    var v = vol(x.vol);
    return '<button type="button" class="xn-row" ' + attr + '="' + esc(x.name) + '"' + (v ? ' title="' + esc(v) + '"' : "") + "><b>" + esc(x.label || x.name) + "</b><span>" + px(x.mid) + "</span>" + ch + "</button>";
  }

  var seen = "";
  var cached = null;
  function load() {
    var test = window.TERM_CONFIG && window.TERM_CONFIG.isTestnet;
    var text = "";
    try { text = localStorage.getItem("totum.mkts.v2." + (test ? "t" : "m")) || ""; } catch (e) { text = ""; }
    if (!text) { seen = ""; cached = null; return null; }
    if (text === seen && cached) return cached;
    var raw;
    try { raw = JSON.parse(text); } catch (e) { return null; }
    if (!raw || !raw.meta || !raw.meta.length) return null;
    seen = text;
    cached = {
      perps: pack(raw.meta, raw.ctx || {}, raw.cats, false),
      spots: pack(raw.spot, raw.ctx || {}, raw.cats, true)
    };
    return cached;
  }

  function fill() {
    var data = load();
    if (!data) return false;
    var boxP = document.getElementById("xnPerps");
    var boxS = document.getElementById("xnSpot");
    var boxT = document.getElementById("xnTradfi");
    var mains = data.perps.filter(function (x) { return !x.tradfi; }).slice(0, 8);
    if (boxP && mains.length) boxP.innerHTML = mains.map(function (x) { return row(x, false); }).join("");
    if (boxS) boxS.innerHTML = data.spots.slice(0, 6).map(function (x) { return row(x, true); }).join("") || '<p class="xn-note">Список появится вместе с рынками.</p>';
    if (boxT) {
      var tf = data.perps.filter(function (x) { return x.tradfi; }).slice(0, 6);
      boxT.innerHTML = tf.length ? tf.map(function (x) { return row(x, false); }).join("") : '<p class="xn-note">Акции, золото и индексы — в общем списке рынков.</p>';
    }
    return true;
  }

  var view = { tab: "perp", q: "" };
  var bodyEl = document.getElementById("dbBody");
  var tableEl = document.getElementById("dbTable");

  function textOf(id) {
    var n = document.getElementById(id);
    return n ? (n.textContent || "").trim() : "";
  }
  function put(id, value) {
    var n = document.getElementById(id);
    if (n && n.textContent !== value) n.textContent = value;
  }
  function paintAcc() {
    var on = document.body.classList.contains("connected");
    var eq = textOf("accValue") || "—";
    var av = textOf("avail") || "—";
    var pos = textOf("cntPos").replace(/[()]/g, "") || "0";
    put("dbEq", eq);
    put("dbAvail", av);
    put("dbPos", pos);
    put("dbEq2", eq);
    put("dbAvail2", av);
    put("dbPos2", pos);
    var note = document.getElementById("dbNote");
    if (note) note.textContent = on
      ? "Деньги на вашем кошельке, не на счёте Totum."
      : "Подключите кошелёк, чтобы видеть счёт. Деньги остаются у вас.";
    var c = document.getElementById("dbConnect");
    if (c) c.hidden = on;
    ["dbDep", "dbWd", "dbTrade"].forEach(function (id) {
      var n = document.getElementById(id);
      if (n) n.hidden = !on;
    });
  }

  function rowsFor() {
    var data = load();
    if (!data) return null;
    var list = view.tab === "spot" ? data.spots.slice()
      : view.tab === "tradfi" ? data.perps.filter(function (x) { return x.tradfi; })
      : view.tab === "gain" || view.tab === "loss" ? data.perps.slice()
      : data.perps.filter(function (x) { return !x.tradfi; });
    if (view.tab === "gain") list.sort(function (a, b) { return b.ch - a.ch; });
    if (view.tab === "loss") list.sort(function (a, b) { return a.ch - b.ch; });
    var q = view.q.trim().toLowerCase();
    if (q) list = list.filter(function (x) {
      return (x.label + " " + x.name + " " + x.base).toLowerCase().indexOf(q) >= 0;
    });
    return list.slice(0, 60);
  }

  function chTxt(n) {
    return (n >= 0 ? "+" : "−") + Math.abs(n * 100).toFixed(2) + "%";
  }
  function fundTxt(x) {
    if (x.spot || x.fund == null || !isFinite(x.fund)) return "—";
    var n = x.fund * 100;
    return (n >= 0 ? "+" : "−") + Math.abs(n).toFixed(4) + "%";
  }
  function icon(base) {
    return "https://app.hyperliquid.xyz/coins/" + encodeURIComponent(base) + ".svg";
  }

  function paintTable() {
    if (!bodyEl) return;
    board.querySelectorAll("[data-db]").forEach(function (b) {
      b.classList.toggle("on", b.dataset.db === view.tab);
    });
    if (tableEl) tableEl.classList.toggle("spot", view.tab === "spot");
    var list = rowsFor();
    var count = document.getElementById("dbCount");
    if (!list) {
      if (count) count.textContent = "";
      bodyEl.innerHTML = '<tr><td class="db-empty" colspan="6">Загружаем рынки…</td></tr>';
      return;
    }
    if (count) count.textContent = list.length ? list.length + (list.length === 60 ? "+" : "") : "";
    if (!list.length) {
      bodyEl.innerHTML = '<tr><td class="db-empty" colspan="6">Ничего не найдено</td></tr>';
      return;
    }
    bodyEl.innerHTML = list.map(function (x) {
      var attr = x.spot ? "data-go-spot" : "data-go";
      var fundCls = x.fund == null ? "" : x.fund >= 0 ? " pos" : " neg";
      return '<tr tabindex="0" ' + attr + '="' + esc(x.name) + '">' +
        '<td><div class="db-pair"><span class="coin-ic db-ic" style="--h:' + hue(x.base) + '" data-letter="' + esc(letter(x.base)) + '"><img alt="" src="' + icon(x.base) + '"></span><b>' + esc(x.label) + '</b>' +
        (x.dex ? '<small>' + esc(x.dex) + '</small>' : '<small>' + esc(x.quote) + '</small>') +
        '</div></td>' +
        '<td>' + px(x.mid) + '</td>' +
        '<td class="' + (x.ch >= 0 ? "pos" : "neg") + '">' + chTxt(x.ch) + '</td>' +
        '<td>' + (vol(x.vol) || "—") + '</td>' +
        '<td class="db-fund' + fundCls + '">' + fundTxt(x) + '</td>' +
        '<td class="db-go">Торговать</td></tr>';
    }).join("");
  }

  function syncBoard() {
    var app = document.body.dataset.app || "";
    var show = wide() && (app === "home" || app === "markets" || app === "assets");
    board.hidden = !show;
    if (!show) return;
    paintAcc();
    if (app !== "assets") paintTable();
  }

  board.addEventListener("click", function (e) {
    var connect = e.target.closest("#dbConnect");
    if (connect) {
      var btn = document.getElementById("btnConnect");
      if (btn) btn.click();
      return;
    }
    var tool = e.target.closest("[data-tool]");
    if (tool && board.contains(tool)) { openTool(tool.dataset.tool); return; }
    var desk = e.target.closest("[data-desk]");
    if (desk && board.contains(desk)) { go(desk.dataset.desk); return; }
    var tab = e.target.closest("[data-db]");
    if (tab && board.contains(tab)) {
      view.tab = tab.dataset.db;
      paintTable();
    }
  });
  board.addEventListener("keydown", function (e) {
    if (e.key !== "Enter" && e.key !== " ") return;
    var row = e.target.closest("tr[data-go], tr[data-go-spot]");
    if (!row || !board.contains(row)) return;
    e.preventDefault();
    row.click();
  });
  board.addEventListener("error", function (e) {
    if (e.target && e.target.tagName === "IMG") e.target.remove();
  }, true);
  var q = document.getElementById("dbQ");
  if (q) q.addEventListener("input", function () { view.q = q.value; paintTable(); });

  new MutationObserver(function () {
    mark();
    var app = document.body.dataset.app;
    syncUrl(app);
    syncBoard();
    if (wide() && (app === "futures" || app === "trade")) {
      requestAnimationFrame(function () { window.dispatchEvent(new Event("resize")); });
    }
  }).observe(document.body, { attributes: true, attributeFilter: ["data-app"] });

  addEventListener("popstate", function () {
    if (!wide()) return;
    var trade = /\/trade\/?$/.test(location.pathname) || location.hash === "#trade";
    var want = trade ? "futures" : "home";
    if (document.body.dataset.app !== want) go(want);
  });

  var acc = document.getElementById("accValue");
  if (acc) new MutationObserver(paintAcc).observe(acc, { childList: true, characterData: true, subtree: true });
  var avail = document.getElementById("avail");
  if (avail) new MutationObserver(paintAcc).observe(avail, { childList: true, characterData: true, subtree: true });
  new MutationObserver(function () { if (!board.hidden) paintAcc(); }).observe(document.body, { attributes: true, attributeFilter: ["class"] });

  mark();
  syncBoard();
  addEventListener("totum-ready", function () { fill(); syncBoard(); });
  var tries = 0;
  var timer = setInterval(function () {
    tries++;
    var ok = fill();
    if (!board.hidden) paintTable();
    if (ok || tries > 40) clearInterval(timer);
  }, 400);
  setInterval(function () {
    fill();
    if (!board.hidden && document.body.dataset.app !== "assets") paintTable();
  }, 4000);
  addEventListener("resize", function () { syncBoard(); });
})();
