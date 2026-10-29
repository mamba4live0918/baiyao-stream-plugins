import test from 'node:test';
import assert from 'node:assert/strict';
import { SandField } from '../src/sandfield.js';

const field = () => new SandField({ x0: -2, z0: -1, width: 4, depth: 2, cell: 0.05, maxH: 0.9 });
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

test('撒沙：体积守恒，集中在落点附近', () => {
  const f = field();
  const added = f.deposit(0, 0, 0.02, 0.15);
  assert.ok(near(added, 0.02, 1e-6), 'added=' + added);
  assert.ok(near(f.total(), 0.02, 1e-6));
  assert.ok(f.heightAt(0, 0) > f.heightAt(0.3, 0));
  assert.equal(f.heightAt(1.5, 0.8), 0);
});

test('撒沙：格子外不收，超过最高处的部分不收', () => {
  const f = field();
  assert.equal(f.deposit(5, 5, 0.1), 0);
  const added = f.deposit(0, 0, 50, 0.1);
  assert.ok(added < 50);
  let max = 0;
  for (const h of f.h) max = Math.max(max, h);
  assert.ok(max <= 0.9 + 1e-6);
});

test('挖：只挖走有的沙，返回挖走的体积', () => {
  const f = field();
  f.deposit(0, 0, 0.01, 0.2);
  const before = f.total();
  const removed = f.dig(0, 0, 0.3, 10);
  assert.ok(near(before - f.total(), removed, 1e-9));
  assert.ok(f.heightAt(0, 0) < 1e-9);
  assert.equal(f.dig(1.5, 0.8, 0.2, 1), 0, '没沙的地方挖不出东西');
});

test('坍塌：体积守恒，坡度逐渐降到休止角以内', () => {
  const f = field();
  const k = f.nx * Math.floor(f.nz / 2) + Math.floor(f.nx / 2);
  f.h[k] = 0.6;
  const before = f.total();
  for (let i = 0; i < 400; i++) f.relax(0.65, 0.5);
  assert.ok(near(f.total(), before, 1e-6), `${f.total()} vs ${before}`);
  let worst = 0;
  for (let j = 0; j < f.nz; j++) {
    for (let i = 0; i < f.nx - 1; i++) worst = Math.max(worst, Math.abs(f.h[j * f.nx + i] - f.h[j * f.nx + i + 1]));
  }
  assert.ok(worst <= 0.65 * f.cell * 1.15, 'worst=' + worst);
});

test('扩散：体积守恒，尖包变平，不会挖出负数', () => {
  const f = field();
  const k = f.nx * 10 + 10;
  f.h[k] = 0.3;
  const before = f.total();
  for (let i = 0; i < 50; i++) f.diffuse(0.1);
  assert.ok(near(f.total(), before, 1e-6));
  assert.ok(f.h[k] < 0.3);
  assert.ok(Math.min(...f.h) >= 0);
});

test('高度插值：在两格之间线性过渡', () => {
  const f = field();
  f.h[0] = 0;
  f.h[1] = 1;
  assert.ok(near(f.heightAt(f.x0 + f.cell * 0.5, f.z0), 0.5, 1e-6));
});

test('水冲：打湿并冲走沙子；泥巴会被冲淡，慢慢变干', () => {
  const f = field();
  f.deposit(0, 0, 0.01, 0.2);
  f.smear(0, 0, 0.3, 1);
  const k = f.nx * Math.round((0 - f.z0) / f.cell) + Math.round((0 - f.x0) / f.cell);
  const mud = f.mud[k];
  const removed = f.wash(0, 0, 0.3, 0.01);
  assert.ok(removed > 0);
  assert.ok(f.wet[k] > 0.4);
  assert.ok(f.mud[k] < mud);
  f.dry(30);
  assert.ok(f.wet[k] < 0.2);
});
