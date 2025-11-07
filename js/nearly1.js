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

// Function to get status information
function getStatusInfo(status) {
    const cambodiaTime = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Phnom_Penh" }));
    const currentHour = cambodiaTime.getHours();
    const currentMinutes = cambodiaTime.getMinutes();



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



        // Determine if the station is closed
        if (
            (currentHour < openingHour) || // Before 5 AM
            (currentHour > closingHour) || // After 8 PM
            (currentHour === closingHour && currentMinutes >= closingMinutes) || // After 8:30 PM
            (currentHour >= 0 && currentHour < 5) // After midnight and before 5 AM
        ) {

            return {
                iconClass: "fa-times-circle",
                badgeClass: "bg-danger text-white",
                displayText: "Closed",
            };
        } else {
           
            return {
                iconClass: "fa-gas-pump",
                badgeClass: "bg-success text-white",
                displayText: `Open until 8:30 PM`,
            };
        }
    }
}

// Function to find nearby stations
function findNearbyStations(currentLocation, stations, maxDistance = 10) {
    return stations
        .map((station) => {
            const distance = calculateDistance(
                currentLocation.lat,
                currentLocation.lng,
                station.latitude,
                station.longitude
            );
            return { ...station, distance };
        })
        .filter((station) => station.distance <= maxDistance)
        .sort((a, b) => a.distance - b.distance);
}

// Event listener for nearby stations button
document.getElementById("nearbyStationsBtn").addEventListener("click", function () {
    getCurrentLocation()
        .then((currentLocation) => {
            fetch("https://raw.githubusercontent.com/Ratana-tep/PTT_STATION_MAP/master/data/markers.json")
                .then((response) => response.json())
                .then((data) => {
                    const stations = data.STATION;
                    const nearbyStations = findNearbyStations(currentLocation, stations);

                    const nearbyStationsList = document.getElementById("nearbyStationsList");
                    nearbyStationsList.innerHTML = ""; // Clear the list

                    if (nearbyStations.length > 0) {
                        nearbyStations.forEach((station) => {
                            const listItem = document.createElement("li");
                            listItem.classList.add("list-group-item");

                            let descriptionsHTML = '';
                            if (station.description && station.description.filter(desc => desc).length) {
                                descriptionsHTML = `
                                    <div class="icons">
                                        ${station.description.filter(desc => desc).map(desc => `<img src="${getItemIcon(desc)}" alt="${desc}">`).join('')}
                                    </div>`;
                            }

                            let productsHTML = '';
                            if (station.product && station.product.filter(product => product).length) {
                                productsHTML = `
                                    <div class="icons">
                                        ${station.product.filter(product => product).map(product => `<img src="${getProductIcon(product)}" alt="${product}">`).join('')}
                                    </div>`;
                            }

                            let otherProductsHTML = '';
                            if (station.other_product && station.other_product.filter(otherProduct => otherProduct).length) {
                                otherProductsHTML = `
                                    <div class="icons">
                                        ${station.other_product.filter(otherProduct => otherProduct).map(otherProduct => `<img src="${getProductIcon(otherProduct)}" alt="${otherProduct}">`).join('')}
                                    </div>`;
                            }

                            let servicesHTML = '';
                            if (station.service && station.service.filter(service => service).length) {
                                servicesHTML = `
                                    <div class="icons">
                                        ${station.service.filter(service => service).map(service => `<img src="${getItemIcon(service)}" alt="${service}">`).join('')}
                                    </div>`;
                            }

                            // Get status information
                            const statusInfo = getStatusInfo(station.status);
                            listItem.innerHTML = `
                            <div class="d-flex align-items-start">
                              <div>
                                <img src="https://raw.githubusercontent.com/Ratana-tep/PTT_STATION_MAP/master/pictures/${station.picture}" alt="${station.title}" class="img-thumbnail me-3" style="width: 100px; height: 100px; object-fit: cover;">
                                <div class="d-flex flex-column align-items-start gap-1 mt-2">
                                  <div class="badge ${statusInfo.badgeClass} text-white small">
                                    <i class="fas ${statusInfo.iconClass} me-1"></i> ${statusInfo.displayText}
                                  </div>
                                  <div class="badge bg-primary text-white small">
                                    <i class="fas fa-location-arrow me-1"></i>≈ ${station.distance.toFixed(2)} km
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
                                </div>
                              </div>
                            </div>
                          `;
                            // Determine the current status of the station
                            const currentTime = new Date().toLocaleTimeString("en-US", { timeZone: "Asia/Phnom_Penh", hour12: false });
                            const [currentHour, currentMinute] = currentTime.split(":").map(Number);

                            const openingHour = 5; // 5:00 AM
                            const closingHour = 20; // 8:00 PM
                            const closingMinute = 30; // 8:30 PM

                         

                            // Check if the station is open 24 hours
                            const isOpen24h = station.status === "24h";

                            // Determine if the station is open
                            const isOpen = isOpen24h || (currentHour > openingHour && (currentHour < closingHour || (currentHour === closingHour && currentMinute < closingMinute)));


                            if (isOpen) {
                                listItem.classList.add("open-station");
                            } else {
                                listItem.classList.add("closed-station");
                            }

                            listItem.addEventListener("click", () => {
                                map.setView([parseFloat(station.latitude), parseFloat(station.longitude)], 15);
                                const markerData = allMarkers.find((m) => parseFloat(m.data.latitude) === parseFloat(station.latitude) && parseFloat(m.data.longitude) === parseFloat(station.longitude));
                                if (markerData) {
                                    markerData.marker.openPopup(); // Open the marker popup
                                    showMarkerModal(station, `https://raw.githubusercontent.com/Ratana-tep/PTT_STATION_MAP/master/pictures/${station.picture}`); // Show the marker modal
                                    // Get route information and update modal
                                    getCurrentLocation()
                                        .then((currentLocation) => {
                                            getBingRoute(currentLocation.lat, currentLocation.lng, station.latitude, station.longitude)
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
                                } else {
                                    console.error("Marker not found for station:", station);
                                }
                                const nearbyStationsOffcanvas = bootstrap.Offcanvas.getInstance(document.getElementById("nearbyStationsOffcanvas"));
                                nearbyStationsOffcanvas.hide();
                            });

                            nearbyStationsList.appendChild(listItem);
                        });
                    } else {
                        nearbyStationsList.innerHTML = "<li class='list-group-item'>No nearby stations found.</li>";
                    }

                    var nearbyStationsOffcanvas = new bootstrap.Offcanvas(document.getElementById("nearbyStationsOffcanvas"));
                    nearbyStationsOffcanvas.show();
                })
                .catch((error) => {
                    error("Error fetching data:", error);
                });
        })
        .catch((error) => {
            error("Error getting current location:", error);
            alert("Error getting your location. Please try again later.");
        });
});