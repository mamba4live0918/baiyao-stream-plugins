const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const sharp=require('C:/Users/Mamba4live/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const root=path.resolve(__dirname,'..'),work=path.join(root,'开发/水族馆正式素材-2026-10-05');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8')),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const ids=['great-white','jellyfish','hammerhead','humpback','beaver','dolphin','pufferfish','flapjack','blue-whale','giant-squid','penguin','beluga'].map(x=>'aqua-'+x);
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
test('aquarium appends twelve stable IDs and one nest without changing existing metadata or bytes',()=>{
 const m=read(path.join(root,'素材/manifest.json')),base=read(path.join(work,'preservation-baseline.json'));
 assert.equal(m.cows.length,112);assert.equal(m.barns.length,8);assert.deepEqual(m.cows.slice(80,92).map(x=>x.id),ids);
 assert.deepEqual(m.cows.slice(0,80),base.cows);assert.deepEqual(m.barns.slice(0,6),base.barns);
 const withoutGroup=categories=>categories.filter(c=>c.id!=='xiaoyao');
 const oldCategories=m.categories.filter(c=>c.id!=='xiaoyao-furry');
 require('../开发/水族馆正式素材-2026-10-05/assemble.cjs').unchangedCategories(withoutGroup(oldCategories.slice(0,base.categories.length)),withoutGroup(base.categories));assert.deepEqual(m.balls,base.balls);
 assert.deepEqual(m.categories.find(c=>c.id==='xiaoyao'),approvedGroup);
 assert.deepEqual(oldCategories[base.categories.length],{id:'aquarium',name:'水族馆',count:12});assert.equal(m.barns[6].id,'aquarium-pod');
 for(const [file,digest]of Object.entries(base.files))assert.equal(hash(fs.readFileSync(path.join(root,'素材',file))),digest,file);
});
test('all aquatic strips have twelve unique transparent frames and matching frame-zero posters',async()=>{
 const m=read(path.join(root,'素材/manifest.json')),report=read(path.join(work,'assembly-report.json'));
 assert.equal(report.assets.length,12);
 for(const id of ids){
  const p=m.cows.find(p=>p.id===id);assert(p,id);assert.equal(p.category,'aquarium');assert.equal(p.motion,'swim');assert.equal(p.frames,12);assert.equal(p.articulated,true);
  assert.equal(p.sourceFacing,['aqua-jellyfish','aqua-flapjack'].includes(id)?1:-1);assert(Number.isInteger(p.swimCycleMs)&&p.swimCycleMs>0);
  const source=path.join(root,'素材',p.walk),meta=await sharp(source).metadata();assert.equal(meta.width,3072);assert.equal(meta.height,256);assert(meta.hasAlpha);
  const hashes=[];
  for(let i=0;i<12;i++){
   const raw=await sharp(source).extract({left:i*256,top:0,width:256,height:256}).raw().toBuffer();hashes.push(hash(raw));let occupied=0;
   for(let y=0;y<256;y++)for(let x=0;x<256;x++){const a=raw[(y*256+x)*4+3];if(a>=32)occupied++;if(x<11||x>244||y<11||y>244)assert.equal(a,0,id+' frame '+i+' margin');}
   assert(occupied>1000,id+' empty frame');
   if(i===0)assert.deepEqual(raw,await sharp(path.join(root,'素材',p.src)).raw().toBuffer(),id+' poster');
  }
  assert.equal(new Set(hashes).size,12,id);const r=report.assets.find(x=>x.id===id);assert.deepEqual(hashes,r.frameHashes);assert.equal(r.transforms.length,12);
  assert.equal(new Set(r.transforms.map(t=>t.scale)).size,1,id+' common scale');assert.equal(new Set(r.transforms.map(t=>JSON.stringify(t.targetAnchor))).size,1,id+' common anchor');
  assert(r.frames.every(f=>!f.sourceTouchesCellEdge),id+' source cut crosses silhouette');
  const gif=await sharp(path.join(work,id+'-motion.gif'),{animated:true}).metadata();assert.equal(gif.pages,12);assert.equal(gif.delay.reduce((a,b)=>a+b,0),p.swimCycleMs);assert.equal(gif.loop,0);
 }
 const montage=await sharp(path.join(work,'aquarium-motion.gif'),{animated:true}).metadata();assert.equal(montage.pages,40);assert.equal(montage.delay.reduce((a,b)=>a+b,0),4000);
});
test('gutter selection keeps a protruding appendage with its own frame',()=>{
 const {clearCuts}=require('../开发/水族馆正式素材-2026-10-05/assemble.cjs'),profile=Array(400).fill(0);
 for(let x=10;x<85;x++)profile[x]=30;for(let x=97;x<180;x++)profile[x]=20;
 const cuts=clearCuts(profile,4);assert(cuts[1]<97);assert(cuts[1]>85);assert.equal(cuts.length,5);
});

test('refined squid is extracted at native non-divisible dimensions without touching its limbs',()=>{
 const r=read(path.join(work,'assembly-report.json')).assets.find(p=>p.id==='aqua-giant-squid');
 assert.deepEqual(r.sourceDimensions,[1447,1087]);assert.equal(r.frames.length,12);assert(r.frames.every(f=>!f.sourceTouchesCellEdge));
 assert.equal(r.grid.nominalXs.at(-1),1447);assert.equal(r.grid.nominalYs.at(-1),1087);
 assert.equal(hash(fs.readFileSync(path.join(work,'raw/aqua-giant-squid-atlas.png'))),hash(fs.readFileSync(path.join(work,'raw/aqua-giant-squid-atlas-refined.png'))));
 assert.notEqual(hash(fs.readFileSync(path.join(work,'raw/aqua-giant-squid-atlas-v1-preserved.png'))),r.sourceSha256);
});
