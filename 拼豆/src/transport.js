// Songlan's plugin viewer injects SonglanPlugin into the plugin iframe. Its
// gift callback has no `type`; the direct WebSocket fallback does have one.
const MAX_GIFT_COUNT = 10000;

function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function firstPresent(sources, keys) {
  for (const source of sources) {
    if (!record(source)) continue;
    for (const key of keys) {
      if (Object.hasOwn(source, key)) return source[key];
    }
  }
  return undefined;
}

function cleanText(value) {
  return typeof value === 'string' && value.trim().length <= 256 ? value.trim() : '';
}

function normalizeGift(raw, trusted) {
  if (!record(raw)) return null;
  if (!trusted && raw.type !== 'gift') return null;
  const data = record(raw.data) ? raw.data : null;
  const gift = record(raw.gift) ? raw.gift : null;
  const dataGift = data && record(data.gift) ? data.gift : null;
  const sources = [raw, gift, dataGift, data];
  const name = cleanText(firstPresent([raw], ['giftName']) ?? firstPresent([gift, dataGift, data], ['giftName', 'name']) ?? raw.name);
  if (!name) return null;

  const rawCount = firstPresent(sources, ['count', 'giftCount', 'comboCount', 'repeatCount', 'num']);
  let count = 1;
  if (rawCount !== undefined) {
    if (typeof rawCount === 'number') count = rawCount;
    else if (typeof rawCount === 'string' && /^[1-9]\d*$/.test(rawCount.trim())) count = Number(rawCount.trim());
    else return null;
  }
  if (!Number.isSafeInteger(count) || count < 1 || count > MAX_GIFT_COUNT) return null;

  const user = record(raw.user) ? raw.user : null;
  const dataUser = data && record(data.user) ? data.user : null;
  const nickname = cleanText(firstPresent([raw, user, dataUser, data], ['nickName', 'nickname', 'displayName', 'userName', 'username']));
  return { name, count, nickname };
}

export function createGiftTransport({ onGift, onStatus, root = globalThis } = {}) {
  let connected = false;
  let sdkActive = false;
  let socket = null;
  let reconnectTimer = null;
  let sdkTimer = null;
  let unsubscribe = null;
  let session = 0;
  let lastStatus = '';

  function status(message) {
    if (message === lastStatus) return;
    lastStatus = message;
    if (typeof onStatus === 'function') onStatus(message);
  }

  function deliver(raw, trusted) {
    const gift = normalizeGift(raw, trusted);
    if (!gift) return false;
    if (typeof onGift === 'function') onGift(gift);
    return true;
  }

  function clearReconnect() {
    if (reconnectTimer !== null) root.clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  function closeSocket() {
    const oldSocket = socket;
    socket = null;
    if (!oldSocket) return;
    oldSocket.onopen = oldSocket.onmessage = oldSocket.onclose = oldSocket.onerror = null;
    try { oldSocket.close(); } catch { /* The failed socket is already detached. */ }
  }

  function trySdk() {
    if (!connected || sdkActive) return sdkActive;
    const sdk = root.SonglanPlugin;
    if (!sdk || typeof sdk.onGift !== 'function') return false;
    const currentSession = session;
    let validRegistration = true;
    sdkActive = true;
    try {
      const maybeUnsubscribe = sdk.onGift(message => {
        if (connected && sdkActive && validRegistration && session === currentSession) deliver(message, true);
      });
      if (typeof maybeUnsubscribe === 'function') unsubscribe = maybeUnsubscribe;
    } catch {
      validRegistration = false;
      sdkActive = false;
      return false;
    }
    clearReconnect();
    if (sdkTimer !== null) root.clearInterval(sdkTimer);
    sdkTimer = null;
    closeSocket();
    status('菘蓝已连接');
    return true;
  }

  function scheduleReconnect() {
    if (!connected || sdkActive || reconnectTimer !== null) return;
    status('等待礼物连接');
    reconnectTimer = root.setTimeout(() => {
      reconnectTimer = null;
      if (!trySdk()) openSocket();
    }, 3000);
  }

  function openSocket() {
    if (!connected || sdkActive || (socket && (socket.readyState === 0 || socket.readyState === 1))) return;
    if (typeof root.WebSocket !== 'function') {
      status('本地测试');
      return;
    }
    status('礼物连接中');
    let next;
    try { next = new root.WebSocket('ws://localhost:9910'); }
    catch { scheduleReconnect(); return; }
    socket = next;
    next.onopen = () => {
      if (!connected || sdkActive || socket !== next) return;
      try { next.send(JSON.stringify({ action: 'identify', module: '自定义插件' })); }
      catch { closeSocket(); scheduleReconnect(); return; }
      status('本地礼物已连接');
    };
    next.onmessage = event => {
      if (!connected || sdkActive || socket !== next) return;
      let raw;
      try { raw = JSON.parse(event.data); } catch { return; }
      deliver(raw, false);
    };
    next.onclose = () => {
      if (socket !== next) return;
      closeSocket();
      scheduleReconnect();
    };
    next.onerror = () => {
      if (!connected || sdkActive || socket !== next) return;
      closeSocket();
      scheduleReconnect();
    };
  }

  function connect() {
    if (connected) return;
    connected = true;
    session++;
    if (trySdk()) return;
    openSocket();
    sdkTimer = root.setInterval(trySdk, 500);
  }

  function disconnect() {
    if (!connected) return;
    connected = false;
    session++;
    sdkActive = false;
    clearReconnect();
    if (sdkTimer !== null) root.clearInterval(sdkTimer);
    sdkTimer = null;
    closeSocket();
    if (unsubscribe) {
      try { unsubscribe(); } catch { /* Shutdown stays idempotent. */ }
      unsubscribe = null;
    }
    status('已断开');
  }

  function receiveTestGift(raw) {
    return deliver(raw, true);
  }

  return { connect, disconnect, receiveTestGift };
}
