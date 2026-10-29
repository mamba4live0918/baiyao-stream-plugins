import test from 'node:test';
import assert from 'node:assert/strict';
import { Live } from '../src/live.js';
import { createInbox } from '../src/inbox.js';
import { MESSAGE_TEST_PRESETS, decodePortMessage, inspectPortMessage } from '../src/live-message-test.js';

const config = () => ({ live: { receive: true }, shop: 'noodle', order: { enabled: true, keywords: ['点单'], perPerson: 1 }, rules: { pool: ['fire'], mess: [{ name: '小心心', min: 3, max: 3 }], help: [{ name: '玫瑰', action: 'helper', min: 2, max: 2 }] } });
const gift = (overrides = {}) => ({ type: 'gift', eventId: 'local-gift', nickName: '小明', userId: 'viewer-a', giftName: '小心心', count: 2, ...overrides });
const json = value => JSON.stringify(value);

test('the shared decoder normalizes confirmed flat port gifts and keeps ids and full quantities', () => {
  const decoded = decodePortMessage(json(gift({ count: 250001 })));
  assert.equal(decoded.status, 'valid');
  assert.equal(decoded.kind, 'gift');
  assert.deepEqual(decoded.event, { kind: 'gift', nick: '小明', uid: 'viewer-a', id: 'local-gift', gift: { name: '小心心', count: 250001 } });
  assert.equal(decodePortMessage(json(gift({ count: '2.9' }))).event.gift.count, 2, 'keep existing numeric coercion and flooring');
});

test('both source presets and chat example parse through the same documented port decoder', () => {
  assert.equal(MESSAGE_TEST_PRESETS.length, 3);
  const decoded = MESSAGE_TEST_PRESETS.map(item => decodePortMessage(item.json));
  assert.deepEqual(decoded.map(item => item.kind), ['gift', 'gift', 'comment']);
  assert.ok(decoded.every(item => item.status === 'valid'));
  assert.equal(decoded[0].event.gift.count, 2);
  assert.equal(decoded[1].event.gift.count, 2);
});

test('inspection reports the actual rule matches for multi-gifts without mutating settings', () => {
  const cfg = config(), before = structuredClone(cfg);
  const result = inspectPortMessage(json(gift()), cfg, () => 0);
  assert.equal(result.ok, true);
  assert.equal(result.status, 'matched');
  assert.deepEqual(result.matches, [{ kind: 'fire', count: 6 }]);
  assert.equal(result.event.uid, 'viewer-a');
  assert.equal(result.specs[0].count, 6);
  assert.deepEqual(cfg, before);
});

test('unmatched reasons separate an empty table, unknown gift and empty sabotage pool', () => {
  const cfg = config();
  assert.match(inspectPortMessage(json(gift({ giftName: '其他礼物' })), cfg).reason, /表外|不在.*礼物表/);
  cfg.rules.mess = []; cfg.rules.help = [];
  const empty = inspectPortMessage(json(gift()), cfg);
  assert.equal(empty.ok, true); assert.equal(empty.status, 'unmatched');
  assert.match(empty.reason, /礼物表.*空/);
  cfg.rules = config().rules; cfg.rules.pool = [];
  const pool = inspectPortMessage(json(gift()), cfg);
  assert.equal(pool.status, 'unmatched'); assert.match(pool.reason, /捣乱池.*空/);
  assert.deepEqual(inspectPortMessage(json(gift({ giftName: '玫瑰' })), cfg).matches, [{ kind: 'helper', count: 4 }]);
});

test('chat inspection identifies disabled ordering and unmatched keywords without exposing content to specs', () => {
  const cfg = config(), raw = { type: 'chat', eventId: 'chat-id', userId: 'viewer-b', nickName: '加 微 信', content: '点单' };
  const good = inspectPortMessage(json(raw), cfg);
  assert.equal(good.event.nick, '观众');
  assert.deepEqual(good.matches, [{ kind: 'order', count: 1 }]);
  assert.equal('content' in good.specs[0], false);
  assert.equal(inspectPortMessage(json({ ...raw, content: undefined, text: '点单' }), cfg).status, 'matched');
  assert.match(inspectPortMessage(json({ ...raw, content: '你好' }), cfg).reason, /口令/);
  cfg.order.enabled = false;
  assert.match(inspectPortMessage(json(raw), cfg).reason, /弹幕点单.*关闭/);
});

test('JSON and malformed quantities produce clear errors; zero and combo-end packets are ignored', () => {
  assert.equal(decodePortMessage('{bad').status, 'error');
  assert.match(decodePortMessage('{bad').reason, /JSON/);
  for (const raw of ['null', '[]', '42', '"text"']) assert.equal(decodePortMessage(raw).status, 'error');
  for (const count of [-1, 'oops', 0.1]) {
    const result = decodePortMessage(json(gift({ count })));
    assert.equal(result.status, 'error'); assert.match(result.reason, /数量/);
  }
  assert.match(decodePortMessage(json(gift({ giftName: '' }))).reason, /礼物名/);
  for (const fields of [{ count: 0 }, { count: '0' }, { effectiveGiftCount: 0 }, { count: 3, comboEnd: true }]) {
    const result = decodePortMessage(json(gift(fields)));
    assert.equal(result.status, 'ignored'); assert.match(result.reason, /0|结束|终止/);
  }
});

test('heartbeat, scene, unknown and action messages never become gameplay specs', () => {
  for (const raw of [{ action: 'heartbeat' }, { type: 'scene' }, { type: 'unknown', giftName: '小心心' }, { type: 'action', action: 'overtime', value: 999 }, { kind: 'overtime', count: 999 }, ['toolkit', 'gift-timeout', 'set-clock', 'add', 60]]) {
    const result = inspectPortMessage(json(raw), config());
    assert.ok(['ignored', 'error'].includes(result.status));
    assert.deepEqual(result.specs, []); assert.deepEqual(result.matches, []);
  }
});

test('default parse leaves real diagnostics, dedup, settings, timers and trigger untouched', () => {
  const cfg = config(), fired = [], notices = [];
  const env = { WebSocket() { throw Error('must never connect'); }, setTimeout() { throw Error('must never schedule'); }, setInterval() { throw Error('must never poll'); } };
  const live = new Live(spec => { fired.push(spec); return true; }, () => cfg, env, () => notices.push('update'));
  const before = json({ cfg, counts: live.counts, last: live.lastGift, matched: live.matchedGiftCount, seen: Object.fromEntries(Object.entries(live.seen).map(([k,v]) => [k,[...v]])) });
  const result = live.testMessage(json(gift()));
  assert.equal(result.status, 'matched'); assert.equal(result.played, false);
  assert.equal(fired.length, 0); assert.equal(notices.length, 0);
  assert.equal(json({ cfg, counts: live.counts, last: live.lastGift, matched: live.matchedGiftCount, seen: Object.fromEntries(Object.entries(live.seen).map(([k,v]) => [k,[...v]])) }), before);
});

test('explicit play uses only simulation specs and does not consume the subsequent real receipt', () => {
  const cfg = config(), fired = [];
  const live = new Live(spec => { fired.push(spec); return true; }, () => cfg, {});
  const text = json(gift()); live.testMessage(text);
  cfg.live.receive = false;
  const result = live.testMessage(text, { play: true });
  assert.equal(result.played, true);
  assert.deepEqual(fired.map(spec => [spec.kind, spec.count, spec.source]), [['fire', 6, 'sim']]);
  assert.equal(live.counts.gift, 0); assert.equal(live.lastGift, null); assert.equal(live.seen.gift.size, 0);
  cfg.live.receive = true; live.onGift(gift()); live.onGift(gift());
  assert.equal(live.counts.gift, 1); assert.equal(fired.length, 2);
  const blocked = live.testMessage(json({ type: 'action', action: 'overtime', value: 3 }), { play: true });
  assert.equal(blocked.played, false); assert.equal(fired.length, 2);
});

test('play reports its own random rule draw and reports refusal without claiming success', () => {
  const cfg = config(); cfg.rules.pool = ['fire', 'cat']; cfg.rules.mess[0] = { name: '小心心', min: 1, max: 1 };
  const fired = [], live = new Live(spec => { fired.push(spec); return true; }, () => cfg, {});
  assert.deepEqual(live.testMessage(json(gift()), { random: () => 0 }).matches, [{ kind: 'fire', count: 2 }]);
  const result = live.testMessage(json(gift()), { play: true, random: () => 0.9 });
  assert.deepEqual(result.matches, [{ kind: 'cat', count: 2 }]);
  assert.equal(fired[0].kind, 'cat');
  const refused = new Live(() => false, config, {}).testMessage(json(gift()), { play: true });
  assert.equal(refused.played, false); assert.match(refused.reason, /未.*接受|未.*执行/);
});

test('same nickname with different user ids remains separate in explicit comment play', () => {
  const cfg = config(), inbox = createInbox(() => cfg), live = new Live(spec => inbox.accept(spec), () => cfg, {});
  for (const userId of ['viewer-a', 'viewer-b']) {
    const result = live.testMessage(json({ type: 'chat', content: '点单', nickName: '小明', userId, eventId: 'test-' + userId }), { play: true });
    assert.equal(result.played, true);
  }
  assert.deepEqual(inbox.orders.map(order => order.uid), ['viewer-a', 'viewer-b']);
  assert.equal(live.counts.comment, 0); assert.equal(live.seen.comment.size, 0);
});

test('actual socket decoding and menu parsing agree for the same text without advancing menu receipt counts', () => {
  const cfg = config(), fired = []; let socket;
  class FakeSocket { constructor() { socket = this; } close() {} send() {} }
  const env = { WebSocket: FakeSocket, setTimeout: () => 1, clearTimeout() {}, setInterval: () => 2, clearInterval() {} };
  const live = new Live(spec => { fired.push(spec); return true; }, () => cfg, env);
  live.start();
  for (const [text, expected] of [[json(gift()), 1], [json(gift({ count: 0, eventId: 'zero' })), 1], ['{broken', 1], [json({ type: 'chat', content: '点单', eventId: 'order' }), 2]]) {
    const before = fired.length, result = live.testMessage(text);
    assert.equal(fired.length, before);
    socket.onmessage({ data: text });
    assert.equal(fired.length, expected);
    if (result.status === 'matched') assert.deepEqual(fired.at(-1).kind, result.matches[0].kind);
  }
  assert.deepEqual(live.counts, { gift: 1, comment: 1, action: 0 });
  live.stop();
});
