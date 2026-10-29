/** Deterministic column constraints; public operations return new state. */
export const K = 32;
export const FIXED_DT = 1 / 120;
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const zeros = () => Array(K).fill(0);
const ones = () => Array(K).fill(1);
const weights = Object.freeze([0.25, 0.5, 1, 0.5, 0.25]);
const kinds = Object.freeze({
  pillow: Object.freeze({ min: 0.45, rebound: 0.30, damping: 0.55, bulge: 1.25, length: 240 }),
  jacket: Object.freeze({ min: 0.30, rebound: 1.20, damping: 1, bulge: 1.15, length: 250 }),
  bread: Object.freeze({ min: 1, rebound: 0, damping: 1, bulge: 1, length: 400 }),
  pan: Object.freeze({ min: 1, rebound: 0, damping: 1, bulge: 1, length: 340 }),
  bear: Object.freeze({ min: 0.55, rebound: 0.80, damping: 0.85, bulge: 1.20, length: 260 }),
  cat: Object.freeze({ min: 0.65, rebound: 0.50, damping: 0.85, bulge: 1, length: 200 }),
});
export const DEFAULT_TUNING = Object.freeze({
  C: 210, g_zip: 8, S: 60, L: 760, pressRise: 0.35, helperWeight: 0.8,
  autoThreshold: 0.9, autoDuration: 0.3, compressTime: 0.15, maxSlope: 18,
  burstCooldown: 1.5, kinds,
});
function mergeTuning(base, patch = {}) {
  const out = { ...base, ...patch, kinds: {} };
  for (const kind of Object.keys(kinds)) out.kinds[kind] = { ...base.kinds[kind], ...patch.kinds?.[kind] };
  for (const key of ['C', 'L', 'pressRise', 'autoDuration', 'compressTime', 'maxSlope', 'burstCooldown']) if (!Number.isFinite(out[key]) || out[key] <= 0) throw new RangeError(`Invalid tuning ${key}`);
  for (const key of ['g_zip', 'S', 'helperWeight']) if (!Number.isFinite(out[key]) || out[key] < 0) throw new RangeError(`Invalid tuning ${key}`);
  if (!(out.autoThreshold >= 0 && out.autoThreshold <= 1)) throw new RangeError('Invalid autoThreshold');
  for (const [kind, p] of Object.entries(out.kinds)) if (!(p.min > 0 && p.min <= 1 && p.bulge >= 1 && p.damping > 0 && p.rebound >= 0)) throw new RangeError(`Invalid material ${kind}`);
  return out;
}
export function createState({ seed = 1, time = 0, tuning } = {}) {
  if (!Number.isFinite(time)) throw new RangeError('Invalid time');
  return { time, originTime: time, ticks: 0, remainder: 0, seed: seed >>> 0,
    tuning: mergeTuning(DEFAULT_TUNING, tuning), items: [], hand: null, helpers: [], straps: [],
    z: 0, zipCol: 0, gap: zeros(), top: zeros(), pressure: zeros(), zipStress: 0,
    culpritId: null, blockedCol: null, burstUntil: -Infinity, completed: false, auto: null, events: [] };
}
export function createItem({ id, kind, owner = {}, heights, length, angle = 0, ...metadata }) {
  if (!kinds[kind]) throw new RangeError(`Unknown kind: ${kind}`);
  if (!Array.isArray(heights) || heights.length !== K || heights.some(h => !Number.isFinite(h) || h < 0)) throw new RangeError('heights must contain 32 nonnegative finite values');
  if (id == null) throw new TypeError('Item id required');
  return { ...metadata, id: String(id), kind, owner: { ...owner }, heights: [...heights],
    q: ones(), velocity: zeros(), volumeScale: 1, vacuumFactor: 1, inflated: false,
    length: length ?? kinds[kind].length, angle, fullPress: 0, broken: false,
    cat: kind === 'cat' ? { phase: 'sleep', until: 0, nextRoll: null, nextWake: null, sleepUntil: 0, fullPress: 0, actor: null } : null };
}
function clone(s) {
  return { ...s, tuning: mergeTuning(s.tuning), hand: s.hand && { ...s.hand },
    items: s.items.map(i => ({ ...i, owner: { ...i.owner }, heights: [...i.heights], q: [...i.q], velocity: [...i.velocity], cat: i.cat && { ...i.cat, actor: i.cat.actor && { ...i.cat.actor } } })),
    helpers: s.helpers.map(h => ({ ...h })), straps: s.straps.map(b => ({ ...b })),
    gap: [...s.gap], top: [...s.top], pressure: [...s.pressure], auto: s.auto && { ...s.auto }, events: [] };
}
function random(s) { s.seed = (Math.imul(s.seed, 1664525) + 1013904223) >>> 0; return s.seed / 4294967296; }
const material = (s, i) => s.tuning.kinds[i.kind];
const inside = i => !i.cat || !['lid', 'waiting'].includes(i.cat.phase);
const height = (i, c) => inside(i) ? i.heights[c] * i.volumeScale * (i.cat?.phase === 'head' ? 1.6 : 1) : 0;
function center(i) { const sum = i.heights.reduce((a, h) => a + h, 0); return sum ? i.heights.reduce((a, h, c) => a + h * c, 0) / sum : 15.5; }
function updateTop(s) { s.top = zeros(); for (const i of s.items) for (let c = 0; c < K; c++) s.top[c] += height(i, c) * i.q[c]; }
function addPressure(p, col, force) {
  const left = Math.floor(col), fraction = col - left;
  for (let d = -2; d <= 2; d++) {
    if (left + d >= 0 && left + d < K) p[left + d] += force * weights[d + 2] * (1 - fraction);
    if (fraction && left + d + 1 >= 0 && left + d + 1 < K) p[left + d + 1] += force * weights[d + 2] * fraction;
  }
}
function updatePressure(s) {
  s.pressure = zeros();
  if (s.hand) addPressure(s.pressure, s.hand.col, clamp((s.time - s.hand.since) / s.tuning.pressRise, 0, 1));
  for (const h of s.helpers) if (!h.lifted) addPressure(s.pressure, h.col, h.weight ?? s.tuning.helperWeight);
  for (const i of s.items) if (i.cat?.phase === 'lid') addPressure(s.pressure, center(i), 0.6);
  for (const b of s.straps) addPressure(s.pressure, b.col, 1);
}
function updateGap(s) {
  let gap = s.top.map((h, c) => c < s.zipCol ? 0 : Math.max(0, h - s.tuning.C));
  for (let pass = 0; pass < 2; pass++) gap = gap.map((g, c) => c < s.zipCol ? 0 : ((gap[c - 1] ?? g) + 2 * g + (gap[c + 1] ?? g)) / 4);
  for (let c = 1; c < K; c++) gap[c] = Math.min(gap[c], gap[c - 1] + s.tuning.maxSlope);
  for (let c = K - 2; c >= 0; c--) gap[c] = c < s.zipCol ? 0 : Math.min(gap[c], gap[c + 1] + s.tuning.maxSlope);
  s.gap = gap;
  s.zipStress = s.top.reduce((sum, h, c) => sum + (c < s.zipCol ? Math.max(0, h - s.tuning.C) : 0), 0);
}
function refresh(s) { s.zipCol = Math.floor(s.z * K + 1e-9); updatePressure(s); updateTop(s); updateGap(s); return s; }
function chooseCulprit(s, col) {
  let best = null, score = -1;
  for (let c = Math.max(0, col - 2); c <= Math.min(K - 1, col + 2); c++) {
    let stack = 0;
    for (const i of s.items) {
      const h = height(i, c) * i.q[c];
      const contribution = Math.max(0, stack + h - s.tuning.C) - Math.max(0, stack - s.tuning.C);
      const weighted = contribution / (1 + Math.abs(c - col));
      if (h && weighted >= score) { score = weighted; best = i.id; }
      stack += h;
    }
  }
  return best;
}
export function addItem(state, item) {
  const s = clone(state);
  if (s.items.some(i => i.id === item.id)) throw new Error(`Duplicate item id: ${item.id}`);
  const i = clone({ ...s, items: [item] }).items[0];
  if (i.cat) { i.cat.nextRoll = s.time + 15 + random(s) * 15; i.cat.nextWake = null; }
  s.items.push(i); s.completed = false; s.auto = null; return refresh(s);
}
export function removeItem(state, id) {
  const s = clone(state); s.items = s.items.filter(i => i.id !== id);
  if (s.culpritId === id) { s.culpritId = null; s.blockedCol = null; }
  s.completed = false; return refresh(s);
}
export function replaceItemProfile(state, id, profile) {
  const s = clone(state), i = s.items.find(i => i.id === id);
  if (i) {
    const checked = createItem({ ...i, ...profile, id: i.id, kind: i.kind, owner: i.owner });
    Object.assign(i, profile, { heights: checked.heights, q: ones(), velocity: zeros(), id: i.id, kind: i.kind, owner: i.owner });
    s.culpritId = null; s.blockedCol = null; s.auto = null; s.completed = false;
  }
  return refresh(s);
}
export function setHand(state, hand) {
  const s = clone(state); s.hand = hand && hand.down !== false ? { col: clamp(hand.col, 0, K - 1), since: s.hand?.since ?? s.time } : null;
  if (s.hand) s.auto = null; return refresh(s);
}
export function setTuning(state, patch) { const s = clone(state); s.tuning = mergeTuning(s.tuning, patch); return refresh(s); }
export function addHelper(state, helper) { const s = clone(state); s.helpers.push({ ...helper, lifted: helper.lifted === true, col: clamp(helper.col, 0, K - 1), until: helper.until ?? Infinity }); return refresh(s); }
export function moveHelper(state, id, col) { const s = clone(state); const h = s.helpers.find(h => h.id === id); if (h) h.col = clamp(col, 0, K - 1); return refresh(s); }
export function setHelperLifted(state, id, lifted) { const s = clone(state); const h = s.helpers.find(h => h.id === id); if (h) h.lifted = lifted === true; return refresh(s); }
export function addStrap(state, strap) { const s = clone(state); s.straps.push({ ...strap, col: clamp(strap.col, 0, K - 1) }); return refresh(s); }
export function moveStrap(state, id, col) { const s = clone(state); const b = s.straps.find(b => b.id === id); if (b) b.col = clamp(col, 0, K - 1); return refresh(s); }
export function inflateItem(state, id) {
  const s = clone(state), i = s.items.find(i => i.id === id);
  if (i && material(s, i).min < 1) { i.volumeScale *= 1.4; i.inflated = true; s.events.push({ type: 'inflate', id }); }
  return refresh(s);
}
export function vacuum(state) {
  const s = clone(state); for (const i of s.items) if (material(s, i).min < 1) { i.volumeScale = Math.max(0.45, i.volumeScale * 0.8); i.vacuumFactor *= 1.5; } return refresh(s);
}
function catHead(s, i, actor) { i.cat.phase = 'head'; i.cat.until = s.time + 4; i.cat.fullPress = 0; i.cat.actor = actor ? { ...actor } : null; s.events.push({ type: 'cat-head', id: i.id, actor: i.cat.actor }); }
export function wakeCat(state, id, actor) { const s = clone(state), i = s.items.find(i => i.id === id && i.cat); if (i && inside(i)) catHead(s, i, actor); return refresh(s); }
export function tapCat(state, id) {
  const s = clone(state), i = s.items.find(i => i.id === id && i.cat);
  if (i && ['head', 'tail'].includes(i.cat.phase)) {
    Object.assign(i.cat, { phase: 'sleep', until: 0, sleepUntil: s.time + 10, nextWake: null, fullPress: 0, actor: null });
    i.cat.nextRoll = s.time + 15 + random(s) * 15; s.events.push({ type: 'cat-sleep', id });
  }
  return refresh(s);
}
function complete(s) { if (s.z === 1 && !s.completed && s.items.some(inside)) { s.completed = true; s.events.push({ type: 'complete' }); } }
function pull(s, target) {
  if (s.hand) return;
  target = clamp(target, 0, 1);
  if (target <= s.z) { s.z = target; s.completed = false; s.culpritId = null; s.blockedCol = null; s.auto = null; refresh(s); return; }
  for (let c = s.zipCol; c < Math.ceil(target * K - 1e-9); c++) {
    if (s.gap[c] > s.tuning.g_zip) { s.z = c / K; s.blockedCol = c; s.culpritId = chooseCulprit(s, c); s.auto = null; s.events.push({ type: 'blocked', col: c, id: s.culpritId }); refresh(s); return; }
  }
  s.z = target; s.culpritId = null; s.blockedCol = null; refresh(s);
}
export function dragZip(state, target) {
  const s = clone(state); pull(s, target);
  // Settle newly locked columns without advancing the fixed simulation clock.
  solve(s, 0); settleZip(s); return s;
}
function compressColumn(s, c, budget) {
  for (let n = s.items.length - 1; n >= 0 && budget > 1e-9; n--) {
    const i = s.items[n], h = height(i, c), p = material(s, i);
    if (!h || p.min === 1) continue;
    const removed = Math.min(budget, h * Math.max(0, i.q[c] - p.min));
    i.q[c] -= removed / h; i.velocity[c] = 0; budget -= removed;
  }
}
function redistribute(s) {
  for (const i of s.items) {
    const p = material(s, i); if (p.min === 1 || !inside(i)) continue;
    let natural = 0, volume = 0;
    for (let c = 0; c < K; c++) { natural += height(i, c); volume += height(i, c) * i.q[c]; }
    let deficit = Math.max(0, natural - volume); if (deficit < 1e-7) continue;
    let candidates = [];
    // A released indentation recovers through the spring; do not refill it in one solver pass.
    for (let c = s.zipCol; c < K; c++) if (s.pressure[c] < 0.1 && height(i, c) && i.q[c] >= 1 && i.q[c] < p.bulge) candidates.push(c);
    for (let pass = 0; pass < K && deficit > 1e-7 && candidates.length; pass++) {
      const totalSpace = candidates.reduce((sum, c) => sum + Math.max(1, s.tuning.C - s.top[c]), 0); let allocated = 0;
      for (const c of candidates) {
        const h = height(i, c), add = Math.min(h * (p.bulge - i.q[c]), deficit * Math.max(1, s.tuning.C - s.top[c]) / totalSpace);
        i.q[c] += add / h; s.top[c] += add; allocated += add;
      }
      deficit -= allocated; candidates = candidates.filter(c => i.q[c] < p.bulge - 1e-9); if (allocated < 1e-8) break;
    }
  }
}
function solve(s, elapsed = FIXED_DT) {
  for (let round = 0; round < 4; round++) {
    updatePressure(s); updateTop(s);
    for (let c = 0; c < K; c++) if (s.pressure[c] > 0) {
      const natural = s.items.reduce((sum, i) => sum + height(i, c), 0);
      compressColumn(s, c, natural * s.pressure[c] * elapsed / (4 * s.tuning.compressTime));
    }
    updateTop(s);
    if (s.hand || s.helpers.some(h => !h.lifted) || s.straps.length || s.zipCol || s.items.some(i => i.cat?.phase === 'lid')) redistribute(s);
    updateTop(s);
    for (let c = 0; c < s.zipCol; c++) compressColumn(s, c, Math.max(0, s.top[c] - s.tuning.C));
    updateTop(s); if (s.zipCol) redistribute(s); updateTop(s); updateGap(s);
  }
}
function rebound(s) {
  const constrained = s.hand || s.helpers.some(h => !h.lifted) || s.straps.length || s.zipCol || s.items.some(i => i.cat?.phase === 'lid');
  for (const i of s.items) {
    const p = material(s, i); if (p.min === 1 || !inside(i)) continue;
    const tau = (i.inflated && i.kind === 'pillow' ? 0.18 : p.rebound) * i.vacuumFactor, omega = 1 / Math.max(FIXED_DT, tau);
    for (let c = s.zipCol; c < K; c++) {
      if (!height(i, c) || s.pressure[c] >= 0.1 || (constrained && i.q[c] > 1)) continue;
      const acceleration = omega * omega * (1 - i.q[c]) - 2 * p.damping * omega * i.velocity[c];
      i.velocity[c] += acceleration * FIXED_DT; i.q[c] += i.velocity[c] * FIXED_DT;
      if (i.q[c] < p.min || i.q[c] > p.bulge) { i.q[c] = clamp(i.q[c], p.min, p.bulge); i.velocity[c] = 0; }
      if (Math.abs(i.q[c] - 1) < 0.0001 && Math.abs(i.velocity[c]) < 0.0001) { i.q[c] = 1; i.velocity[c] = 0; }
    }
  }
}
function updateCats(s) {
  for (const i of s.items) {
    const cat = i.cat; if (!cat || cat.phase === 'waiting') continue;
    if (cat.phase === 'lid') { if (s.time + 1e-9 >= cat.until) { cat.phase = 'waiting'; s.events.push({ type: 'cat-waiting', id: i.id }); } continue; }
    if (cat.phase === 'head') { if (s.time + 1e-9 >= cat.until) { cat.phase = 'lid'; cat.until = s.time + 6; s.events.push({ type: 'cat-lid', id: i.id }); } continue; }
    if (cat.phase === 'tail') { if (s.time + 1e-9 >= cat.until) catHead(s, i); continue; }
    if (cat.phase === 'ear') {
      if (s.time + 1e-9 >= cat.until) {
        const used = i.heights.map((h, c) => h ? c : -1).filter(c => c >= 0), direction = random(s) < 0.5 ? -2 : 2;
        const shift = used.length ? clamp(direction, -used[0], K - 1 - used.at(-1)) : 0;
        for (const key of ['heights', 'q', 'velocity']) { const values = i[key]; i[key] = Array.from({ length: K }, (_, c) => values[c - shift] ?? (key === 'q' ? 1 : 0)); }
        cat.phase = 'sleep'; cat.nextRoll = s.time + 15 + random(s) * 15; s.events.push({ type: 'cat-roll', id: i.id, shift });
      }
      continue;
    }
    const handFull = s.hand && s.time - s.hand.since >= s.tuning.pressRise - 1e-9 && Math.abs(s.hand.col - center(i)) <= 0.5;
    cat.fullPress = handFull ? cat.fullPress + FIXED_DT : 0;
    if (s.z >= 0.5 && cat.nextWake == null) cat.nextWake = s.time + 40 + random(s) * 30;
    if (cat.fullPress > 1 || (s.time >= cat.sleepUntil && s.z >= 0.5 && cat.nextWake != null && s.time >= cat.nextWake)) {
      cat.phase = 'tail'; cat.until = s.time + 1; cat.fullPress = 0; s.events.push({ type: 'cat-tail', id: i.id });
    } else if (s.time >= cat.nextRoll && s.time >= cat.sleepUntil) { cat.phase = 'ear'; cat.until = s.time + 0.6; s.events.push({ type: 'cat-ear', id: i.id }); }
  }
}
function updateBread(s) {
  const broken = [];
  for (const i of s.items) {
    if (i.kind !== 'bread' || i.broken) continue;
    const c = Math.round(s.hand?.col ?? -1);
    const full = s.hand && s.time - s.hand.since >= s.tuning.pressRise - 1e-9 && i.heights[c] > 0 && s.culpritId === i.id;
    i.fullPress = full ? i.fullPress + FIXED_DT : 0;
    if (i.fullPress + 1e-9 >= 1.2) broken.push(i);
  }
  for (const i of broken) {
    const occupied = i.heights.map((h, c) => h ? c : -1).filter(c => c >= 0), mid = (occupied[0] + occupied.at(-1)) / 2;
    const pieces = [0, 1].map(part => createItem({ ...i, id: `${i.id}:${part + 1}`, length: i.length / 2, angle: 0,
      heights: i.heights.map((h, c) => (part === 0 ? c <= mid : c > mid) ? h / 2 : 0) }));
    pieces.forEach(p => { p.broken = true; });
    s.items.splice(s.items.indexOf(i), 1, ...pieces); s.culpritId = null; s.blockedCol = null;
    s.events.push({ type: 'bread-break', id: i.id, pieces: pieces.map(p => p.id) });
  }
}
function zipStrength(s) { return s.tuning.S + 40 * s.straps.length + 20 * s.helpers.filter(h => !h.lifted && h.col < s.zipCol).length; }
function settleZip(s) {
  const overloaded = s.zipStress > zipStrength(s);
  if (overloaded) s.completed = false;
  if (overloaded && s.time + 1e-9 >= s.burstUntil) {
    const col = s.top.slice(0, s.zipCol).reduce((best, h, c) => h > s.top[best] ? c : best, 0);
    s.culpritId = chooseCulprit(s, col); s.blockedCol = col; s.z = Math.max(0, s.z - 4 / K);
    s.burstUntil = s.time + s.tuning.burstCooldown; s.completed = false; s.auto = null;
    s.events.push({ type: 'burst', id: s.culpritId, col }); refresh(s);
  }
  // Cooldown prevents another burst; it does not make an overloaded case shippable.
  if (!overloaded) complete(s);
}
function tick(s) {
  s.ticks++; s.time = s.originTime + s.ticks * FIXED_DT; s.helpers = s.helpers.filter(h => h.until > s.time + 1e-9);
  updateCats(s); updateBread(s); solve(s); rebound(s); updateTop(s); updateGap(s);
  const canAuto = !s.hand && s.zipStress <= zipStrength(s) && s.z >= s.tuning.autoThreshold && s.z < 1 && s.gap.slice(s.zipCol).every(g => g <= s.tuning.g_zip);
  if (canAuto) {
    s.auto ??= { start: s.z, elapsed: 0 }; s.auto.elapsed += FIXED_DT;
    const progress = Math.min(1, (s.auto.elapsed + 1e-10) / s.tuning.autoDuration);
    pull(s, s.auto.start + (1 - s.auto.start) * progress);
    solve(s, 0);
  } else s.auto = null;
  settleZip(s);
  return s;
}
export function step(state) { return tick(clone(state)); }
export function advance(state, seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) throw new RangeError('seconds must be nonnegative');
  const s = clone(state), total = s.remainder + seconds, count = Math.floor((total + 1e-10) / FIXED_DT);
  s.remainder = Math.max(0, total - count * FIXED_DT); for (let n = 0; n < count; n++) tick(s); return s;
}
/** A pure one-tick probe lets the renderer sleep without losing scheduled animal actions. */
export function isSettled(state) {
  const next = step(state);
  if (next.z !== state.z || next.items.length !== state.items.length || next.events.length) return false;
  if (next.gap.some((g, c) => Math.abs(g - state.gap[c]) > 1e-7)) return false;
  return state.items.every((i, n) => i.cat?.phase === next.items[n].cat?.phase &&
    i.q.every((q, c) => Math.abs(q - next.items[n].q[c]) <= 1e-7 && Math.abs(i.velocity[c] - next.items[n].velocity[c]) <= 1e-7));
}
export function nextWakeTime(state) {
  if (!isSettled(state)) return state.time + FIXED_DT;
  const times = state.helpers.map(h => h.until);
  if (state.hand) times.push(state.hand.since + state.tuning.pressRise, state.time + FIXED_DT);
  for (const i of state.items) {
    const cat = i.cat; if (!cat || cat.phase === 'waiting') continue;
    if (cat.phase === 'sleep') {
      times.push(Math.max(cat.nextRoll ?? Infinity, cat.sleepUntil));
      if (state.z >= 0.5 && cat.nextWake != null) times.push(Math.max(cat.nextWake, cat.sleepUntil));
    } else times.push(cat.until);
  }
  return Math.min(Infinity, ...times.filter(t => t > state.time + 1e-9));
}
