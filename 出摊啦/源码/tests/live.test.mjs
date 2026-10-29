import test from 'node:test';
import assert from 'node:assert/strict';
import { Live } from '../src/live.js';
import { normalizeGiftEvent, normalizeCommentEvent, routeGift, routeComment, specFromAction, drawTotal, poolSpecs, createEventId } from '../src/rules.js';
import { createInbox } from '../src/inbox.js';
import { safeName, isCompliant } from '../src/text.js';

const settings = () => ({
  live: { receive: true }, shop: 'noodle',
  order: { enabled: true, keywords: ['点单', '来一份'], perPerson: 1 },
  rules: { pool: ['fire', 'cat'], mess: [{ name: '小心心', min: 2, max: 2 }], help: [{ name: '掌声', action: 'helper', min: 3, max: 3 }] }
});

test('gift fields keep effective quantities and ignore combo-end summaries', () => {
  const ev = normalizeGiftEvent({ eventId: 'g1', data: { nickname: '小明', uid: 'u1', gift: { name: '小心心', count: 250001 } } });
  assert.equal(ev.gift.count, 250001);
  assert.equal(ev.id, 'g1');
  assert.equal(ev.nick, '小明');
  assert.equal(normalizeGiftEvent({ giftName: '小心心', count: 50, effectiveGiftCount: 2 }).gift.count, 2);
  assert.equal(normalizeGiftEvent({ giftName: '小心心', count: 3, comboEnd: true }), null);
  assert.equal(normalizeGiftEvent({ giftName: '小心心', count: 3, effectiveGiftCount: 0 }), null);
  for (const count of [-1, 0, NaN, Infinity, 'bad']) assert.equal(normalizeGiftEvent({ giftName: '小心心', count }), null);
});

test('nickname safety keeps hard filtering and strips direction controls', () => {
  assert.equal(safeName('小\u202e明\u200b'), '小明');
  assert.equal(safeName('加 微 信'), '观众');
  assert.equal(safeName('ＶＸ'), '观众');
  assert.equal(safeName('用户123456789'), '用户***');
  assert.equal(safeName('一三八一二三四五六七八'), '观众');
  assert.equal(isCompliant('https://example.com'), false);
});

test('comments match custom keywords and current shop while hiding raw content', () => {
  const cfg = settings();
  const ev = normalizeCommentEvent({ msgId: 'c1', data: { nickname: '加 微 信', userId: 'u1', content: '你好，点单！' } });
  assert.deepEqual(routeComment(cfg, ev), { kind: 'order', nick: '观众', uid: 'u1', id: 'c1', count: 1, source: 'comment' });
  assert.equal(routeComment(cfg, normalizeCommentEvent({ content: '你好' })), null);
  assert.equal(routeComment(cfg, normalizeCommentEvent({ content: '想吃面条' })).kind, 'order');
  assert.equal(routeComment(cfg, normalizeCommentEvent({ content: '奶茶' })), null);
  cfg.order.enabled = false;
  assert.equal(routeComment(cfg, ev), null);
});

test('default order phrases reject casual chat and match complete shop phrases', () => {
  const cfg = settings();
  delete cfg.order.keywords;
  for (const content of ['见面了', '外面好冷', '来个人', '面', '面条']) {
    assert.equal(routeComment(cfg, normalizeCommentEvent({ content })), null, content);
  }
  for (const content of ['来碗面', '点单', '来一份', '来一碗', '来一杯', '来一盘', '吃面', '一碗面', '来份面']) {
    assert.equal(routeComment(cfg, normalizeCommentEvent({ content }))?.kind, 'order', content);
  }
  for (const [shop, accepted, rejected] of [
    ['pancake', ['煎饼'], ['饼']],
    ['tea', ['奶茶'], ['珍珠', '茶']],
    ['sushi', ['生鱼片', '刺身'], ['鱼片', '鱼']]
  ]) {
    cfg.shop = shop;
    for (const content of accepted) assert.equal(routeComment(cfg, normalizeCommentEvent({ content }))?.kind, 'order', content);
    for (const content of rejected) assert.equal(routeComment(cfg, normalizeCommentEvent({ content })), null, content);
  }
});

test('gift routing uses configured names only and preserves large totals', () => {
  const cfg = settings();
  const ev = normalizeGiftEvent({ eventId: 'g2', giftName: '❤ 小 心 心', count: 250001, nickname: '小明' });
  const routed = routeGift(cfg, ev, () => 0);
  assert.deepEqual(routed, [{ kind: 'fire', nick: '小明', uid: '', id: 'g2', count: 500002, source: 'gift' }]);
  assert.deepEqual(routeGift(cfg, normalizeGiftEvent({ eventId: 'g3', giftName: '掌声', count: 2 })), [{ kind: 'helper', nick: '观众', uid: '', id: 'g3', count: 6, source: 'gift' }]);
  assert.equal(routeGift(cfg, normalizeGiftEvent({ giftName: '未知礼物' })), null);
  cfg.rules.pool = [];
  assert.equal(routeGift(cfg, ev), null);
});

test('random range endpoints and pooled large quantities conserve every event', () => {
  assert.equal(drawTotal(2, 4, 3, () => 0), 6);
  assert.equal(drawTotal(4, 2, 3, () => 0.999), 12);
  assert.equal(drawTotal(4, 4, 300000), 1200000);
  let n = 0;
  const result = poolSpecs(settings(), 500003, { nick: '小明', uid: 'u1' }, 'gift', () => (++n % 3) / 3);
  assert.equal(result.reduce((sum, spec) => sum + spec.count, 0), 500003);
  assert.ok(result.every(spec => spec.count > 0 && ['fire', 'cat'].includes(spec.kind)));
});

test('Baiyao actions normalize identity, repeat and fractional overtime minutes', () => {
  assert.deepEqual(specFromAction(settings(), { actionId: 'a1', action: 'guard', value: 3, repeat: 4, event: { user: { nickname: '小明', id: 'u1' } } }), { kind: 'guard', nick: '小明', uid: 'u1', id: 'a1', count: 12, source: 'action' });
  assert.equal(specFromAction(settings(), { action: 'overtime', value: 0.5, repeat: 2 }).count, 1);
  assert.equal(specFromAction(settings(), { action: 'unknown' }), null);
  assert.equal(specFromAction(settings(), { action: 'fire', value: -1 }), null);
});

test('dedup namespaces are independent and disabled reception does not consume IDs', () => {
  const cfg = settings(), fired = [];
  const live = new Live(spec => { fired.push(spec); return true; }, () => cfg);
  const gift = { eventId: 'shared', giftName: '掌声', count: 1 };
  const comment = { eventId: 'shared', nickname: '小明', content: '点单' };
  const action = { actionId: 'shared', action: 'guard' };
  cfg.live.receive = false;
  live.onGift(gift); live.onComment(comment); live.onAction(action);
  assert.equal(fired.length, 1);
  cfg.live.receive = true;
  for (let i = 0; i < 2; i++) { live.onGift(gift); live.onComment(comment); live.onAction(action); }
  assert.deepEqual(fired.map(spec => spec.kind), ['guard', 'helper', 'order']);
  assert.deepEqual(fired.map(spec => spec.id), ['shared', 'shared', 'shared']);
  assert.deepEqual(live.counts, { gift: 1, comment: 1, action: 1 });
});

test('anonymous comment replay dedups while filtered names retain separate order slots', () => {
  const cfg = settings(), inbox = createInbox(() => cfg);
  const live = new Live(spec => inbox.accept(spec), () => cfg);
  const first = { eventId: 'anonymous-a', nickname: '加 微 信', content: '点单' };
  assert.equal(live.onComment(first), true);
  assert.equal(live.onComment(first), false);
  assert.equal(live.onComment({ eventId: 'anonymous-b', nickname: 'ＶＸ', content: '点单' }), true);
  assert.equal(inbox.orders.length, 2);
  assert.deepEqual(inbox.orders.map(order => [order.id, order.nick, order.urges]), [['anonymous-a', '观众', 0], ['anonymous-b', '观众', 0]]);
});

test('empty uid aliases do not hide a valid later uid field', () => {
  const event = normalizeCommentEvent({ eventId: 'alias-id', userId: '', uid: 'real-user', nickname: '甲', content: '点单' });
  assert.equal(event.uid, 'real-user');
  const nested = normalizeCommentEvent({ userId: '', uid: '', user: { id: '', uid: 'nested-user' }, content: '点单' });
  assert.equal(nested.uid, 'nested-user');
});

test('real uid keeps its per-person cap across comments and actions', () => {
  const cfg = settings(), inbox = createInbox(() => cfg);
  const live = new Live(spec => inbox.accept(spec), () => cfg);
  live.onComment({ eventId: 'comment-order', uid: 'u1', nickname: '甲', content: '点单' });
  live.onAction({ action: 'order', event: { eventId: 'action-order', user: { id: 'u1', nickname: '乙' } } });
  live.onAction({ action: 'order', event: { eventId: 'action-order', user: { id: 'u1', nickname: '乙' } } });
  assert.equal(inbox.orders.length, 1);
  assert.equal(inbox.orders[0].uid, 'u1');
  assert.equal(inbox.orders[0].urges, 1);
});

test('anonymous comment and action ids cannot collide across sources', () => {
  const cfg = settings(), inbox = createInbox(() => cfg);
  const live = new Live(spec => inbox.accept(spec), () => cfg);
  live.onComment({ eventId: 'shared-order', content: '点单' });
  live.onAction({ actionId: 'shared-order', action: 'order' });
  assert.equal(inbox.orders.length, 2);
});

test('simulation bypasses live switch and never mutates the supplied spec', () => {
  const cfg = settings(), fired = [];
  cfg.live.receive = false;
  const live = new Live(spec => { fired.push(spec); return true; }, () => cfg);
  const original = Object.freeze({ kind: 'order', nick: '加 微信', count: 50, source: 'action' });
  assert.equal(live.sim(original), true);
  assert.equal(live.simGift('掌声', 2, '小明'), true);
  assert.equal(original.source, 'action');
  assert.equal(fired[0].nick, '观众');
  assert.deepEqual(fired.map(spec => [spec.count, spec.source]), [[50, 'sim'], [6, 'sim']]);
});

test('simulated anonymous customers get fresh ids instead of nickname identities', () => {
  const cfg = settings(), inbox = createInbox(() => cfg), fired = [];
  const live = new Live(spec => { fired.push(spec); return inbox.accept(spec); }, () => cfg);
  live.sim({ kind: 'order', nick: '测试观众' });
  live.sim({ kind: 'order', nick: '测试观众' });
  live.simGift('掌声', 1, '测试观众');
  live.simGift('掌声', 1, '测试观众');
  assert.equal(inbox.orders.length, 2);
  assert.equal(new Set(fired.map(spec => spec.id)).size, 4);
  assert.ok(fired.every(spec => spec.id && spec.uid === ''));
});

test('event id fallback remains unique when host crypto is unavailable', () => {
  const env = { crypto: { randomUUID() { throw Error('unavailable'); } } };
  const ids = Array.from({ length: 100 }, () => createEventId(env));
  assert.equal(new Set(ids).size, 100);
  assert.ok(ids.every(id => typeof id === 'string' && id.length > 0));
});

test('late comment injection binds independently; start is idempotent and stop disables callbacks', () => {
  const callbacks = {}, timers = new Map(), fired = [];
  let timerId = 0, giftsBound = 0, commentsBound = 0;
  const env = {
    setInterval(fn) { const id = ++timerId; timers.set(id, fn); return id; },
    clearInterval(id) { timers.delete(id); },
    SonglanPlugin: { onGift(fn) { giftsBound++; callbacks.gift = fn; } },
    BaiyaoPlugin: { onAction(fn) { callbacks.action = fn; return () => { delete callbacks.action; }; } }
  };
  const live = new Live(spec => { fired.push(spec); return true; }, settings, env);
  live.start(); live.start();
  assert.equal(timers.size, 1);
  assert.equal(giftsBound, 1);
  env.SonglanPlugin.onComment = fn => { commentsBound++; callbacks.comment = fn; };
  for (const fn of [...timers.values()]) fn();
  assert.equal(commentsBound, 1);
  assert.equal(timers.size, 0);
  callbacks.comment({ content: '点单' });
  assert.equal(fired.length, 1);
  const oldComment = callbacks.comment;
  live.stop(); oldComment({ content: '点单' });
  assert.equal(fired.length, 1);
  live.start(); oldComment({ content: '点单' });
  assert.equal(fired.length, 1);
  callbacks.comment({ content: '点单' });
  assert.equal(fired.length, 2);
  assert.equal(commentsBound, 2);
  live.stop();
});
