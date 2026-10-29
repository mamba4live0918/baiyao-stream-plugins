/* 溅射轮廓：主体（谐波起伏 + 尖刺）、飞溅小点、向下挂的流痕。
   画法思路参考开源流体/飞溅（PavelDoGreat/WebGL-Fluid-Simulation 的软溅射，MIT），这里只做静态造型。 */
import { TAU } from '../util.js';
import { INK, smoothClosed, tone } from './ink.js';

const between = (random, [a, b]) => a + random() * (b - a);

export function makeSplat(random, o = {}) {
  const r = o.r ?? 100;
  const wobble = o.wobble ?? 0.22;
  const N = 56;
  const harm = [];
  for (let k = 2; k <= 7; k++) harm.push({ k, a: (random() - 0.35) * wobble / Math.pow(k, 0.55), p: random() * TAU });
  /* keep(x, y, rad)：这个位置（相对中心）能不能画东西；露脸区边上的落点用它把伸进脸里的部分去掉 */
  const keep = o.keep || (() => true);
  const spikes = [];
  const nSpikes = Math.round(between(random, o.spikes ?? [0, 0]));
  for (let i = 0; i < nSpikes; i++) {
    const sp = { at: random() * TAU, len: between(random, o.spikeLen ?? [0.25, 0.6]), wid: between(random, [0.06, 0.12]) };
    if (keep(Math.cos(sp.at) * r * (1 + sp.len), Math.sin(sp.at) * r * (1 + sp.len), r * 0.1)) spikes.push(sp);
  }
  const squash = o.squash ?? 1;
  const pts = [];
  for (let i = 0; i < N; i++) {
    const t = (i / N) * TAU;
    let k = 1;
    for (const h of harm) k += h.a * Math.sin(h.k * t + h.p);
    for (const s of spikes) {
      let d = t - s.at;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      k += s.len * Math.exp(-((d / s.wid) ** 2));
    }
    pts.push([Math.cos(t) * r * k, Math.sin(t) * r * k * squash]);
  }
  const sats = [];
  const nSats = Math.round(between(random, o.sats ?? [3, 7]));
  for (let i = 0; i < nSats; i++) {
    const a = random() * TAU;
    const d = r * between(random, o.satDist ?? [1.2, 1.9]);
    const sr = r * between(random, o.satSize ?? [0.05, 0.15]);
    const st = { x: Math.cos(a) * d, y: Math.sin(a) * d * squash, r: sr, rot: a, stretch: 1 + random() * 0.8 };
    if (keep(st.x, st.y, sr * st.stretch)) sats.push(st);
  }
  const drips = [];
  const nDrips = Math.round(between(random, o.drips ?? [0, 0]));
  for (let i = 0; i < nDrips; i++) {
    /* 从主体下半部分挂下来：找下半圈上的一个点 */
    const t = Math.PI * (0.18 + random() * 0.64);
    const idx = Math.round((t / TAU) * N) % N;
    const [px, py] = pts[idx];
    const dr = { x: px * 0.92, y: py * 0.86, len: r * between(random, o.dripLen ?? [0.4, 1.1]), w: r * between(random, o.dripW ?? [0.08, 0.15]) };
    /* 流到脸上的流痕：缩短到脸边之前，太短就不要了 */
    while (dr.len > r * 0.15 && !keep(dr.x, dr.y + dr.len + dr.w, dr.w)) dr.len *= 0.7;
    if (dr.len > r * 0.15) drips.push(dr);
  }
  let ext = r;
  for (const [x, y] of pts) ext = Math.max(ext, Math.hypot(x, y));
  for (const s of sats) ext = Math.max(ext, Math.hypot(s.x, s.y) + s.r * s.stretch);
  for (const d of drips) ext = Math.max(ext, Math.hypot(d.x, d.y + d.len + d.w));
  return { r, pts, sats, drips, ext };
}

/* 往下流的痕迹：上窄下宽、末端一颗圆珠。
   绕向必须和主体一致（屏幕上顺时针），否则 nonzero 填充时重叠处会被挖成洞。 */
export function dripPath(g, d, grow = 1) {
  const len = d.len * grow;
  const w = d.w;
  g.moveTo(d.x + w * 0.55, d.y);
  g.bezierCurveTo(d.x + w * 0.5, d.y + len * 0.5, d.x + w * 0.62, d.y + len * 0.8, d.x + w * 0.7, d.y + len);
  g.arc(d.x, d.y + len, w * 0.7, 0, Math.PI, false);
  g.bezierCurveTo(d.x - w * 0.62, d.y + len * 0.8, d.x - w * 0.5, d.y + len * 0.5, d.x - w * 0.55, d.y);
  g.closePath();
}

/* 整个溅射的路径（主体 + 小点 + 流痕，作为多个子路径，按 nonzero 合并） */
export function splatPath(g, s, { drips = true, sats = true, grow = 1 } = {}) {
  smoothClosed(g, s.pts);
  if (sats) {
    for (const t of s.sats) {
      g.moveTo(t.x + Math.cos(t.rot) * t.r * t.stretch, t.y + Math.sin(t.rot) * t.r * t.stretch);
      g.ellipse(t.x, t.y, t.r * t.stretch, t.r, t.rot, 0, TAU);
    }
  }
  if (drips) for (const d of s.drips) dripPath(g, d, grow);
}

/* 合并形状的卡通画法：先描两倍粗的边，再盖上填色（只剩外半圈描边，不会在重叠处画出内线），
   再在形状里铺右下月牙阴影。 */
export function drawUnion(g, build, fill, { line = 3, ink = INK, shade = -0.14, off = null } = {}) {
  const [dx, dy] = off || [line * 2 + 3, line * 2.4 + 3];
  g.save();
  g.lineJoin = 'round';
  g.lineCap = 'round';
  if (line > 0) {
    g.beginPath();
    build(g);
    g.lineWidth = line * 2;
    g.strokeStyle = ink;
    g.stroke();
  }
  g.beginPath();
  build(g);
  g.fillStyle = fill;
  g.fill('nonzero');
  if (shade) {
    /* 子路径会互相重叠（流痕压在主体上），evenodd 反向裁剪会在重叠处出错，所以用一张临时画布：
       先整块涂阴影色，再挖掉向左上错开的同一形状，剩下右下月牙，最后盖回去 */
    const m = g.getTransform();
    const t = document.createElement('canvas');
    t.width = g.canvas.width;
    t.height = g.canvas.height;
    const tg = t.getContext('2d');
    tg.setTransform(m);
    tg.beginPath();
    build(tg);
    tg.fillStyle = tone(fill, shade);
    tg.fill('nonzero');
    tg.globalCompositeOperation = 'destination-out';
    tg.translate(-dx, -dy);
    tg.beginPath();
    build(tg);
    tg.fill('nonzero');
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    g.drawImage(t, 0, 0);
    g.restore();
  }
  g.restore();
}
