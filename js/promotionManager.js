/**
 * ============================================================
 *  PTT Station Map — Promotion Manager
 *  Handles promotion modal, promotion filters, and notification dot.
 *  Depends on: utils.js, filterManager.js, mapManager.js
 * ============================================================
 */
var PromotionManager = (function () {
  "use strict";

  var _stations = [];

  function init(stations) {
    _stations = stations || [];
    _wireModalCleanup();
    _populatePromotions(_stations);
  }

  function showPromotionModal(promotions) {
    var modalEl = document.getElementById("promotionModal");
    if (!modalEl) return;

    var modal = new bootstrap.Modal(modalEl, { keyboard: false });
    var allContainer = document.getElementById("promotionContainerAll");
    var promoContainer = document.getElementById("promotionContainerPromotions");
    var openingContainer = document.getElementById("promotionContainerOpenings");

    if (allContainer) allContainer.innerHTML = "";
    if (promoContainer) promoContainer.innerHTML = "";
    if (openingContainer) openingContainer.innerHTML = "";

    if (promotions && promotions.length) {
      promotions.forEach(function (promotion) {
        var imageUrl = PTT_UTILS.getPromotionImageUrl(promotion.promotion_id);
        _createPromotionCard(promotion, imageUrl, allContainer);

        var id = (promotion.promotion_id || "").toLowerCase();
        if (id.indexOf("opening") !== -1) {
          _createPromotionCard(promotion, imageUrl, openingContainer);
        } else if (id.indexOf("promotion") === 0) {
          _createPromotionCard(promotion, imageUrl, promoContainer);
        }
      });
      _bindPromotionImageEvents();
      modal.show();
    }
  }

  function filterMarkersByPromotion(promotionId) {
    markers.clearLayers();
    var filtered = [];

    allMarkers.forEach(function (entry) {
      if (
        entry.data.promotions &&
        entry.data.promotions.some(function (promo) {
          return promo.promotion_id === promotionId;
        })
      ) {
        markers.addLayer(entry.marker);
        filtered.push(entry.marker);
      }
    });

    map.addLayer(markers);
    if (filtered.length) {
      MapManager.focusMarkers(filtered);
    }

    var modalEl = document.getElementById("promotionModal");
    if (modalEl) {
      var modal = bootstrap.Modal.getInstance(modalEl);
      if (modal) modal.hide();
    }
    FilterManager.updateClearButton();
  }

  function arePromotionFiltersApplied() {
    return document.querySelectorAll(".promotion-image.selected").length > 0;
  }

  function _populatePromotions(stations) {
    var button = document.getElementById("promotionBtn");
    var dot =
      document.getElementById("promotionNotificationDot") ||
      document.querySelector("#promotionBtn .notification-badge") ||
      document.querySelector("#promotionBtn .notification-dot");
    if (!button || !dot) return;

    var hasPromotions = stations.some(function (station) {
      return station.promotions && station.promotions.length > 0;
    });

    dot.style.display = hasPromotions ? "block" : "none";
    dot.classList.toggle("pulse-animation", hasPromotions);

    button.addEventListener("click", function () {
      var allPromotions = stations.flatMap(function (station) {
        return station.promotions || [];
      });
      var uniquePromotions = Array.from(
        new Map(
          allPromotions.map(function (promotion) {
            return [promotion.promotion_id, promotion];
          })
        ).values()
      );
      if (uniquePromotions.length) {
        showPromotionModal(uniquePromotions);
      }
    });
  }

  function _createPromotionCard(promotion, imageUrl, container) {
    if (!container) return;
    var item = document.createElement("div");
    item.classList.add("promotion-item", "mb-3");

    var img = document.createElement("img");
    img.src = imageUrl;
    img.classList.add("img-fluid", "mb-2", "promotion-image", "animate");
    img.setAttribute("data-promotion-id", promotion.promotion_id);

    var text = document.createElement("p");
    text.classList.add("promotion-text");
    text.innerText =
      (promotion.promotion_id || "Promotion") + " " +
      (promotion.description || "No description");

    item.appendChild(img);
    item.appendChild(text);
    container.appendChild(item);
  }

  function _bindPromotionImageEvents() {
    document.querySelectorAll(".promotion-image").forEach(function (image) {
      image.addEventListener("click", function () {
        var promotionId = this.getAttribute("data-promotion-id");
        this.classList.toggle("selected");
        filterMarkersByPromotion(promotionId);
        FilterManager.updateClearButton();
      });
    });
  }

  function _wireModalCleanup() {
    var modalEl = document.getElementById("promotionModal");
    if (!modalEl) return;

    modalEl.addEventListener("hidden.bs.modal", function () {
      var allContainer = document.getElementById("promotionContainerAll");
      var promoContainer = document.getElementById("promotionContainerPromotions");
      var openingContainer = document.getElementById("promotionContainerOpenings");
      if (allContainer) allContainer.innerHTML = "";
      if (promoContainer) promoContainer.innerHTML = "";
      if (openingContainer) openingContainer.innerHTML = "";
      document.body.classList.remove("modal-open");
      document.querySelectorAll(".modal-backdrop").forEach(function (el) {
        el.remove();
      });
    });

    var closeBtn = document.querySelector("#promotionModal .btn-close");
    if (closeBtn) {
      closeBtn.addEventListener("click", function () {
        var modal = bootstrap.Modal.getInstance(modalEl);
        if (modal) modal.hide();
      });
    }
  }

  return {
    init: init,
    showPromotionModal: showPromotionModal,
    filterMarkersByPromotion: filterMarkersByPromotion,
    arePromotionFiltersApplied: arePromotionFiltersApplied,
  };
})();

var filterMarkersByPromotion = function (promotionId) {
  return PromotionManager.filterMarkersByPromotion(promotionId);
};

