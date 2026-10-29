const {test}=require('node:test');
const assert=require('node:assert/strict');
const M=require('../src/core.js');
const R=require('../src/rules.js');

test('count challenge keeps integer presses forever while bar challenge still decays',()=>{
  M.setDecay({rate:.5,graceMs:0});
  const count=M.create(1,{challengeMode:'count',target:20},0);
  assert.equal(count.challengeMode,'count');M.press(count,10);M.press(count,20);M.tick(count,10000);
  assert.equal(count.progress,2);assert.equal(count.totalHits,2);
  const bar=M.create(1,{challengeMode:'bar',target:20},0);M.press(bar,10);M.tick(bar,1010);
  assert.equal(bar.progress,0);assert.equal(bar.totalHits,1);
});

test('total hits survive layer changes, relief and refresh without treating gifts as taps',()=>{
  const s=M.create(3,{challengeMode:'count',target:2},0);
  M.press(s,10);M.press(s,20);assert.equal(s.layers,2);assert.equal(s.progress,0);assert.equal(s.totalHits,2);
  M.relieve(s,1,10000);assert.equal(s.relief,1);assert.equal(s.totalHits,2);
  const restored=M.restore(JSON.parse(JSON.stringify(s)),20000);assert.ok(restored);
  assert.equal(restored.totalHits,2);M.press(restored,20001);assert.equal(restored.layers,1);assert.equal(restored.totalHits,3);
  M.relieve(restored,100,20002);assert.equal(restored.layers,0);assert.equal(restored.totalHits,3);
});

test('queued challenge modes and multipliers are captured when each batch arrives',()=>{
  M.setDecay({rate:.5,graceMs:0});
  const config={challengeMode:'count',target:2,multiplier:3,key:'KeyA'};
  const s=M.create(1,config,0);assert.equal(s.target,6);assert.equal(s.baseTarget,2);assert.equal(s.multiplier,3);
  M.add(s,1,0,{challengeMode:'bar',target:2,multiplier:2,key:'KeyB'});
  config.multiplier=99;config.challengeMode='bar';
  for(let i=0;i<6;i++)M.press(s,0);
  assert.deepEqual([s.challengeMode,s.target,s.multiplier,s.key],['bar',4,2,'KeyB']);
  M.press(s,1);M.tick(s,1001);assert.equal(s.progress,0);assert.equal(s.totalHits,7);
});

test('blindbox base draws are multiplied per layer and the sequence survives refresh',()=>{
  const pool=[{id:'a',name:'甲',min:2,max:3,percent:100}];
  const s=M.create(20,{challengeMode:'count',targetPool:pool,multiplier:4,seed:1},0);
  assert.ok(s);assert.ok([8,12].includes(s.target));assert.equal(s.target,s.baseTarget*4);
  const restored=M.restore(JSON.parse(JSON.stringify(s)),9999);assert.ok(restored);
  while(s.layers){assert.deepEqual([restored.target,restored.baseTarget,restored.multiplier],[s.target,s.baseTarget,4]);
    const required=s.target;for(let i=0;i<required;i++){M.press(s,0);M.press(restored,9999);}
  }
  assert.equal(s.totalHits,restored.totalHits);
});

test('old saves default to bar and infer only provable current presses',()=>{
  const old={layers:2,target:60,key:'Space',tier:'normal',progress:4.5,relief:3,updatedAt:0,lastHitAt:0,
    queue:[{layers:2,target:60,key:'Space',tier:'normal',source:null}]};
  M.setDecay({rate:0});const s=M.restore(old,0);assert.ok(s);
  assert.equal(s.challengeMode,'bar');assert.equal(s.multiplier,1);assert.equal(s.totalHits,4);
  const invalid=JSON.parse(JSON.stringify(s));invalid.challengeMode='count';invalid.queue[0].challengeMode='count';
  assert.equal(M.restore(invalid,0),null);
});

test('bad challenge and multiplier settings cannot create or restore work',()=>{
  for(const multiplier of [0,-1,1.5,1000000001,Infinity])assert.equal(M.create(1,{multiplier,target:1},0),null);
  assert.equal(M.create(1,{challengeMode:'unknown'},0),null);
  const s=M.create(1,{challengeMode:'count',target:1,multiplier:1000},0);assert.equal(s.target,1000);
  const bad=JSON.parse(JSON.stringify(s));bad.totalHits=1.5;assert.equal(M.restore(bad,0),null);
});

test('lock gift multiplier snapshots do not change old fixed rule outputs',()=>{
  const rule={name:'锁',kind:'lock',value:2,target:30,multiplier:4};
  assert.deepEqual(R.routeGift([rule],{giftName:'锁',count:3}),{kind:'lock',value:6,target:30,multiplier:4,name:'锁'});
  assert.deepEqual(R.routeGift([{...rule,multiplier:1}],{giftName:'锁',count:1}),{kind:'lock',value:2,target:30,name:'锁'});
  assert.equal(R.routeGift([{...rule,multiplier:1001}],{giftName:'锁',count:1}),null);
});

test('multiply gifts route a bounded repetition count and actual saved factor',()=>{
  const rule={name:'翻倍',kind:'multiply',value:2,multiplier:3};
  assert.deepEqual(R.routeGift([rule],{giftName:'翻倍',count:2}),{kind:'multiply',value:4,multiplier:3,name:'翻倍'});
  assert.deepEqual(R.routeGift([{...rule,value:99}],{giftName:'翻倍',count:1000000}),{kind:'multiply',value:99000000,multiplier:3,name:'翻倍'});
  for(const ruleChange of [{value:0},{value:100},{multiplier:0},{multiplier:1001},{multiplier:1.5}])assert.equal(R.routeGift([{...rule,...ruleChange}],{giftName:'翻倍',count:1}),null);
});

test('multiplying remaining work preserves presses and permanent relief',()=>{
  assert.equal(typeof M.multiplyRemaining,'function');
  const s=M.create(2,{challengeMode:'count',target:10},0);
  M.press(s,1);M.press(s,2);M.relieve(s,3,3);
  assert.equal(M.multiplyRemaining(s,2,4),true);
  assert.deepEqual([s.target,s.progress,s.relief,s.totalHits,s.multiplier],[15,2,3,2,2]);
  // Current remaining work is now 10. The next untouched layer requires the full 20.
  assert.deepEqual(M.relieve(s,12,5),{applied:12,unused:0,clearedLayers:1});
  assert.deepEqual([s.layers,s.target,s.relief,s.totalHits],[1,20,2,2]);
});

test('multiply affects unopened blindbox batches and preserves all draws on restore',()=>{
  assert.equal(typeof M.multiplyRemaining,'function');
  const pool=[{id:'a',name:'甲',min:2,max:3,percent:100}];
  const s=M.create(1,{challengeMode:'count',target:2},0);M.add(s,10,0,{challengeMode:'count',targetPool:pool,seed:3});
  M.press(s,0);M.multiplyRemaining(s,3,0);
  assert.equal(s.target,4);assert.equal(s.progress,1);
  const saved=M.restore(JSON.parse(JSON.stringify(s)),0);assert.ok(saved);
  M.relieve(s,3,0);M.relieve(saved,3,0);assert.ok([6,9].includes(s.target));
  while(s.layers){assert.deepEqual([s.target,s.tier],[saved.target,saved.tier]);M.relieve(s,s.target,0);M.relieve(saved,saved.target,0);}
});

test('many multiply repetitions safely saturate targets without looping through gift quantity',()=>{
  assert.equal(typeof M.multiplyRemaining,'function');
  const s=M.create(2,{challengeMode:'count',target:1},0);
  assert.equal(M.multiplyRemaining(s,2,0,99000000),true);
  assert.equal(s.target,1000000000);assert.equal(s.queue[0].multiplier,1000000000);
  assert.equal(M.multiplyRemaining(s,1,0,99000000),false);
  assert.equal(M.multiplyRemaining(s,2,0),false);
  assert.ok(M.restore(JSON.parse(JSON.stringify(s)),0));
  M.relieve(s,1000000000,0);assert.equal(s.layers,1);assert.equal(s.target,1000000000);
});

test('bar mode multiplies rounded remaining work without resetting fractional progress',()=>{
  assert.equal(typeof M.multiplyRemaining,'function');
  M.setDecay({rate:.05,graceMs:0});const s=M.create(1,{challengeMode:'bar',target:10},0);M.press(s,0);M.tick(s,1000);
  assert.equal(s.progress,.5);M.multiplyRemaining(s,2,1000,2);
  assert.equal(s.target,40);assert.equal(s.progress,.5);assert.equal(s.totalHits,1);
});

test('multiply action rejects nonnumeric parameters before changing any queued work',()=>{
  assert.equal(typeof M.multiplyRemaining,'function');
  for(const [factor,repetitions] of [['2',1],[2,'2'],[0,1],[1001,1],[2,0],[2,99000001]]){
    const s=M.create(1,{challengeMode:'count',target:10},0),before=JSON.stringify(s);
    assert.equal(M.multiplyRemaining(s,factor,0,repetitions),false);
    assert.equal(JSON.stringify(s),before);
  }
});

test('saved multipliers and base counts retain strict safe-integer validation',()=>{
  const s=M.create(2,{challengeMode:'count',target:10,multiplier:2},0);
  for(const field of ['baseTarget','multiplier']){
    const saved=JSON.parse(JSON.stringify(s));saved[field]=String(saved[field]);saved.queue[0][field]=String(saved.queue[0][field]);
    assert.equal(M.restore(saved,0),null);
  }
});
