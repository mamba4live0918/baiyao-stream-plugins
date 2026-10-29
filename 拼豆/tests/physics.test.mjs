import test from 'node:test';
import assert from 'node:assert/strict';
import { createPegPhysics } from '../src/physics.js';

function advance(physics, seconds = 1) {
  const frames = Math.ceil(seconds * 60);
  for (let i = 0; i < frames; i++) physics.step(1 / 60);
}

test('a hollow bead settles around its peg at board height', async () => {
  const fallen = [];
  const physics = await createPegPhysics({ size: 3, onFallen: id => fallen.push(id) });
  try {
    physics.addBead('center', 1, 1, '#e43d62');
    advance(physics, 1);
    const pose = physics.getBeadPose('center');
    assert.equal(pose.state, 'seated');
    assert.equal(pose.stable, true);
    assert.ok(Math.abs(pose.x) < 0.05);
    assert.ok(Math.abs(pose.z) < 0.05);
    assert.ok(pose.y > 0.18 && pose.y < 0.34, `bead center should sit around peg, got y=${pose.y}`);
    assert.deepEqual(fallen, []);
  } finally {
    physics.destroy();
  }
});

test('a strong shake releases some fitted beads while a gentle shake preserves them', async () => {
  const fallen = [];
  const physics = await createPegPhysics({ size: 3, onFallen: id => fallen.push(id) });
  try {
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) physics.addBead(`${row}:${col}`, row, col, '#ffffff');
    }
    advance(physics, 0.4);
    physics.shake(0.05);
    advance(physics, 0.3);
    assert.equal(fallen.length, 0);
    physics.shake(1);
    advance(physics, 0.2);
    assert.ok(fallen.length > 0, 'strong shake should detach at least one bead');
    assert.ok(fallen.some(id => physics.getBeadPose(id)?.state === 'loose'));
  } finally {
    physics.destroy();
  }
});

test('a spill can be repaired one selected bead at a time', async () => {
  const physics = await createPegPhysics({ size: 3 });
  try {
    physics.addBead('a', 0, 0, '#ff0000');
    physics.addBead('b', 2, 2, '#0000ff');
    advance(physics, 0.4);
    physics.spill();
    assert.equal(physics.getBeadPose('a').state, 'loose');
    assert.equal(physics.getBeadPose('b').state, 'loose');
    physics.restore(['a']);
    assert.equal(physics.getBeadPose('a').state, 'returning');
    advance(physics, 1);
    assert.equal(physics.getBeadPose('a').state, 'seated');
    assert.equal(physics.getBeadPose('b').state, 'loose');
    physics.restore(['b']);
    advance(physics, 1);
    assert.equal(physics.getBeadPose('b').state, 'seated');
  } finally {
    physics.destroy();
  }
});

test('a spilled bead physically clears its peg and scatters across the table', async () => {
  const physics = await createPegPhysics({ size: 1 });
  try {
    physics.addBead('solo', 0, 0, '#f5b4d3');
    advance(physics, 0.7);
    physics.spill();
    advance(physics, 0.5);
    const pose = physics.getBeadPose('solo');
    assert.equal(pose.state, 'loose');
    assert.ok(Math.hypot(pose.x, pose.z) > 0.35, `spilled bead remained on its peg: ${JSON.stringify(pose)}`);
  } finally {
    physics.destroy();
  }
});

test('the work table catches scattered beads before they vanish beyond the overlay', async () => {
  const physics = await createPegPhysics({ size: 1 });
  try {
    physics.addBead('edge', 0, 0, '#f5b4d3');
    advance(physics, 0.7);
    physics.spill();
    advance(physics, 3);
    const pose = physics.getBeadPose('edge');
    assert.ok(Math.abs(pose.x) < 2.5 && Math.abs(pose.z) < 2.5, `bead left visible table: ${JSON.stringify(pose)}`);
    assert.ok(pose.y > -0.2, `bead fell through work table: ${JSON.stringify(pose)}`);
  } finally {
    physics.destroy();
  }
});

test('removed beads are absent from physics poses and update frames', async () => {
  let last = [];
  const physics = await createPegPhysics({ size: 2, onUpdate: poses => { last = poses; } });
  try {
    physics.addBead('a', 0, 0, '#00ff00');
    physics.step(1 / 60);
    assert.equal(last.length, 1);
    physics.removeBead('a');
    physics.step(1 / 60);
    assert.equal(physics.getBeadPose('a'), null);
    assert.equal(last.length, 0);
  } finally {
    physics.destroy();
  }
});

test('board sizes outside the supported physics range are rejected', async () => {
  await assert.rejects(createPegPhysics({ size: 0 }), RangeError);
  await assert.rejects(createPegPhysics({ size: 65 }), RangeError);
});

test('the largest configurable board can be created without activating every peg as a body', async () => {
  const physics = await createPegPhysics({ size: 48 });
  try {
    physics.addBead('corner', 47, 47, '#e3a2ba');
    advance(physics, 0.7);
    assert.equal(physics.getBeadPose('corner').state, 'seated');
  } finally {
    physics.destroy();
  }
});

test('repeated shakes keep loosening beads instead of re-rolling the same result', async () => {
  const physics = await createPegPhysics({ size: 12 });
  try {
    for (let row = 0; row < 12; row++) for (let col = 0; col < 12; col++) physics.addBead(`${row}:${col}`, row, col, '#ffffff');
    advance(physics, 3);
    const first = physics.shake(0.55);
    advance(physics, 2);
    const second = physics.shake(0.55);
    const third = physics.shake(0.55);
    assert.ok(first > 0, 'first medium shake should loosen beads');
    assert.ok(second > 0, 'a later shake at the same strength must still loosen some remaining beads');
    assert.ok(third > 0, 'shakes applied back to back each count');
  } finally {
    physics.destroy();
  }
});

test('batched boards only receive moving beads plus a single report when a bead seats', async () => {
  const frames = [];
  const physics = await createPegPhysics({ size: 4, reportAll: false, onUpdate: poses => frames.push(poses) });
  try {
    physics.addBead('a', 1, 1, '#ff0000');
    for (let i = 0; i < 120; i++) physics.step(1 / 60);
    const seatedReports = frames.flat().filter(p => p.id === 'a' && p.state === 'seated');
    assert.equal(seatedReports.length, 1, 'the seated transition is reported exactly once');
    assert.deepEqual(frames.at(-1), [], 'a seated bead is not re-sent every frame');
    physics.shake(1);
    physics.step(1 / 60);
    assert.ok(frames.at(-1).some(p => p.id === 'a' && p.state !== 'seated'), 'a shaken bead is reported again');
  } finally {
    physics.destroy();
  }
});

test('mass shake: rigid bodies stay within the budget and fallen beads stop being reported once at rest', async () => {
  const frames = [];
  const physics = await createPegPhysics({ size: 30, reportAll: false, maxBodies: 48, onUpdate: poses => frames.push(poses) });
  try {
    let n = 0;
    for (let r = 0; r < 30; r++) for (let c = 0; c < 30; c++) physics.addBead(`b${n++}`, r, c, '#ff0000');
    advance(physics, 2);
    const released = physics.spill();
    assert.equal(released, 900);
    physics.step(1 / 60);
    assert.ok(frames.at(-1).length >= 900, 'every released bead is reported while it flies');
    advance(physics, 12);
    frames.length = 0;
    advance(physics, 0.5);
    const busy = Math.max(...frames.map(f => f.length));
    assert.ok(busy < 20, `resting fallen beads should not be re-sent every frame (max ${busy} per frame)`);
    let floating = 0;
    for (let i = 0; i < 900; i++) { const p = physics.getBeadPose(`b${i}`); if (p.y < -0.2 || p.y > 1.2) floating++; }
    assert.equal(floating, 0, 'fallen beads rest on the board or the table');
  } finally {
    physics.destroy();
  }
});

test('a slow frame is not followed by a burst of catch-up physics steps', async () => {
  const physics = await createPegPhysics({ size: 2, reportAll: false });
  try {
    physics.addBead('a', 0, 0, '#ff0000');
    const t0 = performance.now();
    physics.step(1); // 一帧卡了一秒：最多补三步，不会一次算 60 步。
    assert.equal(physics.getBeadPose('a').state, 'settling');
    assert.ok(performance.now() - t0 < 500);
  } finally {
    physics.destroy();
  }
});

test('lite mode (host blocks WebAssembly): beads drop onto pegs, shake off, stay on the table and return', async () => {
  const frames = [];
  const physics = await createPegPhysics({ size: 6, reportAll: false, mode: 'lite', onUpdate: poses => frames.push(poses) });
  try {
    assert.equal(physics.mode, 'lite');
    for (let r = 0; r < 6; r++) for (let c = 0; c < 6; c++) physics.addBead(`b${r}-${c}`, r, c, '#ff0000');
    assert.equal(physics.getBeadPose('b0-0').state, 'settling');
    advance(physics, 0.6);
    assert.equal(physics.getBeadPose('b0-0').state, 'seated', 'scripted drop seats the bead');
    const fallen = [];
    const released = physics.spill();
    assert.equal(released, 36);
    advance(physics, 6);
    for (let r = 0; r < 6; r++) for (let c = 0; c < 6; c++) {
      const p = physics.getBeadPose(`b${r}-${c}`);
      assert.equal(p.state, 'loose');
      assert.ok(Math.abs(p.x) <= 5 && Math.abs(p.z) <= 5 && p.y > -0.2 && p.y < 1, `bead stays on the work table: ${JSON.stringify(p)}`);
      fallen.push(p);
    }
    frames.length = 0; advance(physics, 0.5);
    assert.ok(frames.every(f => f.length === 0), 'resting beads are not re-sent');
    physics.restore(['b2-3']);
    advance(physics, 1);
    const back = physics.getBeadPose('b2-3');
    assert.equal(back.state, 'seated');
  } finally {
    physics.destroy();
  }
});
