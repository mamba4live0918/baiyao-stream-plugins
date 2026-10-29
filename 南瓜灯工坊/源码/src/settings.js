// 设置：一页能看懂的「订南瓜礼物」「捣乱池 + 捣乱礼物」，其余收在高级设置。新版用新的存储键，和旧版互不覆盖。
import { MOLDS } from './molds.js';
import { DEFAULT_KEYWORDS, MESS_IDS, giftKey } from './rules.js';

export const KEY_SETTINGS = 'pumpkin-lantern.v2.settings';

export const defaultSettings = () => ({
  order: { enabled: true, keywords: [...DEFAULT_KEYWORDS], perPerson: 1, faces: true },
  rules: { order: [], mess: [], candy: [], help: [], pool: [...MESS_IDS] },
  live: { receive: true },
  making: { molds: MOLDS.map(m => m.id), trayCount: 4, hints: true },
  tower: { side: 'right', safeLayers: 2, breakStep: 0.25, size: 1, shipAt: 6 },
  bench: { size: 1 },
  mess: { witchWarning: 3, ghostHits: 3, ghostSeconds: 6, askSeconds: 3 },
  // 不给糖就捣蛋：运走一盏灯得几颗糖、装满一车多给几颗；每种捣蛋鬼来一次要几颗糖（黑猫按拍几下算）
  candy: { perLantern: 1, fullBonus: 2, price: { cat: 2, wind: 3, witch: 4, ghost: 2 } },
  audio: { enabled: true, volume: 0.35 },
  // 灯展（送达的灯挂在一串灯上）、贡献榜开关；摆位置：null = 自动放，否则是比例坐标 + 大小（在画面上拖出来的）
  show: { garland: true, board: true },
  layout: { garland: null, board: null, bank: null }
});

const obj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const num = (v, d, min = -Infinity, max = Infinity) => {
  const n = typeof v === 'number' || (typeof v === 'string' && v.trim()) ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d;
};

function table(rows, seen, maxDefault) {
  return (Array.isArray(rows) ? rows : [])
    .filter(r => obj(r) && typeof r.name === 'string' && r.name.trim())
    .filter(r => { const k = giftKey(r.name); if (!k || seen.has(k)) return false; seen.add(k); return true; })
    .map(r => {
      const a = Math.floor(num(r.min, 1, 0)), b = Math.floor(num(r.max, maxDefault, 0));
      return { name: r.name.trim(), min: Math.min(a, b), max: Math.max(a, b) };
    });
}

/** 任何来路的设置（旧存档、手改、空）都整理成完整、合法的一份。 */
export function sanitizeSettings(raw) {
  const d = defaultSettings(), x = obj(raw) ? raw : {};
  for (const k of ['order', 'live', 'making', 'tower', 'bench', 'mess', 'audio', 'candy', 'show']) if (obj(x[k])) d[k] = { ...d[k], ...x[k] };
  d.show.garland = d.show.garland !== false;
  d.show.board = d.show.board !== false;
  for (const k of ['garland', 'board', 'bank']) {   // 摆位置：x y 是左上角占画面的比例，s 是大小倍数，w（灯展）是长度占画面宽的比例
    const p = obj(x.layout) && obj(x.layout[k]) ? x.layout[k] : null;
    d.layout[k] = p && [p.x, p.y].every(v => Number.isFinite(Number(v))) ? { x: num(p.x, 0, 0, 1), y: num(p.y, 0, 0, 1), s: num(p.s, 1, 0.4, 3), ...(k === 'garland' ? { w: num(p.w, 0.5, 0.1, 1) } : {}) } : null;
  }
  d.order.enabled = d.order.enabled !== false;
  d.order.faces = d.order.faces !== false;
  d.order.perPerson = Math.floor(num(d.order.perPerson, 1, 0));
  d.order.keywords = Array.isArray(d.order.keywords) ? d.order.keywords.filter(s => typeof s === 'string' && s.trim()).map(s => s.trim()) : [...DEFAULT_KEYWORDS];
  d.live.receive = d.live.receive !== false;
  d.making.molds = Array.isArray(d.making.molds) ? d.making.molds.filter(id => MOLDS.some(m => m.id === id)) : MOLDS.map(m => m.id);
  if (!d.making.molds.length) d.making.molds = ['classic'];
  d.making.trayCount = Math.floor(num(d.making.trayCount, 4, 1, 6));
  d.making.hints = d.making.hints !== false;
  d.tower.side = d.tower.side === 'left' ? 'left' : 'right';
  d.tower.safeLayers = Math.floor(num(d.tower.safeLayers, 2, 0));
  d.tower.breakStep = num(d.tower.breakStep, 0.25, 0, 1);
  d.tower.size = num(d.tower.size, 1, 0.5, 1.6);
  d.tower.shipAt = Math.floor(num(d.tower.shipAt, 6, 0));   // 叠到几盏来小车拉走，0 = 不拉走
  d.bench.size = num(d.bench.size, 1, 0.6, 1.5);
  d.mess.witchWarning = num(d.mess.witchWarning, 2, 0, 10);
  d.mess.ghostHits = Math.floor(num(d.mess.ghostHits, 3, 1, 20));
  d.mess.ghostSeconds = num(d.mess.ghostSeconds, 6, 1, 30);
  d.mess.askSeconds = num(d.mess.askSeconds, 3, 0.5, 15);
  d.candy.perLantern = Math.floor(num(d.candy.perLantern, 1, 0));
  d.candy.fullBonus = Math.floor(num(d.candy.fullBonus, 2, 0));
  const price = obj(x.candy?.price) ? x.candy.price : {}, base = defaultSettings().candy.price;
  d.candy.price = Object.fromEntries(MESS_IDS.map(id => [id, Math.floor(num(price[id], base[id], 0))]));
  d.audio.enabled = d.audio.enabled !== false;
  d.audio.volume = num(d.audio.volume, 0.35, 0, 1);
  const seen = new Set();
  d.rules.order = table(x.rules?.order, seen, 1);
  d.rules.mess = table(x.rules?.mess, seen, 1);
  d.rules.candy = table(x.rules?.candy, seen, 5);
  d.rules.help = table(x.rules?.help, seen, 1);
  if (Array.isArray(x.rules?.pool)) d.rules.pool = [...new Set(x.rules.pool.filter(id => MESS_IDS.includes(id)))];
  return d;
}

/** 浏览器存储：试玩页（srcdoc 框架）、隐私模式里可能一碰就报错，拿不到就当没有。 */
export function safeStorage() {
  try { const s = globalThis.localStorage; s.getItem(KEY_SETTINGS); return s; } catch { return null; }
}

export function loadSettings(storage = safeStorage()) {
  try { return sanitizeSettings(JSON.parse(storage.getItem(KEY_SETTINGS))); } catch { return defaultSettings(); }
}

export function saveSettings(settings, storage = safeStorage()) {
  try { storage.setItem(KEY_SETTINGS, JSON.stringify(settings)); return true; } catch { return false; }
}
