const {test}=require('node:test'),assert=require('node:assert/strict');
const {Camera}=require('../src/camera.js'),{Pile}=require('../src/pile.js'),{SpriteBatch}=require('../src/render.js'),{Fx,pathAt}=require('../src/fx.js'),{discs}=require('./helpers.cjs');
// 冒烟测试：每种事件都能加入、按时画出、到期清掉；2D 画布用一个什么调用都接受的假对象
const ctx2d=()=>new Proxy({},{get:(o,k)=>k in o?o[k]:k.startsWith('create')?()=>({addColorStop(){}}):()=>{},set:(o,k,v)=>(o[k]=v,true)});
const leaf={x:10,y:20,yaw:0.3,size:96,type:1};
function setup(){
  const cam=new Camera({elevation:60}),pile=new Pile({masks:discs(),seed:3,count:300}).generate(),uvs=Array.from({length:6},()=>[0,1,1,0]);
  const fx=new Fx({cam,uvs,SpriteBatch,broomUV:[0,1,1,0]}),drawn={};
  const r={draw:(name,b)=>{drawn[name]=(drawn[name]||0)+b.count;}};
  return{cam,pile,fx,drawn,r};
}

test('pathAt walks a polyline by arc length',()=>{
  const p=[[0,0],[100,0],[100,100]];
  assert.deepEqual(pathAt(p,0,200),[0,0]);assert.deepEqual(pathAt(p,0.5,200),[100,0]);assert.deepEqual(pathAt(p,0.75,200),[100,50]);assert.deepEqual(pathAt(p,1,200),[100,100]);
});
test('every event type draws while active and is gone afterwards',()=>{
  const {pile,fx,drawn,r}=setup(),t=1000;
  pile.placeNeedleAt(0,0,0);
  fx.add([
    {type:'fall',leaf,from:[0,0,600],to:[10,20,40],t0:t,t1:t+1200,kind:'drift'},
    {type:'fall',leaf,from:[0,0,0],to:[10,20,40],t0:t,t1:t+900,kind:'burst'},
    {type:'fly',leaf,from:[0,0,30],to:[1600,0,300],t0:t,t1:t+900,into:'away'},
    {type:'fly',leaf,from:[0,0,30],to:[0,0,0],t0:t,t1:t+500,into:'bucket'},
    {type:'tornado',id:7,path:[[-900,0],[0,0],[900,0]],radius:100,t0:t,t1:t+4000},
    {type:'fly',leaf,from:[0,0,30],to:[0,0,120],t0:t,t1:t+300,into:'tornado',tornado:7},
    {type:'gust',dir:1,center:{x:0,y:0},t0:t,t1:t+1400},{type:'burst',t0:t,t1:t+500},
    {type:'sun',center:{x:0,y:0},radius:160,t0:t,t1:t+8000},{type:'needleToss',from:[0,0,40],to:[300,50,40],t0:t,t1:t+900},
    {type:'frost',layers:2,need:20},{type:'quick',until:t+5000,layers:3},{type:'time',seconds:30}
  ],t);
  fx.update(t+400,pile);fx.drawGL(r,t+400,pile);
  assert.ok(drawn.atlas>=5&&drawn.needle===1&&drawn.shadow>=1,JSON.stringify(drawn));
  assert.equal(fx.tornadoes.get(7).orbit.length,1);assert.equal(fx.tossing(t+400),true);
  fx.pointer={x:700,y:500};
  const eng={state:{frost:{layers:2,progress:5,need:20},quick:{until:t+5000,layers:3}}};
  fx.draw2d(ctx2d(),t+400,pile,eng);assert.equal(fx.drawn2d,true);
  fx.add([{type:'fall',leaf,from:[0,0,0],to:[30,30,40],t0:t+4000,t1:t+5000,kind:'tornado'},{type:'frostBreak'}],t+4000);
  assert.equal(fx.tornadoes.get(7).orbit.length,0,'scatter starts from an orbiting leaf');
  fx.update(t+20000,pile);
  assert.equal(fx.items.length+fx.tornadoes.size+fx.waves.length+fx.suns.length+fx.tosses.length+fx.texts.length+fx.shards.length+fx.sweeps.length,0);
  fx.draw2d(ctx2d(),t+20000,pile,{state:{frost:{layers:0},quick:{until:0}}});assert.equal(fx.drawn2d,false);
});
test('the face circle deflects airborne leaves out of its screen disc',()=>{
  const {cam,fx}=setup(),p={x:0,y:0,z:200,size:96},s=cam.project([0,0,200]);
  fx.solid={x:s.x,y:s.y,r:80};fx.deflect(p);
  const q=cam.project([p.x,p.y,p.z]);assert.ok(Math.hypot(q.x-s.x,q.y-s.y)>=80+48*q.scale-0.5);
});
test('the bucket swells while shaking, then pops',()=>{
  const {fx}=setup();fx.add([{type:'burst',t0:0,t1:500}],0);
  const a=fx.bucketPose(400),b=fx.bucketPose(600),c=fx.bucketPose(2000);
  assert.ok(a.sx>1.05);assert.ok(b.sx>1);assert.deepEqual(c,{sx:1,sy:1,dx:0});
});
