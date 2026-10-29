const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const core=require('../src/core.js');
let View;try{View=require('../src/population-view.js');}catch{}
const position=(kind=7,i=0)=>({x:(i%100)/100,y:.6,kind,windAttempt:i});
function fixture(outside=2000,options={}){
 assert.equal(typeof View,'function','population view module exists');
 const state=core.fresh();state.outside=outside;const cows=[],calls=[];
 const makeCow=(saved,grounded,kind)=>{calls.push({saved,grounded,kind});const actor={...(saved||position(kind??3)),id:cows.length+1};cows.push(actor);return actor;};
 const view=new View({core,getState:()=>state,getCows:()=>cows,makeCow,snapshotCow:c=>position(c.kind,c.windAttempt),...options});
 return{view,state,cows,calls};
}
test('2000 restored positions retain kind and wind token across a partial mount, snapshot and reload',()=>{
 const f=fixture(),rows=Array.from({length:2000},(_,i)=>position(i%95,i));f.view.restore(rows);rows[100].kind=999;
 assert.equal(f.view.drain(true).length,64);assert.equal(f.view.restoring.length,1936);assert.equal(f.state.positions.length,2000);
 assert.equal(f.state.positions[100].kind,5);const restored=core.restore(JSON.stringify(f.state));assert.equal(restored.positions.length,2000);
 assert.deepEqual(restored.positions,f.state.positions);assert.equal(f.state.outside,2000);assert.equal(f.state.home,0);
});
test('waiting recall consumes exact restored kinds and leaves no ghost positions',()=>{
 const f=fixture(200);f.view.restore(Array.from({length:200},(_,i)=>position(i<64?1:7,i)));f.view.drain();
 assert.equal(f.view.collectWaiting(100,64,Date.now()),100);assert.equal(f.view.restoring.length,36);assert.equal(f.state.positions.length,100);
 assert.deepEqual(f.state.pendingKinds,[]);assert.deepEqual(f.state.recentHomes.map(r=>[r.kind,r.count]),[[7,100]]);
 f.view.beginFrame();assert.equal(f.view.drain().length,36);assert.equal(f.cows.length,100);assert.equal(f.state.outside,100);
});
test('home capacity and invalid recall consume only the actually credited prefix',()=>{
 const f=fixture(20);f.view.restore([position(7),position(8),position(9)]);f.state.pendingKinds=[11,12];f.state.home=999998;
 assert.equal(f.view.collectWaiting(100,0,Date.now()),2);assert.deepEqual(f.view.restoring.map(p=>p.kind),[9]);assert.deepEqual(f.state.pendingKinds,[11,12]);
 const before=JSON.stringify([f.view.restoring,f.state.pendingKinds]);assert.equal(f.view.collectWaiting(-1,0,Date.now()),0);assert.equal(f.view.collectWaiting(2,0,Date.now()),0);assert.equal(JSON.stringify([f.view.restoring,f.state.pendingKinds]),before);
});
test('recall crosses from restored positions to explicit pending kinds without duplicate ownership',()=>{
 const f=fixture(5);f.view.restore([position(7),position(8)]);f.state.pendingKinds=[9,10,11];
 assert.equal(f.view.collectWaiting(4,0,Date.now()),4);assert.deepEqual(f.view.restoring,[]);assert.deepEqual(f.state.pendingKinds,[11]);assert.deepEqual(f.state.recentHomes.map(r=>r.kind),[7,8,9,10]);
});
test('1000 explicit kinds consume only successful mounts and drain calls share one frame budget',()=>{
 const f=fixture(1000);f.state.pendingKinds=Array.from({length:1000},(_,i)=>i%95);
 assert.equal(f.view.drain().length,64);assert.equal(f.view.drain().length,0);assert.equal(f.state.pendingKinds.length,936);assert.equal(f.state.pendingKinds[0],64);
 f.view.beginFrame();assert.equal(f.view.drain().length,64);assert.equal(f.state.outside,1000);assert.equal(f.state.positions.length,128);
});
test('reserved budget leaves 16 award slots and admitNew never consumes old queues or counts',()=>{
 const f=fixture(200,{reserve:()=>16});f.view.restore(Array.from({length:100},()=>position(7)));f.state.pendingKinds=[8,9];
 assert.equal(f.view.drain().length,48);assert.equal(f.view.drain().length,0);const pending=JSON.stringify(f.state.pendingKinds);
 const added=f.view.admitNew(30,i=>{const c={...position(20,i),id:100+i};f.cows.push(c);return c;});assert.equal(added.length,16);assert.equal(f.view.restoring.length,52);
 assert.equal(JSON.stringify(f.state.pendingKinds),pending);assert.equal(f.state.outside,200);assert.equal(f.view.admitNew(1,()=>assert.fail('budget exhausted')).length,0);assert.equal(f.state.positions.length,116);
});
test('failed creation does not consume its source; prior successes remain synchronized',()=>{
 const f=fixture(10);f.state.pendingKinds=[7,8,9];let attempts=0;
 f.view.makeCow=(saved,grounded,kind)=>{if(++attempts===2)throw Error('decode');const c=position(kind);f.cows.push(c);return c;};
 assert.throws(()=>f.view.drain(),/decode/);assert.deepEqual(f.state.pendingKinds,[8,9]);assert.equal(f.state.positions.length,1);
 f.view.makeCow=()=>null;assert.deepEqual(f.view.drain(),[]);assert.deepEqual(f.state.pendingKinds,[8,9]);
});
test('failed waiting collection restores queue ownership',()=>{
 const f=fixture(5,{core:{...core,collectPending(){throw Error('failed');}}});f.view.restore([position(7)]);f.state.pendingKinds=[8];
 assert.throws(()=>f.view.collectWaiting(1,0),/failed/);assert.deepEqual(f.view.restoring.map(p=>p.kind),[7]);assert.deepEqual(f.state.pendingKinds,[8]);
});
test('retire, clear, validation and repeated coordinates preserve only legal position records',()=>{
 const f=fixture(5);f.view.restore([position(7),position(7),{...position(),x:NaN},{...position(),kind:-1},position(8)]);
 assert.equal(f.view.restoring.length,3);f.view.retireKind(7,0);assert.deepEqual(f.view.snapshotPositions().map(p=>p.kind),[0,0,8]);
 f.view.drain();const outside=f.state.outside;f.view.clear();assert.deepEqual(f.view.restoring,[]);assert.equal(f.view.budget,64);assert.equal(f.state.outside,outside);
});
test('all 2000 members eventually mount without the former 500 limit or counter mutation',()=>{
 const f=fixture();f.view.restore(Array.from({length:2000},(_,i)=>position(i%95,i)));let frames=0;
 while(f.cows.length<2000&&frames++<100){f.view.beginFrame();f.view.drain();}
 assert.equal(f.cows.length,2000);assert.equal(frames,32);assert.equal(f.view.restoring.length,0);assert.equal(f.state.outside,2000);assert.equal(f.state.serial,0);assert.equal(f.state.home,0);
});
test('browser UMD exports the same isolated constructor',()=>{
 const context={};vm.runInNewContext(fs.readFileSync(require.resolve('../src/population-view.js'),'utf8'),context);assert.equal(typeof context.PetPopulationView,'function');
});
test('the full 100000-position boundary clones and preserves duplicate coordinates without stack spreading',()=>{
 const f=fixture(100000),rows=Array.from({length:100001},()=>position(7));f.view.restore(rows);assert.equal(f.view.restoring.length,100000);
 f.view.drain();assert.equal(f.state.positions.length,100000);assert.equal(f.view.restoring.length,99936);assert.equal(f.cows.length,64);
 rows[100].kind=8;assert.equal(f.state.positions[100].kind,7);assert.equal(f.state.outside,100000);
});
test('avatar recycling sees mounted, deferred positions and pending kinds after each batch',()=>{
 const f=fixture(1000);f.view.restore(Array.from({length:500},(_,i)=>position(i<64?1000000:1000001,i)));f.state.pendingKinds=[1000003];
 f.state.avatarKinds=Array.from({length:1000},(_,i)=>({kind:1000000+i,url:'https://example.com/'+i+'.png',name:'Viewer '+i,fallbackKind:0}));
 f.view.drain();assert.equal(core.registerAvatar(f.state,'https://example.com/new.png','New'),1000002);
 assert.equal(f.state.avatarKinds.find(r=>r.kind===1000000).url,'https://example.com/0.png');assert.equal(f.state.avatarKinds.find(r=>r.kind===1000001).url,'https://example.com/1.png');
});
test('dead actors are omitted, invalid admission is inert, and custom batch sizes reset per frame',()=>{
 const f=fixture(5,{batchSize:2});f.cows.push({...position(1),dead:true});assert.deepEqual(f.view.admitNew(NaN,()=>assert.fail()),[]);
 assert.equal(f.view.drain().length,2);assert.equal(f.state.positions.length,2);assert.equal(f.view.budget,0);f.view.beginFrame();assert.equal(f.view.budget,2);
 f.view.makeCow=()=>null;const previous=JSON.stringify(f.state);assert.deepEqual(f.view.drain(),[]);assert.equal(JSON.stringify(f.state),previous);
});
