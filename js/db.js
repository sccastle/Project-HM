/* db.js — 本地存储层
   主存储 IndexedDB；当浏览器在 file:// 或隐私模式下禁用 IndexedDB 时，
   自动降级到 localStorage，再降级到内存（并提示用户及时导出 JSON）。
   对上层只暴露 getAll / get / put / bulkPut / remove / clear。 */

window.DB = (function () {
  var DB_NAME = 'xiaotao-homework';
  var DB_VER = 1;
  var STORES = ['grades', 'courses', 'dailyRecords', 'mathKnowledge', 'wordRecords', 'settings'];

  var idb = null;
  var mode = 'idb'; // idb | local | memory
  var mem = {};
  STORES.forEach(function (s) { mem[s] = {}; });

  function lsKey(store) { return 'xt.' + store; }

  function lsRead(store) {
    try {
      var raw = localStorage.getItem(lsKey(store));
      return raw ? JSON.parse(raw) : {};
    } catch (e) { return {}; }
  }

  function lsWrite(store, obj) {
    try {
      localStorage.setItem(lsKey(store), JSON.stringify(obj));
      return true;
    } catch (e) {
      // 配额满或被禁用 → 退到内存
      mode = 'memory';
      return false;
    }
  }

  function openIDB() {
    return new Promise(function (resolve, reject) {
      var req;
      try {
        if (!window.indexedDB) return reject(new Error('no indexedDB'));
        req = indexedDB.open(DB_NAME, DB_VER);
      } catch (e) { return reject(e); }

      var timer = setTimeout(function () { reject(new Error('idb timeout')); }, 3000);

      req.onupgradeneeded = function (ev) {
        var d = ev.target.result;
        STORES.forEach(function (s) {
          if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, { keyPath: 'id' });
        });
      };
      req.onsuccess = function () { clearTimeout(timer); resolve(req.result); };
      req.onerror = function () { clearTimeout(timer); reject(req.error || new Error('idb error')); };
      req.onblocked = function () { clearTimeout(timer); reject(new Error('idb blocked')); };
    });
  }

  function tx(store, write) {
    var t = idb.transaction(store, write ? 'readwrite' : 'readonly');
    return t.objectStore(store);
  }

  function wrap(request) {
    return new Promise(function (resolve, reject) {
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error); };
    });
  }

  /* ---------- 对外 API ---------- */

  async function init() {
    try {
      idb = await openIDB();
      mode = 'idb';
      // 冒烟测试：某些环境 open 成功但读写失败
      await getAll('settings');
    } catch (e) {
      idb = null;
      try {
        localStorage.setItem('xt.probe', '1');
        localStorage.removeItem('xt.probe');
        mode = 'local';
      } catch (e2) {
        mode = 'memory';
      }
    }
    return mode;
  }

  async function getAll(store) {
    if (mode === 'idb') {
      try { return await wrap(tx(store, false).getAll()); }
      catch (e) { mode = 'local'; }
    }
    var obj = mode === 'local' ? lsRead(store) : mem[store];
    return Object.keys(obj).map(function (k) { return obj[k]; });
  }

  async function get(store, id) {
    if (mode === 'idb') {
      try { return (await wrap(tx(store, false).get(id))) || null; }
      catch (e) { mode = 'local'; }
    }
    var obj = mode === 'local' ? lsRead(store) : mem[store];
    return obj[id] || null;
  }

  async function put(store, value) {
    if (mode === 'idb') {
      try { await wrap(tx(store, true).put(value)); return value; }
      catch (e) { mode = 'local'; }
    }
    if (mode === 'local') {
      var obj = lsRead(store);
      obj[value.id] = value;
      if (lsWrite(store, obj)) return value;
    }
    mem[store][value.id] = value;
    return value;
  }

  async function bulkPut(store, values) {
    if (!values || !values.length) return;
    if (mode === 'idb') {
      try {
        var t = idb.transaction(store, 'readwrite');
        var os = t.objectStore(store);
        values.forEach(function (v) { os.put(v); });
        await new Promise(function (res, rej) {
          t.oncomplete = res;
          t.onerror = function () { rej(t.error); };
          t.onabort = function () { rej(t.error); };
        });
        return;
      } catch (e) { mode = 'local'; }
    }
    for (var i = 0; i < values.length; i++) await put(store, values[i]);
  }

  async function remove(store, id) {
    if (mode === 'idb') {
      try { await wrap(tx(store, true).delete(id)); return; }
      catch (e) { mode = 'local'; }
    }
    if (mode === 'local') {
      var obj = lsRead(store);
      delete obj[id];
      if (lsWrite(store, obj)) return;
    }
    delete mem[store][id];
  }

  async function clear(store) {
    if (mode === 'idb') {
      try { await wrap(tx(store, true).clear()); return; }
      catch (e) { mode = 'local'; }
    }
    if (mode === 'local') { if (lsWrite(store, {})) return; }
    mem[store] = {};
  }

  async function clearAll() {
    for (var i = 0; i < STORES.length; i++) await clear(STORES[i]);
  }

  return {
    STORES: STORES,
    init: init,
    getAll: getAll,
    get: get,
    put: put,
    bulkPut: bulkPut,
    remove: remove,
    clear: clear,
    clearAll: clearAll,
    get mode() { return mode; }
  };
})();
