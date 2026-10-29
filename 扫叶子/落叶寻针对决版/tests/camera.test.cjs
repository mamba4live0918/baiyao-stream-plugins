const {test}=require('node:test'),assert=require('node:assert/strict');
const {Camera,rayAtHeight}=require('../src/camera.js');
const near=(a,b,e=1e-6)=>assert.ok(Math.abs(a-b)<=e,`${a} ≉ ${b}`);

test('target projects to the principal point at 1:1 scale',()=>{
  const cam=new Camera({elevation:60});const p=cam.project([0,0,0]);
  near(p.x,720);near(p.y,500);near(p.scale,1);
});
test('farther ground points appear higher and smaller',()=>{
  const cam=new Camera({elevation:60});const front=cam.project([0,-200,0]),back=cam.project([0,200,0]);
  assert.ok(back.y<front.y);assert.ok(back.scale<front.scale);
});
test('raised points appear higher on screen',()=>{
  const cam=new Camera({elevation:60});assert.ok(cam.project([0,0,50]).y<cam.project([0,0,0]).y);
});
test('ray through a projected point hits that point',()=>{
  const cam=new Camera({elevation:52});const P=[137,-88,40],s=cam.project(P);
  const hit=rayAtHeight(cam.ray(s.x,s.y),40);near(hit.x,P[0],1e-6);near(hit.y,P[1],1e-6);
});
test('viewProj matrix matches project()',()=>{
  const cam=new Camera({elevation:67}),m=cam.viewProj(),P=[-300,150,25];
  const clip=[0,1,2,3].map(r=>m[r]*P[0]+m[4+r]*P[1]+m[8+r]*P[2]+m[12+r]);
  const sx=(clip[0]/clip[3]+1)/2*1440,sy=(1-clip[1]/clip[3])/2*810,p=cam.project(P);
  near(sx,p.x,0.05);near(sy,p.y,0.05);assert.ok(Math.abs(clip[2]/clip[3])<1);
});
test('elevation is clamped to 45–75 degrees',()=>{
  assert.equal(new Camera({elevation:10}).elevation,45);assert.equal(new Camera({elevation:90}).elevation,75);
});
test('1:1 at target for all elevations via set()',()=>{const cam=new Camera();for(const e of [45,60,75]){cam.set({elevation:e});const p=cam.project(cam.target);near(p.x,720);near(p.y,500);near(p.scale,1);}});
test('stage rays point down from the camera',()=>{for(const e of [45,75]){const cam=new Camera({elevation:e});for(const [sx,sy]of [[0,0],[1440,0],[0,810],[1440,810]]){const r=cam.ray(sx,sy);assert.ok(r.dir[2]<0);near(Math.hypot(...r.dir),1,1e-12);assert.deepEqual(r.origin,cam.position);assert.ok(rayAtHeight(r,0).t>0);}}});
test('viewProj matches project() off-centre with a moved target',()=>{const cam=new Camera({elevation:50,center:[600,500],target:[80,-40,10]}),m=cam.viewProj();for(const P of [[-700,-400,0],[700,400,400],[137,-88,40]]){const c=[0,1,2,3].map(r=>m[r]*P[0]+m[4+r]*P[1]+m[8+r]*P[2]+m[12+r]),p=cam.project(P);near((c[0]/c[3]+1)/2*1440,p.x,0.05);near((1-c[1]/c[3])/2*810,p.y,0.05);assert.ok(Math.abs(c[2]/c[3])<1);}});
test('set() keeps options that are not passed',()=>{const cam=new Camera({focal:1200,center:[700,520],target:[0,40,0]}).set({elevation:50});assert.equal(cam.focal,1200);assert.deepEqual(cam.center,[700,520]);assert.deepEqual(cam.target,[0,40,0]);assert.equal(cam.elevation,50);});
