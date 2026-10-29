const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {bootstrap}=require('./helpers/app-harness.cjs'),Core=require('../src/core.js'),Frames=require('../src/walk-frames.js'),Accessories=require('../src/accessories.js');

// Stands in for PetWalkFrames.Provider: records requests and serves whatever the test marks ready.
function fakeFrames(){
 const fake={requests:[],ready:new Map(),instance:null};
 // Like the real provider, ask wanted() at request time: a key no pet holds yet would be dropped.
 class Provider{constructor(hooks){Object.assign(this,hooks);fake.instance=this;}get(key,frames,source,size){fake.requests.push({key,frames,size,source,wanted:this.wanted?.(key)});return fake.ready.get(key)||null;}prune(){}}
 fake.publish=(key,frames)=>{const classes=Array.from({length:frames},(_,i)=>'pwf'+key.length+'x'+fake.ready.size+'-'+i);fake.ready.set(key,{frames,classes});fake.instance.onReady(key);return classes;};
 return{fake,globals:{PetWalkFrames:{Provider,setFrameClass:Frames.setFrameClass}}};
}
async function scene(count=3,prefs=null){
 const s=Core.fresh();s.outside=count;s.positions=Array.from({length:count},(_,i)=>({kind:0,x:.3+i*.01,y:.6}));
 const {fake,globals}=fakeFrames(),f=await bootstrap(s,prefs,{globals});
 for(let t=0;t<64;t+=16)f.ctx.frame(t);
 return{f,fake,pets:f.ctx.effectInstance.getCows()};
}
const bucket=size=>Math.max(64,Math.ceil(size/16)*16);

test('pets keep their walk strip until the frames are ready, asking by a short key at their drawn size',async()=>{
 const {fake,pets}=await scene(),p=pets[0],key='b0@12#'+bucket(p.size);
 assert(p.size>0&&p.size<240);assert.equal(p.walkKey,key);
 assert(fake.requests.some(r=>r.key===key&&r.frames===12&&r.size===bucket(p.size)&&r.source===p.walkSrc),'requested '+key);
 assert(fake.requests.every(r=>r.wanted===true),'every request is already held by its pet, so a lone pet of a kind is never dropped');
 assert.equal(p.sprite.style.backgroundImage,'url("'+p.walkSrc+'")');assert.equal(p.sprite.style.backgroundSize,'1200% 100%');
 assert.equal(p.frameClasses,null);
});

test('reduced motion never changes walk frames, so it asks for no split and keeps the strip',async()=>{
 const {fake,pets}=await scene(2,{motion:'off'});
 assert.equal(fake.requests.length,0);for(const p of pets){assert.equal(p.walkKey,null);assert.equal(p.frameClasses,null);}
});

test('when frames are ready every pet of the strip switches to the shared frame classes',async()=>{
 const {f,fake,pets}=await scene(),key=pets[0].walkKey,classes=fake.publish(key,12);
 for(const p of pets){
  assert.equal(p.sprite.style.backgroundImage,'','the inline strip must not override the class image');
  assert.equal(p.sprite.style.backgroundSize,'100% 100%');assert.equal(p.sprite.style.backgroundPosition,'0% 0');
  assert.equal(p.sprite._petFrameClass,classes[p.shownFrame]);assert(p.sprite.classList.contains(classes[p.shownFrame]));
 }
 const p=pets[0];p.hopFrame=7;p.motionStage='walk';p.held=false;p.airborne=false;f.ctx.frame(80);
 assert.equal(p.sprite._petFrameClass,classes[p.shownFrame]);
 assert.equal(classes.filter(c=>p.sprite.classList.contains(c)).length,1,'exactly one frame class at a time');
});

test('a size change requests frames at the new size and keeps the current frames meanwhile',async()=>{
 const {f,fake,pets}=await scene(1),p=pets[0],first=fake.publish(p.walkKey,12),oldKey=p.walkKey;
 const input=f.document.getElementById('size');input.value='50';for(const fn of input.events.input||[])fn({target:input});
 assert.notEqual(p.walkKey,oldKey);assert(fake.requests.some(r=>r.key===p.walkKey&&r.size===bucket(p.size)));
 assert.equal(p.frameClasses,first,'old frames stay while the new size is split');assert.equal(p.sprite.style.backgroundImage,'');
 const second=fake.publish(p.walkKey,12);assert.equal(p.frameClasses,second);assert.equal(p.sprite._petFrameClass,second[p.shownFrame]);
});

test('without PetWalkFrames the app behaves exactly as before (strip and background-position)',async()=>{
 const s=Core.fresh();s.outside=2;s.positions=[{kind:0,x:.3,y:.6},{kind:0,x:.4,y:.6}];
 const f=await bootstrap(s);for(let t=0;t<64;t+=16)f.ctx.frame(t);
 for(const p of f.ctx.effectInstance.getCows()){assert.equal(p.frameClasses,null);assert.equal(p.sprite.style.backgroundSize,'1200% 100%');assert.match(p.sprite.style.backgroundPosition,/% 0$/);}
});

function renderer(){
 const source=fs.readFileSync(path.join(__dirname,'../src/app.js'),'utf8'),context={reduced:()=>false};
 vm.runInNewContext(source.slice(source.indexOf('function sequenceFrame('),source.indexOf('function penRect('))+';globalThis.render=renderCow;',context);
 const node=()=>({style:{},dataset:{},hidden:false,isConnected:true});
 const pet=()=>({el:node(),im:node(),sprite:node(),x:100,y:180,size:85,articulated:true,walkSrc:'strip.png',walkFrames:12,walkMode:'default',motionStage:'walk',hopFrame:4,facing:1,walking:true});
 return{render:context.render,pet};
}

test('under a tick budget a pet whose frame must wait keeps its shown frame and reports it',()=>{
 const {render,pet}=renderer(),a=pet(),b=pet();render(a);render(b);
 a.hopFrame=5;b.hopFrame=6;const gate=render.gate={budget:1,starved:false};render(a);render(b);
 assert.equal(a.shownFrame,5);assert.equal(b.shownFrame,4);assert.equal(gate.starved,true);assert.equal(gate.budget,0);
 assert.equal(b.sprite.style.backgroundPosition,(4/11*100)+'% 0');assert.equal(b.el.dataset.frame,4);
 render.gate=null;render(b);assert.equal(b.shownFrame,6);
 b.held=true;render.gate={budget:0,starved:false};render(b);assert.equal(b.shownFrame,0,'held pets always show their grab frame');assert.equal(render.gate.starved,false);
 const avatar=pet();avatar.walkSrc=null;avatar.walkFrames=1;render.gate=null;render(avatar);avatar.hopFrame=1;
 render.gate={budget:0,starved:false};render(avatar);assert.equal(render.gate.starved,false,'pets without a walk strip never spend or wait for budget');
});

test('accessories follow the body onto per-frame classes and back to static art when standing',()=>{
 const set=new Set(),layer={style:{},hidden:true,classList:{add:c=>set.add(c),remove:c=>set.delete(c),contains:c=>set.has(c)},_petFrameClass:null};
 const c={accessory:layer,accessoryAsset:{src:'prop.png',walk:'prop-walk.png',frames:12},articulated:true,walkMode:'default',walkFrames:12,im:{style:{}}};
 const classes=Array.from({length:12},(_,i)=>'pwf9-'+i),asked=[];
 const framesFor=(strip,frames,pet)=>{asked.push([strip,frames,pet===c]);return classes;};
 Accessories.render(c,{frame:3,standing:false,pose:'scale(1, 1)',framesFor});
 assert.deepEqual(asked,[['prop-walk.png',12,true]]);assert.equal(layer._petFrameClass,'pwf9-3');assert.equal(layer.style.backgroundImage,'');assert.equal(layer.style.backgroundSize,'100% 100%');assert.equal(layer.style.backgroundPosition,'0% 0');
 Accessories.render(c,{frame:3,standing:true,pose:'scale(1, 1)',framesFor});
 assert.equal(layer._petFrameClass,null);assert.equal(layer.style.backgroundImage,'url("prop.png")');
 Accessories.render(c,{frame:5,standing:false,pose:'scale(1, 1)'});
 assert.equal(layer._petFrameClass,null);assert.equal(layer.style.backgroundImage,'url("prop-walk.png")');assert.equal(layer.style.backgroundSize,'1200% 100%');
});
