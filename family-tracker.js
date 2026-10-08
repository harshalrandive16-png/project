/* ==========================================================
   BHOOMISURAKSHA V10 - FAMILY TRACKER & SOS ENGINE
   Powered by: Leaflet, HTML5 Geolocation, Nominatim (OSM)
   (Firebase Realtime Sync is simulated for the Frontend Demo)
========================================================== */

let map;
let markers = {}; // Store marker objects by member ID
let myId = 'user_self';
let familyRoomCode = "BHBXSY"; 

// --- MOCK DATABASE (Simulating Firebase Realtime DB) ---
let familyMembers = [
    {
        id: myId,
        name: "You (Harshal)",
        avatarColor: "#06b6d4",
        lat: 21.1170, lng: 79.0136, // Will be updated by Geolocation
        address: "Locating...",
        battery: "85%",
        status: "safe", // 'safe' or 'sos'
        lastUpdate: "Just now"
    },
    {
        id: 'user_mom', name: "Mom", avatarColor: "#f43f5e",
        lat: 21.1250, lng: 79.0200, address: "Loading...", battery: "92%", status: "safe", lastUpdate: "1 min ago"
    },
    {
        id: 'user_dad', name: "Dad", avatarColor: "#10b981",
        lat: 21.1000, lng: 79.0050, address: "Loading...", battery: "45%", status: "safe", lastUpdate: "2 mins ago"
    }
];

let syncInterval;
let isSosActive = false;
let geoWatchId;

// --- TOAST NOTIFICATION ---
let lastToastMsg = "";
function showToast(message, type = 'info') {
    if (message === lastToastMsg) return;
    lastToastMsg = message; setTimeout(() => lastToastMsg="", 4000);

    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast';
    let icon = 'fa-circle-info', color = 'var(--c-cyan)';
    
    if (type === 'success') { icon = 'fa-circle-check'; color = 'var(--c-green)'; }
    if (type === 'error')   { icon = 'fa-circle-xmark'; color = 'var(--c-red)'; }

    toast.style.borderLeftColor = color;
    toast.innerHTML = `<i class="fa-solid ${icon}" style="color:${color}"></i> <span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0'; toast.style.transform = 'translateX(40px)';
        setTimeout(() => { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 300);
    }, 3500);
}

// --- INIT APP ---
document.addEventListener('DOMContentLoaded', () => {
    initMap();
    startRealtimeSync();
    setupControls();
    
    // Attempt to get Real GPS Location
    if (navigator.geolocation) {
        geoWatchId = navigator.geolocation.watchPosition(updateMyLocation, handleGeoError, { enableHighAccuracy: true });
    } else {
        fetchAddressesForMembers(); // Fallback to initial mock data
    }
});

// --- 1. LEAFLET MAP INITIALIZATION ---
function initMap() {
    // OpenStreetMap standard tiles but CSS handles the Dark Invert filter
    map = L.map('familyMap', { zoomControl: false }).setView([21.1170, 79.0136], 12);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap'
    }).addTo(map);

    setTimeout(() => { map.invalidateSize(); }, 500);
}

// --- 2. LOCATION & REVERSE GEOCODING (NOMINATIM API) ---
function updateMyLocation(position) {
    const lat = position.coords.latitude;
    const lng = position.coords.longitude;
    
    let me = familyMembers.find(m => m.id === myId);
    me.lat = lat;
    me.lng = lng;

    // Fetch Address (Rate limit safe check)
    fetchAddress(lat, lng).then(address => {
        me.address = address;
        renderMembersList();
    });

    // Fetch addresses for dummy members only once
    if (familyMembers[1].address === "Loading...") {
        fetchAddressesForMembers();
    }

    updateMapMarkers();
}

function handleGeoError() {
    showToast("GPS Access Denied. Showing last known locations.", "error");
    fetchAddressesForMembers();
}

async function fetchAddress(lat, lng) {
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`, {
            headers: { 'Accept-Language': 'en' }
        });
        const data = await res.json();
        // Extract a clean short address (Suburb/Road + City)
        let road = data.address.road || data.address.suburb || data.address.neighbourhood || "";
        let city = data.address.city || data.address.town || data.address.county || "";
        return road ? `${road}, ${city}` : (data.display_name.split(',').slice(0, 2).join(',') || "Unknown Location");
    } catch (e) {
        return "Location identified";
    }
}

async function fetchAddressesForMembers() {
    for (let m of familyMembers) {
        if (m.id !== myId || m.address === "Loading...") {
            m.address = await fetchAddress(m.lat, m.lng);
        }
    }
    renderMembersList();
    updateMapMarkers();
}

// --- 3. MOCK REAL-TIME SYNC (Simulating Firebase updates) ---
function startRealtimeSync() {
    syncInterval = setInterval(() => {
        // Randomly slightly move family members to simulate live tracking
        familyMembers.forEach(m => {
            if (m.id !== myId) {
                m.lat += (Math.random() * 0.001) - 0.0005;
                m.lng += (Math.random() * 0.001) - 0.0005;
            }
        });
        updateMapMarkers();
    }, 5000); // Sync every 5 seconds
}

// --- 4. RENDER UI (MAP & LIST) ---
function updateMapMarkers() {
    let bounds = [];

    familyMembers.forEach(m => {
        bounds.push([m.lat, m.lng]);

        // Create HTML for custom Avatar Marker
        let markerHtml = `<div style="width:100%; height:100%; background-color:${m.avatarColor}; color:#fff; display:flex; align-items:center; justify-content:center; font-weight:bold; font-size:16px;">${m.name.charAt(0)}</div>`;
        
        let customIcon = L.divIcon({
            className: `custom-avatar-marker ${m.status === 'sos' ? 'sos-marker' : ''}`,
            html: markerHtml,
            iconSize: [36, 36],
            iconAnchor: [18, 18]
        });

        // Update or Create Marker
        if (markers[m.id]) {
            markers[m.id].setLatLng([m.lat, m.lng]);
            markers[m.id].setIcon(customIcon);
        } else {
            let marker = L.marker([m.lat, m.lng], { icon: customIcon }).addTo(map);
            marker.bindPopup(`<b>${m.name}</b><br>${m.battery} Battery`);
            markers[m.id] = marker;
        }
    });
}

function renderMembersList() {
    const container = document.getElementById('membersContainer');
    document.getElementById('memberCount').innerText = familyMembers.length;
    
    let html = "";
    familyMembers.forEach(m => {
        let isSos = m.status === 'sos';
        html += `
        <div class="member-item ${isSos ? 'sos-active' : ''}" onclick="focusMember('${m.id}')">
            <div class="mem-avatar" style="background-color: ${m.avatarColor}">
                ${m.name.charAt(0)}
                <div class="mem-status ${isSos ? 'status-danger' : 'status-safe'}"></div>
            </div>
            <div class="mem-info">
                <div class="mem-name">${m.name} <span class="battery"><i class="fa-solid fa-battery-three-quarters"></i> ${m.battery}</span></div>
                <div class="mem-address">${m.address}</div>
                <div class="mem-time"><i class="fa-regular fa-clock"></i> ${m.lastUpdate}</div>
            </div>
        </div>`;
    });
    
    container.innerHTML = html;
}

// Click on list item to fly to map marker
window.focusMember = function(id) {
    let m = familyMembers.find(x => x.id === id);
    if(m) {
        map.flyTo([m.lat, m.lng], 15, { duration: 1.5 });
        markers[id].openPopup();
    }
}

// --- 5. UI CONTROLS & SOS LOGIC ---
function setupControls() {
    // Copy Code
    document.getElementById('copyCodeBtn').addEventListener('click', () => {
        navigator.clipboard.writeText(familyRoomCode);
        showToast("Family Code Copied!", "success");
    });

    // Join Room
    document.getElementById('joinBtn').addEventListener('click', () => {
        const val = document.getElementById('joinCodeInput').value.toUpperCase();
        if (val.length === 6) {
            showToast(`Joined Family Room ${val} successfully!`, "success");
        } else {
            showToast("Invalid code format", "error");
        }
    });

    // Force Sync
    document.getElementById('forceSyncBtn').addEventListener('click', () => {
        showToast("Syncing with Firebase...", "info");
        setTimeout(() => {
            renderMembersList();
            showToast("Data Up to date", "success");
        }, 800);
    });

    // Recenter Map
    document.getElementById('recenterBtn').addEventListener('click', () => {
        let me = familyMembers.find(m => m.id === myId);
        map.flyTo([me.lat, me.lng], 13, { duration: 1.2 });
    });

    // SOS BUTTON LOGIC
    const sosBtn = document.getElementById('sosBtn');
    const audio = document.getElementById('sosAudio');

    sosBtn.addEventListener('click', () => {
        isSosActive = !isSosActive;
        let me = familyMembers.find(m => m.id === myId);

        if (isSosActive) {
            // Activate SOS
            me.status = 'sos';
            sosBtn.classList.add('active');
            sosBtn.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i><span>CANCEL SOS</span>`;
            document.body.classList.add('sos-mode');
            
            showToast("EMERGENCY SIGNAL SENT TO FAMILY!", "error");
            
            // Play Audio Siren
            audio.loop = true;
            audio.play().catch(e => console.log("Audio autoplay blocked by browser"));
            
            // Simulated: Make another family member also go into SOS randomly to show dual-sync
            setTimeout(() => {
                familyMembers[1].status = 'sos';
                updateMapMarkers();
                renderMembersList();
                showToast("Mom activated SOS as well!", "error");
            }, 3000);

        } else {
            // Deactivate SOS
            me.status = 'safe';
            familyMembers[1].status = 'safe'; // Reset mock
            sosBtn.classList.remove('active');
            sosBtn.innerHTML = `<i class="fa-solid fa-bell"></i><span>FAMILY SOS</span>`;
            document.body.classList.remove('sos-mode');
            
            showToast("SOS Cancelled. Family Notified.", "success");
            audio.pause();
            audio.currentTime = 0;
        }

        updateMapMarkers();
        renderMembersList();
    });
}