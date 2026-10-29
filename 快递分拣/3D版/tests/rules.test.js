import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_RULES, validRules, normKey } from '../src/rules.js';

test('default rules are valid and include the new effects', () => {
  const r = validRules(DEFAULT_RULES);
  for (const e of ['audit', 'prank', 'tricky']) assert.ok(r.some(x => x.effect === e && x.on), e);
  assert.equal(new Set(r.map(x => x.id)).size, r.length);
});

test('limits come from EFFECTS', () => {
  assert.throws(() => validRules([{ src: 'gift', match: 'a', effect: 'audit', value: 61 }]), /1–60/);
  assert.throws(() => validRules([{ src: 'gift', match: 'a', effect: 'nope', value: 1 }]), /未知效果/);
  assert.equal(validRules([{ src: 'gift', match: 'a', effect: 'prank', value: 10 }])[0].value, 10);
});

test('legacy effect names are mapped', () => {
  const r = validRules([{ src: 'gift', match: 'a', effect: 'big', value: 3 }, { src: 'gift', match: 'b', effect: 'swap', value: 5 }]);
  assert.equal(r[0].effect, 'blind'); assert.equal(r[1].effect, 'seal');
});

test('duplicate enabled gift is rejected; disabled duplicates are fine', () => {
  assert.throws(() => validRules([{ src: 'gift', match: '玫瑰', effect: 'truck', value: 1 }, { src: 'gift', match: ' 玫瑰 ', effect: 'kick', value: 1 }]), /重复/);
  assert.equal(validRules([{ src: 'gift', match: '玫瑰', effect: 'truck', value: 1 }, { src: 'gift', match: '玫瑰', effect: 'kick', value: 1, on: false }]).length, 2);
});

test('normKey folds width, case and spaces', () => { assert.equal(normKey(' ＡＢｃ '), 'abc'); });

test('rules remember a tier id; empty means the default tier', () => {
  const r = validRules([{ src: 'gift', match: 'a', effect: 'seal', value: 5 }, { src: 'gift', match: 'b', effect: 'seal', value: 5, tier: 'heavy' }, { src: 'gift', match: 'c', effect: 'seal', value: 5, tier: 2 }, { src: 'gift', match: 'd', effect: 'seal', value: 5, tier: { bad: 1 } }, { src: 'gift', match: 'e', effect: 'seal', value: 5, tier: 'x'.repeat(40) }]);
  assert.deepEqual(r.map(x => x.tier), ['', 'heavy', 2, '', 'x'.repeat(24)]);
  assert.ok(validRules(DEFAULT_RULES).every(x => x.tier === ''));
});
