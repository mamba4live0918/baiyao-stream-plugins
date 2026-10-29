/* 2D 绘制：每帧把整个画面画到一张透明画布上（Canvas 2D）。
   世界坐标是米、y 向上；画布坐标是 CSS 像素、y 向下：sx = x·ppm，sy = H − y·ppm。
   场景件和物件都用 art*.js 的程序画法；物件（连同泥、塑料袋、胶带）画成离屏贴图缓存，缩放变了就清空重画。 */
import { INK, FONT, tone, rr, shape, sprite, drawBox, drawBin, drawCounter, drawBelt, drawScanner, drawTruck } from './art.js';
import { ITEMS } from './art-garbage.js';
import { drawMud, drawBag, drawTape, drawBigBag, drawBlindBox, drawSeal, drawLeak, drawDrone, drawScanBeam, drawStar, drawConfetti, drawPuff, drawShred } from './art-fx.js';
import { angleOf } from './physics2d.js';

export const BOX_SIZE = [1.1, .82];
export const BIG_SIZE = { garbage: [2.0, 1.8], express: [1.9, 1.45] };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function createRenderer(canvas) {
  const g = canvas.getContext('2d');
  let W = 1, H = 1, dpr = 1, L = null, ppm = 100;
  const cache = new Map();
  function resize(w, h, d, layout) {
    W = w; H = h; dpr = d; L = layout; ppm = L.ppm;
    canvas.width = Math.max(1, Math.round(W * dpr)); canvas.height = Math.max(1, Math.round(H * dpr));
    cache.clear();
  }
  /* 物件贴图：品种 / 颜色 / 名字 / 泥 / 胶带层数 都进缓存键 */
  function spriteFor(b) {
    const key = `${b.kind}|${b.kind === 'garbage' ? b.itemId : b.color}|${b.kind === 'box' ? b.name : ''}|${b.stripped ? 'm' : ''}|${b.tape}`;
    let sp = cache.get(key);
    if (!sp) {
      const size = b.size, base = b.kind === 'garbage' ? gg => ITEMS[b.itemId].draw(gg) : gg => drawBox(gg, b.color, b.name, size[0], size[1]);
      sp = sprite(gg => { base(gg); if (b.stripped) drawMud(gg, size); if (b.tape > 0) (b.kind === 'garbage' ? drawBag : drawTape)(gg, size, b.tape); }, [size[0] + (b.tape > 0 ? .16 : 0), size[1] + (b.tape > 0 ? .2 : 0)], ppm, dpr);
      if (cache.size > 400) cache.clear();
      cache.set(key, sp);
    }
    return sp;
  }
  function truckSprite(garbage, name) {
    const key = `truck|${garbage}|${name}`; let sp = cache.get(key);
    if (!sp) { sp = sprite(gg => drawTruck(gg, garbage, name, L.truck.w, L.truck.h, true), [L.truck.w + .1, L.truck.h + .9], ppm, dpr); cache.set(key, sp); }
    return sp;
  }
  const toY = y => H - y * ppm;     // 世界 y → 画布 y

  /* 在「米」坐标系里画（y 向下，原点在窗口左上角） */
  function meters(f) { g.save(); g.scale(ppm, ppm); f(L.worldH); g.restore(); }

  function drawItem(b, t, shakeX = 0) {
    if (b.st === 'gone') return;
    const p = b.rb.translation(); let a = angleOf(b.rb); if (b.wig > 0) a += Math.sin(t * 70) * b.wig * .1;
    let s = 1; if (b.st === 'deliver') s = clamp(1 - (b.dT - .5) / .28, 0, 1); if (s <= 0) return;
    g.save(); g.translate(p.x * ppm + shakeX, toY(p.y)); g.rotate(-a); if (s !== 1) g.scale(s, s);
    if (b.big) {
      g.scale(ppm, ppm); const total = Math.max(1, b.blindHits || 1), left = Math.max(0, total - (b.hits || 0));
      if (b.kind === 'garbage') drawBigBag(g, b.size[0], b.size[1], left, total); else drawBlindBox(g, b.size[0], b.size[1], b.color, left, total);
    } else { const sp = spriteFor(b); g.drawImage(sp.c, -sp.w / 2, -sp.h / 2, sp.w, sp.h); }
    g.restore();
  }

  function draw(f) {
    const t = f.time; g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    g.save(); g.translate(f.shake.x, f.shake.y);
    // 货车（左下角，车头在窗口外）
    if (f.truck.visible) { const sp = truckSprite(f.mode === 'garbage', f.truck.name); g.save(); g.globalAlpha = f.truck.alpha; g.drawImage(sp.c, (f.truck.x - L.truck.w / 2) * ppm - .05 * ppm, toY(L.truck.h + .55) , sp.w, sp.h); g.restore(); }
    // 传送带、柜台、识别台、状态灯
    meters(WH => {
      drawBelt(g, L.belt.x0, L.belt.x1, WH - L.belt.top, WH, f.belt.phase);
      drawCounter(g, L.counter.x0, L.counter.x1, WH - L.counter.top + f.tableShake, WH);
      drawScanner(g, L.scan.x, WH - L.counter.top + f.tableShake, f.scanner.on);
      if (f.scanner.on) { g.save(); g.translate(L.scan.x, WH - L.counter.top - .55); drawScanBeam(g, 1.0, t); g.restore(); }
      const lx = L.belt.x1 - .25, ly = WH - L.belt.top - .95;
      shape(g, p => rr(p, lx - .035, ly, .07, .9, .02), '#9aa6b1', { noShade: true, line: .02 });
      g.beginPath(); g.arc(lx, ly - .02, .13, 0, Math.PI * 2); g.fillStyle = f.belt.lamp; g.fill(); g.lineWidth = .025; g.strokeStyle = INK; g.stroke();
      if (f.belt.glow) { g.beginPath(); g.arc(lx, ly - .02, .26, 0, Math.PI * 2); g.fillStyle = f.belt.lamp + '55'; g.fill(); }
    });
    // 大件落下前的预警圈（台面上）
    for (const w of f.warns) { const k = Math.min(1, w.t / .55); g.save(); g.translate(w.x * ppm, toY(L.counter.top) ); g.scale(1, .32); g.beginPath(); g.arc(0, 0, (1.1 - .3 * k) * ppm, 0, Math.PI * 2); g.lineWidth = .1 * ppm; g.strokeStyle = `rgba(255,122,58,${.3 + .6 * k})`; g.stroke(); g.restore(); }
    const items = f.items;
    for (const b of items) if (b.layer !== 'front' && b !== f.held) drawItem(b, t);
    // 桶：先画里面的暗色，再画桶里的件，最后画桶的正面盖住它们
    meters(WH => { for (const b of f.bins) { g.save(); g.translate(b.x + Math.sin(t * 60) * b.jolt * .06, WH - (b.bottom + b.h / 2)); drawBin(g, f.mode, b.i, b.label, b.w, b.h, 'back'); g.restore(); } });
    for (const b of items) if (b.layer === 'front' && b !== f.held) drawItem(b, t);
    meters(WH => {
      for (const b of f.bins) {
        const sq = Math.sin(b.pulse * Math.PI) * .05, cx = b.x + Math.sin(t * 60) * b.jolt * .06, cy = WH - (b.bottom + b.h / 2);
        for (const sx of [-1, 1]) shape(g, p => rr(p, cx + sx * (b.w / 2 - .32) - .14, WH - b.bottom - .02, .28, b.bottom + .02, .05), '#5b6670', { noShade: true, line: .022 });
        g.save(); g.translate(cx, cy + b.h / 2); g.scale(1 + sq, 1 - sq); g.translate(0, -b.h / 2); drawBin(g, f.mode, b.i, b.label, b.w, b.h, 'front'); g.restore();
        if (b.hover > .02) { g.save(); g.globalAlpha = b.hover * .55; g.beginPath(); rr(g, cx - b.w / 2 - .06, cy - b.h / 2 - .1, b.w + .12, .3, .12); g.fillStyle = '#fff6a8'; g.fill(); g.restore(); }
        if (b.leak) { g.save(); g.translate(cx, WH - b.bottom - .1); drawLeak(g, b.w, .5, t); g.restore(); g.save(); g.globalAlpha = .35 + Math.sin(t * 10) * .25; g.beginPath(); rr(g, cx - b.w / 2, cy - b.h / 2, b.w, .2, .07); g.fillStyle = '#ff3b2f'; g.fill(); g.restore(); }
        if (b.seal) { g.save(); g.translate(cx, cy - b.h / 2 + .05); drawSeal(g, b.w + .12, .5, b.sealProgress); g.restore(); }
      }
    });
    // 无人机（带着抓起来的件）
    for (const d of f.drones) { if (!d.visible) continue; if (d.carry) drawItem(d.carry, t); g.save(); g.translate(d.x * ppm, toY(d.y)); g.rotate(d.tilt || 0); g.scale(ppm, ppm); drawDrone(g, d.kind, t); g.restore(); }
    // 粒子
    for (const p of f.parts) {
      const a = clamp(1 - p.life / p.max, 0, 1); if (a <= 0) continue; g.save(); g.globalAlpha = a; g.translate(p.x * ppm, toY(p.y)); g.rotate(p.rot); g.scale(ppm * p.s, ppm * p.s);
      if (p.kind === 'star') drawStar(g, p.color); else if (p.kind === 'conf') drawConfetti(g, p.color, p.k); else if (p.kind === 'shred') drawShred(g); else drawPuff(g);
      g.restore();
    }
    // 拿在手上的件：画在最上面，往下画一条虚线指到会落到的地方
    if (f.held) {
      const p = f.held.rb.translation();
      if (f.dropY !== null) { g.save(); g.setLineDash([.12 * ppm, .1 * ppm]); g.lineWidth = .045 * ppm; g.strokeStyle = 'rgba(255,255,255,.85)'; g.beginPath(); g.moveTo(p.x * ppm, toY(p.y) + f.held.size[1] / 2 * ppm); g.lineTo(p.x * ppm, toY(f.dropY)); g.stroke(); g.setLineDash([]); g.beginPath(); g.ellipse(p.x * ppm, toY(f.dropY), .32 * ppm, .1 * ppm, 0, 0, Math.PI * 2); g.fillStyle = 'rgba(255,255,255,.6)'; g.fill(); g.restore(); }
      drawItem(f.held, t);
    }
    g.restore();
  }
  return { resize, draw, toY, get ppm() { return ppm; } };
}

/* 物件外框尺寸（米） */
export function sizeOf(kind, itemId, big, mode) {
  if (big) return BIG_SIZE[mode === 'garbage' ? 'garbage' : 'express'];
  return kind === 'garbage' ? ITEMS[itemId].size : BOX_SIZE;
}
/* 物件碰撞形状 */
export function bodyOf(kind, itemId, big, mode) {
  if (big) { const [w, h] = BIG_SIZE[mode === 'garbage' ? 'garbage' : 'express']; return mode === 'garbage' ? { poly: [[-w * .42, -h / 2], [w * .42, -h / 2], [w / 2, -h * .1], [w * .3, h * .45], [0, h / 2], [-w * .3, h * .45], [-w / 2, -h * .1]] } : { box: [w * .98, h * .98] }; }
  return kind === 'garbage' ? ITEMS[itemId].body : { box: [BOX_SIZE[0] - .02, BOX_SIZE[1] - .02] };
}
export { FONT, tone };
