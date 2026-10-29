/* 擦玻璃 · 小广告的画法工具：几种纸（白纸、牛皮纸、横格本、方格纸、便利贴、不干胶、热敏标签、票根）、纸纹、
   排字、底部一排可撕的小条、胶带、浆糊刷痕、印章、网点、警示条纹。
   （不画二维码和条形码：抖音直播里出现二维码算站外引流。）
   坐标都以纸的中心为原点，单位是屏幕像素（已经乘过 u）。 */
import { INK, FONT, HAND_FONT, rr, tone, rgba } from './ink.js';
import { rng } from '../util.js';

export const FONTS = {
  round: FONT,
  hand: HAND_FONT,
  hei: '"SimHei","Microsoft YaHei UI","Microsoft YaHei",sans-serif',
  yahei: '"Microsoft YaHei UI","Microsoft YaHei","PingFang SC",sans-serif',
  kai: '"KaiTi","STKaiti","楷体",serif',
  song: '"SimSun","STSong","宋体",serif'
};

/* 字号缩到放得下 maxW 为止，返回最后的字号（已经设好 g.font） */
export function fit(g, text, maxW, size, font = FONTS.yahei, weight = 800) {
  let s = size;
  g.font = `${weight} ${s}px ${font}`;
  while (s > 6 && g.measureText(text).width > maxW) {
    s -= Math.max(0.5, s * 0.04);
    g.font = `${weight} ${s}px ${font}`;
  }
  return s;
}

/* 写一行字：o = { size, font, weight, color, maxW, align, stroke, strokeW, shadow, rot, spacing } */
export function txt(g, text, x, y, o = {}) {
  g.save();
  g.translate(x, y);
  if (o.rot) g.rotate(o.rot);
  g.textAlign = o.align || 'center';
  g.textBaseline = 'middle';
  if (o.spacing && 'letterSpacing' in g) g.letterSpacing = `${o.spacing}px`;
  const s = fit(g, text, o.maxW || 1e9, o.size || 20, o.font || FONTS.yahei, o.weight ?? 800);
  if (o.shadow) {
    g.fillStyle = o.shadow;
    g.fillText(text, s * 0.06, s * 0.08);
  }
  if (o.stroke) {
    g.lineJoin = 'round';
    g.lineWidth = o.strokeW || s * 0.16;
    g.strokeStyle = o.stroke;
    g.strokeText(text, 0, 0);
  }
  g.fillStyle = o.color || INK;
  g.fillText(text, 0, 0);
  g.restore();
  return s;
}

/* 纸的外形（毛边用 seed 固定，填色和描边画出来是同一条边） */
export function paperPath(g, kind, w, h, u, seed = 1) {
  const random = rng(seed);
  const x = -w / 2;
  const y = -h / 2;
  g.beginPath();
  if (kind === 'sticker') rr(g, x, y, w, h, Math.min(w, h) * 0.09);
  else if (kind === 'label') rr(g, x, y, w, h, 7 * u);
  else if (kind === 'note') rr(g, x, y, w, h, 2.5 * u);
  else if (kind === 'ticket') {
    /* 两边各一个半圆缺口（撕票根的地方） */
    const ny = y + h * 0.68;
    const nr = Math.min(w, h) * 0.07;
    g.moveTo(x + 4 * u, y);
    g.lineTo(x + w - 4 * u, y);
    g.quadraticCurveTo(x + w, y, x + w, y + 4 * u);
    g.lineTo(x + w, ny - nr);
    g.arc(x + w, ny, nr, -Math.PI / 2, Math.PI / 2, true);
    g.lineTo(x + w, y + h - 4 * u);
    g.quadraticCurveTo(x + w, y + h, x + w - 4 * u, y + h);
    g.lineTo(x + 4 * u, y + h);
    g.quadraticCurveTo(x, y + h, x, y + h - 4 * u);
    g.lineTo(x, ny + nr);
    g.arc(x, ny, nr, Math.PI / 2, -Math.PI / 2, true);
    g.lineTo(x, y + 4 * u);
    g.quadraticCurveTo(x, y, x + 4 * u, y);
  } else if (kind === 'kraft' || kind === 'lined') {
    /* 毛边：牛皮纸四边都毛；本子纸只有上边是撕下来的锯齿 */
    const jag = (n, f) => {
      for (let i = 1; i <= n; i++) f(i / n, (random() - 0.5) * 2.4 * u);
    };
    g.moveTo(x, y);
    if (kind === 'lined') jag(26, (k, j) => g.lineTo(x + w * k, y + Math.abs(j) * 1.6 + (k * 26) % 2 * 1.5 * u));
    else jag(18, (k, j) => g.lineTo(x + w * k, y + j));
    if (kind === 'kraft') jag(22, (k, j) => g.lineTo(x + w + j, y + h * k));
    else g.lineTo(x + w, y + h);
    if (kind === 'kraft') jag(18, (k, j) => g.lineTo(x + w - w * k, y + h + j));
    else g.lineTo(x, y + h);
    if (kind === 'kraft') jag(22, (k, j) => g.lineTo(x + j, y + h - h * k));
    g.closePath();
  } else rr(g, x, y, w, h, 2 * u);
}

/* 铺纸：底色 → 纸纹（细小斑点、牛皮纸的纤维、横格线、方格）→ 四周微微发暗 → 细边 */
export function drawPaper(g, p, w, h, u, random) {
  const seed = 1 + Math.floor(random() * 1e6);
  /* 主播上传的贴纸：纸面就是图片本身 */
  if (p.kind === 'custom') return;
  g.save();
  paperPath(g, p.kind, w, h, u, seed);
  g.fillStyle = p.color;
  g.fill();
  g.clip();
  if (p.kind === 'lined') {
    g.strokeStyle = 'rgba(96,150,220,.38)';
    g.lineWidth = 1.1 * u;
    for (let yy = -h / 2 + h * 0.13; yy < h / 2; yy += h * 0.075) {
      g.beginPath();
      g.moveTo(-w / 2, yy);
      g.lineTo(w / 2, yy);
      g.stroke();
    }
    g.strokeStyle = 'rgba(226,80,90,.5)';
    g.beginPath();
    g.moveTo(-w / 2 + w * 0.13, -h / 2);
    g.lineTo(-w / 2 + w * 0.13, h / 2);
    g.stroke();
  }
  if (p.grid) {
    g.strokeStyle = p.grid;
    g.lineWidth = 0.8 * u;
    const step = w / 14;
    for (let xx = -w / 2 + step; xx < w / 2; xx += step) {
      g.beginPath();
      g.moveTo(xx, -h / 2);
      g.lineTo(xx, h / 2);
      g.stroke();
    }
    for (let yy = -h / 2 + step; yy < h / 2; yy += step) {
      g.beginPath();
      g.moveTo(-w / 2, yy);
      g.lineTo(w / 2, yy);
      g.stroke();
    }
  }
  if (p.kind === 'kraft') {
    g.lineWidth = 1 * u;
    for (let i = 0; i < 70; i++) {
      const x0 = (random() - 0.5) * w;
      const y0 = (random() - 0.5) * h;
      const a = random() * Math.PI;
      const l = (4 + random() * 12) * u;
      g.strokeStyle = random() < 0.5 ? 'rgba(90,60,30,.16)' : 'rgba(255,240,210,.22)';
      g.beginPath();
      g.moveTo(x0, y0);
      g.lineTo(x0 + Math.cos(a) * l, y0 + Math.sin(a) * l);
      g.stroke();
    }
  }
  /* 纸面细小斑点 */
  const n = Math.round((w * h) / (u * u * 260));
  for (let i = 0; i < n; i++) {
    g.fillStyle = random() < 0.6 ? 'rgba(80,60,40,.05)' : 'rgba(255,255,255,.18)';
    g.fillRect((random() - 0.5) * w, (random() - 0.5) * h, (0.8 + random() * 1.4) * u, (0.8 + random() * 1.4) * u);
  }
  /* 四周微暗（旧一点、有体积） */
  const gr = g.createRadialGradient(0, 0, Math.min(w, h) * 0.3, 0, 0, Math.hypot(w, h) * 0.56);
  gr.addColorStop(0, 'rgba(0,0,0,0)');
  gr.addColorStop(1, p.kind === 'sticker' || p.kind === 'label' ? 'rgba(0,0,0,.04)' : 'rgba(60,40,20,.1)');
  g.fillStyle = gr;
  g.fillRect(-w / 2, -h / 2, w, h);
  g.restore();
  g.save();
  paperPath(g, p.kind, w, h, u, seed);
  g.lineWidth = (p.kind === 'sticker' ? 2.4 : 1.5) * u;
  g.strokeStyle = p.edge || tone(p.color, -0.32);
  g.stroke();
  g.restore();
}

/* 不干胶的亮面：斜着一道反光 */
export function gloss(g, w, h, u, kind) {
  g.save();
  paperPath(g, kind, w, h, u);
  g.clip();
  const gr = g.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
  gr.addColorStop(0, 'rgba(255,255,255,0)');
  gr.addColorStop(0.32, 'rgba(255,255,255,0)');
  gr.addColorStop(0.4, 'rgba(255,255,255,.34)');
  gr.addColorStop(0.47, 'rgba(255,255,255,0)');
  gr.addColorStop(0.55, 'rgba(255,255,255,.14)');
  gr.addColorStop(0.6, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(-w / 2, -h / 2, w, h);
  g.restore();
}

/* 不干胶外面一圈白边（模切） */
export function dieCut(g, w, h, u) {
  g.save();
  paperPath(g, 'sticker', w, h, u);
  g.lineWidth = 7 * u;
  g.strokeStyle = '#ffffff';
  g.stroke();
  g.lineWidth = 1.6 * u;
  g.strokeStyle = 'rgba(120,110,100,.55)';
  g.stroke();
  g.restore();
}

/* 底部一排可撕的小条：虚线隔开，每条竖着写字（名字/电话） */
export function tabs(g, w, h, u, { y0, n = 6, text, color = 'rgba(74,51,40,.86)', font = FONTS.yahei, line = 'rgba(74,51,40,.5)' }) {
  g.save();
  g.setLineDash([4 * u, 3.4 * u]);
  g.strokeStyle = line;
  g.lineWidth = 1.3 * u;
  g.beginPath();
  g.moveTo(-w / 2, y0);
  g.lineTo(w / 2, y0);
  for (let i = 1; i < n; i++) {
    g.moveTo(-w / 2 + (w * i) / n, y0);
    g.lineTo(-w / 2 + (w * i) / n, h / 2);
  }
  g.stroke();
  g.restore();
  const chars = [...text].slice(0, 5);
  const th = h / 2 - y0;
  const s = Math.min((w / n) * 0.5, th / (chars.length + 0.8));
  g.save();
  g.font = `800 ${s}px ${font}`;
  g.fillStyle = color;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + (w * (i + 0.5)) / n;
    chars.forEach((c, k) => g.fillText(c, x, y0 + s * (k + 0.9)));
  }
  g.restore();
}

/* 圆形印章（红色、边上有一点缺墨） */
export function stamp(g, x, y, r, text, u, random, { color = '#d8342c', rot = -0.25, paper = '#ffffff' } = {}) {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.strokeStyle = color;
  g.fillStyle = color;
  g.lineWidth = r * 0.1;
  g.beginPath();
  g.arc(0, 0, r, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = r * 0.04;
  g.beginPath();
  g.arc(0, 0, r * 0.8, 0, Math.PI * 2);
  g.stroke();
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const s = fit(g, text, r * 1.3, r * (text.length > 2 ? 0.55 : 0.8), FONTS.hei, 900);
  g.fillText(text, 0, s * 0.04);
  /* 缺墨：用纸色点掉一些（只盖在已经画了东西的地方，不在纸上挖洞） */
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = paper;
  for (let i = 0; i < 26; i++) {
    const a = random() * Math.PI * 2;
    const d = random() * r * 1.05;
    g.beginPath();
    g.arc(Math.cos(a) * d, Math.sin(a) * d, (0.6 + random() * 1.6) * u, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}

/* 圆角色块 + 字（标签、价签） */
export function pill(g, x, y, w, h, text, bg, fg, u, font = FONTS.yahei) {
  g.save();
  g.beginPath();
  rr(g, x - w / 2, y - h / 2, w, h, h / 2);
  g.fillStyle = bg;
  g.fill();
  g.restore();
  txt(g, text, x, y + h * 0.02, { size: h * 0.62, maxW: w * 0.86, color: fg, font, weight: 900 });
}

/* 网点（老式印刷的阴影） */
export function halftone(g, x, y, w, h, color, step, maxR) {
  g.save();
  g.fillStyle = color;
  for (let yy = y; yy < y + h; yy += step) {
    for (let xx = x + ((((yy - y) / step) | 0) % 2) * (step / 2); xx < x + w; xx += step) {
      const k = 1 - (yy - y) / h;
      const r = maxR * (0.25 + 0.75 * k);
      g.beginPath();
      g.arc(xx, yy, r, 0, Math.PI * 2);
      g.fill();
    }
  }
  g.restore();
}

/* 黑黄警示条纹 */
export function hazard(g, x, y, w, h, c1 = '#1f1d1d', c2 = '#ffd23e') {
  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
  g.fillStyle = c2;
  g.fillRect(x, y, w, h);
  g.fillStyle = c1;
  const step = h * 1.4;
  for (let xx = x - h * 2; xx < x + w + h; xx += step) {
    g.beginPath();
    g.moveTo(xx, y + h);
    g.lineTo(xx + h, y);
    g.lineTo(xx + h + step / 2, y);
    g.lineTo(xx + step / 2, y + h);
    g.closePath();
    g.fill();
  }
  g.restore();
}

/* 透明胶：半边在纸上、半边在玻璃上；返回胶带在纸面上的位置（撕下后留胶印用） */
export function tape(g, x, y, rot, tw, th, u, tint = 'rgba(236,240,232,.7)') {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.beginPath();
  g.moveTo(-tw / 2, -th / 2);
  for (let i = 1; i <= 4; i++) g.lineTo(-tw / 2 + (tw * i) / 4, -th / 2 + (i % 2 ? 1.2 : -0.8) * u);
  g.lineTo(tw / 2 + 1.5 * u, th / 2);
  for (let i = 1; i <= 4; i++) g.lineTo(tw / 2 - (tw * i) / 4, th / 2 + (i % 2 ? -1 : 0.8) * u);
  g.closePath();
  g.fillStyle = tint;
  g.fill();
  g.lineWidth = 1 * u;
  g.strokeStyle = 'rgba(150,160,150,.55)';
  g.stroke();
  g.fillStyle = 'rgba(255,255,255,.55)';
  g.fillRect(-tw * 0.38, -th * 0.28, tw * 0.76, th * 0.14);
  g.restore();
  return { x, y, rot, w: tw, h: th };
}

/* 浆糊刷痕：顺着"贴的方向"一道道半透明亮痕（撕的时候顺着它） */
export function pasteStreaks(g, w, h, u, ax, ay, random) {
  g.save();
  paperPath(g, 'plain', w, h, u);
  g.clip();
  const px = -ay;
  const py = ax;
  const reach = Math.hypot(w, h) / 2;
  for (let i = 0; i < 9; i++) {
    const off = (i / 8 - 0.5) * reach * 1.6 + (random() - 0.5) * 14 * u;
    const a0 = -reach * (0.55 + random() * 0.4);
    const a1 = reach * (0.5 + random() * 0.45);
    g.beginPath();
    g.moveTo(px * off + ax * a0, py * off + ay * a0);
    const mid = (a0 + a1) / 2;
    const wob = (random() - 0.5) * 10 * u;
    g.quadraticCurveTo(px * (off + wob) + ax * mid, py * (off + wob) + ay * mid, px * off + ax * a1, py * off + ay * a1);
    g.lineCap = 'round';
    g.lineWidth = (5 + random() * 9) * u;
    g.strokeStyle = `rgba(255,255,250,${(0.1 + random() * 0.12).toFixed(3)})`;
    g.stroke();
    g.lineWidth = 1.2 * u;
    g.strokeStyle = 'rgba(120,100,70,.08)';
    g.stroke();
  }
  g.restore();
}

export { INK, rgba, tone };
