const test=require('node:test'),assert=require('node:assert/strict');
const core=require('../src/core.js');
const motion=require('../src/motion.js');
const spec={type:'hop',frameWidth:256,fps:8,phases:['prep','flight','flight','land'],advance:[0,16,8,0],offsetY:[0,0,0,0],mirror:true};
const options={enabled:true,size:256,radius:30,bounds:{left:0,right:2000,top:0,bottom:2000}};
function pet(x=500){return {x,y:500,facing:1,walkFrames:4,spriteMotion:structuredClone(spec)}}
function tick(p,dt,speed){motion.step(p,dt,{...options,speed},'scoot',core,()=>.5)}
test('settings 5 and 200 yield distinct hop speed',()=>{const slow=pet(),fast=pet();for(let i=0;i<8;i++){tick(slow,.05,5);tick(fast,.05,200)}assert(fast.x-slow.x>5,`fast ${fast.x} slow ${slow.x}`)});
test('hop cannot reverse facing while airborne and never leaves bounds',()=>{const p=pet(1969);let flight=false;for(let i=0;i<10;i++){tick(p,.05,45);assert(p.x>=30&&p.x<=1970);if(p.hopStage==='flight'){flight=true;assert.equal(p.facing,1)}}assert(flight);assert.equal(p.facing,-1)});
test('advance occurs only in flight; disabled safely rests',()=>{const p=pet();let prev=p.x;for(let i=0;i<10;i++){const before=p.spriteHopElapsed||0;tick(p,.05,45);if(before<.05)assert.equal(p.x,prev);prev=p.x}motion.step(p,.05,{...options,enabled:false,speed:45},'scoot',core,()=>.5);assert.equal(p.motionStage,'rest')});
test('previous animal without spriteMotion unaffected',()=>{const p={x:500,y:500,facing:1,walkFrames:4};for(let i=0;i<10;i++)tick(p,.05,45);assert(Number.isFinite(p.x));assert.equal(p.spriteHopState,undefined)});
test('speed changes preserve phase continuity and its matching displayed frame',()=>{const p=pet();tick(p,.05,45);const t=p.spriteHopElapsed;tick(p,.05,90);assert(Math.abs(p.spriteHopElapsed-t-.065)<1e-8);assert.equal(p.hopFrame,Math.floor(p.spriteHopElapsed*spec.fps));const x=p.x,elapsed=p.spriteHopElapsed;tick(p,.05,0);assert.equal(p.x,x);assert.equal(p.spriteHopElapsed,elapsed)});
test('active hop from legacy state without pending direction preserves facing on landing',()=>{const p=pet();p.spriteHopState='active';p.spriteHopElapsed=.39;tick(p,.05,45);assert.equal(p.facing,1)});
test('positive speed uses authored fps scaled within 0.7–1.3',()=>{const slow=pet(),base=pet(),fast=pet();tick(slow,.05,5);tick(base,.05,45);tick(fast,.05,200);assert(Math.abs(slow.spriteHopElapsed-.035)<1e-8);assert(Math.abs(base.spriteHopElapsed-.05)<1e-8);assert(Math.abs(fast.spriteHopElapsed-.065)<1e-8)});
test('disabled and zero speed never translate or advance a hop',()=>{const p=pet();tick(p,.05,45);const x=p.x,t=p.spriteHopElapsed;tick(p,.05,0);assert.equal(p.x,x);assert.equal(p.spriteHopElapsed,t);motion.step(p,.05,{...options,enabled:false,speed:200},'scoot',core,()=>.5);assert.equal(p.x,x);assert.equal(p.motionStage,'rest')});
