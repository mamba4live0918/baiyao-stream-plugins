import {readFileSync,writeFileSync,copyFileSync,existsSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const m=(Date.now()/60000+480)%1440;if((m>=421&&m<541)||(m>=1081&&m<1201))throw Error('直播时段禁止素材导出');
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),assets=resolve(root,'assets');
const json=f=>JSON.parse(readFileSync(resolve(assets,f),'utf8').replace(/^\uFEFF/,''));
const sha=b=>createHash('sha256').update(b).digest('hex');
const frozen=json('approved-through-batch3-hashes.json');
function verify(){for(const e of frozen.entries){const b=readFileSync(resolve(assets,e.path));if(b.length!==e.bytes||sha(b)!==e.sha256)throw Error('禁止修改旧素材 '+e.path);}}
verify();
const sources=['events-actors-batch4.json','events-fx-batch4.json'];
const records=sources.flatMap(file=>json('prompts/'+file).filter(r=>r.selected).map(r=>({...r,promptFile:'prompts/'+file})));
if(records.length!==45||new Set(records.map(r=>r.id)).size!==45)throw Error('第4批45张生成记录必须完整');
const groups=[['thief_walk_1','thief_walk_2'],['cat_sit','cat_eat','cat_held'],['bus','bus_door_open'],['helper_run_1','helper_run_2','helper_serve'],['guard_stand','guard_block'],['flame_1','flame_2','flame_3'],['smoke_1','smoke_2'],['foam_1','foam_2','foam_3'],['explosion_1','explosion_2'],...['soot','noodle','batter','tea'].map(k=>[1,2,3].map(n=>`gunk_${k}_${n}`))];
const point=(name,x,y)=>({name,x:x*2,y:y*2,units:'source-px'}),rect=(x,y,width,height)=>({x:x*2,y:y*2,width:width*2,height:height*2,units:'source-px'});
const cvt=p=>p?{...p,...Object.fromEntries(Object.entries(p).filter(([k,v])=>['x','y','width','height'].includes(k)&&typeof v==='number').map(([k,v])=>[k,v*(p.units==='source-px'?1:2)])),units:'source-px'}:null;
const manifest=json('manifest.json');mkdirSync(resolve(assets,'raw/events'),{recursive:true});
for(const r of records){
 const {id,displaySize}=r,w=displaySize.width,h=displaySize.height,rawSource='raw/events/'+id+'.png',target=resolve(assets,rawSource),b=readFileSync(r.sourcePath);
 if(existsSync(target)){if(sha(readFileSync(target))!==sha(b))throw Error('不能覆盖现有生成图 '+id);}else copyFileSync(r.sourcePath,target);
 let anchor=cvt(r.anchor)||point('center',w/2,h/2),anchors=(r.attachments||[]).map(a=>cvt({...a,name:a.name==='back-wheel'?'wheel-left':a.name==='front-wheel'?'wheel-right':a.name}));
 if(id.startsWith('cat_')){anchor=point('paws-center',90,182);anchors.push(point('scruff',90,35));}
 if(id.startsWith('flame_'))anchor=point('base-center',70,192);
 if(id==='fuse_box'){anchor=point('center',45,65);anchors.push(point('lever-pivot',45,65));}
 if(id==='fuse_lever'&&!r.anchor)anchor=point('lever-pivot',w/2,h*.6);
 let textRect=cvt(r.textRect);
 if(id==='big_hand')textRect=rect(85,137,80,24);
 if(id.startsWith('helper_'))textRect=rect(73,29,62,14);
 if(id==='wanted_poster')textRect=rect(15,151,120,33);
 const frameSequence=groups.find(ids=>ids.includes(id))||[id];
 const entry={id,label:r.label||id,group:'events',batch:4,displaySize,sourceSize:{width:w*2,height:h*2},anchor,anchors,frameSequence,
  src:'src/events/'+id+'.png',webp:'webp/events/'+id+'.webp',rawSource,rawSources:[rawSource],...(textRect?{textRect}:{}),
  provenance:{promptFile:r.promptFile,recordFile:'prompts/generation-records.json',generationFamily:frameSequence[0],recordAssetId:id,rawSources:[rawSource]},
  derivation:{kind:'whole-generated-source-frame',cropTransparentBorder:false,preserveFullSourceCanvas:true,resize:true,drawn:false,recolored:false,operations:['preserve-full-source-canvas','proportional-resize','transparent-contain-padding']}};
 if(id==='wanted_poster')entry.portraitRect=rect(27,40,96,100);
 const index=manifest.assets.findIndex(a=>a.id===id);if(index<0)manifest.assets.push(entry);else manifest.assets[index]={...manifest.assets[index],...entry};
}
if(!manifest.groups.some(g=>g.id==='events'))manifest.groups.push({id:'events',label:'捣乱和帮忙'});
for(const frames of groups){const entry={id:frames[0].replace(/_1$/,'')+'_states',kind:'states',loop:!frames[0].startsWith('gunk_'),frames,alignment:'shared-full-frame-registration'};const i=manifest.sequences.findIndex(s=>s.id===entry.id);if(i<0)manifest.sequences.push(entry);else manifest.sequences[i]=entry;}
manifest.batch=4;manifest.batches=[1,2,3,4];manifest.title='出摊啦 · 第1–4批图片素材';manifest.inlineBudgetBytes=10000000;
writeFileSync(resolve(assets,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
for(const script of ['merge-provenance.mjs','prepare-assets.mjs']){const r=spawnSync(process.execPath,[resolve(root,'scripts',script)],{cwd:root,encoding:'utf8'});if(r.stdout)process.stdout.write(r.stdout);if(r.stderr)process.stderr.write(r.stderr);if(r.status!==0)throw Error(script+' failed '+r.status);}
verify();const processing=json('processing-report.json'),newEntries=processing.entries.filter(a=>records.some(r=>r.id===a.id));
const report={completedAt:new Date().toISOString(),newAssets:newEntries.length,newWebpBytes:newEntries.reduce((n,e)=>n+e.bytes,0),oldFilesVerified:frozen.entries.length,oldFilesUnchanged:true,totalAssets:manifest.assets.length,assets:newEntries.map(({id,bytes,visibleBounds})=>({id,bytes,visibleBounds}))};
mkdirSync(resolve(root,'qa/步骤5'),{recursive:true});writeFileSync(resolve(root,'qa/步骤5/第4批素材导出.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
