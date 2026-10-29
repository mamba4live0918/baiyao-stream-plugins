/* 淘金 · 簸箕版 · 设置校验与存档：坏数据回落默认值；存储被拒绝时只提示，不影响玩 */
import { ACTIONS, ACTION_IDS, defaultSettings } from './config.js';
import { sanitizeActionConfig } from './tiers.js';

/* 新格式用新键名，和旧的 3D 版（taojin3d.*）互不影响 */
export const KEY_SETTINGS = 'taojin-bj.v1.settings';
export const KEY_VAULT = 'taojin-bj.v1.gold';
/* 试玩页（?demo=1）的金子单独存，测试的金子不进正式记录 */
export const KEY_VAULT_DEMO = 'taojin-bj.v1.demo-gold';

const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const num = (v, min, max, def) => (typeof v === 'number' && Number.isFinite(v) ? clamp(v, min, max) : def);
const bool = (v, def) => (typeof v === 'boolean' ? v : def);
const act = (v, def) => (ACTION_IDS.includes(v) ? v : def);
const tierOf = (actions, a, id, def) => (typeof id === 'string' && (id === '' || actions[a].tiers.some(t => t.id === id)) ? id : def);

export function sanitizeSettings(raw) {
  const d = defaultSettings();
  const r = isObj(raw) ? raw : {};
  const actions = {};
  for (const def of ACTIONS) actions[def.id] = sanitizeActionConfig(def, isObj(r.actions) ? r.actions[def.id] : null);
  const ru = isObj(r.rules) ? r.rules : {};
  const seen = new Set();
  const gifts = Array.isArray(ru.gifts)
    ? ru.gifts.slice(0, 80).flatMap(g => {
        if (!isObj(g) || typeof g.name !== 'string') return [];
        const name = g.name.trim().slice(0, 40);
        if (!name || seen.has(name) || !ACTION_IDS.includes(g.action)) return [];
        seen.add(name);
        return [{ name, action: g.action, tier: tierOf(actions, g.action, g.tier, '') }];
      })
    : d.rules.gifts;
  const og = isObj(ru.otherGifts) ? ru.otherGifts : {};
  const bands = Array.isArray(og.bands) ? og.bands.filter(b => typeof b === 'number' && Number.isFinite(b) && b >= 0).slice(0, 4).sort((a, b) => a - b) : d.rules.otherGifts.bands;
  const ch = isObj(ru.chat) ? ru.chat : {};
  const wseen = new Set();
  const words = Array.isArray(ch.words)
    ? ch.words.slice(0, 30).flatMap(w => {
        const word = isObj(w) && typeof w.word === 'string' ? w.word.trim().slice(0, 8) : '';
        if (!word || wseen.has(word) || !ACTION_IDS.includes(w.action)) return [];
        wseen.add(word);
        return [{ word, action: w.action }];
      })
    : d.rules.chat.words;
  const lk = isObj(ru.like) ? ru.like : {};
  const likeAction = act(lk.action, d.rules.like.action);
  const pl = isObj(r.play) ? r.play : {};
  const lm = isObj(r.limits) ? r.limits : {};
  const dp = isObj(r.display) ? r.display : {};
  const fr = isObj(dp.frame) ? dp.frame : {};
  const au = isObj(r.audio) ? r.audio : {};
  const lv = isObj(r.live) ? r.live : {};
  return {
    version: 1,
    actions,
    rules: {
      gifts,
      otherGifts: { enabled: bool(og.enabled, true), action: act(og.action, 'ore'), bands: bands.length ? bands : d.rules.otherGifts.bands },
      chat: {
        enabled: bool(ch.enabled, true),
        windowSec: num(ch.windowSec, 3, 120, d.rules.chat.windowSec),
        threshold: Math.round(num(ch.threshold, 1, 50, d.rules.chat.threshold)),
        cooldownSec: num(ch.cooldownSec, 3, 600, d.rules.chat.cooldownSec),
        words
      },
      like: {
        enabled: bool(lk.enabled, true),
        pulses: Math.round(num(lk.pulses, 5, 5000, d.rules.like.pulses)),
        cooldownSec: num(lk.cooldownSec, 3, 600, d.rules.like.cooldownSec),
        action: likeAction,
        tier: tierOf(actions, likeAction, lk.tier, likeAction === d.rules.like.action ? d.rules.like.tier : '')
      }
    },
    play: { spill: bool(pl.spill, d.play.spill) },
    limits: {
      minGapMs: Math.round(num(lm.minGapMs, 0, 10000, d.limits.minGapMs)),
      queueMax: Math.round(num(lm.queueMax, 1, 60, d.limits.queueMax)),
      maxSacks: Math.round(num(lm.maxSacks, 1, 30, d.limits.maxSacks))
    },
    display: {
      motion: ['on', 'system', 'off'].includes(dp.motion) ? dp.motion : 'on',
      quality: ['high', 'medium', 'low'].includes(dp.quality) ? dp.quality : 'high',
      frame: {
        x: num(fr.x, -20, 80, d.display.frame.x),
        y: num(fr.y, -20, 90, d.display.frame.y),
        w: num(fr.w, 20, 140, d.display.frame.w),
        h: num(fr.h, 15, 140, d.display.frame.h)
      },
      zoom: num(dp.zoom, 50, 220, 100),
      showBoard: bool(dp.showBoard, false),
      showHint: bool(dp.showHint, true)
    },
    audio: { enabled: bool(au.enabled, true), volume: num(au.volume, 0, 1, d.audio.volume) },
    live: { receive: bool(lv.receive, false) }
  };
}

/* ok = 存储能读、内容能解析；exists = 存过东西 */
function read(key) {
  let raw = null;
  try {
    raw = localStorage.getItem(key);
  } catch (e) {
    return { ok: false, exists: false, value: null };
  }
  if (raw === null) return { ok: true, exists: false, value: null };
  try {
    return { ok: true, exists: true, value: JSON.parse(raw) };
  } catch (e) {
    return { ok: false, exists: true, value: null };
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    return false;
  }
}

export const store = {
  loadSettings() {
    const r = read(KEY_SETTINGS);
    return { settings: sanitizeSettings(r.value), readable: r.ok };
  },
  saveSettings: s => write(KEY_SETTINGS, s),
  loadVault: demo => read(demo ? KEY_VAULT_DEMO : KEY_VAULT),
  saveVault: (v, demo) => write(demo ? KEY_VAULT_DEMO : KEY_VAULT, v)
};
