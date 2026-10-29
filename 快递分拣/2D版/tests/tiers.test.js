import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TIER_PARAMS, DEFAULT_TIERS, MAX_TIERS, cleanTiers, tierOf, findTier, defaultTier, newTier, parseTierAction, fixParam, cleanTierName, normTierRefs } from '../src/tiers.js';
import { EFFECTS } from '../src/modes.js';

test('every effect starts with 轻 / 中 / 重, 中 is the default, all parameters covered', () => {
  for (const e of EFFECTS) {
    const list = DEFAULT_TIERS[e.id]; assert.ok(TIER_PARAMS[e.id], e.id);
    assert.deepEqual(list.map(t => t.name), ['轻', '中', '重'], e.id); assert.deepEqual(list.map(t => t.id), ['light', 'mid', 'heavy'], e.id);
    assert.equal(defaultTier(list).id, 'mid', e.id);
    assert.equal(TIER_PARAMS[e.id][0][0], 'amt', e.id); assert.equal(TIER_PARAMS[e.id][0][3], e.max, e.id + ' 数量上限与规则一致');
    for (const t of list) for (const [k, , a, b] of TIER_PARAMS[e.id]) assert.ok(t[k] >= a && t[k] <= b, `${e.id}.${k}`);
  }
  assert.ok(DEFAULT_TIERS.seal[2].bins > DEFAULT_TIERS.seal[0].bins); assert.ok(DEFAULT_TIERS.audit[2].mult > DEFAULT_TIERS.audit[0].mult);
});

test('any number of tiers from 1 to MAX, names cleaned, ids unique, exactly one default', () => {
  assert.equal(MAX_TIERS, 12);
  const one = cleanTiers({ kick: [{ id: 'only', name: '  就一脚  ', amt: 2, loss: 50, power: 1.2 }] });
  assert.equal(one.kick.length, 1); assert.equal(one.kick[0].name, '就一脚'); assert.equal(defaultTier(one.kick).id, 'only');
  const many = cleanTiers({ seal: Array.from({ length: 20 }, (_, i) => ({ id: 'x', name: '', amt: 5 + i, hits: 2, bins: 1, def: i === 4 || i === 6 })) });
  assert.equal(many.seal.length, MAX_TIERS); assert.equal(new Set(many.seal.map(t => t.id)).size, MAX_TIERS, 'id 去重');
  assert.equal(many.seal[3].name, '第4档'); assert.equal(many.seal.filter(t => t.def).length, 1); assert.equal(defaultTier(many.seal).amt, 9, '第一个标记为默认的生效');
  const none = cleanTiers({ speed: [] }); assert.equal(none.speed.length, 3, '空列表退回默认三档');
  const nodef = cleanTiers({ tape: [{ name: 'A', amt: 1, layers: 1 }, { name: 'B', amt: 2, layers: 2 }] }); assert.equal(nodef.tape.filter(t => t.def).length, 1); assert.equal(defaultTier(nodef.tape).name, 'A');
});

test('values are clamped and rounded; unknown effects and keys dropped', () => {
  const t = cleanTiers({ seal: [{ name: '狠', amt: 999, hits: 0, bins: 9, junk: 1 }], speed: [{ name: 's', amt: 5, mul: 2.26 }], nope: [{}] });
  assert.deepEqual(t.seal[0], { id: t.seal[0].id, name: '狠', def: true, amt: 60, hits: 1, bins: 4 }); assert.equal(t.speed[0].mul, 2.5); assert.equal(t.nope, undefined);
  assert.equal(t.seal[0].name.length <= 8, true); assert.equal(cleanTiers({ seal: [{ name: '一二三四五六七八九十' }] }).seal[0].name, '一二三四五六七八');
});

test('legacy settings: V1 fx goes into the default tier; dev-format arrays without ids keep 轻/中/重', () => {
  const t = cleanTiers(undefined, { truck: 12, seal: 20, sealHits: 7, speedMul: 4.5, scanTime: 1.2, tapeLayers: 5, kickLoss: 45, blindHits: 9, leakHits: 2 });
  assert.equal(tierOf(t, 'truck').amt, 12); assert.equal(tierOf(t, 'seal').amt, 20); assert.equal(tierOf(t, 'seal').hits, 7);
  assert.equal(tierOf(t, 'speed').mul, 4.5); assert.equal(tierOf(t, 'strip').scan, 1.2); assert.equal(tierOf(t, 'tape').layers, 5);
  assert.equal(tierOf(t, 'kick').loss, 45); assert.equal(tierOf(t, 'blind').hits, 9); assert.equal(tierOf(t, 'leak').hits, 2);
  assert.deepEqual(t.seal[0], DEFAULT_TIERS.seal[0]);
  const dev = cleanTiers({ seal: [{ amt: 5, hits: 2, bins: 1 }, { amt: 9, hits: 4, bins: 1 }, { amt: 40, hits: 20, bins: 3 }] });
  assert.deepEqual(dev.seal.map(x => [x.id, x.name, !!x.def]), [['light', '轻', false], ['mid', '中', true], ['heavy', '重', false]]); assert.equal(dev.seal[2].hits, 20);
});

test('tierOf resolves by id, by name, by 1-based number text, by 0-based index, else the default tier', () => {
  const t = cleanTiers({ seal: [{ id: 'a', name: '小', amt: 5, hits: 1, bins: 1 }, { id: 'b', name: '大', amt: 20, hits: 9, bins: 2, def: true }, { id: 'c', name: '超大', amt: 40, hits: 20, bins: 4 }] });
  assert.equal(tierOf(t, 'seal', 'c').name, '超大'); assert.equal(tierOf(t, 'seal', '小').id, 'a'); assert.equal(tierOf(t, 'seal', '3').id, 'c');
  assert.equal(tierOf(t, 'seal', 0).id, 'a'); assert.equal(tierOf(t, 'seal', 'gone').id, 'b'); assert.equal(tierOf(t, 'seal', undefined).id, 'b'); assert.equal(tierOf(t, 'seal', 99).id, 'b');
});

test('findTier only returns a tier that was actually picked (the board shows a tier name only then)', () => {
  const t = cleanTiers({ seal: [{ id: 'a', name: '小', amt: 5, hits: 1, bins: 1 }, { id: 'b', name: '大', amt: 20, hits: 9, bins: 2, def: true }] });
  assert.equal(findTier(t, 'seal', ''), null); assert.equal(findTier(t, 'seal', undefined), null); assert.equal(findTier(t, 'seal', 'gone'), null); assert.equal(findTier(t, 'seal', '9'), null); assert.equal(findTier(t, 'seal', 5), null);
  assert.equal(findTier(t, 'seal', 'b').name, '大'); assert.equal(findTier(t, 'seal', '小').id, 'a'); assert.equal(findTier(t, 'seal', '2').id, 'b'); assert.equal(findTier(t, 'seal', 0).id, 'a');
});

test('newTier copies the default tier with a fresh id and the next name', () => {
  const list = cleanTiers().seal, n = newTier(list);
  assert.equal(n.name, '第4档'); assert.ok(!list.some(t => t.id === n.id)); assert.equal(n.def, false); assert.equal(n.hits, defaultTier(list).hits);
});

test('host actions can carry a tier suffix (name or number)', () => {
  assert.deepEqual(parseTierAction('seal'), { action: 'seal', tier: null });
  assert.deepEqual(parseTierAction('seal:重'), { action: 'seal', tier: '重' });
  assert.deepEqual(parseTierAction('封桶·超大号'), { action: '封桶', tier: '超大号' });
  assert.deepEqual(parseTierAction('kick：3'), { action: 'kick', tier: '3' });
  assert.deepEqual(parseTierAction(' audit-1 '), { action: 'audit', tier: '1' });
  assert.deepEqual(parseTierAction('seal-重'), { action: 'seal', tier: '重' });
  assert.deepEqual(parseTierAction('seal・重'), { action: 'seal', tier: '重' });
  assert.deepEqual(parseTierAction('seal 重'), { action: 'seal', tier: '重' });
  assert.deepEqual(parseTierAction('又来一车'), { action: '又来一车', tier: null });
});

test('a new tier never reuses a name; imported duplicate or number-only names are renamed', () => {
  let list = cleanTiers().seal; list = [...list, newTier(list)]; assert.equal(list[3].name, '第4档');
  list = list.filter(t => t.name !== '轻'); assert.equal(newTier(list).name, '第5档', '删掉一档后再加，不会再出一个「第4档」');
  const t = cleanTiers({ seal: [{ name: '大' }, { name: '大' }, { name: '3' }, { name: '大2' }] });
  assert.deepEqual(t.seal.map(x => x.name), ['大', '大2', '第3档', '大22']);
  assert.equal(cleanTierName(' 12 '), ''); assert.equal(cleanTierName('超重'), '超重'); assert.equal(cleanTierName('3号'), '3号');
});

test('the editor rounds like loading does (kick loss 33 becomes 35)', () => {
  assert.equal(fixParam('kick', 'loss', 33), 35); assert.equal(fixParam('speed', 'mul', 2.26), 2.5); assert.equal(fixParam('seal', 'hits', 999), 50);
});

test('rules store tier ids after loading: names, number text and legacy indexes become ids', () => {
  const t = cleanTiers({ seal: [{ id: 'a', name: '小' }, { id: 'b', name: '大', def: true }], tricky: [{ id: 'q', name: '刁' }, { id: 'w', name: '更刁' }] });
  const out = normTierRefs([{ effect: 'seal', tier: 1 }, { effect: 'seal', tier: '小' }, { effect: 'seal', tier: '2' }, { effect: 'seal', tier: 'gone' }, { effect: 'seal', tier: '' }, { effect: 'tricky', tier: '更刁' }], t);
  assert.deepEqual(out.map(r => r.tier), ['b', 'a', 'b', '', '', 'w']);
});
