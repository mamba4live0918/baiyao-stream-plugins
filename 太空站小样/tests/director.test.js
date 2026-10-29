import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CAMERA_B_KEYS, cameraAKeys, createDirector, createPose, viewState } from '../src/core/director.js';
import { TIMELINE } from '../src/config.js';
import { rackLayout, SLOTS, WINDOWS } from '../src/story.js';

const close = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
const KEYS_A = cameraAKeys(rackLayout(SLOTS.length), WINDOWS);
const director = createDirector(KEYS_A);

test('only camera A renders before the transition', () => {
  const v = viewState(0.5);
  assert.equal(v.transition, 0);
  assert.equal(v.needA, true);
  assert.equal(v.needB, false);
});

test('both cameras render during the transition, cut halfway', () => {
  const [start, end] = TIMELINE.transition;
  const v = viewState((start + end) / 2);
  assert.equal(v.needA, true);
  assert.equal(v.needB, true);
  assert.ok(close(v.transition, 0.5));
});

test('only camera B renders after the transition', () => {
  const v = viewState(0.95);
  assert.equal(v.transition, 1);
  assert.equal(v.needA, false);
  assert.equal(v.needB, true);
});

test('camera A keyframes are in strictly increasing scroll order', () => {
  for (let i = 1; i < KEYS_A.length; i++) assert.ok(KEYS_A[i][0] > KEYS_A[i - 1][0], `key ${i}`);
  assert.equal(KEYS_A[0][0], 0);
  assert.equal(KEYS_A[KEYS_A.length - 1][0], TIMELINE.transition[1]);
});

test('camera A keys still work with no featured plugins', () => {
  const keys = cameraAKeys(rackLayout(SLOTS.length), []);
  for (let i = 1; i < keys.length; i++) assert.ok(keys[i][0] > keys[i - 1][0]);
});

test('camera A holds in front of every featured blade while its drawer is out', () => {
  const layout = rackLayout(SLOTS.length);
  for (const w of WINDOWS) {
    const pose = director.poseA(w.mid, createPose());
    const y = layout.slotY(w.slot);
    assert.ok(pose.position.z > 3.5 && pose.position.z < 6, `in front of the rack for ${w.plugin.name}`);
    assert.ok(Math.abs(pose.target.y - (y + 0.5)) < 0.15, `looking at ${w.plugin.name}`);
  }
});

for (const [name, keys, evaluate] of [
  ['A', KEYS_A, director.poseA],
  ['B', CAMERA_B_KEYS, director.poseB],
]) {
  test(`camera ${name} passes exactly through every keyframe`, () => {
    for (const [p, position, target, fov] of keys) {
      const pose = evaluate(p, createPose());
      position.forEach((v, i) => assert.ok(close(pose.position.getComponent(i), v), `position at p=${p}`));
      target.forEach((v, i) => assert.ok(close(pose.target.getComponent(i), v), `target at p=${p}`));
      assert.ok(close(pose.fov, fov));
    }
  });
}
