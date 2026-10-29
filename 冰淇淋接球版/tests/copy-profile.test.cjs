const test = require('node:test');
const assert = require('node:assert/strict');
const { copyOnce } = require('../src/copy-profile.js');

function storage(initial = {}) {
  const values = new Map(Object.entries(initial)), writes = [];
  return { values, writes, getItem: key => values.get(key) ?? null,
    setItem(key, value) { values.set(key, String(value)); writes.push(key); } };
}

test('copies only appearance and display from the nearest available version independently per key', () => {
  const source = {
    'gelato.lite.v2.appearance': '{"skin":"lite"}', 'gelato.sticky.v2.appearance': '{"skin":"sticky"}',
    'gelato.sticky.v4.display': '{"sound":false}', 'gelato.v4.display': '{"sound":true}',
    'gelato.lite.v4.levels': '[{"targetHeight":9999}]', 'gelato.lite.v1.rules': '[{"action":"count_add"}]',
    'gelato.lite.v4.completed': '["old"]', 'gelato.lite.v4.hud-position': '{"x":1}'
  };
  const store = storage(source);
  assert.deepEqual(copyOnce(store), { copied: 2, warning: '' });
  assert.equal(store.getItem('gelato.catch.v2.appearance'), source['gelato.lite.v2.appearance']);
  assert.equal(store.getItem('gelato.catch.v4.display'), source['gelato.sticky.v4.display']);
  assert.deepEqual(store.writes.sort(), ['gelato.catch.profileReady', 'gelato.catch.v2.appearance', 'gelato.catch.v4.display']);
  for (const [key, value] of Object.entries(source)) assert.equal(store.getItem(key), value);
});

test('ordinary settings are the fallback and existing catch choices are never overwritten', () => {
  const store = storage({ 'gelato.v2.appearance': '{"skin":"ordinary"}', 'gelato.v4.display': '{"feed":true}',
    'gelato.catch.v2.appearance': '{"skin":"mine"}' });
  assert.equal(copyOnce(store).copied, 1);
  assert.equal(store.getItem('gelato.catch.v2.appearance'), '{"skin":"mine"}');
  assert.equal(store.getItem('gelato.catch.v4.display'), '{"feed":true}');
  const after = store.writes.length;
  assert.deepEqual(copyOnce(store), { copied: 0, warning: '' });
  assert.equal(store.writes.length, after);
});

test('first empty start marks completion and later old-version edits do not silently change catch settings', () => {
  const store = storage();
  assert.deepEqual(copyOnce(store), { copied: 0, warning: '' });
  store.setItem('gelato.lite.v2.appearance', '{"later":true}');
  assert.equal(copyOnce(store).copied, 0);
  assert.equal(store.getItem('gelato.catch.v2.appearance'), null);
});

test('storage failures leave source settings intact and retry fills only missing destinations', () => {
  const store = storage({ 'gelato.lite.v2.appearance': '{}', 'gelato.lite.v4.display': '{}' });
  const setItem = store.setItem;
  store.setItem = (key, value) => { if (key === 'gelato.catch.v4.display') throw new Error('quota'); setItem(key, value); };
  const failure = copyOnce(store);
  assert.equal(failure.copied, 1);
  assert.match(failure.warning, /存储/);
  assert.equal(store.getItem('gelato.catch.profileReady'), null);
  assert.equal(store.getItem('gelato.lite.v2.appearance'), '{}');
  store.setItem = setItem;
  assert.deepEqual(copyOnce(store), { copied: 1, warning: '' });
});
