import test from 'node:test';
import assert from 'node:assert/strict';
import { createControlVisibility } from '../src/ui/visibility.js';

// A manual clock makes the real controller's idle behavior deterministic.
function clock() {
  let now = 0, nextId = 0;
  const jobs = new Map();
  return {
    setTimer(fn, delay) { const id = ++nextId; jobs.set(id, { at: now + delay, fn }); return id; },
    clearTimer(id) { jobs.delete(id); },
    advance(ms) {
      now += ms;
      for (const [id, job] of [...jobs]) {
        if (job.at <= now) { jobs.delete(id); job.fn(); }
      }
    }
  };
}

function controls(trial = false) {
  const timer = clock(), changes = [];
  const controller = createControlVisibility({ trial, onChange: value => changes.push(value), ...timer });
  return { controller, timer, changes, visible: () => changes.at(-1) };
}

test('live controls start hidden and disappear after 2.5 seconds without movement', () => {
  const { controller, timer, visible } = controls();
  assert.equal(visible(), false);
  controller.move();
  assert.equal(visible(), true);
  timer.advance(2499);
  assert.equal(visible(), true);
  timer.advance(1);
  assert.equal(visible(), false);
});

test('new movement restarts the idle countdown instead of keeping the first deadline', () => {
  const { controller, timer, visible } = controls();
  controller.move();
  timer.advance(2000);
  controller.move();
  timer.advance(500);
  assert.equal(visible(), true);
  timer.advance(1999);
  assert.equal(visible(), true);
  timer.advance(1);
  assert.equal(visible(), false);
});

test('leaving the page hides live controls immediately and cancels the old deadline', () => {
  const { controller, timer, changes, visible } = controls();
  controller.move();
  controller.leave();
  assert.equal(visible(), false);
  timer.advance(3000);
  assert.deepEqual(changes, [false, true, false]);
});

test('trial controls remain visible after inactivity and leaving the preview', () => {
  const { controller, timer, changes, visible } = controls(true);
  assert.equal(visible(), true);
  controller.move();
  controller.leave();
  timer.advance(10000);
  assert.equal(visible(), true);
  assert.deepEqual(changes, [true]);
});

test('page suspension clears pending updates and resume resets live controls', () => {
  const { controller, timer, changes, visible } = controls();
  controller.move();
  controller.stop();
  timer.advance(5000);
  assert.deepEqual(changes, [false, true]);
  controller.reset();
  assert.equal(visible(), false);
  controller.move();
  timer.advance(2500);
  assert.equal(visible(), false);
});
