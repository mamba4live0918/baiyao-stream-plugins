const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const sharp=require('C:/Users/Mamba4live/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const root=path.resolve(__dirname,'..');
const strip=process.env.SHARK_STRIP_PATH||path.join(root,'素材/水族馆/aqua-great-white-12frames.png');
const reportFile=process.env.SHARK_REPORT_PATH||path.join(root,'开发/水族馆正式素材-2026-10-05/assembly-report.json');
const report=JSON.parse(fs.readFileSync(reportFile,'utf8'));
const registered=report.assets.find(a=>a.id==='aqua-great-white');
const eye={x:process.env.SHARK_ANCHOR_X===undefined?registered.targetAnchor.x:Number(process.env.SHARK_ANCHOR_X),y:process.env.SHARK_ANCHOR_Y===undefined?registered.targetAnchor.y:Number(process.env.SHARK_ANCHOR_Y)};
const SIDE=256,ALPHA=64;
const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
const range=values=>Math.max(...values)-Math.min(...values);

function rowRuns(on,y,left,right){
 const runs=[];let start=null;
 for(let x=left;x<=right+1;x++){
  if(x<=right&&on(x,y)){if(start===null)start=x;}
  else if(start!==null){if(x-start>=5)runs.push({left:start,right:x-1,width:x-start,center:(start+x-1)/2});start=null;}
 }
 return runs;
}

function geometry(data,frame){
 const on=(x,y)=>x>=0&&x<SIDE&&y>=0&&y<SIDE&&data[(y*SIDE+x)*4+3]>=ALPHA;
 // The head's top/bottom silhouette locates body lines independently of fin tips.
 // At three pixels above the back, the connected row belongs to the dorsal fin.
 let backY=SIDE,bellyY=-1;
 for(let x=Math.round(eye.x)-12;x<=Math.round(eye.x)+8;x++){
  for(let y=0;y<eye.y;y++)if(on(x,y)){backY=Math.min(backY,y);break;}
 }
 for(let x=Math.round(eye.x)-8;x<=Math.round(eye.x)+10;x++){
  for(let y=SIDE-1;y>eye.y;y--)if(on(x,y)){bellyY=Math.max(bellyY,y);break;}
 }
 assert(backY>0&&bellyY>eye.y,`frame ${frame}: cannot locate head/body silhouette`);
 const left=Math.max(0,Math.round(eye.x+10)),right=Math.min(SIDE-1,Math.floor(eye.x+105));
 let topY=SIDE,topXs=[];
 for(let y=Math.max(0,Math.floor(eye.y-105));y<backY-4;y++){
  const runs=rowRuns(on,y,left,right);
  if(runs.length){topY=y;const r=runs.reduce((a,b)=>a.width>b.width?a:b);topXs=Array.from({length:r.width},(_,i)=>r.left+i);break;}
 }
 assert(topXs.length,`frame ${frame}: no dorsal fin above the body`);
 const tipX=(topXs[0]+topXs.at(-1))/2;
 const bases=rowRuns(on,backY-3,left,right).sort((a,b)=>Math.abs(a.center-tipX)-Math.abs(b.center-tipX));
 assert(bases.length,`frame ${frame}: dorsal base contour missing`);
 const base=bases[0];
 let pectoralY=-1,pectoralX=NaN;
 const chestLeft=Math.round(eye.x+12),chestRight=Math.min(SIDE-1,Math.floor(eye.x+95));
 for(let y=Math.min(SIDE-1,Math.floor(eye.y+100));y>bellyY+3;y--){
  const runs=rowRuns(on,y,chestLeft,chestRight);
  if(runs.length){const r=runs.reduce((a,b)=>a.width>b.width?a:b);pectoralY=y;pectoralX=r.center;break;}
 }
 assert(pectoralY>bellyY,`frame ${frame}: lower rear pectoral fin missing`);
 const chestBases=rowRuns(on,bellyY+2,chestLeft,chestRight).sort((a,b)=>Math.abs(a.center-pectoralX)-Math.abs(b.center-pectoralX));
 assert(chestBases.length,`frame ${frame}: pectoral base contour missing`);
 return {frame,backY,bellyY,dorsal:{tipX,tipY:topY,base,height:backY-topY,sweep:tipX-base.center},pectoral:{tipX:pectoralX,tipY:pectoralY,base:chestBases[0],sweep:pectoralX-chestBases[0].center}};
}

const measured=(async()=>{
 assert(Number.isFinite(eye.x)&&Number.isFinite(eye.y),'Finite registered eye anchor is required');
 const meta=await sharp(strip).metadata();assert.equal(meta.width,SIDE*12);assert.equal(meta.height,SIDE);assert(meta.hasAlpha);
 const frames=[];
 for(let i=0;i<12;i++){
  const pixels=await sharp(strip).extract({left:i*SIDE,top:0,width:SIDE,height:SIDE}).ensureAlpha().raw().toBuffer();
  frames.push({pixels,...geometry(pixels,i+1)});
 }
 return frames;
})();

test('all twelve dorsal fins sweep toward the tail relative to their own base contour',async t=>{
 const frames=await measured;
 t.diagnostic(JSON.stringify(frames.map(f=>({frame:f.frame,tipX:f.dorsal.tipX,baseCenter:f.dorsal.base.center,sweep:f.dorsal.sweep}))));
 // This is a left-facing species: a rear-swept dorsal tip lies RIGHT of its base.
 // The old good poses measure +14..18px; old reversed poses measure -15..18.5px.
 const bad=frames.filter(f=>f.dorsal.sweep<Math.max(4,f.dorsal.base.width*.1));
 assert.deepEqual(bad.map(f=>f.frame),[],`Forward-folding dorsal fins: ${bad.map(f=>`${f.frame} (${f.dorsal.sweep.toFixed(1)}px)`).join(', ')}`);
 for(const f of frames){assert(f.dorsal.height>=10&&f.dorsal.height<=65,`frame ${f.frame}: implausible dorsal height`);assert(f.dorsal.base.width>=16,`frame ${f.frame}: dorsal base collapsed`);}
});

test('dorsal structure stays stable across the row transitions and the loop seam',async()=>{
 const frames=await measured,baseWidth=median(frames.map(f=>f.dorsal.base.width));
 const maxHorizontalChange=Math.max(12,baseWidth*.45);
 assert(range(frames.map(f=>f.dorsal.tipX-eye.x))<=maxHorizontalChange,'Dorsal tip jumps across its base rather than retaining a rear-swept structure');
 const h=frames.map(f=>f.dorsal.height);assert(Math.max(...h)/Math.min(...h)<=1.9,'Dorsal fin height changes disproportionately');
 for(let i=0;i<12;i++){
  const a=frames[i].dorsal,b=frames[(i+1)%12].dorsal;
  assert(Math.abs(a.tipX-b.tipX)<=maxHorizontalChange,`Dorsal discontinuity between frames ${i+1} and ${(i+1)%12+1}`);
  assert(Math.abs(a.sweep-b.sweep)<=Math.max(10,baseWidth*.35),`Dorsal sweep flips between frames ${i+1} and ${(i+1)%12+1}`);
 }
});

test('the visible pectoral fin remains below and rearward of its body attachment',async()=>{
 for(const f of await measured){
  const p=f.pectoral;
  assert(p.tipX>eye.x+20&&p.tipY>eye.y+35,`frame ${f.frame}: pectoral tip is not in the lower rear quadrant`);
  assert(p.sweep>=Math.max(2,p.base.width*.06),`frame ${f.frame}: pectoral tip folds toward the head (${p.sweep.toFixed(1)}px)`);
  assert(p.tipY-f.bellyY>=6,`frame ${f.frame}: pectoral fin disappears into the belly`);
 }
});

test('all shark fins and tail stay inside the transparent safe border',async()=>{
 for(const f of await measured){
  let visible=0;
  for(let y=0;y<SIDE;y++)for(let x=0;x<SIDE;x++){
   const a=f.pixels[(y*SIDE+x)*4+3];if(a>=ALPHA)visible++;
   if(x<11||x>244||y<11||y>244)assert.equal(a,0,`frame ${f.frame}: silhouette reaches unsafe border at ${x},${y}`);
  }
  assert(visible>3000,`frame ${f.frame}: incomplete shark silhouette`);
 }
});
