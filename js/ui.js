/* ui.js — 通用 UI 零件：toast / loading / 底部抽屉 / 确认框 / 复制
   全站不使用 alert()。 */

window.UI = (function () {
  var toastEl, loadingEl, loadingTxt, maskEl, sheetEl;
  var toastTimer = null;

  function mount() {
    toastEl = document.getElementById('toast');
    loadingEl = document.getElementById('loading');
    loadingTxt = loadingEl.querySelector('.txt');
    maskEl = document.getElementById('sheet-mask');
    sheetEl = document.getElementById('sheet');

    maskEl.addEventListener('click', function (e) {
      if (e.target === maskEl) closeSheet();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !maskEl.hidden) closeSheet();
    });
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function toast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 2200);
  }

  function loading(on, text) {
    if (!loadingEl) return;
    loadingTxt.textContent = text || 'AI 正在分析…';
    loadingEl.hidden = !on;
  }

  /* ---------- 底部抽屉 ---------- */

  var sheetCloseHandler = null;

  function openSheet(html, onMount) {
    sheetEl.innerHTML = html;
    maskEl.hidden = false;
    document.documentElement.classList.add('sheet-open');
    if (onMount) onMount(sheetEl);
    var firstInput = sheetEl.querySelector('input,textarea,select');
    if (firstInput && firstInput.dataset.autofocus === '1') {
      // 用 rAF 而不是定时器，并且如果用户已经点进别的输入框就不抢焦点
      requestAnimationFrame(function () {
        if (!sheetEl.contains(firstInput)) return;
        var a = document.activeElement;
        if (a && a !== document.body && a !== firstInput && sheetEl.contains(a)) return;
        firstInput.focus();
      });
    }
  }

  function closeSheet() {
    maskEl.hidden = true;
    sheetEl.innerHTML = '';
    document.documentElement.classList.remove('sheet-open');
    document.body.style.overflow = ''; // 清掉老版本可能残留的内联锁
    if (sheetCloseHandler) { var h = sheetCloseHandler; sheetCloseHandler = null; h(); }
  }

  function onSheetClose(fn) { sheetCloseHandler = fn; }

  /* 兜底：只要没有抽屉在开着，就绝不允许背景滚动被锁住 */
  function unlockScrollIfIdle() {
    if (!maskEl || !maskEl.hidden) return;
    document.documentElement.classList.remove('sheet-open');
    if (document.body.style.overflow) document.body.style.overflow = '';
  }

  function confirm(opts) {
    return new Promise(function (resolve) {
      var html =
        '<h2>' + esc(opts.title) + '</h2>' +
        (opts.body ? '<p class="sheet-sub">' + opts.body + '</p>' : '') +
        '<div class="sheet-actions">' +
        '<button class="btn ghost" data-act="no">' + esc(opts.cancelText || '取消') + '</button>' +
        '<button class="btn ' + (opts.danger ? 'danger' : 'primary') + '" data-act="yes">' +
        esc(opts.okText || '确定') + '</button>' +
        '</div>';
      var done = false;
      onSheetClose(function () { if (!done) resolve(false); });
      openSheet(html, function (root) {
        root.querySelector('[data-act="no"]').onclick = function () { done = true; closeSheet(); resolve(false); };
        root.querySelector('[data-act="yes"]').onclick = function () { done = true; closeSheet(); resolve(true); };
      });
    });
  }

  function prompt(opts) {
    return new Promise(function (resolve) {
      var html =
        '<h2>' + esc(opts.title) + '</h2>' +
        (opts.body ? '<p class="sheet-sub">' + esc(opts.body) + '</p>' : '') +
        '<div class="field"><input type="text" data-autofocus="1" id="prompt-input" value="' +
        esc(opts.value || '') + '" placeholder="' + esc(opts.placeholder || '') + '"></div>' +
        '<div class="sheet-actions">' +
        '<button class="btn ghost" data-act="no">取消</button>' +
        '<button class="btn primary" data-act="yes">' + esc(opts.okText || '保存') + '</button>' +
        '</div>';
      var done = false;
      onSheetClose(function () { if (!done) resolve(null); });
      openSheet(html, function (root) {
        var input = root.querySelector('#prompt-input');
        root.querySelector('[data-act="no"]').onclick = function () { done = true; closeSheet(); resolve(null); };
        root.querySelector('[data-act="yes"]').onclick = function () {
          var v = input.value.trim();
          if (!v) { toast('还没有填写内容'); return; }
          done = true; closeSheet(); resolve(v);
        };
        input.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') root.querySelector('[data-act="yes"]').click();
        });
      });
    });
  }

  /* ---------- 复制 ---------- */

  async function copy(text, successMsg) {
    if (!text) { toast('没有可复制的内容'); return false; }
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.top = '-1000px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      toast(successMsg || '已复制');
      return true;
    } catch (e) {
      toast('复制失败，请长按选中文字手动复制');
      return false;
    }
  }

  /* ---------- 选图 ---------- */

  function pickImages(multiple) {
    return new Promise(function (resolve) {
      var input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      if (multiple) input.multiple = true;
      input.style.position = 'fixed';
      input.style.left = '-9999px';
      document.body.appendChild(input);
      input.onchange = function () {
        var files = Array.prototype.slice.call(input.files || []);
        document.body.removeChild(input);
        resolve(files);
      };
      input.click();
    });
  }

  /* ---------- 图标 ---------- */

  var ICONS = {
    today: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l8 4v6c0 4.4-3.4 7.4-8 8-4.6-.6-8-3.6-8-8V7l8-4z"/><path d="M9 12l2 2 4-4"/></svg>',
    calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18"/></svg>',
    knowledge: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h9a3 3 0 013 3v13H8a3 3 0 01-3-3z"/><path d="M17 7h2v13H8"/><path d="M9 9h5M9 12h5"/></svg>',
    settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3.2"/><path d="M12 3v2.2M12 18.8V21M4.2 7.5l1.9 1.1M17.9 15.4l1.9 1.1M4.2 16.5l1.9-1.1M17.9 8.6l1.9-1.1"/></svg>',
    hat: '<svg class="hat" viewBox="0 0 48 48" fill="none" stroke="#141414" stroke-width="2.4" stroke-linejoin="round"><path d="M14 30V13c0-2 1.6-3 4-3h12c2.4 0 4 1 4 3v17" fill="#02a4dc"/><path d="M14 17h20" stroke="#fff" stroke-width="5"/><path d="M14 17h20" /><path d="M14 23h20"/><ellipse cx="24" cy="31" rx="17" ry="5" fill="#02a4dc"/><ellipse cx="24" cy="31" rx="17" ry="5"/></svg>'
  };

  function icon(name) { return ICONS[name] || ''; }

  return {
    mount: mount,
    esc: esc,
    toast: toast,
    loading: loading,
    openSheet: openSheet,
    unlockScrollIfIdle: unlockScrollIfIdle,
    closeSheet: closeSheet,
    onSheetClose: onSheetClose,
    confirm: confirm,
    prompt: prompt,
    copy: copy,
    pickImages: pickImages,
    icon: icon
  };
})();
