/**
 * TrustMark Service Worker
 * Caching strategy: cache-first for CDN resources, network-first for app content.
 */

var CACHE_NAME = 'trustmark-v1';

var CDN_RESOURCES = [
  'https://cdn.jsdelivr.net/npm/piexifjs@1.0.6/piexif.js',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js'
];

// Install event - cache CDN resources for offline use
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(CDN_RESOURCES);
    }).then(function() {
      return self.skipWaiting();
    })
  );
});

// Activate event - clean old caches
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.filter(function(name) {
          return name !== CACHE_NAME;
        }).map(function(name) {
          return caches.delete(name);
        })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

// Fetch event - cache-first for CDN, network-first for app content
self.addEventListener('fetch', function(event) {
  var requestUrl = event.request.url;

  // Cache-first strategy for CDN resources
  var isCDN = CDN_RESOURCES.some(function(url) {
    return requestUrl.indexOf(url) !== -1;
  });

  if (isCDN) {
    event.respondWith(
      caches.match(event.request).then(function(cachedResponse) {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(event.request).then(function(response) {
          if (response && response.status === 200) {
            var responseClone = response.clone();
            caches.open(CACHE_NAME).then(function(cache) {
              cache.put(event.request, responseClone);
            });
          }
          return response;
        });
      })
    );
    return;
  }

  // Network-first strategy for app content
  event.respondWith(
    fetch(event.request).then(function(response) {
      if (response && response.status === 200 && event.request.method === 'GET') {
        var responseClone = response.clone();
        caches.open(CACHE_NAME).then(function(cache) {
          cache.put(event.request, responseClone);
        });
      }
      return response;
    }).catch(function() {
      return caches.match(event.request);
    })
  );
});
