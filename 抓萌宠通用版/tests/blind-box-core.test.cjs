const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const modulePath=path.join(__dirname,'../src/blind-box.js');
const Box=fs.existsSync(modulePath)?require(modulePath):{};
const Core=require('../src/core.js');
const row=(id='one',chance=10000,extra={})=>({id,name:'盲盒 '+id,count:3,chance,enabled:true,...extra});
const fixed=[row('one',10000,{name:'星光盒',count:73})];
const sum=rows=>rows.filter(r=>r.enabled).reduce((total,r)=>total+r.chance,0);

test('legacy tiers migrate to unbound fixed rows with equal manual odds and unchanged identity',()=>{
 assert.equal(typeof Box.migrate,'function');
 const old=[{id:'a',count:1,enabled:true},{id:'off',count:20,enabled:false},{id:'b',count:8,enabled:true},{id:'c',count:73,enabled:true}],before=structuredClone(old);
 const rows=Box.migrate(old);assert.deepEqual(old,before);assert(rows.every(r=>r.mode==='fixed'&&r.gift===''&&r.min===r.count&&r.max===r.count));assert.deepEqual(rows.map(r=>r.id),old.map(r=>r.id));assert.deepEqual(rows.map(r=>r.count),old.map(r=>r.count));assert.equal(rows[3].name,'73 只');assert.equal(rows[1].enabled,false);
 assert.deepEqual([0,.34,.99].map(value=>Box.choose(rows,100000,undefined,()=>value).id),['a','b','c']);
 const defaults=Box.migrate(Core.defaultTiers());assert.equal(defaults.length,20);assert(defaults.every(r=>r.chance===undefined));
});

test('tier validation clones safe fields, allows duplicate counts, and permits more than one thousand rows',()=>{
 const input=[row('a',2500,{unused:{anything:true}}),row('b',7500,{name:'  自定义礼盒  '})],before=structuredClone(input),output=Box.validateTiers(input);
 assert.deepEqual(input,before);assert.equal(output[0].unused,undefined);assert.equal(output[1].name,'自定义礼盒');assert.notEqual(output[0],input[0]);assert.equal(output[0].count,output[1].count);
 const many=Array.from({length:1000},(_,i)=>row('r'+i,10,{count:1}));assert.equal(Box.validateTiers(many).length,1000);assert.equal(Box.validateTiers([...many,row('extra',0)]).length,1001);
 assert.equal(Box.validateTiers([row('emoji',10000,{name:'😀'.repeat(40)})])[0].name,'😀'.repeat(40));
});

test('invalid precision, ranges, names, IDs and flags are rejected without modifying drafts',()=>{
 const bad=[null,[null],[row('a'),row('a',0)],...[NaN,Infinity,-1,10001,.01,'10000'].map(chance=>[row('x',chance)]),...[0,-1,1.5,100001,'3'].map(count=>[row('x',10000,{count})]),...['','  ','x'.repeat(41),'a\nb'].map(name=>[row('x',10000,{name})]),...['bad id','../x','a'.repeat(61)].map(id=>[row(id)]),[row('x',10000,{enabled:'true'})]];
 for(const rows of bad){const before=structuredClone(rows);assert.throws(()=>Box.validateTiers(rows));assert.deepEqual(rows,before);}
});

test('normalization retains disabled odds and proportionally distributes integer remainders',()=>{
 const input=[row('a',1),row('off',73,{enabled:false}),row('b',1),row('c',1)],before=structuredClone(input);
 const output=Box.normalizeProbabilities(input);assert.deepEqual(output.map(r=>r.chance),[3334,73,3333,3333]);assert.deepEqual(input,before);assert.equal(sum(output),10000);
 assert.deepEqual(Box.normalizeProbabilities([row('a',1),row('b',2)]).map(r=>r.chance),[3333,6667]);
 assert.deepEqual(Box.normalizeProbabilities([row('a',0),row('b',0),row('off',555,{enabled:false})]).map(r=>r.chance),[5000,5000,555]);
 assert.throws(()=>Box.normalizeProbabilities([row('off',1,{enabled:false})]));assert.throws(()=>Box.normalizeProbabilities([row('bad',1.5)]));
});

test('weighted choice respects exact bucket boundaries and excludes disabled or zero-probability rows',()=>{
 const rows=[row('first',2500),row('zero',0),row('second',7500),row('off',10000,{enabled:false})];
 assert.equal(Box.choose(rows,100000,undefined,()=>0).id,'first');assert.equal(Box.choose(rows,100000,undefined,()=>.249999).id,'first');assert.equal(Box.choose(rows,100000,undefined,()=>.25).id,'second');assert.equal(Box.choose(rows,100000,undefined,()=>1).id,'second');
 for(const value of [NaN,Infinity,-Infinity,-1,2])assert(Box.choose(rows,100000,undefined,()=>value));
 const picked=Box.choose(rows,100000,undefined,()=>0);picked.name='changed';assert.equal(rows[0].name,'盲盒 first');
});

test('capacity exclusion redistributes the remaining odds, while forced previews ignore only chance',()=>{
 const rows=[row('small',1000,{count:2}),row('large',9000,{count:100}),row('zero',0,{count:4}),row('disabled',1,{count:1,enabled:false})];
 assert.equal(Box.choose(rows,10,undefined,()=>.999).id,'small');assert.equal(Box.choose(rows,1,undefined,()=>0),null);
 assert.equal(Box.choose(rows,10,'zero',()=>{throw Error('Forced choice should not draw');}).id,'zero');
 for(const id of ['large','disabled','missing','',42])assert.equal(Box.choose(rows,10,id,()=>0),null);
 for(const capacity of [-1,NaN,Infinity,'10'])assert.equal(Box.choose(rows,capacity,undefined,()=>0),null);
});

test('browser UMD exposes the same pure probability API',()=>{
 const context={};vm.runInNewContext(fs.readFileSync(modulePath,'utf8'),context);assert.equal(typeof context.PetBlindBox.choose,'function');assert.equal(context.PetBlindBox.validateTiers([row()])[0].chance,10000);
});

test('startBox snapshots one chosen row, consumes one queued source, and ignores legacy miss',()=>{
 assert.equal(typeof Core.startBox,'function');const s=Core.fresh(),avatar=Core.registerAvatar(s,'https://example.com/a.png','A',2000005);Core.enqueue(s,2,avatar);let draws=0;
 const result=Core.startBox(s,()=>{draws++;return 0;},fixed,undefined,Box);
 assert.equal(draws,1);assert.equal(result.boxName,'星光盒');assert.equal(result.count,73);assert.equal(result.presentation,'blindbox');assert.equal(result.success,true);assert.equal(result.applied,false);assert.equal(result.avatarKind,avatar);assert.equal(result.phase,0);assert.deepEqual(result.times,[0,200,850,1550,2500]);assert.equal(s.queue,1);assert.deepEqual(s.roundSources,[{kind:avatar,count:1}]);
 assert.equal(Core.startBox(s,()=>{throw Error('Do not redraw existing round');},[],undefined,Box),result);assert.equal(s.queue,1);
});

test('invalid pools, unavailable capacity and invalid forced IDs do not consume the queue or serial',()=>{
 for(const setup of [{rows:[row('bad',10000,{count:0})]},{rows:fixed,forcedId:'missing'},{rows:[row('large',10000,{count:10})],outside:99999}]){
  const s=Core.fresh();s.outside=setup.outside||0;Core.enqueue(s,3);const before=structuredClone(s);assert.equal(Core.startBox(s,()=>0,setup.rows,setup.forcedId,Box),null);assert.deepEqual(s,before);
 }
});

test('forced zero-probability tier still opens once and reserves capacity against ordinary gifts',()=>{
 const s=Core.fresh();s.outside=99900;const rows=[row('live',10000,{count:10}),row('test',0,{count:73})];
 const r=Core.startBox(s,()=>{throw Error('Forced preview should not draw');},rows,'test',Box);assert.equal(r.count,73);assert.equal(r.success,true);assert.equal(Core.availableSlots(s),27);assert.equal(Core.add(s,1000),27);assert.equal(Core.resolve(s),73);assert.equal(s.outside,100000);assert.equal(Core.resolve(s),0);
});

test('deleting/editing tiers after opening cannot reroll a result across two reloads',()=>{
 const s=Core.fresh();Core.enqueue(s,2);Core.startBox(s,()=>0,structuredClone(fixed),undefined,Box);const a=Core.restore(JSON.stringify(s));assert(a);assert.equal(a.current.boxName,'星光盒');assert.equal(a.current.presentation,'blindbox');
 const snap=JSON.stringify(a.current);Core.upgradeCurrentBox(a,[row('other',10000,{name:'不同奖项',count:999})]);assert.equal(JSON.stringify(a.current),snap);
 assert.equal(Core.resolve(a),73);const b=Core.restore(JSON.stringify(a));assert.equal(Core.resolve(b),0);assert.equal(b.outside,73);assert.equal(b.queue,1);assert.equal(b.current.boxName,'星光盒');assert.deepEqual(b.current.times,[0,200,850,1550,2500]);
});

test('queued avatar sources retain arrival order for separate openings and fallback kinds survive restoration',()=>{
 const s=Core.fresh(),a=Core.registerAvatar(s,'https://example.com/a.png','A',100),b=Core.registerAvatar(s,'https://example.com/b.png','B',2000007);Core.enqueue(s,2,a);Core.enqueue(s,1,b);
 for(const expected of [a,a,b]){const r=Core.startBox(s,()=>0,[row()],undefined,Box);assert.equal(r.avatarKind,expected);assert.equal(Core.resolve(s),3);Core.finish(s);}
 assert.deepEqual(s.pendingKinds,[a,a,a,a,a,a,b,b,b]);assert.equal(s.queue,0);const restored=Core.restore(JSON.stringify(s));assert.deepEqual(restored.avatarKinds.map(x=>x.fallbackKind),[100,2000007]);
});

test('legacy current migration preserves phase, success, applied state, count, source, cast and serial',()=>{
 for(const success of [true,false])for(const applied of [true,false]){
  const s=Core.fresh(),avatar=Core.registerAvatar(s,'https://example.com/a.png','A',100);Core.enqueue(s,2,avatar);Core.start(s,()=>0,success?0:100,[{id:'old',count:8,enabled:true}]);s.current.phase=2;s.current.cast=[100,2000005];if(applied)Core.resolve(s);
  const before=structuredClone(s),r=Core.upgradeCurrentBox(s,[row('old',10000,{name:'旧档礼盒',count:8})]);assert.equal(r,s.current);assert.equal(r.presentation,'blindbox');assert.equal(r.boxName,'旧档礼盒');assert.deepEqual(r.times,[0,200,850,1550,2500]);
  for(const key of ['id','tierId','count','success','applied','phase','avatarKind','cast'])assert.deepEqual(r[key],before.current[key],key);for(const key of ['outside','home','queue','serial','roundSources','pendingKinds'])assert.deepEqual(s[key],before[key],key);
  if(!success)assert.equal(Core.resolve(s),0);if(applied)assert.equal(Core.resolve(s),0);
 }
 assert.equal(Core.upgradeCurrentBox(Core.fresh(),fixed),null);
});

test('missing legacy names and malformed optional restored labels use the snapshotted count',()=>{
 const s=Core.fresh();Core.start(s,()=>0,0,[{id:'deleted',count:27,enabled:true}]);Core.upgradeCurrentBox(s,[]);assert.equal(s.current.boxName,'27 只');
 for(const name of ['',null,'x'.repeat(41),'bad\nname']){const bad=structuredClone(s);bad.current.boxName=name;const restored=Core.restore(JSON.stringify(bad));assert(restored);assert.equal(restored.current.presentation,'blindbox');assert.equal(restored.current.boxName,'27 只');assert.equal(restored.current.count,27);}
 const unknown=structuredClone(s);unknown.current.presentation='unrecognized';const restored=Core.restore(JSON.stringify(unknown));assert.equal(restored.current.presentation,undefined);
});
