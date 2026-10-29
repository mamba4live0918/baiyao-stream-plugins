const test = require('node:test');
const assert = require('node:assert/strict');

const { normalize, connect } = require('../src/bridge.js');

// Protocol evidence from Songlan 4.0.5:
// - runtime/plugin-viewer.html:73-80 exposes onChat/onGift/onMember/onFollow/onLike.
// - runtime/plugin-viewer.html:169-205 connects to HTTP port + 828 (normally 9910),
//   identifies as {action:'identify',module:'自定义插件'}, and dispatches chat/gift.
// - runtime/js/barrage.js:526 emits chat {type,nickName,content,avatar}.
// - runtime/js/barrage.js:540 emits gift {type,nickName,giftName,count,avatar,giftIcon}.
// The raw protobuf User contains id/idStr/secUid, but the 4.0.5 dispatch payload omits them.

function createClock() {
  let nextId = 1;
  const tasks = new Map();
  return {
    setTimeout(fn, delay) {
      const id = nextId++;
      tasks.set(id, { fn, delay });
      return id;
    },
    clearTimeout(id) { tasks.delete(id); },
    runDelay(delay) {
      const match = [...tasks].find(([, task]) => task.delay === delay);
      assert.ok(match, `expected a ${delay}ms timer`);
      tasks.delete(match[0]);
      match[1].fn();
    },
    count(delay) {
      return [...tasks.values()].filter(task => delay === undefined || task.delay === delay).length;
    }
  };
}

function createWebSocketHarness() {
  const instances = [];
  class FakeWebSocket {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSED = 3;
    constructor(url) {
      this.url = url;
      this.readyState = FakeWebSocket.CONNECTING;
      this.sent = [];
      this.closeCalls = 0;
      instances.push(this);
    }
    send(value) { this.sent.push(value); }
    open() {
      this.readyState = FakeWebSocket.OPEN;
      if (this.onopen) this.onopen();
    }
    receive(value) {
      if (this.onmessage) this.onmessage({ data: value });
    }
    fail() {
      if (this.onerror) this.onerror(new Error('socket failed'));
    }
    close() {
      this.closeCalls++;
      this.readyState = FakeWebSocket.CLOSED;
      if (this.onclose) this.onclose();
    }
  }
  return { FakeWebSocket, instances };
}

function createSdk() {
  const handlers = { chat: [], gift: [] };
  return {
    handlers,
    onChat(fn) { handlers.chat.push(fn); },
    onGift(fn) { handlers.gift.push(fn); }
  };
}

test('normalize prefers an explicit stable identity and removes boundary whitespace', () => {
  const event = normalize({
    type: 'chat',
    user: { idStr: ' 00123 ' },
    nickName: '旅人甲',
    content: '登记',
    avatar: 'https://local/avatar-a',
    eventId: 'evt-1'
  });
  assert.deepEqual(event, {
    type: 'chat',
    userId: '00123',
    nickname: '旅人甲',
    text: '登记',
    eventId: 'evt-1',
    identityKind: 'stable'
  });
});

test('normalize never treats top-level id, eventId, or msgId as a user id', () => {
  const raw = { type: 'chat', id: 'not-user', eventId: 'event-7', msgId: 'message-7', nickName: '同名', avatar: 'a', content: '登记' };
  assert.equal(normalize(raw, undefined, 'strict'), null);
  const event = normalize(raw, undefined, 'display');
  assert.equal(event.identityKind, 'display');
  assert.equal(event.eventId, 'event-7');
  assert.notEqual(event.userId, 'not-user');
  assert.notEqual(event.userId, 'event-7');
  assert.notEqual(event.userId, 'message-7');
});

test('normalize accepts safe integer uid and rejects unsafe numeric uid', () => {
  assert.equal(normalize({ type: 'chat', uid: 9007199254740991, nickName: '甲', content: 'x' }, undefined, 'strict').userId, '9007199254740991');
  assert.equal(normalize({ type: 'chat', uid: 9007199254740992, nickName: '甲', content: 'x' }, undefined, 'strict'), null);
});

test('display identity is deterministic, bounded, and distinguishes field boundaries', () => {
  const a1 = normalize({ type: 'chat', nickName: 'ab', avatar: 'c', content: 'x' }, undefined, 'display');
  const a2 = normalize({ type: 'chat', nickName: 'ab', avatar: 'c', content: 'y' }, undefined, 'display');
  const sameNameDifferentAvatar = normalize({ type: 'chat', nickName: 'ab', avatar: 'different', content: 'x' }, undefined, 'display');
  const b = normalize({ type: 'chat', nickName: 'a', avatar: 'bc', content: 'x' }, undefined, 'display');
  assert.equal(a1.userId, a2.userId);
  assert.notEqual(a1.userId, sameNameDifferentAvatar.userId);
  assert.notEqual(a1.userId, b.userId);
  assert.equal(a1.userId, 'display:["ab","c"]');
  assert.equal(a1.identityKind, 'display');
});

test('stable identity wins over display identity in display mode', () => {
  const event = normalize({ type: 'gift', secUid: 'sec-9', nickName: '甲', avatar: 'a', giftName: '星尘', count: 3 }, undefined, 'display');
  assert.deepEqual(event, {
    type: 'gift',
    userId: 'sec-9',
    nickname: '甲',
    text: '星尘',
    count: 3,
    identityKind: 'stable'
  });
});

test('normalize rejects empty or oversized names, oversized avatars, and unknown event types', () => {
  assert.equal(normalize({ type: 'chat', nickName: '', avatar: 'a', content: 'x' }, undefined, 'display'), null);
  assert.equal(normalize({ type: 'chat', nickName: 'n'.repeat(129), avatar: 'a', content: 'x' }, undefined, 'display'), null);
  assert.equal(normalize({ type: 'chat', nickName: 'n', avatar: 'a'.repeat(2049), content: 'x' }, undefined, 'display'), null);
  assert.equal(normalize({ type: 'like', nickName: 'n', avatar: 'a' }, undefined, 'display'), null);
});

test('connect uses an available SDK as the only transport', () => {
  const sdk = createSdk();
  const clock = createClock();
  const { FakeWebSocket, instances } = createWebSocketHarness();
  const events = [];
  const statuses = [];
  const bridge = connect({
    onEvent: event => events.push(event),
    onStatus: status => statuses.push(status),
    environment: { SonglanPlugin: sdk, WebSocket: FakeWebSocket, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout }
  });

  assert.equal(instances.length, 0);
  assert.equal(statuses.at(-1).state, 'connected');
  assert.equal(statuses.at(-1).transport, 'sdk');
  sdk.handlers.chat[0]({ nickName: '访客', avatar: 'avatar-a', content: '登记' });
  sdk.handlers.gift[0]({ nickName: '访客', avatar: 'avatar-a', giftName: '星尘', count: 2 });
  assert.deepEqual(events.map(event => event.type), ['chat', 'gift']);
  assert.equal(typeof bridge.stop, 'function');
  bridge.stop();
});

test('strict mode reports missing identity instead of emitting an event', () => {
  const sdk = createSdk();
  const statuses = [];
  const events = [];
  const bridge = connect({
    identityMode: 'strict',
    onEvent: event => events.push(event),
    onStatus: status => statuses.push(status),
    environment: { SonglanPlugin: sdk }
  });
  sdk.handlers.chat[0]({ nickName: '访客', avatar: 'avatar-a', content: '登记' });
  assert.equal(events.length, 0);
  assert.equal(statuses.at(-1).state, 'missing-identity');
  assert.equal(statuses.at(-1).transport, 'sdk');
  bridge.stop();
});

test('connect falls back to WebSocket, sends identify, and rejects unknown message types', () => {
  const clock = createClock();
  const { FakeWebSocket, instances } = createWebSocketHarness();
  const events = [];
  const statuses = [];
  const environment = { WebSocket: FakeWebSocket, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout };
  const bridge = connect({ onEvent: event => events.push(event), onStatus: status => statuses.push(status), environment });

  clock.runDelay(300);
  assert.equal(instances.length, 1);
  assert.equal(instances[0].url, 'ws://localhost:9910/');
  instances[0].open();
  assert.deepEqual(JSON.parse(instances[0].sent[0]), { action: 'identify', module: '自定义插件' });
  instances[0].receive(JSON.stringify({ type: 'member', nickName: '访客', avatar: 'a' }));
  instances[0].receive(JSON.stringify({ type: 'chat', nickName: '访客', avatar: 'a', content: '登记' }));
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'chat');
  assert.equal(statuses.at(-1).state, 'connected');
  bridge.stop();
});

test('a late SDK closes WebSocket and becomes the sole active transport', () => {
  const clock = createClock();
  const { FakeWebSocket, instances } = createWebSocketHarness();
  const environment = { WebSocket: FakeWebSocket, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout };
  const events = [];
  const bridge = connect({ onEvent: event => events.push(event), environment });
  clock.runDelay(300);
  instances[0].open();

  const sdk = createSdk();
  environment.SonglanPlugin = sdk;
  clock.runDelay(100);
  assert.equal(instances[0].closeCalls, 1);
  instances[0].receive(JSON.stringify({ type: 'chat', nickName: '旧通道', avatar: 'a', content: '登记' }));
  sdk.handlers.chat[0]({ nickName: '新通道', avatar: 'b', content: '登记' });
  assert.equal(events.length, 1);
  assert.equal(events[0].nickname, '新通道');
  bridge.stop();
});

test('stop makes retained SDK callbacks inert', () => {
  const sdk = createSdk();
  const events = [];
  const bridge = connect({ onEvent: event => events.push(event), environment: { SonglanPlugin: sdk } });
  bridge.stop();
  sdk.handlers.chat[0]({ nickName: '访客', avatar: 'a', content: '登记' });
  assert.equal(events.length, 0);
});

test('WebSocket errors report failure, reconnect after three seconds, and stop cancels reconnect', () => {
  const clock = createClock();
  const { FakeWebSocket, instances } = createWebSocketHarness();
  const statuses = [];
  const bridge = connect({
    onEvent() {},
    onStatus: status => statuses.push(status),
    environment: { WebSocket: FakeWebSocket, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout }
  });
  clock.runDelay(300);
  instances[0].fail();
  assert.equal(statuses.at(-1).state, 'error');
  assert.equal(clock.count(3000), 1);
  bridge.stop();
  assert.equal(clock.count(3000), 0);
});

test('connect rejects non-local WebSocket URLs without opening a socket', () => {
  const { FakeWebSocket, instances } = createWebSocketHarness();
  const statuses = [];
  const bridge = connect({
    onEvent() {},
    onStatus: status => statuses.push(status),
    url: 'wss://example.com/events',
    environment: { WebSocket: FakeWebSocket }
  });
  assert.equal(instances.length, 0);
  assert.equal(statuses.at(-1).state, 'error');
  bridge.stop();
});
