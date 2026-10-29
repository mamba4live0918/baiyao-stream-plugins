import test from 'node:test';
import assert from 'node:assert/strict';
import { moodAt, showName, showBubble, moodSchedule, queueSummary, evaluateCrowd } from '../src/crowd/behavior.js';

const order = (key, receivedAt = 0, extra = {}) => ({ key, receivedAt, lastUrgedAt: null, ...extra });
const front = key => ({ key, front: true });
const back = key => ({ key, front: false });

test('waiting mood changes exactly at 30, 60 and 120 seconds', () => {
  for (const [age, expected] of [[-1,'happy'],[0,'happy'],[29999,'happy'],[30000,'neutral'],[59999,'neutral'],[60000,'impatient'],[119999,'impatient'],[120000,'angry']]) {
    assert.equal(moodAt(age), expected, String(age));
  }
  assert.equal(moodAt(9999, [5,10,20]), 'neutral');
  assert.equal(moodAt(10000, [5,10,20]), 'impatient');
  assert.equal(moodAt(20000, [5,10,20]), 'angry');
});

test('name badges last three seconds in the back row and stay on the front row', () => {
  const customer = order('a', 1000);
  assert.equal(showName(customer, back('a'), 3999), true);
  assert.equal(showName(customer, back('a'), 4000), false);
  assert.equal(showName(customer, front('a'), 9000), true);
  assert.equal(showName(customer, front('a'), 1500, { names: false }), false);
  assert.equal(showBubble(front('a')), true);
  assert.equal(showBubble(back('a')), false);
});

test('mood scheduling returns the next absolute threshold or no timer', () => {
  assert.equal(moodSchedule([], 0), null);
  assert.equal(moodSchedule([order('a', 1000)], 10000), 31000);
  assert.equal(moodSchedule([order('a')], 30000), 60000);
  assert.equal(moodSchedule([order('a')], 60000), 120000);
  assert.equal(moodSchedule([order('a')], 120000), null);
});

test('chant majority counts only the final angry mood and must exceed one half', () => {
  const half = [order('a'), order('b'), order('c', 60000), order('d', 60000)];
  assert.deepEqual(queueSummary(half, 60000), { total: 4, angryCount: 0, majority: false });
  assert.deepEqual(queueSummary(half, 119999), { total: 4, angryCount: 0, majority: false });
  assert.deepEqual(queueSummary(half, 120000), { total: 4, angryCount: 2, majority: false });
  assert.deepEqual(queueSummary(half.slice(0, 3), 120000), { total: 3, angryCount: 2, majority: true });
  assert.deepEqual(queueSummary([], 120000), { total: 0, angryCount: 0, majority: false });
  assert.deepEqual(queueSummary([order('a'), order('b', 10000)], 20000, [5,10,20]), { total: 2, angryCount: 1, majority: false });
});

test('idle visible customers only wake at a real visual boundary', () => {
  const customers = [order('a')];
  const idle = evaluateCrowd(customers, [back('a')], 0);
  assert.equal(idle.active, false);
  assert.equal(idle.activeUntil, null);
  assert.equal(idle.nextWake, 3000);
  assert.equal(idle.actors[0].showName, true);
  assert.equal(idle.actors[0].showBubble, false);
  assert.equal(evaluateCrowd(customers, [back('a')], 3000).nextWake, 30000);
  assert.equal(evaluateCrowd(customers, [back('a')], 0, { names: false }).nextWake, 30000);
  assert.equal(evaluateCrowd(customers, [front('a')], 0).nextWake, 30000);
  const empty = evaluateCrowd([], [], 0);
  assert.equal(empty.nextWake, null);
  assert.equal(empty.active, false);
});

test('an urge is one 600ms jump and callout, then stops animation', () => {
  const customers = [order('a', 0, { lastUrgedAt: 10000 })];
  const start = evaluateCrowd(customers, [front('a')], 10000);
  assert.equal(start.active, true);
  assert.equal(start.activeUntil, 10600);
  assert.equal(start.actors[0].callout, '快点！');
  assert.equal(evaluateCrowd(customers, [front('a')], 10300).actors[0].jump, 1);
  const finished = evaluateCrowd(customers, [front('a')], 10600);
  assert.equal(finished.active, false);
  assert.equal(finished.actors[0].jump, 0);
  assert.equal(finished.actors[0].callout, null);
  assert.equal(finished.nextWake, 30000);
});

test('urge timestamps at zero are valid and future timestamps do not animate early', () => {
  assert.equal(evaluateCrowd([order('a', 0, { lastUrgedAt: 0 })], [front('a')], 100).active, true);
  const future = evaluateCrowd([order('a', 0, { lastUrgedAt: 5000 })], [front('a')], 1000);
  assert.equal(future.active, false);
  assert.equal(future.actors[0].callout, null);
  assert.equal(future.nextWake, 5000);
});

test('angry stomps last 320ms and schedule a deterministic later wake instead of endless animation', () => {
  const customers = [order('a'), order('b', 119000), order('c', 119000)];
  const evaluate = now => evaluateCrowd(customers, [front('a')], now, { names: false });
  const start = evaluate(120000);
  assert.equal(start.actors[0].mood, 'angry');
  assert.equal(start.actors[0].steam, true);
  assert.equal(start.active, true);
  assert.equal(start.activeUntil, 120320);
  assert.equal(evaluate(120160).actors[0].jump, 1);
  const rest = evaluate(120320);
  assert.equal(rest.active, false);
  assert.equal(rest.actors[0].jump, 0);
  assert.equal(rest.nextWake, 125000);
  assert.equal(evaluate(rest.nextWake).active, true);
  assert.equal(evaluate(rest.nextWake + 160).actors[0].jump, 1);
  assert.equal(evaluate(rest.nextWake + 320).active, false);
});

test('a majority chant ends after 900ms and waits for the eight-second cadence', () => {
  const customers = [order('a'), order('b'), order('c', 60000)];
  assert.equal(evaluateCrowd(customers, [], 60000).chant, null);
  const start = evaluateCrowd(customers, [], 120000, { names: false });
  assert.equal(start.chant, '快点！快点！');
  assert.equal(start.active, true);
  assert.equal(start.activeUntil, 120900);
  const rest = evaluateCrowd(customers, [], 120900, { names: false });
  assert.equal(rest.chant, null);
  assert.equal(rest.active, false);
  assert.equal(rest.nextWake, 128000);
  assert.equal(evaluateCrowd(customers, [], 128000).chant, '快点！快点！');
  assert.equal(evaluateCrowd(customers.slice(0, 2).concat([order('d', 120000), order('e', 120000)]), [], 120000).chant, null);
  assert.equal(evaluateCrowd([order('a'), order('b'), order('c', 40000)], [], 40000, { thresholds: [10,20,40] }).chant, '快点！快点！');
});

test('500 angry customers share bounded stomp windows and retain long idle gaps five minutes later', t => {
  const customers = Array.from({ length: 500 }, (_, index) => order(`order:${index+1}`, index * 37));
  const slots = customers.map(customer => back(customer.key));
  const evaluate = now => evaluateCrowd(customers, slots, now, { names: false });
  const peak = evaluate(300160);
  let idleSamples = 0, samples = 0, idleRunMs = 0, longestIdleMs = 0;
  for (let now = 300000; now < 330000; now += 100) {
    const state = evaluate(now);
    samples += 1;
    if (!state.active) {
      idleSamples += 1;
      idleRunMs += 100;
      longestIdleMs = Math.max(longestIdleMs, idleRunMs);
      assert.ok(state.actors.every(actor => actor.jump === 0 && actor.callout === null));
      assert.ok(state.nextWake > now);
    } else idleRunMs = 0;
  }
  assert.ok(idleSamples >= samples * .7, `${idleSamples}/${samples} samples should permit a static back layer`);
  assert.ok(longestIdleMs >= 2000, `longest idle gap was ${longestIdleMs}ms`);
  assert.ok(peak.actors.every(actor => actor.mood === 'angry' && actor.steam && actor.jump === 1));
  t.diagnostic(`500 actors, 30s virtual sample: ${idleSamples}/${samples} idle; longest idle gap ${longestIdleMs}ms`);
});

test('an urge still animates outside the shared angry stomp window', () => {
  const customers = [order('a', 0, { lastUrgedAt: 300500 }), order('b', 299000), order('c', 299000)];
  const state = evaluateCrowd(customers, [front('a')], 300800, { names: false });
  assert.equal(state.active, true);
  assert.equal(state.activeUntil, 301100);
  assert.equal(state.actors[0].jump, 1);
  assert.equal(state.actors[0].callout, '快点！');
  assert.equal(evaluateCrowd(customers, [front('a')], 301100, { names: false }).active, false);
});

test('only visible matching slots become actors, without mutating orders or layout', () => {
  const customers = [order('a'), order('b')], slots = [front('a'), front('unknown')];
  const before = structuredClone({ customers, slots });
  const state = evaluateCrowd(customers, slots, 1000);
  assert.deepEqual(state.actors.map(actor => actor.key), ['a']);
  assert.deepEqual({ customers, slots }, before);
});
