import test from 'node:test';
import assert from 'node:assert/strict';
import { createInbox } from '../src/inbox.js';
test('入店随机外观和数量固定保存，催单不重抽',()=>{
 let rolls=0;const box=createInbox(()=>({order:{perPerson:1}}),{now:()=>2000,random:()=>{rolls++;return 0;}});
 box.accept({kind:'order',uid:'rng'});assert.equal(box.orders[0].appearance,1);assert.deepEqual(box.orders[0].quantities,{noodle:1,pancake:1,tea:1,sushi:3});
 assert.deepEqual(box.orders[0].crowdOffset,{x:-.12,y:-.06,scale:-.05});
 const offset=box.orders[0].crowdOffset;
 box.accept({kind:'order',uid:'rng'});assert.equal(rolls,8);assert.equal(box.orders[0].appearance,1);assert.equal(box.orders[0].crowdOffset,offset);
 const upper=createInbox(()=>({order:{perPerson:1}}),{random:()=>1});upper.accept({kind:'order',uid:'max'});assert.equal(upper.orders[0].appearance,16);assert.deepEqual(upper.orders[0].quantities,{noodle:3,pancake:2,tea:3,sushi:5});
});
test('每个入场顾客固定独立错位，移除前一位后不重新抽取',()=>{
 const values=[.5,.5,.5,.5,.5,0,.25,1,.5,.5,.5,.5,.5,1,.75,0];
 let draws=0;const box=createInbox(()=>({order:{perPerson:0}}),{random:()=>values[draws++]});
 box.accept({kind:'order',uid:'batch',count:2});
 assert.equal(draws,16);
 assert.deepEqual(box.orders.map(order=>order.crowdOffset),[{x:-.12,y:-.03,scale:.05},{x:.12,y:.03,scale:-.05}]);
 const remaining=box.orders[1],offset=remaining.crowdOffset;
 box.orders.shift();
 assert.equal(box.orders[0],remaining);
 assert.equal(box.orders[0].crowdOffset,offset);
 assert.equal(draws,16);
});
test('点单只留内存，50 个独立顾客全部接收',()=>{const x=createInbox(()=>({order:{perPerson:1}})); for(let i=0;i<50;i++)x.accept({kind:'order',uid:String(i),nick:'顾客'});assert.equal(x.orders.length,50);});
test('同一人再次点单标记催单；0 不限',()=>{let limit=1;const x=createInbox(()=>({order:{perPerson:limit}}));x.accept({kind:'order',uid:'a',nick:'甲'});x.accept({kind:'order',uid:'a',nick:'甲'});assert.equal(x.orders.length,1);assert.equal(x.orders[0].urges,1);limit=0;x.accept({kind:'order',uid:'a',nick:'甲'});assert.equal(x.orders.length,2);});
test('后续效果按数量保留，不提前执行或截断',()=>{const x=createInbox(()=>({order:{perPerson:1}}));x.accept({kind:'fire',count:50000,nick:'甲'});assert.equal(x.events[0].count,50000);assert.equal(x.accept({kind:'unknown'}),false);});
test('批量点单保留数量，有每人限制时其余记作催单',()=>{let limit=0;const x=createInbox(()=>({order:{perPerson:limit}}));x.accept({kind:'order',count:3,uid:'a'});assert.equal(x.orders.length,3);limit=1;const y=createInbox(()=>({order:{perPerson:limit}}));y.accept({kind:'order',count:3,uid:'a'});assert.equal(y.orders.length,1);assert.equal(y.orders[0].urges,2);});

test('过滤成相同昵称的无 uid 顾客使用各自事件 id，不共用名额',()=>{
  const x=createInbox(()=>({order:{perPerson:1}}));
  x.accept({kind:'order',id:'comment-a',nick:'加 微 信',source:'comment'});
  x.accept({kind:'order',id:'comment-b',nick:'ＶＸ',source:'comment'});
  assert.equal(x.orders.length,2);
  assert.deepEqual(x.orders.map(order=>order.nick),['观众','观众']);
  assert.deepEqual(x.orders.map(order=>order.id),['comment-a','comment-b']);
  assert.notEqual(x.orders[0].uid,x.orders[1].uid);
});

test('无 uid 也无事件 id 时，每次接收分配独立身份',()=>{
  const x=createInbox(()=>({order:{perPerson:1}}));
  for(let i=0;i<3;i++)x.accept({kind:'order',nick:'观众'});
  assert.equal(x.orders.length,3);
  assert.equal(new Set(x.orders.map(order=>order.uid)).size,3);
  assert.equal(new Set(x.orders.map(order=>order.id)).size,3);
  assert.ok(x.orders.every(order=>order.id && order.uid!=='观众'));
});

test('礼物、弹幕、动作的同名事件 id 分开计算无 uid 名额',()=>{
  const x=createInbox(()=>({order:{perPerson:1}}));
  for(const source of ['gift','comment','action'])x.accept({kind:'order',id:'shared',nick:'观众',source});
  assert.equal(x.orders.length,3);
  assert.equal(new Set(x.orders.map(order=>order.uid)).size,3);
});

test('a batched source id still creates distinct internal order keys with one received timestamp',()=>{
  let clockCalls=0;
  const x=createInbox(()=>({order:{perPerson:0}}),{now:()=>{clockCalls++;return 1234;}});
  x.accept({kind:'order',uid:'a',id:'batch-a',count:3});
  assert.equal(x.orders.length,3);
  assert.equal(new Set(x.orders.map(order=>order.key)).size,3);
  assert.ok(x.orders.every(order=>typeof order.key==='string'&&order.key.length>0));
  assert.deepEqual(x.orders.map(order=>order.id),['batch-a','batch-a','batch-a']);
  assert.deepEqual(x.orders.map(order=>order.receivedAt),[1234,1234,1234]);
  assert.ok(x.orders.every(order=>order.lastUrgedAt===null&&order.urgeSerial===0));
  assert.equal(clockCalls,1);
});

test('urging an existing owner timestamps every owned customer without discarding excess quantity',()=>{
  let now=0;
  const x=createInbox(()=>({order:{perPerson:2}}),{now:()=>now});
  x.accept({kind:'order',uid:'a',id:'first',count:2});
  const keys=x.orders.map(order=>order.key);
  now=1000;
  x.accept({kind:'order',uid:'a',id:'again',count:3});
  assert.equal(x.orders.length,2);
  assert.deepEqual(x.orders.map(order=>order.key),keys);
  assert.deepEqual(x.orders.map(order=>order.lastUrgedAt),[1000,1000]);
  assert.deepEqual(x.orders.map(order=>order.urgeSerial),[1,1]);
  assert.equal(x.orders.reduce((sum,order)=>sum+order.urges,0),3);
  x.accept({kind:'order',uid:'a',id:'again-two',count:2});
  assert.deepEqual(x.orders.map(order=>order.urgeSerial),[2,2]);
  assert.equal(x.orders.reduce((sum,order)=>sum+order.urges,0),5);
});

test('new orders draw inclusive endpoints from all four configured quantity ranges',()=>{
  const settings={order:{perPerson:0},cooking:{quantities:{noodle:[8,10],sushi:[6,7],pancake:[4,4],tea:[9,12]}}};
  for(const [random,expected]of [[()=>0,{noodle:8,pancake:4,tea:9,sushi:6}],[()=>1,{noodle:10,pancake:4,tea:12,sushi:7}]]){
    const box=createInbox(()=>settings,{random});
    box.accept({kind:'order',uid:'custom'});
    assert.deepEqual(box.orders[0].quantities,expected);
  }
});

test('editing ranges affects only future orders and urging does not draw again',()=>{
  let draws=0;
  const settings={order:{perPerson:1},cooking:{quantities:{noodle:[2,2],sushi:[4,4],pancake:[1,1],tea:[2,2]}}};
  const box=createInbox(()=>settings,{random:()=>{draws++;return .5;}});
  box.accept({kind:'order',uid:'first'});
  const order=box.orders[0],offset=order.crowdOffset;
  settings.cooking.quantities={noodle:[9,9],sushi:[8,8],pancake:[7,7],tea:[6,6]};
  settings.shop='sushi';
  box.accept({kind:'order',uid:'first'});
  assert.equal(draws,8);
  assert.deepEqual(order.quantities,{noodle:2,pancake:1,tea:2,sushi:4});
  assert.equal(order.crowdOffset,offset);
  box.accept({kind:'order',uid:'second'});
  assert.equal(draws,16);
  assert.deepEqual(box.orders[1].quantities,{noodle:9,pancake:7,tea:6,sushi:8});
});

test('switch reroll changes only the selected shop demand and retains each customer identity',()=>{
  let draws=0,value=0;
  const settings={order:{perPerson:0},cooking:{quantities:{sushi:[7,9]}}};
  const box=createInbox(()=>settings,{random:()=>{draws++;return value;},now:()=>1234});
  box.accept({kind:'order',uid:'batch',count:2});
  const snapshots=box.orders.map(order=>({...order,quantities:{...order.quantities}}));
  const orders=[...box.orders];
  value=1;
  assert.equal(box.rerollQuantities('sushi'),true);
  assert.equal(draws,18);
  for(let i=0;i<2;i++){
    assert.equal(box.orders[i],orders[i]);
    assert.deepEqual(box.orders[i],{...snapshots[i],quantities:{...snapshots[i].quantities,sushi:9}});
    assert.equal(box.orders[i].crowdOffset,snapshots[i].crowdOffset);
  }
  settings.cooking.quantities.sushi=[11,11];
  box.rerollQuantities('sushi');
  assert.deepEqual(box.orders.map(order=>order.quantities.sushi),[11,11]);
  assert.equal(box.rerollQuantities('missing'),false);
  assert.equal(draws,20);
});
