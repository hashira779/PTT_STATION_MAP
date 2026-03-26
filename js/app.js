/**
 * ============================================================
 *  PTT Station Map — App Bootstrap
 *  Shared entrypoint used by all HTML pages through PTT_PAGE_CONFIG.
 *  Depends on: all shared modules
 * ============================================================
 */
(function () {
  "use strict";

  function init() {
    MapManager.init();
    _bindLocationButton();
    _bindRecenterButton();
    _bindLifecycleEvents();
    NearbyManager.init();
    OilPriceManager.init();
    _loadStations();
  }

  function _bindLocationButton() {
    var btn = document.getElementById("myLocationBtn");
    if (btn) {
      btn.addEventListener("click", function () {
        MapManager.setMapToCurrentLocation({ follow: true, openPopup: true });
        // Auto-start compass when tracking location (user gesture-safe)
        if (!MapManager.isCompassEnabled()) {
          MapManager.startCompass();
        }
      });
    }
  }

  function _bindRecenterButton() {
    var btn = document.getElementById("recenterBtn");
    if (btn) {
      btn.addEventListener("click", function () {
        MapManager.recenterToCurrentLocation().catch(function () {
          alert("Unable to get your location.");
        });
      });
    }
  }

  function _bindLifecycleEvents() {
    function stopLiveLocation() {
      if (MapManager.stopLiveLocationTracking) {
        MapManager.stopLiveLocationTracking();
      }
    }

    window.addEventListener("pagehide", stopLiveLocation);
    window.addEventListener("beforeunload", stopLiveLocation);
  }

  function _loadStations() {
    var cfg = window.PTT_PAGE_CONFIG || {};
    var dataUrl = PTT_CONFIG.DATA_BASE_URL + (cfg.dataUrl || "markers.json");
    var promoUrl = PTT_CONFIG.DATA_BASE_URL + "promotions.json";

    Promise.all([
      PTT_UTILS.fetchJSON(dataUrl),
      PTT_UTILS.fetchJSON(promoUrl),
      PTT_UTILS.fetchJSON(PTT_CONFIG.SCHEDULE_CONFIG_URL).catch(function () {
        return null;
      }),
    ])
      .then(function (results) {
        var stations = results[0].STATION || [];
        var promotions = results[1].PROMOTIONS || [];
        var scheduleConfig = results[2];

        if (scheduleConfig) {
          PTT_CONFIG.setScheduleConfig(scheduleConfig);
        }

        stations.forEach(function (station) {
          var stationPromotions = promotions.find(function (promo) {
            return PTT_UTILS.normalizeId(promo.station_id) === PTT_UTILS.normalizeId(station.id);
          });
          station.promotions = stationPromotions ? stationPromotions.promotions : [];
        });

        FilterManager.init(stations);
        _createStationMarkers(stations);
        PromotionManager.init(stations);
        FilterManager.autoSelectFilter();
        MapManager.fitToAllMarkers();
        MapManager.setMapToCurrentLocation({ follow: false, openPopup: false });
      })
      .catch(function (error) {
        console.error("Error loading station app data:", error);
      });
  }

  function _createStationMarkers(stations) {
    var entries = stations.map(function (station) {
      var imageUrl = PTT_UTILS.getStationPictureUrl(station);
      var marker = MapManager.buildStationMarker(station, function () {
        _onMarkerClick(station, imageUrl);
      });
      return { marker: marker, data: station };
    });

    MapManager.setMarkers(entries);
  }

  function _onMarkerClick(station, imageUrl) {
    if (map.getZoom() < PTT_CONFIG.DETAIL_ZOOM) {
      map.flyTo([station.latitude, station.longitude], PTT_CONFIG.DETAIL_ZOOM, {
        animate: true,
        duration: PTT_CONFIG.FLY_DURATION,
      });
      setTimeout(function () {
        _showStation(station, imageUrl);
      }, PTT_CONFIG.FLY_DURATION * 1000);
      return;
    }
    _showStation(station, imageUrl);
  }

  function _showStation(station, imageUrl) {
    ModalRenderer.showStationModal(station, imageUrl);

    var loc = PTT_UTILS.getLastKnownLocation();

    // ★ INSTANT: show estimate immediately (zero network wait)
    if (loc) {
      var km = PTT_UTILS.calculateDistance(
        loc.lat, loc.lng,
        parseFloat(station.latitude), parseFloat(station.longitude)
      );
      var est = RouteService.estimateFromDistance(km);
      ModalRenderer.updateRouteInfo(est.distance, est.travelTime, station);

      // ★ UPGRADE: fetch real route in background, replace when ready
      RouteService.getRoute(loc.lat, loc.lng, station.latitude, station.longitude)
        .then(function (route) {
          ModalRenderer.updateRouteInfo(route.distance, route.travelTime, station);
        })
        .catch(function () { /* estimate already showing, no action */ });
      return;
    }

    // No cached location yet — show spinner, get location first
    var routeEl = document.getElementById("route-info");
    if (routeEl) {
      var s = PTT_UTILS.getStatusInfo(station);
      routeEl.innerHTML =
        '<div class="badge bg-secondary text-white mx-1"><i class="fas fa-spinner fa-spin me-1"></i> Locating…</div>' +
        '<div class="badge ' + s.badgeClass + ' text-white mx-1"><i class="fas ' + s.iconClass + ' icon-background"></i> ' + s.displayText + '</div>';
    }

    PTT_UTILS.getCurrentLocation()
      .then(function (l) {
        var km2 = PTT_UTILS.calculateDistance(
          l.lat, l.lng,
          parseFloat(station.latitude), parseFloat(station.longitude)
        );
        var est2 = RouteService.estimateFromDistance(km2);
        ModalRenderer.updateRouteInfo(est2.distance, est2.travelTime, station);

        return RouteService.getRoute(l.lat, l.lng, station.latitude, station.longitude);
      })
      .then(function (route) {
        ModalRenderer.updateRouteInfo(route.distance, route.travelTime, station);
      })
      .catch(function () { /* estimate already showing or no location */ });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
