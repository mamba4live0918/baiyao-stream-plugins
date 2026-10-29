/* 每帧的玩法：布局重建、关卡、货车与传送带、拿起与投递、判定（分对收下 / 分错弹出并翻倍）、识别台、露头圆、收工判断 */
import { G, isGarbage, toWorld, truckCY, truckTop } from './state.js';
import { RAPIER, buildStatics, removeStatics, makeHead, makeTruckBody, angleOf } from './physics2d.js';
import { layout2d } from './layout2d.js';
import { MODES } from './modes.js';
import { GARBAGE_BY_ID, itemsByCat, binName, wrongTip } from './garbage-catalog.js';
import { judgeDrop, newStats, recordWrong } from './mistake.js';
import { tierOf } from './tiers.js';
import { segsEnd } from './timed.js';
import { clone } from './config.js';
import { spawnItem, removeItem, cloneItem, pos, halfExt, setLayer, surfaceY, surfaceUnder, rayDown, overlaps, binAtX, binHolding, placeOnPile, wrapTape, stripItem, reveal, randomItem, inTruckZone, outOfWorld, BIN_WALL } from './items.js';
import { unseal, unleak, updSeal, updLeak, rebuildLid, updBig, bigImpact, kick, updDrone, droneOut, updTricky, binAnchor, binsMid, binWord } from './effects.js';
import { addTag, multPop, refreshHud, showResult, syncBinEls, bumpBinEl, toast, clearPops, popCount, tags } from './hud.js';
import { burst, updParts, updFlyers } from './particles.js';
import { sfx } from './sound.js';
import { curLevels, curIdx, setIdx, curLevel, speedNow, auditNow, beltV, remaining } from './levels.js';
import { rnd, clamp, lerp, eOut, quatZ, CNAME } from './util.js';

/* ================= 布局：窗口大小、画面大小、台面高度、玩法一变就重建场景碰撞体 ================= */
export function relayout() {
  const S = G.S, L = layout2d(G.W, G.H, { size: S.layout.size, counterY: S.layout.counterY, mode: S.mode });
  G.L = L;
  if (G.statics) removeStatics(G.world, G.statics);
  G.statics = buildStatics(G.world, G.fixed, L, L.bins);
  // 桶对象保留（计数、封 / 漏状态、标签的锚点都挂在上面），只换位置和碰撞体
  const old = G.bins.length === L.bins.length ? G.bins : [];
  G.bins = L.bins.map((b, i) => Object.assign(old[i] || { count: 0, seal: null, leak: null, pulse: 0, jolt: 0, hover: 0 }, b, { cols: G.statics.bins[i] }));
  for (const bin of G.bins) { rebuildLid(bin); if (bin.leak) bin.cols.bottom.setEnabled(false); }
  if (!G.truck.body) G.truck.body = makeTruckBody(G.world, L.truck.w, L.truck.h, truckCY());
  G.truck.x = G.truck.st === 'gone' ? L.truck.away : G.truck.st === 'unload' ? L.truck.x : G.truck.x;
  rebuildHead();
  for (const b of G.items) fitInside(b);
  syncBinEls();
}
/* 窗口变小、台面变高以后，把物件挪回窗口里；压进柜台 / 传送带里的提到台面上 */
function fitInside(b) {
  if (b.st !== 'free') return;
  const L = G.L, p = pos(b), hw = b.size[0] / 2, hh = b.size[1] / 2;
  const x = clamp(p.x, hw + .05, L.worldW - hw - .05); let y = clamp(p.y, hh + .05, L.worldH - hh - .05);
  if (b.layer === 'back' && x + hw > L.belt.x0 && y - hh < L.counter.top) y = Math.min(L.worldH - hh - .05, L.counter.top + hh + .05);
  if (x !== p.x || y !== p.y) b.rb.setTranslation({ x, y, z: 0 }, true);
}
/* 露头圆：设置里是窗口百分比（x、y 按宽高，r 按高）；碰撞体比画面上的圆大一圈，件的描边也压不进看得见的圆 */
export function rebuildHead() {
  if (G.headCol) { G.world.removeCollider(G.headCol, false); G.headCol = null; }
  const h = G.S.layout.head, L = G.L;
  if (!h.on) { G.head = null; return; }
  G.head = { x: h.x / 100 * L.worldW, y: L.worldH * (1 - h.y / 100), r: h.r / 100 * L.worldH };
  G.headCol = makeHead(G.world, G.fixed, G.head.x, G.head.y, G.head.r + Math.max(8 / L.ppm, G.head.r * .05));
}
/* 圆压到了柜台、传送带或桶：台上的件会被推开 */
export function headOverlapsStation() {
  const h = G.head; if (!h) return false; const L = G.L, low = h.y - h.r;
  return low < L.counter.top + .1 || G.bins.some(b => low < b.top && Math.abs(h.x - b.x) < h.r + b.w / 2);
}
/* 中心落进露头圆里的件放回台面（打开或挪动露头圆时，圆可能直接生成在件上） */
function clearHeadCircle() {
  const h = G.head; if (!h) return;
  for (const b of G.items) { if (b.st !== 'free') continue; const p = pos(b); if (Math.hypot(p.x - h.x, p.y - h.y) < h.r) placeOnPile(b, true); }
}

/* ================= 关卡 ================= */
export function startLevel(i) {
  const S = G.S, LV = curLevels();
  if (i !== undefined) { setIdx(((i % LV.length) + LV.length) % LV.length); G.save(); }
  G.runLevel = clone(LV[clamp(curIdx(), 0, LV.length - 1)]); const L = G.runLevel;
  for (const d of G.drones) if (d.st !== 'gone') { d.carry = null; droneOut(d); }
  G.held = null;
  for (const b of [...G.items]) removeItem(b); G.unloads.length = 0;
  G.delivered = 0; G.stats = newStats(); G.splits.length = 0; clearPops(); G.state = 'work'; G.overtime = false; G.elapsed = 0; G.doneT = 0; G.spawnT = 0; G.shiftNo++;
  for (const b of G.bins) b.count = 0; syncBinEls();
  // 按关卡配置生成这一关的物件：快递按颜色，垃圾按分类在启用品种里随机；再挑出缠胶带 / 套袋、撕面单 / 糊泥的
  const items = [], miss = [];
  if (isGarbage()) {
    const by = itemsByCat(S.garbage.items);
    for (const [c, k] of [[0, 'rec'], [1, 'haz'], [2, 'kit'], [3, 'oth']]) { if (!L[k]) continue; if (!by[c].length) { miss.push(binName(c, S.garbage.naming)); continue; } for (let j = 0; j < L[k]; j++) { const g = by[c][Math.floor(Math.random() * by[c].length)]; items.push({ kind: 'garbage', itemId: g.id, cat: c }); } }
  } else for (const [c, k] of [[0, 'red'], [1, 'yellow'], [2, 'blue']]) for (let j = 0; j < L[k]; j++) items.push({ kind: 'box', color: c, cat: c });
  if (miss.length) setTimeout(() => toast(`${miss.join('、')}没有启用的品种，这一类本关不出`), 0);
  for (let j = items.length - 1; j > 0; j--) { const r = Math.floor(Math.random() * (j + 1)); [items[j], items[r]] = [items[r], items[j]]; }
  const idx = items.map((_, j) => j).sort(() => Math.random() - .5);
  const nTape = isGarbage() ? L.bag : L.tape, nStrip = isGarbage() ? L.mud : L.strip;
  for (let j = 0; j < nTape && j < idx.length; j++) items[idx[j]].tape = true;
  for (let j = 0; j < nStrip && j < idx.length; j++) items[idx[idx.length - 1 - j]].strip = true;
  // 观众送礼排队的效果（带名字的车、盲盒、胶带、面单、帮忙、踹一脚）跨关保留；正在落下的盲盒放回队列
  const viewerBatches = G.truck.batches.filter(bt => bt.name && bt.left > 0);
  G.truck.batches = (items.length ? [{ name: '', left: items.length, items }] : []).concat(viewerBatches);
  if (G.truck.st !== 'gone' && !G.truck.batches.length) { G.truck.st = 'out'; G.truck.t = 0; }
  G.bigQueue = G.bigQueue.filter(q => q.name); for (const w of G.warns) if (w.name) G.bigQueue.unshift({ name: w.name, color: w.color, n: w.n, hits: w.hits }); G.warns = [];
  for (let j = 0; j < L.blind; j++) G.bigQueue.push({ name: '', color: 0, n: L.blindSize, hits: tierOf(S.tiers, 'blind').hits }); G.bigT = 4;
  for (const b of G.bins) { unseal(b, true); unleak(b, true); }
  showResult(null); refreshHud(true);
}
export function nextLevel() { const n = curLevels().length, i = curIdx(), last = i >= n - 1; startLevel(last ? (G.S.loopLevels ? 0 : i) : i + 1); }
function updShift(dt) {
  if (G.state === 'work') {
    G.elapsed += dt; const L = curLevel();
    if (!G.overtime && L.time > 0 && G.elapsed >= L.time && remaining() > 0) { G.state = 'fail'; G.doneT = 0; sfx.wrong(); showResult(false); }
    else if (remaining() === 0 && !G.held && !G.drones.some(d => d.carry)) {
      G.state = 'done'; G.doneT = 0; sfx.done(); showResult(true);
      for (const bin of G.bins) burst('conf', { x: bin.x, y: bin.top + .6 }, 14, { sp: 1.2 });
    }
  } else { G.doneT += dt; if (G.S.afterLevel === 'auto' && G.doneT >= G.S.autoNextSec) G.state === 'done' ? nextLevel() : startLevel(); }
}

/* ================= 拿起与投递 =================
   拿着的件画在最上面、不和任何东西碰撞，跟着鼠标走；松手时决定落到哪一层：
   在桶的正上方 → 桶那一层（掉进桶里）；压在柜台 / 传送带 / 货车前面 → 桶那一层（掉到地上）；其余 → 台面那一层（落到货堆上） */
export function grab(b, sx, sy) {
  b.st = 'held'; b.rb.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true); b.col.setEnabled(false);
  b.dropFront = 0; b.popUp = false;
  const p = pos(b), w = toWorld(sx, sy), a = angleOf(b.rb);
  G.held = { b, x: p.x, y: p.y, px: p.x, py: p.y, vx: 0, vy: 0, ox: clamp(w.x - p.x, -.3, .3), oy: clamp(w.y - p.y, -.3, .3), a, base: Math.round(a / (Math.PI / 2)) * (Math.PI / 2), sw: 0, va: 0, sx, sy };
  sfx.pick();
}
/* 松手会落到哪：{ layer, bin, y }（y 是落点高度，画虚线用） */
export function dropTarget(b) {
  const p = pos(b), [hw, hh] = halfExt(b), L = G.L, bin = binAtX(p.x), bottom = p.y - hh;
  const T = G.truck, onTruck = T.st !== 'gone' && p.x - hw < T.x + L.truck.w / 2 && bottom < truckTop();
  const layer = bin || (bottom < L.counter.top - .02 && p.x + hw > L.belt.x0) || onTruck ? 'front' : 'back';
  return { layer, bin, y: rayDown(p.x, bottom, layer, b) };
}
export function release() {
  const h = G.held; if (!h) return; G.held = null; const b = h.b;
  if (b.st !== 'held') return;
  const t = dropTarget(b), [hw, hh] = halfExt(b); let { x, y } = pos(b);
  if (t.layer === 'back') { if (overlaps(b, 'back', x, y)) y = Math.max(y, surfaceUnder(x, hw, 'back', b, true) + hh + .03); }   // 松在货堆里面：放到这一处的堆顶上，不把整堆炸开
  else if (t.bin) {                                           // 压在桶壁上：提到桶口再落
    const bin = t.bin, inner = bin.w / 2 - BIN_WALL - hw - .02;
    if (y - hh < bin.top + .05 && Math.abs(x - bin.x) > inner) { y = bin.top + hh + .08; x = inner > 0 ? clamp(x, bin.x - inner, bin.x + inner) : bin.x; }
  }
  b.st = 'free'; b.rb.setBodyType(RAPIER.RigidBodyType.Dynamic, true); b.rb.setTranslation({ x, y, z: 0 }, true);
  setLayer(b, t.layer); b.col.setEnabled(true); b.launchedAt = G.time; b.popBin = null;
  let vx = h.vx * .55, vy = Math.min(h.vy * .55, 3); if (t.bin) vx *= .25;   // 对准桶松手：基本直着掉进去
  const sp = Math.hypot(vx, vy); if (sp > 6) { vx *= 6 / sp; vy *= 6 / sp; }
  b.rb.setLinvel({ x: vx, y: vy, z: 0 }, true); b.rb.setAngvel({ x: 0, y: 0, z: -vx * .5 }, true);
}
function updHeld(dt) {
  const h = G.held; if (!h) return; const b = h.b, L = G.L;
  const w = toWorld(h.sx, h.sy), hw = b.size[0] / 2, hh = b.size[1] / 2;
  const tx = clamp(w.x - h.ox, hw + .05, L.worldW - hw - .05), ty = clamp(w.y - h.oy, hh + .05, L.worldH - hh - .05);
  h.px = h.x; h.py = h.y; const k = Math.min(1, dt * (b.big ? 11 : 18)); h.x = lerp(h.x, tx, k); h.y = lerp(h.y, ty, k);
  h.vx = (h.x - h.px) / Math.max(dt, 1e-3); h.vy = (h.y - h.py) / Math.max(dt, 1e-3);
  h.va += ((-h.vx * .03) - h.sw) * 140 * dt - h.va * 15 * dt; h.sw = clamp(h.sw + h.va * dt, -.6, .6);
  h.a = lerp(h.a, h.base + h.sw, Math.min(1, dt * 10));
  b.rb.setNextKinematicTranslation({ x: h.x, y: h.y, z: 0 }); b.rb.setNextKinematicRotation(quatZ(h.a));
  G.heldTarget = dropTarget(b);
  updScanHeld(dt);
}

/* ================= 识别台（扫码台）：撕了面单 / 糊了泥的件拿到识别台的拱门下照一会儿 ================= */
const nearScan = (x, y) => Math.abs(x - G.L.scan.x) < .7 && y > G.L.scan.top - .3 && y < G.L.scan.top + 1.6;
let scanBeep = 0;
function updScanHeld(dt) {
  const h = G.held, b = h.b; if (!b.stripped) return;
  if (nearScan(h.x, h.y)) { b.scanT += dt; if (G.time - scanBeep > .18) { scanBeep = G.time; sfx.beep(); } if (b.scanT >= (b.scanNeed || .7)) reveal(b); }
  else b.scanT = Math.max(0, b.scanT - dt * 2);
}
function updScanner(dt) {
  G.scanOn = false;
  for (const b of G.items) {
    if (!b.stripped || b.st === 'gone') continue; G.scanOn = true;
    if (b.st !== 'free' || b.layer !== 'back') continue; const p = pos(b);
    if (nearScan(p.x, p.y)) { b.scanT += dt; if (b.scanT >= (b.scanNeed || .7)) reveal(b); }
  }
}

/* ================= 货车与传送带 ================= */
/* 货车：从左边开进来停在传送带前，等入口空了就往传送带上扔一件；车上没货了就开走 */
function updTruck(dt) {
  const T = G.truck, L = G.L;
  if (T.st === 'gone') { if (T.batches.length && G.state !== 'fail') { T.st = 'in'; T.t = 0; T.name = T.batches[0].name; T.x = L.truck.away; sfx.truck(); } }
  else {
    T.t += dt;
    if (T.st === 'in') { T.x = lerp(L.truck.away, L.truck.x, eOut(Math.min(1, T.t / 1.0))); if (T.t >= 1) { T.st = 'unload'; T.t = 0; G.shake = Math.max(G.shake, .25); } }
    else if (T.st === 'unload') { if (T.batches.length || G.unloads.length) T.t = 0; else if (T.t > .8) { T.st = 'out'; T.t = 0; } }
    else if (T.st === 'out') { const k = Math.min(1, T.t / .9); T.x = lerp(L.truck.x, L.truck.away, k * k); if (T.t >= .9) { T.st = 'gone'; if (T.batches.length) T.t = 0; } }
  }
  const on = T.st !== 'gone'; if (T.bodyOn !== on) { T.bodyOn = on; T.body.setEnabled(on); }
  if (on) T.body.setNextKinematicTranslation({ x: T.x, y: truckCY(), z: 0 });
}
/* 从车厢尾部扔一件到传送带起点：沿弧线飞过去，落到带子上才开始算物理 */
function unloadOne(bt) {
  const T = G.truck, L = G.L, it = (bt.items && bt.items.shift()) || randomItem();
  if (T.name !== bt.name) T.name = bt.name;
  const fx = T.x + L.truck.w / 2 - .5, fy = truckTop() + .1, b = spawnItem({ ...it, name: bt.name, x: fx, y: fy });
  b.st = 'unload'; b.rb.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true); b.col.setEnabled(false);
  G.unloads.push({ b, t: 0, dur: .5, fx, fy, tx: L.belt.x0 + .6, ty: L.belt.top + b.size[1] / 2 + .03, a0: rnd(-.7, .7) });
  if (it.tape) wrapTape(b, ''); else if (it.strip) stripItem(b, '');
  else if (G.pendingTape.length) { const q = G.pendingTape.shift(); wrapTape(b, q.name, q.layers); }
  else if (G.pendingStrip.length) { const q = G.pendingStrip.shift(); stripItem(b, q.name, q.scan); }
  bt.left--; if (bt.left <= 0) G.truck.batches.shift();
}
function updUnloads(dt) {
  for (let i = G.unloads.length - 1; i >= 0; i--) {
    const u = G.unloads[i], b = u.b; if (b.st !== 'unload') { G.unloads.splice(i, 1); continue; }
    u.t += dt; const k = Math.min(1, u.t / u.dur);
    b.rb.setNextKinematicTranslation({ x: lerp(u.fx, u.tx, k), y: lerp(u.fy, u.ty, k) + Math.sin(k * Math.PI) * .9, z: 0 }); b.rb.setNextKinematicRotation(quatZ(u.a0 * (1 - k)));
    if (k < 1) continue;
    G.unloads.splice(i, 1); b.st = 'free'; b.rb.setBodyType(RAPIER.RigidBodyType.Dynamic, true); b.col.setEnabled(true);
    b.rb.setLinvel({ x: beltV() * speedNow(), y: 0, z: 0 }, true); b.rb.setAngvel({ x: 0, y: 0, z: 0 }, true); sfx.thump();
  }
}
const ENTRY = () => Math.min(1.0, (G.L.belt.x1 - G.L.belt.x0) / 2);   // 入口区：带子前半段
function updBelt(dt) {
  const L = G.L, boost = speedNow(), v = beltV() * boost, running = G.state === 'work';
  if (running) G.beltPos += v * dt;
  let jamNow = false, entry = false;
  for (const b of G.items) {
    b.onBelt = false; if (b.st !== 'free' || b.layer !== 'back') continue;
    const p = pos(b), [hw, hh] = halfExt(b), bottom = p.y - hh;
    // 在带面上 = 底面贴着带面（台面上叠第二层的件不算）
    if (p.x > L.belt.x0 - .05 && p.x < L.belt.x1 + .05 && bottom < L.belt.top + .15 && bottom > L.belt.top - .35) {
      b.onBelt = true; b.beltT = G.time;
      if (running) {
        const lv = b.rb.linvel();
        // 带子末端把件往台面里抛一下，货堆铺得开，出口不会被头几件堵死
        if (p.x > L.belt.x1 - .25 && !b.tossed && lv.x > .2) { b.tossed = true; b.rb.setLinvel({ x: rnd(2.2, 4.2) * Math.sqrt(boost), y: rnd(1.6, 3.2), z: 0 }, true); }
        else { b.rb.setLinvel({ x: lerp(lv.x, v, .22), y: lv.y, z: 0 }, true); b.rb.setAngvel({ x: 0, y: 0, z: b.rb.angvel().z * .9 }, true); }
        if (p.x > L.belt.x1 - .9 && lv.x < .3) jamNow = true;
      }
    }
    if (p.x - hw < L.belt.x0 + ENTRY() && p.x > L.belt.x0 - .1 && p.y < L.belt.top + 2) entry = true;
  }
  // 刚下传送带 2.5 秒内、还停在出口附近的件往台面里推（直接给速度：台面摩擦大，慢慢加速推不动）；推不动的过一会儿就不管了，这一片堆满照样会堵
  if (running) for (const b of G.items) {
    if (b.st !== 'free' || b.layer !== 'back' || b.onBelt || !(G.time - b.beltT < 2.5)) continue; const p = pos(b);
    if (p.x > L.belt.x1 - .3 && p.x < L.belt.x1 + 2 && p.y < L.counter.top + 1.4) { const lv = b.rb.linvel(); if (lv.x < 1.4) b.rb.setLinvel({ x: 1.4, y: lv.y, z: 0 }, true); }
  }
  G.jamT = jamNow ? G.jamT + dt : Math.max(0, G.jamT - dt * 2); G.jam = G.jamT > .6; G.entryBlocked = entry;
  G.spawnT += dt;
  const T = G.truck;
  if (running && !G.jam && !entry && !G.unloads.length && T.st === 'unload' && T.batches.length && G.spawnT >= G.S.feedGap / (beltV() / 1.9) / boost) { unloadOne(T.batches[0]); G.spawnT = 0; }
}
export const beltLamp = () => G.state !== 'work' ? '#8a939b' : speedNow() > 1 ? (Math.sin(G.time * 14) > 0 ? '#ff3b2f' : '#ff8a70') : G.jam ? '#f0a431' : '#3ad17e';

/* ================= 判定：前层的件落进桶里、停稳了就判 ================= */
/* 「抛出去」的件：主播松手、无人机丢下、被踹、被炸、观众扔来的刁钻垃圾，3.5 秒内掉进错桶才算分错（翻倍）。
   分错弹出来的件、翻倍出来的复制件、自己滚落的都不算：放回台面，不连锁翻倍 */
const LAUNCH_WINDOW = 3.5;
const launched = b => G.time - (b.launchedAt ?? -1e9) < LAUNCH_WINDOW;
function updItems(dt) {
  const S = G.S, L = G.L;
  for (let i = G.items.length - 1; i >= 0; i--) {
    const b = G.items[i];
    if (b.wig > 0) b.wig = Math.max(0, b.wig - dt * 4);
    if (b.st === 'deliver') { b.dT += dt; if (b.dT > .78) removeItem(b); continue; }
    if (b.st !== 'free') continue;
    const p = pos(b), lv = b.rb.linvel(), [hw, hh] = halfExt(b);
    if (b.pv < -4 && lv.y > b.pv + 4) { if (b.falling && b.big) bigImpact(b); else { sfx.land(-b.pv); if (-b.pv > 8) burst('dust', { x: p.x, y: p.y - hh }, 3, { s: .8 }); } }
    if (b.falling && lv.y > -1 && G.time - b.born > .3) b.falling = false;
    b.pv = lv.y; b.rejectCD = Math.max(0, b.rejectCD - dt);
    // 跑出窗口、掉到货车那一角地上（货车开过来会把它挤扁）的件放回台面
    if (outOfWorld(b) || (b.layer === 'back' && inTruckZone(b) && p.y - hh < truckTop() - .3)) { placeOnPile(b, true); continue; }
    // 分错弹出来的件：升到货堆上方、不和台面上的件重叠时换回台面那一层；没升上去就落回桶那一层
    if (b.popUp) { if (b.layer === 'front' && p.y - hh > L.counter.top + .05 && !overlaps(b, 'back')) { setLayer(b, 'back'); b.popUp = false; } else if (lv.y < 0 && p.y < L.counter.top) b.popUp = false; }
    // 被踹到柜台前面的件：往下落时换到桶那一层
    if (b.dropFront && b.layer === 'back') { if (G.time - b.dropFront > 2.5) b.dropFront = 0; else if (lv.y < -.3 && !overlaps(b, 'front')) { setLayer(b, 'front'); b.dropFront = 0; } }
    if (b.layer !== 'front' || b.blind) continue;
    const bin = binHolding(b);
    if (!bin) { b.popBin = null; nudgeOffRims(b, p, lv, dt); continue; }
    if (bin.leak || bin.seal || p.y > bin.top + .05 || Math.hypot(lv.x, lv.y) > 3.5) continue;
    const res = judgeDrop(b.cat, !b.stripped, bin.i, { wrongMode: S.play.wrong, audit: !!auditNow(), remaining: remaining(), cap: S.play.cap, base: S.play.mult, auditMult: (auditNow() || { val: 3 }).val });
    if (res.kind === 'accept') { deliver(b, bin); continue; }
    if (b.rejectCD > 0) continue;
    b.rejectCD = 1;
    // 上次弹了却没出这个桶（被别的件压着），或者不是被抛进来的：放回台面，不算分错、不翻倍——否则会连锁翻倍、每秒重复记一次
    if (b.popBin === bin || !launched(b)) placeOnPile(b);
    else { b.popBin = bin; popOut(b, bin); if (res.kind === 'unidentified') addTag('scanfirst', 'strip', '', () => MODES[S.mode].scanFirst, binAnchor(bin), 0, 2.4); else onWrong(b, bin, res); }
  }
}
/* 停在桶口、桶壁顶上不动的前层件：往最近的桶里推一下 */
function nudgeOffRims(b, p, lv, dt) {
  const first = G.bins[0], last = G.bins[G.bins.length - 1];
  if (p.x < first.x - first.w / 2 || p.x > last.x + last.w / 2 || p.y < first.top - .2 || p.y > first.top + 1.2 || Math.hypot(lv.x, lv.y) > .25) { b.restT = 0; return; }
  b.restT = (b.restT || 0) + dt; if (b.restT < 1.2) return;
  b.restT = 0; const bin = G.bins.reduce((a, c) => Math.abs(c.x - p.x) < Math.abs(a.x - p.x) ? c : a);
  b.rb.setLinvel({ x: Math.sign(bin.x - p.x || 1) * 1.6, y: 1.2, z: 0 }, true);
}
function deliver(b, bin) {
  b.st = 'deliver'; b.dT = 0; G.delivered++; bin.count++; bumpBinEl(bin); bin.pulse = 1; b.big ? sfx.bigBin() : sfx.drop();
  burst('dust', { x: bin.x, y: bin.top }, b.big ? 8 : 4, { r: 1.4, s: .8 });
}
/* 分错：往上弹出桶，升到货堆上方再落回台面；在空中一变二（抽查期间按抽查的倍数） */
function popOut(b, bin) {
  bin.jolt = 1; sfx.wrong(); b.launchedAt = -1e9; b.popUp = true; b.dropFront = 0;   // 弹出来的件不再算「抛出去」
  const p = pos(b), need = Math.max(G.L.counter.top + 1.0, surfaceY(p.x, 'back', b, true) + .9) - p.y;
  b.rb.setLinvel({ x: rnd(-1.6, 1.6), y: clamp(Math.sqrt(2 * 26 * Math.max(1, need)) * 1.08, 8, 17), z: 0 }, true); b.rb.setAngvel({ x: 0, y: 0, z: rnd(-6, 6) }, true);
}
function wrongText(b, bin, res) {
  const tail = res.copies > 0 ? ` ×${res.copies + 1}` : res.capped ? '（件数到上限，没有翻倍）' : '，弹回去了';
  if (b.kind === 'garbage') {
    const g = GARBAGE_BY_ID[b.itemId];
    if (b.prankBy) return `的捣乱无人机把${g.name}丢错了${tail}（该投${binName(b.cat, G.S.garbage.naming)}）`;
    if (b.trickBy) return `的${g.name}难倒了主播${tail}（该投${binName(b.cat, G.S.garbage.naming)}）`;
    return wrongTip(g, G.S.garbage.items, G.S.garbage.naming) + tail;
  }
  if (b.prankBy) return `的捣乱无人机把${CNAME[b.color] || ''}件丢进了${binWord(bin.i)}${tail}`;
  return `${b.name ? '的' : ''}${CNAME[b.color] || ''}件进了${binWord(bin.i)} · 分错${tail}`;
}
function onWrong(b, bin, res) {
  const by = b.prankBy ? '' : b.trickBy || ''; G.stats = recordWrong(G.stats, res.copies, by);
  const msg = wrongText(b, bin, res);
  // 一下子分错很多件（踹飞、炸开）时，详细提示最多同时 3 条，其余合成一条计数，免得把画面盖住
  if (tags.filter(t => t.life > .3 && t.key.startsWith('wrong:')).length < 3) addTag('wrong:' + b.id + ':' + Math.round(G.time * 10), 'wrong', b.prankBy || b.trickBy || b.name || '', () => msg, binAnchor(bin), 0, 3.2);
  else addTag('wrong-many', 'wrong', '', c => `还有 ${c} 件也分错了`, binsMid(1.6), 1, 3.2);
  b.prankBy = '';
  if (res.copies > 0) { const p = pos(b); G.splits.push({ b, t: .18, copies: res.copies, mult: res.copies + 1, p: { x: p.x, y: p.y } }); }
}
function updSplits(dt) {
  for (let i = G.splits.length - 1; i >= 0; i--) {
    const s = G.splits[i]; s.t -= dt; if (s.t > 0) continue; G.splits.splice(i, 1);
    const b = s.b, alive = b.st === 'free', p = alive ? pos(b) : s.p, v = alive ? b.rb.linvel() : { x: 0, y: 9 }, layer = alive ? b.layer : 'front', popUp = alive ? b.popUp : true;
    for (let k = 0; k < s.copies; k++) {
      const a = (k % 2 ? 1 : -1) * (.3 + .2 * Math.floor(k / 2)), c = Math.cos(a), sn = Math.sin(a);
      const nb = cloneItem(b, { x: p.x + rnd(-.25, .25), y: p.y + rnd(0, .2), vx: v.x * c - v.y * sn, vy: Math.max(v.x * sn + v.y * c, 4), layer });
      nb.popUp = popUp && layer === 'front'; nb.rejectCD = 1;
    }
    burst('conf', p, 16, { sp: 1.3 }); sfx.split(); multPop(p, s.mult);
  }
}

/* ================= 桶 ================= */
function updBins(dt) {
  const hv = G.held && G.heldTarget ? G.heldTarget.bin : null;
  for (const bin of G.bins) {
    bin.pulse = Math.max(0, bin.pulse - dt * 3.2); bin.jolt = Math.max(0, bin.jolt - dt * 3);
    bin.hover = lerp(bin.hover, hv === bin ? 1 : 0, Math.min(1, dt * 12));
    updSeal(bin, dt); updLeak(bin);
  }
}

/* ================= 一帧 ================= */
let acc = 0, headClearT = 0;
export function simulate(dt, extra) {
  G.time += dt;
  if ((headClearT -= dt) <= 0) { headClearT = .2; clearHeadCircle(); }
  acc += dt; let steps = 0;
  while (acc >= 1 / 60 && steps < 3) { const h = 1 / 60; updHeld(h); updBelt(h); updUnloads(h); updBins(h); G.world.step(); acc -= h; steps++; }
  if (steps === 3) acc = 0;
  if (G.kickQueue.length && G.time >= G.kickNext) { kick(G.kickQueue.shift()); G.kickNext = G.time + .8; }
  updFlyers(dt); updScanner(dt);
  updItems(dt); updSplits(dt); updTruck(dt); updBig(dt); for (const d of G.drones) updDrone(d, dt); updTricky(dt);
  if (extra) extra(dt);
  updShift(dt); updParts(dt);
  G.tableShake = Math.max(0, G.tableShake - dt * 2.4); G.shake = Math.max(0, G.shake - dt * 3);
}
/* 场上有没有动静（没有就降到 12 帧） */
export function busy() {
  if (G.held || G.unloads.length || G.truck.st !== 'gone' || G.drones.some(d => d.st !== 'gone') || segsEnd(G.auditSegs, G.time) > G.time || G.splits.length || popCount() || tags.length || G.parts.length || G.flyers.length || G.warns.length || G.kickQueue.length || G.shake > 0 || G.tableShake > 0) return true;
  for (const bin of G.bins) if (bin.seal || bin.leak || bin.pulse > 0 || bin.jolt > 0) return true;
  for (const b of G.items) if (b.st !== 'free' || b.wig > 0 || !b.rb.isSleeping()) return true;
  return false;
}
