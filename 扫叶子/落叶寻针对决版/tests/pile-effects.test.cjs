const {test}=require('node:test'),assert=require('node:assert/strict');
const {Pile,above,rng,HCELL}=require('../src/pile.js');
const {Camera,rayAtHeight}=require('../src/camera.js');
const {discs,discMask}=require('./helpers.cjs');
const cam=new Camera({elevation:60}),full={size:4,data:new Uint8Array(16).fill(1)};
const rayTo=(c,x,y,z)=>{const s=c.project([x,y,z]);return c.ray(s.x,s.y);};
const bruteTop=(p,x,y)=>{let h=0;for(const l of p.leaves)if(l.z>h&&p.maskAt(l,x,y))h=l.z;return h;};
// 暴力版支撑高度：遍历全部叶片（不走哈希），取盖住新叶中心点的最高 z
function support(p,l){let s=0;for(const o of p.leaves)if(o!==l&&o.z>s&&p.maskAt(o,l.x,l.y))s=o.z;return s;}

test('dropLeaf lands one layer above the highest leaf under its centre, on top and visible',()=>{
  const p=new Pile({masks:discs(),seed:4,count:900}).generate(),t=p.thickness;
  for(const [x,y,yaw]of [[0,0,0.7],[150,40,2],[-260,-90,4],[380,120,1],[-120,150,5],[700,0,3]]){
    const v=p.version,maxZ=p.maxZ,l=p.dropLeaf({x,y,yaw,size:100,type:2});
    assert.equal(l.z,support(p,l)+t);
    assert.ok(p.leaves.every(o=>o===l||!p.maskAt(o,x,y)||o.z<l.z),'no other leaf covers its centre at or above it');
    assert.deepEqual([l.depth,l.shade],[0,1]);assert.equal(p.leaves.at(-1),l);assert.ok(p.leavesNear(x,y).includes(l));
    // 高度格按 8 单位格心取样，格心可能落在更高邻叶上；精确点上新叶就是最上面那片
    assert.equal(p.topAt(x,y),l.z);assert.ok(p.heightAt(x,y)>=l.z);assert.equal(p.maxZ,Math.max(maxZ,l.z));assert.equal(p.version,v+1);
    // 软叶子边缘可以压在更高邻叶下，斜看时中心可能被前面的叶子挡住；从正上方点中心一定点得到
    assert.equal(p.pick({origin:[x,y,2000],dir:[0,0,-1]}),l);
  }
  assert.equal(p.leaves.at(-1).z,t,'bare ground outside the pile is the first layer');
});
test('dropLeaf rests by its centre like a soft leaf: rim-only overlaps do not lift it, so pits can fill',()=>{
  const p=new Pile({masks:discs(),count:0});
  p.addLeaf({x:0,y:0,yaw:0,size:100,type:0});p.addLeaf({x:0,y:0,yaw:0,size:100,type:0});
  assert.equal(p.dropLeaf({x:60,y:0,yaw:0,size:100,type:0}).z,4);
  assert.equal(p.dropLeaf({x:30,y:0,yaw:0,size:100,type:0}).z,12);
  assert.equal(p.addLeaf({x:-60,y:0,yaw:0,size:100,type:0}).z,4);
});
test('a leaf dropped onto the needle rests on it and covers it',()=>{
  const p=new Pile({masks:discs(),count:0}),t=p.thickness;
  for(let i=0;i<3;i++)p.addLeaf({x:70,y:0,yaw:0,size:100,type:0});
  const n=p.placeNeedleAt(0,0,0);assert.equal(n.z,3*t+t/2);
  const l=p.dropLeaf({x:-60,y:0,yaw:0,size:100,type:0});
  assert.equal(l.z,n.z+t/2);assert.ok(p.coverAt(-60,0,n.z)>=1);
  n.pulled=true;assert.equal(p.dropLeaf({x:-160,y:0,yaw:0,size:100,type:0}).z,t,'a pulled needle is no support');
});
test('removeMany equals removing one by one, ignores strangers, and bumps the version once',()=>{
  const make=()=>new Pile({masks:[discMask(32,0.45),full,discMask(32,0.3)],seed:6,count:900}).generate();
  const p=make(),q=make(),R=rng(5),byId=new Map(q.leaves.map(l=>[l.id,l]));
  const gone=p.leaves.filter(l=>Math.hypot(l.x-60,(l.y+20)*2)<220||R()<0.05),qGone=gone.map(l=>byId.get(l.id));
  assert.ok(gone.length>=150,`${gone.length} leaves`);
  p.exposure(cam.position);const v=p.version;
  assert.equal(p.removeMany([...gone,gone[0],q.leaves[0],{id:-1,x:0,y:0,z:0}]),gone.length);
  assert.equal(p.version,v+1);assert.equal(p.exposureCache,null);
  for(const l of qGone)q.remove(l);
  assert.deepEqual(p.leaves.map(l=>l.id),q.leaves.map(l=>l.id));assert.equal(p.maxZ,q.maxZ);
  assert.deepEqual(p.height,q.height);
  assert.deepEqual(p.cells.map(c=>c.map(l=>l.id)),q.cells.map(c=>c.map(l=>l.id)));
  const xs=gone.map(l=>l.x),ys=gone.map(l=>l.y),x0=Math.min(...xs)-120,x1=Math.max(...xs)+120,y0=Math.min(...ys)-120,y1=Math.max(...ys)+120;
  for(let y=p.y0+HCELL/2;y<p.y0+p.h;y+=HCELL)if(y>=y0&&y<=y1)for(let x=p.x0+HCELL/2;x<p.x0+p.w;x+=HCELL)if(x>=x0&&x<=x1)assert.equal(p.heightAt(x,y),bruteTop(p,x,y));
  assert.equal(p.removeMany(gone),0);assert.equal(p.removeMany([]),0);assert.equal(p.version,v+1,'nothing removed, nothing changed');
});
test('surfaceLeaves returns only leaves with an uncovered centre, highest first, at most n',()=>{
  const s=new Pile({masks:discs(),count:0});
  const a=s.addLeaf({x:0,y:0,yaw:0,size:100,type:0}),b=s.addLeaf({x:10,y:0,yaw:0,size:100,type:0}),c=s.addLeaf({x:80,y:0,yaw:0,size:100,type:0});
  assert.deepEqual([a.z,b.z,c.z],[4,8,4]);assert.deepEqual(s.surfaceLeaves(0,0,100,5),[b,c]);assert.deepEqual(s.surfaceLeaves(0,0,50,5),[b]);
  const p=new Pile({masks:discs(),seed:8,count:700}).generate(),[cx,cy,r]=[40,10,160];
  const near=l=>Math.hypot(l.x-cx,l.y-cy)<=r,covered=l=>p.leaves.some(o=>above(o,l)&&p.maskAt(o,l.x,l.y));
  const want=p.leaves.filter(l=>near(l)&&!covered(l)).sort((m,k)=>k.z-m.z||k.id-m.id);
  assert.ok(want.length>=4&&p.leaves.some(l=>near(l)&&covered(l)),'the probe area mixes surface and buried leaves');
  assert.deepEqual(p.surfaceLeaves(cx,cy,r),want);assert.deepEqual(p.surfaceLeaves(cx,cy,r,3),want.slice(0,3));
  assert.deepEqual(p.surfaceLeaves(cx,cy,r,0),[]);assert.deepEqual(p.surfaceLeaves(1000,1000,50,5),[]);
});
test('surfaceLeaves peels without removing: leaves in skip count as already gone',()=>{
  const make=()=>new Pile({masks:discs(),seed:8,count:700}).generate(),p=make(),q=make(),skip=new Set(),v=p.version;
  const first=p.surfaceLeaves(0,0,200).length;
  for(let k=0;k<4;k++)for(const l of p.surfaceLeaves(0,0,200,Infinity,skip))skip.add(l);
  assert.ok(skip.size>2*first,`peeled ${skip.size}, first skin ${first}`);assert.equal(p.leaves.length,700);assert.equal(p.version,v);
  const ids=new Set([...skip].map(l=>l.id));q.removeMany(q.leaves.filter(l=>ids.has(l.id)));
  assert.deepEqual(p.surfaceLeaves(0,0,200,Infinity,skip).map(l=>l.id),q.surfaceLeaves(0,0,200).map(l=>l.id));
});
test('isPit flags ground dug more than two layers below the original surface',()=>{
  const s=new Pile({masks:discs(),count:0});
  for(let i=0;i<3;i++)s.addLeaf({x:0,y:0,yaw:0,size:100,type:0});
  assert.equal(s.isPit(0,0),false,'no original surface recorded');
  s.baseHeight=s.height.slice();s.removeMany(s.leaves.slice(1));
  assert.equal(s.isPit(0,0),false,'exactly two layers lower is not yet a pit');
  s.remove(s.leaves[0]);assert.equal(s.isPit(0,0),true);
  const p=new Pile({masks:discs(),seed:5,count:1200}).generate();
  assert.equal(p.isPit(0,0),false);
  for(let i=0;i<15;i++){const l=p.pick(rayTo(cam,0,0,p.heightAt(0,0)));if(!l)break;p.remove(l);}
  assert.equal(p.isPit(0,0),true);
  assert.equal(p.isPit(-380,60),false);assert.equal(p.isPit(900,900),false);assert.equal(p.isPit(5000,0),false);
});
test('placeNeedleAt rests the needle on the surface; leaves dropped over it raise minCover',()=>{
  const p=new Pile({masks:discs(),seed:7,count:900}).generate(),t=p.thickness;
  assert.ok(p.placeNeedle({minCover:9,cameraPos:cam.position}));
  p.exposure(cam.position);p.glintCenter={x:1,y:2};const v=p.version;
  const n=p.placeNeedleAt(120,30,0.4);
  assert.equal(p.needle,n);assert.deepEqual([n.x,n.y,n.yaw,n.length,n.pulled],[120,30,0.4,150,false]);
  assert.equal(n.z,Math.max(...p.needleSamples().map(([x,y])=>p.heightAt(x,y)))+t/2);
  assert.equal(p.version,v+1);assert.equal(p.exposureCache,null);assert.equal(p.glintCenter,null);
  const e0=p.exposure(cam.position).ratio,c0=p.minCover(),pts=p.needleSamples();
  assert.ok(e0>0,`exposure ${e0}`);
  for(let i=0;i<15;i++){const [x,y]=pts[(i*5)%24];p.dropLeaf({x:x+7,y:y-5,yaw:i,size:100,type:i%6});}
  assert.ok(p.minCover()>c0,`minCover ${c0} -> ${p.minCover()}`);assert.ok(p.exposure(cam.position).ratio<e0);
});
test('the default bounds cover the whole stage at 45–75°, so far overflow leaves stay pickable',()=>{
  const c=new Camera({elevation:45}),p=new Pile({masks:discs(),seed:2,count:300}).generate();
  assert.deepEqual([p.x0,p.y0,p.w,p.h,p.cols,p.rows,p.hcols,p.hrows],[-1200,-450,2400,1600,38,25,300,200]);
  for(const elevation of [45,60,75]){const k=new Camera({elevation});for(const [sx,sy]of [[0,0],[1440,0],[0,810],[1440,810]]){const g=rayAtHeight(k.ray(sx,sy),0);assert.ok(g.x>p.x0&&g.x<p.x0+p.w&&g.y>p.y0&&g.y<p.y0+p.h,`${elevation}° corner ${sx},${sy} -> ${g.x|0},${g.y|0}`);}}
  for(const [x,y]of [[1100,1000],[-1050,1040],[590,-350],[0,1060]]){
    const l=p.dropLeaf({x,y,yaw:0.3,size:100,type:1});
    assert.equal(l.z,p.thickness);assert.equal(p.heightAt(x,y),l.z);assert.equal(p.pick(rayTo(c,x,y,l.z)),l);
  }
  const small=new Pile({masks:discs(),count:0,bounds:{x0:-680,y0:-380,w:1360,h:760}});
  assert.deepEqual([small.cols,small.rows,small.hcols,small.hrows],[22,12,170,95]);
  small.dropLeaf({x:1100,y:1000,yaw:0,size:100,type:0});assert.equal(small.pick(rayTo(c,1100,1000,4)),null,'a custom grid ends where it says');
});
