const CACHE_NAME = 'store-pwa-v1';

self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(clients.claim());
});

self.addEventListener('fetch', (e) => {
  // تمرير الطلبات للشبكة مباشرة لضمان حداثة بيانات المتجر
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});