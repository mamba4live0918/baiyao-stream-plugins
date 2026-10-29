import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RefCache } from '../src/tex-pool.js';

test('creates once and disposes when the last reference is released', () => {
  const made = [], gone = [];
  const c = new RefCache(k => { made.push(k); return { k }; }, v => gone.push(v.k));
  const a = c.acquire('小王'), b = c.acquire('小王');
  assert.equal(a, b); assert.deepEqual(made, ['小王']); assert.equal(c.size, 1);
  c.release('小王'); assert.deepEqual(gone, []);
  c.release('小王'); assert.deepEqual(gone, ['小王']); assert.equal(c.size, 0);
  c.acquire('小王'); assert.deepEqual(made, ['小王', '小王']);
});

test('releasing an unknown key is a no-op', () => {
  const c = new RefCache(() => ({}), () => { throw new Error('should not dispose'); });
  c.release('a'); assert.equal(c.size, 0);
});

test('peek does not change counts', () => {
  const c = new RefCache(k => ({ k }), () => {});
  assert.equal(c.peek('x'), undefined); c.acquire('x'); assert.deepEqual(c.peek('x'), { k: 'x' }); assert.equal(c.refs('x'), 1);
});
