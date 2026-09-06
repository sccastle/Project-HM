/* build-single-file.js — 把整个项目打包成一个可以直接双击打开的 HTML 文件。
   用法： node build-single-file.js
   产物： HM-本地版.html
   注意：单文件版不含 service worker（file:// 不允许注册），其余功能完全一致。 */

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const OUT = process.argv[2] || path.join(ROOT, 'HM-本地版.html');

const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const dataURI = p =>
  'data:image/png;base64,' + fs.readFileSync(path.join(ROOT, p)).toString('base64');

const JS_FILES = [
  'js/version.js', 'js/db.js', 'js/store.js', 'js/ai.js', 'js/ui.js',
  'js/backup.js', 'js/router.js', 'js/views.js', 'js/app.js'
];

// 0. 版本号一致性检查：version.js 和 service-worker.js 必须对得上，
//    否则手机上会一直吃旧缓存，改了也看不到。
const appVer = (read('js/version.js').match(/version:\s*'([^']+)'/) || [])[1];
const swVer = (read('service-worker.js').match(/VERSION\s*=\s*'([^']+)'/) || [])[1];
if (!appVer || !swVer) {
  console.error('没找到版本号，检查 js/version.js 和 service-worker.js');
  process.exit(1);
}
if (swVer !== 'hm-v' + appVer) {
  console.error('版本号不一致：js/version.js 是 ' + appVer +
    '，service-worker.js 是 ' + swVer + '（应为 hm-v' + appVer + '）');
  process.exit(1);
}

let html = read('index.html');

// 1. 内联样式
html = html.replace(
  '<link rel="stylesheet" href="css/app.css">',
  '<style>\n' + read('css/app.css') + '\n</style>'
);

// 2. 内联图标，去掉 manifest（单文件版不做安装）
html = html
  .replace('<link rel="manifest" href="manifest.json">', '')
  .replace('href="icons/favicon-32.png"', 'href="' + dataURI('icons/favicon-32.png') + '"')
  .replace('href="icons/apple-touch-icon.png"', 'href="' + dataURI('icons/apple-touch-icon.png') + '"');

// 3. 内联脚本
const scripts = JS_FILES.map(f => read(f)).join('\n;\n');
const scriptTags = JS_FILES.map(f => '<script src="' + f + '"></script>').join('\n');
html = html.replace(
  scriptTags,
  '<script>window.INLINE_ICON=' + JSON.stringify(dataURI('icons/icon-64.png')) + ';</script>\n' +
  '<script>\n' + scripts + '\n</script>'
);

if (html.includes('<script src=')) {
  console.error('打包失败：还有没有内联的 script 标签');
  process.exit(1);
}

fs.writeFileSync(OUT, html, 'utf8');
console.log('已生成 ' + OUT + '（' + (Buffer.byteLength(html) / 1024).toFixed(0) + ' KB）');
