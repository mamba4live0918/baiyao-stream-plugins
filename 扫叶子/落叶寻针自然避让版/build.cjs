const fs=require('node:fs'),path=require('node:path');const read=n=>fs.readFileSync(path.join(__dirname,n),'utf8');
const atlas=fs.readFileSync(path.join(__dirname,'assets/cute-atlas.png')).toString('base64');
const basket=fs.readFileSync(path.join(__dirname,'assets/basket.png')).toString('base64');
const html=read('src/shell.html').replace('/*__STYLE__*/',()=>read('src/style.css')).replace('/*__CORE__*/',()=>read('src/layout.js')+'\n'+read('src/core.js')+'\n'+read('src/battle.js')).replace('/*__APP__*/',()=>read('src/gpu.js')+'\n'+read('src/app.js').replace('/*__BATTLE_UI__*/',()=>read('src/battle-ui.js'))).replace('__LEAF_ATLAS__',()=>`data:image/png;base64,${atlas}`).replace('__BASKET_IMAGE__',()=>`data:image/png;base64,${basket}`);
const file=path.join(__dirname,'../落叶寻针-v0.11-自然避让完整版.html');fs.writeFileSync(file,html);console.log('Built '+path.basename(file)+' ('+fs.statSync(file).size+' bytes)');
