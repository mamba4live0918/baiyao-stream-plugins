const {test}=require('node:test'),assert=require('node:assert/strict');
const {Camera}=require('../src/camera.js'),{Pile}=require('../src/pile.js'),{FaceGuard}=require('../src/face.js'),{discs}=require('./helpers.cjs');
const cam=new Camera({elevation:60});
const ring=(pile,f)=>pile.leaves.filter(l=>{const s=cam.project([l.x,l.y,l.z]);return Math.hypot(s.x-f.x,s.y-f.y)<f.r+l.size*0.5*s.scale;});
function setup(enabled=true){
  const c=cam.project([0,0,30]),face={enabled,x:c.x,y:c.y,r:90};
  return{face,guard:new FaceGuard({cam,get:()=>face})};
}

test('adjust pushes a landing point until its projection clears the circle',()=>{
  const {face,guard}=setup(),pile=new Pile({masks:discs(),seed:3,count:600}).generate();
  for(const [x,y]of [[0,0],[30,-20],[-60,40]]){
    const q=guard.adjust(pile,{x,y,size:100}),s=cam.project([q.x,q.y,pile.heightAt(q.x,q.y)+pile.thickness]);
    assert.ok(Math.hypot(s.x-face.x,s.y-face.y)>=face.r+50*s.scale,`(${x},${y}) still inside`);
    assert.ok(Number.isFinite(q.x)&&Number.isFinite(q.y));
  }
});
test('relocate empties the circle and keeps every leaf',()=>{
  const {face,guard}=setup(),pile=new Pile({masks:discs(),seed:5,count:900}).generate(),n=pile.leaves.length;
  assert.ok(ring(pile,face).length>0);
  const moved=guard.relocate(pile);
  assert.ok(moved>0);assert.equal(pile.leaves.length,n);assert.equal(ring(pile,face).length,0);
});
test('generate with a reject hook keeps the circle empty from the start',()=>{
  const {face,guard}=setup(),pile=new Pile({masks:discs(),seed:7,count:900});
  // 压实会让叶子下沉、投影下移，铺完再按实际位置把碰到圈的搬出去（app 里同样这么做）
  pile.generate((o,z)=>guard.hits(o.x,o.y,z,o.size));guard.relocate(pile);
  assert.equal(ring(pile,face).length,0);assert.ok(pile.leaves.length>800);
});
test('a disabled circle changes nothing',()=>{
  const {guard}=setup(false),pile=new Pile({masks:discs(),seed:5,count:400}).generate(),v=pile.version;
  assert.deepEqual(guard.adjust(pile,{x:5,y:6,size:90}),{x:5,y:6});assert.equal(guard.relocate(pile),0);assert.equal(pile.version,v);
});
test('needleHits sees a needle under the circle',()=>{
  const {face,guard}=setup(),pile=new Pile({masks:discs(),seed:5,count:400}).generate();
  pile.placeNeedleAt(0,0,0);assert.equal(guard.needleHits(pile),true);
  face.x=-500;assert.equal(guard.needleHits(pile),false);
});
test('with the landing hook no dropLeaf can end up inside the circle',()=>{
  const {face,guard}=setup(),pile=new Pile({masks:discs(),seed:9,count:700}).generate();
  guard.relocate(pile);pile.landing=guard.landingFor(pile);
  const r=(()=>{let s=11;return()=>(s=(Math.imul(s,1664525)+1013904223)>>>0)/4294967296;})();
  for(let i=0;i<300;i++)pile.dropLeaf({x:(r()-0.5)*300,y:(r()-0.5)*200,yaw:r()*6,size:90+r()*20,type:i%6});
  assert.equal(ring(pile,face).length,0);
});
