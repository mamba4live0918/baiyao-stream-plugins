const assert=require('node:assert/strict');
const test=require('node:test');
let C;try{C=require('../src/core.js')}catch{C={}}
test('参考视频十档数量',()=>assert.deepEqual(C.COUNTS,[1,2,5,11,15,20,40,50,80,100]));
test('首帧时间略早于点击也必须先播报，不提前结算',()=>{assert.equal(C.phaseAt(-2),0);assert.equal(C.phaseAt(0),0);assert.equal(C.phaseAt(2100),2);assert.equal(C.phaseAt(5400),4)});
test('报数与实落数量一致，结算重复调用不再掉落',()=>{const s=C.fresh();const r=C.start(s,()=>.999,0);assert.equal(r.count,100);assert.equal(C.resolve(s),100);assert.equal(s.outside,100);assert.equal(C.resolve(s),0);assert.equal(s.outside,100)});
test('没抓到不产生小牛，收回不能重复计数',()=>{const s=C.fresh();C.start(s,()=>0,100);assert.equal(C.resolve(s),0);C.finish(s);C.add(s,15);assert.equal(C.collect(s,30),15);assert.equal(C.collect(s,1),0);assert.equal(s.home,15)});
test('刷新保留当前已执行状态，待执行不提前掉落',()=>{const s=C.fresh();C.enqueue(s,3);C.start(s,()=>.3,0);const a=C.restore(JSON.stringify(s));assert.equal(a.outside,0);C.resolve(a);const b=C.restore(JSON.stringify(a));const n=b.outside;assert.equal(C.resolve(b),0);assert.equal(b.outside,n);assert.equal(b.queue,2)});
test('异常记录拒绝，数量有限且为整数',()=>{assert.equal(C.restore('{'),null);assert.equal(C.restore('{"version":1,"outside":-4}'),null);const s=C.fresh();assert.equal(C.add(s,Infinity),0);assert.equal(C.add(s,-1),0);assert.equal(C.add(s,1.2),0);assert.equal(C.enqueue(s,NaN),0)});
