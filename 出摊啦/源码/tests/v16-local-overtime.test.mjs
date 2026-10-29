// V1.6 插件自带的加班机：交租差额和「加班」动作按「加班记到哪」记账（自带的 = route local，不送白曜）；礼物先给加班机的礼物加减表看一眼。
import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultStats } from '../src/stats.js';
import { startRent, advanceRent, addOvertime, getPendingOvertime } from '../src/rent/model.js';
import { Live } from '../src/live.js';
import { defaultSettings } from '../src/settings.js';

const rentSettings = { enabled: true, minutes: 1, coins: 100, perCoins: 10, addMinutes: 1 };

test('a rent shortfall on the built-in clock is recorded as local and never waits for 白曜', () => {
  const started = startRent({ ...defaultStats(), coins: 40 }, rentSettings);
  const local = advanceRent(started, 60_000, rentSettings, { running: true, route: 'local' });
  assert.equal(local.charges.length, 1);
  assert.deepEqual([local.charges[0].seconds, local.charges[0].route], [360, 'local']);
  assert.equal(getPendingOvertime(local.stats).length, 0, 'nothing to send to 白曜');
  assert.equal(local.stats.rent.transactions.at(-1).status, 'local');
  const remote = advanceRent(started, 60_000, rentSettings, { running: true, route: 'baiyao' });
  assert.equal(remote.charges[0].route, 'baiyao');
  assert.equal(getPendingOvertime(remote.stats).length, 1, '白曜 route still waits to be sent');
  const old = advanceRent(started, 60_000, rentSettings, { running: true });
  assert.equal(old.charges[0].route, 'baiyao', 'callers that do not say keep the V1.5 behaviour');
});

test('the overtime action follows the same route', () => {
  const a = addOvertime(defaultStats(), 300, { id: 'x1', route: 'local' });
  assert.deepEqual([a.transaction.route, a.transaction.status], ['local', 'local']);
  const b = addOvertime(defaultStats(), 300, { id: 'x2' });
  assert.deepEqual([b.transaction.route, b.transaction.status], ['baiyao', 'pending']);
});

test('every fresh real gift is offered to the overtime gift table once, even when no table rule matches', () => {
  const seen = [];
  const settings = defaultSettings();
  const live = new Live(() => true, () => settings, { setTimeout, clearTimeout }, () => {}, {
    fallback: false,
    onGiftEvent: (event) => { seen.push([event.gift.name, event.gift.count]); return event.gift.name === '玫瑰' ? 300 : 0; },
  });
  live.receiving = () => true;
  assert.equal(live.onGift({ giftName: '玫瑰', count: 2, nickName: '小鱼干', eventId: 'g1' }), true, 'an overtime-only gift counts as handled');
  assert.equal(live.onGift({ giftName: '玫瑰', count: 2, nickName: '小鱼干', eventId: 'g1' }), false, 'the same event id is not offered twice');
  live.onGift({ giftName: '不认识的礼物', count: 1, nickName: '路人', eventId: 'g2' });
  assert.deepEqual(seen, [['玫瑰', 2], ['不认识的礼物', 1]]);
  assert.equal(live.lastGift.matched, false);
});
