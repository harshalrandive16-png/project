/* ============================================================
   BhoomiSuraksha — Weather Sidebar Widget
   Data: Open-Meteo (FREE, no API key required)
   
   Usage:
   <div id="bsWeather"></div>
   <script src="widgets/weather-sidebar.js"></script>
   
   Optional:
   <div id="bsWeather" data-lat="28.6" data-lon="77.2" data-city="Delhi"></div>
   
   Auto-refresh: 10 minutes
============================================================ */

(function () {
  'use strict';

  if (window.__BHOOMI_WEATHER_LOADED__) return;
  window.__BHOOMI_WEATHER_LOADED__ = true;

  // ---- Styles ----
  const style = document.createElement('style');
  style.textContent = `
    .bs-w-card{
      background:linear-gradient(145deg,#0b0f1a,#060b11);
      border:1px solid rgba(255,255,255,.08);
      border-radius:16px;overflow:hidden;
      font-family:'Inter',system-ui,sans-serif;
      color:#e2e8f0;
      box-shadow:0 8px 24px rgba(0,0,0,.3);
    }
    
    /* ==== Header / Current Weather ==== */
    .bs-w-hero{
      padding:24px 20px;position:relative;
      background:linear-gradient(135deg,rgba(16,185,129,.15),rgba(6,11,17,.5));
      border-bottom:1px solid rgba(255,255,255,.08);
    }
    .bs-w-hero.rainy{background:linear-gradient(135deg,rgba(59,130,246,.2),rgba(6,11,17,.6))}
    .bs-w-hero.stormy{background:linear-gradient(135deg,rgba(139,92,246,.2),rgba(6,11,17,.6))}
    .bs-w-hero.hot{background:linear-gradient(135deg,rgba(249,115,22,.2),rgba(6,11,17,.6))}
    .bs-w-hero.cold{background:linear-gradient(135deg,rgba(6,182,212,.2),rgba(6,11,17,.6))}
    
    .bs-w-loc{
      display:flex;align-items:center;justify-content:space-between;
      margin-bottom:12px;font-size:.85rem;
    }
    .bs-w-city{
      display:flex;align-items:center;gap:6px;
      color:#fff;font-weight:600;
    }
    .bs-w-live{
      display:flex;align-items:center;gap:5px;
      background:rgba(16,185,129,.15);
      border:1px solid rgba(16,185,129,.3);
      padding:3px 8px;border-radius:10px;
      font-size:.65rem;font-weight:700;color:#10b981;
    }
    .bs-w-live .dot{
      width:6px;height:6px;background:#10b981;border-radius:50%;
      animation:bsWBlink 1.5s infinite;
    }
    @keyframes bsWBlink{0%,100%{opacity:1}50%{opacity:.4}}
    
    .bs-w-current{
      display:flex;align-items:center;gap:16px;
    }
    .bs-w-icon-lg{
      font-size:4rem;line-height:1;
      filter:drop-shadow(0 4px 8px rgba(0,0,0,.3));
    }
    .bs-w-temp{
      flex:1;
    }
    .bs-w-temp-big{
      font-size:3rem;font-weight:800;color:#fff;
      line-height:1;letter-spacing:-2px;
    }
    .bs-w-temp-big sup{
      font-size:1.3rem;font-weight:600;color:#94a3b8;
      margin-left:2px;
    }
    .bs-w-cond{
      color:#94a3b8;font-size:.9rem;margin-top:4px;
      font-weight:500;
    }
    .bs-w-feels{
      color:#64748b;font-size:.75rem;margin-top:3px;
    }
    
    /* ==== AI Warning Banner ==== */
    .bs-w-warn{
      margin:12px 0 0;padding:10px 12px;
      border-radius:10px;font-size:.8rem;
      display:flex;align-items:center;gap:8px;
      animation:bsWSlide .4s;
    }
    @keyframes bsWSlide{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)}}
    .bs-w-warn.severe{background:rgba(220,38,38,.15);border:1px solid rgba(220,38,38,.35);color:#fca5a5}
    .bs-w-warn.high{background:rgba(249,115,22,.15);border:1px solid rgba(249,115,22,.35);color:#fdba74}
    .bs-w-warn.mod{background:rgba(234,179,8,.15);border:1px solid rgba(234,179,8,.35);color:#fde68a}
    
    /* ==== Stats Row ==== */
    .bs-w-stats{
      display:grid;grid-template-columns:repeat(4,1fr);
      gap:8px;padding:14px 16px;
      border-bottom:1px solid rgba(255,255,255,.06);
    }
    .bs-w-stat{
      text-align:center;padding:8px 4px;
      background:rgba(255,255,255,.03);
      border-radius:10px;
    }
    .bs-w-stat .ico{font-size:1.1rem;display:block;margin-bottom:2px}
    .bs-w-stat .val{font-size:.85rem;font-weight:700;color:#fff}
    .bs-w-stat .lbl{font-size:.6rem;color:#64748b;margin-top:1px;text-transform:uppercase;letter-spacing:.5px}
    
    /* ==== Tabs ==== */
    .bs-w-tabs{
      display:flex;padding:12px 16px 0;gap:8px;
    }
    .bs-w-tab{
      flex:1;padding:8px 12px;border-radius:10px;
      background:rgba(255,255,255,.04);
      border:1px solid rgba(255,255,255,.06);
      color:#94a3b8;cursor:pointer;font-family:inherit;
      font-size:.8rem;font-weight:600;
      transition:all .2s;
    }
    .bs-w-tab.active{
      background:linear-gradient(135deg,#10b981,#059669);
      color:#fff;border-color:#10b981;
      box-shadow:0 4px 12px rgba(16,185,129,.3);
    }
    
    /* ==== Hourly Forecast ==== */
    .bs-w-hourly{
      padding:14px 12px;overflow-x:auto;
      display:flex;gap:8px;
      scrollbar-width:thin;scrollbar-color:#10b981 transparent;
    }
    .bs-w-hourly::-webkit-scrollbar{height:5px}
    .bs-w-hourly::-webkit-scrollbar-thumb{background:rgba(16,185,129,.3);border-radius:3px}
    .bs-w-hour{
      flex-shrink:0;width:64px;
      text-align:center;padding:10px 6px;
      background:rgba(255,255,255,.03);
      border:1px solid rgba(255,255,255,.05);
      border-radius:10px;
      transition:all .2s;
    }
    .bs-w-hour:hover{background:rgba(16,185,129,.08);border-color:rgba(16,185,129,.25)}
    .bs-w-hour.now{
      background:rgba(16,185,129,.15);
      border-color:rgba(16,185,129,.35);
    }
    .bs-w-hour .time{font-size:.7rem;color:#94a3b8;margin-bottom:4px;font-weight:600}
    .bs-w-hour .ico{font-size:1.3rem;margin:2px 0}
    .bs-w-hour .temp{font-size:.85rem;font-weight:700;color:#fff;margin-top:2px}
    .bs-w-hour .rain{
      font-size:.6rem;color:#60a5fa;margin-top:2px;
      display:flex;align-items:center;justify-content:center;gap:2px;
    }
    .bs-w-hour .rain.dry{color:#64748b}
    
    /* ==== Daily Forecast ==== */
    .bs-w-daily{padding:8px 12px 14px;display:none}
    .bs-w-daily.show{display:block}
    .bs-w-hourly-wrap.hide{display:none}
    
    .bs-w-day{
      display:grid;grid-template-columns:80px 40px 1fr auto;
      align-items:center;gap:12px;
      padding:10px 8px;border-radius:10px;
      transition:all .2s;
    }
    .bs-w-day:hover{background:rgba(16,185,129,.05)}
    .bs-w-day .name{font-size:.85rem;font-weight:600;color:#fff}
    .bs-w-day .name .sub{font-size:.65rem;color:#64748b;display:block;font-weight:500}
    .bs-w-day .ico{font-size:1.4rem;text-align:center}
    .bs-w-day .bar{
      height:6px;border-radius:3px;position:relative;
      background:rgba(255,255,255,.06);
    }
    .bs-w-day .bar .fill{
      position:absolute;height:100%;border-radius:3px;
      background:linear-gradient(90deg,#3b82f6,#10b981,#eab308,#f97316,#dc2626);
    }
    .bs-w-day .temps{
      display:flex;gap:6px;font-size:.85rem;font-weight:600;
    }
    .bs-w-day .temps .max{color:#fff}
    .bs-w-day .temps .min{color:#64748b}
    .bs-w-day .rain{font-size:.7rem;color:#60a5fa}
    
    /* ==== Loading / Empty ==== */
    .bs-w-loading{
      padding:40px 20px;text-align:center;color:#64748b;
    }
    .bs-w-loading .spinner{
      width:32px;height:32px;margin:0 auto 12px;
      border:3px solid rgba(16,185,129,.15);
      border-top-color:#10b981;border-radius:50%;
      animation:bsWSpin 1s linear infinite;
    }
    @keyframes bsWSpin{to{transform:rotate(360deg)}}
    
    /* ==== Footer ==== */
    .bs-w-footer{
      padding:8px 16px;border-top:1px solid rgba(255,255,255,.06);
      display:flex;justify-content:space-between;align-items:center;
      font-size:.65rem;color:#64748b;
    }
    .bs-w-footer a{color:#10b981;text-decoration:none}
    .bs-w-footer button{
      background:rgba(16,185,129,.1);
      border:1px solid rgba(16,185,129,.25);
      color:#10b981;padding:3px 8px;border-radius:6px;
      cursor:pointer;font-size:.65rem;font-weight:600;
      font-family:inherit;transition:all .2s;
    }
    .bs-w-footer button:hover{background:rgba(16,185,129,.2)}
    
    @media(max-width:480px){
      .bs-w-stats{grid-template-columns:repeat(2,1fr)}
      .bs-w-day{grid-template-columns:70px 32px 1fr auto;gap:8px}
      .bs-w-temp-big{font-size:2.5rem}
      .bs-w-icon-lg{font-size:3.2rem}
    }
  `;
  document.head.appendChild(style);

  // ---- WMO Weather Code → Icon + Text ----
  // Reference: https://open-meteo.com/en/docs
  function wmoInfo(code) {
    const map = {
      0: { icon: '☀️', text: 'Clear sky', type: 'clear' },
      1: { icon: '🌤️', text: 'Mainly clear', type: 'clear' },
      2: { icon: '⛅', text: 'Partly cloudy', type: 'clear' },
      3: { icon: '☁️', text: 'Overcast', type: 'cloudy' },
      45: { icon: '🌫️', text: 'Foggy', type: 'foggy' },
      48: { icon: '🌫️', text: 'Rime fog', type: 'foggy' },
      51: { icon: '🌦️', text: 'Light drizzle', type: 'rainy' },
      53: { icon: '🌦️', text: 'Drizzle', type: 'rainy' },
      55: { icon: '🌧️', text: 'Heavy drizzle', type: 'rainy' },
      61: { icon: '🌦️', text: 'Light rain', type: 'rainy' },
      63: { icon: '🌧️', text: 'Moderate rain', type: 'rainy' },
      65: { icon: '🌧️', text: 'Heavy rain', type: 'rainy' },
      66: { icon: '🌨️', text: 'Freezing rain', type: 'cold' },
      67: { icon: '🌨️', text: 'Heavy freezing rain', type: 'cold' },
      71: { icon: '🌨️', text: 'Light snow', type: 'cold' },
      73: { icon: '🌨️', text: 'Snow', type: 'cold' },
      75: { icon: '❄️', text: 'Heavy snow', type: 'cold' },
      77: { icon: '❄️', text: 'Snow grains', type: 'cold' },
      80: { icon: '🌦️', text: 'Rain showers', type: 'rainy' },
      81: { icon: '🌧️', text: 'Heavy showers', type: 'rainy' },
      82: { icon: '⛈️', text: 'Violent showers', type: 'stormy' },
      85: { icon: '🌨️', text: 'Snow showers', type: 'cold' },
      86: { icon: '❄️', text: 'Heavy snow showers', type: 'cold' },
      95: { icon: '⛈️', text: 'Thunderstorm', type: 'stormy' },
      96: { icon: '⛈️', text: 'Thunderstorm + hail', type: 'stormy' },
      99: { icon: '⛈️', text: 'Severe thunderstorm', type: 'stormy' }
    };
    return map[code] || { icon: '🌡️', text: 'Unknown', type: 'clear' };
  }

  function heroClass(code, temp) {
    const info = wmoInfo(code);
    if (info.type === 'stormy') return 'stormy';
    if (info.type === 'rainy') return 'rainy';
    if (info.type === 'cold') return 'cold';
    if (temp >= 38) return 'hot';
    return '';
  }

  // ---- AI Risk Warning (rule-based) ----
  function assessRisk(current, hourly) {
    const temp = current.temperature_2m;
    const wind = current.wind_speed_10m;
    const code = current.weather_code;
    const rain = current.precipitation || 0;

    // Check next 12 hours for extremes
    const next12hRain = (hourly.precipitation || []).slice(0, 12).reduce((a, b) => a + (b || 0), 0);
    const next12hWind = Math.max(...((hourly.wind_speed_10m || []).slice(0, 12).filter(v => typeof v === 'number')), 0);

    if (code >= 95 || next12hRain > 50) {
      return { level: 'severe', msg: '⚠️ Severe storm/heavy rain expected — Cloudburst risk!' };
    }
    if (code >= 80 || next12hRain > 30 || next12hWind > 60) {
      return { level: 'high', msg: '🌧️ Heavy rain / strong winds expected in next 12 hours' };
    }
    if (temp >= 42) {
      return { level: 'high', msg: '🔥 Extreme heat wave — Stay hydrated, avoid outdoor 12-4 PM' };
    }
    if (temp <= 4) {
      return { level: 'mod', msg: '❄️ Cold wave conditions — Wear layered clothing' };
    }
    if (next12hRain > 15 || wind > 40) {
      return { level: 'mod', msg: '🌦️ Moderate rain/wind expected — Plan accordingly' };
    }
    return null;
  }

  // ---- Reverse geocode (Open-Meteo geocoding API — free) ----
  async function reverseGeocode(lat, lon) {
    try {
      const url = `https://geocoding-api.open-meteo.com/v1/reverse?latitude=${lat}&longitude=${lon}&language=en&format=json`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Geocode failed');
      const data = await res.json();
      const r = (data.results || [])[0];
      if (r) {
        return r.name + (r.admin1 ? ', ' + r.admin1 : '');
      }
    } catch (e) {}
    return `${lat.toFixed(2)}°N, ${lon.toFixed(2)}°E`;
  }

  // ---- Fetch weather ----
  async function fetchWeather(lat, lon) {
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}`
        + `&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,`
        + `weather_code,wind_speed_10m,wind_direction_10m,surface_pressure`
        + `&hourly=temperature_2m,precipitation_probability,precipitation,weather_code,wind_speed_10m`
        + `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max`
        + `&timezone=auto&forecast_days=7`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Weather API failed: ' + res.status);
      return await res.json();
    } catch (err) {
      console.error('❌ [Weather] Fetch failed:', err.message);
      return null;
    }
  }

  // ---- Get location (no fake Delhi) ----
  // 1) fresh GPS  2) last known (24h, real GPS/manual)  3) null → "location needed" panel
  function getSavedLoc() {
    try {
      const p = JSON.parse(localStorage.getItem('bhoomiLastLocation') || 'null');
      if (!p || !Number.isFinite(p.lat) || !Number.isFinite(p.lon)) return null;
      if (p.source !== 'gps' && p.source !== 'manual') return null;
      const age = Date.now() - Date.parse(p.updatedAt);
      if (!Number.isFinite(age) || age > 24 * 60 * 60 * 1000) return null;
      return { lat: p.lat, lon: p.lon, city: p.label || null };
    } catch (e) {
      return null;
    }
  }

  function getLocation() {
    return new Promise((resolve) => {
      let done = false;
      const finish = (loc) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(loc);
      };
      const timer = setTimeout(() => finish(getSavedLoc()), 10000);

      if (!navigator.geolocation) return finish(getSavedLoc());
      navigator.geolocation.getCurrentPosition(
        (pos) => finish({ lat: pos.coords.latitude, lon: pos.coords.longitude, city: null }),
        () => finish(getSavedLoc()),
        { timeout: 8000, enableHighAccuracy: false }
      );
    });
  }

  function renderNeedLocation(container) {
    container.innerHTML = `
      <div class="bs-w-loading">
        <div style="font-size:2rem;margin-bottom:8px">📍</div>
        <div>Location needed for live weather</div>
        <div style="font-size:.7rem;margin-top:4px;color:#64748b">Allow GPS or search your city</div>
        <button type="button" class="bs-w-needloc" style="margin-top:12px;padding:6px 14px;background:rgba(16,185,129,.15);border:1px solid #10b981;color:#10b981;border-radius:8px;cursor:pointer;font-family:inherit">📍 Use my location</button>
      </div>
    `;
    const btn = container.querySelector('.bs-w-needloc');
    if (btn) {
      btn.addEventListener('click', () => {
        if (typeof window.fetchUserLocationAndAnalyze === 'function') window.fetchUserLocationAndAnalyze();
        else initWidget(container, true);
      });
    }
    // home.js GPS / manual city se location mile to widget khud load ho jaye
    window.addEventListener('bhoomi:location', () => initWidget(container, true), { once: true });
  }

  // ---- Format helpers ----
  function fmtHour(iso) {
    try {
      const d = new Date(iso);
      let h = d.getHours();
      const ampm = h >= 12 ? 'PM' : 'AM';
      h = h % 12 || 12;
      return h + ' ' + ampm;
    } catch (e) { return '—'; }
  }

  function fmtDay(iso, idx) {
    if (idx === 0) return { name: 'Today', sub: '' };
    if (idx === 1) return { name: 'Tomorrow', sub: '' };
    try {
      const d = new Date(iso);
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return { name: days[d.getDay()], sub: d.getDate() + ' ' + months[d.getMonth()] };
    } catch (e) { return { name: '—', sub: '' }; }
  }

  // ---- Render ----
  function render(container, data, locName) {
    const cur = data.current;
    const hourly = data.hourly;
    const daily = data.daily;
    const info = wmoInfo(cur.weather_code);
    const heroCls = heroClass(cur.weather_code, cur.temperature_2m);
    const risk = assessRisk(cur, hourly);

    // Find current hour index for hourly forecast
    const nowHour = new Date().getHours();
    let startIdx = 0;
    if (hourly.time && hourly.time.length) {
      for (let i = 0; i < hourly.time.length; i++) {
        const h = new Date(hourly.time[i]).getHours();
        const d = new Date(hourly.time[i]).getDate();
        const now = new Date();
        if (d === now.getDate() && h === nowHour) { startIdx = i; break; }
        if (d === now.getDate() && h > nowHour) { startIdx = i; break; }
      }
    }

    // Build hourly (next 24 hours)
    let hourlyHtml = '';
    for (let i = startIdx; i < Math.min(startIdx + 24, hourly.time.length); i++) {
      const w = wmoInfo(hourly.weather_code[i]);
      const rain = hourly.precipitation_probability[i] || 0;
      const isNow = (i === startIdx);
      hourlyHtml += `
        <div class="bs-w-hour ${isNow ? 'now' : ''}">
          <div class="time">${isNow ? 'Now' : fmtHour(hourly.time[i])}</div>
          <div class="ico">${w.icon}</div>
          <div class="temp">${Math.round(hourly.temperature_2m[i])}°</div>
          <div class="rain ${rain < 20 ? 'dry' : ''}">💧 ${rain}%</div>
        </div>`;
    }

    // Build daily (7 days)
    let dailyHtml = '';
    const maxTemp = Math.max(...daily.temperature_2m_max);
    const minTemp = Math.min(...daily.temperature_2m_min);
    const range = maxTemp - minTemp || 1;
    for (let i = 0; i < Math.min(7, daily.time.length); i++) {
      const w = wmoInfo(daily.weather_code[i]);
      const d = fmtDay(daily.time[i], i);
      const dMax = daily.temperature_2m_max[i];
      const dMin = daily.temperature_2m_min[i];
      const barStart = ((dMin - minTemp) / range) * 100;
      const barWidth = ((dMax - dMin) / range) * 100;
      const rain = daily.precipitation_probability_max[i] || 0;
      dailyHtml += `
        <div class="bs-w-day">
          <div class="name">${d.name}<span class="sub">${d.sub}</span></div>
          <div class="ico">${w.icon}</div>
          <div class="bar"><div class="fill" style="left:${barStart}%;width:${barWidth}%"></div></div>
          <div class="temps">
            <span class="min">${Math.round(dMin)}°</span>
            <span class="max">${Math.round(dMax)}°</span>
            ${rain > 20 ? `<span class="rain">💧${rain}%</span>` : ''}
          </div>
        </div>`;
    }

    container.classList.add('bs-w-card');
    container.innerHTML = `
      <div class="bs-w-hero ${heroCls}">
        <div class="bs-w-loc">
          <div class="bs-w-city">📍 ${locName || 'Detecting...'}</div>
          <div class="bs-w-live"><span class="dot"></span> LIVE</div>
        </div>
        <div class="bs-w-current">
          <div class="bs-w-icon-lg">${info.icon}</div>
          <div class="bs-w-temp">
            <div class="bs-w-temp-big">${Math.round(cur.temperature_2m)}<sup>°C</sup></div>
            <div class="bs-w-cond">${info.text}</div>
            <div class="bs-w-feels">Feels like ${Math.round(cur.apparent_temperature)}°C</div>
          </div>
        </div>
        ${risk ? `<div class="bs-w-warn ${risk.level}">${risk.msg}</div>` : ''}
      </div>
      
      <div class="bs-w-stats">
        <div class="bs-w-stat">
          <span class="ico">💧</span>
          <div class="val">${cur.relative_humidity_2m}%</div>
          <div class="lbl">Humidity</div>
        </div>
        <div class="bs-w-stat">
          <span class="ico">🌬️</span>
          <div class="val">${Math.round(cur.wind_speed_10m)}</div>
          <div class="lbl">km/h Wind</div>
        </div>
        <div class="bs-w-stat">
          <span class="ico">🌧️</span>
          <div class="val">${(cur.precipitation || 0).toFixed(1)}</div>
          <div class="lbl">mm Rain</div>
        </div>
        <div class="bs-w-stat">
          <span class="ico">📊</span>
          <div class="val">${Math.round(cur.surface_pressure || 0)}</div>
          <div class="lbl">hPa</div>
        </div>
      </div>
      
      <div class="bs-w-tabs">
        <button class="bs-w-tab active" data-tab="hourly" type="button">⏰ Next 24 Hours</button>
        <button class="bs-w-tab" data-tab="daily" type="button">📅 7-Day Forecast</button>
      </div>
      
      <div class="bs-w-hourly-wrap">
        <div class="bs-w-hourly">${hourlyHtml}</div>
      </div>
      
      <div class="bs-w-daily">${dailyHtml}</div>
      
      <div class="bs-w-footer">
        <span>Source: <a href="https://open-meteo.com" target="_blank" rel="noopener">Open-Meteo</a></span>
        <button type="button" class="bs-w-refresh">🔄 Refresh</button>
      </div>
    `;

    // Tab switching
    const tabs = container.querySelectorAll('.bs-w-tab');
    const hourlyWrap = container.querySelector('.bs-w-hourly-wrap');
    const dailyWrap = container.querySelector('.bs-w-daily');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        if (tab.dataset.tab === 'hourly') {
          hourlyWrap.classList.remove('hide');
          dailyWrap.classList.remove('show');
        } else {
          hourlyWrap.classList.add('hide');
          dailyWrap.classList.add('show');
        }
      });
    });

    // Refresh
    container.querySelector('.bs-w-refresh').addEventListener('click', () => {
      initWidget(container, true);
    });
  }

  // ---- Init widget ----
  async function initWidget(container, forceRefresh) {
    // Show loading
    container.classList.add('bs-w-card');
    container.innerHTML = `
      <div class="bs-w-loading">
        <div class="spinner"></div>
        <div>Loading live weather...</div>
        <div style="font-size:.7rem;margin-top:4px;color:#64748b">Detecting your location</div>
      </div>
    `;

    // Get coords (from attributes OR GPS)
    let lat = parseFloat(container.getAttribute('data-lat'));
    let lon = parseFloat(container.getAttribute('data-lon'));
    let city = container.getAttribute('data-city') || null;

    if (!lat || !lon) {
      const loc = await getLocation();
      if (!loc) { renderNeedLocation(container); return; }
      lat = loc.lat;
      lon = loc.lon;
      city = loc.city || null;
    }

    if (!city) {
      city = await reverseGeocode(lat, lon);
    }

    const data = await fetchWeather(lat, lon);
    if (!data || !data.current) {
      container.innerHTML = `
        <div class="bs-w-loading">
          <div style="font-size:2rem;margin-bottom:8px">⚠️</div>
          <div>Weather data unavailable</div>
          <div style="font-size:.7rem;margin-top:4px;color:#64748b">Check your internet connection</div>
          <button type="button" onclick="this.parentElement.parentElement.__bsRetry()" style="margin-top:12px;padding:6px 14px;background:rgba(16,185,129,.15);border:1px solid #10b981;color:#10b981;border-radius:8px;cursor:pointer;font-family:inherit">🔄 Retry</button>
        </div>
      `;
      container.__bsRetry = () => initWidget(container, true);
      return;
    }

    render(container, data, city);
  }

  // ---- Auto-init ----
  function initAll() {
    document.querySelectorAll('#bsWeather, [data-bs-weather]').forEach(el => {
      if (!el.__bsWInit) {
        el.__bsWInit = true;
        initWidget(el);
        // Auto-refresh every 10 min
        setInterval(() => initWidget(el, true), 10 * 60 * 1000);
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAll);
  } else {
    initAll();
  }

  window.BhoomiWeather = { init: initAll };
  console.log('✅ [BhoomiSuraksha] Weather widget loaded');
})();