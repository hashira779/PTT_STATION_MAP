/**
 * ============================================================
 *  PTT Station Map — Modal Renderer
 *  Renders the station-detail modal and image-preview modal.
 *  Modern Tailwind CSS UI with glassmorphism design.
 *  Depends on: config.js, utils.js, routeService.js
 * ============================================================
 */
var ModalRenderer = (function () {
  "use strict";

  // ── Station Detail Modal ───────────────────────────────────

  function showStationModal(station, imageUrl) {
    var body = document.getElementById("markerModalBody");

    var productHtml = (station.product || [])
      .map(function (p) {
        var icon = PTT_UTILS.getProductIcon(p);
        return (
          '<div class="info product-item">' +
          '<img src="' + icon + '" class="product-icon round reviewable-image" alt="' + p + '" data-image="' + icon + '" /> ' +
          '<span class="text-sm text-gray-600">' + p + '</span>' +
          "</div>"
        );
      })
      .join("");

    var otherProductHtml = (station.other_product || []).filter(Boolean)
      .map(function (p) {
        var icon = PTT_UTILS.getProductIcon(p);
        return (
          '<div class="info product-item">' +
          '<img src="' + icon + '" class="product-icon full reviewable-image" alt="' + p + '" data-image="' + icon + '" /> ' +
          '<span class="text-sm text-gray-600">' + p + '</span>' +
          "</div>"
        );
      })
      .join("");

    var paymentHtml = (station.service || [])
      .map(function (s) {
        var icon = PTT_UTILS.getItemIcon(s);
        return (
          '<div class="info payment-item">' +
          '<img src="' + icon + '" class="payment-icon full reviewable-image" alt="' + s + '" data-image="' + icon + '" /> ' +
          '<span class="text-sm text-gray-600">' + s + '</span>' +
          "</div>"
        );
      })
      .join("");

    var servicesHtml = (station.description || []).filter(Boolean)
      .map(function (d) {
        var icon = PTT_UTILS.getItemIcon(d);
        return (
          '<div class="info service-item">' +
          '<img src="' + icon + '" class="service-icon full reviewable-image" alt="' + d + '" data-image="' + icon + '" /> ' +
          '<span class="text-sm text-gray-600">' + d + '</span>' +
          "</div>"
        );
      })
      .join("");

    var promotionHtml =
      station.promotions && station.promotions.length > 0
        ? station.promotions
            .map(function (promo) {
              var pImg = PTT_UTILS.getPromotionImageUrl(promo.promotion_id);
              return (
                '<div class="flex items-center gap-3 p-2 rounded-xl bg-amber-50/60 mb-2">' +
                '<img src="' + pImg + '" class="w-12 h-12 rounded-lg object-cover reviewable-image shadow-sm" alt="' + promo.promotion_id + '" data-image="' + pImg + '" />' +
                '<div class="flex-1 min-w-0"><p class="text-sm font-semibold text-gray-800 truncate promotion-label" data-promotion="' + promo.description + '">' + promo.description + '</p></div>' +
                "</div>"
              );
            })
            .join("")
        : '<p class="text-sm text-gray-400 italic">No promotions available.</p>';

    body.innerHTML =
      '<div class="station-details">' +
      // Station image
      '  <div class="relative overflow-hidden rounded-2xl mb-4">' +
      '    <img src="' + imageUrl + '" alt="' + station.title + '" class="w-full h-48 object-cover reviewable-image cursor-pointer hover:scale-105 transition-transform duration-300" data-image="' + imageUrl + '" />' +
      '  </div>' +
      // Station title
      '  <div class="text-center mb-3">' +
      '    <h3 class="text-xl font-extrabold text-slate-900 tracking-tight">' + station.title + '</h3>' +
      '  </div>' +
      // Address
      '  <div class="flex items-start gap-2 mb-3 px-1">' +
      '    <i class="fas fa-map-marker-alt text-red-500 mt-0.5 text-sm flex-shrink-0"></i>' +
      '    <span class="text-sm text-gray-500 leading-snug">' + station.address + '</span>' +
      '  </div>' +
      // Separator
      '  <div class="separator"></div>' +
      // Route info
      '  <div id="route-info" class="flex justify-center gap-2 mb-3 flex-wrap"></div>' +
      // Separator
      '  <div class="separator"></div>' +
      // Tabs
      _buildTabs() +
      '  <div class="tab-content mt-2">' +
      _tabPane("promotion", "Promotion", '<div class="promotion-row flex flex-col gap-1">' + promotionHtml + "</div>", true) +
      _tabPane("products", "Products",
        '<div class="product-row">' + productHtml + "</div>" +
        (otherProductHtml ? '<div class="separator"></div><h5 class="text-sm font-bold text-slate-700 mb-2">Other Products</h5><div class="product-row">' + otherProductHtml + "</div>" : "")
      ) +
      _tabPane("payment", "Payment Methods", '<div class="description-row">' + paymentHtml + "</div>") +
      _tabPane("services", "Services", '<div class="service-row">' + servicesHtml + "</div>") +
      "  </div>" +
      // Actions
      _buildActions(station) +
      "</div>";

    var modal = new bootstrap.Modal(document.getElementById("markerModal"), { keyboard: true });
    modal.show();

    // Wire tabs
    [].slice.call(document.querySelectorAll("#myTab button")).forEach(function (el) {
      var tab = new bootstrap.Tab(el);
      el.addEventListener("click", function (e) { e.preventDefault(); tab.show(); });
    });

    // Wire image preview
    document.querySelectorAll(".reviewable-image").forEach(function (img) {
      img.addEventListener("click", function () {
        showImagePreview(this.getAttribute("data-image"));
      });
    });
  }

  // ── Tab Builder Helpers ────────────────────────────────────

  function _buildTabs() {
    var tabs = [
      { id: "promotion", label: "🎁 Promotion", active: true },
      { id: "products", label: "⛽ Products" },
      { id: "payment", label: "💳 Payment" },
      { id: "services", label: "🔧 Services" },
    ];
    var html = '<div class="nav-tabs-container"><ul class="nav nav-tabs flex-nowrap" id="myTab" role="tablist">';
    tabs.forEach(function (t) {
      html +=
        '<li class="nav-item" role="presentation">' +
        '<button class="nav-link' + (t.active ? " active" : "") + '" id="' + t.id + '-tab" data-bs-toggle="tab" data-bs-target="#' + t.id + '" type="button" role="tab" aria-controls="' + t.id + '" aria-selected="' + (t.active ? "true" : "false") + '">' + t.label + "</button>" +
        "</li>";
    });
    html += "</ul></div>";
    return html;
  }

  function _tabPane(id, heading, content, active) {
    return (
      '<div class="tab-pane fade' + (active ? " show active" : "") + '" id="' + id + '" role="tabpanel" aria-labelledby="' + id + '-tab">' +
      '<div class="scrollable-content">' +
      '<h5 class="text-sm font-bold text-slate-700 mb-2">' + heading + "</h5>" +
      content +
      "</div></div>"
    );
  }

  function _buildActions(station) {
    return (
      '<div class="flex justify-center items-center gap-6 mt-4 mb-2">' +
      '<div class="icon-background" onclick="shareLocation(' + station.latitude + "," + station.longitude + ')" title="Share"><i class="fas fa-share-alt share-icon"></i></div>' +
      '<button class="go-button pulse" onclick="openGoogleMaps(' + station.latitude + "," + station.longitude + ')" title="Navigate">GO</button>' +
      '<div class="icon-background" title="Navigate"><i class="fas fa-location-arrow navigate-icon"></i></div>' +
      "</div>"
    );
  }

  // ── Route Info Update ──────────────────────────────────────

  function updateRouteInfo(distance, travelTime, status) {
    var el = document.getElementById("route-info");
    if (!el) return;
    var s = PTT_UTILS.getStatusInfo(status);
    el.innerHTML =
      '<span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-blue-500 text-white shadow-sm"><i class="fas fa-clock"></i> ' + travelTime + "</span>" +
      '<span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-blue-500 text-white shadow-sm"><i class="fas fa-location-arrow"></i> ≈ ' + distance + "</span>" +
      '<span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ' + s.badgeClass + ' text-white shadow-sm"><i class="fas ' + s.iconClass + '"></i> ' + s.displayText + "</span>";
  }

  // ── Image Preview ──────────────────────────────────────────

  function showImagePreview(imageUrl) {
    document.getElementById("imagePreview").src = imageUrl;
    new bootstrap.Modal(document.getElementById("imagePreviewModal"), { keyboard: true }).show();
  }

  // ── Public API ─────────────────────────────────────────────
  return {
    showStationModal: showStationModal,
    updateRouteInfo: updateRouteInfo,
    showImagePreview: showImagePreview,
  };
})();
