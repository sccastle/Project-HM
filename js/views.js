/* views.js — 各个页面的渲染与交互 */

window.Views = (function () {
  var view, topbarEl;
  var esc = null;

  var state = {
    date: null,
    grade: null,
    courseTab: 'homework',
    calMonth: null,
    range: { mode: 'month', from: '', to: '' }
  };

  function mount() {
    view = document.getElementById('view');
    topbarEl = document.getElementById('topbar');
    esc = UI.esc;
    state.date = Store.todayKey();
    var t = Store.fromKey(state.date);
    state.calMonth = { y: t.getFullYear(), m: t.getMonth() };

    // 折叠 / 展开 / 旋转 / 切后台都可能让系统重建 WebView，
    // 离开页面前先把正在输入的老师原文落盘，避免白打一遍。
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') flushRawText();
    });
    window.addEventListener('pagehide', flushRawText);
  }

  function flushRawText() {
    var el = document.getElementById('raw');
    if (!el || !cur.rec) return;
    if (el.value === cur.rec.rawText) return;
    cur.rec.rawText = el.value;
    Store.saveRecord(cur.rec);
  }

  /* ---------- 顶栏 ---------- */

  function setTopbar(opts) {
    var left = opts.back
      ? '<button class="back-btn" id="tb-back" aria-label="返回">‹</button>'
      : '<img src="' + ICON_SRC + '" alt="" width="30" height="30" style="border-radius:8px">';

    var pill = opts.pill
      ? '<button class="grade-pill" id="tb-pill">' + esc(opts.pill) + '</button>'
      : '';

    topbarEl.innerHTML =
      '<div class="topbar-row">' + left +
      '<h1>' + esc(opts.title) + '</h1>' + pill + '</div>' +
      (opts.sub ? '<p class="sub">' + esc(opts.sub) + '</p>' : '') +
      (opts.extra || '');

    var back = document.getElementById('tb-back');
    if (back) back.onclick = function () { Router.back('/today'); };
    var p = document.getElementById('tb-pill');
    if (p && opts.onPill) p.onclick = opts.onPill;
    if (opts.onMount) opts.onMount(topbarEl);
  }

  var ICON_SRC = 'icons/icon-64.png';
  function setIconSrc(src) { ICON_SRC = src; }

  /* ---------- 小零件 ---------- */

  function avatarHTML(course) {
    if (course.teacherAvatar) {
      return '<span class="avatar"><img src="' + esc(course.teacherAvatar) + '" alt=""></span>';
    }
    return '<span class="avatar">' + esc(Store.typeIcon(course.type)) + '</span>';
  }

  function emptyBox(title, text) {
    return '<div class="empty">' + UI.icon('hat') +
      '<h3>' + esc(title) + '</h3><p>' + esc(text) + '</p></div>';
  }

  function dateStripHTML(date) {
    var isToday = date === Store.todayKey();
    return '<div class="date-strip">' +
      '<button data-act="prev-day" aria-label="前一天">‹</button>' +
      '<button class="cur' + (isToday ? ' today' : '') + '" data-act="open-cal">' +
      esc(Store.humanDate(date)) + '</button>' +
      '<button data-act="next-day" aria-label="后一天">›</button>' +
      '</div>';
  }

  function bindDateStrip(root, after) {
    root.querySelectorAll('[data-act="prev-day"]').forEach(function (b) {
      b.onclick = function () { state.date = Store.shiftKey(state.date, -1); after(); };
    });
    root.querySelectorAll('[data-act="next-day"]').forEach(function (b) {
      b.onclick = function () { state.date = Store.shiftKey(state.date, 1); after(); };
    });
    root.querySelectorAll('[data-act="open-cal"]').forEach(function (b) {
      b.onclick = function () {
        var d = Store.fromKey(state.date);
        state.calMonth = { y: d.getFullYear(), m: d.getMonth() };
        Router.go('/calendar');
      };
    });
  }

  /* 展开态才显示的课程切换条：横屏一屏够宽时，不用退回首页就能换科目。
     它在窄屏上由 CSS 隐藏，所以折叠 / 展开不需要重新渲染页面。 */
  async function courseSwitchHTML(c) {
    var list = await Store.getCourses(c.gradeId);
    if (list.length < 2) return '';
    return '<div class="pane-switch">' + list.map(function (x) {
      return '<button class="switch-chip' + (x.id === c.id ? ' on' : '') + '" data-switch="' +
        esc(x.id) + '">' + esc(x.name) + '</button>';
    }).join('') + '</div>';
  }

  function bindCourseSwitch(root) {
    root.querySelectorAll('[data-switch]').forEach(function (b) {
      b.onclick = function () {
        if (b.classList.contains('on')) return;
        Router.go('/course', { id: b.dataset.switch, date: state.date });
      };
    });
  }

  function taskCounts(rec) {
    if (!rec || !rec.tasks || !rec.tasks.length) return { total: 0, done: 0 };
    var done = rec.tasks.filter(function (t) { return t.completed; }).length;
    return { total: rec.tasks.length, done: done };
  }

  /* 首页卡片：直接把当天作业整条列出来，不用点进去才看得见。
     勾选框只显示状态，改动统一在详情页做，避免首页误触。 */

  var TASK_GROUP_TAG = { parent: '家长', reminder: '提醒' };

  function courseCardHTML(c, rec) {
    var n = taskCounts(rec);
    var raw = (rec && rec.rawText || '').trim();
    var body;

    if (n.total) {
      var order = { student: 0, parent: 1, reminder: 2 };
      var tasks = rec.tasks.slice().sort(function (a, b) {
        return (order[a.type] == null ? 0 : order[a.type]) - (order[b.type] == null ? 0 : order[b.type]);
      });
      body = '<div class="course-tasks">' + tasks.map(function (t) {
        var tag = TASK_GROUP_TAG[t.type]
          ? '<span class="mini-tag ' + esc(t.type) + '">' + TASK_GROUP_TAG[t.type] + '</span>' : '';
        return '<div class="mini-task' + (t.completed ? ' done' : '') + '">' +
          '<span class="mini-tick" aria-hidden="true">' + (t.completed ? '✓' : '') + '</span>' +
          '<span class="mini-text">' + esc(t.text) + tag + '</span></div>';
      }).join('') + '</div>' +
        '<div class="course-foot">共 ' + n.total + ' 项' +
        (n.done ? ' · 已完成 ' + n.done : '') +
        (n.done >= n.total ? ' · 全部搞定 🎉' : '') + '</div>';
    } else if (raw) {
      body = '<div class="course-raw">' + esc(raw) + '</div>' +
        '<div class="course-foot">已存原文，还没整理成清单 · 点开用 AI 整理</div>';
    } else {
      body = '<div class="course-foot na">今天还没录入作业 · 点开录入</div>';
    }

    return '<div class="card course-card" role="button" tabindex="0" data-course="' + esc(c.id) + '">' +
      '<div class="course-head">' + avatarHTML(c) +
      '<span class="course-main">' +
      '<span class="course-name">' + esc(c.name) + '</span>' +
      '<span class="course-teacher">' + esc(c.teacherName || Store.typeLabel(c.type)) + '</span>' +
      '</span><span class="chev">›</span></div>' + body + '</div>';
  }

  /* ================= 今天 ================= */

  async function today() {
    var grade = await Store.currentGrade();
    state.grade = grade;

    setTopbar({
      title: '小萄作业管家',
      sub: grade ? '小萄 / Henry · 好习惯，未来来' : '还没有设置年级',
      pill: (grade ? grade.name : '年级') + ' ▾',
      onPill: gradeSheet
    });

    var courses = await Store.getCourses(grade ? grade.id : '');
    var html = dateStripHTML(state.date);

    if (!AI.hasKey()) {
      html += '<div class="banner info">还没填 API Key。勾选作业、日历、知识脉络都能正常用，' +
        '只有 AI 整理需要先到「设置」里填写。</div>';
    }

    if (!courses.length) {
      html += emptyBox('先把老师加进来', '到 设置 → 课程 / 老师管理，添加语文、数学、英语等课程和对应老师。') +
        '<div class="spacer"></div><button class="btn primary block" data-act="go-courses">添加课程和老师</button>';
    } else {
      for (var i = 0; i < courses.length; i++) {
        var c = courses[i];
        var rec = await Store.getRecord(state.date, c.id);
        html += courseCardHTML(c, rec);
      }
      html += '<div class="foot-note">好习惯，未来来。</div>';
    }

    view.innerHTML = '<div class="content today">' + html + '</div>';
    bindDateStrip(view, today);

    view.querySelectorAll('[data-course]').forEach(function (b) {
      var open = function () { Router.go('/course', { id: b.dataset.course, date: state.date }); };
      b.onclick = open;
      b.onkeydown = function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
      };
    });
    var gc = view.querySelector('[data-act="go-courses"]');
    if (gc) gc.onclick = function () { Router.go('/courses'); };
  }

  /* ---------- 年级切换抽屉 ---------- */

  async function gradeSheet() {
    var grades = await Store.getGrades();
    var cur = await Store.currentGrade();
    var html = '<h2>切换年级</h2><p class="sheet-sub">历史年级的数据会一直保留。</p>';
    grades.filter(function (g) { return !g.archived; }).forEach(function (g) {
      html += '<button class="pick-row' + (cur && g.id === cur.id ? ' on' : '') + '" data-g="' + esc(g.id) + '">' +
        '<b>' + esc(g.name) + '</b>' +
        (cur && g.id === cur.id ? '<span class="n">当前</span>' : '') + '</button>';
    });
    html += '<div class="sheet-actions">' +
      '<button class="btn ghost" data-act="manage">管理年级</button>' +
      '<button class="btn primary" data-act="add">+ 新增年级</button></div>';

    UI.openSheet(html, function (root) {
      root.querySelectorAll('[data-g]').forEach(function (b) {
        b.onclick = async function () {
          await Store.setCurrentGrade(b.dataset.g);
          UI.closeSheet();
          UI.toast('已切换年级');
          Router.render();
        };
      });
      root.querySelector('[data-act="manage"]').onclick = function () { UI.closeSheet(); Router.go('/grades'); };
      root.querySelector('[data-act="add"]').onclick = async function () {
        UI.closeSheet();
        var name = await UI.prompt({ title: '新增年级', placeholder: '例如 二年级', okText: '创建' });
        if (!name) return;
        var g = await Store.addGrade(name);
        var ok = await UI.confirm({ title: '设为当前年级？', body: esc(name) + ' 已创建。', okText: '设为当前', cancelText: '暂不' });
        if (ok) await Store.setCurrentGrade(g.id);
        UI.toast('年级已创建');
        Router.render();
      };
    });
  }

  /* ================= 课程详情 ================= */

  var cur = { course: null, rec: null };

  async function course(q) {
    var c = await DB.get('courses', q.id || '');
    if (!c) { UI.toast('课程不存在'); Router.go('/today'); return; }
    if (q.date) state.date = q.date;
    cur.course = c;
    cur.rec = await Store.ensureRecord(state.date, c);

    var hasAI = ['math', 'english', 'pbl'].indexOf(c.type) >= 0;
    if (!hasAI) state.courseTab = 'homework';

    setTopbar({
      back: true,
      title: c.name,
      sub: (c.teacherName ? c.teacherName + ' · ' : '') + Store.humanDate(state.date),
      extra: hasAI
        ? '<div class="seg" id="course-seg">' +
          '<button data-tab="homework" class="' + (state.courseTab === 'homework' ? 'on' : '') + '">今日作业</button>' +
          '<button data-tab="ai" class="' + (state.courseTab === 'ai' ? 'on' : '') + '">' +
          (c.type === 'math' ? 'AI 知识点' : 'AI 提词') + '</button></div>'
        : '',
      onMount: function (root) {
        root.querySelectorAll('[data-tab]').forEach(function (b) {
          b.onclick = function () { state.courseTab = b.dataset.tab; course({ id: c.id, date: state.date }); };
        });
      }
    });

    if (state.courseTab === 'ai') await renderCourseAI(c);
    else await renderCourseHomework(c);
  }

  /* ---------- 作业 tab ---------- */

  async function renderCourseHomework(c) {
    var rec = cur.rec;
    var html = '<div class="content tight pane">' + dateStripHTML(state.date) +
      (await courseSwitchHTML(c));

    html += '<div class="section"><div class="tag-head"><span>老师原文</span></div>' +
      '<textarea id="raw" placeholder="把微信群里老师发的原文粘贴到这里……">' + esc(rec.rawText || '') + '</textarea>' +
      '<div class="spacer"></div><div class="btn-row">' +
      '<button class="btn ghost" data-act="save-raw">保存原文</button>' +
      '<button class="btn primary" data-act="ai-parse">AI 整理作业</button>' +
      '</div></div>';

    html += '<div class="section"><div class="tag-head"><span>今日清单</span></div>' + tasksHTML(rec) +
      '<div class="spacer"></div><button class="btn ghost block" data-act="add-task">+ 手动添加一条</button></div>';

    html += '</div>';
    view.innerHTML = html;
    bindDateStrip(view, function () { course({ id: c.id, date: state.date }); });
    bindCourseSwitch(view);
    bindTaskEvents(c);

    var rawEl = view.querySelector('#raw');
    var rawTimer = null;
    rawEl.oninput = function () {
      clearTimeout(rawTimer);
      rawTimer = setTimeout(flushRawText, 900); // 边打边存，不弹提示
    };
    rawEl.onblur = flushRawText;

    view.querySelector('[data-act="save-raw"]').onclick = async function () {
      cur.rec.rawText = rawEl.value;
      await Store.saveRecord(cur.rec);
      UI.toast('原文已保存');
    };

    view.querySelector('[data-act="ai-parse"]').onclick = async function () {
      var raw = view.querySelector('#raw').value.trim();
      if (!raw) { UI.toast('先粘贴老师的原文'); return; }
      cur.rec.rawText = raw;
      await Store.saveRecord(cur.rec);
      await runParse(c, raw);
    };

    view.querySelector('[data-act="add-task"]').onclick = async function () {
      var text = await UI.prompt({ title: '添加一条作业', placeholder: '例如 朗读课文三遍', okText: '添加' });
      if (!text) return;
      cur.rec.tasks.push({ id: Store.uid('t'), text: text, type: 'student', completed: false });
      await Store.saveRecord(cur.rec);
      course({ id: c.id, date: state.date });
    };
  }

  var TYPE_TITLE = { student: '孩子要做', parent: '家长要做', reminder: '提醒 / 要带的东西' };

  function tasksHTML(rec) {
    if (!rec.tasks || !rec.tasks.length) {
      return emptyBox('还没有作业清单', '粘贴老师原文后点「AI 整理作业」，或者手动添加一条。');
    }
    var html = '<div class="card">';
    ['student', 'parent', 'reminder'].forEach(function (type) {
      var list = rec.tasks.filter(function (t) { return (t.type || 'student') === type; });
      if (!list.length) return;
      html += '<div class="task-group ' + type + '"><div class="task-group-title">' + TYPE_TITLE[type] + '</div>';
      list.forEach(function (t) {
        html += '<div class="task' + (t.completed ? ' done' : '') + '">' +
          '<button class="tick' + (t.completed ? ' on' : '') + '" data-tick="' + esc(t.id) + '" aria-label="完成">✓</button>' +
          '<span class="task-text" data-edit="' + esc(t.id) + '">' + esc(t.text) + '</span>' +
          '<button class="task-x" data-del="' + esc(t.id) + '" aria-label="删除">×</button></div>';
      });
      html += '</div>';
    });
    return html + '</div>';
  }

  function bindTaskEvents(c) {
    view.querySelectorAll('[data-tick]').forEach(function (b) {
      b.onclick = async function () {
        var t = cur.rec.tasks.filter(function (x) { return x.id === b.dataset.tick; })[0];
        if (!t) return;
        t.completed = !t.completed;               // 勾选只写本地，绝不调用 AI
        await Store.saveRecord(cur.rec);
        b.classList.toggle('on', t.completed);
        b.closest('.task').classList.toggle('done', t.completed);
      };
    });
    view.querySelectorAll('[data-edit]').forEach(function (s) {
      s.onclick = async function () {
        var t = cur.rec.tasks.filter(function (x) { return x.id === s.dataset.edit; })[0];
        if (!t) return;
        var v = await UI.prompt({ title: '修改任务', value: t.text });
        if (!v) return;
        t.text = v;
        await Store.saveRecord(cur.rec);
        course({ id: c.id, date: state.date });
      };
    });
    view.querySelectorAll('[data-del]').forEach(function (b) {
      b.onclick = async function () {
        var ok = await UI.confirm({ title: '删除这条任务？', danger: true, okText: '删除' });
        if (!ok) return;
        cur.rec.tasks = cur.rec.tasks.filter(function (x) { return x.id !== b.dataset.del; });
        await Store.saveRecord(cur.rec);
        course({ id: c.id, date: state.date });
      };
    });
  }

  /* ---------- AI 整理 + 预览确认 ---------- */

  async function runParse(c, raw) {
    UI.loading(true, 'AI 正在拆分作业…');
    var tasks;
    try {
      tasks = await AI.parseHomework(raw, c.type);
    } catch (e) {
      UI.loading(false);
      UI.toast(e.message || 'AI 分析失败');
      return;
    }
    UI.loading(false);
    previewTasks(c, tasks);
  }

  function previewTasks(c, tasks) {
    var draft = tasks.map(function (t) {
      return { id: Store.uid('t'), text: t.text, type: t.type, completed: false };
    });
    var hasOld = cur.rec.tasks && cur.rec.tasks.length;

    function body() {
      return draft.map(function (t, i) {
        return '<div class="preview-item">' +
          '<select data-i="' + i + '">' +
          ['student', 'parent', 'reminder'].map(function (k) {
            return '<option value="' + k + '"' + (t.type === k ? ' selected' : '') + '>' +
              (k === 'student' ? '孩子' : k === 'parent' ? '家长' : '提醒') + '</option>';
          }).join('') + '</select>' +
          '<input type="text" data-i="' + i + '" value="' + esc(t.text) + '">' +
          '<button class="task-x" data-rm="' + i + '">×</button></div>';
      }).join('');
    }

    function html() {
      return '<h2>AI 分析预览</h2>' +
        '<p class="sheet-sub">AI 只是录入助手，确认无误再保存。可以改文字、改类型、删除或补充。</p>' +
        '<div id="pv-list">' + body() + '</div>' +
        '<div class="spacer"></div><button class="btn ghost sm" data-act="pv-add">+ 添加一条</button>' +
        '<div class="sheet-actions">' +
        '<button class="btn ghost" data-act="pv-cancel">取消</button>' +
        (hasOld ? '<button class="btn dark" data-act="pv-append">追加</button>' : '') +
        '<button class="btn primary" data-act="pv-save">' + (hasOld ? '替换' : '确认保存') + '</button>' +
        '</div>';
    }

    function open() {
      UI.openSheet(html(), function (root) {
        root.querySelectorAll('#pv-list input').forEach(function (inp) {
          inp.oninput = function () { draft[+inp.dataset.i].text = inp.value; };
        });
        root.querySelectorAll('#pv-list select').forEach(function (sel) {
          sel.onchange = function () { draft[+sel.dataset.i].type = sel.value; };
        });
        root.querySelectorAll('[data-rm]').forEach(function (b) {
          b.onclick = function () { draft.splice(+b.dataset.rm, 1); open(); };
        });
        root.querySelector('[data-act="pv-add"]').onclick = function () {
          draft.push({ id: Store.uid('t'), text: '', type: 'student', completed: false });
          open();
        };
        root.querySelector('[data-act="pv-cancel"]').onclick = UI.closeSheet;
        var save = async function (append) {
          var clean = draft.filter(function (t) { return (t.text || '').trim(); });
          if (!clean.length) { UI.toast('清单是空的'); return; }
          cur.rec.tasks = append ? cur.rec.tasks.concat(clean) : clean;
          await Store.saveRecord(cur.rec);
          UI.closeSheet();
          UI.toast('已保存 ' + clean.length + ' 条作业');
          course({ id: cur.course.id, date: state.date });
        };
        root.querySelector('[data-act="pv-save"]').onclick = function () { save(false); };
        var ap = root.querySelector('[data-act="pv-append"]');
        if (ap) ap.onclick = function () { save(true); };
      });
    }
    open();
  }

  /* ---------- AI tab（数学 / 英语 / PBL） ---------- */

  async function renderCourseAI(c) {
    var html = '<div class="content tight pane">' + dateStripHTML(state.date) +
      (await courseSwitchHTML(c));

    if (!AI.hasKey()) {
      html += '<div class="banner warn">还没填 API Key，图片分析不可用。到「设置 → DeepSeek API」填写后再回来。</div>';
    } else if (!AI.visionReady()) {
      html += '<div class="banner warn">还没配置图片模型。到「设置 → DeepSeek API」把图片模型填成 ' +
        esc(Store.DEFAULT_VISION_MODEL) + ' 就能拍照分析了。</div>';
    }

    var label = c.type === 'math' ? '数学作业照片' : (c.type === 'pbl' ? 'PBL 学习材料' : '默写单词照片');
    var tip = c.type === 'math'
      ? 'AI 只分析题目考查了哪些知识点，不给答案、不出练习题。'
      : (c.type === 'pbl' ? 'AI 提取材料里的单词和核心表达，复制后可以粘到别的 App。'
        : 'AI 只提取英文单词，不输出中文、音标和例句。');

    html += '<div class="section"><div class="tag-head"><span>' + esc(label) + '</span></div>' +
      '<p class="hint">' + esc(tip) + '</p><div class="spacer"></div>' +
      '<button class="btn primary block" data-act="pick">拍照 / 选择图片</button>' +
      '<p class="muted" style="margin-top:8px">' +
      (Store.settings.keepImages ? '当前设置：分析后保留原图。' : '默认分析完就释放图片，只保存文字结果，App 不会越用越大。') +
      '</p></div>';

    html += '<div class="section" id="ai-results">' + (await aiResultsHTML(c)) + '</div></div>';

    view.innerHTML = html;
    bindDateStrip(view, function () { course({ id: c.id, date: state.date }); });
    bindCourseSwitch(view);
    view.querySelector('[data-act="pick"]').onclick = function () { pickAndAnalyze(c); };
    await bindAIResults(c);
  }

  async function aiResultsHTML(c) {
    if (c.type === 'math') {
      var entries = await Store.getMathKnowledgeByRecord(state.date, c.id);
      if (!entries.length) return emptyBox('这天还没有知识点', '上传数学作业照片，AI 会提取知识点并存进「知识」页。');
      var html = '<div class="tag-head"><span>' + Store.shortDate(state.date) + ' 的知识点</span></div>';
      entries.forEach(function (e) {
        html += '<div class="card">' +
          chipsBlock('核心知识点', e.coreKnowledge, 'k', e.id) +
          chipsBlock('细分能力点', e.skills, 's', e.id) +
          '<div class="spacer"></div><div class="btn-row">' +
          '<button class="btn sm ghost" data-del-mk="' + esc(e.id) + '">删除</button>' +
          '<button class="btn sm primary" data-copy-mk="' + esc(e.id) + '">复制知识点</button>' +
          '</div></div>';
      });
      return html;
    }

    var recs = await Store.getWordRecords(state.date, c.id);
    if (!recs.length) {
      return emptyBox('这天还没有提词结果',
        c.type === 'pbl' ? '上传 PBL 材料照片，AI 会提取单词和核心表达。' : '上传单词表照片，AI 会把英文单词提取出来。');
    }
    var out = '<div class="tag-head"><span>' + Store.shortDate(state.date) + ' 的结果</span></div>';
    recs.forEach(function (r) {
      out += '<div class="card">' +
        chipsBlock('Words（单词）', r.words, 'w', r.id) +
        (c.type === 'pbl' ? listBlock('Key Expressions（核心表达）', r.expressions) : '') +
        '<div class="spacer"></div><div class="btn-row">' +
        '<button class="btn sm ghost" data-del-w="' + esc(r.id) + '">删除</button>' +
        '<button class="btn sm primary" data-copy-w="' + esc(r.id) + '">复制单词</button>' +
        (c.type === 'pbl' && (r.expressions || []).length
          ? '<button class="btn sm dark" data-copy-e="' + esc(r.id) + '">复制表达</button>' : '') +
        '</div></div>';
    });
    return out;
  }

  function chipsBlock(title, items, kind, id) {
    if (!items || !items.length) return '';
    return '<div class="task-group"><div class="task-group-title">' + esc(title) + '</div><div class="chips">' +
      items.map(function (x) { return '<span class="chip blue">' + esc(x) + '</span>'; }).join('') +
      '</div></div>';
  }

  function listBlock(title, items) {
    if (!items || !items.length) return '';
    return '<div class="task-group"><div class="task-group-title">' + esc(title) + '</div><ul class="list-lines">' +
      items.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div>';
  }

  async function bindAIResults(c) {
    view.querySelectorAll('[data-copy-mk]').forEach(function (b) {
      b.onclick = async function () {
        var e = await DB.get('mathKnowledge', b.dataset.copyMk);
        if (!e) return;
        var lines = (e.coreKnowledge || []).concat(e.skills || []);
        UI.copy(lines.join('\n'), '已复制 ' + lines.length + ' 个知识点');
      };
    });
    view.querySelectorAll('[data-del-mk]').forEach(function (b) {
      b.onclick = async function () {
        var ok = await UI.confirm({ title: '删除这组知识点？', body: '知识脉络里也会同步减少。', danger: true, okText: '删除' });
        if (!ok) return;
        await Store.deleteMathKnowledge(b.dataset.delMk);
        course({ id: c.id, date: state.date });
      };
    });
    view.querySelectorAll('[data-copy-w]').forEach(function (b) {
      b.onclick = async function () {
        var r = await DB.get('wordRecords', b.dataset.copyW);
        if (!r) return;
        UI.copy((r.words || []).join('\n'), '已复制 ' + (r.words || []).length + ' 个单词');
      };
    });
    view.querySelectorAll('[data-copy-e]').forEach(function (b) {
      b.onclick = async function () {
        var r = await DB.get('wordRecords', b.dataset.copyE);
        if (!r) return;
        UI.copy((r.expressions || []).join('\n'), '已复制 ' + (r.expressions || []).length + ' 条表达');
      };
    });
    view.querySelectorAll('[data-del-w]').forEach(function (b) {
      b.onclick = async function () {
        var ok = await UI.confirm({ title: '删除这组结果？', danger: true, okText: '删除' });
        if (!ok) return;
        await Store.deleteWordRecord(b.dataset.delW);
        course({ id: c.id, date: state.date });
      };
    });
  }

  async function pickAndAnalyze(c) {
    if (!navigator.onLine) { UI.toast('当前离线，AI 功能需要网络。'); return; }
    if (!AI.hasKey()) { UI.toast('请先到设置里填写 API Key'); return; }
    if (!AI.visionReady()) {
      UI.toast('还没配置图片模型，到「设置」把图片模型填成 ' + Store.DEFAULT_VISION_MODEL + ' 就能用。');
      return;
    }
    var files = await UI.pickImages(true);
    if (!files.length) return;
    if (files.length > 4) files = files.slice(0, 4);

    UI.loading(true, '正在压缩图片…');
    var urls = [];
    try {
      for (var i = 0; i < files.length; i++) urls.push(await AI.compressImage(files[i], 1024, 0.82));
    } catch (e) {
      UI.loading(false); UI.toast('图片处理失败，换一张试试'); return;
    }

    UI.loading(true, 'AI 正在分析 ' + urls.length + ' 张图片…');
    try {
      if (c.type === 'math') {
        var r = await AI.analyzeMathImages(urls);
        UI.loading(false);
        if (!r.coreKnowledge.length && !r.skills.length) { UI.toast('AI 没识别出知识点，换张更清晰的照片试试'); return; }
        previewMath(c, r, Store.settings.keepImages ? urls : null);
      } else if (c.type === 'pbl') {
        var p = await AI.analyzePBL(urls);
        UI.loading(false);
        if (!p.words.length && !p.expressions.length) { UI.toast('AI 没识别出内容，换张更清晰的照片试试'); return; }
        previewWords(c, p, Store.settings.keepImages ? urls : null);
      } else {
        var w = await AI.extractWords(urls);
        UI.loading(false);
        if (!w.words.length) { UI.toast('AI 没识别出单词，换张更清晰的照片试试'); return; }
        previewWords(c, { words: w.words, expressions: [] }, Store.settings.keepImages ? urls : null);
      }
    } catch (e) {
      UI.loading(false);
      UI.toast(e.message || 'AI 分析失败');
    }
    urls.length = 0; // 默认不长期保存原图
  }

  function editableChips(listName, items, draft) {
    return '<div class="task-group"><div class="task-group-title">' + esc(listName) + '</div><div class="chips">' +
      items.map(function (x, i) {
        return '<span class="chip blue">' + esc(x) +
          '<button data-rm-list="' + draft + '" data-i="' + i + '">×</button></span>';
      }).join('') + '</div></div>';
  }

  function previewMath(c, result, keepUrls) {
    var draft = { coreKnowledge: result.coreKnowledge.slice(), skills: result.skills.slice() };

    function open() {
      var html = '<h2>知识点预览</h2>' +
        '<p class="sheet-sub">确认后保存到 ' + esc(Store.humanDate(state.date)) + '，并计入知识脉络。</p>' +
        editableChips('核心知识点', draft.coreKnowledge, 'coreKnowledge') +
        editableChips('细分能力点', draft.skills, 'skills') +
        '<div class="field" style="margin-top:10px"><label>补充一条（回车添加）</label>' +
        '<input type="text" id="mk-add" placeholder="例如 20以内退位减法"></div>' +
        '<div class="sheet-actions"><button class="btn ghost" data-act="cancel">取消</button>' +
        '<button class="btn primary" data-act="save">确认保存</button></div>';

      UI.openSheet(html, function (root) {
        root.querySelectorAll('[data-rm-list]').forEach(function (b) {
          b.onclick = function () { draft[b.dataset.rmList].splice(+b.dataset.i, 1); open(); };
        });
        root.querySelector('#mk-add').addEventListener('keydown', function (e) {
          if (e.key !== 'Enter') return;
          var v = e.target.value.trim();
          if (!v) return;
          draft.coreKnowledge.push(v);
          open();
        });
        root.querySelector('[data-act="cancel"]').onclick = UI.closeSheet;
        root.querySelector('[data-act="save"]').onclick = async function () {
          if (!draft.coreKnowledge.length && !draft.skills.length) { UI.toast('至少保留一个知识点'); return; }
          await Store.saveMathKnowledge({
            date: state.date,
            gradeId: c.gradeId,
            courseId: c.id,
            coreKnowledge: draft.coreKnowledge,
            skills: draft.skills,
            images: keepUrls || undefined
          });
          UI.closeSheet();
          UI.toast('已保存到 ' + Store.shortDate(state.date));
          course({ id: c.id, date: state.date });
        };
      });
    }
    open();
  }

  function previewWords(c, result, keepUrls) {
    var draft = { words: result.words.slice(), expressions: (result.expressions || []).slice() };
    var isPBL = c.type === 'pbl';

    function open() {
      var html = '<h2>提词预览</h2>' +
        '<p class="sheet-sub">确认后保存到 ' + esc(Store.humanDate(state.date)) + '。</p>' +
        editableChips('Words（单词）', draft.words, 'words') +
        (isPBL ? editableChips('Key Expressions（核心表达）', draft.expressions, 'expressions') : '') +
        '<div class="field" style="margin-top:10px"><label>补充单词（回车添加）</label>' +
        '<input type="text" id="w-add" placeholder="例如 garden"></div>' +
        '<div class="sheet-actions"><button class="btn ghost" data-act="cancel">取消</button>' +
        '<button class="btn primary" data-act="save">确认保存</button></div>';

      UI.openSheet(html, function (root) {
        root.querySelectorAll('[data-rm-list]').forEach(function (b) {
          b.onclick = function () { draft[b.dataset.rmList].splice(+b.dataset.i, 1); open(); };
        });
        root.querySelector('#w-add').addEventListener('keydown', function (e) {
          if (e.key !== 'Enter') return;
          var v = e.target.value.trim();
          if (!v) return;
          draft.words.push(v);
          open();
        });
        root.querySelector('[data-act="cancel"]').onclick = UI.closeSheet;
        root.querySelector('[data-act="save"]').onclick = async function () {
          if (!draft.words.length && !draft.expressions.length) { UI.toast('结果是空的'); return; }
          await Store.saveWordRecord({
            date: state.date,
            gradeId: c.gradeId,
            courseId: c.id,
            courseType: c.type,
            words: draft.words,
            expressions: draft.expressions,
            images: keepUrls || undefined
          });
          UI.closeSheet();
          UI.toast('已保存 ' + draft.words.length + ' 个单词');
          course({ id: c.id, date: state.date });
        };
      });
    }
    open();
  }

  /* ================= 日历 ================= */

  async function calendar() {
    var grade = await Store.currentGrade();
    state.grade = grade;
    setTopbar({ title: '日历', sub: grade ? grade.name + ' · 点日期查看当天作业' : '' });

    var y = state.calMonth.y, m = state.calMonth.m;
    var records = await Store.getRecordsInMonth(y, m, grade ? grade.id : '');
    var marked = {};
    records.forEach(function (r) {
      if ((r.tasks && r.tasks.length) || (r.rawText || '').trim()) marked[r.date] = true;
    });

    var first = new Date(y, m, 1);
    var days = new Date(y, m + 1, 0).getDate();
    var lead = first.getDay();
    var todayK = Store.todayKey();

    var html = '<div class="content cal">' +
      '<div class="cal-head"><button data-act="pm">‹</button>' +
      '<span class="m">' + y + '年' + (m + 1) + '月</span>' +
      '<button data-act="nm">›</button></div><div class="cal-grid">';

    ['日', '一', '二', '三', '四', '五', '六'].forEach(function (d) {
      html += '<div class="cal-dow">' + d + '</div>';
    });
    for (var i = 0; i < lead; i++) html += '<div class="cal-cell blank"></div>';
    for (var d = 1; d <= days; d++) {
      var key = y + '-' + Store.pad(m + 1) + '-' + Store.pad(d);
      var cls = 'cal-cell';
      if (key === todayK) cls += ' today';
      if (key === state.date) cls += ' sel';
      html += '<button class="' + cls + '" data-day="' + key + '">' + d +
        (marked[key] ? '<span class="dot"></span>' : '<span style="height:5px"></span>') + '</button>';
    }
    html += '</div>';

    html += '<div class="day-list" id="day-list"></div></div>';
    view.innerHTML = html;

    view.querySelector('[data-act="pm"]').onclick = function () {
      state.calMonth.m--; if (state.calMonth.m < 0) { state.calMonth.m = 11; state.calMonth.y--; }
      calendar();
    };
    view.querySelector('[data-act="nm"]').onclick = function () {
      state.calMonth.m++; if (state.calMonth.m > 11) { state.calMonth.m = 0; state.calMonth.y++; }
      calendar();
    };
    view.querySelectorAll('[data-day]').forEach(function (b) {
      b.onclick = function () { state.date = b.dataset.day; calendar(); };
    });

    await renderDayList();
  }

  async function renderDayList() {
    var box = document.getElementById('day-list');
    if (!box) return;
    var grade = state.grade;
    var courses = await Store.getCourses(grade ? grade.id : '');
    var html = '<div class="tag-head"><span>' + esc(Store.humanDate(state.date)) + '</span></div>';

    if (!courses.length) {
      box.innerHTML = html + emptyBox('还没有课程', '先到设置里添加课程和老师。');
      return;
    }

    var any = false;
    for (var i = 0; i < courses.length; i++) {
      var c = courses[i];
      var rec = await Store.getRecord(state.date, c.id);
      var n = taskCounts(rec);
      var note = n.total ? n.total + ' 项 · ' + n.done + ' 项完成'
        : ((rec && (rec.rawText || '').trim()) ? '已存原文' : '未录入');
      if (n.total || (rec && (rec.rawText || '').trim())) any = true;
      html += '<button class="day-row" data-course="' + esc(c.id) + '">' + avatarHTML(c) +
        '<span class="course-main"><span class="course-name" style="font-size:16px">' + esc(c.name) + '</span>' +
        '<span class="course-teacher">' + esc(c.teacherName || '') + '</span></span>' +
        '<span class="n">' + esc(note) + '</span></button>';
    }
    if (!any) html += '<p class="muted" style="text-align:center">这天还没有记录，点课程可以直接录入。</p>';

    box.innerHTML = html;
    box.querySelectorAll('[data-course]').forEach(function (b) {
      b.onclick = function () {
        state.courseTab = 'homework';
        Router.go('/course', { id: b.dataset.course, date: state.date });
      };
    });
  }

  /* ================= 知识脉络 ================= */

  function rangeOf(mode) {
    var now = new Date();
    if (mode === 'week') {
      var start = new Date(now);
      start.setDate(now.getDate() - ((now.getDay() + 6) % 7)); // 周一
      var end = new Date(start);
      end.setDate(start.getDate() + 6);
      return { from: Store.toKey(start), to: Store.toKey(end) };
    }
    if (mode === 'month') {
      return {
        from: Store.toKey(new Date(now.getFullYear(), now.getMonth(), 1)),
        to: Store.toKey(new Date(now.getFullYear(), now.getMonth() + 1, 0))
      };
    }
    return { from: state.range.from, to: state.range.to };
  }

  async function knowledge() {
    var grade = await Store.currentGrade();
    state.grade = grade;
    if (!state.range.from) {
      var r = rangeOf('month');
      state.range.from = r.from; state.range.to = r.to;
    }

    setTopbar({ title: '数学知识脉络', sub: grade ? grade.name + ' · 看得出这段时间学过什么' : '' });

    var r2 = state.range.mode === 'custom' ? { from: state.range.from, to: state.range.to } : rangeOf(state.range.mode);
    state.range.from = r2.from; state.range.to = r2.to;

    var entries = await Store.getMathKnowledge(r2.from, r2.to, grade ? grade.id : '');
    var groups = Store.aggregate(entries);
    var total = groups.reduce(function (n, g) { return n + g.items.length; }, 0);

    var html = '<div class="content kp">' +
      '<div class="range-bar">' +
      ['week', 'month', 'custom'].map(function (k) {
        return '<button data-range="' + k + '" class="' + (state.range.mode === k ? 'on' : '') + '">' +
          (k === 'week' ? '本周' : k === 'month' ? '本月' : '自定义') + '</button>';
      }).join('') + '</div>';

    if (state.range.mode === 'custom') {
      html += '<div class="card span"><div class="input-row">' +
        '<input type="date" id="r-from" value="' + esc(state.range.from) + '">' +
        '<span>—</span>' +
        '<input type="date" id="r-to" value="' + esc(state.range.to) + '">' +
        '</div></div>';
    } else {
      html += '<p class="muted" style="margin:-4px 0 12px">' +
        esc(Store.shortDate(state.range.from)) + ' — ' + esc(Store.shortDate(state.range.to)) + '</p>';
    }

    if (!total) {
      html += emptyBox('这段时间还没有知识点', '在数学课的「AI 知识点」里上传作业照片，知识点会自动汇总到这里。');
    } else {
      groups.forEach(function (g) {
        html += '<div class="card"><p class="kp-cat">' + esc(g.name) +
          '<span class="count">' + g.items.length + ' 个</span></p>';
        g.items.forEach(function (it) {
          html += '<div class="kp-line"><span class="kp-name">' + esc(it.name) + '</span>' +
            '<span class="kp-meta">首次 ' + esc(Store.shortDate(it.firstSeen)) + ' · ' + it.count + ' 次</span></div>';
        });
        html += '</div>';
      });
      html += '<button class="btn primary block" data-act="copy-all">复制这段时间的知识点</button>' +
        '<p class="muted" style="text-align:center;margin-top:10px">共 ' + total + ' 个知识点，来自 ' + entries.length + ' 次分析</p>';
    }

    view.innerHTML = html + '</div>';

    view.querySelectorAll('[data-range]').forEach(function (b) {
      b.onclick = function () {
        state.range.mode = b.dataset.range;
        if (b.dataset.range !== 'custom') {
          var rr = rangeOf(b.dataset.range);
          state.range.from = rr.from; state.range.to = rr.to;
        }
        knowledge();
      };
    });
    var f = view.querySelector('#r-from'), t = view.querySelector('#r-to');
    if (f) f.onchange = function () { state.range.from = f.value; knowledge(); };
    if (t) t.onchange = function () { state.range.to = t.value; knowledge(); };

    var ca = view.querySelector('[data-act="copy-all"]');
    if (ca) ca.onclick = function () {
      var lines = [];
      groups.forEach(function (g) {
        g.items.forEach(function (it) { if (lines.indexOf(it.name) < 0) lines.push(it.name); });
      });
      UI.copy(lines.join('\n'), '已复制 ' + lines.length + ' 个知识点');
    };
  }

  /* ================= 设置 ================= */

  async function settings() {
    var s = Store.settings;
    var grade = await Store.currentGrade();
    setTopbar({ title: '设置', sub: '小萄作业管家 · 家长端' });

    var storageNote = DB.mode === 'idb'
      ? 'IndexedDB'
      : (DB.mode === 'local' ? 'localStorage（当前环境不支持 IndexedDB）' : '仅内存（请尽快导出 JSON 备份）');

    var html = '<div class="content">' +
      '<div class="card">' +
      '<button class="manage-row" style="width:100%;text-align:left" data-go="/grades">' +
      '<span class="m-main"><b>年级管理</b><span>当前：' + esc(grade ? grade.name : '未设置') + '</span></span>' +
      '<span class="chev">›</span></button>' +
      '<button class="manage-row" style="width:100%;text-align:left" data-go="/courses">' +
      '<span class="m-main"><b>课程 / 老师管理</b><span>添加、编辑、排序、归档</span></span>' +
      '<span class="chev">›</span></button>' +
      '<button class="manage-row" style="width:100%;text-align:left" data-go="/data">' +
      '<span class="m-main"><b>数据管理</b><span>JSON 导出 / 导入，换手机用</span></span>' +
      '<span class="chev">›</span></button>' +
      '</div>';

    html += '<div class="tag-head"><span>DeepSeek API</span></div><div class="card">' +
      '<div class="field"><label>API Key</label><div class="input-row">' +
      '<input type="password" id="s-key" value="' + esc(s.apiKey) + '" placeholder="sk-…" autocomplete="off">' +
      '<button class="btn sm ghost" data-act="toggle-key">显示</button></div></div>' +
      '<div class="field"><label>API Endpoint</label>' +
      '<input type="text" id="s-ep" value="' + esc(s.endpoint) + '" placeholder="https://api.deepseek.com/chat/completions"></div>' +
      '<div class="field"><label>文字模型（作业整理）</label>' +
      '<input type="text" id="s-model" value="' + esc(s.model) + '" placeholder="' + Store.DEFAULT_MODEL + '"></div>' +
      '<div class="field"><label>图片模型（知识点 / 提词）</label>' +
      '<input type="text" id="s-vmodel" value="' + esc(s.visionModel) + '" placeholder="' + Store.DEFAULT_VISION_MODEL + '"></div>' +
      '<div class="field"><label>图片模型 Endpoint（留空则同上）</label>' +
      '<input type="text" id="s-vep" value="' + esc(s.visionEndpoint) + '" placeholder="同上，除非图片模型在别家"></div>' +
      '<p class="hint">DeepSeek 现在能读图片了：图片模型填 ' + Store.DEFAULT_VISION_MODEL +
      '，和文字模型共用同一个 Key 和 Endpoint。文字模型填 ' + Store.DEFAULT_MODEL +
      '（旧的 deepseek-chat 已不在官方模型列表里）。</p>' +
      '<div class="btn-row"><button class="btn ghost" data-act="test">测试连接</button>' +
      '<button class="btn primary" data-act="save-api">保存</button></div>' +
      '<p id="api-status" class="muted" style="margin-top:10px">' +
      (AI.hasKey() ? '已填写 API Key。' : '还没有填写 API Key。') + '</p>' +
      '<p class="muted">API Key 仅保存在当前设备，不会写进 JSON 备份，也不会上传到任何服务器。</p>' +
      '<div class="spacer"></div>' +
      '<button class="btn sm danger" data-act="clear-key">清除 API Key</button>' +
      '</div>';

    html += '<div class="tag-head"><span>图片</span></div><div class="card">' +
      '<div class="switch-row"><span class="switch-text"><b>保留分析用的原图</b>' +
      '<span class="muted">默认关闭。开启后备份文件会明显变大。</span></span>' +
      '<button class="switch' + (s.keepImages ? ' on' : '') + '" id="sw-keep" role="switch" aria-checked="' +
      (s.keepImages ? 'true' : 'false') + '"><i></i></button></div></div>';

    html += '<div class="tag-head"><span>关于</span></div><div class="card">' +
      '<p class="hint">小萄作业管家 v1.0 · 家长端 PWA<br>' +
      '本地存储：' + esc(storageNote) + '<br>' +
      '所有数据保存在这台设备上，没有账号，没有云端。</p>' +
      (location.protocol === 'file:'
        ? '<p class="hint" style="margin-top:8px">当前是本地单文件模式。作业、日历、知识脉络都能正常用；' +
          '部分浏览器会拦截本地文件发出的跨域请求，如果 AI 报网络错误，改用网页版即可。</p>'
        : '') +
      '</div>';

    html += '<div class="foot-note">小萄 / Henry 同学，加油！</div></div>';

    view.innerHTML = html;

    view.querySelectorAll('[data-go]').forEach(function (b) {
      b.onclick = function () { Router.go(b.dataset.go); };
    });

    var keyInput = view.querySelector('#s-key');
    view.querySelector('[data-act="toggle-key"]').onclick = function () {
      var showing = keyInput.type === 'text';
      keyInput.type = showing ? 'password' : 'text';
      this.textContent = showing ? '显示' : '隐藏';
    };

    async function saveApi() {
      await Store.setSetting('apiKey', keyInput.value.trim());
      await Store.setSetting('endpoint', view.querySelector('#s-ep').value.trim());
      await Store.setSetting('model', view.querySelector('#s-model').value.trim() || Store.DEFAULT_MODEL);
      await Store.setSetting('visionModel', view.querySelector('#s-vmodel').value.trim());
      await Store.setSetting('visionEndpoint', view.querySelector('#s-vep').value.trim());
    }

    view.querySelector('[data-act="save-api"]').onclick = async function () {
      await saveApi();
      UI.toast('设置已保存到本机');
      view.querySelector('#api-status').textContent = AI.hasKey() ? '已填写 API Key。' : '还没有填写 API Key。';
    };

    view.querySelector('[data-act="test"]').onclick = async function () {
      await saveApi();
      var st = view.querySelector('#api-status');
      UI.loading(true, '正在测试连接…');
      try {
        await AI.testConnection();
        st.textContent = '连接成功，文字模型可用。';
        UI.toast('连接成功');
      } catch (e) {
        st.textContent = '连接失败：' + e.message;
        UI.toast('连接失败');
      }
      UI.loading(false);
    };

    view.querySelector('[data-act="clear-key"]').onclick = async function () {
      var ok = await UI.confirm({ title: '清除 API Key？', body: '清除后 AI 功能会停用，其他数据不受影响。', danger: true, okText: '清除' });
      if (!ok) return;
      await Store.setSetting('apiKey', '');
      UI.toast('已清除');
      settings();
    };

    view.querySelector('#sw-keep').onclick = async function () {
      var on = !Store.settings.keepImages;
      await Store.setSetting('keepImages', on);
      this.classList.toggle('on', on);
      this.setAttribute('aria-checked', on ? 'true' : 'false');
      UI.toast(on ? '分析后会保留原图' : '分析后不再保留原图');
    };
  }

  /* ---------- 年级管理页 ---------- */

  async function grades() {
    setTopbar({ back: true, title: '年级管理', sub: '历史年级的数据会一直保留' });
    var list = await Store.getGrades();
    var cur2 = await Store.currentGrade();

    var html = '<div class="content"><div class="card">';
    list.forEach(function (g) {
      html += '<div class="manage-row">' +
        '<span class="m-main"><b>' + esc(g.name) + (g.archived ? ' · 已归档' : '') + '</b>' +
        '<span>' + (cur2 && g.id === cur2.id ? '当前年级' : '历史年级') + '</span></span>' +
        (cur2 && g.id === cur2.id ? '' : '<button class="btn sm ghost" data-set="' + esc(g.id) + '">设为当前</button>') +
        '<button class="btn sm ghost" data-ren="' + esc(g.id) + '">改名</button>' +
        '</div>';
    });
    html += '</div><button class="btn primary block" data-act="add">+ 新增年级</button></div>';
    view.innerHTML = html;

    view.querySelectorAll('[data-set]').forEach(function (b) {
      b.onclick = async function () { await Store.setCurrentGrade(b.dataset.set); UI.toast('已切换'); grades(); };
    });
    view.querySelectorAll('[data-ren]').forEach(function (b) {
      b.onclick = async function () {
        var g = await DB.get('grades', b.dataset.ren);
        var v = await UI.prompt({ title: '年级改名', value: g.name });
        if (!v) return;
        await Store.renameGrade(g.id, v);
        grades();
      };
    });
    view.querySelector('[data-act="add"]').onclick = async function () {
      var name = await UI.prompt({ title: '新增年级', placeholder: '例如 二年级', okText: '创建' });
      if (!name) return;
      await Store.addGrade(name);
      UI.toast('年级已创建');
      grades();
    };
  }

  /* ---------- 课程 / 老师管理页 ---------- */

  async function coursesPage() {
    var grade = await Store.currentGrade();
    state.grade = grade;
    setTopbar({ back: true, title: '课程 / 老师', sub: grade ? grade.name : '' });

    var list = await Store.getCourses(grade ? grade.id : '', true);
    var html = '<div class="content">';

    if (!list.length) {
      html += emptyBox('还没有课程', '每位老师一张卡片。PBL 英语有独立老师，就单独建一个课程。');
    } else {
      html += '<div class="card">';
      list.forEach(function (c) {
        html += '<div class="manage-row">' + avatarHTML(c) +
          '<span class="m-main"><b>' + esc(c.name) + (c.archived ? ' · 已归档' : '') + '</b>' +
          '<span>' + esc(c.teacherName || '未填老师') + ' · ' + esc(Store.typeLabel(c.type)) + '</span></span>' +
          '<span class="order-btns"><button data-up="' + esc(c.id) + '">▲</button>' +
          '<button data-down="' + esc(c.id) + '">▼</button></span>' +
          '<button class="btn sm ghost" data-edit="' + esc(c.id) + '">编辑</button></div>';
      });
      html += '</div>';
    }

    html += '<button class="btn primary block" data-act="add">+ 添加课程 / 老师</button>' +
      '<p class="muted" style="margin-top:10px">归档不会删除历史作业记录，只是从首页隐藏。</p></div>';

    view.innerHTML = html;

    view.querySelectorAll('[data-up]').forEach(function (b) {
      b.onclick = async function () { await Store.moveCourse(b.dataset.up, -1); coursesPage(); };
    });
    view.querySelectorAll('[data-down]').forEach(function (b) {
      b.onclick = async function () { await Store.moveCourse(b.dataset.down, 1); coursesPage(); };
    });
    view.querySelectorAll('[data-edit]').forEach(function (b) {
      b.onclick = async function () { courseSheet(await DB.get('courses', b.dataset.edit)); };
    });
    view.querySelector('[data-act="add"]').onclick = function () {
      courseSheet({ gradeId: grade.id, type: 'chinese', name: '', teacherName: '' });
    };
  }

  function courseSheet(c) {
    var draft = {
      id: c.id || '',
      gradeId: c.gradeId,
      name: c.name || '',
      teacherName: c.teacherName || '',
      type: c.type || 'chinese',
      teacherAvatar: c.teacherAvatar || '',
      archived: !!c.archived
    };

    function html() {
      return '<h2>' + (draft.id ? '编辑课程' : '添加课程') + '</h2>' +
        '<p class="sheet-sub">课程类型决定这门课有哪些 AI 功能。</p>' +
        '<div class="field"><label>课程名称</label>' +
        '<input type="text" id="c-name" data-autofocus="1" value="' + esc(draft.name) + '" placeholder="例如 数学"></div>' +
        '<div class="field"><label>老师姓名</label>' +
        '<input type="text" id="c-teacher" value="' + esc(draft.teacherName) + '" placeholder="例如 李老师"></div>' +
        '<div class="field"><label>课程类型</label><select id="c-type">' +
        Store.COURSE_TYPES.map(function (t) {
          return '<option value="' + t.key + '"' + (draft.type === t.key ? ' selected' : '') + '>' + t.label + '</option>';
        }).join('') + '</select></div>' +
        '<div class="field"><label>老师头像</label>' +
        '<div class="input-row">' +
        (draft.teacherAvatar
          ? '<span class="avatar"><img src="' + esc(draft.teacherAvatar) + '" alt=""></span>'
          : '<span class="avatar">' + esc(Store.typeIcon(draft.type)) + '</span>') +
        '<button class="btn sm ghost" data-act="avatar">上传头像</button>' +
        (draft.teacherAvatar ? '<button class="btn sm ghost" data-act="avatar-rm">移除</button>' : '') +
        '</div></div>' +
        (draft.id
          ? '<button class="btn sm ' + (draft.archived ? 'ghost' : 'danger') + '" data-act="arch">' +
            (draft.archived ? '取消归档' : '归档这门课') + '</button>'
          : '') +
        '<div class="sheet-actions"><button class="btn ghost" data-act="cancel">取消</button>' +
        '<button class="btn primary" data-act="save">保存</button></div>';
    }

    function open() {
      UI.openSheet(html(), function (root) {
        root.querySelector('#c-type').onchange = function () { draft.type = this.value; };
        root.querySelector('#c-name').oninput = function () { draft.name = this.value; };
        root.querySelector('#c-teacher').oninput = function () { draft.teacherName = this.value; };

        root.querySelector('[data-act="avatar"]').onclick = async function () {
          var files = await UI.pickImages(false);
          if (!files.length) return;
          try {
            draft.teacherAvatar = await AI.compressImage(files[0], 160, 0.8);
            open();
          } catch (e) { UI.toast('头像处理失败'); }
        };
        var rm = root.querySelector('[data-act="avatar-rm"]');
        if (rm) rm.onclick = function () { draft.teacherAvatar = ''; open(); };

        var ar = root.querySelector('[data-act="arch"]');
        if (ar) ar.onclick = async function () {
          draft.archived = !draft.archived;
          await Store.archiveCourse(draft.id, draft.archived);
          UI.toast(draft.archived ? '已归档' : '已取消归档');
          open();
        };

        root.querySelector('[data-act="cancel"]').onclick = UI.closeSheet;
        root.querySelector('[data-act="save"]').onclick = async function () {
          draft.name = root.querySelector('#c-name').value.trim();
          draft.teacherName = root.querySelector('#c-teacher').value.trim();
          if (!draft.name) { UI.toast('请填写课程名称'); return; }
          await Store.saveCourse(draft);
          UI.closeSheet();
          UI.toast('已保存');
          coursesPage();
        };
      });
    }
    open();
  }

  /* ---------- 数据管理页 ---------- */

  async function dataPage() {
    setTopbar({ back: true, title: '数据管理', sub: '换手机就靠这份 JSON' });

    var counts = Backup.summarize(await Backup.buildExport());
    var storageWarn = DB.mode === 'memory'
      ? '<div class="banner warn">当前浏览器不允许本地存储，数据只在这次会话里。请立刻导出 JSON，' +
        '或者改用 GitHub Pages 版本。</div>'
      : '';

    view.innerHTML = '<div class="content">' + storageWarn +
      '<div class="card"><p class="hint">当前设备上有：<br>' +
      counts.grades + ' 个年级 · ' + counts.courses + ' 门课程<br>' +
      counts.records + ' 条作业记录 · ' + counts.knowledge + ' 个知识点 · ' + counts.words + ' 个单词与表达</p></div>' +

      '<div class="tag-head"><span>导出备份</span></div><div class="card">' +
      '<p class="hint">导出全部数据（含老师头像），文件名 xiaotao-homework-backup-日期.json。' +
      'API Key 不会写进备份。</p><div class="spacer"></div>' +
      '<button class="btn primary block" data-act="export">导出 JSON</button></div>' +

      '<div class="tag-head"><span>导入备份</span></div><div class="card">' +
      '<p class="hint">导入会先显示备份内容，确认后覆盖当前设备的数据。导入前可以先导出一份当前数据。</p>' +
      '<div class="spacer"></div><button class="btn dark block" data-act="import">选择 JSON 文件</button></div>' +

      '<div class="tag-head"><span>换手机</span></div><div class="card"><p class="hint">' +
      '旧手机：设置 → 数据管理 → 导出 JSON<br>' +
      '新手机：打开网址 → 添加到主屏幕 → 导入 JSON → 填写 API Key</p></div></div>';

    view.querySelector('[data-act="export"]').onclick = async function () {
      try {
        var r = await Backup.exportJSON();
        UI.toast('已导出 ' + r.name);
      } catch (e) { UI.toast('导出失败：' + e.message); }
    };

    view.querySelector('[data-act="import"]').onclick = async function () {
      var file = await Backup.pickFile();
      if (!file) return;
      var payload;
      try { payload = await Backup.readFile(file); }
      catch (e) { UI.toast(e.message); return; }

      var err = Backup.validate(payload);
      if (err) { UI.toast(err); return; }

      var s = Backup.summarize(payload);
      var when = s.exportedAt ? s.exportedAt.slice(0, 10) : '未知日期';
      var ok = await UI.confirm({
        title: '确认恢复这份备份？',
        body: '备份日期：' + esc(when) + '<br>' +
          s.grades + ' 个年级 · ' + s.courses + ' 门课程<br>' +
          s.records + ' 条作业记录 · ' + s.knowledge + ' 个知识点 · ' + s.words + ' 个单词与表达<br><br>' +
          '导入后会覆盖当前设备上的数据。',
        okText: '继续', cancelText: '取消'
      });
      if (!ok) return;

      var backupFirst = await UI.confirm({
        title: '先导出当前数据吗？',
        body: '避免误覆盖。',
        okText: '先导出', cancelText: '直接导入'
      });
      if (backupFirst) {
        try { await Backup.exportJSON(); } catch (e) { /* 继续 */ }
      }

      UI.loading(true, '正在恢复数据…');
      try {
        await Backup.importJSON(payload);
        await Store.loadSettings();
        UI.loading(false);
        UI.toast('恢复完成');
        Router.go('/today');
      } catch (e) {
        UI.loading(false);
        UI.toast('导入失败：' + e.message);
      }
    };
  }

  return {
    mount: mount,
    setIconSrc: setIconSrc,
    state: state,
    today: today,
    course: course,
    calendar: calendar,
    knowledge: knowledge,
    settings: settings,
    grades: grades,
    coursesPage: coursesPage,
    dataPage: dataPage
  };
})();
