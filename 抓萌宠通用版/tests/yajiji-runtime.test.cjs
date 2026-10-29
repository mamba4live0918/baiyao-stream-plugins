const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8'),app=read('src/app.js');
const Core=require('../src/core.js'),Roster=require('../src/roster.js'),Geometry=require('../src/roam-geometry.js');
const line=name=>app.split('\n').find(s=>s.startsWith('function '+name+'('));
function fixture(){
 const assets=JSON.parse(read('素材/manifest.json')),ctx={structuredClone,PetRoamGeometry:Geometry,localStorage:{getItem:()=>null,setItem(){}},document:{getElementById:()=>null}};
 vm.runInNewContext(read('src/customize.js')+';globalThis.Type=CowCustomizer;',ctx);
 for(const k of ['bind','bindPenManipulation','render','renderCows','renderBarns','syncControls'])ctx.Type.prototype[k]=()=>{};ctx.Type.prototype.loadMedia=async()=>{};
 const custom=new ctx.Type({assets,roster:Roster,themes:require('../src/themes.js'),core:Core,toast(){},onChange(){}});
 custom.cfg.customCows.push({kind:100,name:'旧自定义',enabled:true,scale:100,motion:'walk',category:'dog'});custom.records.set('cow:100',{type:'image',data:'data:image/png;base64,custom100'});
 const state=Core.fresh();state.avatarKinds=[{kind:1000000,url:'https://example.com/avatar.png',name:'小曜',fallbackKind:0}];custom.cfg.avatarMode=true;
 const context={PetRoamGeometry:Geometry,C:Core,W:1280,H:720,prefs:{size:90},state,custom,reduced:()=>false};
 vm.runInNewContext(app.slice(app.indexOf('function size()'),app.indexOf('function ballBurst('))+';globalThis.cowVisual=cowVisual;',context);
 return{custom,state,context,pet:kind=>({id:kind+1,kind,x:500,y:350,el:{style:{},classList:{toggle(){}},setAttribute(){}},im:{style:{},src:''},sprite:{style:{}}})};
}
test('duck appearance covers old, custom and avatar residents without replacing logical identities',async()=>{
 const f=fixture();await f.custom.ready;assert(f.custom.setTheme('yajiji'));
 const pets=[0,80,100,1000000,2000005].map(f.pet),before=JSON.stringify(f.state);
 for(const pet of pets){const original=pet.kind;f.context.cowVisual(pet);assert.equal(pet.kind,original);assert.equal(f.custom.cowCategory(pet.visualKind),'yajiji');assert.equal(pet.motionMode,'walk');assert.equal(pet.articulated,true);assert.equal(pet.walkFrames,12);assert.notEqual(pet.im.src,'https://example.com/avatar.png');}
 assert.equal(f.custom.cfg.avatarMode,true);assert.equal(JSON.stringify(f.state),before);
 assert(f.custom.setTheme('cream'));
 for(const pet of pets)f.context.cowVisual(pet);
 assert.equal(pets[0].visualKind,0);assert.equal(pets[1].visualKind,80);assert.equal(pets[1].motionMode,'swim');assert.equal(pets[2].im.src,'data:image/png;base64,custom100');assert.equal(pets[3].im.src,'https://example.com/avatar.png');assert.equal(pets[4].visualKind,2000005);
});
test('old current-round cast is displayed as ducks without mutating saved cast',async()=>{
 const f=fixture();await f.custom.ready;f.custom.setTheme('yajiji');const cast=[0,100],els={};f.context.$=id=>els[id]??={};vm.runInNewContext(line('setCast'),f.context);f.context.setCast(cast);
 assert.deepEqual(cast,[0,100]);for(const id of ['mascot-a','mascot-b'])assert.match(els[id].src,/鸭吉吉/);
 f.custom.setTheme('cream');f.context.setCast(cast);assert.equal(els['mascot-b'].src,'data:image/png;base64,custom100');
});
test('collecting duck-displayed residents credits their original kinds, never the display aliases',async()=>{
 const f=fixture();await f.custom.ready;f.custom.setTheme('yajiji');f.state.outside=3;const pets=[100,1000000,2000005].map(f.pet);pets.forEach(p=>{p.size=80;p.el.disabled=false;p.el.tabIndex=0;p.el.classList.add=()=>{};f.context.cowVisual(p);});
 const pen={classList:{remove(){},add(){}}};Object.assign(f.context,{cows:pets,queueBlocked:false,penRect:()=>({x:10,y:20,w:100,h:100}),replenish(){},save(){},sound(){},particles(){},updateHUD(){},setTimeout:()=>0,$:()=>pen});
 vm.runInNewContext(line('collectCows'),f.context);assert.equal(f.context.collectCows(pets),3);assert.equal(f.state.outside,0);assert.equal(f.state.home,3);assert.deepEqual(f.state.recentHomes.map(x=>x.kind).sort((a,b)=>a-b),[100,1000000,2000005]);
});
test('duck build validates explicit native kinds, inlines its modules and keeps both category options unique',()=>{
 const build=read('开发/V1/build.cjs');assert.match(build,/PetRoster\.catalog\(manifest\.cows\)/);assert.match(build,/\['ROSTER','roster\.js'\]/);assert.match(build,/src\/yajiji\.css/);assert.match(app,/roster:PetRoster/);
 const settings=read('src/settings.html');for(const id of ['theme','activeCategory','galleryCategory']){const select=settings.match(new RegExp('<select id="'+id+'">([\\s\\S]*?)</select>'))[1];assert.equal((select.match(/value="yajiji"/g)||[]).length,1);}
 assert.doesNotMatch(read('src/yajiji.css'),/(?:^|\})\s*(?:html|body)\s*\{[^}]*background/);
});
test('theme changes remove settled flight and return ghosts once without changing counters or history',async()=>{
 const f=fixture();await f.custom.ready;const p=f.pet(1000000);f.state.home=1;f.state.recentHomes=[{at:Date.now(),kind:1000000,count:1}];p.dead=true;p.windActive=true;
 let cancelled=0,removed=0,ghostsRemoved=0;const ghosts=[{remove(){ghostsRemoved++;}},{remove(){ghostsRemoved++;}}];p.windAnimation={cancel(){cancelled++;}};p.el.remove=()=>removed++;
 f.custom.applyLayout=()=>{};const before=JSON.stringify(f.state),doc={body:{dataset:{theme:'cream'}},querySelectorAll:()=>ghosts};
 Object.assign(f.context,{windFlights:new Set([p]),document:doc,PetThemes:{apply:t=>doc.body.dataset.theme=t},cows:[],residentCows:[],controls:null,queueBlocked:false,roamArea:null,previewRound:null,setCast(){},updateHUD(){},renderCow(){}});
 const helper=line('refreshThemeEffects');if(helper)vm.runInNewContext(line('allActors')+'\n'+helper+'\n'+line('cancelWindFlights'),f.context);
 const callback=app.match(/onChange:\(\)=>\{(if\(!custom\)return;[^\n]+?updateHUD\(\);(?:controls\?\.refresh\(\);)?)\}\}\);/);assert(callback,'actual theme change callback');vm.runInNewContext('globalThis.change=()=>{'+callback[1]+'};',f.context);
 f.custom.setTheme('yajiji');f.context.change();assert.equal(cancelled,1);assert.equal(removed,1);assert.equal(ghostsRemoved,2);assert.equal(f.context.windFlights.size,0);assert.equal(JSON.stringify(f.state),before);
 f.context.change();assert.equal(cancelled,1);assert.equal(ghostsRemoved,2);
});
