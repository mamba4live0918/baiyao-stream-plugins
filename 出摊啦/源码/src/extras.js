/* 出摊啦 V1.3 · 新增设置单独存一个键：交租牌位置大小、牌子位置，还有 V1.3/V1.4 的加班礼物表和本场减班。
 * 不放进 chutan.v1_1.settings，旧版（V1.2 及以前）再存设置时不会把这些冲掉。
 * V1.5 起加班交给白曜加班机：加班礼物表和本场减班不再用，但照样存着，退回旧版还在。 */
import { isCompliant } from './text.js';
import { normalizeGiftName } from './settings.js';

export const KEY_EXTRAS = 'chutan.v1_3.extras';
export const PANEL_SCALE = Object.freeze({ min: 0.4, max: 3 });
/* 能拖能改大小的牌子（交租牌单独存在 panel 里）。 */
export const BOARD_IDS = Object.freeze(['count', 'outside', 'wanted']);
const LABEL_MAX = 8;
const NAME_MAX = 20;
const MINUTES_MAX = 600;

const obj = v => v && typeof v === 'object' && !Array.isArray(v) ? v : {};
const finite = v => typeof v === 'number' && Number.isFinite(v);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const fraction = v => finite(v) ? clamp(v, 0, 1) : null;
const minutes = v => finite(v) && v > 0 ? Math.min(MINUTES_MAX, Math.round(v * 100) / 100) : null;
// 屏幕上的名字再多拦一个词：「盲盒」涉嫌违规，填了也换成默认名。
// 先去掉空格、标点、符号和零宽字符再查，「盲·盒」「盲 盒」也拦得住。
const NOISE = /[\p{Z}\p{P}\p{S}\p{Cf}\p{M}\s]/gu;
export const labelOk = t => isCompliant(String(t ?? '')) && !String(t ?? '').normalize('NFKC').replace(NOISE, '').includes('盲盒');

export function defaultExtras() {
  return { panel: { x: null, y: null, scale: 1 }, boards: {}, overtimeGifts: [], reduction: { sessionId: null, seconds: 0 } };
}

export function sanitizeOvertimeGift(raw) {
  const x = obj(raw), name = String(x.name ?? '').trim().slice(0, NAME_MAX);
  if (!normalizeGiftName(name)) return null;
  const a = minutes(x.min) ?? 1, b = minutes(x.max) ?? a;
  const label = String(x.label ?? '').trim().slice(0, LABEL_MAX);
  return { name, mode: x.mode === 'sub' ? 'sub' : 'add', min: Math.min(a, b), max: Math.max(a, b), label: label && labelOk(label) ? label : '' };
}

export function sanitizeExtras(raw) {
  const x = obj(raw), d = defaultExtras(), panel = obj(x.panel), reduction = obj(x.reduction), boards = obj(x.boards);
  const seen = new Set();
  const overtimeGifts = (Array.isArray(x.overtimeGifts) ? x.overtimeGifts : []).flatMap(row => {
    const clean = sanitizeOvertimeGift(row);
    if (!clean) return [];
    // 和礼物表匹配用同一个写法：大小写、全半角、空格标点都不算区别
    const key = normalizeGiftName(clean.name);
    if (seen.has(key)) return [];
    seen.add(key);
    return [clean];
  });
  return {
    panel: { x: fraction(panel.x), y: fraction(panel.y), scale: finite(panel.scale) ? clamp(panel.scale, PANEL_SCALE.min, PANEL_SCALE.max) : d.panel.scale },
    boards: Object.fromEntries(BOARD_IDS.flatMap(id => {
      const b = obj(boards[id]); if (!Object.keys(b).length) return [];
      return [[id, { x: fraction(b.x), y: fraction(b.y), scale: finite(b.scale) ? clamp(b.scale, PANEL_SCALE.min, PANEL_SCALE.max) : 1 }]];
    })),
    overtimeGifts,
    reduction: {
      sessionId: typeof reduction.sessionId === 'string' && reduction.sessionId ? reduction.sessionId : null,
      seconds: finite(reduction.seconds) && reduction.seconds > 0 ? Math.min(Number.MAX_SAFE_INTEGER, Math.ceil(reduction.seconds)) : 0
    }
  };
}

export function loadExtras(storage) {
  try {
    const raw = storage.getItem(KEY_EXTRAS);
    return { extras: raw == null ? defaultExtras() : sanitizeExtras(JSON.parse(raw)), readable: true };
  } catch {
    return { extras: defaultExtras(), readable: false };
  }
}

export function saveExtras(storage, extras) {
  try {
    storage.setItem(KEY_EXTRAS, JSON.stringify(sanitizeExtras(extras)));
    return true;
  } catch { return false; }
}
