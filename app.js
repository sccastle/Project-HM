/* app.js — 启动入口 */

(function () {
  /* 日历并进了作业页（可折叠），所以底部只剩三个 tab */
  var NAV = [
    { tab: 'today', label: '作业', path: '/today', icon: 'today' },
    { tab: 'knowledge', label: '知识库', path: '/knowledge', icon: 'knowledge' },
    { tab: 'settings', label: '设置', path: '/settings', icon: 'settings' }
  ];

  function buildNav() {
    var nav = document.getElementById('nav');
    nav.innerHTML = NAV.map(function (n) {
      return '<button data-tab="' + n.tab + '" data-path="' + n.path + '">' +
        UI.icon(n.icon) + '<span>' + n.label + '</span></button>';
    }).join('');
    nav.querySelectorAll('button').forEach(function (b) {
      b.onclick = function () { Router.go(b.dataset.path); };
    });
  }

  function registerRoutes() {
    Router.on('/today', Views.today);
    Router.on('/course', Views.course);
    Router.on('/calendar', Views.calendar);
    Router.on('/knowledge', Views.knowledge);
    Router.on('/settings', Views.settings);
    Router.on('/grades', Views.grades);
    Router.on('/courses', Views.coursesPage);
    Router.on('/data', Views.dataPage);
  }

  function watchNetwork() {
    window.addEventListener('offline', function () {
      UI.toast('当前离线，AI 功能需要网络。');
    });
  }

  function registerSW() {
    if (!('serviceWorker' in navigator)) return;
    if (location.protocol === 'file:') return; // 本地单文件版没有 SW
    var base = location.pathname.replace(/[^/]*$/, '');

    // 页面加载时就已经被某个 SW 接管，说明这是老版本在跑；
    // 等新 SW 接管后自动刷一次，用户不用自己反复退出重进。
    var hadController = !!navigator.serviceWorker.controller;
    var reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (!hadController || reloaded) return;
      reloaded = true;
      location.reload();
    });

    navigator.serviceWorker.register(base + 'service-worker.js', { scope: base })
      .then(function (reg) {
        window.__swReg = reg;
        reg.update().catch(function () {});
        // 应用重新回到前台时顺便查一次更新
        document.addEventListener('visibilitychange', function () {
          if (document.visibilityState === 'visible') reg.update().catch(function () {});
        });
      })
      .catch(function () { /* 注册失败不影响使用 */ });
  }

  async function start() {
    UI.mount();
    Views.mount();
    if (window.INLINE_ICON) Views.setIconSrc(window.INLINE_ICON);

    var mode = await DB.init();
    await Store.loadSettings();
    await Store.bootstrap();

    buildNav();
    registerRoutes();
    Router.start();
    watchNetwork();
    registerSW();

    if (mode === 'memory') {
      UI.toast('这个浏览器不允许本地存储，请及时导出 JSON');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
