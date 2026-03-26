/**
 * ============================================================
 *  PTT Station Map — Oil Price Manager
 *  Fetches live oil prices and displays a sleek floating widget.
 *  Modern Tailwind CSS design with glassmorphism.
 *  API: https://apioilprice.orsptt.space/api/oil-prices
 *  Depends on: config.js
 * ============================================================
 */
var OilPriceManager = (function () {
  "use strict";

  var API_URL = "https://apioilprice.orsptt.space/api/oil-prices";
  var PROXY_URL = "/api/oil-prices";
  var REFRESH_INTERVAL = 10 * 1000;
  var refreshTimer = null;
  var widgetEl = null;
  var isCollapsed = false;
  var cssInjected = false;

  // Fuel display config
  var FUEL_CONFIG = {
    "ULR 91": { color: "#EF4444", gradient: "linear-gradient(135deg,#FF6B6B,#DC2626)", icon: "fa-gas-pump", label: "សាំង ធម្មតា", labelEn: "ULR 91" },
    "ULG 95": { color: "#22C55E", gradient: "linear-gradient(135deg,#4ADE80,#16A34A)", icon: "fa-gas-pump", label: "សាំង ស៊ុមពែរ", labelEn: "ULG 95" },
    "HSD":    { color: "#3B82F6", gradient: "linear-gradient(135deg,#60A5FA,#2563EB)", icon: "fa-gas-pump", label: "ម៉ាស៊ូត", labelEn: "HSD" },
  };

  // ── CSS ────────────────────────────────────────────────────
  function injectCSS() {
    if (cssInjected) return;
    cssInjected = true;

    var s = document.createElement("style");
    s.textContent =
      /* Widget container */
      "#oil-price-widget{" +
        "position:fixed;top:12px;left:12px;z-index:1100;" +
        "font-family:'Inter',system-ui,-apple-system,sans-serif;" +
        "animation:opw-slide-in .5s cubic-bezier(.22,1,.36,1) both;" +
        "pointer-events:auto;user-select:none;" +
        "width:260px;" +
      "}" +
      "@keyframes opw-slide-in{" +
        "0%{opacity:0;transform:translateY(-20px) scale(.92);}" +
        "100%{opacity:1;transform:translateY(0) scale(1);}" +
      "}" +

      /* Header bar */
      ".opw-header{" +
        "display:flex;align-items:center;gap:8px;" +
        "padding:10px 14px;" +
        "background:linear-gradient(135deg,#1e40af 0%,#1d4ed8 50%,#2563eb 100%);" +
        "border-radius:16px 16px 0 0;cursor:pointer;" +
        "box-shadow:0 2px 12px rgba(30,64,175,.3);" +
        "transition:border-radius .3s;" +
      "}" +
      ".opw-collapsed .opw-header{border-radius:16px;}" +
      ".opw-header-icon{" +
        "width:30px;height:30px;border-radius:10px;" +
        "background:rgba(255,255,255,.15);display:flex;" +
        "align-items:center;justify-content:center;" +
        "font-size:13px;color:#FCD34D;" +
      "}" +
      ".opw-header-title{" +
        "flex:1;color:#fff;font-size:13px;font-weight:700;letter-spacing:.3px;" +
      "}" +
      ".opw-header-toggle{" +
        "color:rgba(255,255,255,.7);font-size:11px;" +
        "transition:transform .3s;" +
      "}" +
      ".opw-collapsed .opw-header-toggle{transform:rotate(180deg);}" +
      ".opw-live-dot{" +
        "width:7px;height:7px;border-radius:50%;background:#4ADE80;" +
        "box-shadow:0 0 6px rgba(74,222,128,.5);" +
        "animation:opw-blink 2s ease-in-out infinite;" +
      "}" +
      "@keyframes opw-blink{0%,100%{opacity:1;}50%{opacity:.3;}}" +

      /* Price body */
      ".opw-body{" +
        "overflow:hidden;max-height:320px;" +
        "transition:max-height .4s cubic-bezier(.4,0,.2,1),opacity .3s;" +
        "opacity:1;" +
        "background:rgba(255,255,255,.92);" +
        "backdrop-filter:blur(16px);" +
        "border-radius:0 0 16px 16px;" +
        "box-shadow:0 8px 32px rgba(0,0,0,.1);" +
      "}" +
      ".opw-collapsed .opw-body{max-height:0;opacity:0;}" +

      /* Individual fuel row */
      ".opw-fuel{" +
        "display:flex;align-items:center;gap:10px;" +
        "padding:10px 14px;" +
        "border-bottom:1px solid rgba(0,0,0,.04);" +
        "transition:background .2s;" +
      "}" +
      ".opw-fuel:last-child{border-bottom:none;}" +
      ".opw-fuel:hover{background:rgba(59,130,246,.04);}" +

      /* Fuel color badge */
      ".opw-fuel-badge{" +
        "width:38px;height:38px;border-radius:12px;" +
        "display:flex;align-items:center;justify-content:center;" +
        "color:#fff;font-size:14px;flex-shrink:0;" +
        "box-shadow:0 2px 8px rgba(0,0,0,.12);" +
      "}" +

      /* Fuel name & prices */
      ".opw-fuel-info{flex:1;min-width:0;}" +
      ".opw-fuel-name{" +
        "font-size:11px;font-weight:700;color:#334155;letter-spacing:.2px;" +
      "}" +
      ".opw-fuel-name-kh{" +
        "font-size:10px;color:#94a3b8;font-weight:500;" +
      "}" +
      ".opw-fuel-prices{display:flex;gap:10px;margin-top:3px;}" +
      ".opw-price{" +
        "font-size:13px;font-weight:700;display:flex;align-items:center;gap:2px;" +
      "}" +
      ".opw-price-dollar{color:#1e40af;}" +
      ".opw-price-riel{color:#c2410c;}" +
      ".opw-currency{font-size:9px;font-weight:500;opacity:.6;}" +

      /* Footer */
      ".opw-footer{" +
        "padding:6px 14px;background:rgba(241,245,249,.8);" +
        "border-radius:0 0 16px 16px;" +
        "display:flex;align-items:center;justify-content:space-between;" +
        "font-size:10px;color:#94a3b8;" +
      "}" +

      /* Loading state */
      ".opw-loading{" +
        "padding:24px;text-align:center;color:#94a3b8;font-size:12px;" +
      "}" +
      ".opw-loading i{margin-right:6px;}" +

      /* Error state */
      ".opw-error{" +
        "padding:16px;text-align:center;color:#ef4444;font-size:11px;" +
      "}" +
      ".opw-error i{margin-right:4px;}" +

      /* Responsive */
      "@media(max-width:480px){" +
        "#oil-price-widget{top:8px;left:8px;right:auto;width:220px;}" +
        ".opw-header{padding:8px 12px;}" +
        ".opw-fuel{padding:8px 12px;gap:8px;}" +
        ".opw-fuel-badge{width:34px;height:34px;font-size:12px;border-radius:10px;}" +
      "}";

    document.head.appendChild(s);
  }

  // ── Build widget DOM ──────────────────────────────────────
  function createWidget() {
    if (widgetEl) return;

    widgetEl = document.createElement("div");
    widgetEl.id = "oil-price-widget";
    widgetEl.innerHTML =
      '<div class="opw-header" id="opw-header">' +
        '<div class="opw-header-icon"><i class="fas fa-gas-pump"></i></div>' +
        '<div class="opw-header-title">⛽ Oil Prices Today</div>' +
        '<div class="opw-live-dot"></div>' +
        '<div class="opw-header-toggle"><i class="fas fa-chevron-up"></i></div>' +
      '</div>' +
      '<div class="opw-body" id="opw-body">' +
        '<div class="opw-loading"><i class="fas fa-spinner fa-spin"></i>Loading prices…</div>' +
      '</div>';

    document.body.appendChild(widgetEl);

    // Toggle collapse
    document.getElementById("opw-header").addEventListener("click", function () {
      isCollapsed = !isCollapsed;
      widgetEl.classList.toggle("opw-collapsed", isCollapsed);
    });
  }

  // ── Render prices ─────────────────────────────────────────
  function renderPrices(data) {
    var body = document.getElementById("opw-body");
    if (!body) return;

    var prices = data.prices || {};
    var updatedAt = data.updated_at || "";

    var timeStr = "";
    if (updatedAt) {
      try {
        var d = new Date(updatedAt);
        timeStr = d.toLocaleDateString("en-US", {
          day: "numeric", month: "short", year: "numeric",
          hour: "2-digit", minute: "2-digit", hour12: true,
          timeZone: "Asia/Phnom_Penh"
        });
      } catch (e) {
        timeStr = updatedAt;
      }
    }

    var html = "";

    var fuelOrder = ["ULR 91", "ULG 95", "HSD"];
    fuelOrder.forEach(function (key) {
      var p = prices[key];
      if (!p) return;
      var cfg = FUEL_CONFIG[key] || { color: "#666", gradient: "linear-gradient(135deg,#999,#666)", icon: "fa-gas-pump", label: key, labelEn: key };

      html +=
        '<div class="opw-fuel">' +
          '<div class="opw-fuel-badge" style="background:' + cfg.gradient + ';">' +
            '<i class="fas ' + cfg.icon + '"></i>' +
          '</div>' +
          '<div class="opw-fuel-info">' +
            '<div class="opw-fuel-name">' + cfg.labelEn + '</div>' +
            '<div class="opw-fuel-name-kh">' + cfg.label + '</div>' +
            '<div class="opw-fuel-prices">' +
              '<span class="opw-price opw-price-dollar">' +
                '$' + Number(p.dollar).toFixed(2) +
                '<span class="opw-currency">USD</span>' +
              '</span>' +
              '<span class="opw-price opw-price-riel">' +
                '៛' + Number(p.riel).toLocaleString() +
                '<span class="opw-currency">KHR</span>' +
              '</span>' +
            '</div>' +
          '</div>' +
        '</div>';
    });

    html +=
      '<div class="opw-footer">' +
        '<span><i class="fas fa-clock"></i> ' + (timeStr || "—") + '</span>' +
      '</div>';

    body.innerHTML = html;
  }

  function renderError() {
    var body = document.getElementById("opw-body");
    if (!body) return;
    body.innerHTML =
      '<div class="opw-error">' +
        '<i class="fas fa-exclamation-triangle"></i> Unable to load prices' +
      '</div>';
  }

  // ── Fetch data ────────────────────────────────────────────
  function fetchFromUrl(url) {
    return fetch(url)
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      });
  }

  function fetchPrices() {
    return fetchFromUrl(PROXY_URL)
      .catch(function () {
        return fetchFromUrl(API_URL);
      })
      .then(function (json) {
        if (json.success && json.data) {
          renderPrices(json.data);
        } else {
          renderError();
        }
      })
      .catch(function (err) {
        console.error("Oil price fetch error:", err);
        renderError();
      });
  }

  // ── Public ────────────────────────────────────────────────
  function init() {
    injectCSS();
    createWidget();
    fetchPrices();

    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(fetchPrices, REFRESH_INTERVAL);
  }

  return {
    init: init,
    refresh: fetchPrices,
  };
})();
