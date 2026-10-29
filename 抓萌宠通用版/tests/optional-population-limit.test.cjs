const test=require('node:test'),assert=require('node:assert/strict');
const Core=require('../src/core.js'),Population=require('../src/population-view.js');
const row=(kind,token=0)=>({x:.25,y:.6,kind,windAttempt:token});
function scene(outside=10,initialLimit=null,options={}){
 const state=Core.fresh();state.outside=outside;const cows=[];let limit=initialLimit,serial=0;
 const view=new Population({core:Core,getState:()=>state,getCows:()=>cows,getLimit:()=>limit,snapshotCow:c=>row(c.kind,c.windAttempt),makeCow:(saved,grounded,kind)=>{const actor={...(saved||row(kind??0)),id:++serial};cows.push(actor);return actor;},...options});
 return{state,cows,view,setLimit:n=>{limit=n;},clean:plan=>cows.splice(0,cows.length,...plan.kept)};
}
test('optional planner caps visible members while leaving outside and source queues intact',()=>{
 const state=Core.fresh();state.outside=8;state.pendingKinds=[100,2000005];const a={id:1},b={id:2,held:true},c={id:3},dead={id:4,dead:true},before=JSON.stringify(state);
 const plan=Core.planPopulation(state,[a,b,c,dead,a],2);
 assert.deepEqual(plan.kept,[a,b]);assert.deepEqual(plan.parked,[c]);assert.equal(plan.missing,0);assert.equal(JSON.stringify(state),before);
 assert.deepEqual(Core.planPopulation(state,[a,b,c],null).kept,[a,b,c]);assert.equal(Core.planPopulation(state,[a],1000).missing,7);
});
test('limit validation accepts above500 and rejects malformed caps before mutating inputs',()=>{
 const state=Core.fresh();state.outside=100000;const before=JSON.stringify(state);
 for(const limit of [0,-1,1.5,100001,NaN,Infinity,'500',false])assert.throws(()=>Core.planPopulation(state,[],limit));
 assert.equal(Core.planPopulation(state,[],501).missing,501);assert.equal(Core.planPopulation(state,[],100000).missing,100000);
 assert.equal(Core.planPopulation(state,[],undefined).missing,100000);assert.equal(JSON.stringify(state),before);
});
test('real held members survive a lower cap, but ball-emerging members do not claim held priority',()=>{
 const state=Core.fresh();state.outside=4;const ball={id:1,held:true,ballEmerging:true},one={id:2,held:true},two={id:3,held:true},other={id:4};
 const plan=Core.planPopulation(state,[ball,one,two,other],1);
 assert.deepEqual(plan.kept,[one,two]);assert.deepEqual(plan.parked,[ball,other]);assert.equal(plan.missing,0);
 one.held=two.held=false;assert.deepEqual(Core.planPopulation(state,[one,two],1).parked,[two]);
});
test('lowering the view cap parks snapshots once and preserves identity before caller cleanup',()=>{
 const f=scene(8);f.view.restore([row(0,1),row(100,2),row(2000005,3),row(7,4),row(8,5),row(9,6)]);f.state.pendingKinds=[10,11];f.view.drain();
 f.cows[2].held=true;f.setLimit(2);const plan=f.view.rebalance();
 assert.deepEqual(plan.kept.map(c=>c.kind),[0,2000005]);assert.deepEqual(plan.parked.map(c=>c.kind),[100,7,8,9,10,11]);
 assert.deepEqual(f.view.restoring.map(p=>p.kind),[100,7,8,9,10,11]);assert.equal(f.state.positions.length,8);assert.equal(f.state.positions.filter(p=>p.kind===100).length,1);
 assert.equal(f.state.positions.find(p=>p.kind===100).windAttempt,2);assert.deepEqual(f.state.pendingKinds,[]);
 const again=f.view.rebalance();assert.deepEqual(again.parked,[]);assert.deepEqual(again.kept,plan.kept);assert.equal(f.view.restoring.length,6);
 f.clean(plan);assert.equal(f.state.outside,8);assert.equal(f.state.home,0);
});
test('parked snapshots retain all prior deferred positions without duplicating pending kinds across reload',()=>{
 const f=scene(200);f.view.restore(Array.from({length:150},(_,i)=>row(i<64?100:2000005,i)));f.state.pendingKinds=Array(50).fill(7);f.view.drain();
 f.setLimit(20);f.clean(f.view.rebalance());assert.equal(f.view.restoring.length,130);assert.equal(f.state.positions.length,150);assert.equal(f.state.pendingKinds.length,50);
 const saved=Core.restore(JSON.stringify(f.state));assert.equal(saved.positions.length,150);assert.equal(saved.pendingKinds.length,50);assert.equal(saved.positions.filter(p=>p.kind===100).length,64);
 const next=scene(200,20);Object.assign(next.state,saved);next.view.restore(saved.positions);assert.equal(next.view.drain().length,20);assert.equal(next.view.drain().length,0);assert.equal(next.state.positions.length,150);
 next.setLimit(null);for(let i=0;i<4;i++){next.view.beginFrame();next.view.drain();}
 assert.equal(next.cows.length,200);assert.equal(next.cows.filter(c=>c.kind===100).length,64);assert.equal(next.cows.filter(c=>c.kind===2000005).length,86);assert.equal(next.cows.filter(c=>c.kind===7).length,50);
});
test('higher limits and disabled limits replenish vacancies under the same frame budget',()=>{
 const f=scene(1000,10);f.state.pendingKinds=Array(1000).fill(2000005);assert.equal(f.view.drain().length,10);
 f.setLimit(80);assert.equal(f.view.drain().length,54);assert.equal(f.view.drain().length,0);f.view.beginFrame();assert.equal(f.view.drain().length,16);
 f.setLimit(null);f.view.beginFrame();assert.equal(f.view.drain().length,64);assert.equal(f.state.pendingKinds.length,856);assert.equal(f.state.outside,1000);
});
test('visible collection fills exactly one vacancy and does not recreate the collected identity',()=>{
 const f=scene(4,2);f.view.restore([row(0,1),row(7,2),row(100,3),row(2000005,4)]);f.view.drain();
 const first=f.cows.shift();first.dead=true;Core.collect(f.state,1,Date.now(),[first.kind]);assert.equal(f.view.drain().length,1);assert.equal(f.cows.length,2);
 assert.deepEqual(f.cows.map(c=>c.kind),[7,100]);assert.deepEqual(f.view.restoring.map(p=>p.kind),[2000005]);assert.equal(f.state.outside,3);assert.equal(f.state.home,1);
});
test('full visible cap does not block box settlement or discard queued avatar rewards',()=>{
 const f=scene(2,2);f.view.restore([row(0),row(7)]);f.view.drain();f.state.avatarKinds=[{kind:1000000,url:'https://example.com/a.png',name:'Viewer',fallbackKind:0}];
 f.state.current={id:1,count:7,success:true,applied:false,avatarKind:1000000};assert.equal(Core.resolve(f.state),7);
 assert.deepEqual(f.view.admitNew(7,()=>assert.fail('full visible cap')),[]);assert.equal(Core.resolve(f.state),0);assert.deepEqual(f.state.pendingKinds,Array(7).fill(1000000));assert.equal(f.state.outside,9);
 const first=f.cows.shift();Core.collect(f.state,1,Date.now(),[first.kind]);f.view.beginFrame();assert.equal(f.view.drain().length,1);assert.equal(f.cows[1].kind,1000000);assert.equal(f.state.pendingKinds.length,6);
});
test('new rewards use only remaining visible slots and cannot borrow old deferred identities',()=>{
 const f=scene(200,55,{reserve:()=>16});f.view.restore(Array.from({length:100},()=>row(100)));assert.equal(f.view.drain().length,48);
 const made=f.view.admitNew(20,i=>{const c={...row(2000005,i),id:1000+i};f.cows.push(c);return c;});
 assert.equal(made.length,7);assert.equal(f.cows.length,55);assert.equal(f.view.restoring.length,52);assert.equal(f.view.budget,9);assert.equal(f.view.drain().length,0);assert.equal(f.state.outside,200);
});
test('waiting recall at the cap consumes parked identities only to actual home capacity',()=>{
 const f=scene(6);f.view.restore([row(0),row(1),row(100),row(2000005),row(7),row(8)]);f.view.drain();f.setLimit(2);f.clean(f.view.rebalance());f.state.home=999998;
 assert.equal(f.view.collectWaiting(100,2,Date.now()),2);assert.deepEqual(f.state.recentHomes.map(r=>[r.kind,r.count]),[[100,1],[2000005,1]]);assert.deepEqual(f.view.restoring.map(p=>p.kind),[7,8]);
 assert.equal(f.view.collectWaiting(100,2,Date.now()),0);assert.equal(f.state.outside,4);assert.equal(f.state.positions.length,4);
});
test('released held members become parkable and every rebalance excludes dead or previously parked actors',()=>{
 const f=scene(4);f.view.restore([row(0),row(1),row(7),row(8)]);f.view.drain();f.cows[0].held=f.cows[1].held=true;f.setLimit(1);
 const first=f.view.rebalance();assert.deepEqual(first.kept.map(c=>c.kind),[0,1]);f.clean(first);f.cows[0].held=f.cows[1].held=false;
 const second=f.view.rebalance();assert.deepEqual(second.kept.map(c=>c.kind),[0]);assert.deepEqual(second.parked.map(c=>c.kind),[1]);assert.equal(f.view.restoring.length,3);
 f.clean(second);f.cows[0].dead=true;assert.deepEqual(f.view.rebalance().kept,[]);
});
test('an invalid cap or invalid parked snapshot cannot partially transfer queue ownership',()=>{
 const f=scene(3);f.view.restore([row(0),row(7),row(100)]);f.view.drain();const before=JSON.stringify(f.state);f.setLimit(0);
 assert.throws(()=>f.view.rebalance(),/场内最高数量/);assert.equal(JSON.stringify(f.state),before);assert.equal(f.view.restoring.length,0);
 f.setLimit(1);f.view.snapshotCow=c=>c.kind===100?{x:NaN,y:.5,kind:100}:row(c.kind);assert.throws(()=>f.view.rebalance(),/快照无效/);assert.equal(f.view.restoring.length,0);assert.equal(JSON.stringify(f.state),before);
});
