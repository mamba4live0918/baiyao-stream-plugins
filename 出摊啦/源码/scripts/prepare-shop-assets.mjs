import {readFileSync,writeFileSync,copyFileSync,existsSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
const minute=(Date.now()/60000+480)%1440;if((minute>=421&&minute<541)||(minute>=1081&&minute<1201))throw Error('直播时段禁止素材导出');
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),assets=resolve(root,'assets');
const require=createRequire(resolve(root,'package.json')),sharp=require(resolve(root,'../../plugin-library-site/node_modules/sharp'));
const json=f=>JSON.parse(readFileSync(resolve(assets,f),'utf8').replace(/^\uFEFF/,'')),sha=b=>createHash('sha256').update(b).digest('hex');
const frozen=json('approved-through-batch4-hashes.json');
function verify(){for(const e of frozen.entries){const b=readFileSync(resolve(assets,e.path));if(b.length!==e.bytes||sha(b)!==e.sha256)throw Error('旧素材必须保留 '+e.path);}}
verify();
const records=json('prompts/shops-batch5.json').filter(r=>r.selected),ids=['batter_bucket','egg_basket','griddle','batter_disk_1','batter_disk_2','batter_disk_3','egg_on_pancake','spatula','pancake_bag','pearl_jar','cup_back','cup_front','cup_tea','cup_pearls_1','cup_pearls_2','cup_pearls_3','cup_lid','shaker','shaker_lid','bobbing_pearl'];
if(records.length!==20||ids.some(id=>!records.some(r=>r.id===id)))throw Error('第5批20张生成记录必须齐全');
const point=(name,x,y)=>({name,x,y,units:'source-px'}),rect=(x,y,width,height)=>({x,y,width,height,units:'source-px'}),bounds={};
async function alphaBounds(file){const {data,info}=await sharp(file).ensureAlpha().raw().toBuffer({resolveWithObject:true});let minX=info.width,minY=info.height,maxX=-1,maxY=-1;for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++)if(data[(y*info.width+x)*4+3]>16){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}return{x:minX,y:minY,width:maxX-minX+1,height:maxY-minY+1};}
mkdirSync(resolve(assets,'raw/shops'),{recursive:true});mkdirSync(resolve(assets,'src/shops'),{recursive:true});
for(const r of records){const raw=resolve(assets,r.rawPath),source=readFileSync(r.sourcePath);if(existsSync(raw)){if(sha(readFileSync(raw))!==sha(source))throw Error('不能覆盖新原图 '+r.id);}else copyFileSync(r.sourcePath,raw);const png=resolve(assets,'src/shops',r.id+'.png');if(!existsSync(png))await sharp(raw).resize(r.displaySize.width*2,r.displaySize.height*2,{fit:'contain',background:{r:0,g:0,b:0,alpha:0}}).png().toFile(png);bounds[r.id]=await alphaBounds(png);}
const manifest=json('manifest.json'),all={};
const cup=bounds.cup_back,cupBase={x:110,y:cup.y+cup.height-12},mouth={x:110,y:cup.y+24};
for(const r of records){
 const id=r.id,{width:w,height:h}=r.displaySize,W=w*2,H=h*2,b=bounds[id];
 let anchor=point('bottom-center',W/2,H-8),anchors=[],layerRect=rect(0,0,W,H),extra={};
 if(id==='griddle'){anchor=point('cooking-center',280,168);anchors=[point('front-edge',280,280)];extra.opening={cx:280,cy:168,rx:220,ry:98,units:'source-px'};}
 if(id.startsWith('batter_disk_')){anchor=point('batter-center',b.x+b.width/2,b.y+b.height/2);layerRect=rect(280-anchor.x,168-anchor.y,W,H);}
 if(id==='egg_on_pancake')anchor=point('center',W/2,H/2);
 if(id==='spatula')anchor=point('grip',266,70);
 if(id==='pancake_bag')extra.textRect=rect(24,133,132,48);
 if(id.startsWith('cup_')){
  anchor=point('cup-base',110,cupBase.y);anchors=[point('mouth-center',mouth.x,mouth.y),point('inner-base',cupBase.x,cupBase.y)];
  if(id==='cup_tea'||/^cup_pearls_/.test(id)){
   const level=Number(id.at(-1))||0,targetW=level?[110,118,124][level-1]:144,targetH=level?[34,60,86][level-1]:190,scale=Math.min(1,targetW/b.width,targetH/b.height);
   anchor=point('filling-base',b.x+b.width/2,b.y+b.height);layerRect=rect(cupBase.x-anchor.x*scale,cupBase.y-anchor.y*scale,W*scale,H*scale);
  }
  if(id==='cup_lid'){const scale=Math.min(1,cup.width/b.width);anchor=point('mouth-center',b.x+b.width/2,b.y+b.height-11);layerRect=rect(mouth.x-anchor.x*scale,mouth.y-anchor.y*scale,W*scale,H*scale);}
  extra.innerClip={points:[[cup.x+10,mouth.y+8],[cup.x+cup.width-10,mouth.y+8],[154,cupBase.y],[66,cupBase.y]],units:'source-px'};
 }
 if(id==='shaker'){anchor=point('grip',105,145);anchors=[point('mouth-center',105,b.y+24)];}
 if(id==='shaker_lid'){const body=bounds.shaker,target={x:105,y:body.y+24};anchor=point('mouth-center',b.x+b.width/2,b.y+b.height-10);layerRect=rect(target.x-anchor.x,target.y-anchor.y,W,H);}
 if(id==='bobbing_pearl')anchor=point('center',14,14);
 const entry={id,label:r.label||id,group:'shops',batch:5,displaySize:r.displaySize,sourceSize:{width:W,height:H},anchor,anchors,layerRect,...extra,
  src:'src/shops/'+id+'.png',webp:'webp/shops/'+id+'.webp',rawSource:r.rawPath,rawSources:[r.rawPath],
  frameSequence:id.startsWith('batter_disk_')?['batter_disk_1','batter_disk_2','batter_disk_3']:id.startsWith('cup_pearls_')?['cup_pearls_1','cup_pearls_2','cup_pearls_3']:[id],
  provenance:{promptFile:'prompts/shops-batch5.json',recordFile:'prompts/generation-records.json',recordAssetId:id,rawSources:[r.rawPath]},
  derivation:{kind:'whole-generated-source-frame',preserveFullSourceCanvas:true,cropTransparentBorder:false,drawn:false,recolored:false,operations:['preserve-full-source-canvas','proportional-resize','transparent-contain-padding'],registration:'explicit-source-pixel-anchors-and-layerRect'}};
 const index=manifest.assets.findIndex(a=>a.id===id);if(index<0)manifest.assets.push(entry);else manifest.assets[index]={...manifest.assets[index],...entry};all[id]=entry;
}
if(!manifest.groups.some(g=>g.id==='shops'))manifest.groups.push({id:'shops',label:'煎饼和奶茶工具'});
for(const frames of [['batter_disk_1','batter_disk_2','batter_disk_3'],['cup_pearls_1','cup_pearls_2','cup_pearls_3']]){const id=frames[0].replace(/_1$/,'')+'_levels',entry={id,kind:'states',loop:false,frames,alignment:'source-px layerRect on common reference canvas'};const i=manifest.sequences.findIndex(s=>s.id===id);if(i<0)manifest.sequences.push(entry);else manifest.sequences[i]=entry;}
manifest.batch=5;manifest.batches=[1,2,3,4,5];manifest.title='出摊啦 · 第1–5批图片素材';manifest.inlineBudgetBytes=10000000;
writeFileSync(resolve(assets,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
for(const script of ['merge-provenance.mjs','prepare-assets.mjs']){const result=spawnSync(process.execPath,[resolve(root,'scripts',script)],{cwd:root,encoding:'utf8'});if(result.stdout)process.stdout.write(result.stdout);if(result.stderr)process.stderr.write(result.stderr);if(result.status!==0)throw Error(script+' failed '+result.status);}
verify();const p=json('processing-report.json'),entries=p.entries.filter(e=>ids.includes(e.id));const report={completedAt:new Date().toISOString(),newAssets:entries.length,newWebpBytes:entries.reduce((s,e)=>s+e.bytes,0),oldFilesVerified:frozen.entries.length,oldFilesUnchanged:true,totalAssets:manifest.assets.length,assets:entries.map(({id,bytes,visibleBounds})=>({id,bytes,visibleBounds}))};
mkdirSync(resolve(root,'qa/步骤6'),{recursive:true});writeFileSync(resolve(root,'qa/步骤6/第5批素材导出.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
