const fs = require('node:fs');
const path = require('node:path');
const root = __dirname;
const read = name => fs.readFileSync(path.join(root, 'src', name), 'utf8');
let html = read('template.html');
html = html.replace('/* INLINE_STYLE */', () => read('style.css')+'\n'+read('selects.css'));
const artManifest=JSON.parse(fs.readFileSync(path.join(root,'assets','v2-anime','manifest.json'),'utf8'));
const art={},artMeta={};
for(const[kind,entry]of Object.entries(artManifest)){
  const bytes=fs.readFileSync(path.join(root,'assets','v2-anime',entry.file));
  if(bytes.toString('hex',0,8)!=='89504e470d0a1a0a')throw new Error('素材必须是PNG：'+entry.file);
  art[kind]='data:image/png;base64,'+bytes.toString('base64');
  artMeta[kind]={width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20),contact:entry.contact,widthScale:entry.widthScale,...(entry.pads?{pads:entry.pads}:{})};
}
const artScript='globalThis.PuppetArt=Object.freeze('+JSON.stringify(art)+');\nglobalThis.PuppetArtMeta=Object.freeze('+JSON.stringify(artMeta)+');\n';
html = html.replace('/* INLINE_SCRIPT */', () => (artScript+['core.js','vts.js','selects.js','demo.js','pinch-marks.js','pinch-frames.js','effects.js','app.js'].map(read).join('\n;\n')).replace(/<\/script/gi, '<\\/script'));
if (/INLINE_(STYLE|SCRIPT)/.test(html)) throw new Error('构建标记残留');
fs.writeFileSync(path.join(root, '皮套互动-1.html'), html, 'utf8');
console.log('单文件 HTML 已生成，' + Buffer.byteLength(html) + ' bytes');
