/* 设置：默认值、读取与迁移、范围收紧、导入导出（纯逻辑，可直接用 Node 测试）
   V2.0 存在 kd-3d-config-v4，第一次打开读入 V1.0 的 kd-3d-config-v3：旧设置原样保留，新字段用默认值补齐；所有数值按面板控件的范围收紧。 */
import { cleanOverrides } from './garbage-catalog.js';
import { STAGES, STAGE_IDS } from './stages.js';
import { validRules } from './rules.js';
import { cleanTiers } from './tiers.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const clone = o => JSON.parse(JSON.stringify(o));
const newId = () => 'L' + Math.random().toString(36).slice(2, 10);

export const DEFAULT_LEVELS = [
  { name: '新手上岗', red: 4, yellow: 4, blue: 4, tape: 0, strip: 0, blind: 0, blindSize: 6, speed: 1, time: 0 },
  { name: '早高峰', red: 6, yellow: 6, blue: 6, tape: 2, strip: 2, blind: 0, blindSize: 6, speed: 1.2, time: 0 },
  { name: '双十一', red: 9, yellow: 9, blue: 9, tape: 4, strip: 4, blind: 1, blindSize: 8, speed: 1.4, time: 240 },
];
export const DEFAULT_GLEVELS = [
  { name: '垃圾分类入门', rec: 3, haz: 2, kit: 3, oth: 3, bag: 0, mud: 0, blind: 0, blindSize: 6, speed: 1, time: 0 },
  { name: '小区早高峰', rec: 5, haz: 3, kit: 5, oth: 5, bag: 2, mud: 2, blind: 0, blindSize: 6, speed: 1.2, time: 0 },
  { name: '督导上门', rec: 7, haz: 4, kit: 7, oth: 7, bag: 4, mud: 3, blind: 1, blindSize: 8, speed: 1.4, time: 240 },
];

export const DEFAULTS = {
  ver: 2,
  mode: 'express', endless: true,
  beltSpeed: 1, feedGap: 1.5, afterLevel: 'wait', autoNextSec: 6, loopLevels: true,
  sound: true, volume: 75, bg: 'none',
  // 每种互动的档位（数量自定，出厂是 轻 / 中 / 重）见 tiers.js；loadConfig 里生成 tiers，旧版的 fx 迁移进默认档
  play: { wrong: 'double', mult: 2, cap: 150, range: 'window', back: 'mid', blob: true },
  garbage: { naming: 'national', names: true, items: {} },
  levels: DEFAULT_LEVELS, level: 0,
  glevels: DEFAULT_GLEVELS, glevel: 0,
  // 分拣台布局默认「柜台」；scene / cam 是当前布局的分拣台位置和视角，另一个布局的记在 saved 里（见 stages.js）
  // 直播间互动说明牌默认关闭：多数主播在 OBS 里自己做礼物菜单
  layout: {
    stage: 'counter',
    scene: { ...STAGES.counter.view.scene },
    counter: { x: 2, y: 2, s: 100, on: true }, board: { x: 81, y: 2, s: 100, on: false },
    tags: { s: 100, on: true }, badges: true, binCounts: true, cursor: true,
    cam: { ...STAGES.counter.view.cam },
    head: { on: false, x: 50, y: 28, r: 13 },
    saved: {},
  },
  perf: { scale: 1, fps: 60, shadow: 'soft', aa: true, idle: true },
  link: { live: true, ws: true, port: 10030 },
  panel: { scale: 100, side: 'right' },
};

/* 数值范围：[最小, 最大, 步长]；步长 1 表示整数 */
const RANGES = {
  beltSpeed: [.3, 3, .1], feedGap: [.4, 6, .1], autoNextSec: [2, 60, 1], volume: [0, 100, 1],
  'play.cap': [1, 50000, 1], 'play.mult': [2, 4, 1],
  'layout.scene.x': [-50, 100], 'layout.scene.y': [-50, 100], 'layout.scene.w': [10, 150], 'layout.scene.h': [10, 150],
  'layout.counter.x': [0, 98], 'layout.counter.y': [0, 98], 'layout.counter.s': [40, 250],
  'layout.board.x': [0, 98], 'layout.board.y': [0, 98], 'layout.board.s': [40, 250], 'layout.tags.s': [40, 250],
  'layout.cam.pitch': [12, 80], 'layout.cam.yaw': [-40, 40], 'layout.cam.zoom': [60, 250], 'layout.cam.panX': [-60, 60], 'layout.cam.panY': [-60, 60],
  'layout.head.x': [0, 100], 'layout.head.y': [0, 100], 'layout.head.r': [3, 45],
  'perf.scale': [.4, 2], 'link.port': [1, 65535, 1], 'panel.scale': [60, 160],
};
const ENUMS = {
  mode: ['express', 'garbage'], afterLevel: ['wait', 'auto'], bg: ['none', 'room', 'dark', 'light', 'checker'],
  'play.wrong': ['double', 'bounce'], 'play.range': ['window', 'platform'], 'play.back': ['small', 'mid', 'large'],
  'garbage.naming': ['national', 'shanghai'], 'layout.cam.view': ['oblique', 'high', 'front', 'side', 'custom'], 'layout.stage': STAGE_IDS,
  'perf.fps': [30, 45, 60, 144], 'perf.shadow': ['soft', 'hard', 'off'], 'panel.side': ['right', 'left'],
};

function at(o, path) { const ks = path.split('.'), last = ks.pop(); for (const k of ks) o = o[k]; return [o, last]; }
function roundStep(v, step) { if (!step) return v; const r = Math.round(v / step) * step; return step < 1 ? Number(r.toFixed(2)) : r; }

/* 把保存的数据按默认结构合并；类型不对的值丢弃（数组另行处理） */
function mergeInto(dst, src, def) {
  if (!src || typeof src !== 'object') return;
  for (const k of Object.keys(def)) {
    const d = def[k], v = src[k];
    if (v === undefined || Array.isArray(d)) continue;
    if (d && typeof d === 'object') mergeInto(dst[k], v, d);
    else if (typeof d === typeof v && (typeof v !== 'number' || Number.isFinite(v))) dst[k] = v;
  }
}

const LEVEL_KEYS = { red: [0, 99], yellow: [0, 99], blue: [0, 99], tape: [0, 60], strip: [0, 60], blind: [0, 5], blindSize: [2, 20], speed: [.3, 3], time: [0, 3600] };
const GLEVEL_KEYS = { rec: [0, 99], haz: [0, 99], kit: [0, 99], oth: [0, 99], bag: [0, 60], mud: [0, 60], blind: [0, 5], blindSize: [2, 20], speed: [.3, 3], time: [0, 3600] };
function cleanBase(l, i, keys, fallback) {
  const o = { id: typeof l?.id === 'string' && l.id ? l.id.slice(0, 24) : newId(), name: String(l?.name ?? '').trim().slice(0, 16) || `第 ${i + 1} 关` };
  for (const [k, [a, b]] of Object.entries(keys)) {
    const v = Number(l?.[k]);
    o[k] = Number.isFinite(v) ? clamp(k === 'speed' ? Math.round(v * 10) / 10 : Math.round(v), a, b) : fallback[k];
  }
  return o;
}
export function cleanLevel(l, i) {
  const o = cleanBase(l, i, LEVEL_KEYS, DEFAULT_LEVELS[0]);
  if (o.red + o.yellow + o.blue + o.blind < 1) o.red = 1;
  const n = o.red + o.yellow + o.blue; o.tape = Math.min(o.tape, n); o.strip = Math.min(o.strip, n);
  return o;
}
export function cleanGLevel(l, i) {
  const o = cleanBase(l, i, GLEVEL_KEYS, DEFAULT_GLEVELS[0]);
  if (o.rec + o.haz + o.kit + o.oth + o.blind < 1) o.rec = 1;
  const n = o.rec + o.haz + o.kit + o.oth; o.bag = Math.min(o.bag, n); o.mud = Math.min(o.mud, n);
  return o;
}

/* 一个布局的分拣台位置和视角：按那个布局的默认值补齐、收紧范围 */
function cleanView(v, stage) {
  const d = STAGES[stage].view, out = clone(d), t = { layout: out };
  mergeInto(out, v, d);
  for (const [path, [a, b, step]] of Object.entries(RANGES)) if (/^layout\.(scene|cam)\./.test(path)) { const [obj, k] = at(t, path); obj[k] = clamp(roundStep(obj[k], step), a, b); }
  if (!ENUMS['layout.cam.view'].includes(out.cam.view)) out.cam.view = d.cam.view;
  return out;
}
const cleanSaved = raw => Object.fromEntries(STAGE_IDS.filter(id => raw && typeof raw[id] === 'object' && raw[id]).map(id => [id, cleanView(raw[id], id)]));

/* 某个布局的默认画面布局（「布局恢复默认」用；另一个布局记着的位置不动） */
export function defaultLayout(stage, saved = {}) {
  const st = STAGES[stage] ? stage : 'counter', L = clone(DEFAULTS.layout), hud = STAGES[st].hud;
  Object.assign(L, clone(STAGES[st].view), { stage: st, saved: clone(saved) });
  Object.assign(L.counter, hud.counter); Object.assign(L.board, hud.board);
  return L;
}

export function loadConfig(o) {
  const n = clone(DEFAULTS);
  mergeInto(n, o, DEFAULTS);
  n.levels = (Array.isArray(o?.levels) && o.levels.length ? o.levels.slice(0, 30) : DEFAULT_LEVELS).map(cleanLevel);
  n.glevels = (Array.isArray(o?.glevels) && o.glevels.length ? o.glevels.slice(0, 30) : DEFAULT_GLEVELS).map(cleanGLevel);
  n.garbage.items = cleanOverrides(o?.garbage?.items);
  n.tiers = cleanTiers(o?.tiers, o?.fx);
  for (const [path, [a, b, step]] of Object.entries(RANGES)) { const [obj, k] = at(n, path); obj[k] = clamp(roundStep(obj[k], step), a, b); }
  for (const [path, list] of Object.entries(ENUMS)) { const [obj, k] = at(n, path), [dobj] = at(DEFAULTS, path); if (!list.includes(obj[k])) obj[k] = dobj[k]; }
  n.layout.saved = cleanSaved(o?.layout?.saved);
  // V2.1 之前的设置没有布局：那时的分拣台位置和视角是按「经典俯视」调的，记进 saved.classic（切回经典还能用）；
  // 当前换成柜台布局的默认画面，计数牌挪到左上角，说明牌关掉
  if (o && typeof o === 'object' && !STAGE_IDS.includes(o.layout?.stage)) {
    n.layout.saved.classic = cleanView({ scene: o.layout?.scene, cam: o.layout?.cam }, 'classic');
    Object.assign(n.layout, clone(STAGES.counter.view), { stage: 'counter' });
    Object.assign(n.layout.counter, STAGES.counter.hud.counter); n.layout.board.on = false;
  }
  n.level = clamp(Math.floor(n.level) || 0, 0, n.levels.length - 1);
  n.glevel = clamp(Math.floor(n.glevel) || 0, 0, n.glevels.length - 1);
  n.ver = DEFAULTS.ver;
  return n;
}

export const exportPayload = (config, rules) => ({ app: 'kuaidi-3d', format: 4, config, rules });

export function parseImport(o) {
  if (o?.app !== 'kuaidi-3d') throw new Error('这不是快递分拣 3D 的设置文件');
  if (o.format !== undefined && ![3, 4].includes(o.format)) throw new Error('设置文件版本不支持');
  const cfg = o.config ? loadConfig(o.config) : null, rules = Array.isArray(o.rules) ? validRules(o.rules) : null;
  if (!cfg && !rules) throw new Error('文件里没有可用的设置');
  return { cfg, rules };
}
