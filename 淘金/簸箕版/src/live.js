/* 淘金 3D · 直播接入：菘蓝/白曜 SDK 的礼物、弹幕、点赞，白曜规则动作；试玩面板的模拟事件走同一条路 */
import { normalizeGiftEvent, normalizeChatEvent, normalizeLikeEvent, routeGift, routeChat, routeLike, VoteBoard, LikeBoard, specFromAction } from './rules.js';

const SEEN_MAX = 2000;
const nowSec = () => performance.now() / 1000;

export class Live {
  constructor(game, getSettings) {
    this.game = game;
    this.getSettings = getSettings;
    this.votes = new VoteBoard();
    this.likes = new LikeBoard();
    this.seen = new Set();
    this.sdk = false;
    this.bay = false;
    this.counts = { gift: 0, chat: 0, like: 0, action: 0 };
  }

  start() {
    this.tryBind();
    setInterval(() => this.tryBind(), 1500);
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

  /* SDK 可能晚于页面脚本注入，所以轮询绑定，各只绑定一次 */
  tryBind() {
    const S = window.SonglanPlugin;
    if (!this.sdk && S && typeof S.onGift === 'function') {
      try {
        S.onGift(raw => this.onGift(raw));
        this.sdk = true;
      } catch (e) {
        this.sdk = false;
      }
      /* 弹幕、点赞各自注册：其中一个出错不影响礼物，也不会让礼物被重复注册 */
      if (this.sdk) {
        try {
          if (typeof S.onChat === 'function') S.onChat(raw => this.onChat(raw));
        } catch (e) {
          /* 弹幕接不上就算了 */
        }
        try {
          if (typeof S.onLike === 'function') S.onLike(raw => this.onLike(raw));
        } catch (e) {
          /* 点赞接不上就算了 */
        }
      }
    }
    const B = window.BaiyaoPlugin;
    if (!this.bay && B && typeof B.onAction === 'function') {
      try {
        B.onAction(p => this.onAction(p));
        this.bay = true;
      } catch (e) {
        this.bay = false;
      }
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
    this.game.trigger(routeGift(this.getSettings(), ev));
  }

  onChat(raw) {
    if (!this.receiving()) return;
    const ev = normalizeChatEvent(raw);
    if (!ev || !this.fresh(ev.id)) return;
    this.counts.chat++;
    this.game.trigger(routeChat(this.getSettings(), ev, this.votes, nowSec()));
  }

  onLike(raw) {
    if (!this.receiving()) return;
    const ev = normalizeLikeEvent(raw);
    if (!ev) return;
    this.counts.like++;
    this.game.trigger(routeLike(this.getSettings(), ev, this.likes, nowSec()));
  }

  /* 白曜里主播自己配的规则动作：不受“接收真实事件”开关限制 */
  onAction(payload) {
    const spec = specFromAction(this.getSettings(), payload);
    if (!spec) return;
    this.counts.action++;
    this.game.trigger(spec);
  }

  /* ---------- 试玩面板用：不受接收开关限制，但走同样的规则 ---------- */
  /* 模拟出来的互动标成 sim：照常生效，但不进矿主榜/大盗榜 */
  sim(spec) {
    if (spec) spec.source = 'sim';
    return this.game.trigger(spec);
  }

  simGift(name, price, count, nick = '测试观众') {
    this.sim(routeGift(this.getSettings(), { kind: 'gift', nick, uid: 'sim', gift: { name, count, diamond: price } }));
  }

  simVotes(word, voters) {
    const base = Date.now();
    for (let i = 0; i < voters; i++) {
      const ev = { kind: 'chat', nick: '测试' + (i + 1), uid: 'sim' + base + i, text: word };
      this.sim(routeChat(this.getSettings(), ev, this.votes, nowSec()));
    }
  }

  simLikes(n) {
    this.sim(routeLike(this.getSettings(), { kind: 'like', nick: '测试观众', uid: 'sim', count: n }, this.likes, nowSec()));
  }
}
