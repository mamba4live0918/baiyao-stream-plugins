/* 观众互动的 12 种效果：又来一车、盲盒 / 大垃圾袋、封桶、加速、漏桶、撕面单 / 糊泥、缠胶带 / 套袋、踹一脚、帮忙、抽查、刁钻垃圾、捣乱无人机。
   gift(type, 名字, 数量, 档位)：数量已经乘过礼物个数；档位决定其余参数（点几下、倍数、几个桶、速度、力度……），见 tiers.js */
import { G, isGarbage, truckTop } from './state.js';
import { RAPIER, makeLid } from './physics2d.js';
import { EFF, effLabel, resolveEffect } from './modes.js';
import { tierOf } from './tiers.js';
import { pushSeg, segAt, segsEnd, segAfter } from './timed.js';
import { GARBAGE, GARBAGE_BY_ID, trickyItems, binName, catOf } from './garbage-catalog.js';
import { spawnItem, removeItem, pos, halfExt, setLayer, surfaceY, wrapTape, stripItem, reveal, tear, pinned, binHolding, counterX, randomItem, placeAside } from './items.js';
import { BIG_SIZE } from './render2d.js';
import { addTag, setTagName, showResult, toast, tags } from './hud.js';
import { burst, flyLid } from './particles.js';
import { sfx, tone } from './sound.js';
import { remaining, auditNow } from './levels.js';
import { NAMES, CNAME, rnd, clamp, lerp, eIO, quatZ, shuffle } from './util.js';

/* ---------- 标签挂在哪 ---------- */
export const truckAnchor = () => G.truck.st !== 'gone' ? { x: G.truck.x + .3, y: truckTop() + 1.3 } : { x: G.L.belt.x0 + 1, y: G.L.belt.top + 1.6 };
export const tableAnchor = (dy = 2.6) => () => ({ x: (G.L.counter.x0 + G.L.scan.x) / 2, y: G.L.counter.top + dy });
export const binAnchor = bin => () => ({ x: bin.x, y: bin.top + 1.0 });
export const binsMid = dy => () => { const a = G.bins[0], z = G.bins[G.bins.length - 1]; return { x: (a.x + z.x) / 2, y: a.top + dy }; };
export const itemAnchor = (b, dy = .9) => () => b.st === 'gone' || b.st === 'deliver' ? null : { x: pos(b).x, y: pos(b).y + b.size[1] / 2 + dy };
const beltAnchor = () => ({ x: G.L.belt.x0 + 1.2, y: G.L.belt.top + 1.6 });
/* 筐 / 桶的叫法跟着玩法走：快递「红筐」，垃圾「可回收物桶」（国标 / 上海叫法） */
export const binWord = i => isGarbage() ? binName(i, G.S.garbage.naming) + '桶' : CNAME[i] + '筐';
export const itemName = b => b.kind === 'garbage' ? GARBAGE_BY_ID[b.itemId]?.name || '垃圾' : CNAME[b.cat] + '件';

export function ensureWork() { if (G.state === 'done') { G.state = 'work'; G.overtime = true; showResult(null); } }
/* 一次挑 n 个不同的桶：先挑没被封（漏）的，不够再从已经封（漏）的里补 */
function pickBins(key, n) { return [...shuffle(G.bins.filter(b => !b[key])), ...shuffle(G.bins.filter(b => b[key]))].slice(0, n); }
/* 场上能被无人机帮忙收走的普通件 */
const available = () => G.items.filter(b => b.st === 'free' && !b.big).length;
/* 限时效果标签：当前这一段的倍数与剩余秒数；后面还排着别人就带一句「接着 谁 几倍」 */
function segLine(segs, cur, next) { const s = segAt(segs, G.time); if (!s) return ''; const nx = segAfter(segs, s); return `${cur(s)} · ${Math.max(0, Math.ceil(s.end - G.time))}s` + (nx ? ` · 接着 ${nx.name} ${next(nx)}` : ''); }

export function gift(type, name, amount, tier) {
  name = String(name || '').trim().slice(0, 14) || NAMES[Math.floor(Math.random() * NAMES.length)];
  if (!EFF[type]) return 0;
  const T = tierOf(G.S.tiers, type, tier); type = resolveEffect(type, G.S.mode);   // 先按原互动取档（刁钻垃圾在快递模式也用自己的档位），再换成实际执行的效果
  amount = Math.max(1, Math.floor(Number(amount) || T.amt));
  const full = () => addTag('full:' + name, 'full', name, () => isGarbage() ? '的垃圾没倒上（已达上限）' : '寄件没装上（已达上限）', truckAnchor, 0);
  if (type === 'truck') {
    ensureWork();
    const n = Math.min(amount, Math.max(0, G.S.play.cap - remaining()));
    if (n <= 0) { full(); return 0; }
    const tr = G.truck, last = tr.batches[tr.batches.length - 1];
    if (last && last.name === name && !last.items) last.left += n; else tr.batches.push({ name, left: n });
    addTag('truck:' + name, 'truck', name, c => isGarbage() ? `倒来 ${c} 件垃圾` : `寄来 ${c} 件`, truckAnchor, n); return n;
  }
  if (type === 'blind') {
    ensureWork(); const total = Math.min(amount, 60, Math.max(0, G.S.play.cap - remaining())); if (total < 1) { full(); return 0; }
    const k = Math.min(3, Math.ceil(total / 20)); let left = total;
    for (let i = 0; i < k; i++) { const n = Math.max(1, Math.round(left / (k - i))); left -= n; G.bigQueue.push({ name, color: Math.floor(Math.random() * 3), n, hits: T.hits }); }
    addTag('blind:' + name, 'blind', name, c => isGarbage() ? `扔来大垃圾袋（里面 ${c} 件）` : `寄来爆箱盲盒（里面 ${c} 件）`, tableAnchor(3.2), total); return total;
  }
  if (type === 'seal' || type === 'leak') {
    const dur = Math.min(60, amount), n = Math.min(T.bins, G.bins.length);
    for (const bin of pickBins(type, n)) (type === 'seal' ? sealBin : leakBin)(bin, name, dur, T.hits);
    return dur;
  }
  if (type === 'speed') {
    const r = pushSeg(G.speedSegs, G.time, Math.min(30, amount), T.mul, name, 45); if (!r.added) return 0;
    G.speedSegs = r.segs; sfx.speedUp(); const life = segsEnd(G.speedSegs, G.time) - G.time + .4;
    const t = addTag('speed', 'speed', name, () => segLine(G.speedSegs, s => `把传送带调到 ${s.val} 倍速`, nx => `${nx.val} 倍速`), () => ({ x: G.L.belt.x0 + 1.0, y: G.L.belt.top + 2.2 }), 0, life);
    t.nameFn = () => (segAt(G.speedSegs, G.time) || t).name; t.life = life; return Math.round(r.added);
  }
  if (type === 'strip' || type === 'tape') {
    const strip = type === 'strip', n = Math.min(strip ? 20 : 30, amount), pend = strip ? G.pendingStrip : G.pendingTape;
    const c = shuffle(G.items.filter(b => b.st === 'free' && !b.big && (strip ? !b.stripped : b.tape === 0))); let done = 0, first = null;
    for (const b of c) { if (done >= n) break; strip ? stripItem(b, name, T.scan) : wrapTape(b, name, T.layers); first = first || b; done++; }
    for (let i = done; i < n && pend.length < (strip ? 20 : 30); i++) pend.push(strip ? { name, scan: T.scan } : { name, layers: T.layers });
    if (done) strip ? sfx.rip() : sfx.tapeOn();
    const text = strip ? k => isGarbage() ? `给 ${k} 件垃圾糊上了泥` : `撕掉了 ${k} 件面单` : k => isGarbage() ? `给 ${k} 件套了塑料袋` : `给 ${k} 件缠了胶带`;
    addTag(type + ':' + name, type, name, text, first ? itemAnchor(first) : beltAnchor, n); return n;
  }
  if (type === 'kick') { const k = Math.min(3, amount); for (let i = 0; i < k && G.kickQueue.length < 6; i++) G.kickQueue.push({ name, loss: T.loss, power: T.power }); return k; }
  if (type === 'audit') {
    const r = pushSeg(G.auditSegs, G.time, Math.min(EFF.audit.max, amount), T.mult, name, 90); if (!r.added) return 0;
    G.auditSegs = r.segs; sfx.audit(); const life = segsEnd(G.auditSegs, G.time) - G.time + .4;
    const t = addTag('audit', 'audit', name, () => segLine(G.auditSegs, s => `发起了${effLabel('audit', G.S.mode)} · 分错 ×${Math.max(s.val, G.S.play.mult)}`, nx => `×${Math.max(nx.val, G.S.play.mult)}`), binsMid(2.2), 0, life);
    t.nameFn = () => (auditNow() || t).name; t.life = life; return Math.round(r.added);
  }
  if (type === 'prank' || type === 'help') {
    const prank = type === 'prank', n = Math.min(prank ? EFF.prank.max : 40, amount), d = G.drones[prank ? 1 : 0], q = prank ? G.prankQueue : G.helpQueue;
    if (d.st !== 'gone' && d.st !== 'out' && d.name === name) { d.need += n; d.plan = prank ? d.plan + n : Math.min(d.need, d.done + available()); if (d.tag) d.tag.life = 3.6; return n; }
    const h = q.find(h => h.name === name); if (h) { h.count += n; h.speed = Math.max(h.speed, T.speed); } else q.push({ name, count: n, speed: T.speed }); return n;
  }
  if (type === 'tricky') return trickyGift(name, amount);
  return 0;
}

/* ---------- 封桶：桶口盖一块只挡前层的板，连点撕开或到时间自己掉 ---------- */
export function sealBin(bin, name, dur, hits = tierOf(G.S.tiers, 'seal').hits) {
  const h = clamp(Math.round(hits), 1, 50);
  if (bin.seal) { const s = bin.seal; s.until = Math.min(G.time + 60, s.until + dur); s.tag.life = s.until - G.time + .5; if (h > s.need) { s.need = h; setTagName(s.tag, name); } return; }
  const tag = addTag('seal:' + bin.i, 'seal', name, () => `封了${binWord(bin.i)} · ${Math.max(0, Math.ceil((bin.seal?.until ?? 0) - G.time))}s · 连点 ${Math.max(0, (bin.seal?.need ?? 0) - (bin.seal?.clicks ?? 0))} 下撕开`, binAnchor(bin), 0, dur + .5);
  setTagName(tag, name);
  bin.seal = { lid: makeLid(G.world, G.fixed, bin), until: G.time + dur, clicks: 0, need: h, tag, pop: 0, t: 0 };
  sfx.tapeOn(); bin.pulse = 1;
}
export function unseal(bin, silent) {
  const s = bin.seal; if (!s) return; bin.seal = null;
  G.world.removeCollider(s.lid, true); s.tag.life = Math.min(s.tag.life, .4);
  if (silent) return;
  flyLid(bin.x, bin.top + .1, bin.w + .12); sfx.rip(); sfx.thump(); burst('shred', { x: bin.x, y: bin.top + .1 }, 10);
  for (const b of G.items) if (b.st === 'free' && b.layer === 'front') b.rb.wakeUp();
}
export function updSeal(bin, dt) { const s = bin.seal; if (!s) return; s.t += dt; s.pop = Math.max(0, s.pop - dt * 5); if (G.time >= s.until || s.clicks >= s.need) unseal(bin); }
export function hitSeal(bin) { const s = bin.seal; if (!s) return; s.clicks++; s.pop = 1; sfx.rip(); burst('shred', { x: bin.x + rnd(-.6, .6), y: bin.top + .15 }, 5); }
/* 窗口变了、桶挪了位置：封条的板跟着重建 */
export function rebuildLid(bin) { if (!bin.seal) return; G.world.removeCollider(bin.seal.lid, false); bin.seal.lid = makeLid(G.world, G.fixed, bin); }

/* ---------- 漏桶：桶底的碰撞体关掉，东西从桶底掉到地上；点几下修好 ---------- */
export function leakBin(bin, name, dur, hits = tierOf(G.S.tiers, 'leak').hits) {
  const h = clamp(Math.round(hits), 1, 50);
  if (bin.leak) { const l = bin.leak; l.until = Math.min(G.time + 60, l.until + dur); l.tag.life = l.until - G.time + .5; if (h > l.need) { l.need = h; setTagName(l.tag, name); } return; }
  bin.cols.bottom.setEnabled(false);
  const tag = addTag('leak:' + bin.i, 'leak', name, () => `把${binWord(bin.i)}底捅漏了 · ${Math.max(0, Math.ceil((bin.leak?.until ?? 0) - G.time))}s · 点 ${Math.max(0, (bin.leak?.need ?? 0) - (bin.leak?.clicks ?? 0))} 下修好`, binAnchor(bin), 0, dur + .5);
  setTagName(tag, name);
  bin.leak = { t0: G.time, until: G.time + dur, clicks: 0, need: h, tag }; bin.jolt = 1; sfx.kick();
  for (const b of G.items) if (b.layer === 'front' && b.st !== 'gone') b.rb.wakeUp();
}
export function unleak(bin, silent) {
  const l = bin.leak; if (!l) return; bin.leak = null; l.tag.life = Math.min(l.tag.life, .4);
  // 桶底合上前，先把漏到桶底下地上的件挪到桶旁边，免得被桶底卡住
  for (const b of G.items) { if (b.st !== 'free' || b.layer !== 'front') continue; const p = pos(b), [, hh] = halfExt(b); if (Math.abs(p.x - bin.x) < bin.w / 2 + .05 && p.y - hh < bin.bottom + .05) placeAside(b); }
  bin.cols.bottom.setEnabled(true);
  if (!silent) { sfx.land(10); bin.pulse = 1; burst('conf', { x: bin.x, y: bin.bottom + .3 }, 6, { sp: .6 }); }
}
export function updLeak(bin) { const l = bin.leak; if (l && (G.time >= l.until || l.clicks >= l.need)) unleak(bin); }
export function hitLeak(bin) { const l = bin.leak; if (!l) return; l.clicks++; bin.jolt = .6; sfx.fix(); burst('conf', { x: bin.x + rnd(-.8, .8), y: bin.bottom + .2 }, 5, { sp: .8 }); }

/* ---------- 盲盒 / 大垃圾袋：点几下炸开，炸出来的件撒在台面上 ---------- */
export function hitBlind(b) {
  b.hits++; b.wig = 1; sfx.thump(); tone(300 + b.hits * 120, .08, 'triangle', .06); burst('shred', pos(b), 4);
  const v = b.rb.linvel(); b.rb.setLinvel({ x: v.x, y: Math.max(v.y, 2.6), z: 0 }, true);
  if (b.hits >= clamp(Math.round(b.blindHits || tierOf(G.S.tiers, 'blind').hits), 1, 30)) explodeBlind(b);
}
function explodeBlind(b) {
  const p = pos(b), n = b.blind, name = b.name, [w, h] = b.size; b.blind = 0; removeItem(b);
  sfx.heavy(); tone(900, .25, 'triangle', .08, 1800); G.shake = Math.max(G.shake, .8);
  burst('conf', p, 26, { sp: 1.6 }); burst('dust', p, 14, { r: 1.5, s: 1.4 });
  for (let i = 0; i < n; i++) {
    const a = rnd(Math.PI * .1, Math.PI * .9), sp = rnd(2.5, 6.5);
    const nb = spawnItem({ ...randomItem(), name, x: p.x + rnd(-w, w) * .38, y: p.y + rnd(-h, h) * .32, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp + rnd(2, 5), w: rnd(-8, 8) });
    nb.born = G.time; nb.launchedAt = G.time;
  }
  for (const o of G.items) {
    if (o.st !== 'free' || o.layer !== 'back' || o.born === G.time) continue; const q = pos(o), d = Math.hypot(q.x - p.x, q.y - p.y); if (d > 2.6) continue;
    const v = o.rb.linvel(), k = 1 - d / 2.6; o.rb.setLinvel({ x: v.x + (q.x - p.x) / (d || 1) * 4 * k, y: Math.max(v.y, 5 * k), z: 0 }, true); o.launchedAt = G.time;
  }
  addTag('boom:' + name + ':' + Math.floor(G.time), 'blind', name || (isGarbage() ? '分类站' : '快递站'), () => `的${isGarbage() ? '大垃圾袋' : '盲盒'}炸出 ${n} 件`, { x: p.x, y: p.y + 2.0 }, 0, 3);
}
/* 落地前在台面（货堆顶上）闪一个预警圈，0.55 秒后从窗口顶上砸下来；场上同时最多 3 个 */
export function updBig(dt) {
  G.bigT -= dt;
  const present = G.items.filter(b => b.big && b.st !== 'deliver').length + G.warns.length, size = BIG_SIZE[isGarbage() ? 'garbage' : 'express'];
  if (G.bigQueue.length && G.bigT <= 0 && present < 3 && G.state !== 'fail') {
    const x = counterX(size[0] / 2 + .2), y = surfaceY(x, 'back');
    if (y + size[1] + .4 < G.L.worldH) { const it = G.bigQueue.shift(); G.warns.push({ ...it, x, y, t: 0 }); sfx.whistle(); }
    G.bigT = 1.0;
  }
  for (let i = G.warns.length - 1; i >= 0; i--) {
    const w = G.warns[i]; w.t += dt; w.y = surfaceY(w.x, 'back');
    if (w.t < .55) continue;
    G.warns.splice(i, 1);
    const top = G.L.worldH - size[1] / 2 - .05, y = Math.max(Math.min(top, w.y + size[1] / 2 + 3), w.y + size[1] / 2 + .05);
    const b = spawnItem({ kind: isGarbage() ? 'garbage' : 'box', color: w.color, name: w.name, big: true, blind: w.n, x: w.x, y, vy: -14, w: rnd(-.8, .8) });
    b.falling = true; b.blindHits = w.hits;
    const t = tags.find(t => t.key === 'blind:' + w.name && t.life > 0); if (t) { t.anchor = itemAnchor(b, 1.0); t.life = Math.max(t.life, 2.8); }
  }
}
/* 重袋子 / 大箱子落地是「砸」：横向速度和转动大部分吃掉，旁边的件被震起来 */
export function bigImpact(b) {
  b.falling = false; const p = pos(b); sfx.heavy(); G.shake = Math.max(G.shake, 1); G.tableShake = Math.max(G.tableShake, .7);
  const v = b.rb.linvel(); b.rb.setLinvel({ x: v.x * .15, y: Math.min(v.y, .5), z: 0 }, true); b.rb.setAngvel({ x: 0, y: 0, z: b.rb.angvel().z * .2 }, true);
  burst('dust', { x: p.x, y: p.y - b.size[1] / 2 }, 18, { r: 2.2, s: 1.6, sp: 1.3 });
  for (const o of G.items) {
    if (o === b || o.st !== 'free' || o.layer !== 'back') continue; const q = pos(o), dx = q.x - p.x, d = Math.abs(dx); if (d > 3.2 || Math.abs(q.y - p.y) > 2.5) continue;
    const f = 1 - d / 3.2, ov = o.rb.linvel(); o.rb.setLinvel({ x: ov.x + Math.sign(dx || rnd(-1, 1)) * 3.5 * f, y: Math.max(ov.y, rnd(4, 7) * f), z: 0 }, true); o.rb.setAngvel({ x: 0, y: 0, z: rnd(-5, 5) * f }, true);
  }
}

/* ---------- 踹一脚：台面上的件全部弹起来，按档位的比例有几件被踹到柜台前面（掉进桶里也算分错） ---------- */
export function kick(k) {
  const pw = k.power ?? 1, L = G.L; G.shake = 1.2 * Math.min(1.4, pw); G.tableShake = Math.min(1.4, pw); sfx.kick(); let lost = 0;
  burst('dust', { x: (L.counter.x0 + L.counter.x1) / 2, y: L.counter.top }, 14, { r: 5, s: 1.4 });
  for (const b of G.items) {
    if (b.st !== 'free' || b.layer !== 'back') continue; const v = b.rb.linvel();
    if (b.onBelt) { b.rb.setLinvel({ x: v.x, y: rnd(2, 4), z: 0 }, true); continue; }
    if (pos(b).x < L.belt.x0) continue;
    const off = !b.big && Math.random() < (k.loss ?? 30) / 100;
    b.rb.setLinvel({ x: v.x + rnd(-2.5, 2.5) * pw, y: rnd(6, 10) * (b.big ? .6 : 1) * pw, z: 0 }, true);
    b.rb.setAngvel({ x: 0, y: 0, z: rnd(-8, 8) }, true); b.launchedAt = G.time;
    if (off) { b.dropFront = G.time; lost++; }
  }
  addTag('kick:' + k.name + ':' + Math.floor(G.time), 'kick', k.name, () => lost ? `踹了一脚桌子（踹掉 ${lost} 件）` : '踹了一脚桌子', tableAnchor(2.4), 1);
}

/* ---------- 小助手 / 捣乱无人机 ---------- */
export const makeDrone = kind => ({ kind, st: 'gone', x: -3, y: 8, tw: null, carry: null, name: '', need: 0, done: 0, plan: 0, speed: 1, tag: null, waitT: 0, tilt: 0, visible: false });
function dtw(d, x, y, dur, cb) { d.tw = { fx: d.x, fy: d.y, tx: x, ty: y, k: 0, dur: dur / (d.speed || 1), cb }; }
export function droneOut(d) { d.st = 'out'; dtw(d, d.x < G.L.worldW / 2 ? -2.5 : G.L.worldW + 2.5, G.L.worldH - .4, .7, () => { d.st = 'gone'; d.visible = false; }); }
const reachable = b => b.st === 'free' && !b.big && !pinned(b) && !(b.layer === 'front' && binHolding(b));
const rankOf = b => b.layer === 'back' ? (b.onBelt ? 1 : 0) : 2;   // 台面优先，其次传送带，再次地上
function pickDroneTarget() {
  const free = G.items.filter(b => reachable(b) && G.bins[b.cat] && !G.bins[b.cat].seal && !G.bins[b.cat].leak);
  free.sort((a, b) => rankOf(a) - rankOf(b) || pos(b).y - pos(a).y);
  return free[0] || null;
}
/* 捣乱无人机只抓已识别、没缠胶带 / 没套袋、没被压住、不在桶里的普通件 */
function pickPrankTarget() {
  const free = G.items.filter(b => reachable(b) && !b.blind && !b.stripped && !b.tape);
  free.sort((a, b) => rankOf(a) - rankOf(b) || pos(b).y - pos(a).y);
  return free[0] || null;
}
/* 丢进哪个错桶：优先没封、没漏的；都不行就随便一个错桶（会被封条挡住） */
function wrongBinFor(b) { const wrong = G.bins.filter(x => x.i !== b.cat), ok = wrong.filter(x => !x.seal && !x.leak), list = ok.length ? ok : wrong; return list[Math.floor(Math.random() * list.length)]; }
export function updDrone(d, dt) {
  if (d.tw) {
    const w = d.tw; w.k += dt; const k = eIO(Math.min(1, w.k / w.dur)); d.x = lerp(w.fx, w.tx, k); d.y = lerp(w.fy, w.ty, k) + Math.sin(k * Math.PI) * .5;
    d.tilt = lerp(d.tilt, clamp((w.tx - w.fx) / w.dur * .03, -.35, .35), .2);
    if (w.k >= w.dur) { d.tw = null; w.cb && w.cb(); }
  } else { d.y += Math.sin(G.time * 5) * .004; d.tilt *= .9; }
  if (d.carry) { const c = d.carry; c.rb.setNextKinematicTranslation({ x: d.x, y: d.y - .42 - c.size[1] / 2, z: 0 }); c.rb.setNextKinematicRotation(quatZ(Math.sin(G.time * 4) * .08)); }
  if (d.tw) return;
  const prank = d.kind === 'prank', L = G.L, anchor = () => d.visible ? { x: d.x, y: d.y + .8 } : null;
  if (d.st === 'gone') {
    const q = prank ? G.prankQueue : G.helpQueue;
    if (!q.length || G.state === 'fail') return; const h = q.shift();
    d.name = h.name; d.need = h.count; d.done = 0; d.speed = h.speed || 1; d.plan = prank ? h.count : Math.min(h.count, available());
    d.st = 'in'; d.visible = true; d.x = prank ? L.worldW + 1.5 : -1.5; d.y = L.worldH - .6; prank ? sfx.prank() : sfx.robot();
    d.tag = prank
      ? addTag('prank:' + h.name + ':' + G.time, 'prank', h.name, () => `的捣乱无人机来了 · 丢错 ${d.plan} 件`, anchor, 0, 4)
      : addTag('help:' + h.name + ':' + G.time, 'help', h.name, () => d.plan > 0 ? `帮收 ${d.plan} 件` : '来帮忙了，台面已经空了', anchor, 0, 4);
    dtw(d, L.worldW * (prank ? .68 : .32), Math.min(L.worldH - 1, L.counter.top + 3.4), .7, () => { d.st = 'work'; }); return;
  }
  if (d.st !== 'work') return;
  if (d.tag) d.tag.life = Math.max(d.tag.life, 1.4);
  if (d.done >= d.plan) { droneOut(d); return; }
  const b = prank ? pickPrankTarget() : pickDroneTarget();
  if (!b && prank) { d.waitT = d.waitT || G.time; if (G.time - d.waitT < 8) return; }   // 刚开局台上还没东西：捣乱无人机先盘旋等一会儿
  d.waitT = 0;
  if (!b) { if (prank && d.done === 0) addTag('prank-none:' + d.name, 'prank', d.name, () => '的捣乱无人机没找到能抓的件，走了', anchor, 0, 2.6); d.plan = d.done; droneOut(d); return; }
  const p = pos(b); b.st = 'robot'; b.rb.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true); b.col.setEnabled(false);
  dtw(d, p.x, p.y + b.size[1] / 2 + .42, .32, () => {
    if (b.st !== 'robot') return;
    d.carry = b; sfx.zip();
    if (!prank) { while (b.tape > 0) tear(b); if (b.stripped) reveal(b); }
    const bin = prank ? wrongBinFor(b) : G.bins[b.cat];
    dtw(d, bin.x, Math.min(L.worldH - .5, bin.top + 1.1 + b.size[1]), prank ? .62 : .5, () => {
      d.carry = null; if (b.st !== 'robot') return;
      b.st = 'free'; setLayer(b, 'front'); b.rb.setBodyType(RAPIER.RigidBodyType.Dynamic, true); b.col.setEnabled(true);
      b.rb.setLinvel({ x: 0, y: -1, z: 0 }, true); b.launchedAt = G.time; d.done++; if (prank) b.prankBy = d.name;
      if (prank) { sfx.prank(); const what = itemName(b), where = binWord(bin.i); addTag('prank-drop:' + b.id + ':' + Math.round(G.time * 10), 'prank', d.name, () => `的捣乱无人机把${what}丢进了${where}`, binAnchor(bin), 0, 3); }
    });
  });
}

/* ---------- 刁钻垃圾：从启用的易错品种里随机，每 0.25 秒从窗口顶上落一件到台面上；主播分错就记「XX 难倒了主播」 ---------- */
export function trickyGift(name, amount) {
  if (!isGarbage()) return gift('truck', name, amount);
  ensureWork();
  const n = Math.min(amount, EFF.tricky.max, Math.max(0, G.S.play.cap - remaining()));
  if (n < 1) { addTag('full:' + name, 'full', name, () => '扔的垃圾没装上（已达上限）', tableAnchor(3.2), 0); return 0; }
  const tp = trickyItems(G.S.garbage.items), pool = tp.length ? tp : GARBAGE, t0 = G.trickQueue.length ? G.trickQueue[G.trickQueue.length - 1].t : 0;
  for (let i = 0; i < n; i++) G.trickQueue.push({ name, itemId: pool[Math.floor(Math.random() * pool.length)].id, t: t0 + .25 * (i + 1) });
  addTag('tricky:' + name, 'tricky', name, c => `扔来 ${c} 件刁钻垃圾`, tableAnchor(3.4), n); sfx.whistle();
  return n;
}
export function updTricky(dt) {
  if (G.state === 'fail') return;
  for (const q of G.trickQueue) q.t -= dt;
  while (G.trickQueue.length && G.trickQueue[0].t <= 0) {
    const q = G.trickQueue.shift(), g = GARBAGE_BY_ID[q.itemId], x = counterX(.5);
    const b = spawnItem({ kind: 'garbage', itemId: q.itemId, cat: catOf(g, G.S.garbage.items), name: q.name, trickBy: q.name, x, y: G.L.worldH - .7, vy: -5, w: rnd(-4, 4) });
    b.launchedAt = G.time;
    addTag('trickitem:' + b.id, 'tricky', q.name, () => `的刁钻题：${g.name}`, itemAnchor(b), 0, 3.4);
  }
}

export function stopAll() {
  for (const t of G.truck.batches) if (t.name) t.left = 0; G.truck.batches = G.truck.batches.filter(t => t.left > 0);
  G.bigQueue = G.bigQueue.filter(q => !q.name); G.helpQueue = []; G.prankQueue = []; G.trickQueue.length = 0; G.pendingTape = []; G.pendingStrip = []; G.kickQueue = []; G.speedSegs = []; G.auditSegs = [];
  for (const t of tags) if (t.key === 'speed' || t.key === 'audit') t.life = .3;
  for (const b of G.bins) { unseal(b); unleak(b); }
  toast('已停止所有观众效果，清空排队');
}
