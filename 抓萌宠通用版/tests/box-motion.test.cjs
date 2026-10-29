const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),Core=require('../src/core.js');
const file=path.join(__dirname,'../src/box-motion.js'),Motion=fs.existsSync(file)?require(file):{};
test('new box starts above the top-center and records only finite motion fields',()=>{
 assert.equal(typeof Motion.create,'function');const r=Motion.create(1280,720,320);
 assert.equal(r.x,640);assert.equal(r.y,-160);assert.equal(r.targetY,360);assert.equal(r.vx,0);assert.equal(r.bounces,0);assert.equal(r.done,false);assert.equal(r.elapsed,0);
 assert.deepEqual(Object.keys(r).sort(),['x','y','vx','vy','angle','angularVelocity','bounces','done','squash','w','h','elapsed','targetY'].sort());
 assert(Motion.validSnapshot(r));
 for(const args of [[0,NaN,Infinity],[-50,0,-1],[Infinity,Infinity,NaN]]){const x=Motion.create(...args);assert(Motion.validSnapshot(x));}
});
test('gravity drops at center, contacts only while descending and produces two diminishing rises then third-contact settlement',()=>{
 const r=Motion.create(1280,720,320),apices=[],hits=[];let lowest=r.targetY;
 for(let i=0;i<600&&!r.done;i++){
  const before=r.bounces,vy=r.vy;Motion.step(r,1/60,Core);assert.equal(r.x,640);assert(r.y<=r.targetY);
  if(before>0)lowest=Math.min(lowest,r.y);
  if(r.bounces>before){assert(vy>=0);hits.push(r.bounces);if(before>0)apices.push(r.targetY-lowest);lowest=r.targetY;}
 }
 assert.deepEqual(hits,[1,2,3]);assert(apices[0]>apices[1]&&apices[1]>0);assert(r.done);assert.equal(r.y,360);assert.equal(r.vy,0);assert.equal(r.squash,0);
 const snapshot=structuredClone(r);Motion.step(r,1,Core);assert.deepEqual(r,snapshot);
});
test('hitches are clamped, invalid or negative time does nothing and six-second failsafe cannot run forever',()=>{
 const r=Motion.create(1280,720,320);Motion.step(r,999,Core);assert.equal(r.elapsed,.05);assert(r.y<0);
 for(const dt of [-1,NaN,Infinity]){const before=structuredClone(r);Motion.step(r,dt,Core);assert.deepEqual(r,before);}
 const stuck=Motion.create(1280,720,320);let calls=0;const core={stepBall(){calls++;}};
 for(let i=0;i<150;i++)Motion.step(stuck,.05,core);
 assert(stuck.done);assert.equal(stuck.elapsed,6);assert(calls<=120);assert.equal(stuck.x,640);assert.equal(stuck.y,360);
});
test('reduced motion settles at center immediately without invoking physics or changing application counters',()=>{
 const r=Motion.create(800,600,200);r.application={serial:3,outside:50,home:4};const before=structuredClone(r.application);
 Motion.step(r,0,{stepBall(){throw Error('no flight under reduced motion');}},true);assert(r.done);assert.equal(r.x,400);assert.equal(r.y,300);assert.equal(r.bounces,0);assert.deepEqual(r.application,before);
});
test('rebase scales position and velocity only, retains timing/contact status, and never emits a result',()=>{
 const r=Motion.create(1280,720,320);for(let i=0;i<70;i++)Motion.step(r,1/60,Core);const old=structuredClone(r);
 assert.equal(Motion.rebase(r,640,1080),r);assert.equal(r.x,old.x*.5);assert.equal(r.y,old.y*1.5);assert.equal(r.vx,old.vx*.5);assert.equal(r.vy,old.vy*1.5);assert.equal(r.targetY,540);
 for(const k of ['bounces','done','elapsed','angle','angularVelocity'])assert.equal(r[k],old[k]);assert(Motion.validSnapshot(r));
});
test('restoration validates all fields, drops unknown properties, scales safe snapshots and recreates malformed ones',()=>{
 const r=Motion.create(1280,720,320);for(let i=0;i<45;i++)Motion.step(r,1/60,Core);
 const restored=Motion.restore({...r,applied:true,count:1000,unknown:'discard'},640,360,320);assert.equal(restored.x,r.x/2);assert.equal(restored.y,r.y/2);assert.equal(restored.elapsed,r.elapsed);assert.equal(restored.applied,undefined);assert.equal(restored.count,undefined);assert.equal(restored.unknown,undefined);
 for(const bad of [null,[],{},...Object.keys(r).filter(k=>k!=='done').map(k=>({...r,[k]:NaN})),{...r,done:1},{...r,bounces:4},{...r,bounces:1.5},{...r,squash:.25},{...r,elapsed:7},{...r,w:0},{...r,targetY:1},{...r,x:1e9},{...r,vy:1e9}]){
  assert.equal(Motion.validSnapshot(bad),false);assert.deepEqual(Motion.restore(bad,1280,720,320),Motion.create(1280,720,320));
 }
});
test('restored falling boxes resume three contacts without restarting elapsed time',()=>{
 const r=Motion.create(1200,800,260);while(r.bounces<1)Motion.step(r,1/60,Core);const saved=structuredClone(r),resumed=Motion.restore(saved,1200,800,260);
 assert.equal(resumed.bounces,1);assert.equal(resumed.elapsed,r.elapsed);
 while(!resumed.done)Motion.step(resumed,1/60,Core);
 assert.equal(resumed.bounces,3);assert(resumed.elapsed<6);assert.deepEqual(saved,r);
});
test('pet flights are deterministic ballistic trajectories ending exactly at legal destinations',()=>{
 assert.equal(typeof Motion.petFlight,'function');const from={x:640,y:360},to={x:220,y:540},p=Motion.petFlight(from,to,42);
 assert.deepEqual(p,Motion.petFlight(from,to,42));assert(p.duration>=.7&&p.duration<=1.2);assert.notEqual(p.duration,Motion.petFlight(from,to,43).duration);
 assert(Math.abs(p.x0+p.vx*p.duration-p.targetX)<1e-8);assert(Math.abs(p.y0+p.vy*p.duration+p.gravity*p.duration*p.duration/2-p.targetY)<1e-8);
 let position=Motion.stepPet(p,0);assert.deepEqual(position,{x:from.x,y:from.y,done:false});
 let lifted=false;for(let i=0;i<100&&!position.done;i++){position=Motion.stepPet(p,1/60);if(position.y<from.y)lifted=true;}
 assert(lifted);assert.deepEqual(position,{x:to.x,y:to.y,done:true});assert.deepEqual(Motion.stepPet(p,10),position);
});
test('pet reduced motion reaches its destination directly; malformed inputs never generate NaNs',()=>{
 const p=Motion.petFlight({x:1,y:2},{x:80,y:90},-3),result=Motion.stepPet(p,0,true);assert.deepEqual(result,{x:80,y:90,done:true});
 const bad=Motion.petFlight({x:NaN,y:Infinity},null,NaN);assert(Object.values(bad).every(Number.isFinite));
 const fresh=Motion.petFlight({x:0,y:0},{x:10,y:20});const before=structuredClone(fresh);Motion.stepPet(fresh,-1);Motion.stepPet(fresh,NaN);assert.deepEqual(fresh,before);Motion.stepPet(fresh,1000);assert.equal(fresh.elapsed,.05);
});
test('browser UMD exports the same isolated motion API without adding population functions',()=>{
 assert(fs.existsSync(file));const context={};vm.runInNewContext(fs.readFileSync(file,'utf8'),context);assert.equal(typeof context.PetBoxMotion.stepPet,'function');assert.equal(context.PetBoxMotion.resolve,undefined);assert.equal(context.PetBoxMotion.create(100,100,40).targetY,50);
});

