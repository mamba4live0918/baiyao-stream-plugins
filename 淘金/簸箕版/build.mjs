// 构建：node build.mjs → qa/out/淘金-簸箕.html（开发版，不压缩）；node build.mjs --release → 上一级目录的「淘金-簸箕.html」和试玩页（单文件，全部内联）
// 借用拼豆工程里已装的 esbuild；three.js r186 源码放在 _deps（与快递分拣 3D 同一份）。
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { resolve, dirname, extname, basename } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const require = createRequire(resolve(root, '../../拼豆/package.json'));
const { build } = require('esbuild');
const deps = resolve(root, '_deps');
const examples = resolve(root, '../../拼豆/node_modules/three/examples/jsm');
const alias = {
  name: 'deps',
  setup(b) {
    b.onResolve({ filter: /^three$/ }, () => ({ path: resolve(deps, 'three.module.js') }));
    b.onResolve({ filter: /^three\/addons\/(.+)$/ }, a => {
      const local = resolve(deps, a.path.split('/').pop());
      return { path: existsSync(local) ? local : resolve(examples, a.path.replace(/^three\/addons\//, '')) };
    });
  }
};
const release = process.argv.includes('--release');
const r = await build({
  entryPoints: [resolve(root, 'src/main.js')],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'browser',
  target: ['chrome103'],
  minify: release,
  charset: 'utf8',
  legalComments: 'inline',
  plugins: [alias],
  logLevel: 'warning'
});
const js = r.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const tpl = readFileSync(resolve(root, 'src/page.html'), 'utf8');
/* 糖圆体（OFL，与白曜内置字体同一份）原样内联，离线可用 */
const fontFile = resolve(root, '../assets/fonts/tj-round.woff2');
if (!existsSync(fontFile)) throw new Error('缺少字体 ' + fontFile);
const font = `@font-face{font-family:"TJRound";src:url(data:font/woff2;base64,${readFileSync(fontFile).toString('base64')}) format("woff2");font-display:swap;}`;
if (!tpl.includes('/*__FONT__*/')) throw new Error('page.html 缺少 __FONT__ 标记');
if (!tpl.includes('<script>__INLINE_BUNDLE__</script>')) throw new Error('page.html 缺少 __INLINE_BUNDLE__ 标记');
/* 可选贴图：assets/<槽位名>.png|jpg|webp（槽位见 src/scene/assets.js），原样内联 */
const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
const assetDir = resolve(root, 'assets');
const assets = {};
if (existsSync(assetDir)) {
  for (const f of readdirSync(assetDir)) {
    const mime = MIME[extname(f).toLowerCase()];
    if (mime) assets[basename(f, extname(f))] = `data:${mime};base64,${readFileSync(resolve(assetDir, f)).toString('base64')}`;
  }
}
const assetTag = Object.keys(assets).length ? '<script>window.__TJ_ASSETS__=' + JSON.stringify(assets) + ';</script>' : '';
const html = tpl.replace('/*__FONT__*/', () => font).replace('<script>__INLINE_BUNDLE__</script>', () => assetTag + '<script type="module">' + js + '</script>');
const out = release ? resolve(root, '../淘金-簸箕.html') : resolve(root, 'qa/out/淘金-簸箕.html');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);
/* 正式版顺带放一份试玩页（背景切换 + 试玩面板），指向同目录的正式版 */
if (release) writeFileSync(resolve(root, '../淘金-簸箕试玩.html'), readFileSync(resolve(root, 'src/trial.html')));
console.log((release ? '已生成正式版 ' : '已生成开发版 ') + out, (Buffer.byteLength(html) / 1024 / 1024).toFixed(2) + ' MB', Object.keys(assets).length ? '· 内联贴图：' + Object.keys(assets).join('、') : '· 没有替换贴图（用程序生成的）');
