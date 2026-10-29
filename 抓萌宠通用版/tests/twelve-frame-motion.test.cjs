const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../src/core.js'),Motion=require('../src/motion.js');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const options={enabled:true,speed:45,size:90,radius:20,bounds:{left:0,right:10000,top:0,bottom:700}};
const pet=()=>({x:300,y:400,size:90,held:false,airborne:false,roamVX:1,roamVY:0,turnIn:100,wait:0,articulated:true,walkFrames:12});
test('all articulated profiles play twelve poses without additional image distortion',()=>{
 for(const profile of ['run','plod','prowl','squish','hop','scoot','walk']){
  const p=pet(),frames=new Set();
  for(let i=0;i<900;i++){
   Motion.step(p,1/60,options,profile,C,()=>.8);frames.add(p.hopFrame);
   assert.equal(p.hopScaleX,1,profile+' horizontal distortion');
   assert.equal(p.hopScaleY,1,profile+' vertical distortion');
   assert.equal(p.motionTilt,0,profile+' additional tilt');
  }
  assert.deepEqual([...frames].sort((a,b)=>a-b),Array.from({length:12},(_,i)=>i),profile+' missing poses');
 }
});
test('articulated paws only cycle during movement, and speed follows distance',()=>{
 const slow=pet(),fast=pet();
 for(let i=0;i<20;i++){Motion.step(slow,1/60,{...options,speed:15},'plod',C,()=>.8);Motion.step(fast,1/60,{...options,speed:30},'plod',C,()=>.8);}
 assert(Math.abs(fast.poseClock/slow.poseClock-2)<.001);
 const clock=slow.poseClock;slow.wait=5;Motion.step(slow,1/60,options,'plod',C,()=>.8);
 assert.equal(slow.poseClock,clock);assert.equal(slow.hopFrame,0);
});
test('held, disabled and airborne articulated pets reset their visual state',()=>{
 for(const state of ['held','airborne','disabled']){
  const p=pet();p.hopFrame=9;p.hopLift=-30;
  if(state!=='disabled')p[state]=true;
  Motion.step(p,1/60,{...options,enabled:state!=='disabled'},'run',C,()=>.8);
  assert.equal(p.hopFrame,0);assert.equal(p.hopLift,0);assert.equal(p.motionStage,'rest');
 }
});
test('a pet pinned by narrow movement bounds returns to standing art',()=>{
 const p={...pet(),x:950,y:950,poseClock:.5,roamVX:1,roamVY:1};
 const constrained={...options,size:300,radius:84,bounds:{left:900,right:1000,top:900,bottom:1000}};
 for(let i=0;i<60;i++)Motion.step(p,1/60,constrained,'run',C,()=>.8);
 assert.equal(p.x,950);assert.equal(p.y,950);assert.equal(p.motionStage,'rest');assert.equal(p.hopFrame,0);assert.equal(p.walking,false);
});
test('renderer uses standing art at rest, source direction, and no double distortion',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../src/app.js'),'utf8'),start=source.indexOf('function sequenceFrame('),end=source.indexOf('function penRect(',start);
 let disabled=false;const context={reduced:()=>disabled};
 vm.runInNewContext(source.slice(start,end)+';globalThis.render=renderCow;',context);
 const p={...pet(),walkMode:'default',sourceFacing:-1,facing:1,motionStage:'hop',hopFrame:8,hopScaleX:1.4,hopScaleY:.7,motionTilt:7,
  el:{style:{},dataset:{}},im:{style:{}},sprite:{style:{}}};
 context.render(p);assert.equal(p.im.hidden,true);assert.equal(p.sprite.hidden,false);assert.equal(p.sprite.style.transform,'scale(-1,1)');assert.match(p.el.style.transform,/rotate\(0deg\)/);assert.equal(p.el.dataset.frame,8);
 p.motionStage='rest';context.render(p);assert.equal(p.im.hidden,false);assert.equal(p.sprite.hidden,true);
 p.motionStage='hop';disabled=true;context.render(p);assert.equal(p.im.hidden,false);assert.equal(p.el.dataset.frame,0);
});
