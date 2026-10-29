import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GARBAGE, BIN_NAMES, itemsByCat, enabledItems, trickyItems, wrongTip, catOf, binName, cleanOverrides } from '../src/garbage-catalog.js';

test('25 unique items, every category has at least 5', () => {
  assert.equal(GARBAGE.length, 25);
  assert.equal(new Set(GARBAGE.map(g => g.id)).size, 25);
  const by = itemsByCat({});
  for (let c = 0; c < 4; c++) assert.ok(by[c].length >= 5, '分类 ' + c);
  for (const g of GARBAGE) {
    assert.ok(g.name && g.why, g.id);
    assert.ok(Number.isInteger(g.cat) && g.cat >= 0 && g.cat <= 3, g.id);
    assert.ok(!/可回收物|有害垃圾|厨余垃圾|其他垃圾|湿垃圾|干垃圾/.test(g.why), 'why 不写分类名 ' + g.id);
  }
});

test('national and shanghai bin names', () => {
  assert.deepEqual(BIN_NAMES.national, ['可回收物', '有害垃圾', '厨余垃圾', '其他垃圾']);
  assert.deepEqual(BIN_NAMES.shanghai, ['可回收物', '有害垃圾', '湿垃圾', '干垃圾']);
  assert.equal(binName(2, 'shanghai'), '湿垃圾'); assert.equal(binName(3, 'national'), '其他垃圾'); assert.equal(binName(3, 'bogus'), '其他垃圾');
});

test('overrides move and disable items', () => {
  const ov = { banana: { cat: 3 }, bottle: { on: false } };
  assert.equal(catOf(GARBAGE.find(g => g.id === 'banana'), ov), 3);
  assert.equal(catOf(GARBAGE.find(g => g.id === 'banana'), {}), 2);
  const by = itemsByCat(ov);
  assert.ok(by[3].some(g => g.id === 'banana')); assert.ok(!by[2].some(g => g.id === 'banana'));
  assert.ok(!by[0].some(g => g.id === 'bottle')); assert.equal(enabledItems(ov).length, 24);
});

test('tip shows the reason only for the default category', () => {
  const bone = GARBAGE.find(g => g.id === 'bigbone');
  assert.equal(wrongTip(bone, {}, 'national'), '大骨头 → 其他垃圾：' + bone.why);
  assert.equal(wrongTip(bone, {}, 'shanghai'), '大骨头 → 干垃圾：' + bone.why);
  assert.equal(wrongTip(bone, { bigbone: { cat: 2 } }, 'national'), '大骨头 → 厨余垃圾');
});

test('tricky items respect overrides and fall back to all enabled items', () => {
  assert.ok(trickyItems({}).length >= 6);
  assert.ok(trickyItems({}).every(g => g.tricky));
  const allOff = Object.fromEntries(GARBAGE.filter(g => g.tricky).map(g => [g.id, { on: false }]));
  const fb = trickyItems(allOff);
  assert.ok(fb.length > 0); assert.ok(fb.every(g => allOff[g.id] === undefined));
});

test('cleanOverrides keeps only well-formed entries', () => {
  assert.deepEqual(cleanOverrides({ can: { on: 'yes', cat: 1.5 }, x: {} }), {});
  assert.deepEqual(cleanOverrides({ can: { on: false, cat: 1 }, tube: { cat: 0 } }), { can: { on: false, cat: 1 }, tube: { cat: 0 } });
  assert.deepEqual(cleanOverrides(null), {}); assert.deepEqual(cleanOverrides([1, 2]), {});
});
