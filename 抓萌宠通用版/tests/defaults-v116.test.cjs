const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Core=require('../src/core.js'),Box=require('../src/blind-box.js'),Roster=require('../src/roster.js');
const source=fs.readFileSync(path.join(__dirname,'../src/customize.js'),'utf8');
const copy=value=>JSON.parse(JSON.stringify(value));
const fixed=(id,name,count,gift='',enabled=true)=>({id,name,gift,mode:'fixed',count,min:count,max:count,enabled});
const single=[fixed('default-5','萌宠盲盒',5)];
const original=()=>Box.migrate(Core.defaultTiers());
function fixture(saved,other={}){
 const entries=new Map(Object.entries(other)),writes=[],warnings=[];if(saved!==undefined)entries.set('pet-catch-v1-custom',JSON.stringify(saved));
 const context={structuredClone,PetRoamGeometry:require('../src/roam-geometry.js'),localStorage:{getItem:key=>entries.get(key)??null,setItem:(key,value)=>{writes.push(key);entries.set(key,value);}}};
 vm.runInNewContext(source+';globalThis.Type=CowCustomizer;',context);
 const Type=context.Type;for(const method of ['bind','bindPenManipulation','render'])Type.prototype[method]=()=>{};Type.prototype.loadMedia=async()=>{};
 const assets={cows:[{id:'pet-0',category:'dog',src:'data:image/png;base64,AA'},{id:'pet-1',category:'dog',src:'data:image/png;base64,AA'},{id:'duck',kind:2000000,category:'yajiji',src:'data:image/png;base64,AA'},{id:'pet-3',category:'dog',src:'data:image/png;base64,AA'}],categories:[{id:'dog'},{id:'yajiji'}],barns:Array.from({length:6},()=>({src:'data:image/png;base64,AA'})),balls:[{id:'ball',src:'data:image/png;base64,AA'}],audio:{}};
 const c=new Type({assets,core:Core,blindBox:Box,roster:Roster,toast:message=>warnings.push(message),onChange(){}});
 return{c,entries,writes,warnings};
}
test('fresh settings use 200 percent for all native kinds and one five-pet manual box, leaving legacy tiers intact',async()=>{
 const f=fixture();await f.c.ready;
 assert.deepEqual(Array.from(f.c.cfg.cowSettings,row=>row.scale),[200,200,200,200]);assert.equal(f.c.cowScale(2000000),2);assert.deepEqual(copy(f.c.cfg.boxTiers),single);
 assert.deepEqual(copy(f.c.cfg.tiers),Core.defaultTiers());assert.equal(f.c.cfg.defaultsV116,true);assert.equal(f.writes.length,0);
});
test('old default 100 and missing scales migrate to 200 while custom numeric sizes and controls stay unchanged',async()=>{
 const f=fixture({tiers:Core.defaultTiers(),cowSettings:[{scale:100,enabled:false,fps:12,motion:'float'},{scale:140.5},{scale:200},{}],customCows:[{kind:100,name:'A',scale:100},{kind:101,name:'B',scale:75},{kind:102,name:'C'},{kind:103,name:'D',scale:201}]});await f.c.ready;
 assert.deepEqual(Array.from(f.c.cfg.cowSettings,row=>row.scale),[200,140.5,200,200]);assert.deepEqual(Array.from(f.c.cfg.customCows,row=>row.scale),[200,75,200,200]);
 assert.equal(f.c.cfg.cowSettings[0].enabled,false);assert.equal(f.c.cfg.cowSettings[0].fps,12);assert.equal(f.c.cfg.cowSettings[0].motion,'float');assert.equal(f.c.cowScale(102),2);assert.equal(f.writes.length,0);
});
test('the saved migration marker preserves later intentional 100 percent settings on reload',async()=>{
 const f=fixture({tiers:Core.defaultTiers(),cowSettings:[{scale:100}],customCows:[{kind:100,name:'A',scale:100}]});await f.c.ready;
 f.c.cfg.cowSettings[0].scale=100;f.c.cfg.customCows[0].scale=100;f.c.save();const saved=JSON.parse(f.entries.get('pet-catch-v1-custom'));assert.equal(saved.defaultsV116,true);
 const next=fixture(saved);await next.c.ready;assert.equal(next.c.cfg.cowSettings[0].scale,100);assert.equal(next.c.cfg.customCows[0].scale,100);assert.equal(next.c.cowScale(0),1);
});
test('new personal species start at 200 percent and missing owned scales use the same fallback',async()=>{
 const f=fixture();await f.c.ready;f.c.commitCowUpload({type:'image',name:'new.png',data:'data:image/png;base64,AA'},{kind:'cow-custom-new',key:'cow:100',id:100,category:'dog'});
 assert.equal(f.c.cfg.customCows[0].scale,200);delete f.c.cfg.customCows[0].scale;assert.equal(f.c.cowScale(100),2);
});
test('untouched automatic twenty-tier configurations simplify without overwriting the old stored record on startup',async()=>{
 for(const saved of [{tiers:Core.defaultTiers()},{tiers:Core.defaultTiers(),boxTiers:original()}]){
  const f=fixture(saved);await f.c.ready;assert.deepEqual(copy(f.c.cfg.boxTiers),single);assert.deepEqual(JSON.parse(f.entries.get('pet-catch-v1-custom')),saved);assert.equal(f.writes.length,0);
 }
});
test('a complete old default ID set sheds only untouched automatic rows while keeping additions and edited rules',async()=>{
 const rows=original();rows[0].name='Renamed';rows[1].gift='Rose';rows[2]={...rows[2],mode:'random',count:7,min:7,max:12};rows[3].enabled=false;rows.push(fixed('mine','Personal',888,'Gift'));
 const expected=Box.validateTiers([rows[0],rows[1],rows[2],rows[3],rows.at(-1)]),f=fixture({tiers:Core.defaultTiers(),boxTiers:rows});await f.c.ready;
 assert.deepEqual(copy(f.c.cfg.boxTiers),expected);assert.equal(f.writes.length,0);
 const mixed=fixture({tiers:Core.defaultTiers(),boxTiers:[...original(),fixed('own','Own',25)]});await mixed.c.ready;assert.deepEqual(copy(mixed.c.cfg.boxTiers),[fixed('own','Own',25)]);
});
test('partial default sets, explicit empty pools and already-migrated full pools are never simplified',async()=>{
 for(const [rows,marked]of [[original().slice(1),false],[[],false],[original(),true]]){
  const f=fixture({tiers:Core.defaultTiers(),boxTiers:rows,...(marked?{defaultsV116:true}:{})});await f.c.ready;assert.deepEqual(copy(f.c.cfg.boxTiers),rows);
 }
});
test('startup repairs and default migration do not write storage or modify queued/current results',async()=>{
 const queued=JSON.stringify({outside:7,current:{count:50,boxName:'Locked result',applied:true},roundSources:[{count:2,box:{id:'default-20',count:20,name:'Old snapshot'}}]});
 const f=fixture({tiers:Core.defaultTiers(),boxTiers:original(),ballSettings:[{enabled:false}]},{'pet-catch-v1':queued});await f.c.ready;
 assert.equal(f.writes.length,0);assert.equal(f.entries.get('pet-catch-v1'),queued);f.c.save();assert.deepEqual(f.writes,['pet-catch-v1-custom']);assert.equal(f.entries.get('pet-catch-v1'),queued);
});
