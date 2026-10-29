import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultStats, sanitizeStats, loadStats, saveStats } from '../src/stats.js';

test('empty storage returns independent zero statistics using only the plugin stats key',()=>{
  const store={getItem:key=>{assert.ok(['chutan.v1_1.stats','chutan.v1.stats'].includes(key));return null;}};
  const loaded=loadStats(store);
  assert.deepEqual(loaded,{stats:defaultStats(),readable:true});
  loaded.stats.coins=10;
  assert.equal(defaultStats().coins,0);
  assert.deepEqual(loadStats(store).stats,defaultStats());
  loaded.stats.rent.transactions.push({id:'isolated'});
  assert.equal(defaultStats().rent.transactions.length,0);
});

test('statistics preserve negative fractional copper and integer counts across saving and loading',()=>{
  let saved;
  const store={getItem:key=>{assert.equal(key,'chutan.v1_1.stats');return saved;},setItem:(key,value)=>{assert.equal(key,'chutan.v1_1.stats');saved=value;}};
  assert.equal(saveStats(store,{coins:-7.5,served:12,badReviews:3}),true);
  assert.deepEqual(loadStats(store),{stats:{...defaultStats(),coins:-7.5,served:12,badReviews:3},readable:true});
  assert.equal(saveStats(store,{coins:7.5,served:13,badReviews:3}),true);
  assert.equal(loadStats(store).stats.coins,7.5);
});

test('invalid statistics fall back without allowing negative or fractional customer counts',()=>{
  assert.deepEqual(sanitizeStats({coins:Infinity,served:-3,badReviews:NaN,other:99}),defaultStats());
  assert.deepEqual(sanitizeStats({coins:-.25,served:8.9,badReviews:2.8}),{...defaultStats(),coins:-.25,served:8,badReviews:2});
  assert.deepEqual(sanitizeStats({coins:'7.5',served:1000000,badReviews:900000}),{...defaultStats(),coins:0,served:1000000,badReviews:900000});
  assert.deepEqual(sanitizeStats(null),defaultStats());
});

test('blocked storage and malformed JSON do not throw or touch other plugin keys',()=>{
  for(const storage of [undefined,{getItem(){throw Error('denied');},setItem(){throw Error('denied');}},{getItem:key=>{assert.equal(key,'chutan.v1_1.stats');return '{bad';}}]){
    assert.deepEqual(loadStats(storage),{stats:defaultStats(),readable:false});
    assert.equal(saveStats(storage,{coins:1,served:1,badReviews:0}),false);
  }
});
