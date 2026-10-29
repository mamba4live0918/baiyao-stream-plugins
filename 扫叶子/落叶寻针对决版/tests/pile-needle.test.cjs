const {test}=require('node:test'),assert=require('node:assert/strict');
const {Pile}=require('../src/pile.js');
const {Camera}=require('../src/camera.js');
const {discs}=require('./helpers.cjs');
const cam=new Camera({elevation:60});
const rayTo=(x,y,z)=>{const s=cam.project([x,y,z]);return cam.ray(s.x,s.y);};
// 压实后层间距更紧，8 单位高度格偶尔让一片露在表面的叶子算出 1 层深度；允许极少数例外
const BRIGHT_SHARE=0.97;
function freshPile(seed=7){const pile=new Pile({masks:discs(),seed,count:900}).generate();const n=pile.placeNeedle({minCover:9,cameraPos:cam.position});return{pile,n};}
function digAbove(pile,limit){let guard=0;while(pile.minCover()>limit&&guard++<600){const [x,y,z]=pile.needleSamples()[12];const above=pile.leavesNear(x,y).filter(l=>l.z>z&&pile.maskAt(l,x,y)).sort((p,q)=>q.z-p.z);if(!above.length)break;pile.remove(above[0]);}}

test('placeNeedle hides the needle mid-pile',()=>{
  const {pile,n}=freshPile();
  assert.ok(n);assert.ok(pile.minCover()>=9);assert.equal((n.z/pile.thickness)%1,0.5);
  for(const [x,y,z]of pile.needleSamples())assert.ok(pile.columnZ(x,y).some(v=>v<z),'a leaf lies below the needle');
  assert.equal(pile.exposure(cam.position).ratio,0);
  assert.equal(pile.glint({threshold:8}).active,false);
});
test('placeNeedle is deterministic for a seed',()=>{
  const a=freshPile(11).n,b=freshPile(11).n;assert.deepEqual([a.x,a.y,a.z,a.yaw],[b.x,b.y,b.z,b.yaw]);
});
test('coverAt counts leaves above a point',()=>{
  const pile=new Pile({masks:discs(),count:0});
  pile.addLeaf({x:0,y:0,yaw:0,size:100,type:0});pile.addLeaf({x:0,y:0,yaw:0,size:100,type:0});
  assert.equal(pile.coverAt(0,0,0),2);assert.equal(pile.coverAt(0,0,5),1);assert.equal(pile.coverAt(300,0,0),0);
});
test('digging toward the needle turns on a stable, fuzzy glint that speeds up',()=>{
  const {pile,n}=freshPile();
  digAbove(pile,8);
  const g1=pile.glint({threshold:8,radius:120});
  assert.equal(g1.active,true);assert.ok(Math.hypot(g1.center.x-n.x,g1.center.y-n.y)<=72+1e-9);
  digAbove(pile,3);
  const g2=pile.glint({threshold:8,radius:120});
  assert.deepEqual(g2.center,g1.center);assert.ok(g2.interval<=g1.interval);assert.ok(g2.interval>=0.6);
});
test('the glint center is not simply the needle position',()=>{
  const dists=[1,2,3,4].map(seed=>{const {pile,n}=freshPile(seed);digAbove(pile,8);const g=pile.glint({threshold:8,radius:120});return g.active?Math.hypot(g.center.x-n.x,g.center.y-n.y):0;});
  assert.ok(dists.some(d=>d>5),`distances ${dists}`);
});
test('debugExpose clears the view and the needle can be hit',()=>{
  const {pile,n}=freshPile();
  assert.ok(pile.debugExpose(cam.position)>0);
  assert.equal(pile.exposure(cam.position).ratio,1);
  const s=cam.project([n.x,n.y,n.z]);assert.ok(pile.needleHit(cam.ray(s.x,s.y))>=0);
  const far=cam.project([n.x+200,n.y,n.z]);assert.equal(pile.needleHit(cam.ray(far.x,far.y)),-1);
});
test('shadeLeaves keeps the untouched surface bright and darkens leaves exposed by digging',()=>{
  const pile=new Pile({masks:discs(),seed:5,count:600}).generate();pile.shadeLeaves();
  const probe=(x,y)=>pile.pick(rayTo(x,y,pile.heightAt(x,y)));
  const seen=[];for(let x=-300;x<=300;x+=30)for(let y=-120;y<=120;y+=30){const l=probe(x,y);if(l)seen.push(l);}
  const bright=seen.filter(l=>l.shade===1).length;
  assert.ok(bright>=seen.length*BRIGHT_SHARE,`only ${bright}/${seen.length} visible leaves are bright`);
  const before=probe(0,0);
  for(let i=0;i<15;i++){const l=probe(0,0);if(!l)break;pile.remove(l);}
  pile.shadeLeaves();
  const pit=probe(0,0);assert.ok(pit&&pit!==before&&pit.shade<1,`pit leaf shade ${pit&&pit.shade}`);
  assert.ok(pit.depth>0);
});
test('placeNeedle honours minCover even when it exceeds maxCover',()=>{
  const pile=new Pile({masks:discs(),seed:7,count:1200}).generate();
  const n=pile.placeNeedle({minCover:22,maxCover:20,cameraPos:cam.position});
  assert.ok(n);assert.ok(pile.minCover()>=22,`minCover ${pile.minCover()}`);
});
