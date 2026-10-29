import test from 'node:test';
import assert from 'node:assert/strict';
import { Director } from '../src/director.js';
import { defaultSettings } from '../src/config.js';

const spec = (action, id) => ({ id, action, params: {} });

test('排队：捣乱之间按最短间隔放出，加矿不受间隔限制', () => {
  const s = defaultSettings();
  s.limits.minGapMs = 1000;
  const d = new Director();
  d.push(spec('thief', 1), s);
  d.push(spec('mud', 2), s);
  d.push(spec('ore', 3), s);
  const all = () => true;
  assert.equal(d.next(0, s, all).id, 1);
  assert.equal(d.next(0.2, s, all).id, 3, '加矿可以插在间隔里');
  assert.equal(d.next(0.5, s, all), null, '间隔没到，泥水还得等');
  assert.equal(d.next(1.0, s, all).id, 2);
  assert.equal(d.size, 0);
});

test('排队：满了就拒绝；场上容不下的不挡后面的', () => {
  const s = defaultSettings();
  s.limits.queueMax = 2;
  s.limits.minGapMs = 0;
  const d = new Director();
  assert.equal(d.push(spec('thief', 1), s), 'ok');
  assert.equal(d.push(spec('rocks', 2), s), 'ok');
  assert.equal(d.push(spec('bear', 3), s), 'full');
  const noThief = x => x.action !== 'thief';
  assert.equal(d.next(0, s, noThief).id, 2, '小偷满员时，石头先上');
  assert.equal(d.next(1, s, noThief), null);
  assert.equal(d.next(2, s, () => true).id, 1);
  assert.equal(d.push(null, s), 'full');
});
