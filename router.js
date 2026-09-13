/* router.js — hash 路由。
   路由都放在 hash 里，GitHub Pages 子目录部署不需要任何服务器改写。 */

window.Router = (function () {
  var routes = {};
  var current = null;
  var scrollMemo = {};

  function parse() {
    var h = location.hash.replace(/^#/, '');
    if (!h || h === '/') h = '/today';
    var qi = h.indexOf('?');
    var path = qi < 0 ? h : h.slice(0, qi);
    var query = {};
    if (qi >= 0) {
      h.slice(qi + 1).split('&').forEach(function (kv) {
        if (!kv) return;
        var p = kv.split('=');
        query[decodeURIComponent(p[0])] = decodeURIComponent(p.slice(1).join('=') || '');
      });
    }
    return { path: path, query: query };
  }

  function on(path, handler) { routes[path] = handler; }

  function go(path, query) {
    var q = '';
    if (query) {
      q = '?' + Object.keys(query).map(function (k) {
        return encodeURIComponent(k) + '=' + encodeURIComponent(query[k]);
      }).join('&');
    }
    location.hash = path + q;
  }

  function back(fallback) {
    if (history.length > 1) history.back();
    else go(fallback || '/today');
  }

  async function render() {
    var r = parse();
    UI.unlockScrollIfIdle(); // 换页时确保背景滚动没被上一页的抽屉锁住
    if (current) scrollMemo[current] = window.scrollY;
    current = r.path;
    var handler = routes[r.path] || routes['/today'];
    try {
      await handler(r.query);
    } catch (e) {
      console.error(e);
      UI.toast('页面加载出错，已返回今天');
      if (r.path !== '/today') { go('/today'); return; }
    }
    window.scrollTo(0, 0);
    highlightNav(r.path);
  }

  var NAV_PARENT = {
    '/today': 'today',
    '/course': 'today',
    '/calendar': 'today',
    '/knowledge': 'knowledge',
    '/settings': 'settings',
    '/grades': 'settings',
    '/courses': 'settings',
    '/data': 'settings'
  };

  function highlightNav(path) {
    var key = NAV_PARENT[path] || 'today';
    document.querySelectorAll('.bottom-nav button').forEach(function (b) {
      b.classList.toggle('on', b.dataset.tab === key);
    });
  }

  function start() {
    window.addEventListener('hashchange', render);
    render();
  }

  return { on: on, go: go, back: back, start: start, render: render, parse: parse };
})();
