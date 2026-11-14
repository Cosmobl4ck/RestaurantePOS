const CACHE_NAME = 'marrocos-pos-shell-v3';
const APP_SHELL = [
  '/login',
  '/manifest.webmanifest',
  '/css/petronas.css?v=petronas1',
  '/css/pwa-install.css',
  '/js/pwa-install.js',
  '/img/logo-500.svg',
  '/vendor/bootstrap/css/bootstrap.min.css',
  '/vendor/bootstrap/js/bootstrap.bundle.min.js',
  '/vendor/bootstrap-icons/font/bootstrap-icons.css',
  '/vendor/bootstrap-icons/font/fonts/bootstrap-icons.woff2',
  '/vendor/chart.js/chart.umd.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || event.request.mode === 'navigate') return;

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
