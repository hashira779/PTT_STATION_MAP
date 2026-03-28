const CACHE_NAME = 'my-site-cache-v2';
const urlsToCache = [
  '/MAPTT_0114/',
//   '/MAPTT_0114/styles/main.css',
  '/MAPTT_0114/main.js',
  '/MAPTT_0114/manifest.json'
];

// Install event
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function(cache) {

        return cache.addAll(urlsToCache);
      })
  );
  self.skipWaiting();
});

// Fetch event
self.addEventListener('fetch', function(event) {
  if (event.request.method !== 'GET') {
    return;
  }

  const requestUrl = new URL(event.request.url);
  const isOilPriceApi = requestUrl.pathname.indexOf('/api/oil-prices') !== -1;
  const isApiRequest = requestUrl.pathname.indexOf('/api/') !== -1;
  const hasNoCacheParam = requestUrl.searchParams.has('nocache') || requestUrl.searchParams.has('_ts');

  if (isOilPriceApi || isApiRequest || hasNoCacheParam) {
    event.respondWith(fetch(event.request, { cache: 'no-store' }));
    return;
  }

  const isPrecachedAsset = urlsToCache.indexOf(requestUrl.pathname) !== -1;

  if (!isPrecachedAsset) {
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith(
    caches.match(event.request).then(function(response) {
      if (response) {
        return response;
      }
      return fetch(event.request);
    })
  );
});

// Activate event
self.addEventListener('activate', function(event) {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(function(keyList) {
      return Promise.all(keyList.map(function(key) {
        if (cacheWhitelist.indexOf(key) === -1) {
          return caches.delete(key);
        }
      })).then(function() {
        return self.clients.claim();
      });
    })
  );
});