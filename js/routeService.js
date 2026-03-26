/**
 * ============================================================
 *  PTT Station Map — Route Service (Super-fast)
 *  Primary: OSRM (free, no key needed)
 *  Fallback: Bing Maps (auto-disabled after first failure)
 *  Last resort: straight-line estimate (instant, zero network)
 *  Depends on: config.js
 * ============================================================
 */
var RouteService = (function () {
  "use strict";

  var TIMEOUT_MS = 4000;
  var AVG_SPEED_KMH = 45;

  // ── Route cache ───────────────────────────────────────────
  var routeCache = {};
  var CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  function _cacheKey(sLat, sLng, eLat, eLng) {
    return [
      parseFloat(sLat).toFixed(4),
      parseFloat(sLng).toFixed(4),
      parseFloat(eLat).toFixed(4),
      parseFloat(eLng).toFixed(4),
    ].join(",");
  }

  function _getCached(key) {
    var entry = routeCache[key];
    if (entry && (Date.now() - entry.ts) < CACHE_TTL) return entry.data;
    return null;
  }

  function _setCache(key, data) {
    routeCache[key] = { data: data, ts: Date.now() };
    // keep cache small
    var keys = Object.keys(routeCache);
    if (keys.length > 200) delete routeCache[keys[0]];
  }

  // ── Bing dead detection ───────────────────────────────────
  var bingDead = false;

  // ── Fetch with timeout ────────────────────────────────────
  function _fetchJSON(url) {
    return new Promise(function (resolve, reject) {
      var done = false;
      var timer = setTimeout(function () {
        if (!done) { done = true; reject(new Error("Timeout")); }
      }, TIMEOUT_MS);

      fetch(url).then(function (r) {
        clearTimeout(timer);
        if (done) return;
        if (!r.ok) { done = true; throw new Error("HTTP " + r.status); }
        return r.json();
      }).then(function (d) {
        if (!done) { done = true; resolve(d); }
      }).catch(function (e) {
        clearTimeout(timer);
        if (!done) { done = true; reject(e); }
      });
    });
  }

  // ── Format helpers ────────────────────────────────────────
  function _fmt(totalMin) {
    var h = Math.floor(totalMin / 60);
    var m = Math.round(totalMin % 60);
    return h > 0 ? h + " hr " + m + " min" : m + " min";
  }

  // ── OSRM ──────────────────────────────────────────────────
  function _osrm(sLat, sLng, eLat, eLng) {
    var url = "https://router.project-osrm.org/route/v1/driving/" +
      sLng + "," + sLat + ";" + eLng + "," + eLat + "?overview=false";

    return _fetchJSON(url).then(function (d) {
      if (!d || d.code !== "Ok" || !d.routes || !d.routes[0]) throw new Error("OSRM fail");
      var r = d.routes[0];
      return {
        distance: (r.distance / 1000).toFixed(1) + " km",
        travelTime: _fmt(r.duration / 60),
        distanceKm: r.distance / 1000,
      };
    });
  }

  // ── Bing ──────────────────────────────────────────────────
  function _bing(sLat, sLng, eLat, eLng) {
    if (bingDead) return Promise.reject(new Error("Bing disabled"));

    var url = "https://dev.virtualearth.net/REST/V1/Routes/Driving" +
      "?wp.0=" + sLat + "," + sLng + "&wp.1=" + eLat + "," + eLng +
      "&optmz=timeWithTraffic&key=" + PTT_CONFIG.BING_MAPS_KEY;

    return _fetchJSON(url).then(function (d) {
      if (!d || !d.resourceSets || !d.resourceSets[0] ||
          !d.resourceSets[0].resources || !d.resourceSets[0].resources.length) {
        bingDead = true;
        throw new Error("Bing fail");
      }
      var res = d.resourceSets[0].resources[0];
      var secs = res.travelDurationTraffic || res.travelDuration || 0;
      return {
        distance: res.travelDistance.toFixed(1) + " km",
        travelTime: _fmt(secs / 60),
        distanceKm: res.travelDistance,
      };
    }).catch(function (e) {
      bingDead = true;
      throw e;
    });
  }

  // ── Instant estimate (zero network, instant) ──────────────
  function estimateFromDistance(km) {
    var k = Number(km);
    return {
      distance: "~" + k.toFixed(1) + " km",
      travelTime: "~" + _fmt((k / AVG_SPEED_KMH) * 60),
      distanceKm: k,
    };
  }

  // ── Public: getRoute (cached, OSRM → Bing → estimate) ────
  function getRoute(sLat, sLng, eLat, eLng) {
    var key = _cacheKey(sLat, sLng, eLat, eLng);
    var cached = _getCached(key);
    if (cached) return Promise.resolve(cached);

    return _osrm(sLat, sLng, eLat, eLng)
      .catch(function () { return _bing(sLat, sLng, eLat, eLng); })
      .then(function (result) {
        _setCache(key, result);
        return result;
      });
  }

  // ── Public: getDistance (cached) ───────────────────────────
  function getDistance(sLat, sLng, eLat, eLng) {
    var key = _cacheKey(sLat, sLng, eLat, eLng);
    var cached = _getCached(key);
    if (cached) return Promise.resolve(cached.distanceKm.toFixed(1));

    return _osrm(sLat, sLng, eLat, eLng)
      .catch(function () { return _bing(sLat, sLng, eLat, eLng); })
      .then(function (result) {
        _setCache(key, result);
        return result.distanceKm.toFixed(1);
      });
  }

  return {
    getRoute: getRoute,
    getDistance: getDistance,
    estimateFromDistance: estimateFromDistance,
  };
})();
