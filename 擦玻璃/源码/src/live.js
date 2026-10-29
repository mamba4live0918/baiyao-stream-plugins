/* 擦玻璃 · 直播接入：菘蓝/白曜 SDK 的礼物，白曜规则动作；试玩面板的模拟礼物走同一条路。
   弹幕、点赞不接（V1.5 起不要了）。
   （和淘金簸箕版同一套写法：SDK 可能比页面脚本晚注入，所以轮询绑定，各只绑一次；来源 ID 去重） */
import { normalizeGiftEvent, routeGift, specFromAction } from './rules.js';

const SEEN_MAX = 2000;

export class Live {
  constructor(trigger, getSettings) {
    this.trigger = trigger;
    this.getSettings = getSettings;
    this.seen = new Set();
    this.sdk = false;
    this.bay = false;
    this.counts = { gift: 0, action: 0 };
  }

  start() {
    this.tryBind();
    this.timer = setInterval(() => this.tryBind(), 1500);
  }

  receiving() {
    return this.getSettings().live.receive;
  }

  status() {
    const parts = [this.sdk ? '菘蓝/白曜 SDK 已绑定' : '未检测到直播 SDK'];
    if (this.bay) parts.push('白曜规则动作已订阅');
    parts.push(this.receiving() ? '接收真实事件：开' : '接收真实事件：关');
    return parts.join(' · ');
  }

  tryBind() {
    const S = window.SonglanPlugin;
    if (!this.sdk && S && typeof S.onGift === 'function') {
      try {
        S.onGift(raw => this.onGift(raw));
        this.sdk = true;
      } catch (e) {
        this.sdk = false;
      }
    }
    const B = window.BaiyaoPlugin;
    if (!this.bay && B && typeof B.onAction === 'function') {
      try {
        this.unsub = B.onAction(p => this.onAction(p));
        this.bay = true;
      } catch (e) {
        this.bay = false;
      }
    }
    if (this.sdk && this.bay && this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  fresh(id) {
    if (!id) return true;
    if (this.seen.has(id)) return false;
    this.seen.add(id);
    if (this.seen.size > SEEN_MAX) this.seen.delete(this.seen.values().next().value);
    return true;
  }

  onGift(raw) {
    if (!this.receiving()) return;
    const ev = normalizeGiftEvent(raw);
    if (!ev || !this.fresh(ev.id)) return;
    this.counts.gift++;
    this.fire(routeGift(this.getSettings(), ev));
  }

  /* 白曜里主播自己配的规则动作：不受"接收真实事件"开关限制；动作 ID 去重 */
  onAction(payload) {
    if (payload && payload.actionId && !this.fresh('act:' + payload.actionId)) return;
    const specs = specFromAction(this.getSettings(), payload);
    if (!specs) return;
    this.counts.action++;
    this.fire(specs);
  }

  /* 规则可能给出一条或好几条（捣乱池里随机来几下、来几只猫……） */
  fire(x, sim = false) {
    const list = Array.isArray(x) ? x : x ? [x] : [];
    let ok = false;
    for (const spec of list) {
      if (sim) spec.source = 'sim';
      ok = this.trigger(spec) || ok;
    }
    return ok;
  }

  /* ---------- 试玩面板用：不受接收开关限制，但走同样的规则；模拟的不进榜单 ---------- */
  sim(spec) {
    return this.fire(spec, true);
  }

  simGift(name, price, count, nick = '测试观众') {
    this.sim(routeGift(this.getSettings(), { kind: 'gift', nick, uid: 'sim-' + nick, gift: { name, count, diamond: price } }));
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    if (typeof this.unsub === 'function') this.unsub();
  }
}
