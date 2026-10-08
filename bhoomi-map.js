/* ============================================================
   bhoomi-map.js  —  Shared map module (Step 3)
   Sab maps pe same dark theme, hazard markers, sensor nodes,
   aur radius circle. Leaflet ke baad load karo.

   Use:
     BhoomiMap.tileLayer('dark', {...}).addTo(map)   // drop-in tile layer
     BhoomiMap.attachLive(map, { lat, lon, radiusKm: 15 })
     BhoomiMap.fetchSensors()  -> Promise<array of node objects>
   ============================================================ */
(function (global) {
  'use strict';

  var API_BASE =
    global.BHOOMI_API ||
    (['localhost', '127.0.0.1', '0.0.0.0'].indexOf(global.location.hostname) !== -1
      ? 'http://localhost:5000'
      : global.location.origin);

  var TILE_URL = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
  var TILE_ATTR = '&copy; OpenStreetMap contributors &copy; CARTO';

  var LEVEL_COLORS = {
    SEVERE: '#ef4444', CRITICAL: '#ef4444',
    HIGH: '#f59e0b', MODERATE: '#eab308', MEDIUM: '#eab308',
    LOW: '#10b981', SAFE: '#10b981'
  };

  var HAZARD_ICONS = {
    flood: '🌊', earthquake: '🌍', cyclone: '🌀', landslide: '⛰️',
    fire: '🔥', wildfire: '🔥', heatwave: '☀️', drought: '🏜️',
    storm: '⛈️', rain: '🌧️', air: '🌫️', tsunami: '🌊'
  };

  var NODE_META = {
    jalNode:   { emoji: '🌊', title: 'Jal-Shuraksha',   sub: 'Flood Sensor' },
    bhumiNode: { emoji: '⛰️', title: 'Bhumi-Shuraksha', sub: 'Landslide Sensor' },
    vanNode:   { emoji: '🔥', title: 'Van-Shuraksha',   sub: 'Fire Sensor' },
    vayuNode:  { emoji: '🌫️', title: 'Vayu-Shuraksha',  sub: 'Air Quality Sensor' }
  };

  /* ---------- helpers ---------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function num(v) {
    var n = Number(v);
    return isFinite(n) ? n : null;
  }

  function levelOf(o) {
    var l = String((o && (o.level || o.risk || o.severity)) || 'LOW').toUpperCase();
    return LEVEL_COLORS[l] ? l : 'LOW';
  }

  function colorOf(level) {
    return LEVEL_COLORS[level] || LEVEL_COLORS.LOW;
  }

  function coords(o) {
    if (!o) return null;
    var src = o.location || o.coords || o;
    var lat = num(src.lat != null ? src.lat : src.latitude);
    var lon = num(src.lon != null ? src.lon : (src.lng != null ? src.lng : src.longitude));
    if (lat == null || lon == null) return null;
    return [lat, lon];
  }

  /* ---------- tile layer (drop-in for L.tileLayer(osmUrl, opts)) ---------- */
  function tileLayer(_style, opts) {
    opts = opts || {};
    return L.tileLayer(TILE_URL, {
      attribution: TILE_ATTR,
      maxZoom: opts.maxZoom || 19,
      subdomains: 'abcd'
      // className jaan-boojh ke ignore: CSS invert filter ki ab zaroorat nahi
    });
  }

  function create(elId, opts) {
    opts = opts || {};
    var map = L.map(elId, {
      center: opts.center || [22.5, 79],
      zoom: opts.zoom || 5,
      zoomControl: opts.zoomControl !== false
    });
    tileLayer('dark').addTo(map);
    [100, 400, 900].forEach(function (d) {
      setTimeout(function () { map.invalidateSize(true); }, d);
    });
    return map;
  }

  /* ---------- normalizers (server shape thoda alag ho sakta hai) ---------- */
  function normSensors(raw) {
    var root = raw && raw.data ? raw.data : raw;
    var s = root && root.sensors ? root.sensors : root;
    var out = [];
    if (Array.isArray(s)) {
      s.forEach(function (n, i) {
        if (n && typeof n === 'object') out.push(Object.assign({ id: n.id || n.nodeId || ('node' + i) }, n));
      });
    } else if (s && typeof s === 'object') {
      Object.keys(s).forEach(function (k) {
        var n = s[k];
        if (n && typeof n === 'object' && !Array.isArray(n) && (n.data || n.risk || n.location)) {
          out.push(Object.assign({ id: k }, n));
        }
      });
    }
    return out;
  }

  function normHazards(raw) {
    var root = raw && raw.data ? raw.data : raw;
    var h = (root && (root.hazards || root.disasters)) || [];
    return Array.isArray(h) ? h : [];
  }

  /* ---------- fetchers ---------- */
  function getJSON(path, timeoutMs) {
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var t = ctrl ? setTimeout(function () { ctrl.abort(); }, timeoutMs || 8000) : null;
    return fetch(API_BASE + path, ctrl ? { signal: ctrl.signal } : {})
      .then(function (r) {
        if (t) clearTimeout(t);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      });
  }

  function fetchSensors() {
    return getJSON('/api/sensors/live').then(normSensors);
  }

  function fetchNearby(lat, lon, radiusKm) {
    return getJSON('/api/nearby-risk?lat=' + lat + '&lon=' + lon + '&radius=' + radiusKm, 12000);
  }

  /* ---------- markers ---------- */
  function sensorIcon(node, level) {
    var meta = NODE_META[node.id] || { emoji: '📡' };
    var c = colorOf(level);
    var pulse = (level === 'SEVERE' || level === 'HIGH') ? 'box-shadow:0 0 0 6px ' + c + '33;' : '';
    return L.divIcon({
      className: 'bm-sensor-icon',
      html: '<div style="width:30px;height:30px;border-radius:50%;background:#0b1220;border:2px solid ' + c +
            ';display:flex;align-items:center;justify-content:center;font-size:15px;' + pulse + '">' + meta.emoji + '</div>',
      iconSize: [30, 30],
      iconAnchor: [15, 15]
    });
  }

  function drawSensors(layer, nodes) {
    nodes.forEach(function (n) {
      var c = coords(n);
      if (!c) return; // location nahi to marker nahi (fake coords nahi banate)
      var level = levelOf(n);
      var meta = NODE_META[n.id] || { title: n.id, sub: 'IoT Node' };
      var rows = '';
      var d = n.data || {};
      Object.keys(d).forEach(function (k) {
        if (typeof d[k] === 'object') return;
        rows += '<div style="font-size:12px;color:#cbd5e1">' + esc(k) + ': <b>' + esc(d[k]) + '</b></div>';
      });
      L.marker(c, { icon: sensorIcon(n, level) })
        .bindPopup('<b>' + esc(meta.title) + '</b><br><span style="font-size:11px;color:#94a3b8">' +
          esc(meta.sub) + ' · ' + esc(level) + '</span>' + rows)
        .addTo(layer);
    });
  }

  function hazardIcon(h, level) {
    var type = String(h.type || h.hazard || h.category || '').toLowerCase();
    var emoji = '⚠️';
    Object.keys(HAZARD_ICONS).forEach(function (k) { if (type.indexOf(k) !== -1) emoji = HAZARD_ICONS[k]; });
    var c = colorOf(level);
    return L.divIcon({
      className: 'bm-hazard-icon',
      html: '<div style="width:28px;height:28px;border-radius:8px;background:' + c + '22;border:2px solid ' + c +
            ';display:flex;align-items:center;justify-content:center;font-size:14px">' + emoji + '</div>',
      iconSize: [28, 28],
      iconAnchor: [14, 14]
    });
  }

  function drawHazards(layer, hazards) {
    hazards.forEach(function (h) {
      var c = coords(h);
      if (!c) return;
      var level = levelOf(h);
      var title = h.title || h.name || h.place || h.message || h.type || 'Hazard';
      var dist = num(h.distanceKm != null ? h.distanceKm : h.distance_km);
      var regional = h.regional ? ' · regional' : '';
      L.marker(c, { icon: hazardIcon(h, level) })
        .bindPopup('<b>' + esc(title) + '</b><br><span style="font-size:11px;color:#94a3b8">' +
          esc(level) + regional + (dist != null ? ' · ' + dist.toFixed(1) + ' km door' : '') + '</span>')
        .addTo(layer);
    });
  }

  /* ---------- attachLive: radius + hazards + sensors, auto-refresh ---------- */
  function attachLive(map, opts) {
    opts = opts || {};
    var lat = num(opts.lat), lon = num(opts.lon);
    var radiusKm = num(opts.radiusKm) || 15;
    var withNearby = lat != null && lon != null && !opts.sensorsOnly;
    var every = opts.refreshMs || 15000;

    var group = L.layerGroup().addTo(map);
    var circle = null;
    if (withNearby) {
      circle = L.circle([lat, lon], {
        radius: radiusKm * 1000, color: '#10b981', weight: 1.5,
        fillColor: '#10b981', fillOpacity: 0.06, dashArray: '6 6'
      }).addTo(map);
      L.circleMarker([lat, lon], {
        radius: 6, color: '#fff', weight: 2, fillColor: '#3b82f6', fillOpacity: 1
      }).bindTooltip('Aap yahan hain').addTo(map);
    }

    var stopped = false;
    function tick() {
      if (stopped) return;
      var pSensors = fetchSensors().catch(function () { return null; });
      var pNearby = withNearby ? fetchNearby(lat, lon, radiusKm).catch(function () { return null; }) : Promise.resolve(null);
      Promise.all([pSensors, pNearby]).then(function (res) {
        if (stopped) return;
        var sensors = res[0], nearby = res[1];
        // dono fail -> purane markers rehne do (blank map se behtar)
        if (sensors === null && nearby === null) return;
        group.clearLayers();
        if (nearby) drawHazards(group, normHazards(nearby));
        if (sensors) drawSensors(group, sensors);
        else if (nearby) {
          var ns = normSensors(nearby);
          if (ns.length) drawSensors(group, ns);
        }
      });
    }
    tick();
    var timer = setInterval(tick, every);

    return {
      layer: group,
      circle: circle,
      refresh: tick,
      stop: function () { stopped = true; clearInterval(timer); }
    };
  }

  global.BhoomiMap = {
    API_BASE: API_BASE,
    NODE_META: NODE_META,
    tileLayer: tileLayer,
    create: create,
    attachLive: attachLive,
    fetchSensors: fetchSensors,
    fetchNearby: fetchNearby,
    drawSensors: drawSensors,
    drawHazards: drawHazards,
    _normSensors: normSensors,
    _normHazards: normHazards,
    _esc: esc
  };
})(window);
