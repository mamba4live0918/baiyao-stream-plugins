import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build } from 'esbuild';

const root = resolve(import.meta.dirname);
// 成品生成的后台线程单独打包成字符串，内联进主包，运行时用 Blob 启动（单 HTML、不依赖外部文件）。
const workerBuild = await build({ entryPoints: [resolve(root, 'src/finish-worker.js')], bundle: true, write: false, platform: 'browser', format: 'iife', target: ['chrome120'], minify: true, legalComments: 'none', charset: 'utf8', logLevel: 'warning' });
const workerCode = workerBuild.outputFiles[0].text;
const finishWorkerPlugin = { name: 'finish-worker', setup(b) {
  b.onResolve({ filter: /^virtual:finish-worker$/ }, () => ({ path: 'finish-worker', namespace: 'virtual' }));
  b.onLoad({ filter: /.*/, namespace: 'virtual' }, () => ({ contents: `export default ${JSON.stringify(workerCode)};`, loader: 'js' }));
} };
const result = await build({
  plugins: [finishWorkerPlugin],
  entryPoints: [resolve(root, 'src/app.js')],
  bundle: true,
  write: false,
  platform: 'browser',
  format: 'iife',
  target: ['chrome120'],
  minify: true,
  legalComments: 'inline',
  charset: 'utf8',
  loader: { '.png': 'dataurl', '.jpg': 'dataurl' },
  logLevel: 'warning',
});
const sourceTemplate = await readFile(resolve(root, 'src/page.html'), 'utf8');
const workbenchCss = await readFile(resolve(root, 'src/workbench.css'), 'utf8');
const controlsCss = await readFile(resolve(root, 'src/controls-v3.css'), 'utf8');
const keyShim = await readFile(resolve(root, 'src/obs-key-shim.js'), 'utf8');
// OBS 浏览器源交互窗口的按键没有 event.code：兼容脚本必须先于页面其他脚本加载。
const template = sourceTemplate.replace('<meta charset="utf-8">', match => match + '<script>' + keyShim + '</script>').replace('</style>', () => workbenchCss + controlsCss + '</style>');
const bundle = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const html = template.replace('__INLINE_BUNDLE__', () => bundle);
if (html === template) throw new Error('HTML template is missing bundle marker');
if (/\b(?:src|href)=["'](?:https?:|file:|\.{1,2}\/)/i.test(html)) throw new Error('Output still references an external resource');
await writeFile(resolve(root, '拼豆-1.html'), html, 'utf8');
console.log(`Built 拼豆-1.html (${Buffer.byteLength(html).toLocaleString()} bytes, worker ${Buffer.byteLength(workerCode).toLocaleString()} bytes)`);
