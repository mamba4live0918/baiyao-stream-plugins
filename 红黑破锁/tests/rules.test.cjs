const {test}=require('node:test');
const assert=require('node:assert/strict');
const R=require('../src/rules.js');

test('gift counts multiply layers but keep the rule\'s taps per layer',()=>{
  const rules=[{name:'小心心',kind:'lock',value:2,target:240}];
  assert.deepEqual(R.routeGift(rules,{giftName:'小心心',count:3}),{kind:'lock',target:240,value:6,name:'小心心'});
});

test('relief gift routes as permanent points and unknown gifts are ignored',()=>{
  const rules=[{name:'破锁钥匙',kind:'relief',value:50}];
  assert.deepEqual(R.routeGift(rules,{giftName:'破锁钥匙',count:2}),{kind:'relief',value:100,name:'破锁钥匙'});
  assert.equal(R.routeGift(rules,{giftName:'其它',count:1}),null);
});

test('invalid counts and values cannot create work or relief',()=>{
  const rules=[{name:'锁',kind:'lock',value:2,target:60}];
  for(const count of [0,-1,1.5,'bad',Infinity,1000001])assert.equal(R.routeGift(rules,{giftName:'锁',count}),null);
  assert.equal(R.routeGift([{name:'锁',kind:'lock',value:0,target:60}],{giftName:'锁',count:1}),null);
});

test('event ids are deduplicated while independent events pass',()=>{
  const seen=R.createDeduper();
  assert.equal(seen('abc',1000),false);
  assert.equal(seen('abc',1001),true);
  assert.equal(seen('def',1002),false);
  assert.equal(seen('abc',12000),false);
});

test('lock rules need a valid taps-per-layer between 1 and 99999',()=>{
  assert.deepEqual(R.routeGift([{name:'棒棒糖',kind:'lock',value:3,target:1}],{giftName:'棒棒糖',count:2}),{kind:'lock',target:1,value:6,name:'棒棒糖'});
  for(const target of [0,100000,1.5,'60',undefined])assert.equal(R.routeGift([{name:'坏',kind:'lock',value:1,target}],{giftName:'坏',count:1}),null);
});

const M=require('../src/core.js');
test('each layer may need a single press and targets reach 99999',()=>{
  assert.equal(M.target('1'),1);assert.equal(M.target('0'),null);assert.equal(M.target('99999'),99999);assert.equal(M.target('100000'),null);
  const s=M.create(3,{tier:'t1',tierName:'一下',look:'normal',target:1,key:'Space'},0);
  assert.equal(M.press(s,10),true);assert.equal(s.layers,2);
});

test('queued batches keep their tier name, look and target snapshot',()=>{
  const s=M.create(1,{tier:'a',tierName:'甲',look:'normal',target:2,key:'Space'},0);
  const later={tier:'b',tierName:'乙',look:'legendary',target:4,key:'KeyF'};
  M.add(s,1,1,later);later.tierName='改名';later.target=99;
  M.press(s,10);M.press(s,100);
  assert.deepEqual([s.tier,s.tierName,s.look,s.target,s.key],['b','乙','legendary',4,'KeyF']);
});

test('V1.3 saves with fixed tiers restore with names and looks',()=>{
  const old={layers:3,target:120,key:'Space',tier:'rare',progress:5,relief:0,updatedAt:0,lastHitAt:0,queue:[{layers:1,target:120,key:'Space',tier:'rare',source:'玫瑰'},{layers:2,target:240,key:'Space',tier:'legendary',source:null}]};
  const s=M.restore(old,0);
  assert.ok(s);assert.equal(s.tierName,'稀有');assert.equal(s.look,'rare');assert.equal(s.queue[1].tierName,'传说');
});

test('clear rules route regardless of count, large gift counts are no longer dropped',()=>{
  assert.deepEqual(R.routeGift([{name:'清空卡',kind:'clear',value:1,target:60}],{giftName:'清空卡',count:3}),{kind:'clear',name:'清空卡'});
  assert.deepEqual(R.routeGift([{name:'小心心',kind:'lock',value:1,target:60}],{giftName:'小心心',count:25000}),{kind:'lock',target:60,value:25000,name:'小心心'});
});

test('freeze rules multiply seconds by gift count and reject out-of-range seconds',()=>{
  assert.deepEqual(R.routeGift([{name:'冰冻',kind:'freeze',value:5,target:60}],{giftName:'冰冻',count:3}),{kind:'freeze',value:15,name:'冰冻'});
  assert.equal(R.routeGift([{name:'冰冻',kind:'freeze',value:3601,target:60}],{giftName:'冰冻',count:1}),null);
});
