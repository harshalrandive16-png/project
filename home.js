// ═══════════════════════════════════════════════════════
// 🏔️ BhoomiSuraksha — home.js (OpenStreetMap Edition)
// ═══════════════════════════════════════════════════════

(function () {
  'use strict';

  const API = (window.BHOOMI_API) ||
    (location.hostname === 'localhost' || location.hostname === '127.0.0.1'
      ? 'http://localhost:5000'
      : location.origin);

  console.log('🏔️ BhoomiSuraksha Home | API:', API);

  let userLocation = null;
  let heroMap = null;
  let userMapMarker = null;
  let userMapCircle = null;
  let hazardLayer = null;

  // ═══════════════════════════════════════════════════════
  // Pan-India Disaster Zones
  // ═══════════════════════════════════════════════════════
  const DISASTER_ZONES = [
    { name: 'Chennai Coast', state: 'Tamil Nadu', disaster: 'Cyclone', risk: 'Severe', color: '#dc2626', lat: 13.08, lng: 80.27, score: 85 },
    { name: 'Puri', state: 'Odisha', disaster: 'Cyclone', risk: 'Severe', color: '#dc2626', lat: 19.81, lng: 85.83, score: 82 },
    { name: 'Koshi Basin', state: 'Bihar', disaster: 'Flood', risk: 'Severe', color: '#dc2626', lat: 26.12, lng: 87.02, score: 88 },
    { name: 'Patna Plains', state: 'Bihar', disaster: 'Flood', risk: 'High', color: '#f97316', lat: 25.59, lng: 85.13, score: 68 },
    { name: 'Guwahati', state: 'Assam', disaster: 'Flood', risk: 'High', color: '#f97316', lat: 26.14, lng: 91.73, score: 75 },
    { name: 'Darjeeling', state: 'West Bengal', disaster: 'Landslide', risk: 'High', color: '#f97316', lat: 27.04, lng: 88.26, score: 65 },
    { name: 'Shillong Hills', state: 'Meghalaya', disaster: 'Landslide', risk: 'Moderate', color: '#eab308', lat: 25.57, lng: 91.88, score: 55 },
    { name: 'Wayanad', state: 'Kerala', disaster: 'Landslide', risk: 'Moderate', color: '#eab308', lat: 11.68, lng: 76.13, score: 48 },
    { name: 'Mandi', state: 'Himachal Pradesh', disaster: 'Landslide', risk: 'Moderate', color: '#eab308', lat: 31.70, lng: 76.93, score: 42 },
    { name: 'Mumbai', state: 'Maharashtra', disaster: 'Flood', risk: 'Low', color: '#10b981', lat: 19.07, lng: 72.87, score: 38 },
    { name: 'Bhuj', state: 'Gujarat', disaster: 'Seismic', risk: 'Low', color: '#10b981', lat: 23.25, lng: 69.66, score: 23 },
    { name: 'Uttarkashi', state: 'Uttarakhand', disaster: 'Seismic', risk: 'Low', color: '#10b981', lat: 30.72, lng: 78.44, score: 27 },
    { name: 'Nagpur', state: 'Maharashtra', disaster: 'Monitoring', risk: 'Low', color: '#10b981', lat: 21.1458, lng: 79.0882, score: 32 }
  ];

  window.DISASTER_ZONES = DISASTER_ZONES;

  function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const toRad = d => d * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  // ═══════════════════════════════════════════════════════
  // 🗺️ Hero Map — OpenStreetMap (NO API KEY)
  // ═══════════════════════════════════════════════════════
  function initHeroMap() {
    const mapEl = document.getElementById('heroMiniMap');
    if (!mapEl || typeof L === 'undefined') {
      console.warn('⚠️ heroMiniMap div ya Leaflet missing hai');
      return;
    }

    if (heroMap) {
      heroMap.remove();
      heroMap = null;
    }

    heroMap = L.map('heroMiniMap', {
      center: [22.5, 82.0],
      zoom: 5,
      zoomControl: true,
      attributionControl: true,
      scrollWheelZoom: false,
      dragging: true
    });

    // ✅ OPENSTREETMAP — 100% Free + Open Source
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(heroMap);

    // Disaster zone markers
    DISASTER_ZONES.forEach(zone => {
      const isPulse = zone.risk === 'Severe' || zone.risk === 'High';

      const iconHtml = isPulse
        ? `<div style="width:14px;height:14px;border-radius:50%;background:${zone.color};border:2px solid #fff;box-shadow:0 0 12px ${zone.color};"></div>`
        : `<div style="width:10px;height:10px;border-radius:50%;background:${zone.color};border:2px solid rgba(255,255,255,0.8);box-shadow:0 0 6px ${zone.color};"></div>`;

      const customIcon = L.divIcon({
        className: 'custom-map-marker',
        html: iconHtml,
        iconSize: [14, 14],
        iconAnchor: [7, 7]
      });

      const marker = L.marker([zone.lat, zone.lng], { icon: customIcon }).addTo(heroMap);

      marker.bindPopup(`
        <div style="font-family:Inter,sans-serif;min-width:160px;">
          <div style="font-weight:700;font-size:0.95rem;color:#0f172a;">${zone.name}</div>
          <div style="color:#64748b;font-size:0.75rem;margin-bottom:6px;">${zone.state}</div>
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span style="font-size:0.75rem;color:#334155;">${zone.disaster}</span>
            <span style="background:${zone.color};color:white;padding:2px 8px;border-radius:4px;font-size:0.7rem;font-weight:600;">${zone.risk} · ${zone.score}</span>
          </div>
        </div>
      `);
    });

    // Map size fix (blank tile bug prevent)
    const refresh = () => { if (heroMap) heroMap.invalidateSize(true); };
    setTimeout(refresh, 100);
    setTimeout(refresh, 400);
    setTimeout(refresh, 900);
    window.addEventListener('resize', refresh);
  }

  // ═══════════════════════════════════════════════════════
  // Location + Risk helpers
  // ═══════════════════════════════════════════════════════
  const RADIUS_KM = 15;
  const LOC_KEY = 'bhoomiLastLocation';
  const LOC_MAX_AGE_MS = 24 * 60 * 60 * 1000;

  const $ = (id) => document.getElementById(id);

  function saveLocation(lat, lon, accuracy, source, label) {
    const payload = {
      lat, lon,
      accuracy: accuracy || null,
      source,
      label: label || null,
      updatedAt: new Date().toISOString()
    };
    try { localStorage.setItem(LOC_KEY, JSON.stringify(payload)); } catch (e) {}
    window.__BHOOMI_LAT = lat;
    window.__BHOOMI_LON = lon;
    return payload;
  }

  function getSavedLocation() {
    try {
      const p = JSON.parse(localStorage.getItem(LOC_KEY) || 'null');
      if (!p || !Number.isFinite(p.lat) || !Number.isFinite(p.lon)) return null;
      const age = Date.now() - Date.parse(p.updatedAt);
      if (!Number.isFinite(age) || age > LOC_MAX_AGE_MS) return null;
      return { ...p, ageMs: age };
    } catch (e) { return null; }
  }

  function setStatus(name, coords) {
    if ($('locName') && name != null) $('locName').textContent = name;
    if ($('locCoords') && coords != null) $('locCoords').textContent = coords;
  }

  function showUserOnHeroMap(lat, lon, radiusKm) {
    if (!heroMap) return;
    radiusKm = radiusKm || RADIUS_KM;

    if (userMapMarker) heroMap.removeLayer(userMapMarker);
    if (userMapCircle) heroMap.removeLayer(userMapCircle);
    if (hazardLayer) { heroMap.removeLayer(hazardLayer); hazardLayer = null; }

    const userIcon = L.divIcon({
      className: 'user-location-marker',
      html: `<div style="width:16px;height:16px;border-radius:50%;background:#3b82f6;border:3px solid #fff;box-shadow:0 0 12px #3b82f6;"></div>`,
      iconSize: [16, 16],
      iconAnchor: [8, 8]
    });

    userMapMarker = L.marker([lat, lon], { icon: userIcon }).addTo(heroMap);
    userMapMarker.bindPopup(`
      <div style="font-family:Inter,sans-serif;">
        <strong style="color:#3b82f6;">📍 You are here</strong><br/>
        <span style="font-size:0.75rem;color:#64748b;">${lat.toFixed(4)}, ${lon.toFixed(4)}</span>
      </div>
    `);

    userMapCircle = L.circle([lat, lon], {
      radius: radiusKm * 1000,
      color: '#3b82f6',
      fillColor: '#3b82f6',
      fillOpacity: 0.12,
      weight: 2,
      dashArray: '8 6'
    }).addTo(heroMap);

    heroMap.flyToBounds(userMapCircle.getBounds(), { padding: [30, 30], duration: 1.2, maxZoom: 11 });
  }

  function checkNearestDangerZone(userLat, userLon) {
    let nearest = null;
    let minDistance = Infinity;
    DISASTER_ZONES.forEach(zone => {
      const dist = haversineDistance(userLat, userLon, zone.lat, zone.lng);
      if (dist < minDistance) {
        minDistance = dist;
        nearest = { ...zone, distance: dist };
      }
    });
    return nearest;
  }

  function renderOffline(lat, lon) {
    const nearest = checkNearestDangerZone(lat, lon);
    const extra = nearest
      ? ` Nearest monitored zone: ${nearest.name} (${Math.round(nearest.distance)} km).`
      : '';
    setStatus(
      `Live risk analysis unavailable right now.${extra}`,
      `${lat.toFixed(5)}°N, ${lon.toFixed(5)}°E`
    );
  }

  async function analyzeAt(lat, lon, meta) {
    meta = meta || {};
    userLocation = { lat, lon };

    const coordsTxt = `${lat.toFixed(5)}°N, ${lon.toFixed(5)}°E`;
    setStatus(`Checking hazards within ${RADIUS_KM} km...`, coordsTxt);
    showUserOnHeroMap(lat, lon, RADIUS_KM);

    try {
      const res = await fetch(`${API}/api/nearby-risk?lat=${lat}&lon=${lon}&radius=${RADIUS_KM}`);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      if (!data || !data.ok) throw new Error((data && data.error) || 'bad response');

      const level = (data.overall && data.overall.level) || 'LOW';
      const score = (data.overall && data.overall.score) || 0;
      const msg = (data.message && data.message.en) || `Risk Level: ${level} (${score}/100)`;
      setStatus(msg.length > 90 ? msg.substring(0, 90) + '...' : msg, coordsTxt);
    } catch (err) {
      console.warn('⚠️ nearby-risk failed:', err.message);
      renderOffline(lat, lon);
    }
  }

  function useFallbackLocation(reason) {
    const saved = getSavedLocation();
    if (saved) {
      analyzeAt(saved.lat, saved.lon, { source: 'saved', label: saved.label });
      return;
    }
    setStatus('⚠️ Location access denied / unavailable', 'Browser me location Allow karo ya Recheck dabao');
  }

  window.fetchUserLocationAndAnalyze = function () {
    setStatus('📡 Detecting your GPS location...', 'Please allow location access');

    if (!navigator.geolocation) {
      useFallbackLocation('unsupported');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lon, accuracy } = pos.coords;
        saveLocation(lat, lon, accuracy, 'gps');
        analyzeAt(lat, lon, { source: 'gps', accuracy });
      },
      (err) => {
        console.warn('⚠️ Geolocation error:', err && err.message);
        useFallbackLocation(err && err.code === 1 ? 'denied' : 'unavailable');
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 30000 }
    );
  };

  // Danger banner helpers (HTML onclick ke liye)
  window.closeDangerBanner = function () {
    const banner = document.getElementById('dangerBanner');
    if (banner) banner.style.display = 'none';
  };

  window.closeAlertPopup = function () {
    const overlay = document.getElementById('alertPopupOverlay');
    if (overlay) overlay.classList.remove('show');
  };

  window.toggleSosMenu = function (e) {
    if (e) e.stopPropagation();
    const menu = document.getElementById('floatSosMenu');
    if (menu) menu.classList.toggle('open');
  };

  window.logoutUser = function () {
    localStorage.removeItem('bhoomiUser');
    localStorage.removeItem('bhoomiToken');
    location.reload();
  };

  function boot() {
    initHeroMap();
    // Auto GPS after short delay
    setTimeout(() => {
      if (typeof window.fetchUserLocationAndAnalyze === 'function') {
        window.fetchUserLocationAndAnalyze();
      }
    }, 1200);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();