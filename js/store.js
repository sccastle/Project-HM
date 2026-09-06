/* store.js — 业务数据层
   数据关系：学生 → 年级 → 课程(含老师) → 每日记录
   所有内容都绑定 date / gradeId / courseId */

window.Store = (function () {
  var SCHEMA_VERSION = 1;

  var COURSE_TYPES = [
    { key: 'chinese', label: '语文', icon: '语' },
    { key: 'math', label: '数学', icon: '数' },
    { key: 'english', label: '常规英语', icon: 'A' },
    { key: 'pbl', label: 'PBL英语', icon: 'P' },
    { key: 'other', label: '其他', icon: '·' }
  ];

  /* DeepSeek 2026-08 起的在售模型：deepseek-v4-flash / deepseek-v4-pro /
     deepseek-v4-flash-vision-exp（唯一能收图片的那个）。
     旧的 deepseek-chat 命名已经不在官方模型列表里了。 */
  var DEFAULT_ENDPOINT = 'https://api.deepseek.com/chat/completions';
  var DEFAULT_MODEL = 'deepseek-v4-flash';
  var DEFAULT_VISION_MODEL = 'deepseek-v4-flash-vision-exp';

  var settings = {
    apiKey: '',
    endpoint: DEFAULT_ENDPOINT,
    model: DEFAULT_MODEL,
    visionModel: DEFAULT_VISION_MODEL,
    visionEndpoint: '',
    keepImages: false,
    currentGradeId: '',
    modelsMigrated: ''
  };

  /* ---------- 工具 ---------- */

  function uid(prefix) {
    return (prefix || 'x') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  function toKey(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function fromKey(key) {
    var p = key.split('-');
    return new Date(+p[0], +p[1] - 1, +p[2]);
  }

  function todayKey() { return toKey(new Date()); }

  function shiftKey(key, days) {
    var d = fromKey(key);
    d.setDate(d.getDate() + days);
    return toKey(d);
  }

  var WEEK = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

  function humanDate(key) {
    var d = fromKey(key);
    var s = (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + WEEK[d.getDay()];
    if (key === todayKey()) s = '今天 · ' + s;
    else if (key === shiftKey(todayKey(), -1)) s = '昨天 · ' + s;
    else if (key === shiftKey(todayKey(), 1)) s = '明天 · ' + s;
    return s;
  }

  function shortDate(key) {
    var d = fromKey(key);
    return (d.getMonth() + 1) + '/' + d.getDate();
  }

  function typeLabel(t) {
    var f = COURSE_TYPES.filter(function (x) { return x.key === t; })[0];
    return f ? f.label : '其他';
  }

  function typeIcon(t) {
    var f = COURSE_TYPES.filter(function (x) { return x.key === t; })[0];
    return f ? f.icon : '·';
  }

  /* ---------- 设置 ---------- */

  async function loadSettings() {
    var rows = await DB.getAll('settings');
    rows.forEach(function (r) {
      if (r.id in settings) settings[r.id] = r.value;
    });
    // API Key 单独放 localStorage，保证只留在本机、且绝不进入 JSON 导出
    try {
      var k = localStorage.getItem('xt.apiKey');
      if (k) settings.apiKey = k;
    } catch (e) { /* ignore */ }
    return settings;
  }

  async function setSetting(key, value) {
    settings[key] = value;
    if (key === 'apiKey') {
      try {
        if (value) localStorage.setItem('xt.apiKey', value);
        else localStorage.removeItem('xt.apiKey');
      } catch (e) { /* ignore */ }
      return;
    }
    await DB.put('settings', { id: key, value: value });
  }

  /* ---------- 年级 ---------- */

  async function getGrades() {
    var g = await DB.getAll('grades');
    return g.sort(function (a, b) { return (a.createdAt || 0) - (b.createdAt || 0); });
  }

  async function currentGrade() {
    var grades = await getGrades();
    if (!grades.length) return null;
    var cur = grades.filter(function (g) { return g.id === settings.currentGradeId; })[0];
    if (cur) return cur;
    cur = grades.filter(function (g) { return g.isCurrent; })[0] || grades[grades.length - 1];
    await setSetting('currentGradeId', cur.id);
    return cur;
  }

  async function addGrade(name) {
    var g = { id: uid('g'), name: name, isCurrent: false, createdAt: Date.now(), archived: false };
    await DB.put('grades', g);
    return g;
  }

  async function setCurrentGrade(id) {
    var grades = await getGrades();
    for (var i = 0; i < grades.length; i++) {
      grades[i].isCurrent = grades[i].id === id;
      await DB.put('grades', grades[i]);
    }
    await setSetting('currentGradeId', id);
  }

  async function renameGrade(id, name) {
    var g = await DB.get('grades', id);
    if (!g) return;
    g.name = name;
    await DB.put('grades', g);
  }

  async function archiveGrade(id, archived) {
    var g = await DB.get('grades', id);
    if (!g) return;
    g.archived = !!archived;
    await DB.put('grades', g);
  }

  /* ---------- 课程 / 老师 ---------- */

  async function getCourses(gradeId, includeArchived) {
    var all = await DB.getAll('courses');
    return all
      .filter(function (c) {
        if (gradeId && c.gradeId !== gradeId) return false;
        if (!includeArchived && c.archived) return false;
        return true;
      })
      .sort(function (a, b) { return (a.sortOrder || 0) - (b.sortOrder || 0); });
  }

  async function saveCourse(data) {
    var c;
    if (data.id) {
      c = await DB.get('courses', data.id);
      if (!c) c = { id: data.id };
    } else {
      var sibs = await getCourses(data.gradeId, true);
      c = { id: uid('c'), sortOrder: sibs.length, archived: false, createdAt: Date.now() };
    }
    ['gradeId', 'name', 'teacherName', 'teacherAvatar', 'type'].forEach(function (k) {
      if (k in data) c[k] = data[k];
    });
    await DB.put('courses', c);
    return c;
  }

  async function archiveCourse(id, archived) {
    var c = await DB.get('courses', id);
    if (!c) return;
    c.archived = !!archived;
    await DB.put('courses', c);
  }

  async function moveCourse(id, dir) {
    var c = await DB.get('courses', id);
    if (!c) return;
    var list = await getCourses(c.gradeId, true);
    var i = list.findIndex(function (x) { return x.id === id; });
    var j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    var tmp = list[i];
    list[i] = list[j];
    list[j] = tmp;
    for (var k = 0; k < list.length; k++) {
      list[k].sortOrder = k;
      await DB.put('courses', list[k]);
    }
  }

  /* ---------- 每日记录 ---------- */

  function recordId(date, courseId) { return date + '__' + courseId; }

  async function getRecord(date, courseId) {
    return await DB.get('dailyRecords', recordId(date, courseId));
  }

  async function ensureRecord(date, course) {
    var r = await getRecord(date, course.id);
    if (r) return r;
    return {
      id: recordId(date, course.id),
      date: date,
      gradeId: course.gradeId,
      courseId: course.id,
      rawText: '',
      tasks: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
  }

  async function saveRecord(rec) {
    rec.updatedAt = Date.now();
    await DB.put('dailyRecords', rec);
    return rec;
  }

  async function getRecordsByDate(date, gradeId) {
    var all = await DB.getAll('dailyRecords');
    return all.filter(function (r) {
      return r.date === date && (!gradeId || r.gradeId === gradeId);
    });
  }

  async function getRecordsInMonth(year, month, gradeId) {
    var prefix = year + '-' + pad(month + 1);
    var all = await DB.getAll('dailyRecords');
    return all.filter(function (r) {
      return r.date.indexOf(prefix) === 0 && (!gradeId || r.gradeId === gradeId);
    });
  }

  /* ---------- 数学知识点 ---------- */

  async function saveMathKnowledge(entry) {
    entry.id = entry.id || uid('mk');
    entry.createdAt = entry.createdAt || Date.now();
    await DB.put('mathKnowledge', entry);
    return entry;
  }

  async function getMathKnowledge(from, to, gradeId) {
    var all = await DB.getAll('mathKnowledge');
    return all
      .filter(function (e) {
        if (from && e.date < from) return false;
        if (to && e.date > to) return false;
        if (gradeId && e.gradeId && e.gradeId !== gradeId) return false;
        return true;
      })
      .sort(function (a, b) { return a.date < b.date ? -1 : 1; });
  }

  async function getMathKnowledgeByRecord(date, courseId) {
    var all = await DB.getAll('mathKnowledge');
    return all.filter(function (e) { return e.date === date && e.courseId === courseId; });
  }

  async function deleteMathKnowledge(id) { await DB.remove('mathKnowledge', id); }

  /* ---------- 英语 / PBL 提词结果 ---------- */

  async function saveWordRecord(entry) {
    entry.id = entry.id || uid('w');
    entry.createdAt = entry.createdAt || Date.now();
    await DB.put('wordRecords', entry);
    return entry;
  }

  async function getWordRecords(date, courseId) {
    var all = await DB.getAll('wordRecords');
    return all.filter(function (e) {
      return (!date || e.date === date) && (!courseId || e.courseId === courseId);
    }).sort(function (a, b) { return (a.createdAt || 0) - (b.createdAt || 0); });
  }

  async function deleteWordRecord(id) { await DB.remove('wordRecords', id); }

  /* ---------- 知识点归类（纯本地规则，不调用 AI） ---------- */

  var CATEGORY_RULES = [
    { name: '数与运算', words: ['加', '减', '乘', '除', '数', '算', '凑十', '进位', '退位', '口算', '竖式', '倍', '分解', '组成', '大小比较'] },
    { name: '图形与几何', words: ['图形', '几何', '长方', '正方', '三角', '圆', '角', '立体', '平面', '对称', '方位', '位置'] },
    { name: '量与计量', words: ['长度', '厘米', '米', '重量', '克', '千克', '时间', '钟表', '几时', '人民币', '元角分', '测量'] },
    { name: '应用与解决问题', words: ['应用', '解决问题', '看图列式', '数量关系', '实际问题', '两步'] },
    { name: '统计与规律', words: ['统计', '规律', '分类', '整理', '数据'] }
  ];

  function categorize(point) {
    for (var i = 0; i < CATEGORY_RULES.length; i++) {
      var rule = CATEGORY_RULES[i];
      for (var j = 0; j < rule.words.length; j++) {
        if (point.indexOf(rule.words[j]) >= 0) return rule.name;
      }
    }
    return '其他';
  }

  /* 把区间内的知识点聚合成 分类 → [{name, firstSeen, lastSeen, count}] */
  function aggregate(entries) {
    var map = {};
    entries.forEach(function (e) {
      var pts = (e.coreKnowledge || []).concat(e.skills || []);
      pts.forEach(function (p) {
        var name = String(p).trim();
        if (!name) return;
        if (!map[name]) map[name] = { name: name, count: 0, firstSeen: e.date, lastSeen: e.date };
        map[name].count++;
        if (e.date < map[name].firstSeen) map[name].firstSeen = e.date;
        if (e.date > map[name].lastSeen) map[name].lastSeen = e.date;
      });
    });

    var byCat = {};
    Object.keys(map).forEach(function (name) {
      var cat = categorize(name);
      (byCat[cat] = byCat[cat] || []).push(map[name]);
    });

    var order = ['数与运算', '图形与几何', '量与计量', '应用与解决问题', '统计与规律', '其他'];
    return order
      .filter(function (c) { return byCat[c]; })
      .map(function (c) {
        byCat[c].sort(function (a, b) {
          if (a.firstSeen !== b.firstSeen) return a.firstSeen < b.firstSeen ? -1 : 1;
          return b.count - a.count;
        });
        return { name: c, items: byCat[c] };
      });
  }

  /* ---------- 首次启动：只建年级，不写任何假作业数据 ---------- */

  /* 老版本装过的设备：把停用的 deepseek-chat 换成在售模型，
     图片模型没填过的补上视觉模型。只做一次，用户手改过的不覆盖。 */
  async function migrateModelNames() {
    if (settings.modelsMigrated === 'v4') return;
    if (!settings.model || settings.model === 'deepseek-chat') {
      await setSetting('model', DEFAULT_MODEL);
    }
    if (!(settings.visionModel || '').trim()) {
      await setSetting('visionModel', DEFAULT_VISION_MODEL);
    }
    if (!(settings.endpoint || '').trim()) {
      await setSetting('endpoint', DEFAULT_ENDPOINT);
    }
    await setSetting('modelsMigrated', 'v4');
  }

  async function bootstrap() {
    await migrateModelNames();
    var grades = await getGrades();
    if (!grades.length) {
      var g = await addGrade('一年级');
      g.isCurrent = true;
      await DB.put('grades', g);
      await setSetting('currentGradeId', g.id);
    }
  }

  return {
    SCHEMA_VERSION: SCHEMA_VERSION,
    COURSE_TYPES: COURSE_TYPES,
    DEFAULT_ENDPOINT: DEFAULT_ENDPOINT,
    DEFAULT_MODEL: DEFAULT_MODEL,
    DEFAULT_VISION_MODEL: DEFAULT_VISION_MODEL,
    settings: settings,
    uid: uid,
    toKey: toKey,
    fromKey: fromKey,
    todayKey: todayKey,
    shiftKey: shiftKey,
    humanDate: humanDate,
    shortDate: shortDate,
    typeLabel: typeLabel,
    typeIcon: typeIcon,
    pad: pad,
    loadSettings: loadSettings,
    setSetting: setSetting,
    getGrades: getGrades,
    currentGrade: currentGrade,
    addGrade: addGrade,
    setCurrentGrade: setCurrentGrade,
    renameGrade: renameGrade,
    archiveGrade: archiveGrade,
    getCourses: getCourses,
    saveCourse: saveCourse,
    archiveCourse: archiveCourse,
    moveCourse: moveCourse,
    recordId: recordId,
    getRecord: getRecord,
    ensureRecord: ensureRecord,
    saveRecord: saveRecord,
    getRecordsByDate: getRecordsByDate,
    getRecordsInMonth: getRecordsInMonth,
    saveMathKnowledge: saveMathKnowledge,
    getMathKnowledge: getMathKnowledge,
    getMathKnowledgeByRecord: getMathKnowledgeByRecord,
    deleteMathKnowledge: deleteMathKnowledge,
    saveWordRecord: saveWordRecord,
    getWordRecords: getWordRecords,
    deleteWordRecord: deleteWordRecord,
    categorize: categorize,
    aggregate: aggregate,
    bootstrap: bootstrap
  };
})();
