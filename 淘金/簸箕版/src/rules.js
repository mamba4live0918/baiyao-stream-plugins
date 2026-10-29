/* 淘金 3D · 直播事件 → 互动：指定礼物按规则表；其余礼物默认加矿（按单价选档）；弹幕公投；点赞攒够掉一袋小矿 */
import { ACTION_IDS } from './config.js';
import { buildSpec, tierIndexByPrice } from './tiers.js';

const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

function firstNum(...vals) {
  for (const v of vals) {
    const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
    if (typeof n === 'number' && Number.isFinite(n)) return n;
  }
  return null;
}

function who(d) {
  const u = isObj(d.user) ? d.user : {};
  return {
    nick: str(String(d.nickName ?? d.nickname ?? u.nickname ?? d.userName ?? ''), 30) || '观众',
    uid: str(String(d.userId ?? d.uid ?? u.id ?? ''), 40)
  };
}

const unwrap = raw => (isObj(raw) && isObj(raw.data) ? raw.data : raw);
const eventId = (raw, d) => str(String(raw.eventId ?? d.eventId ?? raw.msgId ?? d.msgId ?? ''), 120);

/* 宿主字段名不一：菘蓝 {nickName, giftName, count}，白曜原始回调另带 giftDiamond（单价），白曜规则事件 {user, gift:{name,count,diamond}} */
export function normalizeGiftEvent(raw) {
  if (!isObj(raw)) return null;
  const d = unwrap(raw);
  const g = isObj(d.gift) ? d.gift : d;
  if (d.comboEnd === true || g.comboEnd === true || d.effectiveGiftCount === 0) return null;
  const name = str(d.giftName ?? g.giftName ?? g.name ?? d.name, 80);
  const rawCount = firstNum(d.giftCount, d.count, d.comboCount, d.repeatCount, g.count);
  const count = rawCount === null ? 1 : Math.min(1000, Math.floor(rawCount));
  if (!name || count < 1) return null;
  const diamond = firstNum(d.giftDiamond, g.giftDiamond, g.diamond, d.diamond, d.diamondCount, g.diamondCount, d.price, g.price, d.giftPrice);
  return { kind: 'gift', ...who(d), gift: { name, count, diamond: diamond !== null && diamond >= 0 ? diamond : null }, id: eventId(raw, d) };
}

export function normalizeChatEvent(raw) {
  if (!isObj(raw)) return null;
  const d = unwrap(raw);
  const text = str(d.content ?? d.text ?? d.comment ?? '', 200);
  if (!text) return null;
  return { kind: 'chat', ...who(d), text, id: eventId(raw, d) };
}

export function normalizeLikeEvent(raw) {
  if (!isObj(raw)) return null;
  const d = unwrap(raw);
  const n = firstNum(d.count, d.likeCount, d.num);
  return { kind: 'like', ...who(d), count: n === null ? 1 : Math.max(1, Math.min(500, Math.floor(n))) };
}

const enabled = (settings, id) => !!(settings.actions[id] && settings.actions[id].enabled);

export function routeGift(settings, ev) {
  if (!ev) return null;
  const name = ev.gift.name.trim();
  const rule = settings.rules.gifts.find(r => r.name === name);
  if (rule) {
    if (!enabled(settings, rule.action)) return null;
    return buildSpec(settings, rule.action, rule.tier, ev.gift.count, ev.nick, 'gift');
  }
  const other = settings.rules.otherGifts;
  if (!other.enabled || !enabled(settings, other.action)) return null;
  const cfg = settings.actions[other.action];
  const price = ev.gift.diamond;
  const idx = price === null ? -1 : tierIndexByPrice(cfg.tiers.length, price, other.bands);
  return buildSpec(settings, other.action, idx < 0 ? cfg.defaultTier : cfg.tiers[idx].id, ev.gift.count, ev.nick, 'gift');
}

export class VoteBoard {
  constructor() {
    this.votes = new Map();
    this.fired = new Map();
  }

  vote(word, voter, now, windowSec) {
    const m = this.votes.get(word) || new Map();
    for (const [k, ts] of m) if (now - ts > windowSec) m.delete(k);
    m.set(voter, now);
    this.votes.set(word, m);
    return m.size;
  }

  canFire(word, now, cooldownSec) {
    return now - (this.fired.has(word) ? this.fired.get(word) : -Infinity) >= cooldownSec;
  }

  fire(word, now) {
    this.fired.set(word, now);
    this.votes.delete(word);
  }
}

export function routeChat(settings, ev, board, now) {
  const rule = settings.rules.chat;
  if (!rule.enabled || !ev) return null;
  for (const { word, action } of rule.words) {
    if (!word || !ev.text.includes(word) || !enabled(settings, action)) continue;
    const n = board.vote(word, ev.uid || ev.nick, now, rule.windowSec);
    if (n >= rule.threshold && board.canFire(word, now, rule.cooldownSec)) {
      board.fire(word, now);
      return buildSpec(settings, action, settings.actions[action].defaultTier, 1, n > 1 ? `${ev.nick} 等${n}人` : ev.nick, 'chat');
    }
  }
  return null;
}

export class LikeBoard {
  constructor() {
    this.acc = 0;
    this.last = -Infinity;
  }
}

export function routeLike(settings, ev, board, now) {
  const rule = settings.rules.like;
  if (!rule.enabled || !ev || !enabled(settings, rule.action)) return null;
  board.acc = Math.min(rule.pulses * 3, board.acc + Math.max(1, ev.count | 0));
  if (board.acc < rule.pulses || now - board.last < rule.cooldownSec) return null;
  board.acc = 0;
  board.last = now;
  return buildSpec(settings, rule.action, rule.tier, 1, '点赞大军', 'like');
}

/* 白曜规则动作：action = 互动 id；value = 第几档（从 1 数）；repeat = 白曜算好的次数，只放大幅度 */
export function specFromAction(settings, payload) {
  if (!isObj(payload) || !ACTION_IDS.includes(payload.action) || !enabled(settings, payload.action)) return null;
  const cfg = settings.actions[payload.action];
  const n = Number(payload.value);
  const tier = Number.isInteger(n) && n >= 1 && n <= cfg.tiers.length ? cfg.tiers[n - 1].id : cfg.defaultTier;
  const ev = isObj(payload.event) ? payload.event : {};
  const count = Number.isInteger(payload.repeat) && payload.repeat >= 1 ? Math.min(payload.repeat, 1000) : 1;
  const nick = str(isObj(ev.user) ? String(ev.user.nickname || '') : '', 30) || '观众';
  return buildSpec(settings, payload.action, tier, count, nick, payload.preview ? 'preview' : 'action');
}
