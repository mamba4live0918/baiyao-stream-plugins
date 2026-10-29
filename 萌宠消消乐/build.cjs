const fs=require('node:fs');
const path=require('node:path');
const root=__dirname;
let html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const atlas=fs.readFileSync(path.join(root,'assets/animals.png')).toString('base64');
// Large data URLs exceed Chromium's custom-property expansion limit. Keep the
// embedded atlas on the background-image declaration instead of a CSS variable.
const css=fs.readFileSync(path.join(root,'style.css'),'utf8').replace('background-image:var(--atlas)',`background-image:url('data:image/png;base64,${atlas}')`);
html=html.replace('<link rel="stylesheet" href="style.css">',()=>`<style>${css}</style>`);
html=html.replace('<link rel="stylesheet" href="pranks.css">',()=>`<style>${fs.readFileSync(path.join(root,'pranks.css'),'utf8')}</style>`);
html=html.replace('<link rel="stylesheet" href="billing.css">',()=>`<style>${fs.readFileSync(path.join(root,'billing.css'),'utf8')}</style>`);
html=html.replace('<link rel="stylesheet" href="broadcast-ui.css">',()=>`<style>${fs.readFileSync(path.join(root,'broadcast-ui.css'),'utf8')}</style>`);
html=html.replace('<link rel="stylesheet" href="live-settings.css">',()=>`<style>${fs.readFileSync(path.join(root,'live-settings.css'),'utf8')}</style>`);
html=html.replace('<link rel="stylesheet" href="overtime-ui.css">',()=>`<style>${fs.readFileSync(path.join(root,'overtime-ui.css'),'utf8')}</style>`);
for(const name of ['engine.js','baiyao-overtime-client.js','local-overtime.js','overtime.js','collector.js','live-input.js','live-settings.js','broadcast-ui.js','overtime-ui.js','game.js'])html=html.replace(`<script src="${name}"></script>`,()=>`<script>${fs.readFileSync(path.join(root,name),'utf8')}</script>`);
fs.writeFileSync(path.join(root,'萌宠消消乐-无尽试玩.html'),html);
console.log('离线单文件已生成');
