/* BhoomiSuraksha — location share + geofence banner */
(function () {
  var API = 'http://localhost:5000';

  function getToken() {
    return localStorage.getItem('bhoomiToken') || localStorage.getItem('landslideToken') || '';
  }

  function ensureUI() {
    if (!document.getElementById('geofence-banner-css')) {
      var s = document.createElement('style');
      s.id = 'geofence-banner-css';
      s.textContent =
        '#geoBanner{position:fixed;top:0;left:0;right:0;z-index:99999;display:none;padding:12px 16px;font-family:Inter,system-ui,sans-serif;color:#fff;box-shadow:0 8px 30px rgba(0,0,0,.4)}' +
        '#geoBanner.show{display:block}#geoBanner.severe{background:linear-gradient(90deg,#7f1d1d,#dc2626)}' +
        '#geoBanner.high{background:linear-gradient(90deg,#9a3412,#f97316)}' +
        '#geoBanner .inner{max-width:1100px;margin:0 auto;display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap}' +
        '#geoBanner .msg{font-size:14px;font-weight:600;line-height:1.4}#geoBanner .msg small{display:block;font-weight:400;opacity:.95;margin-top:4px}' +
        '#geoBanner button{border:0;border-radius:8px;padding:8px 12px;font-weight:700;cursor:pointer;background:rgba(0,0,0,.25);color:#fff}' +
        '#geoShareBar{position:fixed;bottom:100px;right:24px;z-index:9998}' +
        '#geoShareBar button{background:#0f172a;color:#10b981;border:1px solid rgba(16,185,129,.45);padding:10px 14px;border-radius:999px;font-weight:700;cursor:pointer;font-size:13px;box-shadow:0 8px 24px rgba(0,0,0,.35)}';
      document.head.appendChild(s);
    }
    if (!document.getElementById('geoBanner')) {
      var b = document.createElement('div');
      b.id = 'geoBanner';
      b.innerHTML = '<div class="inner"><div class="msg" id="geoBannerMsg"></div><button type="button" id="geoBannerClose">Dismiss</button></div>';
      document.body.appendChild(b);
      document.getElementById('geoBannerClose').onclick = function () {
        b.classList.remove('show');
      };
    }
    if (!document.getElementById('geoShareBar')) {
      var bar = document.createElement('div');
      bar.id = 'geoShareBar';
      bar.innerHTML = '<button type="button" id="btnShareLoc">📍 Share Location for Alerts</button>';
      document.body.appendChild(bar);
      document.getElementById('btnShareLoc').onclick = shareLocation;
    }
  }

  function showBanner(alert) {
    ensureUI();
    var el = document.getElementById('geoBanner');
    var msg = document.getElementById('geoBannerMsg');
    var level = String(alert.riskLevel || 'high').toLowerCase();
    el.className = 'show ' + (level === 'severe' ? 'severe' : 'high');
    var sms = alert.smsHindi || alert.smsEnglish || '';
    msg.innerHTML =
      '⚠️ <strong>' +
      (alert.riskLevel || '') +
      ' ' +
      (alert.primaryDisaster || '') +
      '</strong> — ' +
      (alert.location || 'Your area') +
      (alert.distanceKm != null ? ' · ' + alert.distanceKm + ' km away' : '') +
      '<small>' +
      sms +
      '</small>';
  }

  async function shareLocation() {
    var token = getToken();
    if (!token) {
      alert('Pehle login karo');
      window.location.href = '/auth.html?mode=login';
      return;
    }
    if (!navigator.geolocation) {
      alert('GPS not supported');
      return;
    }
    var btn = document.getElementById('btnShareLoc');
    if (btn) btn.textContent = '⏳ Saving...';

    navigator.geolocation.getCurrentPosition(
      async function (pos) {
        try {
          var res = await fetch(API + '/api/user/location', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: 'Bearer ' + token
            },
            body: JSON.stringify({
              lat: pos.coords.latitude,
              lon: pos.coords.longitude,
              accuracy: pos.coords.accuracy,
              source: 'browser'
            })
          });

          var text = await res.text();
          var data;
          try {
            data = JSON.parse(text);
          } catch (e) {
            throw new Error('Server HTML de raha hai — server.js update/restart karo. Body: ' + text.slice(0, 80));
          }

          if (!res.ok || !data.success) {
            throw new Error(data.message || 'Save failed');
          }

          if (btn) btn.textContent = '✅ Location ON';
          alert('📍 Location saved! Geofence alerts ON.');
          pullMyAlerts();
        } catch (err) {
          alert('Location save failed: ' + err.message);
          if (btn) btn.textContent = '📍 Share Location for Alerts';
        }
      },
      function (err) {
        alert('GPS error: ' + err.message);
        if (btn) btn.textContent = '📍 Share Location for Alerts';
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }

  async function pullMyAlerts() {
    var token = getToken();
    if (!token) return;
    try {
      var res = await fetch(API + '/api/alerts/my', {
        headers: { Authorization: 'Bearer ' + token }
      });
      var data = await res.json();
      if (!data.success || !data.alerts || !data.alerts.length) return;
      var unread = data.alerts.find(function (a) { return !a.read; }) || data.alerts[0];
      if (unread) showBanner(unread);
    } catch (e) {}
  }

  window.BhoomiGeofence = { shareLocation: shareLocation, pullMyAlerts: pullMyAlerts, showBanner: showBanner };

  document.addEventListener('DOMContentLoaded', function () {
    ensureUI();
    pullMyAlerts();
    setInterval(pullMyAlerts, 60000);
  });
})();