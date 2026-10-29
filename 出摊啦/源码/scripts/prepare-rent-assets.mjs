import {readFileSync,writeFileSync,copyFileSync,existsSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';

const minute=(Date.now()/60000+480)%1440;
if((minute>=421&&minute<541)||(minute>=1081&&minute<1201))throw Error('直播时段禁止素材导出');
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),assets=resolve(root,'assets');
const json=name=>JSON.parse(readFileSync(resolve(assets,name),'utf8').replace(/^\uFEFF/,''));
const sha=buffer=>createHash('sha256').update(buffer).digest('hex');
const frozen=json('approved-through-batch2-hashes.json');
function verifyFrozen(){for(const item of frozen.entries){const value=readFileSync(resolve(assets,item.path));if(value.length!==item.bytes||sha(value)!==item.sha256)throw Error('禁止修改已批准素材 '+item.path);}}
verifyFrozen();
const records=json('prompts/rent-batch3.json').filter(r=>r.selected);
const ids=['landlady_stand','landlady_stamp','landlady_book','rent_sign','overtime_clock'];
if(records.length!==5||ids.some(id=>!records.some(r=>r.id===id)))throw Error('第3批五张生成记录必须完整');
mkdirSync(resolve(assets,'raw/rent'),{recursive:true});
for(const record of records){
 const source=readFileSync(record.sourcePath),target=resolve(assets,'raw/rent',record.id+'.png');
 if(existsSync(target)){if(sha(readFileSync(target))!==sha(source))throw Error('保留现有raw，禁止覆盖 '+record.id);}
 else copyFileSync(record.sourcePath,target);
 record.rawPath='raw/rent/'+record.id+'.png';
 record.generatedAt=record.generatedAt||new Date().toISOString();
}
writeFileSync(resolve(assets,'prompts/rent-batch3.json'),JSON.stringify(records,null,2)+'\n');
const at=(name,x,y)=>({name,x:x*2,y:y*2,units:'source-px'});
const rect=(x,y,width,height)=>({x:x*2,y:y*2,width:width*2,height:height*2,units:'source-px'});
const pose=['landlady_stand','landlady_stamp'];
const definitions=[
 ['landlady_stand','包租婆·站立',200,260,at('feet-center',105,253),[at('book-grip',129,167)],pose],
 ['landlady_stamp','包租婆·抬手盖章',200,260,at('feet-center',105,253),[at('book-grip',129,167),at('stamp-face',84,151)],pose],
 ['landlady_book','包租婆·独立小本子',70,65,at('grip',64,52),[],['landlady_book']],
 ['rent_sign','交租倒计时挂牌',240,100,at('top-center',120,3),[],['rent_sign']],
 ['overtime_clock','自带加班机外框',320,150,at('bottom-center',160,143),[],['overtime_clock']],
];
const path=resolve(assets,'manifest.json'),manifest=json('manifest.json');
for(const[id,label,width,height,anchor,anchors,frameSequence]of definitions){
 const rawSource='raw/rent/'+id+'.png';
 const entry={id,label,group:'rent',batch:3,src:'src/rent/'+id+'.png',webp:'webp/rent/'+id+'.webp',rawSource,rawSources:[rawSource],
  displaySize:{width,height},sourceSize:{width:width*2,height:height*2},anchor,anchors,frameSequence,
  provenance:{promptFile:'prompts/rent-batch3.json',recordFile:'prompts/generation-records.json',generationFamily:frameSequence[0],recordAssetId:id,rawSources:[rawSource]},
  derivation:{kind:'whole-generated-source-frame',cropTransparentBorder:false,preserveFullSourceCanvas:true,resize:true,drawn:false,recolored:false,operations:['preserve-full-source-canvas','proportional-resize','transparent-contain-padding']}};
 if(id==='landlady_book')entry.stampRect=rect(12,25,22,20);
 if(id==='rent_sign')entry.textRect=rect(23,40,194,39);
 if(id==='overtime_clock')entry.screenRect=rect(51,47,194,54);
 const index=manifest.assets.findIndex(a=>a.id===id);
 if(index<0)manifest.assets.push(entry);else manifest.assets[index]={...manifest.assets[index],...entry};
}
if(!manifest.groups.some(g=>g.id==='rent'))manifest.groups.push({id:'rent',label:'交租和加班'});
const sequence={id:'landlady_pose',kind:'states',loop:false,frames:pose,stateNames:['stand','stamp'],alignment:'identical-full-canvas-and-feet-anchor',renderOrder:['selected-pose','landlady_book','code-stamp']};
const sequenceIndex=manifest.sequences.findIndex(s=>s.id===sequence.id);
if(sequenceIndex<0)manifest.sequences.push(sequence);else manifest.sequences[sequenceIndex]=sequence;
manifest.batch=3;manifest.batches=[1,2,3];manifest.title='出摊啦 · 第1–3批图片素材';
writeFileSync(path,JSON.stringify(manifest,null,2)+'\n');
for(const script of ['merge-provenance.mjs','prepare-assets.mjs']){
 const result=spawnSync(process.execPath,[resolve(root,'scripts',script)],{cwd:root,encoding:'utf8'});
 if(result.stdout)process.stdout.write(result.stdout);if(result.stderr)process.stderr.write(result.stderr);
 if(result.status!==0)throw Error(script+' failed '+result.status);
}
verifyFrozen();
const report=json('processing-report.json'),newEntries=report.entries.filter(e=>ids.includes(e.id));
const summary={completedAt:new Date().toISOString(),assets:newEntries.map(e=>({id:e.id,webpBytes:e.bytes,visibleBounds:e.visibleBounds})),newWebpBytes:newEntries.reduce((n,e)=>n+e.bytes,0),oldFilesVerified:frozen.entries.length,oldFilesUnchanged:true};
mkdirSync(resolve(root,'qa/步骤4'),{recursive:true});
writeFileSync(resolve(root,'qa/步骤4/第3批素材导出.json'),JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify(summary,null,2));
