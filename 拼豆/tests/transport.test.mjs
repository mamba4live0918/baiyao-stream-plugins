import test from 'node:test';
import assert from 'node:assert/strict';

const transportModule = await import('../src/transport.js').catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
  throw error;
});
const { createGiftTransport } = transportModule;

function makeEnvironment() {
  let clock = 0;
  let nextTimer = 0;
  const timers = new Map();
  const sockets = [];
  class FakeWebSocket {
    constructor(url) {
      this.url = url;
      this.readyState = 0;
      this.sent = [];
      this.closeCount = 0;
      sockets.push(this);
    }
    send(value) { this.sent.push(value); }
    close() { this.readyState = 3; this.closeCount++; }
    open() { this.readyState = 1; this.onopen?.(); }
    message(value) { this.onmessage?.({ data: JSON.stringify(value) }); }
    fail() { this.onerror?.(new Error('socket failed')); }
  }
  const root = {
    WebSocket: FakeWebSocket,
    setTimeout(fn, delay) {
      const id = ++nextTimer;
      timers.set(id, { fn, at: clock + delay, interval: 0 });
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
    setInterval(fn, delay) {
      const id = ++nextTimer;
      timers.set(id, { fn, at: clock + delay, interval: delay });
      return id;
    },
    clearInterval(id) { timers.delete(id); }
  };
  function advance(ms) {
    const end = clock + ms;
    for (let guard = 0; guard < 100; guard++) {
      const due = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      const [id, timer] = due;
      clock = timer.at;
      if (timer.interval) timer.at += timer.interval;
      else timers.delete(id);
      timer.fn();
    }
    clock = end;
  }
  return { root, sockets, timers, advance };
}

test('exports a transport that normalizes a host-shaped test gift', () => {
  assert.equal(typeof createGiftTransport, 'function');
  const gifts = [];
  const transport = createGiftTransport({ onGift: gift => gifts.push(gift) });
  assert.equal(transport.receiveTestGift({ nickName: '小观众', avatarUrl: '', giftName: '玫瑰', count: '2', giftIcon: '' }), true);
  assert.deepEqual(gifts, [{ name: '玫瑰', count: 2, nickname: '小观众' }]);
});

test('rejects invalid gift amounts instead of scaling effects unpredictably', () => {
  const gifts = [];
  const transport = createGiftTransport({ onGift: gift => gifts.push(gift) });
  for (const count of [0, -1, 1.5, '2.5', '1e2', '', null, true, 10001, {}, []]) {
    assert.equal(transport.receiveTestGift({ giftName: '玫瑰', count }), false, String(count));
  }
  assert.equal(transport.receiveTestGift({ giftName: '玫瑰' }), true);
  assert.equal(transport.receiveTestGift({ giftName: '玫瑰', count: 10000 }), true);
  assert.deepEqual(gifts.map(gift => gift.count), [1, 10000]);
});

test('uses the injected Songlan SDK without opening a second gift channel', () => {
  const env = makeEnvironment();
  const gifts = [];
  const statuses = [];
  let callback;
  env.root.SonglanPlugin = { onGift(fn) { callback = fn; } };
  const transport = createGiftTransport({ onGift: gift => gifts.push(gift), onStatus: status => statuses.push(status), root: env.root });
  transport.connect();
  transport.connect();
  assert.equal(env.sockets.length, 0);
  callback({ nickName: '观众', avatarUrl: '', giftName: '小心心', count: 3, giftIcon: '' });
  assert.deepEqual(gifts, [{ name: '小心心', count: 3, nickname: '观众' }]);
  assert.ok(statuses.includes('菘蓝已连接'));
  transport.disconnect();
  callback({ nickName: '观众', giftName: '小心心', count: 1 });
  assert.equal(gifts.length, 1);
});

test('fallback WebSocket identifies itself and accepts only gift messages', () => {
  const env = makeEnvironment();
  const gifts = [];
  const transport = createGiftTransport({ onGift: gift => gifts.push(gift), root: env.root });
  transport.connect();
  assert.equal(env.sockets.length, 1);
  const socket = env.sockets[0];
  assert.equal(socket.url, 'ws://localhost:9910');
  socket.open();
  assert.deepEqual(JSON.parse(socket.sent[0]), { action: 'identify', module: '自定义插件' });
  socket.message({ type: 'chat', giftName: '玫瑰', count: 1 });
  socket.message({ type: 'gift', nickName: '礼物观众', giftName: '玫瑰', count: 2, avatar: '', giftIcon: '' });
  socket.onmessage?.({ data: '{broken json' });
  assert.deepEqual(gifts, [{ name: '玫瑰', count: 2, nickname: '礼物观众' }]);
  transport.disconnect();
});

test('reconnects after socket errors and ignores stale messages', () => {
  const env = makeEnvironment();
  const gifts = [];
  const transport = createGiftTransport({ onGift: gift => gifts.push(gift), root: env.root });
  transport.connect();
  const first = env.sockets[0];
  const staleMessage = first.onmessage;
  first.fail();
  assert.equal(first.closeCount, 1);
  env.advance(3000);
  assert.equal(env.sockets.length, 2);
  staleMessage({ data: JSON.stringify({ type: 'gift', giftName: '旧消息', count: 1 }) });
  env.sockets[1].message({ type: 'gift', giftName: '新消息', count: 1 });
  assert.deepEqual(gifts, [{ name: '新消息', count: 1, nickname: '' }]);
  transport.disconnect();
  env.advance(10000);
  assert.equal(env.sockets.length, 2);
  assert.equal(env.timers.size, 0);
});

test('a late SDK takes over and closes the WebSocket fallback', () => {
  const env = makeEnvironment();
  const gifts = [];
  const transport = createGiftTransport({ onGift: gift => gifts.push(gift), root: env.root });
  transport.connect();
  const socket = env.sockets[0];
  const staleMessage = socket.onmessage;
  let callback;
  env.root.SonglanPlugin = { onGift(fn) { callback = fn; } };
  env.advance(500);
  assert.equal(socket.closeCount, 1);
  staleMessage({ data: JSON.stringify({ type: 'gift', giftName: '旧通道', count: 1 }) });
  callback({ giftName: 'SDK 通道', count: 1 });
  assert.deepEqual(gifts, [{ name: 'SDK 通道', count: 1, nickname: '' }]);
  transport.disconnect();
});
