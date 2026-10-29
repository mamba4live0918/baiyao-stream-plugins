import test from 'node:test';
import assert from 'node:assert/strict';
import { GrimeLedger } from '../src/game/grime-ledger.js';

const rec = (key, area, extra = {}) => ({ key, tagged: true, area, label: '泥巴', ...extra });

test('陈年污垢账本：刮掉的量攒够最早那条才算它擦完，先进先出', () => {
  const L = new GrimeLedger();
  L.add(1, rec('a', 100));
  L.add(1, rec('b', 50));
  assert.equal(L.size, 2);
  assert.deepEqual(L.cleaned(1, 60), [], '还不够第一条');
  const done = L.cleaned(1, 40);
  assert.equal(done.length, 1);
  assert.equal(done[0].key, 'a');
  assert.equal(L.size, 1);
  assert.equal(L.cleaned(1, 47).length, 1, '剩下的池子 + 47 够第二条');
  assert.equal(L.size, 0);
});

test('陈年污垢账本：格里没账时刮掉的不攒到后来的头上', () => {
  const L = new GrimeLedger();
  assert.deepEqual(L.cleaned(2, 1000), []);
  L.add(2, rec('a', 100));
  assert.deepEqual(L.cleaned(2, 10), [], '之前那 1000 不算');
});

test('陈年污垢账本：整格擦干净全算完，整格拿走不算；按观众计"主块"', () => {
  const L = new GrimeLedger();
  L.add(1, rec('a', 100));
  L.add(1, rec('a', 100, { tagged: false }));
  L.add(2, rec('a', 100));
  L.add(2, rec('', 100));
  assert.equal(L.ownerCount('a'), 2, '附属痕迹和没主的不算');
  assert.equal(L.flush(1).length, 2);
  assert.equal(L.ownerCount('a'), 1);
  assert.equal(L.drop(2), 2);
  assert.equal(L.ownerCount('a'), 0);
  assert.equal(L.size, 0);
});

test('陈年污垢账本：超上限时丢掉全场最早的一条', () => {
  const L = new GrimeLedger();
  L.add(3, rec('a', 10));
  L.add(4, rec('b', 10));
  L.add(3, rec('c', 10));
  assert.equal(L.dropOldest().key, 'a');
  assert.equal(L.dropOldest().key, 'b');
  assert.equal(L.dropOldest().key, 'c');
  assert.equal(L.dropOldest(), null);
  assert.equal(L.size, 0);
});
