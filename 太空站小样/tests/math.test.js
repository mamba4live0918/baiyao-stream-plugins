import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clamp, damp, mulberry32, randomUnit, remap, smoothstep } from '../src/core/math.js';

test('remap clamps to 0..1', () => {
  assert.equal(remap(5, 0, 10), 0.5);
  assert.equal(remap(-1, 0, 10), 0);
  assert.equal(remap(11, 0, 10), 1);
});

test('remap with equal bounds acts as a step instead of dividing by zero', () => {
  assert.equal(remap(0.4, 0.5, 0.5), 0);
  assert.equal(remap(0.5, 0.5, 0.5), 1);
});

test('smoothstep is 0 at a, 1 at b and 0.5 halfway', () => {
  assert.equal(smoothstep(0, 1, 0), 0);
  assert.equal(smoothstep(0, 1, 1), 1);
  assert.equal(smoothstep(0, 1, 0.5), 0.5);
});

test('clamp keeps values inside the range', () => {
  assert.equal(clamp(2), 1);
  assert.equal(clamp(-2), 0);
  assert.equal(clamp(5, 0, 10), 5);
});

test('mulberry32 gives the same sequence for the same seed', () => {
  const a = mulberry32(42);
  const b = mulberry32(42);
  for (let i = 0; i < 5; i++) assert.equal(a(), b());
  const c = mulberry32(43);
  assert.notEqual(mulberry32(42)(), c());
});

test('randomUnit returns unit-length vectors', () => {
  const rand = mulberry32(7);
  for (let i = 0; i < 50; i++) {
    const [x, y, z] = randomUnit(rand);
    assert.ok(Math.abs(Math.hypot(x, y, z) - 1) < 1e-9);
  }
});

test('damp moves towards the target without overshooting', () => {
  let v = 0;
  for (let i = 0; i < 100; i++) {
    v = damp(v, 1, 5, 1 / 60);
    assert.ok(v <= 1);
  }
  assert.ok(v > 0.99);
});
