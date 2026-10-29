const fs=require('node:fs'),path=require('node:path');
const root=__dirname;let html=fs.readFileSync(path.join(root,'src/page.html'),'utf8');
for(const [token,file]of Object.entries({SURFACE:'surface.js',STYLE:'style.css',THEME_STYLE:'theme-styles.css',THEMES:'themes.js',ENGINE:'engine.js',TRANSPORT:'transport.js',MODEL:'model.js',STORAGE:'storage.js',MOTION:'motion.js',APP:'app.js'}))html=html.replace('/*__'+token+'__*/',()=>fs.readFileSync(path.join(root,'src',file),'utf8'));
if(/\/\*__\w+__\*\//.test(html))throw Error('未替换构建标记');
const target=path.join(root,'锐评排队-BYSL-10.html');fs.writeFileSync(target,html,'utf8');console.log(JSON.stringify({file:target,bytes:Buffer.byteLength(html)}));
