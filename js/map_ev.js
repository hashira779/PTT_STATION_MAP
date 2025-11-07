// Function to automatically select "Fleet card"

// Initialize the map
var map = L.map("map").setView([11.55, 104.91], 7);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
}).addTo(map);

// Initialize marker cluster group
var markers = L.markerClusterGroup({
  iconCreateFunction: function(cluster) {
    var childMarkers = cluster.getAllChildMarkers();
    var hasPromotions = childMarkers.some(function(marker) {
      return marker.options.icon.options.html.includes('red-dot');
    });

    var clusterHtml = `<div class="cluster-icon-container" style="position: relative;">
                         ${hasPromotions ? '<div class="red-dot animate" style="position: absolute; top: 0; right: 0;"></div>' : ''}
                         <div class="cluster-number" style="background: rgba(0, 27, 255, 0.8); border-radius: 50%; color: white; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center;">
                           ${cluster.getChildCount()}
                         </div>
                       </div>`;
    
    return L.divIcon({
      html: clusterHtml,
      className: 'custom-cluster-icon', // Optional: add custom class for further styling
      iconSize: L.point(40, 40)
    });
  }
});

var allMarkers = []; // Array to hold all markers for filtering
// Variables to store the current location marker and circle
let currentLocationMarker = null;
let currentLocationCircle = null;

let isZooming = false; // Flag to indicate if the map is zooming

// Function to get current location and set map view
function setMapToCurrentLocation() {
  getCurrentLocation()
    .then((currentLocation) => {
      const { lat, lng } = currentLocation;
      map.setView([lat, lng], 15); // Set a reasonable zoom level, like 15

      // Remove existing marker and circle if they exist
      if (currentLocationMarker) {
        map.removeLayer(currentLocationMarker);
      }
      if (currentLocationCircle) {
        map.removeLayer(currentLocationCircle);
      }

      // Add animated circle to represent current location
      currentLocationCircle = L.circle([lat, lng], {
        color: "blue",
        fillColor: "blue",
        fillOpacity: 0.2,
        radius: 200,
        className: "pulse-circle",
      }).addTo(map);

      // Create a custom icon for the current location marker
      var customIcon = L.icon({
        iconUrl: "./pictures/mylocal.png",
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41],
      });

      // Add marker with custom icon
      currentLocationMarker = L.marker([lat, lng], { icon: customIcon }).addTo(
        map
      );
      currentLocationMarker.bindPopup("You are here.").openPopup();
    })
    .catch((error) => {
      console.error("Error getting current location:", error);
      alert("Error getting your location. Please try again later.");
    });
}

// Fetch data from JSON file
fetch("https://raw.githubusercontent.com/Ratana-tep/PTT_STATION_MAP/master/data/markers.json")
  .then((response) => response.json())
  .then((data) => {
    var stations = data.STATION;
    populateIconContainersAndDropdown(stations);

    fetch("https://raw.githubusercontent.com/Ratana-tep/PTT_STATION_MAP/master/data/promotions.json")
      .then((response) => response.json())
      .then((promotionData) => {
        stations.forEach((station) => {
          const stationPromotions = promotionData.PROMOTIONS.find((promo) => promo.station_id == station.id);
          station.promotions = stationPromotions ? stationPromotions.promotions : [];

          // Get the custom icon URL based on the station status
          var iconUrl = getIconUrl(station.status);

          // Create custom icon for the marker with a red dot if there are promotions
          var customIcon = L.divIcon({
            html: `
              <div class="custom-icon-container" style="position: relative;">
                <img src="${iconUrl}" class="station-icon" style="width: 41px; height: 62px;">
                ${station.promotions.length > 0 ? '<div class="red-dot animate" style="position: absolute; top: 0; right: 0; width: 12px; height: 12px; background-color: red; border-radius: 50%; border: 2px solid white;"></div>' : ''}
              </div>
            `,
            className: '',
            iconSize: [41, 62], // Adjust the size to fit your needs
            iconAnchor: [24, 62],
            popupAnchor: [1, -34],
          });

          // Create marker with custom icon
          var marker = L.marker([station.latitude, station.longitude], { icon: customIcon });

          // Create image URL
          var imageUrl = `https://raw.githubusercontent.com/Ratana-tep/PTT_STATION_MAP/master/pictures/${station.picture}`;

          // Add click event to marker to show modal
          marker.on("click", function () {
            if (map.getZoom() < 15) {
              // Only animate zoom if the map is not already zoomed in
              map.flyTo([station.latitude, station.longitude], 15, {
                animate: true,
                duration: 1, // Adjust the duration of the zoom animation here
              });

              // Show the modal after zooming in
              setTimeout(() => {
                showMarkerModal(station, imageUrl);
                getCurrentLocation()
                  .then((currentLocation) => {
                    getBingRoute(
                      currentLocation.lat,
                      currentLocation.lng,
                      station.latitude,
                      station.longitude
                    )
                      .then((result) => {
                        const { distance, travelTime } = result;
                        updateModalWithRoute(distance, travelTime, station.status);
                      })
                      .catch((error) => {
                        console.error("Error getting route from Bing Maps:", error);
                        updateModalWithRoute("N/A", "N/A", station.status); // Use placeholders if there's an error
                      });
                  })
                  .catch((error) => {
                    console.error("Error getting current location:", error);
                    updateModalWithRoute("N/A", "N/A", station.status); // Use placeholders if location is unavailable
                  });
              }, 1000); // Adjust the delay to match the zoom animation duration
            } else {
              // Directly show the modal if already zoomed in
              showMarkerModal(station, imageUrl);
              getCurrentLocation()
                .then((currentLocation) => {
                  getBingRoute(
                    currentLocation.lat,
                    currentLocation.lng,
                    station.latitude,
                    station.longitude
                  )
                    .then((result) => {
                      const { distance, travelTime } = result;
                      updateModalWithRoute(distance, travelTime, station.status);
                    })
                    .catch((error) => {
                      console.error("Error getting route from Bing Maps:", error);
                      updateModalWithRoute("N/A", "N/A", station.status); // Use placeholders if there's an error
                    });
                })
                .catch((error) => {
                  console.error("Error getting current location:", error);
                  updateModalWithRoute("N/A", "N/A", station.status); // Use placeholders if location is unavailable
                });
            }
          });

          // Add marker to marker cluster group
          markers.addLayer(marker);
          allMarkers.push({ marker: marker, data: station }); // Store marker and its data
        });

        // Add marker cluster group to map
        map.addLayer(markers);

        // Fit map to markers bounds
        map.fitBounds(markers.getBounds());

        // Automatically select "Fleet card" after markers are loaded
        autoSelectFleetCard();

        // Set map to current location on initial load
        setMapToCurrentLocation();
      })
      .catch((error) => console.error("Error fetching promotion data:", error));
  })
  .catch((error) => console.error("Error fetching data:", error));


// Function to get current location
document.getElementById("myLocationBtn").addEventListener("click", function () {
  setMapToCurrentLocation();
});

// Helper functions
function getCurrentLocation() {
  return new Promise((resolve, reject) => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        function (position) {
          resolve({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
        },
        function (error) {
          reject(error);
        },
        {
          enableHighAccuracy: true, // Request high accuracy
          timeout: 5000, // Set timeout to 5 seconds
          maximumAge: 0, // Do not use cached location
        }
      );
    } else {
      reject(new Error("Geolocation is not supported by your browser."));
    }
  });
}
// Function to automatically select "Fleet card"
function autoSelectFleetCard() {
  console.log("autoSelectFleetCard called"); // Debugging log
  const fleetCardIcon = document.querySelector('#other-product-icons img[data-item="EV"]');
  if (fleetCardIcon) {
    fleetCardIcon.classList.add('selected');
    console.log("EV icon selected."); // Debugging log
    updateClearFilterButton(); // Update the clear filter button visibility
    applyFilter(); // Apply the filter immediately
  } else {
    console.error("EV icon not found in #other-product-icons."); // Debugging log
  }
}

// Fetch data from JSON file
fetch("https://raw.githubusercontent.com/Ratana-tep/PTT_STATION_MAP/master/data/markers.json")
  .then((response) => response.json())
  .then((data) => {
    var stations = data.STATION;
    populateIconContainersAndDropdown(stations);

    fetch("https://raw.githubusercontent.com/Ratana-tep/PTT_STATION_MAP/master/data/promotions.json")
      .then((response) => response.json())
      .then((promotionData) => {
        stations.forEach((station) => {
          const stationPromotions = promotionData.PROMOTIONS.find((promo) => promo.station_id == station.id);
          station.promotions = stationPromotions ? stationPromotions.promotions : [];

          // Create marker and add to allMarkers
          var marker = L.marker([station.latitude, station.longitude], { icon: customIcon });
          allMarkers.push({ marker: marker, data: station }); // Store marker and its data
        });

        // Add marker cluster group to map
        map.addLayer(markers);

        // Automatically select "Fleet card" after markers are loaded
        autoSelectFleetCard();

        // Fit map to markers bounds
        map.fitBounds(markers.getBounds());

        // Set map to current location on initial load
        setMapToCurrentLocation();
      })
      .catch((error) => console.error("Error fetching promotion data:", error));
  })
  .catch((error) => console.error("Error fetching data:", error));
function getIconUrl(status) {
  // Get the current time in Cambodia timezone
  const cambodiaTimeString = new Date().toLocaleString("en-US", {
    timeZone: "Asia/Phnom_Penh",
  });
  const cambodiaTime = new Date(cambodiaTimeString);
  const currentHour = cambodiaTime.getHours();
  const currentMinutes = cambodiaTime.getMinutes();

  console.log(`Current Cambodia Time: ${cambodiaTime}`);
  console.log(
    `Current Hour: ${currentHour}, Current Minutes: ${currentMinutes}`
  );

  // Handle different status cases
  const open24Hours = status.toLowerCase() === "24h";
  const underConstruction = status.toLowerCase() === "under construct";

  if (underConstruction) {
    console.log("Status: Under Construction");
    return "./pictures/61.png"; // Path to the under construction icon
  } else if (open24Hours) {
    console.log("Status: Open 24 Hours");
    return "./pictures/61.png"; // Path to the 24h icon
  } else {
    // Assume the default open hours are from 5:00 AM to 8:30 PM
    const openingHour = 5;
    const closingHour = 20;
    const closingMinutes = 30;

    console.log(
      `Opening Hour: ${openingHour}, Closing Hour: ${closingHour}, Closing Minutes: ${closingMinutes}`
    );

    // Determine if the station is open
    const isOpen =
      currentHour >= openingHour &&
      (currentHour < closingHour ||
        (currentHour === closingHour && currentMinutes < closingMinutes));

    if (isOpen) {
      console.log("Status: Open");
      return "./pictures/61.png"; // Path to the open icon
    } else {
      console.log("Status: Closed");
      return "./pictures/time_close1.png"; // Path to the closed icon
    }
  }
}

// Function to get route information from Bing Maps API (optional, can be removed if not needed)
function getBingRoute(startLat, startLng, endLat, endLng) {
  const bingMapsKey =
    "AhQxc3Nm4Sfv53x7JRXUoj76QZnlm7VWkT5qAigmHQo8gjeYFthvGgEqVcjO5c7C"; // Replace with your Bing Maps API Key
  const url = `https://dev.virtualearth.net/REST/V1/Routes/Driving?wp.0=${startLat},${startLng}&wp.1=${endLat},${endLng}&optmz=timeWithTraffic&key=${bingMapsKey}`;

  return fetch(url)
    .then((response) => response.json())
    .then((data) => {
      console.log("Bing Maps API response:", data); // Log response for debugging
      if (data.resourceSets[0].resources.length > 0) {
        const route = data.resourceSets[0].resources[0];
        const distance = route.travelDistance; // in kilometers
        const travelTime = route.travelDurationTraffic / 60; // in minutes
        return {
          distance: distance.toFixed(2) + " km",
          travelTime:
            Math.floor(travelTime / 60) +
            " hr. " +
            Math.round(travelTime % 60) +
            " min",
        };
      } else {
        throw new Error("No route found");
      }
    })
    .catch((error) => {
      console.error("Error getting route from Bing Maps:", error);
      throw error;
    });
}

// Function to show marker data in modal
function showMarkerModal(station, imageUrl) {
  var modalBody = document.getElementById("markerModalBody");

  // Generate product HTML with appropriate round images
  const productHtml = station.product
      .map(
          (product) =>
              `<div class="info product-item">
        <img src="${getProductIcon(
                  product
              )}" class="product-icon round reviewable-image" alt="${product}" data-image="${getProductIcon(
                  product
              )}" /> ${product}
    </div>`
      )
      .join("");

  // Generate other product HTML with appropriate non-round images
  const otherProductHtml =
      station.other_product && station.other_product[0]
          ? station.other_product
              .map(
                  (otherProduct) =>
                      `<div class="info product-item">
            <img src="${getProductIcon(
                          otherProduct
                      )}" class="product-icon full reviewable-image" alt="${otherProduct}" data-image="${getProductIcon(
                          otherProduct
                      )}" /> ${otherProduct}
        </div>`
              )
              .join("")
          : "";

  // Generate payment HTML
  const paymentHtml = station.service
      .map(
          (service) =>
              `<div class="info payment-item">
        <img src="${getItemIcon(
                  service
              )}" class="payment-icon full reviewable-image" alt="${service}" data-image="${getItemIcon(
                  service
              )}" /> ${service}
    </div>`
      )
      .join("");

  // Generate services HTML
  const servicesHtml =
      station.description && station.description[0]
          ? station.description
              .map(
                  (desc) =>
                      `<div class="info service-item">
            <img src="${getItemIcon(
                          desc
                      )}" class="service-icon full reviewable-image" alt="${desc}" data-image="${getItemIcon(
                          desc
                      )}" /> ${desc}
        </div>`
              )
              .join("")
          : "";

  // Generate promotions HTML without click event
//   <span>(ends on ${new Date(
//     promo.end_time
// ).toLocaleDateString()})
// </span>
  const promotionHtml =
      station.promotions && station.promotions.length > 0
          ? station.promotions
              .map(
                  (promo) => `
      <div class="info promotion-item" style="display: flex; align-items: center; margin-bottom: 10px;">
          <img src="${getPromotionImageUrl_MARKER(
                      promo.promotion_id
                  )}" class="promotion-icon full reviewable-image" alt="${
                      promo.promotion_id
                  }" data-image="${getPromotionImageUrl_MARKER(
                      promo.promotion_id
                  )}" style="margin-right: 10px; width: 50px; height: auto;" />
          <div>
              <strong class="promotion-label" data-promotion="${promo.description}">${promo.description}</strong><br>
          </div>
      </div>
  `
              )
              .join("")
          : "<p>No promotions available.</p>";

  modalBody.innerHTML = `
<div class="station-details">
   <img src="${imageUrl}" alt="${
      station.title
  }" class="img-fluid mb-3 rounded-image reviewable-image" data-image="${imageUrl}" />
   <div class="text-center">
       <h3 class="station-title mb-3 font-weight-bold">${station.title}</h3>
   </div>
   <div class="info"><i class="fas fa-map-marker-alt icon"></i> ${
      station.address
  }</div>
   <div class="separator"></div>
   <div id="route-info" class="d-flex justify-content-center mb-3"></div> 
   <div class="separator"></div>
   <div class="nav-tabs-container">
<ul class="nav nav-tabs flex-nowrap" id="myTab" role="tablist">
  <li class="nav-item" role="presentation">
      <button class="nav-link active" id="promotion-tab" data-bs-toggle="tab" data-bs-target="#promotion" type="button" role="tab" aria-controls="promotion" aria-selected="true">Promotion</button>
  </li>
  <li class="nav-item" role="presentation">
      <button class="nav-link" id="products-tab" data-bs-toggle="tab" data-bs-target="#products" type="button" role="tab" aria-controls="products" aria-selected="false">Products</button>
  </li>
  <li class="nav-item" role="presentation">
      <button class="nav-link" id="payment-tab" data-bs-toggle="tab" data-bs-target="#payment" type="button" role="tab" aria-controls="payment" aria-selected="false">Payment</button>
  </li>
  <li class="nav-item" role="presentation">
      <button class="nav-link" id="services-tab" data-bs-toggle="tab" data-bs-target="#services" type="button" role="tab" aria-controls="services" aria-selected="false">Services</button>
  </li>
</ul>

   </div>
   
   <!-- Tab panes with smooth animation -->
   <div class="tab-content mt-3">
       <div class="tab-pane fade " id="products" role="tabpanel" aria-labelledby="products-tab">
           <div class="scrollable-content">
               <h5>Products</h5>
               <div class="product-row">
                   ${productHtml}
               </div>
               ${
      otherProductHtml
          ? `<div class="separator"></div><h5>Other Products</h5><div class="product-row">${otherProductHtml}</div>`
          : ""
  }
           </div>
       </div>
       <div class="tab-pane fade" id="payment" role="tabpanel" aria-labelledby="payment-tab">
           <div class="scrollable-content">
               <h5>Payment Methods</h5>
               <div class="description-row">
                   ${paymentHtml}
               </div>
           </div>
       </div>
       <div class="tab-pane fade" id="services" role="tabpanel" aria-labelledby="services-tab">
           <div class="scrollable-content">
               <h5>Services</h5>
               <div class="service-row">
                   ${servicesHtml}
               </div>
           </div>
       </div>
       <div class="tab-pane fade show active" id="promotion" role="tabpanel" aria-labelledby="promotion-tab">
           <div class="scrollable-content">
               <h5>Promotion</h5>
               <div class="promotion-row">
                   ${promotionHtml}
               </div>
           </div>
       </div>
   </div>
   <div class="text-center mt-3">
     <div class="d-flex justify-content-center align-items-center">
       <div class="icon-background mx-2" onclick="shareLocation(${
      station.latitude
  }, ${station.longitude})">
           <i class="fas fa-share-alt share-icon"></i>
       </div>
       <button class="btn btn-primary rounded-circle mx-5 go-button pulse" onclick="openGoogleMaps(${
      station.latitude
  }, ${station.longitude})">GO</button>
       <div class="icon-background">
           <i class="fas fa-location-arrow navigate-icon mx-2"></i>
       </div>
     </div>
   </div>
</div>
`;

  var markerModal = new bootstrap.Modal(
      document.getElementById("markerModal"),
      {
          keyboard: false,
      }
  );
  markerModal.show();

  // Initialize Bootstrap tabs correctly
  var triggerTabList = [].slice.call(
      document.querySelectorAll("#myTab button")
  );
  triggerTabList.forEach(function (triggerEl) {
      var tabTrigger = new bootstrap.Tab(triggerEl);
      triggerEl.addEventListener("click", function (event) {
          event.preventDefault();
          tabTrigger.show();
      });
  });

  // Add event listeners for reviewable images
  const reviewableImages = document.querySelectorAll(".reviewable-image");
  reviewableImages.forEach((image) => {
      image.addEventListener("click", function () {
          const imageUrl = this.getAttribute("data-image");
          showImagePreview(imageUrl);
      });
  });
}
function autoSelectFleetCard() {
  const fleetCardIcon = document.querySelector('#other-product-icons img[data-item="EV"]');
  if (fleetCardIcon) {
    fleetCardIcon.classList.add('selected');
    console.log("EV icon selected.");
    updateClearFilterButton(); // Update button visibility
    applyFilter(); // Apply the filter immediately
  } else {
    console.error("EV icon not found in #other-product-icons.");
  }
}

// Call this function when the map is loaded
document.addEventListener('DOMContentLoaded', function() {
  autoSelectFleetCard();
});

// Function to show image preview in the modal
function showImagePreview(imageUrl) {
  const imagePreview = document.getElementById("imagePreview");
  imagePreview.src = imageUrl;
  const imagePreviewModal = new bootstrap.Modal(
    document.getElementById("imagePreviewModal"),
    {
      keyboard: false,
    }
  );
  imagePreviewModal.show();
}

// Function to get the image URL based on the product name
function getProductIcon(product) {
  const productImages = {
    "ULR 91": "./pictures/ULR91.png", // Path to the URL 91 image
    "ULG 95": "./pictures/ULG95.png", // Path to the ULG 95 image
    HSD: "./pictures/HSD.png", // Path to the HSD image
    EV: "./pictures/ev.png", // Path to the EV image
    Onion: "./pictures/onion.png", // Path to the Onion image
    Otr: "./pictures/OTR.png",
  };
  return productImages[product] || "./pictures/default.png"; // Default image if product not found
}

// Function to get the image URL based on the item name
function getItemIcon(item) {
  const itemImages = {
    "Fleet card": "./pictures/fleet.png", // Path to the Fleet card image
    KHQR: "./pictures/KHQR.png", // Path to the KHQR image
    Cash: "./pictures/cash.png", // Path to the Cash image
    Amazon: "./pictures/amazon.png", // Path to the Amazon image
    EV: "./pictures/ev.png", // Path to the 7-Eleven
    "7-Eleven": "./pictures/7eleven.png" // Path to the 7-Eleven image
    // Add other items as needed
  };
  return itemImages[item] || "./pictures/default.png"; // Default image if item not found
}
// Function to get the promotion image URL based on the item name
function getPromotionImageUrl_MARKER(item) {
  const promotionImages = {
    "promotion 1":
      "https://raw.githubusercontent.com/Ratana-tep/PTT_STATION_MAP/master/pictures/promotion/promotion_1.jpg",
    "promotion 2":
      "https://raw.githubusercontent.com/Ratana-tep/PTT_STATION_MAP/master/pictures/promotion/promotion_2.jpg",
    "promotion 3":
      "https://raw.githubusercontent.com/Ratana-tep/PTT_STATION_MAP/master/pictures/promotion/promotion_3.jpg",
    "promotion 4":
      "https://raw.githubusercontent.com/Ratana-tep/PTT_STATION_MAP/master/pictures/promotion/promotion_4.jpg",
    "promotion opening 1":
      "https://raw.githubusercontent.com/Ratana-tep/PTT_STATION_MAP/master/pictures/promotion/promotion_opening_1.jpg",
    "promotion opening 2":
      "https://raw.githubusercontent.com/Ratana-tep/PTT_STATION_MAP/master/pictures/promotion/promotion_opening_2.jpg",
    "promotion opening 3":
      "https://raw.githubusercontent.com/Ratana-tep/PTT_STATION_MAP/master/pictures/promotion/promotion_opening_3.jpg",
    "promotion opening 4":
      "https://raw.githubusercontent.com/Ratana-tep/PTT_STATION_MAP/master/pictures/promotion/promotion_opening_4.jpg",
    // Add other promotions as needed
  };
  return (
    promotionImages[item] ||
    "https://raw.githubusercontent.com/pttpos/map_ptt/main/pictures/default.png"
  ); // Default image if promotion not found
}
// Function to update modal with route information
function updateModalWithRoute(distance, travelTime, status) {
  var routeInfo = document.getElementById("route-info");
  const statusInfo = getStatusInfo(status); // Determine the icon and badge class based on status

  routeInfo.innerHTML = `
        <div class="badge bg-primary text-white mx-1">
            <i class="fas fa-clock icon-background"></i> ${travelTime}
        </div>
        <div class="badge bg-primary text-white mx-1">
            <i class="fas fa-location-arrow icon-background"></i>≈ ${distance}
        </div>
        <div class="badge ${statusInfo.badgeClass} text-white mx-1">
            <i class="fas ${statusInfo.iconClass} icon-background"></i> ${statusInfo.displayText}
        </div>
    `;
}

function getStatusInfo(status) {
  // Calculate Cambodia time directly using UTC offset
  const cambodiaTime = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Phnom_Penh" })
  );
  const currentHour = cambodiaTime.getHours();
  const currentMinutes = cambodiaTime.getMinutes();

  console.log(`Current Cambodia Time: ${cambodiaTime}`);
  console.log(
    `Current Hour: ${currentHour}, Current Minutes: ${currentMinutes}`
  );

  if (status.toLowerCase() === "under construct") {
    return {
      iconClass: "fa-tools",
      badgeClass: "bg-warning text-white blink-border",
      displayText: "Under Construction",
    };
  } else if (status.toLowerCase() === "24h") {
    return {
      iconClass: "fa-gas-pump",
      badgeClass: "bg-success text-white",
      displayText: "Open 24h",
    };
  } else {
    const openingHour = 5; // Opening hour is 5 AM
    const closingHour = 20; // Closing hour is 8 PM
    const closingMinutes = 30; // Closing minutes is 8:30 PM

    console.log(
      `Opening Hour: ${openingHour}, Closing Hour: ${closingHour}, Closing Minutes: ${closingMinutes}`
    );

    // Determine if the station is closed
    if (
      currentHour < openingHour || // Before 5 AM
      currentHour > closingHour || // After 8 PM
      (currentHour === closingHour && currentMinutes >= closingMinutes) || // After 8:30 PM
      (currentHour >= 0 && currentHour < 5) // After midnight and before 5 AM
    ) {
      console.log("Station is closed.");
      return {
        iconClass: "fa-times-circle",
        badgeClass: "bg-danger text-white",
        displayText: "Closed",
      };
    } else {
      console.log("Station is open.");
      return {
        iconClass: "fa-gas-pump",
        badgeClass: "bg-success text-white",
        displayText: `Open until 8:30 PM`,
      };
    }
  }
}

// Function to fetch data with cache-busting
function fetchData(url) {
  const cacheBuster = `?nocache=${new Date().getTime()}`;
  return fetch(url + cacheBuster)
    .then((response) => response.json())
    .catch((error) => {
      console.error("Error fetching data:", error);
      throw error;
    });
}

// Usage example with fetchData function
const dataUrl =
  "https://raw.githubusercontent.com/pttpos/map_ptt/main/data/markers.json";
fetchData(dataUrl).then((data) => {
  // Handle the data as needed
  console.log(data);
});

// Function to open Google Maps with the destination
function openGoogleMaps(lat, lon) {
  var url =
    "https://www.google.com/maps/dir/?api=1&destination=" + lat + "," + lon;
  window.open(url, "_self");
}

// Function to share location via Google Maps
function shareLocation(lat, lon) {
  var url = "https://www.google.com/maps?q=" + lat + "," + lon;
  if (navigator.share) {
    navigator
      .share({
        title: "Location",
        text: "Check out this location:",
        url: url,
      })
      .then(() => {
        console.log("Thanks for sharing!");
      })
      .catch(console.error);
  } else {
    // Fallback for browsers that do not support the Web Share API
    window.open(url, "_blank");
  }
}

// Function to populate icon containers and dropdown
function populateIconContainersAndDropdown(stations) {
  // Implement your logic here
}
