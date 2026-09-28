// Offline support.
// Each request tries the network first, but waits at most 2 seconds. If the network
// is slower (patchy gym signal) the saved copy opens instead, and the fresh version
// keeps downloading in the background so it's ready next time. With no signal at all
// the saved copy opens straight away. /api/ calls are never cached.
const C = 'liftlog-2.1';
const NETWORK_TIMEOUT_MS = 2000;
// After one slow response, skip the wait for the next 10 seconds so the rest of the
// page's files come straight from the saved copy (one 2s wait per load, not several).
let slowUntil = 0;
const FILES = ['/', '/index.html', '/css/app.css', '/js/config.js', '/js/store.js', '/js/lib.js', '/js/core.js', '/js/sync.js', '/js/views.js', '/js/app.js', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(C).then(c => c.addAll(FILES)));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== C).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;

  // Start the network request and save a good response for next time.
  const network = fetch(req).then(r => {
    if (r.ok) { const copy = r.clone(); caches.open(C).then(c => c.put(req, copy)); }
    return r;
  });
  const cached = () => caches.match(req, { ignoreSearch: true })
    .then(r => r || (req.mode === 'navigate' ? caches.match('/index.html') : undefined));

  e.respondWith(new Promise(resolve => {
    let done = false;
    const finish = r => { if (!done && r) { done = true; resolve(r); } };
    // Network too slow → use the saved copy (if there is one; otherwise keep waiting).
    const wait = Date.now() < slowUntil ? 0 : NETWORK_TIMEOUT_MS;
    const timer = setTimeout(() => { slowUntil = Date.now() + 10000; cached().then(finish); }, wait);
    network
      .then(r => { clearTimeout(timer); if (!done) slowUntil = 0; finish(r); })
      .catch(() => { clearTimeout(timer); cached().then(r => finish(r || Response.error())); });
  }));
  // Let the background download finish even after we've answered from the cache.
  e.waitUntil(network.then(() => {}, () => {}));
});
