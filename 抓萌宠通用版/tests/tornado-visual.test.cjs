const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const T=require('../src/tornado-visual.js');
const start={x:137,y:321},center={x:245,y:270},end={x:830,y:490},size=96;

test('capture starts at the current pet position and finishes exactly in the nest',()=>{
  assert.deepEqual(T.capturePoint(0,start,center,end,size),{...start,scale:1,tilt:0,opacity:1});
  assert.deepEqual(T.capturePoint(1,start,center,end,size),{...end,scale:.14,tilt:0,opacity:.8});
  const frames=T.captureFrames(start,center,end,size);
  assert.equal(frames[0].transform,'translate(89px,273px) scale(1) rotate(0deg)');
  assert.equal(frames.at(-1).transform,'translate(782px,442px) scale(0.14) rotate(0deg)');
  assert.equal(frames[0].offset,0);assert.equal(frames.at(-1).offset,1);
});

test('capture converges along an orbit with bounded tilt and a continuous flight join',()=>{
  let priorAngle=null,winding=0,priorRadius=Infinity;
  for(let i=0;i<640;i++){
    const t=i/1000,p=T.capturePoint(t,start,center,end,size),u=t/.64,e=u*u*(3-2*u);
    assert.ok(Object.values(p).every(Number.isFinite));assert.ok(Math.abs(p.tilt)<=12);
    const dx=p.x-center.x,dy=(p.y-center.y+48*e)/.46,r=Math.hypot(dx,dy),angle=Math.atan2(dy,dx);
    assert.ok(r<=priorRadius+1e-8);priorRadius=r;
    if(priorAngle!==null)winding+=Math.atan2(Math.sin(angle-priorAngle),Math.cos(angle-priorAngle));
    priorAngle=angle;
  }
  assert.ok(winding>Math.PI*2&&winding<Math.PI*2.2);
  const before=T.capturePoint(.64-1e-5,start,center,end,size),after=T.capturePoint(.64+1e-5,start,center,end,size);
  assert.ok(Math.hypot(before.x-after.x,before.y-after.y)<1e-4);
  for(let i=0;i<=1000;i++)assert.ok(Object.values(T.capturePoint(i/1000,start,center,end,size)).every(Number.isFinite));
  assert.ok(T.captureFrames(start,center,end,size).length<=70);
});

test('zero-distance capture remains finite',()=>{
  for(let i=0;i<=100;i++)assert.ok(Object.values(T.capturePoint(i/100,center,center,center,size)).every(Number.isFinite));
});

test('upright funnel tapers and individual trajectories orbit in depth and rise',()=>{
  assert.ok(T.orbitPoint(1,0).radius>T.orbitPoint(0,0).radius*10);
  assert.equal(T.orbitPoint(.5,0).y,T.orbitPoint(.5,Math.PI).y);
  assert.ok(T.orbitPoint(.5,Math.PI/2).y>T.orbitPoint(.5,-Math.PI/2).y);
  const a=T.scene(0),b=T.scene(.1);
  assert.notDeepEqual(a,b);
  const pa=a.particles[3].point,pb=b.particles[3].point;
  assert.ok(pb.height>pa.height);assert.notEqual(pa.depth,pb.depth);
  for(const time of [0,.1,1,100,10000]){
    const s=T.scene(time);
    assert.ok(s.ribbons.length<=T.FILAMENTS);assert.equal(s.particles.length,T.PARTICLES);
    for(const r of s.ribbons)for(const p of r.points){assert.ok(Object.values(p).every(Number.isFinite));assert.ok(p.x>0&&p.x<512&&p.y>0&&p.y<512);}
  }
});

test('reduced motion is deterministic while explicit animation still changes',()=>{
  assert.deepEqual(T.scene(0,{reduced:true}),T.scene(345,{reduced:true}));
  assert.notDeepEqual(T.scene(0,{reduced:false}),T.scene(345,{reduced:false}));
});

test('draw clears transparency and never rotates the canvas or adds a filled disc',()=>{
  const calls=[],ctx=new Proxy({}, {get(target,key){if(key in target)return target[key];return (...args)=>calls.push([key,...args]);},set(target,key,value){target[key]=value;return true;}});
  const canvas={width:512,height:512,getContext:type=>type==='2d'?ctx:null};
  assert.equal(T.draw(canvas,1),true);
  assert.deepEqual(calls[0],['clearRect',0,0,512,512]);
  assert.ok(calls.some(c=>c[0]==='stroke'));
  assert.ok(!calls.some(c=>['rotate','fill','fillRect','arc'].includes(c[0])));
  assert.equal(T.draw(null,0),false);
  assert.equal(T.draw({getContext:()=>null},0),false);
});

test('tornado markup and styles have no rotating wrapper or opaque backdrop',()=>{
  const css=fs.readFileSync(path.join(__dirname,'../src/effects.css'),'utf8');
  const html=fs.readFileSync(path.join(__dirname,'../src/tornado.html'),'utf8');
  assert.match(html,/<canvas id="tornado-canvas" width="512" height="512">/);
  assert.doesNotMatch(html,/<svg/);
  assert.doesNotMatch(css,/wind-rotate|wind-wave|#tornado-fx svg|wind-band/);
  const rules=[...css.matchAll(/#tornado-(?:fx|canvas)[^{]*\{([^}]+)\}/g)].map(m=>m[1]).join(' ');
  assert.doesNotMatch(rules,/rotate\(|radial-gradient|animation:/);
  assert.match(rules,/background:transparent/);
});
