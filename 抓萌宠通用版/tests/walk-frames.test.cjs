const test=require('node:test'),assert=require('node:assert/strict');
const Frames=require('../src/walk-frames.js');

function element(tag){
 const classes=new Set();
 return{tagName:tag.toUpperCase(),style:{},children:[],isConnected:false,attributes:{},className:'',
  classList:{add:c=>classes.add(c),remove:c=>classes.delete(c),contains:c=>classes.has(c),get size(){return classes.size;},values:()=>[...classes]},
  setAttribute(k,v){this.attributes[k]=String(v);},append(...nodes){for(const n of nodes){n.parentNode=this;n.isConnected=this.isConnected;this.children.push(n);}},
  remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(n=>n!==this);this.isConnected=false;}};
}
function env({cores=8,withWorker=true,throwOnWorker=false}={}){
 const workers=[],timers=[],frames=[];let urls=0;
 const document={createElement:element,head:element('head'),body:element('body')};document.head.isConnected=document.body.isConnected=true;
 class FakeWorker{constructor(url){if(throwOnWorker)throw Error('blocked');this.url=url;this.messages=[];workers.push(this);}postMessage(m){this.messages.push(m);}terminate(){this.terminated=true;}}
 const e={document,navigator:{hardwareConcurrency:cores},OffscreenCanvas:class{},createImageBitmap(){},Blob:class{constructor(parts,opts){this.parts=parts;this.type=opts?.type;}},
  URL:{createObjectURL:()=>'blob:fake/'+(++urls),revokeObjectURL(){}},setTimeout:(fn,ms)=>{timers.push({fn,ms});return timers.length;},clearTimeout(){},requestAnimationFrame:fn=>{frames.push(fn);return frames.length;}};
 if(withWorker)e.Worker=FakeWorker;
 return{env:e,workers,timers,frames,document};
}
const tick=()=>new Promise(r=>setImmediate(r));
// Answers a worker job, then runs the warm-up frames/timer so publish finishes.
async function answer(t,worker,count){
 const job=worker.messages.shift();worker.onmessage({data:{id:job.id,blobs:Array.from({length:count??job.frames},(_,i)=>({frame:i}))}});
 for(let i=0;i<6;i++){await tick();while(t.frames.length)t.frames.shift()(0);for(const timer of t.timers.splice(0))if(timer.ms<1000)timer.fn();}
 return job;
}

test('setFrameClass swaps only its own class and leaves the element\'s other classes alone',()=>{
 const el=element('span');el.classList.add('walk-sprite');
 Frames.setFrameClass(el,'pwf1-0');Frames.setFrameClass(el,'pwf1-1');
 assert.deepEqual(el.classList.values(),['walk-sprite','pwf1-1']);
 Frames.setFrameClass(el,null);assert.deepEqual(el.classList.values(),['walk-sprite']);assert.equal(el._petFrameClass,null);
});

test('without workers or OffscreenCanvas the provider stays off and callers keep their strips',()=>{
 for(const t of [env({withWorker:false}),(()=>{const t=env();delete t.env.OffscreenCanvas;return t;})()]){
  const p=new Frames.Provider({env:t.env});
  assert.equal(p.enabled,false);assert.equal(p.get('strip#0',12,'strip'),null);assert.equal(p.entries.size,0);assert.equal(t.workers.length,0);
 }
});

test('a split strip becomes shared stylesheet classes, warmed by probes before onReady',async()=>{
 const t=env(),ready=[],p=new Frames.Provider({env:t.env,onReady:key=>ready.push(key)});
 assert.equal(p.get('blob:strip#176',12,{blob:true},176),null);
 assert.equal(t.workers.length,1);const job=t.workers[0].messages[0];
 assert.deepEqual({frames:job.frames,size:job.size,source:job.source},{frames:12,size:176,source:{blob:true}});
 assert.equal(p.get('blob:strip#176',12),null,'still splitting');
 await answer(t,t.workers[0]);
 assert.deepEqual(ready,['blob:strip#176']);
 const entry=p.get('blob:strip#176',12);
 assert.equal(entry.classes.length,12);assert.equal(new Set(entry.classes).size,12);
 const style=t.document.head.children.find(n=>n.tagName==='STYLE');
 for(const [i,cls] of entry.classes.entries())assert(style.textContent.includes('.'+cls+'{background-image:url("'+entry.urls[i]+'")}'));
 const host=t.document.body.children[0];assert.equal(host.children.length,0,'probes are removed after warming');
 assert.equal(p.get('blob:strip#176',30),null,'a different frame count never reuses the entry');
});

test('queued splits nobody wants any more are dropped, and a key without a source is never queued',async()=>{
 const t=env({cores:4}),wanted=new Set(['a#176','c#176']),p=new Frames.Provider({env:t.env,wanted:key=>wanted.has(key)});
 assert.equal(p.maxWorkers,1);
 assert.equal(p.get('x#0',12),null);assert.equal(p.entries.size,0);
 for(const k of ['a','b','c'])p.get(k+'#176',12,k,176);
 assert.equal(t.workers[0].messages[0].source,'a');
 await answer(t,t.workers[0]);
 assert.equal(t.workers[0].messages[0].source,'c','b was dropped because no pet asks for it');
 assert.equal(p.entries.has('b#176'),false,'a dropped key can be requested again later');
});

test('prune frees strips no pet uses and keeps the ones on stage',async()=>{
 const t=env({cores:4}),revoked=[];t.env.URL.revokeObjectURL=u=>revoked.push(u);
 const p=new Frames.Provider({env:t.env});
 p.get('old#176',12,'o',176);await answer(t,t.workers[0]);p.get('new#192',12,'n',192);await answer(t,t.workers[0]);
 const old=p.get('old#176',12),styles=()=>t.document.head.children.filter(n=>n.tagName==='STYLE').length;
 assert.equal(styles(),2);
 assert.equal(p.prune(key=>key==='new#192'),1);
 assert.equal(p.entries.has('old#176'),false);assert.equal(styles(),1);
 assert(old.urls.every(u=>revoked.includes(u)),'the pruned frames are revoked');
 const kept=p.get('new#192',12);assert(kept);assert(kept.urls.every(u=>!revoked.includes(u)),'frames still on stage stay valid');
});

test('up to three workers split strips in parallel',()=>{
 const t=env({cores:24}),p=new Frames.Provider({env:t.env});
 for(const k of ['a','b','c','d'])p.get(k+'#0',12,k);
 assert.equal(t.workers.length,3);assert.deepEqual(t.workers.map(w=>w.messages.length),[1,1,1]);
 assert.equal(p.queue.length,1);
});

test('a worker the host blocks or that crashes disables splitting without throwing',async()=>{
 const blocked=env({throwOnWorker:true}),p=new Frames.Provider({env:blocked.env});
 assert.equal(p.get('a#0',12,'a'),null);assert.equal(p.status().enabled,false);
 const t=env({cores:4}),q=new Frames.Provider({env:t.env});q.get('a#0',12,'a');t.workers[0].onerror();await tick();await tick();
 assert.equal(q.entries.get('a#0').state,'failed','no retry once workers are known to be blocked');assert.equal(t.workers[0].terminated,true);
 assert.equal(q.get('b#0',12,'b'),null);assert.equal(t.workers.length,1,'no new worker after a crash');
});

test('a failed split is retried once, then only that strip keeps its original path',async()=>{
 const t=env({cores:4}),p=new Frames.Provider({env:t.env});
 p.get('a#0',12,'a');await answer(t,t.workers[0],11);
 assert.equal(p.entries.get('a#0').state,'working','the first failure is retried');assert.equal(t.workers[0].messages[0].source,'a');
 await answer(t,t.workers[0],11);assert.equal(p.entries.get('a#0').state,'failed');assert.equal(p.entries.get('a#0').source,null);
 assert.equal(p.get('a#0',12,'a'),null);assert.equal(t.workers[0].messages.length,0,'a failed strip is not split again');
});

test('a timed-out split frees its worker slot, retries on a fresh worker and can still succeed',async()=>{
 const t=env({cores:4}),ready=[],p=new Frames.Provider({env:t.env,onReady:k=>ready.push(k)});
 p.get('b#0',12,'b');t.timers.find(x=>x.ms>=1000).fn();await tick();await tick();
 assert.equal(t.workers[0].terminated,true);assert.equal(t.workers.length,2,'a fresh worker replaces the stuck one');
 await answer(t,t.workers[1]);assert.deepEqual(ready,['b#0']);assert(p.get('b#0',12));
});

test('the worker source embeds the same splitStrip that is exported',()=>{
 const p=new Frames.Provider({env:env().env});p.get('a#0',12,'a');
 assert.match(String(Frames.splitStrip),/convertToBlob/);
});
