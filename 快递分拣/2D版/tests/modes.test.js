import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MODES, EFFECTS, EFF, effLabel, resolveEffect, ACTION_ALIAS, LEVEL_FIELDS, binLabels } from '../src/modes.js';

test('mode bins (positions live in stages.js)', () => {
  assert.equal(MODES.express.bins.length, 3); assert.equal(MODES.garbage.bins.length, 4);
  assert.equal(MODES.express.slots, undefined); assert.equal(MODES.garbage.slots, undefined);
});

test('bin labels follow the naming scheme', () => {
  assert.deepEqual(binLabels('express', 'national'), ['红', '黄', '蓝']);
  assert.deepEqual(binLabels('garbage', 'shanghai'), ['可回收物', '有害垃圾', '湿垃圾', '干垃圾']);
});

test('12 effects with per-mode labels and limits', () => {
  assert.equal(EFFECTS.length, 12);
  assert.deepEqual(EFFECTS.map(e => e.id), ['truck', 'blind', 'seal', 'speed', 'leak', 'strip', 'tape', 'kick', 'help', 'audit', 'tricky', 'prank']);
  assert.equal(effLabel('blind', 'garbage'), '大垃圾袋'); assert.equal(effLabel('blind', 'express'), '爆箱盲盒');
  assert.equal(effLabel('audit', 'express'), '质检抽查'); assert.equal(effLabel('audit', 'garbage'), '督导检查');
  assert.equal(effLabel('strip', 'garbage'), '糊上泥巴'); assert.equal(effLabel('tape', 'garbage'), '套塑料袋');
  assert.equal(EFF.audit.max, 60); assert.equal(EFF.tricky.max, 10); assert.equal(EFF.prank.max, 10); assert.equal(EFF.truck.max, 60);
});

test('tricky becomes a truck in express mode', () => {
  assert.equal(resolveEffect('tricky', 'express'), 'truck');
  assert.equal(resolveEffect('tricky', 'garbage'), 'tricky');
  assert.equal(resolveEffect('prank', 'express'), 'prank');
});

test('aliases cover old and new names', () => {
  for (const [k, v] of Object.entries({ 大垃圾袋: 'blind', 套袋: 'tape', 糊泥: 'strip', 封桶: 'seal', 漏桶: 'leak', 环卫车: 'truck', 抽查: 'audit', 督导检查: 'audit', 刁钻垃圾: 'tricky', 捣乱: 'prank', prank: 'prank', audit: 'audit', tricky: 'tricky', big: 'blind', swap: 'seal', 爆箱盲盒: 'blind' })) assert.equal(ACTION_ALIAS[k], v, k);
});

test('level fields per mode', () => {
  assert.deepEqual(LEVEL_FIELDS.garbage.slice(0, 4).map(f => f[0]), ['rec', 'haz', 'kit', 'oth']);
  assert.deepEqual(LEVEL_FIELDS.express.slice(0, 3).map(f => f[0]), ['red', 'yellow', 'blue']);
});
