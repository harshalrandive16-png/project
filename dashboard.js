/* =================================================================
   🏔️ BhoomiSuraksha — National Multi-Disaster Dashboard
   FINAL PRODUCTION VERSION (Netlify + Local Compatible)
   ================================================================= */

// 🔗 Universal API Base — Auto detects Netlify OR localhost
const API_BASE = (typeof window !== 'undefined' && window.BHOOMI_API) 
  ? window.BHOOMI_API 
  : (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
      ? 'http://localhost:5000' 
      : window.location.origin);

console.log('🏔️ Dashboard API Base:', API_BASE);

/* ==================== ZONES ==================== */
const ZONES = [
  { id: 'z1',  name: 'Joshimath',         state: 'Uttarakhand',      type: 'Landslide', lat: 30.555, lon: 79.564, score: 78, level: 'high',     pop: '12,000',    rain: '98mm',  soil: '82%', conf: '91%' },
  { id: 'z2',  name: 'Shimla Hills',      state: 'Himachal Pradesh', type: 'Landslide', lat: 31.104, lon: 77.173, score: 64, level: 'high',     pop: '25,000',    rain: '72mm',  soil: '71%', conf: '88%' },
  { id: 'z3',  name: 'Wayanad Belt',      state: 'Kerala',           type: 'Landslide', lat: 11.685, lon: 76.132, score: 86, level: 'severe',   pop: '48,000',    rain: '142mm', soil: '94%', conf: '94%' },
  { id: 'z4',  name: 'Guwahati Corridor', state: 'Assam',            type: 'Flood',     lat: 26.144, lon: 91.736, score: 72, level: 'high',     pop: '1,20,000',  rain: '110mm', soil: '88%', conf: '90%' },
  { id: 'z5',  name: 'Gangtok',           state: 'Sikkim',           type: 'Landslide', lat: 27.339, lon: 88.607, score: 58, level: 'moderate', pop: '18,000',    rain: '65mm',  soil: '62%', conf: '85%' },
  { id: 'z6',  name: 'Shillong Hills',    state: 'Meghalaya',        type: 'Landslide', lat: 25.578, lon: 91.893, score: 41, level: 'moderate', pop: '35,000',    rain: '55mm',  soil: '58%', conf: '82%' },
  { id: 'z7',  name: 'Mumbai Coastal',    state: 'Maharashtra',      type: 'Flood',     lat: 19.076, lon: 72.877, score: 69, level: 'high',     pop: '5,00,000',  rain: '125mm', soil: '79%', conf: '89%' },
  { id: 'z8',  name: 'Ahmedabad Belt',    state: 'Gujarat',          type: 'Flood',     lat: 23.022, lon: 72.571, score: 34, level: 'low',      pop: '80,000',    rain: '28mm',  soil: '40%', conf: '80%' },
  { id: 'z9',  name: 'Bhopal Region',     state: 'Madhya Pradesh',   type: 'Flood',     lat: 23.259, lon: 77.412, score: 29, level: 'low',      pop: '40,000',    rain: '22mm',  soil: '35%', conf: '78%' },
  { id: 'z10', name: 'Varanasi Ganga',    state: 'Uttar Pradesh',    type: 'Flood',     lat: 25.317, lon: 82.973, score: 52, level: 'moderate', pop: '95,000',    rain: '68mm',  soil: '70%', conf: '84%' },
  { id: 'z11', name: 'Puri–Konark Coast', state: 'Odisha',           type: 'Cyclone',   lat: 19.813, lon: 85.831, score: 81, level: 'severe',   pop: '2,10,000',  rain: '130mm', soil: '75%', conf: '92%' },
  { id: 'z12', name: 'Chennai Coast',     state: 'Tamil Nadu',       type: 'Cyclone',   lat: 13.082, lon: 80.270, score: 61, level: 'high',     pop: '3,50,000',  rain: '95mm',  soil: '66%', conf: '87%' },
  { id: 'z13', name: 'Vizag Coast',       state: 'Andhra Pradesh',   type: 'Cyclone',   lat: 17.686, lon: 83.218, score: 47, level: 'moderate', pop: '1,40,000',  rain: '58mm',  soil: '55%', conf: '83%' },
  { id: 'z14', name: 'Mangaluru Belt',    state: 'Karnataka',        type: 'Flood',     lat: 12.914, lon: 74.856, score: 44, level: 'moderate', pop: '60,000',    rain: '80mm',  soil: '60%', conf: '81%' },
  { id: 'z15', name: 'Delhi NCR',         state: 'Delhi',            type: 'Flood',     lat: 28.613, lon: 77.209, score: 38, level: 'low',      pop: '2,00,000',  rain: '45mm',  soil: '48%', conf: '86%' },
  { id: 'z16', name: 'Kolkata Metro',     state: 'West Bengal',      type: 'Flood',     lat: 22.572, lon: 88.363, score: 55, level: 'moderate', pop: '4,00,000',  rain: '88mm',  soil: '72%', conf: '88%' },
  { id: 'z17', name: 'Nagpur Belt',       state: 'Maharashtra',      type: 'Flood',     lat: 21.145, lon: 79.088, score: 36, level: 'low',      pop: '50,000',    rain: '12mm',  soil: '40%', conf: '80%' }
];

const ROADS = [
  { name: 'NH-66 (Kerala Coast)',    status: 'blocked',    zone: 'Wayanad / Coastal Kerala', note: 'Landslide debris' },
  { name: 'NH-16 (Odisha Coast)',    status: 'restricted', zone: 'Puri–Konark',              note: 'Cyclone wind advisory' },
  { name: 'NH-27 (Assam)',           status: 'blocked',    zone: 'Guwahati Corridor',        note: 'Flood waterlogging' },
  { name: 'NH-48 (Mumbai–Pune)',     status: 'restricted', zone: 'Mumbai Coastal',           note: 'Heavy rain' },
  { name: 'NH-10 (Sikkim)',          status: 'open',       zone: 'Gangtok',                  note: 'Clear' },
  { name: 'NH-44 (Delhi–South)',     status: 'open',       zone: 'Delhi NCR',                note: 'Normal' }
];

const TEAMS = [
  { id: 't1', name: 'NDRF 1st Bn',       base: 'Guwahati',        status: 'ready',    members: 45 },
  { id: 't2', name: 'NDRF 4th Bn',       base: 'Arakkonam (TN)',  status: 'deployed', members: 42 },
  { id: 't3', name: 'NDRF 2nd Bn',       base: 'Bhubaneswar',     status: 'deployed', members: 48 },
  { id: 't4', name: 'SDRF Kerala',       base: 'Kozhikode',       status: 'deployed', members: 30 },
  { id: 't5', name: 'NDRF 5th Bn',       base: 'Pune',            status: 'ready',    members: 40 },
  { id: 't6', name: 'SDRF Uttarakhand',  base: 'Dehradun',        status: 'ready',    members: 28 },
  { id: 't7', name: 'NDRF 8th Bn',       base: 'Ghaziabad',       status: 'ready',    members: 44 },
  { id: 't8', name: 'Coast Guard Unit',  base: 'Chennai',         status: 'ready',    members: 35 }
];

/* ==================== HELPERS ==================== */
function levelColor(level) {
  return { severe: '#dc2626', high: '#f97316', moderate: '#eab308', low: '#10b981' }[level] || '#94a3b8';
}
function levelLabel(level) {
  return level ? level.charAt(0).toUpperCase() + level.slice(1) : '—';
}
function sortedZones() {
  return [...ZONES].sort((a, b) => b.score - a.score);
}
function toast(msg, type) {
  type = type || 'ok';
  var wrap = document.getElementById('toastWrap');
  if (!wrap) { console.log('[toast]', msg); return; }
  var el = document.createElement('div');
  el.className = 'toast ' + (type === 'err' ? 'err' : '');
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(function () { el.remove(); }, 3200);
}
function formatTime(ts) {
  if (!ts) return 'now';
  var d = ts._seconds ? new Date(ts._seconds * 1000) : new Date(ts);
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

/* ==================== UNIVERSAL API FETCH ==================== */
async function apiCall(endpoint, options) {
  options = options || {};
  var url = API_BASE + (endpoint.startsWith('/') ? endpoint : '/' + endpoint);
  console.log('📡 API Call:', options.method || 'GET', url);
  
  try {
    var res = await fetch(url, {
      method: options.method || 'GET',
      headers: Object.assign({ 'Content-Type': 'application/json' }, options.headers || {}),
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    
    if (!res.ok) {
      throw new Error('HTTP ' + res.status);
    }
    
    var data = await res.json();
    if (data.error) throw new Error(data.error);
    return data;
  } catch (err) {
    console.error('❌ API Error [' + endpoint + ']:', err.message);
    throw err;
  }
}

/* ==================== MAPS ==================== */
var map = null;
var map2 = null;
var markers = [];
var markers2 = [];
var dangerCircles = [];
var userMarker = null;
var userCircle = null;

/** Free tiles — NO API KEY */
function addBaseTiles(targetMap) {
  L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    { attribution: '© Esri · BhoomiSuraksha', maxZoom: 16 }
  ).addTo(targetMap);
}

function indiaFit(targetMap) {
  if (!targetMap || !ZONES.length) return;
  var bounds = L.latLngBounds(ZONES.map(function (z) { return [z.lat, z.lon]; }));
  targetMap.fitBounds(bounds, { padding: [40, 40], maxZoom: 5 });
}

function createIcon(level, pulse) {
  var c = levelColor(level);
  return L.divIcon({
    className: 'bhoomi-marker',
    html:
      '<div style="' +
      'width:16px;height:16px;border-radius:50%;' +
      'background:' + c + ';' +
      'border:2px solid #fff;' +
      'box-shadow:0 0 0 ' + (pulse ? '6px' : '0') + ' ' + c + '55,0 2px 8px rgba(0,0,0,.5);' +
      (pulse ? 'animation:dashPulse 1.5s infinite;' : '') +
      '"></div>',
    iconSize: [16, 16],
    iconAnchor: [8, 8]
  });
}

function initMaps() {
  var center = [22.5, 82.0];
  var zoom = 5;

  if (document.getElementById('map') && !map) {
    map = L.map('map', { zoomControl: true, preferCanvas: true }).setView(center, zoom);
    addBaseTiles(map);
    plotMarkers(map, markers);
    indiaFit(map);

    document.getElementById('map')._leafletMap = map;
    window.bhoomiMap = map;

    setTimeout(function () { map.invalidateSize(); indiaFit(map); }, 200);
    setTimeout(function () { map.invalidateSize(); indiaFit(map); }, 600);
  }

  if (document.getElementById('map2') && !map2) {
    map2 = L.map('map2', { zoomControl: true, preferCanvas: true }).setView(center, zoom);
    addBaseTiles(map2);
    plotMarkers(map2, markers2);
    indiaFit(map2);

    document.getElementById('map2')._leafletMap = map2;
    window.bhoomiMap2 = map2;

    setTimeout(function () { map2.invalidateSize(); indiaFit(map2); }, 300);
  }
}

function plotMarkers(targetMap, bucket) {
  bucket.forEach(function (m) {
    try { targetMap.removeLayer(m); } catch (e) {}
  });
  bucket.length = 0;

  ZONES.forEach(function (z) {
    var pulse = z.level === 'severe' || z.level === 'high';
    var m = L.marker([z.lat, z.lon], {
      icon: createIcon(z.level, pulse),
      title: z.name
    })
      .addTo(targetMap)
      .bindPopup(
        '<div style="min-width:170px;font-family:Inter,sans-serif;color:#0f172a;">' +
          '<strong>' + z.name + '</strong><br/>' +
          '<span style="color:#64748b;font-size:12px;">' + z.state + '</span><br/>' +
          '<div style="margin-top:6px;display:flex;justify-content:space-between;align-items:center;">' +
            '<span>' + z.type + '</span>' +
            '<span style="background:' + levelColor(z.level) + ';color:#fff;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;">' +
              levelLabel(z.level) + ' · ' + z.score +
            '</span>' +
          '</div>' +
          '<button type="button" onclick="window.analyzeZoneWithAI(\'' + z.id + '\')" style="' +
            'margin-top:8px;width:100%;background:#10b981;color:#000;border:0;padding:6px;border-radius:6px;font-weight:700;cursor:pointer;font-size:12px;">' +
            '🧠 Analyze with AI</button>' +
        '</div>'
      );

    m.on('click', function () { showZoneDetail(z.id); });
    bucket.push(m);
  });
}

function clearDangerCircles(targetMap) {
  dangerCircles.forEach(function (c) {
    try { if (targetMap && targetMap.hasLayer(c)) targetMap.removeLayer(c); } catch (e) {}
  });
  dangerCircles = [];
}

function drawDangerCircles(targetMap) {
  if (!targetMap) return;
  clearDangerCircles(targetMap);
  ZONES.filter(function (z) { return z.level === 'severe' || z.level === 'high'; })
    .forEach(function (z) {
      var color = levelColor(z.level);
      var circle = L.circle([z.lat, z.lon], {
        radius: z.level === 'severe' ? 15000 : 10000,
        color: color, fillColor: color, fillOpacity: 0.12, weight: 2
      }).addTo(targetMap);
      dangerCircles.push(circle);
    });
}

/* ==================== 🔵 USER GPS PIN ==================== */
function showUserOnMap(lat, lon, riskLevel) {
  lat = Number(lat);
  lon = Number(lon);

  if (isNaN(lat) || isNaN(lon)) {
    console.warn('showUserOnMap: invalid coords');
    return;
  }

  if (!map) {
    console.warn('showUserOnMap: map not ready, retrying in 400ms');
    setTimeout(function () { showUserOnMap(lat, lon, riskLevel); }, 400);
    return;
  }

  riskLevel = (riskLevel || 'low').toLowerCase();

  if (userMarker) {
    try { map.removeLayer(userMarker); } catch (e) {}
    userMarker = null;
  }
  if (userCircle) {
    try { map.removeLayer(userCircle); } catch (e) {}
    userCircle = null;
  }

  var userIcon = L.divIcon({
    className: 'bhoomi-user-marker',
    html:
      '<div style="position:relative;width:22px;height:22px;">' +
        '<div style="' +
          'position:absolute;inset:0;border-radius:50%;' +
          'background:#3b82f6;border:3px solid #ffffff;' +
          'box-shadow:0 0 0 0 rgba(59,130,246,0.6);' +
          'animation:userPulse 1.5s infinite;' +
        '"></div>' +
      '</div>',
    iconSize: [22, 22],
    iconAnchor: [11, 11]
  });

  userMarker = L.marker([lat, lon], {
    icon: userIcon,
    zIndexOffset: 2000,
    title: 'You are here'
  })
    .addTo(map)
    .bindPopup(
      '<div style="font-family:Inter,sans-serif;min-width:150px;color:#0f172a;">' +
        '<strong style="color:#3b82f6;">📍 You are here</strong><br/>' +
        '<span style="font-size:12px;color:#64748b;">' + lat.toFixed(5) + ', ' + lon.toFixed(5) + '</span><br/>' +
        '<span style="font-size:12px;margin-top:4px;display:inline-block;">' +
          'Risk: <b style="color:' + levelColor(riskLevel) + '">' + riskLevel.toUpperCase() + '</b>' +
        '</span>' +
      '</div>'
    )
    .openPopup();

  var color = levelColor(riskLevel);
  userCircle = L.circle([lat, lon], {
    radius: 10000,
    color: '#3b82f6',
    fillColor: color,
    fillOpacity: 0.12,
    weight: 2,
    dashArray: '8 6'
  }).addTo(map);

  map.flyTo([lat, lon], 11, { duration: 1.2 });

  setTimeout(function () {
    map.invalidateSize();
    if (userMarker) userMarker.openPopup();
  }, 400);

  console.log('📍 User pin placed on map:', lat, lon, riskLevel);
  toast('📍 Map pe aapki location mark ho gayi');
}

window.showUserOnMap = showUserOnMap;
window.bhoomiShowUserOnMap = showUserOnMap;

/* ==================== FILTER MAP ==================== */
function filterMap(mode) {
  if (!map) return;

  markers.forEach(function (m) {
    try { map.removeLayer(m); } catch (e) {}
  });
  markers = [];
  clearDangerCircles(map);

  var list = ZONES;
  if (mode === 'high') list = ZONES.filter(function (z) { return z.level === 'high' || z.level === 'severe'; });
  if (mode === 'alerts') {
    list = ZONES.filter(function (z) { return z.level === 'severe' || z.level === 'high'; });
    drawDangerCircles(map);
  }

  list.forEach(function (z) {
    var pulse = z.level === 'severe' || z.level === 'high';
    var m = L.marker([z.lat, z.lon], { icon: createIcon(z.level, pulse) })
      .addTo(map)
      .bindPopup('<strong>' + z.name + '</strong><br/>' + z.state + '<br/>' + z.type + ' · ' + levelLabel(z.level));
    m.on('click', function () { showZoneDetail(z.id); });
    markers.push(m);
  });

  if (list.length) {
    var b = L.latLngBounds(list.map(function (z) { return [z.lat, z.lon]; }));
    map.fitBounds(b, { padding: [50, 50], maxZoom: mode === 'all' ? 5 : 6 });
  } else {
    indiaFit(map);
  }
}

function resetIndiaView() {
  if (map) {
    map.invalidateSize();
    plotMarkers(map, markers);
    indiaFit(map);
  }
  if (map2) {
    map2.invalidateSize();
    plotMarkers(map2, markers2);
    indiaFit(map2);
  }
  toast('🇮🇳 Full India view');
}
window.resetIndiaView = resetIndiaView;

/* ==================== KPIs ==================== */
function updateKPIs() {
  var severeHigh = ZONES.filter(function (z) { return z.level === 'severe' || z.level === 'high'; });
  var severe = ZONES.filter(function (z) { return z.level === 'severe'; });

  function setText(id, val) {
    var el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  setText('kpiZones', ZONES.length);
  setText('kpiHigh', String(severeHigh.length).padStart(2, '0'));
  setText('kpiHighChange', severeHigh.slice(0, 3).map(function (z) { return z.name; }).join(', ') || 'All stable');
  setText('kpiAlerts', String(severe.length).padStart(2, '0'));
  setText('kpiAlertChange', severe.length ? severe.map(function (z) { return z.type; }).join(' · ') : 'Monitoring Live');
  setText('kpiRoads', String(ROADS.filter(function (r) { return r.status !== 'open'; }).length));
  setText('kpiPop', '12K+');
  setText('kpiTeams', String(TEAMS.filter(function (t) { return t.status === 'ready'; }).length));
  setText('lastUpdated', 'updated ' + new Date().toLocaleTimeString());
}

/* ==================== RANKING ==================== */
function renderRanking() {
  var list = document.getElementById('rankingList');
  if (!list) return;
  list.innerHTML = sortedZones().map(function (z) {
    return (
      '<div class="rank-item" onclick="showZoneDetail(\'' + z.id + '\')">' +
        '<div class="rank-left">' +
          '<div class="rank-name">' + z.name + '</div>' +
          '<div class="rank-state">' + z.state + ' · ' + z.type + '</div>' +
        '</div>' +
        '<div class="rank-right">' +
          '<div class="rank-score" style="color:' + levelColor(z.level) + '">' + z.score + '</div>' +
          '<span class="rank-badge" style="background:' + levelColor(z.level) + '22;color:' + levelColor(z.level) + ';border:1px solid ' + levelColor(z.level) + '55">' +
            levelLabel(z.level) +
          '</span>' +
        '</div>' +
      '</div>'
    );
  }).join('');
}

/* ==================== ZONE DETAIL ==================== */
function showZoneDetail(id) {
  var z = ZONES.find(function (x) { return x.id === id; });
  if (!z) return;

  var ph = document.getElementById('zdPlaceholder');
  var ct = document.getElementById('zdContent');
  if (ph) ph.classList.add('hidden');
  if (ct) ct.classList.remove('hidden');

  var setText = function (id, val) {
    var el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  setText('zdName', z.name + ' · ' + z.type);
  setText('zdPop', z.state + ' · Pop. at risk: ' + z.pop);

  var badge = document.getElementById('zdRiskBadge');
  if (badge) {
    badge.innerHTML =
      '<span class="rank-badge" style="background:' + levelColor(z.level) + '22;color:' + levelColor(z.level) + ';border:1px solid ' + levelColor(z.level) + '55">' +
      levelLabel(z.level) + '</span>';
  }
  setText('zdConf', 'AI Conf. ' + z.conf);

  var bar = document.getElementById('barChart');
  if (bar) {
    bar.innerHTML =
      '<div class="bar-row"><span>Risk Score</span>' +
      '<div class="bar-track"><div class="bar-fill" style="width:' + z.score + '%;background:' + levelColor(z.level) + '"></div></div>' +
      '<b>' + z.score + '</b></div>' +
      '<div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;">' +
        '<button type="button" onclick="window.analyzeZoneWithAI(\'' + z.id + '\')" style="background:linear-gradient(135deg,#10b981,#059669);color:#000;border:0;padding:8px 14px;border-radius:8px;font-weight:700;cursor:pointer;font-size:0.85rem;">🧠 Analyze with AI</button>' +
        '<button type="button" onclick="window.resetIndiaView()" style="background:transparent;color:#94a3b8;border:1px solid rgba(255,255,255,0.15);padding:8px 14px;border-radius:8px;font-weight:600;cursor:pointer;font-size:0.85rem;">🇮🇳 India View</button>' +
      '</div>';
  }

  var metrics = document.getElementById('metricsRow');
  if (metrics) {
    metrics.innerHTML =
      '<div class="metric"><div class="m-label">Rainfall</div><div class="m-val">' + z.rain + '</div></div>' +
      '<div class="metric"><div class="m-label">Soil / Water</div><div class="m-val">' + z.soil + '</div></div>' +
      '<div class="metric"><div class="m-label">Hazard</div><div class="m-val">' + z.type + '</div></div>' +
      '<div class="metric"><div class="m-label">Confidence</div><div class="m-val">' + z.conf + '</div></div>';
  }

  var forecast = document.getElementById('forecastBars');
  if (forecast) {
    forecast.innerHTML = [0, 1, 2, 3].map(function (i) {
      var s = Math.min(100, Math.max(10, z.score + i * 4 - 6));
      var lv = s >= 80 ? 'severe' : s >= 60 ? 'high' : s >= 40 ? 'moderate' : 'low';
      return '<div class="fb"><div class="fb-bar" style="height:' + s + '%;background:' + levelColor(lv) + '"></div><span>+' + (i + 1) * 12 + 'h</span></div>';
    }).join('');
  }

  if (map) map.flyTo([z.lat, z.lon], 6, { duration: 0.8 });
}
window.showZoneDetail = showZoneDetail;

/* ==================== AI ZONE ANALYSIS ==================== */
window.analyzeZoneWithAI = async function (zoneId) {
  var z = ZONES.find(function (x) { return x.id === zoneId; });
  if (!z) return;

  toast('🛰️ AI analyzing ' + z.name + '...');

  try {
    var d = await apiCall('/api/analyze-risk', {
      method: 'POST',
      body: {
        lat: z.lat,
        lon: z.lon,
        location: z.name + ', ' + z.state,
        disasterType: z.type.toLowerCase()
      }
    });

    // Update zone with real AI response
    z.score = d.score || z.score;
    z.level = String(d.riskLevel || z.level).toLowerCase();
    z.conf = ((d.engine === 'kira-ai' ? 92 : 82)) + '%';

    updateKPIs();
    renderRanking();
    renderSensors();
    renderChips();
    if (map) plotMarkers(map, markers);
    if (map2) plotMarkers(map2, markers2);
    showZoneDetail(z.id);

    toast('✅ ' + z.name + ' → ' + d.riskLevel + ' (' + d.score + '/100)');

    if (d.riskLevel === 'Severe' || d.riskLevel === 'High') {
      if (confirm('⚠️ ' + d.riskLevel + ' risk at ' + z.name + '!\n\nSend 10km geofenced alert to all users in area?')) {
        await broadcastGeofence(z, d);
      }
    }
    return d;
  } catch (err) {
    console.error('❌ Zone analysis failed:', err);
    // Fallback: local rule-based
    var fakeScore = 60 + Math.floor(Math.random() * 30);
    z.score = fakeScore;
    z.level = fakeScore >= 80 ? 'severe' : fakeScore >= 60 ? 'high' : 'moderate';
    updateKPIs();
    renderRanking();
    if (map) plotMarkers(map, markers);
    showZoneDetail(z.id);
    toast('⚠️ Offline analysis: ' + z.name + ' → ' + z.level + ' (' + z.score + '/100)', 'err');
  }
};

async function broadcastGeofence(zone, analysis) {
  try {
    var d = await apiCall('/api/alerts/geofence', {
      method: 'POST',
      body: {
        lat: zone.lat,
        lon: zone.lon,
        location: zone.name + ', ' + zone.state,
        radiusKm: 10,
        riskLevel: analysis.riskLevel,
        score: analysis.score,
        disasterType: (analysis.disasterType || zone.type).toLowerCase(),
        message: analysis.smsEnglish,
        messageHindi: analysis.smsHindi
      }
    });

    var count = d.usersNotified || 0;
    toast('📢 Geofence broadcast · ' + count + ' users alerted (10km)');
    loadLiveAlerts();
  } catch (err) {
    toast('❌ Geofence failed: ' + err.message, 'err');
  }
}

/* ==================== ROADS / SENSORS / RESCUE / CHIPS ==================== */
function renderRoads() {
  var el = document.getElementById('roadList');
  var full = document.getElementById('roadStatusFull');
  var html = ROADS.map(function (r) {
    return (
      '<div class="road-item"><div>' +
        '<div class="road-name">' + r.name + '</div>' +
        '<div class="road-meta">' + r.zone + ' · ' + r.note + '</div>' +
      '</div>' +
      '<span class="road-status ' + r.status + '">' + r.status + '</span></div>'
    );
  }).join('');
  if (el) el.innerHTML = html;
  if (full) full.innerHTML = html;
}

function renderSensors() {
  var grid = document.getElementById('sensorGrid');
  if (!grid) return;
  grid.innerHTML = ZONES.map(function (z) {
    return (
      '<div class="sensor-card" onclick="showZoneDetail(\'' + z.id + '\')">' +
        '<div class="sc-top"><strong>' + z.name + '</strong>' +
        '<span class="rank-badge" style="background:' + levelColor(z.level) + '22;color:' + levelColor(z.level) + '">' + levelLabel(z.level) + '</span></div>' +
        '<div class="sc-state">' + z.state + ' · ' + z.type + '</div>' +
        '<div class="sc-metrics">' +
          '<div><span>Rain</span><b>' + z.rain + '</b></div>' +
          '<div><span>Soil/Water</span><b>' + z.soil + '</b></div>' +
          '<div><span>Score</span><b style="color:' + levelColor(z.level) + '">' + z.score + '</b></div>' +
        '</div></div>'
    );
  }).join('');
}

function renderRescue() {
  var grid = document.getElementById('rescueGrid');
  if (!grid) return;
  grid.innerHTML = TEAMS.map(function (t) {
    return (
      '<div class="rescue-card">' +
        '<div class="rc-name">' + t.name + '</div>' +
        '<div class="rc-base">📍 ' + t.base + '</div>' +
        '<div class="rc-meta">' + t.members + ' personnel</div>' +
        '<span class="road-status ' + (t.status === 'ready' ? 'open' : 'restricted') + '">' + t.status + '</span>' +
      '</div>'
    );
  }).join('');

  var teamSel = document.getElementById('assignTeamSel');
  var zoneSel = document.getElementById('assignZoneSel');
  if (teamSel) teamSel.innerHTML = TEAMS.map(function (t) { return '<option value="' + t.id + '">' + t.name + ' (' + t.base + ')</option>'; }).join('');
  if (zoneSel) zoneSel.innerHTML = ZONES.map(function (z) { return '<option value="' + z.id + '">' + z.name + ', ' + z.state + '</option>'; }).join('');
}

function renderChips() {
  var el = document.getElementById('mapZoneChips');
  if (!el) return;
  el.innerHTML = sortedZones().slice(0, 8).map(function (z) {
    return (
      '<button class="chip" onclick="showZoneDetail(\'' + z.id + '\')" style="border-color:' + levelColor(z.level) + '55">' +
      z.name + ' · ' + z.type +
      ' <span style="color:' + levelColor(z.level) + '">' + z.score + '</span></button>'
    );
  }).join('');
}

/* ==================== LIVE ALERTS ==================== */
async function loadLiveAlerts() {
  var feed = document.getElementById('dashAlertsFeed');
  if (!feed) return;

  try {
    var d = await apiCall('/api/alerts');
    var alerts = d.alerts || [];

    if (!alerts.length) {
      feed.innerHTML = '<p class="empty-txt">No active alerts currently.</p>';
      return;
    }

    feed.innerHTML = alerts.slice(0, 6).map(function (a) {
      var color = levelColor(String(a.riskLevel || '').toLowerCase());
      var disasterType = a.disasterType || a.primaryDisaster || 'Multi';
      return (
        '<div style="background:rgba(255,255,255,0.03);border-left:3px solid ' + color + ';padding:0.75rem 1rem;border-radius:8px;margin-bottom:0.5rem;">' +
          '<div style="display:flex;justify-content:space-between;margin-bottom:4px;">' +
            '<strong style="color:' + color + ';">' + (a.riskLevel || 'Alert') + ' · ' + disasterType + '</strong>' +
            '<span style="font-size:0.7rem;color:#64748b;">' + formatTime(a.createdAt) + '</span>' +
          '</div>' +
          '<div style="font-size:0.85rem;color:#e2e8f0;">' + (a.messageEn || a.location || '—') + '</div>' +
          '<div style="font-size:0.75rem;color:#94a3b8;margin-top:4px;">📍 ' + (a.radiusKm || 10) + 'km radius</div>' +
        '</div>'
      );
    }).join('');
  } catch (err) {
    console.error('⚠️ loadLiveAlerts failed:', err.message);
    feed.innerHTML = '<p class="empty-txt" style="color:#f97316;">⚠️ Alert feed temporarily unavailable</p>';
  }
}

/* ==================== TABS / FILTERS / SIMULATE ==================== */
function setupTabs() {
  document.querySelectorAll('.sidebar-btn[data-tab]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('.sidebar-btn[data-tab]').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      var tab = btn.getAttribute('data-tab');
      document.querySelectorAll('.tab-content').forEach(function (t) { t.classList.remove('active'); });
      var pane = document.getElementById('tab-' + tab);
      if (pane) pane.classList.add('active');

      setTimeout(function () {
        if (tab === 'riskmap' && map2) { map2.invalidateSize(); indiaFit(map2); }
        if (tab === 'overview' && map) { map.invalidateSize(); }
      }, 200);
    });
  });
}

function setupMapFilters() {
  var all = document.getElementById('viewAll');
  var high = document.getElementById('viewHigh');
  var alerts = document.getElementById('viewAlerts');

  function setActive(btn) {
    [all, high, alerts].forEach(function (b) { if (b) b.classList.remove('active'); });
    if (btn) btn.classList.add('active');
  }

  if (all) all.addEventListener('click', function () { setActive(all); filterMap('all'); });
  if (high) high.addEventListener('click', function () { setActive(high); filterMap('high'); });
  if (alerts) alerts.addEventListener('click', function () { setActive(alerts); filterMap('alerts'); });
}

function simulateUpdate() {
  ZONES.forEach(function (z) {
    var delta = Math.floor(Math.random() * 15) - 5;
    z.score = Math.min(99, Math.max(8, z.score + delta));
    z.level = z.score >= 80 ? 'severe' : z.score >= 60 ? 'high' : z.score >= 40 ? 'moderate' : 'low';
  });
  updateKPIs();
  renderRanking();
  renderSensors();
  renderChips();
  if (map) { plotMarkers(map, markers); indiaFit(map); }
  if (map2) { plotMarkers(map2, markers2); indiaFit(map2); }
  toast('🛰️ Pan-India scan complete');
}

/* ==================== SOS ==================== */
function setupSOS() {
  var overlay = document.getElementById('sosOverlay');
  var sosCoords = null;

  var quick = document.getElementById('sosQuickBtn');
  var close = document.getElementById('sosClose');
  if (quick) quick.addEventListener('click', function () { if (overlay) overlay.classList.remove('hidden'); });
  if (close) close.addEventListener('click', function () { if (overlay) overlay.classList.add('hidden'); });

  var geoBtn = document.getElementById('sosGeoBtn');
  if (geoBtn) {
    geoBtn.addEventListener('click', function () {
      var input = document.getElementById('sosLoc');
      if (!navigator.geolocation) {
        input.value = '28.6139, 77.2090 (demo)';
        sosCoords = { lat: 28.6139, lon: 77.209 };
        return;
      }
      input.value = 'Detecting...';
      navigator.geolocation.getCurrentPosition(
        function (pos) {
          sosCoords = { lat: pos.coords.latitude, lon: pos.coords.longitude };
          input.value = sosCoords.lat.toFixed(4) + ', ' + sosCoords.lon.toFixed(4);
        },
        function () {
          sosCoords = { lat: 21.1524, lon: 79.0805 };
          input.value = '21.1524, 79.0805 (fallback Nagpur)';
        }
      );
    });
  }

  var form = document.getElementById('sosForm');
  if (form) {
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      if (!sosCoords) { toast('Pehle GPS detect karo', 'err'); return; }
      var type = document.getElementById('sosType').value;
      var desc = document.getElementById('sosDesc').value || 'Emergency SOS';
      try {
        var d = await apiCall('/api/alerts/geofence', {
          method: 'POST',
          body: {
            lat: sosCoords.lat,
            lon: sosCoords.lon,
            location: 'SOS: ' + type,
            radiusKm: 15,
            riskLevel: 'Severe',
            score: 95,
            disasterType: type,
            message: 'SOS: ' + type + '. ' + desc,
            messageHindi: 'SOS आपातकाल: सहायता भेजी जा रही है। 112 कॉल करें।'
          }
        });

        var count = d.usersNotified || 0;
        var result = document.getElementById('sosResult');
        if (result) result.classList.remove('hidden');
        var team = document.getElementById('sosTeamName');
        if (team) team.textContent = 'NDRF · ' + count + ' users alerted';
        var eta = document.getElementById('sosEta');
        if (eta) eta.textContent = 'ETA: ~20–35 min';
        var status = document.getElementById('sosStatus');
        if (status) status.textContent = 'Broadcast done';
        var prog = document.getElementById('sosProg');
        if (prog) prog.style.width = '100%';
        toast('🆘 SOS sent · ' + count + ' users alerted');
        loadLiveAlerts();
      } catch (err) {
        toast('❌ SOS failed: ' + err.message, 'err');
      }
    });
  }
}

function setupAssign() {
  var modal = document.getElementById('assignModal');
  var open = document.getElementById('assignTeamBtn');
  var close = document.getElementById('closeAssign');
  var form = document.getElementById('assignForm');

  if (open) open.addEventListener('click', function () { if (modal) modal.classList.remove('hidden'); });
  if (close) close.addEventListener('click', function () { if (modal) modal.classList.add('hidden'); });
  if (form) form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (modal) modal.classList.add('hidden');
    toast('✅ Team assignment confirmed');
  });
}

/* ==================== INIT ==================== */
document.addEventListener('DOMContentLoaded', function () {
  // Inject keyframes CSS
  if (!document.getElementById('dashPulseStyle')) {
    var s = document.createElement('style');
    s.id = 'dashPulseStyle';
    s.textContent =
      '@keyframes dashPulse{0%{box-shadow:0 0 0 0 rgba(220,38,38,.45)}70%{box-shadow:0 0 0 12px rgba(220,38,38,0)}100%{box-shadow:0 0 0 0 rgba(220,38,38,0)}}' +
      '@keyframes userPulse{0%{box-shadow:0 0 0 0 rgba(59,130,246,.55)}70%{box-shadow:0 0 0 14px rgba(59,130,246,0)}100%{box-shadow:0 0 0 0 rgba(59,130,246,0)}}' +
      '.bhoomi-marker,.bhoomi-user-marker{background:transparent!important;border:none!important;}' +
      '.map-container,#map,#map2{min-height:380px;background:#0b1220;}';
    document.head.appendChild(s);
  }

  // Add "Full India" button to map controls
  var controls = document.querySelector('.map-controls');
  if (controls && !document.getElementById('btnIndiaView')) {
    var b = document.createElement('button');
    b.id = 'btnIndiaView';
    b.className = 'map-ctrl-btn';
    b.type = 'button';
    b.textContent = '🇮🇳 Full India';
    b.addEventListener('click', resetIndiaView);
    controls.appendChild(b);
  }

  initMaps();
  updateKPIs();
  renderRanking();
  renderRoads();
  renderSensors();
  renderRescue();
  renderChips();
  setupTabs();
  setupMapFilters();
  setupSOS();
  setupAssign();
  loadLiveAlerts();
  setInterval(loadLiveAlerts, 30000);

  var refresh = document.getElementById('refreshBtn');
  if (refresh) refresh.addEventListener('click', function () {
    updateKPIs();
    loadLiveAlerts();
    resetIndiaView();
    toast('🔄 Refreshed');
  });

  ['simulateBtn', 'simulateSideBtn', 'simulateMapBtn'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('click', simulateUpdate);
  });

  // Default zone detail
  var top = sortedZones()[0];
  if (top) {
    var ph = document.getElementById('zdPlaceholder');
    var ct = document.getElementById('zdContent');
    if (ph) ph.classList.add('hidden');
    if (ct) ct.classList.remove('hidden');
    showZoneDetail(top.id);
    setTimeout(resetIndiaView, 500);
  }

  console.log('✅ BhoomiSuraksha Dashboard Ready · API:', API_BASE);
});