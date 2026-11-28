/* Компьютер: меню шапки, адрес и живые списки пар. На телефоне молчит. */
(function () {
  var nav = document.getElementById("xnav");
  if (!nav) return;

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

  new MutationObserver(function () {
    mark();
    syncUrl(document.body.dataset.app);
    var app = document.body.dataset.app;
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
    return "";
  }
  function px(n) {
    n = Number(n) || 0;
    if (!n) return "—";
    var d = n >= 1000 ? 1 : n >= 1 ? 2 : 4;
    return n.toLocaleString("ru-RU", { maximumFractionDigits: d });
  }
  var tradfi = { stocks: 1, stock: 1, equity: 1, equities: 1, indices: 1, index: 1, commodities: 1, commodity: 1, fx: 1, preipo: 1, rates: 1, rwa: 1, bonds: 1 };

  function pack(list, ctx, cats) {
    return (list || []).map(function (m) {
      var name = m && m.name;
      if (!name) return null;
      var c = (ctx && ctx[name]) || {};
      var mid = Number(c.midPx || c.markPx || 0);
      var prev = Number(c.prevDayPx || 0);
      return {
        name: name,
        mid: mid,
        ch: prev ? mid / prev - 1 : 0,
        vol: Number(c.dayNtlVlm || 0),
        tradfi: !!tradfi[String((cats && cats[name]) || "").toLowerCase()]
      };
    }).filter(function (x) { return x && x.mid > 0; }).sort(function (a, b) { return b.vol - a.vol; });
  }

  function row(x, spot) {
    var attr = spot ? "data-go-spot" : "data-go";
    var ch = x.ch ? '<em class="' + (x.ch >= 0 ? "pos" : "neg") + '">' + (x.ch >= 0 ? "+" : "−") + Math.abs(x.ch * 100).toFixed(2) + "%</em>" : "";
    var v = vol(x.vol);
    return '<button type="button" class="xn-row" ' + attr + '="' + esc(x.name) + '"' + (v ? ' title="' + esc(v) + '"' : "") + "><b>" + esc(x.name) + "</b><span>" + px(x.mid) + "</span>" + ch + "</button>";
  }

  function fill() {
    var test = window.TERM_CONFIG && window.TERM_CONFIG.isTestnet;
    var raw;
    try { raw = JSON.parse(localStorage.getItem("totum.mkts.v2." + (test ? "t" : "m")) || "null"); } catch (e) { raw = null; }
    if (!raw || !raw.meta || !raw.meta.length) return false;
    var perps = pack(raw.meta, raw.ctx || {}, raw.cats);
    var spots = pack(raw.spot, raw.ctx || {}, raw.cats);
    var boxP = document.getElementById("xnPerps");
    var boxS = document.getElementById("xnSpot");
    var boxT = document.getElementById("xnTradfi");
    var mains = perps.filter(function (x) { return !x.tradfi; }).slice(0, 8);
    if (boxP && mains.length) boxP.innerHTML = mains.map(function (x) { return row(x, false); }).join("");
    if (boxS) boxS.innerHTML = spots.slice(0, 6).map(function (x) { return row(x, true); }).join("") || '<p class="xn-note">Список появится вместе с рынками.</p>';
    if (boxT) {
      var tf = perps.filter(function (x) { return x.tradfi; }).slice(0, 6);
      boxT.innerHTML = tf.length ? tf.map(function (x) { return row(x, false); }).join("") : '<p class="xn-note">Акции, золото и индексы — в общем списке рынков.</p>';
    }
    return true;
  }

  mark();
  addEventListener("totum-ready", fill);
  var tries = 0;
  var timer = setInterval(function () {
    tries++;
    if (fill() || tries > 40) clearInterval(timer);
  }, 400);
  setInterval(fill, 20000);
})();
