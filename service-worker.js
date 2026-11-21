const CACHE = 'ivetta-pdd-v11';
const SHELL = [
  './', './index.html', './style.css', './pay-config.js', './payments.js', './app.js', './manifest.json',
  './icon.svg', './icon-192.png', './icon-512.png', './icon-512-maskable.png', './apple-touch-icon.png', './home.jpg',
  './tickets_ab_2026.json', './tickets_cd_2026.json', './topics.json', './ab/topics.json'
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE)
    .then(cache => cache.addAll(SHELL.map(url => new Request(url, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys
    .filter(key => key.startsWith('ivetta-pdd-') && key !== CACHE)
    .map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  const scope = self.registration.scope;
  if (req.method !== 'GET' || !url.href.startsWith(scope) || url.search) return;
  const asset = /\.(jpg|jpeg|png|webp|svg)$/i.test(url.pathname);
  const topic = /\/topics\/[^/]+\.json$/i.test(url.pathname);
  const shell = SHELL.some(path => new URL(path, scope).href === url.href);
  if (!asset && !topic && !shell && req.mode !== 'navigate') return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const saved = await cache.match(req);
    if (asset && saved) return saved;
    try {
      const response = await fetch(req, asset ? undefined : { cache: 'no-cache' });
      if (response.ok) await cache.put(req, response.clone()).catch(() => {});
      return response;
    } catch {
      return saved || Response.error();
    }
  })());
});