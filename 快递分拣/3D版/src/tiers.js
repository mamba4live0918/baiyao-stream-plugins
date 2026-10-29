/* 互动分档：每种互动有一组档位，数量由主播自定（1–12 档），名字可改，其中一档是默认档（纯数据与校验，可直接用 Node 测试）。
   每档有这种互动的全部参数；每条礼物规则用档位 id 记住自己选的档，改名、删别的档、调顺序都不会选错；选中的档被删了就回到默认档。
   礼物个数只乘数量（amt），不会自动升档。旧版只有一组参数，迁移时放进默认档。 */
export const MAX_TIERS = 12;

/* [参数键, 名称, 最小, 最大, 步长]；第一个一律是数量 amt（件 / 秒 / 次，规则里的数值也是它） */
export const TIER_PARAMS = {
  truck: [['amt', '件数', 1, 10000, 1]],
  blind: [['amt', '炸出件数', 2, 20, 1], ['hits', '拆开点几下', 1, 30, 1]],
  seal: [['amt', '封几秒', 3, 60, 1], ['hits', '撕开点几下', 1, 50, 1], ['bins', '同时封几个', 1, 4, 1]],
  speed: [['amt', '加速几秒', 2, 30, 1], ['mul', '加速倍数', 1.5, 6, .5]],
  leak: [['amt', '漏几秒', 3, 60, 1], ['hits', '修好点几下', 1, 50, 1], ['bins', '同时漏几个', 1, 4, 1]],
  strip: [['amt', '件数', 1, 10, 1], ['scan', '照几秒才看清', .2, 5, .1]],
  tape: [['amt', '件数', 1, 10, 1], ['layers', '每件几层', 1, 6, 1]],
  kick: [['amt', '踹几脚', 1, 3, 1], ['loss', '踹飞比例 %', 0, 100, 5], ['power', '力度', .5, 2, .1]],
  help: [['amt', '帮收件数', 1, 30, 1], ['speed', '飞行速度', .5, 2.5, .1]],
  audit: [['amt', '抽查几秒', 3, 60, 1], ['mult', '分错变几件', 2, 5, 1]],
  tricky: [['amt', '件数', 1, 10, 1]],
  prank: [['amt', '丢错件数', 1, 10, 1], ['speed', '飞行速度', .5, 2.5, .1]],
};

const IDS = ['light', 'mid', 'heavy'], NAMES = ['轻', '中', '重'];
const three = vals => vals.map((v, i) => ({ id: IDS[i], name: NAMES[i], ...(i === 1 ? { def: true } : { def: false }), ...v }));
export const DEFAULT_TIERS = {
  truck: three([{ amt: 3 }, { amt: 8 }, { amt: 15 }]),
  blind: three([{ amt: 4, hits: 2 }, { amt: 6, hits: 4 }, { amt: 12, hits: 8 }]),
  seal: three([{ amt: 8, hits: 3, bins: 1 }, { amt: 15, hits: 6, bins: 1 }, { amt: 30, hits: 12, bins: 2 }]),
  speed: three([{ amt: 6, mul: 2 }, { amt: 10, mul: 3 }, { amt: 20, mul: 4 }]),
  leak: three([{ amt: 8, hits: 3, bins: 1 }, { amt: 15, hits: 5, bins: 1 }, { amt: 30, hits: 10, bins: 2 }]),
  strip: three([{ amt: 1, scan: .5 }, { amt: 3, scan: .7 }, { amt: 6, scan: 1.5 }]),
  tape: three([{ amt: 1, layers: 2 }, { amt: 3, layers: 3 }, { amt: 6, layers: 5 }]),
  kick: three([{ amt: 1, loss: 15, power: .7 }, { amt: 1, loss: 30, power: 1 }, { amt: 2, loss: 60, power: 1.5 }]),
  help: three([{ amt: 2, speed: 1 }, { amt: 5, speed: 1.3 }, { amt: 10, speed: 1.6 }]),
  audit: three([{ amt: 8, mult: 3 }, { amt: 15, mult: 3 }, { amt: 30, mult: 4 }]),
  tricky: three([{ amt: 1 }, { amt: 2 }, { amt: 4 }]),
  prank: three([{ amt: 1, speed: 1 }, { amt: 2, speed: 1.2 }, { amt: 4, speed: 1.5 }]),
};

/* 旧版 S.fx 的键 → 迁移到默认档的哪个参数 */
const LEGACY = {
  truck: { amt: 'truck' }, blind: { amt: 'blind', hits: 'blindHits' }, seal: { amt: 'seal', hits: 'sealHits' }, speed: { amt: 'speed', mul: 'speedMul' },
  leak: { amt: 'leak', hits: 'leakHits' }, strip: { amt: 'strip', scan: 'scanTime' }, tape: { amt: 'tape', layers: 'tapeLayers' },
  kick: { amt: 'kick', loss: 'kickLoss' }, help: { amt: 'help' }, audit: { amt: 'audit' }, tricky: { amt: 'tricky' }, prank: { amt: 'prank' },
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fix = (v, [, , a, b, step]) => { const r = Math.round(v / step) * step; return clamp(step < 1 ? Number(r.toFixed(2)) : r, a, b); };
/* 参数页编辑框与载入存档用同一种取整（按步长、收进范围），改完和刷新后看到的数一致 */
export const fixParam = (id, key, v) => fix(v, TIER_PARAMS[id].find(p => p[0] === key));
/* 档位名字：去空白、最多 8 个字；只有数字的名字不收（会和「第几档」的数字写法撞上） */
export const cleanTierName = raw => { const s = String(raw ?? '').trim().slice(0, 8); return /^\d+$/.test(s) ? '' : s; };
/* 同一种互动里名字不重复：重了就在后面加 2、3…… */
const uniqName = (want, taken) => { if (!taken.has(want)) return want; for (let k = 2; ; k++) { const n = want.slice(0, 8 - String(k).length) + k; if (!taken.has(n)) return n; } };
const clone = o => JSON.parse(JSON.stringify(o));
const freshId = taken => { let id; do { id = 't' + Math.random().toString(36).slice(2, 8); } while (taken.has(id)); return id; };

export const defaultTier = list => list.find(t => t.def) || list[0];

/* 一种互动的档位列表：补 id、去重、名字收紧到 8 个字、参数按范围收紧、只留一个默认档 */
function cleanList(id, src) {
  const params = TIER_PARAMS[id], base = defaultTier(DEFAULT_TIERS[id]), taken = new Set(), names = new Set(), out = [];
  const devFormat = src.length === 3 && src.every(t => t && typeof t === 'object' && t.id === undefined && t.name === undefined);
  src.slice(0, MAX_TIERS).forEach((t, i) => {
    if (!t || typeof t !== 'object') return;
    const fallback = DEFAULT_TIERS[id][i] && devFormat ? DEFAULT_TIERS[id][i] : base;
    let tid = typeof t.id === 'string' && /^[\w-]{1,24}$/.test(t.id) ? t.id : devFormat ? IDS[i] : '';
    if (!tid || taken.has(tid)) tid = freshId(taken); taken.add(tid);
    const name = uniqName(cleanTierName(t.name ?? (devFormat ? NAMES[i] : '')) || `第${out.length + 1}档`, names); names.add(name);
    const o = { id: tid, name, def: t.def === true || (devFormat && i === 1) };
    for (const p of params) { const v = Number(t[p[0]]); o[p[0]] = t[p[0]] !== undefined && t[p[0]] !== null && t[p[0]] !== '' && Number.isFinite(v) ? fix(v, p) : fallback[p[0]]; }
    out.push(o);
  });
  if (!out.length) return clone(DEFAULT_TIERS[id]);
  const d = out.findIndex(t => t.def); out.forEach((t, i) => { t.def = i === (d < 0 ? 0 : d); });
  return out;
}

export function cleanTiers(raw, legacyFx) {
  const out = {};
  for (const id of Object.keys(TIER_PARAMS)) {
    out[id] = raw && Array.isArray(raw[id]) ? cleanList(id, raw[id]) : clone(DEFAULT_TIERS[id]);
    if (!(raw && Array.isArray(raw[id])) && legacyFx && typeof legacyFx === 'object') {
      const d = defaultTier(out[id]);
      for (const [k, old] of Object.entries(LEGACY[id])) { const v = Number(legacyFx[old]); if (Number.isFinite(v)) d[k] = fix(v, TIER_PARAMS[id].find(p => p[0] === k)); }
    }
  }
  return out;
}

/* 找档位：档位 id → 名字 → 「第几档」的数字文本（从 1 数）→ 数字下标（从 0 数）；没指定或找不到返回 null */
export function findTier(tiers, id, ref) {
  const list = (tiers && tiers[id]) || DEFAULT_TIERS[id];
  if (typeof ref === 'string' && ref) return list.find(t => t.id === ref) || list.find(t => t.name === ref) || (/^\d+$/.test(ref) && list[Number(ref) - 1]) || null;
  return (Number.isInteger(ref) && list[ref]) || null;
}
/* 实际生效的档位：找不到就用默认档 */
export const tierOf = (tiers, id, ref) => findTier(tiers, id, ref) || defaultTier((tiers && tiers[id]) || DEFAULT_TIERS[id]);

/* 新加一档：复制默认档的参数，起一个没用过的 id 和没用过的「第n档」名字 */
export function newTier(list) {
  const taken = new Set(list.map(t => t.id)), names = new Set(list.map(t => t.name)), d = defaultTier(list);
  let n = list.length + 1; while (names.has(`第${n}档`)) n++;
  return { ...clone(d), id: freshId(taken), name: `第${n}档`, def: false };
}

/* 载入规则时把档位写法统一成档位 id（名字、「第几档」数字、旧版下标都换掉），之后改名、删前面的档都不会选错；找不到的回到默认档 '' */
export function normTierRefs(rules, tiers) {
  return rules.map(r => {
    if (!tiers || !tiers[r.effect] || r.tier === '' || r.tier === undefined || r.tier === null) return r;
    const hit = findTier(tiers, r.effect, r.tier); return { ...r, tier: hit ? hit.id : '' };
  });
}

/* 白曜动作名可以带档位后缀：seal:重、封桶·超大号、kick：3、audit-1、seal 重、seal・重（数字 = 第几档） */
export function parseTierAction(action) {
  const s = String(action ?? '').trim(), m = s.match(/^(.+?)\s*[:：·・•\-—]\s*(.+)$/) || s.match(/^(\S+)\s+(.+)$/);
  return m ? { action: m[1].trim(), tier: m[2].trim() } : { action: s, tier: null };
}
