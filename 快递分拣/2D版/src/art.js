/* 二次元扁平画风的程序绘制（纯 Canvas 2D，不依赖图片文件，全部内联在 HTML 里）。
   统一画法：深棕粗描边、平涂、一层阴影、白色高光，圆润的造型。
   所有尺寸用米：画东西前先 g.scale(像素/米)，每件物品以自身中心为原点、y 向下。 */
export const INK = '#4a3328';
export const LINE = .032;                       // 描边粗细（米），1 米 ≈ 110 像素时约 3.5 像素
export const FONT = '"Microsoft YaHei UI","Microsoft YaHei","PingFang SC","Noto Sans SC",sans-serif';

/* 颜色：把十六进制颜色调暗 / 调亮 */
export function tone(hex, k) {
  const n = parseInt(hex.slice(1), 16); let r = n >> 16 & 255, gg = n >> 8 & 255, b = n & 255;
  const f = v => Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k);
  r = f(r); gg = f(gg); b = f(b);
  return '#' + ((1 << 24) | (r << 16) | (gg << 8) | b).toString(16).slice(1);
}

/* 画一个闭合形状：先填色，再按需要在形状内部铺一层阴影（裁剪在形状里），最后描边 */
export function shape(g, build, fill, { shadeSide = 'br', shadeK = -.16, line = LINE, noShade = false } = {}) {
  g.beginPath(); build(g); g.closePath();
  g.fillStyle = fill; g.fill();
  if (!noShade) {
    g.save(); g.clip();
    const [x0, y0, x1, y1] = bbox(build);
    g.fillStyle = tone(fill, shadeK);
    g.beginPath();
    if (shadeSide === 'br') { g.moveTo(x1 + 1, y0 + (y1 - y0) * .35); g.lineTo(x1 + 1, y1 + 1); g.lineTo(x0 + (x1 - x0) * .45, y1 + 1); }
    else if (shadeSide === 'b') { g.rect(x0 - 1, y0 + (y1 - y0) * .68, x1 - x0 + 2, y1 - y0); }
    else if (shadeSide === 'r') { g.rect(x0 + (x1 - x0) * .7, y0 - 1, x1 - x0, y1 - y0 + 2); }
    g.closePath(); g.fill(); g.restore();
  }
  g.beginPath(); build(g); g.closePath();
  g.lineWidth = line; g.strokeStyle = INK; g.lineJoin = 'round'; g.lineCap = 'round'; g.stroke();
}
/* 粗略的外框：在离屏上下文里记下路径点的范围 */
function bbox(build) {
  const pts = [], rec = { moveTo: (x, y) => pts.push([x, y]), lineTo: (x, y) => pts.push([x, y]), quadraticCurveTo: (a, b, x, y) => pts.push([a, b], [x, y]), bezierCurveTo: (a, b, c, d, x, y) => pts.push([a, b], [c, d], [x, y]), arc: (x, y, r) => pts.push([x - r, y - r], [x + r, y + r]), ellipse: (x, y, rx, ry) => pts.push([x - rx, y - ry], [x + rx, y + ry]), rect: (x, y, w, h) => pts.push([x, y], [x + w, y + h]), roundRect: (x, y, w, h) => pts.push([x, y], [x + w, y + h]), closePath() { } };
  build(rec);
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return [x0, y0, x1, y1];
}
export const rr = (g, x, y, w, h, r) => { r = Math.min(r, w / 2, h / 2); g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r); g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h); g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r); g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); };
export function stroke(g, build, w = LINE, color = INK) { g.beginPath(); build(g); g.lineWidth = w; g.strokeStyle = color; g.lineJoin = 'round'; g.lineCap = 'round'; g.stroke(); }
export function shine(g, x, y, w, h, rot = -.5, a = .75) { g.save(); g.translate(x, y); g.rotate(rot); g.beginPath(); g.ellipse(0, 0, w, h, 0, 0, Math.PI * 2); g.fillStyle = `rgba(255,255,255,${a})`; g.fill(); g.restore(); }
export function dots(g, list, r, color) { g.fillStyle = color; for (const [x, y] of list) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); } }

/* 快递箱：三种颜色的面单（红圆、黄三角、蓝方块，和 3D 版筐上的图标一致），可以写寄件人名字 */
export const BOX_COLORS = ['#ef6450', '#f2c230', '#3d8fe0'];
export function drawBox(g, color, name = '', w = 1.1, h = .82) {
  shape(g, p => rr(p, -w / 2, -h / 2, w, h, .05), '#deac73');
  shape(g, p => rr(p, -.06, -h / 2, .12, h, .01), '#c8b48f', { noShade: true, line: .012 });
  const lx = -w / 2 + .1, ly = -h / 2 + .14, lw = .5, lh = h - .28;
  shape(g, p => rr(p, lx, ly, lw, lh, .03), '#ffffff', { noShade: true, line: .014 });
  const c = BOX_COLORS[color], cx = lx + .16, cy = ly + lh / 2;
  g.beginPath(); if (color === 0) g.arc(cx, cy, .1, 0, Math.PI * 2); else if (color === 1) { g.moveTo(cx, cy - .11); g.lineTo(cx + .12, cy + .09); g.lineTo(cx - .12, cy + .09); g.closePath(); } else rr(g, cx - .09, cy - .09, .18, .18, .02);
  g.fillStyle = c; g.fill(); g.lineWidth = .016; g.strokeStyle = INK; g.stroke();
  g.fillStyle = '#4a3328'; g.font = `700 .09px ${FONT}`; g.textAlign = 'left'; g.textBaseline = 'middle';
  if (name) g.fillText(name.slice(0, 4), lx + .3, cy - .06); else { stroke(g, p => { p.moveTo(lx + .3, cy - .07); p.lineTo(lx + .45, cy - .07); }, .02, '#9aa3ad'); }
  stroke(g, p => { p.moveTo(lx + .3, cy + .06); p.lineTo(lx + .44, cy + .06); }, .016, '#b9c0cc');
  for (const x of [w / 2 - .22, w / 2 - .14]) stroke(g, p => { p.moveTo(x, -.08); p.lineTo(x, .08); }, .018, tone('#deac73', -.35));
}

/* ---------------- 场景件 ---------------- */
export const BIN_COLORS = { garbage: ['#2f7fe0', '#e64a3f', '#36a86d', '#59616b'], express: ['#ef6450', '#f2c230', '#3d8fe0'] };
const BIN_ICON = {
  garbage: [
    g => { stroke(g, p => { p.arc(0, 0, .17, Math.PI * 1.15, Math.PI * 1.85); }, .05, '#fff'); stroke(g, p => { p.arc(0, 0, .17, Math.PI * .15, Math.PI * .85); }, .05, '#fff'); for (const a of [Math.PI * 1.85, Math.PI * .85]) { g.beginPath(); const x = Math.cos(a) * .17, y = Math.sin(a) * .17; g.moveTo(x + .06 * Math.sign(Math.cos(a)), y - .03); g.lineTo(x - .02, y - .07); g.lineTo(x - .03, y + .04); g.closePath(); g.fillStyle = '#fff'; g.fill(); } },
    g => { g.beginPath(); g.moveTo(0, -.2); g.lineTo(.2, .16); g.lineTo(-.2, .16); g.closePath(); g.fillStyle = '#fff'; g.fill(); g.fillStyle = BIN_COLORS.garbage[1]; g.fillRect(-.022, -.07, .044, .13); g.beginPath(); g.arc(0, .11, .025, 0, Math.PI * 2); g.fill(); },
    g => { stroke(g, p => { p.moveTo(-.2, 0); p.quadraticCurveTo(0, -.18, .14, 0); p.quadraticCurveTo(0, .18, -.2, 0); }, .045, '#fff'); stroke(g, p => { p.moveTo(.14, 0); p.lineTo(.24, -.08); p.moveTo(.14, 0); p.lineTo(.24, .08); }, .045, '#fff'); dots(g, [[-.1, -.02]], .025, '#fff'); },
    g => { shape(g, p => rr(p, -.14, -.12, .28, .3, .03), '#fff', { noShade: true, line: .001 }); g.fillStyle = '#fff'; g.fillRect(-.18, -.18, .36, .045); g.fillRect(-.05, -.24, .1, .05); g.fillStyle = BIN_COLORS.garbage[3]; for (const x of [-.07, 0, .07]) g.fillRect(x - .012, -.07, .024, .2); },
  ],
};
/* 一个筐 / 桶（正面）。back = 只画桶里面的暗色（东西掉进去时画在它前面），front = 画桶的正面和标签 */
export function drawBin(g, mode, i, label, w = 2.4, h = 2.0, part = 'front') {
  const c = BIN_COLORS[mode][i], top = -h / 2, lip = .16;
  if (part === 'back') { shape(g, p => rr(p, -w / 2 + .1, top + .04, w - .2, h * .5, .1), tone(c, -.45), { noShade: true }); return; }
  shape(g, p => { p.moveTo(-w / 2 + .08, top + lip); p.lineTo(w / 2 - .08, top + lip); p.lineTo(w / 2 - .18, h / 2 - .08); p.quadraticCurveTo(w / 2 - .2, h / 2, w / 2 - .28, h / 2); p.lineTo(-w / 2 + .28, h / 2); p.quadraticCurveTo(-w / 2 + .2, h / 2, -w / 2 + .18, h / 2 - .08); }, c, { shadeSide: 'r', shadeK: -.14 });
  shape(g, p => rr(p, -w / 2, top, w, lip + .04, .07), tone(c, .18), { shadeSide: 'b', shadeK: -.12 });
  stroke(g, p => { p.moveTo(-w / 2 + .3, top + lip + .1); p.lineTo(-w / 2 + .3, h / 2 - .2); p.moveTo(w / 2 - .4, top + lip + .1); p.lineTo(w / 2 - .4, h / 2 - .2); }, .03, tone(c, -.22));
  g.save(); g.translate(0, top + .62);
  if (mode === 'garbage') BIN_ICON.garbage[i](g);
  else { g.beginPath(); if (i === 0) g.arc(0, 0, .19, 0, Math.PI * 2); else if (i === 1) { g.moveTo(0, -.21); g.lineTo(.22, .17); g.lineTo(-.22, .17); g.closePath(); } else rr(g, -.17, -.17, .34, .34, .04); g.fillStyle = '#fff'; g.fill(); }
  g.restore();
  if (label) { g.fillStyle = '#fff'; g.font = `900 .3px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = .06; g.strokeStyle = tone(c, -.35); g.lineJoin = 'round'; g.strokeText(label, 0, top + 1.18); g.fillText(label, 0, top + 1.18); }
  shine(g, -w / 2 + .5, top + .5, .04, .2, .15, .35);
}

/* 柜台：木纹台面 + 奶油色前脸 + 一条粉色装饰带 */
export function drawCounter(g, x0, x1, topY, bottomY) {
  const w = x1 - x0, h = bottomY - topY;
  shape(g, p => rr(p, x0, topY + .12, w, h, .06), '#fff1df', { shadeSide: 'b', shadeK: -.08 });
  shape(g, p => rr(p, x0 + .05, topY + .5, w - .1, .1, .02), '#ffb3c7', { noShade: true, line: .016 });
  shape(g, p => rr(p, x0 - .1, topY - .02, w + .2, .22, .06), '#e9b57a', { shadeSide: 'b', shadeK: -.18 });
  for (let x = x0 + .4; x < x1 - .3; x += 1.7) stroke(g, p => { p.moveTo(x, topY + .07); p.quadraticCurveTo(x + .4, topY + .02, x + .9, topY + .08); }, .014, '#c98c4f');
}
/* 传送带：深色皮带 + 两端滚轮 + 支架 */
export function drawBelt(g, x0, x1, top, base, phase = 0) {
  const w = x1 - x0;
  shape(g, p => rr(p, x0 + .1, top + .14, w - .2, base - top - .14, .05), '#7b8794', { shadeSide: 'r' });
  shape(g, p => rr(p, x0, top - .02, w, .2, .1), '#3c4048', { noShade: true });
  g.save(); g.beginPath(); rr(g, x0 + .05, top, w - .1, .16, .08); g.clip();
  for (let x = x0 - 1 + (phase % .4); x < x1 + .4; x += .4) stroke(g, p => { p.moveTo(x, top + .02); p.lineTo(x + .14, top + .14); }, .03, '#565c66');
  g.restore();
  for (const x of [x0 + .1, x1 - .1]) { g.beginPath(); g.arc(x, top + .08, .1, 0, Math.PI * 2); g.fillStyle = '#c9ced6'; g.fill(); g.lineWidth = LINE * .8; g.strokeStyle = INK; g.stroke(); }
  shape(g, p => rr(p, x0 + .2, top + .34, w - .4, .08, .03), '#ffd36e', { noShade: true, line: .012 });
}
/* 堆货台：一块带牌子的平台 */
export function drawDock(g, x0, x1, top, base, text) {
  const w = x1 - x0;
  shape(g, p => rr(p, x0, top, w, base - top, .06), '#8fa1b3', { shadeSide: 'r' });
  shape(g, p => rr(p, x0 - .06, top - .06, w + .12, .16, .05), '#c5d0db', { shadeSide: 'b' });
  shape(g, p => rr(p, x0 + .2, top + .35, w - .4, .5, .08), '#37414c', { noShade: true });
  g.fillStyle = '#ffd36e'; g.font = `900 .28px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, (x0 + x1) / 2, top + .61);
}
/* 识别台：台面上一块发光的扫描板和一个小拱 */
export function drawScanner(g, x, top, on) {
  shape(g, p => rr(p, x - .6, top - .12, 1.2, .14, .05), on ? '#7ef0c6' : '#bfe9db', { noShade: true });
  shape(g, p => { p.moveTo(x - .55, top - .1); p.lineTo(x - .55, top - 1.1); p.quadraticCurveTo(x, top - 1.5, x + .55, top - 1.1); p.lineTo(x + .55, top - .1); p.lineTo(x + .42, top - .1); p.lineTo(x + .42, top - 1.04); p.quadraticCurveTo(x, top - 1.32, x - .42, top - 1.04); p.lineTo(x - .42, top - .1); }, '#9bb0c4');
  dots(g, [[x, top - 1.28]], .06, on ? '#ff5b5b' : '#e0a0a0');
}
/* 货车（侧面）：圆润车头 + 车厢，车厢侧面写观众名字；garbage 用绿色清运车 */
export function drawTruck(g, garbage, name, w = 5.6, h = 2.7, flip = false) {
  const c = garbage ? '#3fb47a' : '#ff9a4a', box = garbage ? '#e9f7ef' : '#fff3e6';
  if (flip) { g.save(); g.scale(-1, 1); }
  shape(g, p => rr(p, -w / 2, -h / 2, w * .68, h * .86, .14), box, { shadeSide: 'b', shadeK: -.08 });
  shape(g, p => rr(p, -w / 2, h * .2, w * .68, .16, .04), c, { noShade: true });
  shape(g, p => { const x = -w / 2 + w * .7; p.moveTo(x, -h * .2); p.lineTo(x + w * .18, -h * .2); p.quadraticCurveTo(w / 2, -h * .18, w / 2, h * .05); p.lineTo(w / 2, h * .36); p.lineTo(x, h * .36); }, c);
  shape(g, p => { const x = -w / 2 + w * .73; p.moveTo(x, -h * .14); p.lineTo(x + w * .14, -h * .14); p.quadraticCurveTo(x + w * .22, -h * .12, x + w * .22, h * .02); p.lineTo(x, h * .02); }, '#bfe6ff', { noShade: true });
  shine(g, -w / 2 + w * .77, -h * .08, .05, .12, .5, .7);
  for (const x of [-w / 2 + w * .16, -w / 2 + w * .52, w / 2 - w * .14]) { g.beginPath(); g.arc(x, h * .4, .36, 0, Math.PI * 2); g.fillStyle = '#3a3f47'; g.fill(); g.lineWidth = LINE; g.strokeStyle = INK; g.stroke(); g.beginPath(); g.arc(x, h * .4, .14, 0, Math.PI * 2); g.fillStyle = '#d9dee6'; g.fill(); }
  if (flip) g.restore();
  const tx = (flip ? -1 : 1) * (-w / 2 + w * .34);   // 文字不跟着镜像
  g.fillStyle = INK; g.font = `900 ${Math.min(.62, w * .68 / Math.max(2, (name || '垃圾清运').length) * .95)}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  const label = name ? name.slice(0, 6) : (garbage ? '垃圾清运' : '今日快件'); g.fillText(label, tx, -h * .12);
  g.fillStyle = c; g.font = `700 .26px ${FONT}`; g.fillText(garbage ? '观众专线 · 分类投放' : '观众专线 · 不准下班', tx, h * .1);
}

/* 把一件物品画到离屏画布上，返回画布和它的像素尺寸（按像素 / 米缩放，四周留出描边的余量） */
export function sprite(drawFn, size, ppm, dpr = 1) {
  const pad = .06, k = ppm * dpr, cw = Math.ceil((size[0] + pad * 2) * k), ch = Math.ceil((size[1] + pad * 2) * k);
  const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(cw, ch) : Object.assign(document.createElement('canvas'), { width: cw, height: ch });
  const g = c.getContext('2d'); g.scale(k, k); g.translate(size[0] / 2 + pad, size[1] / 2 + pad); drawFn(g);
  return { c, w: cw / dpr, h: ch / dpr };
}
