'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Engine = require('../src/engine.js');

const BASE = 1_800_000_000_000;

function chat(userId, nickname, text, eventId) {
  return { type: 'chat', userId, nickname, text, ...(eventId ? { eventId } : {}) };
}

function register(engineState, userId = 'u1', nickname = '凛光', now = BASE) {
  return Engine.processEvent(
    engineState,
    chat(userId, nickname, Engine.DEFAULTS.registerKeyword, `reg-${userId}`),
    Engine.DEFAULTS,
    now
  );
}

test('DEFAULTS and validateSettings provide a complete independent settings object', () => {
  assert.deepEqual({ ...Engine.DEFAULTS }, {
    registerKeyword: '登记',
    blessingKeyword: '转正祝福',
    chatPoints: 1,
    chatCooldownSec: 10,
    giftPoints: 1,
    blessingCooldownSec: 30,
    starThreshold: 10,
    guardianThreshold: 50
  });
  assert.equal(Object.isFrozen(Engine.DEFAULTS), true);
  const custom = Engine.validateSettings({ chatPoints: 3, guardianThreshold: 60 });
  assert.deepEqual(custom, { ...Engine.DEFAULTS, chatPoints: 3, guardianThreshold: 60 });
  assert.notEqual(custom, Engine.DEFAULTS);
});

test('validateSettings rejects unsafe shapes, invalid numbers, and unordered thresholds', () => {
  for (const value of [null, [], 'bad', Object.create(null), { chatPoints: -1 },
    { chatCooldownSec: Number.NaN }, { giftPoints: 1.5 },
    { starThreshold: 10, guardianThreshold: 10 }, { registerKeyword: '   ' }]) {
    assert.throws(() => Engine.validateSettings(value), Error);
  }
  const polluted = JSON.parse('{"__proto__":{"polluted":true}}');
  assert.throws(() => Engine.validateSettings(polluted), Error);
  assert.equal({}.polluted, undefined);
});

test('validateSettings rejects registration and blessing keywords that normalize to the same text', () => {
  assert.throws(() => Engine.validateSettings({
    registerKeyword: '  同一句  ',
    blessingKeyword: '同一句'
  }), Error);
});

test('getLevel uses exact threshold boundaries', () => {
  assert.deepEqual(Engine.getLevel(0, Engine.DEFAULTS), { index: 0, title: '旅人', stars: 1 });
  assert.deepEqual(Engine.getLevel(9, Engine.DEFAULTS), { index: 0, title: '旅人', stars: 1 });
  assert.deepEqual(Engine.getLevel(10, Engine.DEFAULTS), { index: 1, title: '星使', stars: 2 });
  assert.deepEqual(Engine.getLevel(50, Engine.DEFAULTS), { index: 2, title: '守护者', stars: 3 });
  assert.throws(() => Engine.getLevel(-1, Engine.DEFAULTS), Error);
});

test('runtime APIs ignore UI-only settings while strict settings validation rejects them', () => {
  const runtimeSettings = { ...Engine.DEFAULTS, hostName: '异世界的凛序', rosterX: 120 };
  assert.throws(() => Engine.validateSettings(runtimeSettings), Error);
  assert.deepEqual(Engine.getLevel(10, runtimeSettings), { index: 1, title: '星使', stars: 2 });
  const state = Engine.createState();
  const result = Engine.processEvent(state, chat('u1', '凛光', '登记'), runtimeSettings, BASE);
  assert.equal(result.reason, 'registered');
});

test('registration requires an exact trimmed keyword and a stable string identity', () => {
  const state = Engine.createState();
  const ignored = Engine.processEvent(state, chat('u1', '凛光', '登 记', 'e1'), Engine.DEFAULTS, BASE);
  assert.equal(ignored.reason, 'not-registered');
  assert.equal(state.visitors.length, 0);

  const missingId = Engine.processEvent(
    state,
    { type: 'chat', nickname: '凛光', text: ' 登记 ', eventId: 'looks-like-an-id' },
    Engine.DEFAULTS,
    BASE + 1
  );
  assert.deepEqual(missingId, { changed: false, effects: [], reason: 'invalid-user-id' });
  assert.equal(state.visitors.length, 0);

  const result = Engine.processEvent(state, chat(' u1 ', ' 凛光 ', '  登记  ', 'e2'), Engine.DEFAULTS, BASE + 2);
  assert.equal(result.reason, 'registered');
  assert.equal(result.changed, true);
  assert.deepEqual(result.effects, [{
    type: 'registered', nickname: '凛光', level: { index: 0, title: '旅人', stars: 1 }
  }]);
  assert.equal(state.visitors[0].id, 'u1');
  assert.equal(state.visitors[0].points, 0);
});

test('registration preserves a full nickname plus avatar display identity without hashing', () => {
  const state = Engine.createState();
  const displayId = `display:${JSON.stringify(['凛光', `https://avatar.invalid/${'a'.repeat(2048)}`])}`;
  const result = Engine.processEvent(
    state,
    chat(displayId, '凛光', '登记', 'display-registration'),
    Engine.DEFAULTS,
    BASE
  );
  assert.equal(result.reason, 'registered');
  assert.equal(state.visitors[0].id, displayId);
  assert.equal(Engine.validateState(JSON.parse(JSON.stringify(state))).visitors[0].id, displayId);
});

test('same nickname with different IDs registers separately while repeat registration only updates nickname', () => {
  const state = Engine.createState();
  register(state, 'u1', '同名', BASE);
  register(state, 'u2', '同名', BASE + 1);
  const repeat = Engine.processEvent(state, chat('u1', '新名', ' 登记 ', 'r3'), Engine.DEFAULTS, BASE + 2);
  assert.equal(state.visitors.length, 2);
  assert.equal(state.visitors[0].nickname, '新名');
  assert.equal(state.visitors[0].points, 0);
  assert.equal(repeat.reason, 'already-registered');
  assert.deepEqual(repeat.effects, []);
});

test('only registered users score and chat cooldown allows the exact boundary', () => {
  const state = Engine.createState();
  const stranger = Engine.processEvent(state, chat('u0', '路人', '你好', 'c0'), Engine.DEFAULTS, BASE);
  assert.equal(stranger.reason, 'not-registered');
  register(state, 'u1', '凛光', BASE + 1);

  const first = Engine.processEvent(state, chat('u1', '凛光', '你好', 'c1'), Engine.DEFAULTS, BASE + 2);
  const early = Engine.processEvent(state, chat('u1', '凛光', '又来了', 'c2'), Engine.DEFAULTS, BASE + 10_001);
  const boundary = Engine.processEvent(state, chat('u1', '凛光', '刚好', 'c3'), Engine.DEFAULTS, BASE + 10_002);
  assert.equal(first.reason, 'scored');
  assert.equal(early.reason, 'chat-cooldown');
  assert.equal(boundary.reason, 'scored');
  assert.equal(state.visitors[0].points, 2);
});

test('clock rollback cannot repeat scoring or blessing and never moves persisted times backward', () => {
  const settings = Engine.validateSettings({ chatCooldownSec: 0, blessingCooldownSec: 0 });
  const state = Engine.createState();
  register(state, 'u1', '凛光', BASE + 20_000);
  Engine.processEvent(state, chat('u1', '凛光', '互动', 'clock-score'), settings, BASE + 30_000);
  Engine.processEvent(state, chat('u1', '凛光', '转正祝福', 'clock-bless'), settings, BASE + 30_000);

  const rolledBackScore = Engine.processEvent(
    state,
    chat('u1', '凛光', '回拨互动', 'clock-score-rollback'),
    settings,
    BASE + 10_000
  );
  const rolledBackBlessing = Engine.processEvent(
    state,
    chat('u1', '凛光', '转正祝福', 'clock-bless-rollback'),
    settings,
    BASE + 10_000
  );

  assert.equal(rolledBackScore.reason, 'chat-cooldown');
  assert.equal(rolledBackBlessing.reason, 'blessing-cooldown');
  assert.equal(state.visitors[0].points, 1);
  assert.equal(state.visitors[0].lastSeenAt, BASE + 30_000);
  assert.equal(state.visitors[0].lastScoreAt, BASE + 30_000);
  assert.equal(state.visitors[0].lastBlessAt, BASE + 30_000);
  assert.equal(state.seen.find((item) => item.eventId === 'clock-score-rollback').at, BASE + 30_000);
  assert.equal(state.seen.find((item) => item.eventId === 'clock-bless-rollback').at, BASE + 30_000);
  assert.doesNotThrow(() => Engine.validateState(JSON.parse(JSON.stringify(state))));
});

test('another identity future event cannot prematurely expire a visitor score cooldown', () => {
  const state = Engine.createState();
  register(state, 'u1', '凛光', BASE + 20_000);
  Engine.processEvent(state, chat('u1', '凛光', '互动', 'personal-score'), Engine.DEFAULTS, BASE + 30_000);
  Engine.processEvent(state, chat('u2', '路人', '普通弹幕', 'unrelated-future'), Engine.DEFAULTS, BASE + 1_000_000);

  const result = Engine.processEvent(
    state,
    chat('u1', '凛光', '仍在冷却', 'personal-cooldown'),
    Engine.DEFAULTS,
    BASE + 31_000
  );

  assert.equal(result.reason, 'chat-cooldown');
  assert.equal(state.visitors[0].points, 1);
  assert.equal(state.visitors[0].lastSeenAt, BASE + 31_000);
  assert.equal(state.seen.find((item) => item.eventId === 'personal-cooldown').at, BASE + 1_000_000);
});

test('levelup appears only when scoring crosses a threshold', () => {
  const settings = Engine.validateSettings({ chatPoints: 5, chatCooldownSec: 0, starThreshold: 10, guardianThreshold: 20 });
  const state = Engine.createState();
  register(state);
  const one = Engine.processEvent(state, chat('u1', '凛光', 'a', 'l1'), settings, BASE + 1);
  const two = Engine.processEvent(state, chat('u1', '凛光', 'b', 'l2'), settings, BASE + 2);
  const three = Engine.processEvent(state, chat('u1', '凛光', 'c', 'l3'), settings, BASE + 3);
  assert.deepEqual(one.effects, []);
  assert.deepEqual(two.effects, [{
    type: 'levelup', nickname: '凛光', level: { index: 1, title: '星使', stars: 2 }
  }]);
  assert.deepEqual(three.effects, []);
});

test('gift count is a bounded positive integer and multiplies configured points', () => {
  const state = Engine.createState();
  register(state);
  const settings = Engine.validateSettings({ giftPoints: 3 });
  const result = Engine.processEvent(state, {
    type: 'gift', userId: 'u1', nickname: '凛光', count: 4, eventId: 'g1'
  }, settings, BASE + 1);
  assert.equal(result.reason, 'scored');
  assert.equal(state.visitors[0].points, 12);
  for (const count of [0, -1, 1.5, Number.NaN, 1_000_001]) {
    const bad = Engine.processEvent(state, {
      type: 'gift', userId: 'u1', nickname: '凛光', count, eventId: `bad-${String(count)}`
    }, settings, BASE + 2);
    assert.equal(bad.reason, 'invalid-count');
  }
});

test('event deduplication combines type and event ID and survives state validation', () => {
  const state = Engine.createState();
  register(state);
  const settings = Engine.validateSettings({ chatCooldownSec: 0 });
  Engine.processEvent(state, chat('u1', '凛光', '互动', 'same'), settings, BASE + 1);
  const duplicate = Engine.processEvent(state, chat('u1', '凛光', '互动', 'same'), settings, BASE + 2);
  Engine.processEvent(state, {
    type: 'gift', userId: 'u1', nickname: '凛光', count: 1, eventId: 'same'
  }, settings, BASE + 3);
  const restored = Engine.validateState(JSON.parse(JSON.stringify(state)));
  const refreshedDuplicate = Engine.processEvent(restored, chat('u1', '凛光', '互动', 'same'), settings, BASE + 4);
  assert.deepEqual(duplicate, { changed: false, effects: [], reason: 'duplicate-event' });
  assert.deepEqual(refreshedDuplicate, duplicate);
  assert.equal(restored.visitors[0].points, 2);
});

test('seen event history remains bounded without losing newest duplicate protection', () => {
  const state = Engine.createState();
  register(state);
  const settings = Engine.validateSettings({ chatCooldownSec: 0 });
  for (let index = 0; index < 2_050; index += 1) {
    Engine.processEvent(state, chat('u1', '凛光', 'x', `bounded-${index}`), settings, BASE + index + 1);
  }
  assert.equal(state.seen.length, 2_000);
  const duplicate = Engine.processEvent(state, chat('u1', '凛光', 'x', 'bounded-2049'), settings, BASE + 3_000);
  assert.equal(duplicate.reason, 'duplicate-event');
});

test('blessing works before registration and its cooldown persists by stable user ID', () => {
  const state = Engine.createState();
  const first = Engine.processEvent(state, chat('u9', '异界来客', ' 转正祝福 ', 'b1'), Engine.DEFAULTS, BASE);
  const early = Engine.processEvent(state, chat('u9', '改名后', '转正祝福', 'b2'), Engine.DEFAULTS, BASE + 29_999);
  const restored = Engine.validateState(JSON.parse(JSON.stringify(state)));
  const boundary = Engine.processEvent(restored, chat('u9', '改名后', '转正祝福', 'b3'), Engine.DEFAULTS, BASE + 30_000);
  assert.deepEqual(first.effects, [{
    type: 'blessing', nickname: '异界来客', level: { index: 0, title: '旅人', stars: 1 }
  }]);
  assert.equal(early.reason, 'blessing-cooldown');
  assert.equal(boundary.reason, 'blessing');
  assert.equal(restored.visitors.length, 0);
  assert.deepEqual(restored.blessingCooldowns, [{ id: 'u9', lastBlessAt: BASE + 30_000 }]);
});

test('registered blessing mirrors cooldown on the visitor and does not award chat points', () => {
  const state = Engine.createState();
  register(state);
  const result = Engine.processEvent(state, chat('u1', '新昵称', '转正祝福', 'bless'), Engine.DEFAULTS, BASE + 1);
  assert.equal(result.reason, 'blessing');
  assert.equal(state.visitors[0].nickname, '新昵称');
  assert.equal(state.visitors[0].points, 0);
  assert.equal(state.visitors[0].lastBlessAt, BASE + 1);
});

test('zero point settings disable scoring without moving the score cooldown', () => {
  const state = Engine.createState();
  register(state);
  const settings = Engine.validateSettings({ chatPoints: 0, giftPoints: 0 });
  const first = Engine.processEvent(state, chat('u1', '凛光', 'x', 'z1'), settings, BASE + 1);
  const gift = Engine.processEvent(state, {
    type: 'gift', userId: 'u1', nickname: '凛光', count: 2, eventId: 'z2'
  }, settings, BASE + 2);
  assert.equal(first.reason, 'scoring-disabled');
  assert.equal(gift.reason, 'scoring-disabled');
  assert.equal(state.visitors[0].points, 0);
  assert.equal(state.visitors[0].lastScoreAt, null);
});

test('invalid events and invalid time never throw or mutate state', () => {
  const invalidEvents = [null, [], {}, { type: 'chat', userId: 12, nickname: 'x', text: '登记' },
    { type: 'chat', userId: 'u', nickname: 12, text: '登记' },
    { type: 'gift', userId: 'u', nickname: 'x', eventId: 8 },
    { type: 'other', userId: 'u', nickname: 'x' }];
  for (const event of invalidEvents) {
    const state = Engine.createState();
    assert.doesNotThrow(() => Engine.processEvent(state, event, Engine.DEFAULTS, BASE));
    assert.deepEqual(state, Engine.createState());
  }
  const state = Engine.createState();
  const badTime = Engine.processEvent(state, chat('u', 'x', '登记'), Engine.DEFAULTS, Number.NaN);
  assert.equal(badTime.reason, 'invalid-time');
  assert.deepEqual(state, Engine.createState());
});

test('visitor capacity is 10000 and an overflow registration leaves existing data intact', () => {
  const state = Engine.createState();
  for (let index = 0; index < 10_000; index += 1) {
    state.visitors.push({
      id: `u${index}`,
      nickname: `n${index}`,
      points: 0,
      registeredAt: BASE,
      lastSeenAt: BASE,
      lastScoreAt: null,
      lastBlessAt: null
    });
  }
  const result = Engine.processEvent(state, chat('overflow', '满员', '登记'), Engine.DEFAULTS, BASE + 1);
  assert.equal(result.reason, 'capacity-reached');
  assert.equal(state.visitors.length, 10_000);
});

test('validateState returns a detached clean state and preserves Unicode plus string UID precision', () => {
  const source = {
    version: 1,
    visitors: [{
      id: '900719925474099312345', nickname: '🌟凛光〈异界〉', points: 7,
      registeredAt: BASE, lastSeenAt: BASE + 1, lastScoreAt: BASE + 1, lastBlessAt: null
    }],
    seen: [{ type: 'chat', eventId: 'evt-💫', at: BASE + 1 }],
    blessingCooldowns: [{ id: 'unregistered-💫', lastBlessAt: BASE }]
  };
  const clean = Engine.validateState(source);
  assert.deepEqual(clean, source);
  assert.notEqual(clean, source);
  assert.notEqual(clean.visitors[0], source.visitors[0]);
  source.visitors[0].nickname = 'changed';
  assert.equal(clean.visitors[0].nickname, '🌟凛光〈异界〉');
  assert.equal(clean.visitors[0].id, '900719925474099312345');
});

test('validateState strictly rejects corrupt, duplicate, oversized, and dangerous imports', () => {
  const valid = Engine.createState();
  const badValues = [
    null,
    { ...valid, version: 2 },
    { ...valid, visitors: [{ id: 'u', nickname: 'n', points: Number.NaN, registeredAt: 1, lastSeenAt: 1, lastScoreAt: null, lastBlessAt: null }] },
    { ...valid, visitors: [{ id: 'u', nickname: 'n', points: -1, registeredAt: 1, lastSeenAt: 1, lastScoreAt: null, lastBlessAt: null }] },
    { ...valid, visitors: [
      { id: 'u', nickname: 'a', points: 0, registeredAt: 1, lastSeenAt: 1, lastScoreAt: null, lastBlessAt: null },
      { id: 'u', nickname: 'b', points: 0, registeredAt: 1, lastSeenAt: 1, lastScoreAt: null, lastBlessAt: null }
    ] },
    { ...valid, seen: [{ type: 'chat', eventId: 'e', at: Number.NaN }] },
    { ...valid, blessingCooldowns: [{ id: 'u', lastBlessAt: -1 }] },
    { ...valid, extra: true },
    JSON.parse('{"version":1,"visitors":[],"seen":[],"blessingCooldowns":[],"__proto__":{}}')
  ];
  for (const value of badValues) {
    assert.throws(() => Engine.validateState(value), Error);
  }
  const tooMany = Engine.createState();
  tooMany.seen = Array.from({ length: 2_001 }, (_, index) => ({ type: 'chat', eventId: `e${index}`, at: index }));
  assert.throws(() => Engine.validateState(tooMany), Error);
});
