import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STAGES, STAGE_IDS, stageOf, dockCells } from '../src/stages.js';
import { MODES } from '../src/modes.js';

const BIN_W = 2.6, BIN_D = 2.0, BIN_H = .85;

test('two layouts, counter is the default and unknown ids fall back to it', () => {
  assert.deepEqual(STAGE_IDS, ['counter', 'classic']);
  assert.equal(stageOf('nope').id, 'counter'); assert.equal(stageOf('classic').id, 'classic');
});

test('every layout has a bin slot per bin in both modes, inside its platform, without overlaps', () => {
  for (const st of Object.values(STAGES)) for (const mode of ['express', 'garbage']) {
    const s = st.slots[mode]; assert.equal(s.length, MODES[mode].bins.length, `${st.id} ${mode}`);
    for (const [x, z] of s) { assert.ok(x - BIN_W / 2 >= st.plat.x0 && x + BIN_W / 2 <= st.plat.x1, `${st.id} ${mode} x`); assert.ok(z + BIN_D / 2 <= st.plat.z1, `${st.id} ${mode} z`); }
    for (let i = 1; i < s.length; i++) assert.ok(s[i][0] - s[i - 1][0] >= BIN_W, `${st.id} ${mode} 第 ${i} 个筐不和左边重叠`);
  }
});

test('counter layout: nothing can hide behind or under things', () => {
  const c = STAGES.counter;
  assert.ok(c.base + BIN_H < c.table.top, '桶口低于台面：台面上的东西不会被桶挡住');
  assert.equal(c.backZ, c.table.z0, '后墙贴着柜台后沿');
  assert.equal(c.legs, false); assert.equal(c.floor, false);
  for (const mode of ['express', 'garbage']) {
    const s = c.slots[mode], mid = s.reduce((a, [x]) => a + x, 0) / s.length;
    assert.ok(Math.abs(mid) < 1e-9, `${mode} 桶排在画面正中`);
    for (const [, z] of s) assert.ok(Math.abs(z - BIN_D / 2 - c.table.z1) < 1e-9, `${mode} 桶背贴着柜台前沿`);
    for (let i = 1; i < s.length; i++) assert.ok(s[i][0] - s[i - 1][0] - BIN_W <= .3, `${mode} 桶之间的缝不超过 0.3（另有隔板填上）`);
  }
  assert.ok(c.belt.x1 > c.table.x0 && c.belt.top > c.table.top, '传送带末端伸到台面上方，东西落到台面上');
  assert.equal(c.belt.x0, c.dock.x1, '堆货台和传送带首尾相接');
  assert.ok(c.dock.z0 === c.table.z0 && c.dock.z1 === c.table.z1, '堆货台和柜台一样深');
  assert.ok(c.scan.x > c.table.x0 && c.scan.x < c.table.x1 && c.scan.top > c.table.top, '识别台在台面上');
  assert.ok(Array.isArray(c.fit) && c.fit.length >= 1);
});

test('dock cells stay on the dock; the classic layout keeps its 4 × 2 grid', () => {
  for (const st of Object.values(STAGES)) {
    const cells = dockCells(st.dock, st.feed);
    for (const p of cells) assert.ok(p.x - .5 >= st.dock.x0 && p.x + .5 <= st.dock.x1 && p.z - .45 >= st.dock.z0 && p.z + .45 <= st.dock.z1, `${st.id} 堆货格在台内`);
    const d = cells.map(p => Math.hypot(p.x - st.feed.x, p.z - st.feed.z)); assert.deepEqual(d, [...d].sort((a, b) => a - b), `${st.id} 离传送带入口近的先堆`);
  }
  assert.equal(dockCells(STAGES.classic.dock, STAGES.classic.feed).length, 8);
});
