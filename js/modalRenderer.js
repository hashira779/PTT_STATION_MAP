/**
 * ============================================================
 *  PTT Station Map — Modal Renderer
 *  Renders the station-detail modal and image-preview modal.
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
          '<img src="' + icon + '" class="product-icon round reviewable-image" alt="' + p + '" data-image="' + icon + '" /> ' + p +
          "</div>"
        );
      })
      .join("");

    var otherProductHtml = (station.other_product || []).filter(Boolean)
      .map(function (p) {
        var icon = PTT_UTILS.getProductIcon(p);
        return (
          '<div class="info product-item">' +
          '<img src="' + icon + '" class="product-icon full reviewable-image" alt="' + p + '" data-image="' + icon + '" /> ' + p +
          "</div>"
        );
      })
      .join("");

    var paymentHtml = (station.service || [])
      .map(function (s) {
        var icon = PTT_UTILS.getItemIcon(s);
        return (
          '<div class="info payment-item">' +
          '<img src="' + icon + '" class="payment-icon full reviewable-image" alt="' + s + '" data-image="' + icon + '" /> ' + s +
          "</div>"
        );
      })
      .join("");

    var servicesHtml = (station.description || []).filter(Boolean)
      .map(function (d) {
        var icon = PTT_UTILS.getItemIcon(d);
        return (
          '<div class="info service-item">' +
          '<img src="' + icon + '" class="service-icon full reviewable-image" alt="' + d + '" data-image="' + icon + '" /> ' + d +
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
                '<div class="info promotion-item" style="display:flex;align-items:center;margin-bottom:10px;">' +
                '<img src="' + pImg + '" class="promotion-icon full reviewable-image" alt="' + promo.promotion_id + '" data-image="' + pImg + '" style="margin-right:10px;width:50px;height:auto;" />' +
                "<div><strong class=\"promotion-label\" data-promotion=\"" + promo.description + "\">" + promo.description + "</strong></div>" +
                "</div>"
              );
            })
            .join("")
        : "<p>No promotions available.</p>";

    body.innerHTML =
      '<div class="station-details">' +
      '  <img src="' + imageUrl + '" alt="' + station.title + '" class="img-fluid mb-3 rounded-image reviewable-image" data-image="' + imageUrl + '" />' +
      '  <div class="text-center"><h3 class="station-title mb-3 font-weight-bold">' + station.title + "</h3></div>" +
      '  <div class="info"><i class="fas fa-map-marker-alt icon"></i> ' + station.address + "</div>" +
      '  <div class="separator"></div>' +
      '  <div id="route-info" class="d-flex justify-content-center mb-3"></div>' +
      '  <div class="separator"></div>' +
      _buildTabs() +
      '  <div class="tab-content mt-3">' +
      _tabPane("promotion", "Promotion", '<div class="promotion-row">' + promotionHtml + "</div>", true) +
      _tabPane("products", "Products",
        '<div class="product-row">' + productHtml + "</div>" +
        (otherProductHtml ? '<div class="separator"></div><h5>Other Products</h5><div class="product-row">' + otherProductHtml + "</div>" : "")
      ) +
      _tabPane("payment", "Payment Methods", '<div class="description-row">' + paymentHtml + "</div>") +
      _tabPane("services", "Services", '<div class="service-row">' + servicesHtml + "</div>") +
      "  </div>" +
      _buildActions(station) +
      "</div>";

    var modal = new bootstrap.Modal(document.getElementById("markerModal"), { keyboard: false });
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
      { id: "promotion", label: "Promotion", active: true },
      { id: "products", label: "Products" },
      { id: "payment", label: "Payment" },
      { id: "services", label: "Services" },
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
      '<div class="scrollable-content"><h5>' + heading + "</h5>" + content + "</div></div>"
    );
  }

  function _buildActions(station) {
    return (
      '<div class="text-center mt-3"><div class="d-flex justify-content-center align-items-center">' +
      '<div class="icon-background mx-2" onclick="shareLocation(' + station.latitude + "," + station.longitude + ')"><i class="fas fa-share-alt share-icon"></i></div>' +
      '<button class="btn btn-primary rounded-circle mx-5 go-button pulse" onclick="openGoogleMaps(' + station.latitude + "," + station.longitude + ')">GO</button>' +
      '<div class="icon-background"><i class="fas fa-location-arrow navigate-icon mx-2"></i></div>' +
      "</div></div>"
    );
  }

  // ── Route Info Update ──────────────────────────────────────

  function updateRouteInfo(distance, travelTime, status) {
    var el = document.getElementById("route-info");
    if (!el) return;
    var s = PTT_UTILS.getStatusInfo(status);
    el.innerHTML =
      '<div class="badge bg-primary text-white mx-1"><i class="fas fa-clock icon-background"></i> ' + travelTime + "</div>" +
      '<div class="badge bg-primary text-white mx-1"><i class="fas fa-location-arrow icon-background"></i>≈ ' + distance + "</div>" +
      '<div class="badge ' + s.badgeClass + ' text-white mx-1"><i class="fas ' + s.iconClass + ' icon-background"></i> ' + s.displayText + "</div>";
  }

  // ── Image Preview ──────────────────────────────────────────

  function showImagePreview(imageUrl) {
    document.getElementById("imagePreview").src = imageUrl;
    new bootstrap.Modal(document.getElementById("imagePreviewModal"), { keyboard: false }).show();
  }

  // ── Public API ─────────────────────────────────────────────
  return {
    showStationModal: showStationModal,
    updateRouteInfo: updateRouteInfo,
    showImagePreview: showImagePreview,
  };
})();

