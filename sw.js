// Offline support: serve the app from cache when there's no signal on site.
// Bump VERSION whenever you deploy changes so devices pick up the new files,
// and use the same number in the ?v= links in index.html.
const VERSION = 6;
const CACHE = 'canopy-v' + VERSION;
const ASSETS = [
  './',
  'index.html',
  `styles.css?v=${VERSION}`,
  `app.js?v=${VERSION}`,
  `brand.js?v=${VERSION}`,
  'manifest.webmanifest',
  'brand/logo.svg',
  'brand/icon-192.png',
  'brand/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network first so updates show up right away; fall back to cache when offline or slow.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const timeout = new Promise((resolve) => setTimeout(resolve, 4000));
    try {
      const res = await Promise.race([fetch(req, { cache: 'no-cache' }), timeout]);
      if (res && res.ok) {
        cache.put(req, res.clone());
        return res;
      }
    } catch {
      // offline: fall through to cache
    }
    return (await cache.match(req)) ||
      (req.mode === 'navigate' && (await cache.match('index.html'))) ||
      Response.error();
  })());
});
