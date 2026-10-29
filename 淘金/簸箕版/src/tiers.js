/* 淘金 3D · 档位：每种互动有自己的档位表（1–12 档，名字和参数都能改）；礼物数量只放大主要参数，不升档 */
import { ACTIONS, actionDef } from './config.js';

export const MAX_TIERS = 12;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const clone = x => JSON.parse(JSON.stringify(x));

export function snap(v, step) {
  if (!step) return v;
  const digits = (String(step).split('.')[1] || '').length;
  return Number((Math.round(v / step) * step).toFixed(digits));
}

export function findTier(cfg, tierId) {
  const t = cfg.tiers;
  return t.find(x => x.id === tierId) || t.find(x => x.id === cfg.defaultTier) || t[0];
}

/* 按单价分档：bands=[10,100] 把价格分成 3 段，再按比例映射到 n 个档位 */
export function tierIndexByPrice(n, price, bands) {
  if (n <= 1 || !bands.length) return 0;
  let k = 0;
  for (const b of bands) if (price >= b) k++;
  return Math.min(n - 1, Math.round((k * (n - 1)) / bands.length));
}

let seq = 0;
/* 一次互动的执行说明：参数按档位取值、按礼物数量放大并限幅 */
export function buildSpec(settings, actionId, tierId, count, who, source) {
  const def = actionDef(actionId);
  const cfg = settings.actions[actionId];
  if (!def || !cfg) return null;
  const tier = findTier(cfg, tierId);
  const times = Math.max(1, Math.floor(count) || 1);
  const params = {};
  for (const p of def.params) {
    let v = tier[p.key];
    if (typeof v !== 'number' || !Number.isFinite(v)) v = p.def !== undefined ? p.def : p.min;
    if (p.key === def.scale) v *= times;
    params[p.key] = clamp(snap(v, p.step), p.min, p.max);
  }
  return { id: ++seq, action: actionId, tierId: tier.id, tierName: tier.name, params, count: times, who: who || '观众', source: source || 'sim' };
}

function sanitizeTier(def, raw, fallback) {
  const src = isObj(raw) ? raw : {};
  const name = typeof src.name === 'string' && src.name.trim() ? src.name.trim().slice(0, 6) : fallback;
  const tier = { id: typeof src.id === 'string' && /^[\w-]{1,24}$/.test(src.id) ? src.id : 't' + ++seq, name };
  for (const p of def.params) {
    const v = typeof src[p.key] === 'number' && Number.isFinite(src[p.key]) ? src[p.key] : p.def;
    tier[p.key] = clamp(snap(v, p.step), p.min, p.max);
  }
  return tier;
}

export function sanitizeActionConfig(def, raw) {
  const src = isObj(raw) ? raw : {};
  const seen = new Set();
  let tiers = Array.isArray(src.tiers) ? src.tiers.slice(0, MAX_TIERS) : [];
  tiers = tiers.map((t, i) => sanitizeTier(def, t, '档' + (i + 1))).filter(t => !seen.has(t.id) && seen.add(t.id));
  const enabled = src.enabled !== false;
  if (!tiers.length) return { enabled, defaultTier: def.defaultTier, tiers: clone(def.tiers) };
  return { enabled, defaultTier: tiers.some(t => t.id === src.defaultTier) ? src.defaultTier : tiers[0].id, tiers };
}

export const ACTION_LIST = ACTIONS;
