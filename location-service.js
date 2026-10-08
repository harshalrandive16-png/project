// ═══════════════════════════════════════════════════════
// 🏔️ BhoomiSuraksha — location-service.js (GPS NEVER STUCK)
// ═══════════════════════════════════════════════════════

(function () {
  const API = () => window.BHOOMI_API || window.location.origin || 'http://localhost:5000';

  function $(id) {
    return document.getElementById(id);
  }

  function setTextMany(ids, text) {
    ids.forEach((id) => {
      const el = $(id);
      if (el) el.textContent = text;
    });
  }

  function setHtmlMany(selectors, html) {
    selectors.forEach((sel) => {
      document.querySelectorAll(sel).forEach((el) => {
        el.innerHTML = html;
      });
    });
  }

  function updateLocationUI(state, detail) {
    // Common status nodes across pages
    const statusIds = [
      'gpsStatus',
      'locationStatus',
      'myLocationStatus',
      'liveSafetyStatus',
      'detectStatus'
    ];

    if (state === 'checking') {
      setTextMany(statusIds, 'Detecting your GPS location...');
      setHtmlMany(
        ['.gps-status', '.location-status', '[data-gps-status]'],
        'Detecting your GPS location...'
      );
      return;
    }

    if (state === 'denied') {
      const msg = '📍 Location permission denied — browser Allow dabao, ya manual lat/lon use karo';
      setTextMany(statusIds, msg);
      setHtmlMany(['.gps-status', '.location-status', '[data-gps-status]'], msg);

      const badge = $('safetyBadge');
      if (badge) {
        badge.textContent = 'PERMISSION NEEDED';
        badge.style.background = '#f59e0b';
      }
      return;
    }

    if (state === 'error') {
      const msg = '📍 GPS unavailable — Allow location ya manual lat/lon use karo';
      setTextMany(statusIds, msg);
      setHtmlMany(['.gps-status', '.location-status', '[data-gps-status]'], msg);
      return;
    }

    if (state === 'ok' && detail) {
      const msg = `📍 ${detail.lat.toFixed(5)}, ${detail.lon.toFixed(5)} (±${Math.round(detail.accuracy || 0)}m)`;
      setTextMany(statusIds, msg);
      setHtmlMany(['.gps-status', '.location-status', '[data-gps-status]'], msg);

      // fill hidden/input fields if present
      const latEl = $('lat') || $('latitude') || document.querySelector('[name="lat"]');
      const lonEl = $('lon') || $('longitude') || document.querySelector('[name="lon"]');
      if (latEl) latEl.value = detail.lat;
      if (lonEl) lonEl.value = detail.lon;

      const coordBox = $('coordinates') || $('coordDisplay');
      if (coordBox) {
        coordBox.value = `${detail.lat.toFixed(5)}° N, ${detail.lon.toFixed(5)}° E`;
      }

      const badge = $('safetyBadge');
      if (badge) {
        badge.textContent = detail.localOnly ? 'LIVE GPS (local)' : 'LIVE GPS';
        badge.style.background = detail.localOnly ? '#0ea5e9' : '#10b981';
      }
    }
  }

  function getToken() {
    return localStorage.getItem('bhoomiToken') || localStorage.getItem('landslideToken') || '';
  }

  function saveLocal(lat, lon, accuracy) {
    const payload = {
      lat: parseFloat(lat),
      lon: parseFloat(lon),
      accuracy: accuracy || null,
      source: 'gps',
      updatedAt: new Date().toISOString()
    };
    localStorage.setItem('bhoomiLastLocation', JSON.stringify(payload));
    window.__BHOOMI_LAT = payload.lat;
    window.__BHOOMI_LON = payload.lon;
    return payload;
  }

  function getLocal() {
    try {
      const p = JSON.parse(localStorage.getItem('bhoomiLastLocation') || 'null');
      if (!p || !Number.isFinite(p.lat) || !Number.isFinite(p.lon)) return null;
      // sirf real GPS/manual entries, 24h tak — purane demo entries ignore
      if (p.source !== 'gps' && p.source !== 'manual') return null;
      const age = Date.now() - Date.parse(p.updatedAt);
      if (!Number.isFinite(age) || age > 24 * 60 * 60 * 1000) return null;
      return p;
    } catch (e) {
      return null;
    }
  }

  async function saveToServer(lat, lon, accuracy) {
    saveLocal(lat, lon, accuracy);
    const token = getToken();
    if (!token) {
      return { success: true, localOnly: true, lat, lon, accuracy };
    }

    try {
      const res = await fetch(`${API()}/api/user/location`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ lat, lon, accuracy })
      });
      const data = await res.json().catch(() => ({}));
      return { success: true, localOnly: !!data.demo, lat, lon, accuracy, ...data };
    } catch (e) {
      return { success: true, localOnly: true, lat, lon, accuracy };
    }
  }

  function detect(options = {}) {
    const silent = !!options.silent;
    updateLocationUI('checking');

    return new Promise((resolve) => {
      // fallback if geolocation missing
      if (!navigator.geolocation) {
        updateLocationUI('error');
        if (!silent && window.showToast) window.showToast('GPS not supported on this device', 'error');
        resolve({ ok: false, reason: 'unsupported' });
        return;
      }

      let done = false;
      const finish = async (lat, lon, accuracy, meta) => {
        if (done) return;
        done = true;
        const saved = await saveToServer(lat, lon, accuracy);
        updateLocationUI('ok', { lat, lon, accuracy, localOnly: saved.localOnly });
        window.dispatchEvent(
          new CustomEvent('bhoomi:location', { detail: { lat, lon, accuracy, ...saved } })
        );
        if (!silent && window.showToast) {
          window.showToast(
            saved.localOnly ? '📍 Location ready (saved on this device)' : '📍 Location shared',
            'success'
          );
        }
        resolve({ lat, lon, accuracy, ...saved });
      };

      // hard timeout so UI never infinite-spins
      const timer = setTimeout(() => {
        const local = getLocal();
        if (local && local.lat) {
          finish(local.lat, local.lon, local.accuracy || 50, { timeout: true });
        } else if (!done) {
          // done set nahi kiya: late GPS fix aaye to bhi event/UI update ho jaye
          updateLocationUI('error');
          resolve({ ok: false, reason: 'timeout' });
        }
      }, options.timeout || 12000);

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          clearTimeout(timer);
          finish(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
        },
        (err) => {
          clearTimeout(timer);
          console.warn('GPS error:', err && err.message);
          if (err && err.code === 1) updateLocationUI('denied');

          const local = getLocal();
          if (local && local.lat) {
            finish(local.lat, local.lon, local.accuracy || 50, { denied: true });
          } else if (!done) {
            done = true;
            if (!(err && err.code === 1)) updateLocationUI('error');
            resolve({ ok: false, reason: err && err.code === 1 ? 'denied' : 'unavailable' });
          }
        },
        {
          enableHighAccuracy: true,
          timeout: options.timeout || 10000,
          maximumAge: 30000
        }
      );
    });
  }

  // Wire common buttons automatically
  function bindButtons() {
    const texts = [
      'detect my location',
      'auto-detect current location',
      'share location',
      'share location for alerts',
      'recheck'
    ];

    document.querySelectorAll('button, a, .btn').forEach((btn) => {
      const t = (btn.textContent || '').trim().toLowerCase();
      if (texts.some((x) => t.includes(x))) {
        btn.addEventListener('click', (e) => {
          // don't block links fully if needed
          if (btn.tagName === 'BUTTON') e.preventDefault();
          detect({ silent: false });
        });
      }
    });

    const ids = [
      'btnDetectLocation',
      'detectLocationBtn',
      'shareLocationBtn',
      'btnShareLocation',
      'recheckLocationBtn'
    ];
    ids.forEach((id) => {
      const el = $(id);
      if (el) el.addEventListener('click', (e) => {
        e.preventDefault();
        detect({ silent: false });
      });
    });
  }

  window.BhoomiLocation = {
    detect,
    save: saveToServer,
    getLocal,
    updateLocationUI
  };

  // global aliases used by old dashboard code
  window.detectMyLocation = () => detect({ silent: false });
  window.shareMyLocation = () => detect({ silent: false });

  function boot() {
    bindButtons();
    // auto detect quiet
    setTimeout(() => detect({ silent: true }), 800);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();