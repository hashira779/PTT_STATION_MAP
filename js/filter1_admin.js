// UPDATED: Add image mappings for your status types
const imageMapping = {
  "Amazon": "amazon.png",
  "7-Eleven": "7eleven.png",
  "Fleet card": "fleet.png",
  "KHQR": "KHQR.png",
  "Cash": "cash.png",
  "EV": "ev.png",
  "Onion": "onion.png",
  "ULG 95": "ULG95.png",
  "ULR 91": "ULR91.png",
  "HSD": "HSD.png",
  "Otr": "OTR.png",
  // Add new status images
  "24h": "24h.png",
  "16h": "16h.png",
  "Under Maintenance": "maintenance.png",
  "brand change": "close.png"
};

// Function to populate icon containers and province dropdown
function populateIconContainersAndDropdown(data) {
  const province = document.getElementById('province').value.toLowerCase() || '';

  populateIconContainer('product-icons', getUniqueItems(data, 'product', province), 'round');
  populateIconContainer('other-product-icons', getUniqueItems(data, 'other_product', province), 'custom');
  populateIconContainer('service-icons', getUniqueItems(data, 'service', province), 'custom');
  populateIconContainer('description-icons', getUniqueItems(data, 'description', province), 'round');
  populateIconContainer('promotion-icons', getUniqueItems(data, 'promotion', province), 'round');
  populateIconContainer('status-icons', getUniqueItems(data, 'status', province), 'round'); // UPDATED: Populate status icons
  populateProvinceDropdown(data);
}

// UPDATED: This function now handles both arrays (like 'product') and single strings (like 'status')
function getUniqueItems(data, key, province = '') {
  const items = new Set();
  data.forEach(station => {
    if ((!province || station.province.toLowerCase() === province) && station[key]) {
      const value = station[key];
      if (Array.isArray(value)) { // Handle arrays
        value.forEach(item => {
          if (item && item.trim() !== "") items.add(item);
        });
      } else if (typeof value === 'string' && value.trim() !== '') { // Handle strings
        items.add(value);
      }
    }
  });
  return Array.from(items);
}

// UPDATED: This function's availability check now works for both strings and arrays
function populateIconContainer(containerId, items, shapeClass) {
    const container = document.getElementById(containerId);
    const province = document.getElementById('province').value.toLowerCase();
    container.innerHTML = ''; // Clear existing icons

    items.forEach(item => {
        const img = document.createElement('img');
        img.src = `./pictures/${imageMapping[item]}`;
        img.alt = item;
        img.classList.add('filter-icon', shapeClass);
        img.dataset.item = item;

        const key = containerId.replace('-icons', '').replace('-', '_');
        const isAvailable = allMarkers.some(marker => {
            if (!province || marker.data.province.toLowerCase() === province) {
                const markerValue = marker.data[key];
                if (Array.isArray(markerValue)) {
                    return markerValue.map(el => el.toLowerCase()).includes(item.toLowerCase());
                } else if (typeof markerValue === 'string') {
                    return markerValue.toLowerCase() === item.toLowerCase();
                }
            }
            return false;
        });

        if (!isAvailable && province) {
            img.classList.add('disabled');
            img.style.pointerEvents = 'none';
        } else {
            img.classList.remove('disabled');
            img.style.pointerEvents = 'auto';
            img.addEventListener('click', toggleIconSelection);
        }

        container.appendChild(img);
    });
}


function populateProvinceDropdown(data) {
  const provinces = new Set();
  data.forEach(station => {
    provinces.add(station.province);
  });
  const sortedProvinces = Array.from(provinces).sort((a, b) => a.localeCompare(b));
  const provinceSelect = document.getElementById('province');
  
  // Clear existing options except for "All"
  provinceSelect.innerHTML = '<option value="">All</option>';

  sortedProvinces.forEach(province => {
    const option = document.createElement('option');
    option.value = province;
    option.text = province;
    provinceSelect.add(option);
  });
}
// Separate event listener attachment to avoid re-attaching on every populate
document.getElementById('province').addEventListener('change', () => {
    const selectedProvince = document.getElementById('province').value.toLowerCase();
    const data = allMarkers.map(m => m.data); // Assuming allMarkers is globally available
    
    const titles = new Set();
    data.forEach(station => {
        if (!selectedProvince || station.province.toLowerCase() === selectedProvince) {
            titles.add(station.title);
        }
    });

    const titleSelect = document.getElementById('title');
    titleSelect.innerHTML = '<option value="">All</option>'; // Clear existing titles
    Array.from(titles).sort().forEach(title => {
        const option = document.createElement('option');
        option.value = title;
        option.text = title;
        titleSelect.add(option);
    });
    
    // Repopulate icons based on selected province
    populateIconContainersAndDropdown(data);
});


function toggleIconSelection(event) {
  const icon = event.target;
  icon.classList.toggle('selected');
  updateClearFilterButton();
}

// UPDATED: Check for the new status filter
function areFiltersApplied() {
  const province = document.getElementById('province').value.toLowerCase();
  const title = document.getElementById('title').value.toLowerCase();
  const selectedProducts = getSelectedItems('product-icons');
  const selectedOtherProducts = getSelectedItems('other-product-icons');
  const selectedServices = getSelectedItems('service-icons');
  const selectedDescriptions = getSelectedItems('description-icons');
  const selectedPromotions = getSelectedItems('promotion-icons');
  const selectedStatuses = getSelectedItems('status-icons'); // New check

  return province || title || selectedProducts.length || selectedOtherProducts.length || selectedServices.length || selectedDescriptions.length || selectedPromotions.length || selectedStatuses.length;
}

function getSelectedItems(containerId) {
  const container = document.getElementById(containerId);
  const selectedIcons = container.querySelectorAll('.filter-icon.selected');
  return Array.from(selectedIcons).map(icon => icon.dataset.item);
}

function updateClearFilterButton() {
  const clearFilterButton = document.getElementById('clearAllButton');
  if (areFiltersApplied()) {
    clearFilterButton.style.display = 'block';
  } else {
    clearFilterButton.style.display = 'none';
  }
}

document.getElementById('filterForm').addEventListener('submit', function(event) {
  event.preventDefault();
  applyFilter();
  updateClearFilterButton();
  hideOffcanvas();
});

// UPDATED: Apply the new status filter
function applyFilter() {
  const province = document.getElementById('province').value.toLowerCase();
  const title = document.getElementById('title').value.toLowerCase();
  const selectedProducts = getSelectedItems('product-icons').map(item => item.toLowerCase());
  const selectedOtherProducts = getSelectedItems('other-product-icons').map(item => item.toLowerCase());
  const selectedServices = getSelectedItems('service-icons').map(item => item.toLowerCase());
  const selectedDescriptions = getSelectedItems('description-icons').map(item => item.toLowerCase());
  const selectedPromotions = getSelectedItems('promotion-icons').map(item => item.toLowerCase());
  const selectedStatuses = getSelectedItems('status-icons').map(item => item.toLowerCase()); // New filter

  markers.clearLayers();
  let filteredMarkers = [];

  allMarkers.forEach(entry => {
    let match = true;
    const station = entry.data;

    if (province && station.province.toLowerCase().indexOf(province) === -1) match = false;
    if (title && station.title.toLowerCase().indexOf(title) === -1) match = false;
    if (selectedProducts.length && !selectedProducts.some(item => (station.product || []).map(p => p.toLowerCase()).includes(item))) match = false;
    if (selectedOtherProducts.length && !selectedOtherProducts.some(item => (station.other_product || []).map(p => p.toLowerCase()).includes(item))) match = false;
    if (selectedServices.length && !selectedServices.some(item => (station.service || []).map(s => s.toLowerCase()).includes(item))) match = false;
    if (selectedDescriptions.length && !selectedDescriptions.some(item => (station.description || []).map(d => d.toLowerCase()).includes(item))) match = false;
    if (selectedPromotions.length && !selectedPromotions.some(item => (station.promotion || []).map(p => p.toLowerCase()).includes(item))) match = false;
    if (selectedStatuses.length && !selectedStatuses.includes((station.status || '').toLowerCase())) match = false; // New filter logic

    if (match) {
      markers.addLayer(entry.marker);
      filteredMarkers.push(entry.marker);
    }
  });

  map.addLayer(markers);

  if (filteredMarkers.length > 0) {
    const group = new L.featureGroup(filteredMarkers);
    const bounds = group.getBounds();
    map.flyToBounds(bounds, { animate: true, duration: 1 });
  }
}

function hideOffcanvas() {
  var filterOffcanvasElement = document.getElementById('filterOffcanvas');
  var filterOffcanvas = bootstrap.Offcanvas.getInstance(filterOffcanvasElement);
  if(filterOffcanvas) filterOffcanvas.hide();
}

function clearAllSelections() {
  document.getElementById('filterForm').reset();
  const iconContainers = document.querySelectorAll('.icon-container');
  iconContainers.forEach(container => {
    const icons = container.querySelectorAll('.filter-icon.selected');
    icons.forEach(icon => {
      icon.classList.remove('selected');
    });
  });

  markers.clearLayers();
  allMarkers.forEach(entry => markers.addLayer(entry.marker));
  map.addLayer(markers);

  const allMarkersArray = allMarkers.map(entry => entry.marker);
  if (allMarkersArray.length > 0) {
    const group = new L.featureGroup(allMarkersArray);
    const bounds = group.getBounds();
    map.flyToBounds(bounds, { animate: true, duration: 1 });
  }

  updateClearFilterButton();
}

document.getElementById('clearAllButton').addEventListener('click', clearAllSelections);
document.addEventListener('DOMContentLoaded', updateClearFilterButton);