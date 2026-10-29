const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const C=require('../src/core.js'),Motion=require('../src/motion.js'),base=require('../素材/manifest-v143.json'),{bootstrap}=require('./helpers/app-harness.cjs');
const walk={type:'walk',frameWidth:100,fps:8,contactFrames:[0,2],mirror:true,advance:[10,10,10,10],offsetY:[0,2,3,1]};
const hop={type:'hop',frameWidth:100,fps:10,phases:['prep','prep','flight','flight','land'],advance:[0,0,8,8,0],offsetY:[0,1,0,0,2]};
function roamer(){return {resetHop:C.resetHop,stepRoam(p,dt,o){p.x+=o.speed*dt;p.walking=true;}};}
test('standard walk frame progression follows distance, scales to display size and stops when held',()=>{
 const p={x:0,y:0,size:100,walkFrames:4,articulated:true,spriteMotion:walk},core=roamer(),opts={enabled:true,speed:80,size:100};
 for(let i=0;i<5;i++)Motion.step(p,.05,opts,'walk',core,()=>.5);
 assert.equal(p.hopFrame,2);assert.equal(p.hopScaleX,1);assert.equal(p.hopScaleY,1);
 p.held=true;const x=p.x;Motion.step(p,.05,opts,'walk',core,()=>.5);assert.equal(p.x,x);assert.equal(p.hopFrame,0);
 const q={x:0,y:0,size:200,walkFrames:4,articulated:true,spriteMotion:walk};for(let i=0;i<5;i++)Motion.step(q,.05,{...opts,size:200},'walk',core,()=>.5);assert.equal(q.hopFrame,1);
});
test('standard hop follows authored fps and per-frame distance only in flight',()=>{
 const p={x:0,y:0,facing:1,walkFrames:5,articulated:true,spriteMotion:hop},o={enabled:true,size:100,speed:45};
 const core={resetHop:C.resetHop,stepRoam(q,dt,opt){q.x+=opt.speed*dt;q.walking=opt.speed>0;}};
 for(let i=0;i<4;i++)Motion.step(p,.05,o,'scoot',core,()=>.5);assert.equal(p.x,0);assert.equal(p.hopFrame,2);
 for(let i=0;i<2;i++)Motion.step(p,.05,o,'scoot',core,()=>.5);assert(Math.abs(p.x-8)<1e-8);assert(p.hopLift<0);assert.equal(p.hopScaleX,1);assert.equal(p.hopScaleY,1);
 const x=p.x,frame=p.hopFrame;Motion.step(p,0,o,'scoot',core,()=>.5);assert.equal(p.x,x);assert.equal(p.hopFrame,frame);
 for(let i=0;i<2;i++)Motion.step(p,.05,o,'scoot',core,()=>.5);assert(Math.abs(p.x-16)<1e-8);
 Motion.step(p,.05,o,'scoot',core,()=>.5);assert(Math.abs(p.x-16)<1e-8);assert.equal(p.hopFrame,4);assert.equal(p.hopLift,0);
 p.held=true;Motion.step(p,.05,o,'scoot',core,()=>.5);assert.equal(p.spriteHopState,'rest');assert.equal(p.hopFrame,0);
});
test('new native metadata reaches the actor and applies frame offset to render placement',async()=>{
 const m=structuredClone(base),kind=2000099;m.cows.push({id:'test-standard',kind,name:'test standard',category:'xiaoyao',src:'a.png',walk:'b.png',frames:4,articulated:true,sourceFacing:1,motion:'walk',spriteMotion:walk});
 const s=C.fresh();s.outside=1;s.positions=[{kind,x:.4,y:.6}];const f=await bootstrap(s,null,{assets:m}),c=f.ctx.effectInstance.getCows()[0];
 assert.equal(c.spriteMotion.type,'walk');c.size=100;c.y=400;c.x=500;c.airborne=false;c.held=false;
 f.ctx.PetMotion.step=p=>{p.hopFrame=2;p.motionStage='walk';p.hopLift=0;p.walking=true;};
 f.ctx.frame(0);f.ctx.frame(16);assert.equal(c.shownFrame,2);
 assert.equal(c.el.style.transform,`translate(${Math.round(c.x-50)}px,${Math.round(c.y+3-50)}px) rotate(0deg)`);
});
test('walk finishes at a declared contact pose before standing, without moving into a blocked area',()=>{
 let moving=true;const core={resetHop:C.resetHop,stepRoam(p,dt){if(moving){p.x+=80*dt;p.facing=1;p.walking=true;}else p.walking=false;}};
 const p={x:0,y:0,facing:1,walkFrames:4,articulated:true,spriteMotion:walk},o={enabled:true,speed:80,size:100};
 for(let i=0;i<3;i++)Motion.step(p,.05,o,'walk',core);assert.equal(p.hopFrame,1);const x=p.x;
 moving=false;Motion.step(p,.05,o,'walk',core);assert.equal(p.motionStage,'walk');assert.equal(p.facing,1);assert.equal(p.x,x);
 const shown=[];for(let i=0;i<10&&p.motionStage!=='rest';i++){Motion.step(p,.05,o,'walk',core);shown.push(p.hopFrame);assert.equal(p.x,x);}
 assert(shown.includes(2));assert.equal(p.motionStage,'rest');assert.equal(p.hopFrame,2);
});
test('reverse waits for a contact pose, does not move through an obstacle and honors mirror:false',()=>{
 let dir=1;const core={resetHop:C.resetHop,stepRoam(p,dt){p.x+=dir*80*dt;p.facing=dir;p.walking=true;}};
 const p={x:0,y:0,facing:1,walkFrames:4,articulated:true,spriteMotion:walk},o={enabled:true,speed:80,size:100};
 for(let i=0;i<3;i++)Motion.step(p,.05,o,'walk',core);assert.equal(p.hopFrame,1);const x=p.x;
 dir=-1;Motion.step(p,.05,o,'walk',core);assert.equal(p.facing,1);assert.equal(p.x,x);
 for(let i=0;i<10&&p.facing===1;i++){Motion.step(p,.05,o,'walk',core);assert.equal(p.x,x);}
 assert.equal(p.facing,-1);assert.equal(p.hopFrame,2);
 const q={x:0,y:0,facing:1,walkFrames:4,articulated:true,spriteMotion:{...walk,mirror:false}};Motion.step(q,.05,o,'walk',core);assert.equal(q.facing,1);
});
test('DOM and canvas use the same offset, frame and mirror transform; held uses standing pose',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../src/app.js'),'utf8'),ctx={reduced:()=>false,petCanvas:{active:true},canvasReady:c=>!!c.canvas&&!c.held,canvasPose(c,...a){c.pose=a;c.onCanvas=true;},leaveCanvas(c){c.onCanvas=false;}};
 vm.runInNewContext(source.slice(source.indexOf('function sequenceFrame('),source.indexOf('function penRect('))+';globalThis.render=renderCow;',ctx);
 const mk=()=>({el:{style:{},dataset:{},isConnected:true},im:{style:{},hidden:false},sprite:{style:{},hidden:false},x:100,y:180,size:100,articulated:true,walkSrc:'strip',walkFrames:4,walkMode:'default',motionStage:'walk',hopFrame:2,facing:-1,sourceFacing:1,spriteMotion:walk});
 const dom=mk(),canvas=mk();canvas.canvas=true;ctx.render(dom);ctx.render(canvas);
 assert.equal(dom.el.style.transform,'translate(50px,133px) rotate(0deg)');assert.deepEqual(canvas.pose,[50,133,0,-1,1,2,false]);assert.equal(dom.shownFrame,canvas.shownFrame);
 canvas.held=true;ctx.render(canvas);assert.equal(canvas.onCanvas,false);assert.equal(canvas.shownFrame,0);assert.equal(canvas.im.hidden,false);
});
test('DOM noncentral pivot stays at the same world point during mirroring at multiple scales',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../src/app.js'),'utf8'),ctx={reduced:()=>false,petCanvas:null};
 vm.runInNewContext(source.slice(source.indexOf('function sequenceFrame('),source.indexOf('function penRect('))+';globalThis.render=renderCow;',ctx);
 for(const size of [100,200]){
  const p={el:{style:{},dataset:{},isConnected:true},im:{style:{},hidden:false},sprite:{style:{},hidden:false},x:200,y:300,size,articulated:true,walkSrc:'strip',walkFrames:4,walkMode:'default',motionStage:'walk',hopFrame:2,facing:1,sourceFacing:1,spriteMotion:{...walk,pivot:[25,70]}};
  ctx.render(p);const tx=Math.round(p.x-size/2),ty=Math.round(p.y+3*size/100-size/2);
  assert.equal(p.el.style.transform,`translate(${tx}px,${ty}px) rotate(0deg)`);assert.equal(p.sprite.style.transformOrigin,'25% 70%');assert.equal(p.im.style.transformOrigin,'25% 70%');
  p.facing=-1;ctx.render(p);assert.equal(p.el.style.transform,`translate(${tx}px,${ty}px) rotate(0deg)`);assert.equal(p.sprite.style.transform,'scale(-1,1)');
  assert.equal(tx+size*.25,p.x-size*.25);assert.equal(ty+size*.7,Math.round(p.y+size*.23));
  p.spriteMotion=null;ctx.render(p);assert.equal(p.sprite.style.transformOrigin,'');assert.equal(p.im.style.transformOrigin,'');
 }
});
test('native metadata rejects pivot outside the image canvas',async()=>{
 const m=structuredClone(base),kind=2000092;m.cows.push({id:'bad-pivot',kind,name:'bad pivot',category:'xiaoyao',src:'a.png',walk:'b.png',frames:4,articulated:true,motion:'walk',spriteMotion:{...walk,pivot:[101,20]}});
 const s=C.fresh();s.outside=1;s.positions=[{kind,x:.4,y:.6}];const f=await bootstrap(s,null,{assets:m});assert.equal(f.ctx.effectInstance.getCows()[0].spriteMotion,null);
});
test('canvasPose carries the validated custom pivot and resets it for legacy pets',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../src/app.js'),'utf8'),ctx={};
 vm.runInNewContext(source.slice(source.indexOf('function canvasPose('),source.indexOf('// A button shown again'))+';globalThis.pose=canvasPose;',ctx);
 const c={cvMode:'walk',cvWalk:{atlas:{frames:4}},articulated:true,walkMode:'default',walkFrames:4,spriteMotion:{...walk,pivot:[25,70]}};
 ctx.pose(c,50,133,0,-1,1,2,false);assert.equal(c.cvState.originX,.25);assert.equal(c.cvState.originY,.7);assert.equal(c.cvState.bodyIndex,2);
 c.spriteMotion=null;ctx.pose(c,50,133,0,-1,1,2,false);assert.equal(c.cvState.originX,undefined);assert.equal(c.cvState.originY,undefined);
});
test('invalid metadata is rejected and never reaches the actor',async()=>{
 const m=structuredClone(base),kind=2000098;m.cows.push({id:'bad-standard',kind,name:'bad',category:'xiaoyao',src:'a.png',walk:'b.png',frames:4,articulated:true,motion:'walk',spriteMotion:{...walk,advance:[0,10,10,10]}});
 const s=C.fresh();s.outside=1;s.positions=[{kind,x:.4,y:.6}];const f=await bootstrap(s,null,{assets:m});assert.equal(f.ctx.effectInstance.getCows()[0].spriteMotion,null);
});
test('stationary and paused animals do not restart, flicker or move',()=>{
 let calls=0;const core={resetHop:C.resetHop,stepRoam(p,dt){calls++;p.walking=false;p.facing=-1;}};
 const p={x:0,y:0,facing:1,walkFrames:8,articulated:true,spriteMotion:{...walk,contactFrames:[0,4],advance:Array(8).fill(10),offsetY:Array(8).fill(0)}},o={enabled:true,speed:80,size:100};
 Motion.step(p,0,o,'walk',core);assert.equal(calls,0);assert.equal(p.facing,1);
 core.stepRoam=(p)=>{calls++;p.walking=false;};for(let i=0;i<10;i++){Motion.step(p,.05,o,'walk',core);assert.equal(p.motionStage,'rest');assert.equal(p.hopFrame,0);}
});
test('grabbing during deferred turnaround cancels all queued turn state before release',()=>{
 let dir=1;const core={resetHop:C.resetHop,stepRoam(p,dt){p.x+=dir*80*dt;p.facing=dir;}};
 const p={x:0,y:0,facing:1,walkFrames:4,articulated:true,spriteMotion:walk},o={enabled:true,speed:80,size:100};
 for(let i=0;i<3;i++)Motion.step(p,.05,o,'walk',core);dir=-1;Motion.step(p,.05,o,'walk',core);assert(p.spriteFinish);
 p.held=true;Motion.step(p,.05,o,'walk',core);assert.equal(p.spriteFinish,null);assert.equal(p.spriteDistance,0);assert.equal(p.spriteSettle,false);
});
test('eight-frame gait advances by its nonuniform per-frame distances and preserves contact frame indices',()=>{
 const spec={...walk,contactFrames:[0,4],advance:[5,8,6,11,7,9,4,10],offsetY:Array(8).fill(0)};
 const p={x:0,y:0,facing:1,walkFrames:8,articulated:true,spriteMotion:spec},o={enabled:true,speed:100,size:100};
 const core={resetHop:C.resetHop,stepRoam(q,dt,opt){q.x+=opt.speed*dt;q.walking=true;q.facing=1;}},seen=new Set();
 for(let i=0;i<20;i++){
  Motion.step(p,.05,o,'walk',core);let rem=p.x%60,expected=0;
  while(expected<7&&rem>=spec.advance[expected]-1e-9){rem-=spec.advance[expected];expected++;}
  assert.equal(p.hopFrame,expected);seen.add(p.hopFrame);
 }
 assert(seen.size>2);
});
test('small-stride collie caps both actual travel and distance-driven frame speed at 1.3x',()=>{
 const spec={type:'walk',frameWidth:256,fps:8,pivot:[128,192],contactFrames:[0,2],advance:[2,2,2,2],offsetY:[0,1,0,1],mirror:true};
 const p={x:0,y:0,facing:1,walkFrames:4,articulated:true,spriteMotion:spec},o={enabled:true,speed:45,size:142};
 const core={resetHop:C.resetHop,stepRoam(q,dt,opt){q.x+=opt.speed*dt;q.facing=1;q.walking=true;}},seen=[];
 for(let i=0;i<100;i++){Motion.step(p,.01,o,'walk',core);seen.push(p.hopFrame);}
 const scale=142/256,maxDistance=spec.advance[0]*scale*spec.fps*1.3;
 assert(p.x<=maxDistance+1e-8,'actual position must be capped rather than only displayed frames');
 const impliedFrames=p.x/(spec.advance[0]*scale);assert(impliedFrames<=spec.fps*1.3+1e-8);
 assert.equal(p.hopFrame,Math.floor((p.x/scale)%8/2));assert(seen.some(x=>x!==seen[0]),'real frames still advance');
});
test('slow standard walkers and old 30-frame walkers preserve their requested speeds',()=>{
 const spec={...walk,advance:[2,2,2,2],frameWidth:256},core=roamer(),o={enabled:true,size:142,speed:5};
 const p={x:0,y:0,facing:1,walkFrames:4,articulated:true,spriteMotion:spec};for(let i=0;i<20;i++)Motion.step(p,.05,o,'walk',core,()=>.5);assert(Math.abs(p.x-5)<1e-8);
 const old={x:0,y:0,facing:1,walkFrames:30,articulated:true};for(let i=0;i<20;i++)Motion.step(old,.05,{...o,speed:45},'walk',core,()=>.5);assert(Math.abs(old.x-45)<1e-8);
});
test('nonuniform contact completion cannot race through short frames',()=>{
 const spec={...walk,advance:[2,20,2,20]},p={x:0,y:0,facing:1,walkFrames:4,articulated:true,spriteMotion:spec,spriteDistance:0,spriteFinish:{remaining:22,targetDistance:22,targetFrame:2,facing:null}};
 Motion.step(p,.05,{enabled:true,size:100,speed:45},'walk',roamer());assert(p.spriteDistance<=2*8*1.3*.05+1e-9);
});
test('unusually fast diagonal proposals are capped in distance without losing frame synchronization',()=>{
 const spec={...walk,advance:[2,2,2,2],frameWidth:256},p={x:0,y:0,facing:1,walkFrames:4,articulated:true,spriteMotion:spec};
 const o={enabled:true,size:142,speed:45},core={resetHop:C.resetHop,stepRoam(q,dt,opt){q.x+=opt.speed*dt*2;q.y+=opt.speed*dt*2;q.facing=1;}};
 Motion.step(p,.05,o,'walk',core);const distance=Math.hypot(p.x,p.y),max=2*(142/256)*8*1.3*.05;
 assert(distance<=max+1e-9);assert(Math.abs(p.spriteDistance-distance/(142/256))<1e-9);
});
test('current V1.0.44 collie metadata stays within 1.3x using real bounded roaming',()=>{
 const sandbox=path.resolve(__dirname,'..'),project=fs.existsSync(path.join(sandbox,'素材/manifest-v144.json'))?sandbox:path.resolve(sandbox,'../../..');
 const m=JSON.parse(fs.readFileSync(path.join(project,'素材/manifest-v144.json'),'utf8')),asset=m.cows.find(c=>c.id==='friend-11ris-collie');
 assert(asset&&asset.spriteMotion);const spec=asset.spriteMotion;assert.equal(spec.fps,8);assert.deepEqual(spec.advance,[9,9,9,9]);
 const p={x:500,y:350,facing:1,roamVX:1,roamVY:0,turnIn:1000,walkFrames:asset.frames,articulated:true,spriteMotion:spec},size=142;
 const o={enabled:true,size,speed:45,radius:20,bounds:{left:0,right:1200,top:0,bottom:900}};
 for(let i=0;i<100;i++)Motion.step(p,.01,o,'walk',C,()=>.5);
 const distance=Math.hypot(p.x-500,p.y-350),scale=size/spec.frameWidth,estimatedFrames=distance/scale/spec.advance[0];
 assert(Math.abs(distance-45)<1e-7,'revised step length preserves normal movement speed');
 assert(estimatedFrames>=spec.fps*.7&&estimatedFrames<=spec.fps*1.3+1e-7);assert.equal(p.hopFrame,Math.floor((distance/scale)%36/9));
});
test('unbounded advances are rejected rather than causing overflow or invalid coordinates',async()=>{
 const m=structuredClone(base),kind=2000097;m.cows.push({id:'overflow-standard',kind,name:'bad',category:'xiaoyao',src:'a.png',walk:'b.png',frames:4,articulated:true,motion:'walk',spriteMotion:{...walk,advance:[1e308,1e308,1e308,1e308]}});
 const s=C.fresh();s.outside=1;s.positions=[{kind,x:.4,y:.6}];const f=await bootstrap(s,null,{assets:m});assert.equal(f.ctx.effectInstance.getCows()[0].spriteMotion,null);
});
test('actual app grab cancels pending finish and draws the standing pose',async()=>{
 const m=structuredClone(base),kind=2000096;m.cows.push({id:'grab-standard',kind,name:'grab',category:'xiaoyao',src:'a.png',walk:'b.png',frames:4,articulated:true,motion:'walk',spriteMotion:walk});
 const s=C.fresh();s.outside=1;s.positions=[{kind,x:.4,y:.6}];const f=await bootstrap(s,null,{assets:m}),c=f.ctx.effectInstance.getCows()[0];
 c.airborne=false;c.spriteDistance=13;c.spriteFinish={facing:-1,remaining:7};c.spriteSettle=true;c.held=true;f.ctx.frame(0);f.ctx.frame(16);
 assert.equal(c.spriteDistance,0);assert.equal(c.spriteFinish,null);assert.equal(c.spriteSettle,false);assert.equal(c.shownFrame,0);assert.equal(c.im.hidden,false);
});
test('hop metadata rejects movement in prep or landing and noncontiguous flight',async()=>{
 for(const bad of [{...hop,advance:[1,0,8,8,0]},{...hop,phases:['prep','flight','prep','flight','land']}]){
  const m=structuredClone(base),kind=2000095;m.cows.push({id:'bad-hop',kind,name:'bad',category:'xiaoyao',src:'a.png',walk:'b.png',frames:5,articulated:true,motion:'scoot',spriteMotion:bad});
  const s=C.fresh();s.outside=1;s.positions=[{kind,x:.4,y:.6}];const f=await bootstrap(s,null,{assets:m});assert.equal(f.ctx.effectInstance.getCows()[0].spriteMotion,null);
 }
});
test('valid hop metadata reaches actor and grabbing resets elapsed hop in the actual app',async()=>{
 const m=structuredClone(base),kind=2000094;m.cows.push({id:'valid-hop',kind,name:'hop',category:'xiaoyao',src:'a.png',walk:'b.png',frames:5,articulated:true,motion:'scoot',spriteMotion:hop});
 const s=C.fresh();s.outside=1;s.positions=[{kind,x:.4,y:.6}];const f=await bootstrap(s,null,{assets:m}),c=f.ctx.effectInstance.getCows()[0];
 assert.equal(c.spriteMotion.type,'hop');c.spriteHopState='active';c.spriteHopElapsed=.25;c.spriteHopWait=.2;c.held=true;c.airborne=false;
 f.ctx.frame(0);f.ctx.frame(16);assert.equal(c.spriteHopState,'rest');assert.equal(c.spriteHopElapsed,0);assert.equal(c.spriteHopWait,0);assert.equal(c.shownFrame,0);
});
test('hop flight uses bounded real roaming and does not advance in preparation or landing',()=>{
 const p={x:88,y:50,facing:1,walkFrames:5,articulated:true,spriteMotion:hop},o={enabled:true,size:100,speed:45,radius:10,bounds:{left:0,right:100,top:0,bottom:100}};
 for(let i=0;i<4;i++){Motion.step(p,.05,o,'scoot',C,()=>.5);assert.equal(p.x,88);}
 for(let i=0;i<4;i++){Motion.step(p,.05,o,'scoot',C,()=>.5);assert(p.x>=10&&p.x<=90);assert(p.y>=10&&p.y<=90);}
 const landed=p.x;for(let i=0;i<2;i++)Motion.step(p,.05,o,'scoot',C,()=>.5);assert.equal(p.x,landed);
});
test('hop with mirror disabled keeps the original drawing direction even if the physical route reverses',()=>{
 const p={x:0,y:0,facing:1,walkFrames:5,articulated:true,spriteMotion:{...hop,mirror:false}},o={enabled:true,size:100,speed:45};
 const core={resetHop:C.resetHop,stepRoam(q,dt,opt){q.x-=opt.speed*dt;q.facing=-1;}};
 for(let i=0;i<5;i++)Motion.step(p,.05,o,'scoot',core,()=>.5);assert.equal(p.facing,1);
});
test('isolated simulation uses real attempt-4 file dimensions and provisional motion metadata',async()=>{
 const sandbox=path.resolve(__dirname,'..'),project=fs.existsSync(path.join(sandbox,'开发/海豹逐帧-2026-10-28'))?sandbox:path.resolve(sandbox,'../../..');
 const source=path.join(project,'开发/海豹逐帧-2026-10-28/attempt-4'),m=JSON.parse(fs.readFileSync(path.join(source,'asset-manifest.json'),'utf8'));
 assert.equal(m.frames.length,4);assert.equal(m.fps,8);assert.deepEqual(m.motion.offsetY,[0,0,0,0]);assert.deepEqual(m.motion.advance,[0,16,8,0]);
 for(let i=0;i<m.frames.length;i++){
  const f=m.frames[i],bytes=fs.readFileSync(path.join(source,f.file.replaceAll('\\','/')));
  assert.equal(bytes.readUInt32BE(16),256);assert.equal(bytes.readUInt32BE(20),256);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),f.sha256);
 }
 // The artist's advance values are estimates: these checks verify arithmetic, not whether paws visually slip.
 const spec={type:'hop',frameWidth:256,fps:m.fps,phases:['prep','flight','flight','land'],advance:m.motion.advance,offsetY:m.motion.offsetY,mirror:m.motion.mirror,pivot:m.pivot};
 const assets=structuredClone(base),kind=2000093;
 assets.cows.push({id:'seal-attempt4',kind,name:'seal provisional',category:'xiaoyao',src:'test-still.png',walk:'test-strip.png',frames:4,articulated:true,motion:'scoot',spriteMotion:spec});
 const state=C.fresh();state.outside=1;state.positions=[{kind,x:.4,y:.6}];const f=await bootstrap(state,null,{assets});
 const actor=f.ctx.effectInstance.getCows()[0];assert.equal(actor.spriteMotion.type,'hop');
 actor.airborne=false;f.ctx.frame(0);f.ctx.frame(16);
 assert.equal(actor.sprite.style.transformOrigin,'50% 71.484375%');
 const p={x:0,y:0,facing:1,walkFrames:4,articulated:true,spriteMotion:spec},o={enabled:true,size:128,speed:45};
 const core={resetHop:C.resetHop,stepRoam(q,dt,opt){q.x+=opt.speed*dt;}};
 for(let i=0;i<2;i++)Motion.step(p,.05,o,'scoot',core,()=>.5);assert.equal(p.x,0);
 for(let i=0;i<6;i++)Motion.step(p,.05,o,'scoot',core,()=>.5);assert(Math.abs(p.x-12)<1e-8);
 const landed=p.x;for(let i=0;i<2;i++)Motion.step(p,.05,o,'scoot',core,()=>.5);assert.equal(p.x,landed);assert.equal(p.hopFrame,3);
});
