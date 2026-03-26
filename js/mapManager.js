/**
 * ============================================================
 *  PTT Station Map — Map Manager
 *  Owns Leaflet map state, marker cluster state, and location UI.
 *  Smooth live-location like Google Maps blue dot.
 *  Exposes legacy globals: map, markers, allMarkers
 *  Depends on: config.js, utils.js
 * ============================================================
 */
var map;
var markers;
var allMarkers = [];

var MapManager = (function () {
  "use strict";

  var currentLocationMarker = null;
  var currentLocationCircle = null;
  var iconRefreshTimer = null;
  var liveLocationUnsubscribe = null;
  var isFollowingLiveLocation = false;
  var trackingStateUnsubscribe = null;
  var gpsSignalElement = null;
  var cssInjected = false;

  // ── Compass heading state ─────────────────────────────────
  var currentHeading = null;          // degrees 0-360, null if unknown
  var compassEnabled = false;
  var headingConeElement = null;      // reference to DOM cone inside blue dot

  // ── Smooth animation state ────────────────────────────────
  var animFrameId = null;
  var animStartTime = 0;
  var ANIM_DURATION = 600; // ms — smooth glide duration
  var animFrom = { lat: 0, lng: 0, radius: 0 };
  var animTo = { lat: 0, lng: 0, radius: 0 };
  var isAnimating = false;

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function animateLocationUpdate(toLat, toLng, toRadius) {
    if (currentLocationMarker) {
      var cur = currentLocationMarker.getLatLng();
      animFrom.lat = cur.lat;
      animFrom.lng = cur.lng;
    } else {
      animFrom.lat = toLat;
      animFrom.lng = toLng;
    }
    if (currentLocationCircle) {
      animFrom.radius = currentLocationCircle.getRadius();
    } else {
      animFrom.radius = toRadius;
    }

    animTo.lat = toLat;
    animTo.lng = toLng;
    animTo.radius = toRadius;

    var dist = Math.abs(animTo.lat - animFrom.lat) + Math.abs(animTo.lng - animFrom.lng);
    if (dist < 0.0000001) {
      applyPosition(toLat, toLng, toRadius);
      return;
    }

    animStartTime = performance.now();
    if (!isAnimating) {
      isAnimating = true;
      animFrameId = requestAnimationFrame(animStep);
    }
  }

  function animStep(now) {
    var elapsed = now - animStartTime;
    var progress = Math.min(elapsed / ANIM_DURATION, 1);
    var eased = easeOutCubic(progress);

    var lat = lerp(animFrom.lat, animTo.lat, eased);
    var lng = lerp(animFrom.lng, animTo.lng, eased);
    var rad = lerp(animFrom.radius, animTo.radius, eased);

    applyPosition(lat, lng, rad);

    if (isFollowingLiveLocation && map) {
      map.panTo([lat, lng], { animate: false });
    }

    if (progress < 1) {
      animFrameId = requestAnimationFrame(animStep);
    } else {
      isAnimating = false;
      applyPosition(animTo.lat, animTo.lng, animTo.radius);
    }
  }

  function applyPosition(lat, lng, radius) {
    var latlng = L.latLng(lat, lng);
    if (currentLocationMarker) {
      currentLocationMarker.setLatLng(latlng);
    }
    if (currentLocationCircle) {
      currentLocationCircle.setLatLng(latlng);
      currentLocationCircle.setRadius(radius);
    }
  }

  function cancelAnimation() {
    if (animFrameId) {
      cancelAnimationFrame(animFrameId);
      animFrameId = null;
    }
    isAnimating = false;
  }

  // ── CSS Injection ─────────────────────────────────────────
  function injectTrackingCSS() {
    if (cssInjected) return;
    cssInjected = true;

    var style = document.createElement("style");
    style.textContent =
      /* ── Google Maps blue dot ────────────────────────── */
      ".gm-blue-dot-outer{" +
        "width:22px;height:22px;position:relative;display:flex;" +
        "align-items:center;justify-content:center;" +
      "}" +
      ".gm-blue-dot-ring{" +
        "position:absolute;width:22px;height:22px;border-radius:50%;" +
        "background:rgba(66,133,244,.18);animation:gm-ring-pulse 2s ease-out infinite;" +
      "}" +
      ".gm-blue-dot-core{" +
        "width:14px;height:14px;border-radius:50%;" +
        "background:#4285F4;border:2.5px solid #fff;" +
        "box-shadow:0 1px 4px rgba(0,0,0,.3);position:relative;z-index:1;" +
      "}" +
      "@keyframes gm-ring-pulse{" +
        "0%{transform:scale(1);opacity:.7;}" +
        "100%{transform:scale(3);opacity:0;}" +
      "}" +

      /* ── Compass heading cone (Google Maps style) ────── */
      ".gm-heading-cone{" +
        "position:absolute;top:50%;left:50%;" +
        "width:60px;height:60px;" +
        "margin-left:-30px;margin-top:-30px;" +
        "pointer-events:none;z-index:0;" +
        "transition:transform .15s linear,opacity .3s;" +
        "opacity:0;" +
      "}" +
      ".gm-heading-cone.active{opacity:1;}" +
      ".gm-heading-cone svg{width:100%;height:100%;}" +

      /* ── GPS signal badge ─────────────────────────────── */
      "#gps-signal-badge{" +
        "position:fixed;bottom:16px;left:16px;z-index:1000;" +
        "display:flex;align-items:center;gap:6px;" +
        "padding:6px 12px;border-radius:20px;" +
        "font-size:12px;font-weight:600;font-family:system-ui,sans-serif;" +
        "color:#fff;pointer-events:none;" +
        "box-shadow:0 2px 8px rgba(0,0,0,.25);" +
        "transition:background .4s,opacity .4s;opacity:0;" +
      "}" +
      "#gps-signal-badge.show{opacity:1;}" +
      "#gps-signal-badge.gps-active{background:#16a34a;}" +
      "#gps-signal-badge.gps-searching{background:#f59e0b;}" +
      "#gps-signal-badge.gps-error{background:#ef4444;}" +
      "#gps-signal-badge.gps-idle{background:#94a3b8;}" +

      /* ── Signal bars ─────────────────────────────────── */
      ".gps-bars{display:flex;align-items:flex-end;gap:2px;height:14px;}" +
      ".gps-bars .bar{width:3px;border-radius:1px;background:#fff;opacity:.35;" +
        "transition:opacity .3s,height .3s;}" +
      ".gps-bars .bar.on{opacity:1;}" +
      ".gps-bars .bar:nth-child(1){height:4px;}" +
      ".gps-bars .bar:nth-child(2){height:8px;}" +
      ".gps-bars .bar:nth-child(3){height:12px;}" +

      /* ── Searching bar animation ─────────────────────── */
      "@keyframes gps-searching-pulse{0%,100%{opacity:.35;}50%{opacity:1;}}" +
      ".gps-searching .gps-bars .bar{animation:gps-searching-pulse 1.2s ease-in-out infinite;}" +
      ".gps-searching .gps-bars .bar:nth-child(2){animation-delay:.15s;}" +
      ".gps-searching .gps-bars .bar:nth-child(3){animation-delay:.3s;}" +

      /* ── Accuracy indicator dot ──────────────────────── */
      ".gps-accuracy-dot{width:6px;height:6px;border-radius:50%;flex-shrink:0;}" +
      ".gps-active .gps-accuracy-dot{background:#86efac;}" +
      ".gps-searching .gps-accuracy-dot{background:#fde68a;}" +
      ".gps-error .gps-accuracy-dot{background:#fca5a5;}" +

      /* ── Location button states ──────────────────────── */
      "#myLocationBtn.loc-active{" +
        "background-color:#dbeafe !important;border:2px solid #3b82f6 !important;" +
      "}" +
      "#myLocationBtn.loc-active i{color:#2563eb !important;}" +
      "#myLocationBtn.loc-searching{" +
        "background-color:#fef9c3 !important;border:2px solid #f59e0b !important;" +
      "}" +
      "#myLocationBtn.loc-searching i{color:#d97706 !important;" +
        "animation:loc-spin 1.5s linear infinite;}" +
      "@keyframes loc-spin{from{transform:rotate(0deg);}to{transform:rotate(360deg);}}" +
      "#myLocationBtn.loc-error{" +
        "background-color:#fee2e2 !important;border:2px solid #ef4444 !important;" +
      "}" +
      "#myLocationBtn.loc-error i{color:#dc2626 !important;}" +
      "#myLocationBtn.loc-following{" +
        "background-color:#3b82f6 !important;border:2px solid #1d4ed8 !important;" +
      "}" +
      "#myLocationBtn.loc-following i{color:#fff !important;}" +

      /* ── Compass / Recenter button states ────────────── */
      "#recenterBtn.compass-active{" +
        "background-color:#dbeafe !important;border:2px solid #6366f1 !important;" +
      "}" +
      "#recenterBtn.compass-active i{color:#4f46e5 !important;}" +

      /* ── EV Station Pluz Marker ──────────────────────── */

      /* Wrapper */
      ".ev-marker-wrap{" +
        "position:relative;width:58px;height:52px;" +
        "display:flex;flex-direction:column;align-items:center;" +
        "animation:ev-drop-in .4s cubic-bezier(.22,1.15,.64,1) both;" +
      "}" +
      "@keyframes ev-drop-in{" +
        "0%{opacity:0;transform:translateY(-28px) scale(.3);}" +
        "100%{opacity:1;transform:translateY(0) scale(1);}" +
      "}" +

      /* Ripple rings */
      ".ev-ripple-ring{" +
        "position:absolute;top:16px;left:50%;width:38px;height:38px;" +
        "margin-left:-19px;margin-top:-19px;border-radius:50%;" +
        "border:2px solid rgba(51,195,240,.4);" +
        "animation:ev-ripple 2.8s ease-out infinite;pointer-events:none;z-index:0;" +
      "}" +
      ".ev-ripple-ring:nth-child(2){animation-delay:1.4s;border-color:rgba(26,60,158,.25);}" +
      "@keyframes ev-ripple{" +
        "0%{transform:scale(.45);opacity:.7;}" +
        "100%{transform:scale(3);opacity:0;}" +
      "}" +

      /* Pin — exact 1.73:1 ratio matching logo */
      ".ev-pin-body{" +
        "position:relative;z-index:2;" +
        "width:52px;height:30px;" +
        "background:#fff;" +
        "border-radius:8px;" +
        "border:2px solid #33C3F0;" +
        "box-shadow:0 2px 8px rgba(51,195,240,.35),0 0 0 3px rgba(51,195,240,.07);" +
        "overflow:hidden;" +
        "animation:ev-glow 3s ease-in-out infinite;" +
      "}" +
      "@keyframes ev-glow{" +
        "0%,100%{border-color:#33C3F0;box-shadow:0 2px 8px rgba(51,195,240,.35),0 0 0 3px rgba(51,195,240,.07);}" +
        "50%{border-color:#0EA5E9;box-shadow:0 2px 16px rgba(51,195,240,.5),0 0 0 5px rgba(51,195,240,.1);}" +
      "}" +

      /* Logo — 100% fill, no gaps */
      ".ev-logo-img{" +
        "display:block;width:100%;height:100%;object-fit:fill;" +
      "}" +

      /* Tail arrow */
      ".ev-pin-tail{" +
        "width:0;height:0;z-index:1;" +
        "border-left:8px solid transparent;border-right:8px solid transparent;" +
        "border-top:10px solid #33C3F0;" +
        "margin-top:-1px;" +
        "filter:drop-shadow(0 2px 2px rgba(0,0,0,.1));" +
        "animation:ev-tail-c 3s ease-in-out infinite;" +
      "}" +
      "@keyframes ev-tail-c{" +
        "0%,100%{border-top-color:#33C3F0;}" +
        "50%{border-top-color:#0EA5E9;}" +
      "}" +

      /* Promo dot */
      ".ev-promo-dot{" +
        "position:absolute;top:-4px;right:-4px;width:12px;height:12px;z-index:5;" +
        "background:#ff1744;border-radius:50%;border:2px solid #fff;" +
        "animation:ev-promo-ping 1.5s ease-out infinite;" +
      "}" +
      "@keyframes ev-promo-ping{" +
        "0%{box-shadow:0 0 0 0 rgba(255,23,68,.5);}" +
        "70%{box-shadow:0 0 0 6px rgba(255,23,68,0);}" +
        "100%{box-shadow:0 0 0 0 rgba(255,23,68,0);}" +
      "}" +

      /* Shadow */
      ".ev-ground-shadow{" +
        "width:16px;height:4px;border-radius:50%;margin-top:1px;" +
        "background:radial-gradient(ellipse,rgba(0,0,0,.15),transparent 70%);" +
        "z-index:0;" +
      "}" +

      /* Closed */
      ".ev-marker-closed .ev-pin-body{" +
        "background:#f5f5f5;border-color:#bdbdbd;" +
        "box-shadow:0 2px 6px rgba(0,0,0,.1);animation:none;" +
      "}" +
      ".ev-marker-closed .ev-pin-tail{border-top-color:#bdbdbd;animation:none;}" +
      ".ev-marker-closed .ev-ripple-ring{display:none;}" +
      ".ev-marker-closed .ev-logo-img{filter:grayscale(1) opacity(.4);}";

    document.head.appendChild(style);
  }

  // ── GPS signal badge ──────────────────────────────────────
  function createGPSBadge() {
    if (gpsSignalElement) return;

    gpsSignalElement = document.createElement("div");
    gpsSignalElement.id = "gps-signal-badge";
    gpsSignalElement.innerHTML =
      '<div class="gps-bars">' +
        '<div class="bar"></div>' +
        '<div class="bar"></div>' +
        '<div class="bar"></div>' +
      "</div>" +
      '<span class="gps-text">GPS</span>' +
      '<div class="gps-accuracy-dot"></div>';

    document.body.appendChild(gpsSignalElement);
  }

  function updateGPSBadge(state, location) {
    if (!gpsSignalElement) return;

    gpsSignalElement.className = "gps-" + state;
    var bars = gpsSignalElement.querySelectorAll(".bar");
    var textEl = gpsSignalElement.querySelector(".gps-text");

    switch (state) {
      case "active":
        gpsSignalElement.classList.add("show");
        var acc = location && location.accuracy ? Math.round(location.accuracy) : "—";
        bars[0].classList.add("on");
        bars[1].classList.toggle("on", acc < 100);
        bars[2].classList.toggle("on", acc < 30);
        textEl.textContent = "GPS ±" + acc + "m";
        break;
      case "searching":
        gpsSignalElement.classList.add("show");
        bars[0].classList.remove("on");
        bars[1].classList.remove("on");
        bars[2].classList.remove("on");
        textEl.textContent = "Searching…";
        break;
      case "error":
        gpsSignalElement.classList.add("show");
        bars[0].classList.remove("on");
        bars[1].classList.remove("on");
        bars[2].classList.remove("on");
        textEl.textContent = "GPS Lost";
        break;
      default:
        gpsSignalElement.classList.remove("show");
        break;
    }
  }

  function updateLocationButton(state) {
    var btn = document.getElementById("myLocationBtn");
    if (!btn) return;

    btn.classList.remove("loc-active", "loc-searching", "loc-error", "loc-following");

    if (state === "active" && isFollowingLiveLocation) {
      btn.classList.add("loc-following");
    } else if (state === "active") {
      btn.classList.add("loc-active");
    } else if (state === "searching") {
      btn.classList.add("loc-searching");
    } else if (state === "error") {
      btn.classList.add("loc-error");
    }
  }

  // ── Init ──────────────────────────────────────────────────
  function init() {
    injectTrackingCSS();

    map = L.map("map", { attributionControl: false, zoomControl: false }).setView(PTT_CONFIG.MAP_CENTER, PTT_CONFIG.MAP_ZOOM);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "",
    }).addTo(map);

    markers = L.markerClusterGroup({
      iconCreateFunction: function (cluster) {
        var childMarkers = cluster.getAllChildMarkers();
        var hasPromotions = childMarkers.some(function (marker) {
          return (
            marker.options &&
            marker.options.icon &&
            marker.options.icon.options &&
            marker.options.icon.options.html &&
            (marker.options.icon.options.html.indexOf("red-dot") !== -1 ||
             marker.options.icon.options.html.indexOf("ev-promo-dot") !== -1)
          );
        });

        var evPage = isEVPage();
        var clusterBg = evPage
          ? "background:linear-gradient(135deg,#33C3F0,#1a3c9e);box-shadow:0 2px 12px rgba(51,195,240,.45);"
          : "background: rgba(0, 27, 255, 0.8);";

        var clusterHtml =
          '<div class="cluster-icon-container" style="position: relative;">' +
          (hasPromotions
            ? '<div class="' + (evPage ? 'ev-promo-dot' : 'red-dot animate') + '" style="position:absolute;top:0;right:0;' + (evPage ? '' : 'width:12px;height:12px;background-color:red;border-radius:50%;border:2px solid white;') + '"></div>'
            : "") +
          '<div class="cluster-number" style="' + clusterBg + ' border-radius: 50%; color: white; width: 34px; height: 34px; display: flex; align-items: center; justify-content: center; font-weight:700; font-size:13px;">' +
          cluster.getChildCount() +
          "</div></div>";

        return L.divIcon({
          html: clusterHtml,
          className: "custom-cluster-icon",
          iconSize: L.point(40, 40),
        });
      },
    });

    map.on("dragstart", function () {
      if (currentLocationMarker) {
        isFollowingLiveLocation = false;
        updateLocationButton(PTT_UTILS.getTrackingState());
      }
    });

    createGPSBadge();

    trackingStateUnsubscribe = PTT_UTILS.subscribeToTrackingState(function (state) {
      var loc = PTT_UTILS.getLastKnownLocation();
      updateGPSBadge(state, loc);
      updateLocationButton(state);
    });

    PTT_UTILS.subscribeToLocationUpdates(function (location) {
      if (PTT_UTILS.getTrackingState() === "active") {
        updateGPSBadge("active", location);
      }
    });
  }

  // ── Live location subscription ────────────────────────────
  function ensureLiveLocationSubscription() {
    if (liveLocationUnsubscribe) return;

    liveLocationUnsubscribe = PTT_UTILS.subscribeToLocationUpdates(function (location) {
      renderCurrentLocation(location, {
        center: isFollowingLiveLocation,
        zoom: map.getZoom() < PTT_CONFIG.DETAIL_ZOOM ? PTT_CONFIG.DETAIL_ZOOM : map.getZoom(),
        openPopup: false,
        animate: true,
      });
    });
  }

  // ── Render current location ───────────────────────────────
  function renderCurrentLocation(location, options) {
    if (!location) return null;

    var settings = options || {};
    var lat = parseFloat(location.lat);
    var lng = parseFloat(location.lng);
    var accuracy = Math.max(20, Math.min(Number(location.accuracy) || 80, 500));

    // Create layers on first call
    if (!currentLocationCircle) {
      currentLocationCircle = L.circle([lat, lng], {
        color: "rgba(66,133,244,.3)",
        fillColor: "rgba(66,133,244,.1)",
        fillOpacity: 1,
        weight: 1,
        radius: accuracy,
        interactive: false,
      }).addTo(map);
    }

    if (!currentLocationMarker) {
      var blueDotIcon = L.divIcon({
        html:
          '<div class="gm-blue-dot-outer">' +
            '<div class="gm-heading-cone" id="gm-heading-cone">' +
              '<svg viewBox="0 0 100 100"><path d="M50 50 L30 0 Q50 8 70 0 Z" fill="rgba(66,133,244,0.28)" /></svg>' +
            '</div>' +
            '<div class="gm-blue-dot-ring"></div>' +
            '<div class="gm-blue-dot-core"></div>' +
          "</div>",
        className: "",
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      });

      currentLocationMarker = L.marker([lat, lng], {
        icon: blueDotIcon,
        zIndexOffset: 1000,
        interactive: false,
      }).addTo(map);

      // Cache the heading cone element
      setTimeout(function () {
        headingConeElement = document.getElementById("gm-heading-cone");
        if (headingConeElement && compassEnabled && currentHeading !== null) {
          headingConeElement.classList.add("active");
          headingConeElement.style.transform = "rotate(" + currentHeading + "deg)";
        }
      }, 50);

      // First fix — snap, don't animate
      applyPosition(lat, lng, accuracy);
    } else if (settings.animate !== false) {
      // Smooth glide to new position
      animateLocationUpdate(lat, lng, accuracy);
    } else {
      applyPosition(lat, lng, accuracy);
    }

    // Center / follow — only when NOT during a smooth animation
    // (the animStep handles panTo when following + animating)
    if (settings.center && !isAnimating) {
      var targetZoom = settings.zoom || PTT_CONFIG.DETAIL_ZOOM;
      if (map.getZoom() < targetZoom) {
        // Need to zoom in — fast flyTo
        map.flyTo([lat, lng], targetZoom, {
          animate: true,
          duration: 0.4,
        });
      } else {
        // Already zoomed in — quick pan
        map.panTo([lat, lng], {
          animate: true,
          duration: 0.3,
          easeLinearity: 0.25,
        });
      }
    }

    if (settings.openPopup === true) {
      if (!currentLocationMarker.getPopup || !currentLocationMarker.getPopup()) {
        currentLocationMarker.bindPopup("You are here.");
      }
      currentLocationMarker.openPopup();
    }

    return location;
  }

  // ── Start / stop tracking ─────────────────────────────────
  function startLiveLocationTracking(options) {
    var settings = options || {};

    ensureLiveLocationSubscription();
    if (typeof settings.follow === "boolean") {
      isFollowingLiveLocation = settings.follow;
    }

    return PTT_UTILS.startLocationWatch(settings.geolocationOptions)
      .then(function (location) {
        return renderCurrentLocation(location, {
          center: settings.centerOnFirstFix === true,
          zoom: settings.zoom || PTT_CONFIG.DETAIL_ZOOM,
          openPopup: settings.openPopup,
          animate: false,
        });
      });
  }

  function stopLiveLocationTracking() {
    cancelAnimation();
    PTT_UTILS.stopLocationWatch();
    if (liveLocationUnsubscribe) {
      liveLocationUnsubscribe();
      liveLocationUnsubscribe = null;
    }
    isFollowingLiveLocation = false;
    updateLocationButton("idle");
  }

  // ── Station markers ───────────────────────────────────────

  /** Detect if current page is an EV-filtered page */
  function isEVPage() {
    var cfg = window.PTT_PAGE_CONFIG;
    return cfg && cfg.autoSelectFilter && cfg.autoSelectFilter.item === "EV";
  }

  /** Check if station has EV charger */
  function stationHasEV(station) {
    if (!station) return false;
    var op = station.other_product;
    if (Array.isArray(op)) {
      return op.some(function (v) { return v && v.toUpperCase() === "EV"; });
    }
    return typeof op === "string" && op.toUpperCase() === "EV";
  }

  /** Create animated EV Station Pluz marker icon (2026 brand style) */
  function createEVStationIcon(station) {
    var isOpen = PTT_UTILS.isStationOpen(station);
    var hasPromotions = station.promotions && station.promotions.length > 0;
    var logoSrc = PTT_CONFIG.IMAGE_BASE_URL + 'ev_marker.png';

    var html =
      '<div class="ev-marker-wrap' + (isOpen ? '' : ' ev-marker-closed') + '">' +
        // 2 subtle ripple rings behind
        '<div class="ev-ripple-ring"></div>' +
        '<div class="ev-ripple-ring"></div>' +
        // White card pin with logo
        '<div class="ev-pin-body">' +
          '<img class="ev-logo-img" src="' + logoSrc + '" alt="EV" />' +
          (hasPromotions ? '<div class="ev-promo-dot"></div>' : '') +
        '</div>' +
        // Pointer arrow
        '<div class="ev-pin-tail"></div>' +
        // Ground shadow
        '<div class="ev-ground-shadow"></div>' +
      '</div>';

    return L.divIcon({
      html: html,
      className: "",
      iconSize: [58, 52],
      iconAnchor: [29, 48],
      popupAnchor: [0, -44],
    });
  }

  function createStationIcon(station) {
    // Use animated EV marker on EV pages for stations with EV charger
    if (isEVPage() && stationHasEV(station)) {
      return createEVStationIcon(station);
    }

    var iconUrl = PTT_UTILS.getIconUrl(station);
    var hasPromotions = station.promotions && station.promotions.length > 0;

    return L.divIcon({
      html:
        '<div class="custom-icon-container" style="position: relative;">' +
        '<img src="' + iconUrl + '" alt="station status" class="station-icon" style="width: 41px; height: 62px;">' +
        (hasPromotions
          ? '<div class="red-dot animate" style="position:absolute;top:0;right:0;width:12px;height:12px;background-color:red;border-radius:50%;border:2px solid white;"></div>'
          : "") +
        "</div>",
      className: "",
      iconSize: [41, 62],
      iconAnchor: [24, 62],
      popupAnchor: [1, -34],
    });
  }

  function buildStationMarker(station, onClick) {
    var marker = L.marker([station.latitude, station.longitude], {
      icon: createStationIcon(station),
    });
    if (typeof onClick === "function") {
      marker.on("click", function () {
        onClick(marker, station);
      });
    }
    return marker;
  }

  function setMarkers(entries) {
    allMarkers = entries.slice();
    markers.clearLayers();
    entries.forEach(function (entry) {
      markers.addLayer(entry.marker);
    });
    map.addLayer(markers);
    startMarkerAutoRefresh();
  }

  function startMarkerAutoRefresh() {
    if (iconRefreshTimer) {
      clearInterval(iconRefreshTimer);
    }
    iconRefreshTimer = setInterval(refreshStationIcons, 60 * 1000);
  }

  function refreshStationIcons() {
    allMarkers.forEach(function (entry) {
      entry.marker.setIcon(createStationIcon(entry.data));
    });
    if (markers && markers.refreshClusters) {
      markers.refreshClusters();
    }
  }

  function fitToAllMarkers() {
    if (!allMarkers.length) return;
    var group = new L.featureGroup(
      allMarkers.map(function (entry) {
        return entry.marker;
      })
    );
    map.flyToBounds(group.getBounds(), {
      animate: true,
      duration: PTT_CONFIG.FLY_DURATION,
      padding: [30, 30],
    });
  }

  function focusMarkers(markerList) {
    if (!markerList || !markerList.length) return;
    var group = new L.featureGroup(markerList);
    map.flyToBounds(group.getBounds(), {
      animate: true,
      duration: PTT_CONFIG.FLY_DURATION,
    });
  }

  function focusLocation(lat, lng, zoom) {
    map.setView([parseFloat(lat), parseFloat(lng)], zoom || PTT_CONFIG.DETAIL_ZOOM);
  }

  // ── Main entry ────────────────────────────────────────────
  function setMapToCurrentLocation(options) {
    var settings = options || {};
    var targetZoom = settings.zoom || PTT_CONFIG.DETAIL_ZOOM;
    isFollowingLiveLocation = settings.follow === true;
    ensureLiveLocationSubscription();
    updateLocationButton(PTT_UTILS.getTrackingState());

    // ★ FAST PATH — cached location exists → render NOW, zero delay
    var cached = PTT_UTILS.getLastKnownLocation();
    if (cached) {
      renderCurrentLocation(cached, {
        center: true,
        zoom: targetZoom,
        openPopup: settings.openPopup === true,
        animate: false,
      });

      // start live watcher in background (non-blocking)
      startLiveLocationTracking({
        follow: isFollowingLiveLocation,
        centerOnFirstFix: false,
        openPopup: false,
        zoom: targetZoom,
      }).catch(function () { /* already showing cached, ignore */ });

      return Promise.resolve(cached);
    }

    // ★ SLOW PATH — no cached location yet, must ask GPS
    return PTT_UTILS.getCurrentLocation({ preferCached: false })
      .then(function (currentLocation) {
        renderCurrentLocation(currentLocation, {
          center: true,
          zoom: targetZoom,
          openPopup: settings.openPopup === true,
          animate: false,
        });

        return startLiveLocationTracking({
          follow: isFollowingLiveLocation,
          centerOnFirstFix: false,
          openPopup: false,
          zoom: targetZoom,
        }).catch(function () {
          return currentLocation;
        });
      })
      .catch(function () {
        return startLiveLocationTracking({
          follow: isFollowingLiveLocation,
          centerOnFirstFix: true,
          openPopup: settings.openPopup === true,
          zoom: targetZoom,
        }).catch(function (watchError) {
          throw watchError;
        });
      })
      .catch(function (error) {
        console.error("Error getting current location:", error);
        if (!settings.silent) {
          alert("Error getting your location. Please try again later.");
        }
        throw error;
      });
  }

  // ── Compass Heading ──────────────────────────────────────
  function _onDeviceOrientation(e) {
    var heading = null;

    // iOS uses webkitCompassHeading (degrees from north)
    if (typeof e.webkitCompassHeading === "number") {
      heading = e.webkitCompassHeading;
    }
    // Android/Chrome: alpha is degrees, but relative — use absolute if available
    else if (typeof e.alpha === "number") {
      heading = (360 - e.alpha) % 360;
    }

    if (heading === null || isNaN(heading)) return;

    currentHeading = Math.round(heading);

    // Update the cone rotation
    if (headingConeElement) {
      headingConeElement.style.transform = "rotate(" + currentHeading + "deg)";
      if (!headingConeElement.classList.contains("active")) {
        headingConeElement.classList.add("active");
      }
    }

    // Update recenter button icon rotation
    var recenterIcon = document.querySelector("#recenterBtn i");
    if (recenterIcon) {
      recenterIcon.style.transition = "transform .15s linear";
      recenterIcon.style.transform = "rotate(" + currentHeading + "deg)";
    }
  }

  function startCompass() {
    if (compassEnabled) return;
    compassEnabled = true;

    // iOS 13+ requires permission
    if (typeof DeviceOrientationEvent !== "undefined" &&
        typeof DeviceOrientationEvent.requestPermission === "function") {
      DeviceOrientationEvent.requestPermission()
        .then(function (state) {
          if (state === "granted") {
            window.addEventListener("deviceorientation", _onDeviceOrientation, true);
          }
        })
        .catch(function () {
          console.warn("Compass permission denied");
          compassEnabled = false;
        });
    } else if ("DeviceOrientationEvent" in window) {
      window.addEventListener("deviceorientation", _onDeviceOrientation, true);
    }

    // Show cone if already rendered
    if (headingConeElement) {
      headingConeElement.classList.add("active");
    }
  }

  function stopCompass() {
    compassEnabled = false;
    currentHeading = null;
    window.removeEventListener("deviceorientation", _onDeviceOrientation, true);

    if (headingConeElement) {
      headingConeElement.classList.remove("active");
    }

    var recenterIcon = document.querySelector("#recenterBtn i");
    if (recenterIcon) {
      recenterIcon.style.transform = "rotate(0deg)";
    }
  }

  function toggleCompass() {
    if (compassEnabled) {
      stopCompass();
    } else {
      startCompass();
    }
    return compassEnabled;
  }

  function isCompassEnabled() {
    return compassEnabled;
  }

  return {
    init: init,
    createStationIcon: createStationIcon,
    buildStationMarker: buildStationMarker,
    setMarkers: setMarkers,
    refreshStationIcons: refreshStationIcons,
    fitToAllMarkers: fitToAllMarkers,
    focusMarkers: focusMarkers,
    focusLocation: focusLocation,
    startLiveLocationTracking: startLiveLocationTracking,
    stopLiveLocationTracking: stopLiveLocationTracking,
    setMapToCurrentLocation: setMapToCurrentLocation,
    startCompass: startCompass,
    stopCompass: stopCompass,
    toggleCompass: toggleCompass,
    isCompassEnabled: isCompassEnabled,
  };
})();

var setMapToCurrentLocation = function (options) {
  return MapManager.setMapToCurrentLocation(options);
};
