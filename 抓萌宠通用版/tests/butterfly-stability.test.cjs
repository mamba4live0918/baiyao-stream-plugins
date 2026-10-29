const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const sharp=require('C:/Users/Mamba4live/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const work=path.resolve(__dirname,'../开发/蝴蝶稳定-2026-10-11');
const source=path.resolve(__dirname,'../开发/蝴蝶飞龙Q版比熊-2026-10-11/butterfly-animation/export');
async function frames(){const rows=[];for(let i=0;i<30;i++)rows.push(await sharp(path.join(source,String(i).padStart(2,'0')+'.png')).ensureAlpha().raw().toBuffer());return rows;}
const moduleFor=()=>require(path.join(work,'stabilize-butterfly.cjs'));

test('the real painted butterfly frames retain every RGBA pixel under integer whole-image translation',async()=>{
 const {stabilizeButterfly}=moduleFor(),originals=await frames(),fixed=stabilizeButterfly(originals);
 assert.equal(fixed.frames.length,30);assert.equal(fixed.offsets.length,30);
 for(let i=0;i<30;i++){
  const {dx,dy}=fixed.offsets[i];assert(Number.isInteger(dx)&&Number.isInteger(dy));
  for(let y=0;y<256;y++)for(let x=0;x<256;x++){
   const at=(y*256+x)*4;if(originals[i][at+3]===0)continue;
   const target=((y+dy)*256+x+dx)*4;
   assert.deepEqual(fixed.frames[i].subarray(target,target+4),originals[i].subarray(at,at+4),'Changed a painted pixel in frame '+i);
  }
 }
});

test('the actual body anchor remains stable through all thirty poses and the loop boundary',async()=>{
 const {stabilizeButterfly,bodyAnchor}=moduleFor(),originals=await frames(),fixed=stabilizeButterfly(originals);
 const before=originals.map(bodyAnchor),after=fixed.frames.map(bodyAnchor);
 const jump=points=>Math.max(...points.map((p,i)=>Math.hypot(p.x-points[(i+1)%30].x,p.y-points[(i+1)%30].y)));
 assert(jump(before)>25,'The regression must exercise the visibly drifting original sequence');
 assert(jump(after)<=2,'The body still jumps during the wing cycle');
 assert(Math.max(...after.map(p=>p.x))-Math.min(...after.map(p=>p.x))<=2);
 assert(Math.max(...after.map(p=>p.y))-Math.min(...after.map(p=>p.y))<=2);
});

test('translation refuses to clip any visible painted pixel rather than silently trimming a wing',()=>{
 const {translateWhole}=moduleFor(),raw=Buffer.alloc(256*256*4);raw[3]=255;
 assert.throws(()=>translateWhole(raw,-1,0),/clip/i);
 assert.throws(()=>translateWhole(raw,.5,0),/integer/i);
});
