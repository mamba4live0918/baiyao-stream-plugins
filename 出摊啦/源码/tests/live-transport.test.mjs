import test from 'node:test';
import assert from 'node:assert/strict';
import { Live } from '../src/live.js';

const settings = () => ({ live: { receive: true }, shop: 'noodle', order: { enabled: true, keywords: ['点单'] }, rules: { pool: ['fire'], mess: [{ name: '小心心', min: 1, max: 1 }], help: [] } });
const gift = (id = 'g1') => ({ type: 'gift', eventId: id, nickName: '小明', userId: 'u1', giftName: '小心心', count: 2 });
const chat = (id = 'c1') => ({ type: 'chat', eventId: id, user: { id: 'u1', nickname: '小明' }, text: '点单' });

// All sockets below are inert JS objects. No real WebSocket or network is used.
function harness(options = {}) {
  let time = 0, serial = 0;
  const jobs = new Map(), sockets = [], fired = [], updates = [];
  const cfg = settings();
  const schedule = (fn, ms, interval = false) => { const id = ++serial; jobs.set(id, { fn, at: time + ms, interval: interval ? ms : 0 }); return id; };
  class FakeSocket {
    constructor(url) { this.url = url; this.readyState = 0; this.sent = []; sockets.push(this); }
    open() { this.readyState = 1; this.onopen?.({}); }
    receive(value) { this.onmessage?.({ data: typeof value === 'string' ? value : JSON.stringify(value) }); }
    fail() { this.readyState = 3; this.onerror?.({}); this.onclose?.({}); }
    close() { this.readyState = 3; this.onclose?.({}); }
    send(value) { this.sent.push(JSON.parse(value)); }
  }
  const env = {
    WebSocket: FakeSocket,
    setTimeout: (fn, ms) => schedule(fn, ms), clearTimeout: id => jobs.delete(id),
    setInterval: (fn, ms) => schedule(fn, ms, true), clearInterval: id => jobs.delete(id)
  };
  const live = new Live(spec => { fired.push(spec); return true; }, () => cfg, env, value => updates.push({ status: value.status(), gift: value.counts.gift }), options);
  function advance(ms) {
    const until = time + ms;
    for (let steps = 0; steps < 10000; steps++) {
      const next = [...jobs].filter(([,job]) => job.at <= until).sort((a,b) => a[1].at - b[1].at)[0];
      if (!next) { time = until; return; }
      const [id, job] = next; time = job.at;
      if (job.interval) job.at += job.interval; else jobs.delete(id);
      job.fn();
    }
    throw Error('fake timer loop did not settle');
  }
  return { live, env, cfg, fired, sockets, jobs, updates, advance };
}

function preloadSdk() {
  const handlers = { gift: [], chat: [], action: [], comment: [] };
  const sdk = {};
  for (const type of ['gift', 'chat', 'comment']) sdk['on' + type[0].toUpperCase() + type.slice(1)] = fn => { handlers[type].push(fn); };
  return { handlers, sdk, baiyao: { ...sdk, onAction: fn => handlers.action.push(fn) } };
}

test('preload SDK contract binds one onGift and onChat, leaving alias methods unsubscribed', () => {
  const h = harness(), p = preloadSdk();
  h.env.SonglanPlugin = p.sdk; h.env.BaiyaoPlugin = p.baiyao;
  h.live.start();
  assert.equal(p.handlers.gift.length, 1);
  assert.equal(p.handlers.chat.length, 1);
  assert.equal(p.handlers.comment.length, 0);
  assert.equal(h.sockets.length, 0);
  p.handlers.gift[0](gift()); p.handlers.chat[0](chat()); p.handlers.action[0]({ actionId: 'a1', action: 'guard' });
  assert.deepEqual(h.fired.map(x => x.kind), ['fire', 'order', 'guard']);
  assert.ok(h.updates.some(x => x.gift === 1));
  h.live.stop(); assert.equal(h.jobs.size, 0);
});

test('Baiyao-only SDK delivers gifts and legacy onComment without requiring Songlan', () => {
  const h = harness(), callbacks = {};
  h.env.BaiyaoPlugin = { onGift: fn => { callbacks.gift = fn; }, onComment: fn => { callbacks.comment = fn; } };
  h.live.start();
  assert.equal(typeof callbacks.gift, 'function');
  assert.equal(typeof callbacks.comment, 'function');
  callbacks.gift(gift()); callbacks.comment({ content: '点单', nickname: '小明' });
  assert.deepEqual(h.fired.map(x => x.kind), ['fire', 'order']);
  assert.equal(h.sockets.length, 0, 'missing onAction alone must not open a gift socket');
  h.live.stop();
});

test('SDK registration that throws does not leave a live callback or prevent the other SDK', () => {
  const h = harness(); let abandoned, good;
  h.env.SonglanPlugin = { onGift(fn) { abandoned = fn; throw Error('not ready'); } };
  h.env.BaiyaoPlugin = { onGift(fn) { good = fn; }, onChat() {} };
  h.live.start();
  assert.equal(typeof good, 'function');
  abandoned(gift('old')); good(gift('new'));
  assert.equal(h.fired.length, 1);
  assert.equal(h.fired[0].id, 'new');
  h.live.stop();
});

test('no SDK starts the 9910 fallback and accepts only known gift/chat packets', () => {
  const h = harness(); h.live.start();
  assert.equal(h.sockets[0]?.url, 'ws://localhost:9910');
  assert.match(h.live.status(), /连接中.*9910/);
  const socket = h.sockets[0]; socket.open();
  assert.match(h.live.status(), /已连接.*9910/);
  assert.deepEqual(socket.sent, [{ action: 'identify', module: '出摊啦' }]);
  for (const raw of ['bad json', 'null', '[]', { type: 'heartbeat' }, { type: 'scene', giftName: '小心心' }, { type: 'action', action: 'fire' }, { giftName: '小心心' }]) socket.receive(raw);
  socket.receive(gift()); socket.receive(chat()); socket.receive(gift());
  assert.deepEqual(h.fired.map(x => x.kind), ['fire', 'order']);
  assert.deepEqual(h.live.counts, { gift: 1, comment: 1, action: 0 });
  h.live.stop();
});

test('first port failure rotates to 10030 after 3 seconds and retries back to 9910', () => {
  const h = harness(); h.live.start();
  assert.equal(h.sockets.length, 1);
  h.sockets[0].fail();
  assert.match(h.live.status(), /等待本机礼物服务.*10030/);
  h.advance(2999); assert.equal(h.sockets.length, 1);
  h.advance(1); assert.equal(h.sockets[1].url, 'ws://localhost:10030');
  h.sockets[1].fail();
  h.advance(5999); assert.equal(h.sockets.length, 2);
  h.advance(1); assert.equal(h.sockets[2].url, 'ws://localhost:9910');
  assert.equal(h.sockets.filter(s => s.readyState < 2).length, 1);
  h.live.stop(); assert.equal(h.jobs.size, 0);
});

test('connection deadline releases CONNECTING socket and stale callbacks cannot deliver', () => {
  const h = harness(); h.live.start();
  assert.equal(h.sockets.length, 1);
  const old = h.sockets[0], lateOpen = old.onopen, lateMessage = old.onmessage;
  h.advance(8000); assert.equal(old.readyState, 3);
  h.advance(3000); assert.equal(h.sockets[1].url, 'ws://localhost:10030');
  lateOpen({}); lateMessage({ data: JSON.stringify(gift('stale')) });
  assert.equal(old.sent.length, 0);
  assert.equal(h.fired.length, 0);
  h.sockets[1].open(); h.sockets[1].receive(gift('current'));
  assert.equal(h.fired.length, 1);
  h.live.stop();
});

test('failure backoff reaches but never exceeds 30 seconds and open resets it', () => {
  const h = harness(); h.live.start();
  assert.equal(h.sockets.length, 1);
  for (const delay of [3000, 6000, 12000, 24000, 30000, 30000]) {
    const size = h.sockets.length;
    h.sockets.at(-1).fail(); h.advance(delay - 1);
    assert.equal(h.sockets.length, size);
    h.advance(1); assert.equal(h.sockets.length, size + 1);
  }
  h.sockets.at(-1).open(); h.sockets.at(-1).fail();
  const size = h.sockets.length; h.advance(3000);
  assert.equal(h.sockets.length, size + 1);
  h.live.stop();
});

test('late SDK takes over each kind separately and preserves event ID dedup across transports', () => {
  const h = harness(), callbacks = {};
  h.live.start(); assert.equal(h.sockets.length, 1);
  const socket = h.sockets[0]; socket.open(); socket.receive(gift('same'));
  h.env.SonglanPlugin = { onGift: fn => { callbacks.gift = fn; } };
  h.advance(1500); callbacks.gift(gift('same'));
  socket.receive(gift('covered')); socket.receive(chat());
  assert.deepEqual(h.fired.map(x => x.kind), ['fire', 'order']);
  assert.equal(socket.readyState, 1, 'WS must cover the missing chat SDK');
  h.env.SonglanPlugin.onChat = fn => { callbacks.chat = fn; };
  h.advance(1500); assert.equal(socket.readyState, 3);
  callbacks.chat(chat()); callbacks.gift(gift('fresh'));
  assert.deepEqual(h.fired.map(x => x.kind), ['fire', 'order', 'fire']);
  h.advance(60000); assert.equal(h.sockets.length, 1);
  h.live.stop();
});

test('refresh closes fallback when reception is disabled and does not consume event IDs', () => {
  const h = harness(); h.live.start(); assert.equal(h.sockets.length, 1);
  const socket = h.sockets[0]; socket.open(); const late = socket.onmessage;
  h.cfg.live.receive = false; h.live.refresh();
  assert.equal(socket.readyState, 3);
  late({ data: JSON.stringify(gift()) }); h.live.onGift(gift());
  h.advance(60000); assert.equal(h.sockets.length, 1); assert.equal(h.live.counts.gift, 0);
  h.cfg.live.receive = true; h.live.refresh();
  assert.equal(h.sockets.length, 2);
  h.sockets[1].open(); h.sockets[1].receive(gift());
  assert.equal(h.fired.length, 1); h.live.stop();
});

test('stop cancels every timer and permanently rejects old SDK and socket callbacks after restart', () => {
  const h = harness(), old = {}, current = {};
  h.env.SonglanPlugin = { onGift: fn => { current.gift = fn; } };
  h.env.BaiyaoPlugin = { onAction: fn => { current.action = fn; } };
  h.live.start(); assert.equal(h.sockets.length, 1);
  Object.assign(old, current); old.message = h.sockets[0].onmessage; old.open = h.sockets[0].onopen;
  h.live.stop(); assert.equal(h.jobs.size, 0);
  h.live.start();
  old.gift(gift('old')); old.action({ action: 'fire', actionId: 'old' });
  old.open({}); old.message({ data: JSON.stringify(chat('old')) });
  assert.equal(h.fired.length, 0);
  current.gift(gift('new')); current.action({ action: 'guard', actionId: 'new' });
  assert.deepEqual(h.fired.map(x => x.kind), ['fire', 'guard']);
  h.live.stop(); assert.equal(h.jobs.size, 0);
});

test('unmatched and matched gifts publish sanitized diagnostics without changing rule behavior', () => {
  const h = harness();
  h.live.onGift({ giftName: '加 微信', count: 5, eventId: 'unknown' });
  assert.deepEqual(h.live.lastGift, { name: '观众', count: 5, matched: false, applied: false });
  assert.equal(h.live.matchedGiftCount, 0);
  assert.match(h.live.status(), /最近礼物：观众×5.*未触发/);
  assert.equal(h.fired.length, 0);
  h.live.onGift(gift());
  assert.deepEqual(h.live.lastGift, { name: '小心心', count: 2, matched: true, applied: true });
  assert.equal(h.live.matchedGiftCount, 1);
  assert.match(h.live.status(), /已收礼物[：:]?\s*2/);
  assert.ok(h.updates.some(x => x.gift === 2));
  h.cfg.rules.pool = []; h.live.onGift(gift('empty-pool'));
  assert.equal(h.live.lastGift.applied, false);
  assert.match(h.live.status(), /未触发.*礼物表.*捣乱池/);
});

test('fallback opt-out, disabled reception and missing timer APIs never create sockets', () => {
  const trial = harness({ fallback: false }); trial.live.start(); assert.equal(trial.sockets.length, 0); trial.live.stop();
  const disabled = harness(); disabled.cfg.live.receive = false; disabled.live.start(); assert.equal(disabled.sockets.length, 0); disabled.live.stop();
  const noTimeout = harness(); delete noTimeout.env.setTimeout; noTimeout.live.start(); assert.equal(noTimeout.sockets.length, 0); noTimeout.live.stop();
  const absent = new Live(() => true, settings, {});
  assert.doesNotThrow(() => { absent.start(); absent.refresh(); absent.stop(); });
});

test('malformed SDK inputs and broken diagnostic callback do not throw into the host', () => {
  const live = new Live(() => true, settings, {}, () => { throw Error('settings UI gone'); });
  for (const raw of [null, [], 'bad', { giftName: '小心心', count: Symbol('bad') }, { get data() { throw Error('bad payload'); } }]) {
    assert.doesNotThrow(() => { live.onGift(raw); live.onComment(raw); live.onAction(raw); });
  }
  assert.doesNotThrow(() => live.onGift(gift()));
  assert.equal(live.counts.gift, 1);
});
