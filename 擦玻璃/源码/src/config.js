/* 擦玻璃 · 互动类型、参数、默认设置（纯数据，测试可直接载入）
   kind: mess 捣乱（进捣乱池，受"两次捣乱最短间隔"限制）/ help 帮忙（保护礼物，不受限制）。scale = 数量放大的那个参数。
   tiers 是每种互动的出厂参数（大小、速度这些），设置里不让人改；默认用 defaultTier 那一组。
   chunk = 一次最多出多少，超过就拆成好几批排队，慢慢来。
   qty = "来多少"指什么：key 是改哪个参数（几个 / 几团 / 几杯 / 几张 / 保护膜能挡几下），spawn 表示来几只（几团雾、几只猫、几台机器人）。 */
import { defaultZone } from './zone.js';

const T = (id, name, p) => ({ id, name, ...p });

export const ACTIONS = Object.freeze([
  {
    id: 'egg', name: '扔鸡蛋', badge: '蛋', color: '#f2b233', kind: 'mess', scale: 'count',
    params: [
      { key: 'count', label: '个数', min: 1, max: 9999, chunk: 40, step: 1, unit: '个', def: 2 },
      { key: 'size', label: '大小', min: 0.6, max: 2.5, step: 0.05, unit: '倍', def: 1 },
      { key: 'warn', label: '准星预警', min: 0, max: 4, step: 0.1, unit: '秒，0=接不住', def: 1.2 }
    ],
    tiers: [T('light', '轻', { count: 1, size: 0.9, warn: 1.4 }), T('mid', '中', { count: 2, size: 1, warn: 1.2 }), T('heavy', '重', { count: 5, size: 1.1, warn: 1 })],
    qty: { key: 'count', unit: '个' },
    defaultTier: 'mid'
  },
  {
    id: 'tea', name: '泼奶茶', badge: '茶', color: '#c48d58', kind: 'mess', scale: 'cups',
    params: [
      { key: 'cups', label: '杯数', min: 1, max: 9999, chunk: 12, step: 1, unit: '杯', def: 1 },
      { key: 'size', label: '大小', min: 0.6, max: 2.5, step: 0.05, unit: '倍', def: 1 },
      { key: 'pearls', label: '珍珠', min: 0, max: 40, step: 1, unit: '颗', def: 10 }
    ],
    tiers: [T('light', '轻', { cups: 1, size: 0.9, pearls: 6 }), T('mid', '中', { cups: 1, size: 1, pearls: 10 }), T('heavy', '重', { cups: 3, size: 1.15, pearls: 16 })],
    qty: { key: 'cups', unit: '杯' },
    defaultTier: 'mid'
  },
  {
    id: 'mud', name: '甩泥巴', badge: '泥', color: '#8b5a34', kind: 'mess', scale: 'count',
    params: [
      { key: 'count', label: '团数', min: 1, max: 9999, chunk: 50, step: 1, unit: '团', def: 3 },
      { key: 'size', label: '大小', min: 0.6, max: 2.5, step: 0.05, unit: '倍', def: 1 }
    ],
    tiers: [T('light', '轻', { count: 2, size: 0.85 }), T('mid', '中', { count: 3, size: 1 }), T('heavy', '重', { count: 6, size: 1.15 })],
    qty: { key: 'count', unit: '团' },
    defaultTier: 'mid'
  },
  {
    id: 'flyer', name: '贴小广告', badge: '广', color: '#e0342b', kind: 'mess', scale: 'count',
    params: [
      { key: 'count', label: '张数', min: 1, max: 9999, chunk: 40, step: 1, unit: '张', def: 1 },
      { key: 'size', label: '大小', min: 0.7, max: 2, step: 0.05, unit: '倍', def: 1 }
    ],
    tiers: [T('light', '轻', { count: 1, size: 1 }), T('mid', '中', { count: 2, size: 1 }), T('heavy', '重', { count: 4, size: 1.05 })],
    qty: { key: 'count', unit: '张' },
    defaultTier: 'mid'
  },
  {
    /* 主播自己上传的异形贴纸（stickers.js）：和不干胶小广告一样贴、一样揭；还没上传时照常贴小广告 */
    id: 'sticker', name: '我的贴纸', badge: '贴', color: '#ff6fa8', kind: 'mess', scale: 'count',
    params: [
      { key: 'count', label: '张数', min: 1, max: 9999, chunk: 40, step: 1, unit: '张', def: 1 },
      { key: 'size', label: '大小', min: 0.7, max: 2, step: 0.05, unit: '倍', def: 1 }
    ],
    tiers: [T('light', '轻', { count: 1, size: 1 }), T('mid', '中', { count: 1, size: 1 }), T('heavy', '重', { count: 2, size: 1.05 })],
    qty: { key: 'count', unit: '张' },
    defaultTier: 'mid'
  },
  {
    id: 'fog', name: '哈气写字', badge: '雾', color: '#7fb9d6', kind: 'mess', scale: 'hold',
    params: [
      { key: 'size', label: '雾的大小', min: 0.6, max: 3, step: 0.05, unit: '倍', def: 1 },
      { key: 'hold', label: '停留', min: 5, max: 86400, chunk: 45, step: 1, unit: '秒（不擦也会散）', def: 40 }
    ],
    tiers: [T('light', '轻', { size: 0.9, hold: 30 }), T('mid', '中', { size: 1.1, hold: 45 }), T('heavy', '重', { size: 1.5, hold: 70 })],
    qty: { spawn: true, unit: '团' },
    defaultTier: 'mid'
  },
  {
    id: 'cat', name: '猫猫踩过', badge: '猫', color: '#b98bd8', kind: 'mess', scale: 'paws',
    params: [
      { key: 'paws', label: '脚印', min: 1, max: 9999, chunk: 80, step: 1, unit: '个（一只猫最多踩 80 个，多了来好几只）', def: 10 },
      { key: 'speed', label: '走的速度', min: 0.5, max: 2, step: 0.05, unit: '倍', def: 1 }
    ],
    tiers: [T('light', '轻', { paws: 8, speed: 1.2 }), T('mid', '中', { paws: 14, speed: 1 }), T('heavy', '重', { paws: 24, speed: 0.85 })],
    qty: { spawn: true, unit: '只' },
    defaultTier: 'mid'
  },
  {
    id: 'bird', name: '小鸟拉屎', badge: '鸟', color: '#c9a27a', kind: 'mess', scale: 'poops',
    params: [
      { key: 'poops', label: '拉几坨', min: 1, max: 9999, chunk: 12, step: 1, unit: '坨（一只鸟最多 12 坨，多了来好几只）', def: 1 },
      { key: 'warn', label: '预警', min: 0.8, max: 8, step: 0.1, unit: '秒（这段时间点它能赶走）', def: 2.2 }
    ],
    tiers: [T('light', '轻', { poops: 1, warn: 3 }), T('mid', '中', { poops: 2, warn: 2.2 }), T('heavy', '重', { poops: 4, warn: 1.6 })],
    qty: { spawn: true, unit: '只' },
    defaultTier: 'mid'
  },
  {
    id: 'gecko', name: '壁虎', badge: '虎', color: '#8cc76f', kind: 'mess', scale: 'stay',
    params: [
      { key: 'stay', label: '赖着不走', min: 4, max: 86400, chunk: 20, step: 1, unit: '秒', def: 20 },
      { key: 'tail', label: '吓跑时断尾几率', min: 0, max: 1, step: 0.05, unit: '', def: 0.5 }
    ],
    tiers: [T('light', '轻', { stay: 12, tail: 0.3 }), T('mid', '中', { stay: 20, tail: 0.5 }), T('heavy', '重', { stay: 40, tail: 0.8 })],
    qty: { spawn: true, unit: '只' },
    defaultTier: 'mid'
  },
  {
    id: 'robot', name: '擦窗机器人', badge: '帮', color: '#3fa98f', kind: 'help', scale: 'seconds',
    params: [
      { key: 'seconds', label: '工作时间', min: 5, max: 86400, chunk: 20, step: 1, unit: '秒', def: 20 },
      { key: 'speed', label: '速度', min: 0.5, max: 2, step: 0.05, unit: '倍', def: 1 }
    ],
    tiers: [T('light', '轻', { seconds: 12, speed: 1 }), T('mid', '中', { seconds: 20, speed: 1 }), T('heavy', '重', { seconds: 40, speed: 1.2 })],
    qty: { spawn: true, unit: '台' },
    defaultTier: 'mid'
  },
  {
    id: 'film', name: '保护膜', badge: '膜', color: '#3f86b8', kind: 'help', scale: 'hits',
    params: [{ key: 'hits', label: '能挡几下', min: 1, max: 9999, step: 1, unit: '下（挡满了自己裂开掉下来）', def: 20 }],
    tiers: [T('light', '轻', { hits: 10 }), T('mid', '中', { hits: 20 }), T('heavy', '重', { hits: 40 })],
    qty: { key: 'hits', unit: '下' },
    defaultTier: 'mid'
  }
]);

export const ACTION_IDS = Object.freeze(ACTIONS.map(a => a.id));
export const actionDef = id => ACTIONS.find(a => a.id === id) || null;
export const isHelp = id => (actionDef(id) || {}).kind === 'help';
/* 捣乱的那八种（捣乱池只从这里挑，不会随机出机器人、保护膜） */
export const MESS_IDS = Object.freeze(ACTIONS.filter(a => a.kind === 'mess').map(a => a.id));
/* 保护礼物能选的：擦窗机器人、保护膜 */
export const HELP_IDS = Object.freeze(ACTIONS.filter(a => a.kind === 'help').map(a => a.id));
/* "来一下"来多少：能改数量的按出厂那一组（鸡蛋 2 个、泥巴 3 团、保护膜挡 20 下…），来几只的就 1 */
export function defaultQty(id) {
  const def = actionDef(id);
  if (!def) return 1;
  if (def.qty.spawn) return 1;
  const tier = def.tiers.find(t => t.id === def.defaultTier) || def.tiers[0];
  return tier[def.qty.key];
}

const clone = x => JSON.parse(JSON.stringify(x));

export function defaultSettings() {
  const actions = {};
  for (const d of ACTIONS) actions[d.id] = { enabled: true, defaultTier: d.defaultTier, tiers: clone(d.tiers) };
  return {
    version: 7,
    actions,
    rules: {
      /* 捣乱池：捣乱礼物从勾上的这几样里随机挑（"我的贴纸"要先上传贴纸，上传了才自动勾上） */
      pool: MESS_IDS.filter(id => id !== 'sticker'),
      /* 捣乱礼物：观众送一个，就从捣乱池里随机来 min～max 下（送几个就来几轮） */
      mess: [
        { name: '小心心', min: 1, max: 1 },
        { name: '玫瑰', min: 1, max: 1 },
        { name: '人气票', min: 1, max: 1 },
        { name: '抖音', min: 1, max: 1 },
        { name: '番茄', min: 1, max: 2 },
        { name: '棒棒糖', min: 1, max: 2 },
        { name: '墨汁炸弹', min: 2, max: 4 },
        { name: '亲吻', min: 2, max: 3 },
        { name: '口红示爱', min: 2, max: 3 },
        { name: '大厨煎蛋', min: 3, max: 5 },
        { name: '灵动小鸟', min: 3, max: 5 },
        { name: '做我的猫', min: 2, max: 3 },
        { name: '猫咪来袭', min: 4, max: 6 }
      ],
      /* 保护礼物：观众送一个，来帮主播——擦窗机器人来 min～max 台；保护膜能挡 min～max 下（已经贴着就加耐久） */
      help: [
        { name: '机器人工坊', action: 'robot', min: 1, max: 1 },
        { name: '为你撑伞', action: 'film', min: 10, max: 20 }
      ]
      /* 两张表里都没有的礼物：什么都不做 */
    },
    /* 上限默认全都不限（0 = 不限），主播想限再自己填：捣乱间隔、排队条数、每人块数、玻璃上块数、排队等多久、场上每种小动物/小广告几个 */
    limits: { minGapMs: 0, queueMax: 0, ownerCap: 0, maxStains: 0, waitSec: 0, actors: { cat: 0, bird: 0, gecko: 0, robot: 0, flyer: 0 } },
    /* engulf 淹没感：脏东西往脸边挤、能压进露脸区边上多少（0..1） */
    play: { blade: 15, messScale: 1, engulf: 0.85, dust: { enabled: true, perMin: 2, max: 8 } },
    display: { zone: defaultZone(), glass: 0.6, names: true, counter: true, hint: false, boards: false, motion: 'on' },
    audio: { enabled: true, volume: 0.6 },
    /* 接收直播间的礼物：默认开（装上就能用） */
    live: { receive: true }
  };
}
