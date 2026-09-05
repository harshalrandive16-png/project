/* ================================================================
   BhoomiSuraksha – script.js
   AI-Based Pan-India Multi-Disaster Early Warning System
   ================================================================ */

/* ---------- PAN-INDIA MULTI-DISASTER ZONES ---------- */
const zones = [
  { id: 1,  name: "Chennai Coast",   state: "Tamil Nadu",       disaster: "Cyclone",   lat: 13.08, lng: 80.27, score: 88, risk: "severe",   rainfall: 142, wind: 180, river: 0,   seismic: 0,   pop: "46,00,000" },
  { id: 2,  name: "Puri",            state: "Odisha",           disaster: "Cyclone",   lat: 19.81, lng: 85.83, score: 82, risk: "severe",   rainfall: 128, wind: 165, river: 0,   seismic: 0,   pop: "2,01,000" },
  { id: 3,  name: "Koshi Basin",     state: "Bihar",            disaster: "Flood",     lat: 26.12, lng: 87.02, score: 88, risk: "severe",   rainfall: 110, wind: 40,  river: 2.8, seismic: 0,   pop: "12,00,000" },
  { id: 4,  name: "Patna Plains",    state: "Bihar",            disaster: "Flood",     lat: 25.59, lng: 85.13, score: 72, risk: "high",     rainfall: 95,  wind: 30,  river: 2.4, seismic: 0,   pop: "20,00,000" },
  { id: 5,  name: "Guwahati",        state: "Assam",            disaster: "Flood",     lat: 26.14, lng: 91.73, score: 75, risk: "high",     rainfall: 105, wind: 35,  river: 2.1, seismic: 0,   pop: "9,57,000" },
  { id: 6,  name: "Darjeeling",      state: "West Bengal",      disaster: "Landslide", lat: 27.04, lng: 88.26, score: 65, risk: "high",     rainfall: 98,  wind: 25,  river: 0,   seismic: 0,   pop: "1,32,000" },
  { id: 7,  name: "Shillong Hills",  state: "Meghalaya",        disaster: "Landslide", lat: 25.57, lng: 91.88, score: 45, risk: "moderate", rainfall: 88,  wind: 20,  river: 0,   seismic: 0,   pop: "1,43,000" },
  { id: 8,  name: "Wayanad",         state: "Kerala",           disaster: "Landslide", lat: 11.68, lng: 76.13, score: 48, risk: "moderate", rainfall: 92,  wind: 22,  river: 0,   seismic: 0,   pop: "8,17,000" },
  { id: 9,  name: "Mandi",           state: "Himachal Pradesh", disaster: "Landslide", lat: 31.70, lng: 76.93, score: 42, risk: "moderate", rainfall: 78,  wind: 18,  river: 0,   seismic: 0,   pop: "9,99,000" },
  { id: 10, name: "Mumbai",          state: "Maharashtra",      disaster: "Flood",     lat: 19.07, lng: 72.87, score: 38, risk: "low",      rainfall: 65,  wind: 45,  river: 0.8, seismic: 0,   pop: "1,84,00,000" },
  { id: 11, name: "Bhuj",            state: "Gujarat",          disaster: "Seismic",   lat: 23.25, lng: 69.66, score: 23, risk: "low",      rainfall: 12,  wind: 15,  river: 0,   seismic: 3.2, pop: "1,48,000" },
  { id: 12, name: "Uttarkashi",      state: "Uttarakhand",      disaster: "Seismic",   lat: 30.72, lng: 78.44, score: 20, risk: "low",      rainfall: 40,  wind: 12,  river: 0,   seismic: 2.8, pop: "3,30,000" }
];

const riskColors = {
  low: "#10b981",
  moderate: "#eab308",
  high: "#f97316",
  severe: "#dc2626"
};

const disasterIcon = {
  Cyclone: "🌀",
  Flood: "🌊",
  Landslide: "🏔️",
  Seismic: "🌍"
};

/* ---------- HELPERS ---------- */
function capitalize(s) {
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function showToast(message, type) {
  type = type || "success";
  var toast = document.getElementById("authToast");
  var toastMessage = document.getElementById("toastMessage");
  var toastIcon = document.getElementById("toastIcon");

  if (!toast || !toastMessage) {
    console.log(message);
    return;
  }

  toastMessage.textContent = message;

  if (type === "error") {
    toast.classList.add("error");
    if (toastIcon) toastIcon.textContent = "❌";
  } else {
    toast.classList.remove("error");
    if (toastIcon) toastIcon.textContent = "✅";
  }

  toast.classList.remove("hidden");
  setTimeout(function () {
    toast.classList.add("hidden");
  }, 3500);
}

/* ---------- AUTH ---------- */
function checkLoginStatus() {
  var authButtons = document.getElementById("authButtons");
  var userProfile = document.getElementById("userProfile");
  var userNameDisplay = document.getElementById("userNameDisplay");
  var userAvatar = document.getElementById("userAvatar");

  if (!authButtons || !userProfile) return;

  var raw = localStorage.getItem("landslideUser");
  if (raw) {
    try {
      var user = JSON.parse(raw);
      authButtons.classList.add("hidden");
      userProfile.classList.remove("hidden");
      if (userNameDisplay) userNameDisplay.textContent = user.name || "User";
      if (userAvatar) userAvatar.textContent = (user.name || "U").charAt(0).toUpperCase();
    } catch (e) {
      localStorage.removeItem("landslideUser");
      authButtons.classList.remove("hidden");
      userProfile.classList.add("hidden");
    }
  } else {
    authButtons.classList.remove("hidden");
    userProfile.classList.add("hidden");
  }
}

function logoutUser() {
  if (confirm("Are you sure you want to log out?")) {
    localStorage.removeItem("landslideUser");
    localStorage.removeItem("landslideToken");
    checkLoginStatus();
    showToast("👋 Logged out successfully", "success");
  }
}

/* ---------- FLOATING SOS ---------- */
function toggleSosMenu(event) {
  if (event) event.stopPropagation();
  var menu = document.getElementById("floatSosMenu");
  if (menu) menu.classList.toggle("show");
}

/* ---------- MOBILE NAV ---------- */
function initMobileNav() {
  var hamburger = document.getElementById("hamburger");
  var navLinks = document.getElementById("navLinks");
  if (!hamburger || !navLinks) return;

  hamburger.addEventListener("click", function () {
    navLinks.classList.toggle("open");
  });
}

/* ---------- HERO MINI MAP (index.html) ---------- */
function initHeroMiniMap() {
  var mapEl = document.getElementById("heroMiniMap");
  if (!mapEl || typeof L === "undefined") return;

  // Avoid double-init
  if (mapEl._leaflet_id) return;

  var heroMap = L.map("heroMiniMap", {
    center: [22.5, 82.0],
    zoom: 4,
    zoomControl: false,
    attributionControl: false,
    scrollWheelZoom: false,
    dragging: true
  });

  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
    maxZoom: 19
  }).addTo(heroMap);

  zones.forEach(function (zone) {
    var isPulse = zone.risk === "severe" || zone.risk === "high";
    var iconHtml = isPulse
      ? '<div class="pulse-marker" style="background:' + zone.colorOrRisk(zone) + '"></div>'
      : '<div style="width:10px;height:10px;border-radius:50%;background:' +
        riskColors[zone.risk] +
        ';border:2px solid rgba(255,255,255,0.6);box-shadow:0 0 6px ' +
        riskColors[zone.risk] +
        ';"></div>';

    // Fix: use riskColors directly
    iconHtml = isPulse
      ? '<div class="pulse-marker" style="background:' + riskColors[zone.risk] + '"></div>'
      : '<div style="width:10px;height:10px;border-radius:50%;background:' +
        riskColors[zone.risk] +
        ';border:2px solid rgba(255,255,255,0.6);box-shadow:0 0 6px ' +
        riskColors[zone.risk] +
        ';"></div>';

    var customIcon = L.divIcon({
      className: "custom-map-marker",
      html: iconHtml,
      iconSize: [14, 14],
      iconAnchor: [7, 7]
    });

    var marker = L.marker([zone.lat, zone.lng], { icon: customIcon }).addTo(heroMap);

    marker.bindPopup(
      '<div style="font-family:Inter,sans-serif;min-width:160px;">' +
        '<div style="font-weight:700;font-size:0.9rem;color:#0f172a;">' +
        (disasterIcon[zone.disaster] || "⚠️") +
        " " +
        zone.name +
        "</div>" +
        '<div style="color:#64748b;font-size:0.75rem;margin-bottom:6px;">' +
        zone.state +
        "</div>" +
        '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">' +
        '<span style="font-size:0.75rem;color:#334155;">' +
        zone.disaster +
        "</span>" +
        '<span style="background:' +
        riskColors[zone.risk] +
        ';color:white;padding:2px 8px;border-radius:4px;font-size:0.7rem;font-weight:600;">' +
        capitalize(zone.risk) +
        "</span>" +
        "</div>" +
        '<div style="margin-top:6px;font-size:0.7rem;color:#64748b;">Score: ' +
        zone.score +
        "/100</div>" +
        "</div>"
    );
  });

  // Invalidate size after layout settles (important for hero)
  setTimeout(function () {
    heroMap.invalidateSize();
  }, 200);
}

/* ---------- LANGUAGE SELECT (basic) ---------- */
function initLangSelect() {
  var sel = document.getElementById("langSelect");
  if (!sel) return;

  sel.addEventListener("change", function () {
    var lang = sel.value;
    var labels = {
      en: "Language set to English",
      hi: "भाषा हिंदी में सेट की गई",
      bn: "ভাষা বাংলায় সেট করা হয়েছে",
      mr: "भाषा मराठीवर सेट केली",
      ta: "மொழி தமிழுக்கு அமைக்கப்பட்டது",
      as: "ভাষা অসমীয়ালৈ সলনি কৰা হ’ল"
    };
    showToast(labels[lang] || "Language updated", "success");
  });
}

/* ---------- GLOBAL CLICK: close SOS menu ---------- */
document.addEventListener("click", function (e) {
  var container = document.getElementById("floatSosContainer");
  var menu = document.getElementById("floatSosMenu");
  if (menu && container && !container.contains(e.target)) {
    menu.classList.remove("show");
  }
});

/* ---------- INIT ON DOM READY ---------- */
document.addEventListener("DOMContentLoaded", function () {
  checkLoginStatus();
  initMobileNav();
  initLangSelect();

  // Hero map only on pages that have #heroMiniMap
  if (document.getElementById("heroMiniMap")) {
    // If Leaflet already loaded via <script>, init now
    if (typeof L !== "undefined") {
      initHeroMiniMap();
    } else {
      // Fallback: wait a bit if script order is slow
      setTimeout(initHeroMiniMap, 400);
    }
  }
});

/* Expose functions used by HTML onclick="" */
window.logoutUser = logoutUser;
window.toggleSosMenu = toggleSosMenu;
window.zones = zones;
window.riskColors = riskColors;