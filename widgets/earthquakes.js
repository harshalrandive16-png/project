/* ============================================================
   BhoomiSuraksha — Live Earthquakes Widget (USGS Feed)
   
   Usage in any page:
   <div id="bsEarthquakes"></div>
   <script src="widgets/earthquakes.js"></script>
   
   Or auto-init with attribute:
   <div id="bsEarthquakes" data-region="india" data-limit="10"></div>
   
   Data Source: USGS (free, no API key)
   Auto-refresh: 60 seconds
============================================================ */

(function () {
  'use strict';

  if (window.__BHOOMI_EQ_LOADED__) return;
  window.__BHOOMI_EQ_LOADED__ = true;

  // ---- Styles ----
  const style = document.createElement('style');
  style.textContent = `
    .bs-eq-card{
      background:linear-gradient(145deg,#0b0f1a,#060b11);
      border:1px solid rgba(255,255,255,.08);
      border-radius:16px;padding:20px;
      font-family:'Inter',system-ui,sans-serif;
      color:#e2e8f0;
      box-shadow:0 8px 24px rgba(0,0,0,.3);
    }
    .bs-eq-header{
      display:flex;align-items:center;justify-content:space-between;
      margin-bottom:16px;padding-bottom:12px;
      border-bottom:1px solid rgba(255,255,255,.08);
    }
    .bs-eq-title{
      display:flex;align-items:center;gap:10px;
      font-size:1.1rem;font-weight:700;color:#fff;
    }
    .bs-eq-title .icn{
      font-size:1.4rem;animation:bsShake 3s infinite;display:inline-block;
    }
    @keyframes bsShake{
      0%,90%,100%{transform:rotate(0)}
      92%{transform:rotate(-8deg)}
      94%{transform:rotate(8deg)}
      96%{transform:rotate(-4deg)}
      98%{transform:rotate(4deg)}
    }
    .bs-eq-live{
      display:flex;align-items:center;gap:6px;
      background:rgba(220,38,38,.15);
      border:1px solid rgba(220,38,38,.3);
      padding:4px 10px;border-radius:12px;
      font-size:.7rem;font-weight:700;color:#ef4444;
    }
    .bs-eq-live .dot{
      width:8px;height:8px;background:#ef4444;
      border-radius:50%;animation:bsBlink 1s infinite;
    }
    @keyframes bsBlink{0%,100%{opacity:1}50%{opacity:.3}}
    
    .bs-eq-list{
      display:flex;flex-direction:column;gap:10px;
      max-height:500px;overflow-y:auto;
      padding-right:6px;
    }
    .bs-eq-list::-webkit-scrollbar{width:5px}
    .bs-eq-list::-webkit-scrollbar-thumb{
      background:rgba(16,185,129,.3);border-radius:3px;
    }
    
    .bs-eq-item{
      display:flex;gap:12px;padding:12px;
      background:rgba(255,255,255,.03);
      border:1px solid rgba(255,255,255,.06);
      border-radius:12px;cursor:pointer;
      transition:all .25s;text-decoration:none;color:inherit;
    }
    .bs-eq-item:hover{
      background:rgba(16,185,129,.08);
      border-color:rgba(16,185,129,.3);
      transform:translateX(3px);
    }
    
    .bs-eq-mag{
      flex-shrink:0;width:54px;height:54px;border-radius:12px;
      display:flex;flex-direction:column;align-items:center;justify-content:center;
      font-weight:800;color:#fff;
    }
    .bs-eq-mag .num{font-size:1.3rem;line-height:1}
    .bs-eq-mag .label{font-size:.55rem;opacity:.85;margin-top:2px;font-weight:600}
    
    .bs-eq-mag.severe{background:linear-gradient(135deg,#dc2626,#991b1b);box-shadow:0 4px 12px rgba(220,38,38,.4)}
    .bs-eq-mag.high{background:linear-gradient(135deg,#f97316,#c2410c);box-shadow:0 4px 12px rgba(249,115,22,.4)}
    .bs-eq-mag.moderate{background:linear-gradient(135deg,#eab308,#a16207);box-shadow:0 4px 12px rgba(234,179,8,.4)}
    .bs-eq-mag.minor{background:linear-gradient(135deg,#10b981,#059669);box-shadow:0 4px 12px rgba(16,185,129,.4)}
    
    .bs-eq-info{flex:1;min-width:0}
    .bs-eq-place{
      font-size:.9rem;font-weight:600;color:#fff;
      margin-bottom:4px;
      white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
    }
    .bs-eq-meta{
      display:flex;flex-wrap:wrap;gap:10px;
      font-size:.75rem;color:#94a3b8;
    }
    .bs-eq-meta span{display:flex;align-items:center;gap:4px}
    .bs-eq-time{color:#10b981;font-weight:500}
    .bs-eq-depth{color:#94a3b8}
    
    .bs-eq-loading{
      text-align:center;padding:40px 20px;
      color:#64748b;font-size:.9rem;
    }
    .bs-eq-loading .spinner{
      width:32px;height:32px;margin:0 auto 12px;
      border:3px solid rgba(16,185,129,.15);
      border-top-color:#10b981;border-radius:50%;
      animation:bsSpin 1s linear infinite;
    }
    @keyframes bsSpin{to{transform:rotate(360deg)}}
    
    .bs-eq-empty{
      text-align:center;padding:40px 20px;
      color:#64748b;
    }
    .bs-eq-empty .emoji{font-size:3rem;margin-bottom:10px;display:block}
    
    .bs-eq-footer{
      margin-top:12px;padding-top:12px;
      border-top:1px solid rgba(255,255,255,.06);
      display:flex;justify-content:space-between;align-items:center;
      font-size:.7rem;color:#64748b;
    }
    .bs-eq-footer a{color:#10b981;text-decoration:none}
    .bs-eq-footer a:hover{text-decoration:underline}
    .bs-eq-refresh{
      background:rgba(16,185,129,.1);
      border:1px solid rgba(16,185,129,.25);
      color:#10b981;padding:4px 10px;border-radius:8px;
      cursor:pointer;font-size:.7rem;font-weight:600;
      font-family:inherit;transition:all .2s;
    }
    .bs-eq-refresh:hover{background:rgba(16,185,129,.2)}
    .bs-eq-refresh:disabled{opacity:.5;cursor:not-allowed}
  `;
  document.head.appendChild(style);

  // ---- Helpers ----
  function timeAgo(timestamp) {
    const diff = Date.now() - timestamp;
    const sec = Math.floor(diff / 1000);
    const min = Math.floor(sec / 60);
    const hr = Math.floor(min / 60);
    const day = Math.floor(hr / 24);
    if (sec < 60) return sec + 's ago';
    if (min < 60) return min + 'm ago';
    if (hr < 24) return hr + 'h ago';
    return day + 'd ago';
  }

  function magClass(mag) {
    if (mag >= 6) return 'severe';
    if (mag >= 5) return 'high';
    if (mag >= 4) return 'moderate';
    return 'minor';
  }

  function magLabel(mag) {
    if (mag >= 6) return 'SEVERE';
    if (mag >= 5) return 'HIGH';
    if (mag >= 4) return 'MOD';
    return 'MINOR';
  }

  // India + neighbors bounding box (approx)
  // North: 37° (Kashmir), South: 5° (Andaman), West: 65° (Pak), East: 100° (Myanmar)
  function isInRegion(lon, lat) {
    return lon >= 65 && lon <= 100 && lat >= 5 && lat <= 40;
  }

  // ---- Fetch USGS data ----
  async function fetchEarthquakes(limit = 10) {
    try {
      // USGS all_week (all magnitudes, past 7 days) — free, no key
      const url = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojson';
      const res = await fetch(url);
      if (!res.ok) throw new Error('USGS fetch failed: ' + res.status);
      const data = await res.json();
      
      const filtered = (data.features || [])
        .filter(f => {
          const coords = f.geometry?.coordinates || [];
          const lon = coords[0], lat = coords[1];
          return typeof lon === 'number' && typeof lat === 'number' && isInRegion(lon, lat);
        })
        .sort((a, b) => (b.properties?.time || 0) - (a.properties?.time || 0))
        .slice(0, limit);

      return filtered.map(f => {
        const p = f.properties || {};
        const c = f.geometry?.coordinates || [];
        return {
          mag: p.mag || 0,
          place: p.place || 'Unknown location',
          time: p.time || Date.now(),
          depth: c[2] || 0,
          lat: c[1] || 0,
          lon: c[0] || 0,
          url: p.url || '#'
        };
      });
    } catch (err) {
      console.error('❌ [Earthquakes] Fetch failed:', err.message);
      return null;
    }
  }

  // ---- Render ----
  function render(container, quakes) {
    if (!quakes || quakes.length === 0) {
      container.querySelector('.bs-eq-list').innerHTML = `
        <div class="bs-eq-empty">
          <span class="emoji">🌏</span>
          <div>No earthquakes M ≥ 2.5 reported in this region in the past 7 days</div>
          <div style="font-size:.75rem;margin-top:6px;color:#64748b">Source: USGS live feed</div>
        </div>`;
      return;
    }

    const html = quakes.map(q => {
      const cls = magClass(q.mag);
      const lbl = magLabel(q.mag);
      const mapUrl = `https://www.google.com/maps?q=${q.lat},${q.lon}`;
      return `
        <a href="${mapUrl}" target="_blank" rel="noopener" class="bs-eq-item" title="View on Google Maps">
          <div class="bs-eq-mag ${cls}">
            <div class="num">${q.mag.toFixed(1)}</div>
            <div class="label">${lbl}</div>
          </div>
          <div class="bs-eq-info">
            <div class="bs-eq-place">📍 ${q.place}</div>
            <div class="bs-eq-meta">
              <span class="bs-eq-time">🕐 ${timeAgo(q.time)}</span>
              <span class="bs-eq-depth">⬇ ${q.depth.toFixed(0)} km depth</span>
            </div>
          </div>
        </a>`;
    }).join('');

    container.querySelector('.bs-eq-list').innerHTML = html;
  }

  // ---- Build widget ----
  async function initWidget(container) {
    const limit = parseInt(container.getAttribute('data-limit') || '10', 10);

    container.classList.add('bs-eq-card');
    container.innerHTML = `
      <div class="bs-eq-header">
        <div class="bs-eq-title">
          <span class="icn">🌍</span>
          <span>Recent Earthquakes</span>
        </div>
        <div class="bs-eq-live">
          <span class="dot"></span>
          <span>LIVE</span>
        </div>
      </div>
      <div class="bs-eq-list">
        <div class="bs-eq-loading">
          <div class="spinner"></div>
          <div>Fetching live seismic data from USGS...</div>
        </div>
      </div>
      <div class="bs-eq-footer">
        <span>India + neighbors • Past 7 days • M ≥ 2.5</span>
        <button class="bs-eq-refresh" type="button">🔄 Refresh</button>
      </div>
      <div style="margin-top:6px;text-align:center;font-size:.65rem;color:#64748b">
        Source: <a href="https://earthquake.usgs.gov" target="_blank" rel="noopener">USGS.gov</a>
      </div>
    `;

    const refreshBtn = container.querySelector('.bs-eq-refresh');
    const load = async () => {
      refreshBtn.disabled = true;
      refreshBtn.textContent = '⏳ Loading...';
      const quakes = await fetchEarthquakes(limit);
      if (quakes === null) {
        // feed fail: fake data nahi dikhate
        container.querySelector('.bs-eq-list').innerHTML = `
          <div class="bs-eq-empty">
            <span class="emoji">📡</span>
            <div>Live USGS feed unavailable right now</div>
            <div style="font-size:.75rem;margin-top:6px;color:#64748b">Refresh karke dobara try karo</div>
          </div>`;
      } else {
        render(container, quakes);
      }
      refreshBtn.disabled = false;
      refreshBtn.textContent = '🔄 Refresh';
    };

    refreshBtn.addEventListener('click', load);
    await load();

    // Auto-refresh every 60 sec
    setInterval(load, 60000);
  }

  // ---- Auto-init on all matching containers ----
  function initAll() {
    document.querySelectorAll('#bsEarthquakes, [data-bs-earthquakes]').forEach(el => {
      if (!el.__bsEqInit) {
        el.__bsEqInit = true;
        initWidget(el);
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAll);
  } else {
    initAll();
  }

  // Expose global for manual init
  window.BhoomiEarthquakes = { init: initAll };

  console.log('✅ [BhoomiSuraksha] Earthquakes widget loaded');
})();