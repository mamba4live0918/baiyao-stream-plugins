import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, breakChance } from '../src/game.js';

const seq = values => { let i = 0; return () => values[i++ % values.length]; };

test('一个弹幕观众同时只有一单，礼物订的不受限，订满了让他的南瓜跳一下', () => {
  const g = createGame();
  assert.ok(g.addOrder({ nick: '小白', uid: 'u1' }).order);
  assert.deepEqual(g.addOrder({ nick: '小白', uid: 'u1' }), { nudge: 'u1' });
  assert.ok(g.addOrder({ nick: '小白', uid: 'u1' }, { via: 'gift' }).order, '礼物订的照样加');
  assert.ok(g.addOrder({ nick: '大黄', uid: 'u2' }, { perPerson: 0 }).order);
  assert.ok(g.addOrder({ nick: '大黄', uid: 'u2' }, { perPerson: 0 }).order, '0 = 不限');
  assert.equal(g.state.queue.length, 4);
  g.startNext();
  assert.deepEqual(g.addOrder({ nick: '小白', uid: 'u1' }), { nudge: 'u1' }, '工作台上那单也算');
});

test('做一盏灯：开盖 → 刻 → 点亮 → 装糖，顺序不对就不动；装好糖直接记到塔顶', () => {
  const g = createGame({ random: () => 0.5 });
  g.addOrder({ nick: '小白', uid: 'u1', face: 'cat' });
  assert.equal(g.light(), false);
  const job = g.startNext();
  assert.equal(job.step, 'lid');
  assert.equal(g.addCut({ kind: 'hole', paths: [] }), false, '没开盖不能刻');
  assert.equal(g.fill(), null);
  assert.ok(g.openLid());
  assert.ok(g.addCut({ kind: 'hole', paths: [[[1, 2]]] }));
  assert.ok(g.addCut({ kind: 'slit', paths: [[[3, 4]]] }));
  assert.equal(g.undoCut().kind, 'slit');
  assert.ok(g.light());
  assert.equal(g.state.job.step, 'candy');
  assert.equal(g.undoCut(), null, '点亮以后不能再撤销');
  const lantern = g.fill();
  assert.equal(lantern.nick, '小白');
  assert.equal(lantern.face, 'cat');
  assert.equal(lantern.cuts.length, 1);
  assert.equal(g.state.job, null);
  assert.deepEqual(g.state.tower.map(l => l.id), [lantern.id]);
  assert.equal(g.state.made, 1);
});

test('一个洞都不刻也能点灯（闷灯）', () => {
  const g = createGame();
  g.addOrder({ nick: 'A', uid: 'a' }); g.startNext(); g.openLid();
  assert.ok(g.light());
  assert.ok(g.fill());
});

test('摔碎概率：最下面 2 层不碎，往上每层多 25%，第 6 层起必碎', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 9].map(n => breakChance(n)), [0, 0, 0.25, 0.5, 0.75, 1, 1]);
  assert.equal(breakChance(3, 0, 0.5), 1);
  assert.equal(breakChance('x'), 0);
});

function towerOf(n, random) {
  const g = createGame({ random });
  for (let i = 0; i < n; i++) {
    g.addOrder({ nick: '观众' + i, uid: 'u' + i });
    g.startNext(); g.openLid(); g.light(); g.fill();
  }
  return g;
}

test('推倒：从第几层起往上全掉；高的碎了重新排到最前面，低的没碎回到塔顶', () => {
  const g = towerOf(6, seq([0.5]));
  const fell = g.knock(2);
  assert.deepEqual(fell.map(f => f.layer), [3, 4, 5, 6]);
  assert.equal(g.state.tower.length, 2);
  assert.equal(g.state.air.length, 4);
  // 第 3 层：25% → 掷 0.5 不碎，回到塔顶；第 6 层：100% → 必碎
  assert.equal(g.landed(fell[0].lantern, fell[0].layer), false);
  assert.equal(g.state.tower.at(-1).nick, '观众2');
  assert.equal(g.landed(fell[3].lantern, fell[3].layer), true);
  assert.equal(g.state.queue[0].nick, '观众5');
  assert.equal(g.state.queue[0].redo, true);
  assert.equal(g.state.broken, 1);
  assert.equal(g.state.air.length, 2);
});

test('碎了的观众即使已经有单在排，也照样重新排一单（不受每人一单限制）', () => {
  const g = towerOf(5, () => 0);
  g.addOrder({ nick: '观众4', uid: 'u4' });
  const [f] = g.knock(4);
  g.landed(f.lantern, 6);
  assert.equal(g.state.queue.filter(o => o.uid === 'u4').length, 2);
  assert.equal(g.state.queue[0].redo, true);
});

test('小鬼叼走塔顶：救回来照常落地，飘走了就重新排', () => {
  const g = towerOf(3, () => 0.99);
  const taken = g.takeTop();
  assert.equal(taken.layer, 3);
  assert.equal(g.state.tower.length, 2);
  g.lose(taken.lantern);
  assert.equal(g.state.queue[0].nick, '观众2');
  assert.equal(g.state.lost, 1);
  assert.equal(g.state.air.length, 0);
  assert.equal(createGame().takeTop(), null);
});

test('存档：队伍、工作台进度、塔都还原；正在掉的灯算回塔上', () => {
  const g = towerOf(3, () => 0.5);
  g.addOrder({ nick: '小白', uid: 'u9', face: 'heart' });
  g.startNext(); g.openLid(); g.addCut({ kind: 'hole', paths: [[[10, 10], [20, 10], [20, 20]]] });
  g.addOrder({ nick: '大黄', uid: 'u8' });
  g.knock(2);
  const data = JSON.parse(JSON.stringify(g.snapshot()));
  const h = createGame();
  assert.ok(h.restore(data));
  assert.equal(h.state.tower.length, 3, '掉在半空的那盏回到塔上');
  assert.equal(h.state.job.nick, '小白');
  assert.equal(h.state.job.step, 'carve');
  assert.equal(h.state.job.cuts.length, 1);
  assert.equal(h.state.queue[0].nick, '大黄');
  assert.equal(h.restore({ v: 1 }), false);
  assert.equal(h.restore(null), false);
});

test('名字过滤：带联系方式的昵称不上屏', () => {
  const g = createGame();
  g.addOrder({ nick: '加我微信 abc', uid: 'x' });
  assert.equal(g.state.queue[0].nick, '观众');
});

test('小车拉走：塔上的灯全部装车（从塔顶往下），每盏得糖，装满多给，存档里也记着', () => {
  const g = towerOf(4, () => 0.5);
  const { lanterns, gained } = g.ship({ per: 1, bonus: 2, full: 6 });
  assert.deepEqual(lanterns.map(l => l.nick), ['观众3', '观众2', '观众1', '观众0']);
  assert.equal(gained, 4, '没装满：只有每盏 1 颗');
  assert.equal(g.state.candy, 5, '糖等车开走、飞进糖罐时才加');
  g.addCandy(gained);
  assert.equal(g.state.tower.length, 0);
  assert.equal(g.state.shipped, 4);
  assert.equal(g.knock(0).length, 0, '拉走以后推不倒了');
  const full = towerOf(6, () => 0.5).ship({ per: 1, bonus: 2, full: 6 });
  assert.equal(full.gained, 8, '满车 6 盏：6 + 2');
  assert.equal(createGame().ship().gained, 0, '空塔不给糖');
  const h = createGame();
  h.restore(JSON.parse(JSON.stringify(g.snapshot())));
  assert.equal(h.state.shipped, 4);
  assert.equal(h.state.candy, 9);
});

test('给糖：够才扣，不够一颗不扣；粉丝送糖加进来；清空回到开局的 5 颗', () => {
  const g = createGame();
  assert.equal(g.state.candy, 5);
  assert.equal(g.spend(4), true);
  assert.equal(g.state.candy, 1);
  assert.equal(g.spend(2), false);
  assert.equal(g.state.candy, 1);
  assert.equal(g.addCandy(10), 10);
  assert.equal(g.addCandy(-3), 0);
  assert.equal(g.state.candy, 11);
  g.reset();
  assert.equal(g.state.candy, 5);
});

test('灯展：送达的灯按装车顺序挂起来，存档里也有；贡献：谁的灯送达记谁一盏', () => {
  const g = towerOf(3, () => 0.5);
  g.ship();
  assert.deepEqual(g.state.shown.map(l => l.nick), ['观众0', '观众1', '观众2']);
  assert.equal(g.topFans(5).length, 3);
  assert.equal(g.topFans(5)[0].lanterns, 1);
  const h = createGame();
  h.restore(JSON.parse(JSON.stringify(g.snapshot())));
  assert.equal(h.state.shown.length, 3);
  assert.equal(Object.keys(h.state.fans).length, 3);
});

test('南瓜精灵帮做：排最前面的那单直接变成灯上塔，工作台上那个不动；帮做的人记一盏；没排队的就不做', () => {
  const g = createGame();
  g.addOrder({ nick: '台上的', uid: 'a' }); g.startNext();
  g.addOrder({ nick: '排第一', uid: 'b' }); g.addOrder({ nick: '排第二', uid: 'c' });
  const r = g.helpMake([{ kind: 'hole', paths: [] }], { nick: '好心人', uid: 'h' });
  assert.equal(r.lantern.nick, '排第一');
  assert.equal(g.state.job.nick, '台上的', '工作台上的不受影响');
  assert.deepEqual(g.state.queue.map(o => o.nick), ['排第二']);
  assert.deepEqual(g.state.tower.map(l => l.nick), ['排第一']);
  assert.equal(g.state.fans.h.help, 1);
  g.helpMake([], { nick: '好心人', uid: 'h' });
  assert.equal(g.helpMake([], { nick: '好心人', uid: 'h' }), null, '没有排队的了');
  assert.equal(g.state.fans.h.help, 2);
});

test('贡献榜：送达、帮做各 1 分，送糖 5 颗 1 分；清空以后榜和灯展都清掉', () => {
  const g = createGame();
  g.addCandy(10, { nick: '糖王', uid: 'c' });
  g.addCandy(3, null);
  g.addOrder({ nick: '订灯的', uid: 'o' });
  g.helpMake([], { nick: '帮手', uid: 'h' });
  const top = g.topFans(5);
  assert.deepEqual(top.map(f => f.nick), ['糖王', '帮手']);
  assert.equal(top[0].candy, 10);
  g.reset();
  assert.equal(g.topFans(5).length, 0);
  assert.equal(g.state.shown.length, 0);
});
