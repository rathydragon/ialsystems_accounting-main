// Service Worker for IAL Accounting & Logistics PWA (Version 10 - Live API & Clean Module Loading)
const CACHE_NAME = 'ial-accounting-v10';

// Precache only immutable static icons and manifest (NEVER index.html or API endpoints)
const PRECACHE_ASSETS = [
  '/favicon.svg',
  '/favicon.ico',
  '/manifest.webmanifest',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
  '/apple-touch-icon.png'
];

// 1. Install: Precache critical icons & skip waiting immediately
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn('PWA Pre-cache notice:', err);
      });
    })
  );
});

// 2. Activate: Purge ALL previous caches immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((k) => {
          if (k !== CACHE_NAME) {
            console.log('[SW] Purging old cache:', k);
            return caches.delete(k);
          }
          // In the current cache, ensure no /api/ responses are lingering
          return caches.open(k).then((cache) => {
            return cache.keys().then((requests) => {
              return Promise.all(
                requests
                  .filter((req) => req.url.includes('/api/'))
                  .map((req) => cache.delete(req))
              );
            });
          });
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 3. Fetch: Network-First for Navigation (HTML), Cache-First for static assets
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Skip non-GET or browser extension requests
  if (req.method !== 'GET' || url.protocol.startsWith('chrome-extension')) {
    return;
  }

  // CRITICAL: NEVER intercept localhost / 127.0.0.1 dev server traffic
  if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
    return;
  }

  // CRITICAL: NEVER intercept any /api/ requests! All APIs must be network-only and never cached
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // CRITICAL: NEVER intercept third-party / cross-origin requests (Google Sheets, Telegram, Hostinger, CORS proxies, etc.)
  if (url.origin !== location.origin) {
    return;
  }

  // Network-only / Network-first for Google Apps Script, Telegram, & dynamic APIs
  if (url.hostname.includes('script.google.com') || url.hostname.includes('telegram.org')) {
    event.respondWith(
      fetch(req).catch(() => caches.match(req))
    );
    return;
  }

  // A. Navigation / HTML requests: ALWAYS NETWORK-FIRST so user immediately sees latest code & design updates
  const isNav = req.mode === 'navigate' || 
                req.destination === 'document';

  if (isNav) {
    event.respondWith(
      fetch(req)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, responseClone));
          }
          return networkResponse;
        })
        .catch(() => {
          return caches.match(req).then((cached) => cached || caches.match('/index.html'));
        })
    );
    return;
  }

  // B. Static hashed assets (dist/assets/*) and precache icons: Cache-first with network fallback
  const isStaticAsset = url.pathname.startsWith('/assets/') || PRECACHE_ASSETS.includes(url.pathname);
  if (!isStaticAsset) {
    return; // Pass through to network natively
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && url.origin === location.origin) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(req, responseClone);
            });
          }
          return networkResponse;
        })
        .catch(() => cached || new Response('', { status: 404 }));
    })
  );
});
