// 由 scripts/build-sw.mjs 在 vite build 后生成（占位符会被替换），不要手改 dist/sw.js。
// 版本号由预缓存清单内容哈希得出：部署产物变化时自动失效旧缓存，无需手工 bump。
const CACHE = __CACHE_NAME__;
const THEME_CACHE = 'babycare-theme-runtime-v1';
const PRECACHE = __PRECACHE_JSON__;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE && key !== THEME_CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

// 运行时缓存上限，防止无界增长（超出后逐出最旧的条目）
const MAX_ENTRIES = 140;

async function trimCache(cache) {
  const keys = await cache.keys();
  while (keys.length > MAX_ENTRIES) {
    await cache.delete(keys[0]);
    keys.shift();
  }
}

async function putRecentlyUsed(cache, request, response) {
  await cache.delete(request);
  await cache.put(request, response);
  await trimCache(cache);
}

self.addEventListener('message', (event) => {
  if (event.data?.type !== 'CACHE_THEME_ASSETS' || !Array.isArray(event.data.urls)) return;
  const urls = [...new Set(event.data.urls)]
    .filter((url) => typeof url === 'string' && url.startsWith('/hero/'));
  event.waitUntil(caches.open(THEME_CACHE).then((cache) => Promise.all(urls.map(async (url) => {
    try {
      const response = await fetch(url);
      if (response.ok) await putRecentlyUsed(cache, url, response);
    } catch { /* 离线时保留旧缓存 */ }
  }))));
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  // Hero 主题使用独立的按需缓存，应用更新时仍保留最近使用的主题。
  const cacheName = url.pathname.startsWith('/hero/') ? THEME_CACHE : CACHE;
  // 页面外壳和静态资源优先使用本地缓存，弱网下立即显示；网络响应仅在后台刷新缓存。
  const cacheKey = request.mode === 'navigate' ? '/' : request;
  const networkUpdate = fetch(request).then(async (response) => {
    if (response.ok && (response.type === 'basic' || response.type === 'default')) {
      const cache = await caches.open(cacheName);
      await putRecentlyUsed(cache, cacheKey, response.clone());
    }
    return response;
  });
  event.waitUntil(networkUpdate.then(() => undefined).catch(() => undefined));
  event.respondWith(
    caches.match(cacheKey).then((cached) => cached || networkUpdate)
  );
});
