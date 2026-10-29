const test=require('node:test'),assert=require('node:assert/strict'),Motion=require('../src/motion.js'),Core=require('../src/core.js');
const options={enabled:true,speed:45,radius:40,size:80,bounds:{left:0,right:800,top:0,bottom:600}};
function pet(cycle=1000){return{x:300,y:250,roamVX:1,roamVY:0,turnIn:10,wait:0,articulated:true,walkFrames:12,swimCycleMs:cycle,motionClock:0};}
test('aquatic poses cycle independently of land-hop state without double image deformation',()=>{
 const p=pet(),frames=new Set();for(let i=0;i<100;i++){Motion.step(p,.02,options,'swim',Core,()=>.8);frames.add(p.hopFrame);assert.equal(p.hopScaleX,1);assert.equal(p.hopScaleY,1);assert.equal(p.motionTilt,0);assert.equal(p.motionStage,'swim');}
 assert.equal(frames.size,12);assert(p.x>300);assert(Math.abs(p.hopLift)<=4);
});
test('whales have a slower frame cadence; pauses keep a gentle independent fin cycle',()=>{
 const fast=pet(900),slow=pet(1800);for(let i=0;i<20;i++){Motion.step(fast,.02,options,'swim',Core,()=>.8);Motion.step(slow,.02,options,'swim',Core,()=>.8);}
 assert(fast.swimClock>slow.swimClock);slow.wait=100;const x=slow.x,clock=slow.swimClock;Motion.step(slow,.02,options,'swim',Core,()=>.8);assert.equal(slow.x,x);assert(slow.swimClock>clock);
});
test('held, disabled or reduced-motion inputs stop swimming and restore the standing pose',()=>{
 for(const flags of [{held:true},{airborne:true},{}]){const p={...pet(),...flags,hopFrame:8,hopLift:3};Motion.step(p,.02,{...options,enabled:Object.keys(flags).length>0},'swim',Core);assert.equal(p.hopFrame,0);assert.equal(p.hopLift,0);assert.equal(p.motionStage,'rest');}
});
