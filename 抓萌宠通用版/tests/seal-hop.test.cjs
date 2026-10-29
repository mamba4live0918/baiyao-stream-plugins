const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),Core=require('../src/core.js'),Motion=require('../src/motion.js'),Geometry=require('../src/roam-geometry.js');
const read=p=>fs.readFileSync(path.join(root,p),'utf8'),assets=JSON.parse(read('素材/manifest.json'));
const options={enabled:true,speed:45,size:90,radius:20,bounds:{left:0,right:10000,top:0,bottom:700}};
const pet=()=>({x:300,y:400,size:90,held:false,airborne:false,roamVX:1,roamVY:0,turnIn:100,wait:0,hopWait:0,articulated:true,walkFrames:12});
async function custom(saved){
 const ctx={structuredClone,PetRoamGeometry:Geometry,localStorage:{getItem:()=>saved?JSON.stringify({tiers:Core.defaultTiers(),...saved}):null,setItem(){}},document:{getElementById:()=>null}};
 vm.runInNewContext(read('src/customize.js')+';globalThis.Type=CowCustomizer;',ctx);
 for(const method of ['bind','bindPenManipulation','render','renderCows','renderBarns','syncControls'])ctx.Type.prototype[method]=()=>{};ctx.Type.prototype.loadMedia=async()=>{};
 const c=new ctx.Type({assets,core:Core,toast(){},onChange(){}});await c.ready;return c;
}
test('all twelve default seals visibly leave the ground and move only during their flight',async()=>{
 const c=await custom();const seals=assets.cows.flatMap((a,i)=>a.category==='seal'?[i]:[]);assert.equal(seals.length,12);
 for(const kind of seals){
  const p=pet(),frames=new Set(),stages=new Set();let lift=0,distance=0;
  for(let n=0;n<600;n++){
   const x=p.x,y=p.y,stage=p.hopStage;Motion.step(p,1/60,options,c.cowMotion(kind),Core,()=>.8);frames.add(p.hopFrame);stages.add(p.hopStage);lift=Math.min(lift,p.hopLift);distance+=Math.hypot(p.x-x,p.y-y);
   if(stage==='rest'||stage==='prep'||stage==='land'){assert.equal(p.x,x,'grounded seal must not glide');assert.equal(p.y,y);}
   assert.equal(p.hopScaleX,1);assert.equal(p.hopScaleY,1);assert.equal(p.motionTilt,0);
  }
  assert(lift<-20,assets.cows[kind].id+' must visibly hop');assert(distance>10);assert.deepEqual([...stages].sort(),['flight','land','prep','rest']);assert.equal(frames.size,12);
 }
});
test('seal hops stop immediately when held, falling or disabled',()=>{
 for(const state of ['held','airborne','disabled']){const p=pet();for(let i=0;i<24;i++)Motion.step(p,1/60,options,'scoot',Core,()=>.8);assert(p.hopLift<-10);const x=p.x,y=p.y;if(state!=='disabled')p[state]=true;Motion.step(p,1/60,{...options,enabled:state!=='disabled'},'scoot',Core,()=>.8);assert.equal(p.x,x);assert.equal(p.y,y);assert.equal(p.hopLift,0);assert.equal(p.hopFrame,0);assert.equal(p.motionStage,'rest');}
});
test('single-image seals use the same launch-and-land cadence rather than continuous sliding',()=>{
 const p={...pet(),articulated:false,walkFrames:1};let minLift=0,grounded=0;
 for(let i=0;i<180;i++){const x=p.x,stage=p.hopStage;Motion.step(p,1/60,options,'scoot',Core,()=>.8);minLift=Math.min(minLift,p.hopLift);if(['prep','land','rest'].includes(stage)){assert.equal(p.x,x);grounded++;}}
 assert(minLift<-20);assert(grounded>30);assert(p.x>300);
});
test('old saved scoot selections receive seal hopping while other explicit overrides remain intact',async()=>{
 const cfg=assets.cows.map(()=>({enabled:true,scale:100,fps:8,motion:'default'}));cfg[60].motion='scoot';cfg[61].motion='float';cfg[62].motion='walk';const c=await custom({cowSettings:cfg,avatarMotion:'scoot'});
 assert.equal(c.cowMotion(60),'scoot');assert.equal(c.cowMotion(61),'float');assert.equal(c.cowMotion(62),'walk');assert.equal(c.cfg.avatarMotion,'scoot');
 const p=pet();for(let i=0;i<40;i++)Motion.step(p,1/60,options,c.cowMotion(60),Core,()=>.8);assert(p.maxLift<-20);
});
test('the seal profile and all rendered selection names describe jumping using the unchanged ID',()=>{
 assert.equal(Motion.PROFILES.scoot,'海豹跳跃');for(const file of ['src/customize.js','src/settings.html']){const source=read(file);assert.match(source,/海豹跳跃/);assert.doesNotMatch(source,/海豹滑行/);}
});
