import test from 'node:test';
import assert from 'node:assert/strict';
import { peelVerdict, rollPoint, axisSpan, TOLERANCE } from '../src/game/actors/flyer-peel.js';

test('撕小广告：顺着撕的方向拉是 ok，偏一点警告，偏太多或往外拽就撕烂', () => {
  const ax = 0;
  const ay = -1;
  assert.equal(peelVerdict(0, -5, ax, ay, 20), 'wait', '拖得太短看不出方向');
  assert.equal(peelVerdict(0, -60, ax, ay, 20), 'ok');
  assert.equal(peelVerdict(20, -60, ax, ay, 20), 'ok', '偏 18° 还行');
  assert.equal(peelVerdict(40, -60, ax, ay, 20), 'warn', '偏 34° 警告');
  assert.equal(peelVerdict(60, -50, ax, ay, 20), 'tear', '偏 50° 撕烂');
  assert.equal(peelVerdict(0, 60, ax, ay, 20), 'tear', '往反方向拽撕烂');
  assert.equal(peelVerdict(60, 0, ax, ay, 20), 'tear', '横着拽撕烂');
  const d = Math.SQRT1_2;
  assert.equal(peelVerdict(-50, -50, -d, -d, 20), 'ok', '对角撕');
  assert.ok(TOLERANCE > 0.6 && TOLERANCE < 0.8);
});

test('撕小广告：卷起来的部分翻到上面，贴着的部分不动', () => {
  const r = 10;
  assert.deepEqual(rollPoint(50, 0, r), { s: 50, shade: 1 }, '还没揭：原样');
  const near = rollPoint(45, 40, r);
  assert.equal(near.s, 45, '贴着的不动');
  assert.ok(near.shade < 1, '卷旁边有影子');
  const top = rollPoint(40 - Math.PI * r - 30, 40, r);
  assert.ok(Math.abs(top.s - 70) < 1e-9, '翻过去的部分盖在上面、往粘死那头去');
  const mid = rollPoint(40 - (Math.PI * r) / 2, 40, r);
  assert.ok(Math.abs(mid.s - 30) < 1e-9, '卷的最外面在揭开处往回 r');
  assert.deepEqual(axisSpan(100, 200, 0, 1), [-100, 100]);
});
