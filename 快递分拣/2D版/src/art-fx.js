/* 特效与互动件的二次元扁平画法（和 art.js 同一套笔法：深棕粗描边、平涂、一层阴影、白色高光，造型圆润）。
   全部画在「米」坐标里（调用方已经 g.scale(像素/米)），以原点为中心、y 向下。
   不用随机数：同样的参数每次画出来都一样（需要错落感时用固定的伪随机 hash）。 */
import { INK, LINE, FONT, tone, shape, rr, stroke, shine, dots } from './art.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const hash = i => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };   // 固定伪随机，0–1
const isHex = c => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c);
const ACCENT = ['#ef6450', '#f2c230', '#3d8fe0'];   // 红 / 黄 / 蓝，和 art.js 快递面单的三色一致

/* 圆润的不规则团块：沿椭圆取 n 个点，半径按固定伪随机起伏，相邻点之间用二次曲线顺滑连接 */
function blobPath(p, cx, cy, rx, ry, n, seed, j = .2) {
  const pt = i => { const a = (i % n) / n * TAU, k = 1 - j / 2 + j * hash(seed + (i % n)); return [cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]; };
  let a = pt(n - 1), b = pt(0); p.moveTo((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
  for (let i = 0; i < n; i++) { a = pt(i); b = pt(i + 1); p.quadraticCurveTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2); }
  p.closePath();
}
/* 几块拼成一整块贴纸：先用两倍粗的描边描全部外形，再逐块填色——外圈一道均匀描边，块与块之间没有接缝 */
function sticker(g, parts, fill, line = LINE) {
  g.lineWidth = line * 2; g.strokeStyle = INK; g.lineJoin = 'round'; g.lineCap = 'round';
  for (const f of parts) { g.beginPath(); f(g); g.stroke(); }
  g.fillStyle = fill; for (const f of parts) { g.beginPath(); f(g); g.fill(); }
}
function clipTo(g, build, f) { g.save(); g.beginPath(); build(g); g.clip(); f(); g.restore(); }
const starPath = (p, cx, cy, r, k = .48, n = 5) => { for (let i = 0; i < n * 2; i++) { const a = -Math.PI / 2 + i * Math.PI / n, d = i % 2 ? r * k : r; if (i) p.lineTo(cx + Math.cos(a) * d, cy + Math.sin(a) * d); else p.moveTo(cx + Math.cos(a) * d, cy + Math.sin(a) * d); } };
/* 折线只画前 frac（0–1）那一段：裂缝慢慢变长用 */
function partial(p, pts, frac) {
  const n = pts.length - 1, upto = frac * n; p.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i <= n && i - 1 < upto; i++) { const k = Math.min(1, upto - (i - 1)), [x0, y0] = pts[i - 1], [x1, y1] = pts[i]; p.lineTo(x0 + (x1 - x0) * k, y0 + (y1 - y0) * k); }
}
function label(g, text, x, y, size, color) { g.fillStyle = color; g.font = `900 ${size}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, x, y); }

/* ---------------- 泥巴（垃圾模式「看不出是什么」） ----------------
   size = 物件外框 [宽, 高]。一大团疙疙瘩瘩的泥盖住外框约七成，下沿挂着四道细长的泥滴（窄脖子 + 圆滴头，长短不一），
   旁边溅开两点泥，中间一个浅色问号。全部画在外框以内（sprite 四周的 0.06 米留白够放描边）。 */
export function drawMud(g, size) {
  const [w, h] = size, s = Math.min(w, h), rx = w * .45, ry = h * .42, cy = -h * .03, mud = '#8b5a33', seed = Math.round(w * 37 + h * 91), dr = clamp(s * .07, .02, .045);
  const drip = (fx, len) => p => {
    const x = fx * rx, y0 = cy + ry * Math.sqrt(1 - fx * fx) * .72, y1 = Math.min(h / 2 - dr * 1.05, y0 + len), nw = dr * .45, aL = Math.atan2(-Math.sqrt(dr * dr - nw * nw), -nw);
    p.moveTo(x - dr * 1.3, y0 - dr * .6); p.quadraticCurveTo(x - nw, y0, x - nw, Math.min(y0 + dr, y1 - dr)); p.arc(x, y1, dr, aL, -Math.PI - aL, true); p.lineTo(x + nw, Math.min(y0 + dr, y1 - dr)); p.quadraticCurveTo(x + nw, y0, x + dr * 1.3, y0 - dr * .6); p.closePath();
  };
  const blob = p => blobPath(p, 0, cy, rx, ry, 14, seed, .3);
  const parts = [blob, drip(-.62, h * .07 + .04), drip(-.2, h * .12 + .07), drip(.25, h * .05 + .03), drip(.6, h * .1 + .05)];
  for (const [fx, fy, r] of [[-.93, -.62, .75], [.95, .02, .6]]) parts.push(p => p.arc(fx * (w / 2 - dr), fy * (h / 2 - dr), dr * r, 0, TAU));
  sticker(g, parts, mud);
  clipTo(g, blob, () => {
    g.fillStyle = tone(mud, -.18); g.beginPath(); g.moveTo(rx * 1.2, cy - ry * .25); g.lineTo(rx * 1.2, cy + ry * 1.2); g.lineTo(-rx * .25, cy + ry * 1.2); g.closePath(); g.fill();
    for (let i = 0; i < 6; i++) { g.beginPath(); g.ellipse((hash(seed + i * 3) - .5) * rx * 1.4, cy + (hash(seed + i * 3 + 1) - .5) * ry * 1.4, s * (.05 + .05 * hash(i + 9)), s * (.035 + .03 * hash(i + 4)), hash(i) * 3, 0, TAU); g.fillStyle = i % 2 ? tone(mud, -.28) : tone(mud, .14); g.fill(); }
  });
  label(g, '?', w * .03, cy + h * .02, Math.min(h * .5, w * .42), tone(mud, .42));
  shine(g, -rx * .5, cy - ry * .5, s * .08, s * .035, -.5, .45); dots(g, [[-rx * .2, cy - ry * .68], [rx * .45, cy - ry * .35]], s * .025, 'rgba(255,255,255,.45)');
}

/* ---------------- 塑料袋（垃圾模式的「套袋」） ----------------
   半透明白袋子把物件整个裹住，顶上打个结、两只袋耳。layers 1–6：层数越多越不透明，袋边多几圈；2 层起右上角有「×N」小牌。
   范围：左右比外框各宽约 0.07 米，下面多约 0.06，结和袋耳最高到外框上沿以上约 0.12 米
   （render2d 用 [宽+0.16, 高+0.2] 的贴图，四周再留 0.06，放得下，还余 0.04）。 */
export function drawBag(g, size, layers = 1) {
  const [w, h] = size, n = clamp(Math.round(layers) || 1, 1, 6), a = w / 2 + .05, b = h / 2 + .04, ny = -b + .005, ky = ny - .02, fill = `rgba(240,247,255,${.2 + n * .1})`;
  const sack = (p, k = 0) => { const A = a - k, B = b - k, N = ny + k; p.moveTo(-.07, N); p.bezierCurveTo(-A * .6, N, -A, -B * .7, -A, 0); p.bezierCurveTo(-A, B * .8, -A * .75, B, 0, B); p.bezierCurveTo(A * .75, B, A, B * .8, A, 0); p.bezierCurveTo(A, -B * .7, A * .6, N, .07, N); p.closePath(); };
  g.beginPath(); sack(g); g.fillStyle = fill; g.fill();
  for (let j = 1; j < n; j++) stroke(g, p => sack(p, j * .017), .01, 'rgba(150,172,195,.6)');
  const folds = p => { p.moveTo(-.04, ny + .03); p.quadraticCurveTo(-a * .3, -b * .5, -a * .45, -b * .08); p.moveTo(.04, ny + .03); p.quadraticCurveTo(a * .3, -b * .5, a * .52, -b * .2); p.moveTo(-a * .5, b * .55); p.quadraticCurveTo(-a * .1, b * .78, a * .35, b * .58); };
  stroke(g, folds, .02, 'rgba(255,255,255,.9)');
  g.save(); g.translate(.014, .012); stroke(g, folds, .009, 'rgba(140,160,182,.55)'); g.restore();
  stroke(g, sack, LINE);
  shine(g, -a * .62, -b * .2, .022, Math.max(.05, b * .3), .15, .65);
  // 扎口：两只袋耳 + 一个结
  for (const s of [-1, 1]) { const ear = p => { p.moveTo(s * .02, ky); p.quadraticCurveTo(s * .07, ky - .065, s * .14, ky - .05); p.quadraticCurveTo(s * .11, ky - .005, s * .02, ky + .012); p.closePath(); }; g.beginPath(); ear(g); g.fillStyle = fill; g.fill(); stroke(g, ear, .024); }
  g.beginPath(); g.arc(0, ky + .005, .034, 0, TAU); g.fillStyle = `rgba(232,240,250,${.5 + n * .08})`; g.fill(); g.lineWidth = .024; g.strokeStyle = INK; g.stroke();
  if (n > 1) { const r = clamp(Math.min(a, b) * .42, .065, .11), bx = a - r * .75, by = -b + r * .95; shape(g, p => p.arc(bx, by, r, 0, TAU), '#ff7a8a', { noShade: true, line: .018 }); label(g, '×' + n, bx, by + r * .06, r * 1.05, '#ffffff'); }
}

/* ---------------- 封箱胶带（快递模式的「缠胶带」） ----------------
   size = 箱子 [宽, 高]；layers 1–6 条棕色胶带：横、竖、两条对角、上横、左竖依次叠加，只画在箱子外框以内 */
export function drawTape(g, size, layers = 1) {
  const [w, h] = size, n = clamp(Math.round(layers) || 1, 1, 6), d = Math.atan2(h, w), L = Math.hypot(w, h) + .3, bw = clamp(h * .17, .08, .15), box = p => rr(p, -w / 2, -h / 2, w, h, .05);
  const BANDS = [[0, 0, 0], [0, 0, Math.PI / 2], [0, 0, d], [0, 0, -d], [0, -.3, .07], [-.3, 0, Math.PI / 2 - .1]];
  clipTo(g, box, () => {
    for (let i = 0; i < n; i++) {
      const [fx, fy, ang] = BANDS[i]; g.save(); g.translate(fx * w, fy * h); g.rotate(ang);
      g.fillStyle = 'rgba(190,124,52,.82)'; g.fillRect(-L / 2, -bw / 2, L, bw);
      g.fillStyle = 'rgba(255,240,215,.35)'; g.fillRect(-L / 2, -bw * .32, L, bw * .16);
      stroke(g, p => { p.moveTo(-L / 2, -bw / 2); p.lineTo(L / 2, -bw / 2); p.moveTo(-L / 2, bw / 2); p.lineTo(L / 2, bw / 2); }, .014, '#7a4a1e');
      g.restore();
    }
  });
  stroke(g, box, LINE);
}

/* ---------------- 大黑袋（垃圾模式的盲袋） ----------------
   w×h 一般 2.0×1.8 米：鼓鼓的黑垃圾袋，顶上收口扎紧、两片袋耳，结上挂一张「?」小牌。
   越打越破：hitsLeft 越少，撕开的口子越多、越长，口子边是拉薄发白的塑料，里面露出花花绿绿的垃圾；hitsLeft = 0 时 6 道口子全开。
   外形和 render2d 的碰撞多边形一致：底宽约 ±0.42w、最宽 ±0.5w、顶部收口在 −0.42h；袋耳高出袋顶约 0.2 米（只是装饰）。每帧都画，路径数控制在几十条以内。 */
const TEARS = [[-.22, .12, .5], [.2, -.08, -.4], [.04, .3, .1], [-.28, -.14, -.8], [.3, .26, .7], [-.04, -.22, .2]];
const PEEK = ['#ef5d5d', '#ffd54f', '#a8e6f0', '#8fd36a'];
export function drawBigBag(g, w, h, hitsLeft = 1, hitsTotal = 1) {
  const d = clamp(1 - hitsLeft / Math.max(1, hitsTotal), 0, 1), m = Math.min(w, h), ky = -.42 * h, c2 = '#4a4f58';
  const sack = p => { p.moveTo(-.06 * w, -.4 * h); p.bezierCurveTo(-.1 * w, -.29 * h, -.47 * w, -.33 * h, -.5 * w, .05 * h); p.bezierCurveTo(-.52 * w, .36 * h, -.38 * w, .5 * h, -.18 * w, .5 * h); p.quadraticCurveTo(0, .51 * h, .18 * w, .5 * h); p.bezierCurveTo(.38 * w, .5 * h, .52 * w, .36 * h, .5 * w, .05 * h); p.bezierCurveTo(.47 * w, -.33 * h, .1 * w, -.29 * h, .06 * w, -.4 * h); };
  for (const s of [-1, 1]) {
    const tip = ky - .2 - (s > 0 ? .04 : 0);
    shape(g, p => { p.moveTo(s * .03, ky + .02); p.quadraticCurveTo(s * .1, ky - .1, s * .3, tip); p.quadraticCurveTo(s * .2, ky - .05, s * .08, ky + .03); }, c2, { noShade: true });
    stroke(g, p => { p.moveTo(s * .08, ky - .03); p.quadraticCurveTo(s * .14, ky - .1, s * .25, tip + .04); }, .016, '#6b717c');
  }
  shape(g, sack, '#3a3e46', { shadeK: -.3 });
  stroke(g, p => { for (const [x1, y1] of [[-.24, -.14], [-.1, -.2], [.12, -.21], [.26, -.12], [.01, -.26]]) { p.moveTo(x1 * .2 * w, -.38 * h); p.quadraticCurveTo(x1 * .55 * w, -.32 * h, x1 * w, y1 * h); } p.moveTo(-.3 * w, .36 * h); p.quadraticCurveTo(-.1 * w, .42 * h, .05 * w, .38 * h); }, .022, '#5d636e');
  shine(g, -.3 * w, .02 * h, .05, .2 * h, .35, .35); shine(g, -.22 * w, -.24 * h, .03, .05, .9, .45); shine(g, .33 * w, .22 * h, .03, .09 * h, -.2, .22);
  const nT = d > 0 ? Math.ceil(d * TEARS.length) : 0;
  for (let i = 0; i < nT; i++) {
    const [fx, fy, ang] = TEARS[i], grow = clamp(d * TEARS.length - i, .35, 1.6), L = m * (.05 + .05 * grow), W = L * (.3 + .2 * Math.min(1, grow));
    g.save(); g.translate(fx * w, fy * h); g.rotate(ang);
    const rip = p => { p.moveTo(-L, 0); for (let j = 1; j < 10; j++) p.lineTo(-L + L * j / 5, -Math.sin(Math.PI * j / 10) * W * (j % 2 ? .65 : 1)); p.lineTo(L, 0); for (let j = 9; j > 0; j--) p.lineTo(-L + L * j / 5, Math.sin(Math.PI * j / 10) * W * (j % 2 ? 1 : .7)); p.closePath(); };
    g.beginPath(); rip(g); g.fillStyle = '#16181c'; g.fill();
    clipTo(g, rip, () => { shape(g, p => rr(p, -L * .55, W * .05, L * 1.15, W * 1.4, .03), PEEK[i % PEEK.length], { noShade: true, line: .02 }); shine(g, -L * .25, W * .35, L * .14, W * .1, 0, .6); });
    stroke(g, rip, .05, 'rgba(150,158,170,.55)'); stroke(g, rip, .02);
    stroke(g, p => { p.moveTo(-L * 1.05, 0); p.lineTo(-L * 1.4, -W * .3); p.moveTo(L * 1.05, 0); p.lineTo(L * 1.45, W * .25); }, .016, '#6b717c');
    g.restore();
  }
  shape(g, p => p.ellipse(0, ky, .1, .075, 0, 0, TAU), c2, { noShade: true });
  // 结上挂的「?」小牌
  g.save(); g.translate(.12, ky + .02); g.rotate(.3);
  stroke(g, p => { p.moveTo(-.1, -.02); p.lineTo(.04, .04); }, .016, '#d9dee6');
  shape(g, p => rr(p, .02, .0, .22, .17, .035), '#fff8ea', { shadeSide: 'b', shadeK: -.1, line: .022 });
  label(g, '?', .13, .09, .15, INK);
  g.restore();
}

/* ---------------- 爆箱盲盒（快递模式） ----------------
   w×h 一般 1.9×1.45 米：牛皮纸大箱 + 彩带十字和蝴蝶结 + 正中一个大「?」、两侧小「?」。color 0/1/2 = 红/黄/蓝彩带。
   越打越裂：hitsLeft 越少，从箱边往里的裂缝越多越长，裂缝里透出黄光；蝴蝶结高出箱顶约 0.16 米。每帧都画。 */
const CRACKS = [[[-.5, -.02], [-.4, .04], [-.43, .14], [-.32, .22]], [[.14, .5], [.09, .38], [.17, .3], [.1, .19]], [[.5, .1], [.4, .15], [.43, .27], [.32, .34]], [[-.22, .5], [-.18, .4], [-.27, .33], [-.21, .23]], [[.5, -.16], [.41, -.12], [.44, -.02], [.36, .04]]];
export function drawBlindBox(g, w, h, color = 0, hitsLeft = 1, hitsTotal = 1) {
  const ci = ((Math.round(color) || 0) % 3 + 3) % 3, c = ACCENT[ci], kraft = '#deac73', d = clamp(1 - hitsLeft / Math.max(1, hitsTotal), 0, 1), lid = h * .24, top = -h / 2;
  shape(g, p => rr(p, -w / 2, top + lid * .5, w, h - lid * .5, .06), kraft);
  shape(g, p => rr(p, -.11, top + lid * .5, .22, h - lid * .5, .01), c, { shadeSide: 'r' });
  shape(g, p => rr(p, -w / 2 - .05, top, w + .1, lid, .06), tone(kraft, .1), { shadeSide: 'b', shadeK: -.15 });
  shape(g, p => rr(p, -.13, top, .26, lid, .01), c, { shadeSide: 'b' });
  for (const s of [-1, 1]) shape(g, p => { p.moveTo(s * .02, top + .02); p.lineTo(s * .13, top + .19); p.lineTo(s * .08, top + .17); p.lineTo(s * .05, top + .21); p.lineTo(-s * .02, top + .03); }, tone(c, -.08), { noShade: true });   // 彩带垂下的两条尾巴
  for (const s of [-1, 1]) shape(g, p => p.ellipse(s * .2, top - .07, .21, .1, -s * .35, 0, TAU), c, { shadeK: -.18 });
  shape(g, p => rr(p, -.08, top - .13, .16, .15, .05), tone(c, -.1), { noShade: true });
  for (const [x, y, a] of [[-.36, .02, -.2], [.4, -.06, .25], [-.2, .36, .15], [.3, .38, -.1]]) { g.save(); g.translate(x * w, y * h); g.rotate(a); label(g, '?', 0, 0, h * .1, tone(kraft, -.3)); g.restore(); }
  const R = Math.min(.3, h * .2), cy = top + lid + (h - lid) * .48;
  shape(g, p => p.arc(0, cy, R, 0, TAU), '#ffffff', { shadeK: -.08, line: .028 }); label(g, '?', 0, cy + R * .06, R * 1.45, INK);
  shape(g, p => p.arc(-w * .3, cy + R * .45, R * .52, 0, TAU), ACCENT[(ci + 1) % 3], { line: .024 }); label(g, '?', -w * .3, cy + R * .48, R * .75, '#ffffff');
  shape(g, p => p.arc(w * .31, cy - R * .2, R * .45, 0, TAU), ACCENT[(ci + 2) % 3], { line: .024 }); label(g, '?', w * .31, cy - R * .17, R * .65, '#ffffff');
  shine(g, -w / 2 + .14, top + lid + .2, .03, .14, .1, .5);
  const nC = d * CRACKS.length;
  if (nC > 0) {
    const crack = p => { for (let i = 0; i < Math.ceil(nC); i++) partial(p, CRACKS[i].map(([x, y]) => [x * w, y * h]), clamp(nC - i, 0, 1)); };
    if (d >= .5) stroke(g, crack, .13, `rgba(255,226,122,${(d - .4) * .6})`);
    stroke(g, crack, .045, INK); stroke(g, crack, .016, '#ffe27a');
  }
}

/* ---------------- 封桶的黄黑警示胶带 ----------------
   矩形 w×h 以原点为中心（左上角 (−w/2, −h/2)）：两条对角斜条 + 一条横条交叉贴在桶口上。
   progress 0..1 = 撕掉了多少：先撕横条、再撕左斜条、最后撕右斜条；正在撕的那条从一头变短，断口是锯齿，往下耷拉。progress ≥ 1 什么都不画。 */
function hazardStrip(g, x, y, ang, len, sw, torn) {
  g.save(); g.translate(x, y); g.rotate(ang);
  const body = p => { p.moveTo(0, -sw / 2); p.lineTo(len, -sw / 2); if (torn) for (let j = 1; j <= 4; j++) p.lineTo(len + (j % 2 ? -.045 : 0), -sw / 2 + sw * j / 4); else p.lineTo(len, sw / 2); p.lineTo(0, sw / 2); p.closePath(); };
  g.beginPath(); body(g); g.fillStyle = '#f5c22e'; g.fill();
  clipTo(g, body, () => { g.fillStyle = '#2b2b30'; for (let s = -sw; s < len + sw; s += sw * 1.25) { g.beginPath(); g.moveTo(s, sw / 2); g.lineTo(s + sw * .6, -sw / 2); g.lineTo(s + sw * 1.2, -sw / 2); g.lineTo(s + sw * .6, sw / 2); g.closePath(); g.fill(); } g.fillStyle = 'rgba(255,255,255,.22)'; g.fillRect(0, -sw * .36, len, sw * .14); });
  stroke(g, body, LINE * .8);
  g.restore();
}
export function drawSeal(g, w, h, progress = 0) {
  const pr = clamp(Number(progress) || 0, 0, 1); if (pr >= 1) return;
  const sw = clamp(h * .36, .1, .2), D = Math.hypot(w, h), a = Math.atan2(h, w);
  const strips = [[-w / 2, 0, 0, w], [-w / 2, -h / 2, a, D], [w / 2, -h / 2, Math.PI - a, D]];   // [起点 x, 起点 y, 方向, 长度]
  strips.forEach(([x, y, ang, len], i) => {
    const t0 = i / 3, t1 = (i + 1) / 3; if (pr >= t1) return;
    const k = clamp((pr - t0) / (t1 - t0), 0, 1), droop = k * .22 * (Math.cos(ang) >= 0 ? 1 : -1);
    hazardStrip(g, x, y, ang + droop, len * (1 - .7 * k), sw, k > 0);
  });
}

/* ---------------- 漏桶 ----------------
   矩形 w×h 以原点为中心。破洞的下沿在 y = +0.2h、水滴落到 y = +0.8h 的地面上，t 是秒数（循环动画）。
   （render2d 把矩形中心放在桶底上方 0.1 米、h = 0.5：洞口正好在桶底，地面正好在桶脚底下。） */
export function drawLeak(g, w, h, t = 0) {
  const y0 = h * .2, ground = h * .8, hw = Math.min(w * .17, .32);
  // 两道折线裂纹（从缺口往上裂），再在桶底边上崩出一个参差的缺口，缺口里汪着一点水
  stroke(g, p => { p.moveTo(-hw * .55, y0 - .1); p.lineTo(-hw * .8, y0 - .17); p.lineTo(-hw * .65, y0 - .22); p.lineTo(-hw * 1.05, y0 - .3); p.moveTo(-hw * .74, y0 - .19); p.lineTo(-hw * 1.1, y0 - .17); p.moveTo(hw * .45, y0 - .11); p.lineTo(hw * .75, y0 - .18); p.lineTo(hw * .6, y0 - .25); p.lineTo(hw * .95, y0 - .32); }, .02);
  const hole = p => { p.moveTo(-hw, y0); for (const [fx, fy] of [[-.85, .05], [-.7, .09], [-.5, .07], [-.35, .12], [-.12, .1], [.05, .13], [.25, .09], [.42, .115], [.62, .07], [.8, .08], [.92, .03]]) p.lineTo(fx * hw, y0 - fy); p.lineTo(hw, y0); p.closePath(); };
  shape(g, hole, '#2a2c31', { noShade: true, line: .022 });
  clipTo(g, hole, () => { g.fillStyle = '#5bb8e8'; g.fillRect(-hw, y0 - .03, hw * 2, .05); });
  // 地上一摊水 + 落点一圈水花，再是四滴错开往下掉、越掉越快的水
  const py = ground - .02, rp = ((t * 1.6) % 1 + 1) % 1;
  shape(g, p => p.ellipse(0, py, hw * 1.5, .045, 0, 0, TAU), '#8fd0f2', { noShade: true, line: .018 });
  shine(g, -hw * .6, py - .012, hw * .3, .01, 0, .8);
  stroke(g, p => p.ellipse(0, py, hw * (.3 + rp), .02 + .025 * rp, 0, 0, TAU), .014, `rgba(255,255,255,${(1 - rp).toFixed(3)})`);
  for (let i = 0; i < 4; i++) {
    const ph = ((t * 1.6 + i / 4) % 1 + 1) % 1, x = (hash(i + 5) - .5) * hw * 1.1, y = y0 + .06 + ph * ph * (py - y0 - .12), r = .06 * (1 - ph * .15);
    g.save(); g.globalAlpha *= ph > .88 ? (1 - ph) / .12 : 1;
    shape(g, p => { p.moveTo(x, y - r * 2); p.quadraticCurveTo(x + r * 1.05, y - r * .5, x + r, y); p.arc(x, y, r, 0, Math.PI); p.quadraticCurveTo(x - r * 1.05, y - r * .5, x, y - r * 2); }, '#5bb8e8', { noShade: true, line: .018 });
    shine(g, x - r * .35, y - r * .1, r * .18, r * .3, .3, .85);
    g.restore();
  }
}

/* ---------------- 无人机 ----------------
   help = 白身薄荷绿腰带、屏幕上圆眼睛和笑嘴、腮红；prank = 黑身红腰带、红眼怒眉、咬牙嘴。
   机身宽 0.8 米，两个螺旋桨伸到 ±0.58 米（总宽约 1.16 米）、桨在 y ≈ −0.39；t（秒）让桨叶转动。
   底下一只小爪子，爪尖在 y ≈ +0.52：抓着的件挂在机身中心下方约 0.6 米处看起来最自然。 */
export function drawDrone(g, kind = 'help', t = 0) {
  const prank = kind === 'prank', shell = prank ? '#3a3f47' : '#f7f9fb', belt = prank ? '#e64a3f' : '#3ccf9c', eye = prank ? '#ff5a3c' : '#7dffd9', metal = '#aab4bf';
  const claw = p => { p.moveTo(0, .26); p.lineTo(0, .35); p.moveTo(-.08, .35); p.lineTo(.08, .35); for (const s of [-1, 1]) { p.moveTo(s * .08, .35); p.quadraticCurveTo(s * .145, .42, s * .105, .5); p.lineTo(s * .055, .5); } };
  stroke(g, claw, .055, INK); stroke(g, claw, .024, metal);
  for (const s of [-1, 1]) { const arm = p => { p.moveTo(s * .2, -.15); p.lineTo(s * .36, -.36); }; stroke(g, arm, .055, INK); stroke(g, arm, .024, metal); }
  const body = p => p.ellipse(0, 0, .4, .3, 0, 0, TAU);
  shape(g, body, shell, { shadeK: prank ? -.25 : -.1 });
  clipTo(g, body, () => { g.fillStyle = belt; g.fillRect(-.45, .06, .9, .085); stroke(g, p => { p.moveTo(-.45, .06); p.lineTo(.45, .06); p.moveTo(-.45, .145); p.lineTo(.45, .145); }, .014); });
  stroke(g, body, LINE);
  shape(g, p => rr(p, -.25, -.2, .5, .21, .1), '#1f2730', { noShade: true, line: .022 });
  if (prank) {
    dots(g, [[-.1, -.085], [.1, -.085]], .038, eye);
    stroke(g, p => { p.moveTo(-.17, -.165); p.lineTo(-.05, -.125); p.moveTo(.17, -.165); p.lineTo(.05, -.125); }, .026, eye);
    stroke(g, p => { p.moveTo(-.07, -.03); for (let i = 1; i <= 6; i++) p.lineTo(-.07 + i * .14 / 6, i % 2 ? -.05 : -.03); }, .014, eye);
  } else {
    dots(g, [[-.1, -.105], [.1, -.105]], .045, eye); dots(g, [[-.085, -.12], [.115, -.12]], .015, '#ffffff');
    stroke(g, p => p.arc(0, -.075, .045, Math.PI * .2, Math.PI * .8), .018, eye);
    dots(g, [[-.3, .0], [.3, .0]], .04, 'rgba(255,143,177,.6)');
  }
  shine(g, -.15, -.16, .05, .012, -.12, .45); shine(g, -.31, -.1, .018, .045, .5, .75);
  for (const s of [-1, 1]) {
    const cx = s * .36, cy = -.39, k = Math.cos(t * 40 + (s > 0 ? 1.3 : 0));
    g.beginPath(); g.ellipse(cx, cy, .22, .05, 0, 0, TAU); g.fillStyle = 'rgba(205,214,224,.4)'; g.fill(); g.lineWidth = .012; g.strokeStyle = 'rgba(74,51,40,.35)'; g.stroke();
    shape(g, p => p.ellipse(cx, cy, Math.max(.03, Math.abs(k) * .21), .024, 0, 0, TAU), prank ? '#6b3a35' : '#9aa6b1', { noShade: true, line: .018 });
    shape(g, p => p.arc(cx, cy, .04, 0, TAU), belt, { noShade: true, line: .018 });
  }
}

/* ---------------- 识别台扫描线 ----------------
   宽 w 的红色激光线以原点为中心上下来回扫，扫动范围 ±h/2（默认 h = 0.8w），t 是秒数；两端是发光的小发射头 */
export function drawScanBeam(g, w, t = 0, h = w * .8) {
  const y = Math.sin(t * 3.2) * h / 2, hw = w / 2, gr = g.createLinearGradient(0, y - .12, 0, y + .12);
  gr.addColorStop(0, 'rgba(255,60,50,0)'); gr.addColorStop(.5, 'rgba(255,60,50,.35)'); gr.addColorStop(1, 'rgba(255,60,50,0)');
  g.fillStyle = gr; g.fillRect(-hw, y - .12, w, .24);
  stroke(g, p => { p.moveTo(-hw, y); p.lineTo(hw, y); }, .035, '#ff3b2f'); stroke(g, p => { p.moveTo(-hw, y); p.lineTo(hw, y); }, .012, '#ffd9d2');
  for (const s of [-1, 1]) shape(g, p => p.arc(s * hw, y, .035, 0, TAU), '#ff5b4f', { noShade: true, line: .016 });
}

/* ---------------- 粒子（单个约 0.2–0.35 米，调用方再按需要缩放、淡出） ---------------- */
export function drawStar(g, color = '#ffd36e') {
  shape(g, p => starPath(p, 0, 0, .16, .5), color, { noShade: !isHex(color), shadeK: -.14, line: .024 });
  shine(g, -.035, -.045, .02, .034, -.6, .8);
}
/* 彩纸屑：k 选形状（取模）：0 长条、1 圆片、2 三角、3 爱心、4 卷曲彩带 */
const CONFETTI = [
  p => rr(p, -.12, -.045, .24, .09, .02),
  p => p.arc(0, 0, .075, 0, TAU),
  p => { p.moveTo(0, -.1); p.lineTo(.1, .075); p.lineTo(-.1, .075); },
  p => { p.moveTo(0, .09); p.bezierCurveTo(-.15, 0, -.09, -.12, 0, -.045); p.bezierCurveTo(.09, -.12, .15, 0, 0, .09); },
];
export function drawConfetti(g, color = '#ff8fb1', k = 0) {
  const i = ((Math.round(k) || 0) % 5 + 5) % 5;
  if (i === 4) { const curl = p => { p.moveTo(-.12, .04); p.bezierCurveTo(-.06, -.1, 0, .1, .06, -.04); p.quadraticCurveTo(.09, -.09, .13, -.05); }; stroke(g, curl, .065, INK); stroke(g, curl, .03, color); return; }
  shape(g, CONFETTI[i], color, { noShade: !isHex(color), shadeK: -.15, line: .02 });
  if (i !== 2) shine(g, -.03, -.02, .024, .012, -.3, .7);
}
/* 尘土团：几团圆鼓鼓的灰米色云朵拼成一朵 */
export function drawPuff(g) {
  const parts = [[-.1, .03, .085], [0, -.04, .11], [.11, .02, .08], [.02, .06, .075]].map(([x, y, r]) => p => p.arc(x, y, r, 0, TAU));
  sticker(g, parts, '#efe7da', .022);
  clipTo(g, p => { for (const f of parts) { f(p); p.closePath(); } }, () => { g.fillStyle = '#ddd2c2'; g.fillRect(-.25, .07, .5, .12); });
  shine(g, -.03, -.08, .04, .016, -.2, .8);
}
/* 纸屑：一条两头撕成锯齿的小纸条，上面两道印刷线 */
export function drawShred(g) {
  shape(g, p => { p.moveTo(-.14, -.03); p.lineTo(.12, -.05); p.lineTo(.15, -.025); p.lineTo(.125, -.005); p.lineTo(.15, .02); p.lineTo(.12, .04); p.lineTo(-.13, .035); p.lineTo(-.155, .015); p.lineTo(-.13, 0); p.lineTo(-.155, -.015); }, '#fbf7ee', { shadeSide: 'b', shadeK: -.08, line: .02 });
  stroke(g, p => { p.moveTo(-.09, -.012); p.lineTo(.07, -.024); p.moveTo(-.09, .012); p.lineTo(.03, .004); }, .01, '#b9c0cc');
}
