const CACHE = 'babycare-website-v7';
const SHELL = [
  '/', '/manifest.webmanifest', '/bear-bottle.png', '/icon-192.png', '/icon-512.png',
  '/icons/nav-today.png', '/icons/nav-records.png', '/icons/nav-trends.png', '/icons/nav-settings.png',
  '/icons/quick-feeding.png', '/icons/quick-bowel.png', '/icons/quick-note.png', '/icons/record-supplement.png'
];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL))));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))));
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).pathname.startsWith('/api/')) return;
  event.respondWith(fetch(request).then(response => { const copy = response.clone(); caches.open(CACHE).then(cache => cache.put(request, copy)); return response; }).catch(() => caches.match(request).then(response => response || caches.match('/'))));
});
