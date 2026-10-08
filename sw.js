/* ============================================================
   BhoomiSuraksha — Service Worker
   PWA offline shell + push notifications
============================================================ */

const CACHE_VERSION = 'bhoomi-v1.0.0';
const SHELL_CACHE = `shell-${CACHE_VERSION}`;
const RUNTIME_CACHE = `runtime-${CACHE_VERSION}`;

// App shell — critical pages/assets for offline open
const APP_SHELL = [
  './',
  './index.html',
  './dashboard.html',
  './alerts.html',
  './report.html',
  './emergency-resources.html',
  './dos-donts.html',
  './safe-route.html',
  './family-tracker.html',
  './rss-feed.html',
  './about.html',
  './style.css',
  './config.js',
  './chatbot.js',
  './manifest.json',
  './icons/icon-192.svg',
  './icons/icon-512.svg',
  './icons/icon-maskable.svg'
];

self.addEventListener('install', (event) => {
  console.log('[SW] Installing', CACHE_VERSION);
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(APP_SHELL.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
      .catch((err) => {
        console.warn('[SW] Shell cache partial fail:', err.message);
        return self.skipWaiting();
      })
  );
});

self.addEventListener('activate', (event) => {
  console.log('[SW] Activated', CACHE_VERSION);
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== SHELL_CACHE && key !== RUNTIME_CACHE) {
            console.log('[SW] Deleting old cache', key);
            return caches.delete(key);
          }
        })
      )
    ).then(() => self.clients.claim())
  );
});

function isAPIRequest(url) {
  return url.pathname.includes('/api/');
}

function isStaticAsset(url) {
  return /\.(css|js|svg|png|jpg|jpeg|webp|woff2?|ttf|map|json)$/i.test(url.pathname);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Don't hijack non-same-origin heavily (CDN etc.) except opaque fallback
  // API: network-first, no hard cache (fresh alerts/AI)
  if (isAPIRequest(url)) {
    event.respondWith(
      fetch(req)
        .then((res) => res)
        .catch(() =>
          new Response(
            JSON.stringify({
              success: false,
              offline: true,
              message: 'You are offline. Demo/fallback mode active.'
            }),
            { headers: { 'Content-Type': 'application/json' } }
          )
        )
    );
    return;
  }

  // HTML navigations: network-first, fallback to cache, then offline page shell
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(RUNTIME_CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(async () => {
          const cached = await caches.match(req);
          if (cached) return cached;
          const shell = await caches.match('./index.html');
          return (
            shell ||
            new Response(
              `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline — BhoomiSuraksha</title><style>body{margin:0;font-family:Inter,system-ui,sans-serif;background:#050810;color:#e2e8f0;display:flex;min-height:100vh;align-items:center;justify-content:center;text-align:center;padding:24px} .c{max-width:420px} h1{color:#10b981} a{color:#34d399}</style></head><body><div class="c"><h1>📡 You are offline</h1><p>BhoomiSuraksha offline shell active. Internet aate hi live alerts sync ho jayenge.</p><p><a href="./index.html">Retry Home</a> · <a href="tel:112">Call 112</a></p></div></body></html>`,
              { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
            )
          );
        })
    );
    return;
  }

  // Static assets: cache-first
  if (isStaticAsset(url) || url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const networked = fetch(req)
          .then((res) => {
            if (res && res.status === 200) {
              const copy = res.clone();
              caches.open(RUNTIME_CACHE).then((c) => c.put(req, copy));
            }
            return res;
          })
          .catch(() => cached);
        return cached || networked;
      })
    );
  }
});

/* ---- Push Notifications (existing feature compatible) ---- */
self.addEventListener('push', function (event) {
  let data = {
    title: '🚨 BhoomiSuraksha Alert',
    body: 'Emergency alert in your area. Open app for details.',
    url: './alerts.html'
  };

  if (event.data) {
    try {
      data = { ...data, ...event.data.json() };
    } catch (e) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: './icons/icon-192.svg',
    badge: './icons/icon-192.svg',
    vibrate: [300, 100, 300, 100, 300],
    requireInteraction: true,
    data: { url: data.url || './alerts.html' }
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || './alerts.html';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(self.registration.scope) && 'focus' in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(target);
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});