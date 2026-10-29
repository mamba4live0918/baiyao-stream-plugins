const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'src/customize.js'),'utf8');
const R=require('../src/roster.js'),C=require('../src/core.js');
const png='data:image/png;base64,AAAA',sequence={type:'frames',data:png,poster:png,frames:12};
function assets(){return {cows:[...Array.from({length:95},(_,i)=>({id:'native-'+i,name:'Native '+i,category:i<80?'dog':'aquarium',motion:'walk',src:png+'native'+i,walk:png+'walk'+i,frames:12,articulated:true,sourceFacing:-1})),...Array.from({length:8},(_,i)=>({id:'duck-'+i,kind:2000000+i,name:'Duck '+i,category:'yajiji',motion:'walk',src:png+'duck'+i,walk:png+'duckwalk'+i,frames:12,articulated:true,sourceFacing:1}))],categories:[{id:'dog',name:'Dogs'},{id:'aquarium',name:'Aquarium'},{id:'yajiji',name:'Duck Jiji'},{id:'named',name:'Named group',members:['native-3','duck-5'],labels:{'duck-5':'Named Duck'}}],balls:[{id:'ball',src:png,name:'Ball'}],barns:Array.from({length:8},(_,i)=>({id:i===7?'yajiji-nest':'nest-'+i,src:png,name:'Nest '+i}))};}
const themes={valid:v=>['cream','aquarium','yajiji'].includes(v),memory:raw=>structuredClone(raw||{}),transition(cfg,next){if(!this.valid(next))return null;const memory=structuredClone(cfg.themeMemory||{});memory[cfg.theme]={activeCategory:cfg.activeCategory,barn:cfg.barn,castA:cfg.castA,castB:cfg.castB};const defaults={cream:{activeCategory:'all',barn:5,castA:-1,castB:-1},aquarium:{activeCategory:'aquarium',barn:6,castA:-1,castB:-1},yajiji:{activeCategory:'yajiji',barn:7,castA:-1,castB:-1}};return {theme:next,themeMemory:memory,...(memory[next]||defaults[next])};}};
function element(tag='div'){return {tagName:tag.toUpperCase(),children:[],style:{},dataset:{},value:'',checked:false,disabled:false,attributes:{},classList:{add(){},remove(){},toggle(){}},append(...items){this.children.push(...items);},replaceChildren(...items){this.children=[...items];},setAttribute(k,v){this.attributes[k]=v;},removeAttribute(k){delete this.attributes[k];},hasAttribute(k){return k in this.attributes;},getAttribute(k){return this.attributes[k];},addEventListener(type,fn){this.listeners??={};this.listeners[type]=fn;}};}
function fixture(saved={},options={}){
 const a=assets(),storage=new Map([['pet-catch-v1-custom',JSON.stringify({tiers:C.defaultTiers(),...saved})]]),nodes=new Map(),notices=[];
 const get=id=>{if(!nodes.has(id))nodes.set(id,element(['castA','castB','theme','activeCategory','galleryCategory'].includes(id)?'select':'input'));return nodes.get(id);};
 const rows=options.rows||[],database={close(){},transaction(){const tx={error:null,objectStore:()=>({getAllKeys:()=>({result:rows.map(r=>r[0])}),getAll:()=>({result:rows.map(r=>r[1])})})};queueMicrotask(()=>tx.oncomplete?.());return tx;}};
 const ctx={structuredClone,console,Map,Set,Math,setTimeout,clearTimeout,queueMicrotask,PetRoamGeometry:require('../src/roam-geometry.js'),localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},indexedDB:{open(){const request={result:database};queueMicrotask(()=>request.onsuccess?.());return request;}},document:{getElementById:get,querySelectorAll:()=>[],createElement:tag=>element(tag),createTextNode:text=>({textContent:text}),body:{classList:{toggle(){},remove(){}}}},window:{addEventListener(){}},Option:function(text,value){this.textContent=text;this.value=value;}};
 vm.runInNewContext(source+';globalThis.Type=CowCustomizer;',ctx);const Type=ctx.Type,renderCows=Type.prototype.renderCows,bind=Type.prototype.bind;
 for(const method of ['bind','bindPenManipulation','render','renderCows','renderBarns','applyPenLock'])Type.prototype[method]=()=>{};
 if(!options.nativeMedia)Type.prototype.loadMedia=async function(){for(const [key,record]of rows)this.records.set(key,record);};
 const c=new Type({assets:a,core:C,roster:options.fallback?null:R,themes,toast:x=>notices.push(x),onChange(){}});c.put=async()=>{};
 return {c,a,nodes,get,storage,notices,renderCows:()=>renderCows.call(c),bind:()=>bind.call(c)};
}

test('native logical kinds do not collide with an old custom100 at array index100',async()=>{
 for(const fallback of [false,true]){
  const {c}=fixture({customCows:[{kind:100,name:'Old custom',category:'dog',enabled:true,scale:145,fps:6,motion:'hop'}]}, {fallback,rows:[['cow:100',{data:png+'custom'}]]});await c.ready;
  assert.equal(c.kindForIndex(100),2000005);assert.equal(c.builtinIndex(2000005),100);assert.equal(c.builtinIndex(100),-1);assert.equal(c.isBuiltin(100),false);
  assert.equal(c.builtinCow(2000005).id,'duck-5');assert.equal(c.cowName(100),'Old custom');assert.equal(c.cowScale(100),1.45);assert.equal(c.cowSource(100),png+'custom');assert.equal(c.cowMotion(100),'hop');
  assert.equal(c.cowSetting(2000005),c.cfg.cowSettings[100]);assert.equal(c.cowSetting(100),c.cfg.customCows[0]);assert.equal(c.hasCowKind(95),false);assert.equal(c.hasCowKind(2000100),false);
  assert.deepEqual(Array.from(c.categoryKinds('named')),[3,2000005]);assert.equal(c.cowName(2000005,'named'),'Named Duck');
  assert.equal(c.setCustomCowCategory(2000005,'dog'),false);
 }
});

test('2m native uploads, FPS and enable flags use their native setting slot',async()=>{
 const {c}=fixture({customCows:[{kind:100,name:'Old',category:'dog',enabled:true,scale:150,fps:7}]});await c.ready;
 const target={kind:'cow-builtin-replace',key:'cow:2000005',id:2000005};assert.equal(c.reserveCowTarget(target),target);
 assert.throws(()=>c.reserveCowTarget({...target,key:'cow:2000100',id:2000100}));assert.throws(()=>c.reserveCowTarget({...target,key:'cow:95',id:95}));
 c.commitCowUpload(sequence,target);assert.equal(c.cowSource(2000005),png);assert.equal(c.cowWalk(2000005),png);assert.equal(c.cowFrameMeta(2000005).kind,'sequence');
 assert.equal(c.setCowFps(2000005,19),true);assert.equal(c.cfg.cowSettings[100].fps,19);assert.equal(c.cfg.customCows[0].fps,7);
 assert.equal(c.setCowMotion(2000005,'hop'),true);assert.equal(c.cowMotion(2000005),'hop');
 c.records.delete('cow:2000005');assert.equal(c.setCowEnabled(2000005,false),true);assert.equal(c.setCowEnabled(2000005,true),true);assert.equal(c.cowFrameMeta(2000005).frames,12);assert.equal(c.cowCategory(2000005),'yajiji');
});

test('IndexedDB media loading accepts known native2m and old custom100, rejecting unknown cow IDs',async()=>{
 const {c}=fixture({customCows:[{kind:100,name:'Old',category:'custom'}]},{nativeMedia:true,rows:[['cow:2000000',sequence],['cow:2000005',{data:png+'duck-upload'}],['cow:100',{data:png+'old'}],['cow:95',{data:png+'bad'}],['cow:2000999',sequence]]});await c.ready;
 assert.equal(c.cowFrameMeta(2000000).kind,'sequence');assert.equal(c.cowSource(2000005),png+'duck-upload');assert.equal(c.cowSource(100),png+'old');assert.equal(c.records.has('cow:95'),false);assert.equal(c.records.has('cow:2000999'),false);
});

test('duck display mapping is deterministic and leaves logical kinds, category settings and avatar preference unchanged',async()=>{
 const {c}=fixture({avatarMode:true,customCows:[{kind:100,name:'Owned duck',category:'yajiji',enabled:true},{kind:101,name:'Owned other',category:'dog',enabled:true}]},{rows:[['cow:100',{data:png+'ownedduck'}],['cow:101',{data:png+'other'}]]});await c.ready;
 assert.equal(c.resolveDisplayKind(3,9),3);assert.equal(c.setTheme('yajiji'),true);const logical=[3,100,101,1000000,2000006],before=logical.slice();
 for(const kind of logical){const value=c.resolveDisplayKind(kind,7);assert.equal(c.cowCategory(value),'yajiji');assert.equal(c.resolveDisplayKind(kind,7),value);}
 assert.deepEqual(logical,before);assert.equal(c.resolveDisplayKind(100,7),100);assert.equal(c.resolveDisplayKind(2000006,7),2000006);assert.equal(c.cfg.avatarMode,true);
 const mapped=c.resolveDisplayKind(3,0);c.setCowEnabled(mapped,false);assert.notEqual(c.resolveDisplayKind(3,0),mapped);
 assert.equal(c.setActiveCategory('all'),false);assert.equal(c.setActiveCategory('dog'),false);assert.equal(c.cfg.activeCategory,'yajiji');
});

test('theme memory restores non-duck cast/category and avatar UI without mutating preference',async()=>{
 const {c,get}=fixture({avatarMode:true,activeCategory:'dog',castA:3,castB:4});await c.ready;
 assert.equal(c.setTheme('yajiji'),true);assert.equal(c.cfg.castA,-1);assert.equal(c.cfg.castB,-1);assert.equal(c.cfg.activeCategory,'yajiji');assert(get('activeCategory').disabled);assert(get('avatarMode').disabled);assert.equal(get('avatarMode').checked,false);assert.equal(c.cfg.avatarMode,true);
 assert(c.castOptions().every(option=>c.cowCategory(option.kind)==='yajiji'));c.cfg.castA=2000004;c.cfg.barn=7;
 assert.equal(c.setTheme('cream'),true);assert.equal(c.cfg.castA,3);assert.equal(c.cfg.activeCategory,'dog');assert.equal(get('activeCategory').disabled,false);assert.equal(get('avatarMode').disabled,false);assert.equal(get('avatarMode').checked,true);
 assert.equal(c.setTheme('yajiji'),true);assert.equal(c.cfg.castA,2000004);assert.equal(c.cfg.barn,7);
});

test('invalid saved duck state recovers a native duck, never a dog, after uploads load',async()=>{
 const cfg={theme:'yajiji',activeCategory:'dog',castA:3,avatarMode:true,cowSettings:Array.from({length:103},()=>({enabled:false,scale:100,fps:8}))};
 const {c}=fixture(cfg);await c.ready;assert.equal(c.cfg.activeCategory,'yajiji');assert.equal(c.cfg.castA,-1);assert.deepEqual(Array.from(c.eligibleKinds('yajiji')),[2000000]);assert.equal(c.cfg.cowSettings[0].enabled,false);assert.equal(c.cfg.avatarMode,true);assert.equal(c.randomCow(),2000000);
});

test('deleting the last owned duck restores a native duck; moving or disabling the last eligible duck stays protected',async()=>{
 const settings=Array.from({length:103},(_,i)=>({enabled:i<95,scale:100,fps:8}));
 const {c}=fixture({theme:'yajiji',activeCategory:'yajiji',cowSettings:settings,customCows:[{kind:100,name:'Only duck',category:'yajiji',enabled:true}]},{rows:[['cow:100',{data:png}]]});await c.ready;
 assert.deepEqual(Array.from(c.eligibleKinds('yajiji')),[100]);assert.equal(c.setCowEnabled(100,false),false);assert.equal(c.setCustomCowCategory(100,'dog'),false);
 assert.equal(await c.deleteCustomCow(100),true);assert.equal(c.cfg.activeCategory,'yajiji');assert.deepEqual(Array.from(c.eligibleKinds('yajiji')),[2000000]);assert.equal(c.setCowEnabled(2000000,false),false);
});

test('entry to duck mode refuses an empty pool and gallery/cast values remain logical IDs without pagination',async()=>{
 const {c,get,renderCows}=fixture();await c.ready;assert.equal(c.setCategoryEnabled('yajiji',false),true);assert.equal(c.setTheme('yajiji'),false);assert.equal(c.setCowEnabled(2000000,true),true);
 for(let i=0;i<120;i++){c.cfg.customCows.push({kind:100+i,name:'Owned '+i,category:'yajiji',enabled:true,scale:100,fps:8,motion:'walk'});c.records.set('cow:'+(100+i),{data:png});}
 assert.equal(c.galleryEntries('yajiji').length,128);assert.equal(c.setTheme('yajiji'),true);c.galleryCategory='yajiji';renderCows();
 assert.equal(get('cow-gallery').children.length,8);assert.equal(get('custom-cow-gallery').children.length,120);assert(get('castA').children.some(o=>o.value==='2000005'));assert(get('castA').children.some(o=>o.value==='100'));assert(!get('castA').children.some(o=>o.value==='3'));
});

test('bound controls reject avatar changes and invalid or non-duck cast IDs while duck theme is active',async()=>{
 const {c,get,bind}=fixture({avatarMode:true});await c.ready;bind();c.setTheme('yajiji');get('avatarMode').checked=true;get('avatarMode').onchange();assert.equal(c.cfg.avatarMode,true);assert.equal(get('avatarMode').checked,false);
 const select=get('castA');select.value='2000007';select.listeners.change();assert.equal(c.cfg.castA,2000007);
 for(const value of ['100','95','3','2009999']){select.value=value;select.listeners.change();assert.equal(c.cfg.castA,2000007);}
});

test('saved native2m cast/settings reload beside custom100 without turning the old upload into a duck',async()=>{
 const first=fixture({avatarMode:true,customCows:[{kind:100,name:'Original upload',category:'dog',enabled:true,scale:155,fps:5,motion:'hop'}]},{rows:[['cow:100',{data:png+'old'}],['cow:2000005',sequence]]});await first.c.ready;
 first.c.cfg.cowSettings[100].scale=120;first.c.setCowFps(2000005,17);first.c.setTheme('yajiji');first.c.cfg.castA=2000005;first.c.save();
 const saved=JSON.parse(first.storage.get('pet-catch-v1-custom'));
 const next=fixture(saved,{rows:[['cow:100',{data:png+'old'}],['cow:2000005',sequence]]});await next.c.ready;
 assert.equal(next.c.cfg.castA,2000005);assert.equal(next.c.cowScale(2000005),1.2);assert.equal(next.c.cowFrameMeta(2000005).fps,17);assert.equal(next.c.cowName(100),'Original upload');assert.equal(next.c.cowScale(100),1.55);assert.equal(next.c.cowSource(100),png+'old');assert.equal(next.c.cfg.avatarMode,true);
 next.c.setTheme('cream');assert.equal(next.c.resolveDisplayKind(100,1),100);
});
