// Function to show promotion modal
function showPromotionModal(promotions) {
    var promotionModal = new bootstrap.Modal(document.getElementById('promotionModal'), {
        keyboard: false
    });

    var promotionImagesContainerAll = document.getElementById('promotionContainerAll');
    var promotionImagesContainerPromotions = document.getElementById('promotionContainerPromotions');
    var promotionImagesContainerOpenings = document.getElementById('promotionContainerOpenings');

    // Clear previous promotions
    promotionImagesContainerAll.innerHTML = '';
    promotionImagesContainerPromotions.innerHTML = '';
    promotionImagesContainerOpenings.innerHTML = '';

    if (promotions && promotions.length > 0) {
        promotions.forEach(promotion => {
            const promotionImageUrl = getPromotionImageUrl(promotion.promotion_id); // Get the promotion image URL

            // Create and append elements for All tab
            createAndAppendPromotionElements(promotion, promotionImageUrl, promotionImagesContainerAll);

            // Create and append elements for specific tabs
            if (promotion.promotion_id.toLowerCase().startsWith('promotion') && !promotion.promotion_id.toLowerCase().includes('opening')) {
                createAndAppendPromotionElements(promotion, promotionImageUrl, promotionImagesContainerPromotions);
            } else if (promotion.promotion_id.toLowerCase().includes('opening')) {
                createAndAppendPromotionElements(promotion, promotionImageUrl, promotionImagesContainerOpenings);
            }
        });
        promotionModal.show();
    } else {
       
    }

    // Add event listeners for promotion images within the modal
    addPromotionImageEventListeners();
}

// Function to add event listeners for promotion images
function addPromotionImageEventListeners() {
    const promotionImages = document.querySelectorAll(".promotion-image");
    promotionImages.forEach(image => {
        image.classList.add('animate');
        image.addEventListener("click", function () {
            const promotionId = this.getAttribute("data-promotion-id");
            this.classList.toggle('selected'); // Toggle selected class
            filterMarkersByPromotion(promotionId);
            updateClearFilterButton(); // Update the button visibility
        });
    });
}

// Function to create and append promotion elements
function createAndAppendPromotionElements(promotion, promotionImageUrl, container) {
    const promotionItem = document.createElement('div');
    promotionItem.classList.add('promotion-item', 'mb-3');

    const promotionImage = document.createElement('img');
    promotionImage.src = promotionImageUrl; // Update with the correct image URL
    promotionImage.classList.add('img-fluid', 'mb-2', 'promotion-image'); // Add classes for styling
    promotionImage.setAttribute('data-promotion-id', promotion.promotion_id); // Set data-promotion-id attribute

    const promotionText = document.createElement('p');
    promotionText.classList.add('promotion-text');
    //old_ promotionText.innerText = `${promotion.promotion_id} (ends on ${formatPromotionEndTime(promotion.end_time)}) - ${promotion.description || 'No description'}`; // Update with the promotion details
    promotionText.innerText = `${promotion.promotion_id} ${promotion.description || 'No description'}`; // Update with the promotion details
    promotionItem.appendChild(promotionImage); // Append to promotion item
    promotionItem.appendChild(promotionText); // Append to promotion item

    container.appendChild(promotionItem); // Append promotion item to container
}

// Function to format promotion end time
function formatPromotionEndTime(endTime) {
    const date = new Date(endTime);
    if (isNaN(date.getTime())) {
       error(`Invalid date: ${endTime}`);
        return "Invalid Date";
    }
    return date.toLocaleDateString();
}

// Function to get the promotion image URL based on the item name
function getPromotionImageUrl(item) {
    const itemImages = {
        "promotion 1": "https://raw.githubusercontent.com/Ratana-tep/PTT_STATION_MAP/master/pictures/promotion/promotion_1.jpg",
        "promotion 2": "https://raw.githubusercontent.com/Ratana-tep/PTT_STATION_MAP/master/pictures/promotion/promotion_2.jpg",
        "promotion 3": "https://raw.githubusercontent.com/Ratana-tep/PTT_STATION_MAP/master/pictures/promotion/promotion_3.jpg",
        "promotion 4": "https://raw.githubusercontent.com/Ratana-tep/PTT_STATION_MAP/master/pictures/promotion/promotion_4.jpg",
        "promotion opening 1": "https://raw.githubusercontent.com/Ratana-tep/PTT_STATION_MAP/master/pictures/promotion/promotion_opening_1.jpg",
        "promotion opening 2": "https://raw.githubusercontent.com/Ratana-tep/PTT_STATION_MAP/master/pictures/promotion/promotion_opening_2.jpg",
        "promotion opening 3": "https://raw.githubusercontent.com/Ratana-tep/PTT_STATION_MAP/master/pictures/promotion/promotion_opening_3.jpg",
        "promotion opening 4": "https://raw.githubusercontent.com/Ratana-tep/PTT_STATION_MAP/master/pictures/promotion/promotion_opening_4.jpg",
        // Add other items as needed
    };
    return itemImages[item] || "https://raw.githubusercontent.com/Ratana-tep/PTT_STATION_MAP/master/pictures/default.png"; // Default image if item not found
}

// Function to filter markers by promotion
function filterMarkersByPromotion(promotionId) {
    markers.clearLayers(); // Clear existing markers
    let filteredMarkers = []; // Array to hold filtered markers

    allMarkers.forEach(entry => {
        if (entry.data.promotions && entry.data.promotions.some(promo => promo.promotion_id === promotionId)) {
            markers.addLayer(entry.marker);
            filteredMarkers.push(entry.marker); // Add the filtered marker to the array
        }
    });

    map.addLayer(markers);

    if (filteredMarkers.length > 0) {
        const group = new L.featureGroup(filteredMarkers);
        const bounds = group.getBounds();
        map.flyToBounds(bounds, {
            animate: true,
            duration: 1 // Adjust the duration of the zoom animation here
        }); // Animate map to fit the bounds of the filtered markers
    }

    // Hide the promotion modal
    var promotionModalElement = document.getElementById('promotionModal');
    var promotionModal = bootstrap.Modal.getInstance(promotionModalElement);
    promotionModal.hide();
    updateClearFilterButton(); // Update the button visibility
}

// Function to populate promotions dynamically
function populatePromotions(stations) {
    const promotionButton = document.getElementById('promotionBtn');
    const promotionNotificationDot = document.getElementById('promotionNotificationDot');

    // Show the red dot if there are promotions
    if (stations.some(station => station.promotions && station.promotions.length > 0
    )) {
        promotionNotificationDot.style.display = 'block';
        promotionNotificationDot.classList.add('pulse-animation');
    } else {
        promotionNotificationDot.style.display = 'none';
        promotionNotificationDot.classList.remove('pulse-animation');
    }

    promotionButton.addEventListener('click', function () {
        const allPromotions = stations.flatMap(station => station.promotions || []);
        const uniquePromotions = Array.from(new Map(allPromotions.map(promotion => [promotion.promotion_id, promotion])).values());
        if (uniquePromotions.length > 0) {
            showPromotionModal(uniquePromotions);
        }
    });
}

// Function to check if any promotion filters are applied
function arePromotionFiltersApplied() {
    const promotionImages = document.querySelectorAll(".promotion-image.selected");
    return promotionImages.length > 0;
}

// Function to update the visibility of the clear filter button
function updateClearFilterButton() {
    const clearFilterButton = document.getElementById('clearAllButton');
    const generalFiltersApplied = typeof areFiltersApplied === 'function' ? areFiltersApplied() : false; // Check general filters if the function exists
    const promotionFiltersApplied = arePromotionFiltersApplied(); // Check promotion filters

    if (generalFiltersApplied || promotionFiltersApplied) {
        clearFilterButton.style.display = 'block'; // Show the button
    } else {
        clearFilterButton.style.display = 'none'; // Hide the button
    }
}

// Function to clear all selections and show all markers
function clearAllSelections() {
    // Clear general filters if the function exists
    if (typeof clearGeneralFilters === 'function') {
        clearGeneralFilters();
    }

    // Clear promotion filters
    const promotionImages = document.querySelectorAll('.promotion-image');
    promotionImages.forEach(image => {
        image.classList.remove('selected');
    });

    markers.clearLayers(); // Clear existing markers

    // Add all markers back to the map
    allMarkers.forEach(entry => {
        markers.addLayer(entry.marker);
    });

    map.addLayer(markers); // Reset the map to show all markers

    // Optionally, fit the map bounds to all markers
    const allMarkersArray = allMarkers.map(entry => entry.marker);
    if (allMarkersArray.length > 0) {
        const group = new L.featureGroup(allMarkersArray);
        const bounds = group.getBounds();
        map.flyToBounds(bounds, {
            animate: true,
            duration: 1 // Adjust the duration of the zoom animation here
        }); // Animate map to fit the bounds of all markers
    }

    updateClearFilterButton(); // Hide the clear filter button
}

// Add event listener to clear all button
document.getElementById('clearAllButton').addEventListener('click', clearAllSelections);

// Fetch station and promotion data and initialize promotions
fetch("https://raw.githubusercontent.com/Ratana-tep/PTT_STATION_MAP/master/data/markers.json")
    .then(response => response.json())
    .then(data => {
        const stations = data.STATION;
        fetch("https://raw.githubusercontent.com/Ratana-tep/PTT_STATION_MAP/master/data/promotions.json")
            .then(response => response.json())
            .then(promotionData => {
                const promotions = promotionData.PROMOTIONS;
                // Match promotions with stations
                stations.forEach(station => {
                    const stationPromotions = promotions.find(promo => promo.station_id === parseInt(station.id));
                    if (stationPromotions) {
                        station.promotions = stationPromotions.promotions;
                    }
                });
                populatePromotions(stations);
            })
            .catch(error => error('Error loading promotion data:', error));
    })
    .catch(error => error('Error loading station data:', error));

// Clear modal content on hide
document.getElementById('promotionModal').addEventListener('hidden.bs.modal', function () {
    document.getElementById('promotionContainerAll').innerHTML = '';
    document.getElementById('promotionContainerPromotions').innerHTML = '';
    document.getElementById('promotionContainerOpenings').innerHTML = '';
    // Ensure the modal backdrop is properly removed
    document.body.classList.remove('modal-open');
    document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
});

// Manually hide the modal on close button click to ensure it closes properly
document.querySelector('#promotionModal .btn-close').addEventListener('click', function () {
    var promotionModal = bootstrap.Modal.getInstance(document.getElementById('promotionModal'));
    promotionModal.hide();
    // Ensure the modal backdrop is properly removed
    document.body.classList.remove('modal-open');
    document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
});
