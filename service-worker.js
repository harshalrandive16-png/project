/* ═══════════════════════════════════════════════════════════
   BHOOMISURAKSHA — PWA SERVICE WORKER
   Offline cache + background sync + fast-load
   ═══════════════════════════════════════════════════════════ */

const CACHE_VERSION = 'bhoomi-v1.0.0';
const RUNTIME_CACHE = 'bhoomi-runtime';
const OFFLINE_URL   = './offline.html';

/* ── Core files that MUST be cached on install ── */
const CORE_ASSETS = [
  './',
  './index.html',
  './dashboard.html',
  './alerts.html',
  './report.html',
  './safe-route.html',
  './emergency-resources.html',
  './dos-donts.html',
  './about.html',
  './privacy.html',
  './auth.html',
  './offline.html',

  './style.css',
  './dashboard.css',
  './report.css',

  './dashboard.js',
  './report.js',
  './india-feeds.js',
  './config.js',
  './chatbot.js',
  './pwa-register.js',

  './manifest.json',

  './icons/icon-192.png',
  './icons/icon-512.png',

  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
];

/* ── Install: Precache core assets ─────────────── */
self.addEventListener('install', event => {
  console.log('[SW] Installing...');
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => {
        console.log('[SW] Caching core assets');
        // Cache files individually so one failure doesn't break all
        return Promise.allSettled(
          CORE_ASSETS.map(url =>
            cache.add(url).catch(err => console.warn('[SW] Skip:', url, err.message))
          )
        );
      })
      .then(() => self.skipWaiting())
  );
});

/* ── Activate: Clean old caches ────────────────── */
self.addEventListener('activate', event => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_VERSION && k !== RUNTIME_CACHE)
            .map(k => { console.log('[SW] Delete old:', k); return caches.delete(k); })
      )
    ).then(() => self.clients.claim())
  );
});

/* ── Fetch: Smart caching strategy ─────────────── */
self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  // Only handle GET
  if (req.method !== 'GET') return;

  // Skip chrome-extension, data URIs
  if (!url.protocol.startsWith('http')) return;

  // ─── STRATEGY 1: Live API calls → Network-first (fresh data) ───
  const isLiveAPI =
    url.hostname.includes('earthquake.usgs.gov') ||
    url.hostname.includes('api.reliefweb.int') ||
    url.hostname.includes('api.open-meteo.com') ||
    url.hostname.includes('nominatim.openstreetmap.org') ||
    url.hostname.includes('router.project-osrm.org');

  if (isLiveAPI) {
    event.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(RUNTIME_CACHE).then(c => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // ─── STRATEGY 2: Map tiles → Cache-first (save data) ───
  if (url.hostname.includes('tile.openstreetmap.org')) {
    event.respondWith(
      caches.match(req).then(cached => {
        if (cached) return cached;
        return fetch(req).then(res => {
          const copy = res.clone();
          caches.open(RUNTIME_CACHE).then(c => c.put(req, copy));
          return res;
        }).catch(() => cached);
      })
    );
    return;
  }

  // ─── STRATEGY 3: HTML pages → Network-first with offline fallback ───
  if (req.mode === 'navigate' || req.destination === 'document') {
    event.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(RUNTIME_CACHE).then(c => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then(c => c || caches.match(OFFLINE_URL)))
    );
    return;
  }

  // ─── STRATEGY 4: Static assets (CSS/JS/images) → Cache-first ───
  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then(res => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(RUNTIME_CACHE).then(c => c.put(req, copy));
        }
        return res;
      }).catch(() => {
        if (req.destination === 'image') {
          return caches.match('./icons/icon-192.png');
        }
      });
    })
  );
});

/* ── Push notifications (for future NDMA alerts) ─ */
self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : {
    title: 'BhoomiSuraksha Alert',
    body: 'New disaster alert in your area',
    url: './alerts.html'
  };

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: './icons/icon-192.png',
      badge: './icons/icon-96.png',
      vibrate: [200, 100, 200],
      tag: 'bhoomi-alert',
      data: { url: data.url || './alerts.html' },
      requireInteraction: true,
      actions: [
        { action: 'view',    title: 'View Alert' },
        { action: 'dismiss', title: 'Dismiss'    }
      ]
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'dismiss') return;
  const url = event.notification.data?.url || './alerts.html';
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(list => {
      for (const c of list) {
        if (c.url.includes(url) && 'focus' in c) return c.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});

/* ── Background sync (future: queue failed reports) ─ */
self.addEventListener('sync', event => {
  if (event.tag === 'sync-reports') {
    console.log('[SW] Syncing offline reports...');
    // Future: Send queued reports when back online
  }
});

/* ── Message handler (for skipWaiting from UI) ─── */
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});