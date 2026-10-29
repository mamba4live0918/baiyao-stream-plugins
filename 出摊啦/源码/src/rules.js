/* 直播输入只在这里解析；弹幕原文不进入互动队列。大数量按种类汇总，数量完整交给队列。 */
import { safeName } from './text.js';

export const MESS_IDS = ['fire', 'thief', 'blackout', 'cat', 'tour', 'boom', 'spice'];
export const ACTION_IDS = ['order', ...MESS_IDS, 'helper', 'guard', 'overtime'];
const DEFAULT_KEYWORDS = ['点单', '来一份', '来一碗', '来一杯', '来一盘'];
const SHOP_WORDS = {
  noodle: ['来碗面', '吃面', '一碗面', '来份面'], pancake: ['煎饼'], tea: ['奶茶'],
  milktea: ['奶茶'], sushi: ['生鱼片', '刺身'], sashimi: ['生鱼片', '刺身']
};
const isObj = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const plain = value => typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
const unwrap = raw => isObj(raw.data) ? raw.data : raw;
const identity = data => {
  const user = isObj(data.user) ? data.user : {};
  return {
    nick: safeName(data.nickName ?? data.nickname ?? data.nick ?? user.nickname ?? user.nickName ?? user.name ?? data.userName),
    uid: [data.userId, data.uid, user.id, user.uid].map(plain).find(Boolean) || ''
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
  if (rounds > 20000) return Math.round((lo + hi) / 2 * rounds);
  let total = 0;
  for (let i = 0; i < rounds; i++) total += lo + Math.floor(roll(random) * (hi - lo + 1));
  return total;
}

/* via:'gift' 标记送礼物点单：不受「每人同时几单」限制（那是给弹幕点单用的）。 */
const spec = (kind, count, who, source, via) => ({ kind, nick: safeName(who?.nick), uid: plain(who?.uid), id: plain(who?.id), count, source, ...(via ? { via } : {}) });

export function poolSpecs(settings, draws, who, source = 'gift', random = Math.random) {
  const pool = [...new Set((settings.rules?.pool || []).filter(id => MESS_IDS.includes(id)))];
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
  if (!event?.gift) return null;
  const key = giftKey(event.gift.name), count = positive(event.gift.count, 0);
  if (!key || !count) return null;
  // V1.5 起礼物加减时间在白曜加班机里设，这里只管点单、捣乱、帮忙三张表
  return routeTables(settings, event, key, count, random);
}

function routeTables(settings, event, key, count, random) {
  const rules = settings.rules || {};
  const order = (rules.order || []).find(row => giftKey(row.name) === key);
  if (order) {
    const customers = drawTotal(order.min, order.max, count, random);
    return customers > 0 ? [spec('order', customers, event, 'gift', 'gift')] : null;
  }
  const mess = (rules.mess || []).find(row => giftKey(row.name) === key);
  if (mess) {
    const result = poolSpecs(settings, drawTotal(mess.min, mess.max, count, random), event, 'gift', random);
    return result.length ? result : null;
  }
  const help = (rules.help || []).find(row => giftKey(row.name) === key);
  if (!help || !['helper', 'guard'].includes(help.action)) return null;
  const quantity = drawTotal(help.min, help.max, count, random);
  return quantity > 0 ? [spec(help.action, quantity, event, 'gift')] : null;
}

export function routeComment(settings, event) {
  if (!event || settings.order?.enabled === false) return null;
  const content = normalized(event.content);
  const custom = settings.order?.keywords;
  const keywords = Array.isArray(custom) ? custom : typeof custom === 'string' ? custom.split(/[,，、\s]+/u) : DEFAULT_KEYWORDS;
  const words = [...keywords, ...(SHOP_WORDS[settings.shop] || [])].map(normalized).filter(Boolean);
  return words.some(word => content.includes(word)) ? spec('order', 1, event, 'comment') : null;
}

/* 白曜自配动作不受真实礼物接收开关限制。overtime 的 count 单位为分钟。 */
export function specFromAction(settings, payload) {
  if (!isObj(payload) || !ACTION_IDS.includes(payload.action)) return null;
  const count = positive(payload.value, 1, payload.action === 'overtime') * positive(payload.repeat, 1);
  if (!Number.isFinite(count) || count <= 0) return null;
  const event = isObj(payload.event) ? payload.event : payload;
  const id = plain(payload.actionId) || eventId(payload, event);
  // 白曜规则「礼物 → 点单」和本插件的点单礼物表一样，不受每人几单限制。
  const via = payload.action === 'order' && event.type === 'gift' ? 'gift' : undefined;
  return spec(payload.action, count, { ...identity(event), id }, payload.preview ? 'preview' : 'action', via);
}
