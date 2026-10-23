const CACHE_NAME = 'schede-v42-network-first';
const CORE_APP_FILES = [
  './',
  './index.html',
  './style.css',
  './intro.css',
  './intro.js',
  './fonts/syne-latin.woff2',
  './fonts/syne-greek.woff2',
  './fonts/gfsdidot-greek.woff2',
  './fonts/cinzel-700-latin.woff2',
  './script.js',
  './calendar-home.js',
  './manifest.json',
  './icon-192.svg',
  './icon-512.svg',
  './workout-editor/index.html',
  './workout-editor/styles.css',
  './workout-editor/app.js',
  './workout-editor/ocr-preprocessor.js',
  './workout-editor/calisthenics-lexicon.js',
  './workout-editor/vision-ai-adapter.js',
  './workout-editor/workout-storage.js',
  './workout-editor/workout-parser.js',
  './workout-editor/workout-validation.js',
  './workout-editor/ocr-confidence.js',
  './workout-editor/training-methods-library.js',
  './workout-editor/workout.schema.json',
  './workout-editor/workout-template.json'
];

const OPTIONAL_VENDOR_FILES = [
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
      .then(async cache => {
        await Promise.allSettled(CORE_APP_FILES.map(url => cache.add(new Request(url, { cache: 'reload' })).catch(() => {})));
        await Promise.allSettled(OPTIONAL_VENDOR_FILES.map(url => cache.add(url)));
      })
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

  const isNavigate = event.request.mode === 'navigate';
  const cacheKey = isNavigate
    ? (requestUrl.pathname.endsWith('/workout-editor/index.html') ? './workout-editor/index.html' : './index.html')
    : event.request;

  // Network-first: con connessione prende SEMPRE la versione aggiornata (bypassando la cache HTTP di GitHub Pages),
  // senza connessione (palestra offline) usa la copia in cache.
  event.respondWith(
    fetch(requestUrl.href, { cache: 'no-cache', credentials: 'same-origin' })
      .then(response => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(cacheKey, copy));
        }
        return response;
      })
      .catch(() => caches.match(cacheKey, { ignoreSearch: true }))
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
