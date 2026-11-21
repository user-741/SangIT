/* SangIT service worker: keeps the app shell, fonts and cover art available offline.
   Songs themselves are stored by the page in IndexedDB (see "OFFLINE" in index.html),
   and /api requests always go to the network (the page keeps its own offline copy). */
const SHELL = 'sangit-shell-v1';
const ASSETS = 'sangit-assets-v1';
const SHELL_URLS = ['/', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/apple-touch-icon.png', '/icons/icon.svg'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(SHELL_URLS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== SHELL && k !== ASSETS).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function withTimeout(promise, ms){
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(v => { clearTimeout(t); resolve(v); }, e => { clearTimeout(t); reject(e); });
  });
}

// The app page: network first (so updates show up), cached copy when offline or the signal is weak.
async function page(req){
  const cache = await caches.open(SHELL);
  try {
    const res = await withTimeout(fetch(req), 5000);
    if (res.ok && (res.headers.get('content-type') || '').includes('text/html')) cache.put('/', res.clone());
    return res;
  } catch (e) {
    return (await cache.match('/')) || Response.error();
  }
}

// Icons, manifest: cached copy straight away, refreshed in the background.
async function shellAsset(req){
  const cache = await caches.open(SHELL);
  const hit = await cache.match(req);
  const net = fetch(req).then(res => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => null);
  return hit || (await net) || Response.error();
}

// Cover art (Spotify CDN) and Google Fonts: these never change, so cache first.
async function remoteAsset(req){
  const cache = await caches.open(ASSETS);
  const hit = await cache.match(req);
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
    return res;
  } catch (e) {
    return Response.error();
  }
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin){
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/music/')) return;   // network only
    if (req.mode === 'navigate') return e.respondWith(page(req));
    if (req.headers.has('range')) return;
    return e.respondWith(shellAsset(req));
  }
  if (/(^|\.)scdn\.co$|(^|\.)spotifycdn\.com$|^fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)){
    return e.respondWith(remoteAsset(req));
  }
});
