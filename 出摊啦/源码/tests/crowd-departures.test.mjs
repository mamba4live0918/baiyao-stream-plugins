import test from 'node:test';
import assert from 'node:assert/strict';
import { collectAbandoned, nextAbandonmentAt } from '../src/crowd/departures.js';

const customer = (key, receivedAt = 1000, extra = {}) => ({ key, receivedAt, ...extra });
const enabled = (extra = {}, moodSeconds = [30, 60, 120]) => ({
  crowd: { moodSeconds }, order: { abandon: { enabled: true, angryWaitSeconds: 60, penalty: 'coins', amount10: 10, ...extra } },
});

test('the default and disabled setting neither abandons customers nor requests a wake', () => {
  const orders = [customer('a'), customer('outside')];
  for (const settings of [{}, enabled({ enabled: false })]) {
    assert.deepEqual(collectAbandoned(orders, settings, 1e9), []);
    assert.equal(nextAbandonmentAt(orders, settings, 1e9), null);
  }
  assert.equal(nextAbandonmentAt([], enabled(), 0), null);
});

test('the deadline follows the final angry threshold and the configured extra wait', () => {
  const orders = [customer('a')];
  const deadline = nextAbandonmentAt(orders, enabled(), 0);
  assert.ok(deadline >= 176000 && deadline <= 186000, `deadline ${deadline}`);
  assert.deepEqual(collectAbandoned(orders, enabled(), 120999), []);
  assert.deepEqual(collectAbandoned(orders, enabled(), deadline - 1), []);
  assert.deepEqual(collectAbandoned(orders, enabled(), deadline), orders);
  assert.equal(nextAbandonmentAt(orders, enabled({ angryWaitSeconds: 90 }), 0), deadline + 30000);
  assert.equal(nextAbandonmentAt(orders, enabled({}, [30, 60, 240]), 0), deadline + 120000);
  assert.equal(nextAbandonmentAt(orders, enabled(), deadline + 100), deadline + 100, 'unprocessed overdue orders wake immediately');
});

test('customers have fixed bounded jitter that survives reorder and unrelated appearance changes', () => {
  const settings = enabled(), orders = Array.from({ length: 40 }, (_, i) => customer(`order:${i + 1}`));
  const deadlines = orders.map(order => nextAbandonmentAt([order], settings, 0));
  assert.ok(new Set(deadlines).size >= 20, 'a group receives distinct patience instead of one common deadline');
  for (let i = 0; i < orders.length; i++) {
    assert.ok(deadlines[i] >= 176000 && deadlines[i] <= 186000);
    assert.equal(nextAbandonmentAt([{ ...orders[i], appearance: 16, crowdOffset: { x: .1, y: -.02 } }], settings, 0), deadlines[i]);
  }
  assert.equal(nextAbandonmentAt(orders, settings, 0), Math.min(...deadlines));
  assert.equal(nextAbandonmentAt([...orders].reverse(), settings, 0), Math.min(...deadlines));
});

test('outside and pending-receipt customers participate in the same complete batch without mutation', () => {
  const orders = Array.from({ length: 500 }, (_, i) => customer(`order:${i}`, 1000, { outside: i > 30, pending: i === 0 }));
  const before = structuredClone(orders), settings = enabled({ penalty: 'rent' });
  assert.deepEqual(collectAbandoned(orders, settings, 186000), orders);
  assert.equal(collectAbandoned(orders, settings, 186000)[0], orders[0], 'returns original orders for batched removal');
  assert.deepEqual(orders, before);
});

test('equal deadlines are returned as one batch and the next wake advances after that batch is removed', () => {
  const first = customer('same'), later = customer('same', 2000);
  const orders = [first, { ...first, uid: 'another' }, later], settings = enabled();
  const deadline = nextAbandonmentAt(orders, settings, 0);
  assert.deepEqual(collectAbandoned(orders, settings, deadline), orders.slice(0, 2));
  assert.equal(nextAbandonmentAt([later], settings, deadline), deadline + 1000);
});

test('only the supplied pause-aware clock affects patience, with zero wait never leaving before anger', () => {
  const orders = [customer('a')], settings = enabled();
  const deadline = nextAbandonmentAt(orders, settings, 0), frozen = deadline - 1;
  for (let i = 0; i < 5; i++) {
    assert.deepEqual(collectAbandoned(orders, settings, frozen), []);
    assert.equal(nextAbandonmentAt(orders, settings, frozen), deadline);
  }
  for (let i = 0; i < 30; i++) {
    const order = customer(`order:${i}`), noWait = enabled({ angryWaitSeconds: 0 });
    assert.ok(nextAbandonmentAt([order], noWait, 0) >= 121000);
    assert.deepEqual(collectAbandoned([order], noWait, 120999), []);
  }
});
