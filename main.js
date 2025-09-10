function initializeMapWhenReady() {
    return new Promise((resolve, reject) => {
        if (typeof L !== 'undefined') {
            resolve();
            return;
        }
        
        const timeout = setTimeout(() => {
            reject(new Error('Leaflet failed to load within timeout'));
        }, 10000);
        
        let attempts = 0;
        const maxAttempts = 50;
        
        function checkLeaflet() {
            attempts++;
            
            if (typeof L !== 'undefined') {
                clearTimeout(timeout);
                resolve();
                return;
            }
            
            if (attempts >= maxAttempts) {
                clearTimeout(timeout);
                reject(new Error('Leaflet not available after maximum attempts'));
                return;
            }
            
            const delay = Math.min(100 * Math.pow(2, Math.floor(attempts / 10)), 1000);
            setTimeout(checkLeaflet, delay);
        }
        
        checkLeaflet();
    });
}

// Global variables
let map;
let donations = [];
let organizations = [];
let markers = [];
let markerCluster = null;
let routeControl = null;
let userLocation = null;
let clusteringEnabled = true;
let currentReservationId = null;
let isModalOpen = false;

// Sample data with coordinates
const initialDonations = [
    {
        id: 1,
        donorName: "Harvest Restaurant",
        contactPerson: "Maria Santos",
        phone: "(555) 123-4567",
        address: "123 Main St, Downtown",
        coordinates: [40.7589, -73.9851], // NYC coordinates
        foodType: "prepared",
        quantity: 50,
        expiry: "2025-08-07",
        urgency: "high",
        notes: "Hot meals ready for pickup. Includes vegetarian options.",
        status: "available",
        postedTime: new Date(Date.now() - 2 * 60 * 60 * 1000)
    },
    {
        id: 2,
        donorName: "Green Valley Grocery",
        contactPerson: "Tom Chen",
        phone: "(555) 234-5678",
        address: "456 Oak Ave, Midtown",
        coordinates: [40.7505, -73.9934],
        foodType: "produce",
        quantity: 200,
        expiry: "2025-08-09",
        urgency: "medium",
        notes: "Fresh vegetables and fruits. Some cosmetic imperfections but good quality.",
        status: "available",
        postedTime: new Date(Date.now() - 5 * 60 * 60 * 1000)
    },
    {
        id: 3,
        donorName: "Sunrise Bakery",
        contactPerson: "Emma Johnson",
        phone: "(555) 345-6789",
        address: "789 Pine St, Eastside",
        coordinates: [40.7614, -73.9776],
        foodType: "baked",
        quantity: 100,
        expiry: "2025-08-08",
        urgency: "low",
        notes: "End-of-day pastries and bread. All items baked fresh today.",
        status: "reserved",
        postedTime: new Date(Date.now() - 8 * 60 * 60 * 1000),
        reservedBy: "Downtown Food Bank",
        pickupTime: "2025-08-07T18:00"
    },
    {
        id: 4,
        donorName: "Metro Deli",
        contactPerson: "Alex Rivera",
        phone: "(555) 456-7890",
        address: "321 Broadway, Uptown",
        coordinates: [40.7831, -73.9712],
        foodType: "prepared",
        quantity: 75,
        expiry: "2025-08-07",
        urgency: "high",
        notes: "Fresh sandwiches and salads. Must be picked up today.",
        status: "in-transit",
        postedTime: new Date(Date.now() - 1 * 60 * 60 * 1000),
        reservedBy: "City Shelter",
        pickupTime: "2025-08-06T16:30"
    },
    {
        id: 5,
        donorName: "Campus Cafeteria",
        contactPerson: "Dr. Sarah Kim",
        phone: "(555) 567-8901",
        address: "100 University Ave, Campus",
        coordinates: [40.7282, -73.9942],
        foodType: "prepared",
        quantity: 120,
        expiry: "2025-08-07",
        urgency: "medium",
        notes: "Leftover lunch portions. Vegetarian and vegan options available.",
        status: "available",
        postedTime: new Date(Date.now() - 3 * 60 * 60 * 1000)
    }
];

let stats = {
    totalDonations: 247,
    peopleServed: 15840,
    foodRescued: 18200,
    co2Saved: 24.3,
    activeDonations: 5,
    avgPickupTime: 47
};

// Initialize the application
async function initializeApp() {
    try {
        console.log('Initializing Food Rescue Network...');
        
        donations = [...initialDonations];
        
        try {
            await initializeMapWhenReady();
            initializeMap();
        } catch (mapError) {
            console.warn('Map initialization failed:', mapError.message);
            showMapError();
        }
        
        setupEventListeners();
        renderDonations();
        simulateLiveUpdates();
        updateStats('init', 0);
        
        console.log('Food Rescue Network initialized successfully');
        showNotification('Food Rescue Network is ready!');
        
    } catch (error) {
        console.error('Critical initialization error:', error);
        showNotification('Error loading application. Please refresh the page.');
    }
}

function sanitizeHTML(str) {
    const temp = document.createElement('div');
    temp.textContent = str;
    return temp.innerHTML;
}

function sanitizeInput(input) {
    if (typeof input !== 'string') return input;
    return input.trim().replace(/[<>\"'&]/g, function(match) {
        const escapeMap = {
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#x27;',
            '&': '&amp;'
        };
        return escapeMap[match];
    });
}

function validateExpiryDate(dateString) {
    const expiryDate = new Date(dateString);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (isNaN(expiryDate.getTime())) {
        return { valid: false, message: 'Invalid date format' };
    }
    
    if (expiryDate < today) {
        return { valid: false, message: 'Expiry date cannot be in the past' };
    }
    
    const maxDate = new Date();
    maxDate.setFullYear(maxDate.getFullYear() + 1);
    
    if (expiryDate > maxDate) {
        return { valid: false, message: 'Expiry date cannot be more than 1 year in the future' };
    }
    
    return { valid: true };
}

function generateValidCoordinates() {
    const nycBounds = {
        minLat: 40.4774,
        maxLat: 40.9176,
        minLng: -74.2591,
        maxLng: -73.7004
    };
    
    const lat = nycBounds.minLat + Math.random() * (nycBounds.maxLat - nycBounds.minLat);
    const lng = nycBounds.minLng + Math.random() * (nycBounds.maxLng - nycBounds.minLng);
    
    return [lat, lng];
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Initialize the map with error handling
function initializeMap() {
    try {
        if (typeof L === 'undefined') {
            console.error('Leaflet library not loaded');
            showMapError();
            return;
        }

        // Check if map container exists and is not already initialized
        const mapContainer = document.getElementById('map');
        if (!mapContainer) {
            console.error('Map container not found');
            showMapError();
            return;
        }

        // Clear any existing map instance
        if (map) {
            map.remove();
            map = null;
        }

        // Clear the container content
        mapContainer.innerHTML = '';

        // Initialize the map
        map = L.map('map', {
            center: [40.7589, -73.9851],
            zoom: 12,
            scrollWheelZoom: true,
            zoomControl: true
        });

        // Add tile layer with error handling
        const tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 19,
            errorTileUrl: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjU2IiBoZWlnaHQ9IjI1NiIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjU2IiBoZWlnaHQ9IjI1NiIgZmlsbD0iI2VlZSIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTQiIGZpbGw9IiM5OTkiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuMzVlbSI+TWFwIFRpbGU8L3RleHQ+PC9zdmc+'
        });

        tileLayer.addTo(map);

        // Add error handler for tile loading
        tileLayer.on('tileerror', function(error) {
            console.warn('Tile loading error:', error);
        });

        // Wait for map to be fully loaded before adding interactions
        map.whenReady(function() {
            console.log('Map is ready');
            
            // Add click handler for address filling
            const debouncedMapClick = debounce(function(e) {
    try {
        const lat = e.latlng.lat.toFixed(6);
        const lng = e.latlng.lng.toFixed(6);
        
        const address = `${Math.floor(Math.random() * 999 + 1)} Street Name, City (${lat}, ${lng})`;
        
        const addressField = document.getElementById('address');
        const reqAddressField = document.getElementById('reqAddress');
        
        if (addressField && (addressField === document.activeElement || document.activeElement === document.body)) {
            addressField.value = address;
            showNotification('Address filled from map click');
        } else if (reqAddressField && reqAddressField === document.activeElement) {
            reqAddressField.value = address;
            showNotification('Organization address filled from map click');
        }

        const tempMarker = L.marker([parseFloat(lat), parseFloat(lng)], {
            icon: L.divIcon({
                className: 'temp-marker',
                html: '<div style="background: #ff6b6b; width: 20px; height: 20px; border-radius: 50%; border: 2px solid white; animation: pulse 1s infinite;"></div>',
                iconSize: [20, 20],
                iconAnchor: [10, 10]
            })
        }).addTo(map);
        
        setTimeout(() => {
            if (map && tempMarker) {
                map.removeLayer(tempMarker);
            }
        }, 3000);
    } catch (clickError) {
        console.error('Map click error:', clickError);
    }
}, 300);

map.on('click', debouncedMapClick);

            // Initialize user location with better error handling
            getUserLocation();
        });

    } catch (error) {
        console.error('Error initializing map:', error);
        showMapError();
    }
}

// Separate function for geolocation
function getUserLocation() {
    if (navigator.geolocation) {
        const options = {
            enableHighAccuracy: false,
            timeout: 10000,
            maximumAge: 300000 // 5 minutes
        };

        navigator.geolocation.getCurrentPosition(
            function(position) {
                try {
                    userLocation = [position.coords.latitude, position.coords.longitude];
                    console.log('User location obtained:', userLocation);
                    
                    if (map && typeof L !== 'undefined') {
                        const userMarker = L.marker(userLocation, {
                            icon: L.divIcon({
                                className: 'user-location-marker',
                                html: '<div style="background: #007bff; width: 15px; height: 15px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 8px rgba(0,123,255,0.5);"></div>',
                                iconSize: [15, 15],
                                iconAnchor: [7.5, 7.5]
                            })
                        }).addTo(map);
                        
                        userMarker.bindPopup('📍 Your Location').openPopup();
                        
                        // Close popup after 3 seconds
                        setTimeout(() => {
                            userMarker.closePopup();
                        }, 3000);
                    }
                } catch (locationError) {
                    console.error('Error processing location:', locationError);
                }
            },
            function(error) {
                let errorMessage = 'Location access denied';
                switch(error.code) {
                    case error.PERMISSION_DENIED:
                        errorMessage = 'Location access denied by user';
                        break;
                    case error.POSITION_UNAVAILABLE:
                        errorMessage = 'Location information unavailable';
                        break;
                    case error.TIMEOUT:
                        errorMessage = 'Location request timed out';
                        break;
                }
                console.warn('Geolocation error:', errorMessage);
                
                // Set a default location (NYC) for demo purposes
                userLocation = [40.7589, -73.9851];
                showNotification('📍 Using default location (location services unavailable)');
            },
            options
        );
    } else {
        console.warn('Geolocation not supported');
        userLocation = [40.7589, -73.9851];
        showNotification('📍 Using default location (geolocation not supported)');
    }
}

// Show map error fallback
function showMapError() {
    const mapElement = document.getElementById('map');
    if (mapElement) {
        mapElement.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: center; height: 100%; background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%); border-radius: 10px; flex-direction: column; border: 2px dashed #dee2e6;">
                <div style="font-size: 48px; margin-bottom: 20px; opacity: 0.6;">🗺️</div>
                <h3 style="color: #6c757d; margin-bottom: 10px; font-weight: 600;">Interactive Map Unavailable</h3>
                <p style="color: #868e96; text-align: center; margin-bottom: 20px; line-height: 1.5;">The map is temporarily unavailable, but all other features work perfectly!<br>You can still post donations and manage reservations.</p>
                <div style="display: flex; gap: 10px;">
                    <button onclick="retryMapLoad()" style="padding: 10px 20px; background: #007bff; color: white; border: none; border-radius: 25px; cursor: pointer; font-weight: 600; transition: all 0.3s ease;">🔄 Retry Map</button>
                    <button onclick="toggleMapVisibility()" style="padding: 10px 20px; background: #6c757d; color: white; border: none; border-radius: 25px; cursor: pointer; font-weight: 600;">📋 Hide Map Panel</button>
                </div>
            </div>
        `;
    }
}

// Retry map loading
function retryMapLoad() {
    showNotification('🔄 Retrying map initialization...');
    setTimeout(() => {
        initializeMap();
    }, 1000);
}

// Toggle map visibility
function toggleMapVisibility() {
    const mapContainer = document.querySelector('.map-container');
    const mainContent = document.querySelector('.main-content');
    
    if (mapContainer && mainContent) {
        if (mapContainer.style.display === 'none') {
            mapContainer.style.display = 'block';
            mainContent.style.gridTemplateColumns = '1fr 1fr';
            showNotification('🗺️ Map panel restored');
        } else {
            mapContainer.style.display = 'none';
            mainContent.style.gridTemplateColumns = '1fr';
            showNotification('📋 Map panel hidden - more space for listings!');
        }
    }
}

// Setup event listeners
function setupEventListeners() {
    const donateForm = document.getElementById('donateForm');
    const requestForm = document.getElementById('requestForm');
    const reserveForm = document.getElementById('reserveForm');
    const closeModal = document.querySelector('.close');

    donateForm.addEventListener('submit', handleDonation);
    requestForm.addEventListener('submit', handleRequest);
    reserveForm.addEventListener('submit', handleReservation);
    closeModal.addEventListener('click', closeReserveModal);
    
    window.addEventListener('click', (e) => {
        const modal = document.getElementById('reserveModal');
        if (e.target === modal) closeReserveModal();
    });
}

// Handle donation submission
function handleDonation(e) {
    e.preventDefault();
    
    try {
        const formData = {
            donorName: sanitizeInput(document.getElementById('donorName').value),
            contactPerson: sanitizeInput(document.getElementById('contactPerson').value),
            phone: sanitizeInput(document.getElementById('phone').value),
            address: sanitizeInput(document.getElementById('address').value),
            foodType: document.getElementById('foodType').value,
            quantity: parseInt(document.getElementById('quantity').value),
            expiry: document.getElementById('expiry').value,
            urgency: document.getElementById('urgency').value,
            notes: sanitizeInput(document.getElementById('notes').value)
        };
        
        if (!formData.donorName || !formData.contactPerson || !formData.address) {
            showNotification('Please fill in all required fields');
            return;
        }
        
        if (isNaN(formData.quantity) || formData.quantity <= 0 || formData.quantity > 10000) {
            showNotification('Please enter a valid quantity between 1 and 10,000');
            return;
        }
        
        const dateValidation = validateExpiryDate(formData.expiry);
        if (!dateValidation.valid) {
            showNotification('Error: ' + dateValidation.message);
            return;
        }
        
        if (!/^[\d\s\-\(\)\+\.]{10,}$/.test(formData.phone)) {
            showNotification('Please enter a valid phone number');
            return;
        }
        
        const coordinates = generateValidCoordinates();
        
        const donation = {
            id: donations.length + 1,
            ...formData,
            coordinates: coordinates,
            status: 'available',
            postedTime: new Date()
        };

        donations.unshift(donation);
        updateStats('donation', donation.quantity);
        renderDonations();
        
        if (map && typeof L !== 'undefined') {
            updateMarkers();
        }
        
        addLiveUpdate(`New ${getFoodTypeLabel(donation.foodType)} donation from ${donation.donorName}`);
        
        document.getElementById('donateForm').reset();
        showNotification('Donation posted successfully! Organizations will be notified.');
        
    } catch (error) {
        console.error('Error handling donation:', error);
        showNotification('Error posting donation. Please try again.');
    }
}

// Handle organization request
function handleRequest(e) {
    e.preventDefault();
    
    const organization = {
        id: organizations.length + 1,
        name: document.getElementById('orgName').value,
        type: document.getElementById('orgType').value,
        contact: document.getElementById('reqContact').value,
        phone: document.getElementById('reqPhone').value,
        address: document.getElementById('reqAddress').value,
        capacity: parseInt(document.getElementById('capacity').value),
        preferences: document.getElementById('preferences').value,
        registeredTime: new Date()
    };

    organizations.push(organization);
    addLiveUpdate(`${organization.name} registered as ${organization.type}`);
    
    document.getElementById('requestForm').reset();
    showNotification('✅ Organization registered successfully! You\'ll receive notifications about available donations.');
}

// Handle reservation
function handleReservation(e) {
    e.preventDefault();
    
    try {
        const donation = donations.find(d => d.id === currentReservationId);
        if (donation) {
            donation.status = 'reserved';
            donation.reservedBy = document.getElementById('pickupOrg').value;
            donation.pickupTime = document.getElementById('pickupTime').value;
            
            updateStats('rescue', donation.quantity);
            renderDonations();
            
            // Update markers only if map is available
            if (map && typeof L !== 'undefined') {
                updateMarkers();
            }
            
            addLiveUpdate(`${donation.donorName} donation reserved by ${donation.reservedBy}`);
            
            // Simulate pickup after some time
            setTimeout(() => {
                donation.status = 'in-transit';
                if (map && typeof L !== 'undefined') {
                    updateMarkers();
                }
                addLiveUpdate(`Pickup in progress: ${donation.donorName}`);
                
                setTimeout(() => {
                    donation.status = 'completed';
                    if (map && typeof L !== 'undefined') {
                        updateMarkers();
                    }
                    renderDonations();
                    addLiveUpdate(`✅ Delivery completed: ${donation.donorName}`);
                }, 30000); // 30 seconds for demo
            }, 15000); // 15 seconds for demo
            
            closeReserveModal();
            showNotification('✅ Donation reserved successfully! Pickup details sent to donor.');
        }
    } catch (error) {
        console.error('Error handling reservation:', error);
        showNotification('❌ Error processing reservation. Please try again.');
    }
}

// Update map markers with error handling
function updateMarkers() {
    if (!map || typeof L === 'undefined') {
        console.log('Map not available, skipping marker update');
        return;
    }

    try {
        markers.forEach(marker => {
            try {
                if (map.hasLayer(marker)) {
                    map.removeLayer(marker);
                }
            } catch (e) {
                console.warn('Error removing marker:', e);
            }
        });
        
        markers.length = 0;

        if (markerCluster && map.hasLayer(markerCluster)) {
            map.removeLayer(markerCluster);
            markerCluster = null;
        }

        donations.forEach(donation => {
            if (donation.status !== 'completed') {
                const marker = createMarker(donation);
                if (marker && map) {
                    marker.addTo(map);
                    markers.push(marker);
                }
            }
        });
    } catch (error) {
        console.error('Error updating markers:', error);
    }
}

// Create marker for donation with error handling
function createMarker(donation) {
    try {
        if (!donation.coordinates || typeof L === 'undefined') {
            return null;
        }

        let iconColor = '#28a745'; // green for available
        let statusIcon = '🍎';

        switch(donation.status) {
            case 'reserved':
                iconColor = '#ffc107'; // yellow
                statusIcon = '⏳';
                break;
            case 'in-transit':
                iconColor = '#17a2b8'; // blue
                statusIcon = '🚚';
                break;
            case 'completed':
                iconColor = '#6c757d'; // gray
                statusIcon = '✅';
                break;
        }

        const customIcon = L.divIcon({
            className: 'custom-marker',
            html: `<div style="background: ${iconColor}; width: 30px; height: 30px; border-radius: 50%; border: 3px solid white; display: flex; align-items: center; justify-content: center; font-size: 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.3);" class="${donation.urgency === 'high' ? 'pulse' : ''}">${statusIcon}</div>`,
            iconSize: [30, 30],
            iconAnchor: [15, 15]
        });

        const marker = L.marker(donation.coordinates, { icon: customIcon });
        
        const popupContent = `
            <div style="min-width: 200px;">
                <h4 style="margin-bottom: 10px; color: #667eea;">${donation.donorName}</h4>
                <p><strong>Type:</strong> ${getFoodTypeLabel(donation.foodType)}</p>
                <p><strong>Quantity:</strong> ${donation.quantity} ${getQuantityUnit(donation.foodType)}</p>
                <p><strong>Urgency:</strong> ${donation.urgency.charAt(0).toUpperCase() + donation.urgency.slice(1)}</p>
                <p><strong>Status:</strong> <span class="status-badge status-${donation.status}">${donation.status}</span></p>
                <p><strong>Contact:</strong> ${donation.contactPerson}</p>
                <p><strong>Phone:</strong> ${donation.phone}</p>
                ${donation.status === 'available' ? 
                    `<button onclick="openReserveModal(${donation.id})" style="background: #28a745; color: white; border: none; padding: 8px 16px; border-radius: 5px; cursor: pointer; margin-top: 10px;">🚚 Reserve</button>` : 
                    donation.status === 'reserved' ? 
                    `<p style="color: #28a745; font-weight: bold; margin-top: 10px;">Reserved by ${donation.reservedBy}</p>` :
                    donation.status === 'in-transit' ?
                    `<p style="color: #17a2b8; font-weight: bold; margin-top: 10px;">🚚 Pickup in progress</p>` : ''
                }
            </div>
        `;
        
        marker.bindPopup(popupContent);
        return marker;
    } catch (error) {
        console.error('Error creating marker:', error);
        return null;
    }
}

// Toggle clustering
function toggleClustering() {
    clusteringEnabled = !clusteringEnabled;
    updateMarkers();
    showNotification(clusteringEnabled ? '🔄 Clustering enabled' : '🔄 Clustering disabled');
}

// Show optimal route with error handling
function showOptimalRoute() {
    if (!map || typeof L === 'undefined') {
        showNotification('🗺️ Map not available for route calculation');
        return;
    }

    if (!userLocation) {
        showNotification('📍 Please enable location services to calculate routes');
        return;
    }

    try {
        // Clear existing route
        if (routeControl && map) {
            map.removeControl(routeControl);
        }

        // Find available donations sorted by urgency and distance
        const availableDonations = donations
            .filter(d => d.status === 'available')
            .sort((a, b) => {
                const urgencyWeight = { high: 3, medium: 2, low: 1 };
                return urgencyWeight[b.urgency] - urgencyWeight[a.urgency];
            });

        if (availableDonations.length === 0) {
            showNotification('No available donations for route optimization');
            return;
        }

        // Create route waypoints (simplified - in real app would use routing API)
        const waypoints = [
            L.latLng(userLocation[0], userLocation[1]),
            ...availableDonations.slice(0, 3).map(d => L.latLng(d.coordinates[0], d.coordinates[1]))
        ];

        // Add route line (simplified visualization)
        const routeCoords = waypoints.map(wp => [wp.lat, wp.lng]);
        const routeLine = L.polyline(routeCoords, {
            color: '#667eea',
            weight: 4,
            opacity: 0.8,
            dashArray: '10, 10'
        }).addTo(map);

        markers.push(routeLine);

        // Calculate estimated time and distance (simplified)
        const totalDistance = calculateTotalDistance(routeCoords);
        const estimatedTime = Math.round(totalDistance * 2); // 2 minutes per km

        showNotification(`🛣️ Optimal route calculated: ${totalDistance.toFixed(1)}km, ~${estimatedTime} minutes`);

        // Show route info in modal if it's open
        const routeInfo = document.getElementById('routeInfo');
        if (routeInfo) {
            routeInfo.innerHTML = `
                <h4>📍 Optimal Route</h4>
                <p><strong>Distance:</strong> ${totalDistance.toFixed(1)} km</p>
                <p><strong>Estimated Time:</strong> ${estimatedTime} minutes</p>
                <div class="route-step">1. Start from your location</div>
                ${availableDonations.slice(0, 3).map((d, i) => 
                    `<div class="route-step">${i + 2}. ${d.donorName} - ${d.foodType} (${d.urgency} priority)</div>`
                ).join('')}
            `;
            routeInfo.style.display = 'block';
        }
    } catch (error) {
        console.error('Error showing route:', error);
        showNotification('Error calculating route. Please try again.');
    }
}

// Calculate total distance (simplified)
function calculateTotalDistance(coordinates) {
    let totalDistance = 0;
    for (let i = 0; i < coordinates.length - 1; i++) {
        totalDistance += getDistance(coordinates[i], coordinates[i + 1]);
    }
    return totalDistance;
}

// Calculate distance between two points (Haversine formula)
function getDistance(coord1, coord2) {
    const R = 6371; // Earth's radius in km
    const dLat = (coord2[0] - coord1[0]) * Math.PI / 180;
    const dLon = (coord2[1] - coord1[1]) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(coord1[0] * Math.PI / 180) * Math.cos(coord2[0] * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

// Center map on user location with error handling
function centerOnUser() {
    if (!map || typeof L === 'undefined') {
        showNotification('🗺️ Map not available');
        return;
    }

    if (userLocation) {
        try {
            map.setView(userLocation, 14);
            showNotification('📍 Centered on your location');
        } catch (error) {
            console.error('Error centering map:', error);
            showNotification('📍 Unable to center map on your location');
        }
    } else {
        showNotification('📍 Location not available. Please enable location services.');
    }
}

// Calculate route for reservation
function calculateRoute() {
    const donation = donations.find(d => d.id === currentReservationId);
    if (!donation || !userLocation) {
        showNotification('Unable to calculate route');
        return;
    }

    const distance = getDistance(userLocation, donation.coordinates);
    const estimatedTime = Math.round(distance * 3); // 3 minutes per km with traffic

    const routeInfo = document.getElementById('routeInfo');
    routeInfo.innerHTML = `
        <h4>🗺️ Route Information</h4>
        <p><strong>Distance:</strong> ${distance.toFixed(1)} km</p>
        <p><strong>Estimated Time:</strong> ${estimatedTime} minutes</p>
        <p><strong>From:</strong> Your location</p>
        <p><strong>To:</strong> ${donation.address}</p>
        <div class="route-step">💡 Best route via main roads</div>
        <div class="route-step">🚗 Consider traffic conditions</div>
    `;
    routeInfo.style.display = 'block';

    // Update pickup time suggestion
    const suggestedTime = new Date(Date.now() + estimatedTime * 60000);
    document.getElementById('pickupTime').value = suggestedTime.toISOString().slice(0, 16);
}

// Open reservation modal
function openReserveModal(donationId) {
    if (isModalOpen) {
        console.warn('Modal already open');
        return;
    }
    
    currentReservationId = donationId;
    const modal = document.getElementById('reserveModal');
    modal.style.display = 'block';
    isModalOpen = true;
    
    const firstInput = modal.querySelector('input, select, textarea, button');
    if (firstInput) {
        setTimeout(() => firstInput.focus(), 100);
    }
    
    const now = new Date();
    const minTime = new Date(now.getTime() + 30 * 60000);
    document.getElementById('pickupTime').min = minTime.toISOString().slice(0, 16);

    if (organizations.length > 0) {
        const lastOrg = organizations[organizations.length - 1];
        document.getElementById('pickupOrg').value = sanitizeInput(lastOrg.name);
        document.getElementById('pickupContact').value = sanitizeInput(lastOrg.contact);
        document.getElementById('pickupPhone').value = sanitizeInput(lastOrg.phone);
    }
}

// Close reservation modal
function closeReserveModal() {
    const modal = document.getElementById('reserveModal');
    modal.style.display = 'none';
    document.getElementById('reserveForm').reset();
    document.getElementById('routeInfo').style.display = 'none';
    currentReservationId = null;
    isModalOpen = false;
    
    document.body.focus();
}

// Render donations list
function renderDonations() {
    const donationsList = document.getElementById('donationsList');
    donationsList.innerHTML = '';
    
    const activeDonations = donations.filter(d => d.status !== 'completed');
    
    if (activeDonations.length === 0) {
        donationsList.innerHTML = '<p style="text-align: center; color: #666; font-style: italic;">No active donations at the moment.</p>';
        return;
    }

    activeDonations.forEach(donation => {
        const urgencyClass = `urgency-${donation.urgency}`;
        const statusClass = `status-${donation.status}`;
        const timeAgo = getTimeAgo(donation.postedTime);
        
        const listingDiv = document.createElement('div');
        listingDiv.className = `listing-item ${urgencyClass}`;
        
        listingDiv.innerHTML = `
            <div class="listing-header">
                <div class="listing-title">${sanitizeHTML(donation.donorName)}</div>
                <div class="status-badge ${statusClass}">${donation.status}</div>
            </div>
            <div class="listing-details">
                <div class="detail-item">
                    <strong>Food Type:</strong> ${getFoodTypeLabel(donation.foodType)}
                </div>
                <div class="detail-item">
                    <strong>Quantity:</strong> ${donation.quantity} ${getQuantityUnit(donation.foodType)}
                </div>
                <div class="detail-item">
                    <strong>Expires:</strong> ${formatDate(donation.expiry)}
                </div>
                <div class="detail-item">
                    <strong>Urgency:</strong> ${donation.urgency.charAt(0).toUpperCase() + donation.urgency.slice(1)}
                </div>
                <div class="detail-item">
                    <strong>Contact:</strong> ${sanitizeHTML(donation.contactPerson)}
                </div>
                <div class="detail-item">
                    <strong>Phone:</strong> ${sanitizeHTML(donation.phone)}
                </div>
            </div>
            <div style="margin-bottom: 15px;">
                <strong>Address:</strong> ${sanitizeHTML(donation.address)}
            </div>
            ${donation.notes ? `<div style="margin-bottom: 15px;"><strong>Notes:</strong> ${sanitizeHTML(donation.notes)}</div>` : ''}
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <small style="color: #666;">Posted ${timeAgo}</small>
                <div id="action-${donation.id}"></div>
            </div>
        `;
        
        donationsList.appendChild(listingDiv);
        
        const actionDiv = document.getElementById(`action-${donation.id}`);
        if (donation.status === 'available') {
            const button = document.createElement('button');
            button.className = 'btn btn-secondary';
            button.textContent = 'Reserve Pickup';
            button.onclick = () => openReserveModal(donation.id);
            actionDiv.appendChild(button);
        } else if (donation.status === 'reserved') {
            actionDiv.innerHTML = `<span style="color: #28a745; font-weight: bold;">Reserved by ${sanitizeHTML(donation.reservedBy)}</span>`;
        } else if (donation.status === 'in-transit') {
            actionDiv.innerHTML = '<span style="color: #17a2b8; font-weight: bold;">Pickup in progress</span>';
        }
    });
}

// Get appropriate action button for donation status
function getActionButton(donation) {
    switch(donation.status) {
        case 'available':
            return `<button class="btn btn-secondary" onclick="openReserveModal(${donation.id})">🚚 Reserve Pickup</button>`;
        case 'reserved':
            return `<span style="color: #28a745; font-weight: bold;">Reserved by ${donation.reservedBy}</span>`;
        case 'in-transit':
            return `<span style="color: #17a2b8; font-weight: bold;">🚚 Pickup in progress</span>`;
        default:
            return '';
    }
}

// Update statistics with init handling
function updateStats(type, quantity) {
    try {
        if (type === 'donation') {
            stats.totalDonations++;
            stats.foodRescued += quantity;
            stats.activeDonations = donations.filter(d => d.status === 'available').length;
        } else if (type === 'rescue') {
            stats.peopleServed += Math.floor(quantity * 1.2);
            stats.co2Saved += quantity * 0.001;
            stats.activeDonations = donations.filter(d => d.status === 'available').length;
        } else if (type === 'init') {
            // Initialize stats from current donations
            stats.activeDonations = donations.filter(d => d.status === 'available').length;
        }
        
        // Update DOM elements safely
        const elements = {
            'totalDonations': stats.totalDonations,
            'peopleServed': stats.peopleServed.toLocaleString(),
            'foodRescued': stats.foodRescued.toLocaleString(),
            'co2Saved': stats.co2Saved.toFixed(1),
            'activeDonations': stats.activeDonations,
            'avgPickupTime': stats.avgPickupTime
        };

        Object.entries(elements).forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (element) {
                element.textContent = value;
            }
        });
    } catch (error) {
        console.error('Error updating stats:', error);
    }
}

// Utility functions
function getFoodTypeLabel(type) {
    const labels = {
        'prepared': '🍽️ Prepared Meals',
        'produce': '🥕 Fresh Produce',
        'dairy': '🥛 Dairy Products',
        'baked': '🥖 Baked Goods',
        'packaged': '📦 Packaged Foods',
        'frozen': '🧊 Frozen Items'
    };
    return labels[type] || type;
}

function getQuantityUnit(type) {
    return type === 'prepared' ? 'servings' : 'lbs';
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
        weekday: 'short', 
        month: 'short', 
        day: 'numeric' 
    });
}

function getTimeAgo(date) {
    const now = new Date();
    const diffMs = now - date;
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMins = Math.floor(diffMs / (1000 * 60));
    
    if (diffHours >= 24) {
        const days = Math.floor(diffHours / 24);
        return `${days} day${days > 1 ? 's' : ''} ago`;
    } else if (diffHours >= 1) {
        return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    } else {
        return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
    }
}

// Live updates functionality
const liveUpdates = [];

function addLiveUpdate(message) {
    const update = {
        message: message,
        time: new Date(),
        id: Date.now()
    };
    
    liveUpdates.unshift(update);
    
    // Keep only last 10 updates
    if (liveUpdates.length > 10) {
        liveUpdates.pop();
    }
    
    renderLiveUpdates();
}

function renderLiveUpdates() {
    const updatesList = document.getElementById('updatesList');
    
    if (liveUpdates.length === 0) {
        updatesList.innerHTML = '<div style="color: #999; font-style: italic;">No recent updates</div>';
        return;
    }
    
    updatesList.innerHTML = liveUpdates.map(update => `
        <div class="update-item">
            <div>${update.message}</div>
            <div class="update-time">${update.time.toLocaleTimeString()}</div>
        </div>
    `).join('');
}

function simulateLiveUpdates() {
    // Simulate periodic updates
    setInterval(() => {
        const updateTypes = [
            'New donor registration from local restaurant',
            'Food safety check completed for downtown pickup',
            'Route optimization updated with current traffic',
            'Volunteer driver assigned to urgent pickup',
            'Real-time inventory updated across network'
        ];
        
        const randomUpdate = updateTypes[Math.floor(Math.random() * updateTypes.length)];
        addLiveUpdate(randomUpdate);
    }, 45000); // Every 45 seconds

    // Simulate occasional status updates
    setInterval(() => {
        const availableDonations = donations.filter(d => d.status === 'available');
        if (availableDonations.length > 0 && Math.random() < 0.3) {
            const donation = availableDonations[Math.floor(Math.random() * availableDonations.length)];
            addLiveUpdate(`${donation.donorName} donation status updated`);
        }
    }, 60000); // Every minute
}

function showNotification(message) {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: #28a745;
        color: white;
        padding: 15px 25px;
        border-radius: 25px;
        box-shadow: 0 4px 15px rgba(0,0,0,0.3);
        z-index: 1002;
        font-weight: 600;
        max-width: 400px;
        text-align: center;
        animation: slideDown 0.3s ease;
    `;
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 4000);
}

// Toggle live updates panel minimization
function toggleLiveUpdates() {
    const liveUpdates = document.getElementById('liveUpdates');
    const minimizeBtn = document.getElementById('minimizeBtn');
    
    if (liveUpdates.classList.contains('minimized')) {
        liveUpdates.classList.remove('minimized');
        minimizeBtn.textContent = '−';
        minimizeBtn.title = 'Minimize';
    } else {
        liveUpdates.classList.add('minimized');
        minimizeBtn.textContent = '+';
        minimizeBtn.title = 'Expand';
    }
}

// Initialize the application when the page loads
document.addEventListener('DOMContentLoaded', initializeApp);

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else if (document.readyState === 'interactive' || document.readyState === 'complete') {
    initializeApp();
}