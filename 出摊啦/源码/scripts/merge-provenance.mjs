import {readFileSync,writeFileSync,statSync,existsSync} from 'node:fs';
import {resolve,dirname,relative,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../assets');
const manifest=JSON.parse(readFileSync(resolve(root,'manifest.json'),'utf8'));
const byId=new Map(manifest.assets.map(a=>[a.id,a]));
const files=['root-master.json','root-props.json','customers-01-08.json','customers-09-16.json','counters.json','counters-v2-noodle.json','counters-v2-pancake.json','counters-v2-tea-sushi.json','tools-batch2.json','rent-batch3.json','events-actors-batch4.json','events-fx-batch4.json','shops-batch5.json'];
const records=[];
for(const name of files){
 const source=JSON.parse(readFileSync(resolve(root,'prompts',name),'utf8'));
 const list=Array.isArray(source)?source:Array.isArray(source.records)?source.records:[source];
 for(const r of list){
  const assetId=r.id&&byId.has(r.id)?r.id:basename(r.file||r.localRawName||r.rawPath||'', '.png');
  const ids=r.assetIds||(/^counter_(noodle|pancake|tea|sushi)_master$/.test(r.id||'')?['left','mid','right'].map(p=>r.id.replace(/master$/,p)):assetId?[assetId]:[]);
  const originals=r.originalImages||[r.sourceGeneratedPath||r.generatedSource||r.sourcePath].filter(Boolean);
  const rawValue=r.rawPath||r.file||r.localRawName||null;
  const raw=rawValue?rawValue.replace(/^assets[\\/]/,''):null;
  const rawAbsolute=raw?(raw.includes(':')?raw:resolve(root,raw)):null;
  // The user approved people/props and rejected all v1 counters on 2026-10-22.
  const selected=name!=='counters.json' && r.selected!==false;
  if(selected){for(const file of originals)if(!existsSync(file)||statSync(file).size===0)throw Error('生成原图缺失 '+file);if(!rawAbsolute||!existsSync(rawAbsolute)||statSync(rawAbsolute).size===0)throw Error('项目原图缺失 '+rawAbsolute);}
  const derivedFiles=ids.filter(id=>byId.has(id)).map(id=>({assetId:id,src:byId.get(id).src,webp:byId.get(id).webp,operation:id.startsWith('counter_')&&!id.endsWith('_sign')?'crop-generated-master-and-resize':'preserve-full-canvas-and-resize'}));
  records.push({...r,id:r.outputId||r.id||assetId,assetIds:ids,createdAt:r.createdAt||(originals[0]&&existsSync(originals[0])?statSync(originals[0]).birthtime.toISOString():null),tool:r.tool||'image_gen.imagegen',mode:'built-in',selected,prompt:r.prompt,originalImages:originals,rawPath:rawAbsolute?relative(root,rawAbsolute).replaceAll('\\','/'):null,derivedFiles,recordSource:'prompts/'+name});
 }
}
const covered=new Set(records.filter(r=>r.selected).flatMap(r=>r.assetIds));
const missing=manifest.assets.filter(a=>!covered.has(a.id)).map(a=>a.id);
if(missing.length)throw Error('素材没有生成出处 '+missing.join(', '));
const result={schemaVersion:1,batches:manifest.batches,generatedAt:new Date().toISOString(),selectedCoverage:covered.size,expectedAssets:manifest.assets.length,records};
writeFileSync(resolve(root,'prompts/generation-records.json'),JSON.stringify(result,null,2)+'\n');
console.log(`生成出处已合并：${records.length}次调用记录，覆盖${covered.size}/${manifest.assets.length}张导出图。`);
