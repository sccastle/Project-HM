/* ai.js — AI 抽象层（默认 DeepSeek，兼容任何 OpenAI 格式接口）
   规则：
   - 只有用户明确点击 AI 按钮时才会调用这里的函数
   - 文字整理用 model（默认 deepseek-v4-flash）
   - 图片分析用 visionModel（默认 deepseek-v4-flash-vision-exp，DeepSeek 目前唯一收图片的模型）
     图片按 OpenAI 兼容格式的 image_url content block 传 Base64 data URL
   - 一律要求返回 JSON，前端做兜底解析，绝不因为一次失败而崩页面 */

window.AI = (function () {
  var TIMEOUT = 60000;

  function cfg() { return Store.settings; }

  function hasKey() { return !!(cfg().apiKey || '').trim(); }

  function visionReady() {
    var m = (cfg().visionModel || '').trim();
    return !!m;
  }

  function endpointFor(kind) {
    var c = cfg();
    if (kind === 'vision' && (c.visionEndpoint || '').trim()) return c.visionEndpoint.trim();
    return (c.endpoint || '').trim() || Store.DEFAULT_ENDPOINT;
  }

  /* ---------- 底层请求 ---------- */

  async function chat(messages, opts) {
    opts = opts || {};
    var c = cfg();

    if (!navigator.onLine) throw new AIError('当前离线，AI 功能需要网络。', 'offline');
    if (!hasKey()) throw new AIError('还没有填写 API Key，请到「设置」里填写。', 'nokey');

    var kind = opts.kind || 'text';
    var model = kind === 'vision'
      ? (c.visionModel || '').trim()
      : ((c.model || '').trim() || Store.DEFAULT_MODEL);
    if (kind === 'vision' && !model) {
      throw new AIError('还没有配置图片模型。到「设置」把图片模型填成 ' +
        Store.DEFAULT_VISION_MODEL + ' 就能用。', 'novision');
    }

    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, opts.timeout || TIMEOUT);

    var body = {
      model: model,
      messages: messages,
      temperature: opts.temperature == null ? 0.2 : opts.temperature,
      stream: false
    };
    if (opts.jsonMode !== false && kind === 'text') {
      body.response_format = { type: 'json_object' };
    }

    var res;
    try {
      res = await fetch(endpointFor(kind), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + c.apiKey.trim()
        },
        body: JSON.stringify(body),
        signal: ctrl.signal
      });
    } catch (e) {
      clearTimeout(timer);
      if (e.name === 'AbortError') throw new AIError('AI 请求超时，请稍后再试。', 'timeout');
      throw new AIError('网络请求失败。如果这是本地 html 文件，浏览器可能拦截了跨域请求，建议改用 GitHub Pages 版本。', 'network');
    }
    clearTimeout(timer);

    if (!res.ok) {
      var detail = '';
      try {
        var errJson = await res.json();
        detail = (errJson.error && (errJson.error.message || errJson.error.type)) || '';
      } catch (e) { /* ignore */ }
      var msg = 'AI 接口返回错误 ' + res.status;
      if (res.status === 400 && /does not support image|not support image|image/i.test(detail) && kind === 'vision') {
        throw new AIError('这个模型不能读图片。到「设置」把图片模型改成 ' +
          Store.DEFAULT_VISION_MODEL + ' 再试。', 'novision');
      }
      if (res.status === 401) msg = 'API Key 无效或已过期，请到设置里检查。';
      else if (res.status === 402) msg = '账户余额不足，请到 DeepSeek 平台充值。';
      else if (res.status === 429) msg = '请求太频繁，请过一会再试。';
      else if (detail) msg += '：' + detail;
      throw new AIError(msg, 'http_' + res.status);
    }

    var data = await res.json();
    var text = '';
    try {
      text = data.choices[0].message.content;
      if (Array.isArray(text)) {
        text = text.map(function (p) { return p.text || ''; }).join('');
      }
    } catch (e) { text = ''; }
    if (!text || !String(text).trim()) throw new AIError('AI 返回了空结果，请重试一次。', 'empty');
    return String(text);
  }

  function AIError(message, code) {
    this.name = 'AIError';
    this.message = message;
    this.code = code || 'unknown';
  }
  AIError.prototype = Object.create(Error.prototype);

  /* ---------- JSON 兜底解析 ---------- */

  function parseJSON(text) {
    var t = String(text).trim();
    // 去掉 markdown code fence
    t = t.replace(/^```(?:json|JSON)?\s*/m, '').replace(/```\s*$/m, '').trim();
    try { return JSON.parse(t); } catch (e) { /* continue */ }

    // 抓取第一个平衡的 { ... }
    var start = t.indexOf('{');
    if (start >= 0) {
      var depth = 0, inStr = false, esc = false;
      for (var i = start; i < t.length; i++) {
        var ch = t[i];
        if (inStr) {
          if (esc) esc = false;
          else if (ch === '\\') esc = true;
          else if (ch === '"') inStr = false;
          continue;
        }
        if (ch === '"') inStr = true;
        else if (ch === '{') depth++;
        else if (ch === '}') {
          depth--;
          if (depth === 0) {
            try { return JSON.parse(t.slice(start, i + 1)); } catch (e) { break; }
          }
        }
      }
    }
    throw new AIError('AI 返回的内容无法解析，请重试一次。', 'parse');
  }

  function asStringList(v) {
    if (!v) return [];
    if (!Array.isArray(v)) v = [v];
    var seen = {};
    var out = [];
    v.forEach(function (x) {
      var s = (typeof x === 'string' ? x : (x && (x.text || x.word || x.name)) || '').trim();
      s = s.replace(/^[\-*·•\d.、\s]+/, '').trim();
      if (!s) return;
      var k = s.toLowerCase();
      if (seen[k]) return;
      seen[k] = 1;
      out.push(s);
    });
    return out;
  }

  /* ---------- 图片压缩 ---------- */

  function compressImage(file, maxSide, quality) {
    maxSide = maxSide || 1024;
    quality = quality || 0.82;
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onerror = function () { reject(new Error('读取图片失败')); };
      reader.onload = function () {
        var img = new Image();
        img.onerror = function () { reject(new Error('图片格式不支持')); };
        img.onload = function () {
          var w = img.naturalWidth, h = img.naturalHeight;
          var scale = Math.min(1, maxSide / Math.max(w, h));
          var cw = Math.max(1, Math.round(w * scale));
          var ch = Math.max(1, Math.round(h * scale));
          var cv = document.createElement('canvas');
          cv.width = cw; cv.height = ch;
          var ctx = cv.getContext('2d');
          ctx.fillStyle = '#fff';
          ctx.fillRect(0, 0, cw, ch);
          ctx.drawImage(img, 0, 0, cw, ch);
          resolve(cv.toDataURL('image/jpeg', quality));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function visionMessages(systemText, userText, dataUrls) {
    // 官方示例是 text 块在前、image_url 块在后，这里保持一致
    var content = [{ type: 'text', text: userText }];
    (dataUrls || []).forEach(function (u) {
      content.push({ type: 'image_url', image_url: { url: u } });
    });
    return [
      { role: 'system', content: systemText },
      { role: 'user', content: content }
    ];
  }

  /* ---------- 功能一：老师原文 → 作业清单 ---------- */

  var TASK_SYSTEM =
    '你是小学作业信息整理助手，只做“拆分”，不做“摘要”。' +
    '把家长从微信群复制的老师原文，拆成一条条可以勾选执行的具体任务。\n' +
    '硬性规则：\n' +
    '1. 必须保留老师原文里的页码、题号、册子名称、次数、日期等所有细节。\n' +
    '2. 绝对不能合并成“完成数学作业”这类笼统说法，也绝对不能增加老师没有布置的任务。\n' +
    '3. 一件事一条。原文里如果是“P15第1-4题”，就写“数学书 P15 第1-4题”。\n' +
    '4. type 三选一：student（孩子自己做）、parent（家长要做，如签字、打印、报名）、reminder（提醒或要带的东西）。\n' +
    '5. 只输出 JSON，不要解释，不要 markdown。格式：{"tasks":[{"text":"...","type":"student"}]}';

  async function parseHomework(rawText, courseType) {
    var extra = '';
    if (courseType === 'chinese') {
      extra = '这是语文作业，请特别留意：朗读、背诵、写字、生字、词语、预习、家长签字、需要携带的物品。';
    } else if (courseType === 'math') {
      extra = '这是数学作业，请特别留意：书本页码题号、口算练习、订正错题、家长签字。';
    } else if (courseType === 'english' || courseType === 'pbl') {
      extra = '这是英语作业，请特别留意：跟读、听录音、默写单词、背诵句子、需要上传的音视频。';
    }
    var text = await chat([
      { role: 'system', content: TASK_SYSTEM },
      { role: 'user', content: (extra ? extra + '\n\n' : '') + '老师原文：\n' + rawText }
    ], { kind: 'text' });

    var data = parseJSON(text);
    var tasks = (data.tasks || data.list || []).map(function (t) {
      var type = (t && t.type) || 'student';
      if (['student', 'parent', 'reminder'].indexOf(type) < 0) type = 'student';
      var txt = (typeof t === 'string' ? t : (t.text || t.title || '')).trim();
      return { text: txt, type: type };
    }).filter(function (t) { return t.text; });

    if (!tasks.length) throw new AIError('AI 没有识别出任务，请检查原文内容。', 'empty');
    return tasks;
  }

  /* ---------- 功能二：数学作业图片 → 知识点 ---------- */

  var MATH_SYSTEM =
    '你是小学数学知识点分析助手。用户上传的是孩子的数学作业、练习或试卷照片。\n' +
    '你的任务不是给答案，而是分析这些题目考查了哪些数学知识点。\n' +
    '要求：\n' +
    '1. 知识点必须具体，例如“20以内进位加法”“凑十法”“看图列式”，' +
    '不要只写“加法”“减法”“应用题”这种过粗的说法。\n' +
    '2. coreKnowledge 写核心知识点（3-8条）；skills 写更细的能力点，' +
    '例如“理解凑十的过程”“根据图意判断用加还是用减”“识别已知量和未知量”。\n' +
    '3. 如果图片看不清或不是数学作业，返回空数组。\n' +
    '4. 只输出 JSON：{"coreKnowledge":["..."],"skills":["..."]}';

  async function analyzeMathImages(dataUrls) {
    var text = await chat(
      visionMessages(MATH_SYSTEM, '请分析这些数学作业图片涉及的知识点，只返回 JSON。', dataUrls),
      { kind: 'vision' }
    );
    var data = parseJSON(text);
    return {
      coreKnowledge: asStringList(data.coreKnowledge || data.core || data.knowledge),
      skills: asStringList(data.skills || data.abilities)
    };
  }

  /* ---------- 功能三：英语图片 → 单词 ---------- */

  var ENGLISH_SYSTEM =
    '你是英语单词提取助手。用户上传的是小学英语课本或默写单词表的照片。\n' +
    '只提取图片中出现的英文单词，用于家长复制到背单词 App。\n' +
    '要求：\n' +
    '1. 只输出单个单词，不要词组、不要短语、不要句子。\n' +
    '   遇到词组必须拆成单词：good morning 输出 ["good","morning"]，' +
    'in the classroom 输出 ["in","the","classroom"]。\n' +
    '2. 只输出英文，不要中文翻译、不要音标、不要例句、不要解释。\n' +
    '3. 保持图片里的原形，不要自行变形或补充图片里没有的词。\n' +
    '4. 去掉重复。\n' +
    '5. 只输出 JSON：{"words":["apple","teacher"]}';

  async function extractWords(dataUrls) {
    var text = await chat(
      visionMessages(ENGLISH_SYSTEM, '请提取图片中的英文单词，只返回 JSON。', dataUrls),
      { kind: 'vision' }
    );
    var data = parseJSON(text);
    // AI 偶尔还是会吐词组，这里本地再拆一次，保证清单里只有单词
    return { words: Store.splitWords(asStringList(data.words || data.word || data.list)) };
  }

  /* ---------- 功能四：PBL 图片 → 单词 + 核心表达 ---------- */

  var PBL_SYSTEM =
    '你是 PBL 英语学习材料分析助手。用户上传的是 PBL 课程的学习材料照片。\n' +
    '输出两部分：\n' +
    '1. words：材料中出现的英文单词，只要单个单词，词组要拆开（good morning → good, morning），去重。\n' +
    '2. expressions：材料中出现的核心句型或表达，保持完整短句，例如 "This is my family." "It can grow."\n' +
    '不要翻译，不要解释，不要自行编造材料里没有的内容。\n' +
    '只输出 JSON：{"words":["plant"],"expressions":["It can grow."]}';

  async function analyzePBL(dataUrls) {
    var text = await chat(
      visionMessages(PBL_SYSTEM, '请提取单词和核心表达，只返回 JSON。', dataUrls),
      { kind: 'vision' }
    );
    var data = parseJSON(text);
    return {
      words: Store.splitWords(asStringList(data.words)),
      expressions: asStringList(data.expressions || data.keyExpressions)
    };
  }

  /* ---------- 连接测试 ---------- */

  async function testConnection() {
    var text = await chat([
      { role: 'system', content: '只输出 JSON。' },
      { role: 'user', content: '返回 {"ok":true}' }
    ], { kind: 'text', timeout: 20000 });
    parseJSON(text);
    return true;
  }

  async function testVision(dataUrl) {
    var text = await chat(
      visionMessages('只输出 JSON。', '这张图片里有内容吗？返回 {"ok":true}', [dataUrl]),
      { kind: 'vision', timeout: 30000 }
    );
    parseJSON(text);
    return true;
  }

  return {
    AIError: AIError,
    hasKey: hasKey,
    visionReady: visionReady,
    parseJSON: parseJSON,
    compressImage: compressImage,
    parseHomework: parseHomework,
    analyzeMathImages: analyzeMathImages,
    extractWords: extractWords,
    analyzePBL: analyzePBL,
    testConnection: testConnection,
    testVision: testVision
  };
})();
