const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Core = require('../src/core.js');
const Motion = require('../src/motion.js');

const options = { enabled: true, speed: 45, size: 90, radius: 20, bounds: { left: 0, right: 10000, top: 0, bottom: 700 } };
const pet = (frames = 30) => ({ x: 300, y: 400, size: 90, held: false, airborne: false, roamVX: 1, roamVY: 0, turnIn: 100, wait: 0, articulated: true, walkFrames: frames });

// Catches a 30-frame authoring flag falling back to the old four-frame distorted animation.
for (const mode of ['run', 'plod', 'prowl', 'squish', 'hop', 'scoot', 'walk', 'float']) {
  test('30-frame ' + mode + ' plays all whole-painted poses without added scale or rotation', () => {
    const p = pet(), seen = new Set();
    for (let i = 0; i < 1800; i++) {
      Motion.step(p, 1 / 60, options, mode, Core, () => .8);
      seen.add(p.hopFrame);
      assert.equal(p.hopScaleX, 1, 'horizontal distortion');
      assert.equal(p.hopScaleY, 1, 'vertical distortion');
      assert.equal(p.motionTilt, 0, 'added rotation');
      assert(Number.isInteger(p.hopFrame) && p.hopFrame >= 0 && p.hopFrame < 30);
    }
    assert.deepEqual([...seen].sort((a, b) => a - b), Array.from({ length: 30 }, (_, i) => i));
  });
}

// Catches changing the 12-frame phase timing or failing to extend prep/flight/land through frame 29.
const phaseCases = [
  ['prep', 0, 1, 1], ['prep', .04, 1, 2], ['prep', .08, 2, 3], ['prep', .159, 2, 5],
  ['flight', 0, 3, 6], ['flight', .125, 4, 10], ['flight', .25, 6, 14], ['flight', .499, 8, 21],
  ['land', 0, 9, 22], ['land', .05, 9, 24], ['land', .1, 10, 26], ['land', .199, 11, 29]
];
for (const frames of [12, 30]) {
  test(frames + '-frame jumping uses the authored preparation, flight and landing spans', () => {
    for (const [stage, elapsed, twelve, thirty] of phaseCases) {
      const p = { ...pet(frames), hopStage: stage, hopTime: elapsed, hopWait: 0 };
      Motion.step(p, 0, options, 'scoot', Core, () => .8);
      assert.equal(p.hopFrame, frames === 12 ? twelve : thirty, stage + ' at ' + elapsed);
      assert.equal(p.hopScaleX, 1); assert.equal(p.hopScaleY, 1); assert.equal(p.motionTilt, 0);
    }
  });
}

test('30-frame ground walking follows travelled distance and stops when there is no movement', () => {
  const slow = pet(), fast = pet();
  for (let i = 0; i < 20; i++) {
    Motion.step(slow, 1 / 60, { ...options, speed: 15 }, 'plod', Core, () => .8);
    Motion.step(fast, 1 / 60, { ...options, speed: 30 }, 'plod', Core, () => .8);
  }
  assert(fast.x > slow.x);
  assert(Math.abs(fast.poseClock / slow.poseClock - 2) < .001);
  const clock = slow.poseClock; slow.wait = 5;
  Motion.step(slow, 1 / 60, options, 'plod', Core, () => .8);
  assert.equal(slow.poseClock, clock); assert.equal(slow.hopFrame, 0); assert.equal(slow.motionStage, 'rest');
});

test('30-frame walkers still turn at the actual movement boundary', () => {
  const p = { ...pet(), x: 979, facing: 1 };
  Motion.step(p, 1 / 60, { ...options, bounds: { left: 0, right: 1000, top: 0, bottom: 700 } }, 'run', Core, () => .8);
  assert.equal(p.x, 980); assert.equal(p.facing, -1); assert.equal(p.roamVX, -1);
  assert.equal(p.hopScaleX, 1); assert.equal(p.hopScaleY, 1);
});

for (const state of ['held', 'airborne', 'disabled']) {
  test('30-frame ' + state + ' resets pose and never advances movement', () => {
    const p = { ...pet(), hopFrame: 29, hopLift: -30, poseClock: .7, hopScaleX: 1.5, hopScaleY: .7, motionTilt: 9 };
    if (state !== 'disabled') p[state] = true;
    Motion.step(p, 1 / 60, { ...options, enabled: state !== 'disabled' }, 'run', Core, () => .8);
    assert.equal(p.x, 300); assert.equal(p.y, 400); assert.equal(p.poseClock, .7);
    assert.equal(p.hopFrame, 0); assert.equal(p.hopLift, 0); assert.equal(p.motionStage, 'rest');
    assert.equal(p.hopScaleX, 1); assert.equal(p.hopScaleY, 1); assert.equal(p.motionTilt, 0);
  });
}

test('legacy four-frame run remains on its original motion route', () => {
  const p = pet(4), seen = new Set();
  for (let i = 0; i < 120; i++) { Motion.step(p, 1 / 60, options, 'run', Core, () => .8); seen.add(p.hopFrame); }
  assert.deepEqual([...seen].sort(), [0, 1, 2, 3]);
  assert(p.hopScaleX > 1); assert(p.hopScaleY < 1); assert.notEqual(p.motionTilt, 0);
});

test('30-frame swimmers use all poses and retain vertical-free scale and fin orientation', () => {
  const p = { ...pet(), swimCycleMs: 1200 }, seen = new Set();
  for (let i = 0; i < 90; i++) {
    Motion.step(p, 1 / 60, options, 'swim', Core, () => .8); seen.add(p.hopFrame);
    assert.equal(p.hopScaleX, 1); assert.equal(p.hopScaleY, 1); assert.equal(p.motionTilt, 0);
  }
  assert.deepEqual([...seen].sort((a, b) => a - b), Array.from({ length: 30 }, (_, i) => i));
  assert(p.x > 300); assert.equal(p.facing, 1);
});

test('renderer shows standing art for reduced motion and frame 29 without duplicate distortion', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/app.js'), 'utf8');
  const start = source.indexOf('function sequenceFrame('), end = source.indexOf('function penRect(', start);
  let reduced = false;
  const context = { reduced: () => reduced };
  vm.runInNewContext(source.slice(start, end) + ';globalThis.render = renderCow;', context);
  const p = { ...pet(), walkMode: 'default', sourceFacing: -1, facing: 1, motionStage: 'walk', hopFrame: 29,
    hopScaleX: 1.4, hopScaleY: .7, motionTilt: 7, el: { style: {}, dataset: {} }, im: { style: {} }, sprite: { style: {} } };
  context.render(p);
  assert.equal(p.im.hidden, true); assert.equal(p.sprite.hidden, false);
  assert.equal(p.sprite.style.backgroundPosition, '100% 0'); assert.equal(p.sprite.style.transform, 'scale(-1,1)');
  assert.match(p.el.style.transform, /rotate\(0deg\)/); assert.equal(p.el.dataset.frame, 29);
  reduced = true; context.render(p);
  assert.equal(p.im.hidden, false); assert.equal(p.sprite.hidden, true); assert.equal(p.el.dataset.frame, 0);
});
