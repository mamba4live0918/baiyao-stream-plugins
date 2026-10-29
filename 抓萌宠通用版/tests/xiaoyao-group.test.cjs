const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const manifest=read('素材/manifest.json'),friends=read('素材/小曜自己人/manifest.json'),group=read('素材/小曜自己人/group.json');
const assets={...manifest,categories:[...manifest.categories.filter(c=>c.id!=='xiaoyao'),group],cows:manifest.cows};
function make(saved){
 const storage=new Map(saved?[['pet-catch-v1-custom',JSON.stringify(saved)]]:[]),ctx={PetRoamGeometry:require('../src/roam-geometry.js'),structuredClone,console,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)}};
 vm.runInNewContext(fs.readFileSync(path.join(root,'src/customize.js'),'utf8')+';globalThis.Type=CowCustomizer;',ctx);
 const Type=ctx.Type;for(const method of ['bind','bindPenManipulation','render','renderCows'])Type.prototype[method]=()=>{};Type.prototype.loadMedia=async()=>{};
 const core={defaultTiers:()=>[{id:'one',count:1,enabled:true}],validateTiers:v=>v||[{id:'one',count:1,enabled:true}],makeAssetGate:()=>({})};
 return new Type({assets,core,toast:()=>{},onChange:()=>{}});
}
test('the Xiaoyao group contains fifteen approved friends and the furry group shares eight existing pets',async()=>{
 const c=make();await c.ready;
 assert.equal(group.members.length,15);
 assert.deepEqual(Array.from(c.categoryKinds('xiaoyao'),kind=>c.builtinCow(kind).id),group.members);
 assert.equal(c.setActiveCategory('xiaoyao'),true);
 assert.deepEqual(Array.from(c.categoryKinds('xiaoyao'),kind=>c.cowName(kind)),['小橘猫','金毛','蓝色小章鱼','白狮','白色垂耳兔','紫章鱼','灰色立耳兔','科尔鸭','⋆Nebulosa⋆（狸花猫）','樱桃小海豹','猞猁','星空鲸鱼','世界之外小宠物','云宝宝','铃铛黑猫']);
 for(let i=0;i<300;i++)assert(group.members.includes(c.builtinCow(c.randomCow()).id));
 assert.deepEqual(Array.from(c.categoryKinds('xiaoyao-furry'),kind=>c.builtinCow(kind).id),['dog-10','dog-07','friend-tabby','cat-08','cat-01','friend-rat','friend-hamster','friend-dog']);
 assert.equal(c.setActiveCategory('xiaoyao-furry'),true);
 assert.deepEqual(Array.from(c.categoryKinds('xiaoyao-furry'),kind=>c.cowName(kind)),['边牧','萨摩耶','Echo*（狸花猫）','蓝猫','布偶猫','花枝鼠','金丝熊','黑白小土狗']);
 assert.equal(c.eligibleKinds('all').length,112);assert.equal(new Set(c.eligibleKinds('all')).size,112);
 for(const kind of [75,76,77]){assert(!c.categoryKinds('xiaoyao').includes(kind));assert(c.eligibleKinds('all').includes(kind));}
});
test('group controls share existing pets and preserve the final eligible member',async()=>{
 const c=make();await c.ready;c.setActiveCategory('xiaoyao-furry');
 const collie=assets.cows.findIndex(p=>p.id==='dog-10');assert.equal(c.setCowEnabled(collie,false),true);assert(!c.eligibleKinds('xiaoyao-furry').includes(collie));assert(!c.eligibleKinds('dog').includes(collie));
 assert.equal(c.setCategoryEnabled('xiaoyao-furry',false),false);
 for(const kind of c.eligibleKinds('xiaoyao-furry').slice(0,-1))assert(c.setCowEnabled(kind,false));
 assert.equal(c.setCowEnabled(c.eligibleKinds('xiaoyao-furry')[0],false),false);
 c.setActiveCategory('all');assert(c.setCategoryEnabled('xiaoyao-furry',false));assert.equal(c.eligibleKinds('xiaoyao-furry').length,0);assert.equal(c.setActiveCategory('xiaoyao-furry'),false);
});
test('old 72-pet configuration keeps its IDs as new groups and members are appended',async()=>{
 const old=Array.from({length:72},(_,i)=>({enabled:i!==9,scale:i===9?145:100,motion:'default',fps:8}));
 const c=make({cowSettings:old,activeCategory:'dog',customCows:[{kind:100,name:'我的角色',scale:80,enabled:true}]});await c.ready;
 assert.equal(c.cfg.cowSettings.length,112);assert.equal(c.cfg.cowSettings[9].enabled,false);assert.equal(c.cfg.cowSettings[9].scale,145);
 assert(c.cfg.cowSettings.slice(72).every(p=>p.enabled));assert.equal(c.cfg.customCows[0].kind,100);
 assert.equal(c.setCowMotion(73,'walk'),true);
});
test('blue octopus is appended after the existing 79 pets and survives saved group selection',async()=>{
 assert.equal(manifest.cows[79]?.id,'friend-octopus');
 assert.equal(manifest.cows[79]?.frames,12);
 assert.equal(group.members[2],'friend-octopus');
 const settings=Array.from({length:79},(_,i)=>({enabled:i!==78,scale:i===78?135:100,motion:'default',fps:8}));
 const c=make({cowSettings:settings,activeCategory:'xiaoyao'});await c.ready;
 assert.equal(c.cfg.cowSettings[78].enabled,false);assert.equal(c.cfg.cowSettings[78].scale,135);
 assert.equal(c.cfg.cowSettings[79].enabled,true);assert.equal(c.cowMotion(79),'walk');
 assert.equal(c.cowName(79),'蓝色小章鱼');assert(c.eligibleKinds('xiaoyao').includes(79));
});
