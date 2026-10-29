const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const file=path.join(__dirname,'../src/pinch-frames.js');
function api(){assert.ok(fs.existsSync(file),'frame-based pinch module must exist');return require(file);}
test('frame selector opens, closes, loops hold poses, then releases',()=>{
 const F=api();assert.equal(F.frameAt(0,4000),0);assert.equal(F.frameAt(600,4000),1);assert.equal(F.frameAt(800,4000),2);
 const hold=new Set();for(let ms=1000;ms<2900;ms+=84)hold.add(F.frameAt(ms,4000));assert.deepEqual([...hold].sort(),[3,4,5]);assert.equal(F.frameAt(3300,4000),6);assert.equal(F.frameAt(3750,4000),7);assert.equal(F.frameAt(4100,4000),0);
});
test('finger-only deformation preserves the contact center and forearm',()=>{
 const F=api(),c={x:.89085,y:.20744};for(let f=0;f<8;f++){assert.deepEqual(F.warpPoint(c.x,c.y,c,f),c);assert.deepEqual(F.warpPoint(.2,.8,c,f),{x:.2,y:.8});}
 const upper=F.warpPoint(.90,.18,c,5),lower=F.warpPoint(.90,.23,c,5);assert.ok(upper.y>.18);assert.ok(lower.y<.23);assert.ok(lower.y>upper.y);
});
test('invalid frame requests cannot produce nonfinite coordinates or unbounded banks',()=>{
 const F=api();assert.throws(()=>F.frameAt(NaN,4000));assert.throws(()=>F.frameAt(0,0));assert.throws(()=>F.warpPoint(.5,.5,{x:.5,y:.5},100));assert.equal(F.COUNT,8);assert.equal(F.FPS,12);
});
