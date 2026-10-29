import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {isRuntimeAsset} from './src/runtime-assets.js';
const minute=(Date.now()/60000+480)%1440;
const bjtDate=new Date(Date.now()+8*3600000).toISOString().slice(0,10);
const noStreamToday=process.env.CHUTAN_NO_STREAM_DATE===bjtDate;
if(!noStreamToday&&((minute>=421&&minute<541)||(minute>=1081&&minute<1201)))throw new Error('直播时段禁止构建（北京时间）');
const root=dirname(fileURLToPath(import.meta.url));
const require=createRequire(resolve(root,'../../拼豆/package.json'));
const {build}=require('esbuild');
const runtimeAssets={name:'current-stage-inline-assets',setup(b){b.onLoad({filter:/[\\/]assets[\\/]inline-assets\.mjs$/},({path})=>{
 const source=readFileSync(path,'utf8'),start=source.indexOf('export default ')+15;
 const payload=JSON.parse(source.slice(start,source.lastIndexOf(';')));
 return{contents:'export default '+JSON.stringify(Object.fromEntries(Object.entries(payload).filter(([id])=>isRuntimeAsset(id))))+';',loader:'js'};
});}};
const result=await build({entryPoints:[resolve(root,'src/main.js')],bundle:true,write:false,format:'iife',platform:'browser',target:['chrome103'],minify:process.argv.includes('--release'),charset:'utf8',plugins:[runtimeAssets]});
const js=result.outputFiles[0].text.replace(/<\/script/gi,'<\\/script');
const html=readFileSync(resolve(root,'src/page.html'),'utf8').replace('__INLINE_BUNDLE__',()=>js);
// srcdoc contains the exact release HTML: trial itself is also a standalone offline file.
const embedded=JSON.stringify(html).replace(/</g,'\\u003c');
const trialHtml=readFileSync(resolve(root,'src/trial.html'),'utf8').replace('__EMBEDDED_HTML__',()=>embedded);
const maxBytes=10000000;
if(Buffer.byteLength(html)>maxBytes||Buffer.byteLength(trialHtml)>maxBytes)throw Error('整份HTML超过10 MB，请检查图片导出体积。');
const output=resolve(root,'..');mkdirSync(output,{recursive:true});writeFileSync(resolve(output,'出摊啦.html'),html);writeFileSync(resolve(output,'试玩.html'),trialHtml);
console.log(`已生成 出摊啦.html 和 试玩.html（${(Buffer.byteLength(html)/1024).toFixed(1)} KB）`);
