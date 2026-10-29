/* 物件：生成、删除、换层、点选、压住判断、放回台面；以及射线 / 重叠查询这些和物理世界打交道的小函数 */
import { G, isGarbage, truckTop } from './state.js';
import { RAPIER, makeItemBody, setLayer as setColLayer, angleOf, QUERY, BIN_WALL } from './physics2d.js';
import { sizeOf, bodyOf } from './render2d.js';
import { GARBAGE, GARBAGE_BY_ID, enabledItems, catOf } from './garbage-catalog.js';
import { tierOf } from './tiers.js';
import { burst } from './particles.js';
import { sfx } from './sound.js';
import { rnd, clamp, quatZ } from './util.js';

let uid = 1;

/* 当前玩法下随机一件：快递随机颜色，垃圾在启用品种里随机 */
export function randomItem() {
  if (!isGarbage()) { const c = Math.floor(Math.random() * 3); return { kind: 'box', color: c, cat: c }; }
  const on = enabledItems(G.S.garbage.items), g = on[Math.floor(Math.random() * on.length)] || GARBAGE[0];
  return { kind: 'garbage', itemId: g.id, cat: catOf(g, G.S.garbage.items) };
}

/* 生成一件。big = 盲盒 / 大垃圾袋（blind 是里面装的件数）；layer 'back' 在台面那一层，'front' 在桶那一层 */
export function spawnItem({ kind, color = 0, itemId, cat, name = '', big = false, blind = 0, x, y, vx = 0, vy = 0, w = 0, rot = 0, layer = 'back', trickBy = '' }) {
  kind = kind || (isGarbage() ? 'garbage' : 'box');
  if (kind === 'garbage' && !big && !GARBAGE_BY_ID[itemId]) { const r = randomItem(); itemId = r.itemId; cat = r.cat; }
  if (kind === 'garbage' && !big && !Number.isInteger(cat)) cat = catOf(GARBAGE_BY_ID[itemId], G.S.garbage.items);
  const mode = G.S.mode, size = sizeOf(kind, itemId, big, mode), body = bodyOf(kind, itemId, big, mode);
  const { rb, col } = makeItemBody(G.world, { x, y, vx, vy, w, rot, body, density: big ? .7 : 1, layer });
  if (big) rb.setAngularDamping(1.4);
  const b = {
    id: uid++, kind, color, itemId: big ? '' : itemId, cat: big ? -1 : kind === 'garbage' ? cat : color, name, big, blind, blindHits: 0, hits: 0,
    size, rb, col, layer, st: 'free', stripped: false, stripBy: '', scanT: 0, scanNeed: .7, tape: 0, wig: 0,
    launchedAt: -1e9, popBin: null, popUp: false, dropFront: 0, rejectCD: 0, pv: 0, falling: false, born: G.time, dT: 0,
    onBelt: false, beltT: -9, tossed: false, trickBy, prankBy: '',
  };
  G.items.push(b);
  return b;
}
export function removeItem(b) {
  if (b.st === 'gone') return;
  b.st = 'gone'; G.world.removeRigidBody(b.rb);
  const i = G.items.indexOf(b); if (i >= 0) G.items.splice(i, 1);
}
/* 复制一件：种类、颜色 / 分类、品种、送礼人、刁钻署名都继承；胶带、塑料袋、泥不继承 */
export const cloneItem = (b, o) => spawnItem({ kind: b.kind, color: b.color, cat: b.cat, itemId: b.itemId, name: b.name, trickBy: b.trickBy, w: rnd(-8, 8), ...o });

export const pos = b => b.rb.translation();
/* 转了角度以后的外框半宽、半高 */
export function halfExt(b) {
  const a = angleOf(b.rb), c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a)), [w, h] = b.size;
  return [(w * c + h * s) / 2, (w * s + h * c) / 2];
}
export function setLayer(b, layer) { if (b.layer === layer) return; b.layer = layer; setColLayer(b.col, layer); }

/* 某一层在 x 处的「地面」高度：从窗口顶往下打射线，碰到的第一个东西的顶面。noHead：不算露头圆（只看货堆） */
export function surfaceY(x, layer = 'back', exclude = null, noHead = false) {
  const top = G.L.worldH + 2, ray = new RAPIER.Ray({ x, y: top, z: 0 }, { x: 0, y: -1, z: 0 });
  const groups = layer === 'front' ? QUERY.frontSurface : noHead ? QUERY.backPile : QUERY.backSurface;
  const hit = G.world.castRay(ray, top + 1, true, undefined, groups, undefined, exclude ? exclude.rb : undefined);
  return hit ? top - hit.timeOfImpact : 0;
}
/* 件的整个宽度下面最高的地面 */
export function surfaceUnder(x, hw, layer, exclude, noHead) { return Math.max(surfaceY(x - hw * .8, layer, exclude, noHead), surfaceY(x, layer, exclude, noHead), surfaceY(x + hw * .8, layer, exclude, noHead)); }
/* 从 (x, y0) 往下，某一层碰到的第一个东西的高度（拿着的件落点虚线用） */
export function rayDown(x, y0, layer, exclude) {
  const ray = new RAPIER.Ray({ x, y: y0, z: 0 }, { x: 0, y: -1, z: 0 });
  const hit = G.world.castRay(ray, Math.max(0, y0) + 1, false, undefined, layer === 'front' ? QUERY.frontSurface : QUERY.backSurface, undefined, exclude ? exclude.rb : undefined);
  return hit ? y0 - hit.timeOfImpact : 0;
}
/* 这件放在 (x, y)、换到 layer 那一层时会不会和那一层的东西重叠 */
export function overlaps(b, layer, x, y) {
  const p = pos(b); x ??= p.x; y ??= p.y;
  return !!G.world.intersectionWithShape({ x, y, z: 0 }, b.rb.rotation(), b.col.shape, undefined, layer === 'front' ? QUERY.frontSolid : QUERY.backSolid, b.col, b.rb);
}

/* ---------- 桶 ---------- */
/* x 落在哪个桶的正上方（pad 往外放宽） */
export function binAtX(x, pad = .05) { for (const bin of G.bins) if (Math.abs(x - bin.x) < bin.w / 2 + pad) return bin; return null; }
/* 前层的件在不在某个桶里（两壁之间、底面之上）：画在桶正面后面，也用来判定投递 */
export function binHolding(b) {
  const p = pos(b), [, hh] = halfExt(b);
  for (const bin of G.bins) if (Math.abs(p.x - bin.x) < bin.w / 2 - .04 && p.y - hh > bin.bottom - .05 && p.y - hh < bin.top) return bin;
  return null;
}
/* 点在哪个桶的正面上（含桶口上方一点，封条在那里） */
export function binAtPoint(p) { for (const bin of G.bins) if (Math.abs(p.x - bin.x) < bin.w / 2 + .05 && p.y > bin.bottom - .05 && p.y < bin.top + .3) return bin; return null; }

/* ---------- 位置判断 ---------- */
export const onBeltOrCounter = b => { const p = pos(b); return b.layer === 'back' && p.x > G.L.belt.x0 - .1 && p.y > G.L.counter.top - .2; };
export function inTruckZone(b) { const p = pos(b); return p.x < G.L.belt.x0 - .05; }
export function outOfWorld(b) { const p = pos(b), L = G.L; return p.x < -1 || p.x > L.worldW + 1 || p.y < -1 || p.y > L.worldH + 3; }

/* ---------- 点选 ---------- */
function hitItem(b, p, pad) {
  const q = pos(b), a = angleOf(b.rb), dx = p.x - q.x, dy = p.y - q.y, c = Math.cos(a), s = Math.sin(a);
  const lx = dx * c + dy * s, ly = -dx * s + dy * c;
  return Math.abs(lx) < b.size[0] / 2 + pad && Math.abs(ly) < b.size[1] / 2 + pad;
}
/* 点到的最上面一件（按画的先后反过来找）：桶外的前层件 > 桶里露出桶口的件 > 台面上的件；桶的正面挡住的部分点不到 */
export function itemAt(p) {
  const free = G.items.filter(b => b.st === 'free'), front = free.filter(b => b.layer === 'front'), inBin = new Set(front.filter(b => binHolding(b)));
  const coveredByBin = G.bins.some(bin => Math.abs(p.x - bin.x) < bin.w / 2 && p.y > bin.bottom && p.y < bin.top);
  for (const pad of [0, .08]) {
    for (let i = front.length - 1; i >= 0; i--) if (!inBin.has(front[i]) && hitItem(front[i], p, pad)) return front[i];
    if (!coveredByBin) {
      for (let i = front.length - 1; i >= 0; i--) if (inBin.has(front[i]) && hitItem(front[i], p, pad)) return front[i];
      for (let i = free.length - 1; i >= 0; i--) if (free[i].layer === 'back' && hitItem(free[i], p, pad)) return free[i];
    }
  }
  return null;
}
/* 压住：同一层有别的件压在它上面（拿下面的件会把整堆带塌，要先拿上面的） */
export function pinned(b) {
  if (b.big) return false;
  const p = pos(b), [hw, hh] = halfExt(b);
  for (const o of G.items) {
    if (o === b || o.st !== 'free' || o.layer !== b.layer) continue;
    const q = pos(o); if (q.y < p.y + hh * .6) continue;
    const [ow, oh] = halfExt(o); if (q.y - p.y > hh + oh + .12) continue;
    if (Math.abs(q.x - p.x) < (hw + ow) * .8) return true;
  }
  return false;
}

/* ---------- 放回 ---------- */
/* 台面上的一个随机位置：避开识别台和露头圆的正下方 */
export function counterX(margin = .6) {
  const L = G.L, x0 = L.counter.x0 + .5 + margin, x1 = L.scan.x - 1.0 - margin, hc = G.head;
  let best = rnd(x0, Math.max(x0, x1));
  for (let k = 0; k < 6; k++) { const x = rnd(x0, Math.max(x0, x1)); if (!hc || Math.abs(x - hc.x) > hc.r + margin) return x; best = x; }
  return best;
}
/* 放到台面这一堆的上面落下来；堆满到顶放不下，就放到桶旁边的地上（前层） */
export function placeOnPile(b, quiet) {
  const p = pos(b); if (!quiet) burst('dust', p, 6, { s: .8 });
  const [hw, hh] = [b.size[0] / 2, b.size[1] / 2], H = G.L.worldH;
  for (let k = 0; k < 5; k++) {
    const x = counterX(hw), y = surfaceUnder(x, hw, 'back', b) + hh + .6;
    if (y + hh < H - .1 && !overlaps(b, 'back', x, y)) { moveTo(b, x, y, 'back'); b.rb.setLinvel({ x: 0, y: -1, z: 0 }, true); b.rb.setAngvel({ x: 0, y: 0, z: rnd(-3, 3) }, true); return; }
  }
  placeAside(b);
}
/* 桶这一排两边的地面（前层）：右边优先，放不下再放左边 */
export function placeAside(b) {
  const L = G.L, first = G.bins[0], last = G.bins[G.bins.length - 1], hw = b.size[0] / 2, hh = b.size[1] / 2;
  const zones = [[last.x + last.w / 2 + .15 + hw, L.worldW - .15 - hw], [L.belt.x0 + .15 + hw, first.x - first.w / 2 - .15 - hw]].filter(([a, c]) => c >= a);
  const [a, c] = zones[0] || [L.worldW - hw - .1, L.worldW - hw - .1], x = rnd(a, c), y = surfaceY(x, 'front', b) + hh + .5;
  moveTo(b, x, Math.min(y, L.worldH - hh - .1), 'front'); b.rb.setLinvel({ x: 0, y: -1, z: 0 }, true); b.rb.setAngvel({ x: 0, y: 0, z: rnd(-2, 2) }, true);
}
export function moveTo(b, x, y, layer) {
  if (layer) setLayer(b, layer);
  b.rb.setTranslation({ x, y, z: 0 }, true); b.rb.setRotation(quatZ(0), true);
  b.popBin = null; b.popUp = false; b.dropFront = 0;
}

/* ---------- 胶带 / 塑料袋、撕面单 / 糊泥 ---------- */
export function wrapTape(b, name, layers = tierOf(G.S.tiers, 'tape').layers) { b.tape = clamp(Math.round(layers), 1, 6); b.tapeBy = name; burst('shred', pos(b), 8); }
export function tear(b) { b.tape = Math.max(0, b.tape - 1); b.wig = 1; sfx.rip(); burst('shred', pos(b), 12); const v = b.rb.linvel(); b.rb.setLinvel({ x: v.x, y: Math.max(v.y, 2.4), z: 0 }, true); }
export function stripItem(b, name, scan = tierOf(G.S.tiers, 'strip').scan) { b.stripped = true; b.stripBy = name; b.scanT = 0; b.scanNeed = scan; b.wig = 1; burst('shred', pos(b), 8); }
export function reveal(b) { b.stripped = false; sfx.scanOk(); burst('conf', pos(b), 8, { sp: .6 }); b.wig = 1; }

/* 货车车顶那一片（车顶往上 2 米） */
export const truckRoof = () => ({ x0: G.truck.x - G.L.truck.w / 2, x1: G.truck.x + G.L.truck.w / 2, y: truckTop() });
export { BIN_WALL };
