/* 擦玻璃 · 设置校验与存档：坏数据回落默认值；存储被拒绝时只提示，不影响玩。
   每次存档格式大改都换一个新键名，旧键名只读不写——回退到旧版插件时它读到的还是它自己的格式，两边互不打架：
   - 第 7 版（V1.5：捣乱池 + 捣乱礼物 / 保护礼物，多边形露脸区）存在 glass2d.v3.settings；
   - 第 6 版（V1.4：礼物表 礼物名 → 干什么 → 数量）在 glass2d.v2.settings；
   - 第 5 版及更早（V1.3 以前）在 glass2d.v1.settings。
   新键名还没有时，从最近的旧键名搬过来（读的时候不写，下次保存才写到新键名）。 */
import { ACTIONS, MESS_IDS, HELP_IDS, defaultSettings, defaultQty } from './config.js';
import { sanitizeZone } from './zone.js';
import { findTier } from './tiers.js';
import { giftKey } from './rules.js';

export const KEY_SETTINGS = 'glass2d.v3.settings';
export const KEY_SETTINGS_V2 = 'glass2d.v2.settings';
export const KEY_SETTINGS_V1 = 'glass2d.v1.settings';
export const KEY_STATS = 'glass2d.v1.stats';
export const KEY_STATS_DEMO = 'glass2d.v1.demo-stats';

const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const num = (v, min, max, def) => (typeof v === 'number' && Number.isFinite(v) ? clamp(v, min, max) : def);
const int = (v, min, max, def) => Math.round(num(v, min, max, def));
const bool = (v, def) => (typeof v === 'boolean' ? v : def);
/* 礼物表一行最多来多少 */
export const QTY_MAX = 9999;
const fromOld = (v, oldDefaults, def) => (oldDefaults.includes(v) ? def : v);
/* 上限能填多大（0 = 不限） */
export const LIMIT_MAX = 1000000;
export const ACTOR_KINDS = ['cat', 'bird', 'gecko', 'robot', 'flyer'];

/* 随机范围：两头都是 1–9999 的整数，填反了就对调 */
export function cleanRange(g, def) {
  let min = int(g.min, 1, QTY_MAX, def.min);
  let max = int(g.max, 1, QTY_MAX, def.max);
  if (max < min) [min, max] = [max, min];
  return { min, max };
}

export function sanitizeSettings(raw) {
  const d = defaultSettings();
  const r = isObj(raw) ? raw : {};
  /* 互动的参数（大小、速度这些）不让人改：一律用出厂的 */
  const actions = d.actions;
  const ru = isObj(r.rules) ? r.rules : {};
  /* 捣乱池：只认那八种捣乱；一个都没勾就当全勾上（不然捣乱礼物送了没反应） */
  const picked = Array.isArray(ru.pool) ? MESS_IDS.filter(id => ru.pool.includes(id)) : d.rules.pool;
  const pool = picked.length ? picked : d.rules.pool;
  /* 捣乱礼物和保护礼物两张表里的礼物名不能重（多打空格、表情、全角半角算同一个），重的只留第一行 */
  const seen = new Set();
  const rows = (list, mapRow) =>
    list.slice(0, 500).flatMap(g => {
      if (!isObj(g) || typeof g.name !== 'string') return [];
      const name = g.name.trim().slice(0, 40);
      const key = giftKey(name);
      if (!key || seen.has(key)) return [];
      const row = mapRow(g, name);
      if (!row) return [];
      seen.add(key);
      return [row];
    });
  const mess = rows(Array.isArray(ru.mess) ? ru.mess : d.rules.mess, (g, name) => ({ name, ...cleanRange(g, { min: 1, max: 1 }) }));
  const help = rows(Array.isArray(ru.help) ? ru.help : d.rules.help, (g, name) =>
    HELP_IDS.includes(g.action) ? { name, action: g.action, ...cleanRange(g, { min: defaultQty(g.action), max: defaultQty(g.action) }) } : null);
  const lm = isObj(r.limits) ? r.limits : {};
  /* 旧存档：上限还是当时的默认值（没人改过）就换成新的默认值（不限）；改过的照旧 */
  const ver = typeof r.version === 'number' ? r.version : 1;
  const la = isObj(lm.actors) ? lm.actors : {};
  const pl = isObj(r.play) ? r.play : {};
  const du = isObj(pl.dust) ? pl.dust : {};
  const dp = isObj(r.display) ? r.display : {};
  const au = isObj(r.audio) ? r.audio : {};
  const lv = isObj(r.live) ? r.live : {};
  return {
    version: 7,
    actions,
    rules: {
      pool,
      mess,
      help
    },
    limits: {
      minGapMs: int(ver < 2 ? fromOld(lm.minGapMs, [700], d.limits.minGapMs) : lm.minGapMs, 0, 10000, d.limits.minGapMs),
      queueMax: int(ver < 2 ? fromOld(lm.queueMax, [24, 60], d.limits.queueMax) : lm.queueMax, 0, LIMIT_MAX, d.limits.queueMax),
      ownerCap: int(ver < 3 ? fromOld(lm.ownerCap, [3, 10, 30, 100000], d.limits.ownerCap) : lm.ownerCap, 0, LIMIT_MAX, d.limits.ownerCap),
      maxStains: int(ver < 3 ? fromOld(lm.maxStains, [70, 120, 100000], d.limits.maxStains) : lm.maxStains, 0, LIMIT_MAX, d.limits.maxStains),
      waitSec: int(lm.waitSec, 0, 86400, d.limits.waitSec),
      actors: Object.fromEntries(ACTOR_KINDS.map(k => [k, int(la[k], 0, 10000, d.limits.actors[k])]))
    },
    play: {
      blade: num(pl.blade, 8, 30, d.play.blade),
      messScale: num(pl.messScale, 0.5, 4, d.play.messScale),
      engulf: num(pl.engulf, 0, 1, d.play.engulf),
      dust: { enabled: bool(du.enabled, d.play.dust.enabled), perMin: num(du.perMin, 0.2, 20, d.play.dust.perMin), max: int(du.max, 1, 40, d.play.dust.max) }
    },
    display: {
      /* 露脸区：多边形；旧存档的椭圆/圆角框在这里换成多边形 */
      zone: sanitizeZone(dp.zone),
      glass: num(dp.glass, 0, 1, d.display.glass),
      names: bool(dp.names, true),
      counter: bool(dp.counter, true),
      hint: bool(dp.hint, false),
      boards: bool(dp.boards, false),
      motion: ['on', 'system', 'off'].includes(dp.motion) ? dp.motion : 'on'
    },
    audio: { enabled: bool(au.enabled, true), volume: num(au.volume, 0, 1, d.audio.volume) },
    live: { receive: bool(lv.receive, d.live.receive) }
  };
}

/* V1.4（第 6 版）的出厂礼物表：存档里还是它（没人改过）就直接换成新的出厂表 */
const V6_DEFAULT_GIFTS = [
  ['小心心', 'fog', 1], ['玫瑰', 'egg', 1], ['人气票', 'flyer', 1], ['抖音', 'bird', 1], ['番茄', 'mud', 2], ['棒棒糖', 'tea', 1], ['墨汁炸弹', 'mud', 6],
  ['亲吻', 'fog', 2], ['口红示爱', 'fog', 2], ['大厨煎蛋', 'egg', 5], ['灵动小鸟', 'bird', 3], ['做我的猫', 'cat', 1], ['猫咪来袭', 'cat', 3], ['机器人工坊', 'robot', 1], ['为你撑伞', 'film', 1]
];
const sameAsV6Default = gifts =>
  Array.isArray(gifts) && gifts.length === V6_DEFAULT_GIFTS.length && gifts.every((g, i) => isObj(g) && g.name === V6_DEFAULT_GIFTS[i][0] && g.action === V6_DEFAULT_GIFTS[i][1] && g.n === V6_DEFAULT_GIFTS[i][2]);

/* V1.4（第 6 版）的设置搬到第 7 版：
   - 礼物表还是出厂的：换成新的出厂表（捣乱礼物 + 保护礼物）；
   - 自己改过的：机器人、保护膜那几行进"保护礼物"（保护膜以前一次贴 60 秒，现在按一次能挡 20 下换算），其余的进"捣乱礼物"，每个来几下 = 原来的数量；
   - "表里没有的礼物"那一行新版没有了（两张表里都没有的礼物送了不会有反应）；
   - 弹幕、点赞、文字上屏不要了；露脸区（在 sanitize 里换成多边形）、声音、上限这些照旧。 */
export function migrateV6(old) {
  const o = isObj(old) ? old : {};
  const ru = isObj(o.rules) ? o.rules : {};
  const keep = { ...o, version: typeof o.version === 'number' ? o.version : 6 };
  if (!Array.isArray(ru.gifts) || sameAsV6Default(ru.gifts)) {
    keep.rules = {};
  } else {
    const mess = [];
    const help = [];
    for (const g of ru.gifts) {
      if (!isObj(g)) continue;
      const n = int(g.n, 1, QTY_MAX, 1);
      if (g.action === 'robot') help.push({ name: g.name, action: 'robot', min: n, max: n });
      else if (g.action === 'film') {
        const hits = Math.min(QTY_MAX, n * defaultQty('film'));
        help.push({ name: g.name, action: 'film', min: hits, max: hits });
      } else mess.push({ name: g.name, min: n, max: n });
    }
    keep.rules = { mess, help };
  }
  return keep;
}

/* 旧版（第 5 版及更早）的设置先搬到第 6 版的样子（再交给 migrateV6）：
   - 还在用随机礼物菜单（旧默认）的：礼物表留空（等于出厂表）；
   - 自己改过礼物表的：每行的档位换成数量（鸡蛋重档 5 个 -> 5；来几只的、保护膜 -> 1）；"其他礼物"那一行新版没有了；
   - 接收直播间换成开（旧版默认关只是为了试玩时不被打断）；露脸区、声音、上限这些照旧（更老的存档照样按版本升级） */
export function migrateV5(old) {
  const o = isObj(old) ? old : {};
  const ru = isObj(o.rules) ? o.rules : {};
  const menuOn = !isObj(ru.menu) || ru.menu.on !== false;
  const d = defaultSettings();
  const qtyOf = (action, tierId) => {
    const def = ACTIONS.find(a => a.id === action);
    if (!def || def.qty.spawn || action === 'film') return 1;
    const custom = isObj(o.actions) && isObj(o.actions[action]) && Array.isArray(o.actions[action].tiers) && o.actions[action].tiers.length ? o.actions[action] : null;
    const tier = custom ? findTier(custom, tierId) : findTier(d.actions[action], tierId);
    const v = tier && typeof tier[def.qty.key] === 'number' ? tier[def.qty.key] : findTier(d.actions[action], tierId)[def.qty.key];
    return Math.max(1, Math.round(v));
  };
  const gifts = menuOn ? undefined : Array.isArray(ru.gifts) ? ru.gifts.map(g => (isObj(g) ? { name: g.name, action: g.action, n: qtyOf(g.action, g.tier) } : g)) : undefined;
  return { ...o, version: typeof o.version === 'number' ? o.version : 1, actions: undefined, rules: { gifts }, live: { receive: true } };
}

/* ok = 存储能读、内容能解析；exists = 存过东西 */
function read(storage, key) {
  let raw = null;
  try {
    raw = storage.getItem(key);
  } catch (e) {
    return { ok: false, exists: false, value: null };
  }
  if (raw === null || raw === undefined) return { ok: true, exists: false, value: null };
  try {
    return { ok: true, exists: true, value: JSON.parse(raw) };
  } catch (e) {
    return { ok: false, exists: true, value: null };
  }
}

function write(storage, key, value) {
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    return false;
  }
}

/* 读设置：先读新键名；没有就从最近的旧键名搬（只读不写，下次保存才写到新键名） */
export function loadSettings(storage) {
  const r = read(storage, KEY_SETTINGS);
  if (r.exists) return { settings: sanitizeSettings(r.value), readable: r.ok, exists: true, migrated: false };
  const v2 = read(storage, KEY_SETTINGS_V2);
  if (v2.exists && v2.ok) return { settings: sanitizeSettings(migrateV6(v2.value)), readable: r.ok, exists: true, migrated: true };
  const v1 = read(storage, KEY_SETTINGS_V1);
  if (v1.exists && v1.ok) return { settings: sanitizeSettings(migrateV6(migrateV5(v1.value))), readable: r.ok, exists: true, migrated: true };
  return { settings: defaultSettings(), readable: r.ok && v2.ok && v1.ok, exists: false, migrated: false };
}

export const saveSettings = (storage, s) => write(storage, KEY_SETTINGS, s);

function localStore() {
  try {
    return globalThis.localStorage || null;
  } catch (e) {
    return null;
  }
}
const denied = {
  getItem() {
    throw new Error('no storage');
  },
  setItem() {
    throw new Error('no storage');
  }
};

export const store = {
  loadSettings: () => loadSettings(localStore() || denied),
  saveSettings: s => saveSettings(localStore() || denied, s)
};
