// Butter Math service worker (beta). Scope: /beta/
// Network first for everything: you always get the newest version when you have a signal.
// Saved copies are only a fallback for when you're offline.
// Change VERSION on every deploy. The old cache is deleted when the new worker takes over.
const VERSION = 'b251';
const CACHE = 'butter-math-beta-' + VERSION;
const OFFLINE = '/beta/offline.html';
const PRECACHE = [OFFLINE, '/beta/icons/icon-192-v2.png', '/beta/icons/apple-touch-icon-v2.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('butter-math-beta-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Only keep copies of the site's own files and the fonts. Recipes, lists, and sign-in (Supabase) always go to the network and are never saved here.
const keepable = url => url.origin === self.location.origin || url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';

self.addEventListener('fetch', e => {
  const req = e.request;
  if(req.method !== 'GET') return;
  const url = new URL(req.url);
  if(!keepable(url)) return;
  // Pages: always the live page. With no signal, show the offline page. (A saved copy of the app would open to an empty screen,
  // because recipes and lists are never saved on the phone, so the friendly offline page is the better fallback.)
  if(req.mode === 'navigate'){
    e.respondWith(fetch(req).catch(() => caches.match(OFFLINE)));
    return;
  }
  e.respondWith(fetch(req).then(res => { if(res.ok || res.type === 'opaque'){ const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); } return res; })
    .catch(() => caches.match(req).then(hit => hit || Response.error())));
});
