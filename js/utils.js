/**
 * ============================================================
 *  PTT Station Map — Shared Utilities
 *  Pure helper functions used across all modules.
 *  Depends on: config.js
 * ============================================================
 */
var PTT_UTILS = (function () {
  "use strict";

  var lastKnownLocation = null;
  var liveLocationWatchId = null;
  var liveLocationStartPromise = null;
  var liveLocationSubscribers = [];

  // ── Tracking State ────────────────────────────────────────
  // States: "idle" | "searching" | "active" | "error"
  var trackingState = "idle";
  var trackingStateSubscribers = [];
  var lastUpdateTimestamp = 0;
  var staleCheckTimer = null;

  function setTrackingState(newState) {
    if (trackingState === newState) return;
    trackingState = newState;
    var safeCopy = trackingStateSubscribers.slice();
    safeCopy.forEach(function (cb) {
      try { cb(newState); } catch (e) { console.error("Tracking state cb error:", e); }
    });
  }

  function subscribeToTrackingState(callback) {
    if (typeof callback !== "function") return function () {};
    trackingStateSubscribers.push(callback);
    callback(trackingState);
    return function () {
      trackingStateSubscribers = trackingStateSubscribers.filter(function (c) {
        return c !== callback;
      });
    };
  }

  function getTrackingState() {
    return trackingState;
  }

  function startStaleCheck() {
    if (staleCheckTimer) return;
    staleCheckTimer = setInterval(function () {
      if (trackingState === "active" && lastUpdateTimestamp > 0) {
        var elapsed = Date.now() - lastUpdateTimestamp;
        if (elapsed > 30000) {
          setTrackingState("searching");
        }
      }
    }, 10000);
  }

  function stopStaleCheck() {
    if (staleCheckTimer) {
      clearInterval(staleCheckTimer);
      staleCheckTimer = null;
    }
  }

  // ── Time Helpers ───────────────────────────────────────────

  /** Get current Cambodia time parts. */
  function getCambodiaTime() {
    var ct = new Date(
      new Date().toLocaleString("en-US", { timeZone: PTT_CONFIG.TIMEZONE })
    );
    return { hour: ct.getHours(), minute: ct.getMinutes(), date: ct };
  }

  /** Format 24h + minute → "8:30 PM" */
  function formatTime(hour24, minute) {
    var period = hour24 >= 12 ? "PM" : "AM";
    var h = hour24 % 12 || 12;
    var m = minute.toString().padStart(2, "0");
    return h + ":" + m + " " + period;
  }

  function normalizeId(value) {
    return String(value == null ? "" : value).trim();
  }

  function normalizeScheduleKey(value) {
    return PTT_CONFIG.normalizeScheduleKey(value);
  }

  function getOperationSchedules() {
    return PTT_CONFIG.getOperationSchedules();
  }

  function getStationGroup(station) {
    if (!station || !station.schedule_group_code) return null;
    return PTT_CONFIG.getScheduleGroup(station.schedule_group_code);
  }

  function getDefaultScheduleKey() {
    return PTT_CONFIG.getDefaultScheduleKey
      ? PTT_CONFIG.getDefaultScheduleKey()
      : PTT_CONFIG.DEFAULT_SCHEDULE;
  }

  function isSpecialStatus(value) {
    return !!PTT_CONFIG.SPECIAL_STATUSES[normalizeScheduleKey(value).toLowerCase()];
  }

  function getStationScheduleKey(station) {
    if (!station || typeof station === "string") {
      var directKey = normalizeScheduleKey(station || "");
      return getOperationSchedules()[directKey] ? directKey : getDefaultScheduleKey();
    }

    var explicitScheduleKey = normalizeScheduleKey(station.schedule_key || "");
    if (explicitScheduleKey && getOperationSchedules()[explicitScheduleKey]) {
      return explicitScheduleKey;
    }

    var legacyStatusKey = normalizeScheduleKey(station.status || "");
    if (legacyStatusKey && getOperationSchedules()[legacyStatusKey]) {
      return legacyStatusKey;
    }

    var group = getStationGroup(station);
    var groupScheduleKey = normalizeScheduleKey(group && group.schedule_key);
    if (groupScheduleKey && getOperationSchedules()[groupScheduleKey]) {
      return groupScheduleKey;
    }

    return getDefaultScheduleKey();
  }

  function resolveStationStatus(stationOrStatus) {
    if (typeof stationOrStatus === "string") {
      var rawKey = normalizeScheduleKey(stationOrStatus);
      if (isSpecialStatus(rawKey)) {
        return rawKey.toLowerCase();
      }
      return getOperationSchedules()[rawKey] ? rawKey : getDefaultScheduleKey();
    }

    var station = stationOrStatus || {};
    var rawStatus = normalizeScheduleKey(station.status || "");
    var rawStatusLower = rawStatus.toLowerCase();

    if (PTT_CONFIG.SPECIAL_STATUSES[rawStatusLower]) {
      return rawStatusLower;
    }

    return getStationScheduleKey(station);
  }

  function resolveSchedule(stationOrStatus) {
    var key = resolveStationStatus(stationOrStatus);
    if (PTT_CONFIG.SPECIAL_STATUSES[key.toLowerCase()]) return null;
    return getOperationSchedules()[key] || getOperationSchedules()[getDefaultScheduleKey()];
  }

  function isStationOpen(stationOrStatus) {
    var key = resolveStationStatus(stationOrStatus);
    if (PTT_CONFIG.SPECIAL_STATUSES[key.toLowerCase()]) return false;

    var schedule = resolveSchedule(stationOrStatus);
    if (!schedule) return false;
    if (schedule.is24h) return true;

    var t = getCambodiaTime();
    var afterOpen =
      t.hour > schedule.openHour ||
      (t.hour === schedule.openHour && t.minute >= schedule.openMinute);
    var beforeClose =
      t.hour < schedule.closeHour ||
      (t.hour === schedule.closeHour && t.minute < schedule.closeMinute);
    return afterOpen && beforeClose;
  }

  /** Marker icon URL based on station status & time. */
  function getIconUrl(stationOrStatus) {
    var key = resolveStationStatus(stationOrStatus);
    var special = PTT_CONFIG.SPECIAL_STATUSES[key.toLowerCase()];
    if (special) return special.iconUrl;
    return isStationOpen(stationOrStatus)
      ? PTT_CONFIG.IMAGE_BASE_URL + "61.png"
      : PTT_CONFIG.IMAGE_BASE_URL + "time_close1.png";
  }

  /** Badge / status info for route-info section. */
  function getStatusInfo(stationOrStatus) {
    var key = resolveStationStatus(stationOrStatus);
    var special = PTT_CONFIG.SPECIAL_STATUSES[key.toLowerCase()];
    if (special) {
      return {
        iconClass: special.iconClass,
        badgeClass: special.badgeClass,
        displayText: special.displayText,
      };
    }

    var schedule = resolveSchedule(stationOrStatus);
    if (schedule && schedule.is24h) {
      return {
        iconClass: "fa-gas-pump",
        badgeClass: "bg-success text-white",
        displayText: schedule.label || "Open 24h",
      };
    }

    if (isStationOpen(stationOrStatus)) {
      return {
        iconClass: "fa-gas-pump",
        badgeClass: "bg-success text-white",
        displayText: "Open until " + formatTime(schedule.closeHour, schedule.closeMinute),
      };
    }

    return {
      iconClass: "fa-times-circle",
      badgeClass: "bg-danger text-white",
      displayText: "Closed",
    };
  }

  // ── Geolocation ────────────────────────────────────────────

  function cloneLocation(location) {
    return location
      ? {
          lat: location.lat,
          lng: location.lng,
          accuracy: location.accuracy,
          timestamp: location.timestamp,
        }
      : null;
  }

  function buildGeolocationOptions(overrides) {
    var base = PTT_CONFIG.GEOLOCATION_OPTIONS || {};
    var extra = overrides || {};
    return {
      enableHighAccuracy:
        typeof extra.enableHighAccuracy === "boolean"
          ? extra.enableHighAccuracy
          : !!base.enableHighAccuracy,
      timeout: Number(extra.timeout != null ? extra.timeout : base.timeout || 5000),
      maximumAge: Number(
        extra.maximumAge != null ? extra.maximumAge : base.maximumAge || 0
      ),
    };
  }

  function positionToLocation(pos) {
    return {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: pos.coords.accuracy,
      timestamp: pos.timestamp || Date.now(),
    };
  }

  function hasMeaningfulLocationChange(nextLocation) {
    if (!lastKnownLocation) return true;

    var movedMeters =
      calculateDistance(
        lastKnownLocation.lat,
        lastKnownLocation.lng,
        nextLocation.lat,
        nextLocation.lng
      ) * 1000;

    return movedMeters >= (PTT_CONFIG.LIVE_LOCATION_MIN_DISTANCE_METERS || 0);
  }

  function notifyLiveLocationSubscribers(location) {
    var safeLocation = cloneLocation(location);
    liveLocationSubscribers.slice().forEach(function (callback) {
      try {
        callback(safeLocation);
      } catch (error) {
        console.error("Live location subscriber error:", error);
      }
    });
  }

  function getCurrentLocation(options) {
    var resolvedOptions = options || {};
    if (resolvedOptions.preferCached !== false && lastKnownLocation) {
      return Promise.resolve(cloneLocation(lastKnownLocation));
    }

    return new Promise(function (resolve, reject) {
      if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(
          function (pos) {
            lastKnownLocation = positionToLocation(pos);
            resolve(cloneLocation(lastKnownLocation));
          },
          function (err) {
            reject(err);
          },
          buildGeolocationOptions(resolvedOptions)
        );
      } else {
        reject(new Error("Geolocation is not supported by your browser."));
      }
    });
  }

  function startLocationWatch(options) {
    if (!("geolocation" in navigator)) {
      setTrackingState("error");
      return Promise.reject(new Error("Geolocation is not supported by your browser."));
    }

    if (liveLocationWatchId !== null) {
      if (lastKnownLocation) {
        return Promise.resolve(cloneLocation(lastKnownLocation));
      }
      if (liveLocationStartPromise) {
        return liveLocationStartPromise;
      }
    }

    setTrackingState("searching");
    startStaleCheck();

    liveLocationStartPromise = new Promise(function (resolve, reject) {
      var settled = false;

      liveLocationWatchId = navigator.geolocation.watchPosition(
        function (pos) {
          var nextLocation = positionToLocation(pos);
          var shouldNotify = hasMeaningfulLocationChange(nextLocation);

          lastKnownLocation = nextLocation;
          lastUpdateTimestamp = Date.now();
          setTrackingState("active");

          if (!settled) {
            settled = true;
            resolve(cloneLocation(nextLocation));
            liveLocationStartPromise = null;
          }

          if (shouldNotify) {
            notifyLiveLocationSubscribers(nextLocation);
          }
        },
        function (err) {
          if (!settled) {
            settled = true;
            if (liveLocationWatchId !== null) {
              navigator.geolocation.clearWatch(liveLocationWatchId);
              liveLocationWatchId = null;
            }
            liveLocationStartPromise = null;
            setTrackingState("error");
            reject(err);
            return;
          }

          setTrackingState("searching");
          console.error("Live location watch error:", err);
        },
        buildGeolocationOptions(options)
      );
    });

    return liveLocationStartPromise;
  }

  function stopLocationWatch() {
    if (liveLocationWatchId !== null && "geolocation" in navigator) {
      navigator.geolocation.clearWatch(liveLocationWatchId);
    }
    liveLocationWatchId = null;
    liveLocationStartPromise = null;
    stopStaleCheck();
    setTrackingState("idle");
  }

  function subscribeToLocationUpdates(callback) {
    if (typeof callback !== "function") {
      return function () {};
    }

    liveLocationSubscribers.push(callback);

    if (lastKnownLocation) {
      callback(cloneLocation(lastKnownLocation));
    }

    return function unsubscribe() {
      liveLocationSubscribers = liveLocationSubscribers.filter(function (subscriber) {
        return subscriber !== callback;
      });
    };
  }

  function getLastKnownLocation() {
    return cloneLocation(lastKnownLocation);
  }

  // ── Distance ───────────────────────────────────────────────

  /** Haversine distance in km. */
  function calculateDistance(lat1, lng1, lat2, lng2) {
    var R = 6371;
    var dLat = ((lat2 - lat1) * Math.PI) / 180;
    var dLng = ((lng2 - lng1) * Math.PI) / 180;
    var a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  // ── Data Fetching ──────────────────────────────────────────

  /** Fetch JSON with cache-busting. */
  function fetchJSON(url) {
    var sep = url.indexOf("?") === -1 ? "?" : "&";
    return fetch(url + sep + "nocache=" + Date.now()).then(function (r) {
      return r.json();
    });
  }

  // ── Icon Lookups ───────────────────────────────────────────

  function getProductIcon(product) {
    return PTT_CONFIG.PRODUCT_ICONS[product] || PTT_CONFIG.IMAGE_BASE_URL + "default.png";
  }

  function getItemIcon(item) {
    return PTT_CONFIG.ITEM_ICONS[item] || PTT_CONFIG.IMAGE_BASE_URL + "default.png";
  }

  function getPromotionImageUrl(id) {
    return (
      PTT_CONFIG.PROMOTION_IMAGES[id] ||
      PTT_CONFIG.IMAGE_BASE_URL + "default.png"
    );
  }

  function getStationPictureUrl(station) {
    return PTT_CONFIG.IMAGE_BASE_URL + (station.picture || "default.png");
  }

  // ── Navigation Helpers ─────────────────────────────────────

  function openGoogleMaps(lat, lon) {
    window.open(
      "https://www.google.com/maps/dir/?api=1&destination=" + lat + "," + lon,
      "_self"
    );
  }

  function shareLocation(lat, lon) {
    var url = "https://www.google.com/maps?q=" + lat + "," + lon;
    if (navigator.share) {
      navigator
        .share({ title: "Location", text: "Check out this location:", url: url })
        .catch(console.error);
    } else {
      window.open(url, "_blank");
    }
  }

  // ── Public API ─────────────────────────────────────────────
  return {
    getCambodiaTime: getCambodiaTime,
    formatTime: formatTime,
    normalizeId: normalizeId,
    normalizeScheduleKey: normalizeScheduleKey,
    resolveSchedule: resolveSchedule,
    resolveStationStatus: resolveStationStatus,
    getStationScheduleKey: getStationScheduleKey,
    getStationGroup: getStationGroup,
    isStationOpen: isStationOpen,
    getIconUrl: getIconUrl,
    getStatusInfo: getStatusInfo,
    getCurrentLocation: getCurrentLocation,
    startLocationWatch: startLocationWatch,
    stopLocationWatch: stopLocationWatch,
    subscribeToLocationUpdates: subscribeToLocationUpdates,
    getLastKnownLocation: getLastKnownLocation,
    getTrackingState: getTrackingState,
    subscribeToTrackingState: subscribeToTrackingState,
    calculateDistance: calculateDistance,
    fetchJSON: fetchJSON,
    getProductIcon: getProductIcon,
    getItemIcon: getItemIcon,
    getPromotionImageUrl: getPromotionImageUrl,
    getStationPictureUrl: getStationPictureUrl,
    openGoogleMaps: openGoogleMaps,
    shareLocation: shareLocation,
  };
})();

// Expose frequently-used helpers globally for inline onclick handlers
var getProductIcon = PTT_UTILS.getProductIcon;
var getItemIcon = PTT_UTILS.getItemIcon;
var openGoogleMaps = PTT_UTILS.openGoogleMaps;
var shareLocation = PTT_UTILS.shareLocation;

