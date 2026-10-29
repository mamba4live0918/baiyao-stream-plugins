const test=require('node:test'),assert=require('node:assert/strict');
const Core=require('../src/core.js'),Box=require('../src/blind-box.js');
const kinds=[0,60,94,100,999999,1000000,1999999,2000000,2000007,2099999];
const positions=n=>Array.from({length:n},(_,i)=>({x:(i%100)/100,y:.6,kind:kinds[i%kinds.length],windAttempt:i}));

test('unlimited planning retains every living member above500 and computes the missing outside population',()=>{
 assert.equal(typeof Core.planPopulation,'function');
 const s=Core.fresh();s.outside=2000;s.home=40;s.pendingKinds=Array(1200).fill(2000005);
 const alive=positions(800).map((p,i)=>({...p,id:i,held:i===799})),dead={id:900,kind:100,dead:true},before=JSON.stringify(s);
 const plan=Core.planPopulation(s,[...alive,dead]);assert.equal(plan.kept.length,800);assert.deepEqual(plan.kept,alive);assert.deepEqual(plan.parked,[]);assert.equal(plan.missing,1200);assert.equal(plan.kept.at(-1).held,true);assert.equal(JSON.stringify(s),before);
 assert.deepEqual(Core.rebalancePopulation(s,alive),plan);
});

test('population target follows outside dynamically, never parks held members and never mutates source kinds',()=>{
 const s=Core.fresh(),one={id:1,kind:100,held:true},two={id:2,kind:2000007};s.outside=100000;s.pendingKinds=[1000000,100,2000007];
 const input=[one,two],before=structuredClone(input);assert.equal(Core.planPopulation(s,input).missing,99998);assert.deepEqual(input,before);
 s.outside=1;const plan=Core.planPopulation(s,input);assert.deepEqual(plan.kept,input);assert.equal(plan.missing,0);assert.deepEqual(plan.parked,[]);assert.deepEqual(s.pendingKinds,[1000000,100,2000007]);
 for(const outside of [-1,NaN,Infinity,100001,1.5])assert.throws(()=>Core.planPopulation({...s,outside},input));
});

test('duplicate object references do not become duplicate residents, while separate coincident pets remain distinct',()=>{
 const s=Core.fresh();s.outside=3;const a={x:.5,y:.5,kind:100},b={x:.5,y:.5,kind:100};
 const plan=Core.planPopulation(s,[null,a,a,b,undefined,{dead:true},'bad']);assert.deepEqual(plan.kept,[a,b]);assert.equal(plan.missing,1);
});

test('two thousand saved positions survive reload with every logical kind and windAttempt exactly once',()=>{
 const s=Core.fresh();s.outside=2000;s.positions=positions(2000);s.pendingKinds=[];
 const restored=Core.restore(JSON.stringify(s));assert(restored);assert.equal(restored.positions.length,2000);assert.deepEqual(restored.positions,s.positions);assert.equal(new Set(restored.positions.map(p=>p.windAttempt)).size,2000);
 assert.equal(Core.planPopulation(restored,restored.positions).missing,0);assert.deepEqual(restored.pendingKinds,[]);assert.equal(restored.outside,2000);assert.equal(restored.home,0);
 const twice=Core.restore(JSON.stringify(restored));assert.deepEqual(twice.positions,s.positions);assert.equal(twice.positions.length,2000);
});

test('restore filters malformed positions before the ledger cap without deduplicating valid coincident members',()=>{
 const s=Core.fresh();s.outside=3;s.positions=[null,{x:2,y:.5,kind:0},{x:.2,y:.5,kind:-1},...positions(4)];s.pendingKinds=[100,2000000];
 const restored=Core.restore(JSON.stringify(s));assert(restored);assert.deepEqual(restored.positions,positions(3));assert.deepEqual(restored.pendingKinds,[]);
 const identical=Core.fresh();identical.outside=700;identical.positions=Array.from({length:700},()=>({x:.5,y:.5,kind:100}));assert.equal(Core.restore(JSON.stringify(identical)).positions.length,700);
 identical.outside=0;assert.equal(Core.restore(JSON.stringify(identical)).positions.length,0);
});

test('unapplied box reservations do not inflate the live target, and source/history namespaces remain intact',()=>{
 const s=Core.fresh();s.outside=2050;s.home=3;s.positions=positions(2000);s.pendingKinds=Array.from({length:50},(_,i)=>kinds[i%kinds.length]);const now=Date.now();s.recentHomes=[100,1000000,2000005].map(kind=>({kind,count:1,at:now}));
 const avatar=Core.registerAvatar(s,'https://example.com/viewer.png','Viewer',2000005),tier={id:'queued',name:'Keep source',gift:'Gift',mode:'fixed',count:73,min:73,max:73,enabled:true};Core.enqueueBox(s,2,avatar,tier,Box);Core.startBox(s,()=>0,[],undefined,Box);
 const restored=Core.restore(JSON.stringify(s));assert(restored);assert.equal(restored.positions.length,2000);assert.equal(Core.planPopulation(restored,restored.positions).missing,50);assert.equal(restored.positions.length+restored.pendingKinds.length,restored.outside);assert.equal(Core.availableSlots(restored),100000-2050-73);
 assert.deepEqual(restored.recentHomes.map(r=>r.kind),[100,1000000,2000005]);assert.equal(restored.roundSources[0].kind,avatar);assert.equal(restored.roundSources[0].box.id,'queued');assert.equal(restored.current.avatarKind,avatar);
 assert.equal(Core.resolve(restored),73);assert.equal(Core.planPopulation(restored,restored.positions).missing,123);assert.equal(restored.pendingKinds.length,123);assert.equal(Core.resolve(restored),0);
 const after=Core.restore(JSON.stringify(restored));assert.equal(after.positions.length+after.pendingKinds.length,after.outside);assert.equal(after.outside,2123);assert.equal(after.current.applied,true);
});

test('successive small spawn batches can reach the full outside population without dropping or repeating pending kinds',()=>{
 const s=Core.fresh();s.outside=2000;s.pendingKinds=Array.from({length:2000},(_,i)=>kinds[i%kinds.length]);const original=s.pendingKinds.slice(),alive=[];let passes=0;
 while(Core.planPopulation(s,alive).missing){const plan=Core.planPopulation(s,alive),batch=Math.min(48,plan.missing);assert.equal(plan.parked.length,0);for(let i=0;i<batch;i++)alive.push({id:alive.length,kind:s.pendingKinds.shift()});passes++;assert.equal(alive.length+s.pendingKinds.length,s.outside);}
 assert.equal(alive.length,2000);assert.deepEqual(alive.map(p=>p.kind),original);assert.equal(s.pendingKinds.length,0);assert(passes>1);assert.equal(s.home,0);
});
