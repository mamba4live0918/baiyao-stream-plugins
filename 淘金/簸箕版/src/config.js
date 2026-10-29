/* 淘金 · 簸箕版 · 互动类型、档位参数、默认设置（纯数据，测试可直接载入） */

const P = {
  power: { key: 'power', label: '强度', min: 0.1, max: 1, step: 0.05, unit: '' },
  dur: { key: 'dur', label: '持续', min: 2, max: 60, step: 1, unit: '秒' }
};

/* kind: ore 加矿（观众帮你）/ timed 持续型 / instant 即时型 / actor 角色。scale = 礼物数量乘的参数 */
export const ACTIONS = Object.freeze([
  {
    id: 'ore', name: '加矿砂', badge: '矿', color: '#c9862f', kind: 'ore', scale: 'sacks', verb: '送来了矿砂',
    params: [
      { key: 'sacks', label: '袋数', min: 1, max: 8, step: 1, unit: '袋', def: 1 },
      { key: 'sand', label: '每袋沙量', min: 0.02, max: 0.12, step: 0.005, unit: '方', def: 0.055 },
      { key: 'flakes', label: '金片', min: 0, max: 16, step: 1, unit: '片', def: 6 },
      { key: 'nuggets', label: '金块', min: 0, max: 6, step: 1, unit: '块', def: 1 },
      { key: 'big', label: '狗头金几率', min: 0, max: 1, step: 0.01, unit: '', def: 0.08 }
    ],
    tiers: [
      { id: 'light', name: '普通矿', sacks: 1, sand: 0.045, flakes: 4, nuggets: 0, big: 0.03 },
      { id: 'mid', name: '富矿', sacks: 1, sand: 0.055, flakes: 6, nuggets: 1, big: 0.08 },
      { id: 'heavy', name: '金矿', sacks: 1, sand: 0.07, flakes: 8, nuggets: 2, big: 0.3 }
    ],
    defaultTier: 'mid'
  },
  {
    id: 'rocks', name: '扔石头', badge: '石', color: '#8791a0', kind: 'instant', scale: 'count', verb: '往簸箕里扔了石头',
    params: [{ key: 'count', label: '石头数', min: 1, max: 8, step: 1, unit: '块', def: 2 }],
    tiers: [
      { id: 'light', name: '轻', count: 1 },
      { id: 'mid', name: '中', count: 2 },
      { id: 'heavy', name: '重', count: 4 }
    ],
    defaultTier: 'mid'
  },
  {
    id: 'mud', name: '倒泥水', badge: '泥', color: '#a9743f', kind: 'timed', scale: 'dur', verb: '往簸箕里倒了泥水',
    params: [{ ...P.power, label: '浑浊度', def: 0.75 }, { ...P.dur, def: 14 }],
    tiers: [
      { id: 'light', name: '轻', power: 0.5, dur: 8 },
      { id: 'mid', name: '中', power: 0.75, dur: 14 },
      { id: 'heavy', name: '重', power: 1, dur: 22 }
    ],
    defaultTier: 'mid'
  },
  {
    id: 'bump', name: '撞簸箕', badge: '撞', color: '#a56bd0', kind: 'timed', scale: 'dur', verb: '要来撞你的簸箕',
    params: [{ ...P.power, label: '撞的力气', def: 0.75 }, { ...P.dur, max: 40, def: 9 }],
    tiers: [
      { id: 'light', name: '轻', power: 0.5, dur: 6 },
      { id: 'mid', name: '中', power: 0.75, dur: 9 },
      { id: 'heavy', name: '重', power: 1, dur: 14 }
    ],
    defaultTier: 'mid'
  },
  {
    id: 'thief', name: '小偷', badge: '偷', color: '#d4604a', kind: 'actor', scale: 'fraction', verb: '派小偷来偷金子',
    params: [
      { key: 'fraction', label: '偷走的比例', min: 0.05, max: 0.6, step: 0.05, unit: '', def: 0.2 },
      { key: 'approach', label: '溜到簸箕后角用时', min: 2, max: 15, step: 0.5, unit: '秒', def: 6 }
    ],
    tiers: [
      { id: 'light', name: '轻', fraction: 0.1, approach: 7 },
      { id: 'mid', name: '中', fraction: 0.2, approach: 6 },
      { id: 'heavy', name: '重', fraction: 0.35, approach: 5 }
    ],
    defaultTier: 'mid'
  }
]);

export const ACTION_IDS = Object.freeze(ACTIONS.map(a => a.id));
export const actionDef = id => ACTIONS.find(a => a.id === id) || null;

/* 金子的价值（克） */
export const VALUES = Object.freeze({ flake: [0.1, 0.35], nugget: [0.8, 2.8], big: [5, 12] });

const clone = x => JSON.parse(JSON.stringify(x));

export function defaultSettings() {
  const actions = {};
  for (const d of ACTIONS) actions[d.id] = { enabled: true, defaultTier: d.defaultTier, tiers: clone(d.tiers) };
  return {
    version: 1,
    actions,
    rules: {
      gifts: [
        { name: '小心心', action: 'ore', tier: 'light' },
        { name: '玫瑰', action: 'ore', tier: 'mid' },
        { name: '人气票', action: 'ore', tier: 'heavy' },
        { name: '比心', action: 'thief', tier: '' },
        { name: '抖音', action: 'rocks', tier: '' },
        { name: '棒棒糖', action: 'mud', tier: '' },
        { name: '加油鸭', action: 'bump', tier: '' }
      ],
      otherGifts: { enabled: true, action: 'ore', bands: [10, 100] },
      chat: {
        enabled: true,
        windowSec: 12,
        threshold: 3,
        cooldownSec: 30,
        words: [
          { word: '偷', action: 'thief' },
          { word: '石头', action: 'rocks' },
          { word: '泥', action: 'mud' },
          { word: '撞', action: 'bump' }
        ]
      },
      like: { enabled: true, pulses: 200, cooldownSec: 20, action: 'ore', tier: 'light' }
    },
    play: { spill: true },
    limits: { minGapMs: 800, queueMax: 20, maxSacks: 8 },
    display: { motion: 'on', quality: 'high', frame: { x: 14, y: 46, w: 72, h: 52 }, zoom: 100, showBoard: false, showHint: true },
    audio: { enabled: true, volume: 0.6 },
    live: { receive: false }
  };
}
