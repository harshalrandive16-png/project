/* ═══════════════════════════════════════════════════════════
   BHOOMISURAKSHA — INDIA LIVE FEEDS (Shared Module)
   ═══════════════════════════════════════════════════════════
   
   Usage (any page):
   
   <script src="india-feeds.js"></script>
   <script>
     BhoomiFeeds.init({
       container  : '#liveList',       // list wrapper
       footer     : '#liveFooter',     // status bar
       refreshBtn : '#refreshLiveBtn', // ⟳ button
       tabs       : '.src-tab',        // filter tab buttons
       interval   : 90                 // auto-refresh seconds
     });
   </script>

   Or just fetch data manually:
     const alerts = await BhoomiFeeds.fetch();
   
   ═══════════════════════════════════════════════════════════ */

const BhoomiFeeds = (() => {

  /* ── CONFIG ──────────────────────────────────── */
  const INDIA_BBOX = { minLat: 6, maxLat: 37, minLng: 68, maxLng: 97 };

  const METROS = [
    { city: 'Delhi',       lat: 28.61, lng: 77.21, state: 'Delhi' },
    { city: 'Mumbai',      lat: 19.07, lng: 72.87, state: 'Maharashtra' },
    { city: 'Chennai',     lat: 13.08, lng: 80.27, state: 'Tamil Nadu' },
    { city: 'Kolkata',     lat: 22.57, lng: 88.36, state: 'West Bengal' },
    { city: 'Guwahati',    lat: 26.14, lng: 91.73, state: 'Assam' },
    { city: 'Chandigarh',  lat: 30.73, lng: 76.78, state: 'Punjab' },
    { city: 'Hyderabad',   lat: 17.38, lng: 78.48, state: 'Telangana' },
    { city: 'Bengaluru',   lat: 12.97, lng: 77.59, state: 'Karnataka' },
    { city: 'Dehradun',    lat: 30.31, lng: 78.03, state: 'Uttarakhand' },
    { city: 'Shimla',      lat: 31.10, lng: 77.17, state: 'Himachal Pradesh' },
    { city: 'Patna',       lat: 25.59, lng: 85.13, state: 'Bihar' },
    { city: 'Bhubaneswar', lat: 20.29, lng: 85.82, state: 'Odisha' }
  ];

  const CACHE_KEY  = 'bhoomi_live_cache';
  const CACHE_TTL  = 120 * 1000; // 2 min stale

  /* ── STATE ───────────────────────────────────── */
  let _alerts      = [];
  let _filter      = 'all';
  let _timer       = null;
  let _lastFetchAt = 0;
  let _isLive      = false;
  let _opts        = {};

  /* ══════════════════════════════════════════════
     DATA FETCHERS
     ══════════════════════════════════════════════ */

  /* 1 ─ USGS Earthquakes (India bbox, M≥3, 7 days) */
  async function _fetchQuakes() {
    const start = new Date(Date.now() - 7 * 864e5).toISOString();
    const url = `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson`
      + `&starttime=${start}`
      + `&minlatitude=${INDIA_BBOX.minLat}&maxlatitude=${INDIA_BBOX.maxLat}`
      + `&minlongitude=${INDIA_BBOX.minLng}&maxlongitude=${INDIA_BBOX.maxLng}`
      + `&minmagnitude=3.0&orderby=time&limit=25`;

    const r = await fetch(url);
    const d = await r.json();
    return (d.features || []).map(f => {
      const p = f.properties, c = f.geometry.coordinates;
      const mag = p.mag || 0;
      return {
        source:   'usgs',
        type:     'quake',
        icon:     '🌍',
        title:    `M${mag.toFixed(1)} — ${p.place || 'India region'}`,
        meta:     `Depth ${Math.round(c[2])}km`,
        mag:      mag.toFixed(1),
        severity: mag >= 6 ? 'severe' : mag >= 5 ? 'high' : mag >= 4 ? 'moderate' : 'low',
        time:     p.time,
        url:      p.url,
        lat: c[1], lng: c[0]
      };
    });
  }

  /* 2 ─ ReliefWeb India Disasters */
  async function _fetchDisasters() {
    const url = `https://api.reliefweb.int/v1/disasters`
      + `?appname=bhoomisuraksha&profile=list&limit=15`
      + `&filter[field]=country.iso3&filter[value]=IND`
      + `&sort[]=date:desc`;

    const r = await fetch(url);
    const d = await r.json();
    return (d.data || []).map(it => {
      const f = it.fields || {};
      const st = (f.status || '').toLowerCase();
      const types = (f.type || []).map(t => t.name).join(', ') || 'Event';
      return {
        source:   'reliefweb',
        type:     'disaster',
        icon:     '🌀',
        title:    f.name || 'Disaster event in India',
        meta:     types,
        severity: (st === 'ongoing' || st === 'alert') ? 'high' : st === 'past' ? 'low' : 'moderate',
        time:     new Date(f.date?.created || Date.now()).getTime(),
        url:      f.url || `https://reliefweb.int/disaster/${it.id}`
      };
    });
  }

  /* 3 ─ Open-Meteo Weather (Indian metros) */
  async function _fetchWeather() {
    const cities = METROS.slice(0, 8); // top 8 for speed
    const results = await Promise.allSettled(cities.map(async c => {
      const url = `https://api.open-meteo.com/v1/forecast`
        + `?latitude=${c.lat}&longitude=${c.lng}`
        + `&current=rain,wind_speed_10m,temperature_2m,weather_code`
        + `&timezone=Asia%2FKolkata`;

      const r = await fetch(url);
      const d = await r.json();
      const cur = d.current || {};
      const rain = cur.rain || 0;
      const wind = cur.wind_speed_10m || 0;
      const temp = cur.temperature_2m ?? 0;
      const wcode = cur.weather_code ?? 0;

      let sev = null, title = null, meta = null;

      // Heavy rain
      if (rain >= 15) {
        sev   = rain >= 40 ? 'severe' : rain >= 25 ? 'high' : 'moderate';
        title = `Heavy rainfall in ${c.city}`;
        meta  = `Rain ${rain.toFixed(1)}mm · Wind ${Math.round(wind)}km/h`;
      }
      // Cyclonic / strong winds
      else if (wind >= 40) {
        sev   = wind >= 70 ? 'severe' : wind >= 55 ? 'high' : 'moderate';
        title = `Strong winds in ${c.city}`;
        meta  = `Wind ${Math.round(wind)}km/h · Temp ${Math.round(temp)}°C`;
      }
      // Heatwave
      else if (temp >= 42) {
        sev   = temp >= 46 ? 'severe' : temp >= 44 ? 'high' : 'moderate';
        title = `Heatwave alert — ${c.city}`;
        meta  = `Temp ${Math.round(temp)}°C · Wind ${Math.round(wind)}km/h`;
      }
      // Thunderstorm (WMO codes 95-99)
      else if (wcode >= 95) {
        sev   = 'high';
        title = `Thunderstorm in ${c.city}`;
        meta  = `Rain ${rain.toFixed(1)}mm · Wind ${Math.round(wind)}km/h`;
      }

      if (!sev) return null;
      return {
        source: 'openmeteo',
        type:   'weather',
        icon:   '⛈️',
        title,
        meta:   meta + ' · ' + c.state,
        severity: sev,
        time:   Date.now(),
        url:    `https://www.google.com/maps?q=${c.lat},${c.lng}`,
        lat: c.lat, lng: c.lng
      };
    }));

    return results
      .filter(r => r.status === 'fulfilled' && r.value)
      .map(r => r.value);
  }

  /* ══════════════════════════════════════════════
     CACHE
     ══════════════════════════════════════════════ */
  function _saveCache(alerts) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        ts: Date.now(),
        data: alerts
      }));
    } catch (e) { /* quota */ }
  }

  function _loadCache() {
    try {
      const raw = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      if (raw && (Date.now() - raw.ts) < CACHE_TTL) return raw.data;
    } catch (e) {}
    return null;
  }

  /* ══════════════════════════════════════════════
     MASTER FETCH
     ══════════════════════════════════════════════ */
  async function fetchAll(force) {
    // Return cache if fresh and not forced
    if (!force) {
      const cached = _loadCache();
      if (cached && cached.length) {
        _alerts = cached;
        _isLive = true;
        _lastFetchAt = Date.now();
        return _alerts;
      }
    }

    try {
      const [quakes, disasters, weather] = await Promise.allSettled([
        _fetchQuakes(),
        _fetchDisasters(),
        _fetchWeather()
      ]);

      const q = quakes.status === 'fulfilled' ? quakes.value : [];
      const d = disasters.status === 'fulfilled' ? disasters.value : [];
      const w = weather.status === 'fulfilled' ? weather.value : [];

      _alerts = [...q, ...d, ...w].sort((a, b) => b.time - a.time);
      _isLive = true;
      _lastFetchAt = Date.now();
      _saveCache(_alerts);
    } catch (e) {
      console.warn('[BhoomiFeeds] Fetch error:', e);
      _isLive = false;
    }

    return _alerts;
  }

  /* ══════════════════════════════════════════════
     HELPERS
     ══════════════════════════════════════════════ */
  function _timeAgo(ts) {
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60)    return 'just now';
    if (s < 3600)  return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    return Math.floor(s / 86400) + 'd ago';
  }

  function _esc(s) {
    return String(s).replace(/[&<>"']/g, m =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])
    );
  }

  function _srcLabel(s) {
    return { usgs: 'NCS / USGS', reliefweb: 'UN OCHA', openmeteo: 'IMD-Grid' }[s] || s;
  }

  /* ══════════════════════════════════════════════
     DEFAULT RENDERER
     ══════════════════════════════════════════════ */
  function _render() {
    const box = _opts.container ? document.querySelector(_opts.container) : null;
    const foot = _opts.footer ? document.querySelector(_opts.footer) : null;
    if (!box) return;

    let list = _alerts;
    if (_filter === 'quake')    list = list.filter(a => a.type === 'quake');
    if (_filter === 'disaster') list = list.filter(a => a.type === 'disaster');
    if (_filter === 'weather')  list = list.filter(a => a.type === 'weather');

    if (!list.length) {
      box.innerHTML = `<div class="live-empty">No active alerts in this category 🌱</div>`;
    } else {
      box.innerHTML = list.slice(0, 18).map(a => `
        <div class="live-item ${a.severity}" data-url="${encodeURIComponent(a.url || '')}">
          <div class="li-top">
            <span class="li-src ${a.source}">${_srcLabel(a.source)}</span>
            <span class="li-time">${_timeAgo(a.time)}</span>
          </div>
          <div class="li-title">${a.icon} ${_esc(a.title)}</div>
          <div class="li-meta">
            <span>${_esc(a.meta || '')}</span>
            ${a.mag ? `<span class="li-mag">M ${a.mag}</span>` : ''}
          </div>
        </div>
      `).join('');

      // click handlers
      box.querySelectorAll('.live-item').forEach(el => {
        el.addEventListener('click', () => {
          const u = decodeURIComponent(el.dataset.url);
          if (u) window.open(u, '_blank', 'noopener');
        });
      });
    }

    if (foot) {
      foot.innerHTML = `<span class="${_isLive ? 'ok' : 'err'}">● ${_isLive ? 'Live' : 'Offline'}</span>`
        + ` <span>${_alerts.length} alerts · ${_lastFetchAt ? _timeAgo(_lastFetchAt) : '—'}</span>`;
    }
  }

  /* ══════════════════════════════════════════════
     PUBLIC API
     ══════════════════════════════════════════════ */

  /**
   * BhoomiFeeds.init(options)
   * One-call setup. Starts fetching + auto-refresh + renders.
   */
  function init(opts = {}) {
    _opts = {
      container:  opts.container  || null,
      footer:     opts.footer     || null,
      refreshBtn: opts.refreshBtn || null,
      tabs:       opts.tabs       || null,
      interval:   opts.interval   || 90,
      onFetch:    opts.onFetch    || null
    };

    // Tabs
    if (_opts.tabs) {
      document.querySelectorAll(_opts.tabs).forEach(t => {
        t.addEventListener('click', () => {
          document.querySelectorAll(_opts.tabs).forEach(x => x.classList.remove('active'));
          t.classList.add('active');
          _filter = t.dataset.src || 'all';
          _render();
        });
      });
    }

    // Refresh button
    if (_opts.refreshBtn) {
      const btn = document.querySelector(_opts.refreshBtn);
      if (btn) {
        btn.addEventListener('click', async () => {
          btn.classList.add('loading');
          await fetchAll(true);
          _render();
          if (_opts.onFetch) _opts.onFetch(_alerts);
          btn.classList.remove('loading');
        });
      }
    }

    // Boot
    _boot();
  }

  async function _boot() {
    // Show cached data instantly
    const cached = _loadCache();
    if (cached && cached.length) {
      _alerts = cached;
      _isLive = true;
      _lastFetchAt = Date.now();
      _render();
      if (_opts.onFetch) _opts.onFetch(_alerts);
    }

    // Fresh fetch
    await fetchAll(true);
    _render();
    if (_opts.onFetch) _opts.onFetch(_alerts);

    // Auto-refresh
    if (_timer) clearInterval(_timer);
    _timer = setInterval(async () => {
      await fetchAll(true);
      _render();
      if (_opts.onFetch) _opts.onFetch(_alerts);
    }, _opts.interval * 1000);

    // UI time-ago ticker
    setInterval(() => _render(), 60 * 1000);
  }

  /**
   * BhoomiFeeds.fetch(force?)
   * Returns Promise<Alert[]> — use when you want data only, no UI.
   */
  async function fetch(force = false) {
    return await fetchAll(force);
  }

  /**
   * BhoomiFeeds.getAlerts(filter?)
   * Returns cached alerts synchronously.
   * filter: 'all' | 'quake' | 'disaster' | 'weather'
   */
  function getAlerts(filter = 'all') {
    if (filter === 'all') return _alerts;
    return _alerts.filter(a => a.type === filter);
  }

  /**
   * BhoomiFeeds.isLive()
   * Returns boolean — last fetch success status.
   */
  function isLive() {
    return _isLive;
  }

  /**
   * BhoomiFeeds.stop()
   * Stops auto-refresh (cleanup on page unload if needed).
   */
  function stop() {
    if (_timer) { clearInterval(_timer); _timer = null; }
  }

  /* ── EXPOSE ──────────────────────────────────── */
  return { init, fetch, getAlerts, isLive, stop };

})();