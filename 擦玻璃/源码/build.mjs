// 构建：node build.mjs → qa/out/擦玻璃.html（开发版，不压缩）
//       node build.mjs --release → 上一级目录的「擦玻璃.html」和「试玩.html」（单文件，全部内联）
// 借用拼豆工程里已装的 esbuild；three.js r186 源码放在 _deps（与淘金簸箕版同一份）。
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const require = createRequire(resolve(root, '../../拼豆/package.json'));
const { build } = require('esbuild');
const deps = resolve(root, '_deps');
const alias = {
  name: 'deps',
  setup(b) {
    b.onResolve({ filter: /^three$/ }, () => ({ path: resolve(deps, 'three.module.js') }));
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
  loader: { '.png': 'dataurl', '.webp': 'dataurl' },
  plugins: [alias],
  logLevel: 'warning'
});
const js = r.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const tpl = readFileSync(resolve(root, 'src/page.html'), 'utf8');
/* 糖圆体（OFL，与白曜内置字体同一份）原样内联，离线可用 */
const fontFile = resolve(root, 'assets/fonts/tj-round.woff2');
if (!existsSync(fontFile)) throw new Error('缺少字体 ' + fontFile);
const font = `@font-face{font-family:"TJRound";src:url(data:font/woff2;base64,${readFileSync(fontFile).toString('base64')}) format("woff2");font-display:swap;}`;
if (!tpl.includes('/*__FONT__*/')) throw new Error('page.html 缺少 __FONT__ 标记');
if (!tpl.includes('<script>__INLINE_BUNDLE__</script>')) throw new Error('page.html 缺少 __INLINE_BUNDLE__ 标记');
const html = tpl.replace('/*__FONT__*/', () => font).replace('<script>__INLINE_BUNDLE__</script>', () => '<script type="module">' + js + '</script>');
const out = release ? resolve(root, '../擦玻璃.html') : resolve(root, 'qa/out/擦玻璃.html');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);
/* 试玩页：开发版放在 qa/out 里指向开发版，正式版放到插件目录指向正式版 */
/* 试玩台里垫一张白曜立绘（只在试玩台里，插件本身不带） */
const avatarFile = resolve(root, 'assets/trial-avatar.webp');
const avatar = existsSync(avatarFile) ? 'data:image/webp;base64,' + readFileSync(avatarFile).toString('base64') : '';
const trial = readFileSync(resolve(root, 'src/trial.html'), 'utf8').replace('__AVATAR__', () => avatar);
writeFileSync(release ? resolve(root, '../试玩.html') : resolve(root, 'qa/out/试玩.html'), trial);
console.log((release ? '已生成正式版 ' : '已生成开发版 ') + out, (Buffer.byteLength(html) / 1024 / 1024).toFixed(2) + ' MB');
