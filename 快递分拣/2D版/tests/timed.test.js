import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pushSeg, segAt, segsEnd, segAfter } from '../src/timed.js';

test('a cheaper gift queues after a pricier one and keeps its own value and name', () => {
  let r = pushSeg([], 0, 20, 4, 'A', 45); assert.equal(r.added, 20);
  r = pushSeg(r.segs, 5, 6, 2, 'B', 45); assert.equal(r.added, 6);
  assert.deepEqual(segAt(r.segs, 10), { start: 0, end: 20, val: 4, name: 'A' });
  assert.deepEqual(segAt(r.segs, 22), { start: 20, end: 26, val: 2, name: 'B' });
  assert.deepEqual(segAfter(r.segs, segAt(r.segs, 10)), { start: 20, end: 26, val: 2, name: 'B' });
  assert.equal(segAt(r.segs, 26), null); assert.equal(segsEnd(r.segs, 10), 26); assert.equal(segsEnd([], 7), 7);
});

test('the horizon caps the queue; a full queue adds nothing', () => {
  let r = pushSeg([], 0, 30, 2, 'A', 45); r = pushSeg(r.segs, 0, 30, 3, 'B', 45);
  assert.equal(r.added, 15); assert.equal(segsEnd(r.segs, 0), 45);
  const full = pushSeg(r.segs, 0, 10, 4, 'C', 45); assert.equal(full.added, 0); assert.equal(full.segs.length, 2);
});

test('same viewer and value extends the last segment; expired segments drop; input is not mutated', () => {
  const a = pushSeg([], 0, 5, 2, 'A', 45).segs, b = pushSeg(a, 1, 5, 2, 'A', 45).segs;
  assert.equal(b.length, 1); assert.equal(b[0].end, 10); assert.equal(a[0].end, 5, '原数组不变');
  const c = pushSeg(b, 30, 4, 3, 'B', 45).segs; assert.deepEqual(c, [{ start: 30, end: 34, val: 3, name: 'B' }]);
});
