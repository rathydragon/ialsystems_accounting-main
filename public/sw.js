// Service Worker for IAL Accounting & Logistics PWA (Version 5 - Network First for App Shell)
const CACHE_NAME = 'ial-accounting-v5';

// Precache only immutable static icons and manifest (NEVER index.html to avoid stale app shell)
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
        keys.filter((k) => k !== CACHE_NAME).map((k) => {
          console.log('[SW] Purging old cache:', k);
          return caches.delete(k);
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 3. Fetch: Network-First for Navigation (HTML), Stale-While-Revalidate for Assets
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Skip non-GET or browser extension requests
  if (req.method !== 'GET' || url.protocol.startsWith('chrome-extension')) {
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
                req.destination === 'document' || 
                (req.headers.get('accept') && req.headers.get('accept').includes('text/html'));

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

  // B. Localhost dev mode: pass through directly to avoid caching Vite HMR modules
  if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
    event.respondWith(fetch(req));
    return;
  }

  // C. Static hashed assets (dist/assets/*): Cache-first with network fallback
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && url.origin === location.origin) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(req, responseClone);
          });
        }
        return networkResponse;
      });
    })
  );
});
