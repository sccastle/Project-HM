/* service-worker.js — 离线可用的应用外壳缓存
   改版本号即可让所有设备更新缓存。 */

var VERSION = 'hm-v1.5.2'; // 与 js/version.js 保持一致
var SCOPE = self.registration ? new URL(self.registration.scope).pathname : './';

var ASSETS = [
  'index.html',
  'manifest.json',
  'css/app.css?v=1.5.2',
  'js/version.js?v=1.5.2',
  'js/db.js?v=1.5.2',
  'js/store.js?v=1.5.2',
  'js/ai.js?v=1.5.2',
  'js/ui.js?v=1.5.2',
  'js/backup.js?v=1.5.2',
  'js/router.js?v=1.5.2',
  'js/views.js?v=1.5.2',
  'js/app.js?v=1.5.2',
  'icons/icon-64.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/maskable-192.png',
  'icons/maskable-512.png',
  'icons/apple-touch-icon.png',
  'icons/favicon-32.png'
].map(function (p) { return SCOPE + p; });

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(VERSION).then(function (cache) {
      // 单个资源失败不应该让整次安装失败
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

// 页面可以主动要求立刻接管
self.addEventListener('message', function (e) {
  if (e.data === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;                 // AI 的 POST 请求直接放行
  var url = new URL(req.url);
  if (url.origin !== location.origin) return;       // 不碰第三方 API

  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).catch(function () {
        return caches.match(SCOPE + 'index.html').then(function (r) {
          return r || caches.match(req);
        });
      })
    );
    return;
  }

  e.respondWith(
    caches.match(req).then(function (cached) {
      if (cached) {
        // 后台顺带更新
        fetch(new Request(req.url, { cache: 'reload' })).then(function (res) {
          if (res && res.ok) caches.open(VERSION).then(function (c) { c.put(req, res.clone()); });
        }).catch(function () {});
        return cached;
      }
      return fetch(req).then(function (res) {
        if (res && res.ok) {
          var copy = res.clone();
          caches.open(VERSION).then(function (c) { c.put(req, copy); });
        }
        return res;
      });
    })
  );
});
