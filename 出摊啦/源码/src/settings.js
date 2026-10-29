/* 出摊啦 · 独立设置存取。只读写本插件键，不保存顾客队列。 */
import { defaultZone, sanitizeZone } from './zone.js';

export const KEY_SETTINGS = 'chutan.v1_1.settings';
export const KEY_STATS = 'chutan.v1_1.stats';
export const MESS_IDS = Object.freeze(['fire', 'thief', 'blackout', 'cat', 'tour', 'boom', 'spice']);
export const HELP_IDS = Object.freeze(['helper', 'guard']);
export const SHOPS = Object.freeze(['noodle', 'sushi', 'pancake', 'tea']);
const DEFAULT_ORDER_KEYWORDS = Object.freeze(['点单', '来一份', '来一碗', '来一杯', '来一盘']);
/* V1.2：送礼物点单。旧设置没有这张表时补上默认行；礼物名已被捣乱/帮忙占用就不补。 */
const DEFAULT_ORDER_GIFTS = Object.freeze([Object.freeze({ name: '小心心', min: 1, max: 1 })]);
const EXAMPLE_GIFT_NAMES = Object.freeze({ order: ['小心心', '人气票', '抖音'], mess: ['人气票', '抖音', '小心心'], help: ['玫瑰', '棒棒糖', '大啤酒'] });
const LEGACY_ORDER_KEYWORDS = Object.freeze([...DEFAULT_ORDER_KEYWORDS, '来个']);
const obj = v => v && typeof v === 'object' && !Array.isArray(v) ? v : {};
const bool = (v, fallback) => typeof v === 'boolean' ? v : fallback;
const finite = v => typeof v === 'number' && Number.isFinite(v);
const integer = (v, fallback, min = 0) => finite(v) && v >= min ? Math.min(Number.MAX_SAFE_INTEGER, Math.floor(v)) : fallback;
const positive = (v, fallback) => finite(v) && v > 0 ? v : fallback;
const fraction = (v, fallback) => finite(v) ? Math.min(1, Math.max(0, v)) : fallback;
export const normalizeGiftName = v => String(v ?? '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

function defaultCooking() {
  return {
    quantities: { noodle: [1,3], sushi: [3,5], pancake: [1,2], tea: [1,3] },
    baseCoins: 15, differenceCoins: 3, ruinedCoins: 0, fine: 10,
    shortProbabilities: [.15,.4,.7], discounts: { impatient: .8, angry: .5 },
    capacity: 0, fishPieces: 8, spoilProbability: .5, spoilFine: 10,
    heat: { noodle: {cookSeconds:4,readySeconds:6,smokeSeconds:3}, pancake: {cookSeconds:4,readySeconds:6,smokeSeconds:3}, tea: {cookSeconds:4,readySeconds:6,smokeSeconds:3} }
  };
}
export const defaultSabotage=()=>({fireSeconds:8,thiefSeconds:6,stealFraction:.3,blackoutSeconds:20,catSeconds:4,tourSize:10,helperInterval:.9,bannerSeconds:2.4,shake:true,wanted:true});
export function sanitizeSabotage(raw){
 const x=obj(raw),d=defaultSabotage(),result={};
 for(const key of ['fireSeconds','thiefSeconds','blackoutSeconds','catSeconds','helperInterval','bannerSeconds'])result[key]=positive(x[key],d[key]);
 return{...result,stealFraction:fraction(x.stealFraction,d.stealFraction),tourSize:integer(x.tourSize,d.tourSize,1),shake:bool(x.shake,d.shake),wanted:bool(x.wanted,d.wanted)};
}

export function sanitizeCooking(raw, legacySmokeSeconds) {
  const x = obj(raw), d = defaultCooking(), input = obj(x.quantities), discounts = obj(x.discounts);
  const quantities = Object.fromEntries(SHOPS.map(shop => {
    const pair = Array.isArray(input[shop]) ? input[shop] : [];
    const min = integer(pair[0], d.quantities[shop][0], 1), max = integer(pair[1], d.quantities[shop][1], 1);
    return [shop, [Math.min(min,max), Math.max(min,max)]];
  }));
  return {
    quantities,
    baseCoins: integer(x.baseCoins, d.baseCoins), differenceCoins: integer(x.differenceCoins, d.differenceCoins),
    ruinedCoins: integer(x.ruinedCoins, d.ruinedCoins), fine: integer(x.fine, d.fine),
    shortProbabilities: d.shortProbabilities.map((value,index) => fraction(Array.isArray(x.shortProbabilities) ? x.shortProbabilities[index] : undefined, value)),
    discounts: { impatient: fraction(discounts.impatient,d.discounts.impatient), angry: fraction(discounts.angry,d.discounts.angry) },
    capacity: integer(x.capacity,d.capacity), fishPieces: integer(x.fishPieces,d.fishPieces,1),
    spoilProbability: fraction(x.spoilProbability,d.spoilProbability), spoilFine: integer(x.spoilFine,d.spoilFine),
    heat: Object.fromEntries(['noodle','pancake','tea'].map(shop=>{
      const heat=obj(obj(x.heat)[shop]),defaults=d.heat[shop];
      return [shop,{
        cookSeconds:positive(heat.cookSeconds,positive(x.cookSeconds,defaults.cookSeconds)),
        readySeconds:positive(heat.readySeconds,positive(x.readySeconds,defaults.readySeconds)),
        smokeSeconds:positive(heat.smokeSeconds,positive(legacySmokeSeconds,defaults.smokeSeconds))
      }];
    }))
  };
}

export function defaultSettings() {
  return {
    shop: 'noodle',
    live: { receive: true },
    order: { enabled: true, keywords: [...DEFAULT_ORDER_KEYWORDS], perPerson: 1,
      abandon: {enabled:false,angryWaitSeconds:60,penalty:'coins',amount:10} },
    crowd: { compress: true, moodSeconds: [30, 60, 120] },
    cooking: defaultCooking(),
    sabotage: defaultSabotage(),
    rules: { pool: [...MESS_IDS], mess: [], help: [], order: DEFAULT_ORDER_GIFTS.map(row => ({ ...row })) },
    display: { zone: defaultZone(), names: true },
    audio: { enabled: true, volume: 0.3 },
    rent: { enabled: true, minutes: 10, coins: 100, perCoins: 10, addMinutes: 1, hours: 2 },
    limits: { queue: 0 }
  };
}

export function sanitizeSettings(raw) {
  const x = obj(raw), d = defaultSettings();
  const live = obj(x.live), order = obj(x.order), crowd = obj(x.crowd), rules = obj(x.rules), display = obj(x.display), audio = obj(x.audio), rent = obj(x.rent), limits = obj(x.limits), abandon = obj(order.abandon);
  const moodSeconds = [];
  for (let index = 0; index < 3; index += 1) {
    const input = Array.isArray(crowd.moodSeconds) ? crowd.moodSeconds[index] : undefined;
    const value = Math.min(Number.MAX_SAFE_INTEGER - (2 - index), integer(input, d.crowd.moodSeconds[index]));
    moodSeconds.push(Math.max(index ? moodSeconds[index - 1] + 1 : 0, value));
  }
  const seen = new Set();
  const rows = (input, help = false) => (Array.isArray(input) ? input : []).flatMap(item => {
    const row = obj(item);
    if (typeof row.name !== 'string') return [];
    const name = row.name.trim(), key = normalizeGiftName(name);
    if (!key || seen.has(key) || (help && !HELP_IDS.includes(row.action))) return [];
    seen.add(key);
    const a = integer(row.min, 1, 1), b = integer(row.max, a, 1);
    return [{ name, ...(help ? { action: row.action } : {}), min: Math.min(a,b), max: Math.max(a,b) }];
  });
  const mess = rows(rules.mess), help = rows(rules.help, true);
  const orderGifts = rows(Array.isArray(rules.order) ? rules.order : DEFAULT_ORDER_GIFTS);
  const keywords = Array.isArray(order.keywords) ? [...new Set(order.keywords.filter(v => typeof v === 'string').map(v => v.trim()).filter(Boolean))] : d.order.keywords;
  const legacyKeywords = keywords.length === LEGACY_ORDER_KEYWORDS.length && LEGACY_ORDER_KEYWORDS.every(word => keywords.includes(word));
  return {
    shop: SHOPS.includes(x.shop) ? x.shop : d.shop,
    live: { receive: bool(live.receive, d.live.receive) },
    order: {
      enabled: bool(order.enabled, d.order.enabled),
      keywords: legacyKeywords ? [...DEFAULT_ORDER_KEYWORDS] : keywords,
      perPerson: integer(order.perPerson, d.order.perPerson),
      abandon: {
        enabled:bool(abandon.enabled,d.order.abandon.enabled),
        angryWaitSeconds:positive(abandon.angryWaitSeconds,d.order.abandon.angryWaitSeconds),
        penalty:['coins','rent'].includes(abandon.penalty)?abandon.penalty:d.order.abandon.penalty,
        amount:integer(abandon.amount,d.order.abandon.amount)
      }
    },
    crowd: { compress: bool(crowd.compress, d.crowd.compress), moodSeconds },
    cooking: sanitizeCooking(x.cooking,obj(x.sabotage).smokeSeconds),
    sabotage: sanitizeSabotage(x.sabotage),
    rules: { pool: Array.isArray(rules.pool) ? [...new Set(rules.pool.filter(id => MESS_IDS.includes(id)))] : d.rules.pool, mess, help, order: orderGifts },
    display: { zone: sanitizeZone(display.zone), names: bool(display.names, d.display.names) },
    audio: { enabled: bool(audio.enabled, d.audio.enabled), volume: finite(audio.volume) ? Math.min(1, Math.max(0, audio.volume)) : d.audio.volume },
    rent: {
      enabled: bool(rent.enabled, d.rent.enabled), minutes: positive(rent.minutes, d.rent.minutes),
      coins: integer(rent.coins, d.rent.coins), perCoins: positive(rent.perCoins, d.rent.perCoins),
      addMinutes: positive(rent.addMinutes, d.rent.addMinutes),
      // V1.5 起加班都送去白曜加班机：旧存档里的 mode（咩播 / 自带加班机）不要了；
      // hours 是 V1.4 自带加班机的「今天播多久」，V1.5 不用，留着是为了退回 V1.4 还在
      hours: positive(rent.hours, d.rent.hours)
    },
    limits: { queue: integer(limits.queue, d.limits.queue) }
  };
}

/* 一键示例：只填空着的表，每张一个常见礼物；名字已在别的表里就换下一个。返回新对象。 */
export function fillExampleGifts(rules) {
  const current = obj(rules), tables = { order: [], mess: [], help: [] };
  for (const list of Object.keys(tables)) tables[list] = Array.isArray(current[list]) ? current[list].map(row => ({ ...row })) : [];
  const used = new Set(Object.values(tables).flat().map(row => normalizeGiftName(row.name)));
  for (const list of ['order', 'mess', 'help']) {
    if (tables[list].length) continue;
    const name = EXAMPLE_GIFT_NAMES[list].find(candidate => !used.has(normalizeGiftName(candidate)));
    if (!name) continue;
    used.add(normalizeGiftName(name));
    tables[list] = [{ name, ...(list === 'help' ? { action: 'helper' } : {}), min: 1, max: 1 }];
  }
  const pool = Array.isArray(current.pool) ? [...current.pool] : [...MESS_IDS];
  return { ...current, ...tables, pool: tables.mess.length && !pool.length ? ['fire'] : pool };
}

export function loadSettings(storage) {
  try {
    let raw = storage.getItem(KEY_SETTINGS);
    const migrate = raw == null;
    if(migrate){
      for(const key of ['chutan.v1.settings']){
        raw=storage.getItem(key);if(raw!=null)break;
      }
    }
    const settings=raw == null?defaultSettings():sanitizeSettings(JSON.parse(raw));
    if(migrate&&raw!=null)saveSettings(storage,settings);
    return { settings, readable: true };
  } catch {
    return { settings: defaultSettings(), readable: false };
  }
}

export function saveSettings(storage, settings) {
  try {
    storage.setItem(KEY_SETTINGS, JSON.stringify(sanitizeSettings(settings)));
    return true;
  } catch { return false; }
}
