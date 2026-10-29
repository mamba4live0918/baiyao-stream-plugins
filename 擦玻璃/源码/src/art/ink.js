/* 扁平卡通画风的基础画法（Canvas 2D，按像素画）。
   和快递分拣 2D 同一套：深棕描边、平涂、一层阴影、白色高光、圆润造型。 */
export const INK = '#4a3328';
export const FONT = '"TJRound","Microsoft YaHei UI","Microsoft YaHei","PingFang SC",sans-serif';
export const HAND_FONT = '"TJRound","YouYuan","幼圆","KaiTi",sans-serif';

/* 把十六进制颜色调暗（k<0）或调亮（k>0） */
export function tone(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const f = v => Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k);
  const r = f((n >> 16) & 255);
  const g = f((n >> 8) & 255);
  const b = f(n & 255);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

export function rgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export function canvas(w, h, opts) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  /* 默认用 CPU 画布：脏东西的画布之后要读像素（算剩余量）、要转着画进陈年污垢，GPU 画布每次都要先拷回来，慢十几倍 */
  const g = c.getContext('2d', opts || { willReadFrequently: true });
  return { c, g };
}

/* 圆角矩形路径 */
export function rr(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  g.moveTo(x + r, y);
  g.lineTo(x + w - r, y);
  g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r);
  g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  g.lineTo(x + r, y + h);
  g.quadraticCurveTo(x, y + h, x, y + h - r);
  g.lineTo(x, y + r);
  g.quadraticCurveTo(x, y, x + r, y);
}

/* 平滑闭合曲线（Catmull-Rom 转贝塞尔），点列 [[x,y],...] */
export function smoothClosed(g, pts) {
  const n = pts.length;
  if (n < 3) return;
  g.moveTo((pts[0][0] + pts[n - 1][0]) / 2, (pts[0][1] + pts[n - 1][1]) / 2);
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % n];
    g.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2);
  }
  g.closePath();
}

/* 画一个闭合形状：填色 → 形状内铺一层阴影（右下一条月牙）→ 描边。
   阴影做法：裁剪在形状里，用"大矩形减去向左上错开的同一形状"填色，剩下的就是右下的月牙。 */
export function shape(g, build, fill, { line = 3, ink = INK, shade = -0.16, off = null, noShade = false, alpha = 1 } = {}) {
  const [dx, dy] = off || [line * 2.2 + 2, line * 2.6 + 2];
  g.save();
  g.globalAlpha = alpha;
  g.beginPath();
  build(g);
  g.fillStyle = fill;
  g.fill();
  if (!noShade) {
    g.save();
    g.clip();
    g.beginPath();
    g.rect(-1e4, -1e4, 2e4, 2e4);
    g.save();
    g.translate(-dx, -dy);
    build(g);
    g.restore();
    g.fillStyle = tone(fill, shade);
    g.fill('evenodd');
    g.restore();
  }
  if (line > 0) {
    g.beginPath();
    build(g);
    g.lineWidth = line;
    g.strokeStyle = ink;
    g.lineJoin = 'round';
    g.lineCap = 'round';
    g.stroke();
  }
  g.restore();
}

export function stroke(g, build, w = 3, color = INK) {
  g.beginPath();
  build(g);
  g.lineWidth = w;
  g.strokeStyle = color;
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.stroke();
}

/* 白色高光（椭圆小块） */
export function shine(g, x, y, w, h, rot = -0.5, a = 0.85) {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.beginPath();
  g.ellipse(0, 0, w, h, 0, 0, Math.PI * 2);
  g.fillStyle = `rgba(255,255,255,${a})`;
  g.fill();
  g.restore();
}

/* 弧形高光条：沿 (x,y) 为圆心、半径 r 的一段弧，卡通液体常用 */
export function arcShine(g, x, y, r, a0, a1, w, a = 0.9) {
  g.save();
  g.beginPath();
  g.arc(x, y, r, a0, a1);
  g.lineWidth = w;
  g.lineCap = 'round';
  g.strokeStyle = `rgba(255,255,255,${a})`;
  g.stroke();
  g.restore();
}

export function dots(g, list, color) {
  g.fillStyle = color;
  for (const [x, y, r] of list) {
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
}
