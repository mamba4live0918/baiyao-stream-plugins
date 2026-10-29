(function(root,factory){
 const api=factory(root);
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.PetWalkFrames=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(root){
 'use strict';
 // Chromium's decoded-image cache holds only part of the walk strips (all of them decode to ~411 MB), so with many
 // kinds on screen each frame change re-decodes a whole 3–7.5 MB strip and hundreds of walking pets saturate the
 // raster threads. Each strip is split once into per-frame images sized to how pets are drawn, so a frame change
 // needs at most one small decode. Frames are published as stylesheet classes: one shared image per frame, and a
 // class swap is cheaper than re-parsing url() values. Until a strip is ready, or if this browser cannot split it
 // in a worker, callers keep the original strip path. Splitting never runs on the page thread: there PNG encoding
 // only proceeds in idle time, which a busy scene does not have.
 const MAX_FRAMES=64,JOB_TIMEOUT_MS=30000,WARM_MS=120,ATTEMPTS=2;

 // size>0 shrinks frames to the pixels pets are shown at (never enlarges): smaller decodes keep more frames cached.
 async function splitStrip(source,frames,makeCanvas,size=0){
  const blob=typeof source==='string'?await(await fetch(source)).blob():source;
  const sheet=await createImageBitmap(blob);
  try{
   const width=Math.round(sheet.width/frames),height=sheet.height;
   if(!(width>0&&height>0))throw Error('empty strip');
   const scale=size>0?Math.min(1,size/Math.max(width,height)):1,w=Math.max(1,Math.round(width*scale)),h=Math.max(1,Math.round(height*scale));
   const canvas=makeCanvas(w,h),ctx=canvas.getContext('2d',{willReadFrequently:true}),blobs=[];
   if(!ctx)throw Error('no 2d context');
   ctx.imageSmoothingQuality='high';
   for(let i=0;i<frames;i++){
    ctx.clearRect(0,0,w,h);ctx.drawImage(sheet,i*width,0,width,height,0,0,w,h);
    blobs.push(await(typeof canvas.convertToBlob==='function'?canvas.convertToBlob({type:'image/png'}):new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('encode failed')),'image/png'))));
   }
   return blobs;
  }finally{sheet.close?.();}
 }

 // Bitmaps for the canvas renderer (pet-canvas.js): a strip's frames, or one still image, in a grid of cells. Each
 // cell is the pet box (stretched like background-size:100% 100%, or object-fit:contain for stills) with room around
 // it for the CSS drop-shadow, baked in at the scale pets are drawn (opts.ref CSS px for the box).
 async function bakeAtlas(source,frames,makeCanvas,opts){
  const blob=typeof source==='string'?await(await fetch(source)).blob():source;
  const sheet=await createImageBitmap(blob);
  try{
   const width=Math.round(sheet.width/frames),height=sheet.height,contain=opts.fit==='contain',size=opts.size>0?opts.size:0;
   if(!(width>0&&height>0))throw Error('empty strip');
   let w,h;
   if(contain){w=h=Math.max(1,Math.round(Math.min(size||Infinity,Math.max(width,height))));}
   else{const scale=size?Math.min(1,size/Math.max(width,height)):1;w=Math.max(1,Math.round(width*scale));h=Math.max(1,Math.round(height*scale));}
   const ref=opts.ref>0?opts.ref:Math.max(w,h),kx=w/ref,ky=h/ref,k=Math.sqrt(kx*ky),shadow=opts.shadow||null,pad=shadow&&opts.pad||{x:0,t:0,b:0};
   const px=Math.ceil(pad.x*kx),pt=Math.ceil(pad.t*ky),pb=Math.ceil(pad.b*ky),cw=w+2*px,ch=h+pt+pb,cols=Math.ceil(Math.sqrt(frames)),rows=Math.ceil(frames/cols);
   const atlas=makeCanvas(cols*cw,rows*ch),ctx=atlas.getContext('2d'),cell=makeCanvas(w,h),cx=cell.getContext('2d');
   if(!ctx||!cx)throw Error('no 2d context');
   cx.imageSmoothingQuality='high';
   if(shadow){
    const css='drop-shadow('+shadow.dx*kx+'px '+shadow.dy*ky+'px '+shadow.blur*k+'px '+shadow.color+')';
    if('filter' in ctx)ctx.filter=css;
    // Canvas shadowBlur is twice the Gaussian deviation; CSS drop-shadow's blur value is the deviation itself.
    if(!ctx.filter||ctx.filter==='none'){ctx.shadowColor=shadow.color;ctx.shadowOffsetX=shadow.dx*kx;ctx.shadowOffsetY=shadow.dy*ky;ctx.shadowBlur=shadow.blur*k*2;}
   }
   const fit=contain?Math.min(w/width,h/height):1,dw=contain?width*fit:w,dh=contain?height*fit:h,dx=(w-dw)/2,dy=(h-dh)/2;
   for(let i=0;i<frames;i++){cx.clearRect(0,0,w,h);cx.drawImage(sheet,i*width,0,width,height,dx,dy,dw,dh);ctx.drawImage(cell,(i%cols)*cw+px,Math.floor(i/cols)*ch+pt);}
   const bitmap=typeof atlas.transferToImageBitmap==='function'?atlas.transferToImageBitmap():await createImageBitmap(atlas);
   return{bitmap,frames,cols,cw,ch,w,h,px,pt};
  }finally{sheet.close?.();}
 }

 const WORKER_SOURCE='const splitStrip='+splitStrip.toString()+';const bakeAtlas='+bakeAtlas.toString()+';self.onmessage=async e=>{const{id,source,frames,size,bake}=e.data||{};const make=(w,h)=>new OffscreenCanvas(w,h);try{if(bake){const atlas=await bakeAtlas(source,frames,make,bake);self.postMessage({id,atlas},[atlas.bitmap]);}else self.postMessage({id,blobs:await splitStrip(source,frames,make,size)});}catch(error){self.postMessage({id,error:String(error&&error.message||error)});}};';

 // Frame classes swap with add/remove so other classes on the element are untouched.
 function setFrameClass(el,cls){
  const prev=el._petFrameClass||null;
  if(prev===cls&&(!cls||el.classList.contains(cls)))return;
  if(prev)el.classList.remove(prev);
  if(cls)el.classList.add(cls);
  el._petFrameClass=cls||null;
 }

 class Provider{
  // wanted(key): whether any pet still asks for a queued split; stale requests (e.g. an old size) are dropped.
  constructor({onReady=()=>{},wanted=null,env=root,workers}={}){
   this.env=env;this.onReady=onReady;this.wanted=wanted;
   this.entries=new Map();this.queue=[];this.slots=[];this.workerBroken=false;this.nextId=0;this.styleHost=null;
   const cores=Number(env.navigator?.hardwareConcurrency)||4;
   this.maxWorkers=Number.isInteger(workers)&&workers>0?workers:Math.max(1,Math.min(3,Math.floor(cores/4)));
   this.enabled=typeof env.Worker==='function'&&typeof env.OffscreenCanvas==='function'&&typeof env.createImageBitmap==='function'&&typeof env.Blob==='function'&&typeof env.URL?.createObjectURL==='function'&&typeof env.document?.createElement==='function'&&!!env.document.head;
  }
  // Returns {frames,classes} once the strip is split; otherwise schedules it and returns null.
  // key is a short id that differs per (strip,frames,size); source is the strip Blob or data: URL.
  get(key,frames,source,size=0){
   if(!this.enabled||this.workerBroken&&!this.slots.length||typeof key!=='string'||!key||!Number.isInteger(frames)||frames<2||frames>MAX_FRAMES)return null;
   const entry=this.entries.get(key);
   if(!entry){if(source)this.enqueue(key,frames,source,size);return null;}
   return!entry.bake&&entry.frames===frames&&entry.state==='ready'?entry:null;
  }
  enqueue(key,frames,source,size=0){const entry={key,frames,source,size:size>0?size:0,state:'queued',attempts:0};this.entries.set(key,entry);this.queue.push(entry);this.pump();return entry;}
  // Canvas bitmaps (see bakeAtlas): opts {frames=1,size,fit,ref,shadow,pad}. Returns the entry, whose atlas the canvas
  // renderer draws, once baked; otherwise schedules it and returns null. These jobs go ahead of the stylesheet splits:
  // they are quick, and every pet on the canvas leaves the DOM work behind.
  bitmap(key,source,opts){
   if(!this.enabled||this.workerBroken&&!this.slots.length||typeof key!=='string'||!key||!opts)return null;
   const frames=opts.frames??1;if(!Number.isInteger(frames)||frames<1||frames>MAX_FRAMES)return null;
   const entry=this.entries.get(key);
   if(!entry){
    if(!source)return null;
    const job={key,frames,source,size:opts.size>0?opts.size:0,bake:{...opts,frames},state:'queued',attempts:0},at=this.queue.findIndex(e=>!e.bake);
    this.entries.set(key,job);this.queue.splice(at<0?this.queue.length:at,0,job);this.pump();return null;
   }
   return entry.bake&&entry.state==='ready'&&entry.atlas?entry:null;
  }
  // Forgets matching entries in any state (e.g. bitmaps lost with the GPU context); in-flight results are discarded.
  drop(match){
   let dropped=0;
   for(const [key,entry] of this.entries){let hit=false;try{hit=match(key,entry)===true;}catch{}if(!hit)continue;this.release(entry);this.entries.delete(key);dropped++;}
   if(dropped)this.queue=this.queue.filter(e=>this.entries.get(e.key)===e);
   return dropped;
  }
  release(entry){entry.style?.remove();for(const u of entry.urls||[])this.env.URL.revokeObjectURL?.(u);try{entry.atlas?.bitmap?.close?.();}catch{}}
  nextJob(){
   while(this.queue.length){
    const entry=this.queue.shift();let keep=true;
    try{keep=!this.wanted||this.wanted(entry.key)!==false;}catch{}
    if(keep)return entry;
    this.entries.delete(entry.key);
   }
   return null;
  }
  idleSlot(){
   const free=this.slots.find(s=>!s.job);if(free)return free;
   if(!this.workerBroken&&this.slots.length<this.maxWorkers){const slot=this.spawn();if(slot){this.slots.push(slot);return slot;}}
   return null;
  }
  pump(){
   if(!this.enabled)return;
   for(;;){
    // Take a job before a slot so workers are only started when there is something to split.
    if(!this.slots.some(s=>!s.job)&&(this.workerBroken||this.slots.length>=this.maxWorkers))return;
    const entry=this.nextJob();if(!entry)return;
    const slot=this.idleSlot();if(!slot){this.queue.unshift(entry);return;}
    slot.job=entry;entry.state='working';entry.attempts++;
    // The slot frees as soon as its split returns; publishing overlaps with the next split.
    const release=()=>{if(slot.job===entry)slot.job=null;};
    this.run(slot,entry).then(data=>{if(data?.atlas)slot.baked=true;release();this.pump();return this.publish(entry,data);}).then(()=>{entry.source=null;},()=>{release();this.fail(entry);this.pump();});
   }
  }
  // One retry covers a transient worker stall; a strip that fails twice keeps its original path.
  fail(entry){
   if(this.entries.get(entry.key)!==entry)return;
   if(entry.attempts<ATTEMPTS&&!this.workerBroken){entry.state='queued';this.queue.push(entry);return;}
   entry.state='failed';entry.source=null;
  }
  spawn(){
   const env=this.env;
   try{
    const url=env.URL.createObjectURL(new env.Blob([WORKER_SOURCE],{type:'text/javascript'}));
    let worker;try{worker=new env.Worker(url);}finally{env.URL.revokeObjectURL?.(url);}
    const slot={worker,job:null,pending:null};
    worker.onmessage=e=>{const p=slot.pending;if(!p||e.data?.id!==p.id)return;slot.pending=null;if(e.data.error)p.reject(Error(e.data.error));else p.resolve(e.data);};
    // A worker the host refuses to start stops all splitting; pets keep their strips.
    worker.onerror=()=>{const p=slot.pending;slot.pending=null;this.retire(slot,true);p?.reject(Error('worker failed'));};
    return slot;
   }catch{this.workerBroken=true;return null;}
  }
  // A GPU ImageBitmap baked in a worker draws as nothing once that worker is terminated, so a worker that has baked
  // bitmaps is only set aside (no more jobs) and kept alive until dispose().
  retire(slot,broken=false){
   this.slots=this.slots.filter(s=>s!==slot);if(broken)this.workerBroken=true;
   if(slot.baked){(this.kept??=[]).push(slot);return;}
   try{slot.worker?.terminate();}catch{}
  }
  run(slot,entry){
   return new Promise((resolve,reject)=>{
    const env=this.env,id=++this.nextId;let timer=0;
    const settle=fn=>value=>{env.clearTimeout?.(timer);fn(value);};
    slot.pending={id,resolve:settle(resolve),reject:settle(reject)};
    timer=env.setTimeout?.(()=>{if(slot.pending?.id!==id)return;const p=slot.pending;slot.pending=null;this.retire(slot);p.reject(Error('split timeout'));},JOB_TIMEOUT_MS);
    try{slot.worker.postMessage({id,source:entry.source,frames:entry.frames,size:entry.size,...(entry.bake?{bake:entry.bake}:{})});}catch(error){const p=slot.pending;slot.pending=null;p.reject(error);}
   });
  }
  frames(n=2){return new Promise(resolve=>{const env=this.env;if(typeof env.requestAnimationFrame!=='function'){env.setTimeout(resolve,32*n);return;}const step=()=>--n<=0?resolve():env.requestAnimationFrame(step);env.requestAnimationFrame(step);});}
  async publish(entry,data){
   if(entry.bake){
    const atlas=data?.atlas;
    if(!atlas?.bitmap||atlas.frames!==entry.frames)throw Error('bitmap mismatch');
    if(this.entries.get(entry.key)!==entry){try{atlas.bitmap.close?.();}catch{}return;}
    atlas.key=entry.key;Object.assign(entry,{state:'ready',atlas});
    try{this.onReady(entry.key);}catch{}
    return;
   }
   const blobs=Array.isArray(data)?data:data?.blobs;
   if(!Array.isArray(blobs)||blobs.length!==entry.frames)throw Error('frame count mismatch');
   const env=this.env,doc=env.document,id=++this.nextId,urls=blobs.map(b=>env.URL.createObjectURL(b)),classes=urls.map((u,i)=>'pwf'+id+'-'+i);
   let style=null,probes=[];
   try{
    style=doc.createElement('style');style.textContent=classes.map((c,i)=>'.'+c+'{background-image:url("'+urls[i]+'")}').join('');doc.head.append(style);
    // Probes make each rule fetch its image before any pet switches to it, so the first use never shows a gap.
    this.styleHost??=Object.assign(doc.createElement('div'),{className:'pet-walk-frame-probes'});
    if(!this.styleHost.isConnected){this.styleHost.setAttribute('aria-hidden','true');Object.assign(this.styleHost.style,{position:'fixed',left:'0',top:'0',width:'1px',height:'1px',overflow:'hidden',opacity:'0',pointerEvents:'none',zIndex:'-1'});doc.body.append(this.styleHost);}
    probes=classes.map(c=>{const p=doc.createElement('span');p.className=c;Object.assign(p.style,{position:'absolute',left:'0',top:'0',width:'1px',height:'1px',backgroundSize:'100% 100%'});return p;});
    this.styleHost.append(...probes);
    await Promise.all([this.frames(3),new Promise(r=>env.setTimeout(r,WARM_MS))]);
   }catch(error){style?.remove();for(const u of urls)env.URL.revokeObjectURL?.(u);throw error;}
   finally{for(const p of probes)p.remove();}
   if(this.entries.get(entry.key)!==entry){style.remove();for(const u of urls)env.URL.revokeObjectURL?.(u);return;}
   Object.assign(entry,{state:'ready',classes,urls,style});
   try{this.onReady(entry.key);}catch{}
  }
  // Frees ready or failed strips no pet uses any more (old sizes, removed uploads); they split again if needed.
  prune(isUsed){
   let freed=0;
   for(const [key,entry] of this.entries){
    if(entry.state!=='ready'&&entry.state!=='failed')continue;
    let used=true;try{used=isUsed(key)!==false;}catch{}
    if(used)continue;
    this.release(entry);
    this.entries.delete(key);freed++;
   }
   return freed;
  }
  status(){let ready=0,failed=0,waiting=0,bitmaps=0;for(const e of this.entries.values()){if(e.state==='ready'){ready++;if(e.bake)bitmaps++;}else if(e.state==='failed')failed++;else waiting++;}return{enabled:this.enabled&&!this.workerBroken,ready,failed,waiting,bitmaps,workers:this.slots.length};}
  dispose(){this.queue=[];for(const s of this.slots.concat(this.kept||[]))try{s.worker?.terminate();}catch{}this.slots=[];this.kept=[];for(const e of this.entries.values())this.release(e);this.entries.clear();this.styleHost?.remove();}
 }

 return{Provider,splitStrip,bakeAtlas,setFrameClass,MAX_FRAMES};
});
