const CACHE_NAME = 'schede-v17-clean-editor';
const APP_FILES = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './calendar-home.js',
  './manifest.json',
  './icon-192.svg',
  './icon-512.svg',
  './workout-editor/index.html',
  './workout-editor/styles.css',
  './workout-editor/app.js',
  './workout-editor/workout-parser.js',
  './workout-editor/workout-validation.js',
  './workout-editor/ocr-confidence.js',
  './workout-editor/training-methods-library.js',
  './workout-editor/workout.schema.json',
  './workout-editor/workout-template.json',
  './workout-editor/vendor/pdfjs/pdf.mjs',
  './workout-editor/vendor/pdfjs/pdf.worker.min.mjs',
  './workout-editor/vendor/tesseract/tesseract.min.js',
  './workout-editor/vendor/tesseract/worker.min.js',
  './workout-editor/vendor/tesseract/tesseract-core-lstm.wasm.js',
  './workout-editor/vendor/tesseract/lang/ita.traineddata',
  './workout-editor/vendor/tesseract/lang/eng.traineddata'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_FILES))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(cacheNames
        .filter(cacheName => cacheName !== CACHE_NAME)
        .map(cacheName => caches.delete(cacheName)));
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  if (event.request.mode === 'navigate') {
    const fallbackPath = requestUrl.pathname.endsWith('/workout-editor/index.html')
      ? './workout-editor/index.html'
      : './index.html';
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(fallbackPath, copy));
          }
          return response;
        })
        .catch(() => caches.match(fallbackPath))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        }
        return response;
      });
    })
  );
});

// Gestione click sulla notifica per riaprire o portare in primo piano l'app
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow('./');
    })
  );
});
