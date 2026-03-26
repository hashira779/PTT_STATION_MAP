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
      "#myLocationBtn.loc-following i{color:#fff !important;}";

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

    map = L.map("map").setView(PTT_CONFIG.MAP_CENTER, PTT_CONFIG.MAP_ZOOM);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
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
            marker.options.icon.options.html.indexOf("red-dot") !== -1
          );
        });

        var clusterHtml =
          '<div class="cluster-icon-container" style="position: relative;">' +
          (hasPromotions
            ? '<div class="red-dot animate" style="position:absolute;top:0;right:0;"></div>'
            : "") +
          '<div class="cluster-number" style="background: rgba(0, 27, 255, 0.8); border-radius: 50%; color: white; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center;">' +
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
  function createStationIcon(station) {
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
    map.fitBounds(group.getBounds());
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
  };
})();

var setMapToCurrentLocation = function (options) {
  return MapManager.setMapToCurrentLocation(options);
};
