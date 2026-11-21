/* Мини-приложение Telegram. На обычном сайте ничего не меняет. */
(function () {
  var tg = window.Telegram && window.Telegram.WebApp;
  if (!tg) return;
  var native = !!(window.TelegramWebviewProxy || window.TelegramWebviewProxyProto || window.TelegramWebview);
  var inside = native || !!tg.initData || (tg.platform && tg.platform !== "unknown");
  if (!inside) return;

  var root = document.documentElement;
  root.classList.add("tg-app");
  var path = location.pathname;
  if (path === "/" || path === "/index.html") {
    try { history.replaceState(null, "", "/trade" + location.search + location.hash); } catch (e) {}
  }

  try { tg.ready(); } catch (e) {}
  try { tg.expand(); } catch (e) {}
  try { tg.disableVerticalSwipes && tg.disableVerticalSwipes(); } catch (e) {}

  function paint() {
    var dark = root.getAttribute("data-theme") === "dark";
    var bg = dark ? "#07080b" : "#eef2f7";
    var bar = dark ? "#0e1116" : "#ffffff";
    try { tg.setHeaderColor(bg); } catch (e) {}
    try { tg.setBackgroundColor(bg); } catch (e) {}
    try { tg.setBottomBarColor && tg.setBottomBarColor(bar); } catch (e) {}
  }
  function insets() {
    var s = tg.safeAreaInset || {};
    var c = tg.contentSafeAreaInset || {};
    var full = false;
    try { full = !!tg.isFullscreen; } catch (e) {}
    root.classList.toggle("tg-full", full);
    var top = full ? (Number(s.top) || 0) + (Number(c.top) || 0) : (Number(s.top) || 0);
    var bottom = full ? (Number(s.bottom) || 0) + (Number(c.bottom) || 0) : (Number(s.bottom) || 0);
    root.style.setProperty("--tg-top", top + "px");
    root.style.setProperty("--tg-bottom", bottom + "px");
  }
  ["safeAreaChanged", "contentSafeAreaChanged", "viewportChanged", "fullscreenChanged"].forEach(function (ev) {
    try { tg.onEvent(ev, function () {
      try { if (tg.isFullscreen && tg.exitFullscreen) tg.exitFullscreen(); } catch (e) {}
      insets();
    }); } catch (e) {}
  });
  try {
    if (tg.exitFullscreen) {
      var left = tg.exitFullscreen();
      if (left && left.catch) left.catch(function () {});
    }
  } catch (e) {}
  paint();
  insets();
  [80, 300].forEach(function (ms) { setTimeout(insets, ms); });
  try {
    new MutationObserver(paint).observe(root, { attributes: true, attributeFilter: ["data-theme"] });
  } catch (e) {}

  if (tg.BackButton) {
    function syncBack() {
      var open = document.querySelector("dialog[open]");
      try { open ? tg.BackButton.show() : tg.BackButton.hide(); } catch (e) {}
    }
    try {
      tg.BackButton.onClick(function () {
        var open = document.querySelector("dialog[open]");
        if (open) open.close();
      });
    } catch (e) {}
    try {
      new MutationObserver(syncBack).observe(document.body, { subtree: true, attributes: true, attributeFilter: ["open"] });
    } catch (e) {}
  }

  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("#mnav button");
    if (b && tg.HapticFeedback) {
      try { tg.HapticFeedback.selectionChanged(); } catch (err) {}
    }
  }, true);

  window.totumTg = { on: true };
})();
