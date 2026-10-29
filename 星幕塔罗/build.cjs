const fs=require('node:fs'),path=require('node:path');
const root=__dirname,D=require('./src/data.js');
let page=fs.readFileSync(path.join(root,'src/page.html'),'utf8');
const images={};for(const c of D.cards){const p=path.join(root,'assets',c.asset);if(!fs.existsSync(p))throw new Error('缺少牌面 '+c.asset);images[c.id]='data:image/jpeg;base64,'+fs.readFileSync(p).toString('base64');}
const pieces={STYLE:'style.css',DATA:'data.js',ENGINE:'engine.js',TRANSPORT:'transport.js',APP:'app.js'};
for(const [key,file]of Object.entries(pieces))page=page.replace('/*__'+key+'__*/',()=>fs.readFileSync(path.join(root,'src',file),'utf8'));
page=page.replace('/*__IMAGES__*/',()=>`const TarotImages=${JSON.stringify(images)};`);
if(/\/\*__\w+__\*\//.test(page))throw new Error('未替换构建标记');
const out=path.join(root,'星幕塔罗-3.html');fs.writeFileSync(out,page);console.log(JSON.stringify({file:out,bytes:Buffer.byteLength(page),cards:D.cards.length}));
