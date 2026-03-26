/**
 * ============================================================
 *  PTT Station Map — Modal Renderer
 *  Renders the station-detail modal and image-preview modal.
 *  Modern UI — big popup, small perfect labels.
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
          '<div class="mr-item">' +
          '<img src="' + icon + '" class="mr-icon mr-round reviewable-image" alt="' + p + '" data-image="' + icon + '" />' +
          '<span class="mr-label">' + p + '</span>' +
          "</div>"
        );
      })
      .join("");

    var otherProductHtml = (station.other_product || []).filter(Boolean)
      .map(function (p) {
        var icon = PTT_UTILS.getProductIcon(p);
        return (
          '<div class="mr-item">' +
          '<img src="' + icon + '" class="mr-icon mr-full reviewable-image" alt="' + p + '" data-image="' + icon + '" />' +
          '<span class="mr-label">' + p + '</span>' +
          "</div>"
        );
      })
      .join("");

    var paymentHtml = (station.service || [])
      .map(function (s) {
        var icon = PTT_UTILS.getItemIcon(s);
        return (
          '<div class="mr-item">' +
          '<img src="' + icon + '" class="mr-icon mr-full reviewable-image" alt="' + s + '" data-image="' + icon + '" />' +
          '<span class="mr-label">' + s + '</span>' +
          "</div>"
        );
      })
      .join("");

    var servicesHtml = (station.description || []).filter(Boolean)
      .map(function (d) {
        var icon = PTT_UTILS.getItemIcon(d);
        return (
          '<div class="mr-item">' +
          '<img src="' + icon + '" class="mr-icon mr-full reviewable-image" alt="' + d + '" data-image="' + icon + '" />' +
          '<span class="mr-label">' + d + '</span>' +
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
                '<div class="mr-promo-card">' +
                '<img src="' + pImg + '" class="mr-promo-img reviewable-image" alt="' + promo.promotion_id + '" data-image="' + pImg + '" />' +
                '<div class="mr-promo-info"><p class="mr-promo-text promotion-label" data-promotion="' + promo.description + '">' + promo.description + '</p></div>' +
                "</div>"
              );
            })
            .join("")
        : '<p class="mr-empty">No promotions available.</p>';

    body.innerHTML =
      '<div class="mr-station">' +
      // Hero image
      '  <div class="mr-hero">' +
      '    <img src="' + imageUrl + '" alt="' + station.title + '" class="mr-hero-img reviewable-image" data-image="' + imageUrl + '" />' +
      '    <div class="mr-hero-overlay"></div>' +
      '  </div>' +
      // Title
      '  <div class="mr-title-section">' +
      '    <h3 class="mr-title">' + station.title + '</h3>' +
      '    <div class="mr-address"><i class="fas fa-map-marker-alt"></i><span>' + station.address + '</span></div>' +
      '  </div>' +
      // Route info
      '  <div id="route-info" class="mr-route-info"></div>' +
      // Divider
      '  <div class="mr-divider"></div>' +
      // Tabs
      _buildTabs() +
      '  <div class="tab-content mt-1">' +
      _tabPane("promotion", "Promotion", '<div class="mr-grid-col">' + promotionHtml + "</div>", true) +
      _tabPane("products", "Products",
        '<div class="mr-grid">' + productHtml + "</div>" +
        (otherProductHtml ? '<div class="mr-divider"></div><h5 class="mr-section-label">Other Products</h5><div class="mr-grid">' + otherProductHtml + "</div>" : "")
      ) +
      _tabPane("payment", "Payment Methods", '<div class="mr-grid">' + paymentHtml + "</div>") +
      _tabPane("services", "Services", '<div class="mr-grid">' + servicesHtml + "</div>") +
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
      { id: "promotion", label: "🎁 Promo", active: true },
      { id: "products", label: "⛽ Products" },
      { id: "payment", label: "💳 Pay" },
      { id: "services", label: "🔧 Service" },
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
      '<h5 class="mr-section-label">' + heading + "</h5>" +
      content +
      "</div></div>"
    );
  }

  function _buildActions(station) {
    return (
      '<div class="mr-actions">' +
      '<div class="mr-action-btn" onclick="shareLocation(' + station.latitude + "," + station.longitude + ')" title="Share"><i class="fas fa-share-alt"></i></div>' +
      '<button class="mr-go-btn" onclick="openGoogleMaps(' + station.latitude + "," + station.longitude + ')" title="Navigate">GO</button>' +
      '<div class="mr-action-btn" title="Navigate"><i class="fas fa-location-arrow"></i></div>' +
      "</div>"
    );
  }

  // ── Route Info Update ──────────────────────────────────────

  function updateRouteInfo(distance, travelTime, status) {
    var el = document.getElementById("route-info");
    if (!el) return;
    var s = PTT_UTILS.getStatusInfo(status);
    el.innerHTML =
      '<span class="mr-badge mr-badge-blue"><i class="fas fa-clock"></i>' + travelTime + "</span>" +
      '<span class="mr-badge mr-badge-blue"><i class="fas fa-location-arrow"></i>≈ ' + distance + "</span>" +
      '<span class="mr-badge ' + s.badgeClass + '"><i class="fas ' + s.iconClass + '"></i>' + s.displayText + "</span>";
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
