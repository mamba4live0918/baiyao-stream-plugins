import test from 'node:test';
import assert from 'node:assert/strict';
import { PanSim } from '../src/pan.js';
import { BASKET, surfaceY } from '../src/shape.js';

const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg}: ${a} vs ${b}`);

test('簸箕形状：后背和两边高，前口低；底是浅凹', () => {
  const back = surfaceY(0, -BASKET.D / 2);
  const lip = surfaceY(0, BASKET.D / 2);
  const side = surfaceY(BASKET.W / 2, -BASKET.D / 2 + 0.1);
  const mid = surfaceY(0, 0);
  assert.ok(back > 0.25, '后背够高');
  assert.ok(lip < 0.01, '前口贴着底');
  assert.ok(side > 0.2, '后半边的帮子高');
  assert.ok(mid < 0.05, '中间是底');
});

test('水：体积守恒，往前倾时水涌到前口', () => {
  const p = new PanSim();
  p.computeWater(0, 0);
  const vol = () => p.water.reduce((s, d) => s + d, 0) * p.cell * p.cell;
  near(vol(), p.waterVol, 1e-4, '平放时水量');
  const atFront = () => p.water[(p.nz - 2) * p.nx + Math.floor(p.nx / 2)];
  const flat = atFront();
  p.computeWater(0, -0.25);
  near(vol(), p.waterVol, 1e-4, '前倾时水量');
  assert.ok(atFront() > flat, '前倾后前口更深');
  assert.ok(p.spillWater.some(v => v > 0), '前倾会从前口溢出');
  /* 竹筒一直引水：平放一会儿以后，进出平衡，水量稳定 */
  const q = new PanSim();
  for (let i = 0; i < 60 * 20; i++) q.step(1 / 60, { A: 0, bz: -Math.tan(0.03) });
  near(q.waterOut, q.inflow, q.inflow * 0.15, '进出平衡');
});

test('淘洗：沙子只会从前口冲出去，总量守恒，不会出现负数', () => {
  const p = new PanSim();
  p.field.deposit(0, 0, 0.05, 0.4);
  const before = p.total();
  let spilled = 0;
  for (let i = 0; i < 300; i++) spilled += p.step(1 / 60, { A: 0.7, bx: 0.05, bz: -0.2 });
  near(p.total() + spilled, before, 1e-6, '剩下 + 冲走 = 原来');
  assert.ok(spilled > before * 0.1, '5 秒好好淘能冲走一部分');
  assert.ok(p.field.h.every(v => v >= 0), '没有负数');
});

test('不晃就不冲；往后仰也冲不出去', () => {
  const p = new PanSim();
  p.field.deposit(0, 0.2, 0.03, 0.3);
  const before = p.total();
  let spilled = 0;
  for (let i = 0; i < 120; i++) spilled += p.step(1 / 60, { A: 0, bz: -0.25 });
  assert.equal(spilled, 0, '不晃不冲');
  near(p.total(), before, 1e-6, '不晃总量不变');
  for (let i = 0; i < 120; i++) spilled += p.step(1 / 60, { A: 0.8, bz: 0.15 });
  assert.equal(spilled, 0, '后仰时沙子往后走，不会从前口出去');
});

test('泥水让沙子变黏：同样晃，冲走得少', () => {
  const run = murk => {
    const p = new PanSim();
    p.field.deposit(0, 0.1, 0.04, 0.4);
    let s = 0;
    for (let i = 0; i < 240; i++) s += p.step(1 / 60, { A: 0.7, bz: -0.2, murk });
    return s;
  };
  assert.ok(run(1) < run(0) * 0.8);
});

test('石头压着的地方沙子不太动', () => {
  const run = pinned => {
    const p = new PanSim();
    p.field.deposit(0, 0.1, 0.04, 0.4);
    if (pinned) p.mob.fill(0.15);
    let s = 0;
    for (let i = 0; i < 240; i++) s += p.step(1 / 60, { A: 0.7, bz: -0.2 });
    return s;
  };
  assert.ok(run(true) < run(false) * 0.5);
});
