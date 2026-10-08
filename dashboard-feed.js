/* ============================================================
   BHOOMISURAKSHA - DASHBOARD FEED
   File: dashboard-feed.js

   Purpose:
   - Dashboard live-data synchronization
   - Status indicator
   - Refresh handling
   - Works with the actual dashboard.html IDs
   - Uses /api/dashboard/live
   - Avoids duplicate map rendering because dashboard.js
     already owns the main dashboard map
   ============================================================ */

(() => {
  'use strict';


  /* ==========================================================
     CONFIG
     ========================================================== */

  const API_BASE =
    window.BHOOMI_API ||
    (
      ['localhost', '127.0.0.1', '0.0.0.0']
        .includes(window.location.hostname)
        ? 'http://localhost:5000'
        : window.location.origin
    );


  const ENDPOINT =
    `${API_BASE}/api/dashboard/live`;


  /* ==========================================================
     ACTUAL DASHBOARD ELEMENT IDs
     ========================================================== */

  const IDS = {
    ranking: 'rankingFeed',
    alerts: 'liveAlertsFeed',
    highway: 'highwayFeed',

    /*
      These elements may not exist in every version
      of dashboard.html, so they are optional.
    */

    badge: 'liveBadge',
    updated: 'updatedText',
    refresh: 'btnRefresh'
  };


  /* ==========================================================
     DOM HELPER
     ========================================================== */

  function $(id) {
    return document.getElementById(id);
  }


  /* ==========================================================
     HTML ESCAPE
     ========================================================== */

  function esc(value) {

    return String(value ?? '').replace(
      /[&<>"']/g,
      (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }[char])
    );

  }


  /* ==========================================================
     TIME HELPERS
     ========================================================== */

  function getTimestamp(value) {

    if (value === null || value === undefined) {
      return Date.now();
    }


    if (typeof value === 'number') {
      return value;
    }


    const parsed =
      new Date(value).getTime();


    return Number.isFinite(parsed)
      ? parsed
      : Date.now();

  }


  function timeAgo(value) {

    const timestamp =
      getTimestamp(value);


    const seconds =
      Math.max(
        0,
        Math.floor(
          (Date.now() - timestamp) / 1000
        )
      );


    if (seconds < 60) {
      return 'just now';
    }


    const minutes =
      Math.floor(seconds / 60);


    if (minutes < 60) {
      return `${minutes} min ago`;
    }


    const hours =
      Math.floor(minutes / 60);


    if (hours < 24) {
      return `${hours} hr ago`;
    }


    const days =
      Math.floor(hours / 24);


    return `${days} day${days > 1 ? 's' : ''} ago`;

  }


  function formatDate(value) {

    const timestamp =
      getTimestamp(value);


    const date =
      new Date(timestamp);


    if (Number.isNaN(date.getTime())) {
      return 'Unknown';
    }


    return date.toLocaleString(
      'en-IN',
      {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
      }
    );

  }


  /* ==========================================================
     STATE
     ========================================================== */

  let loading = false;

  let hasData = false;

  let lastUpdated =
    Date.now();

  let lastSource =
    'live';


  /* ==========================================================
     STATUS
     ========================================================== */

  function setStatus(
    state,
    timestamp = lastUpdated
  ) {

    const badge =
      $(IDS.badge);


    const updated =
      $(IDS.updated);


    /*
      Optional status badge.
      Dashboard continues working even when
      these elements are not present.
    */

    if (badge) {

      badge.classList.remove(
        'is-live',
        'is-demo',
        'is-offline',
        'is-loading'
      );


      const statusMap = {

        live: {
          className: 'is-live',
          text: 'LIVE'
        },

        demo: {
          className: 'is-demo',
          text: 'DEMO DATA'
        },

        offline: {
          className: 'is-offline',
          text: 'OFFLINE'
        },

        loading: {
          className: 'is-loading',
          text: 'LOADING'
        }

      };


      const current =
        statusMap[state] ||
        statusMap.offline;


      badge.classList.add(
        current.className
      );


      badge.textContent =
        current.text;

    }


    if (updated) {

      if (state === 'loading') {

        updated.textContent =
          'Fetching live data…';

      } else if (state === 'offline') {

        updated.textContent =
          hasData
            ? `Connection lost • Last data ${timeAgo(timestamp)}`
            : 'Data unavailable';

      } else if (state === 'demo') {

        updated.textContent =
          `Demo data • ${timeAgo(timestamp)}`;

      } else {

        updated.textContent =
          `Updated ${timeAgo(timestamp)}`;

      }

    }

  }


  /* ==========================================================
     NORMALIZE BACKEND RESPONSE
     ========================================================== */

  function normalizeData(payload) {

    if (
      !payload ||
      typeof payload !== 'object'
    ) {

      return {
        zones: [],
        alerts: [],
        highways: [],
        hazards: []
      };

    }


    return {

      zones:
        Array.isArray(payload.zones)
          ? payload.zones
          : (
            Array.isArray(payload.ranking)
              ? payload.ranking
              : []
          ),


      alerts:
        Array.isArray(payload.alerts)
          ? payload.alerts
          : [],


      highways:
        Array.isArray(payload.highways)
          ? payload.highways
          : (
            Array.isArray(payload.roads)
              ? payload.roads
              : []
          ),


      hazards:
        Array.isArray(payload.hazards)
          ? payload.hazards
          : []

    };

  }


  /* ==========================================================
     RANKING
     ========================================================== */

  function renderRanking(zones) {

    const element =
      $(IDS.ranking);


    if (!element) {
      return;
    }


    if (!zones.length) {

      element.innerHTML = `
        <p class="loading-msg">
          No active risk zones found.
        </p>
      `;

      return;

    }


    element.innerHTML =
      zones
        .slice(0, 10)
        .map((zone, index) => {

          const score =
            Number(
              zone.score ??
              zone.severity ??
              0
            );


          const level =
            String(
              zone.level ||
              (
                score >= 80
                  ? 'SEVERE'
                  : score >= 60
                    ? 'HIGH'
                    : score >= 30
                      ? 'MODERATE'
                      : 'LOW'
              )
            ).toUpperCase();


          const hazard =
            zone.hazard ||
            zone.type ||
            'Multi-hazard';


          const name =
            zone.name ||
            zone.state ||
            'Unknown Zone';


          return `
            <div
              class="feed-item ${esc(level.toLowerCase())}"
            >

              <div
                style="
                  display:flex;
                  justify-content:space-between;
                  gap:12px;
                  align-items:center;
                "
              >

                <div>

                  <div class="feed-title">
                    ${index + 1}.
                    ${esc(name)}
                  </div>

                  <div class="feed-desc">
                    ${esc(hazard)}
                  </div>

                  <span class="status-badge">
                    ${esc(level)}
                  </span>

                  <div
                    class="feed-time"
                    style="margin-top:5px"
                  >
                    ${esc(
                      timeAgo(
                        zone.ts ||
                        zone.updatedAt ||
                        Date.now()
                      )
                    )}
                  </div>

                </div>


                <div
                  class="rank-score"
                  title="Risk Score"
                >
                  ${esc(score)}
                </div>

              </div>

            </div>
          `;

        })
        .join('');

  }


  /* ==========================================================
     ALERTS
     ========================================================== */

  function renderAlerts(alerts) {

    const element =
      $(IDS.alerts);


    if (!element) {
      return;
    }


    if (!alerts.length) {

      element.innerHTML = `
        <p class="loading-msg">
          No recent alerts.
        </p>
      `;

      return;

    }


    element.innerHTML =
      alerts
        .slice(0, 20)
        .map((alert) => {

          const level =
            String(
              alert.level ||
              alert.severity ||
              'moderate'
            ).toLowerCase();


          const title =
            alert.title ||
            alert.message ||
            'Disaster Alert';


          const hazard =
            alert.hazard ||
            alert.type ||
            'general';


          const timestamp =
            alert.ts ||
            alert.time ||
            alert.createdAt ||
            Date.now();


          const source =
            alert.source ||
            'BhoomiSuraksha';


          const url =
            alert.url;


          const titleHTML =
            url
              ? `
                <a
                  href="${esc(url)}"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="feed-link"
                >
                  ${esc(title)}
                </a>
              `
              : esc(title);


          return `
            <div
              class="feed-item ${esc(level)}"
            >

              <div class="feed-title">
                ${titleHTML}
              </div>

              <div class="feed-desc">
                ${esc(
                  String(hazard)
                    .toUpperCase()
                )}
              </div>

              <div class="feed-meta">

                <span class="feed-time">
                  ${esc(timeAgo(timestamp))}
                  ·
                  ${esc(formatDate(timestamp))}
                </span>

                <span class="feed-source">
                  ${esc(source)}
                </span>

              </div>

            </div>
          `;

        })
        .join('');

  }


  /* ==========================================================
     HIGHWAYS
     ========================================================== */

  function renderHighways(highways) {

    const element =
      $(IDS.highway);


    if (!element) {
      return;
    }


    if (!highways.length) {

      element.innerHTML = `
        <p class="loading-msg">
          No highway status available.
        </p>
      `;

      return;

    }


    element.innerHTML =
      highways
        .slice(0, 15)
        .map((highway) => {

          const status =
            String(
              highway.status ||
              'CAUTION'
            ).toUpperCase();


          const name =
            highway.name ||
            highway.code ||
            highway.title ||
            'Highway';


          const reason =
            highway.reason ||
            highway.description ||
            '';


          const timestamp =
            highway.ts ||
            highway.updatedAt ||
            highway.time ||
            Date.now();


          const statusClass =
            status
              .toLowerCase()
              .replace(
                /[^a-z0-9_-]/g,
                ''
              );


          return `
            <div
              class="feed-item"
            >

              <div
                style="
                  display:flex;
                  justify-content:space-between;
                  gap:10px;
                  align-items:center;
                "
              >

                <div>

                  <div class="feed-title">
                    ${esc(name)}
                  </div>

                  ${
                    reason
                      ? `
                        <div class="feed-desc">
                          ${esc(reason)}
                        </div>
                      `
                      : ''
                  }

                  <div class="feed-time">
                    ${esc(timeAgo(timestamp))}
                  </div>

                </div>


                <span
                  class="status-badge ${esc(statusClass)}"
                >
                  ${esc(status)}
                </span>

              </div>

            </div>
          `;

        })
        .join('');

  }


  /* ==========================================================
     RENDER ALL
     ========================================================== */

  function render(data) {

    renderRanking(
      data.zones
    );


    renderAlerts(
      data.alerts
    );


    renderHighways(
      data.highways
    );

  }


  /* ==========================================================
     LOADING STATE
     ========================================================== */

  function showLoading() {

    if ($(IDS.ranking)) {

      $(IDS.ranking).innerHTML = `
        <p class="loading-msg">
          Loading live risk data...
        </p>
      `;

    }


    if ($(IDS.alerts)) {

      $(IDS.alerts).innerHTML = `
        <p class="loading-msg">
          Loading live alerts...
        </p>
      `;

    }


    if ($(IDS.highway)) {

      $(IDS.highway).innerHTML = `
        <p class="loading-msg">
          Loading highway status...
        </p>
      `;

    }

  }


  /* ==========================================================
     ERROR STATE
     ========================================================== */

  function showError() {

    const message = `
      <p class="loading-msg">
        ⚠ Unable to load live dashboard data.
        Please check the Node.js server.
      </p>
    `;


    if ($(IDS.ranking)) {
      $(IDS.ranking).innerHTML = message;
    }


    if ($(IDS.alerts)) {
      $(IDS.alerts).innerHTML = message;
    }


    if ($(IDS.highway)) {
      $(IDS.highway).innerHTML = message;
    }

  }


  /* ==========================================================
     LOAD LIVE DASHBOARD
     ========================================================== */

  async function load(options = {}) {

    const silent =
      options.silent === true;


    if (loading) {
      return false;
    }


    loading = true;


    if (!silent || !hasData) {

      setStatus(
        'loading'
      );


      if (!hasData) {
        showLoading();
      }

    }


    const controller =
      new AbortController();


    const timeout =
      setTimeout(
        () => controller.abort(),
        10000
      );


    try {

      console.log(
        '📡 Loading dashboard:',
        ENDPOINT
      );


      const response =
        await fetch(
          ENDPOINT,
          {
            method: 'GET',

            headers: {
              'Accept':
                'application/json'
            },

            cache:
              'no-store',

            signal:
              controller.signal
          }
        );


      if (!response.ok) {

        throw new Error(
          `HTTP ${response.status} ${response.statusText}`
        );

      }


      const payload =
        await response.json();


      if (
        !payload ||
        payload.ok === false
      ) {

        throw new Error(
          payload?.error ||
          'Invalid dashboard response'
        );

      }


      const data =
        normalizeData(
          payload
        );


      render(data);


      lastUpdated =
        getTimestamp(
          payload.updatedAt
        );


      lastSource =
        payload.source ||
        'live';


      hasData = true;


      setStatus(
        lastSource === 'live'
          ? 'live'
          : 'demo',
        lastUpdated
      );


      console.log(
        '✅ Dashboard feed updated',
        {
          zones:
            data.zones.length,

          alerts:
            data.alerts.length,

          highways:
            data.highways.length
        }
      );


      return true;

    } catch (error) {

      console.error(
        '❌ Dashboard feed error:',
        error
      );


      if (!hasData) {
        showError();
      }


      setStatus(
        'offline',
        lastUpdated
      );


      return false;

    } finally {

      clearTimeout(
        timeout
      );


      loading = false;

    }

  }


  /* ==========================================================
     REFRESH BUTTON
     ========================================================== */

  function setupRefresh() {

    const button =
      $(IDS.refresh);


    if (!button) {
      return;
    }


    button.addEventListener(
      'click',
      async () => {

        button.disabled =
          true;


        const originalText =
          button.innerHTML;


        button.innerHTML =
          '↻ Refreshing...';


        try {

          await load();

        } finally {

          button.disabled =
            false;

          button.innerHTML =
            originalText;

        }

      }
    );

  }


  /* ==========================================================
     UPDATE TIMESTAMP
     ========================================================== */

  function startTimestampUpdater() {

    setInterval(
      () => {

        if (!hasData) {
          return;
        }


        setStatus(
          lastSource === 'live'
            ? 'live'
            : 'demo',
          lastUpdated
        );

      },
      15000
    );

  }


  /* ==========================================================
     AUTO REFRESH
     ========================================================== */

  function startAutoRefresh() {

    setInterval(
      () => {

        load({
          silent: true
        });

      },
      60000
    );

  }


  /* ==========================================================
     PUBLIC API
     ========================================================== */

  window.dashboardFeed = {

    reload: load,

    refresh: () =>
      load(),

    getStatus: () => ({
      hasData,
      lastUpdated,
      lastSource,
      endpoint: ENDPOINT
    })

  };


  /* ==========================================================
     INITIALIZE
     ========================================================== */

  function init() {

    console.log(
      '🏔️ BhoomiSuraksha Dashboard Feed initializing...'
    );


    setupRefresh();

    startTimestampUpdater();

    startAutoRefresh();

    load();


    console.log(
      '✅ Dashboard Feed initialized'
    );

  }


  if (
    document.readyState ===
    'loading'
  ) {

    document.addEventListener(
      'DOMContentLoaded',
      init,
      {
        once: true
      }
    );

  } else {

    init();

  }

})();