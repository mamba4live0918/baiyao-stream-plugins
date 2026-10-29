(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ReviewTransport = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  const MAX_COUNT = 10000;
  const MAX_TEXT = 256;
  const MAX_TRACKED = 2048;
  const DEFAULT_TTL = 120000;
  const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);

  function first(sources, keys, includeNull = false) {
    for (const source of sources) {
      if (!record(source)) continue;
      for (const key of keys) {
        if (source[key] !== undefined && (includeNull || source[key] !== null)) return source[key];
      }
    }
    return undefined;
  }

  function text(value, fallback = '') {
    if (typeof value === 'number') return Number.isSafeInteger(value) && value >= 0 ? String(value) : fallback;
    if (typeof value !== 'string') return fallback;
    const trimmed = value.trim();
    return trimmed && trimmed.length <= MAX_TEXT ? trimmed : fallback;
  }

  function avatarValue(value) {
    if (record(value)) value = value.url_list || value.urlList || value.urls || value.url;
    if (Array.isArray(value)) {
      for (const candidate of value.slice(0, 10)) {
        const url = avatarValue(candidate);
        if (url) return url;
      }
      return '';
    }
    if (typeof value !== 'string') return '';
    const url = value.trim();
    if (!url || url.length > 4096 || /[\u0000-\u0020\u007f]/.test(url)) return '';
    if (/^https?:\/\/[^/\s?#]+(?:[/?#]|$)/i.test(url)) return url;
    return /^data:image\/(?:png|jpeg|gif|webp);base64,[a-z0-9+/]+={0,2}$/i.test(url) ? url : '';
  }

  function quantityText(value) {
    if (value === null) return 'null';
    if (typeof value === 'string') return value.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 100);
    if (['number', 'boolean', 'bigint'].includes(typeof value)) return String(value).slice(0, 100);
    return Array.isArray(value) ? '[数组]' : '[无效数量类型]';
  }

  // Matches installed Songlan 3.5.7 plugin-viewer.html sendTestEvent exactly:
  // the host simulator supplies neither stable user IDs nor event IDs.
  function createTestGift({ nickName, giftName, count } = {}) {
    return { nickName: nickName || '测试用户', avatarUrl: '', giftName: giftName || '小心心', count: Number(count) || 1, giftIcon: '' };
  }

  function normalizeGift(message, trusted = false) {
    if (!record(message)) return null;
    if (!trusted) {
      const type = first([message], ['type', 'msgType', 'method']);
      if (typeof type !== 'string' && typeof type !== 'number') return null;
      const kind = String(type).toLowerCase();
      if (!kind.includes('gift') && kind !== '2') return null;
    }
    const data = record(message.data) ? message.data : null;
    const messageGift = record(message.gift) ? message.gift : null;
    const dataGift = data && record(data.gift) ? data.gift : null;
    const sources = [message, messageGift, dataGift, data];
    const rawName = first([message], ['giftName']) ?? first([messageGift, dataGift, data], ['giftName', 'name']) ?? message.name;
    if (typeof rawName !== 'string') return null;
    const name = text(rawName);
    if (!name) return null;
    const rawCount = first(sources, ['giftCount', 'count', 'comboCount', 'repeatCount', 'num'], true);
    const validCountType = rawCount === undefined || typeof rawCount === 'number' || (typeof rawCount === 'string' && /^\d+$/.test(rawCount.trim()));
    const numeric = rawCount === undefined ? 1 : validCountType ? Number(rawCount) : NaN;
    const quantityIssue = !Number.isSafeInteger(numeric) || numeric < 1 ? '礼物数量不是有效正整数' : numeric > MAX_COUNT ? '礼物数量超过单次 10000 上限' : '';
    const count = quantityIssue ? 0 : numeric;
    const users = [message.user, data && data.user, message.userInfo, data && data.userInfo];
    const top = [message, data];
    const userId = text(first(users, ['id', 'userId', 'uid', 'user_id']) ?? first(top, ['userId', 'uid', 'user_id']));
    // A top-level name is the gift name in several protocols, never a username.
    const nickname = text(first(users, ['nickname', 'nickName', 'displayName', 'name', 'username', 'userName']) ?? first(top, ['nickname', 'nickName', 'displayName', 'username', 'userName']));
    const avatar = avatarValue(first(users.concat(top), ['avatar', 'avatarUrl', 'avatar_url', 'avatar_thumb', 'avatarThumb', 'avatar_medium', 'avatarMedium', 'headImgUrl', 'head_img_url']));
    const eventId = text(first(sources, ['eventId', 'event_id', 'msgId', 'msg_id']), null);
    const comboId = text(first(sources, ['comboId', 'combo_id']), null);
    const cumulative = comboId !== null && first(sources, ['isCumulative']) === true;
    const gift = { name, count, eventId, userId, nickname, avatar, comboId, cumulative };
    // Recognized gifts with bad quantities remain actionable; unrelated/malformed
    // message shapes and types are the only messages discarded by this normalizer.
    if (quantityIssue) { gift.quantityIssue = quantityIssue; gift.rawCount = quantityText(rawCount); }
    return gift;
  }

  function remember(map, key, value) {
    map.delete(key);
    map.set(key, value);
    while (map.size > MAX_TRACKED) map.delete(map.keys().next().value);
  }

  function createReceiver(onGift, options = {}) {
    const now = typeof options.now === 'function' ? options.now : Date.now;
    const ttl = Number.isFinite(options.ttl) && options.ttl >= 0 ? options.ttl : DEFAULT_TTL;
    const seenEvents = new Map();
    const comboTotals = new Map();
    const fresh = (time, current) => Number.isFinite(time) && time >= 0 && time <= current && current - time < ttl;
    const validTotal = total => Number.isInteger(total) && total >= 1 && total <= MAX_COUNT;
    function validKey(key, combo) {
      if (typeof key !== 'string' || key.length > 2200) return false;
      try {
        const parts = JSON.parse(key);
        if (!Array.isArray(parts) || parts.length !== (combo ? 4 : 5)) return false;
        if (parts[0] !== 'id' && parts[0] !== 'nickname') return false;
        return parts.slice(1).every((part, i) => typeof part === 'string' && part.length <= MAX_TEXT && part.trim() === part && (i === 0 || (!combo && i === 2) || part.length > 0));
      } catch (_) { return false; }
    }
    const saved = options.savedState;
    if (record(saved) && saved.version === 1 && Array.isArray(saved.seenEvents) && Array.isArray(saved.comboTotals)) {
      const current = now();
      for (const entry of saved.seenEvents.slice(-MAX_TRACKED)) {
        if (record(entry) && validKey(entry.id, false) && fresh(entry.time, current) &&
            (validTotal(entry.total) || (entry.quantityIssue === true && entry.total === 0))) {
          const item = { time: entry.time, total: entry.total };
          if (entry.quantityIssue === true) item.quantityIssue = true;
          remember(seenEvents, entry.id, item);
        }
      }
      for (const entry of saved.comboTotals.slice(-MAX_TRACKED)) {
        if (record(entry) && validKey(entry.id, true) && fresh(entry.time, current) && validTotal(entry.total)) {
          remember(comboTotals, entry.id, { time: entry.time, total: entry.total });
        }
      }
    }

    function exportState() {
      const current = now();
      const entries = map => Array.from(map, ([id, item]) => ({ id, total: item.total, time: item.time, ...(item.quantityIssue === true ? { quantityIssue: true } : {}) })).filter(item => fresh(item.time, current));
      return { version: 1, seenEvents: entries(seenEvents), comboTotals: entries(comboTotals) };
    }

    function receive(message, trusted = false) {
      const gift = normalizeGift(message, trusted);
      if (!gift) return false;
      const current = now();
      const identity = gift.userId ? ['id', gift.userId] : ['nickname', gift.nickname];
      const namespace = identity.concat(gift.name);
      const eventKey = gift.eventId === null ? null : JSON.stringify(namespace.concat(gift.cumulative ? gift.comboId : '', gift.eventId));
      const eventPrior = eventKey === null ? null : seenEvents.get(eventKey);
      const freshEvent = eventPrior && fresh(eventPrior.time, current);
      if (gift.quantityIssue) {
        if (freshEvent && (!gift.cumulative || eventPrior.quantityIssue === true)) return false;
        if (eventKey !== null) remember(seenEvents, eventKey, { total: freshEvent ? eventPrior.total : 0, time: current, quantityIssue: true });
        if (typeof onGift === 'function') onGift(gift);
        return true;
      }
      if (!gift.cumulative && freshEvent) return false;
      let previousTotal = 0;
      if (gift.cumulative) {
        const comboKey = JSON.stringify(namespace.concat(gift.comboId));
        const comboPrior = comboTotals.get(comboKey);
        previousTotal = Math.max(freshEvent ? eventPrior.total : 0, comboPrior && fresh(comboPrior.time, current) ? comboPrior.total : 0);
        remember(comboTotals, comboKey, { total: Math.max(previousTotal, gift.count), time: current });
      }
      if (eventKey !== null) remember(seenEvents, eventKey, { total: Math.max(previousTotal, gift.count), time: current });
      if (gift.cumulative) {
        if (gift.count <= previousTotal) return false;
        gift.count -= previousTotal;
      }
      if (typeof onGift === 'function') onGift(gift);
      return true;
    }
    return { receive, exportState };
  }

  function connect(options = {}) {
    const environment = options.root || root;
    const receiver = createReceiver(options.onGift, { savedState: options.savedState, now: options.now, ttl: options.ttl });
    let stopped = false;
    let sdkActive = false;
    let socket = null;
    let reconnectTimer = null;
    let sdkTimer = null;
    let unsubscribe = null;
    let lastStatus = '';
    function status(message) {
      if (message === lastStatus) return;
      lastStatus = message;
      if (typeof options.onStatus === 'function') options.onStatus(message);
    }
    function clearReconnect() {
      if (reconnectTimer !== null) environment.clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    function closeSocket() {
      const previous = socket;
      socket = null;
      if (!previous) return;
      previous.onopen = previous.onmessage = previous.onclose = previous.onerror = null;
      try { previous.close(); } catch (_) { /* An unusable socket is already detached. */ }
    }
    function trySdk() {
      if (stopped || sdkActive) return sdkActive;
      const sdk = environment.SonglanPlugin;
      if (!sdk || typeof sdk.onGift !== 'function') return false;
      // A successful registration is the health signal exposed by this SDK.
      let registrationValid = true;
      sdkActive = true;
      try {
        const result = sdk.onGift(function (message) {
          if (!stopped && sdkActive && registrationValid) receiver.receive(message, true);
        });
        if (typeof result === 'function') unsubscribe = result;
      } catch (_) {
        registrationValid = false;
        sdkActive = false;
        return false;
      }
      clearReconnect();
      if (sdkTimer !== null) environment.clearInterval(sdkTimer);
      sdkTimer = null;
      closeSocket();
      status('菘蓝已连接');
      return true;
    }
    function scheduleReconnect() {
      if (stopped || sdkActive || reconnectTimer !== null) return;
      status('等待礼物连接');
      reconnectTimer = environment.setTimeout(function () {
        reconnectTimer = null;
        if (!trySdk()) openSocket();
      }, 3000);
    }
    function openSocket() {
      if (stopped || sdkActive || (socket && (socket.readyState === 0 || socket.readyState === 1))) return;
      if (typeof environment.WebSocket !== 'function') { status('本地测试'); return; }
      status('礼物连接中');
      let current;
      // Installed Songlan 3.5.7 server.js:97, plugin-viewer.html:175.
      try { current = new environment.WebSocket('ws://localhost:9910'); }
      catch (_) { scheduleReconnect(); return; }
      socket = current;
      current.onopen = function () {
        if (stopped || sdkActive || socket !== current) return;
        try { current.send(JSON.stringify({ action: 'identify', module: '自定义插件' })); }
        catch (_) { closeSocket(); scheduleReconnect(); return; }
        status('本地礼物已连接');
      };
      current.onmessage = function (event) {
        if (stopped || sdkActive || socket !== current) return;
        let message;
        try { message = JSON.parse(event.data); } catch (_) { return; }
        receiver.receive(message);
      };
      current.onclose = function () {
        if (socket !== current) return;
        closeSocket();
        scheduleReconnect();
      };
      current.onerror = function () {
        if (socket !== current || stopped || sdkActive) return;
        // Some hosts never issue close after error. Detach first and retry ourselves.
        closeSocket();
        scheduleReconnect();
      };
    }
    if (!trySdk()) {
      openSocket();
      sdkTimer = environment.setInterval(trySdk, 500);
    }
    function cleanup() {
      if (stopped) return;
      stopped = true;
      clearReconnect();
      if (sdkTimer !== null) environment.clearInterval(sdkTimer);
      sdkTimer = null;
      closeSocket();
      if (unsubscribe) { try { unsubscribe(); } catch (_) { /* Cleanup stays idempotent. */ } }
      unsubscribe = null;
      status('已断开');
    }
    cleanup.receive = function (message, trusted = false) { return stopped ? false : receiver.receive(message, trusted); };
    cleanup.exportState = receiver.exportState;
    return cleanup;
  }
  return { normalizeGift, createTestGift, createReceiver, connect };
});
