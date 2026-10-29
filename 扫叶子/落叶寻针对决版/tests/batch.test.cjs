const {test}=require('node:test'),assert=require('node:assert/strict');
const {SpriteBatch,STRIDE}=require('../src/render.js');

test('push packs 17 floats per sprite and grows on demand',()=>{
  const b=new SpriteBatch(1);
  b.push([1,2,3],[4,5,6],[7,8,9],[0.1,0.2,0.3,0.4],[1,1,1,0.5]);b.push([0,0,0],[1,0,0],[0,1,0],[0,0,1,1],[1,1,1,1]);
  assert.equal(STRIDE,17);assert.equal(b.count,2);
  assert.deepEqual(Array.from(b.data.subarray(0,17)).map(v=>Math.round(v*100)/100),[1,2,3,4,5,6,7,8,9,0.1,0.2,0.3,0.4,1,1,1,0.5]);
  b.clear();assert.equal(b.count,0);
});
test('flat sprites lie on the ground plane with rotated axes',()=>{
  const b=new SpriteBatch().flat(10,20,30,Math.PI/2,100,[0,1,1,0],[1,1,1,1]);
  const d=Array.from(b.data.subarray(0,9)).map(v=>Math.round(v*1000)/1000);
  assert.deepEqual(d,[10,20,30,0,100,0,-100,0,0]);
});
test('billboards stand on their base and face the camera',()=>{
  const cam={right:[1,0,0],up:[0,0.5,Math.sqrt(3)/2]};
  const b=new SpriteBatch().billboard([100,0,0],80,200,cam,[0,1,1,0],[1,1,1,1]);
  const d=Array.from(b.data.subarray(0,9)).map(v=>Math.round(v*1000)/1000);
  assert.deepEqual(d,[100,50,86.603,80,0,0,0,100,173.205]);
});
