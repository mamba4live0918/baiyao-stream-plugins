const {test}=require('node:test'),assert=require('node:assert/strict');
const {Pile,HCELL,STEP}=require('../src/pile.js');
const {quadrantMask,discMask,discs}=require('./helpers.cjs');
const full={size:4,data:new Uint8Array(16).fill(1)};

test('maskAt maps image top-left to local (-u,+v)',()=>{
  const pile=new Pile({masks:[quadrantMask()],count:0});
  const l=pile.addLeaf({x:0,y:0,yaw:0,size:100,type:0});
  assert.equal(pile.maskAt(l,-25,25),true);assert.equal(pile.maskAt(l,25,25),false);assert.equal(pile.maskAt(l,-25,-25),false);
});
test('maskAt follows leaf rotation',()=>{
  const pile=new Pile({masks:[quadrantMask()],count:0});
  const l=pile.addLeaf({x:0,y:0,yaw:Math.PI/2,size:100,type:0});
  assert.equal(pile.maskAt(l,-25,-25),true);assert.equal(pile.maskAt(l,-25,25),false);
});
test('overlapping leaves stack by thickness, separate leaves stay on the ground',()=>{
  const pile=new Pile({masks:discs(),count:0,thickness:4});
  const a=pile.addLeaf({x:0,y:0,yaw:0,size:100,type:0}),b=pile.addLeaf({x:10,y:0,yaw:1,size:100,type:1}),c=pile.addLeaf({x:300,y:0,yaw:0,size:100,type:2});
  assert.equal(a.z,4);assert.equal(b.z,8);assert.equal(c.z,4);
  assert.equal(pile.heightAt(5,0),8);assert.equal(pile.heightAt(300,0),4);assert.equal(pile.heightAt(-400,0),0);
});
test('generate builds a deterministic mound',()=>{
  const make=()=>new Pile({masks:discs(),seed:3,count:600}).generate();
  const p=make(),q=make();
  assert.equal(p.leaves.length,600);
  assert.ok(p.leaves.every(l=>l.z>=p.thickness));
  assert.deepEqual(p.leaves.map(l=>[l.x,l.y,l.z]),q.leaves.map(l=>[l.x,l.y,l.z]));
  assert.ok(p.heightAt(0,0)>p.heightAt(p.a*0.85,0));
  assert.ok(p.maxZ>=p.heightAt(0,0));
});
// 铺叶按「盖住中心的叶子数 + 1」定高度，再压实：每片都正好停在中心点下方最高那片之上一层，没有悬空
test('after compaction every leaf rests one layer above the highest lower leaf under its centre (no mesa)',()=>{
  const p=new Pile({masks:discs(),seed:3,count:600}).generate(),t=p.thickness;
  for(const l of p.leaves){let h=0;for(const o of p.leaves)if(o!==l&&o.z<l.z&&o.z>h&&p.maskAt(o,l.x,l.y))h=o.z;assert.equal(l.z,h+t);}
  assert.ok(p.maxZ<=40*t,`maxZ is ${p.maxZ/t} layers`);
});
test('hash finds every leaf at its rotated corners and half a march step beyond',()=>{
  const p=new Pile({masks:[full],seed:2,count:300}).generate();
  for(const l of p.leaves)for(let k=0;k<4;k++){
    const a=l.yaw+Math.PI/4+k*Math.PI/2,R=l.size*Math.SQRT1_2*(1-1e-9),x=l.x+Math.cos(a)*R,y=l.y+Math.sin(a)*R;
    assert.ok(p.maskAt(l,x,y));
    for(const [ox,oy]of [[0,0],[STEP/2,0],[-STEP/2,0],[0,STEP/2],[0,-STEP/2]])assert.ok(p.leavesNear(x+ox,y+oy).includes(l),`leaf ${l.id} corner ${k}`);
  }
});
test('height grid equals the brute-force top z at every cell centre',()=>{
  const p=new Pile({masks:[full,discMask(32,0.3)],seed:9,count:250}).generate();
  for(let r=0;r<p.hrows;r++)for(let c=0;c<p.hcols;c++){const x=p.x0+(c+0.5)*HCELL,y=p.y0+(r+0.5)*HCELL;let h=0;
    for(const l of p.leaves)if(l.z>h&&p.maskAt(l,x,y))h=l.z;assert.equal(p.heightAt(x,y),h);}
});
test('generate() on the same instance restarts from the seed with a new version',()=>{
  const p=new Pile({masks:discs(),seed:3,count:200}),snap=()=>p.leaves.map(l=>[l.id,l.x,l.y,l.z,l.yaw,l.size,l.type]);
  p.generate();const first=snap(),v1=p.version;p.generate();
  assert.equal(p.leaves.length,200);assert.deepEqual(snap(),first);assert.ok(p.version>v1);
});
