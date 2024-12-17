const socket = io();

// Function to fetch weather data
async function fetchWeather(latitude, longitude) {
    const apiKey = '7bbeb884ab667ff846be635b20573d50'; // Replace with your actual OpenWeatherMap API key
    const apiUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${latitude}&lon=${longitude}&appid=${apiKey}&units=metric`;

    try {
        const response = await fetch(apiUrl);
        if (!response.ok) {
            throw new Error(`Weather API Error: ${response.statusText}`);
        }

        const data = await response.json();
        return {
            temperature: data.main.temp, // Temperature in °C
            condition: data.weather[0].description, // Weather condition description
            icon: `https://openweathermap.org/img/wn/${data.weather[0].icon}.png`, // Icon URL
        };
    } catch (error) {
        console.error('Error fetching weather data:', error);
        alert('Error fetching weather data. Please check the API key or network.');
        return null;
    }
}

// Function to update the weather widget
async function updateWeatherWidget(latitude, longitude) {
    const weather = await fetchWeather(latitude, longitude);
    const weatherElement = document.getElementById('weather-info');

    if (weather) {
        weatherElement.innerHTML = `
            <b>Temperature:</b> ${weather.temperature}°C<br>
            <b>Condition:</b> ${weather.condition}<br>
            <img src="${weather.icon}" alt="Weather icon" />
        `;
    } else {
        weatherElement.innerHTML = `<b>Weather data unavailable</b>`;
    }
}

// Geo-Fence setup
const geoFenceCenter = [28.7041, 77.1025]; // Example center (New Delhi)
const geoFenceRadius = 2000; // Geo-Fence radius in meters (2 km)
let lastLocationState = null; // Keep track of the last location state

// Initialize the map
const map = L.map('map').setView(geoFenceCenter, 14);

// Add a tile layer to the map
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: 'Map data &copy; By (Ayush & Indrajeet)'
}).addTo(map);

// Draw Geo-Fence Circle on the Map
const geoFence = L.circle(geoFenceCenter, {
    color: 'red',
    fillColor: '#f03',
    fillOpacity: 0.5,
    radius: geoFenceRadius
}).addTo(map);

// Add a marker for the Geo-Fence center
L.marker(geoFenceCenter).addTo(map).bindPopup('Geo-Fence Center').openPopup();

// Store markers by user ID
const markers = {};

// Function to calculate if a location is inside the Geo-Fence
function isInsideGeoFence(currentLocation) {
    const [lat1, lon1] = geoFenceCenter;
    const [lat2, lon2] = currentLocation;

    const R = 6371e3; // Earth's radius in meters
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a =
        Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) *
        Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    const distance = R * c;
    return distance <= geoFenceRadius;
}

// Geolocation support
if (navigator.geolocation) {
    navigator.geolocation.watchPosition(
        (position) => {
            const { latitude, longitude } = position.coords;

            // Emit the user's location to the server
            socket.emit('send-location', { latitude, longitude });

            // Update the weather widget
            updateWeatherWidget(latitude, longitude);

            // Check for geo-fence state changes (Enter/Exit)
            const isInside = isInsideGeoFence([latitude, longitude]);

            if (lastLocationState !== isInside) {
                if (isInside) {
                    console.log("Device entered the Geo-Fence");
                } else {
                    console.log("Device exited the Geo-Fence");
                    //alert(`Device has exited the Geo-Fence!`);
                }
                lastLocationState = isInside;
            }
        },
        (error) => {
            console.error(error);
        },
        {
            enableHighAccuracy: true,
            timeout: 5000,
            maximumAge: 0,
        }
    );
} else {
    console.error('Geolocation is not supported by this browser.');
}

// Listen for incoming location data from the server
socket.on('receive-location', async (data) => {
    const { id, latitude, longitude } = data;

    // Check if the current location is inside the Geo-Fence
    const isInside = isInsideGeoFence([latitude, longitude]);

    // Set map view to the latest location
    map.setView([latitude, longitude]);

    // Update marker position or create a new marker
    if (markers[id]) {
        markers[id].setLatLng([latitude, longitude]);
    } else {
        markers[id] = L.marker([latitude, longitude]).addTo(map);
    }

    // Update weather widget
    await updateWeatherWidget(latitude, longitude);

    // Send geo-fence alert
    if (!isInside) {
        alert(`Device ${id} has exited the Geo-Fence!`);
    }
});

// Remove markers when a user disconnects
socket.on('user-disconnected', (id) => {
    if (markers[id]) {
        map.removeLayer(markers[id]);
        delete markers[id];
    }
});