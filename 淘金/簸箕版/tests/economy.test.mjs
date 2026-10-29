import test from 'node:test';
import assert from 'node:assert/strict';
import { Economy } from '../src/economy.js';

test('入库：累计金额、记在矿主名下、记录最大一块', () => {
  const e = new Economy();
  e.bank(1.234, '阿花');
  e.bank(3.5, '阿花');
  e.bank(0.2, '小明');
  assert.equal(e.gold, 4.93);
  assert.equal(e.best, 3.5);
  assert.equal(e.pieces, 3);
  assert.deepEqual(e.top(e.owners), [{ name: '阿花', gold: 4.73 }, { name: '小明', gold: 0.2 }]);
});

test('被骗扣钱不会扣成负数', () => {
  const e = new Economy();
  e.bank(0.3);
  assert.equal(e.penalty(0.5), 0.3);
  assert.equal(e.gold, 0);
});

test('小偷按比例偷，记进大盗榜；抓到后原数退回并从榜上扣掉', () => {
  const e = new Economy();
  e.bank(10, '矿主');
  const take = e.steal(0.25, '大盗');
  assert.equal(take, 2.5);
  assert.equal(e.gold, 7.5);
  assert.deepEqual(e.top(e.thieves), [{ name: '大盗', gold: 2.5 }]);
  e.recover(2.5, '大盗');
  assert.equal(e.gold, 10);
  assert.equal(e.thieves.size, 0);
  assert.equal(new Economy().steal(0.5, 'x'), 0, '空金库偷不到');
});

test('存档：往返一致；坏数据不认', () => {
  const e = new Economy();
  e.bank(2, '阿花');
  e.steal(0.5, '大盗');
  const s = JSON.parse(JSON.stringify(e.export()));
  const f = new Economy();
  assert.equal(f.restore(s), true);
  assert.equal(f.gold, 1);
  assert.deepEqual(f.top(f.thieves), [{ name: '大盗', gold: 1 }]);
  assert.equal(new Economy().restore({ version: 9 }), false);
  const g = new Economy();
  g.restore({ version: 1, gold: -5, owners: [['x', -3], [42, 1], 'bad'] });
  assert.equal(g.gold, 0);
  assert.deepEqual([...g.owners], [['x', 0]]);
});

test('存档：榜单只留金额最高的 500 人，后来的大户不会被挤掉', () => {
  const e = new Economy();
  for (let i = 0; i < 600; i++) e.bank(i === 550 ? 99 : 0.1, '矿主' + i);
  const back = new Economy();
  assert.equal(back.restore(JSON.parse(JSON.stringify(e.export()))), true);
  assert.equal(back.owners.size, 500);
  assert.equal(back.owners.get('矿主550'), 99);
  assert.equal(back.top(back.owners, 1)[0].name, '矿主550');
  const v = back.version;
  back.bank(1, 'x');
  assert.ok(back.version > v, '每次变动版本号都会变，榜单据此重排');
});
