// Function to calculate the distance between two points using Haversine formula
function calculateDistance(lat1, lng1, lat2, lng2) {
  const R = 6371; // Radius of the Earth in kilometers
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLng = (lng2 - lng1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
    Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLng / 2) *
    Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c; // Distance in kilometers
  return distance;
}

// Function to get current location using Bing Maps API
function getCurrentLocation() {
  return new Promise((resolve, reject) => {
    // Use navigator.geolocation if available
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
        },
        (error) => {
          console.error("Error getting current location with geolocation:", error);
          reject(error);
        }
      );
    } else {
      // Use Bing Maps API as a fallback
      const bingMapsKey = 'AhQxc3Nm4Sfv53x7JRXUoj76QZnlm7VWkT5qAigmHQo8gjeYFthvGgEqVcjO5c7C'; // Replace with your Bing Maps API key
      fetch(`http://dev.virtualearth.net/REST/v1/Locations?key=${bingMapsKey}`)
        .then(response => response.json())
        .then(data => {
          if (data.resourceSets.length > 0 && data.resourceSets[0].resources.length > 0) {
            const location = data.resourceSets[0].resources[0].point.coordinates;
            resolve({
              lat: location[0],
              lng: location[1],
            });
          } else {
            reject(new Error("Unable to retrieve location from Bing Maps API"));
          }
        })
        .catch(error => {
          console.error("Error fetching location from Bing Maps API:", error);
          reject(error);
        });
    }
  });
}

// Function to get status information
function getStatusInfo(status) {
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

// Function to get the distance using Bing Maps API
function getBingRouteDistance(startLat, startLng, endLat, endLng) {
  const bingMapsKey = 'AhQxc3Nm4Sfv53x7JRXUoj76QZnlm7VWkT5qAigmHQo8gjeYFthvGgEqVcjO5c7C'; // Replace with your Bing Maps API Key
  const url = `https://dev.virtualearth.net/REST/V1/Routes/Driving?wp.0=${startLat},${startLng}&wp.1=${endLat},${endLng}&optmz=timeWithTraffic&key=${bingMapsKey}`;

  return fetch(url)
    .then((response) => response.json())
    .then((data) => {
      if (data.resourceSets.length > 0 && data.resourceSets[0].resources.length > 0) {
        const route = data.resourceSets[0].resources[0];
        const distance = route.travelDistance; // in kilometers
        return distance.toFixed(2); // Distance in kilometers
      } else {
        throw new Error("No route found");
      }
    })
    .catch((error) => {
      console.error("Error getting route from Bing Maps:", error);
      throw error;
    });
}

// Function to find nearby stations
// Function to find nearby stations with filtering
// Function to find nearby stations with filtering
// Function to find nearby stations with filtering
function findNearbyStations(currentLocation, stations, maxDistance = 10) {
  // Get all selected filters from UI
  const selectedFilters = getSelectedFilters();

  return stations
      .map(station => {
          const distance = calculateDistance(
              parseFloat(currentLocation.lat),
              parseFloat(currentLocation.lng),
              parseFloat(station.latitude),
              parseFloat(station.longitude)
          );

          return { ...station, distance };
      })
      .filter(station => station.distance <= maxDistance) // Keep only nearby stations
      .filter(station => {
          if (selectedFilters.length === 0) return true; // If no filter is applied, show all

          // Check if station matches any selected filter in:
          return (
              (station.description && station.description.some(desc => selectedFilters.includes(desc))) ||
              (station.product && station.product.some(prod => selectedFilters.includes(prod))) ||
              (station.other_product && station.other_product.some(other => selectedFilters.includes(other))) ||
              (station.service && station.service.some(serv => selectedFilters.includes(serv)))
          );
      })
      .sort((a, b) => a.distance - b.distance); // Sort by distance
}



// Function to get selected filters from UI
// Function to get selected filters from UI
function getSelectedFilters() {
  const selectedIcons = document.querySelectorAll('.filter-icon.selected');
  return Array.from(selectedIcons).map(icon => icon.dataset.item);
}


// Event listener for nearby stations button
document
  .getElementById("nearbyStationsBtn")
  .addEventListener("click", function () {
    getCurrentLocation().then((currentLocation) => {
      fetch(
        "https://raw.githubusercontent.com/Ratana-tep/PTT_STATION_MAP/master/data/markers.json"
      )
        .then((response) => response.json())
        .then((data) => {
          const stations = data.STATION;
          fetch(
            "https://raw.githubusercontent.com/Ratana-tep/PTT_STATION_MAP/master/data/promotions.json"
          )
            .then((response) => response.json())
            .then((promotionData) => {
              // Merge promotion data with station data
              stations.forEach((station) => {
                const stationPromotions = promotionData.PROMOTIONS.find(
                  (promo) => promo.station_id === station.id
                );
                if (stationPromotions) {
                  station.promotions = stationPromotions.promotions;
                }
              });

              const nearbyStations = findNearbyStations(
                currentLocation,
                stations
              );

              const nearbyStationsList =
                document.getElementById("nearbyStationsList");
              nearbyStationsList.innerHTML = ""; // Clear the list

              if (nearbyStations.length > 0) {
                Promise.all(
                  nearbyStations.map((station) => {
                    return getBingRouteDistance(
                      currentLocation.lat,
                      currentLocation.lng,
                      station.latitude,
                      station.longitude
                    ).then((distance) => {
                      station.distance = distance; // Update station with the distance from Bing Maps
                      return station;
                    });
                  })
                ).then((stationsWithDistance) => {
                  stationsWithDistance.forEach((station) => {
                    const listItem = document.createElement("li");
                    listItem.classList.add("list-group-item");

                    let descriptionsHTML = "";
                    if (
                      station.description &&
                      station.description.filter((desc) => desc).length
                    ) {
                      descriptionsHTML = `
                        <div class="icons">
                          ${station.description
                            .filter((desc) => desc)
                            .map(
                              (desc) =>
                                `<img src="${getItemIcon(desc)}" alt="${desc}">`
                            )
                            .join("")}
                        </div>`;
                    }

                    let productsHTML = "";
                    if (
                      station.product &&
                      station.product.filter((product) => product).length
                    ) {
                      productsHTML = `
                        <div class="icons">
                          ${station.product
                            .filter((product) => product)
                            .map(
                              (product) =>
                                `<img src="${getProductIcon(
                                  product
                                )}" alt="${product}">`
                            )
                            .join("")}
                        </div>`;
                    }

                    let otherProductsHTML = "";
                    if (
                      station.other_product &&
                      station.other_product.filter((otherProduct) => otherProduct)
                        .length
                    ) {
                      otherProductsHTML = `
                        <div class="icons">
                          ${station.other_product
                            .filter((otherProduct) => otherProduct)
                            .map(
                              (otherProduct) =>
                                `<img src="${getProductIcon(
                                  otherProduct
                                )}" alt="${otherProduct}">`
                            )
                            .join("")}
                        </div>`;
                    }

                    let servicesHTML = "";
                    if (
                      station.service &&
                      station.service.filter((service) => service).length
                    ) {
                      servicesHTML = `
                        <div class="icons">
                          ${station.service
                            .filter((service) => service)
                            .map(
                              (service) =>
                                `<img src="${getItemIcon(
                                  service
                                )}" alt="${service}">`
                            )
                            .join("")}
                        </div>`;
                    }

                    let promotionHTML = "";
                    if (
                      station.promotions &&
                      station.promotions.filter((promo) => promo).length
                    ) {
                      promotionHTML = `
                        <div class="icons">
                          ${station.promotions
                            .filter((promo) => promo)
                            .map(
                              (promo) =>
                                `<img src="${getPromotionImageUrl_MARKER(
                                  promo.promotion_id
                                )}" alt="${promo.promotion_id}">`
                            )
                            .join("")}
                        </div>`;
                    }

                    // Get status information
                    const statusInfo = getStatusInfo(station.status);

                    listItem.innerHTML = `
                      <div class="d-flex align-items-start">
                        <div>
                          <img src="https://raw.githubusercontent.com/Ratana-tep/PTT_STATION_MAP/master/pictures/${
                            station.picture
                          }" alt="${
                      station.title
                    }" class="img-thumbnail me-3" style="width: 100px; height: 100px; object-fit: cover;">
                          <div class="d-flex flex-column align-items-start gap-1 mt-2">
                            <div class="badge ${
                              statusInfo.badgeClass
                            } text-white small">
                              <i class="fas ${statusInfo.iconClass} me-1"></i> ${
                      statusInfo.displayText
                    }
                            </div>
                            <div class="badge bg-primary text-white small">
                              <i class="fas fa-location-arrow me-1"></i>≈${station.distance} km
                            </div>
                          </div>
                        </div>
                        <div class="flex-grow-1">
                          <div class="station-details">
                            <h6>${station.title}</h6>
                            <p class="mb-1">${station.address}</p>
                            ${descriptionsHTML}
                            ${productsHTML}
                            ${otherProductsHTML}
                            ${servicesHTML}
                            ${promotionHTML}
                          </div>
                        </div>
                      </div>
                    `;

                    // Determine the current status of the station
                    const currentTime = new Date().toLocaleTimeString("en-US", {
                      timeZone: "Asia/Phnom_Penh",
                      hour12: false,
                    });
                    const [currentHour, currentMinute] = currentTime
                      .split(":")
                      .map(Number);

                    const openingHour = 5; // 5:00 AM
                    const closingHour = 20; // 8:00 PM
                    const closingMinute = 30; // 8:30 PM

                    // Log the current time and the hours
                    console.log(`Current Time: ${currentTime}`);
                    console.log(
                      `Current Hour: ${currentHour}, Current Minute: ${currentMinute}`
                    );
                    console.log(
                      `Station ${station.title}: Status - ${station.status}`
                    );
                    console.log(
                      `Opening Hour: ${openingHour}:00, Closing Hour: ${closingHour}:${closingMinute}`
                    );

                    // Check if the station is open 24 hours
                    const isOpen24h = station.status === "24h";

                    // Determine if the station is open
                    const isOpen =
                      isOpen24h ||
                      (currentHour > openingHour &&
                        (currentHour < closingHour ||
                          (currentHour === closingHour &&
                            currentMinute < closingMinute)));

                    console.log(`Is Open: ${isOpen}`);

                    if (isOpen) {
                      listItem.classList.add("open-station");
                    } else {
                      listItem.classList.add("closed-station");
                    }

                    listItem.addEventListener("click", () => {
                      map.setView(
                        [
                          parseFloat(station.latitude),
                          parseFloat(station.longitude),
                        ],
                        15
                      );
                      const markerData = allMarkers.find(
                        (m) =>
                          parseFloat(m.data.latitude) ===
                            parseFloat(station.latitude) &&
                          parseFloat(m.data.longitude) ===
                            parseFloat(station.longitude)
                      );
                      if (markerData) {
                        markerData.marker.openPopup(); // Open the marker popup
                        showMarkerModal(
                          station,
                          `https://raw.githubusercontent.com/Ratana-tep/PTT_STATION_MAP/master/pictures/${station.picture}`
                        ); // Show the marker modal
                        // Get route information and update modal
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
                                updateModalWithRoute(
                                  distance,
                                  travelTime,
                                  station.status
                                );
                              })
                              .catch((error) => {
                                console.error(
                                  "Error getting route from Bing Maps:",
                                  error
                                );
                                updateModalWithRoute(
                                  "N/A",
                                  "N/A",
                                  station.status
                                ); // Use placeholders if there's an error
                              });
                          })
                          .catch((error) => {
                            console.error(
                              "Error getting current location:",
                              error
                            );
                            updateModalWithRoute("N/A", "N/A", station.status); // Use placeholders if location is unavailable
                          });
                      } else {
                        console.error("Marker not found for station:", station);
                      }
                      const nearbyStationsModal = bootstrap.Modal.getInstance(
                        document.getElementById("nearbyStationsModal")
                      );
                      nearbyStationsModal.hide();
                    });

                    nearbyStationsList.appendChild(listItem);
                  });
                });
              } else {
                nearbyStationsList.innerHTML =
                  "<li class='list-group-item'>No nearby stations found.</li>";
              }

              var nearbyStationsModal = new bootstrap.Modal(
                document.getElementById("nearbyStationsModal"),
                {
                  keyboard: false,
                }
              );
              nearbyStationsModal.show();
            })
            .catch((error) => {
              console.error("Error fetching data:", error);
            });
        })
        .catch((error) => {
          console.error("Error getting current location:", error);
          alert("Error getting your location. Please try again later.");
        });
    });
  });
