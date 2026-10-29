const {test}=require('node:test'),assert=require('node:assert/strict');
const {Pile,rng}=require('../src/pile.js'),{Camera}=require('../src/camera.js'),{discs}=require('./helpers.cjs');
const cam=new Camera({elevation:60});
const leaf=(x,y)=>({x,y,yaw:0,size:100,type:0});
const restBelow=(p,l)=>{let h=0;for(const o of p.leaves)if(o!==l&&o.z<l.z&&o.z>h&&p.maskAt(o,l.x,l.y))h=o.z;return h;};
// 高度格与空间哈希都要和逐片暴力计算一致
function consistent(p){
  for(let i=0;i<p.height.length;i+=37){
    const c=i%p.hcols,r=Math.floor(i/p.hcols),x=p.x0+(c+0.5)*8,y=p.y0+(r+0.5)*8;
    let h=0;for(const l of p.leaves)if(l.z>h&&p.maskAt(l,x,y))h=l.z;assert.equal(p.height[i],h,`height at ${x},${y}`);
  }
  for(const l of p.leaves)p.eachCell(l,cell=>assert.ok(cell.includes(l),`leaf ${l.id} missing from a hash cell`));
  assert.equal(p.maxZ,p.leaves.reduce((m,o)=>Math.max(m,o.z),0));
}

test('a leaf whose centre loses its support sinks onto the next leaf below',()=>{
  const p=new Pile({masks:discs(),count:0}),t=p.thickness;
  const a=p.addLeaf(leaf(0,0)),b=p.addLeaf(leaf(0,0)),c=p.dropLeaf(leaf(10,0));
  assert.deepEqual([a.z,b.z,c.z],[t,2*t,3*t]);
  p.remove(b);const moves=p.settle([b]);
  assert.equal(c.z,2*t);assert.deepEqual(moves.map(m=>[m.leaf,m.from[2]]),[[c,3*t]]);
  consistent(p);
});
test('settling cascades upward and stops on the needle',()=>{
  const p=new Pile({masks:discs(),count:0}),t=p.thickness;
  for(let i=0;i<3;i++)p.addLeaf(leaf(0,0));
  const n=p.placeNeedleAt(0,0,0),top=p.dropLeaf(leaf(0,0)),cap=p.dropLeaf(leaf(5,0));
  const under=p.leaves.filter(l=>l.z<n.z).sort((x,y)=>y.z-x.z)[0];
  p.remove(under);p.settle([under]);
  assert.ok(top.z>n.z&&cap.z>top.z,'leaves on the needle stay above it');
  consistent(p);
});
test('a surface leaf hanging over a dug hole slides into it and ends lower',()=>{
  const p=new Pile({masks:discs(),count:0}),t=p.thickness;
  for(let i=0;i<5;i++){p.addLeaf(leaf(-60,0));p.addLeaf(leaf(60,0));}
  const rim=p.dropLeaf(leaf(-30,0)),z0=rim.z,x0=rim.x;
  const hole=p.leaves.filter(l=>l.x===60);p.removeMany(hole);
  const moves=p.settle(hole,{slide:2,overhang:0.3});
  assert.ok(moves.some(m=>m.leaf===rim),'the rim leaf moved');
  assert.ok(rim.z<=z0-2*t&&rim.x>x0,`slid from (${x0},${z0}) to (${rim.x.toFixed(1)},${rim.z})`);
  consistent(p);
});
test('sliding never enters a landing-blocked area (the face circle)',()=>{
  const p=new Pile({masks:discs(),count:0});
  for(let i=0;i<5;i++){p.addLeaf(leaf(-60,0));p.addLeaf(leaf(60,0));}
  const rim=p.dropLeaf(leaf(-30,0)),x0=rim.x;
  p.landing=(l,z)=>l.x>x0?{x:x0,y:l.y}:null;
  const hole=p.leaves.filter(l=>l.x===60);p.removeMany(hole);p.settle(hole,{slide:2,overhang:0.3});
  assert.ok(rim.x<=x0);
});
test('one pick moves at most maxMoves leaves and a compact pile barely reacts to a surface pick',()=>{
  const p=new Pile({masks:discs(),seed:5,count:1200}).generate(),r=rng(9);let total=0,picks=0;
  for(let i=0;i<40;i++){
    const s=cam.project([(r()-0.5)*600,(r()-0.5)*240,30]),l=p.pick(cam.ray(s.x,s.y));if(!l)continue;
    p.remove(l);const m=p.settle([l],{maxMoves:5});assert.ok(m.length<=5);total+=m.length;picks++;
    for(const {leaf:o}of m)assert.ok(Math.abs(o.z-(restBelow(p,o)+p.thickness))<1e-9||o.z<restBelow(p,o)+p.thickness+1e-9);
  }
  assert.ok(total/picks<3,`avg ${total/picks} moves per pick`);
  consistent(p);
});
test('generate compacts the pile: no leaf floats above the highest lower leaf under its centre',()=>{
  const p=new Pile({masks:discs(),seed:7,count:900}).generate(),t=p.thickness;
  for(const l of p.leaves)assert.equal(p.restZ(l,l.x,l.y,l.z),l.z,`leaf ${l.id} floats`);
  assert.ok(p.leaves.every(l=>l.z>=t));
});
