import test from 'node:test';
import assert from 'node:assert/strict';
import { createKitchen, reduceKitchen } from '../src/cooking/kitchen.js';

const act = (state, type, now = 0, fields = {}) => reduceKitchen(state, { type, ...fields }, now);
const load = (state, count, now = 0) => {
  for (let index = 0; index < count; index += 1) state = act(state, 'load', now);
  return state;
};
const deepFreeze = value => {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
};

test('面馆一下一两，4秒前生面不能捞，4秒边界进入熟面窗口', () => {
  let state = load(createKitchen('noodle'), 3, 100);
  assert.equal(state.pot.amount, 3);
  assert.equal(state.pot.status, 'raw');
  state = act(state, 'scoop', 4099);
  assert.equal(state.bowl, 0);
  assert.equal(state.pot.amount, 3);
  state = act(state, 'scoop', 4100);
  assert.equal(state.bowl, 1);
  assert.equal(state.pot.amount, 2);
  assert.equal(state.pot.status, 'ready');
  state = act(state, 'scoop', 4101);
  state = act(state, 'scoop', 4102);
  assert.equal(state.bowl, 3);
  assert.deepEqual(state.pot, { amount: 0, status: 'empty', startedAt: null });
});

test('绿窗6秒到期先冒烟3秒，再着火8秒烧坏锁锅，灭火后才可重做', () => {
  const fresh = load(createKitchen('noodle'), 2);
  const lastReady = act(fresh, 'tick', 9999);
  assert.equal(lastReady.pot.status, 'ready');
  const smoking=act(lastReady,'tick',10000);
  assert.equal(smoking.pot.status,'smoking');assert.equal(act(smoking,'tick',12999).pot.status,'smoking');
  const fire=act(smoking,'tick',13000);assert.equal(fire.pot.status,'fire');assert.equal(fire.pot.fireStartedAt,13000);assert.equal(fire.pot.fireSource,'heat');
  assert.equal(act(fire,'tick',20999).pot.status,'fire');
  let burnt = act(fire, 'tick', 21000);
  assert.equal(burnt.pot.status, 'burnt');
  assert.equal(burnt.stoveLocked,true);assert.equal(burnt.pot.fireStartedAt,13000);assert.equal(burnt.pot.fireSource,'heat');
  assert.equal(act(burnt, 'scoop', 21000).bowl, 0);
  assert.equal(act(burnt, 'load', 21000).pot.amount, 2);
  assert.equal(act(burnt,'clearPot',21000).stoveLocked,true);
  burnt = act(burnt, 'repair', 21000);
  const restarted = act(burnt, 'load', 21001);
  assert.equal(restarted.pot.status, 'raw');
  assert.equal(restarted.pot.startedAt, 21001);
});

test('新加生面重置整锅火候，不把新面当成已熟', () => {
  let state = load(createKitchen('noodle'), 2);
  state = act(state, 'tick', 4000);
  assert.equal(state.pot.status, 'ready');
  state = act(state, 'load', 5000);
  assert.equal(state.pot.amount, 3);
  assert.equal(state.pot.status, 'raw');
  assert.equal(act(state, 'scoop', 8999).bowl, 0);
  assert.equal(act(state, 'scoop', 9000).bowl, 1);
});

test('容量0无隐藏上限，正数容量只限制锅，不限制备货碗', () => {
  const unlimited = load(createKitchen('noodle'), 600);
  assert.equal(unlimited.pot.amount, 600);
  let state = load(createKitchen('noodle', { capacity: 2 }), 3);
  assert.equal(state.pot.amount, 2);
  for (let round = 0; round < 3; round += 1) {
    state = act(state, 'scoop', 4000 + round * 4000);
    state = act(state, 'scoop', 4000 + round * 4000);
    state = load(state, 2, 4000 + round * 4000);
  }
  assert.equal(state.bowl, 6);
});

test('倒锅和倒碗独立，支持自定义火候', () => {
  let state = load(createKitchen('noodle', { cookMs: 2000, readyMs: 3000 }), 2);
  state = act(state, 'scoop', 2000);
  const clearDish = act(state, 'clearDish', 2000);
  assert.equal(clearDish.bowl, 0);
  assert.equal(clearDish.pot.amount, 1);
  const clearPot = act(state, 'clearPot', 2000);
  assert.equal(clearPot.pot.amount, 0);
  assert.equal(clearPot.bowl, 1);
  assert.equal(act(state, 'tick', 5000).pot.status, 'smoking');
  assert.equal(act(state, 'tick', 8000).pot.status, 'fire');
});

test('鱼块默认8片，已有鱼块不能重上，上划不切', () => {
  let state = act(createKitchen('sushi'), 'load');
  assert.equal(state.block, 8);
  state = act(state, 'load');
  assert.equal(state.block, 8);
  state = act(state, 'slice', 0, { direction: 'up' });
  assert.equal(state.slices.length, 0);
  for (let index = 0; index < 9; index += 1) state = act(state, 'slice', 0, { direction: 'down' });
  assert.equal(state.block, 0);
  assert.equal(state.slices.length, 8);
});

test('斜向下切片仍算1，装盘每拖一次只拿1片并保留碎片属性', () => {
  let state = act(createKitchen('sushi'), 'load');
  state = act(state, 'slice', 0, { broken: true });
  state = act(state, 'slice');
  assert.equal(state.block, 6);
  assert.deepEqual(state.slices, [{ broken: true }, { broken: false }]);
  state = act(state, 'plate');
  assert.deepEqual(state.plate, [{ broken: true }]);
  assert.deepEqual(state.slices, [{ broken: false }]);
});

test('切完鱼块可继续上新鱼块，已切备货和盘中数量不丢', () => {
  let state = act(createKitchen('sushi', { fishPieces: 2 }), 'load');
  state = act(state, 'slice');
  state = act(state, 'slice');
  state = act(state, 'plate');
  state = act(state, 'load');
  assert.equal(state.block, 2);
  assert.equal(state.slices.length, 1);
  assert.equal(state.plate.length, 1);
  assert.equal(act(state, 'clearDish').slices.length, 1);
  const clearBoard = act(state, 'clearBoard');
  assert.equal(clearBoard.block, 0);
  assert.equal(clearBoard.slices.length, 0);
  assert.equal(clearBoard.plate.length, 1);
});

test('空菜不能端起，端起后锁定份数，错误id和重复端菜无效', () => {
  const empty = createKitchen('noodle');
  assert.equal(act(empty, 'takeDish').pending, null);
  let state = load(empty, 2);
  state = act(state, 'scoop', 4000);
  state = act(state, 'takeDish', 4000);
  assert.equal(state.bowl, 0);
  assert.equal(state.pending.given, 1);
  assert.equal(state.pending.id, 1);
  assert.equal(state.pending.shop, 'noodle');
  assert.equal(act(state, 'scoop', 4000).bowl, 0);
  assert.equal(act(state, 'clearDish', 4000).pending.given, 1);
  assert.equal(act(state, 'takeDish', 4000).nextDishId, 2);
  assert.equal(act(state, 'completeDish', 4000, { id: 999 }).pending.given, 1);
  assert.equal(act(state, 'cancelDish', 4000, { id: 999 }).pending.given, 1);
  const cancelled = act(state, 'cancelDish', 4000, { id: 1 });
  assert.equal(cancelled.bowl, 1);
  assert.equal(cancelled.pending, null);
  assert.equal(cancelled.pot.amount, 1);
});

test('完成端菜仅一次，旧id不能误清下一份', () => {
  let state = load(createKitchen('noodle'), 2);
  state = act(state, 'scoop', 4000);
  state = act(state, 'takeDish', 4000);
  state = act(state, 'completeDish', 4000, { id: 1 });
  assert.equal(state.pending, null);
  assert.equal(state.bowl, 0);
  state = act(state, 'scoop', 4000);
  state = act(state, 'takeDish', 4000);
  assert.equal(state.pending.id, 2);
  assert.equal(act(state, 'completeDish', 4000, { id: 1 }).pending.id, 2);
  state = act(state, 'completeDish', 4000, { id: 2 });
  assert.equal(state.pending, null);
  assert.equal(act(state, 'completeDish', 4000, { id: 2 }).nextDishId, 3);
});

test('取消日料端菜还原整个盘子和碎片顺序', () => {
  let state = act(createKitchen('sushi'), 'load');
  state = act(state, 'slice', 0, { broken: true });
  state = act(state, 'slice');
  state = act(state, 'plate');
  state = act(state, 'plate');
  state = act(state, 'takeDish');
  assert.equal(state.pending.given, 2);
  assert.equal(state.pending.broken, 1);
  assert.deepEqual(state.pending.items, [{ broken: true }, { broken: false }]);
  assert.equal(state.plate.length, 0);
  assert.equal(act(state, 'slice').block, 6);
  state = act(state, 'cancelDish', 0, { id: state.pending.id });
  assert.deepEqual(state.plate, [{ broken: true }, { broken: false }]);
  assert.equal(state.pending, null);
});

test('厨房是纯不可变状态，冻结旧状态也能正常动作且不会倒退焦锅', () => {
  const initial = deepFreeze(createKitchen('noodle'));
  const loaded = deepFreeze(act(initial, 'load', 100));
  assert.equal(initial.pot.amount, 0);
  const ready = deepFreeze(act(loaded, 'tick', 4100));
  const scooped = act(ready, 'scoop', 4100);
  assert.equal(ready.bowl, 0);
  assert.equal(scooped.bowl, 1);
  let fish = act(createKitchen('sushi'), 'load');
  fish = deepFreeze(act(fish, 'slice'));
  assert.equal(act(fish, 'plate').plate.length, 1);
  assert.equal(fish.slices.length, 1);
  const burnt = act(loaded, 'tick', 21100);
  assert.equal(act(burnt, 'tick', 200).pot.status, 'burnt');
});

test('外部放火两店对称，烧坏后锁工作台并污染现有菜，修复后可重做',()=>{
 for(const shop of ['noodle','sushi']){
  let state=createKitchen(shop);
  if(shop==='noodle'){state=load(state,2);state=act(state,'scoop',4000);}else{state=act(state,'load');state=act(state,'slice');state=act(state,'plate');}
  state=act(state,'ignite',5000);assert.equal(state.pot.fireSource,'external');assert.equal(state.pot.fireStartedAt,5000);assert.equal(state.badDish,false);
  state=act(state,'burn',13000);assert.equal(state.stoveLocked,true);assert.equal(state.badDish,true);assert.equal(state.pot.fireStartedAt,5000);assert.equal(state.pot.fireSource,'external');
  const blocked=act(state,shop==='noodle'?'load':'slice',13001);assert.equal(shop==='noodle'?blocked.pot.amount:blocked.slices.length,shop==='noodle'?state.pot.amount:state.slices.length);
  state=act(state,'repair',13002);assert.equal(state.stoveLocked,false);assert.equal(state.pot.status,'empty');
  const pending=act(state,'takeDish',13003);assert.equal(pending.pending.ruined,true);
 }
});
test('快进直接越过自然烟火也保留原火源和火起时间，不重新赠送8秒',()=>{
 const state=act(load(createKitchen('noodle'),1),'tick',600000);
 assert.equal(state.pot.status,'burnt');assert.equal(state.pot.fireStartedAt,13000);assert.equal(state.pot.fireSource,'heat');assert.equal(state.stoveLocked,true);
});
test('猫批量偷吃按碗再锅、盘再切片再鱼块扣，超大量不循环展开',()=>{
 let noodle=load(createKitchen('noodle'),5);noodle=act(noodle,'scoop',4000);noodle=act(noodle,'scoop',4000);
 noodle=act(noodle,'eat',4000,{count:3});assert.equal(noodle.bowl,0);assert.equal(noodle.pot.amount,2);
 noodle=act(noodle,'eat',4000,{count:1000000000});assert.equal(noodle.bowl,0);assert.equal(noodle.pot.amount,0);
 let fish=act(createKitchen('sushi'),'load');for(let i=0;i<4;i++)fish=act(fish,'slice');for(let i=0;i<2;i++)fish=act(fish,'plate');
 fish=act(fish,'eat',0,{count:5});assert.equal(fish.plate.length,0);assert.equal(fish.slices.length,0);assert.equal(fish.block,3);
});
test('乱加料随成品端起、取消、倒掉迁移，不污染已经在途的菜',()=>{
 let s=load(createKitchen('noodle'),2);s=act(s,'scoop',4000);s=act(s,'spice',4000);assert.equal(s.badDish,true);
 s=act(s,'takeDish',4000);assert.equal(s.pending.ruined,true);assert.equal(s.badDish,false);
 const held=s;s=act(s,'spice',4000);s=act(s,'eat',4000,{count:100});assert.deepEqual(s.pending,held.pending);assert.equal(s.pot.amount,1);
 s=act(s,'cancelDish',4000,{id:s.pending.id});assert.equal(s.badDish,true);assert.equal(s.bowl,1);
 s=act(s,'clearDish',4000);assert.equal(s.badDish,false);assert.equal(s.bowl,0);
});
test('在途菜不追溯烧坏，灭火与烧坏只改变工作台',()=>{
 let s=load(createKitchen('noodle'),2);s=act(s,'scoop',4000);s=act(s,'takeDish',4000);const receipt=s.pending;
 s=act(s,'ignite',4000);s=act(s,'burn',12000);assert.equal(s.pending,receipt);assert.equal(s.pending.ruined,false);assert.equal(s.stoveLocked,true);
 s=act(s,'repair',12001);assert.equal(s.pending,receipt);assert.equal(s.stoveLocked,false);
 s=act(s,'completeDish',12002,{id:receipt.id});assert.equal(s.pending,null);
});

test('四店厨房可创建，非法店名抛错，非法配置回退，切店使用新厨房归零', () => {
  assert.throws(() => createKitchen('unknown'), RangeError);
  assert.equal(createKitchen('tea').shop,'tea');assert.equal(createKitchen('pancake').shop,'pancake');
  const safe = createKitchen('sushi', { fishPieces: 0, capacity: -1, cookMs: NaN, readyMs: -1 });
  assert.equal(act(safe, 'load').block, 8);
  const noodles = load(createKitchen('noodle'), 2);
  assert.equal(createKitchen('sushi').bowl, 0);
  assert.equal(createKitchen('sushi').slices.length, 0);
  assert.equal(noodles.pot.amount, 2);
});
