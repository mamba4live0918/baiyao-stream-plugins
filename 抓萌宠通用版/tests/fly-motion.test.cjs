const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Motion=require('../src/motion.js'),Core=require('../src/core.js');
const options={enabled:true,animate:true,speed:45,radius:45,size:80,bounds:{left:0,right:800,top:0,bottom:600}};
const pet=(cycle=1200)=>({x:300,y:250,roamVX:1,roamVY:.3,turnIn:10,wait:0,articulated:true,walkFrames:30,flyCycleMs:cycle});

test('fly plays all 30 wing poses while hovering, without body deformation or ground-hop routing',()=>{
 const p={...pet(),wait:100},frames=new Set();
 for(let i=0;i<240;i++){Motion.step(p,.01,options,'fly',Core,()=>.8);frames.add(p.hopFrame);assert.equal(p.motionStage,'fly');assert.equal(p.hopScaleX,1);assert.equal(p.hopScaleY,1);assert.equal(p.motionTilt,0);assert(Math.abs(p.hopLift)<=5);}
 assert.equal(p.x,300);assert.equal(p.y,250);assert.equal(frames.size,30);assert.equal(p.walking,false);
});
test('flight wing cadence follows authored cycle time, not movement speed',()=>{
 const fast=pet(1200),slow=pet(1500),stationary=pet(1200);
 for(let i=0;i<20;i++){Motion.step(fast,.02,{...options,speed:150},'fly',Core,()=>.8);Motion.step(slow,.02,options,'fly',Core,()=>.8);Motion.step(stationary,.02,{...options,enabled:false},'fly',Core,()=>.8);}
 assert.equal(fast.hopFrame,10);assert.equal(slow.hopFrame,8);assert.equal(stationary.hopFrame,10);assert(fast.x>slow.x);assert.equal(stationary.x,300);assert.equal(stationary.y,250);
});
test('free flight roams in both axes and reflects inside the same user activity bounds',()=>{
 const p=pet();for(let i=0;i<2000;i++){Motion.step(p,.02,options,'fly',Core,()=>.8);assert(p.x>=45&&p.x<=755);assert(p.y>=45&&p.y<=555);assert.equal(p.hopScaleX,1);}
 assert.notEqual(p.x,300);assert.notEqual(p.y,250);
 const edge={...pet(),x:754,facing:1};Motion.step(edge,.05,options,'fly',Core,()=>.8);assert.equal(edge.facing,-1);assert.equal(edge.x,755);
});
test('a flyer blocked by the nest keeps its facing while the wings continue cycling',()=>{
 const blocked={...options,radius:17.333,size:23.333,bounds:{left:800,right:860,top:520,bottom:555},obstacle:{x:769.2,y:505,w:201.6,h:131.4}};
 for(const facing of [-1,1]){
  const p={...pet(),x:830,y:537.5,facing,flyBankDeg:16,motionTilt:12},frames=new Set();
  for(let i=0;i<120;i++){
   Motion.step(p,1/60,blocked,'fly',Core,()=>.8);frames.add(p.hopFrame);
   assert.equal(p.x,830);assert.equal(p.y,537.5);assert.equal(p.walking,false);
   assert.equal(p.facing,facing);assert.equal(p.motionStage,'fly');
  }
  assert.equal(frames.size,30);assert(Math.abs(p.motionTilt)<.01);
 }
});
test('grabbing, burst flight and reduced animation freeze the wing route while wander-off keeps hovering',()=>{
 for(const flags of [{held:true},{airborne:true},{}]){const p={...pet(),...flags,hopFrame:20,hopLift:-4};Motion.step(p,.02,{...options,animate:Object.keys(flags).length>0},'fly',Core);assert.equal(p.hopFrame,0);assert.equal(p.motionStage,'rest');assert.equal(p.hopLift,0);assert.equal(p.x,300);}
 const p=pet();Motion.step(p,.04,{...options,enabled:false},'fly',Core);assert.equal(p.motionStage,'fly');assert(p.hopFrame>0);
});
test('butterfly bank follows actual flight direction gradually and returns upright while hovering; dragon remains upright',()=>{
 const butterfly={...pet(),flyBankDeg:16},dragon=pet();
 Motion.step(butterfly,.02,options,'fly',Core,()=>.8);assert(butterfly.motionTilt>0&&butterfly.motionTilt<3);
 for(let i=0;i<60;i++){Motion.step(butterfly,.02,options,'fly',Core,()=>.8);Motion.step(dragon,.02,options,'fly',Core,()=>.8);}
 assert(butterfly.motionTilt>15&&butterfly.motionTilt<=16);assert.equal(dragon.motionTilt,0);const previous=butterfly.motionTilt;butterfly.roamVX=-1;
 Motion.step(butterfly,.02,options,'fly',Core,()=>.8);assert(butterfly.motionTilt<previous&&butterfly.motionTilt>10);
 for(let i=0;i<100;i++)Motion.step(butterfly,.02,options,'fly',Core,()=>.8);assert(butterfly.motionTilt< -15&&butterfly.motionTilt>= -16);
 const oldX=butterfly.x;for(let i=0;i<100;i++)Motion.step(butterfly,.02,{...options,enabled:false},'fly',Core,()=>.8);assert(Math.abs(butterfly.motionTilt)<.01);assert.equal(butterfly.x,oldX);assert.equal(butterfly.hopScaleX,1);assert.equal(butterfly.hopScaleY,1);
});
test('bank resets for held, burst-airborne and reduced flight and rejects invalid metadata angles',()=>{
 for(const flags of [{held:true},{airborne:true},{}]){const p={...pet(),...flags,flyBankDeg:16,motionTilt:16};Motion.step(p,.02,{...options,animate:Object.keys(flags).length>0},'fly',Core);assert.equal(p.motionTilt,0);}
 for(const value of [undefined,NaN,-20,'16']){const p={...pet(),flyBankDeg:value};for(let i=0;i<10;i++)Motion.step(p,.02,options,'fly',Core);assert.equal(p.motionTilt,0);}
});

function custom(saved={},record=null){
 const source=fs.readFileSync(path.join(__dirname,'../src/customize.js'),'utf8'),asset={id:'dragon',kind:2000022,name:'dragon',category:'xiaoyao',motion:'fly',frames:30,articulated:true,src:'poster',walk:'strip',flyCycleMs:1500,particleStyle:'dragon'};
 const assets={cows:[{id:'dog',name:'dog',src:'dog'},asset],categories:[{id:'xiaoyao',name:'friends',members:['dragon']}],barns:Array.from({length:6},()=>({src:'nest'})),balls:[{id:'ball',src:'ball'}]};
 const ctx={structuredClone,PetRoamGeometry:require('../src/roam-geometry.js'),localStorage:{getItem:()=>JSON.stringify({tiers:Core.defaultTiers(),...saved}),setItem(){}}};vm.runInNewContext(source+';globalThis.Type=CowCustomizer;',ctx);const Type=ctx.Type;
 for(const name of ['bind','bindPenManipulation','render','renderCows'])Type.prototype[name]=()=>{};Type.prototype.loadMedia=async()=>{};
 const c=new Type({assets,core:Core,toast(){},onChange(){}});if(record)c.records.set('cow:2000022',record);return c;
}
test('native fly defaults adopt the new motion while explicit legacy motion and uploaded media remain intact',async()=>{
 const first=custom();await first.ready;assert.equal(first.cowMotion(2000022),'fly');assert.equal(first.validMotion('fly',true),true);assert.equal(first.cowFrameMeta(2000022).flyCycleMs,1500);assert.equal(first.cowFrameMeta(2000022).particleStyle,'dragon');
 const saved=custom({defaultsV116:true,cowSettings:[{}, {scale:155,motion:'walk'}],customCows:[{kind:100,name:'custom',motion:'fly',category:'xiaoyao'}]});await saved.ready;assert.equal(saved.cowMotion(2000022),'walk');assert.equal(saved.cowScale(2000022),1.55);assert.equal(saved.cowMotion(100),'fly');
 const uploaded=custom({}, {type:'frames',frames:6,data:'data:image/png;base64,AQID',poster:'data:image/png;base64,BAUG'});await uploaded.ready;assert.equal(uploaded.cowFrameMeta(2000022).kind,'sequence');assert.equal(uploaded.cowFrameMeta(2000022).particleStyle,undefined);assert.equal(uploaded.cowWalk(2000022),'data:image/png;base64,AQID');
});
test('native bank metadata reaches the default pose but uploaded skins omit it',async()=>{
 const c=custom();await c.ready;c.assets.cows[1].flyBankDeg=16;assert.equal(c.cowFrameMeta(2000022).flyBankDeg,16);c.records.set('cow:2000022',{type:'image',data:'data:image/png;base64,AQID'});assert.equal(c.cowFrameMeta(2000022).flyBankDeg,undefined);
});
