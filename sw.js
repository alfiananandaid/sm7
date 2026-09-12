const CACHE_NAME = 'so-mandiri-v1';
const urlsToCache = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './js/db.js',
  '[https://unpkg.com/html5-qrcode](https://unpkg.com/html5-qrcode)',
  '[https://cdn.jsdelivr.net/npm/dexie@3.2.3/dist/dexie.js](https://cdn.jsdelivr.net/npm/dexie@3.2.3/dist/dexie.js)'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method === 'POST') return; // Jangan cache API calls
  event.respondWith(
    caches.match(event.request).then(response => response || fetch(event.request))
  );
});
