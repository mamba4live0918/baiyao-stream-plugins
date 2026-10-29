(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.VisitorEngine = api;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var VERSION = 1;
  var MAX_VISITORS = 10000;
  var MAX_SEEN = 2000;
  var MAX_BLESSING_COOLDOWNS = 10000;
  var MAX_GIFT_COUNT = 1000000;
  var MAX_KEYWORD_LENGTH = 64;
  var MAX_ID_LENGTH = 4096;
  var EVENT_TYPES = ['chat', 'gift', 'like'];
  var FORBIDDEN_KEYS = ['__proto__', 'prototype', 'constructor'];

  var DEFAULTS = Object.freeze({
    registerKeyword: '登记',
    blessingKeyword: '转正祝福',
    chatPoints: 1,
    chatCooldownSec: 10,
    giftPoints: 1,
    blessingCooldownSec: 30,
    starThreshold: 10,
    guardianThreshold: 50
  });

  var SETTING_KEYS = Object.keys(DEFAULTS);
  var STATE_KEYS = ['version', 'visitors', 'seen', 'blessingCooldowns'];
  var VISITOR_KEYS = ['id', 'nickname', 'points', 'registeredAt', 'lastSeenAt', 'lastScoreAt', 'lastBlessAt'];
  var SEEN_KEYS = ['type', 'eventId', 'at'];
  var BLESSING_KEYS = ['id', 'lastBlessAt'];

  function isPlainObject(value) {
    return value !== null && typeof value === 'object' &&
      !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
  }

  function assertSafeKeys(value, allowed, label) {
    var keys = Object.keys(value);
    for (var index = 0; index < keys.length; index += 1) {
      var key = keys[index];
      if (FORBIDDEN_KEYS.indexOf(key) !== -1 || allowed.indexOf(key) === -1) {
        throw new Error(label + ' contains an unsupported key');
      }
    }
  }

  function assertExactKeys(value, expected, label) {
    assertSafeKeys(value, expected, label);
    for (var index = 0; index < expected.length; index += 1) {
      if (!Object.prototype.hasOwnProperty.call(value, expected[index])) {
        throw new Error(label + ' is missing ' + expected[index]);
      }
    }
  }

  function isFiniteInteger(value) {
    return Number.isSafeInteger(value) && Number.isFinite(value);
  }

  function validateInteger(value, min, max, label) {
    if (!isFiniteInteger(value) || value < min || value > max) {
      throw new Error(label + ' must be an integer between ' + min + ' and ' + max);
    }
    return value;
  }

  function validateText(value, label, maxLength, requireTrimmed) {
    if (typeof value !== 'string') {
      throw new Error(label + ' must be a string');
    }
    var trimmed = value.trim();
    if (!trimmed || (maxLength && trimmed.length > maxLength)) {
      throw new Error(label + ' is invalid');
    }
    if (requireTrimmed && trimmed !== value) {
      throw new Error(label + ' must not have surrounding whitespace');
    }
    return trimmed;
  }

  function validateTimestamp(value, label, nullable) {
    if (nullable && value === null) {
      return null;
    }
    return validateInteger(value, 0, Number.MAX_SAFE_INTEGER, label);
  }

  function validateSettings(input) {
    if (typeof input === 'undefined') {
      input = {};
    }
    if (!isPlainObject(input)) {
      throw new Error('settings must be a plain object');
    }
    assertSafeKeys(input, SETTING_KEYS, 'settings');

    var result = {
      registerKeyword: Object.prototype.hasOwnProperty.call(input, 'registerKeyword')
        ? validateText(input.registerKeyword, 'registerKeyword', MAX_KEYWORD_LENGTH, false)
        : DEFAULTS.registerKeyword,
      blessingKeyword: Object.prototype.hasOwnProperty.call(input, 'blessingKeyword')
        ? validateText(input.blessingKeyword, 'blessingKeyword', MAX_KEYWORD_LENGTH, false)
        : DEFAULTS.blessingKeyword,
      chatPoints: Object.prototype.hasOwnProperty.call(input, 'chatPoints')
        ? validateInteger(input.chatPoints, 0, 1000000, 'chatPoints')
        : DEFAULTS.chatPoints,
      chatCooldownSec: Object.prototype.hasOwnProperty.call(input, 'chatCooldownSec')
        ? validateInteger(input.chatCooldownSec, 0, 86400, 'chatCooldownSec')
        : DEFAULTS.chatCooldownSec,
      giftPoints: Object.prototype.hasOwnProperty.call(input, 'giftPoints')
        ? validateInteger(input.giftPoints, 0, 1000000, 'giftPoints')
        : DEFAULTS.giftPoints,
      blessingCooldownSec: Object.prototype.hasOwnProperty.call(input, 'blessingCooldownSec')
        ? validateInteger(input.blessingCooldownSec, 0, 86400, 'blessingCooldownSec')
        : DEFAULTS.blessingCooldownSec,
      starThreshold: Object.prototype.hasOwnProperty.call(input, 'starThreshold')
        ? validateInteger(input.starThreshold, 1, Number.MAX_SAFE_INTEGER, 'starThreshold')
        : DEFAULTS.starThreshold,
      guardianThreshold: Object.prototype.hasOwnProperty.call(input, 'guardianThreshold')
        ? validateInteger(input.guardianThreshold, 2, Number.MAX_SAFE_INTEGER, 'guardianThreshold')
        : DEFAULTS.guardianThreshold
    };

    if (result.guardianThreshold <= result.starThreshold) {
      throw new Error('guardianThreshold must be greater than starThreshold');
    }
    if (result.registerKeyword === result.blessingKeyword) {
      throw new Error('registerKeyword and blessingKeyword must be different');
    }
    return result;
  }

  function validateRuntimeSettings(input) {
    if (typeof input === 'undefined') {
      return validateSettings();
    }
    if (!isPlainObject(input)) {
      throw new Error('settings must be a plain object');
    }
    var core = {};
    for (var index = 0; index < SETTING_KEYS.length; index += 1) {
      var key = SETTING_KEYS[index];
      if (Object.prototype.hasOwnProperty.call(input, key)) {
        core[key] = input[key];
      }
    }
    return validateSettings(core);
  }

  function createState() {
    return {
      version: VERSION,
      visitors: [],
      seen: [],
      blessingCooldowns: []
    };
  }

  function validateVisitor(value, index) {
    var label = 'visitor[' + index + ']';
    if (!isPlainObject(value)) {
      throw new Error(label + ' must be a plain object');
    }
    assertExactKeys(value, VISITOR_KEYS, label);
    var visitor = {
      id: validateText(value.id, label + '.id', MAX_ID_LENGTH, true),
      nickname: validateText(value.nickname, label + '.nickname', 0, true),
      points: validateInteger(value.points, 0, Number.MAX_SAFE_INTEGER, label + '.points'),
      registeredAt: validateTimestamp(value.registeredAt, label + '.registeredAt', false),
      lastSeenAt: validateTimestamp(value.lastSeenAt, label + '.lastSeenAt', false),
      lastScoreAt: validateTimestamp(value.lastScoreAt, label + '.lastScoreAt', true),
      lastBlessAt: validateTimestamp(value.lastBlessAt, label + '.lastBlessAt', true)
    };
    if (visitor.lastSeenAt < visitor.registeredAt ||
        (visitor.lastScoreAt !== null && visitor.lastScoreAt > visitor.lastSeenAt) ||
        (visitor.lastBlessAt !== null && visitor.lastBlessAt > visitor.lastSeenAt)) {
      throw new Error(label + ' has inconsistent timestamps');
    }
    return visitor;
  }

  function validateSeen(value, index) {
    var label = 'seen[' + index + ']';
    if (!isPlainObject(value)) {
      throw new Error(label + ' must be a plain object');
    }
    assertExactKeys(value, SEEN_KEYS, label);
    if (EVENT_TYPES.indexOf(value.type) === -1) {
      throw new Error(label + '.type is invalid');
    }
    return {
      type: value.type,
      eventId: validateText(value.eventId, label + '.eventId', MAX_ID_LENGTH, true),
      at: validateTimestamp(value.at, label + '.at', false)
    };
  }

  function validateBlessingCooldown(value, index) {
    var label = 'blessingCooldowns[' + index + ']';
    if (!isPlainObject(value)) {
      throw new Error(label + ' must be a plain object');
    }
    assertExactKeys(value, BLESSING_KEYS, label);
    return {
      id: validateText(value.id, label + '.id', MAX_ID_LENGTH, true),
      lastBlessAt: validateTimestamp(value.lastBlessAt, label + '.lastBlessAt', false)
    };
  }

  function validateState(input) {
    if (!isPlainObject(input)) {
      throw new Error('state must be a plain object');
    }
    assertExactKeys(input, STATE_KEYS, 'state');
    if (input.version !== VERSION) {
      throw new Error('unsupported state version');
    }
    if (!Array.isArray(input.visitors) || input.visitors.length > MAX_VISITORS) {
      throw new Error('visitors must be an array with at most ' + MAX_VISITORS + ' entries');
    }
    if (!Array.isArray(input.seen) || input.seen.length > MAX_SEEN) {
      throw new Error('seen must be an array with at most ' + MAX_SEEN + ' entries');
    }
    if (!Array.isArray(input.blessingCooldowns) || input.blessingCooldowns.length > MAX_BLESSING_COOLDOWNS) {
      throw new Error('blessingCooldowns must be a bounded array');
    }

    var visitorIds = new Set();
    var visitors = input.visitors.map(function (value, index) {
      var visitor = validateVisitor(value, index);
      if (visitorIds.has(visitor.id)) {
        throw new Error('visitor IDs must be unique');
      }
      visitorIds.add(visitor.id);
      return visitor;
    });

    var eventKeys = new Set();
    var seen = input.seen.map(function (value, index) {
      var record = validateSeen(value, index);
      var key = record.type + '\u0000' + record.eventId;
      if (eventKeys.has(key)) {
        throw new Error('seen event keys must be unique');
      }
      eventKeys.add(key);
      return record;
    });

    var blessingIds = new Set();
    var blessingCooldowns = input.blessingCooldowns.map(function (value, index) {
      var record = validateBlessingCooldown(value, index);
      if (blessingIds.has(record.id)) {
        throw new Error('blessing cooldown IDs must be unique');
      }
      blessingIds.add(record.id);
      return record;
    });

    return { version: VERSION, visitors: visitors, seen: seen, blessingCooldowns: blessingCooldowns };
  }

  function levelFor(points, settings) {
    if (points >= settings.guardianThreshold) {
      return { index: 2, title: '守护者', stars: 3 };
    }
    if (points >= settings.starThreshold) {
      return { index: 1, title: '星使', stars: 2 };
    }
    return { index: 0, title: '旅人', stars: 1 };
  }

  function getLevel(points, settings) {
    var cleanSettings = validateRuntimeSettings(settings);
    validateInteger(points, 0, Number.MAX_SAFE_INTEGER, 'points');
    return levelFor(points, cleanSettings);
  }

  function result(changed, effects, reason) {
    var output = { changed: changed, effects: effects };
    if (reason) {
      output.reason = reason;
    }
    return output;
  }

  function hasBasicStateShape(state) {
    return isPlainObject(state) && state.version === VERSION &&
      Array.isArray(state.visitors) && Array.isArray(state.seen) &&
      Array.isArray(state.blessingCooldowns);
  }

  function normalizeEvent(event) {
    if (!isPlainObject(event) || EVENT_TYPES.indexOf(event.type) === -1) {
      return { error: 'invalid-event' };
    }
    if (typeof event.userId !== 'string' || !event.userId.trim() || event.userId.trim().length > MAX_ID_LENGTH) {
      return { error: 'invalid-user-id' };
    }
    if (typeof event.nickname !== 'string' || !event.nickname.trim()) {
      return { error: 'invalid-nickname' };
    }
    if (Object.prototype.hasOwnProperty.call(event, 'eventId') &&
        (typeof event.eventId !== 'string' || !event.eventId.trim() || event.eventId.trim().length > MAX_ID_LENGTH)) {
      return { error: 'invalid-event-id' };
    }
    var normalized = {
      type: event.type,
      userId: event.userId.trim(),
      nickname: event.nickname.trim(),
      text: typeof event.text === 'string' ? event.text.trim() : '',
      eventId: typeof event.eventId === 'string' ? event.eventId.trim() : null,
      count: 1
    };
    if (event.type === 'gift' && Object.prototype.hasOwnProperty.call(event, 'count')) {
      if (!isFiniteInteger(event.count) || event.count < 1 || event.count > MAX_GIFT_COUNT) {
        return { error: 'invalid-count' };
      }
      normalized.count = event.count;
    }
    return normalized;
  }

  function findVisitor(state, userId) {
    for (var index = 0; index < state.visitors.length; index += 1) {
      if (state.visitors[index].id === userId) {
        return state.visitors[index];
      }
    }
    return null;
  }

  function findBlessingCooldown(state, userId) {
    for (var index = 0; index < state.blessingCooldowns.length; index += 1) {
      if (state.blessingCooldowns[index].id === userId) {
        return state.blessingCooldowns[index];
      }
    }
    return null;
  }

  function isDuplicate(state, event) {
    if (!event.eventId) {
      return false;
    }
    for (var index = 0; index < state.seen.length; index += 1) {
      if (state.seen[index].type === event.type && state.seen[index].eventId === event.eventId) {
        return true;
      }
    }
    return false;
  }

  function rememberEvent(state, event, now) {
    if (!event.eventId) {
      return false;
    }
    state.seen.push({ type: event.type, eventId: event.eventId, at: now });
    if (state.seen.length > MAX_SEEN) {
      state.seen.splice(0, state.seen.length - MAX_SEEN);
    }
    return true;
  }

  function getEffectiveNow(visitor, blessingCooldown, now) {
    var effectiveNow = now;
    if (visitor) {
      effectiveNow = Math.max(
        effectiveNow,
        visitor.registeredAt,
        visitor.lastSeenAt,
        visitor.lastScoreAt === null ? 0 : visitor.lastScoreAt,
        visitor.lastBlessAt === null ? 0 : visitor.lastBlessAt
      );
    }
    if (blessingCooldown && blessingCooldown.lastBlessAt > effectiveNow) {
      effectiveNow = blessingCooldown.lastBlessAt;
    }
    return effectiveNow;
  }

  function getSeenNow(state, effectiveNow) {
    var seenNow = effectiveNow;
    for (var index = 0; index < state.seen.length; index += 1) {
      if (state.seen[index].at > seenNow) {
        seenNow = state.seen[index].at;
      }
    }
    return seenNow;
  }

  function updateVisitorPresence(visitor, nickname, now) {
    var changed = false;
    if (visitor.nickname !== nickname) {
      visitor.nickname = nickname;
      changed = true;
    }
    if (visitor.lastSeenAt !== now) {
      visitor.lastSeenAt = now;
      changed = true;
    }
    return changed;
  }

  function rememberBlessing(state, userId, now) {
    var record = findBlessingCooldown(state, userId);
    if (record) {
      record.lastBlessAt = now;
      return;
    }
    state.blessingCooldowns.push({ id: userId, lastBlessAt: now });
    if (state.blessingCooldowns.length > MAX_BLESSING_COOLDOWNS) {
      state.blessingCooldowns.sort(function (left, right) {
        return left.lastBlessAt - right.lastBlessAt;
      });
      state.blessingCooldowns.splice(0, state.blessingCooldowns.length - MAX_BLESSING_COOLDOWNS);
    }
  }

  function applyPoints(visitor, amount, settings, nickname) {
    if (amount === 0) {
      return { effect: null, reason: 'scoring-disabled' };
    }
    if (!Number.isSafeInteger(amount) || !Number.isSafeInteger(visitor.points + amount)) {
      return { effect: null, reason: 'points-overflow' };
    }
    var oldLevel = levelFor(visitor.points, settings);
    visitor.points += amount;
    var newLevel = levelFor(visitor.points, settings);
    return {
      effect: newLevel.index > oldLevel.index
        ? { type: 'levelup', nickname: nickname, level: newLevel }
        : null,
      reason: 'scored'
    };
  }

  function processEvent(state, rawEvent, rawSettings, now) {
    try {
      if (!hasBasicStateShape(state)) {
        return result(false, [], 'invalid-state');
      }
      if (!isFiniteInteger(now) || now < 0) {
        return result(false, [], 'invalid-time');
      }
      var settings;
      try {
        settings = validateRuntimeSettings(rawSettings);
      } catch (error) {
        return result(false, [], 'invalid-settings');
      }
      var event = normalizeEvent(rawEvent);
      if (event.error) {
        return result(false, [], event.error);
      }
      if (isDuplicate(state, event)) {
        return result(false, [], 'duplicate-event');
      }

      var visitor = findVisitor(state, event.userId);
      var isRegistration = event.type === 'chat' && event.text === settings.registerKeyword;
      var isBlessing = event.type === 'chat' && event.text === settings.blessingKeyword;
      var cooldown = isBlessing ? findBlessingCooldown(state, event.userId) : null;
      var effectiveNow = getEffectiveNow(visitor, cooldown, now);
      var changed = rememberEvent(state, event, getSeenNow(state, effectiveNow));

      if (isRegistration) {
        if (visitor) {
          changed = updateVisitorPresence(visitor, event.nickname, effectiveNow) || changed;
          return result(changed, [], 'already-registered');
        }
        if (state.visitors.length >= MAX_VISITORS) {
          return result(changed, [], 'capacity-reached');
        }
        visitor = {
          id: event.userId,
          nickname: event.nickname,
          points: 0,
          registeredAt: effectiveNow,
          lastSeenAt: effectiveNow,
          lastScoreAt: null,
          lastBlessAt: null
        };
        state.visitors.push(visitor);
        return result(true, [{
          type: 'registered',
          nickname: event.nickname,
          level: levelFor(0, settings)
        }], 'registered');
      }

      if (isBlessing) {
        if (cooldown && (now < cooldown.lastBlessAt ||
            effectiveNow - cooldown.lastBlessAt < settings.blessingCooldownSec * 1000)) {
          if (visitor) {
            changed = updateVisitorPresence(visitor, event.nickname, effectiveNow) || changed;
          }
          return result(changed, [], 'blessing-cooldown');
        }
        rememberBlessing(state, event.userId, effectiveNow);
        changed = true;
        if (visitor) {
          updateVisitorPresence(visitor, event.nickname, effectiveNow);
          visitor.lastBlessAt = effectiveNow;
        }
        return result(changed, [{
          type: 'blessing',
          nickname: event.nickname,
          level: levelFor(visitor ? visitor.points : 0, settings)
        }], 'blessing');
      }

      if (!visitor) {
        return result(changed, [], 'not-registered');
      }
      changed = updateVisitorPresence(visitor, event.nickname, effectiveNow) || changed;

      if (event.type === 'like') {
        return result(changed, [], 'unsupported-event');
      }

      var amount;
      if (event.type === 'chat') {
        if (settings.chatPoints === 0) {
          return result(changed, [], 'scoring-disabled');
        }
        if (visitor.lastScoreAt !== null && (now < visitor.lastScoreAt ||
            effectiveNow - visitor.lastScoreAt < settings.chatCooldownSec * 1000)) {
          return result(changed, [], 'chat-cooldown');
        }
        amount = settings.chatPoints;
      } else {
        if (settings.giftPoints === 0) {
          return result(changed, [], 'scoring-disabled');
        }
        amount = settings.giftPoints * event.count;
      }

      var scored = applyPoints(visitor, amount, settings, event.nickname);
      if (scored.reason !== 'scored') {
        return result(changed, [], scored.reason);
      }
      if (event.type === 'chat') {
        visitor.lastScoreAt = effectiveNow;
      }
      var effects = scored.effect ? [scored.effect] : [];
      return result(true, effects, 'scored');
    } catch (error) {
      return result(false, [], 'invalid-state');
    }
  }

  function renameVisitor(input, sourceId, newNickname, options) {
    var state = validateState(input);
    if (typeof newNickname !== 'string' || !newNickname.trim() || newNickname.trim().length > 128) throw new Error('请输入 1–128 个字符的新昵称');
    var name = newNickname.trim();
    if (/[\u0000-\u001f\u007f]/.test(name)) throw new Error('新昵称不能包含换行或控制字符');
    var source = state.visitors.find(function (v) { return v.id === sourceId; });
    if (!source) throw new Error('原观众档案不存在，请刷新列表后重试');
    var newId = source.id;
    if (source.id.indexOf('display:') === 0) {
      var identity;
      try { identity = JSON.parse(source.id.slice(8)); } catch (error) { throw new Error('原昵称头像标识无效，无法迁移'); }
      if (!Array.isArray(identity) || identity.length !== 2 || typeof identity[0] !== 'string' || typeof identity[1] !== 'string' || identity[1].length > 2048) {
        throw new Error('原昵称头像标识无效，无法迁移');
      }
      newId = 'display:' + JSON.stringify([name, identity[1]]);
      validateText(newId, '新观众标识', MAX_ID_LENGTH, true);
    }
    var duplicate = state.visitors.find(function (v) { return v.id === newId && v !== source; });
    if (duplicate && (!options || options.mergeDuplicate !== true)) {
      throw new Error('新昵称和同一头像的档案已存在，请核对后明确选择合并');
    }
    function later(a, b) { return a === null ? b : b === null ? a : Math.max(a, b); }
    if (duplicate) {
      var combined = source.points + duplicate.points;
      if (!Number.isSafeInteger(combined)) throw new Error('合并积分超出可保存范围，未修改任何档案');
      source.points = combined;
      source.registeredAt = Math.min(source.registeredAt, duplicate.registeredAt);
      source.lastSeenAt = Math.max(source.lastSeenAt, duplicate.lastSeenAt);
      source.lastScoreAt = later(source.lastScoreAt, duplicate.lastScoreAt);
      source.lastBlessAt = later(source.lastBlessAt, duplicate.lastBlessAt);
      state.visitors = state.visitors.filter(function (v) { return v !== duplicate; });
    }
    var blessingTime = source.lastBlessAt;
    state.blessingCooldowns = state.blessingCooldowns.filter(function (entry) {
      if (entry.id !== sourceId && entry.id !== newId) return true;
      blessingTime = later(blessingTime, entry.lastBlessAt);
      return false;
    });
    if (blessingTime !== null) {
      state.blessingCooldowns.push({ id: newId, lastBlessAt: blessingTime });
      source.lastBlessAt = blessingTime;
      source.lastSeenAt = Math.max(source.lastSeenAt, blessingTime);
    }
    source.id = newId;
    source.nickname = name;
    return validateState(state);
  }

  return Object.freeze({
    DEFAULTS: DEFAULTS,
    validateSettings: validateSettings,
    createState: createState,
    validateState: validateState,
    processEvent: processEvent,
    getLevel: getLevel,
    renameVisitor: renameVisitor
  });
}));
