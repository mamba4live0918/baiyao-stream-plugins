'use strict';
// 万圣节砸砸乐 0.27.1 新玩法试玩：把白曜重工里真的万圣节控制器、OBS 叠加层、Codex 的图和白曜立绘打成一个双击就能打开的 HTML（不联网）。
// 用法：node build.cjs [白曜重工源码目录]   输出：../万圣节新玩法试玩.html
const fs = require('node:fs'), path = require('node:path');
const HERE = __dirname, OUT = path.join(HERE, '..', '万圣节新玩法试玩.html');
const ROOT = path.resolve(process.argv[2] || path.join(HERE, '../../白曜重工'));
const read = file => fs.readFileSync(file, 'utf8');
const safe = js => js.replace(/<\/script/gi, '<\\/script');
// 控制器是 CommonJS：包一层，页面里用 __req('./halloween.cjs') 取
const cjs = names => [
  'const __mods={};function __def(n,f){__mods[n]={f,e:null};}function __req(n){const m=__mods[n];if(!m)throw Error("缺模块 "+n);if(!m.e){const module={exports:{}};m.e=module.exports;m.f(module,module.exports,__req);m.e=module.exports;}return m.e;}',
  ...names.map(name => '__def(' + JSON.stringify('./' + name) + ',function(module,exports,require){\n' + read(path.join(ROOT, 'src', name)) + '\n});'),
].join('\n');
const { halloweenArt } = require(path.join(ROOT, 'scripts/build-prank-overlay.cjs'));
const { art, meta } = halloweenArt();
const parts = {
  '<!--@CSS@-->': read(path.join(HERE, 'trial.css')),
  '<!--@AVATAR@-->': 'data:image/webp;base64,' + fs.readFileSync(path.join(HERE, '..', 'avatar.webp')).toString('base64'),
  '<!--@ART@-->': 'globalThis.PrankHalloweenArt=Object.freeze(' + JSON.stringify(art) + ');globalThis.PrankHalloweenMeta=Object.freeze(' + JSON.stringify(meta) + ');',
  '<!--@MODULES@-->': safe([cjs(['halloween-config.cjs', 'halloween.cjs']), ...['halloween-art.js', 'halloween-sound.js', 'halloween-effect.js'].map(name => read(path.join(ROOT, 'assets/puppet', name)))].join('\n')),
  '<!--@JS@-->': safe(read(path.join(HERE, 'trial.js'))),
};
let html = read(path.join(HERE, 'index.html'));
for (const [marker, body] of Object.entries(parts)) {
  if (!html.includes(marker)) throw Error('模板缺少标记 ' + marker);
  html = html.split(marker).join(body);
}
fs.writeFileSync(OUT, html);
console.log('万圣节新玩法试玩', OUT, (fs.statSync(OUT).size / 1024 / 1024).toFixed(1) + ' MB，图 ' + Object.keys(art).length + ' 张');
