const {test}=require('node:test');
const assert=require('node:assert/strict');
const R=require('../src/rules.js');
const M=require('../src/core.js');
const pool=()=>[
  {id:'small',name:'轻锁',min:2,max:2,percent:50,enabled:true,look:'normal'},
  {id:'large',name:'重锁',min:7,max:7,percent:50,enabled:true,look:'legendary'}
];
const finish=(s,now=0)=>{const required=s.target;for(let i=0;i<required;i++)M.press(s,now);};

test('pool validation keeps disabled tiers without counting their percentages',()=>{
  assert.equal(typeof R.cleanTargetPool,'function');
  const raw=pool();raw.push({id:'off',name:'停用',min:9,max:10,percent:33.33,enabled:false,look:'rare'});
  const clean=R.cleanTargetPool(raw);assert.ok(clean);assert.equal(clean.length,3);
  assert.equal(clean[2].enabled,false);raw[0].name='后来编辑';assert.equal(clean[0].name,'轻锁');
});

test('pool rejects invalid ranges, duplicate ids, oversized lists and imprecise percentages',()=>{
  assert.equal(typeof R.cleanTargetPool,'function');
  for(const change of [{min:0},{min:1.5},{max:100000},{min:8,max:7},{percent:50.001},{id:'../x'},{name:' '},{look:'bad'}]){
    const raw=pool();Object.assign(raw[0],change);assert.equal(R.cleanTargetPool(raw),null);
  }
  const duplicate=pool();duplicate[1].id='small';assert.equal(R.cleanTargetPool(duplicate),null);
  assert.equal(R.cleanTargetPool(pool().map(p=>({...p,enabled:false}))),null);
  assert.equal(R.cleanTargetPool(pool().map(p=>({...p,percent:49.99}))),null);
  assert.equal(R.cleanTargetPool(Array.from({length:51},(_,i)=>({id:'p'+i,name:'档'+i,min:1,max:1,percent:0,enabled:true}))),null);
});

test('normalizing proportions uses two decimals and includes enabled tiers only',()=>{
  assert.equal(typeof R.normalizeTargetPool,'function');
  const clean=R.normalizeTargetPool([
    {id:'a',name:'甲',min:1,max:2,percent:1},
    {id:'b',name:'乙',min:3,max:4,percent:1},
    {id:'c',name:'丙',min:5,max:6,percent:1},
    {id:'off',name:'停用',min:7,max:8,percent:55,enabled:false}
  ]);
  assert.deepEqual(clean.map(p=>p.percent),[33.34,33.33,33.33,55]);
  assert.ok(R.cleanTargetPool(clean));
});

test('draws obey percentage boundaries and inclusive integer range endpoints',()=>{
  assert.equal(typeof R.drawTarget,'function');
  const p=[{id:'a',name:'甲',min:1,max:3,percent:33.33,look:'rare'},
    {id:'b',name:'乙',min:5,max:8,percent:66.67,look:'legendary'}];
  let values=[0,0];assert.deepEqual(R.drawTarget(p,()=>values.shift()),{target:1,tier:'a',tierName:'甲',look:'rare'});
  values=[.3333,1-Number.EPSILON];assert.deepEqual(R.drawTarget(p,()=>values.shift()),{target:8,tier:'b',tierName:'乙',look:'legendary'});
  assert.equal(R.drawTarget(p,()=>NaN),null);
});

test('blindbox gift routes detached enabled pool snapshots while fixed rules keep their output',()=>{
  const rule={name:'盲盒',kind:'lock',value:3,target:60,targetMode:'blindbox',targetPool:pool()};
  const routed=R.routeGift([rule],{giftName:'盲盒',count:2});
  assert.equal(routed?.targetMode,'blindbox');assert.equal(routed.value,6);assert.equal(routed.target,60);
  assert.deepEqual(routed.targetPool,pool());rule.targetPool[0].min=999;assert.equal(routed.targetPool[0].min,2);
  assert.deepEqual(R.routeGift([{name:'固定',kind:'lock',value:1,target:8,targetMode:'fixed'}],{giftName:'固定',count:1}),{kind:'lock',value:1,target:8,name:'固定'});
});

test('blindbox rules with an invalid pool cannot silently become fixed locks',()=>{
  const bad=pool();bad[0].percent=1;
  assert.equal(R.routeGift([{name:'坏池',kind:'lock',value:1,target:60,targetMode:'blindbox',targetPool:bad}],{giftName:'坏池',count:1}),null);
  assert.equal(M.create(1,{targetPool:bad,target:60},0),null);
});

test('every layer draws separately and queued pools are unaffected by edits',()=>{
  M.setDecay({rate:0});const original=pool();
  const s=M.create(40,{target:60,targetPool:original,seed:1,key:'KeyF'},0);assert.ok(s);
  assert.equal(s.targetPool?.length,2);assert.equal(s.key,'KeyF');
  original[0].min=999;original[0].name='修改';const targets=new Set();
  while(s.layers){targets.add(s.target);assert.ok([2,7].includes(s.target));assert.ok(['轻锁','重锁'].includes(s.tierName));finish(s);}
  assert.deepEqual([...targets].sort((a,b)=>a-b),[2,7]);
});

test('adding a blindbox batch snapshots its pool before the first layer enters',()=>{
  const s=M.create(1,{target:1},0),p=pool();assert.equal(M.add(s,8,0,{targetPool:p,seed:17,key:'KeyJ'}),true);
  p[0].min=999;p[1].name='改名';finish(s);assert.ok([2,7].includes(s.target));assert.equal(s.key,'KeyJ');
  assert.ok(['轻锁','重锁'].includes(s.tierName));
});

test('restoring keeps current draw, permanent relief and all later draws',()=>{
  M.setDecay({rate:0});const original=M.create(30,{targetPool:pool(),seed:111,key:'Enter'},0);assert.ok(original);
  assert.ok([2,7].includes(original.target));
  M.relieve(original,.5,0);M.press(original,0);const saved=JSON.parse(JSON.stringify(original));
  const restored=M.restore(saved,0);assert.ok(restored);assert.equal(restored.target,original.target);
  assert.equal(restored.relief,.5);assert.equal(restored.progress,1);
  while(original.layers){assert.deepEqual([restored.target,restored.tier,restored.layers],[original.target,original.tier,original.layers]);
    M.relieve(original,original.target,0);M.relieve(restored,restored.target,0);
  }
  assert.equal(restored.layers,0);
});

test('relief pays actual independent layer targets and continues into the next fixed batch',()=>{
  M.setDecay({rate:0});const s=M.create(12,{targetPool:pool(),seed:999},0);assert.ok(s);
  assert.ok([2,7].includes(s.target));
  const expected=M.restore(JSON.parse(JSON.stringify(s)),0);let work=0;
  while(expected.layers){work+=expected.target;finish(expected);}
  assert.equal(M.add(s,1,0,{target:5}),true);const result=M.relieve(s,work+2,0);
  assert.deepEqual(result,{applied:work+2,unused:0,clearedLayers:12});assert.equal(s.layers,1);assert.equal(s.target,5);assert.equal(s.relief,2);
  const overflow=M.relieve(s,10,0);assert.deepEqual(overflow,{applied:3,unused:7,clearedLayers:1});
  assert.equal(M.add(s,1,0,{target:5}),true);assert.equal(s.relief,0);
});

test('billions of constant-target blindbox layers remain compact and relief can clear them',()=>{
  const single=[{id:'only',name:'一下',min:1,max:1,percent:100,look:'rare'}];
  const s=M.create(1000000000,{targetPool:single,seed:7},0);assert.ok(s);assert.equal(s.target,1);
  assert.ok(JSON.stringify(s).length<4000);
  assert.deepEqual(M.relieve(s,999999999,0),{applied:999999999,unused:0,clearedLayers:999999999});assert.equal(s.layers,1);
});

test('malformed random save state is rejected without discarding healthy fixed save support',()=>{
  const s=M.create(2,{targetPool:pool(),seed:1},0);assert.ok(s);
  const saved=JSON.parse(JSON.stringify(s));saved.queue[0].rngState=-1;assert.equal(M.restore(saved,0),null);
  const fixed=M.create(2,{target:3},0);assert.ok(M.restore(JSON.parse(JSON.stringify(fixed)),0));
});

test('variable-target batches have an explicit safe capacity and oversized saves are refused',()=>{
  assert.equal(M.create(20001,{targetPool:pool(),seed:1},0),null);
  const s=M.create(20000,{targetPool:pool(),seed:1},0);assert.ok(s);
  const saved=JSON.parse(JSON.stringify(s));saved.layers=20001;saved.queue[0].layers=20001;
  assert.equal(M.restore(saved,0),null);
});

test('fast relief preserves the exact later tier sequence of constant-target draws',()=>{
  const p=pool().map(item=>({...item,min:2,max:2}));
  const fast=M.create(40,{targetPool:p,seed:1},0),pressed=M.create(40,{targetPool:p,seed:1},0);
  M.relieve(fast,34,0);for(let i=0;i<17;i++)finish(pressed);
  assert.deepEqual([fast.target,fast.tier,fast.queue[0].rngState],[pressed.target,pressed.tier,pressed.queue[0].rngState]);
  while(fast.layers){assert.equal(fast.tier,pressed.tier);finish(fast);finish(pressed);}
});

test('disabled and zero-percent entries never draw and invalid seeded batches are refused',()=>{
  assert.equal(typeof R.drawTarget,'function');
  const p=[{id:'zero',name:'零',min:999,max:999,percent:0},
    {id:'on',name:'启用',min:1,max:1,percent:100},
    {id:'off',name:'停用',min:999,max:999,percent:100,enabled:false}];
  for(const n of [0,.2,.999999])assert.equal(R.drawTarget(p,()=>n).tier,'on');
  for(const seed of [-1,1.1,4294967296,NaN,'1'])assert.equal(M.create(1,{targetPool:p,seed},0),null);
});

test('queued blindbox current draws and future unopened batches survive refresh together',()=>{
  const s=M.create(2,{target:1},0);M.add(s,5,0,{targetPool:pool(),seed:1});M.add(s,5,0,{targetPool:pool(),seed:45});
  const restored=M.restore(JSON.parse(JSON.stringify(s)),0);assert.ok(restored);
  while(s.layers){assert.deepEqual([restored.target,restored.tier,restored.layers],[s.target,s.tier,s.layers]);finish(s);finish(restored);}
  assert.equal(restored.layers,0);
});
