// Offline support: the app shell is cached, and the song list, songs, themes and set lists
// are fetched fresh when online but served from the last saved copy when offline.
const CACHE = 'nrsc-worship-v1';
const SHELL = ['/', '/index.html', '/song.html', '/sets.html', '/set.html', '/app.css?v=1', '/ui.js?v=1', '/shared.js?v=1', '/icon.svg', '/manifest.webmanifest'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/admin') || url.pathname.startsWith('/api/health') || url.pathname === '/admin.html') return;
  if (url.searchParams.has('fresh')) return;
  if (url.pathname.startsWith('/api/')) e.respondWith(networkFirst(req));
  else e.respondWith(staleWhileRevalidate(req));
});

// Public data: try the network (with a time limit for very slow connections), else the saved copy.
async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await Promise.race([fetch(req), new Promise((_, no) => setTimeout(() => no(new Error('slow')), 8000))]);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    const saved = await cache.match(req);
    if (!saved) throw err;
    const headers = new Headers(saved.headers);
    headers.set('x-sw-cache', '1'); // the page shows "offline — saved copy"
    return new Response(await saved.blob(), { status: saved.status, headers });
  }
}

// Pages and files: answer from the cache at once and refresh it in the background.
async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE);
  const saved = await cache.match(req, { ignoreSearch: req.mode === 'navigate' });
  const update = fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => null);
  return saved || (await update) || new Response('Offline', { status: 503, headers: { 'content-type': 'text/plain' } });
}
