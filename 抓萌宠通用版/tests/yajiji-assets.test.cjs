const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const sharp=require('C:/Users/Mamba4live/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const root=path.resolve(__dirname,'..'),work=path.join(root,'开发/鸭吉吉主题-2026-10-06'),art=path.join(root,'素材');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8')),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const ids=['prism-tall','nightcap','obsidian-bunny','silver-bunny','rose-bunny','golden-smile','azure-bunny','moon-tall'].map(x=>'duck-'+x);
const currentBase=read(path.join(root,'开发/自己人动画-2026-10-08/preservation-baseline.json'));
const removedBirds=['friend-chicken','friend-duck','friend-goose'];
const addedFriends=['friend-gray-upright','friend-call-duck','friend-nebulosa-tabby','friend-cherry-seal'];
const movedFurry=['dog-10','dog-07','friend-tabby','cat-08','cat-01','friend-rat','friend-hamster','friend-dog'];
const expandedFriends=['friend-lynx','friend-starry-whale','friend-world-pet','friend-cloud','friend-bell-black-cat'];
const approvedGroup={...currentBase.group,members:currentBase.group.members.filter(id=>!removedBirds.includes(id)&&!movedFurry.includes(id)).concat(addedFriends,expandedFriends),labels:{
 ...Object.fromEntries(Object.entries(currentBase.group.labels).filter(([id])=>!removedBirds.includes(id)&&!movedFurry.includes(id))),
 'friend-gray-upright':'灰色立耳兔','friend-call-duck':'科尔鸭','friend-nebulosa-tabby':'⋆Nebulosa⋆（狸花猫）','friend-cherry-seal':'樱桃小海豹',
 'friend-lynx':'猞猁','friend-starry-whale':'星空鲸鱼','friend-world-pet':'世界之外小宠物','friend-cloud':'云宝宝','friend-bell-black-cat':'铃铛黑猫'
}};
test('eight logical built-in kinds append after original 95 without changing prior assets or configuration metadata',()=>{
 const m=read(path.join(art,'manifest.json')),b=read(path.join(work,'preservation-baseline.json'));
 assert.equal(m.cows.length,112);assert.equal(m.barns.length,8);assert.deepEqual(m.cows.slice(0,95),b.cows);assert.deepEqual(m.barns.slice(0,7),b.barns);assert.deepEqual(m.categories.filter(c=>c.id!=='xiaoyao-furry').slice(0,b.categories.length).filter(c=>c.id!=='xiaoyao'),b.categories.filter(c=>c.id!=='xiaoyao'));assert.deepEqual(m.balls,b.balls);
 assert.deepEqual(currentBase.manifest.categories.slice(0,b.categories.length),b.categories);assert.deepEqual(m.categories.find(c=>c.id==='xiaoyao'),approvedGroup);
 assert.deepEqual(m.cows.slice(95,103).map(x=>x.id),ids);assert.deepEqual(m.cows.slice(95,103).map(x=>x.kind),Array.from({length:8},(_,i)=>2000000+i));
 assert.equal(new Set(m.cows.map((p,i)=>p.kind??i)).size,112);assert(m.cows.slice(95).every(p=>p.kind>1999999));
 assert.deepEqual(m.categories.at(-1),{id:'yajiji',name:'鸭吉吉',count:8});assert.deepEqual(m.barns.at(-1),{id:'yajiji-nest',name:'炫彩星糖鸭窝',src:'鸭吉吉/yajiji-nest.png'});
 for(const [file,sha]of Object.entries(b.files))assert.equal(hash(fs.readFileSync(path.join(art,file))),sha,file);
});
test('all duck atlases retain twelve distinct complete padded frames and byte-identical frame-zero posters',async()=>{
 const m=read(path.join(art,'manifest.json')),report=read(path.join(work,'assembly-report.json'));assert.equal(report.assets.length,8);
 for(const p of m.cows.slice(95,103)){
  assert.equal(p.category,'yajiji');assert.equal(p.motion,'walk');assert.equal(p.frames,12);assert.equal(p.articulated,true);assert.equal(p.sourceFacing,1);assert(Number.isInteger(p.poseCycleMs)&&p.poseCycleMs>0);
  const file=path.join(art,p.walk),meta=await sharp(file).metadata();assert.equal(meta.width,3072);assert.equal(meta.height,256);assert(meta.hasAlpha);
  const hashes=[];
  for(let i=0;i<12;i++){
   const raw=await sharp(file).extract({left:i*256,top:0,width:256,height:256}).raw().toBuffer();hashes.push(hash(raw));let occupied=0;
   for(let y=0;y<256;y++)for(let x=0;x<256;x++){const alpha=raw[(y*256+x)*4+3];if(alpha>=32)occupied++;if(x<12||x>=244||y<12||y>=244)assert.equal(alpha,0,p.id+' boundary frame '+i);}
   assert(occupied>1000,p.id+' empty');if(i===0)assert.deepEqual(raw,await sharp(path.join(art,p.src)).raw().toBuffer(),p.id+' poster');
  }
  assert.equal(new Set(hashes).size,12,p.id);const r=report.assets.find(x=>x.id===p.id);assert.deepEqual(hashes,r.frameHashes);assert(r.frames.every(f=>!f.sourceTouchesCellEdge),p.id+' source cut');
  assert.equal(new Set(r.transforms.map(t=>t.scale)).size,1);assert.equal(new Set(r.transforms.map(t=>JSON.stringify(t.targetAnchor))).size,1);
  assert(r.registeredHeadResidualPx.every(n=>n<1),p.id+' anchor rounding');
  if(p.id!=='duck-prism-tall'){assert.equal(r.requestedAnchorMode,'head-template');assert.equal(r.fallbackFrames.length,12,p.id+' must not switch eye and patch anchors mid-cycle');}
  const gif=await sharp(path.join(work,p.id+'-motion.gif'),{animated:true}).metadata();assert.equal(gif.pages,12);assert.equal(gif.delay.reduce((a,b)=>a+b,0),p.poseCycleMs);assert.equal(gif.loop,0);
 }
 const nest=await sharp(path.join(art,'鸭吉吉/yajiji-nest.png')).metadata();assert(nest.hasAlpha);
 const grid=await sharp(path.join(work,'yajiji-contact.png')).metadata();assert.equal(grid.width,1024);assert.equal(grid.height,572);
 const gif=await sharp(path.join(work,'yajiji-motion.gif'),{animated:true}).metadata();assert.equal(gif.pages,40);assert.equal(gif.delay.reduce((a,b)=>a+b,0),4000);
});
test('old aquarium entry point refuses the expanded roster before writing any old images',()=>{
 assert.equal(read(path.join(art,'manifest.json')).cows.length,112);
 const b=read(path.join(work,'preservation-baseline.json')),child=require('node:child_process').spawnSync(process.execPath,[path.join(root,'开发/水族馆正式素材-2026-10-05/assemble.cjs')],{encoding:'utf8',timeout:10000});
 assert.equal(child.status,1);assert.match(child.stderr,/refusing before any aquarium asset writes/);
 for(const [file,sha]of Object.entries(b.files))assert.equal(hash(fs.readFileSync(path.join(art,file))),sha,file);
});
