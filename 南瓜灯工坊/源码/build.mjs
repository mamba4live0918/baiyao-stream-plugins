// 构建：src/main.js 打包成一个文件塞进 page.html → ../南瓜灯工坊.html；再把整页嵌进试玩页 → ../试玩.html
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import guard from './qa/time-guard.cjs';
guard.nowAllowed('构建');
const root = dirname(fileURLToPath(import.meta.url));
const require = createRequire(resolve(root, '../../拼豆/package.json'));
const { build } = require('esbuild');
const result = await build({ entryPoints: [resolve(root, 'src/main.js')], bundle: true, write: false, format: 'iife', target: ['chrome103'], minify: process.argv.includes('--release'), charset: 'utf8' });
const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const html = readFileSync(resolve(root, 'src/page.html'), 'utf8').replace('__INLINE_BUNDLE__', () => js);
const embedded = JSON.stringify(html).replace(/</g, '\\u003c');   // 所有 < 写成转义，嵌进去的 </script> 才不会把试玩页的脚本提前截断
const avatar = 'data:image/webp;base64,' + readFileSync(resolve(root, 'assets/preview-avatar.webp')).toString('base64');
const trial = readFileSync(resolve(root, 'src/trial.html'), 'utf8').replace('__EMBEDDED_HTML__', () => embedded).replace('__AVATAR__', () => avatar);
for (const [name, data] of [['南瓜灯工坊.html', html], ['试玩.html', trial]]) {
  const bytes = Buffer.byteLength(data);
  if (bytes > 10_000_000) throw Error(name + ' 超过 10 MB');
  writeFileSync(resolve(root, '..', name), data);
  console.log(name + ' · ' + (bytes / 1024 / 1024).toFixed(2) + ' MB');
}
