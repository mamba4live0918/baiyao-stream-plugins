import test from 'node:test';
import assert from 'node:assert/strict';
import * as seam from '../src/seam.js';

const shape = (start, values) => Array.from({ length: 32 }, (_, c) => values[c - start] || 0);
const pillow = shape(10, [35, 60, 80, 120, 150, 150, 120, 80, 60, 35]);
const jacket = shape(10, [30, 55, 80, 130, 160, 160, 130, 80, 55, 30]);
const block = (start, count, height) => shape(start, Array(count).fill(height));
function packed(kind, profiles) {
  let s = seam.createState({ seed: 731 });
  profiles.forEach((heights, n) => { s = seam.addItem(s, seam.createItem({ id: `${kind}-${n}`, kind, owner: { name: `来客${n}`, uid: `${n}` }, heights })); });
  return s;
}
function press(s, seconds = 0.5, col = 14.5) {
  return seam.setHand(seam.advance(seam.setHand(s, { col, down: true }), seconds), null);
}
const approx = (actual, expected, tolerance = 1e-7) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);

test('01 空箱拉到头但不能寄出', () => {
  const s = seam.dragZip(seam.createState(), 1);
  assert.equal(s.z, 1);
  assert.equal(s.completed, false);
  assert.equal(s.events.some(e => e.type === 'complete'), false);
});

test('02 单个150高抱枕无需按压即可封箱', () => {
  const s = seam.dragZip(packed('pillow', [pillow]), 1);
  assert.equal(s.z, 1);
  assert.equal(s.completed, true);
  assert.equal(s.events.filter(e => e.type === 'complete').length, 1);
});

test('03 两个圆角抱枕卡住上层；松手0.2秒能过，0.6秒不能', () => {
  const initial = packed('pillow', [pillow, pillow]);
  const stopped = seam.dragZip(initial, 1);
  assert.ok(stopped.z < 14 / 32);
  assert.equal(stopped.culpritId, 'pillow-1');
  const pressed = press(stopped);
  assert.equal(pressed.hand, null);
  const quick = seam.dragZip(seam.advance(pressed, 0.2), 1);
  assert.equal(quick.z, 1, `quick blocked at ${quick.blockedCol}, gap=${quick.gap[quick.blockedCol]}`);
  const late = seam.dragZip(seam.advance(pressed, 0.6), 1);
  assert.ok(late.z < 1);
  assert.equal(late.culpritId, 'pillow-1');
});

test('04 两件羽绒服按0.5秒后等1秒仍能拉过', () => {
  const s = seam.dragZip(seam.advance(press(packed('jacket', [jacket, jacket])), 1), 1);
  assert.equal(s.z, 1, `jacket blocked at ${s.blockedCol}`);
});

test('05 竖锅不能被压软；换成放平轮廓后能通过', () => {
  let s = packed('pan', [block(14, 2, 340)]);
  s = seam.dragZip(press(s, 3), 1);
  assert.ok(s.z < 1);
  assert.equal(s.culpritId, 'pan-0');
  assert.ok(s.items[0].q.every(q => q === 1));
  s = seam.removeItem(s, 'pan-0');
  s = seam.addItem(s, seam.createItem({ id: 'pan-flat', kind: 'pan', heights: block(9, 14, 65), angle: 0 }));
  assert.equal(seam.dragZip(s, 1).z, 1);
});

test('06 左侧受压把体积挤到右侧并增大右侧接缝', () => {
  let s = seam.createState();
  s = seam.addItem(s, seam.createItem({ id: 'base', kind: 'pan', heights: block(8, 10, 90) }));
  s = seam.addItem(s, seam.createItem({ id: 'soft', kind: 'pillow', heights: block(8, 10, 140) }));
  const before = s.gap[16];
  s = seam.advance(seam.setHand(s, { col: 9, down: true }), 0.5);
  assert.ok(s.gap[16] > before + 5, `${before} -> ${s.gap[16]}`);
  assert.ok(s.items[1].q[16] > 1);
  assert.ok(Math.max(...s.items[1].q) <= 1.25 + 1e-8);
});

function lockedStack(strap = false) {
  // Three 150u layers at 45% fit: 202.5u. Inflating one yields 229.5u; 4 * 19.5 = 78u.
  const profile = block(10, 4, 150);
  let s = packed('pillow', [profile, profile, profile]);
  s = press(s, 1, 11.5);
  s = seam.dragZip(s, 14 / 32);
  assert.equal(s.zipCol, 14);
  if (strap) s = seam.addStrap(s, { id: 'strap-1', col: 11 });
  return s;
}

test('07 锁定列受力超过60退4列，1.5秒内不再爆开', () => {
  let s = seam.step(seam.inflateItem(lockedStack(), 'pillow-2'));
  assert.equal(s.zipCol, 10);
  assert.equal(s.events.filter(e => e.type === 'burst').length, 1);
  assert.equal(s.culpritId, 'pillow-2');
  const expiry = s.burstUntil;
  // A new hard obstacle behind the remaining teeth creates sustained force during cooldown.
  s = seam.addItem(s, seam.createItem({ id: 'cooldown-obstacle', kind: 'pan', heights: block(3, 3, 300) }));
  s = seam.advance(s, 1.49);
  assert.ok(s.time < expiry + 1e-8);
  assert.ok(s.zipStress > 60);
  assert.equal(s.events.filter(e => e.type === 'burst').length, 0);
  s = seam.advance(s, 0.02);
  assert.equal(s.events.filter(e => e.type === 'burst').length, 1);
});

test('08 绑带额外40强度承受相同的四列打气受力', () => {
  const s = seam.advance(seam.inflateItem(lockedStack(true), 'pillow-2'), 0.1);
  assert.equal(s.zipCol, 14);
  assert.ok(s.zipStress > 60 && s.zipStress < 100, `stress=${s.zipStress}`);
  assert.equal(s.events.some(e => e.type === 'burst'), false);
  assert.ok(s.gap.slice(0, 14).every(g => g === 0));
});

test('09 超过90%且剩余接缝合拢，0.3秒内自动完成', () => {
  let s = seam.dragZip(packed('pillow', [pillow]), 0.9);
  s = seam.advance(s, 0.15);
  assert.ok(s.z > 0.9 && s.z < 1);
  s = seam.advance(s, 0.15);
  assert.equal(s.z, 1);
  assert.equal(s.completed, true);
});

test('10 卡住的法棍承受全力1.2秒后断成两件半长', () => {
  let s = seam.createState();
  s = seam.addItem(s, seam.createItem({ id: 'bread-1', kind: 'bread', heights: block(13, 3, 280), length: 400, angle: 45, owner: { name: '来客', uid: 'u' } }));
  s = seam.dragZip(s, 1);
  s = seam.setHand(s, { col: 14, down: true });
  s = seam.advance(s, 1.5);
  assert.equal(s.items.length, 1, '力道爬升的0.35秒不能算全力');
  s = seam.advance(s, 0.1);
  assert.equal(s.items.length, 2);
  assert.ok(s.items.every(i => i.kind === 'bread' && i.length === 200 && i.broken));
  assert.ok(s.items.every(i => i.owner.uid === 'u'));
  assert.equal(s.events.filter(e => e.type === 'bread-break').length, 1);
});

test('11 猫探头增高1.6倍，点回去后10秒不随机醒，外部叫醒有效', () => {
  let s = packed('cat', [block(12, 5, 120)]);
  s = seam.wakeCat(s, 'cat-0', { name: '叫醒的人', uid: 'w' });
  approx(s.top[14], 192);
  assert.equal(s.items[0].cat.phase, 'head');
  s = seam.tapCat(s, 'cat-0');
  approx(s.top[14], 120);
  s = seam.dragZip(s, 0.6);
  s = seam.advance(s, 9.9);
  assert.equal(s.items[0].cat.phase, 'sleep');
  s = seam.wakeCat(s, 'cat-0');
  assert.equal(s.items[0].cat.phase, 'head');
});

test('压力仅分布于五列；单鼠标按压期间不能同时拉链', () => {
  const base = seam.createState();
  const held = seam.advance(seam.setHand(base, { col: 15, down: true }), 0.35);
  assert.deepEqual(held.pressure.slice(13, 18), [0.25, 0.5, 1, 0.5, 0.25]);
  assert.equal(held.pressure.slice(0, 13).reduce((a, b) => a + b, 0), 0);
  assert.equal(seam.dragZip(held, 0.5).z, 0);
  assert.equal(seam.dragZip(seam.setHand(held, null), 0.5).z, 0.5);
});

test('倒拉解锁旧列；接缝平滑且相邻落差不超过18', () => {
  let s = seam.dragZip(packed('pillow', [pillow]), 0.7);
  s = seam.dragZip(s, 0.2);
  assert.equal(s.zipCol, 6);
  s = seam.addItem(s, seam.createItem({ id: 'tall', kind: 'pan', heights: block(20, 1, 600) }));
  for (let c = 1; c < 32; c++) assert.ok(Math.abs(s.gap[c] - s.gap[c - 1]) <= 18 + 1e-8);
  assert.ok(s.gap.slice(0, 6).every(g => g === 0));
});

test('相同种子和注入时间可复现，输入状态不被改动，分段推进一致', () => {
  const s = packed('cat', [block(12, 5, 120)]);
  const snapshot = structuredClone(s);
  const a = seam.advance(s, 31);
  const b = seam.advance(seam.advance(s, 15), 16);
  assert.deepEqual(s, snapshot);
  assert.deepEqual({ ...a, events: [] }, { ...b, events: [] });
  assert.ok(a.items[0].heights.some((h, c) => h !== s.items[0].heights[c]), '猫翻身需实际移动两列');
});

test('猫预告、探头、坐盖、回待装区完整生命周期', () => {
  let s = packed('cat', [block(12, 5, 120)]);
  s = seam.advance(seam.setHand(s, { col: 14, down: true }), 1.36);
  assert.equal(s.items[0].cat.phase, 'tail');
  s = seam.advance(seam.setHand(s, null), 1);
  assert.equal(s.items[0].cat.phase, 'head');
  s = seam.advance(s, 4.01);
  assert.equal(s.items[0].cat.phase, 'lid');
  assert.equal(s.top[14], 0);
  approx(s.pressure[14], 0.6);
  s = seam.advance(s, 6.01);
  assert.equal(s.items[0].cat.phase, 'waiting');
  assert.equal(s.pressure[14], 0);
  assert.equal(s.events.filter(e => e.type === 'cat-waiting').length, 1);
});

test('真空有0.45下限，帮手及绑带可移动、帮手会到时离开', () => {
  let s = packed('pillow', [pillow]);
  for (let n = 0; n < 8; n++) s = seam.vacuum(s);
  approx(s.items[0].volumeScale, 0.45);
  s = seam.addHelper(s, { id: 'h', col: 5, until: 1 });
  s = seam.moveHelper(s, 'h', 10);
  s = seam.addStrap(s, { id: 'b', col: 7 });
  s = seam.moveStrap(s, 'b', 11);
  assert.equal(s.straps[0].col, 11);
  approx(s.pressure[10], 1.3); // Helper 0.8 plus adjacent strap 0.5.
  s = seam.advance(s, 1.01);
  assert.equal(s.helpers.length, 0);
});

test('重采样轮廓会改变姿态和卡住位置，保留原主人', () => {
  let s = packed('pan', [block(14, 2, 340)]);
  s = seam.replaceItemProfile(s, 'pan-0', { heights: block(8, 14, 65), angle: 0 });
  assert.equal(s.items[0].owner.uid, '0');
  assert.equal(s.items[0].heights[8], 65);
  assert.equal(seam.dragZip(s, 1).z, 1);
});

test('静止状态无需连续刷新，猫的定时动作仍有下次唤醒时间', () => {
  assert.equal(seam.isSettled(seam.createState()), true);
  assert.equal(seam.nextWakeTime(seam.createState()), Infinity);
  const s = packed('cat', [block(12, 5, 120)]);
  assert.equal(seam.isSettled(s), true);
  assert.ok(seam.nextWakeTime(s) >= 15 && seam.nextWakeTime(s) <= 30);
  const moving = press(packed('pillow', [pillow]), 0.5);
  assert.equal(seam.isSettled(moving), false);
  assert.equal(seam.isSettled(seam.advance(moving, 12)), true);
});

test('最后10%的远处仍有开缝时不自动越过；非罪魁祸首法棍不能断', () => {
  let s = packed('pillow', [pillow]);
  s = seam.dragZip(s, 0.9);
  s = seam.addItem(s, seam.createItem({ id: 'edge', kind: 'pan', heights: block(31, 1, 340) }));
  s = seam.advance(s, 0.5);
  assert.ok(s.z < 1);
  s = packed('bread', [block(12, 4, 74)]);
  s = press(s, 3, 14);
  assert.equal(s.items.length, 1);
});

test('回弹抱枕有过冲而羽绒服无过冲，固定步累计不足一步不前进', () => {
  const untouched = seam.advance(seam.createState({ time: 25 }), 1 / 240);
  assert.equal(untouched.time, 25);
  approx(seam.advance(untouched, 1 / 240).time, 25 + 1 / 120);
  let p = press(packed('pillow', [pillow]));
  let j = press(packed('jacket', [jacket]));
  let pillowPeak = 0, jacketPeak = 0;
  for (let n = 0; n < 480; n++) {
    p = seam.step(p); j = seam.step(j);
    pillowPeak = Math.max(pillowPeak, p.items[0].q[14]);
    jacketPeak = Math.max(jacketPeak, j.items[0].q[14]);
  }
  assert.ok(pillowPeak > 1.01);
  assert.ok(jacketPeak <= 1);
});

test('软物回弹最终静止；修改参数立即影响后续约束', () => {
  let s = press(packed('pillow', [pillow]), 0.5);
  s = seam.advance(s, 12);
  assert.ok(s.items[0].velocity.every(v => v === 0));
  assert.ok(s.items[0].q.every(q => q === 1));
  s = seam.setTuning(s, { C: 100 });
  assert.ok(Math.max(...s.gap) > 8);
  assert.ok(seam.dragZip(s, 1).z < 1);
});

test('接缝7u可拉过但总受力224u超限时，先爆开且不发布寄出完成', () => {
  const original = packed('pan', [Array(32).fill(217)]);
  assert.ok(original.gap.every(g => g === 7));
  const pulled = seam.dragZip(original, 1);
  assert.equal(pulled.completed, false);
  assert.equal(pulled.events.some(e => e.type === 'complete'), false);
  assert.equal(pulled.z, 0.875);
  assert.equal(pulled.events.filter(e => e.type === 'burst').length, 1);
  assert.equal(original.z, 0);

  const duringCooldown = seam.dragZip(pulled, 1);
  assert.equal(duringCooldown.z, 1);
  assert.equal(duringCooldown.zipStress, 224);
  assert.equal(duringCooldown.completed, false, '冷却只阻止再次爆开，不能准许超载寄出');
  assert.equal(duringCooldown.events.some(e => e.type === 'complete'), false);
  const later = seam.advance(duringCooldown, 1.51);
  assert.equal(later.completed, false);
  assert.equal(later.events.some(e => e.type === 'complete'), false);
  assert.equal(later.events.filter(e => e.type === 'burst').length, 1);
});

test('完成判定使用求解后的实际受力和现有绑带强度', () => {
  const soft = seam.dragZip(packed('pillow', [Array(32).fill(217)]), 1);
  assert.equal(soft.completed, true, '软物可压到容量内，不能仅按未求解前受力拒绝');
  assert.equal(soft.zipStress, 0);
  let supported = packed('pan', [Array(32).fill(217)]);
  for (let n = 0; n < 5; n++) supported = seam.addStrap(supported, { id: `strap-${n}`, col: n * 6 });
  supported = seam.dragZip(supported, 1);
  assert.equal(supported.zipStress, 224);
  assert.equal(supported.completed, true, '5根绑带提供200u，实际强度260u可承受224u');
  assert.equal(supported.events.filter(e => e.type === 'complete').length, 1);
});

test('自动拉到末列才超出强度时，同一步先爆开而不寄出', () => {
  let s = seam.setTuning(packed('pan', [Array(32).fill(212)]), { S: 63 });
  s = seam.dragZip(s, 0.9);
  assert.equal(s.zipStress, 56);
  s = seam.advance(s, 0.3);
  assert.equal(s.completed, false);
  assert.equal(s.events.some(e => e.type === 'complete'), false);
  assert.equal(s.events.filter(e => e.type === 'burst').length, 1);
  assert.equal(s.z, 0.875);
});

test('提起的帮手既不施压也不提供20u强度，放下后恢复', () => {
  const initial = seam.addHelper(packed('pan', [Array(32).fill(212)]), { id: 'h', col: 10, lifted: true });
  assert.equal(initial.pressure[10], 0);
  const pulled = seam.dragZip(initial, 1);
  assert.equal(pulled.completed, false);
  assert.equal(pulled.events.filter(e => e.type === 'burst').length, 1);

  const lowered = seam.setHelperLifted(initial, 'h', false);
  approx(lowered.pressure[10], 0.8);
  assert.equal(seam.dragZip(lowered, 1).completed, true);
  assert.equal(initial.helpers[0].lifted, true, '放下操作不能改动传入状态');
});

test('把已坐下的帮手提起会撤销强度；调为零重量不等同提起', () => {
  const sitting = seam.addHelper(packed('pan', [Array(32).fill(212)]), { id: 'h', col: 10 });
  const raised = seam.setHelperLifted(sitting, 'h', true);
  assert.equal(raised.pressure[10], 0);
  assert.equal(seam.dragZip(raised, 1).completed, false);
  assert.equal(sitting.helpers[0].lifted, false);

  let zeroWeight = seam.setTuning(packed('pan', [Array(32).fill(212)]), { helperWeight: 0 });
  zeroWeight = seam.addHelper(zeroWeight, { id: 'h', col: 10 });
  assert.equal(zeroWeight.pressure[10], 0);
  assert.equal(seam.dragZip(zeroWeight, 1).completed, true);
  const explicitlyZero = seam.addHelper(packed('pan', [Array(32).fill(212)]), { id: 'h', col: 10, weight: 0 });
  assert.equal(seam.dragZip(explicitlyZero, 1).completed, true);
});
