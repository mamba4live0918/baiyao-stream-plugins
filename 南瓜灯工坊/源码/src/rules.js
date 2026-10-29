/* 南瓜灯工坊新版 · 直播输入只在这里解析；弹幕原文不进入互动队列。大数量按种类汇总，数量完整交给队列。
   新版只有：订南瓜（弹幕口令 / 订南瓜礼物）和四种捣乱（妖风、黑猫、女巫、小鬼）。 */
import { safeName } from './text.js';

export const MESS_IDS = ['wind', 'cat', 'witch', 'ghost'];
export const MESS_NAMES = { wind: '妖风', cat: '黑猫', witch: '女巫', ghost: '小鬼' };
export const ACTION_IDS = ['order', 'candy', 'help', ...MESS_IDS];
export const DEFAULT_KEYWORDS = ['南瓜灯','要南瓜灯','我要南瓜灯','刻南瓜','刻南瓜灯','来个南瓜灯','来一个南瓜灯'];
const isObj = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const plain = value => typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
const unwrap = raw => isObj(raw.data) ? raw.data : raw;
const identity = data => {
  const user = isObj(data.user) ? data.user : {};
  const originalNick=plain(data.nickName ?? data.nickname ?? data.nick ?? user.nickname ?? user.nickName ?? user.name ?? data.userName);
  // 头像：只收 http(s) 网址或 data:image（灯展上画头像用；白曜里请白曜代下载，下不到就画名字首字，见 avatars.js）
  const avatar = [data.avatar, data.avatarUrl, data.avatarThumb, user.avatar, user.avatarUrl].map(plain).find(v => /^(https?:\/\/|data:image\/)/i.test(v) && v.length <= 4096) || '';
  return {
    nick: safeName(originalNick),
    uid: [data.userId, data.uid, user.id, user.uid].map(plain).find(Boolean) || 'nick:'+originalNick,
    ...(avatar ? { avatar } : {})
  };
};
const eventId = (raw, data) => [raw.eventId, data.eventId, raw.msgId, data.msgId, raw.id, data.id].map(plain).find(Boolean) || '';
const first = (...values) => values.find(value => value !== undefined && value !== null);
const positive = (value, fallback = 1, fractional = false) => {
  const number = value === undefined || value === null ? fallback : Number(value);
  if (!Number.isFinite(number) || number <= 0) return 0;
  return fractional ? number : Math.floor(number);
};
const normalized = value => String(value ?? '').normalize('NFKC').toLowerCase().trim();
const roll = random => Math.max(0, Math.min(1 - Number.EPSILON, Number(random()) || 0));
let fallbackIdSequence = 0;

export function createEventId(env = globalThis) {
  try {
    const id = env.crypto?.randomUUID?.();
    if (id) return String(id);
  } catch { /* 不安全上下文或旧宿主仍可使用带序号的随机回退。 */ }
  fallbackIdSequence++;
  return `${Date.now().toString(36)}-${fallbackIdSequence.toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function normalizeGiftEvent(raw) {
  if (!isObj(raw)) return null;
  const data = unwrap(raw), gift = isObj(data.gift) ? data.gift : data;
  if (data.comboEnd === true || gift.comboEnd === true) return null;
  const name = plain(data.giftName ?? gift.giftName ?? gift.name ?? data.name);
  const count = positive(first(data.effectiveGiftCount, gift.effectiveGiftCount, data.giftCount, data.count, data.comboCount, data.repeatCount, gift.count));
  if (!name || count < 1) return null;
  return { kind: 'gift', ...identity(data), gift: { name, count }, id: eventId(raw, data) };
}

export function normalizeCommentEvent(raw) {
  if (!isObj(raw)) return null;
  const data = unwrap(raw);
  const content = data.content ?? data.text;
  if (typeof content !== 'string' || !content.trim()) return null;
  return { kind: 'comment', ...identity(data), content, id: eventId(raw, data) };
}

export function giftKey(name) {
  return normalized(name).replace(/[^\p{L}\p{N}]/gu, '');
}

/* 普通礼物逐轮随机；极大量沿用参考插件的均值合并，避免阻塞浏览器，不截断礼物数。 */
export function drawTotal(min, max, times, random = Math.random) {
  const a = Number(min), b = Number(max), rounds = positive(times, 0);
  if (!Number.isFinite(a) || !Number.isFinite(b) || !rounds) return 0;
  const lo = Math.max(0, Math.floor(Math.min(a, b))), hi = Math.max(0, Math.floor(Math.max(a, b)));
  if (lo === hi) return lo * rounds;
  let total = 0;
  for (let i = 0; i < rounds; i++) total += lo + Math.floor(roll(random) * (hi - lo + 1));
  return total;
}

/* via:'gift' 标记送礼物点单：不受「每人同时几单」限制（那是给弹幕点单用的）。 */
const spec = (kind, count, who, source, via) => ({ kind, nick: safeName(who?.nick), uid: plain(who?.uid), id: plain(who?.id), count, source, ...(via ? { via } : {}), ...(who?.avatar ? { avatar: who.avatar } : {}) });

export function poolSpecs(settings, draws, who, source = 'gift', random = Math.random) {
  const pool = [...new Set((Array.isArray(settings?.rules?.pool) ? settings.rules.pool : []).filter(id => MESS_IDS.includes(id)))];
  const count = positive(draws, 0);
  if (!pool.length || !count) return [];
  if (pool.length === 1) return [spec(pool[0], count, who, source)];
  const samples = Math.min(count, 20000), tally = new Map();
  for (let i = 0; i < samples; i++) {
    const kind = pool[Math.floor(roll(random) * pool.length)];
    tally.set(kind, (tally.get(kind) || 0) + 1);
  }
  /* 大数按采样比例分配，累计边界取整确保总量严格等于 count。 */
  let cumulative = 0, allocated = 0;
  const result = [];
  for (const [kind, hits] of tally) {
    cumulative += hits;
    const boundary = cumulative === samples ? count : Math.round(cumulative / samples * count);
    const quantity = boundary - allocated;
    allocated = boundary;
    if (quantity > 0) result.push(spec(kind, quantity, who, source));
  }
  return result;
}

export function routeGift(settings, event, random = Math.random) {
  if (!isObj(settings) || !event?.gift) return null;
  const key = giftKey(event.gift.name), count = positive(event.gift.count, 0);
  if (!key || !count) return null;
  // 只有两张表：订南瓜、捣乱；表里没有的礼物什么都不做
  return routeTables(settings, event, key, count, random);
}

function routeTables(settings, event, key, count, random) {
  const rules = settings.rules || {};
  const find = table => (Array.isArray(rules[table]) ? rules[table] : []).find(row => isObj(row) && typeof row.name === 'string' && giftKey(row.name) === key);
  const order = find('order');
  if (order) {
    const customers = drawTotal(order.min, order.max, count, random);
    return Number.isFinite(customers) && customers > 0 ? [spec('order', customers, event, 'gift', 'gift')] : null;
  }
  const help = find('help');   // 帮做礼物：南瓜精灵帮主播把排队的南瓜做成灯
  if (help) {
    const n = drawTotal(help.min, help.max, count, random);
    return n > 0 ? [spec('help', n, event, 'gift')] : null;
  }
  const candy = find('candy');   // 送糖礼物：给主播的糖罐加糖
  if (candy) {
    const n = drawTotal(candy.min, candy.max, count, random);
    return n > 0 ? [spec('candy', n, event, 'gift')] : null;
  }
  const mess = find('mess');
  if (!mess) return null;
  const result = poolSpecs(settings, drawTotal(mess.min, mess.max, count, random), event, 'gift', random);
  return result.length ? result : null;
}

export function routeComment(settings, event) {
  if (!event || settings.order?.enabled === false) return null;
  const compact=v=>normalized(v).replace(/[\p{Z}\p{P}\p{S}\p{Cf}\p{M}\s]/gu,'');
  const content = compact(event.content);
  const custom = settings.order?.keywords;
  const keywords = Array.isArray(custom) ? custom : typeof custom === 'string' ? custom.split(/[,，、\s]+/u) : DEFAULT_KEYWORDS;
  const words = keywords.map(compact).filter(Boolean);
  const faces={笑:'smile',笑脸:'smile',哭:'cry',哭脸:'cry',气:'angry',生气:'angry',惊:'surprise',吃惊:'surprise',猫:'cat',猫猫:'cat',鬼:'goofy',鬼脸:'goofy',困:'sleepy',困困:'sleepy',爱心:'heart',星星:'star',吸血鬼:'vampire',圆眼:'round',经典:'classic'};
  for(const word of words){
    if(content===word)return spec('order',1,event,'comment');
    for(const [name,face]of Object.entries(faces))if(content===word+name||content===name+word)return {...spec('order',1,event,'comment'),face:settings.order?.faces===false?null:face};
  }return null;
}

/* 白曜自配动作（order / wind / cat / witch / ghost）不受真实礼物接收开关限制。 */
export function specFromAction(settings, payload) {
  if (!isObj(payload) || !ACTION_IDS.includes(payload.action)) return null;
  const count = positive(payload.value, 1) * positive(payload.repeat, 1);
  if (!Number.isFinite(count) || count <= 0) return null;
  const event = isObj(payload.event) ? payload.event : payload;
  const id = plain(payload.actionId) || eventId(payload, event);
  // 白曜规则「礼物 → 点单」和本插件的点单礼物表一样，不受每人几单限制。
  const via = payload.action === 'order' && event.type === 'gift' ? 'gift' : undefined;
  return spec(payload.action, count, { ...identity(event), id }, payload.preview ? 'preview' : 'action', via);
}
