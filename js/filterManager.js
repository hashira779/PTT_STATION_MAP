/**
 * ============================================================
 *  PTT Station Map — Filter Manager
 *  Unified filter logic for all pages.
 *  Reads PTT_PAGE_CONFIG for page-specific behavior.
 *  Depends on: config.js, utils.js, mapManager.js (globals: map, markers, allMarkers)
 * ============================================================
 */
var FilterManager = (function () {
  "use strict";

  var _stationData = []; // cached reference to full station list

  // ── Initialization ─────────────────────────────────────────

  function init(stations) {
    _stationData = stations;
    populateIconContainers(stations);
    populateProvinceDropdown(stations);
    _bindEvents();
  }

  // ── Auto-Select Filter ────────────────────────────────────

  function autoSelectFilter() {
    var cfg = window.PTT_PAGE_CONFIG;
    if (!cfg || !cfg.autoSelectFilter) return;
    var sel = cfg.autoSelectFilter; // { container, item }
    var icon = document.querySelector(
      "#" + sel.container + ' img[data-item="' + sel.item + '"]'
    );
    if (icon) {
      icon.classList.add("selected");
      applyFilter();
      _updateClearButton();
    }
  }

  // ── Icon Containers ────────────────────────────────────────

  function populateIconContainers(data) {
    var province = _getProvince();
    var showStatus = window.PTT_PAGE_CONFIG && window.PTT_PAGE_CONFIG.showStatusFilter;

    _populateContainer("product-icons", _getUniqueItems(data, "product", province), "round");
    _populateContainer("other-product-icons", _getUniqueItems(data, "other_product", province), "custom");
    _populateContainer("service-icons", _getUniqueItems(data, "service", province), "custom");
    _populateContainer("description-icons", _getUniqueItems(data, "description", province), "round");

    var promoContainer = document.getElementById("promotion-icons");
    if (promoContainer) {
      _populateContainer("promotion-icons", _getUniqueItems(data, "promotion", province), "round");
    }

    if (showStatus) {
      var statusContainer = document.getElementById("status-icons");
      if (statusContainer) {
        _populateContainer("status-icons", _getUniqueItems(data, "status", province), "round");
      }
    }
  }

  function _getUniqueItems(data, key, province) {
    var items = new Set();
    data.forEach(function (station) {
      if (province && station.province.toLowerCase() !== province) return;
      var val = station[key];
      if (!val) return;
      if (Array.isArray(val)) {
        val.forEach(function (v) { if (v && v.trim()) items.add(v); });
      } else if (typeof val === "string" && val.trim()) {
        items.add(val);
      }
    });
    return Array.from(items);
  }

  function _populateContainer(containerId, items, shapeClass) {
    var container = document.getElementById(containerId);
    if (!container) return;
    var province = _getProvince();
    container.innerHTML = "";

    items.forEach(function (item) {
      var img = document.createElement("img");
      var mapped = PTT_CONFIG.IMAGE_MAPPING[item];
      img.src = "./pictures/" + (mapped || "default.png");
      img.alt = item;
      img.classList.add("filter-icon", shapeClass);
      img.dataset.item = item;

      // Check availability in selected province
      var dataKey = containerId.replace("-icons", "").replace("-", "_");
      var isAvailable = allMarkers.some(function (m) {
        if (province && m.data.province.toLowerCase() !== province) return false;
        var v = m.data[dataKey];
        if (Array.isArray(v)) return v.map(function (e) { return e.toLowerCase(); }).includes(item.toLowerCase());
        if (typeof v === "string") return v.toLowerCase() === item.toLowerCase();
        return false;
      });

      if (!isAvailable && province) {
        img.classList.add("disabled");
        img.style.pointerEvents = "none";
      } else {
        img.addEventListener("click", _toggleIcon);
      }
      container.appendChild(img);
    });
  }

  // ── Province / Title Dropdowns ─────────────────────────────

  function populateProvinceDropdown(data) {
    var provinces = new Set();
    data.forEach(function (s) { provinces.add(s.province); });

    var select = document.getElementById("province");
    if (!select) return;
    // Keep "All" option, clear the rest
    select.innerHTML = '<option value="">All</option>';
    Array.from(provinces)
      .sort(function (a, b) { return a.localeCompare(b); })
      .forEach(function (p) {
        var opt = document.createElement("option");
        opt.value = p;
        opt.text = p;
        select.add(opt);
      });
  }

  function _onProvinceChange() {
    var prov = _getProvince();
    var titles = new Set();
    _stationData.forEach(function (s) {
      if (!prov || s.province.toLowerCase() === prov) titles.add(s.title);
    });
    var titleSelect = document.getElementById("title");
    if (titleSelect) {
      titleSelect.innerHTML = '<option value="">All</option>';
      Array.from(titles).sort().forEach(function (t) {
        var opt = document.createElement("option");
        opt.value = t;
        opt.text = t;
        titleSelect.add(opt);
      });
    }
    populateIconContainers(_stationData);
  }

  // ── Filter Application ─────────────────────────────────────

  function applyFilter() {
    var province = _getProvince();
    var title = _getTitle();
    var selProducts = _getSelected("product-icons");
    var selOther = _getSelected("other-product-icons");
    var selServices = _getSelected("service-icons");
    var selDesc = _getSelected("description-icons");
    var selPromo = _getSelected("promotion-icons");
    var selStatus = _getSelected("status-icons");

    markers.clearLayers();
    var filtered = [];

    allMarkers.forEach(function (entry) {
      var d = entry.data;
      var match = true;

      if (province && d.province.toLowerCase().indexOf(province) === -1) match = false;
      if (title && d.title.toLowerCase().indexOf(title) === -1) match = false;
      if (selProducts.length && !_matchArray(d.product, selProducts)) match = false;
      if (selOther.length && !_matchArray(d.other_product, selOther)) match = false;
      if (selServices.length && !_matchArray(d.service, selServices)) match = false;
      if (selDesc.length && !_matchArray(d.description, selDesc)) match = false;
      if (selPromo.length && !_matchArray(d.promotion, selPromo)) match = false;
      if (selStatus.length && !selStatus.includes((d.status || "").toLowerCase())) match = false;

      if (match) {
        markers.addLayer(entry.marker);
        filtered.push(entry.marker);
      }
    });

    if (filtered.length > 0) {
      var bounds = new maplibregl.LngLatBounds();
      filtered.forEach(function (m) {
        var ll = m.getLatLng ? m.getLatLng() : (m._maplibreMarker ? m._maplibreMarker.getLngLat() : null);
        if (ll) bounds.extend([ll.lng, ll.lat]);
      });
      map.fitBounds(bounds, {
        animate: true,
        duration: PTT_CONFIG.FLY_DURATION * 1000,
        padding: 30,
      });
    }
    _hideFilterUI();
  }

  function clearAll() {
    var form = document.getElementById("filterForm");
    if (form) form.reset();

    var provinceEl = document.getElementById("province");
    if (provinceEl) provinceEl.value = "";
    var titleEl = document.getElementById("title");
    if (titleEl) titleEl.innerHTML = '<option value="">All</option>';

    document.querySelectorAll(".filter-icon.selected").forEach(function (ic) {
      ic.classList.remove("selected");
    });

    // Also clear promotion filter selections
    document.querySelectorAll(".promotion-image.selected").forEach(function (img) {
      img.classList.remove("selected");
    });

    markers.clearLayers();
    allMarkers.forEach(function (e) { markers.addLayer(e.marker); });

    if (allMarkers.length > 0) {
      var bounds = new maplibregl.LngLatBounds();
      allMarkers.forEach(function (e) {
        var ll = e.marker.getLatLng ? e.marker.getLatLng() : (e.marker._maplibreMarker ? e.marker._maplibreMarker.getLngLat() : null);
        if (ll) bounds.extend([ll.lng, ll.lat]);
      });
      map.fitBounds(bounds, {
        animate: true,
        duration: PTT_CONFIG.FLY_DURATION * 1000,
        padding: 30,
      });
    }
    _updateClearButton();
  }

  // ── Helpers ────────────────────────────────────────────────

  function _getProvince() {
    var el = document.getElementById("province");
    return el ? el.value.toLowerCase() : "";
  }

  function _getTitle() {
    var el = document.getElementById("title");
    return el ? el.value.toLowerCase() : "";
  }

  function _getSelected(containerId) {
    var container = document.getElementById(containerId);
    if (!container) return [];
    return Array.from(container.querySelectorAll(".filter-icon.selected")).map(function (ic) {
      return ic.dataset.item.toLowerCase();
    });
  }

  function _matchArray(arr, selected) {
    if (!arr) return false;
    var lower = (Array.isArray(arr) ? arr : [arr])
      .filter(function (v) { return v && v.trim(); })
      .map(function (v) { return v.toLowerCase(); });
    return selected.some(function (s) { return lower.includes(s); });
  }

  function _toggleIcon(e) {
    e.target.classList.toggle("selected");
    _updateClearButton();
  }

  function _updateClearButton() {
    var buttons = _getClearButtons();
    if (!buttons.length) return;
    var hasFilter =
      _getProvince() || _getTitle() ||
      _getSelected("product-icons").length ||
      _getSelected("other-product-icons").length ||
      _getSelected("service-icons").length ||
      _getSelected("description-icons").length ||
      _getSelected("promotion-icons").length ||
      _getSelected("status-icons").length ||
      document.querySelectorAll(".promotion-image.selected").length > 0;

    buttons.forEach(function (btn) {
      btn.style.display = hasFilter ? "block" : "none";
    });
  }

  function _hideFilterUI() {
    // Try modal first, then offcanvas
    var modalEl = document.getElementById("filterModal");
    if (modalEl) {
      var modal = bootstrap.Modal.getInstance(modalEl);
      if (modal) { modal.hide(); return; }
    }
    var offEl = document.getElementById("filterOffcanvas");
    if (offEl) {
      var oc = bootstrap.Offcanvas.getInstance(offEl);
      if (oc) oc.hide();
    }
  }

  function _bindEvents() {
    var provinceEl = document.getElementById("province");
    if (provinceEl) provinceEl.addEventListener("change", _onProvinceChange);

    var form = document.getElementById("filterForm");
    if (form) {
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        applyFilter();
        _updateClearButton();
      });
    }

    _getClearButtons().forEach(function (clearBtn) {
      clearBtn.addEventListener("click", clearAll);
    });

    _updateClearButton();
  }

  function _getClearButtons() {
    var buttons = Array.from(document.querySelectorAll("[data-clear-all-button]"));
    if (buttons.length) return buttons;

    var legacy = document.getElementById("clearAllButton");
    return legacy ? [legacy] : [];
  }

  // ── Expose for other modules ───────────────────────────────

  /** Check if any filters are applied (used by promotionManager). */
  function areFiltersApplied() {
    return !!(
      _getProvince() || _getTitle() ||
      _getSelected("product-icons").length ||
      _getSelected("other-product-icons").length ||
      _getSelected("service-icons").length ||
      _getSelected("description-icons").length ||
      _getSelected("promotion-icons").length ||
      _getSelected("status-icons").length
    );
  }

  /** Get selected filter items across all containers (used by nearbyManager). */
  function getSelectedFilters() {
    return Array.from(document.querySelectorAll(".filter-icon.selected")).map(function (ic) {
      return ic.dataset.item;
    });
  }

  return {
    init: init,
    autoSelectFilter: autoSelectFilter,
    applyFilter: applyFilter,
    clearAll: clearAll,
    areFiltersApplied: areFiltersApplied,
    getSelectedFilters: getSelectedFilters,
    updateClearButton: _updateClearButton,
  };
})();

// Legacy compat aliases
var populateIconContainersAndDropdown = function (d) { FilterManager.init(d); };
var areFiltersApplied = function () { return FilterManager.areFiltersApplied(); };
var clearGeneralFilters = function () { FilterManager.clearAll(); };
var updateClearFilterButton = function () { FilterManager.updateClearButton(); };

