const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'src/customize.js'),'utf8');
const settings=fs.readFileSync(path.join(root,'src/settings.html'),'utf8');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'素材/manifest.json'),'utf8'));
const assets={...manifest,cows:manifest.cows.map(x=>({...x,src:'data:image/png;base64,AAAA'})),balls:[{id:'ball-basic',name:'普通球',src:'data:image/png;base64,AAAA'}],barns:Array.from({length:6},()=>({src:'data:image/png;base64,AAAA'}))};
const core={defaultTiers:()=>[{id:'1',count:1,enabled:true}],validateTiers:x=>x||[{id:'1',count:1,enabled:true}],makeAssetGate:()=>({})};
function make(saved){
 const entries=new Map(saved?[['pet-catch-v1-custom',JSON.stringify(saved)]]:[]),notices=[];
 const ctx={PetRoamGeometry:require('../src/roam-geometry.js'),structuredClone,console,Map,Set,Math,localStorage:{getItem:k=>entries.get(k)||null,setItem:(k,v)=>entries.set(k,v)}};
 vm.runInNewContext(source+'\n;globalThis.CustomizerForTest=CowCustomizer;',ctx);
 const Type=ctx.CustomizerForTest;
 Type.prototype.bind=()=>{};Type.prototype.bindPenManipulation=()=>{};Type.prototype.render=()=>{};Type.prototype.renderCows=()=>{};Type.prototype.loadMedia=async()=>{};
 const custom=new Type({assets,core,toast:x=>notices.push(x),onChange:()=>{}});
 return {custom,notices,entries};
}

test('原六类和水族馆各十二种、鸭吉吉八种，随机范围使用逻辑编号',async()=>{
 assert.equal(assets.cows.length,112);
 const {custom}=make();await custom.ready;
 assert.equal(custom.cfg.barn,5);
 const counts={dog:12,cow:12,cat:12,slime:12,sheep:12,seal:12,aquarium:12,yajiji:8};
 for(const category of assets.categories.filter(category=>!category.members)){
  assert.equal(custom.eligibleKinds(category.id).length,counts[category.id]);
  assert.equal(custom.setActiveCategory(category.id),true);
  for(let i=0;i<50;i++)assert.equal(custom.builtinCow(custom.randomCow()).category,category.id);
 }
 assert.equal(custom.setActiveCategory('all'),true);
 assert.equal(custom.eligibleKinds('xiaoyao').length,15);
 assert.equal(custom.eligibleKinds('xiaoyao-furry').length,8);
 assert.equal(custom.eligibleKinds().length,112);
 assert.equal(new Set(custom.eligibleKinds()).size,112);
});

test('分类停用和单只停用均保留当前随机范围内最后一种',async()=>{
 const {custom,notices}=make();await custom.ready;
 assert.equal(custom.setActiveCategory('dog'),true);
 assert.equal(custom.setCategoryEnabled('dog',false),false);
 assert.equal(custom.eligibleKinds('dog').length,12);
 for(const kind of custom.eligibleKinds('dog').slice(0,-1))assert.equal(custom.setCowEnabled(kind,false),true);
 const last=custom.eligibleKinds('dog')[0];
 assert.equal(custom.setCowEnabled(last,false),false);
 assert.equal(custom.randomCow(),last);
 assert(notices.some(x=>x.includes('至少保留')));
 assert.equal(custom.setActiveCategory('all'),true);
 assert.equal(custom.setCategoryEnabled('dog',false),true);
 assert.equal(custom.eligibleKinds('dog').length,0);
 assert.equal(custom.setActiveCategory('dog'),false);
});

test('运动覆盖与配置恢复：内置默认按分类，自定义默认史莱姆弹跳',async()=>{
 const first=make();await first.custom.ready;
 const custom=first.custom;
 const dog=assets.cows.findIndex(x=>x.category==='dog');
 const seal=assets.cows.findIndex(x=>x.category==='seal');
 assert.equal(custom.cowMotion(dog),'run');
 assert.equal(custom.cowMotion(seal),'scoot');
 assert.equal(custom.setCowMotion(dog,'hop'),true);
 assert.equal(custom.cowMotion(dog),'hop');
 assert.equal(custom.setCowMotion(dog,'unknown'),false);
 custom.cfg.customCows.push({kind:100,name:'自定义',enabled:true,scale:100,fps:8,category:'custom',motion:'squish'});
 custom.records.set('cow:100',{data:'data:image/png;base64,AAAA'});
 assert.equal(custom.setCowMotion(100,'float'),true);
 assert.equal(custom.cowMotion(100),'float');
 custom.cfg.avatarMode=true;custom.cfg.avatarMotion='plod';custom.setActiveCategory('seal');
 const saved=JSON.parse(first.entries.get('pet-catch-v1-custom'));
 const restored=make(saved);await restored.custom.ready;
 assert.equal(restored.custom.cowMotion(dog),'hop');
 assert.equal(restored.custom.cowMotion(100),'float');
 assert.equal(restored.custom.cfg.activeCategory,'seal');
 assert.equal(restored.custom.cfg.avatarMode,true);
 assert.equal(restored.custom.cfg.avatarMotion,'plod');
});

test('界面提供分类、逐只运动和头像测试控件',()=>{
 for(const id of ['activeCategory','galleryCategory','gallery-prev','gallery-next','enable-category','disable-category','avatarMode','avatarMotion','avatarTestUrl','avatarTestName','avatarTestGift'])assert.match(settings,new RegExp(`id="${id}"`));
 assert.match(source,/for\(const entry of entries\)makeCard/);
 assert.match(source,/cow-motion-select/);
});
