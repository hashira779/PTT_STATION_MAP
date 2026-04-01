/**
 * ============================================================
 *  PTT Station Map — Map Manager (MapLibre GL JS + 3D Buildings)
 *  Google-Maps-style 3-state location tracking:
 *    OFF → CENTERED → COMPASS → OFF
 *  Smooth, non-blocking — user can always zoom/pinch.
 *  Depends on: config.js, utils.js
 * ============================================================
 */
var map;
var markers;
var allMarkers = [];

var MapManager = (function () {
  "use strict";

  // ── Core state ──────────────────────────────────────────────
  var currentLocationMarker = null;
  var currentLocationPopup  = null;
  var iconRefreshTimer      = null;
  var liveLocationUnsubscribe = null;
  var trackingStateUnsubscribe = null;
  var cssInjected = false;
  var is3DEnabled = false;

  var _domMarkers = [];

  // ── 3-state location mode  (like Google Maps) ──────────────
  //  "off"      — not tracking
  //  "centered" — blue dot visible, map follows position, no rotation
  //  "compass"  — follows position AND rotates map to heading
  var _locationMode = "off";

  // ── Compass heading ─────────────────────────────────────────
  var currentHeading       = null;
  var compassEnabled       = false;
  var headingConeElement   = null;
  var compassWidgetEl      = null;
  var _lastCompassApply    = 0;
  var COMPASS_THROTTLE_MS  = 60;

  // ── Smooth dot animation ────────────────────────────────────
  var animFrameId   = null;
  var animStartTime = 0;
  var ANIM_DURATION = 600;
  var animFrom = { lat: 0, lng: 0, radius: 0 };
  var animTo   = { lat: 0, lng: 0, radius: 0 };
  var isAnimating = false;

  // ── Current position cache ──────────────────────────────────
  var _currentLat    = 0;
  var _currentLng    = 0;
  var _currentRadius = 0;
  var _isLocating    = false;

  // ── User-interaction guard ──────────────────────────────────
  // When user drags/pans we exit following. Zoom is allowed.
  var _userDragging       = false;
  var _dragEndTimer       = null;
  var DRAG_COOLDOWN_MS    = 250;
  var _userMovedSinceLocateStart = false;

  // ────────────────────────────────────────────────────────────
  //  Math helpers
  // ────────────────────────────────────────────────────────────
  function lerp(a, b, t) { return a + (b - a) * t; }
  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

  // ────────────────────────────────────────────────────────────
  //  Smooth blue-dot position animation
  // ────────────────────────────────────────────────────────────
  function animateLocationUpdate(toLat, toLng, toRadius) {
    animFrom.lat = _currentLat;
    animFrom.lng = _currentLng;
    animFrom.radius = _currentRadius;
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
    var elapsed  = now - animStartTime;
    var progress = Math.min(elapsed / ANIM_DURATION, 1);
    var eased    = easeOutCubic(progress);
    var lat = lerp(animFrom.lat, animTo.lat, eased);
    var lng = lerp(animFrom.lng, animTo.lng, eased);
    var rad = lerp(animFrom.radius, animTo.radius, eased);
    applyPosition(lat, lng, rad);

    // Only pan when in centered/compass AND user isn't dragging
    if (_locationMode !== "off" && map && !_userDragging) {
      map.panTo([lng, lat], { animate: false });
    }
    if (progress < 1) {
      animFrameId = requestAnimationFrame(animStep);
    } else {
      isAnimating = false;
      applyPosition(animTo.lat, animTo.lng, animTo.radius);
    }
  }

  function applyPosition(lat, lng, radius) {
    _currentLat = lat;
    _currentLng = lng;
    _currentRadius = radius;
    if (currentLocationMarker) {
      currentLocationMarker.setLngLat([lng, lat]);
    }
    if (map && map.getSource && map.getSource("location-accuracy")) {
      map.getSource("location-accuracy").setData(_createGeoJSONCircle([lng, lat], radius));
    }
  }

  function cancelAnimation() {
    if (animFrameId) { cancelAnimationFrame(animFrameId); animFrameId = null; }
    isAnimating = false;
  }

  function _createGeoJSONCircle(center, radiusMeters, points) {
    points = points || 64;
    var coords = [];
    var distanceX = radiusMeters / (111320 * Math.cos(center[1] * Math.PI / 180));
    var distanceY = radiusMeters / 110540;
    for (var i = 0; i < points; i++) {
      var theta = (i / points) * (2 * Math.PI);
      coords.push([center[0] + distanceX * Math.cos(theta), center[1] + distanceY * Math.sin(theta)]);
    }
    coords.push(coords[0]);
    return { type: "Feature", geometry: { type: "Polygon", coordinates: [coords] }, properties: {} };
  }

  // ────────────────────────────────────────────────────────────
  //  CSS Injection
  // ────────────────────────────────────────────────────────────
  function injectTrackingCSS() {
    if (cssInjected) return;
    cssInjected = true;
    var style = document.createElement("style");
    style.textContent =
      /* Blue dot */
      ".gm-blue-dot-outer{width:22px;height:22px;position:relative;display:flex;align-items:center;justify-content:center;}" +
      ".gm-blue-dot-ring{position:absolute;width:22px;height:22px;border-radius:50%;background:rgba(66,133,244,.18);animation:gm-ring-pulse 2s ease-out infinite;}" +
      ".gm-blue-dot-core{width:14px;height:14px;border-radius:50%;background:#4285F4;border:2.5px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.3);position:relative;z-index:1;}" +
      "@keyframes gm-ring-pulse{0%{transform:scale(1);opacity:.7;}100%{transform:scale(3);opacity:0;}}" +

      /* Heading cone — CSS transition for smooth rotation */
      ".gm-heading-cone{position:absolute;top:50%;left:50%;width:80px;height:80px;margin-left:-40px;margin-top:-40px;pointer-events:none;z-index:0;" +
        "transition:transform .15s linear,opacity .3s;opacity:0;will-change:transform;}" +
      ".gm-heading-cone.active{opacity:1;}" +
      ".gm-heading-cone svg{width:100%;height:100%;}" +

      /* Compass widget */
      "#compass-widget{position:fixed;top:calc(env(safe-area-inset-top, 0px) + 88px);left:12px;right:auto;z-index:1060;" +
        "width:56px;height:56px;border-radius:50%;background:rgba(255,255,255,0.92);backdrop-filter:blur(14px);" +
        "border:1px solid rgba(255,255,255,0.5);box-shadow:0 4px 20px rgba(0,0,0,0.1),0 0 0 1px rgba(0,0,0,0.04);" +
        "cursor:pointer;-webkit-user-select:none;user-select:none;" +
        "display:flex;align-items:center;justify-content:center;opacity:0;transform:scale(0.6);" +
        "transition:all .4s cubic-bezier(.22,1,.36,1);pointer-events:none;}" +
      "#compass-widget.visible{opacity:1;transform:scale(1);pointer-events:auto;}" +
      "#compass-widget:hover{box-shadow:0 6px 28px rgba(0,0,0,0.14);transform:scale(1.06);}" +
      "#compass-widget:active{transform:scale(0.94);}" +
      ".compass-rose{width:46px;height:46px;position:relative;transition:transform .15s linear;will-change:transform;}" +
      ".compass-rose svg{width:100%;height:100%;}" +
      ".compass-dir{position:absolute;bottom:-18px;left:50%;transform:translateX(-50%);font-size:9px;font-weight:800;" +
        "letter-spacing:.5px;color:#1e40af;font-family:'Inter',system-ui,sans-serif;background:rgba(255,255,255,0.9);" +
        "backdrop-filter:blur(8px);padding:1px 6px;border-radius:6px;box-shadow:0 1px 4px rgba(0,0,0,0.08);" +
        "white-space:nowrap;line-height:1.4;opacity:0;transition:opacity .3s;}" +
      "#compass-widget.visible .compass-dir{opacity:1;}" +
      ".compass-degrees{position:absolute;bottom:-32px;left:50%;transform:translateX(-50%);font-size:8px;font-weight:600;" +
        "color:#94a3b8;font-family:'Inter',system-ui,sans-serif;white-space:nowrap;line-height:1;opacity:0;transition:opacity .3s;}" +
      "#compass-widget.visible .compass-degrees{opacity:0.7;}" +
      "@media(max-width:480px){#compass-widget{top:calc(env(safe-area-inset-top, 0px) + 76px);left:10px;width:52px;height:52px;}}" +

      /* Rotate hint toast */
      "#rotate-hint{position:fixed;top:50%;left:50%;z-index:1100;transform:translate(-50%,-50%);" +
        "background:rgba(15,23,42,.75);backdrop-filter:blur(8px);color:#fff;font-size:13px;font-weight:600;" +
        "font-family:'Inter',system-ui,sans-serif;padding:10px 20px;border-radius:12px;" +
        "box-shadow:0 4px 20px rgba(0,0,0,.25);opacity:0;pointer-events:none;transition:opacity .4s;}" +
      "#rotate-hint.show{opacity:1;}" +
      "#rotate-hint i{margin-right:6px;}" +

      /* Location button states (Google Maps colours) */
      "#myLocationBtn i{color:#2563eb;transition:color .2s,transform .2s;}" +
      "#myLocationBtn.loc-active{background-color:#dbeafe !important;border:2px solid #3b82f6 !important;}" +
      "#myLocationBtn.loc-active i{color:#2563eb !important;}" +
      "#myLocationBtn.loc-searching{background-color:#fef9c3 !important;border:2px solid #f59e0b !important;}" +
      "#myLocationBtn.loc-searching i{color:#d97706 !important;animation:loc-spin 1.5s linear infinite;}" +
      "@keyframes loc-spin{from{transform:rotate(0deg);}to{transform:rotate(360deg);}}" +
      "#myLocationBtn.loc-error{background-color:#fee2e2 !important;border:2px solid #ef4444 !important;}" +
      "#myLocationBtn.loc-error i{color:#dc2626 !important;}" +
      "#myLocationBtn.loc-following{background-color:#3b82f6 !important;border:2px solid #1d4ed8 !important;}" +
      "#myLocationBtn.loc-following i{color:#fff !important;}" +
      "#myLocationBtn.loc-compass{background-color:#1d4ed8 !important;border:2px solid #1e3a8a !important;}" +
      "#myLocationBtn.loc-compass i{color:#fff !important;}" +

      /* EV markers */
      ".ev-marker-wrap{position:relative;width:58px;height:52px;display:flex;flex-direction:column;align-items:center;animation:ev-drop-in .4s cubic-bezier(.22,1.15,.64,1) both;}" +
      "@keyframes ev-drop-in{0%{opacity:0;transform:translateY(-28px) scale(.3);}100%{opacity:1;transform:translateY(0) scale(1);}}" +
      ".ev-ripple-ring{position:absolute;top:16px;left:50%;width:38px;height:38px;margin-left:-19px;margin-top:-19px;border-radius:50%;border:2px solid rgba(51,195,240,.4);animation:ev-ripple 2.8s ease-out infinite;pointer-events:none;z-index:0;}" +
      ".ev-ripple-ring:nth-child(2){animation-delay:1.4s;border-color:rgba(26,60,158,.25);}" +
      "@keyframes ev-ripple{0%{transform:scale(.45);opacity:.7;}100%{transform:scale(3);opacity:0;}}" +
      ".ev-pin-body{position:relative;z-index:2;width:52px;height:30px;background:#fff;border-radius:8px;border:2px solid #33C3F0;box-shadow:0 2px 8px rgba(51,195,240,.35),0 0 0 3px rgba(51,195,240,.07);overflow:hidden;animation:ev-glow 3s ease-in-out infinite;}" +
      "@keyframes ev-glow{0%,100%{border-color:#33C3F0;box-shadow:0 2px 8px rgba(51,195,240,.35),0 0 0 3px rgba(51,195,240,.07);}50%{border-color:#0EA5E9;box-shadow:0 2px 16px rgba(51,195,240,.5),0 0 0 5px rgba(51,195,240,.1);}}" +
      ".ev-logo-img{display:block;width:100%;height:100%;object-fit:fill;}" +
      ".ev-pin-tail{width:0;height:0;z-index:1;border-left:8px solid transparent;border-right:8px solid transparent;border-top:10px solid #33C3F0;margin-top:-1px;filter:drop-shadow(0 2px 2px rgba(0,0,0,.1));animation:ev-tail-c 3s ease-in-out infinite;}" +
      "@keyframes ev-tail-c{0%,100%{border-top-color:#33C3F0;}50%{border-top-color:#0EA5E9;}}" +
      ".ev-promo-dot{position:absolute;top:-4px;right:-4px;width:12px;height:12px;z-index:5;background:#ff1744;border-radius:50%;border:2px solid #fff;animation:ev-promo-ping 1.5s ease-out infinite;}" +
      "@keyframes ev-promo-ping{0%{box-shadow:0 0 0 0 rgba(255,23,68,.5);}70%{box-shadow:0 0 0 6px rgba(255,23,68,0);}100%{box-shadow:0 0 0 0 rgba(255,23,68,0);}}" +
      ".ev-ground-shadow{width:16px;height:4px;border-radius:50%;margin-top:1px;background:radial-gradient(ellipse,rgba(0,0,0,.15),transparent 70%);z-index:0;}" +
      ".ev-marker-closed .ev-pin-body{background:#f5f5f5;border-color:#bdbdbd;box-shadow:0 2px 6px rgba(0,0,0,.1);animation:none;}" +
      ".ev-marker-closed .ev-pin-tail{border-top-color:#bdbdbd;animation:none;}" +
      ".ev-marker-closed .ev-ripple-ring{display:none;}" +
      ".ev-marker-closed .ev-logo-img{filter:grayscale(1) opacity(.4);}";
    document.head.appendChild(style);
  }

  // ────────────────────────────────────────────────────────────
  //  Location-button UI
  // ────────────────────────────────────────────────────────────
  function createGPSBadge() { return; }
  function updateGPSBadge() { return; }

  function updateLocationButton(state) {
    var btn = document.getElementById("myLocationBtn");
    if (!btn) return;
    btn.classList.remove("loc-active", "loc-searching", "loc-error", "loc-following", "loc-compass");

    if (state === "searching") {
      btn.classList.add("loc-searching");
    } else if (state === "error") {
      btn.classList.add("loc-error");
    } else if (_locationMode === "compass") {
      btn.classList.add("loc-compass");
    } else if (_locationMode === "centered") {
      btn.classList.add("loc-following");
    } else if (state === "active") {
      btn.classList.add("loc-active");
    }
  }

  // ────────────────────────────────────────────────────────────
  //  Init
  // ────────────────────────────────────────────────────────────
  function init() {
    injectTrackingCSS();

    map = new maplibregl.Map({
      container: "map",
      style: {
        version: 8,
        sources: {
          "osm-tiles": {
            type: "raster",
            tiles: [
              "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png",
              "https://b.tile.openstreetmap.org/{z}/{x}/{y}.png",
              "https://c.tile.openstreetmap.org/{z}/{x}/{y}.png"
            ],
            tileSize: 256,
            attribution: ""
          },
          "openmaptiles": {
            type: "vector",
            url: "https://tiles.openfreemap.org/planet"
          }
        },
        layers: [
          { id: "osm-raster", type: "raster", source: "osm-tiles", minzoom: 0, maxzoom: 19 }
        ],
        glyphs: "https://fonts.openmaptiles.org/{fontstack}/{range}.pbf"
      },
      center: [PTT_CONFIG.MAP_CENTER[1], PTT_CONFIG.MAP_CENTER[0]],
      zoom: PTT_CONFIG.MAP_ZOOM,
      pitch: 0,
      bearing: 0,
      maxPitch: PTT_CONFIG.MAP_MAX_PITCH || 85,
      attributionControl: false,
      touchPitch: true,
      dragRotate: true
    });

    map.on("load", function () {
      _add3DBuildingLayer();
      _addLocationAccuracyLayer();
    });

    // Compass widget sync on manual rotate
    var rotateHintShown = false;
    map.on("rotate", function () {
      var bearing = map.getBearing();
      _syncCompassFromBearing(bearing);
      if (!rotateHintShown && Math.abs(bearing) > 5) {
        rotateHintShown = true;
        _showRotateHint();
      }
    });
    map.on("rotateend", function () {
      _syncCompassFromBearing(map.getBearing());
    });

    markers = _createMarkersStub();

    // ── Interaction: ONLY drag/pan breaks following ──
    // Zoom & pinch are allowed while following (like Google Maps)
    map.on("dragstart", function () {
      _userDragging = true;
      _userMovedSinceLocateStart = true;
      if (_dragEndTimer) { clearTimeout(_dragEndTimer); _dragEndTimer = null; }
      if (_locationMode !== "off") {
        _setLocationMode("off");
      }
    });
    map.on("dragend", function () {
      if (_dragEndTimer) clearTimeout(_dragEndTimer);
      _dragEndTimer = setTimeout(function () { _userDragging = false; }, DRAG_COOLDOWN_MS);
    });

    // Track user-initiated zoom/pinch so we can skip auto-center
    var _mapEl = map.getContainer();
    _mapEl.addEventListener("wheel", function () {
      _userMovedSinceLocateStart = true;
    }, { passive: true });
    _mapEl.addEventListener("touchmove", function () {
      _userMovedSinceLocateStart = true;
    }, { passive: true });

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

    _bind3DToggle();
  }

  // ────────────────────────────────────────────────────────────
  //  3-state location mode (Google Maps style)
  //  off → centered → compass → off
  // ────────────────────────────────────────────────────────────
  function _setLocationMode(newMode) {
    var prev = _locationMode;
    _locationMode = newMode;

    if (newMode === "off") {
      if (prev === "compass") {
        stopCompass();
        map.rotateTo(0, { duration: 400 });
      }
    } else if (newMode === "centered") {
      if (prev === "compass") {
        stopCompass();
        map.rotateTo(0, { duration: 400 });
      }
    } else if (newMode === "compass") {
      startCompass();
    }

    updateLocationButton(PTT_UTILS.getTrackingState());
  }

  function getLocationMode() { return _locationMode; }

  // ────────────────────────────────────────────────────────────
  //  Legacy markers stub
  // ────────────────────────────────────────────────────────────
  function _createMarkersStub() {
    return {
      clearLayers: function () {
        _domMarkers.forEach(function (m) { m.remove(); });
        _domMarkers = [];
      },
      addLayer: function (wrapper) {
        if (wrapper && wrapper._maplibreMarker) {
          wrapper._maplibreMarker.addTo(map);
          _domMarkers.push(wrapper._maplibreMarker);
        }
      },
      refreshClusters: function () { /* no-op */ }
    };
  }

  // ────────────────────────────────────────────────────────────
  //  3D Building Layer
  // ────────────────────────────────────────────────────────────
  function _add3DBuildingLayer() {
    if (!map.getSource("openmaptiles")) return;
    map.addLayer({
      id: "3d-buildings",
      source: "openmaptiles",
      "source-layer": "building",
      type: "fill-extrusion",
      minzoom: 14,
      paint: {
        "fill-extrusion-color": [
          "interpolate", ["linear"], ["get", "render_height"],
          0, "#e8e0d8", 20, "#d4ccc4", 50, "#c0b8b0"
        ],
        "fill-extrusion-height": [
          "interpolate", ["linear"], ["zoom"],
          14, 0, 15.5, ["get", "render_height"]
        ],
        "fill-extrusion-base": [
          "interpolate", ["linear"], ["zoom"],
          14, 0, 15.5, ["get", "render_min_height"]
        ],
        "fill-extrusion-opacity": 0.7
      },
      layout: { visibility: "none" }
    });
  }

  function _addLocationAccuracyLayer() {
    map.addSource("location-accuracy", {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] }
    });
    map.addLayer({
      id: "location-accuracy-fill",
      type: "fill",
      source: "location-accuracy",
      paint: { "fill-color": "rgba(66,133,244,0.1)", "fill-opacity": 1 }
    });
    map.addLayer({
      id: "location-accuracy-border",
      type: "line",
      source: "location-accuracy",
      paint: { "line-color": "rgba(66,133,244,0.3)", "line-width": 1 }
    });
  }

  // ────────────────────────────────────────────────────────────
  //  3D Toggle
  // ────────────────────────────────────────────────────────────
  function _bind3DToggle() {
    var btn = document.getElementById("toggle3DBtn");
    if (!btn) return;
    btn.addEventListener("click", function () {
      is3DEnabled = !is3DEnabled;
      btn.classList.toggle("active", is3DEnabled);
      if (is3DEnabled) {
        map.easeTo({ pitch: PTT_CONFIG.MAP_PITCH || 60, duration: 1000 });
        if (map.getLayer("3d-buildings")) {
          map.setLayoutProperty("3d-buildings", "visibility", "visible");
        }
      } else {
        map.easeTo({ pitch: 0, duration: 1000 });
        if (map.getLayer("3d-buildings")) {
          map.setLayoutProperty("3d-buildings", "visibility", "none");
        }
      }
    });
  }

  // ────────────────────────────────────────────────────────────
  //  Live location subscription
  // ────────────────────────────────────────────────────────────
  function ensureLiveLocationSubscription() {
    if (liveLocationUnsubscribe) return;
    liveLocationUnsubscribe = PTT_UTILS.subscribeToLocationUpdates(function (location) {
      renderCurrentLocation(location, {
        center: _locationMode !== "off",
        zoom: map.getZoom() < PTT_CONFIG.DETAIL_ZOOM ? PTT_CONFIG.DETAIL_ZOOM : map.getZoom(),
        openPopup: false,
        animate: true,
      });
    });
  }

  // ────────────────────────────────────────────────────────────
  //  Render blue dot + optional center/popup
  // ────────────────────────────────────────────────────────────
  function renderCurrentLocation(location, options) {
    if (!location) return null;
    var settings = options || {};
    var lat = parseFloat(location.lat);
    var lng = parseFloat(location.lng);
    var accuracy = Math.max(20, Math.min(Number(location.accuracy) || 80, 500));

    if (map.getSource && map.getSource("location-accuracy")) {
      map.getSource("location-accuracy").setData(_createGeoJSONCircle([lng, lat], accuracy));
    }

    if (!currentLocationMarker) {
      var el = document.createElement("div");
      el.innerHTML =
        '<div class="gm-blue-dot-outer">' +
          '<div class="gm-heading-cone" id="gm-heading-cone">' +
            '<svg viewBox="0 0 100 100"><path d="M50 50 L22 0 Q50 12 78 0 Z" fill="rgba(66,133,244,0.38)" /></svg>' +
          '</div>' +
          '<div class="gm-blue-dot-ring"></div>' +
          '<div class="gm-blue-dot-core"></div>' +
        '</div>';
      el.style.width = "22px";
      el.style.height = "22px";

      currentLocationMarker = new maplibregl.Marker({ element: el, anchor: "center" })
        .setLngLat([lng, lat])
        .addTo(map);

      _currentLat = lat;
      _currentLng = lng;
      _currentRadius = accuracy;

      setTimeout(function () {
        headingConeElement = document.getElementById("gm-heading-cone");
        if (headingConeElement && compassEnabled && currentHeading !== null) {
          headingConeElement.classList.add("active");
          headingConeElement.style.transform = "rotate(" + currentHeading + "deg)";
        }
      }, 50);
      applyPosition(lat, lng, accuracy);
    } else if (settings.animate !== false) {
      animateLocationUpdate(lat, lng, accuracy);
    } else {
      applyPosition(lat, lng, accuracy);
    }

    // Center map — only when mode is centered/compass AND user isn't dragging
    if (settings.center && !isAnimating && !_userDragging) {
      var targetZoom = settings.zoom || PTT_CONFIG.DETAIL_ZOOM;
      if (map.getZoom() < targetZoom) {
        map.flyTo({ center: [lng, lat], zoom: targetZoom, duration: 400 });
      } else {
        map.panTo([lng, lat], { duration: 300 });
      }
    }

    // Popup (only on first locate, not re-clicks)
    if (settings.openPopup === true) {
      if (currentLocationPopup) {
        currentLocationPopup.remove();
        currentLocationPopup = null;
      }
      currentLocationPopup = new maplibregl.Popup({ offset: 12, closeButton: false })
        .setLngLat([lng, lat])
        .setHTML("You are here.")
        .addTo(map);
    }
    return location;
  }

  // ────────────────────────────────────────────────────────────
  //  Live tracking start / stop
  // ────────────────────────────────────────────────────────────
  function startLiveLocationTracking(options) {
    var settings = options || {};
    ensureLiveLocationSubscription();
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
    _isLocating = false;
    PTT_UTILS.stopLocationWatch();
    if (liveLocationUnsubscribe) {
      liveLocationUnsubscribe();
      liveLocationUnsubscribe = null;
    }
    if (currentLocationPopup) {
      currentLocationPopup.remove();
      currentLocationPopup = null;
    }
    _setLocationMode("off");
  }

  // ────────────────────────────────────────────────────────────
  //  Station markers
  // ────────────────────────────────────────────────────────────
  function isEVPage() {
    var cfg = window.PTT_PAGE_CONFIG;
    return cfg && cfg.autoSelectFilter && cfg.autoSelectFilter.item === "EV";
  }

  function stationHasEV(station) {
    if (!station) return false;
    var op = station.other_product;
    if (Array.isArray(op)) {
      return op.some(function (v) { return v && v.toUpperCase() === "EV"; });
    }
    return typeof op === "string" && op.toUpperCase() === "EV";
  }

  function _createEVMarkerElement(station) {
    var isOpen = PTT_UTILS.isStationOpen(station);
    var hasPromotions = station.promotions && station.promotions.length > 0;
    var logoSrc = PTT_CONFIG.IMAGE_BASE_URL + 'ev_marker.png';
    var el = document.createElement("div");
    el.innerHTML =
      '<div class="ev-marker-wrap' + (isOpen ? '' : ' ev-marker-closed') + '">' +
        '<div class="ev-ripple-ring"></div><div class="ev-ripple-ring"></div>' +
        '<div class="ev-pin-body">' +
          '<img class="ev-logo-img" src="' + logoSrc + '" alt="EV" />' +
          (hasPromotions ? '<div class="ev-promo-dot"></div>' : '') +
        '</div>' +
        '<div class="ev-pin-tail"></div><div class="ev-ground-shadow"></div>' +
      '</div>';
    el.style.width = "58px";
    el.style.height = "52px";
    return el;
  }

  function _createStationMarkerElement(station) {
    var iconUrl = PTT_UTILS.getIconUrl(station);
    var hasPromotions = station.promotions && station.promotions.length > 0;
    var el = document.createElement("div");
    el.innerHTML =
      '<div class="custom-icon-container" style="position: relative;">' +
      '<img src="' + iconUrl + '" alt="station status" class="station-icon" style="width: 41px; height: 62px;">' +
      (hasPromotions
        ? '<div class="red-dot animate" style="position:absolute;top:0;right:0;width:12px;height:12px;background-color:red;border-radius:50%;border:2px solid white;"></div>'
        : "") +
      '</div>';
    el.style.width = "41px";
    el.style.height = "62px";
    return el;
  }

  function createStationIcon(station) {
    if (isEVPage() && stationHasEV(station)) {
      return _createEVMarkerElement(station);
    }
    return _createStationMarkerElement(station);
  }

  function buildStationMarker(station, onClick) {
    var el = createStationIcon(station);

    var mlMarker = new maplibregl.Marker({ element: el, anchor: "bottom" })
      .setLngLat([parseFloat(station.longitude), parseFloat(station.latitude)]);

    if (typeof onClick === "function") {
      el.addEventListener("click", function (e) {
        e.stopPropagation();
        onClick(wrapper, station);
      });
    }

    var wrapper = {
      _maplibreMarker: mlMarker,
      _station: station,
      getLatLng: function () {
        var ll = mlMarker.getLngLat();
        return { lat: ll.lat, lng: ll.lng };
      },
      setIcon: function (newEl) {
        var oldEl = mlMarker.getElement();
        oldEl.innerHTML = newEl.innerHTML;
      },
      openPopup: function () { },
      setLatLng: function (latlng) {
        var lat2 = latlng.lat || latlng[0];
        var lng2 = latlng.lng || latlng[1];
        mlMarker.setLngLat([lng2, lat2]);
      }
    };

    return wrapper;
  }

  function setMarkers(entries) {
    allMarkers = entries.slice();
    markers.clearLayers();
    entries.forEach(function (entry) {
      markers.addLayer(entry.marker);
    });
    startMarkerAutoRefresh();
  }

  function startMarkerAutoRefresh() {
    if (iconRefreshTimer) clearInterval(iconRefreshTimer);
    iconRefreshTimer = setInterval(refreshStationIcons, 60 * 1000);
  }

  function refreshStationIcons() {
    allMarkers.forEach(function (entry) {
      var newEl = createStationIcon(entry.data);
      entry.marker.setIcon(newEl);
    });
  }

  function fitToAllMarkers() {
    if (!allMarkers.length) return;
    var bounds = new maplibregl.LngLatBounds();
    allMarkers.forEach(function (entry) {
      var ll = entry.marker.getLatLng();
      bounds.extend([ll.lng, ll.lat]);
    });
    map.fitBounds(bounds, {
      animate: true,
      duration: PTT_CONFIG.FLY_DURATION * 1000,
      padding: 30
    });
  }

  function focusMarkers(markerList) {
    if (!markerList || !markerList.length) return;
    var bounds = new maplibregl.LngLatBounds();
    markerList.forEach(function (m) {
      if (m._maplibreMarker) {
        var ll = m._maplibreMarker.getLngLat();
        bounds.extend([ll.lng, ll.lat]);
      } else if (m.getLatLng) {
        var ll2 = m.getLatLng();
        bounds.extend([ll2.lng, ll2.lat]);
      }
    });
    map.fitBounds(bounds, {
      animate: true,
      duration: PTT_CONFIG.FLY_DURATION * 1000
    });
  }

  function focusLocation(lat, lng, zoom) {
    map.flyTo({
      center: [parseFloat(lng), parseFloat(lat)],
      zoom: zoom || PTT_CONFIG.DETAIL_ZOOM,
      duration: 500
    });
  }

  // ────────────────────────────────────────────────────────────
  //  Main entry — setMapToCurrentLocation
  //  Called on button click (via app.js) and on boot (silent).
  // ────────────────────────────────────────────────────────────
  function setMapToCurrentLocation(options) {
    var settings = options || {};
    var targetZoom = settings.zoom || PTT_CONFIG.DETAIL_ZOOM;

    // ── Cycle mode on re-click when marker already exists ──
    if (currentLocationMarker && (_currentLat || _currentLng)) {
      if (settings.follow) {
        // Button was tapped — cycle: off → centered → compass → off
        if (_locationMode === "off") {
          _setLocationMode("centered");
          ensureLiveLocationSubscription();
        } else if (_locationMode === "centered") {
          _setLocationMode("compass");
        } else {
          // compass → off
          _setLocationMode("off");
          return Promise.resolve({ lat: _currentLat, lng: _currentLng });
        }
      }
      // Fly / pan to current position
      _userDragging = false;
      if (map.getZoom() < targetZoom) {
        map.flyTo({ center: [_currentLng, _currentLat], zoom: targetZoom, duration: 400 });
      } else {
        map.panTo([_currentLng, _currentLat], { duration: 300 });
      }
      return Promise.resolve({ lat: _currentLat, lng: _currentLng });
    }

    // ── Allow button click to override a pending silent/boot locate ──
    if (_isLocating) {
      if (settings.follow) {
        // User tapped button while background locate is pending — take over
        _isLocating = false;
        // Fall through to start a fresh locate with follow mode
      } else {
        return Promise.resolve(null);
      }
    }

    _isLocating = true;
    _userMovedSinceLocateStart = false;
    updateLocationButton("searching");

    // Set mode to centered for follow (button click)
    if (settings.follow) {
      _locationMode = "centered";
    }
    ensureLiveLocationSubscription();

    // ── Try cached location first for instant feedback ──
    var cached = PTT_UTILS.getLastKnownLocation();
    if (cached) {
      _isLocating = false;
      renderCurrentLocation(cached, {
        center: settings.follow === true,
        zoom: targetZoom,
        openPopup: settings.openPopup === true,
        animate: false,
      });
      updateLocationButton("active");
      startLiveLocationTracking({
        centerOnFirstFix: false, openPopup: false, zoom: targetZoom,
      }).catch(function () {});
      return Promise.resolve(cached);
    }

    // ── Use watchPosition directly — skip redundant getCurrentPosition ──
    // This is faster (single GPS call) and truly non-blocking.
    // The user can freely zoom, pan, and explore while the GPS fix arrives.
    return startLiveLocationTracking({
      centerOnFirstFix: false,
      openPopup: false,
      zoom: targetZoom,
    }).then(function (location) {
      _isLocating = false;

      // Decide whether to auto-center the map:
      //  • follow mode: the live subscription already handles centering
      //    (because _locationMode is "centered", renderCurrentLocation pans)
      //  • non-follow, non-silent: center only if user hasn't interacted
      //  • silent (boot): never auto-center — just place the blue dot
      if (!settings.follow && !settings.silent && !_userMovedSinceLocateStart && location) {
        if (map.getZoom() < targetZoom) {
          map.flyTo({ center: [location.lng, location.lat], zoom: targetZoom, duration: 400 });
        } else {
          map.panTo([location.lng, location.lat], { duration: 300 });
        }
      }

      if (settings.openPopup === true && location) {
        if (currentLocationPopup) {
          currentLocationPopup.remove();
          currentLocationPopup = null;
        }
        currentLocationPopup = new maplibregl.Popup({ offset: 12, closeButton: false })
          .setLngLat([location.lng, location.lat])
          .setHTML("You are here.")
          .addTo(map);
      }

      updateLocationButton("active");
      return location;
    }).catch(function (error) {
      _isLocating = false;
      _setLocationMode("off");
      updateLocationButton("error");
      console.error("Error getting current location:", error);
      if (!settings.silent) {
        alert("Error getting your location. Please try again later.");
      }
      throw error;
    });
  }

  // ────────────────────────────────────────────────────────────
  //  Compass
  // ────────────────────────────────────────────────────────────
  var DIRECTIONS = ["N","NE","E","SE","S","SW","W","NW"];
  function _headingToDirection(deg) {
    var idx = Math.round(((deg % 360) + 360) % 360 / 45) % 8;
    return DIRECTIONS[idx];
  }

  function recenterToCurrentLocation(options) {
    var settings = options || {};
    var targetZoom = settings.zoom || PTT_CONFIG.DETAIL_ZOOM;
    var cached = PTT_UTILS.getLastKnownLocation();
    if (cached) {
      map.flyTo({ center: [cached.lng, cached.lat], zoom: targetZoom, duration: PTT_CONFIG.FLY_DURATION * 1000 });
      return Promise.resolve(cached);
    }
    return PTT_UTILS.getCurrentLocation()
      .then(function (loc) {
        map.flyTo({ center: [loc.lng, loc.lat], zoom: targetZoom, duration: PTT_CONFIG.FLY_DURATION * 1000 });
        return loc;
      });
  }

  function _showRotateHint() {
    var hint = document.getElementById("rotate-hint");
    if (!hint) {
      hint = document.createElement("div");
      hint.id = "rotate-hint";
      hint.innerHTML = '<i class="fas fa-sync-alt"></i> Tap compass to reset north';
      document.body.appendChild(hint);
    }
    setTimeout(function () { hint.classList.add("show"); }, 50);
    setTimeout(function () { hint.classList.remove("show"); }, 2500);
  }

  function _animateBearingTo(targetBearing) {
    map.rotateTo(targetBearing, { duration: 400 });
  }

  function _createCompassWidget() {
    if (compassWidgetEl) return;
    compassWidgetEl = document.createElement("div");
    compassWidgetEl.id = "compass-widget";
    compassWidgetEl.innerHTML =
      '<div class="compass-rose" id="compass-rose">' +
        '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">' +
          '<polygon points="50,6 43,44 57,44" fill="#EF4444" />' +
          '<polygon points="50,94 43,56 57,56" fill="#CBD5E1" />' +
          '<polygon points="94,50 56,43 56,57" fill="#CBD5E1" />' +
          '<polygon points="6,50 44,43 44,57" fill="#CBD5E1" />' +
          '<circle cx="50" cy="50" r="6" fill="#fff" stroke="#E2E8F0" stroke-width="1.5"/>' +
          '<circle cx="50" cy="50" r="3" fill="#3B82F6"/>' +
          '<text x="50" y="22" text-anchor="middle" font-size="9" font-weight="800" fill="#EF4444" font-family="Inter,system-ui,sans-serif">N</text>' +
          '<text x="79" y="53" text-anchor="middle" font-size="8" font-weight="700" fill="#94A3B8" font-family="Inter,system-ui,sans-serif">E</text>' +
          '<text x="50" y="84" text-anchor="middle" font-size="8" font-weight="700" fill="#94A3B8" font-family="Inter,system-ui,sans-serif">S</text>' +
          '<text x="21" y="53" text-anchor="middle" font-size="8" font-weight="700" fill="#94A3B8" font-family="Inter,system-ui,sans-serif">W</text>' +
        '</svg>' +
      '</div>' +
      '<span class="compass-dir" id="compass-dir">N</span>' +
      '<span class="compass-degrees" id="compass-deg">0°</span>';
    document.body.appendChild(compassWidgetEl);
    compassWidgetEl.addEventListener("click", function () {
      _animateBearingTo(0);
      recenterToCurrentLocation().catch(function () {});
    });
  }

  /**
   * _updateCompassUI — called on every device-orientation event.
   *  • Always updates: compass widget needle + blue-dot heading cone (DOM only, fast)
   *  • Only rotates the MAP when in "compass" mode, throttled, and user isn't dragging
   *  • Uses jumpTo (instant) instead of rotateTo (animated) to avoid blocking gestures
   */
  function _updateCompassUI(deg) {
    // 1) Compass widget needle (always — cheap DOM transform)
    var roseEl = document.getElementById("compass-rose");
    if (roseEl) roseEl.style.transform = "rotate(" + (-deg) + "deg)";
    var dirEl = document.getElementById("compass-dir");
    if (dirEl) dirEl.textContent = _headingToDirection(deg);
    var degEl = document.getElementById("compass-deg");
    if (degEl) degEl.textContent = Math.round(deg) + "°";

    // 2) Blue-dot heading cone (always — CSS transition smooths it)
    if (headingConeElement) {
      headingConeElement.style.transform = "rotate(" + deg + "deg)";
      if (!headingConeElement.classList.contains("active")) {
        headingConeElement.classList.add("active");
      }
    }

    // 3) Rotate the actual map ONLY in compass mode, throttled, instant
    if (_locationMode === "compass" && compassEnabled && map && !_userDragging) {
      var now = performance.now();
      if (now - _lastCompassApply >= COMPASS_THROTTLE_MS) {
        _lastCompassApply = now;
        // jumpTo = instant, never queues animations, never blocks gestures
        map.jumpTo({ bearing: deg });
      }
    }
  }

  function _syncCompassFromBearing(bearing) {
    var deg = ((bearing % 360) + 360) % 360;
    if (!compassWidgetEl) _createCompassWidget();
    if (compassWidgetEl && deg > 1) compassWidgetEl.classList.add("visible");
    var roseEl = document.getElementById("compass-rose");
    if (roseEl) roseEl.style.transform = "rotate(" + (-deg) + "deg)";
    var dirEl = document.getElementById("compass-dir");
    if (dirEl) dirEl.textContent = _headingToDirection(deg);
    var degEl = document.getElementById("compass-deg");
    if (degEl) degEl.textContent = Math.round(deg) + "°";
    if (deg < 2 && !compassEnabled) {
      if (compassWidgetEl) compassWidgetEl.classList.remove("visible");
    }
  }

  function _onDeviceOrientation(e) {
    var heading = null;
    if (typeof e.webkitCompassHeading === "number") {
      heading = e.webkitCompassHeading;
    } else if (e.absolute === true && typeof e.alpha === "number") {
      heading = (360 - e.alpha) % 360;
    } else if (typeof e.alpha === "number") {
      heading = (360 - e.alpha) % 360;
    }
    if (heading === null || isNaN(heading)) return;
    currentHeading = Math.round(heading);
    _updateCompassUI(currentHeading);
  }

  function startCompass() {
    if (compassEnabled) return;
    compassEnabled = true;
    _createCompassWidget();
    if (compassWidgetEl) compassWidgetEl.classList.add("visible");
    if (typeof DeviceOrientationEvent !== "undefined" &&
        typeof DeviceOrientationEvent.requestPermission === "function") {
      DeviceOrientationEvent.requestPermission()
        .then(function (state) {
          if (state === "granted") {
            window.addEventListener("deviceorientation", _onDeviceOrientation, true);
          } else {
            compassEnabled = false;
            if (compassWidgetEl) compassWidgetEl.classList.remove("visible");
          }
        })
        .catch(function () {
          compassEnabled = false;
          if (compassWidgetEl) compassWidgetEl.classList.remove("visible");
        });
    } else if ("DeviceOrientationEvent" in window) {
      window.addEventListener("deviceorientation", _onDeviceOrientation, true);
    }
    if (headingConeElement) headingConeElement.classList.add("active");
  }

  function stopCompass() {
    compassEnabled = false;
    currentHeading = null;
    window.removeEventListener("deviceorientation", _onDeviceOrientation, true);
    if (compassWidgetEl) compassWidgetEl.classList.remove("visible");
    if (headingConeElement) headingConeElement.classList.remove("active");
    var dirEl = document.getElementById("compass-dir");
    if (dirEl) dirEl.textContent = "N";
    var degEl = document.getElementById("compass-deg");
    if (degEl) degEl.textContent = "0°";
  }

  function toggleCompass() {
    if (compassEnabled) stopCompass(); else startCompass();
    return compassEnabled;
  }

  function isCompassEnabled() { return compassEnabled; }

  // ────────────────────────────────────────────────────────────
  //  Public API
  // ────────────────────────────────────────────────────────────
  return {
    init: init,
    createStationIcon: createStationIcon,
    buildStationMarker: buildStationMarker,
    setMarkers: setMarkers,
    refreshStationIcons: refreshStationIcons,
    fitToAllMarkers: fitToAllMarkers,
    focusMarkers: focusMarkers,
    focusLocation: focusLocation,
    recenterToCurrentLocation: recenterToCurrentLocation,
    startLiveLocationTracking: startLiveLocationTracking,
    stopLiveLocationTracking: stopLiveLocationTracking,
    setMapToCurrentLocation: setMapToCurrentLocation,
    startCompass: startCompass,
    stopCompass: stopCompass,
    toggleCompass: toggleCompass,
    isCompassEnabled: isCompassEnabled,
    getLocationMode: getLocationMode,
    setBearing: function (deg) { if (map) map.rotateTo(deg, { duration: 100 }); },
    getBearing: function () { return map ? map.getBearing() : 0; },
    resetBearing: function () { _animateBearingTo(0); },
  };
})();

var setMapToCurrentLocation = function (options) {
  return MapManager.setMapToCurrentLocation(options);
};
