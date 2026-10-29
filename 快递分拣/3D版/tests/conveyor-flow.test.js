import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dockLoad, advanceStall, topOfStack } from '../src/conveyor-flow.js';
import { STAGES } from '../src/stages.js';

test('thin garbage still fills the dock; unloading parcels reserve a place', () => {
  const dock = STAGES.classic.dock;
  const items = Array.from({ length: 23 }, () => ({ st: 'free', p: { x: -7, y: 1.5, z: -4 } }));
  items.push({ st: 'unload', p: { x: -9, y: 5, z: -7 } });
  items.push({ st: 'feed', p: { x: -7, y: 2, z: -4 } });
  items.push({ st: 'deliver', p: { x: -7, y: 2, z: -4 } });
  items.push({ st: 'free', p: { x: 3, y: 2, z: -2 } });
  assert.equal(dockLoad(items, dock), dock.cap);
  items[0].st = 'feed';
  assert.equal(dockLoad(items, dock), dock.cap - 1);
});
test('a jammed item jiggling in place is recovered, moving items are left alone', () => {
  let moving = null, stuck = null;
  for (let i = 0; i < 180; i++) {
    moving = advanceStall(moving, i / 60 * .7, 1 / 60);
    stuck = advanceStall(stuck, 1.52 + Math.sin(i) * .03, 1 / 60);
    assert.ok(moving.seconds < 1.5);
  }
  assert.ok(stuck.seconds >= 1.5);
  assert.equal(advanceStall(stuck, 2.5, 1 / 60).seconds, 0);
});

test('a blocked lower item recovers the top of its stack first', () => {
  const make = (id, x, y, st = 'free') => ({ id, st, p: { x, y, z: 0 }, dims: [.8, .8, .8] });
  const items = [make(1, 0, 2), make(2, 0, 2.8), make(3, 0, 3.6), make(4, 3, 4), make(5, 0, 4.4, 'held')];
  assert.equal(topOfStack(items, 1).id, 3);
  assert.equal(topOfStack(items.filter(b => b.id !== 3), 1).id, 2);
  assert.equal(items[0].p.y, 2);
});
