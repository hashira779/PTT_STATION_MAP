/**
 * ============================================================
 *  PTT Station Map — Nearby Manager
 *  Unified nearby-stations logic for modal and offcanvas UIs.
 *  Depends on: config.js, utils.js, routeService.js, modalRenderer.js, filterManager.js
 *  Globals: map, markers, allMarkers
 * ============================================================
 */
var NearbyManager = (function () {
  "use strict";

  function init() {
    var btn = document.getElementById("nearbyStationsBtn");
    if (btn) btn.addEventListener("click", _onNearbyClick);
  }

  function _onNearbyClick() {
    PTT_UTILS.getCurrentLocation()
      .then(function (loc) {
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
            var promoData = results[1].PROMOTIONS || [];
            var scheduleConfig = results[2];

            if (scheduleConfig) {
              PTT_CONFIG.setScheduleConfig(scheduleConfig);
            }

            stations.forEach(function (st) {
              var found = promoData.find(function (p) {
                return PTT_UTILS.normalizeId(p.station_id) === PTT_UTILS.normalizeId(st.id);
              });
              st.promotions = found ? found.promotions : [];
            });

            // Use freshest live location if available
            var freshLoc = PTT_UTILS.getLastKnownLocation() || loc;
            var nearby = _findNearby(freshLoc, stations, 10);
            _renderList(freshLoc, nearby);
          })
          .catch(function (err) { console.error("Error fetching nearby data:", err); });
      })
      .catch(function () {
        alert("Error getting your location. Please try again later.");
      });
  }

  function _findNearby(currentLocation, stations, maxDistance) {
    var filters = FilterManager.getSelectedFilters();

    return stations
      .map(function (st) {
        st.distance = parseFloat(PTT_UTILS.calculateDistance(
          parseFloat(currentLocation.lat), parseFloat(currentLocation.lng),
          parseFloat(st.latitude), parseFloat(st.longitude)
        ).toFixed(1));
        return st;
      })
      .filter(function (st) { return st.distance <= maxDistance; })
      .filter(function (st) {
        if (filters.length === 0) return true;
        return (
          _anyMatch(st.description, filters) ||
          _anyMatch(st.product, filters) ||
          _anyMatch(st.other_product, filters) ||
          _anyMatch(st.service, filters)
        );
      })
      .sort(function (a, b) { return a.distance - b.distance; });
  }

  function _anyMatch(arr, filters) {
    return arr && arr.some(function (v) { return filters.includes(v); });
  }

  function _renderList(currentLocation, stations) {
    var listEl = document.getElementById("nearbyStationsList");
    if (!listEl) return;
    listEl.innerHTML = "";

    if (stations.length === 0) {
      listEl.innerHTML = '<li class="list-group-item">No nearby stations found.</li>';
      _showNearbyUI();
      return;
    }

    // ★ INSTANT: render list immediately with Haversine distances
    stations.forEach(function (station) {
      listEl.appendChild(_createListItem(station, currentLocation));
    });

    _showNearbyUI();

    // ★ UPGRADE: fetch real route distances in background, update in-place
    stations.forEach(function (st, idx) {
      RouteService.getDistance(
        currentLocation.lat, currentLocation.lng, st.latitude, st.longitude
      ).then(function (d) {
        st.distance = parseFloat(Number(d).toFixed(1));
        var badge = listEl.querySelectorAll(".distance-badge")[idx];
        if (badge) badge.innerHTML = '<i class="fas fa-location-arrow me-1"></i>≈' + st.distance + ' km';
      }).catch(function () { /* Haversine already showing */ });
    });
  }

  function _createListItem(station, currentLocation) {
    var li = document.createElement("li");
    li.classList.add("list-group-item");

    var statusInfo = PTT_UTILS.getStatusInfo(station);
    var isOpen = PTT_UTILS.isStationOpen(station);
    li.classList.add(isOpen ? "open-station" : "closed-station");

    var picUrl = PTT_UTILS.getStationPictureUrl(station);

    var descHTML = _iconRow(station.description, PTT_UTILS.getItemIcon);
    var prodHTML = _iconRow(station.product, PTT_UTILS.getProductIcon);
    var otherHTML = _iconRow(station.other_product, PTT_UTILS.getProductIcon);
    var servHTML = _iconRow(station.service, PTT_UTILS.getItemIcon);
    var promoHTML = station.promotions && station.promotions.length
      ? '<div class="icons">' + station.promotions.map(function (p) {
          return '<img src="' + PTT_UTILS.getPromotionImageUrl(p.promotion_id) + '" alt="' + p.promotion_id + '">';
        }).join("") + "</div>"
      : "";

    li.innerHTML =
      '<div class="d-flex align-items-start">' +
      '  <div>' +
      '    <img src="' + picUrl + '" alt="' + station.title + '" class="img-thumbnail me-3" style="width:100px;height:100px;object-fit:cover;">' +
      '    <div class="d-flex flex-column align-items-start gap-1 mt-2">' +
      '      <div class="badge ' + statusInfo.badgeClass + ' text-white small"><i class="fas ' + statusInfo.iconClass + ' me-1"></i> ' + statusInfo.displayText + '</div>' +
      '      <div class="badge bg-primary text-white small distance-badge"><i class="fas fa-location-arrow me-1"></i>≈' + station.distance + ' km</div>' +
      '    </div>' +
      '  </div>' +
      '  <div class="flex-grow-1">' +
      '    <div class="station-details">' +
      '      <h6>' + station.title + '</h6>' +
      '      <p class="mb-1">' + station.address + '</p>' +
      descHTML + prodHTML + otherHTML + servHTML + promoHTML +
      '    </div>' +
      '  </div>' +
      '</div>';

    li.addEventListener("click", function () {
      // Use live location for the route if available
      var routeLoc = PTT_UTILS.getLastKnownLocation() || currentLocation;
      map.flyTo([parseFloat(station.latitude), parseFloat(station.longitude)], PTT_CONFIG.DETAIL_ZOOM, {
        animate: true,
        duration: 0.4,
      });
      var found = allMarkers.find(function (m) {
        return parseFloat(m.data.latitude) === parseFloat(station.latitude) &&
               parseFloat(m.data.longitude) === parseFloat(station.longitude);
      });
      if (found) {
        setTimeout(function () {
          found.marker.openPopup();
        }, 450);
        ModalRenderer.showStationModal(station, picUrl);
        _fetchAndShowRoute(routeLoc, station);
      }
      _hideNearbyUI();
    });

    return li;
  }

  function _iconRow(arr, iconFn) {
    var items = (arr || []).filter(Boolean);
    if (!items.length) return "";
    return '<div class="icons">' + items.map(function (v) {
      return '<img src="' + iconFn(v) + '" alt="' + v + '">';
    }).join("") + "</div>";
  }

  function _fetchAndShowRoute(currentLocation, station) {
    RouteService.getRoute(
      currentLocation.lat, currentLocation.lng,
      station.latitude, station.longitude
    )
      .then(function (r) { ModalRenderer.updateRouteInfo(r.distance, r.travelTime, station); })
      .catch(function () {
        // Fallback: straight-line estimate with time
        var km = PTT_UTILS.calculateDistance(
          currentLocation.lat, currentLocation.lng,
          parseFloat(station.latitude), parseFloat(station.longitude)
        );
        var est = RouteService.estimateFromDistance(km);
        ModalRenderer.updateRouteInfo(est.distance, est.travelTime, station);
      });
  }

  function _showNearbyUI() {
    var modalEl = document.getElementById("nearbyStationsModal");
    if (modalEl) {
      new bootstrap.Modal(modalEl, { keyboard: false }).show();
      return;
    }
    var ocEl = document.getElementById("nearbyStationsOffcanvas");
    if (ocEl) {
      new bootstrap.Offcanvas(ocEl).show();
    }
  }

  function _hideNearbyUI() {
    var modalEl = document.getElementById("nearbyStationsModal");
    if (modalEl) {
      var inst = bootstrap.Modal.getInstance(modalEl);
      if (inst) { inst.hide(); return; }
    }
    var ocEl = document.getElementById("nearbyStationsOffcanvas");
    if (ocEl) {
      var inst2 = bootstrap.Offcanvas.getInstance(ocEl);
      if (inst2) inst2.hide();
    }
  }

  return { init: init };
})();
