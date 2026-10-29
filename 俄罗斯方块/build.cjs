const fs=require('node:fs'),path=require('node:path');
let html=fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
html=html.replace('<link rel="stylesheet" href="style.css">',()=>`<style>${fs.readFileSync(path.join(__dirname,'style.css'),'utf8')}</style>`);
html=html.replace('<link rel="stylesheet" href="broadcast-ui.css">',()=>`<style>${fs.readFileSync(path.join(__dirname,'broadcast-ui.css'),'utf8')}</style>`);
html=html.replace('<link rel="stylesheet" href="live-settings.css">',()=>`<style>${fs.readFileSync(path.join(__dirname,'live-settings.css'),'utf8')}</style>`);
html=html.replace('<link rel="stylesheet" href="overtime-ui.css">',()=>`<style>${fs.readFileSync(path.join(__dirname,'overtime-ui.css'),'utf8')}</style>`);
for(const file of ['engine.js','baiyao-overtime-client.js','local-overtime.js','overtime.js','live-input.js','live-settings.js','broadcast-ui.js','overtime-ui.js','game.js'])html=html.replace(`<script src="${file}"></script>`,()=>`<script>${fs.readFileSync(path.join(__dirname,file),'utf8')}</script>`);
fs.writeFileSync(path.join(__dirname,'俄罗斯方块-整活试玩.html'),html);
console.log('俄罗斯方块离线版已生成');
