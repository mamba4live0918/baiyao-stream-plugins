const fs=require('node:fs');const path=require('node:path');
const base=__dirname;
let html=fs.readFileSync(path.join(base,'src/index.html'),'utf8');
html=html.replace('/* INLINE_ENGINE */',fs.readFileSync(path.join(base,'src/engine.js'),'utf8'));
html=html.replace('__BACKGROUND__','');
html=html.replace('</style>',fs.readFileSync(path.join(base,'src/transparent.css'),'utf8')+'</style>');
html=html.replace('</style>',fs.readFileSync(path.join(base,'src/complete.css'),'utf8')+'</style>');
html=html.replace('<script>','<script>'+fs.readFileSync(path.join(base,'../插件通用模板/overlay-kit-v1.js'),'utf8')+'</script><script>');
html=html.replace('可玩原型 · V0.1','透明试玩 · V0.2');
html=html.replace('<div class="header-end">','<div class="header-end"><button class="icon-btn" id="panel-toggle" aria-label="隐藏互动面板" title="隐藏/显示互动面板">面板</button>');
html=html.replace('</body>',`<script>
function togglePanel(){document.body.classList.toggle('controls-hidden');document.getElementById('panel-toggle').setAttribute('aria-label',document.body.classList.contains('controls-hidden')?'显示互动面板':'隐藏互动面板');release();render();}
document.getElementById('panel-toggle').onclick=togglePanel;
document.addEventListener('dblclick',e=>{if(!e.target.closest('button,input,dialog,.bin,.sidebar'))togglePanel();});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!e.target.closest('input,textarea,dialog')&&!document.getElementById('settings').open)togglePanel();});
</script></body>`);
html=html.replace('</body>','<script>'+fs.readFileSync(path.join(base,'src/complete.js'),'utf8')+'</script></body>');
fs.writeFileSync(path.join(base,'快递分拣-试玩版.html'),html);
console.log('Built standalone HTML');
