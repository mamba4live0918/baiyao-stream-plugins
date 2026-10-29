(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.VisitorBridge = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var MAX_NICKNAME_LENGTH = 128;
  var MAX_AVATAR_LENGTH = 2048;
  var MAX_STABLE_ID_LENGTH = 256;
  var SDK_POLL_MS = 100;
  var SDK_WAIT_MS = 300;
  var RECONNECT_MS = 3000;

  function own(obj, key) {
    return !!obj && Object.prototype.hasOwnProperty.call(obj, key);
  }

  function boundedString(value, maxLength, allowEmpty) {
    if (typeof value !== 'string' || value.length > maxLength) return null;
    if (!allowEmpty && value.length === 0) return null;
    return value;
  }

  function firstField(raw, keys) {
    for (var i = 0; i < keys.length; i++) {
      if (own(raw, keys[i])) return raw[keys[i]];
    }
    return undefined;
  }

  function stableValue(value) {
    if (typeof value === 'string') {
      var trimmed = value.trim();
      return trimmed && trimmed.length <= MAX_STABLE_ID_LENGTH ? trimmed : null;
    }
    if (typeof value === 'number' && Number.isSafeInteger(value)) return String(value);
    return null;
  }

  function findStableId(raw) {
    var containers = [raw, raw && raw.user];
    var keys = ['userId', 'uid', 'idStr', 'secUid'];
    for (var c = 0; c < containers.length; c++) {
      var source = containers[c];
      if (!source || typeof source !== 'object') continue;
      for (var k = 0; k < keys.length; k++) {
        if (!own(source, keys[k])) continue;
        var value = stableValue(source[keys[k]]);
        if (value !== null) return value;
      }
    }
    return null;
  }

  function eventIdValue(raw) {
    var value = firstField(raw, ['eventId', 'event_id', 'msgId']);
    if (typeof value === 'string') {
      var trimmed = value.trim();
      return trimmed && trimmed.length <= 256 ? trimmed : null;
    }
    if (typeof value === 'number' && Number.isSafeInteger(value)) return String(value);
    return null;
  }

  function normalize(raw, forcedType, identityMode) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    var typeValue = forcedType === undefined ? raw.type : forcedType;
    var type = typeof typeValue === 'string' ? typeValue.toLowerCase() : '';
    if (type !== 'chat' && type !== 'gift') return null;

    var user = raw.user && typeof raw.user === 'object' ? raw.user : null;
    var nicknameValue = firstField(raw, ['nickName', 'nickname']);
    if (nicknameValue === undefined && user) nicknameValue = firstField(user, ['nickName', 'nickname']);
    var nickname = boundedString(nicknameValue, MAX_NICKNAME_LENGTH, false);
    if (nickname === null) return null;

    var avatarValue = firstField(raw, ['avatar', 'avatarUrl']);
    if (avatarValue === undefined && user) avatarValue = firstField(user, ['avatar', 'avatarUrl']);
    if (avatarValue === undefined || avatarValue === null) avatarValue = '';
    var avatar = boundedString(avatarValue, MAX_AVATAR_LENGTH, true);
    if (avatar === null) return null;

    var stableId = findStableId(raw);
    var mode = identityMode === 'strict' ? 'strict' : 'display';
    if (!stableId && mode === 'strict') return null;
    var userId = stableId || ('display:' + JSON.stringify([nickname, avatar]));
    var result = {
      type: type,
      userId: userId,
      nickname: nickname,
      identityKind: stableId ? 'stable' : 'display'
    };

    var textValue = type === 'chat'
      ? firstField(raw, ['content', 'text'])
      : firstField(raw, ['giftName', 'text', 'name']);
    if (typeof textValue === 'string' && textValue.length <= 4096) result.text = textValue;

    if (type === 'gift') {
      var countValue = firstField(raw, ['count', 'giftCount', 'comboCount', 'repeatCount']);
      if (countValue === undefined) countValue = 1;
      var count = Number(countValue);
      if (!Number.isSafeInteger(count) || count < 1) return null;
      result.count = count;
    }

    var eventId = eventIdValue(raw);
    if (eventId !== null) result.eventId = eventId;
    return result;
  }

  function localWebSocketUrl(value) {
    try {
      var parsed = new URL(value);
      var host = parsed.hostname.toLowerCase();
      var local = host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1';
      if ((parsed.protocol !== 'ws:' && parsed.protocol !== 'wss:') || !local || parsed.username || parsed.password) return null;
      return parsed.href;
    } catch (error) {
      return null;
    }
  }

  function connect(options) {
    options = options || {};
    var onEvent = typeof options.onEvent === 'function' ? options.onEvent : function () {};
    var onStatus = typeof options.onStatus === 'function' ? options.onStatus : function () {};
    var identityMode = options.identityMode === 'strict' ? 'strict' : 'display';
    var environment = options.environment || (typeof globalThis !== 'undefined' ? globalThis : {});
    var setTimer = typeof environment.setTimeout === 'function' ? environment.setTimeout.bind(environment) : setTimeout;
    var clearTimer = typeof environment.clearTimeout === 'function' ? environment.clearTimeout.bind(environment) : clearTimeout;
    var socketUrl = localWebSocketUrl(options.url || 'ws://localhost:9910');
    var alive = true;
    var activeTransport = null;
    var generation = 0;
    var socket = null;
    var fallbackTimer = null;
    var sdkPollTimer = null;
    var reconnectTimer = null;

    function status(state, transport, message, extra) {
      if (!alive) return;
      var value = { state: state, transport: transport, message: message };
      if (extra && typeof extra === 'object') {
        for (var key in extra) if (own(extra, key)) value[key] = extra[key];
      }
      onStatus(value);
    }

    function currentSdk() {
      var sdk = environment.SonglanPlugin;
      return sdk && typeof sdk.onChat === 'function' ? sdk : null;
    }

    function emit(raw, forcedType, transport, token) {
      if (!alive || generation !== token || activeTransport !== transport) return;
      var event = normalize(raw, forcedType, identityMode);
      if (!event) {
        status('missing-identity', transport, '事件缺少可用的观众身份或字段');
        return;
      }
      onEvent(event);
    }

    function cancelSocketTimers() {
      if (fallbackTimer !== null) { clearTimer(fallbackTimer); fallbackTimer = null; }
      if (reconnectTimer !== null) { clearTimer(reconnectTimer); reconnectTimer = null; }
    }

    function closeSocket() {
      if (!socket) return;
      var old = socket;
      socket = null;
      old.onopen = old.onmessage = old.onerror = old.onclose = null;
      try { old.close(); } catch (error) {}
    }

    function activateSdk(sdk) {
      if (!alive || activeTransport === 'sdk') return true;
      cancelSocketTimers();
      closeSocket();
      activeTransport = 'sdk';
      var token = ++generation;
      try {
        sdk.onChat(function (data) { emit(data, 'chat', 'sdk', token); });
        if (typeof sdk.onGift === 'function') sdk.onGift(function (data) { emit(data, 'gift', 'sdk', token); });
      } catch (error) {
        activeTransport = null;
        status('error', 'sdk', '菘蓝 SDK 接入失败', { error: String(error && error.message || error) });
        return false;
      }
      status('connected', 'sdk', '已连接菘蓝插件 SDK');
      return true;
    }

    function scheduleSdkPoll() {
      if (!alive || activeTransport === 'sdk' || sdkPollTimer !== null) return;
      sdkPollTimer = setTimer(function pollSdk() {
        sdkPollTimer = null;
        if (!alive || activeTransport === 'sdk') return;
        var sdk = currentSdk();
        if (sdk && activateSdk(sdk)) return;
        scheduleSdkPoll();
      }, SDK_POLL_MS);
    }

    function scheduleReconnect() {
      if (!alive || activeTransport === 'sdk' || reconnectTimer !== null) return;
      reconnectTimer = setTimer(function () {
        reconnectTimer = null;
        openSocket();
      }, RECONNECT_MS);
    }

    function openSocket() {
      if (!alive || activeTransport === 'sdk') return;
      if (!socketUrl) {
        status('error', 'websocket', 'WebSocket 地址必须是本机 ws/wss 地址');
        return;
      }
      var WebSocketCtor = environment.WebSocket || (typeof WebSocket !== 'undefined' ? WebSocket : null);
      if (typeof WebSocketCtor !== 'function') {
        status('error', 'websocket', '当前环境不支持 WebSocket');
        return;
      }
      closeSocket();
      activeTransport = 'websocket';
      var token = ++generation;
      status('connecting', 'websocket', '正在连接菘蓝 WebSocket');
      try {
        socket = new WebSocketCtor(socketUrl);
      } catch (error) {
        status('error', 'websocket', 'WebSocket 创建失败', { error: String(error && error.message || error) });
        scheduleReconnect();
        return;
      }
      var current = socket;
      current.onopen = function () {
        if (!alive || socket !== current || generation !== token || activeTransport !== 'websocket') return;
        try {
          current.send(JSON.stringify({ action: 'identify', module: '自定义插件' }));
          status('connected', 'websocket', '已连接菘蓝 WebSocket');
        } catch (error) {
          status('error', 'websocket', 'WebSocket 识别握手失败', { error: String(error && error.message || error) });
          scheduleReconnect();
        }
      };
      current.onmessage = function (message) {
        if (!alive || socket !== current || generation !== token || activeTransport !== 'websocket') return;
        try {
          var data = JSON.parse(message.data);
          if (!data || (data.type !== 'chat' && data.type !== 'gift')) return;
          emit(data, data.type, 'websocket', token);
        } catch (error) {
          status('error', 'websocket', 'WebSocket 消息解析失败', { error: String(error && error.message || error) });
        }
      };
      current.onerror = function (error) {
        if (!alive || socket !== current || generation !== token || activeTransport !== 'websocket') return;
        status('error', 'websocket', 'WebSocket 连接错误');
        scheduleReconnect();
      };
      current.onclose = function () {
        if (!alive || socket !== current || generation !== token || activeTransport !== 'websocket') return;
        socket = null;
        status('disconnected', 'websocket', 'WebSocket 已断开');
        scheduleReconnect();
      };
    }

    var initialSdk = currentSdk();
    if (initialSdk) {
      activateSdk(initialSdk);
    } else if (!socketUrl) {
      status('error', 'websocket', 'WebSocket 地址必须是本机 ws/wss 地址');
    } else {
      status('connecting', 'sdk', '正在等待菘蓝插件 SDK');
      scheduleSdkPoll();
      fallbackTimer = setTimer(function () {
        fallbackTimer = null;
        if (!currentSdk()) openSocket();
        else activateSdk(currentSdk());
      }, SDK_WAIT_MS);
    }

    return {
      stop: function () {
        if (!alive) return;
        alive = false;
        generation++;
        if (fallbackTimer !== null) clearTimer(fallbackTimer);
        if (sdkPollTimer !== null) clearTimer(sdkPollTimer);
        if (reconnectTimer !== null) clearTimer(reconnectTimer);
        fallbackTimer = sdkPollTimer = reconnectTimer = null;
        closeSocket();
        activeTransport = null;
      }
    };
  }

  return { normalize: normalize, connect: connect };
});
