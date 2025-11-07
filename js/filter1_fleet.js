// --- Main Data Fetch (Example) ---
// This is where your initial fetch from the API should happen.
// The autoSelectFleetCard() call is moved here to fix the timing issue.
document.addEventListener('DOMContentLoaded', () => {
    // This function will fetch data and then run the setup.
    fetchInitialDataAndSetup(); 
});

async function fetchInitialDataAndSetup() {
    try {
        // This assumes you fetch from an endpoint and set up 'allMarkers' globally.
        // Replace with your actual initial data fetch call.
        const response = await fetch('/api/markers/admin_fleet'); // Using admin_fleet as an example
        const stationData = await response.json();

        // This is an example of how you might create your 'allMarkers' global array.
        // You'll need to adapt this part to your map marker creation logic.
        // For example:
        // allMarkers = stationData.map(station => ({ data: station, marker: createMarker(station) }));

        // 1. Populate all the filter controls using the fetched data
        populateIconContainersAndDropdown(stationData);

        // 2. NOW that icons are created, we can safely auto-select "Fleet card"
        autoSelectFleetCard();

    } catch (error) {
        console.error('Error fetching initial data:', error);
    }
}


// --- Your Corrected and Completed Code ---

const imageMapping = {
  "Amazon": "amazon.png", "7-Eleven": "7eleven.png", "Fleet card": "fleet.png",
  "KHQR": "KHQR.png", "Cash": "cash.png", "EV": "ev.png",
  "Onion": "onion.png", "ULG 95": "ULG95.png", "ULR 91": "ULR91.png",
  "HSD": "HSD.png", "Otr": "OTR.png", "24h": "24h.png",
  "16h": "16h.png", "Under Maintenance": "maintenance.png",
  "brand change": "close.png", "16h": "16h.png"
};

function autoSelectFleetCard() {
  const fleetCardIcon = document.querySelector('#service-icons img[data-item="Fleet card"]');
  if (fleetCardIcon) {
    fleetCardIcon.classList.add('selected');
    updateClearFilterButton();
    applyFilter();
  } else {
    console.error("Fleet card icon not found. It might not exist in the current dataset.");
  }
}

function populateIconContainersAndDropdown(data) {
  const province = document.getElementById('province').value.toLowerCase() || '';

  populateIconContainer('product-icons', getUniqueItems(data, 'product', province), 'round');
  populateIconContainer('other-product-icons', getUniqueItems(data, 'other_product', province), 'custom');
  populateIconContainer('service-icons', getUniqueItems(data, 'service', province), 'custom');
  populateIconContainer('description-icons', getUniqueItems(data, 'description', province), 'round');
  populateIconContainer('promotion-icons', getUniqueItems(data, 'promotion', province), 'round');
  populateIconContainer('status-icons', getUniqueItems(data, 'status', province), 'round');
  populateProvinceDropdown(data);
}

function getUniqueItems(data, key, province = '') {
  const items = new Set();
  data.forEach(station => {
    if ((!province || station.province.toLowerCase() === province) && station[key]) {
      const value = station[key];
      if (Array.isArray(value)) {
        value.forEach(item => { if (item && item.trim() !== "") items.add(item); });
      } else if (typeof value === 'string' && value.trim() !== '') {
        items.add(value);
      }
    }
  });
  return Array.from(items);
}

function populateIconContainer(containerId, items, shapeClass) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';
    items.forEach(item => {
        if (!imageMapping[item]) {
            console.warn(`No image mapping for item: ${item}`);
            return;
        }
        const img = document.createElement('img');
        img.src = `./pictures/${imageMapping[item]}`;
        img.alt = item;
        img.classList.add('filter-icon', shapeClass);
        img.dataset.item = item;
        img.addEventListener('click', toggleIconSelection);
        container.appendChild(img);
    });
}

function populateProvinceDropdown(data) {
  const provinces = new Set(data.map(station => station.province));
  const sortedProvinces = Array.from(provinces).sort((a, b) => a.localeCompare(b));
  const provinceSelect = document.getElementById('province');
  provinceSelect.innerHTML = '<option value="">All</option>';
  sortedProvinces.forEach(province => {
    const option = document.createElement('option');
    option.value = province; option.text = province;
    provinceSelect.add(option);
  });
}

document.getElementById('province').addEventListener('change', () => {
    const selectedProvince = document.getElementById('province').value.toLowerCase();
    const data = allMarkers.map(m => m.data);
    const titles = new Set();
    data.forEach(station => {
        if (!selectedProvince || station.province.toLowerCase() === selectedProvince) {
            titles.add(station.title);
        }
    });
    const titleSelect = document.getElementById('title');
    titleSelect.innerHTML = '<option value="">All</option>';
    Array.from(titles).sort().forEach(title => {
        const option = document.createElement('option');
        option.value = title; option.text = title;
        titleSelect.add(option);
    });
    populateIconContainersAndDropdown(data);
});

function toggleIconSelection(event) {
  event.target.classList.toggle('selected');
  updateClearFilterButton();
}

function areFiltersApplied() {
  const province = document.getElementById('province').value;
  const title = document.getElementById('title').value;
  return province || title || document.querySelector('.filter-icon.selected');
}

function getSelectedItems(containerId) {
  const container = document.getElementById(containerId);
  return Array.from(container.querySelectorAll('.filter-icon.selected')).map(icon => icon.dataset.item);
}

function updateClearFilterButton() {
  document.getElementById('clearAllButton').style.display = areFiltersApplied() ? 'block' : 'none';
}

document.getElementById('filterForm').addEventListener('submit', function(event) {
  event.preventDefault();
  applyFilter();
  updateClearFilterButton();
  hideOffcanvas();
});

function applyFilter() {
  const province = document.getElementById('province').value.toLowerCase();
  const title = document.getElementById('title').value.toLowerCase();
  const selectedProducts = getSelectedItems('product-icons').map(i => i.toLowerCase());
  const selectedOtherProducts = getSelectedItems('other-product-icons').map(i => i.toLowerCase());
  const selectedServices = getSelectedItems('service-icons').map(i => i.toLowerCase());
  const selectedDescriptions = getSelectedItems('description-icons').map(i => i.toLowerCase());
  const selectedPromotions = getSelectedItems('promotion-icons').map(i => i.toLowerCase());
  const selectedStatuses = getSelectedItems('status-icons').map(i => i.toLowerCase());

  markers.clearLayers();
  let filteredMarkers = [];

  allMarkers.forEach(entry => {
    const station = entry.data;
    let match = true;

    if (province && station.province.toLowerCase() !== province) match = false;
    if (title && station.title.toLowerCase() !== title) match = false;
    if (selectedProducts.length && !selectedProducts.some(item => (station.product || []).map(p => p.toLowerCase()).includes(item))) match = false;
    if (selectedOtherProducts.length && !selectedOtherProducts.some(item => (station.other_product || []).map(p => p.toLowerCase()).includes(item))) match = false;
    if (selectedServices.length && !selectedServices.some(item => (station.service || []).map(s => s.toLowerCase()).includes(item))) match = false;
    if (selectedDescriptions.length && !selectedDescriptions.some(item => (station.description || []).map(d => d.toLowerCase()).includes(item))) match = false;
    if (selectedPromotions.length && !selectedPromotions.some(item => (station.promotion || []).map(p => p.toLowerCase()).includes(item))) match = false;
    if (selectedStatuses.length && !selectedStatuses.includes((station.status || '').toLowerCase())) match = false;

    if (match) {
      markers.addLayer(entry.marker);
      filteredMarkers.push(entry.marker);
    }
  });

  map.addLayer(markers);

  if (filteredMarkers.length > 0) {
    const group = new L.featureGroup(filteredMarkers);
    map.flyToBounds(group.getBounds(), { animate: true, duration: 1 });
  }
}

function hideOffcanvas() {
  const offcanvasEl = document.getElementById('filterOffcanvas');
  const offcanvas = bootstrap.Offcanvas.getInstance(offcanvasEl);
  if (offcanvas) offcanvas.hide();
}

function clearAllSelections() {
  document.getElementById('filterForm').reset();
  document.querySelectorAll('.filter-icon.selected').forEach(icon => icon.classList.remove('selected'));
  
  const data = allMarkers.map(m => m.data);
  populateIconContainersAndDropdown(data);
  
  applyFilter();
  updateClearFilterButton();
}

document.getElementById('clearAllButton').addEventListener('click', clearAllSelections);