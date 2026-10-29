/* 擦玻璃 · 互动的执行说明（spec）：参数按出厂那一组取值，数量放大主要参数；太多就拆批。 */
import { ACTIONS, actionDef } from './config.js';

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

let seq = 0;
/* 放大以后最多到多少（防一个离谱的数，正常用不到） */
export const SCALE_SAFE = 1000000;
/* 一次互动的执行说明：参数按档位取值、按礼物数量放大并限幅。extra 可带 uid（观众 id）、text（弹幕文字） */
export function buildSpec(settings, actionId, tierId, count, who, source, extra = {}) {
  const def = actionDef(actionId);
  const cfg = settings.actions[actionId];
  if (!def || !cfg) return null;
  const tier = findTier(cfg, tierId);
  const times = Math.max(1, Math.floor(count) || 1);
  const params = {};
  for (const p of def.params) {
    let v = tier[p.key];
    if (typeof v !== 'number' || !Number.isFinite(v)) v = p.def !== undefined ? p.def : p.min;
    /* 礼物数量放大那一项不封顶（太多的在排队时拆成几批），只防一个离谱的数 */
    if (p.key === def.scale) v *= times;
    params[p.key] = clamp(snap(v, p.step), p.min, p.key === def.scale ? Math.max(p.max, SCALE_SAFE) : p.max);
  }
  return { id: ++seq, action: actionId, tierId: tier.id, tierName: tier.name, params, count: times, who: who || '观众', uid: extra.uid || '', text: extra.text || '', source: source || 'sim' };
}

/* 放大后的数量超过"一次最多"（chunk）：拆成好几批，每批不超过一次的量，排队一批批来（总数不变） */
export function splitSpec(spec) {
  const def = spec && actionDef(spec.action);
  const p = def && def.params.find(x => x.key === def.scale);
  const v = p && spec.params[p.key];
  if (!p || !p.chunk || !(v > p.chunk)) return spec ? [spec] : [];
  const parts = [];
  for (let left = v; left > 0; left -= p.chunk) parts.push({ ...spec, id: ++seq, params: { ...spec.params, [p.key]: Math.min(p.chunk, left) } });
  return parts;
}

export const ACTION_LIST = ACTIONS;
