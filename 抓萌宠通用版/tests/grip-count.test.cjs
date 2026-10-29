const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const C=require('../src/core.js'),source=fs.readFileSync(path.join(__dirname,'../src/interactions.js'),'utf8');
function element(){const attrs=new Map(),classes=new Set();return{style:{},dataset:{},listeners:{},value:'',checked:false,append(){},setAttribute:(k,v)=>attrs.set(k,v),removeAttribute:k=>attrs.delete(k),hasAttribute:k=>attrs.has(k),addEventListener(k,fn){this.listeners[k]=fn;},getBoundingClientRect:()=>({x:0,y:0,width:100,height:40}),setPointerCapture(){},releasePointerCapture(){},classList:{add:k=>classes.add(k),remove:k=>classes.delete(k),toggle(){},contains:k=>classes.has(k)}};}
function fixture(saved={}){
 const nodes=new Map(),storage=new Map([['pet-catch-effects-v1',JSON.stringify(saved)]]),state=C.fresh(),pets=[],notices=[],clock={now:Date.now()};
 const $=id=>{if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);};
 const document={createElement:element,body:element(),getElementById:$,querySelectorAll:()=>[],addEventListener(){}};
 const context={document,Date:{now:()=>clock.now},innerWidth:1280,innerHeight:720,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)}};
 vm.runInNewContext(source+';globalThis.Type=CowEffects;',context);
 const Type=context.Type,bind=Type.prototype.bind;
 Type.prototype.bind=()=>{};Type.prototype.renderRules=()=>{};Type.prototype.syncInputs=()=>{};Type.prototype.applyLivePreset=()=>{};
 const fx=new Type({core:C,getState:()=>state,getCows:()=>pets,save(){},refresh(){},toast:t=>notices.push(t),sound(){}});
 fx.showCue=()=>{};fx.renderStatus=()=>{};
 return{fx,state,pets,clock,storage,notices,$,bind:()=>bind.call(fx)};
}
const pet=(id,x,y=100,extra={})=>({id,kind:id,x,y,hopLift:0,el:{...element(),dataset:{id:String(id)}},...extra});
const ids=list=>Array.from(list,p=>p.id);
test('old and invalid grip settings keep one pet; valid counts survive reload',()=>{
 for(const value of [undefined,null,0,-1,501,1.5,'5'])assert.equal(fixture({gripCount:value}).fx.cfg.gripCount,1);
 const f=fixture({gripCount:20});assert.equal(f.fx.cfg.gripCount,20);f.fx.saveConfig();
 assert.equal(fixture(JSON.parse(f.storage.get('pet-catch-effects-v1'))).fx.cfg.gripCount,20);
});
test('only active enhanced grip selects nearby pets, with the clicked pet first',()=>{
 const f=fixture({gripCount:3,gripRadius:100});f.pets.push(pet(1,180),pet(2,105),pet(3,120),pet(4,125),pet(5,210));
 assert.deepEqual(ids(f.fx.pickForDrag(f.pets[0],100,100)),[1]);assert.deepEqual(ids(f.fx.pickForDrag(null,100,100)),[]);
 f.state.interactions.gripUntil=f.clock.now+1000;
 assert.deepEqual(ids(f.fx.pickForDrag(f.pets[0],100,100)),[1,2,3]);
 assert.deepEqual(ids(f.fx.pickForDrag(null,100,100)),[2,3,4]);
 f.clock.now+=1000;assert.deepEqual(ids(f.fx.pickForDrag(f.pets[0],100,100)),[1]);
 f.fx.cfg.gripAlways=true;assert.deepEqual(ids(f.fx.pickForDrag(f.pets[0],100,100)),[1,2,3]);
});
test('grip uses visible hopping positions, skips unavailable pets, and never fills from outside its radius',()=>{
 const f=fixture({gripCount:20,gripRadius:30,gripAlways:true});
 f.pets.push(pet(1,160),pet(2,105),pet(3,110,150,{hopLift:-50}),pet(4,120,100,{dead:true}),pet(5,120,100,{held:true}),pet(6,120,100,{windActive:true}),pet(7,120,100,{ballEmerging:true}),pet(8,131));
 assert.deepEqual(ids(f.fx.pickForDrag(f.pets[0],100,100)),[1,2,3]);
 assert.deepEqual(ids(f.fx.pickForDrag(f.pets[3],100,100)),[]);
 assert.equal(f.pets[2].hopLift,-50);assert.deepEqual(ids(f.pets),[1,2,3,4,5,6,7,8]);
 f.fx.cfg.gripCount=1;assert.deepEqual(ids(f.fx.pickForDrag(f.pets[0],100,100)),[1]);
 f.fx.cfg.gripCount=500;f.pets.splice(0,f.pets.length,...Array.from({length:600},(_,i)=>pet(i,100)));
 assert.equal(f.fx.pickForDrag(f.pets[0],100,100).length,500);
});
test('invalid count input does not change or save the active setting',()=>{
 const f=fixture({gripCount:5});f.bind();const el=f.$('gripCount');
 for(const input of ['', '0','501','1.5','abc']){el.value=input;el.listeners.input();assert.equal(f.fx.cfg.gripCount,5);assert(el.hasAttribute('aria-invalid'));}
 el.listeners.blur();assert.equal(Number(el.value),5);
 el.value='12';el.listeners.input();assert.equal(f.fx.cfg.gripCount,12);assert.equal(JSON.parse(f.storage.get('pet-catch-effects-v1')).gripCount,12);
});
test('gift quantities extend duration, not the per-grab pet count',()=>{
 const f=fixture({gripCount:4});f.fx.trigger('grip',10,3);
 assert.equal(f.state.interactions.gripUntil,f.clock.now+30000);assert.equal(f.fx.cfg.gripCount,4);
 f.fx.trigger('grip',5,2);assert.equal(f.state.interactions.gripUntil,f.clock.now+40000);
 assert.equal(C.restore(JSON.stringify(f.state)).interactions.gripUntil,f.state.interactions.gripUntil);
});
test('pointer drag moves and settles the selected batch once; cancellation credits nothing',()=>{
 const f=fixture({gripCount:3,gripRadius:100,gripAlways:true});f.pets.push(pet(1,100),pet(2,120),pet(3,140),pet(4,260));f.state.outside=4;
 const field=element(),pen=element(),events={},window={addEventListener:(key,fn)=>events[key]=fn};let saved=0;
 const context={C,cows:f.pets,residentCows:[],effects:f.fx,drag:null,hud:null,H:720,window,$:id=>id==='field'?field:pen,unlockAudio(){},sound(){},renderCow(){},confineCow(){},replenish(){},save(){saved++;},inPen:(x,y)=>x===300&&y===300,collectCows:list=>{const n=C.collect(f.state,list.length,Date.now(),list.map(p=>p.kind));list.slice(0,n).forEach(p=>p.dead=true);return n;}};
 const app=fs.readFileSync(path.join(__dirname,'../src/app.js'),'utf8'),start=app.indexOf('function releaseDrag('),end=app.indexOf('function showPhase(',start);
 vm.runInNewContext(app.split('\n').find(s=>s.startsWith('function allActors('))+'\n'+app.slice(start,end),context);
 const down=(id=1)=>({button:0,isPrimary:true,pointerId:7,clientX:100,clientY:100,target:{closest:()=>f.pets.find(p=>p.id===id)?.el},preventDefault(){}});
 field.listeners.pointerdown(down());assert.deepEqual(ids(context.drag.list),[1,2,3]);assert(f.pets.slice(0,3).every(p=>p.held));
 field.listeners.pointermove({pointerId:7,clientX:300,clientY:300});assert.deepEqual(f.pets.slice(0,3).map(p=>p.x),[300,320,340]);
 f.fx.cfg.gripAlways=false;field.listeners.pointerup({pointerId:7});assert.equal(f.state.home,3);assert.equal(f.state.outside,1);assert(f.pets.every(p=>!p.held));
 field.listeners.pointerup({pointerId:7});assert.equal(f.state.home,3);
 f.fx.cfg.gripAlways=true;f.pets[3].x=100;f.pets.push(pet(5,110),pet(6,120));C.add(f.state,2);
 field.listeners.pointerdown(down(4));assert.equal(context.drag.list.length,3);field.listeners.pointercancel({pointerId:7});
 assert.equal(f.state.home,3);assert.equal(f.state.outside,3);assert.equal(context.drag,null);assert(f.pets.every(p=>!p.held));assert(saved>0);
});
test('a released batch respects a scene limit lowered while the pets were held',()=>{
 const f=fixture({gripCount:3,gripRadius:100,gripAlways:true});f.pets.push(pet(1,100),pet(2,120),pet(3,140));f.state.outside=3;
 const field=element(),pen=element(),context={C,cows:f.pets,residentCows:[],effects:f.fx,drag:null,hud:null,H:720,limit:3,window:{addEventListener(){}},$:id=>id==='field'?field:pen,unlockAudio(){},sound(){},renderCow(){},confineCow(){},save(){},inPen:()=>false};
 context.replenish=()=>{const plan=C.rebalancePopulation(f.state,context.cows,context.limit);context.cows=plan.kept;};
 f.fx.getCows=()=>context.cows;
 const app=fs.readFileSync(path.join(__dirname,'../src/app.js'),'utf8');
 vm.runInNewContext(app.split('\n').find(s=>s.startsWith('function allActors('))+'\n'+app.slice(app.indexOf('function releaseDrag('),app.indexOf('function showPhase(')),context);
 field.listeners.pointerdown({button:0,isPrimary:true,pointerId:1,clientX:100,clientY:100,target:{closest:()=>f.pets[0].el},preventDefault(){}});
 context.limit=1;context.replenish();assert.equal(context.cows.length,3);
 field.listeners.pointercancel({pointerId:1});
 assert.equal(context.cows.length,1);assert.equal(context.cows[0].held,false);
 assert.equal(f.state.pendingKinds.length,2);assert.equal(f.state.outside,3);assert.equal(f.state.home,0);
});
