const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const sharp=require('C:/Users/Mamba4live/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const root=path.resolve(__dirname,'..'),work=path.join(root,'开发/自己人动画-2026-10-08'),art=path.join(root,'素材');
const manifestPath=path.join(art,'配饰/manifest.json'),programPath=path.join(work,'prepare-accessories.cjs');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8')),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const kinds=[72,74,79,92,93,94],base=read(path.join(work,'preservation-baseline.json'));

test('six approved accessories publish only transparent overlay assets for their original logical kinds',async()=>{
 assert(fs.existsSync(manifestPath),'Accessory manifest is missing');
 const rows=read(manifestPath);assert(Array.isArray(rows));assert.equal(rows.length,6);assert.deepEqual(rows.map(x=>x.kind),kinds);
 assert.equal(new Set(rows.map(x=>x.id)).size,6);
 for(const row of rows){
  assert.equal(row.frames,12);assert(row.name.length>0);assert(row.src.startsWith('配饰/'));assert(row.walk.startsWith('配饰/'));assert(row.preview.startsWith('配饰/'));
  const poster=await sharp(path.join(art,row.src)).metadata(),strip=await sharp(path.join(art,row.walk)).metadata();
  assert.deepEqual([poster.width,poster.height,poster.channels,poster.hasAlpha],[256,256,4,true]);
  assert.deepEqual([strip.width,strip.height,strip.channels,strip.hasAlpha],[3072,256,4,true]);
  for(let frame=-1;frame<12;frame++){
   const pipeline=sharp(path.join(art,frame<0?row.src:row.walk));
   const pixels=await (frame<0?pipeline:pipeline.extract({left:frame*256,top:0,width:256,height:256})).raw().toBuffer();
   let count=0,left=256,top=256,right=-1,bottom=-1;
   for(let y=0;y<256;y++)for(let x=0;x<256;x++){
    const alpha=pixels[(y*256+x)*4+3];
    if(x<11||x>244||y<11||y>244)assert.equal(alpha,0,row.id+' frame '+frame+' clear margin');
    assert(alpha===0||alpha>8,row.id+' low alpha noise');
    if(alpha){count++;left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);}
   }
   assert(count>=100&&count<3000,row.id+' accessory-only occupied pixel count '+count);
   assert(right-left+1<=80&&bottom-top+1<=80,row.id+' must not contain a body');
  }
 }
});

test('original 103 body entries and every original asset retain their exact bytes',()=>{
 assert.deepEqual(read(path.join(art,'manifest.json')).cows.slice(0,103),base.manifest.cows);
 for(const [file,digest] of Object.entries(base.originalFiles))assert.equal(hash(fs.readFileSync(path.join(art,file))),digest,file);
});

test('reviews prove original body pixels are unchanged outside each accessory alpha mask',async()=>{
 assert(fs.existsSync(manifestPath),'Accessory manifest is missing');
 const rows=read(manifestPath),report=read(path.join(work,'accessory-report.json'));assert.equal(report.assets.length,6);
 for(const row of rows){
  const detail=report.assets.find(x=>x.kind===row.kind),body=base.manifest.cows[row.kind];
  assert.equal(detail.body.src,body.src);assert.equal(detail.body.walk,body.walk);
  assert.deepEqual(detail.placement.referenceAnchor,read(path.join(work,'work.json')).accessories.find(x=>x.kind===row.kind).trackAnchor);
  assert.equal(detail.tracking.length,12);assert.equal(detail.bodyPixelProof.static.changedOutsideAccessory,0);
  assert(detail.bodyPixelProof.frames.every(x=>x.changedOutsideAccessory===0));
  assert(detail.tracking.every(x=>x.method==='fixed-head-template-translation'&&Number.isFinite(x.matchError)));
  assert(detail.tracking.every(x=>x.translation.every(Number.isInteger)));
  const staticBody=await sharp(path.join(art,body.src)).raw().toBuffer();
  const staticLayer=await sharp(path.join(art,row.src)).raw().toBuffer();
  const staticReview=await sharp(path.join(work,detail.review.staticTransparent)).raw().toBuffer();
  assert.deepEqual(await sharp(path.join(art,row.preview)).raw().toBuffer(),staticReview,row.id+' gallery preview');
  for(let i=0;i<256*256;i++)if(!staticLayer[i*4+3])assert.deepEqual(staticReview.subarray(i*4,i*4+4),staticBody.subarray(i*4,i*4+4),row.id+' original static pixel '+i);
  const oldStrip=await sharp(path.join(art,body.walk)).raw().toBuffer();
  const layerStrip=await sharp(path.join(art,row.walk)).raw().toBuffer();
  const composedStrip=await sharp(path.join(work,detail.review.walkTransparent)).raw().toBuffer();
  const frameHashes=[];
  for(let frame=0;frame<12;frame++){
   const pixels=Buffer.alloc(256*256*4);
   for(let y=0;y<256;y++)oldStrip.copy(pixels,y*256*4,(y*3072+frame*256)*4,(y*3072+(frame+1)*256)*4);
   frameHashes.push(hash(pixels));
  }
  assert.deepEqual(detail.bodyFrameHashes,frameHashes,row.id+' report identifies original body frames');
  for(let i=0;i<3072*256;i++)if(!layerStrip[i*4+3])assert.deepEqual(composedStrip.subarray(i*4,i*4+4),oldStrip.subarray(i*4,i*4+4),row.id+' original walk pixel '+i);
  const contact=await sharp(path.join(work,detail.review.contact)).metadata();assert.deepEqual([contact.width,contact.height],[1024,768]);
  const gif=await sharp(path.join(work,detail.review.gif),{animated:true}).metadata();assert.equal(gif.pages,12);assert.equal(gif.loop,0);
  assert(detail.tracking.every(t=>t.bodyCentroidTranslation.every(Number.isFinite)),row.id+' head versus whole-body centroid audit');
  if([72,74,79].includes(row.kind))assert.notDeepEqual(staticLayer,await sharp(path.join(art,row.walk)).extract({left:0,top:0,width:256,height:256}).raw().toBuffer(),row.id+' static placement must use original poster independently');
 }
 const moving=report.assets.filter(x=>x.tracking.some(t=>t.translation[0]||t.translation[1]));assert(moving.length>=2,'Moving old heads must receive nonconstant overlay offsets');
});

test('asset preparation refuses duplicate, unapproved, malformed and changed original plans before writing',async()=>{
 assert(fs.existsSync(programPath),'Accessory preparation program is missing');
 const {validatePlan,validateInput}=require(programPath),plan=read(path.join(work,'work.json')),current=read(path.join(art,'manifest.json'));
 assert.doesNotThrow(()=>validatePlan(plan,base,current));
 assert.throws(()=>validatePlan({...plan,approved:false},base,current),/approved/i);
 assert.throws(()=>validatePlan({...plan,accessories:[...plan.accessories,plan.accessories[0]]},base,current),/duplicate/i);
 assert.throws(()=>validatePlan({...plan,accessories:plan.accessories.map((r,i)=>i? r:{...r,kind:73})},base,current),/approved kind/i);
 assert.throws(()=>validatePlan({...plan,accessories:plan.accessories.map((r,i)=>i? r:{...r,width:0})},base,current),/width/i);
 assert.throws(()=>validatePlan({...plan,accessories:plan.accessories.map((r,i)=>i? r:{...r,center:[NaN,54]})},base,current),/center/i);
 const mutated=structuredClone(current);mutated.cows[72].name='changed';assert.throws(()=>validatePlan(plan,base,mutated),/original body/i);
 await assert.rejects(validateInput({...plan.accessories[0],input:path.join(work,'missing-component.png')}),/input/i);
 await assert.rejects(validateInput({...plan.accessories[0],input:path.join(work,'work.json')}),/input/i);
});

test('repeating accessory preparation preserves generated bytes and the original manifest',()=>{
 assert(fs.existsSync(manifestPath),'Accessory manifest is missing');
 const rows=read(manifestPath),report=read(path.join(work,'accessory-report.json'));
 const files=[manifestPath,path.join(work,'accessory-report.json'),path.join(work,'accessory-contact.png'),path.join(work,'accessory-contact-dark.png'),path.join(art,'manifest.json')];
 for(const row of rows)for(const key of ['src','walk','preview'])files.push(path.join(art,row[key]));
 for(const detail of report.assets)for(const file of Object.values(detail.review))files.push(path.join(work,file));
 const before=new Map(files.map(file=>[file,hash(fs.readFileSync(file))]));
 const result=spawnSync(process.execPath,[programPath],{cwd:root,encoding:'utf8'});assert.equal(result.status,0,result.stderr);
 for(const [file,digest] of before)assert.equal(hash(fs.readFileSync(file)),digest,file+' is idempotent');
});
