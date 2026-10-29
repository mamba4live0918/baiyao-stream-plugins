const fs=require('node:fs'),path=require('node:path');
const dir=__dirname,read=n=>fs.readFileSync(path.join(dir,n),'utf8');
const OUT=path.join(dir,'..','落叶寻针-v0.12-2.5D小样.html');
// 顺序：基础模块 → 礼物/效果逻辑 → 护脸圈、直播入口、动画、礼物界面（ui-gifts.css 跟在小样样式后面）
const atlas='data:image/png;base64,'+fs.readFileSync(path.join(dir,'assets/cute-atlas.png')).toString('base64');
const core=['src/layout.js','src/camera.js','src/pile.js','src/duel.js','src/render.js','src/gifts.js','src/effects.js','src/face.js','src/live.js','src/fx.js','src/ui-gifts.js'].map(read).join('\n');
let html=read('src/shell.html');
const put=(marker,text)=>{if(!html.includes(marker))throw new Error('缺少占位 '+marker);html=html.replace(marker,()=>text);};
put('/*__KEYSHIM__*/',read('src/obs-key-shim.js'));
put('/*__STYLE__*/',read('src/style.css')+'\n'+read('src/ui-gifts.css'));
put('/*__CORE__*/',core);
put('/*__APP__*/',read('src/app.js').replace('__LEAF_ATLAS__',()=>atlas));
fs.writeFileSync(OUT,html);
console.log(`Built ${path.basename(OUT)} (${fs.statSync(OUT).size} bytes)`);
