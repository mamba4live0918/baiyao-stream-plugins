'use strict';
// 万圣节砸砸乐试玩：把 src 里的脚本、样式和白曜立绘打成一个双击就能打开的 HTML（不联网）。
// 用法：node build.cjs   输出：万圣节砸砸乐试玩.html
const fs = require('node:fs'), path = require('node:path');
const HERE = __dirname, SRC = path.join(HERE, 'src');
const JS = ['core.js', 'sound.js', 'art.js', 'avatar.js', 'particles.js', 'fx-tower.js', 'fx-flood.js', 'fx-ghost.js', 'fx-potion.js', 'fx-mummy.js', 'fx-bats.js', 'fx-candy.js', 'main.js'];
const read = name => fs.readFileSync(path.join(SRC, name), 'utf8');
const safe = js => js.replace(/<\/script/gi, '<\\/script');
const parts = {
  '<!--@CSS@-->': read('style.css'),
  '<!--@JS@-->': safe(JS.map(name => '/* ' + name + ' */\n' + read(name)).join('\n')),
  '<!--@AVATAR@-->': 'data:image/webp;base64,' + fs.readFileSync(path.join(HERE, 'avatar.webp')).toString('base64'),
};
let html = read('index.html');
for (const [marker, body] of Object.entries(parts)) {
  if (!html.includes(marker)) throw Error('模板缺少标记 ' + marker);
  html = html.split(marker).join(body);
}
const out = path.join(HERE, '万圣节砸砸乐试玩.html');
fs.writeFileSync(out, html);
console.log('万圣节砸砸乐试玩', out, (fs.statSync(out).size / 1024).toFixed(0) + ' KB');
