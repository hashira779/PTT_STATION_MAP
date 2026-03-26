/**
 * ============================================================
 *  PTT Station Map — Oil Price Manager
 *  Fetches live oil prices and displays a sleek floating widget.
 *  API: https://apioilprice.orsptt.space/api/oil-prices
 *  Depends on: config.js
 * ============================================================
 */
var OilPriceManager = (function () {
  "use strict";

  var API_URL = "https://apioilprice.orsptt.space/api/oil-prices";
  var PROXY_URL = "/api/oil-prices"; // backend proxy (same-origin, no CORS)
  var REFRESH_INTERVAL = 5 * 60 * 1000; // refresh every 5 min
  var refreshTimer = null;
  var widgetEl = null;
  var isCollapsed = false;
  var cssInjected = false;

  // Fuel display config — order, colors, icons
  var FUEL_CONFIG = {
    "ULR 91": { color: "#E53935", gradient: "linear-gradient(135deg,#FF5252,#D32F2F)", icon: "fa-gas-pump", label: "ULR 91" },
    "ULG 95": { color: "#43A047", gradient: "linear-gradient(135deg,#66BB6A,#2E7D32)", icon: "fa-gas-pump", label: "ULG 95" },
    "HSD":    { color: "#1E88E5", gradient: "linear-gradient(135deg,#42A5F5,#1565C0)", icon: "fa-gas-pump", label: "HSD" },
  };

  // ── CSS ────────────────────────────────────────────────────
  function injectCSS() {
    if (cssInjected) return;
    cssInjected = true;

    var s = document.createElement("style");
    s.textContent =
      /* Widget container */
      "#oil-price-widget{" +
        "position:fixed;top:12px;right:12px;z-index:1100;" +
        "font-family:'Segoe UI',system-ui,-apple-system,sans-serif;" +
        "animation:opw-slide-in .5s cubic-bezier(.22,1,.36,1) both;" +
        "pointer-events:auto;user-select:none;" +
      "}" +
      "@keyframes opw-slide-in{" +
        "0%{opacity:0;transform:translateY(-20px) scale(.92);}" +
        "100%{opacity:1;transform:translateY(0) scale(1);}" +
      "}" +

      /* Header bar — always visible */
      ".opw-header{" +
        "display:flex;align-items:center;gap:8px;" +
        "padding:8px 14px;" +
        "background:linear-gradient(135deg,#1a237e 0%,#0d47a1 50%,#01579b 100%);" +
        "border-radius:14px 14px 0 0;cursor:pointer;" +
        "box-shadow:0 2px 12px rgba(0,0,0,.25);" +
        "transition:border-radius .3s;" +
      "}" +
      ".opw-collapsed .opw-header{border-radius:14px;}" +
      ".opw-header-icon{" +
        "width:28px;height:28px;border-radius:50%;" +
        "background:rgba(255,255,255,.15);display:flex;" +
        "align-items:center;justify-content:center;" +
        "font-size:13px;color:#FFD54F;" +
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
        "width:7px;height:7px;border-radius:50%;background:#4CAF50;" +
        "animation:opw-blink 2s ease-in-out infinite;" +
      "}" +
      "@keyframes opw-blink{0%,100%{opacity:1;}50%{opacity:.3;}}" +

      /* Price body */
      ".opw-body{" +
        "overflow:hidden;max-height:300px;" +
        "transition:max-height .4s cubic-bezier(.4,0,.2,1),opacity .3s;" +
        "opacity:1;" +
        "background:#fff;" +
        "border-radius:0 0 14px 14px;" +
        "box-shadow:0 4px 20px rgba(0,0,0,.15);" +
      "}" +
      ".opw-collapsed .opw-body{max-height:0;opacity:0;}" +

      /* Individual fuel row */
      ".opw-fuel{" +
        "display:flex;align-items:center;gap:10px;" +
        "padding:10px 14px;" +
        "border-bottom:1px solid #f0f0f0;" +
        "transition:background .2s;" +
      "}" +
      ".opw-fuel:last-child{border-bottom:none;}" +
      ".opw-fuel:hover{background:#f8f9ff;}" +

      /* Fuel color badge */
      ".opw-fuel-badge{" +
        "width:36px;height:36px;border-radius:10px;" +
        "display:flex;align-items:center;justify-content:center;" +
        "color:#fff;font-size:14px;flex-shrink:0;" +
        "box-shadow:0 2px 6px rgba(0,0,0,.15);" +
      "}" +

      /* Fuel name & prices */
      ".opw-fuel-info{flex:1;min-width:0;}" +
      ".opw-fuel-name{" +
        "font-size:12px;font-weight:700;color:#37474f;letter-spacing:.2px;" +
      "}" +
      ".opw-fuel-prices{display:flex;gap:8px;margin-top:2px;}" +
      ".opw-price{" +
        "font-size:12px;font-weight:600;display:flex;align-items:center;gap:3px;" +
      "}" +
      ".opw-price-dollar{color:#1565C0;}" +
      ".opw-price-riel{color:#E65100;}" +
      ".opw-currency{font-size:10px;font-weight:400;opacity:.7;}" +

      /* Footer — updated info */
      ".opw-footer{" +
        "padding:6px 14px;background:#f5f7ff;" +
        "border-radius:0 0 14px 14px;" +
        "display:flex;align-items:center;justify-content:space-between;" +
        "font-size:10px;color:#78909c;" +
      "}" +

      /* Loading state */
      ".opw-loading{" +
        "padding:20px;text-align:center;color:#90a4ae;font-size:12px;" +
      "}" +
      ".opw-loading i{margin-right:6px;}" +

      /* Error state */
      ".opw-error{" +
        "padding:14px;text-align:center;color:#e53935;font-size:11px;" +
      "}" +
      ".opw-error i{margin-right:4px;}" +

      /* Responsive — smaller on mobile */
      "@media(max-width:480px){" +
        "#oil-price-widget{top:8px;right:8px;left:8px;}" +
        ".opw-header{padding:6px 10px;}" +
        ".opw-fuel{padding:8px 10px;gap:8px;}" +
        ".opw-fuel-badge{width:32px;height:32px;font-size:12px;border-radius:8px;}" +
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
        '<div class="opw-header-title">Oil Prices Today</div>' +
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
    var updatedBy = data.updated_by || "";

    // Format update time
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

    // Render each fuel type in order
    var fuelOrder = ["ULR 91", "ULG 95", "HSD"];
    fuelOrder.forEach(function (key) {
      var p = prices[key];
      if (!p) return;
      var cfg = FUEL_CONFIG[key] || { color: "#666", gradient: "linear-gradient(135deg,#999,#666)", icon: "fa-gas-pump", label: key };

      html +=
        '<div class="opw-fuel">' +
          '<div class="opw-fuel-badge" style="background:' + cfg.gradient + ';">' +
            '<i class="fas ' + cfg.icon + '"></i>' +
          '</div>' +
          '<div class="opw-fuel-info">' +
            '<div class="opw-fuel-name">' + cfg.label + '</div>' +
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

    // Footer
    html +=
      '<div class="opw-footer">' +
        '<span><i class="fas fa-clock"></i> ' + (timeStr || "—") + '</span>'
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
    // Try backend proxy first (same-origin → no CORS), fallback to direct API
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

    // Auto-refresh
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(fetchPrices, REFRESH_INTERVAL);
  }

  return {
    init: init,
    refresh: fetchPrices,
  };
})();

