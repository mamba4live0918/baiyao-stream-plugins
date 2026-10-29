const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const levels = require('../src/levels.js');

function storage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return { getItem: key => values.get(String(key)) ?? null,
    setItem(key, value) { values.set(String(key), String(value)); } };
}

test('one editable catch level starts with a single scoop and independent persistent identity', () => {
  const store = storage(), first = levels.read(store), second = levels.read(store);
  assert.equal(first.length, 1);
  assert.equal(first[0].name, '关卡 1');
  assert.equal(first[0].attemptMode, 'unlimited');
  assert.equal(first[0].count, 1);
  assert.equal(first[0].move, 800);
  assert.equal(first[0].spawnInterval, .4);
  assert.equal(first[0].bowlWidth, 190);
  assert.equal(first[0].targetHeight, 500);
  assert.equal(second[0].id, first[0].id);
  first[0].targetHeight = 1000;
  assert.equal(second[0].targetHeight, 500);
});

test('four manual-catch modes replace automatic moving and twin containers', () => {
  assert.deepEqual(levels.MODES.map(mode => mode.id), ['classic', 'narrow', 'wind', 'giant']);
  assert.equal(levels.create('narrow').bowlWidth, 130);
  assert.equal(levels.create('wind').windForce, 1.2);
  assert.equal(levels.create('giant').largeScale, 1.35);
  for (const mode of levels.MODES) {
    const first = levels.create(mode.id, 8), second = levels.create(mode.id, 8);
    assert.equal(first.mode, mode.id);
    assert.equal(first.count, 1);
    assert.equal(first.name, '关卡 9');
    assert.notEqual(first.id, second.id);
  }
  for (const mode of ['twin', 'moving', 'other']) {
    const result = levels.normalizeLevel({ mode, count: 10, travel: 200, twinGap: 400 });
    assert.equal(result.mode, 'classic');
    assert.equal(result.count, 1);
    assert.equal('travel' in result, false);
    assert.equal('twinGap' in result, false);
  }
});

test('manual catch settings retain literal values through mode changes and persistence', () => {
  const source = { id: 'my-level', name: '接球关卡', mode: 'giant', targetHeight: 1234,
    move: 4300, spawnInterval: .25, bowlWidth: 120, fall: 2.5, size: .7,
    catchOverlap: .65, attemptMode: 'limited', attempts: 42, duration: 345 };
  const store = storage(), saved = levels.write([source], store);
  for (const [key, value] of Object.entries(source)) assert.equal(saved[0][key], value, key);
  assert.deepEqual(levels.read(store), saved);
  assert.ok(store.getItem('gelato.catch.v4.levels'));
  assert.equal(store.getItem('gelato.lite.v4.levels'), null);
  assert.equal(levels.normalizeLevel({ ...source, mode: 'narrow' }).bowlWidth, 120);
});

test('configurable bounds include automatic drop intervals and exclude fixed scoop count', () => {
  assert.deepEqual(Object.keys(levels.LIMITS), ['targetHeight', 'duration', 'move', 'fall', 'size', 'bowlWidth',
    'catchOverlap', 'spawnInterval', 'attempts', 'windForce', 'windPeriod', 'gustDuration', 'largeScale', 'smallScale']);
  const low = levels.normalizeLevel({ targetHeight: 0, move: 0, bowlWidth: 0, spawnInterval: 0, catchOverlap: 0,
    fall: 0, size: 0, attempts: -2, count: -1 });
  assert.deepEqual([low.targetHeight, low.move, low.bowlWidth, low.spawnInterval, low.catchOverlap, low.fall, low.size, low.attempts, low.count],
    [20, 40, 100, .15, .1, .3, .6, 0, 1]);
  const high = levels.normalizeLevel({ targetHeight: 1e6, move: 1e6, bowlWidth: 1e6, spawnInterval: 1e6, catchOverlap: 1e6,
    fall: 1e6, size: 1e6, attempts: 1e6, count: 1e6 });
  assert.deepEqual([high.targetHeight, high.move, high.bowlWidth, high.spawnInterval, high.catchOverlap, high.fall, high.size, high.attempts, high.count],
    [10000, 5000, 500, 5, .8, 3, 1.5, 100000, 1]);
  const malformed = levels.normalizeLevel({ targetHeight: null, move: Infinity, bowlWidth: {}, spawnInterval: '',
    catchOverlap: true, fall: [], size: NaN, attempts: '31.8' });
  assert.deepEqual([malformed.targetHeight, malformed.move, malformed.bowlWidth, malformed.spawnInterval,
    malformed.catchOverlap, malformed.fall, malformed.size, malformed.attempts], [500, 800, 190, .4, .45, 1.4, 1, 32]);
});

test('finite zero drops remains distinct from unlimited and wind timing leaves a quiet interval', () => {
  const result = levels.normalizeLevel({ attemptMode: 'limited', attempts: 0, mode: 'wind', windPeriod: 1, gustDuration: 5 });
  assert.equal(result.attemptMode, 'limited');
  assert.equal(result.attempts, 0);
  assert.equal(result.gustDuration, .8);
  assert.equal(levels.normalizeLevel({ attemptMode: 'automatic' }).attemptMode, 'unlimited');
});

test('old layer targets convert to height and explicit physical height wins', () => {
  assert.equal(levels.normalizeLevel({ target: 50 }).targetHeight, 2492);
  assert.equal(levels.normalizeLevel({ target: 50, targetHeight: 432 }).targetHeight, 432);
  assert.equal(levels.normalizeLevel({ target: 2, targetHeight: null }).targetHeight, 99.68);
  const migrated = levels.migrateLegacy({ mode: 'moving', target: 12, attempts: 37, count: 10, travel: 190 });
  assert.equal(migrated.length, 1);
  assert.equal(migrated[0].mode, 'classic');
  assert.equal(migrated[0].count, 1);
  assert.equal(migrated[0].targetHeight, 598.08);
  assert.equal(migrated[0].attemptMode, 'limited');
  assert.equal(migrated[0].attempts, 37);
  assert.equal('travel' in migrated[0], false);
  assert.equal(levels.migrateLegacy({ mode: 'wind', target: 12, targetHeight: 777 })[0].targetHeight, 777);
  assert.equal(levels.migrateLegacy({ attemptMode: 'unlimited', attempts: 37 })[0].attemptMode, 'unlimited');
  assert.equal(levels.migrateLegacy(null)[0].attemptMode, 'unlimited');
});

test('migration reads only catch keys, preserves explicit zero, and current levels take priority', () => {
  const store = storage({ 'gelato.catch.v1.config': JSON.stringify({ target: 13, attempts: 0 }) });
  const first = levels.read(store), second = levels.read(store);
  assert.equal(first.length, 1);
  assert.equal(first[0].attempts, 0);
  assert.equal(first[0].attemptMode, 'limited');
  assert.deepEqual(first, second);
  const saved = levels.write([{ name: '最后一关', mode: 'giant', targetHeight: 1500 }], store);
  assert.deepEqual(levels.read(store), saved);
  assert.equal(levels.read(storage({ 'gelato.lite.v4.levels': JSON.stringify([{ targetHeight: 9999 }]) }))[0].targetHeight, 500);
});

test('identities survive edits and ordering while duplicate repairs never steal later identities', () => {
  const first = levels.normalizeList([{ id: 'first' }, { id: 'second' }, { id: 'third' }]);
  assert.deepEqual(levels.normalizeList([first[2], first[0]]).map(level => level.id), ['third', 'first']);
  const repaired = levels.normalizeList([{ id: 'same' }, { id: 'same' }, { id: 'same.2' }, { id: '<script>' }, {}]);
  assert.equal(repaired[0].id, 'same');
  assert.equal(repaired[2].id, 'same.2');
  assert.equal(new Set(repaired.map(level => level.id)).size, 5);
  assert.deepEqual(levels.normalizeList(repaired), repaired);
});

test('malformed campaigns recover one level, names are bounded, and normalization is nonmutating', () => {
  for (const input of [null, {}, [], [null, false, 'a']]) assert.equal(levels.normalizeList(input).length, 1);
  assert.equal(levels.normalizeList(Array.from({ length: 205 }, (_, index) => ({ id: 'level-' + index }))).length, 200);
  const input = { id: 'name', name: ' 第一关\u0000 ', unknown: { foo: 1 } }, before = JSON.stringify(input);
  assert.equal(levels.normalizeLevel(input).name, '第一关');
  assert.equal('unknown' in levels.normalizeLevel(input), false);
  assert.equal(JSON.stringify(input), before);
  assert.equal([...levels.normalizeLevel({ name: '🍦'.repeat(90) }).name].length, 40);
});

test('bad storage is recoverable and writes reject invalid campaigns without deleting existing data', () => {
  assert.equal(levels.read(storage({ [levels.STORAGE_KEY]: '{bad' })).length, 1);
  assert.equal(levels.read({ getItem() { throw new Error('denied'); } }).length, 1);
  const store = storage();
  for (const input of [null, {}, [], [null], ['bad'], new Array(1), Array.from({ length: 201 }, () => ({}))])
    assert.throws(() => levels.write(input, store), /关卡/);
  assert.equal(store.getItem(levels.STORAGE_KEY), null);
  assert.throws(() => levels.write([{}], { setItem() { throw new Error('quota'); } }), /保存.*关卡|关卡.*保存/);
});

test('browser build exposes the same editable catch API without localStorage', () => {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(require.resolve('../src/levels.js'), 'utf8'), context);
  assert.equal(typeof context.GelatoLevels.write, 'function');
  assert.equal(context.GelatoLevels.read().length, 1);
  assert.equal(context.GelatoLevels.create('wind').count, 1);
});
