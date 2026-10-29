const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const M=require('../src/core.js');
const modulePath=path.join(__dirname,'../src/modes.js');
const V=fs.existsSync(modulePath)?require(modulePath):{};
const clone=x=>JSON.parse(JSON.stringify(x));
const pool=[{id:'a',name:'甲',min:2,max:7,percent:40,enabled:true,look:'normal'},{id:'b',name:'乙',min:10,max:19,percent:60,enabled:true,look:'rare'}];
test('V2.3 exposes an independent count model',()=>{assert.equal(typeof V.createCount,'function');});
test('three mode migration prioritizes legacy count',()=>{
  assert.equal(V.modeFrom({sceneMode:'cage',challengeMode:'count'}),'count');
  assert.equal(V.modeFrom({sceneMode:'cage'}),'cage');assert.equal(V.modeFrom({}),'lock');
});
test('count adds preserve round presses and progress follows pressed/(pressed+remaining)',()=>{
  const s=V.createCount(10,{key:'KeyJ',source:{name:'a'}});V.pressCount(s);V.pressCount(s);
  assert.deepEqual(s,{remaining:8,pressed:2,key:'KeyJ',source:{name:'a'}});
  V.addCount(s,10,{key:'KeyF',source:'b'});assert.equal(s.remaining,18);assert.equal(s.key,'KeyJ');assert.equal(V.countProgress(s),.1);
});
test('count relief never increments taps and completing resets the round',()=>{
  const s=V.createCount(5);V.pressCount(s);assert.equal(V.relieveCount(s,2).applied,2);assert.equal(s.pressed,1);
  assert.equal(V.relieveCount(s,20).completed,true);assert.equal(s.remaining,0);assert.equal(s.pressed,0);
  V.addCount(s,2,{key:'KeyF'});assert.equal(s.key,'KeyF');V.pressCount(s);assert.equal(V.pressCount(s).completed,true);assert.equal(s.pressed,0);
});
test('multiplication affects remaining only and saturates in bounded time',()=>{
  const s=V.createCount(10);V.pressCount(s);V.multiplyCount(s,2,2);assert.equal(s.remaining,36);assert.equal(s.pressed,1);
  assert.equal(V.multiplyCount(s,2,99000000).capped,true);assert.equal(s.remaining,Number.MAX_SAFE_INTEGER);
  assert.equal(V.addCount(s,1).capped,true);assert.equal(V.clearCount(s).completed,true);
});
test('count restore rejects malformed numeric state and detaches source',()=>{
  const s=V.createCount(3,{source:{names:['a']}}),restored=V.restoreCount(s);restored.source.names.push('b');assert.deepEqual(s.source.names,['a']);
  for(const patch of [{remaining:-1},{remaining:1.1},{remaining:'1'},{pressed:Infinity},{key:'bad'}])assert.equal(V.restoreCount({...s,...patch}),null);
  assert.equal(V.restoreCount({...s,remaining:0,pressed:2}),null);
});
test('invalid mutations never modify a valid count state',()=>{
  const s=V.createCount(3),before=clone(s);
  for(const n of [-1,1.5,Infinity,'2']){assert.equal(V.addCount(s,n),null);assert.equal(V.relieveCount(s,n),null);assert.equal(V.multiplyCount(s,n),null);}
  assert.deepEqual(s,before);
});
test('legacy count gift ranges multiply both endpoints and retain multiplier',()=>{
  const rules=V.migrateRulesToCount([{name:'锁',kind:'lock',valueMin:2,valueMax:4,targetMin:10,targetMax:30,multiplierMin:2,multiplierMax:3}]);
  assert.deepEqual([rules[0].valueMin,rules[0].valueMax,rules[0].multiplierMin,rules[0].multiplierMax],[20,120,2,3]);
  assert.deepEqual(V.routeCountGift(rules,{giftName:'锁',count:3},()=>0),{kind:'lock',value:120,name:'锁',capped:false});
  assert.equal('targetPool' in rules[0],false);
});
test('count gift routing supports large per-share totals and capped quantity',()=>{
  const rules=V.normalizeCountRules([{name:'大礼',kind:'lock',value:Number.MAX_SAFE_INTEGER}]);assert.ok(rules);
  assert.equal(V.routeCountGift(rules,{giftName:'大礼',count:2}).value,Number.MAX_SAFE_INTEGER);assert.equal(V.routeCountGift(rules,{giftName:'大礼',count:2}).capped,true);
  assert.equal(V.routeCountGift(rules,{giftName:'大礼',count:0}),null);
});
test('count gift non-add effects preserve established semantics',()=>{
  for(const [kind,value,expected] of [['multiply',2,{kind:'multiply',value:6,multiplier:3,name:'礼'}],['relief',5,{kind:'relief',value:15,name:'礼',capped:false}],['freeze',5,{kind:'freeze',value:15,name:'礼'}],['clear',1,{kind:'clear',name:'礼'}]]){
    const rules=V.normalizeCountRules([{name:'礼',kind,value,multiplier:3}]);assert.deepEqual(V.routeCountGift(rules,{giftName:'礼',count:3}),expected);
  }
});
test('invalid count rules are rejected before consuming randomness',()=>{
  let calls=0;const rng=()=>{calls++;return 0;};
  for(const rule of [{name:'a',kind:'lock',valueMin:10,valueMax:1},{name:'a',kind:'lock',value:1,multiplier:1001},{name:'a',kind:'bogus',value:1}])assert.equal(V.routeCountGift([rule],{giftName:'a',count:1},rng),null);
  assert.equal(calls,0);
});
test('migrated mode profiles and nested settings are independent',()=>{
  const c=V.migrateConfig({theme:'fufu',sound:{volume:4},sceneMode:'cage'},[{name:'a',kind:'lock',value:2,target:10}]);
  assert.equal(c.mode,'cage');assert.equal(c.version,23);c.profiles.lock.settings.sound.volume=9;c.profiles.lock.rules[0].value=999;
  assert.equal(c.profiles.cage.settings.sound.volume,4);assert.equal(c.profiles.cage.rules[0].value,2);assert.equal(c.profiles.count.rules[0].value,20);
  assert.ok(V.validateConfig(c));assert.equal(V.validateConfig({...c,mode:'invalid'}),null);
});
test('V1.x nonqueue saves migrate with exact current credit',()=>{
  M.setDecay({rate:0});const old={layers:3,target:10,key:'Space',progress:2.5,updatedAt:0,lastHitAt:0};
  const s=M.restore(old,0);assert.ok(s);assert.equal(V.legacyRemaining(s).remaining,28);
  assert.equal(V.modeFrom({}),'lock');
});
test('V2.1 queued saves include permanent relief and waiting',()=>{
  M.setDecay({rate:0});const old={layers:2,target:10,key:'Space',tier:'normal',progress:2,relief:3,updatedAt:0,lastHitAt:0,queue:[{layers:2,target:10,key:'Space',tier:'normal',source:null}]};
  const s=M.restore(old,0);assert.ok(s);
  assert.equal(V.legacyRemaining(s,[{layers:4,target:7,key:'Space',multiplier:2}]).remaining,71);
});
test('V2.2 migration preserves reinforced current credit and future targets',()=>{
  const s=M.create(3,{target:10,challengeMode:'count'},0);M.press(s,0);M.relieve(s,3,0);M.multiplyRemaining(s,3,0);
  assert.equal(V.legacyRemaining(s).remaining,78);assert.equal(s.progress,1);assert.equal(s.relief,3);
});
test('seeded drawn and undrawn blindbox batches match the original model exactly',()=>{
  const s=M.create(12,{targetPool:pool,seed:77,multiplier:3,challengeMode:'count'},0);M.add(s,13,0,{targetPool:pool,seed:34,multiplier:2,challengeMode:'count'});M.press(s,0);M.relieve(s,2,0);M.multiplyRemaining(s,2,0);
  const saved=clone(s),check=M.restore(saved,0);let total=0;
  while(check.layers){const amount=check.target-check.progress-check.relief;total+=Math.ceil(amount);M.relieve(check,amount,0);}
  assert.equal(V.legacyRemaining(s).remaining,total);assert.deepEqual(clone(s),saved);
});
test('waiting seeded blindboxes draw exactly once per future layer',()=>{
  const waiting={layers:30,target:2,targetPool:pool,rngState:1234,key:'Space',multiplier:4};
  const check=M.create(waiting.layers,{...waiting,challengeMode:'count'},0);let total=0;
  while(check.layers){total+=check.target;M.relieve(check,check.target,0);}
  assert.equal(V.legacyRemaining(null,[waiting]).remaining,total);
});
test('never drawn seedless waiting is deterministically materialized without Math.random',()=>{
  const waiting=[{layers:19,target:2,targetPool:pool,key:'Space',multiplier:2}],before=clone(waiting),original=Math.random;Math.random=()=>{throw Error('No resampling');};
  try{const a=V.legacyRemaining(null,waiting),b=V.legacyRemaining(null,waiting);assert.deepEqual(a,b);assert.equal(a.seededMissing,true);assert.ok(a.remaining>=76);assert.deepEqual(waiting,before);}finally{Math.random=original;}
});
test('huge fixed batches use exact arithmetic then clamp safe totals',()=>{
  const s=M.create(1000000000000,{target:99999,multiplier:1000000000,challengeMode:'count'},0);
  const result=V.legacyRemaining(s);assert.equal(result.remaining,Number.MAX_SAFE_INTEGER);assert.equal(result.capped,true);
  assert.deepEqual(V.legacyRemaining(null,[]),{remaining:0,capped:false,seededMissing:false});
});
test('legacy conversion rejects invalid state or invalid waiting without truncation',()=>{
  assert.equal(V.legacyRemaining({layers:2}),null);assert.equal(V.legacyRemaining(null,[{layers:-1,target:2,key:'Space'}]),null);
});
test('sparse count rule arrays cannot pass validation',()=>{
  assert.equal(V.normalizeCountRules(new Array(1)),null);
});
test('V2.3 mirror fallback retains large count rules without folding again',()=>{
  const c=V.migrateConfig({mode:'count',challengeMode:'count'},[{name:'大礼',kind:'lock',value:999999999,target:1}]);
  assert.ok(c);assert.equal(c.mode,'count');assert.equal(c.profiles.count.rules[0].value,999999999);
  assert.deepEqual(c.profiles.lock.rules,[]);assert.deepEqual(c.profiles.cage.rules,[]);
});
test('browser inline globals run without CommonJS or a DOM',()=>{
  const vm=require('node:vm'),context=vm.createContext({});
  for(const file of ['core.js','rules.js','modes.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../src',file),'utf8'),context);
  const result=vm.runInContext('JSON.stringify(LockModes.createCount(12,{key:"KeyF"}))',context);
  assert.deepEqual(JSON.parse(result),{remaining:12,pressed:0,key:'KeyF',source:null});
});
test('oversized variable waiting cannot trigger an unbounded migration loop',()=>{
  assert.equal(V.legacyRemaining(null,[{layers:10000001,target:2,targetPool:pool,key:'Space',rngState:0}]),null);
});
