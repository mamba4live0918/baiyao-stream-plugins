const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const file=require('node:path').join(__dirname,'../src/roam-geometry.js');
const G=fs.existsSync(file)?require(file):{};
const defaults={roamLeft:3,roamRight:97,roamTop:35,roamBottom:84};
const area={roamLeft:20,roamRight:60,roamTop:30,roamBottom:70};
const rect={left:200,right:600,top:100,bottom:500,width:400,height:400};
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-8,`${actual} != ${expected}`);

test('normalization preserves valid old percentages and rejects malformed or inverted bounds',()=>{
  assert.equal(typeof G.normalize,'function');
  assert.deepEqual(G.normalize(),defaults);
  assert.deepEqual(G.normalize({...area,wander:false}),area);
  assert.deepEqual(G.normalize({...area,roamTop:0}),{...area,roamTop:0});
  for(const value of [NaN,Infinity,-1,101,'25',null])assert.deepEqual(G.normalize({...area,roamLeft:value}),defaults);
  for(const bad of [{roamRight:23},{roamBottom:20},{roamLeft:61}])assert.deepEqual(G.normalize({...area,...bad}),defaults);
  assert.deepEqual(G.normalize({roamLeft:95,roamRight:100,roamTop:0,roamBottom:5}),{roamLeft:95,roamRight:100,roamTop:0,roamBottom:5});
});

test('pixel geometry is finite and percentages survive viewport changes',()=>{
  assert.deepEqual(G.pixels(area,1000,500),{left:200,right:600,top:150,bottom:350,width:400,height:200});
  const a=G.pixels(area,1920,1080),b=G.pixels(area,960,540);
  for(const k of Object.keys(a))near(a[k],b[k]*2);
  for(const bad of [0,-1,NaN,Infinity])assert.ok(Object.values(G.pixels(area,bad,bad)).every(Number.isFinite));
});

test('moving keeps dimensions and clamps all edges as one rectangle',()=>{
  assert.deepEqual(G.move(area,100,-100),{roamLeft:60,roamRight:100,roamTop:0,roamBottom:40});
  assert.deepEqual(G.move(area,-100,100),{roamLeft:0,roamRight:40,roamTop:60,roamBottom:100});
  assert.deepEqual(G.move(area,NaN,Infinity),area);
});

test('eight resize handles anchor the opposite edges and cannot invert below five percent',()=>{
  const expected={n:[20,60,35,70],s:[20,60,30,75],e:[20,65,30,70],w:[25,60,30,70],nw:[25,60,35,70],ne:[20,65,35,70],sw:[25,60,30,75],se:[20,65,30,75]};
  for(const [handle,values]of Object.entries(expected))assert.deepEqual(Object.values(G.resize(area,handle,5,5)),values,handle);
  assert.deepEqual(G.resize(area,'nw',999,999),{roamLeft:55,roamRight:60,roamTop:65,roamBottom:70});
  assert.deepEqual(G.resize(area,'se',-999,-999),{roamLeft:20,roamRight:25,roamTop:30,roamBottom:35});
  assert.deepEqual(G.resize(area,'oops',50,50),area);
});

test('selection supports reverse drags, screen edges, fractional precision and minimum size',()=>{
  assert.deepEqual(G.select(60,70,20,30),area);
  assert.deepEqual(G.select(100,100,99,99),{roamLeft:95,roamRight:100,roamTop:95,roamBottom:100});
  assert.deepEqual(G.select(0,0,0,0),{roamLeft:0,roamRight:5,roamTop:0,roamBottom:5});
  const r=G.select(20.123,30.456,60.789,70.321);near(r.roamLeft,20.123);near(r.roamBottom,70.321);
  assert.deepEqual(G.select(NaN,0,50,50),defaults);
});

test('requested pet size is preserved until the frame needs it reduced',()=>{
  assert.equal(G.fitSize(85,rect),85);
  assert.equal(G.fitSize(500,rect),400/1.5);
  const narrow={left:0,right:90,top:0,bottom:30,width:90,height:30};
  assert.equal(G.fitSize(85,narrow),20);
  for(const bad of [NaN,Infinity,-3,0])assert.ok(G.fitSize(bad,narrow)>0);
});

test('random destinations keep full conservative extents inside, with exact endpoint RNG',()=>{
  const padding=85*.7+1;
  const low=G.point(rect,85,()=>0),high=G.point(rect,85,()=>1);
  near(low.x,rect.left+padding);near(low.y,rect.top+padding);
  near(high.x,rect.right-padding);near(high.y,rect.bottom-padding);
  for(const random of [()=>NaN,()=>Infinity,()=>-100,()=>100,.3]){
    const p=G.point(rect,85,random);
    assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.y));
    assert.ok(p.x>=low.x&&p.x<=high.x&&p.y>=low.y&&p.y<=high.y);
  }
  assert.deepEqual(G.point({left:0,right:10,top:5,bottom:15},100,()=>0),{x:5,y:10});
});

test('fractional random endpoints never round outside the legal interval',()=>{
  for(let i=1;i<1000;i++){
    const r={left:i*.123456789,right:500+i*.234567891,top:i*.031415927,bottom:500+i*.271828183};
    const size=33.333333333,pad=size*.7+1,p=G.point(r,size,()=>1);
    assert.equal(p.x,r.right-pad);assert.equal(p.y,r.bottom-pad);
  }
});

test('constraint is independent of motion toggles and repairs old or obstacle-reverted positions',()=>{
  for(const state of [{},{walking:false,wait:3},{hopStage:'prep'},{wander:false}]){
    const p={x:-200,y:900,targetY:900,size:85,hopLift:0,...state};
    assert.equal(G.constrain(p,rect),p);
    near(p.x,260.5);near(p.y,439.5);near(p.targetY,439.5);
  }
  const broken={x:NaN,y:Infinity,targetY:NaN,size:85,hopLift:NaN};G.constrain(broken,rect);
  assert.ok(Object.values(broken).every(Number.isFinite));
});

test('held, collected and wind-flight pets are not captured by the activity frame',()=>{
  for(const flag of ['held','dead','windActive']){
    const p={x:-400,y:-500,targetY:900,size:85,hopLift:20,[flag]:true},before={...p};
    G.constrain(p,rect);assert.deepEqual(p,before);
  }
});

test('continuous jumping and floating stay visible without ratcheting the baseline',()=>{
  const p={x:400,y:161,size:85,targetY:200};
  for(let i=0;i<1000;i++){
    p.hopLift=Math.sin(i*.2)*48;G.constrain(p,rect);
    assert.equal(p.y,161);assert.ok(p.y+p.hopLift>=160.5&&p.y+p.hopLift<=439.5);
  }
  p.hopLift=-48;G.constrain(p,rect,{reduced:true});assert.equal(p.hopLift,0);assert.equal(p.y,161);
});

test('airborne entry keeps its upper approach but clamps destination and bottom; balls emerge inside',()=>{
  const p={x:-500,y:-300,targetY:900,size:85,airborne:true};
  G.constrain(p,rect);near(p.x,260.5);assert.equal(p.y,-300);near(p.targetY,439.5);
  G.constrain(p,rect,{allowEntry:false});near(p.y,160.5);
  p.y=900;G.constrain(p,rect);near(p.y,439.5);
  const ball={x:900,y:-500,targetY:-500,size:85,ballEmerging:true};
  G.constrain(ball,rect);near(ball.x,539.5);near(ball.y,160.5);near(ball.targetY,160.5);
});

test('repeated movement and viewport resizing preserve constraints across all motion profiles',()=>{
  const C=require('../src/core.js'),M=require('../src/motion.js');
  for(const mode of Object.keys(M.PROFILES)){
    const p={x:-300,y:900,roamVX:1,roamVY:1,turnIn:100,hopWait:0};
    for(let i=0;i<240;i++){
      const bounds=G.pixels(area,i<80?1280:i<160?320:960,i<80?720:i<160?240:540);
      p.size=G.fitSize(180,bounds);
      M.step(p,.02,{enabled:i%13!==0,speed:100,radius:p.size*.28,size:p.size,bounds},mode,C,()=>.8);
      G.constrain(p,bounds);
      const pad=p.size*.7+1;
      assert.ok(p.x-pad>=bounds.left-1e-8&&p.x+pad<=bounds.right+1e-8,mode+' x');
      assert.ok(p.y+p.hopLift-pad>=bounds.top-1e-8&&p.y+p.hopLift+pad<=bounds.bottom+1e-8,mode+' y');
    }
  }
});

test('browser UMD publishes the same geometry API without CommonJS',()=>{
  const context={};vm.runInNewContext(fs.readFileSync(file,'utf8'),context);
  assert.equal(typeof context.PetRoamGeometry.constrain,'function');
});
