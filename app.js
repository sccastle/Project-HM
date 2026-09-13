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
    navigator.serviceWorker.register(base + 'service-worker.js', { scope: base })
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
