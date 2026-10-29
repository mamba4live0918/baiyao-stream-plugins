const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Core=require('../src/core.js'),Themes=require('../src/themes.js'),Geometry=require('../src/roam-geometry.js');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8'),app=read('src/app.js'),line=name=>app.split('\n').find(s=>s.startsWith('function '+name+'('));
function customizer(saved){
 const manifest=JSON.parse(read('素材/manifest.json')),storage=new Map(saved?[['pet-catch-v1-custom',JSON.stringify({tiers:Core.defaultTiers(),...saved})]]:[]),notices=[];
 const ctx={structuredClone,PetRoamGeometry:Geometry,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},document:{getElementById:()=>null}};
 vm.runInNewContext(read('src/customize.js')+';globalThis.Type=CowCustomizer;',ctx);
 const Type=ctx.Type;for(const key of ['bind','bindPenManipulation','render','renderCows','renderBarns','syncControls'])Type.prototype[key]=()=>{};Type.prototype.loadMedia=async()=>{};
 const c=new Type({assets:manifest,themes:Themes,core:Core,toast:t=>notices.push(t),onChange(){}});return{c,storage,notices};
}
test('real customization switches to the twelve water members and pod, remembers cream and survives reload',async()=>{
 const f=customizer({activeCategory:'dog',barn:2,castA:5});await f.c.ready;assert.equal(f.c.cfg.theme,'cream');assert.equal(f.c.setTheme('aquarium'),true);
 assert.equal(f.c.eligibleKinds(f.c.cfg.activeCategory).length,12);assert.equal(f.c.cfg.barn,6);assert.equal(f.c.galleryCategory,'aquarium');
 const g=customizer(JSON.parse(f.storage.get('pet-catch-v1-custom')));await g.c.ready;assert.equal(g.c.cfg.theme,'aquarium');assert.equal(g.c.cfg.activeCategory,'aquarium');
 assert.equal(g.c.setTheme('cream'),true);assert.equal(g.c.cfg.activeCategory,'dog');assert.equal(g.c.cfg.barn,2);assert.equal(g.c.cfg.castA,5);
});
test('disabled aquarium members reject switching without overwriting theme memory or the previous category',async()=>{
 const f=customizer();await f.c.ready;f.c.cfg.cowSettings.slice(80).forEach(x=>x.enabled=false);const before=JSON.stringify(f.c.cfg);
 assert.equal(f.c.setTheme('aquarium'),false);assert.equal(JSON.stringify(f.c.cfg),before);assert(f.notices.length>0);
});
test('uploaded aquarium media still wins and default swimming retains each member cadence',async()=>{
 const f=customizer();await f.c.ready;assert.equal(f.c.cowMotion(81),'swim');assert.equal(f.c.cowFrameMeta(88).swimCycleMs,1800);
 f.c.records.set('cow:81',{type:'image',data:'data:image/png;base64,upload'});assert.equal(f.c.cowSource(81),'data:image/png;base64,upload');assert.equal(f.c.cowWalk(81),null);
});
function spawning(){
 class Node{constructor(){this.style={};this.dataset={};this.classList={add(){},remove(){}};}append(){}setAttribute(){}addEventListener(){}}
 const bounds=Geometry.pixels({roamLeft:25,roamRight:65,roamTop:20,roamBottom:70},1000,500),ctx={C:Core,W:1000,H:500,cows:[],nextId:0,custom:{hasCowKind:k=>k===80||k===0,randomCow:()=>80,cowName:()=> '水族成员',cfg:{ballMode:false}},document:{createElement:()=>new Node()},$:()=>new Node(),cowVisual(c){c.aquatic=c.kind===80;c.size=85;},PetRoamGeometry:Geometry,roamRect:()=>bounds,confineCow:c=>Geometry.constrain(c,bounds),renderCow(){},setTimeout:()=>0};
 vm.runInNewContext(line('makeCow'),ctx);return ctx;
}
test('new and restored water pets enter at legal swimming positions with no land gravity; old pets still drop',()=>{
 const ctx=spawning(),fish=ctx.makeCow(null,false,80);assert.equal(fish.airborne,false);assert.equal(fish.vy,0);assert(fish.y>=100&&fish.y<=350);assert(fish.x>=250&&fish.x<=650);
 const old=ctx.makeCow(null,false,0);assert.equal(old.airborne,true);assert(old.y<0);
 const restored=ctx.makeCow({kind:80,x:.9,y:.9},false);assert.equal(restored.airborne,false);assert(restored.x<=650&&restored.y<=350);
});
test('releasing water pets keeps them swimming while nest collection still credits exactly once',()=>{
 const ctx=spawning(),fish=ctx.makeCow(null,false,80);ctx.drag={id:7,list:[fish],x:900,y:450};fish.held=true;fish.x=900;fish.y=450;
 let credit=0;Object.assign(ctx,{inPen:()=>true,collectCows:list=>credit+=list.length,replenish(){},save(){},$:()=>({classList:{remove(){}},releasePointerCapture(){}})});
 vm.runInNewContext(line('releaseDrag'),ctx);ctx.releaseDrag();ctx.releaseDrag();assert.equal(credit,1);assert.equal(fish.airborne,false);
});
test('switching a falling avatar or pet to swimming clears gravity but preserves held and ball-entry states',()=>{
 const ctx={C:Core};vm.runInNewContext(line('setAquaticMode'),ctx);
 for(const protectedState of [{},{held:true},{ballEmerging:true}]){
  const p={motionMode:'swim',aquatic:false,airborne:true,vx:30,vy:150,hopFrame:5,...protectedState};ctx.setAquaticMode(p);assert.equal(p.aquatic,true);
  if(p.held||p.ballEmerging){assert.equal(p.airborne,true);assert.equal(p.vy,150);}else{assert.equal(p.airborne,false);assert.equal(p.vx,0);assert.equal(p.vy,0);assert.equal(p.hopFrame,0);}
 }
});
test('both classification selectors have one aquarium option and native resources remain inline at build time',()=>{
 const settings=read('src/settings.html');for(const id of ['activeCategory','galleryCategory']){const select=settings.match(new RegExp('<select id="'+id+'">([\\s\\S]*?)</select>'))[1];assert.equal((select.match(/value="aquarium"/g)||[]).length,1);}
 assert.match(read('开发/V1/build.cjs'),/\['THEMES','themes\.js'\]/);assert.match(read('src/aquarium.css'),/body\[data-theme=aquarium\]/);assert.doesNotMatch(read('src/aquarium.css'),/(?:^|\})\s*(?:html|body)\s*\{[^}]*background/);
});
