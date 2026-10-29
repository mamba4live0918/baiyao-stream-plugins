const fs=require('node:fs');const path=require('node:path');
const root=__dirname,src=path.join(root,'src');
let html=fs.readFileSync(path.join(src,'shell.html'),'utf8');
for(const [marker,name] of [['STYLE','style.css'],['ENGINE','engine.js'],['BRIDGE','bridge.js'],['APP','app.js']]){
  const data=fs.readFileSync(path.join(src,name),'utf8');
  if(/<\/script/i.test(data)&&name.endsWith('.js'))throw Error('Unsafe script terminator in '+name);
  html=html.replace('/* INLINE_'+marker+' */',()=>data);
}
const atlas=fs.readFileSync(path.join(src,'assets','role-art-atlas.png')).toString('base64');
html=html.replace('/* INLINE_ROLE_ATLAS */',()=> 'data:image/png;base64,'+atlas);
if(/INLINE_/.test(html))throw Error('Incomplete build');
const out=path.join(root,'异世界访客登记系统-1.html');fs.writeFileSync(out,html);console.log(JSON.stringify({output:out,bytes:Buffer.byteLength(html)}));
