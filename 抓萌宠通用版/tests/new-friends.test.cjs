const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm');
const sharp=require('C:/Users/Mamba4live/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const root=path.resolve(__dirname,'..'),work=path.join(root,'开发/水族馆正式素材-2026-10-05');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8')),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const ids=['friend-white-lion','friend-white-lop','friend-purple-octopus'];
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

test('three friends keep IDs and prior resources, apart from the audited V1.0.12 shark repair',()=>{
 const m=read(path.join(root,'素材/manifest.json'));assert.equal(m.cows.length,112);
 const base=read(path.join(work,'friends-preservation-baseline.json')),group=read(path.join(root,'素材/小曜自己人/group.json')),source=read(path.join(root,'素材/小曜自己人/manifest.json'));
 assert.deepEqual(m.cows.slice(0,92),base.cows);assert.deepEqual(m.cows.slice(92,95).map(p=>p.id),ids);
 assert.deepEqual(currentBase.group.members,base.group.members.concat(ids));
 assert.equal(group.members.length,15);assert.deepEqual(group,approvedGroup);
 assert.deepEqual(source.slice(0,8),base.sourceFriends);assert.deepEqual(source.slice(8,11).map(p=>p.id),ids);
 assert.deepEqual(source.slice(0,11),currentBase.sourceFriends);
 assert.deepEqual(m.categories.find(c=>c.id==='xiaoyao'),approvedGroup);
 assert.equal(currentBase.manifest.cows.length,103);assert.deepEqual(m.cows.slice(0,103),currentBase.manifest.cows);
 assert.equal(Object.keys(currentBase.originalFiles).length,218);
 for(const[file,digest]of Object.entries(currentBase.originalFiles))assert.equal(hash(fs.readFileSync(path.join(root,'素材',file))),digest,file+' V1.0.19 body');
 const repair=read(path.join(work,'shark-v112-audit.json')),allowed=new Set(repair.allowedChanges);assert(repair.finGeometryPassed);
 for(const [file,digest]of Object.entries(base.files)){
  const current=hash(fs.readFileSync(path.join(root,'素材',file)));
  if(allowed.has(file)){assert.equal(repair.before.files[file],digest,file+' original');assert.equal(current,repair.after[file],file+' audited repair');}
  else assert.equal(current,digest,file);
 }
 assert.equal(m.cows[79].id,'friend-octopus');assert.notEqual(m.cows[79].src,m.cows[94].src);
});

test('new friends use 12 unique transparent articulated frames, common scales and matched posters',async()=>{
 const m=read(path.join(root,'素材/manifest.json'));assert.equal(m.cows.length,112);
 const report=read(path.join(work,'friends-assembly-report.json'));
 for(let n=0;n<ids.length;n++){
  const pet=m.cows[92+n];assert.equal(pet.id,ids[n]);assert.equal(pet.category,'xiaoyao');assert.equal(pet.motion,n===1?'hop':'walk');assert.equal(pet.sourceFacing,n===2?1:-1);assert.equal(pet.articulated,true);assert.equal(pet.frames,12);
  const strip=path.join(root,'素材',pet.walk),meta=await sharp(strip).metadata();assert.equal(meta.width,3072);assert.equal(meta.height,256);assert(meta.hasAlpha);
  const hashes=[];
  for(let i=0;i<12;i++){
   const raw=await sharp(strip).extract({left:i*256,top:0,width:256,height:256}).raw().toBuffer();hashes.push(hash(raw));let occupied=0;
   for(let y=0;y<256;y++)for(let x=0;x<256;x++){const a=raw[(y*256+x)*4+3];if(a>=32)occupied++;if(x<11||x>244||y<11||y>244)assert.equal(a,0,pet.id+' margin '+i);}
   assert(occupied>1000);if(!i)assert.deepEqual(raw,await sharp(path.join(root,'素材',pet.src)).raw().toBuffer());
  }
  assert.equal(new Set(hashes).size,12);const r=report.assets.find(x=>x.id===pet.id);assert.deepEqual(hashes,r.frameHashes);assert(r.frames.every(f=>!f.sourceTouchesCellEdge));assert.equal(new Set(r.transforms.map(x=>x.scale)).size,1);assert.equal(new Set(r.transforms.map(x=>JSON.stringify(x.targetAnchor))).size,1);
  const gif=await sharp(path.join(work,pet.id+'-motion.gif'),{animated:true}).metadata();assert.equal(gif.pages,12);assert.equal(gif.delay.reduce((a,b)=>a+b,0),r.cycleMs);
 }
 const contact=await sharp(path.join(work,'xiaoyao-contact.png')).metadata();assert.equal(contact.width,1280);assert.equal(contact.height,1144);
});

test('old settings expand to 112 without occupying custom kind100 or rewriting index79',async()=>{
 const assets=read(path.join(root,'素材/manifest.json'));assert.equal(assets.cows.length,112);
 const settings=Array.from({length:92},(_,i)=>({enabled:i!==79,scale:i===79?145:100,fps:8,motion:'default'}));
 const saved={tiers:require('../src/core.js').defaultTiers(),cowSettings:settings,activeCategory:'xiaoyao',customCows:[{kind:100,name:'自定义',enabled:true,scale:80,category:'xiaoyao',motion:'walk'}]};
 const ctx={structuredClone,console,PetRoamGeometry:require('../src/roam-geometry.js'),localStorage:{getItem:()=>JSON.stringify(saved),setItem(){}}};
 vm.runInNewContext(fs.readFileSync(path.join(root,'src/customize.js'),'utf8')+';globalThis.Type=CowCustomizer;',ctx);
 for(const method of ['bind','bindPenManipulation','render','renderCows'])ctx.Type.prototype[method]=()=>{};ctx.Type.prototype.loadMedia=async()=>{};
 const c=new ctx.Type({assets,core:require('../src/core.js'),toast(){},onChange(){}});await c.ready;
 assert.equal(c.cfg.cowSettings.length,112);assert.equal(c.cfg.cowSettings[79].enabled,false);assert.equal(c.cfg.cowSettings[79].scale,145);assert(c.cfg.cowSettings.slice(92).every(p=>p.enabled));assert.equal(c.cfg.customCows[0].kind,100);assert.equal(c.cfg.customCows[0].scale,80);assert(c.cfg.nextCowKind>=101);
 assert.deepEqual(Array.from(c.categoryKinds('xiaoyao'),kind=>c.builtinCow(kind).id),assets.categories.find(c=>c.id==='xiaoyao').members);
});
