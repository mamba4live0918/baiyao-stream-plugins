const {test}=require('node:test');
const assert=require('node:assert/strict');
const R=require('../src/rules.js');
const M=require('../src/core.js');
const inline=changes=>({name:'小心心',kind:'lock',value:2,target:3,multiplier:2,valueMin:2,valueMax:4,targetMin:3,targetMax:5,multiplierMin:2,multiplierMax:4,...changes});

test('one combined gift draws per-share quantity and factor once, then multiplies gift count',()=>{
  let calls=0;const values=[0,1-Number.EPSILON];
  const routed=R.routeGift([inline()],{giftName:'小心心',count:3},()=>{calls++;return values.shift();});
  assert.equal(routed?.value,6);assert.equal(routed.multiplier,4);assert.equal(calls,2);
  assert.equal(routed.target,3);assert.equal(routed.targetMode,'blindbox');
  assert.deepEqual(routed.targetPool.map(item=>[item.min,item.max,item.percent]),[[3,5,100]]);
  const s=M.create(routed.value,{target:routed.target,targetPool:routed.targetPool,multiplier:routed.multiplier,challengeMode:'count',seed:1},0);
  const targets=new Set();while(s.layers){targets.add(s.target);M.relieve(s,s.target,0);}
  assert.ok(targets.size>1);assert.ok([...targets].every(value=>[12,16,20].includes(value)));
});

test('equal inline ranges are fixed and do not consume random samples',()=>{
  const rule=inline({valueMin:2,valueMax:2,targetMin:7,targetMax:7,multiplierMin:3,multiplierMax:3});
  assert.deepEqual(R.routeGift([rule],{giftName:'小心心',count:2},()=>{throw Error('fixed drew RNG');}),{kind:'lock',value:4,target:7,multiplier:3,name:'小心心'});
});

test('both ends are validated before RNG, including invalid lower bounds and blank fields',()=>{
  for(const changes of [{valueMin:0},{valueMax:20001},{valueMin:'',valueMax:4},{valueMax:undefined},
    {targetMin:0},{targetMax:100000},{targetMin:5,targetMax:3},
    {multiplierMin:''},{multiplierMax:1001},{multiplierMin:NaN},{multiplierMin:5,multiplierMax:4}]){
    let calls=0;assert.equal(R.routeGift([inline(changes)],{giftName:'小心心',count:1},()=>{calls++;return 0}),null,JSON.stringify(changes));
    assert.equal(calls,0,'Invalid bounds consumed random state');
  }
  assert.equal(R.routeGift([inline()],{giftName:'小心心',count:1},()=>NaN),null);
  assert.equal(R.routeGift([inline()],{giftName:'小心心',count:1},()=>1),null);
});

test('effect-specific ranges preserve the original safety caps',()=>{
  const multiply=inline({kind:'multiply',valueMin:1,valueMax:99,multiplierMin:2,multiplierMax:2});
  assert.deepEqual(R.routeGift([multiply],{giftName:'小心心',count:1000000},()=>1-Number.EPSILON),{kind:'multiply',value:99000000,multiplier:2,name:'小心心'});
  assert.equal(R.routeGift([inline({kind:'freeze',valueMin:1,valueMax:3601})],{giftName:'小心心',count:1}),null);
  const relief=inline({kind:'relief',valueMin:1,valueMax:3,multiplierMin:1,multiplierMax:1});
  assert.deepEqual(R.routeGift([relief],{giftName:'小心心',count:2},()=>.999999),{kind:'relief',value:6,name:'小心心'});
});

test('normalizer migrates fixed rules and resolves old multiplier references into owned ranges',()=>{
  assert.equal(typeof R.normalizeInlineRules,'function');
  const settings={multipliers:[{id:'triple',name:'三倍',factor:3}]};
  const migrated=R.normalizeInlineRules([{name:'玫瑰',kind:'lock',value:2,target:8,multiplierId:'triple'}],settings);
  assert.deepEqual(migrated,[{name:'玫瑰',kind:'lock',value:2,valueMin:2,valueMax:2,target:8,targetMin:8,targetMax:8,multiplier:3,multiplierMin:3,multiplierMax:3}]);
  settings.multipliers[0].factor=9;assert.equal(migrated[0].multiplierMin,3);assert.equal('multiplierId' in migrated[0],false);
  assert.equal(R.normalizeInlineRules([{name:'锁',kind:'lock',value:1,target:60,multiplierId:'missing'}],settings),null);
});

test('normalizer preserves legacy weighted pools and their exact probabilities independently',()=>{
  assert.equal(typeof R.normalizeInlineRules,'function');
  const pool=[{id:'small',name:'轻锁',min:1,max:2,percent:90,look:'normal'},
    {id:'large',name:'重锁',min:9,max:10,percent:10,look:'rare'}];
  const rules=R.normalizeInlineRules([{name:'盲盒',kind:'lock',value:2,target:60,targetMode:'blindbox'}],{targetPool:pool});
  assert.ok(rules);assert.equal(rules[0].targetMode,'blindbox');assert.deepEqual(rules[0].targetPool.map(x=>x.percent),[90,10]);
  assert.deepEqual([rules[0].targetMin,rules[0].targetMax],[1,10]);
  pool[0].percent=1;assert.equal(rules[0].targetPool[0].percent,90);
  const routed=R.routeGift(rules,{giftName:'盲盒',count:1});assert.deepEqual(routed.targetPool.map(x=>x.percent),[90,10]);
  routed.targetPool[0].name='后来编辑';assert.equal(rules[0].targetPool[0].name,'轻锁');
});

test('normalizer validates names, complete ranges, pool health and the fifty-rule ceiling',()=>{
  assert.equal(typeof R.normalizeInlineRules,'function');
  for(const raw of [[inline({name:' '})],[inline({name:'名'.repeat(81)})],[inline({valueMax:undefined})],
    [inline({targetMode:'blindbox',targetPool:[]})],Array.from({length:51},()=>inline())])assert.equal(R.normalizeInlineRules(raw,{}),null);
  assert.deepEqual(R.normalizeInlineRules([],{}),[]);
  const rules=R.normalizeInlineRules([inline({value:99,target:99,multiplier:99})],{});
  assert.deepEqual([rules[0].value,rules[0].target,rules[0].multiplier],[2,3,2]);
});

test('V1.3 target settings still migrate without inventing new multiplier profiles',()=>{
  assert.equal(typeof R.normalizeInlineRules,'function');
  const migrated=R.normalizeInlineRules([{name:'小心心',kind:'lock',value:1,tier:'normal'}],{targets:{normal:7}});
  assert.equal(migrated[0].targetMin,7);assert.equal(migrated[0].multiplierMin,1);
  assert.equal(R.normalizeInlineRules([{name:'坏',kind:'freeze',value:3601,target:60}],{}),null);
});

test('object-shaped bounds and sparse rules cannot masquerade as normalized integers',()=>{
  assert.equal(R.routeGift([inline({valueMin:[2]})],{giftName:'小心心',count:1}),null);
  assert.equal(R.normalizeInlineRules([inline({multiplierMax:{valueOf:()=>4}})],{}),null);
  assert.equal(R.normalizeInlineRules(new Array(1),{}),null);
});

test('unknown legacy tier ids do not read inherited object values',()=>{
  const rules=R.normalizeInlineRules([{name:'旧锁',kind:'lock',value:1,tier:'constructor'}],{});
  assert.ok(rules);assert.equal(rules[0].targetMin,60);
});
