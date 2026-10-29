// 构建：node build.mjs → qa/out/快递分拣-3D版.html（开发版）；node build.mjs --release → 上一级目录的「快递分拣-3D版.html」（单文件，全部内联）
// 使用拼豆工程里已安装的 esbuild；three.js 0.186 与 Rapier 0.20 的源码放在 _deps 目录。
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const root = dirname(fileURLToPath(import.meta.url));
const require = createRequire(resolve(root, '../../拼豆/package.json'));
const { build } = require('esbuild');
const deps = resolve(root, '_deps');
const alias = { name: 'deps', setup(b) {
  b.onResolve({ filter: /^three$/ }, () => ({ path: resolve(deps, 'three.module.js') }));
  b.onResolve({ filter: /^three\/addons\/(.+)$/ }, a => ({ path: resolve(deps, a.path.split('/').pop()) }));
  b.onResolve({ filter: /^@dimforge\/rapier3d-compat$/ }, () => ({ path: resolve(deps, 'rapier.mjs') }));
} };
const r = await build({ entryPoints: [resolve(root, 'src/main.js')], bundle: true, write: false, format: 'esm', platform: 'browser', target: ['chrome103'], minify: true, charset: 'utf8', legalComments: 'inline', plugins: [alias], logLevel: 'warning' });
const js = r.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const shim = readFileSync(resolve(root, 'src/obs-key-shim.js'), 'utf8');
const tpl = readFileSync(resolve(root, 'src/page.html'), 'utf8').replace('<meta charset="utf-8">', m => m + '<script>' + shim + '</script>');
const html = tpl.replace('<script>__INLINE_BUNDLE__</script>', () => '<script type="module">' + js + '</script>');
if (html === tpl) throw new Error('page.html 缺少 __INLINE_BUNDLE__ 标记');
// 开发构建写到 qa/out，正式交付才覆盖插件文件夹里的 HTML：node build.mjs --release
const release = process.argv.includes('--release');
const out = release ? resolve(root, '../快递分拣-3D版.html') : resolve(root, 'qa/out/快递分拣-3D版.html');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);
console.log((release ? '已生成正式版 ' : '已生成开发版 ') + out, Buffer.byteLength(html), 'bytes');
