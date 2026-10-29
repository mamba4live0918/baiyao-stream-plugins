import { test } from 'node:test';
import assert from 'node:assert/strict';
import { judgeDrop, newStats, recordWrong, statsLine, topStumper } from '../src/mistake.js';

const ctx = (o = {}) => ({ wrongMode: 'double', audit: false, remaining: 10, cap: 150, ...o });

test('right bin is accepted', () => assert.deepEqual(judgeDrop(1, true, 1, ctx()), { kind: 'accept' }));

test('unidentified items never double, even in the right bin', () => {
  assert.deepEqual(judgeDrop(1, false, 1, ctx()), { kind: 'unidentified' });
  assert.deepEqual(judgeDrop(1, false, 2, ctx()), { kind: 'unidentified' });
});

test('wrong bin doubles', () => assert.deepEqual(judgeDrop(0, true, 2, ctx()), { kind: 'wrong', copies: 1, mult: 2, capped: false }));

test('audit triples', () => assert.deepEqual(judgeDrop(0, true, 2, ctx({ audit: true })), { kind: 'wrong', copies: 2, mult: 3, capped: false }));

test('cap limits copies', () => {
  assert.deepEqual(judgeDrop(0, true, 2, ctx({ remaining: 150 })), { kind: 'wrong', copies: 0, mult: 2, capped: true });
  assert.deepEqual(judgeDrop(0, true, 2, ctx({ remaining: 200 })), { kind: 'wrong', copies: 0, mult: 2, capped: true });
  assert.deepEqual(judgeDrop(0, true, 2, ctx({ audit: true, remaining: 149 })), { kind: 'wrong', copies: 1, mult: 3, capped: true });
});

test('bounce mode never adds items', () => assert.deepEqual(judgeDrop(0, true, 2, ctx({ wrongMode: 'bounce', audit: true })), { kind: 'wrong', copies: 0, mult: 1, capped: false }));

test('stats are immutable and summarised', () => {
  const a = newStats(), b = recordWrong(a, 1, ''), c = recordWrong(b, 2, '小王'), d = recordWrong(c, 1, '小王'), e = recordWrong(d, 0, '阿橙');
  assert.deepEqual(a, { wrong: 0, extra: 0, stumped: {} });
  assert.deepEqual(b, { wrong: 1, extra: 1, stumped: {} });
  assert.equal(e.wrong, 4); assert.equal(e.extra, 4); assert.deepEqual(e.stumped, { 小王: 2, 阿橙: 1 });
  assert.equal(statsLine(e), '分错 4 次 · 多干 4 件'); assert.equal(statsLine(a), '');
  assert.equal(statsLine(recordWrong(a, 0, '')), '分错 1 次');
  assert.deepEqual(topStumper(e), { name: '小王', n: 2 }); assert.equal(topStumper(a), null);
});

test('base multiplier and audit multiplier are adjustable', () => {
  assert.deepEqual(judgeDrop(0, true, 2, ctx({ base: 3 })), { kind: 'wrong', copies: 2, mult: 3, capped: false });
  assert.deepEqual(judgeDrop(0, true, 2, ctx({ audit: true, auditMult: 5 })), { kind: 'wrong', copies: 4, mult: 5, capped: false });
  assert.deepEqual(judgeDrop(0, true, 2, ctx({ audit: true, auditMult: 2, base: 3 })), { kind: 'wrong', copies: 2, mult: 3, capped: false }, '抽查倍数不会低于平时');
});
