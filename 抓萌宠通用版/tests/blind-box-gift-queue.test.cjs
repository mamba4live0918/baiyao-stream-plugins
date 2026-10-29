const test=require('node:test'),assert=require('node:assert/strict');
const Box=require('../src/blind-box.js'),Core=require('../src/core.js');
const tier=(id='rose',extra={})=>({id,name:'玫瑰礼盒',gift:'玫瑰',mode:'fixed',count:7,min:7,max:7,enabled:true,...extra});

test('per-gift tiers have no fixed row cap, accept duplicate counts and canonicalize the active amount mode',()=>{
 const rows=Array.from({length:1501},(_,i)=>tier('tier-'+i,{gift:'',count:15000}));
 const safe=Box.validateTiers(rows);assert.equal(safe.length,1501);assert.equal(safe[0].max,15000);assert.equal(safe[0].min,15000);
 const random=Box.validateTiers([tier('range',{mode:'random',count:'inactive',min:3,max:90000})])[0];assert.equal(random.count,3);assert.equal(random.max,90000);
 assert.deepEqual(Box.validateTiers([tier('disabled',{enabled:false})])[0].enabled,false);
 for(const row of [tier('bad',{count:100001}),tier('bad',{mode:'random',min:8,max:7}),tier('bad',{mode:'random',min:0,max:1}),tier('bad',{mode:'unknown'})])assert.throws(()=>Box.validateTiers([row]));
});

test('gift names use NFKC matching and only active nonblank duplicate bindings conflict',()=>{
 const rows=Box.validateTiers([tier('wide',{gift:' ＡＢＣ '}),tier('off',{gift:'ABC',enabled:false}),tier('manual',{gift:''})]);assert.equal(rows[0].gift,'ABC');
 assert.equal(Box.tierForGift(rows,' ＡＢＣ ').id,'wide');assert.equal(Box.tierForGift(rows,''),null);assert.equal(Box.tierForGift(rows,'unknown'),null);
 assert.throws(()=>Box.validateTiers([tier('one',{gift:'Ａ'}),tier('two',{gift:'A'})]));
 for(const gift of ['a\nb','a'.repeat(101),42])assert.throws(()=>Box.validateTiers([tier('bad',{gift})]));
});

test('legacy and interim probability pools migrate to independent unbound fixed tiers without losing names',()=>{
 const old=[{id:'a',count:73,enabled:true},{id:'b',name:'保留名字',count:73,chance:2500,enabled:false}],before=structuredClone(old),migrated=Box.migrate(old);
 assert.deepEqual(old,before);assert.equal(migrated[0].name,'73 只');assert.equal(migrated[1].name,'保留名字');assert(migrated.every(r=>r.gift===''&&r.mode==='fixed'&&r.min===r.count&&r.max===r.count));assert.equal(migrated[1].enabled,false);
});

test('snapshot isolates immutable gift settings and range rolls cover both inclusive endpoints',()=>{
 const source=tier('r',{mode:'random',min:10001,max:90000}),snap=Box.snapshot(source);source.name='Changed';source.max=2;assert.equal(snap.name,'玫瑰礼盒');assert.equal(snap.max,90000);
 assert.equal(Box.roll(snap,()=>0),10001);assert.equal(Box.roll(snap,()=>1),90000);assert.equal(Box.roll(tier(),()=>{throw Error('Fixed must not draw');}),7);
 const rows=[tier('small',{gift:'',count:2}),tier('big',{gift:'',mode:'random',min:1,max:500})];assert.equal(Box.choose(rows,100,'big',()=>0),null);assert.equal(Box.choose(rows,100,undefined,()=>.999).id,'small');
});

test('bound and generic source batches never merge into or overwrite one another',()=>{
 const s=Core.fresh(),one=tier();assert.equal(typeof Core.enqueueBox,'function');
 assert.equal(Core.enqueueBox(s,2,0,one,Box),2);Core.enqueueBox(s,3,0,one,Box);Core.enqueue(s,1);Core.enqueueBox(s,1,0,one,Box);
 assert.deepEqual(s.roundSources.map(r=>[r.count,r.box?.id||null]),[[5,'rose'],[1,null],[1,'rose']]);assert.equal(s.queue,7);
 one.name='new';Core.enqueueBox(s,1,0,one,Box);assert.equal(s.roundSources.length,4);assert.equal(s.roundSources[0].box.name,'玫瑰礼盒');
 const before=structuredClone(s);assert.equal(Core.enqueueBox(s,1,0,tier('off',{enabled:false}),Box),0);assert.deepEqual(s,before);
});

test('arrival snapshots survive tier deletion and random quantities roll exactly once at start',()=>{
 const s=Core.fresh(),avatar=Core.registerAvatar(s,'https://example.com/a.png','A',2000005),bound=tier('r',{mode:'random',min:20000,max:30000});Core.enqueueBox(s,2,avatar,bound,Box);bound.name='Changed';bound.max=3;
 let draws=0;const current=Core.startBox(s,()=>{draws++;return .5;},[],undefined,Box);assert.equal(draws,1);assert.equal(current.count,25000);assert.equal(current.boxName,'玫瑰礼盒');assert.equal(current.box.max,30000);assert.equal(current.avatarKind,avatar);assert.equal(s.queue,1);
 const restored=Core.restore(JSON.stringify(s));assert(restored);assert.equal(restored.current.count,25000);assert.equal(restored.current.box.name,'玫瑰礼盒');assert.equal(Core.startBox(restored,()=>{throw Error('No reroll');},[],undefined,Box).count,25000);
 assert.equal(Core.resolve(restored),25000);const again=Core.restore(JSON.stringify(restored));assert.equal(Core.resolve(again),0);assert.equal(again.outside,25000);assert.equal(again.roundSources[0].box.max,30000);
});

test('a range that cannot fully fit blocks the front box without rolling, skipping or reducing its reward',()=>{
 const s=Core.fresh();s.outside=99950;Core.enqueueBox(s,1,0,tier('large',{mode:'random',min:1,max:100}),Box);Core.enqueueBox(s,1,0,tier('small',{gift:'',count:2}),Box);
 const before=structuredClone(s);assert.equal(Core.startBox(s,()=>{throw Error('Blocked box must not roll');},[tier('other',{count:1})],undefined,Box),null);assert.deepEqual(s,before);
 s.outside=99900;assert.equal(Core.startBox(s,()=>1,[],undefined,Box).count,100);assert.equal(s.current.tierId,'large');assert.equal(Core.resolve(s),100);assert.equal(s.outside,100000);assert.equal(s.queue,1);
});

test('bound gifts are cloned at receive time, deduplicate by event and restore independently of live settings',()=>{
 const s=Core.fresh(),box=tier();const gift={name:'玫瑰',kind:'box',count:2,eid:'evt',box};assert.equal(Core.receiveGift(s,gift),'accepted');box.name='late edit';assert.equal(s.pendingGifts[0].box.name,'玫瑰礼盒');
 assert.equal(Core.receiveGift(s,gift),'duplicate');const restored=Core.restore(JSON.stringify(s));assert(restored);assert.equal(restored.pendingGifts[0].kind,'box');assert.equal(restored.pendingGifts[0].box.count,7);
 assert.equal(Core.receiveGift(s,{name:'玫瑰',kind:'box',count:1,box:tier('bad',{count:100001})}),'invalid');
});

test('restoration keeps exact bound source ordering and rejects corrupt snapshots instead of opening another gift',()=>{
 const s=Core.fresh(),avatar=Core.registerAvatar(s,'https://example.com/a.png','A',100);Core.enqueueBox(s,2,avatar,tier('one',{count:3}),Box);Core.enqueue(s,1,avatar);Core.enqueueBox(s,1,avatar,tier('two',{gift:'其它',count:11}),Box);
 const restored=Core.restore(JSON.stringify(s));assert(restored);assert.deepEqual(restored.roundSources.map(r=>[r.kind,r.count,r.box?.id||null]),[[avatar,2,'one'],[avatar,1,null],[avatar,1,'two']]);
 const bad=structuredClone(s);bad.roundSources[0].box.max=100001;bad.roundSources[0].box.mode='random';assert.equal(Core.restore(JSON.stringify(bad)),null);
 const unknownAvatar=structuredClone(s);unknownAvatar.avatarKinds=[];const repaired=Core.restore(JSON.stringify(unknownAvatar));assert.equal(repaired.roundSources[0].kind,0);assert.equal(repaired.roundSources[0].box.id,'one');
});

test('fall and reveal age restore only finite bounded physics fields without changing applied or count',()=>{
 const s=Core.fresh();Core.enqueueBox(s,1,0,tier(),Box);Core.startBox(s,()=>0,[],undefined,Box);s.current.boxFall={x:640,y:170,vx:2,vy:300,angle:20,angularVelocity:40,bounces:1,done:false,squash:.1,w:1280,h:720,elapsed:.5,targetY:360,foreign:'drop'};s.current.boxAge=.3;
 const restored=Core.restore(JSON.stringify(s));assert(restored);assert.equal(restored.current.boxFall.x,640);assert.equal(restored.current.boxFall.foreign,undefined);assert.equal(restored.current.boxAge,.3);assert.equal(restored.current.count,7);assert.equal(restored.current.applied,false);
 for(const patch of [{x:99999999},{vy:Infinity},{bounces:4},{done:'yes'},{targetY:361},{elapsed:7}]){const bad=structuredClone(s);Object.assign(bad.current.boxFall,patch);const result=Core.restore(JSON.stringify(bad));assert(result);assert.equal(result.current.boxFall,undefined);assert.equal(result.current.count,7);}
 const bad=structuredClone(s);bad.current.boxAge=-1;assert.equal(Core.restore(JSON.stringify(bad)).current.boxAge,undefined);
});

test('the full 100000-pet avatar reward settles and restores without an argument-stack overflow',()=>{
 const {spawnSync}=require('node:child_process');
 const script='const C=require(process.argv[1]),B=require(process.argv[2]),s=C.fresh();const avatar=C.registerAvatar(s,"https://example.com/max.png","Max",2000007),box={id:"max",name:"Maximum",gift:"",mode:"fixed",count:100000,min:100000,max:100000,enabled:true};C.enqueueBox(s,1,avatar,box,B);C.startBox(s,()=>0,[],undefined,B);if(C.resolve(s)!==100000||s.pendingKinds.length!==100000)throw Error("Incorrect maximum award");const restored=C.restore(JSON.stringify(s));if(!restored||restored.outside!==100000||restored.pendingKinds.length!==100000||C.resolve(restored)!==0)throw Error("Maximum award restore failed");';
 const result=spawnSync(process.execPath,['--stack_size=256','-e',script,require.resolve('../src/core.js'),require.resolve('../src/blind-box.js')],{encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
});
