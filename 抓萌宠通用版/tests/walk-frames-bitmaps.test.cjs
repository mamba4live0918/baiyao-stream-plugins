const test=require('node:test'),assert=require('node:assert/strict');
const Frames=require('../src/walk-frames.js');

function element(tag){
 const classes=new Set();
 return{tagName:tag.toUpperCase(),style:{},children:[],isConnected:false,attributes:{},className:'',
  classList:{add:c=>classes.add(c),remove:c=>classes.delete(c),contains:c=>classes.has(c)},
  setAttribute(k,v){this.attributes[k]=String(v);},append(...nodes){for(const n of nodes){n.parentNode=this;n.isConnected=this.isConnected;this.children.push(n);}},
  remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(n=>n!==this);this.isConnected=false;}};
}
function env({cores=8}={}){
 const workers=[],timers=[],frames=[];let urls=0;
 const document={createElement:element,head:element('head'),body:element('body')};document.head.isConnected=document.body.isConnected=true;
 class FakeWorker{constructor(url){this.url=url;this.messages=[];workers.push(this);}postMessage(m){this.messages.push(m);}terminate(){this.terminated=true;}}
 return{workers,timers,frames,document,env:{document,Worker:FakeWorker,navigator:{hardwareConcurrency:cores},OffscreenCanvas:class{},createImageBitmap(){},Blob:class{constructor(p,o){this.parts=p;this.type=o?.type;}},
  URL:{createObjectURL:()=>'blob:fake/'+(++urls),revokeObjectURL(){}},setTimeout:(fn,ms)=>{timers.push({fn,ms});return timers.length;},clearTimeout(){},requestAnimationFrame:fn=>{frames.push(fn);return frames.length;}}};
}
const tick=()=>new Promise(r=>setImmediate(r));
const bitmap=()=>({closed:false,close(){this.closed=true;}});
async function settle(t){for(let i=0;i<6;i++){await tick();while(t.frames.length)t.frames.shift()(0);for(const timer of t.timers.splice(0))if(timer.ms<1000)timer.fn();}}
async function answer(t,worker,data){const job=worker.messages.shift();worker.onmessage({data:{id:job.id,...data(job)}});await settle(t);return job;}
const atlasFor=job=>({atlas:{bitmap:bitmap(),frames:job.frames,cols:4,cw:118,ch:125,w:96,h:96,px:11,pt:11}});
const opts={size:96,ref:88,shadow:{dx:0,dy:5,blur:3,color:'#9d789530'},pad:{x:10,t:10,b:16}};

test('without workers the bitmap provider is off, so the canvas layer is never used',()=>{
 const t=env();delete t.env.Worker;const p=new Frames.Provider({env:t.env});
 assert.equal(p.bitmap('Cb0@12#96','strip',{...opts,frames:12}),null);assert.equal(p.entries.size,0);
});

test('bitmap bakes go ahead of stylesheet splits, carry their options and publish the atlas',async()=>{
 const t=env({cores:4}),ready=[],p=new Frames.Provider({env:t.env,onReady:k=>ready.push(k)});
 p.get('b0@12#96',12,'strip-a',96);p.get('b1@12#96',12,'strip-b',96);
 assert.equal(p.bitmap('Cb0@12#96','strip-a',{...opts,frames:12}),null);
 assert.equal(p.bitmap('S1#96','still',{...opts,fit:'contain'}),null);
 assert.deepEqual(p.queue.map(e=>e.key),['Cb0@12#96','S1#96','b1@12#96'],'the first split already runs; bakes jump the rest of the queue');
 await answer(t,t.workers[0],job=>({blobs:Array.from({length:job.frames},(_,i)=>({i}))}));
 const job=t.workers[0].messages[0];
 assert.equal(job.source,'strip-a');assert.deepEqual(job.bake,{...opts,frames:12});
 await answer(t,t.workers[0],atlasFor);
 assert(ready.includes('Cb0@12#96'));
 const entry=p.bitmap('Cb0@12#96',null,{frames:12});assert.equal(entry.atlas.key,'Cb0@12#96');assert.equal(entry.atlas.cols,4);
 assert.equal(p.get('Cb0@12#96',12),null,'stylesheet lookups never return a bitmap entry');
 assert.equal(p.bitmap('Cb0@12#96',null,{frames:30}),entry,'a ready bitmap is found by key');
 assert.equal(p.status().bitmaps,1);
});

// Chromium: a GPU ImageBitmap from a worker's OffscreenCanvas draws as nothing once that worker is terminated.
test('workers that baked bitmaps stay alive and go on to the next job',async()=>{
 const t=env({cores:4}),p=new Frames.Provider({env:t.env});
 p.bitmap('Cb0@12#96','strip-a',{...opts,frames:12});p.get('b0@12#96',12,'strip-a',96);
 const baker=t.workers[0];assert(baker.messages[0].bake);
 await answer(t,baker,atlasFor);
 assert.equal(baker.terminated,undefined);assert.equal(t.workers.length,1);
 assert.equal(baker.messages[0].source,'strip-a');assert.equal(baker.messages[0].bake,undefined,'then the stylesheet split');
});

test('a stalled worker that baked bitmaps is set aside but kept alive, so its bitmaps stay drawable',async()=>{
 const t=env({cores:4}),p=new Frames.Provider({env:t.env});
 p.bitmap('Ca@12#96','a',{...opts,frames:12});const baker=t.workers[0];await answer(t,baker,atlasFor);
 p.get('b@12#96',12,'b',96);assert.equal(baker.messages[0].source,'b');
 t.timers.find(x=>x.ms>=1000).fn();await tick();await tick();
 assert.equal(baker.terminated,undefined,'not terminated');assert(!p.slots.some(s=>s.worker===baker),'no more jobs for it');assert(p.kept.some(s=>s.worker===baker));
 assert.equal(t.workers.length,2,'a fresh worker takes the retry');
 assert(p.bitmap('Ca@12#96',null,{frames:12}),'its bitmap is still published');
 p.dispose();assert.equal(baker.terminated,true,'released only when the provider is disposed');
});

test('dropping bitmaps closes them, forgets queued ones and discards a result that arrives afterwards',async()=>{
 const t=env({cores:4}),ready=[],p=new Frames.Provider({env:t.env,onReady:k=>ready.push(k)});
 p.bitmap('Ca@12#96','a',{...opts,frames:12});p.bitmap('Cb@12#96','b',{...opts,frames:12});p.get('a@12#96',12,'a',96);
 await answer(t,t.workers[0],atlasFor);
 const done=p.bitmap('Ca@12#96',null,{frames:12}),inflight=t.workers.at(-1);
 assert.equal(p.drop(key=>/^C/.test(key)),2);
 assert.equal(done.atlas.bitmap.closed,true);assert.equal(p.entries.has('Cb@12#96'),false);assert(p.entries.has('a@12#96'),'stylesheet frames stay');
 const late=bitmap();await answer(t,inflight,job=>({atlas:{bitmap:late,frames:job.frames,cols:4,cw:1,ch:1,w:1,h:1,px:0,pt:0}}));
 assert.equal(late.closed,true);assert(!ready.includes('Cb@12#96'));
});

test('pruning unused bitmaps closes them',async()=>{
 const t=env({cores:4}),p=new Frames.Provider({env:t.env});
 p.bitmap('S1#96','x',opts);await answer(t,t.workers[0],atlasFor);
 const e=p.bitmap('S1#96',null,{frames:1});assert.equal(p.prune(()=>false),1);assert.equal(e.atlas.bitmap.closed,true);
});

test('bakeAtlas lays frames out in cells with room for the CSS drop-shadow baked at the drawn scale',async()=>{
 const ops=[],canvases=[];
 class Canvas{constructor(w,h){this.width=w;this.height=h;const self=this;this.ctx={filter:'none',imageSmoothingQuality:'low',clearRect(){},drawImage(...a){ops.push({canvas:self,filter:this.filter,shadowBlur:this.shadowBlur,args:a});}};canvases.push(this);}getContext(){return this.ctx;}transferToImageBitmap(){return{from:this};}}
 const sheet={width:12*256,height:256,close(){}},saved=globalThis.createImageBitmap;globalThis.createImageBitmap=async()=>sheet;
 try{
  const a=await Frames.bakeAtlas({blob:true},12,(w,h)=>new Canvas(w,h),{size:96,ref:88,shadow:{dx:0,dy:5,blur:3,color:'#9d789530'},pad:{x:10,t:10,b:16}});
  const k=96/88;
  assert.deepEqual([a.w,a.h,a.px,a.pt,a.cols],[96,96,Math.ceil(10*k),Math.ceil(10*k),4]);
  assert.equal(a.cw,96+2*a.px);assert.equal(a.ch,96+a.pt+Math.ceil(16*k));assert.equal(a.bitmap.from.width,4*a.cw);assert.equal(a.bitmap.from.height,3*a.ch);
  const placed=ops.filter(o=>o.canvas===a.bitmap.from);assert.equal(placed.length,12);
  assert.deepEqual(placed[5].args.slice(1),[1*a.cw+a.px,1*a.ch+a.pt]);
  assert.equal(placed[0].filter,'drop-shadow(0px '+5*k+'px '+3*k+'px #9d789530)');
  const frame=ops.find(o=>o.canvas!==a.bitmap.from&&o.args[1]===5*256);assert.deepEqual(frame.args.slice(1),[1280,0,256,256,0,0,96,96]);
 }finally{globalThis.createImageBitmap=saved;}
 sheet.width=200;sheet.height=100;globalThis.createImageBitmap=async()=>sheet;
 try{
  ops.length=0;
  const s=await Frames.bakeAtlas({blob:true},1,(w,h)=>new Canvas(w,h),{size:96,ref:88,fit:'contain',shadow:null});
  assert.deepEqual([s.w,s.h,s.px,s.pt,s.cw,s.ch],[96,96,0,0,96,96],'no shadow, no pad');
  const fit=ops.find(o=>o.args.length===9);assert.deepEqual(fit.args.slice(5),[0,24,96,48],'object-fit: contain, centred');
  ops.length=0;sheet.width=sheet.height=200;
  // Without canvas filters the same shadow comes from shadowBlur, which is twice the deviation.
  const plain=await Frames.bakeAtlas({blob:true},1,(w,h)=>{const c=new Canvas(w,h);delete c.ctx.filter;return c;},{size:96,ref:96,shadow:{dx:0,dy:5,blur:3,color:'#9d789530'},pad:{x:10,t:10,b:16}});
  const placed=ops.find(o=>o.canvas===plain.bitmap.from);assert.equal(placed.shadowBlur,6);
 }finally{globalThis.createImageBitmap=saved;}
});

test('the worker source embeds the exported bakeAtlas next to splitStrip',()=>{
 const t=env();let source='';t.env.Blob=class{constructor(parts){source=parts.join('');}};
 const p=new Frames.Provider({env:t.env});p.bitmap('S1#96','x',opts);
 assert(source.includes('const bakeAtlas='+Frames.bakeAtlas.toString()));assert(source.includes('const splitStrip='));
});
