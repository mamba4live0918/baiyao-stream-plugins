// 南瓜灯的样子。一盏灯画成一张图存起来，之后只贴图（塔上几十盏也只是几十次 drawImage）。
// 叠法（从下往上）：亮光晕 → 内壁（亮 / 暗）→ 洞里的光 → 带洞的瓜皮 → 洞口切面 → 洞外的光 → 名字牌 → 盖子 → 「重做」牌。
// 刻痕坐标是贴图的 0..1023（geometry.js 量化过的），贴图是 1024 见方，南瓜身子占 x .08–.92、y .23–.93，盖子占 y .015–.33。
import { img } from './assets.js';

export const BODY = { top: 0.23, bottom: 0.93, left: 0.08, right: 0.92 };
export const LID_BOX = { x: 236 / 1024, y: 15 / 1024, w: 553 / 1024, h: 323 / 1024 };
const SLIT = 0.024;
const T = 1023;

const canvas = (w, h) => {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
};

function trace(g, cut, k, dx = 0, dy = 0) {
  g.beginPath();
  for (const path of cut.paths || []) {
    path.forEach(([x, y], i) => (i ? g.lineTo(x * k + dx, y * k + dy) : g.moveTo(x * k + dx, y * k + dy)));
    if (cut.kind === 'hole') g.closePath();
  }
}

function paint(g, cuts, k, size, shift) {
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.lineWidth = SLIT * size;
  for (const cut of cuts) {
    const [dx, dy] = shift ? shift(cut) : [0, 0];
    trace(g, cut, k, dx, dy);
    if (cut.kind === 'hole') g.fill(); else g.stroke();
  }
}

/** 洞口切面朝哪边露出来：往南瓜中心偏一点（瓜是圆的），再往上一点（像稍微从上往下看）。 */
function wallShift(size) {
  return cut => {
    let sx = 0, sy = 0, n = 0;
    for (const p of cut.paths || []) for (const [x, y] of p) { sx += x; sy += y; n++; }
    const cx = n ? sx / n / T : 0.5, cy = n ? sy / n / T : 0.6;
    return [(0.5 - cx) * 0.07 * size, (-0.017 + (0.6 - cy) * 0.025) * size];
  };
}

function layer(size, draw) {
  const c = canvas(size, size), g = c.getContext('2d');
  draw(g);
  return c;
}

const BLUR_OK = (() => { try { const g = canvas(2, 2).getContext('2d'); g.filter = 'blur(2px)'; return g.filter === 'blur(2px)'; } catch { return false; } })();

function glowInto(g, src, size, radius, alpha) {
  g.save();
  g.globalCompositeOperation = 'lighter';
  g.globalAlpha = alpha;
  if (BLUR_OK) { g.filter = `blur(${Math.max(1, radius * size).toFixed(1)}px)`; g.drawImage(src, 0, 0); }
  else { g.shadowColor = '#FFB347'; g.shadowBlur = radius * size * 2; g.drawImage(src, 0, 0); }
  g.restore();
}

/** 名字牌：奶油色圆角牌子，压在南瓜下沿，谁订的就写谁。 */
export function drawNameTag(g, name, cx, cy, size, { maxWidth = size * 0.94, glow = false } = {}) {
  if (!name) return;
  let font = Math.round(size * 0.105);
  g.save();
  const set = () => { g.font = `800 ${font}px "Microsoft YaHei","PingFang SC",sans-serif`; };
  set();
  let text = name, w = g.measureText(text).width;
  const pad = font * 0.62, limit = maxWidth - pad * 2;
  if (w > limit) { font = Math.max(Math.round(size * 0.075), Math.floor(font * limit / w)); set(); w = g.measureText(text).width; }
  while (w > limit && text.length > 1) { text = text.slice(0, -1); w = g.measureText(text + '…').width; }
  if (text !== name) text += '…';
  const bw = w + pad * 2, bh = font * 1.5, x = cx - bw / 2, y = cy - bh / 2, r = bh / 2;
  g.beginPath();
  g.roundRect ? g.roundRect(x, y, bw, bh, r) : g.rect(x, y, bw, bh);
  g.fillStyle = 'rgba(70,30,10,.35)';
  g.save(); g.translate(0, size * 0.012); g.fill(); g.restore();
  g.fillStyle = glow ? '#FFF6DF' : '#FFF1D8';
  g.fill();
  g.lineWidth = Math.max(1.5, size * 0.011);
  g.strokeStyle = '#6E3A1C';
  g.stroke();
  g.fillStyle = '#5A2A12';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, cx, cy + font * 0.05);
  g.restore();
}

function drawLid(g, size, { dx = 0, dy = 0, rot = 0 } = {}) {
  const lid = img('pumpkin-1-lid');
  if (!lid) return;
  if (!rot && !dx && !dy) { g.drawImage(lid, 0, 0, size, size); return; }
  const cx = (LID_BOX.x + LID_BOX.w / 2) * size, cy = (LID_BOX.y + LID_BOX.h / 2) * size;
  g.save();
  g.translate(cx + dx, cy + dy);
  g.rotate(rot);
  g.drawImage(lid, -cx, -cy, size, size);
  g.restore();
}

/** 「重做」小木牌，挂在南瓜右上。 */
export function drawRedoTag(g, x, y, size) {
  const tag = img('recarve-tag');
  const w = size * 0.4, h = w * 222 / 284;
  g.save();
  g.translate(x, y);
  g.rotate(0.18);
  if (tag) g.drawImage(tag, -w / 2, -h / 2, w, h);
  g.font = `900 ${Math.round(w * 0.24)}px "Microsoft YaHei",sans-serif`;
  g.fillStyle = '#C0391B';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('重做', w * 0.06, h * 0.08);
  g.restore();
}

/**
 * 画一盏灯（或一个还没刻的南瓜），返回 size×size 的画布。
 * cuts：[{kind:'hole'|'slit', paths}]；lit：点亮了没；lid：盖子盖着没；name：名字牌；redo：挂「重做」牌。
 */
export function renderLantern({ cuts = [], lit = false, lid = true, name = '', redo = false, tag = true }, size) {
  const S = Math.max(8, Math.round(size)), k = S / T;
  const out = canvas(S, S), g = out.getContext('2d');
  const skin = img('pumpkin-1-skin'), inner = img(lit ? 'pumpkin-1-lit' : 'pumpkin-1-dark');
  if (lit) {
    const r = g.createRadialGradient(S * 0.5, S * 0.6, S * 0.1, S * 0.5, S * 0.6, S * 0.56);
    r.addColorStop(0, 'rgba(255,190,80,.42)');
    r.addColorStop(0.55, 'rgba(255,150,40,.16)');
    r.addColorStop(1, 'rgba(255,120,30,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, S, S);
  }
  if (cuts.length) {
    // 内壁：只在洞里露出来
    const inside = layer(S, x => {
      if (inner) x.drawImage(inner, 0, 0, S, S);
      if (lit) {
        const r = x.createRadialGradient(S * 0.5, S * 0.68, 0, S * 0.5, S * 0.62, S * 0.42);
        r.addColorStop(0, 'rgba(255,252,226,.97)');
        r.addColorStop(0.3, 'rgba(255,232,150,.9)');
        r.addColorStop(0.7, 'rgba(255,184,70,.78)');
        r.addColorStop(1, 'rgba(255,140,40,.6)');
        x.fillStyle = r;
        x.fillRect(0, 0, S, S);
      }
      x.globalCompositeOperation = 'destination-in';
      x.fillStyle = x.strokeStyle = '#000';
      paint(x, cuts, k, S);
    });
    g.drawImage(inside, 0, 0);
  }
  // 瓜皮：把洞挖掉
  const body = layer(S, x => {
    if (skin) x.drawImage(skin, 0, 0, S, S);
    if (lit) {   // 点亮以后整个瓜从里往外透一点暖光
      x.globalCompositeOperation = 'source-atop';
      const r = x.createRadialGradient(S * 0.5, S * 0.62, 0, S * 0.5, S * 0.62, S * 0.45);
      r.addColorStop(0, 'rgba(255,214,120,.22)');
      r.addColorStop(1, 'rgba(255,170,60,0)');
      x.fillStyle = r;
      x.fillRect(0, 0, S, S);
      x.globalCompositeOperation = 'source-over';
    }
    if (cuts.length) {
      x.globalCompositeOperation = 'destination-out';
      x.fillStyle = x.strokeStyle = '#000';
      paint(x, cuts, k, S);
    }
  });
  g.drawImage(body, 0, 0);
  if (cuts.length) {
    // 切面：洞里露出来的那一圈瓜肉
    const shift = wallShift(S);
    const wall = layer(S, x => {
      const fl = x.createLinearGradient(0, S * 0.35, 0, S * 0.85);
      fl.addColorStop(0, lit ? '#FFF0BE' : '#FBC56C');
      fl.addColorStop(1, lit ? '#FFC867' : '#E99439');
      x.fillStyle = x.strokeStyle = fl;
      paint(x, cuts, k, S);
      x.globalCompositeOperation = 'destination-out';
      x.fillStyle = x.strokeStyle = '#000';
      paint(x, cuts, k, S, shift);
    });
    g.drawImage(wall, 0, 0);
    // 切口边上一道深色细线，洞的形状更清楚
    g.save();
    g.lineJoin = 'round';
    g.lineCap = 'round';
    g.strokeStyle = lit ? 'rgba(150,60,10,.55)' : 'rgba(90,30,5,.6)';
    g.lineWidth = Math.max(1, S * 0.006);
    for (const cut of cuts) if (cut.kind === 'hole') { trace(g, cut, k); g.stroke(); }
    g.restore();
    if (lit) {
      const light = layer(S, x => { x.fillStyle = x.strokeStyle = '#FFC24D'; paint(x, cuts, k, S); });
      glowInto(g, light, S, 0.035, 0.75);
      glowInto(g, light, S, 0.012, 0.55);
    }
  }
  if (lid) drawLid(g, S);
  if (name) drawNameTag(g, name, S * 0.5, S * 0.905, S, { glow: lit });
  if (redo && tag) drawRedoTag(g, S * 0.82, S * 0.3, S);
  return out;
}

/** 单独的盖子图（开盖、合盖动画用），size 是整盏灯的尺寸。 */
export function lidSprite(size) {
  const S = Math.max(8, Math.round(size));
  return layer(S, g => drawLid(g, S));
}
export { drawLid };

/** 挖下来的那一块：瓜皮按洞的形状裁出来，返回小图和它在灯里的中心（0..1）。 */
export function cutPiece(cut, size) {
  const S = Math.max(8, Math.round(size)), k = S / T, skin = img('pumpkin-1-skin');
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of cut.paths || []) for (const [x, y] of p) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  if (!Number.isFinite(x0)) return null;
  const pad = cut.kind === 'hole' ? 2 : SLIT * T, bx = (x0 - pad) * k, by = (y0 - pad) * k;
  const w = (x1 - x0 + pad * 2) * k, h = (y1 - y0 + pad * 2) * k;
  const c = canvas(w + 2, h + 2), g = c.getContext('2d');
  g.translate(-bx, -by);
  g.save();
  g.fillStyle = g.strokeStyle = '#000';
  paint(g, [cut], k, S);
  g.globalCompositeOperation = 'source-in';
  if (skin) g.drawImage(skin, 0, 0, S, S);
  g.restore();
  g.globalCompositeOperation = 'source-over';
  g.strokeStyle = '#F6B04E';
  g.lineWidth = Math.max(1, S * 0.008);
  if (cut.kind === 'hole') { trace(g, cut, k); g.stroke(); }
  return { canvas: c, cx: (bx + w / 2) / S, cy: (by + h / 2) / S, w: w / S, h: h / S };
}

/** 摔碎：把整盏灯切成几块扇形碎片，各自是一张小图。 */
export function shatter(sprite, rand = Math.random) {
  const S = sprite.width, cx = S * 0.5, cy = S * 0.6, n = 7, out = [];
  let a = rand() * Math.PI * 2;
  const step = (Math.PI * 2) / n;
  for (let i = 0; i < n; i++) {
    const a0 = a, a1 = a + step * (0.75 + rand() * 0.5), R = S * 0.75;
    a = a1;
    const poly = [[cx + (rand() - 0.5) * S * 0.06, cy + (rand() - 0.5) * S * 0.06], [cx + Math.cos(a0) * R, cy + Math.sin(a0) * R], [cx + Math.cos((a0 + a1) / 2) * R * 1.1, cy + Math.sin((a0 + a1) / 2) * R * 1.1], [cx + Math.cos(a1) * R, cy + Math.sin(a1) * R]];
    const xs = poly.map(p => Math.max(0, Math.min(S, p[0]))), ys = poly.map(p => Math.max(0, Math.min(S, p[1])));
    const bx = Math.min(...xs), by = Math.min(...ys), w = Math.max(...xs) - bx, h = Math.max(...ys) - by;
    if (w < 2 || h < 2) continue;
    const c = canvas(w, h), g = c.getContext('2d');
    g.translate(-bx, -by);
    g.beginPath();
    poly.forEach(([x, y], j) => (j ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.closePath();
    g.clip();
    g.drawImage(sprite, 0, 0);
    out.push({ canvas: c, cx: (bx + w / 2) / S, cy: (by + h / 2) / S, dir: (a0 + a1) / 2 });
  }
  return out;
}
