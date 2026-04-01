/**
 * ============================================================
 *  PTT Station Map — Oil Price Manager
 *  Small floating label on map → opens big modern modal popup.
 *  API: https://apioilprice.orsptt.space/api/oil-prices
 *  Depends on: config.js
 * ============================================================
 */
var OilPriceManager = (function () {
  "use strict";

  var API_URL = "https://apioilprice.orsptt.space/api/oil-prices";
  var VISIBLE_REFRESH_INTERVAL = 10 * 1000;
  var HIDDEN_REFRESH_INTERVAL = 30 * 1000;
  var refreshTimer = null;
  var activeFetchPromise = null;
  var widgetEl = null;
  var modalEl = null;
  var cssInjected = false;
  var lastData = null;
  var lastRenderedSignature = "";

  // Fuel display config
  var FUEL_CONFIG = {
    "ULR 91": { color: "#EF4444", gradient: "linear-gradient(135deg,#FF6B6B,#DC2626)", bg: "rgba(239,68,68,0.06)", icon: "fa-gas-pump", label: "សាំង ធម្មតា", labelEn: "ULR 91", symbol: "91" },
    "ULG 95": { color: "#22C55E", gradient: "linear-gradient(135deg,#4ADE80,#16A34A)", bg: "rgba(34,197,94,0.06)", icon: "fa-gas-pump", label: "សាំង ស៊ុមពែរ", labelEn: "ULG 95", symbol: "95" },
    "HSD":    { color: "#3B82F6", gradient: "linear-gradient(135deg,#60A5FA,#2563EB)", bg: "rgba(59,130,246,0.06)", icon: "fa-gas-pump", label: "ម៉ាស៊ូត", labelEn: "HSD", symbol: "D" },
  };

  // ── CSS ────────────────────────────────────────────────────
  function injectCSS() {
    if (cssInjected) return;
    cssInjected = true;

    var s = document.createElement("style");
    s.textContent =
      /* ─── Floating chip on map — small & sleek ─── */
      "#oil-price-widget{" +
        "position:fixed;top:12px;left:12px;z-index:1100;" +
        "font-family:'Inter',system-ui,-apple-system,sans-serif;" +
        "animation:opw-pop .4s cubic-bezier(.22,1,.36,1) both;" +
        "pointer-events:auto;-webkit-user-select:none;user-select:none;cursor:pointer;" +
      "}" +
      "@keyframes opw-pop{" +
        "0%{opacity:0;transform:translateY(-8px) scale(.9);}" +
        "100%{opacity:1;transform:translateY(0) scale(1);}" +
      "}" +
      ".opw-chip{" +
        "display:flex;align-items:center;gap:6px;" +
        "padding:6px 12px 6px 8px;" +
        "background:rgba(255,255,255,.92);" +
        "backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);" +
        "border-radius:50px;" +
        "box-shadow:0 2px 16px rgba(0,0,0,.10),0 0 0 1px rgba(255,255,255,.6) inset;" +
        "transition:all .25s cubic-bezier(.4,0,.2,1);" +
      "}" +
      ".opw-chip:hover{" +
        "box-shadow:0 4px 24px rgba(59,130,246,.18),0 0 0 1px rgba(59,130,246,.15) inset;" +
        "transform:translateY(-1px);" +
      "}" +
      ".opw-chip:active{transform:scale(.97);}" +
      ".opw-chip-icon{" +
        "width:28px;height:28px;border-radius:50%;" +
        "background:linear-gradient(135deg,#1e40af,#3b82f6);" +
        "display:flex;align-items:center;justify-content:center;" +
        "color:#FCD34D;font-size:11px;flex-shrink:0;" +
        "box-shadow:0 2px 6px rgba(30,64,175,.3);" +
      "}" +
      ".opw-chip-text{" +
        "font-size:11px;font-weight:700;color:#1e293b;" +
        "letter-spacing:.02em;line-height:1.2;" +
      "}" +
      ".opw-chip-sub{" +
        "font-size:8px;font-weight:500;color:#94a3b8;display:block;" +
      "}" +
      ".opw-chip-dot{" +
        "width:6px;height:6px;border-radius:50%;background:#4ADE80;" +
        "box-shadow:0 0 6px rgba(74,222,128,.5);" +
        "animation:opw-blink 2s ease-in-out infinite;flex-shrink:0;" +
      "}" +
      "@keyframes opw-blink{0%,100%{opacity:1;}50%{opacity:.3;}}" +

      /* ─── Big modal popup ─── */
      ".opw-overlay{" +
        "position:fixed;inset:0;z-index:10002;" +
        "background:rgba(15,23,42,.45);backdrop-filter:blur(6px);" +
        "display:flex;align-items:center;justify-content:center;" +
        "opacity:0;visibility:hidden;transition:all .3s cubic-bezier(.4,0,.2,1);" +
        "padding:16px;" +
      "}" +
      ".opw-overlay.opw-open{opacity:1;visibility:visible;}" +
      ".opw-modal{" +
        "width:100%;max-width:380px;" +
        "background:rgba(255,255,255,.97);" +
        "backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);" +
        "border-radius:24px;overflow:hidden;" +
        "box-shadow:0 25px 60px rgba(0,0,0,.18),0 0 0 1px rgba(255,255,255,.5) inset;" +
        "transform:translateY(20px) scale(.95);transition:transform .35s cubic-bezier(.22,1,.36,1);" +
      "}" +
      ".opw-open .opw-modal{transform:translateY(0) scale(1);}" +

      /* Modal header */
      ".opw-modal-header{" +
        "background:linear-gradient(135deg,#1e40af,#2563eb,#3b82f6);" +
        "padding:20px 24px 18px;" +
        "position:relative;overflow:hidden;" +
      "}" +
      ".opw-modal-header::before{" +
        "content:'';position:absolute;top:-50%;right:-30%;width:200px;height:200px;" +
        "background:radial-gradient(circle,rgba(255,255,255,.08) 0%,transparent 70%);" +
        "border-radius:50%;" +
      "}" +
      ".opw-modal-header-top{" +
        "display:flex;align-items:center;justify-content:space-between;position:relative;z-index:1;" +
      "}" +
      ".opw-modal-title-wrap{display:flex;align-items:center;gap:10px;}" +
      ".opw-modal-icon{" +
        "width:36px;height:36px;border-radius:12px;" +
        "background:rgba(255,255,255,.15);" +
        "display:flex;align-items:center;justify-content:center;" +
        "font-size:16px;color:#FCD34D;" +
      "}" +
      ".opw-modal-title{color:#fff;font-size:16px;font-weight:800;letter-spacing:.02em;}" +
      ".opw-modal-subtitle{color:rgba(255,255,255,.65);font-size:10px;font-weight:500;margin-top:1px;}" +
      ".opw-modal-close{" +
        "width:32px;height:32px;border-radius:50%;border:none;" +
        "background:rgba(255,255,255,.12);color:rgba(255,255,255,.8);" +
        "display:flex;align-items:center;justify-content:center;" +
        "font-size:14px;cursor:pointer;transition:all .2s;flex-shrink:0;" +
      "}" +
      ".opw-modal-close:hover{background:rgba(255,255,255,.25);color:#fff;transform:scale(1.08);}" +

      /* Modal body — fuel cards */
      ".opw-modal-body{padding:16px 20px 8px;}" +
      ".opw-fuel-card{" +
        "display:flex;align-items:center;gap:14px;" +
        "padding:14px 16px;margin-bottom:10px;" +
        "border-radius:16px;border:1px solid rgba(0,0,0,.04);" +
        "transition:all .2s;position:relative;overflow:hidden;" +
      "}" +
      ".opw-fuel-card:hover{transform:translateY(-1px);box-shadow:0 4px 16px rgba(0,0,0,.06);}" +
      ".opw-fuel-badge{" +
        "width:44px;height:44px;border-radius:14px;" +
        "display:flex;align-items:center;justify-content:center;" +
        "color:#fff;font-size:16px;flex-shrink:0;" +
        "box-shadow:0 4px 12px rgba(0,0,0,.12);" +
        "position:relative;" +
      "}" +
      ".opw-fuel-badge::after{" +
        "content:'';position:absolute;inset:0;border-radius:14px;" +
        "background:linear-gradient(135deg,rgba(255,255,255,.2),transparent);" +
      "}" +
      ".opw-fuel-info{flex:1;min-width:0;}" +
      ".opw-fuel-name{font-size:13px;font-weight:700;color:#1e293b;letter-spacing:.01em;}" +
      ".opw-fuel-name-kh{font-size:10px;color:#94a3b8;font-weight:500;margin-top:1px;}" +
      ".opw-fuel-prices{display:flex;align-items:baseline;gap:12px;margin-top:6px;}" +
      ".opw-price-tag{display:flex;align-items:baseline;gap:2px;}" +
      ".opw-price-value{font-size:18px;font-weight:800;letter-spacing:-.02em;}" +
      ".opw-price-dollar .opw-price-value{color:#1e40af;}" +
      ".opw-price-riel .opw-price-value{color:#c2410c;}" +
      ".opw-price-currency{font-size:9px;font-weight:600;opacity:.5;margin-left:1px;}" +

      /* Modal footer */
      ".opw-modal-footer{" +
        "padding:10px 20px 16px;" +
        "display:flex;align-items:center;justify-content:center;gap:6px;" +
        "font-size:10px;color:#94a3b8;" +
      "}" +
      ".opw-modal-footer i{font-size:9px;opacity:.6;}" +

      /* Loading / Error */
      ".opw-modal-loading{padding:40px 20px;text-align:center;color:#94a3b8;font-size:13px;}" +
      ".opw-modal-loading i{margin-right:6px;}" +
      ".opw-modal-error{padding:30px 20px;text-align:center;color:#ef4444;font-size:12px;}" +
      ".opw-modal-error i{margin-right:4px;}" +

      /* ─── Responsive ─── */
      "@media(max-width:480px){" +
        "#oil-price-widget{top:8px;left:8px;}" +
        ".opw-chip{padding:5px 10px 5px 6px;gap:5px;}" +
        ".opw-chip-icon{width:24px;height:24px;font-size:10px;}" +
        ".opw-chip-text{font-size:10px;}" +
        ".opw-chip-sub{font-size:7px;}" +
        ".opw-modal{max-width:340px;border-radius:20px;}" +
        ".opw-modal-header{padding:16px 18px 14px;}" +
        ".opw-modal-icon{width:30px;height:30px;font-size:13px;border-radius:10px;}" +
        ".opw-modal-title{font-size:14px;}" +
        ".opw-modal-body{padding:12px 14px 6px;}" +
        ".opw-fuel-card{padding:12px 14px;gap:12px;margin-bottom:8px;border-radius:14px;}" +
        ".opw-fuel-badge{width:38px;height:38px;border-radius:12px;font-size:14px;}" +
        ".opw-fuel-name{font-size:12px;}" +
        ".opw-price-value{font-size:16px;}" +
        ".opw-fuel-prices{gap:10px;}" +
      "}";

    document.head.appendChild(s);
  }

  // ── Build floating chip ───────────────────────────────────
  function createWidget() {
    if (widgetEl) return;

    widgetEl = document.createElement("div");
    widgetEl.id = "oil-price-widget";
    widgetEl.innerHTML =
      '<div class="opw-chip" id="opw-chip">' +
        '<div class="opw-chip-icon"><i class="fas fa-gas-pump"></i></div>' +
        '<div>' +
          '<span class="opw-chip-text">Oil Prices</span>' +
          '<span class="opw-chip-sub">Tap to view</span>' +
        '</div>' +
        '<div class="opw-chip-dot"></div>' +
      '</div>';
    document.body.appendChild(widgetEl);

    // Build the modal overlay
    modalEl = document.createElement("div");
    modalEl.className = "opw-overlay";
    modalEl.id = "opw-overlay";
    modalEl.innerHTML =
      '<div class="opw-modal" id="opw-modal">' +
        '<div class="opw-modal-header">' +
          '<div class="opw-modal-header-top">' +
            '<div class="opw-modal-title-wrap">' +
              '<div class="opw-modal-icon"><i class="fas fa-gas-pump"></i></div>' +
              '<div>' +
                '<div class="opw-modal-title">Live Oil Prices</div>' +
                '<div class="opw-modal-subtitle">PTT Cambodia · Updated live</div>' +
              '</div>' +
            '</div>' +
            '<button class="opw-modal-close" id="opw-close"><i class="fas fa-times"></i></button>' +
          '</div>' +
        '</div>' +
        '<div class="opw-modal-body" id="opw-body">' +
          '<div class="opw-modal-loading"><i class="fas fa-spinner fa-spin"></i> Loading prices…</div>' +
        '</div>' +
        '<div class="opw-modal-footer" id="opw-footer">' +
          '<i class="fas fa-clock"></i> <span id="opw-time">—</span>' +
        '</div>' +
      '</div>';
    document.body.appendChild(modalEl);

    // Open modal on chip click
    document.getElementById("opw-chip").addEventListener("click", function () {
      modalEl.classList.add("opw-open");
    });

    // Close modal
    document.getElementById("opw-close").addEventListener("click", function (e) {
      e.stopPropagation();
      modalEl.classList.remove("opw-open");
    });

    // Close on overlay click
    modalEl.addEventListener("click", function (e) {
      if (e.target === modalEl) {
        modalEl.classList.remove("opw-open");
      }
    });
  }

  // ── Render prices ─────────────────────────────────────────
  function renderPrices(data) {
    var nextSignature = JSON.stringify(data || {});
    if (lastRenderedSignature === nextSignature) {
      return;
    }

    lastData = data;
    lastRenderedSignature = nextSignature;
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

    // Update chip subtitle with first price
    var firstPrice = prices["ULR 91"];
    var chipSub = widgetEl ? widgetEl.querySelector(".opw-chip-sub") : null;
    if (firstPrice && chipSub) {
      chipSub.textContent = "ULR $" + Number(firstPrice.dollar).toFixed(2);
    }

    // Update time in footer
    var timeEl = document.getElementById("opw-time");
    if (timeEl) timeEl.textContent = timeStr || "—";

    // Render fuel cards
    var html = "";
    var fuelOrder = ["ULR 91", "ULG 95", "HSD"];
    fuelOrder.forEach(function (key) {
      var p = prices[key];
      if (!p) return;
      var cfg = FUEL_CONFIG[key] || {
        color: "#666", gradient: "linear-gradient(135deg,#999,#666)",
        bg: "rgba(100,100,100,.06)", icon: "fa-gas-pump",
        label: key, labelEn: key, symbol: "?"
      };

      html +=
        '<div class="opw-fuel-card" style="background:' + cfg.bg + ';">' +
          '<div class="opw-fuel-badge" style="background:' + cfg.gradient + ';">' +
            '<i class="fas ' + cfg.icon + '"></i>' +
          '</div>' +
          '<div class="opw-fuel-info">' +
            '<div class="opw-fuel-name">' + cfg.labelEn + '</div>' +
            '<div class="opw-fuel-name-kh">' + cfg.label + '</div>' +
            '<div class="opw-fuel-prices">' +
              '<div class="opw-price-tag opw-price-dollar">' +
                '<span class="opw-price-value">$' + Number(p.dollar).toFixed(2) + '</span>' +
                '<span class="opw-price-currency">USD</span>' +
              '</div>' +
              '<div class="opw-price-tag opw-price-riel">' +
                '<span class="opw-price-value">៛' + Number(p.riel).toLocaleString() + '</span>' +
                '<span class="opw-price-currency">KHR</span>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>';
    });

    body.innerHTML = html;
  }

  function renderError() {
    var body = document.getElementById("opw-body");
    if (!body || lastData) return;
    body.innerHTML =
      '<div class="opw-modal-error">' +
        '<i class="fas fa-exclamation-triangle"></i> Unable to load prices' +
      '</div>';
    var chipSub = widgetEl ? widgetEl.querySelector(".opw-chip-sub") : null;
    if (chipSub) chipSub.textContent = "Tap to retry";
  }

  // ── Fetch data ────────────────────────────────────────────
  function buildFreshUrl(url) {
    var sep = url.indexOf("?") === -1 ? "?" : "&";
    return url + sep + "_ts=" + Date.now();
  }

  function fetchFromUrl(url) {
    return fetch(buildFreshUrl(url), {
      mode: "cors",
      headers: {
        "Accept": "application/json"
      }
    })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      });
  }

  function getRefreshInterval() {
    return document.hidden ? HIDDEN_REFRESH_INTERVAL : VISIBLE_REFRESH_INTERVAL;
  }

  function stopAutoRefresh() {
    if (refreshTimer) {
      clearTimeout(refreshTimer);
      refreshTimer = null;
    }
  }

  function scheduleNextRefresh(delay) {
    stopAutoRefresh();
    refreshTimer = setTimeout(function () {
      fetchPrices().finally(function () {
        scheduleNextRefresh(getRefreshInterval());
      });
    }, Math.max(1000, delay || getRefreshInterval()));
  }

  function startAutoRefresh() {
    scheduleNextRefresh(getRefreshInterval());
  }

  function fetchPrices() {
    if (activeFetchPromise) {
      return activeFetchPromise;
    }

    activeFetchPromise = fetchFromUrl(API_URL)
      .then(function (json) {
        if (json.success && json.data) {
          renderPrices(json.data);
          return json.data;
        } else {
          renderError();
          throw new Error("Invalid oil price response.");
        }
      })
      .catch(function (err) {
        console.error("Oil price fetch error:", err);
        renderError();
        throw err;
      })
      .finally(function () {
        activeFetchPromise = null;
      });

    return activeFetchPromise;
  }

  function refresh(options) {
    var settings = options || {};
    if (settings.restartTimer !== false) {
      startAutoRefresh();
    }
    return fetchPrices();
  }

  function handleVisibilityChange() {
    if (document.hidden) {
      startAutoRefresh();
      return Promise.resolve();
    }
    return refresh({ restartTimer: true }).catch(function () {
      return null;
    });
  }

  // ── Public ────────────────────────────────────────────────
  function init() {
    injectCSS();
    createWidget();
    refresh({ restartTimer: false }).catch(function () {
      return null;
    });
    startAutoRefresh();
  }

  return {
    init: init,
    refresh: refresh,
    handleVisibilityChange: handleVisibilityChange,
    stopAutoRefresh: stopAutoRefresh,
  };
})();
