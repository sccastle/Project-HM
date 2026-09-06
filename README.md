# HM · 家长端作业管家 PWA

给小萄 / Henry 用的作业管理工具。把微信群里各科老师的原文按科目和日期归档，用 AI 拆成能勾选的任务清单，数学作业照片提取知识点，英语照片提取单词。

没有账号，没有云端，没有服务器。所有数据存在这台手机里，换手机用 JSON 备份迁移。

---

## 两个版本

| | 用途 | 文件 |
|---|---|---|
| **本地单文件版** | 现在就能用。发到微信、存到手机、双击打开 | `HM-本地版.html` |
| **GitHub Pages 版** | 长期用。能装到手机桌面、能离线、能更新 | 本仓库其余文件 |

两个版本功能一样，代码同源（单文件版由 `build-single-file.js` 打包生成）。

**两版数据不互通**（浏览器按来源隔离存储）。从单文件版转到网页版：设置 → 数据管理 → 导出 JSON，在网页版导入即可。

---

## 一、本地单文件版怎么用

**电脑：** 双击 `HM-本地版.html`，Chrome / Edge / Safari 都行。

**手机：** 把这个 html 存到手机（微信文件、iCloud、QQ），用"用其他应用打开 → 浏览器"打开。iPhone 建议存到"文件"App 再打开。

**注意两件事：**

1. 用 `file://` 打开时，部分浏览器不给 IndexedDB 权限，App 会自动降级用 localStorage 存数据，功能不受影响。请定期导出 JSON。
2. 有些浏览器会拦截本地文件发出的跨域请求，AI 可能报"网络请求失败"。如果遇到，用下面任一方式解决：
   - 用 GitHub Pages 版（推荐）
   - 电脑上起个本地服务：把仓库下载下来，在目录里执行 `python3 -m http.server 8080`，浏览器打开 `http://localhost:8080`

不涉及 AI 的功能（录入、勾选、日历、知识脉络、导入导出）在 `file://` 下完全正常。

---

## 二、GitHub Pages 部署

1. GitHub 新建仓库，例如 `xiaotao-homework`（Public）。
2. 把本目录所有文件上传到仓库根目录（`index.html` 必须在最外层）。
3. 仓库 **Settings → Pages → Source** 选 `Deploy from a branch`，分支 `main`，目录 `/ (root)`，保存。
4. 一两分钟后访问 `https://你的用户名.github.io/xiaotao-homework/`。

所有资源路径都是相对路径，路由走 hash（`#/today`），子目录部署不会坏，也不需要任何服务器改写规则。

**更新 App：** 改完代码推上去，同时改两个地方的版本号——`js/version.js` 里的 `version` 和 `service-worker.js` 顶部的 `VERSION`（后者要写成 `hm-v` 加前者，例如 `1.1.1` 对 `hm-v1.1.1`）。两者不一致时 `node build-single-file.js` 会直接报错拦下。改完手机上把 App 关掉重开两次即可拿到新版。

**怎么确认手机上跑的是哪一版：** 首页最底下和 设置 → 关于 都写着版本号。看到的号和 `js/version.js` 里的对不上，就说明还在吃旧缓存。

---

## 三、装到手机桌面

**Android Chrome：** 打开网址 → 右上角菜单 → "添加到主屏幕" / "安装应用"。

**iPhone Safari：** 打开网址 → 底部分享按钮 → "添加到主屏幕"。必须用 Safari，微信内置浏览器加不了。

装好之后是独立图标、全屏无地址栏，跟原生 App 观感接近。

---

## 四、填写 DeepSeek API

设置 → DeepSeek API。

| 字段 | 填什么 |
|---|---|
| API Key | 到 platform.deepseek.com 申请，形如 `sk-…` |
| API Endpoint | `https://api.deepseek.com/chat/completions` |
| 文字模型 | `deepseek-v4-flash` |
| 图片模型 | `deepseek-v4-flash-vision-exp` |
| 图片模型 Endpoint | 留空即可，和文字模型同一个地址 |

以上是默认值，装好就是这套，只需要填 API Key。填完点"测试连接"，会发一个最小请求验证 Key 是否可用。

**关于模型名：** DeepSeek 在 2026 年 8 月 21 日上线了视觉模型 `deepseek-v4-flash-vision-exp`，这是官方目前唯一能接收图片的模型，其他模型收到图片会返回 400「This model does not support image」。当前在售的模型是 `deepseek-v4-flash`、`deepseek-v4-pro` 和 `deepseek-v4-flash-vision-exp`，旧的 `deepseek-chat` 已不在官方模型列表里。老版本装过这个 App 的设备，升级后会自动把 `deepseek-chat` 换成 `deepseek-v4-flash` 并补上图片模型，手动改过的配置不会被覆盖。

**关于图片分析：** 数学知识点、英语提词、PBL 提词都走视觉模型。图片在手机上压缩到 1024px 长边、转成 Base64 data URL，按 OpenAI 兼容的 `image_url` content block 发出去（官方给图片的三种传法里最适合本地文件的一种）。DeepSeek 服务端会把图片缩到约 800×800 的总像素，每张图最多计 384 token，所以压缩到 1024 既够清楚也不浪费流量。

图片模型和 Endpoint 依然是分开可配的，想换别家支持图片的 OpenAI 兼容接口也行。只有在图片模型为空、或者视觉调用失败时，App 才会提示去配置图片模型。

**API Key 只存在这台设备**（localStorage），不进 JSON 备份，不写进代码，仓库里没有任何密钥。

---

## 五、每天怎么用

首页的课程卡片不是摘要，是当天作业的完整清单：整理过的按「孩子要做 / 家长 / 提醒」顺序列全，已完成的打勾划掉；只存了老师原文还没整理的，直接显示原文；没录入的写明没录入。卡片高度跟着内容走，不截断。勾选统一在详情页做（避免首页误触），改完退回首页立刻能看到勾选结果。


```
打开 App
→ 首页：今天每门课的作业直接摊开在卡片里，勾了哪些一眼看到
→ 点「数学 · 李老师」
→ 把微信群老师原文粘进去 → 保存原文
→ 点「AI 整理作业」→ 预览里改一改 → 确认保存
→ 得到可勾选的清单（学生 / 家长 / 提醒 三组）
→ 切到「AI 分析」tab → 拍数学作业 → 提取知识点 → 保存到今天
→ 月底进「知识」→ 选 9/1–9/30 → 看到整月知识脉络 → 复制知识点
```

拍照分析在两个地方都能进：课程详情的「今日作业」页底部有一个直达按钮，第二个 tab（数学叫「AI 知识点」，英语 / PBL 叫「AI 提词」）里也有。从作业页发起的，保存后会自动切到结果那一页。

英语：拍单词表 → 提取单词 → 复制全部单词 → 粘到背单词 App。数学：拍作业 → 提取知识点 → 存进「知识」页的知识脉络。语文没有图片分析，只有文字整理。

老师说"下周一带彩纸"：首页日期条右箭头翻到下周一，或者从日历点进去，直接录入。

---

## 六、AI 调用规则

只有这四个动作会发请求：AI 整理作业、数学图片分析、英语图片提词、PBL 图片分析。

勾选任务、翻日期、开日历、看知识点、编辑任务、复制结果、管理年级和老师，**一律不调用 AI**。打开页面也不会自动调用。

**AI 只做拆分，不做摘要。** 提示词里明确要求保留页码题号册子名，禁止合并成"完成数学作业"，禁止添加老师没布置的任务。数学 AI 只分析知识点不生成练习题，英语 AI 只输出英文单词。

**AI 结果永远先进预览。** 可以改文字、删条目、加条目、改类型（学生 / 家长 / 提醒），确认后才写进数据。老师原文（`rawText`）和 AI 拆出的任务（`tasks`）分开保存，互不覆盖。

**容错：** 超时 60 秒、Markdown 代码围栏、JSON 前后带解释文字、网络失败、401 / 402 / 429、空结果，都会转成一句中文提示，不会白屏。

---

## 七、数据结构

存储优先 IndexedDB（库名 `xiaotao-homework`），不可用时自动降级 localStorage，再不行走内存并提示导出。设置页底部会显示当前用的是哪种。

```js
Grade   { id, name, isCurrent, createdAt, archived }

Course  { id, gradeId, name, teacherName, teacherAvatar, type, sortOrder, archived }
        // type: chinese | math | english | pbl | other，决定这门课有哪些 AI 功能

DailyRecord { id: "2026-09-06__c_xxx", date, gradeId, courseId,
              rawText,                              // 老师原文，事实源
              tasks: [{ id, text, type, completed }] // type: student | parent | reminder
              createdAt, updatedAt }

MathKnowledge { id, date, gradeId, courseId, coreKnowledge[], skills[], images?[] }

WordRecord    { id, date, gradeId, courseId, kind: "english"|"pbl",
                words[], expressions[], images?[] }

settings      { id, value }   // currentGradeId / endpoint / model / visionModel / keepImages
```

层级是 学生 → 年级 → 课程(含老师) → 每日记录。课程和老师没有绑死：升年级后新建课程重新配老师，历史年级数据原样保留。

删除一律走 `archived: true`，不做物理删除。

**知识脉络的归类是本地规则**（`store.js` 里的 `CATEGORY_RULES`），按关键词分成数与运算 / 图形与几何 / 量与计量 / 应用与解决问题 / 统计与规律，统计每个知识点的首次出现日期和出现次数。不调用 AI，离线可用。

**图片默认不留。** 流程是 选图 → 压缩到 1280px → 送 AI → 存文字结果 → 丢掉图片。设置里可以打开"保留原图"，默认关闭，避免数据越滚越大。老师头像例外，压缩后长期保存，跟着备份走。

---

## 八、JSON 备份

设置 → 数据管理。

**导出：** 文件名 `HM-作业备份-YYYY-MM-DD.json`，包含所有年级、课程、老师资料和头像（Base64）、每日记录、老师原文、AI 任务、勾选状态、数学知识点、英语 / PBL 提词结果、排序、普通设置。

**绝不包含 API Key。**

**导入：** 先校验 `schemaVersion`，然后显示备份日期、年级数、课程数、作业记录数、知识点数，确认后才覆盖。导入前会问一句"是否先导出当前数据"，防止误覆盖。V1 是覆盖式导入，不做合并。

**换手机：** 旧手机导出 JSON（存微信文件传输助手就行）→ 新手机打开网址、装到桌面 → 数据管理导入 JSON → 设置里重新填一次 API Key → 继续用。

---

## 九、文件结构

```
index.html                     页面骨架
css/app.css                    全部样式
js/db.js                       存储层：IndexedDB → localStorage → 内存 三级降级
js/store.js                    数据模型：年级 / 课程 / 记录 / 知识点 / 聚合规则
js/ai.js                       AI 抽象层：DeepSeek 与任何 OpenAI 兼容接口
js/ui.js                       toast / 抽屉 / 确认框 / 加载态 / 复制 / 选图
js/backup.js                   JSON 导出导入
js/router.js                   hash 路由
js/views.js                    各页面渲染与交互
js/app.js                      启动入口、底部导航、SW 注册
manifest.json                  PWA 清单
service-worker.js              离线缓存
icons/                         应用图标（源自 Henry 画的花轮小车）
js/version.js                  版本号唯一出处（App 名、版本、构建日期）
build-single-file.js           打包成单文件：node build-single-file.js
```

改完代码重新生成单文件版：

```bash
node build-single-file.js
```

---

## 十、离线

装到桌面后断网可用：看历史作业、勾选、日历、知识脉络、老师管理、JSON 导出。

只有 AI 需要网络，离线时点 AI 按钮会提示"当前离线，AI 功能需要网络。"

---

## 十一、设计

主色取自提供的 Logo 蓝 `#02a4dc`，配 off-white `#f6f4ee` 和近黑 `#141414`。红 / 黄 / 绿只用在状态点和小装饰上。

大约七成是克制的教育工具，三成个性：粗描边、斜切角标签、轻网点、不规则卡片、偶尔出现的小礼帽（Seuss House）。正文用 system-ui / PingFang SC，中文清晰优先，标题才放个性。

按 390px 宽度设计，做了 safe-area 适配（刘海 / 灵动岛 / 底部横条），不会横向滚动。

---

## 十二、折叠屏适配

三种形态各有一套布局，靠 CSS 断点切换：

| 形态 | 宽度 | 布局 |
|---|---|---|
| 外屏 / 小手机 | ≤360px | 单列，收紧留白，缩小头像和日历格 |
| 内屏竖开 | 600–819px | 内容居中；老师卡片、知识点分类、课程页的「原文 / 清单」两栏并排；月历限宽，格子不会大到难点 |
| 内屏横开 / 平板 | ≥820px | 底部导航变左侧竖排导航栏，把纵向空间还给内容；日历左右分栏（左月历 + 右当天课程）；课程页多一条科目切换条，换科目不用退回首页；弹层从底部抽屉改成居中对话框 |

另外还有两条补充规则：机身很扁的横屏（高度 ≤560px）会压缩顶栏；带物理铰链的双屏设备（Surface Duo 这类）强制单列并把内容收进左半屏，不压在折痕上。

**展开是纯 CSS 重排，不会重新渲染页面**，所以折叠动作不会打断正在做的事。另外老师原文有自动落盘（边打边存、失焦存、切后台存），万一系统在折叠时重建 WebView，粘贴的原文也不会白打一遍。

布局用真实 Chrome 在 360×740、674×841、900×700、1280×800 四种尺寸下逐页截图核对过，无横向溢出。
