/* ============================================================
   dashboard-iot.js  —  Live IoT sensor cards for dashboard.html
   - Section khud inject hoti hai (dashboard.html me markup nahi chahiye)
   - /api/sensors/live ko har 5 sec poll karta hai
   - Data na ho to "No data yet", server down ho to error dikhata hai
     (fake zeros kabhi nahi)
   - Sensors ko dashboard map pe bhi lagata hai (window.bhoomiDashMap)
   ============================================================ */
(function () {
  'use strict';

  var POLL_MS = 5000;
  var STALE_MS = 2 * 60 * 1000; // 2 min se purana reading = STALE

  var BM = window.BhoomiMap;
  if (!BM) { console.warn('[dashboard-iot] bhoomi-map.js load nahi hua'); return; }
  var esc = BM._esc;

  var UNITS = {
    waterLevel: ['Water Level', 'cm'], slopeTilt: ['Slope Tilt', '°'],
    vibration: ['Vibration', 'Hz'], temperature: ['Temperature', '°C'],
    humidity: ['Humidity', '%'], co: ['CO', 'ppm'], smoke: ['Smoke', 'ppm'],
    aqi: ['AQI', ''], pm25: ['PM2.5', 'µg/m³'], pm10: ['PM10', 'µg/m³'],
    rainfall: ['Rainfall', 'mm']
  };

  var CSS = '' +
    '.bs-iot{margin:0 0 24px}' +
    '.bs-iot-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;gap:12px;flex-wrap:wrap}' +
    '.bs-iot-head h2{font-size:18px;font-weight:800;margin:0;display:flex;align-items:center;gap:8px;color:#e2e8f0}' +
    '.bs-iot-meta{font-size:12px;color:#64748b}' +
    '.bs-iot-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:14px}' +
    '.bs-card{background:rgba(15,23,42,.7);border:1px solid rgba(16,185,129,.2);border-radius:16px;padding:16px;position:relative;overflow:hidden;transition:border-color .3s,box-shadow .3s}' +
    '.bs-card::before{content:"";position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,#10b981,transparent)}' +
    '.bs-card.high{border-color:rgba(245,158,11,.5);box-shadow:0 0 24px rgba(245,158,11,.15)}' +
    '.bs-card.high::before{background:linear-gradient(90deg,#f59e0b,transparent)}' +
    '.bs-card.severe{border-color:rgba(239,68,68,.7);box-shadow:0 0 30px rgba(239,68,68,.3);animation:bsPulse 1.5s infinite}' +
    '.bs-card.severe::before{background:linear-gradient(90deg,#ef4444,transparent)}' +
    '.bs-card.stale{opacity:.6}' +
    '@keyframes bsPulse{0%,100%{box-shadow:0 0 18px rgba(239,68,68,.25)}50%{box-shadow:0 0 38px rgba(239,68,68,.55)}}' +
    '.bs-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}' +
    '.bs-id{display:flex;align-items:center;gap:10px}' +
    '.bs-emoji{font-size:28px}' +
    '.bs-title{font-weight:800;font-size:14px;color:#e2e8f0}' +
    '.bs-sub{font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:.5px}' +
    '.bs-badge{font-size:11px;font-weight:800;padding:3px 10px;border-radius:999px;background:rgba(16,185,129,.15);color:#10b981}' +
    '.bs-card.high .bs-badge{background:rgba(245,158,11,.15);color:#f59e0b}' +
    '.bs-card.severe .bs-badge{background:rgba(239,68,68,.15);color:#ef4444}' +
    '.bs-metrics{display:grid;grid-template-columns:1fr 1fr;gap:8px}' +
    '.bs-metric{background:rgba(5,8,16,.6);border:1px solid rgba(255,255,255,.05);border-radius:10px;padding:8px 10px}' +
    '.bs-ml{font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:.4px}' +
    '.bs-mv{font-size:18px;font-weight:800;color:#e2e8f0}' +
    '.bs-mv small{font-size:11px;color:#64748b;font-weight:600;margin-left:3px}' +
    '.bs-pred{margin-top:10px;padding:8px 10px;border-radius:10px;background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.25);font-size:12px;color:#fbbf24}' +
    '.bs-foot{display:flex;justify-content:space-between;margin-top:10px;padding-top:10px;border-top:1px solid rgba(255,255,255,.05);font-size:11px;color:#64748b}' +
    '.bs-empty{grid-column:1/-1;padding:18px;border-radius:12px;background:rgba(15,23,42,.5);border:1px dashed rgba(255,255,255,.12);color:#94a3b8;font-size:13px;text-align:center}';

  function injectSection() {
    if (document.getElementById('bsIotSection')) return document.getElementById('bsIotGrid');
    var style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    var sec = document.createElement('section');
    sec.className = 'bs-iot';
    sec.id = 'bsIotSection';
    sec.innerHTML =
      '<div class="bs-iot-head">' +
        '<h2><span class="live-dot"></span> Live IoT Sensor Network</h2>' +
        '<span class="bs-iot-meta" id="bsIotMeta">Connecting…</span>' +
      '</div>' +
      '<div class="bs-iot-grid" id="bsIotGrid"><div class="bs-empty">Sensor data load ho raha hai…</div></div>';

    var anchor = document.querySelector('.overview-grid');
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(sec, anchor);
    else (document.querySelector('.dash-main') || document.body).appendChild(sec);
    return document.getElementById('bsIotGrid');
  }

  function fmtAgo(ts) {
    var t = new Date(ts).getTime();
    if (!isFinite(t)) return 'Unknown';
    var s = Math.max(0, Math.round((Date.now() - t) / 1000));
    if (s < 60) return s + 's ago';
    if (s < 3600) return Math.round(s / 60) + 'm ago';
    return Math.round(s / 3600) + 'h ago';
  }

  function predictionText(p) {
    if (!p) return '';
    if (typeof p === 'string') return p;
    if (p.message) return p.message;
    if (p.summary) return p.summary;
    var parts = [];
    var rate = Number(p.ratePerMin != null ? p.ratePerMin : p.rate);
    var eta = Number(p.etaMinutes != null ? p.etaMinutes : p.eta);
    if (isFinite(rate) && rate !== 0) parts.push(rate.toFixed(1) + '/min');
    if (isFinite(eta) && eta > 0) parts.push('~' + Math.round(eta) + ' min me threshold');
    return parts.join(' · ');
  }

  function cardHTML(n) {
    var meta = BM.NODE_META[n.id] || { emoji: '📡', title: n.id, sub: 'IoT Node' };
    var level = String(n.risk || n.level || 'LOW').toUpperCase();
    var cls = level === 'SEVERE' || level === 'CRITICAL' ? 'severe' : (level === 'HIGH' ? 'high' : '');
    var hasData = !!n.timestamp;
    var stale = hasData && (Date.now() - new Date(n.timestamp).getTime() > STALE_MS);

    var metrics = '';
    var d = n.data || {};
    Object.keys(d).forEach(function (k) {
      var v = d[k];
      if (v !== null && typeof v === 'object') return;
      var u = UNITS[k] || [k.replace(/([A-Z])/g, ' $1'), ''];
      var shown = hasData ? esc(typeof v === 'number' ? Math.round(v * 10) / 10 : v) : '--';
      metrics += '<div class="bs-metric"><div class="bs-ml">' + esc(u[0]) + '</div>' +
                 '<div class="bs-mv">' + shown + (u[1] && hasData && typeof v === 'number' ? '<small>' + esc(u[1]) + '</small>' : '') + '</div></div>';
    });
    if (!metrics) metrics = '<div class="bs-metric" style="grid-column:1/-1"><div class="bs-ml">Status</div><div class="bs-mv">No readings</div></div>';

    var pred = hasData ? predictionText(n.prediction) : '';
    return '<div class="bs-card ' + cls + (stale ? ' stale' : '') + '" id="bs-card-' + esc(n.id) + '">' +
      '<div class="bs-top"><div class="bs-id"><div class="bs-emoji">' + meta.emoji + '</div>' +
        '<div><div class="bs-title">' + esc(meta.title) + '</div><div class="bs-sub">' + esc(meta.sub) + '</div></div></div>' +
        '<div class="bs-badge">' + (hasData ? esc(level) : 'NO DATA') + '</div></div>' +
      '<div class="bs-metrics">' + metrics + '</div>' +
      (pred ? '<div class="bs-pred">⏱️ ' + esc(pred) + '</div>' : '') +
      '<div class="bs-foot"><span>' + esc(n.id) + '</span><span>' +
        (hasData ? (stale ? 'STALE · ' : '') + esc(fmtAgo(n.timestamp)) : 'Never') + '</span></div>' +
    '</div>';
  }

  var grid, meta;
  var mapOverlay = null;

  function render(nodes) {
    if (!nodes.length) {
      grid.innerHTML = '<div class="bs-empty">Koi sensor node register nahi hai.</div>';
    } else {
      grid.innerHTML = nodes.map(cardHTML).join('');
    }
    var live = nodes.filter(function (n) { return n.timestamp; }).length;
    meta.textContent = live + '/' + nodes.length + ' nodes reporting · updated ' + new Date().toLocaleTimeString();
  }

  function renderError() {
    meta.textContent = 'Server unreachable';
    // purane cards rehne do; sirf pehli baar empty hai to message dikhao
    if (!grid.querySelector('.bs-card')) {
      grid.innerHTML = '<div class="bs-empty">Sensor server se connect nahi ho paaya. Retry ho raha hai…</div>';
    }
  }

  function poll() {
    BM.fetchSensors().then(render).catch(renderError);
  }

  function attachMapOverlay() {
    if (mapOverlay || !window.bhoomiDashMap) return;
    mapOverlay = BM.attachLive(window.bhoomiDashMap, { sensorsOnly: true, refreshMs: POLL_MS * 3 });
  }

  function start() {
    grid = injectSection();
    meta = document.getElementById('bsIotMeta');
    poll();
    setInterval(poll, POLL_MS);

    // dashboard.js map baad me bana sakta hai -> thoda wait karke try karo
    var tries = 0;
    var iv = setInterval(function () {
      attachMapOverlay();
      if (mapOverlay || ++tries > 20) clearInterval(iv);
    }, 500);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
