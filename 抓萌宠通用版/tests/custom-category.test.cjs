const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),C=require('../src/core.js');
const source=fs.readFileSync(path.join(root,'src/customize.js'),'utf8');
const ids=['dog','cow','cat','slime','sheep','seal','aquarium'];
const assets={categories:[...ids.map(id=>({id,name:id})),{id:'xiaoyao',name:'小曜自己人',members:['dog-0','cat-0']}],cows:ids.flatMap(id=>Array.from({length:17},(_,i)=>({id:id+'-'+i,name:id+i,category:id,src:'data:image/png;base64,AQID',motion:'walk'}))).slice(0,95),barns:Array.from({length:7},()=>({src:'data:image/png;base64,AQID'})),balls:[{id:'ball',src:'data:image/png;base64,AQID'}]};
class Element{constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.style={};this.dataset={};this.attrs={};this.classList={toggle(){}};}append(...children){this.children.push(...children);}replaceChildren(...children){this.children=children;}setAttribute(k,v){this.attrs[k]=v;}click(){}}
function fixture(saved={},render=false){
 const nodes=new Map(),notices=[],storage=new Map([['pet-catch-v1-custom',JSON.stringify(saved)]]);
 const document={getElementById:id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id);},createElement:tag=>new Element(tag),createTextNode:text=>({textContent:text})};
 const ctx={document,structuredClone,PetRoamGeometry:require('../src/roam-geometry.js'),Option:function(text,value){return{textContent:text,value};},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)}};
 vm.runInNewContext(source+';globalThis.Type=CowCustomizer;',ctx);const Type=ctx.Type,realRender=Type.prototype.renderCows;
 for(const m of ['bind','bindPenManipulation','render','renderCows'])Type.prototype[m]=()=>{};Type.prototype.loadMedia=async()=>{};
 const c=new Type({assets,core:C,toast:t=>notices.push(t),onChange(){}});
 if(render)c.renderCows=realRender;return{c,nodes,notices,storage};
}
const image={type:'image',data:'data:image/png;base64,AQID',name:'my-pet.png'};
function add(c,kind,category,enabled=true){c.cfg.customCows.push({kind,name:'custom'+kind,category,enabled,scale:100,fps:8,motion:'squish'});c.records.set('cow:'+kind,image);}
test('restore retains more than 100 personal species and migrates missing or invalid categories',async()=>{
 const list=Array.from({length:150001},(_,i)=>({kind:i+100,name:'pet',category:i===0?'cat':i===1?'all':undefined}));
 const {c}=fixture({customCows:list});await c.ready;
 assert.equal(c.cfg.customCows.length,list.length);assert.equal(c.cfg.nextCowKind,150101);
 assert.equal(c.cfg.customCows[0].category,'cat');assert.equal(c.cfg.customCows[1].category,'custom');assert.equal(c.cfg.customCows[2].category,'custom');
});
test('assigned customs share category controls and all-pool weighting remains unique',async()=>{
 const {c}=fixture();await c.ready;add(c,100,'dog');add(c,101,'cat');add(c,102,'xiaoyao');add(c,103,'aquarium');
 assert(c.eligibleKinds('dog').includes(100));assert(!c.eligibleKinds('dog').includes(101));assert(c.eligibleKinds('xiaoyao').includes(102));
 assert.equal(c.eligibleKinds('custom').length,4);const all=c.eligibleKinds('all');assert.equal(all.length,99);assert.equal(new Set(all).size,99);
 assert(c.setCategoryEnabled('dog',false));assert.equal(c.cfg.customCows[0].enabled,false);assert(!c.eligibleKinds('xiaoyao').includes(0));
 assert(c.setCategoryEnabled('dog',true));assert(c.eligibleKinds('dog').includes(100));
});
test('reassignment validates categories and preserves the last member of the selected random pool',async()=>{
 const {c,notices}=fixture();await c.ready;add(c,100,'aquarium');c.cfg.activeCategory='aquarium';
 for(const kind of c.categoryKinds('aquarium'))c.cfg.cowSettings[kind].enabled=false;
 assert.equal(c.setCustomCowCategory(100,'cat'),false);assert.equal(c.cowCategory(100),'aquarium');assert(notices.length);
 assert.equal(c.setCustomCowCategory(100,'all'),false);assert.equal(c.setCustomCowCategory(100,'bogus'),false);
 add(c,101,'aquarium');assert(c.setCustomCowCategory(100,'cat'));assert(c.eligibleKinds('cat').includes(100));assert(!c.eligibleKinds('aquarium').includes(100));assert(c.eligibleKinds('custom').includes(100));
 assert.equal(c.setCategoryEnabled('aquarium',false),false);
});
test('new upload captures its initial category through asynchronous decode and save',async()=>{
 const {c}=fixture();await c.ready;c.galleryCategory='aquarium';let target;c.upload=t=>target={...t};assert(c.startAddCow());assert.equal(target.category,'aquarium');
 let complete;c.decodeFile=()=>new Promise(resolve=>complete=resolve);c.put=async()=>{};
 const pending=c.consumeUpload({},target);c.galleryCategory='cat';complete(image);assert.equal(await pending,true);
 assert.equal(c.cfg.customCows[0].category,'aquarium');assert.equal(c.galleryCategory,'cat');assert.equal(c.pendingCowAdds.size,0);
 c.galleryCategory='dog';c.startAddCow('frames');let finish;c.decodeFrameFiles=()=>new Promise(resolve=>finish=resolve);
 const frames={type:'frames',data:'data:image/png;base64,AQID',poster:'data:image/png;base64,AQID',frames:2,name:'pet1.png'},job=c.consumeFrameUpload([],target);
 c.galleryCategory='seal';finish(frames);assert.equal(await job,true);assert.equal(c.cfg.customCows[1].category,'dog');assert.equal(c.galleryCategory,'seal');
});
test('unpaged gallery renders every native and assigned custom card, with personal collection showing all customs',async()=>{
 const {c,nodes}=fixture({},true);await c.ready;for(let i=0;i<125;i++)add(c,100+i,i<110?'dog':'cat');
 c.galleryCategory='dog';c.galleryPage=999;c.renderCows();assert.equal(nodes.get('cow-gallery').children.length,17);assert.equal(nodes.get('custom-cow-gallery').children.length,110);
 assert.equal(nodes.get('add-custom-cow-image').disabled,false);assert.match(nodes.get('cow-custom-count').textContent,/已添加 125 种/);assert.doesNotMatch(nodes.get('cow-custom-count').textContent,/100/);
 const card=nodes.get('custom-cow-gallery').children[0];assert(card.children.some(x=>x.children?.some(y=>y.attrs?.['aria-label']==='custom100所属分类')));
 c.galleryCategory='custom';c.renderCows();assert.equal(nodes.get('custom-cow-gallery').children.length,125);assert.equal(nodes.get('cow-gallery').children.length,0);
});
test('ID boundary and failed uploads preserve existing records without reusing a pending ID',async()=>{
 const {c}=fixture();await c.ready;c.cfg.nextCowKind=999999;c.galleryCategory='cow';const a=c.reserveCowTarget({kind:'cow-custom-new',category:'cow'});
 assert.equal(a.id,999999);assert.throws(()=>c.reserveCowTarget({kind:'cow-custom-new',category:'cat'}),/编号/);c.pendingCowAdds.clear();
 c.decodeFile=async()=>image;c.put=async()=>{throw Error('storage denied');};assert.equal(await c.consumeUpload({}, {kind:'cow-custom-new',category:'cow',type:'image'}),false);assert.equal(c.cfg.customCows.length,0);assert.equal(c.pendingCowAdds.size,0);
 c.cfg.nextCowKind=1000000;assert.equal(c.startAddCow(),false);
});
test('every named category accepts a new personal species and saves its assignment',async()=>{
 const {c,storage}=fixture();await c.ready;let target;c.upload=t=>target=t;
 for(const category of [...ids,'xiaoyao','custom']){c.galleryCategory=category;assert(c.startAddCow());const reserved=c.reserveCowTarget(target);c.commitCowUpload(image,reserved);c.pendingCowAdds.delete(reserved.id);assert.equal(c.cowCategory(reserved.id),category);assert(c.eligibleKinds(category).includes(reserved.id));}
 const restored=fixture(JSON.parse(storage.get('pet-catch-v1-custom'))).c;await restored.ready;
 assert.deepEqual(Array.from(restored.cfg.customCows,p=>p.category),[...ids,'xiaoyao','custom']);
});
test('seventeen-member group renders all members and deletion of its last assigned pet repairs the random category',async()=>{
 const {c,nodes}=fixture({},true);await c.ready;c.assets={...assets,categories:assets.categories.map(g=>g.id==='xiaoyao'?{...g,members:Array.from({length:17},(_,i)=>'dog-'+i)}:g)};
 c.galleryCategory='xiaoyao';add(c,100,'xiaoyao');c.renderCows();assert.equal(nodes.get('cow-gallery').children.length,17);assert.equal(nodes.get('custom-cow-gallery').children.length,1);
 c.cfg.activeCategory='xiaoyao';for(const kind of c.categoryKinds('xiaoyao'))c.cfg.cowSettings[kind].enabled=false;
 c.put=async()=>{};assert.equal(await c.deleteCustomCow(100),true);assert.equal(c.cfg.activeCategory,'all');assert.equal(c.cfg.customCows.length,0);assert.equal(c.records.has('cow:100'),false);
});

