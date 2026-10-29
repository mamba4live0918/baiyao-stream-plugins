import test from 'node:test';
import assert from 'node:assert/strict';
import { routeGift, normalizeGiftEvent } from '../src/rules.js';
import { defaultSettings, sanitizeSettings, fillExampleGifts } from '../src/settings.js';
import { createInbox } from '../src/inbox.js';
import { Live } from '../src/live.js';
import { inspectPortMessage } from '../src/live-message-test.js';

const config = () => ({
  live: { receive: true }, shop: 'noodle',
  order: { enabled: true, keywords: ['点单'], perPerson: 1 },
  rules: {
    pool: ['fire'],
    mess: [{ name: '人气票', min: 1, max: 1 }],
    help: [{ name: '玫瑰', action: 'helper', min: 1, max: 1 }],
    order: [{ name: '小心心', min: 1, max: 1 }, { name: '嘉年华', min: 2, max: 3 }]
  }
});
const giftEvent = (name, count = 1) => normalizeGiftEvent({ giftName: name, count, nickName: '小明', userId: 'viewer-a', eventId: `g-${name}-${count}` });

test('an order gift brings one customer per gift by default', () => {
  assert.deepEqual(routeGift(config(), giftEvent('小心心')), [
    { kind: 'order', nick: '小明', uid: 'viewer-a', id: 'g-小心心-1', count: 1, source: 'gift', via: 'gift' }
  ]);
});

test('order gift ranges are drawn per gift and multiplied by the gift count', () => {
  assert.equal(routeGift(config(), giftEvent('嘉年华', 3), () => 0)[0].count, 6);
  assert.equal(routeGift(config(), giftEvent('嘉年华', 3), () => 0.999)[0].count, 9);
});

test('order gift names match after normalization', () => {
  assert.equal(routeGift(config(), giftEvent('小心心！'))[0].kind, 'order');
  assert.equal(routeGift(config(), giftEvent('大心心')), null);
});

test('new installs order with 小心心 out of the box', () => {
  assert.deepEqual(defaultSettings().rules.order, [{ name: '小心心', min: 1, max: 1 }]);
  const a = defaultSettings();
  a.rules.order[0].name = '变了';
  assert.equal(defaultSettings().rules.order[0].name, '小心心');
});

test('saved order rows survive and normalize their ranges', () => {
  assert.deepEqual(sanitizeSettings({ rules: { order: [{ name: '灯牌', min: 5, max: 2 }] } }).rules.order, [{ name: '灯牌', min: 2, max: 5 }]);
});

test('a gift name stays in only one of the order, sabotage and helper tables', () => {
  const s = sanitizeSettings({ rules: { mess: [{ name: '小心心', min: 1, max: 1 }], order: [{ name: '小心心', min: 1, max: 1 }, { name: '棒棒糖', min: 1, max: 1 }] } });
  assert.deepEqual(s.rules.mess, [{ name: '小心心', min: 1, max: 1 }]);
  assert.deepEqual(s.rules.order, [{ name: '棒棒糖', min: 1, max: 1 }]);
});

test('settings saved before order gifts gain the default order row unless its name is already used', () => {
  assert.deepEqual(sanitizeSettings({ rules: { mess: [], help: [] } }).rules.order, [{ name: '小心心', min: 1, max: 1 }]);
  assert.deepEqual(sanitizeSettings({ rules: { mess: [{ name: '小心心', min: 1, max: 1 }], help: [] } }).rules.order, []);
  assert.deepEqual(sanitizeSettings({ rules: { mess: [], help: [], order: [] } }).rules.order, [], 'an emptied order table stays empty');
});

test('gift orders are not limited by the per-viewer order cap, chat orders still are', () => {
  const inbox = createInbox(() => ({ order: { perPerson: 1 }, cooking: {} }));
  inbox.accept({ kind: 'order', count: 3, uid: 'a', nick: '甲', via: 'gift' });
  assert.equal(inbox.orders.length, 3);
  assert.ok(inbox.orders.every(order => order.urges === 0));
  inbox.accept({ kind: 'order', count: 1, uid: 'a', nick: '甲' });
  assert.equal(inbox.orders.length, 3, 'a chat order from the same viewer only urges');
  assert.equal(inbox.orders[0].urges, 1);
});

test('live and simulated gifts deliver order specs that keep the gift marker', () => {
  const fired = [];
  const live = new Live(spec => { fired.push(spec); return true; }, config, {});
  assert.equal(live.onGift({ type: 'gift', giftName: '小心心', count: 2, nickName: '小明', eventId: 'e1' }), true);
  assert.equal(live.simGift('小心心', 1, '试玩观众'), true);
  assert.deepEqual(fired.map(({ kind, count, via, source }) => ({ kind, count, via, source })), [
    { kind: 'order', count: 2, via: 'gift', source: 'gift' },
    { kind: 'order', count: 1, via: 'gift', source: 'sim' }
  ]);
});

test('message inspection reports order gifts and names all three tables when nothing matches', () => {
  const json = value => JSON.stringify(value);
  const matched = inspectPortMessage(json({ type: 'gift', giftName: '小心心', count: 2, nickName: '小明' }), config(), () => 0);
  assert.equal(matched.status, 'matched');
  assert.deepEqual(matched.matches, [{ kind: 'order', count: 2 }]);
  assert.match(inspectPortMessage(json({ type: 'gift', giftName: '其他', count: 1 }), config()).reason, /点单.*捣乱.*帮忙/);
  const empty = config();
  empty.rules.mess = []; empty.rules.help = []; empty.rules.order = [];
  assert.match(inspectPortMessage(json({ type: 'gift', giftName: '小心心', count: 1 }), empty).reason, /礼物表.*空.*点单/);
});

test('example gifts fill only the empty tables with names that are not used elsewhere', () => {
  const fresh = fillExampleGifts({ pool: ['fire'], mess: [], help: [], order: [{ name: '小心心', min: 1, max: 1 }] });
  assert.deepEqual(fresh.order, [{ name: '小心心', min: 1, max: 1 }]);
  assert.deepEqual(fresh.mess, [{ name: '人气票', min: 1, max: 1 }]);
  assert.deepEqual(fresh.help, [{ name: '玫瑰', action: 'helper', min: 1, max: 1 }]);
  const blank = fillExampleGifts({ pool: [], mess: [], help: [], order: [] });
  assert.deepEqual(blank.order, [{ name: '小心心', min: 1, max: 1 }]);
  assert.deepEqual(blank.pool, ['fire'], 'an empty sabotage pool gets one entry so the example can fire');
  const taken = fillExampleGifts({ pool: ['cat'], mess: [{ name: '小心心', min: 1, max: 1 }], help: [], order: [] });
  assert.deepEqual(taken.order, [{ name: '人气票', min: 1, max: 1 }], 'skip a name already used for sabotage');
  assert.deepEqual(taken.mess, [{ name: '小心心', min: 1, max: 1 }]);
  assert.deepEqual(taken.pool, ['cat']);
});

test('白曜 order actions triggered by a gift are marked as gift orders, chat-triggered ones are not', async () => {
  const { specFromAction } = await import('../src/rules.js');
  const action = type => ({ action: 'order', value: 3, actionId: 'act-' + type, event: { eventId: 'e-' + type, type, user: { id: 'u1', nickname: '甲' }, ...(type === 'gift' ? { gift: { name: '嘉年华', count: 1 } } : { text: '点单' }) } });
  const fromGift = specFromAction(config(), action('gift'));
  assert.equal(fromGift.via, 'gift');
  assert.equal(fromGift.count, 3);
  assert.equal(specFromAction(config(), action('chat')).via, undefined);
  const inbox = createInbox(() => ({ order: { perPerson: 1 }, cooking: {} }));
  inbox.accept(fromGift);
  assert.equal(inbox.orders.length, 3, 'a gift-triggered 白曜 action brings every customer');
});
