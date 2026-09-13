/* service-worker.js — 扁平版：css 和 js 都已内联进 index.html，
   所以只需要缓存页面本身、manifest 和图标。 */

var VERSION = 'hm-v1.5.2'; // 与 index.html 内的版本号保持一致
var SCOPE = self.registration ? new URL(self.registration.scope).pathname : './';

var ASSETS = [
  'index.html',
  'manifest.json',
  'icon-64.png',
  'icon-192.png',
  'icon-512.png',
  'maskable-192.png',
  'maskable-512.png',
  'apple-touch-icon.png',
  'favicon-32.png'
].map(function (p) { return SCOPE + p; });

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(VERSION).then(function (cache) {
      return Promise.all(ASSETS.map(function (url) {
        return cache.add(new Request(url, { cache: 'reload' })).catch(function () {});
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== VERSION) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('message', function (e) {
  if (e.data === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // 页面永远先走网络，拿不到才用缓存 —— 保证有网时一定是最新版
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(new Request(req.url, { cache: 'reload' })).then(function (res) {
        if (res && res.ok) {
          var copy = res.clone();
          caches.open(VERSION).then(function (c) { c.put(SCOPE + 'index.html', copy); });
        }
        return res;
      }).catch(function () {
        return caches.match(SCOPE + 'index.html').then(function (r) { return r || caches.match(req); });
      })
    );
    return;
  }

  e.respondWith(
    caches.match(req).then(function (cached) {
      return cached || fetch(req).then(function (res) {
        if (res && res.ok) {
          var copy = res.clone();
          caches.open(VERSION).then(function (c) { c.put(req, copy); });
        }
        return res;
      });
    })
  );
});
