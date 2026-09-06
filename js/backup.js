/* backup.js — JSON 导出 / 导入
   导出内容：年级、课程与老师（含头像 Base64）、每日记录（老师原文 + 任务 + 勾选状态）、
             数学知识点、英语/PBL 提词结果、排序、普通设置。
   导出内容绝不包含 API Key。 */

window.Backup = (function () {
  var EXPORT_STORES = ['grades', 'courses', 'dailyRecords', 'mathKnowledge', 'wordRecords'];

  var SAFE_SETTINGS = ['currentGradeId', 'keepImages'];

  async function buildExport() {
    var payload = {
      app: 'xiaotao-homework',
      schemaVersion: Store.SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      data: {}
    };
    for (var i = 0; i < EXPORT_STORES.length; i++) {
      payload.data[EXPORT_STORES[i]] = await DB.getAll(EXPORT_STORES[i]);
    }
    var settings = {};
    SAFE_SETTINGS.forEach(function (k) { settings[k] = Store.settings[k]; });
    payload.data.settings = settings; // 不含 apiKey / endpoint 认证信息
    return payload;
  }

  function fileName() {
    var d = new Date();
    return 'xiaotao-homework-backup-' +
      d.getFullYear() + '-' + Store.pad(d.getMonth() + 1) + '-' + Store.pad(d.getDate()) + '.json';
  }

  async function exportJSON() {
    var payload = await buildExport();
    var text = JSON.stringify(payload, null, 2);
    var blob = new Blob([text], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = fileName();
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    return { name: fileName(), size: text.length, payload: payload };
  }

  function summarize(payload) {
    var d = payload.data || {};
    var wordCount = (d.wordRecords || []).reduce(function (n, r) {
      return n + (r.words || []).length + (r.expressions || []).length;
    }, 0);
    var kpCount = (d.mathKnowledge || []).reduce(function (n, r) {
      return n + (r.coreKnowledge || []).length + (r.skills || []).length;
    }, 0);
    return {
      exportedAt: payload.exportedAt || '',
      grades: (d.grades || []).length,
      courses: (d.courses || []).length,
      records: (d.dailyRecords || []).length,
      knowledge: kpCount,
      words: wordCount
    };
  }

  function validate(payload) {
    if (!payload || typeof payload !== 'object') return '文件不是有效的 JSON 备份。';
    if (payload.app && payload.app !== 'xiaotao-homework') return '这不是小萄作业管家的备份文件。';
    if (!payload.data || typeof payload.data !== 'object') return '备份缺少 data 字段，无法恢复。';
    var v = payload.schemaVersion;
    if (typeof v !== 'number') return '备份缺少 schemaVersion，无法确认版本。';
    if (v > Store.SCHEMA_VERSION) return '备份来自更新版本的 App（v' + v + '），请先升级后再导入。';
    return null;
  }

  function readFile(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onerror = function () { reject(new Error('读取文件失败')); };
      r.onload = function () {
        try { resolve(JSON.parse(r.result)); }
        catch (e) { reject(new Error('文件不是有效的 JSON')); }
      };
      r.readAsText(file);
    });
  }

  /* 覆盖式导入：V1 不做合并 */
  async function importJSON(payload) {
    var d = payload.data || {};
    for (var i = 0; i < EXPORT_STORES.length; i++) {
      var store = EXPORT_STORES[i];
      await DB.clear(store);
      var rows = (d[store] || []).filter(function (r) { return r && r.id; });
      await DB.bulkPut(store, rows);
    }
    if (d.settings) {
      for (var k = 0; k < SAFE_SETTINGS.length; k++) {
        var key = SAFE_SETTINGS[k];
        if (key in d.settings) await Store.setSetting(key, d.settings[key]);
      }
    }
    // API Key 不在备份里，保持本机原值不变
    return summarize(payload);
  }

  function pickFile() {
    return new Promise(function (resolve) {
      var input = document.createElement('input');
      input.type = 'file';
      input.accept = 'application/json,.json';
      input.style.position = 'fixed';
      input.style.left = '-9999px';
      document.body.appendChild(input);
      input.onchange = function () {
        var f = (input.files || [])[0] || null;
        document.body.removeChild(input);
        resolve(f);
      };
      input.click();
    });
  }

  return {
    buildExport: buildExport,
    exportJSON: exportJSON,
    importJSON: importJSON,
    summarize: summarize,
    validate: validate,
    readFile: readFile,
    pickFile: pickFile,
    fileName: fileName
  };
})();
