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
  var _provinceSearchable = null;
  var _titleSearchable = null;

  // ── Searchable Dropdown CSS ──────────────────────────────────
  function _injectSearchableCSS() {
    if (document.getElementById("sd-css")) return;
    var s = document.createElement("style");
    s.id = "sd-css";
    s.textContent =
      ".sd-wrap{position:relative;}" +
      ".sd-input{width:100%;padding:0.45rem 2.2rem 0.45rem 0.75rem;border:1px solid #e2e8f0;border-radius:0.75rem;font-size:0.85rem;outline:none;transition:border-color .2s,box-shadow .2s;background:#fff;color:#334155;}" +
      ".sd-input:focus{border-color:#3b82f6;box-shadow:0 0 0 3px rgba(59,130,246,.1);}" +
      ".sd-input::placeholder{color:#94a3b8;}" +
      ".sd-chevron{position:absolute;right:0.75rem;top:50%;transform:translateY(-50%);pointer-events:none;color:#94a3b8;font-size:.6rem;transition:transform .2s;}" +
      ".sd-wrap.open .sd-chevron{transform:translateY(-50%) rotate(180deg);}" +
      ".sd-clear{position:absolute;right:2rem;top:50%;transform:translateY(-50%);cursor:pointer;color:#94a3b8;font-size:.7rem;padding:2px 4px;display:none;transition:color .15s;}" +
      ".sd-clear:hover{color:#ef4444;}" +
      ".sd-wrap.has-value .sd-clear{display:block;}" +
      ".sd-list{position:fixed;z-index:10100;max-height:220px;overflow-y:auto;background:#fff;border:1px solid #e2e8f0;border-radius:.75rem;box-shadow:0 10px 30px rgba(0,0,0,.15);display:none;}" +
      ".sd-item{padding:.45rem .75rem;cursor:pointer;font-size:.85rem;color:#334155;transition:background .1s;}" +
      ".sd-item:first-child{border-radius:.75rem .75rem 0 0;}" +
      ".sd-item:last-child{border-radius:0 0 .75rem .75rem;}" +
      ".sd-item:hover,.sd-item.hl{background:#eff6ff;color:#1d4ed8;}" +
      ".sd-item.active{background:#3b82f6;color:#fff;}" +
      ".sd-empty{padding:.75rem;text-align:center;color:#94a3b8;font-size:.8rem;font-style:italic;}" +
      ".sd-list::-webkit-scrollbar{width:5px;}" +
      ".sd-list::-webkit-scrollbar-thumb{background:#cbd5e1;border-radius:9999px;}" +
      ".sd-list::-webkit-scrollbar-track{background:transparent;}";
    document.head.appendChild(s);
  }

  // ── Searchable Dropdown Component ────────────────────────────
  function _enhanceSelectToSearchable(selectEl, placeholder) {
    if (!selectEl) return null;
    _injectSearchableCSS();

    var wrap = document.createElement("div");
    wrap.className = "sd-wrap";

    var input = document.createElement("input");
    input.type = "text";
    input.className = "sd-input";
    input.placeholder = placeholder || "Search…";
    input.autocomplete = "off";

    var clearBtn = document.createElement("i");
    clearBtn.className = "fas fa-times sd-clear";

    var chevron = document.createElement("i");
    chevron.className = "fas fa-chevron-down sd-chevron";

    var list = document.createElement("div");
    list.className = "sd-list";

    wrap.appendChild(input);
    wrap.appendChild(clearBtn);
    wrap.appendChild(chevron);
    // list is appended to body to avoid overflow clipping in modals
    document.body.appendChild(list);

    selectEl.style.display = "none";
    selectEl.parentNode.insertBefore(wrap, selectEl.nextSibling);

    var options = [];
    var selectedValue = "";
    var hlIndex = -1;

    function syncFromSelect() {
      options = [];
      Array.from(selectEl.options).forEach(function (opt) {
        options.push({ value: opt.value, text: opt.text || opt.value || "All" });
      });
    }

    function render(filter) {
      list.innerHTML = "";
      var fl = (filter || "").toLowerCase();
      var filtered = options.filter(function (o) {
        if (!fl) return true;
        return o.text.toLowerCase().indexOf(fl) !== -1;
      });
      if (!filtered.length) {
        list.innerHTML = '<div class="sd-empty">No results found</div>';
        hlIndex = -1;
        return;
      }
      hlIndex = -1;
      filtered.forEach(function (o) {
        var item = document.createElement("div");
        item.className = "sd-item" + (o.value === selectedValue ? " active" : "");
        item.textContent = o.text;
        item.dataset.value = o.value;
        item.addEventListener("mousedown", function (e) {
          e.preventDefault();
          doSelect(o.value, o.text);
          close();
        });
        list.appendChild(item);
      });
    }

    function doSelect(value, text) {
      selectedValue = value;
      selectEl.value = value;
      input.value = value ? text : "";
      wrap.classList.toggle("has-value", !!value);
      selectEl.dispatchEvent(new Event("change", { bubbles: true }));
    }

    function open() {
      syncFromSelect();
      render(input.value);
      wrap.classList.add("open");
      list.style.display = "block";
      _positionList();
    }
    function close() {
      wrap.classList.remove("open");
      list.style.display = "none";
      hlIndex = -1;
    }

    function _positionList() {
      var rect = input.getBoundingClientRect();
      var spaceBelow = window.innerHeight - rect.bottom - 10;
      var maxH = Math.max(100, Math.min(220, spaceBelow));
      list.style.top = (rect.bottom + 4) + "px";
      list.style.left = rect.left + "px";
      list.style.width = rect.width + "px";
      list.style.maxHeight = maxH + "px";
    }

    // Close dropdown on parent scroll (modal body scroll)
    var _scrollParents = [];
    function _bindScrollClose() {
      var el = wrap.parentElement;
      while (el) {
        if (el.scrollHeight > el.clientHeight + 1) {
          el.addEventListener("scroll", close, { passive: true });
          _scrollParents.push(el);
        }
        el = el.parentElement;
      }
    }

    input.addEventListener("focus", function () {
      input.select();
      if (!_scrollParents.length) _bindScrollClose();
      open();
    });
    input.addEventListener("input", function () {
      syncFromSelect();
      render(input.value);
      if (!wrap.classList.contains("open")) {
        wrap.classList.add("open");
      }
      list.style.display = "block";
      _positionList();
    });
    input.addEventListener("blur", function () {
      setTimeout(close, 180);
    });
    input.addEventListener("keydown", function (e) {
      var items = list.querySelectorAll(".sd-item");
      if (e.key === "ArrowDown") {
        e.preventDefault();
        hlIndex = Math.min(hlIndex + 1, items.length - 1);
        hlItems(items);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        hlIndex = Math.max(hlIndex - 1, 0);
        hlItems(items);
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (hlIndex >= 0 && hlIndex < items.length) {
          doSelect(items[hlIndex].dataset.value, items[hlIndex].textContent);
          close();
          input.blur();
        }
      } else if (e.key === "Escape") {
        close();
        input.blur();
      }
    });

    clearBtn.addEventListener("mousedown", function (e) {
      e.preventDefault();
      doSelect("", "");
      input.value = "";
      close();
    });

    function hlItems(items) {
      items.forEach(function (it, i) {
        it.classList.toggle("hl", i === hlIndex);
        if (i === hlIndex) it.scrollIntoView({ block: "nearest" });
      });
    }

    return {
      sync: syncFromSelect,
      getValue: function () { return selectedValue; },
      setValue: function (val) {
        syncFromSelect();
        selectedValue = val;
        selectEl.value = val;
        var opt = options.find(function (o) { return o.value === val; });
        input.value = opt ? (opt.value ? opt.text : "") : "";
        wrap.classList.toggle("has-value", !!val);
      },
      reset: function () {
        selectedValue = "";
        selectEl.value = "";
        input.value = "";
        wrap.classList.remove("has-value");
      }
    };
  }

  // ── Initialization ─────────────────────────────────────────

  function init(stations) {
    _stationData = stations;
    populateIconContainers(stations);
    populateProvinceDropdown(stations);
    _populateStationTitleDropdown(stations);
    _initSearchableDropdowns();
    _bindEvents();
  }

  // ── Auto-Select Filter ────────────────────────────────────

  function autoSelectFilter() {
    var cfg = window.PTT_PAGE_CONFIG;
    if (!cfg || !cfg.autoSelectFilter) return;
    _revealFilterIcons(); // ensure icons are loaded for auto-selected filters
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

  var _filterIconsRevealed = false;

  function _populateContainer(containerId, items, shapeClass) {
    var container = document.getElementById(containerId);
    if (!container) return;
    var province = _getProvince();
    container.innerHTML = "";

    items.forEach(function (item) {
      var img = document.createElement("img");
      var mapped = PTT_CONFIG.IMAGE_MAPPING[item];
      var imgUrl = "./pictures/" + (mapped || "default.png");
      // Defer loading: use data-src so hidden offcanvas/modal images
      // are not fetched until the filter UI is actually shown.
      // This avoids NS_BINDING_ABORTED in Firefox on the PC page.
      if (_filterIconsRevealed) {
        img.src = imgUrl;
      } else {
        img.dataset.lazySrc = imgUrl;
        img.src = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
      }
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

  /** Swap data-lazy-src → src on all deferred filter icons. */
  function _revealFilterIcons() {
    if (_filterIconsRevealed) return;
    _filterIconsRevealed = true;
    document.querySelectorAll(".filter-icon[data-lazy-src]").forEach(function (img) {
      img.src = img.dataset.lazySrc;
      delete img.dataset.lazySrc;
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

  function _populateStationTitleDropdown(data, province) {
    var titles = new Set();
    data.forEach(function (s) {
      if (province && s.province.toLowerCase() !== province) return;
      titles.add(s.title);
    });
    var select = document.getElementById("title");
    if (!select) return;
    select.innerHTML = '<option value="">All</option>';
    Array.from(titles).sort(function (a, b) { return a.localeCompare(b); }).forEach(function (t) {
      var opt = document.createElement("option");
      opt.value = t;
      opt.text = t;
      select.add(opt);
    });
    if (_titleSearchable) _titleSearchable.sync();
  }

  function _initSearchableDropdowns() {
    var provinceEl = document.getElementById("province");
    var titleEl = document.getElementById("title");
    _provinceSearchable = _enhanceSelectToSearchable(provinceEl, "Search province…");
    _titleSearchable = _enhanceSelectToSearchable(titleEl, "Search station name…");
  }

  function _onProvinceChange() {
    var prov = _getProvince();
    _populateStationTitleDropdown(_stationData, prov);
    if (_titleSearchable) _titleSearchable.reset();
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

    var filteredFeatures = [];

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
        filteredFeatures.push(MapManager.stationToFeature(d));
      }
    });

    MapManager.setFilteredFeatures(filteredFeatures);

    // ── FIX #2: Smart zoom after filtering ──
    if (filteredFeatures.length === 1) {
      // Single station — flyTo directly at a readable zoom level
      var coords = filteredFeatures[0].geometry.coordinates;
      map.flyTo({
        center: coords,
        zoom: Math.min(PTT_CONFIG.DETAIL_ZOOM, 16),
        duration: PTT_CONFIG.FLY_DURATION * 1000,
      });
    } else if (filteredFeatures.length > 1) {
      var bounds = new maplibregl.LngLatBounds();
      filteredFeatures.forEach(function (f) {
        bounds.extend(f.geometry.coordinates);
      });
      // Use generous padding so stations aren't pinched at edges
      // and maxZoom so we don't zoom in further than cluster-break level
      map.fitBounds(bounds, {
        animate: true,
        duration: PTT_CONFIG.FLY_DURATION * 1000,
        padding: { top: 80, bottom: 80, left: 60, right: 60 },
        maxZoom: 16,
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

    // Reset searchable dropdowns
    if (_provinceSearchable) _provinceSearchable.reset();
    if (_titleSearchable) _titleSearchable.reset();
    _populateStationTitleDropdown(_stationData);

    document.querySelectorAll(".filter-icon.selected").forEach(function (ic) {
      ic.classList.remove("selected");
    });

    // Also clear promotion filter selections
    document.querySelectorAll(".promotion-image.selected").forEach(function (img) {
      img.classList.remove("selected");
    });

    MapManager.clearFilteredFeatures();

    if (allMarkers.length > 0) {
      var bounds = new maplibregl.LngLatBounds();
      allMarkers.forEach(function (e) {
        bounds.extend([parseFloat(e.data.longitude), parseFloat(e.data.latitude)]);
      });
      map.fitBounds(bounds, {
        animate: true,
        duration: PTT_CONFIG.FLY_DURATION * 1000,
        padding: { top: 80, bottom: 80, left: 60, right: 60 },
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

    // Reveal deferred filter-icon images when the filter panel opens.
    // PC uses offcanvas, Phone uses modal — listen for both.
    var offcanvasEl = document.getElementById("filterOffcanvas");
    if (offcanvasEl) {
      offcanvasEl.addEventListener("show.bs.offcanvas", _revealFilterIcons);
    }
    var filterModalEl = document.getElementById("filterModal");
    if (filterModalEl) {
      filterModalEl.addEventListener("show.bs.modal", _revealFilterIcons);
    }

    _updateClearButton();
  }

  function _getClearButtons() {
    var buttons = Array.from(document.querySelectorAll("[data-clear-all-button]"));
    // Also find ALL #clearAllButton elements (some pages have duplicates)
    var byId = Array.from(document.querySelectorAll("#clearAllButton"));
    byId.forEach(function (el) {
      if (buttons.indexOf(el) === -1) buttons.push(el);
    });
    return buttons;
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

