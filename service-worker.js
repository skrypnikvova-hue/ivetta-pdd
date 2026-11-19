const CACHE = 'ivetta-pdd-v7';
const SHELL = ['./', './index.html', './style.css', './payments.js', './app.js', './manifest.json', './icon.svg'];
self.addEventListener('install', e => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL))); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== CACHE).map(x => caches.delete(x)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  const p = new URL(req.url).pathname;
  const isTopics = /\/(ab\/)?topics\/[^/]+\.json$/i.test(p);
  const isAsset = /\.(jpg|jpeg|png|webp|svg)$/i.test(p);
  if (isTopics) {
    e.respondWith(caches.match(req).then(h => {
      const f = fetch(req).then(r => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then(x => x.put(req, c)); } return r; }).catch(() => h);
      return h || f;
    }));
  } else if (isAsset) {
    e.respondWith(caches.match(req).then(h => h || fetch(req).then(r => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then(x => x.put(req, c)); } return r; })));
  } else {
    e.respondWith(fetch(req).then(r => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then(x => x.put(req, c)); } return r; }).catch(() => caches.match(req).then(h => h || caches.match('./index.html'))));
  }
});