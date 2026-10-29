import test from 'node:test';
import assert from 'node:assert/strict';
import { settle } from '../src/cooking/settle.js';

const noRoll = () => { throw new Error('这一分支不应抽随机'); };

test('底价按一单收取，给对1份和4份都收15', () => {
  for (const wanted of [1, 4, 20]) {
    const result = settle({ wanted, given: wanted, rng: noRoll });
    assert.equal(result.coins, 15);
    assert.equal(result.income, 15);
    assert.equal(result.deduction, 0);
    assert.equal(result.caught, false);
    assert.equal(result.stamp, 'good');
  }
});

test('多给每份完整扣3，不随订单数量增加底价', () => {
  for (const [given, coins, deduction] of [[5, 12, 3], [6, 9, 6], [10, -3, 18]]) {
    const result = settle({ wanted: 4, given, rng: noRoll });
    assert.equal(result.coins, coins);
    assert.equal(result.excess, given - 4);
    assert.equal(result.income, 15);
    assert.equal(result.deduction, deduction);
    assert.equal(result.stamp, 'extra');
    assert.equal(result.reaction, '赚到了！');
  }
});

test('少给未发现每份多赚3，允许完整表示given0的短缺', () => {
  for (const [given, coins, shortage] of [[3, 18, 1], [2, 21, 2], [1, 24, 3], [0, 27, 4]]) {
    let rolls = 0;
    const result = settle({ wanted: 4, given, rng: () => { rolls += 1; return 0.99; } });
    assert.equal(result.coins, coins);
    assert.equal(result.shortage, shortage);
    assert.equal(result.caught, false);
    assert.equal(result.reaction, '好吃！');
    assert.equal(rolls, 1);
  }
});

test('少1/2/3及以上分别用15%/40%/70%，阈值本身不差评', () => {
  for (const [given, probability] of [[3, 0.15], [2, 0.4], [1, 0.7], [0, 0.7]]) {
    const caught = settle({ wanted: 4, given, mood: 'angry', rng: () => probability - 0.000001 });
    assert.equal(caught.coins, -10);
    assert.equal(caught.income, 0);
    assert.equal(caught.deduction, 10);
    assert.equal(caught.caught, true);
    assert.equal(caught.stamp, 'bad');
    assert.match(caught.reaction, /4/);
    const passed = settle({ wanted: 4, given, rng: () => probability });
    assert.equal(passed.caught, false);
    assert.ok(passed.coins > 15);
  }
});

test('心情只折底价，半价7.5保留小数', () => {
  for (const [mood, coins] of [['happy', 15], ['neutral', 15], ['impatient', 12], ['angry', 7.5], ['unknown', 15], ['toString', 15]]) {
    assert.equal(settle({ wanted: 4, given: 4, mood, rng: noRoll }).coins, coins);
  }
  assert.equal(settle({ wanted: 4, given: 3, mood: 'angry', rng: () => 1 }).coins, 10.5);
  assert.equal(settle({ wanted: 4, given: 6, mood: 'angry', rng: noRoll }).coins, 1.5);
  assert.equal(settle({ wanted: 4, given: 6, mood: 'impatient', rng: noRoll }).coins, 6);
  assert.equal(settle({ wanted: 4, given: 10, mood: 'angry', rng: noRoll }).coins, -10.5);
});

test('做坏优先直接0分和黑暗料理，不抽短缺随机或叠加罚款', () => {
  const result = settle({ wanted: 4, given: 1, mood: 'angry', ruined: true, sloppy: true, byHelper: true, rng: noRoll });
  assert.equal(result.coins, 0);
  assert.equal(result.caught, false);
  assert.equal(result.stamp, 'dark');
  assert.equal(result.reaction, '黑暗料理');
});

test('碎片不减数量也不额外扣钱，成功反应为凑合', () => {
  for (const [given, coins] of [[4, 15], [5, 12], [3, 18]]) {
    const result = settle({ wanted: 4, given, sloppy: true, rng: () => 1 });
    assert.equal(result.coins, coins);
    assert.equal(result.reaction, '凑合');
  }
  const caught = settle({ wanted: 4, given: 3, sloppy: true, rng: () => 0 });
  assert.equal(caught.stamp, 'bad');
  assert.notEqual(caught.reaction, '凑合');
});

test('帮手视为给对且全价，无心情折扣或短缺随机', () => {
  const result = settle({ wanted: 4, given: 1, mood: 'angry', sloppy: true, byHelper: true, rng: noRoll });
  assert.equal(result.coins, 15);
  assert.equal(result.given, 4);
  assert.equal(result.shortage, 0);
  assert.equal(result.excess, 0);
  assert.equal(result.caught, false);
  assert.equal(result.reaction, '好吃！');
});

test('自定义底价、差价、罚款、概率、折扣和坏菜收入分别生效', () => {
  const options = { baseCoins: 20, differenceCoins: 2.5, fine: 7.25, ruinedCoins: 1.5, shortProbabilities: [0.05, 0.25, 0.9], discounts: { angry: 0.3 } };
  assert.equal(settle({ wanted: 4, given: 4, mood: 'angry' }, options).coins, 6);
  assert.equal(settle({ wanted: 4, given: 3, mood: 'angry', rng: () => 0.05 }, options).coins, 8.5);
  assert.equal(settle({ wanted: 4, given: 3, rng: () => 0.049 }, options).coins, -7.25);
  assert.equal(settle({ wanted: 4, given: 2, rng: () => 0.249 }, options).caught, true);
  assert.equal(settle({ wanted: 4, given: 1, rng: () => 0.899 }, options).caught, true);
  assert.equal(settle({ wanted: 4, given: 4, ruined: true }, options).coins, 1.5);
  assert.equal(settle({ wanted: 4, given: 4, mood: 'impatient' }, options).coins, 16);
});

test('金额规范到两位小数，净额与UI别名对应同一次结算', () => {
  const result = settle({ wanted: 1, given: 2, mood: 'angry' }, { baseCoins: 0.1, differenceCoins: 0.1, discounts: { angry: 0.2 } });
  assert.equal(result.income, 0.02);
  assert.equal(result.deduction, 0.1);
  assert.equal(result.coins, -0.08);
  assert.equal(result.net, result.coins);
  assert.equal(result.text, result.reaction);
  assert.equal(result.badReview, result.caught);
});

test('非法数量抛错，部分坏配置回退默认且不修改输入', () => {
  for (const [wanted, given] of [[0, 1], [-1, 1], [1.5, 1], [4, -1], [4, 1.5], [4, NaN], [Infinity, 1]]) {
    assert.throws(() => settle({ wanted, given }), RangeError);
  }
  const input = Object.freeze({ wanted: 4, given: 4, mood: 'angry' });
  const options = Object.freeze({ baseCoins: -1, differenceCoins: NaN, discounts: Object.freeze({ angry: -1 }) });
  assert.equal(settle(input, options).coins, 7.5);
  assert.equal(settle(input, null).coins, 7.5);
});
