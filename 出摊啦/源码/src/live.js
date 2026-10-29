/* 宿主 SDK 优先；缺少礼物/弹幕接口时使用已确认的本机兼容服务。 */
import { ACTION_IDS, normalizeGiftEvent, normalizeCommentEvent, routeGift, routeComment, specFromAction, createEventId } from './rules.js';
import { safeName } from './text.js';
import { decodePortMessage, inspectPortMessage } from './live-message-test.js';

const SEEN_MAX = 2000;
const FALLBACK_URLS = ['ws://localhost:9910', 'ws://localhost:10030'];
const CONNECT_TIMEOUT = 8000;

export class Live {
  constructor(trigger, getSettings, env = globalThis, onChange = () => {}, options = {}) {
    this.trigger = trigger;
    this.getSettings = getSettings;
    this.env = env;
    this.onChange = onChange;
    this.fallbackEnabled = options.fallback !== false;
    // V1.6：每份真礼物（去重后）也交给加班机的礼物加减表看一眼；返回加减的秒数（没配是 0）
    this.onGiftEvent = typeof options.onGiftEvent === 'function' ? options.onGiftEvent : null;
    this.seen = { gift: new Set(), comment: new Set(), action: new Set() };
    this.bindings = { gift: false, comment: false, action: false };
    this.unsubscribers = {};
    this.registrations = [];
    this.bindingLabels = {};
    this.counts = { gift: 0, comment: 0, action: 0 };
    this.timer = null;
    this.running = false;
    this.stopped = false;
    this.session = 0;
    this.socket = null;
    this.connectTimer = null;
    this.retryTimer = null;
    this.portIndex = 0;
    this.failures = 0;
    this.transport = { state: 'idle', url: '' };
    this.lastGift = null;
    this.matchedGiftCount = 0;
  }

  start() {
    if (this.running) return this;
    this.running = true;
    this.stopped = false;
    this.session++;
    this.refresh();
    return this;
  }

  receiving() { return this.getSettings().live?.receive !== false; }

  status() {
    const status = [this.stopped ? '直播接入已停止' : '直播接入'];
    for (const [kind, label] of [['gift', '礼物'], ['comment', '弹幕'], ['action', '白曜动作']]) {
      status.push(this.bindings[kind] ? `${label} SDK 已绑定（${this.bindingLabels[kind]}）` : `等待${label} SDK`);
    }
    const { state, url } = this.transport;
    const port = url ? url.slice(url.lastIndexOf(':') + 1) : '9910 / 10030';
    const transportStatus = {
      idle: '本机后备未启动', connecting: `本机后备连接中：${port}`,
      open: `本机后备已连接：${port}`, waiting: `等待本机礼物服务：${port}`,
      sdk: '礼物和弹幕由 SDK 接收', disabled: '本机后备已关闭',
      unavailable: '当前环境无法连接本机礼物服务', stopped: '本机后备已停止'
    };
    status.push(transportStatus[state]);
    status.push(this.receiving() ? '接收真实事件：开' : '接收真实事件：关');
    status.push(`已收礼物：${this.counts.gift} · 匹配互动：${this.matchedGiftCount}`);
    if (this.lastGift) {
      const gift = this.lastGift;
      status.push(`最近礼物：${gift.name}×${gift.count} · ${gift.applied ? '已触发' : gift.matched ? '已匹配，暂未执行' : '未触发（检查礼物表/捣乱池）'}`);
    }
    return status.join(' · ');
  }

  notify() {
    try { this.onChange(this); } catch { /* 设置页关闭或更新失败不影响收礼。 */ }
  }

  refresh() {
    if (this.running && !this.stopped) this.tryBind();
    this.notify();
    return this;
  }

  tryBind() {
    if (this.stopped || !this.running) return;
    const songlan = this.env.SonglanPlugin, baiyao = this.env.BaiyaoPlugin;
    const candidates = [
      ['gift', [[songlan, 'onGift', '通用接口'], [baiyao, 'onGift', '白曜接口']], raw => this.onGift(raw)],
      ['comment', [[songlan, 'onChat', '通用接口'], [baiyao, 'onChat', '白曜接口'], [songlan, 'onComment', '通用接口'], [baiyao, 'onComment', '白曜接口']], raw => this.onComment(raw)],
      ['action', [[baiyao, 'onAction', '白曜接口']], raw => this.onAction(raw)]
    ];
    for (const [kind, choices, callback] of candidates) {
      if (this.bindings[kind]) continue;
      for (const [sdk, method, label] of choices) {
        if (typeof sdk?.[method] !== 'function') continue;
        const registration = { active: true }, session = this.session;
        try {
          const unsubscribe = sdk[method](raw => {
            if (!registration.active || !this.running || this.stopped || this.session !== session) return;
            callback(raw);
          });
          this.registrations.push(registration);
          this.bindings[kind] = true;
          this.bindingLabels[kind] = label;
          if (typeof unsubscribe === 'function') this.unsubscribers[kind] = unsubscribe;
          this.notify();
          break;
        } catch { registration.active = false; }
      }
    }
    if (Object.values(this.bindings).every(Boolean)) this.clearTimer();
    else if (this.timer === null && typeof this.env.setInterval === 'function' && typeof this.env.clearInterval === 'function') {
      const session = this.session;
      this.timer = this.env.setInterval(() => { if (this.session === session) this.tryBind(); }, 1500);
    }
    this.syncTransport();
  }

  clearTimer() {
    if (this.timer !== null) this.env.clearInterval?.(this.timer);
    this.timer = null;
  }

  fallbackNeeded() {
    return this.running && !this.stopped && this.receiving() && this.fallbackEnabled && !(this.bindings.gift && this.bindings.comment);
  }

  setTransport(state, url = '') {
    if (this.transport.state === state && this.transport.url === url) return;
    this.transport = { state, url };
    this.notify();
  }

  clearTimeout(name) {
    if (this[name] !== null) this.env.clearTimeout?.(this[name]);
    this[name] = null;
  }

  closeSocket() {
    this.clearTimeout('connectTimer');
    const socket = this.socket;
    this.socket = null;
    if (!socket) return;
    socket.onopen = socket.onmessage = socket.onclose = socket.onerror = null;
    try { socket.close(); } catch { /* 已关闭的旧连接不再有回调入口。 */ }
  }

  syncTransport() {
    if (!this.fallbackNeeded()) {
      this.clearTimeout('retryTimer');
      this.closeSocket();
      this.failures = 0;
      this.portIndex = 0;
      this.setTransport(this.stopped ? 'stopped' : this.bindings.gift && this.bindings.comment ? 'sdk' : 'disabled');
      return;
    }
    if (typeof this.env.WebSocket !== 'function' || typeof this.env.setTimeout !== 'function' || typeof this.env.clearTimeout !== 'function') {
      this.setTransport('unavailable');
      return;
    }
    if (!this.socket && this.retryTimer === null) this.openSocket();
  }

  scheduleRetry() {
    if (!this.fallbackNeeded() || this.retryTimer !== null) return;
    this.portIndex = (this.portIndex + 1) % FALLBACK_URLS.length;
    const delay = Math.min(30000, 3000 * 2 ** Math.min(this.failures++, 4));
    const session = this.session;
    this.setTransport('waiting', FALLBACK_URLS[this.portIndex]);
    this.retryTimer = this.env.setTimeout(() => {
      if (session !== this.session || !this.running || this.stopped) return;
      this.retryTimer = null;
      this.tryBind();
    }, delay);
  }

  openSocket() {
    if (!this.fallbackNeeded() || this.socket) return;
    const url = FALLBACK_URLS[this.portIndex], session = this.session;
    this.setTransport('connecting', url);
    let socket;
    try { socket = new this.env.WebSocket(url); }
    catch { this.scheduleRetry(); return; }
    this.socket = socket;
    const current = () => this.running && !this.stopped && this.session === session && this.socket === socket;
    const failed = () => {
      if (!current()) return;
      this.closeSocket();
      this.scheduleRetry();
    };
    socket.onopen = () => {
      if (!current() || !this.fallbackNeeded()) return;
      this.clearTimeout('connectTimer');
      try { socket.send(JSON.stringify({ action: 'identify', module: '出摊啦' })); }
      catch { failed(); return; }
      this.failures = 0;
      this.setTransport('open', url);
    };
    socket.onmessage = event => {
      if (!current() || !this.fallbackNeeded()) return;
      const message = decodePortMessage(event.data);
      if (message.status !== 'valid') return;
      if (message.kind === 'gift' && !this.bindings.gift) this.onGift(message.raw);
      else if (message.kind === 'comment' && !this.bindings.comment) this.onComment(message.raw);
    };
    socket.onerror = failed;
    socket.onclose = failed;
    this.connectTimer = this.env.setTimeout(failed, CONNECT_TIMEOUT);
  }

  fresh(source, id) {
    if (!id) return true;
    const seen = this.seen[source];
    if (seen.has(id)) return false;
    seen.add(id);
    if (seen.size > SEEN_MAX) seen.delete(seen.values().next().value);
    return true;
  }

  onGift(raw) {
    if (this.stopped || !this.receiving()) return false;
    let event;
    try { event = normalizeGiftEvent(raw); } catch { return false; }
    if (!event || !this.fresh('gift', event.id)) return false;
    this.counts.gift++;
    let shifted = 0;
    if (this.onGiftEvent) { try { shifted = Number(this.onGiftEvent(event)) || 0; } catch { shifted = 0; } }
    const specs = routeGift(this.getSettings(), event);
    const matched = (Array.isArray(specs) ? specs.length > 0 : !!specs) || shifted !== 0;
    if (matched) this.matchedGiftCount++;
    const applied = this.fire(specs) || shifted !== 0;
    this.lastGift = { name: safeName(event.gift.name), count: event.gift.count, matched, applied, ...(shifted ? { overtime: shifted } : {}) };
    this.notify();
    return applied;
  }

  onComment(raw) {
    if (this.stopped || !this.receiving()) return false;
    let event;
    try { event = normalizeCommentEvent(raw); } catch { return false; }
    if (!event || !this.fresh('comment', event.id)) return false;
    this.counts.comment++;
    const applied = this.fire(routeComment(this.getSettings(), event));
    this.notify();
    return applied;
  }

  onAction(payload) {
    if (this.stopped) return false;
    let spec;
    try { spec = specFromAction(this.getSettings(), payload); } catch { return false; }
    if (!spec || !this.fresh('action', spec.id)) return false;
    this.counts.action++;
    const applied = this.fire(spec);
    this.notify();
    return applied;
  }

  fire(input, simulation = false) {
    const list = Array.isArray(input) ? input : input ? [input] : [];
    let accepted = false;
    for (const item of list) {
      if (!item || !ACTION_IDS.includes(item.kind)) continue;
      const quantity = Number(item.count ?? 1);
      const count = item.kind === 'overtime' ? quantity : Math.floor(quantity);
      if (!Number.isFinite(count) || count <= 0) continue;
      const event = { kind: item.kind, nick: safeName(item.nick), uid: String(item.uid ?? ''), id: String(item.id ?? '').trim() || createEventId(this.env), count, source: simulation ? 'sim' : item.source || 'action', ...(item.via === 'gift' ? { via: 'gift' } : {}) };
      accepted = this.trigger(event) !== false || accepted;
    }
    return accepted;
  }

  sim(spec) { return this.fire(spec, true); }

  simGift(name, count = 1, nick = '测试观众') {
    const event = normalizeGiftEvent({ giftName: name, count, nickname: nick, eventId: createEventId(this.env) });
    return this.fire(routeGift(this.getSettings(), event), true);
  }

  /* 菜单回放：默认只解析；显式试玩也不冒充真实收件，不接受白曜动作命令。 */
  testMessage(text, { play = false, random } = {}) {
    const result = inspectPortMessage(text, this.getSettings(), random);
    if (play !== true || result.status !== 'matched') return { ...result, played: false };
    const played = this.fire(result.specs, true);
    return { ...result, played, reason: played ? '解析成功，已提交本地试玩；真实收件计数不变。' : '规则已匹配，但试玩未被游戏接受。' };
  }

  stop() {
    this.stopped = true;
    this.running = false;
    this.session++;
    for (const registration of this.registrations) registration.active = false;
    this.registrations = [];
    this.clearTimer();
    this.clearTimeout('retryTimer');
    this.closeSocket();
    for (const [kind, unsubscribe] of Object.entries(this.unsubscribers)) {
      try { unsubscribe(); } catch { /* 停止后各入口仍拒绝处理事件。 */ }
      delete this.unsubscribers[kind];
    }
    this.bindings = { gift: false, comment: false, action: false };
    this.bindingLabels = {};
    this.portIndex = 0;
    this.failures = 0;
    this.setTransport('stopped');
    this.notify();
  }
}
