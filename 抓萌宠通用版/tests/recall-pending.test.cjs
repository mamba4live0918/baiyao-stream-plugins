const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),Core=require('../src/core.js');
function fixture(total,visible,held=0){
 const state=Core.fresh();state.outside=total;state.pendingKinds=Array.from({length:total-visible},(_,i)=>80+i%12);let pets=Array.from({length:visible},(_,i)=>({id:i,kind:i%12,held:i<held}));
 const context={Date};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/interactions.js'),'utf8')+';globalThis.Type=CowEffects;',context);const fx=Object.create(context.Type.prototype);
 const replenish=()=>{const plan=Core.rebalancePopulation(state,pets,visible);pets=plan.kept;for(let i=0;i<plan.missing;i++)pets.push({id:Math.random(),kind:state.pendingKinds.shift()??0});};
 const save=()=>{state.positions=pets.filter(p=>!p.dead).map(p=>({kind:p.kind,x:.5,y:.5}));};
 Object.assign(fx,{core:Core,kinds:{recall:['召回','只',10000,1]},cfg:{},canRun:()=>true,getState:()=>state,getCows:()=>pets,settle(){},sound(){},showCue(){},toast(){},renderStatus(){},updateGrip(){},save,refresh(){replenish();save();},sweepCollect(list){const n=Core.collect(state,list.length,Date.now(),list.map(p=>p.kind)),selected=new Set(list.slice(0,n));pets=pets.filter(p=>!selected.has(p));replenish();save();return n;}});
 return{fx,state,get pets(){return pets;}};
}
test('recall beyond the visible limit also collects waiting pets and cannot re-create them on replenish',()=>{
 const f=fixture(1000,240);assert.equal(f.fx.trigger('recall',1000),1000);assert.equal(f.state.outside,0);assert.equal(f.state.home,1000);assert.equal(f.pets.length,0);assert.equal(f.state.pendingKinds.length,0);
 assert.equal(f.fx.trigger('recall',1000),0);assert.equal(f.state.outside,0);assert.equal(f.state.home,1000);
});
test('partial recall preserves remaining waiting kinds and credits actual quantities only',()=>{
 const f=fixture(1000,240);assert.equal(f.fx.trigger('recall',400),400);assert.equal(f.state.outside,600);assert.equal(f.state.home,400);assert.equal(f.pets.length,240);
 assert.equal(f.state.pendingKinds.length,360);assert.equal(f.state.pendingKinds[0],80+(160+240)%12);
 assert.equal(Core.restore(JSON.stringify(f.state)).outside,600);
});
test('held pets remain outside while waiting pets can still be recalled',()=>{
 const f=fixture(1000,240,5);assert.equal(f.fx.trigger('recall',1000),995);assert.equal(f.state.outside,5);assert.equal(f.state.home,995);assert.equal(f.pets.length,5);assert(f.pets.every(p=>p.held));
});
test('gift multiplication can recall the total pool instead of silently stopping at ten thousand',()=>{
 const f=fixture(25000,500);assert.equal(f.fx.trigger('recall',10000,3),25000);assert.equal(f.state.outside,0);assert.equal(f.state.home,25000);
});
test('waiting collection consumes only credited kinds when the home counter reaches its cap',()=>{
 const state=Core.fresh();state.outside=10;state.home=999998;state.pendingKinds=[80,81,82,83,84];assert.equal(Core.collectPending(state,10,5,1000),2);assert.equal(state.home,1000000);assert.equal(state.outside,8);assert.deepEqual(state.pendingKinds,[82,83,84]);
 assert.equal(Core.collectPending(state,10,5,1000),0);assert.equal(state.outside,8);
});
test('remaining home capacity is reserved for visible pets before allocating recall to waiting pets',()=>{
 const f=fixture(10,5);f.state.home=999998;assert.equal(f.fx.trigger('recall',10),2);assert.equal(f.state.home,1000000);assert.equal(f.state.outside,8);
 assert.deepEqual(f.state.recentHomes.map(r=>r.kind),[0,1]);assert.equal(f.fx.trigger('recall',10),0);assert.equal(f.state.outside,8);
});
test('invalid counter inputs never turn collection into a negative quantity or overwrite existing state',()=>{
 for(const outside of [-1,NaN,100001]){const state=Core.fresh();state.outside=outside;const before=JSON.stringify(state);assert.equal(Core.collect(state,5),0);assert.equal(JSON.stringify(state),before);}
 for(const n of [-1,NaN,100001]){const state=Core.fresh();state.outside=10;assert.equal(Core.collectPending(state,n,5),0);assert.equal(state.outside,10);}
});
