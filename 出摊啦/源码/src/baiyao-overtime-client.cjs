/* 白曜加班机 · 插件用的连接库（俄罗斯方块、萌宠消消乐、出摊啦共用；别的插件整份拷过去也能用）。
 *
 * 在白曜 0.27.0 以上里跑（白曜的插件窗口、白曜给的 OBS 网址）：直接用白曜给的 BaiyaoPlugin.overtime，什么都不用设。
 * 不在白曜里跑（菘蓝里、直接把网页放进 OBS、浏览器里试玩）：连白曜的本机连接 ws://127.0.0.1:47833/overtime，
 * 填上白曜「加班机 → 加班设置 → 插件连接」里的连接码才能加减；没填只能看时间。
 *
 * 这个库只管「送」：getPending() 给出还没送到的 [{id, seconds, op:'add'|'sub', label, user}]，送到了回调 onSent(id, change)。
 *   change 是白曜实际加减的秒数（文字）；'0' 表示时间已经到了、白曜没加；
 *   null 表示连接断在半路、不知道加上没有——按已送算，不再重发，免得加两遍。
 * 同一个 id 只送一次。哪些送过、存不存，由插件自己记。
 */
(function (root) {
  'use strict';
  const DEFAULT_PORT = 47833;
  const RETRY_MS = Object.freeze([1000, 3000, 5000, 10000]);
  const HELLO_TIMEOUT_MS = 5000;
  const STORE_KEY = 'baiyao-overtime-link-v1';
  const KEY_CHARS = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const KEY_RE = new RegExp('^[' + KEY_CHARS + ']{4}-[' + KEY_CHARS + ']{4}$');
  const MAX_REMEMBERED = 512;

  /** 连接码：不分大小写，空格、各种横线都行，8 位不带横线也行。 */
  function normalizeKey(value) {
    const raw = String(value == null ? '' : value).toUpperCase().replace(/[\s　]+/g, '').replace(/[－—–‐_]/g, '-');
    const bare = raw.replace(/-/g, '');
    return bare.length === 8 ? bare.slice(0, 4) + '-' + bare.slice(4) : raw;
  }
  const isKey = key => KEY_RE.test(key);
  function portNumber(value) {
    if (typeof value === 'string' && !/^\d+$/.test(value.trim())) return null;
    if (typeof value !== 'number' && typeof value !== 'string') return null;
    const n = Number(value);
    return Number.isInteger(n) && n >= 1 && n <= 65535 ? n : null;
  }
  /** 秒数只要正整数：数字或一串数字（多长都行），别的不送。 */
  function secondsText(value) {
    if (typeof value === 'number') return Number.isSafeInteger(value) && value >= 1 ? String(value) : null;
    if (typeof value !== 'string' || !/^\d+$/.test(value.trim())) return null;
    return value.trim().replace(/^0+/, '') || null;
  }
  const shortText = (value, max) => Array.from(String(value == null ? '' : value).replace(/[\u0000-\u001F\u007F]/g, '').trim()).slice(0, max).join('');
  const errorText = e => shortText(e && e.message ? e.message : e, 80) || '白曜加班机出错了';

  /** 白曜加班机还剩多久：1:23:45；∞；超过 99 小时写天数。 */
  function remainingText(state) {
    if (!state || typeof state !== 'object') return '';
    if (state.infinite) return '∞';
    const s = Number(state.remainingSeconds);
    if (!Number.isFinite(s) || s < 0) return '';
    if (s >= 360000) return Math.floor(s / 86400).toLocaleString('zh-CN') + ' 天';
    const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, sec = Math.floor(s % 60);
    return h + ':' + String(m).padStart(2, '0') + ':' + String(sec).padStart(2, '0');
  }

  /** 给设置页看的一句话。 */
  function describe(s) {
    if (!s) return '';
    const later = ' · ' + Math.ceil((s.retryMs || 0) / 1000) + ' 秒后再试';
    if (s.mode === 'none') return '这里连不了白曜加班机';
    if (s.mode === 'baiyao') return s.state === 'retrying' ? '白曜加班机没回应' + later : s.state === 'ready' ? '已接上白曜加班机' : '没有接白曜加班机';
    if (s.state === 'ready') return '已连上白曜加班机';
    if (s.state === 'locked') return s.key ? '连上白曜了，但连接码不对，只能看时间' : '连上白曜了，填上连接码才能加时间';
    if (s.state === 'connecting') return '正在连白曜加班机…';
    if (s.state === 'retrying') return (s.hostTooOld ? '这个白曜还没有加班机，要 0.27.0 以上' : '没连上白曜加班机（要开着白曜 0.27.0 以上）') + later;
    return '没有连白曜加班机';
  }

  function createBaiyaoOvertime(options) {
    const o = options && typeof options === 'object' ? options : {};
    const env = o.env || root;
    const Socket = 'WebSocket' in o ? o.WebSocket : env.WebSocket;
    const schedule = o.setTimeout || ((fn, ms) => root.setTimeout(fn, ms));
    const cancel = o.clearTimeout || (id => root.clearTimeout(id));
    const steps = Array.isArray(o.retryMs) && o.retryMs.length ? o.retryMs.slice() : RETRY_MS;
    const plugin = shortText(o.plugin, 20) || '插件';
    const getPending = typeof o.getPending === 'function' ? o.getPending : () => [];
    const call = (fn, ...args) => { try { return typeof fn === 'function' ? fn(...args) : undefined; } catch { return undefined; } };
    let storage = o.storage;
    if (storage === undefined) { try { storage = env.localStorage; } catch { storage = null; } }
    const storeKey = typeof o.storageKey === 'string' && o.storageKey ? o.storageKey : STORE_KEY;
    let saved = {};
    try { saved = JSON.parse((storage && storage.getItem(storeKey)) || '{}') || {}; } catch { saved = {}; }
    let key = normalizeKey(o.key != null ? o.key : saved.key);
    let port = portNumber(o.port != null ? o.port : saved.port) || DEFAULT_PORT;
    const sdk = () => { const host = env.BaiyaoPlugin, api = host && host.overtime; return api && typeof api.add === 'function' && typeof api.sub === 'function' ? api : null; };
    const mode = sdk() ? 'baiyao' : typeof Socket === 'function' ? 'bridge' : 'none';
    const hostTooOld = !!env.BaiyaoPlugin && mode !== 'baiyao';

    let state = mode === 'none' ? 'unavailable' : 'idle', error = '', retryMs = 0, attempt = 0, running = false, epoch = 0;
    let socket = null, helloTimer = null, retryTimer = null, trusted = false, timer = null, unsubscribe = null, flushing = false, again = false;
    const sent = new Set(), inflight = new Map();

    const snapshot = () => ({ mode, state, error, retryMs, key, keyValid: isKey(key), port, trusted: mode === 'baiyao' || trusted, timer, inflight: inflight.size, hostTooOld, url: 'ws://127.0.0.1:' + port + '/overtime' });
    const notify = () => call(o.onStatus, snapshot());
    const persist = () => { try { if (storage) storage.setItem(storeKey, JSON.stringify({ key, port })); } catch { /* 存不了就只在这一页记着 */ } };
    const live = token => running && token === epoch;

    function records() {
      let list;
      try { list = getPending(); } catch { return []; }
      if (!Array.isArray(list)) return [];
      const seen = new Set(), out = [];
      for (const r of list) {
        if (!r || typeof r !== 'object') continue;
        const id = typeof r.id === 'string' ? r.id.trim() : typeof r.id === 'number' && Number.isFinite(r.id) ? String(r.id) : '';
        const seconds = secondsText(r.seconds);
        if (!id || !seconds || seen.has(id) || sent.has(id) || inflight.has(id)) continue;
        seen.add(id);
        out.push({ id, seconds, op: r.op === 'sub' ? 'sub' : 'add', label: shortText(r.label, 20), user: shortText(r.user, 20) });
      }
      return out;
    }
    function delivered(id, change) {
      sent.add(id);
      if (sent.size > MAX_REMEMBERED) sent.delete(sent.values().next().value);
      call(o.onSent, id, change == null ? null : String(change));
    }
    function clearTimers() {
      if (helloTimer != null) cancel(helloTimer);
      if (retryTimer != null) cancel(retryTimer);
      helloTimer = retryTimer = null;
    }
    // 等一会儿再试：在白曜里是重送，本机连接是重连
    function backoff(token, message) {
      if (!live(token)) return;
      clearTimers();
      state = 'retrying'; error = message; retryMs = steps[Math.min(attempt++, steps.length - 1)];
      retryTimer = schedule(() => { retryTimer = null; if (!live(token)) return; if (mode === 'baiyao') resumeSdk(token); else openSocket(token); }, retryMs);
      notify();
    }

    // —— 在白曜里：BaiyaoPlugin.overtime ——
    function startSdk(token) {
      const api = sdk();
      try {
        const off = typeof api.onChange === 'function' ? api.onChange(payload => {
          if (!live(token)) return;
          if (payload && payload.state && typeof payload.state === 'object') timer = payload.state;
          call(o.onChange, payload); notify();
        }) : null;
        unsubscribe = typeof off === 'function' ? off : null;
      } catch { unsubscribe = null; }
      if (typeof api.state === 'function') Promise.resolve().then(() => api.state()).then(value => { if (live(token) && value && typeof value === 'object') { timer = value; notify(); } }, () => {});
      resumeSdk(token);
    }
    function resumeSdk(token) {
      if (!live(token)) return;
      state = 'ready'; error = ''; retryMs = 0; notify();
      flushSdk(token);
    }
    async function flushSdk(token) {
      if (flushing) { again = true; return; }
      flushing = true;
      try {
        do {
          again = false;
          for (const r of records()) {
            if (!live(token) || state !== 'ready') return;
            inflight.set(r.id, r);
            let change;
            try { change = await sdk()[r.op](r.seconds, { label: r.label, user: r.user }); }
            catch (e) { if (inflight.delete(r.id)) backoff(token, errorText(e)); return; }
            // 送的时候停了（关页面、刷新）：停的那一刻已经按已送记过了，这里不再记
            if (!inflight.delete(r.id)) return;
            attempt = 0;
            delivered(r.id, change);
          }
        } while (again && live(token));
      } finally {
        flushing = false;
        // 送的时候被停了又重新开始：新的那轮接着送
        if (again && token !== epoch && running && state === 'ready') { again = false; flushSdk(epoch); }
      }
      notify();
    }

    // —— 不在白曜里：本机连接 ——
    function openSocket(token) {
      if (!live(token)) return;
      clearTimers();
      state = 'connecting'; error = ''; retryMs = 0; trusted = false; notify();
      let ws;
      try { ws = new Socket('ws://127.0.0.1:' + port + '/overtime'); } catch { backoff(token, '连不上白曜加班机'); return; }
      socket = ws;
      ws.onopen = () => { if (ws === socket && live(token)) sendHello(ws, token); };
      ws.onmessage = event => {
        if (ws !== socket || !live(token)) return;
        let msg;
        try { msg = JSON.parse(String(event.data)); } catch { return; }
        receive(token, msg);
      };
      ws.onerror = () => drop(ws, token, '连不上白曜加班机');
      ws.onclose = () => drop(ws, token, '和白曜加班机断开了');
      helloTimer = schedule(() => drop(ws, token, '白曜加班机没回应'), HELLO_TIMEOUT_MS);
    }
    function sendHello(ws, token) {
      try { ws.send(JSON.stringify({ type: 'hello', plugin, key })); } catch { drop(ws, token, '连不上白曜加班机'); }
    }
    // 送出去还没回话的，按已送算（不知道加上没有，宁可少加也不加两遍）
    function settleInflight() { for (const id of [...inflight.keys()]) delivered(id, null); inflight.clear(); }
    function drop(ws, token, message) {
      if (ws !== socket) return;
      socket = null; trusted = false;
      try { ws.close(); } catch { /* 已经断了 */ }
      settleInflight();
      if (live(token)) backoff(token, message);
    }
    function receive(token, msg) {
      if (!msg || typeof msg !== 'object') return;
      if (msg.state && typeof msg.state === 'object') timer = msg.state;
      if (msg.type === 'hello') {
        if (helloTimer != null) { cancel(helloTimer); helloTimer = null; }
        trusted = msg.trusted === true; attempt = 0; retryMs = 0;
        state = trusted ? 'ready' : 'locked'; error = trusted || !key ? '' : '连接码不对';
        notify();
        if (trusted) flushBridge(token);
      } else if (msg.type === 'change') {
        call(o.onChange, { state: msg.state || null, change: msg.change || null }); notify();
      } else if (msg.type === 'result') {
        const id = msg.id == null ? '' : String(msg.id);
        if (inflight.delete(id)) delivered(id, msg.change);
        notify();
      } else if (msg.type === 'error') {
        // 没加上：留在待发里，下次再送
        inflight.delete(msg.id == null ? '' : String(msg.id));
        const text = shortText(msg.message, 80) || '白曜加班机出错了';
        if (/连接码/.test(text)) { trusted = false; state = 'locked'; error = '连接码不对'; } else error = text;
        notify();
      } else if (msg.type === 'state') notify();
    }
    function flushBridge(token) {
      if (!live(token) || state !== 'ready' || !trusted || !socket || socket.readyState !== 1) return 0;
      let count = 0;
      for (const r of records()) {
        try { socket.send(JSON.stringify({ type: r.op, id: r.id, seconds: r.seconds, label: r.label, user: r.user })); }
        catch { drop(socket, token, '和白曜加班机断开了'); break; }
        inflight.set(r.id, r); count++;
      }
      if (count) notify();
      return count;
    }

    // —— 对外 ——
    function halt() {
      running = false; epoch++; clearTimers();
      if (unsubscribe) { call(unsubscribe); unsubscribe = null; }
      const ws = socket; socket = null; trusted = false;
      if (ws) { try { ws.close(); } catch { /* 已经断了 */ } }
      // 送出去还没回话的按已送记：页面可能马上就关了，白曜那边多半已经加上，宁可少加也不下次再送一遍
      settleInflight();
    }
    function start() {
      halt();
      if (mode === 'none') { state = 'unavailable'; notify(); return false; }
      running = true; attempt = 0;
      const token = epoch;
      if (mode === 'baiyao') startSdk(token); else openSocket(token);
      return true;
    }
    function stop() {
      halt();
      state = mode === 'none' ? 'unavailable' : 'stopped'; error = ''; retryMs = 0;
      notify();
    }
    /** 有新的待发就叫一声；连着就马上送，没连上等连上了自己送。 */
    function flush() {
      if (!running) return 0;
      if (mode === 'baiyao') { if (state === 'ready') flushSdk(epoch); return 0; }
      return flushBridge(epoch);
    }
    function setKey(value) {
      const next = normalizeKey(value);
      if (next && !isKey(next)) return false;
      key = next; persist();
      if (mode === 'bridge' && running) {
        if (socket && socket.readyState === 1) { trusted = false; sendHello(socket, epoch); } else start();
      }
      notify();
      return true;
    }
    function setPort(value) {
      const next = portNumber(value);
      if (next === null) return false;
      port = next; persist();
      if (mode === 'bridge' && running) start(); else notify();
      return true;
    }
    /** 只连一下、看看能不能加：另开一条连接，只打招呼，绝不改时间。
     *  options.key：拿输入框里还没保存的连接码试——不保存，也不碰正在用的连接（不然攒着的加班会被送出去）；不给就用已保存的。 */
    function test(options) {
      const t = options && typeof options === 'object' ? options : {};
      const wait = Number.isFinite(t.timeoutMs) && t.timeoutMs > 0 ? t.timeoutMs : HELLO_TIMEOUT_MS;
      const tryKey = t.key === undefined ? key : normalizeKey(t.key);
      if (mode === 'none') return Promise.resolve({ ok: false, mode, trusted: false, state: null, error: '这里连不了白曜加班机' });
      if (mode === 'baiyao') {
        const api = sdk();
        return Promise.resolve().then(() => (typeof api.state === 'function' ? api.state() : null))
          .then(value => ({ ok: true, mode, trusted: true, state: value || null, error: '' }), e => ({ ok: false, mode, trusted: false, state: null, error: errorText(e) }));
      }
      if (tryKey && !isKey(tryKey)) return Promise.resolve({ ok: false, mode, trusted: false, state: null, error: '连接码是 8 位，比如 ABCD-2345' });
      return new Promise(resolve => {
        let ws = null, done = false, timeout = null;
        const finish = result => {
          if (done) return;
          done = true;
          if (timeout != null) cancel(timeout);
          try { if (ws) ws.close(); } catch { /* 已经断了 */ }
          resolve({ mode, ...result });
        };
        const failed = text => finish({ ok: false, trusted: false, state: null, error: text });
        timeout = schedule(() => failed('白曜加班机没回应'), wait);
        try { ws = new Socket('ws://127.0.0.1:' + port + '/overtime'); } catch { failed('连不上白曜加班机'); return; }
        ws.onopen = () => { try { ws.send(JSON.stringify({ type: 'hello', plugin, key: tryKey })); } catch { failed('连不上白曜加班机'); } };
        ws.onmessage = event => {
          let msg;
          try { msg = JSON.parse(String(event.data)); } catch { return; }
          if (!msg || msg.type !== 'hello') return;
          const ok = msg.trusted === true;
          finish({ ok: true, trusted: ok, state: msg.state || null, error: ok ? '' : tryKey ? '连接码不对' : '还没填连接码' });
        };
        ws.onerror = () => failed('连不上白曜加班机');
        ws.onclose = () => failed('连不上白曜加班机');
      });
    }
    return { start, stop, flush, snapshot, test, setKey, setPort, describe: () => describe(snapshot()) };
  }

  const api = Object.freeze({ createBaiyaoOvertime, describe, remainingText, normalizeKey, isKey, DEFAULT_PORT });
  root.BaiyaoOvertimeClient = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
