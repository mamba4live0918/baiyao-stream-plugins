/* 擦玻璃 · 直播礼物 → 互动：
   - 捣乱礼物：观众送一个，从捣乱池（主播勾上的那几样捣乱）里随机来 min～max 下；送几个就来几轮；
   - 保护礼物：观众送一个，来 min～max 台擦窗机器人，或者保护膜能挡 min～max 下；
   - 两张表里都没有的礼物：什么都不做（V1.6 起去掉了"表里没有的也来捣乱"）。
   弹幕、点赞不触发互动（V1.5 起不要了）。
   事件字段的兼容写法和淘金簸箕版一致（菘蓝 {nickName, giftName, count}，白曜原始回调另带 giftDiamond，白曜规则事件 {user, gift:{name,count,diamond}}） */
import { ACTION_IDS, actionDef, defaultQty } from './config.js';
import { buildSpec, SCALE_SAFE } from './tiers.js';

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

export function normalizeGiftEvent(raw) {
  if (!isObj(raw)) return null;
  const d = unwrap(raw);
  const g = isObj(d.gift) ? d.gift : d;
  if (d.comboEnd === true || g.comboEnd === true || d.effectiveGiftCount === 0) return null;
  const name = str(d.giftName ?? g.giftName ?? g.name ?? d.name, 80);
  const rawCount = firstNum(d.giftCount, d.count, d.comboCount, d.repeatCount, g.count);
  const count = rawCount === null ? 1 : Math.min(SCALE_SAFE, Math.floor(rawCount));
  if (!name || count < 1) return null;
  const diamond = firstNum(d.giftDiamond, g.giftDiamond, g.diamond, d.diamond, d.diamondCount, g.diamondCount, d.price, g.price, d.giftPrice);
  return { kind: 'gift', ...who(d), gift: { name, count, diamond: diamond !== null && diamond >= 0 ? diamond : null }, id: eventId(raw, d) };
}

const enabled = (settings, id) => !!(settings.actions[id] && settings.actions[id].enabled);

/* 礼物名比对：全角半角、大小写、空格、表情和符号都不算（主播随手打的和平台发来的能对上） */
export function giftKey(name) {
  return String(name || '')
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}]/gu, '')
    .toLowerCase();
}

/* 一种互动一下子来这么多份以内就一份份出；再多就合成一条放大（排队时再拆批） */
const SPLIT = 40;
/* 轮数多到这个数以上，总下数按平均算（不然要掷很久的骰子） */
const DRAW_EXACT = 20000;

/* 某种互动来 q 份：能改数量的直接改（几个 / 几团 / 几杯 / 几张 / 能挡几下）；来几只的出 q 条，太多就合成一条把主要参数放大 */
export function qtySpecs(settings, id, q, who, source, extra = {}) {
  const def = actionDef(id);
  if (!def || !enabled(settings, id) || !(q >= 1)) return [];
  /* 不封顶，只防一个离谱的数（坏消息之类，正常用不到） */
  const n = Math.min(SCALE_SAFE, Math.floor(q));
  const base = () => buildSpec(settings, id, settings.actions[id].defaultTier, 1, who, source, extra);
  if (!def.qty.spawn) {
    const sp = base();
    sp.params[def.qty.key] = n;
    return [sp];
  }
  if (n <= SPLIT) return Array.from({ length: n }, base);
  const sp = base();
  sp.params[def.scale] = Math.min(SCALE_SAFE, sp.params[def.scale] * n);
  return [sp];
}

/* times 轮、每轮在 min～max 之间随机，一共多少（轮数太多就按平均算） */
export function drawTotal(min, max, times, random = Math.random) {
  const lo = Math.max(0, Math.floor(Math.min(min, max)));
  const hi = Math.max(0, Math.floor(Math.max(min, max)));
  const t = Math.floor(times);
  if (!(t >= 1)) return 0;
  if (lo === hi) return lo * t;
  if (t > DRAW_EXACT) return Math.round(((lo + hi) / 2) * t);
  let n = 0;
  for (let i = 0; i < t; i++) n += lo + Math.floor(random() * (hi - lo + 1));
  return n;
}

/* 捣乱池里随机来 draws 下：每一下随机挑一样勾上的捣乱，按出厂的量来（鸡蛋 2 个、泥巴 3 团、一只猫……） */
export function poolSpecs(settings, draws, who, source, extra = {}, random = Math.random) {
  const pool = (settings.rules.pool || []).filter(id => enabled(settings, id));
  if (!pool.length || !(draws >= 1)) return [];
  const pick = () => pool[Math.floor(random() * pool.length)];
  if (draws <= SPLIT) {
    const out = [];
    for (let i = 0; i < draws; i++) {
      const id = pick();
      out.push(...qtySpecs(settings, id, defaultQty(id), who, source, extra));
    }
    return out;
  }
  /* 太多下：先数每样各来几下，再按种类合成几条（排队时再拆批） */
  const n = Math.min(Math.floor(draws), 200000);
  const tally = new Map();
  for (let i = 0; i < n; i++) {
    const id = pick();
    tally.set(id, (tally.get(id) || 0) + 1);
  }
  const out = [];
  for (const [id, k0] of tally) {
    const k = Math.round((k0 * draws) / n);
    if (k > 0) out.push(...qtySpecs(settings, id, Math.min(SCALE_SAFE, k * defaultQty(id)), who, source, extra));
  }
  return out;
}

const orNull = list => (list.length ? list : null);

export function routeGift(settings, ev, random = Math.random) {
  if (!ev) return null;
  const key = giftKey(ev.gift.name);
  const count = Math.max(1, Math.floor(ev.gift.count) || 1);
  const extra = { uid: ev.uid };
  const r = settings.rules;
  const mess = key ? r.mess.find(g => giftKey(g.name) === key) : null;
  if (mess) return orNull(poolSpecs(settings, drawTotal(mess.min, mess.max, count, random), ev.nick, 'gift', extra, random));
  const help = key ? r.help.find(g => giftKey(g.name) === key) : null;
  if (help) return orNull(qtySpecs(settings, help.action, drawTotal(help.min, help.max, count, random), ev.nick, 'gift', extra));
  return null;
}

/* 白曜规则动作：action = 互动 id；value = 数量（几个 / 几团 / 几只，不填用默认数量）；repeat = 白曜算好的次数，再乘上去 */
export function specFromAction(settings, payload) {
  if (!isObj(payload) || !ACTION_IDS.includes(payload.action) || !enabled(settings, payload.action)) return null;
  const v = Number(payload.value);
  const n = Number.isFinite(v) && v >= 1 ? Math.floor(v) : defaultQty(payload.action);
  const ev = isObj(payload.event) ? payload.event : {};
  const user = isObj(ev.user) ? ev.user : {};
  const repeat = Number.isInteger(payload.repeat) && payload.repeat >= 1 ? payload.repeat : 1;
  const nick = str(String(user.nickname || ''), 30) || '观众';
  const out = qtySpecs(settings, payload.action, n * repeat, nick, payload.preview ? 'preview' : 'action', { uid: str(String(user.id || ''), 40) });
  return out.length ? out : null;
}
