import { test } from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '../_deps/rapier.mjs';
import { STAGES } from '../src/stages.js';
import { binRearGuards } from '../src/bin-rear-guards.js';

const BIN = { w: 2.6, d: 2, h: .85 };
await RAPIER.init();
test('rear guards close the hidden strip without entering the conveyor or bin mouths', () => {
  for (const mode of ['express', 'garbage']) {
    const st = STAGES.classic, guards = binRearGuards(st, mode, BIN);
    assert.equal(guards.length, st.slots[mode].length);
    guards.forEach((g, i) => {
      assert.ok(g.z0 > st.belt.z + st.belt.w / 2);
      assert.equal(g.z1, st.slots[mode][i][1] - BIN.d / 2);
      assert.equal(g.y0, 0);
      assert.ok(g.y1 > st.base + BIN.h);
      if (i) assert.equal(guards[i - 1].x1, g.x0);
    });
  }
  assert.deepEqual(binRearGuards(STAGES.counter, 'garbage', BIN), [], 'counter already has a solid cabinet behind its bins');
});
test('falling items stay above the hidden rear gap while a normal throw into a bin remains free', () => {
  for (const mode of ['express', 'garbage']) {
    const st = STAGES.classic, guards = binRearGuards(st, mode, BIN), w = new RAPIER.World({ x: 0, y: -28, z: 0 });
    for (const g of guards) w.createCollider(RAPIER.ColliderDesc.cuboid((g.x1-g.x0)/2,(g.y1-g.y0)/2,(g.z1-g.z0)/2).setTranslation((g.x0+g.x1)/2,(g.y0+g.y1)/2,(g.z0+g.z1)/2));
    const g = guards[0], x = st.slots[mode][0][0];
    const rear = w.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(x, 5, (g.z0+g.z1)/2).setCcdEnabled(true));
    w.createCollider(RAPIER.ColliderDesc.ball(.15), rear);
    const mouth = w.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(x, 5, st.slots[mode][0][1]).setCcdEnabled(true));
    w.createCollider(RAPIER.ColliderDesc.ball(.15), mouth);
    for (let i=0;i<120;i++) w.step();
    assert.ok(rear.translation().y >= g.y1 + .12, `${mode}: rear item remains visible above the rim`);
    assert.ok(mouth.translation().y < st.base, `${mode}: guard does not obstruct the bin opening`);
    w.free();
  }
});
