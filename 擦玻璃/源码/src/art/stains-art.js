/* 玻璃上的各种脏东西（扁平卡通）。每个函数返回 { canvas, w, h }：w/h 是上屏像素尺寸，画布按 res 倍画。
   液体：同色系深一档描边 + 右下月牙阴影 + 左上弧形高光（看起来是贴在玻璃上的一滩）。 */
import { INK, canvas, shine, arcShine, smoothClosed, tone } from './ink.js';
import { makeSplat, splatPath, drawUnion } from './splat.js';
import { TAU } from '../util.js';

/* 画布边长上限：大块的脏东西按比例降低分辨率画（贴图放大一点点看不出来，显存省很多） */
export const ART_MAX = 640;

function board(ext, res, pad) {
  const size = Math.ceil((ext + pad) * 2);
  res = Math.min(res, ART_MAX / size);
  const { c, g } = canvas(size * res, size * res);
  g.scale(res, res);
  g.translate(size / 2, size / 2);
  return { c, g, size };
}

function clipTo(g, s, fn) {
  g.save();
  g.beginPath();
  splatPath(g, s);
  g.clip('nonzero');
  fn();
  g.restore();
}

function liquidShine(g, r, u, a = 0.85) {
  arcShine(g, 0, 0, r * 0.64, Math.PI * 1.08, Math.PI * 1.4, 5.5 * u, a);
  shine(g, -r * 0.5, -r * 0.08, 4.2 * u, 3 * u, -0.5, a);
  shine(g, r * 0.12, -r * 0.62, 3 * u, 2.2 * u, -0.3, a * 0.8);
}

/* 泥巴：深棕主团、更深的斑块、浅色泥星、飞溅泥点、一两条短流痕 */
export function artMud(random, r, u, res = 1, keep = null) {
  const s = makeSplat(random, { keep, r, wobble: 0.18, spikes: [7, 12], spikeLen: [0.16, 0.5], sats: [12, 20], satDist: [1.1, 2.4], satSize: [0.04, 0.14], drips: [2, 4], dripLen: [0.35, 1.0], dripW: [0.08, 0.13] });
  const { c, g, size } = board(s.ext, res, 10 * u);
  drawUnion(g, p => splatPath(p, s), '#8b5a34', { line: 3.2 * u, ink: INK, shade: -0.2 });
  clipTo(g, s, () => {
    for (let i = 0; i < 7; i++) {
      const a = random() * TAU;
      const d = random() * r * 0.7;
      g.beginPath();
      g.ellipse(Math.cos(a) * d, Math.sin(a) * d, r * (0.1 + random() * 0.14), r * (0.07 + random() * 0.1), random() * TAU, 0, TAU);
      g.fillStyle = 'rgba(104,64,36,.85)';
      g.fill();
    }
    for (let i = 0; i < 9; i++) {
      const a = random() * TAU;
      const d = random() * r * 0.8;
      g.beginPath();
      g.arc(Math.cos(a) * d, Math.sin(a) * d, (2.4 + random() * 2.6) * u, 0, TAU);
      g.fillStyle = 'rgba(178,128,82,.9)';
      g.fill();
    }
  });
  liquidShine(g, r, u, 0.7);
  return { canvas: c, w: size, h: size };
}

/* 蛋清：半透明的米白一滩 + 粘在边上的蛋壳碎片（蛋黄是单独会往下滑的一块） */
export function artEggWhite(random, r, u, res = 1, keep = null) {
  const s = makeSplat(random, { keep, r, wobble: 0.3, spikes: [2, 4], spikeLen: [0.18, 0.42], sats: [5, 9], satDist: [1.1, 1.9], satSize: [0.05, 0.12], drips: [1, 3], dripLen: [0.35, 0.9], dripW: [0.07, 0.12] });
  const { c, g, size } = board(s.ext + r * 0.15, res, 10 * u);
  drawUnion(g, p => splatPath(p, s), '#fffaf0', { line: 3 * u, ink: '#c9b99b', shade: -0.07 });
  clipTo(g, s, () => {
    g.beginPath();
    g.arc(r * 0.06, r * 0.06, r * 0.62, 0, TAU);
    g.fillStyle = 'rgba(255,246,222,.9)';
    g.fill();
  });
  liquidShine(g, r, u, 0.95);
  /* 蛋壳碎片 */
  const n = 2 + Math.floor(random() * 3);
  for (let i = 0; i < n; i++) {
    const a = random() * TAU;
    const d = r * (0.7 + random() * 0.35);
    shard(g, Math.cos(a) * d, Math.sin(a) * d, r * (0.13 + random() * 0.09), random() * TAU, u, random);
  }
  return { canvas: c, w: size, h: size };
}

function shard(g, x, y, k, rot, u, random) {
  const pts = [];
  const m = 5 + Math.floor(random() * 3);
  for (let i = 0; i < m; i++) {
    const a = (i / m) * TAU;
    const rr = k * (0.6 + random() * 0.55);
    pts.push([Math.cos(a) * rr, Math.sin(a) * rr * 0.75]);
  }
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (const p of pts.slice(1)) g.lineTo(p[0], p[1]);
  g.closePath();
  g.fillStyle = '#f8e8c8';
  g.fill();
  g.lineWidth = 2.6 * u;
  g.strokeStyle = INK;
  g.lineJoin = 'round';
  g.stroke();
  g.beginPath();
  g.moveTo(pts[1][0] * 0.5, pts[1][1] * 0.5);
  g.lineTo(pts[3][0] * 0.5, pts[3][1] * 0.5);
  g.lineWidth = 2 * u;
  g.strokeStyle = 'rgba(255,255,255,.9)';
  g.stroke();
  g.restore();
}

/* 蛋黄：亮黄圆团、橙色阴影、大高光 */
export function artYolk(r, u, res = 1) {
  const { c, g, size } = board(r, res, 8 * u);
  g.beginPath();
  g.arc(0, 0, r, 0, TAU);
  g.fillStyle = '#ffc53d';
  g.fill();
  g.save();
  g.clip();
  g.beginPath();
  g.arc(r * 0.3, r * 0.34, r * 0.92, 0, TAU);
  g.fillStyle = '#f39b1c';
  g.fill();
  g.beginPath();
  g.arc(-r * 0.05, -r * 0.05, r * 0.86, 0, TAU);
  g.fillStyle = '#ffc53d';
  g.fill();
  g.restore();
  g.beginPath();
  g.arc(0, 0, r, 0, TAU);
  g.lineWidth = 3 * u;
  g.strokeStyle = '#c4701a';
  g.stroke();
  shine(g, -r * 0.34, -r * 0.36, r * 0.3, r * 0.18, -0.6, 0.95);
  shine(g, r * 0.4, -r * 0.1, r * 0.08, r * 0.08, 0, 0.9);
  return { canvas: c, w: size, h: size };
}

/* 往下流的痕迹画布（蛋黄、茶水滑下来时边走边画）：宽 w、高 h，从上往下画 */
export function trailBoard(w, h, res = 1) {
  const { c, g } = canvas(w * res, h * res);
  return { canvas: c, w, h, g };
}

/* 奶茶：奶茶色大溅射（尖刺多）、飞溅点、几条长流痕、浅色奶纹 */
export function artTea(random, r, u, res = 1, keep = null) {
  const s = makeSplat(random, { keep, r, wobble: 0.32, spikes: [5, 9], spikeLen: [0.3, 0.85], sats: [12, 20], satDist: [1.15, 2.4], satSize: [0.04, 0.11], drips: [3, 6], dripLen: [0.5, 1.3], dripW: [0.07, 0.11] });
  const { c, g, size } = board(s.ext, res, 10 * u);
  drawUnion(g, p => splatPath(p, s), '#c48d58', { line: 3 * u, ink: '#7d4f2b', shade: -0.13 });
  clipTo(g, s, () => {
    g.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      const a = random() * TAU;
      g.beginPath();
      g.arc(r * 0.1, r * 0.05, r * (0.25 + i * 0.13), a, a + 0.9 + random() * 0.8);
      g.lineWidth = (4 + random() * 4) * u;
      g.strokeStyle = 'rgba(236,200,158,.8)';
      g.stroke();
    }
  });
  liquidShine(g, r, u, 0.9);
  return { canvas: c, w: size, h: size, splat: s };
}

/* 鸟屎：白色一坨、灰绿芯、几颗深色点、短流痕 */
export function artPoop(random, r, u, res = 1, keep = null) {
  const s = makeSplat(random, { keep, r, wobble: 0.3, spikes: [2, 4], spikeLen: [0.25, 0.5], sats: [3, 6], satDist: [1.15, 1.6], satSize: [0.06, 0.14], drips: [1, 2], dripLen: [0.4, 0.9], dripW: [0.1, 0.15] });
  const { c, g, size } = board(s.ext, res, 10 * u);
  drawUnion(g, p => splatPath(p, s), '#f7f6ee', { line: 3 * u, ink: '#a9a58c', shade: -0.07 });
  const core = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU;
    const rr = r * 0.42 * (0.8 + random() * 0.4);
    core.push([Math.cos(a) * rr + r * 0.06, Math.sin(a) * rr * 0.85 + r * 0.04]);
  }
  g.beginPath();
  smoothClosed(g, core);
  g.fillStyle = '#a7ad86';
  g.fill();
  for (let i = 0; i < 5; i++) {
    g.beginPath();
    g.arc((random() - 0.5) * r * 0.6, (random() - 0.5) * r * 0.5, (2.4 + random() * 1.8) * u, 0, TAU);
    g.fillStyle = '#4f5a3c';
    g.fill();
  }
  liquidShine(g, r, u, 0.9);
  return { canvas: c, w: size, h: size };
}

/* 猫的泥脚印：掌垫 + 四颗趾豆 */
export function artPaw(random, s, u, res = 1) {
  const { c, g, size } = board(s * 0.9, res, 6 * u);
  const col = '#7a4f2f';
  g.save();
  g.beginPath();
  g.ellipse(0, s * 0.22, s * 0.42, s * 0.33, 0, 0, TAU);
  for (const [x, y, k] of [[-0.42, -0.2, 0.17], [-0.15, -0.42, 0.18], [0.15, -0.42, 0.18], [0.42, -0.2, 0.17]]) {
    g.moveTo(x * s + k * s, y * s);
    g.ellipse(x * s, y * s, k * s, k * s * 1.18, 0, 0, TAU);
  }
  g.lineWidth = 2.4 * u * 2;
  g.strokeStyle = INK;
  g.stroke();
  g.fillStyle = col;
  g.fill();
  g.restore();
  g.fillStyle = 'rgba(160,110,70,.9)';
  g.beginPath();
  g.ellipse(s * 0.08, s * 0.3, s * 0.22, s * 0.13, 0, 0, TAU);
  g.fill();
  shine(g, -s * 0.18, s * 0.08, 3 * u, 2.2 * u, -0.5, 0.7);
  return { canvas: c, w: size, h: size };
}

/* 透明胶带残胶：米白半透明小条、撕口参差 */
export function artTape(random, w, h, u, res = 1) {
  const { c, g } = canvas((w + 8) * res, (h + 8) * res);
  g.scale(res, res);
  g.translate((w + 8) / 2, (h + 8) / 2);
  g.beginPath();
  g.moveTo(-w / 2, -h / 2);
  for (let i = 1; i <= 5; i++) g.lineTo(-w / 2 + (w * i) / 5, -h / 2 + (i % 2 ? 2.5 : -1.5) * u);
  for (let i = 1; i <= 4; i++) g.lineTo(w / 2 + (i % 2 ? -3 : 1) * u, -h / 2 + (h * i) / 4);
  for (let i = 1; i <= 5; i++) g.lineTo(w / 2 - (w * i) / 5, h / 2 + (i % 2 ? -2 : 1.5) * u);
  for (let i = 1; i <= 4; i++) g.lineTo(-w / 2 + (i % 2 ? 3 : -1) * u, h / 2 - (h * i) / 4);
  g.closePath();
  g.fillStyle = '#ece4cf';
  g.fill();
  g.lineWidth = 2 * u;
  g.strokeStyle = 'rgba(176,160,128,.9)';
  g.stroke();
  g.strokeStyle = 'rgba(255,255,255,.75)';
  g.lineWidth = 1.6 * u;
  for (let i = 0; i < 3; i++) {
    const y = -h * 0.25 + i * h * 0.25;
    g.beginPath();
    g.moveTo(-w * 0.38, y);
    g.lineTo(w * 0.38, y + (random() - 0.5) * 2 * u);
    g.stroke();
  }
  return { canvas: c, w: w + 8, h: h + 8 };
}

/* 平时落的灰：一团淡淡的灰雾 + 灰点 + 一两个干掉的水渍圈（细节都不小于 4 像素，不闪） */
export function artDust(random, size, u, res = 1) {
  const { c, g } = canvas(size * res, size * res);
  g.scale(res, res);
  g.translate(size / 2, size / 2);
  const R = size / 2 - 4 * u;
  for (let i = 0; i < 2; i++) {
    const x = (random() - 0.5) * R * 0.5;
    const y = (random() - 0.5) * R * 0.5;
    const gr = g.createRadialGradient(x, y, 2, x, y, R * (0.7 + random() * 0.3));
    gr.addColorStop(0, 'rgba(176,168,152,.42)');
    gr.addColorStop(1, 'rgba(176,168,152,0)');
    g.fillStyle = gr;
    g.fillRect(-size / 2, -size / 2, size, size);
  }
  const n = 14 + Math.floor(random() * 12);
  for (let i = 0; i < n; i++) {
    const a = random() * TAU;
    const d = Math.sqrt(random()) * R * 0.85;
    g.beginPath();
    g.arc(Math.cos(a) * d, Math.sin(a) * d, (2.2 + random() * 2.8) * u, 0, TAU);
    g.fillStyle = random() < 0.5 ? 'rgba(150,142,128,.9)' : 'rgba(186,178,164,.9)';
    g.fill();
  }
  const rings = Math.floor(random() * 3);
  for (let i = 0; i < rings; i++) {
    const a = random() * TAU;
    const d = random() * R * 0.6;
    const rr = (9 + random() * 8) * u;
    g.beginPath();
    g.arc(Math.cos(a) * d, Math.sin(a) * d, rr, 0, TAU);
    g.fillStyle = 'rgba(235,242,245,.45)';
    g.fill();
    g.lineWidth = 2.6 * u;
    g.strokeStyle = 'rgba(178,190,196,.9)';
    g.stroke();
  }
  return { canvas: c, w: size, h: size };
}

/* 哈气：一团软软的白雾 + 凝结的小水珠（静态，不闪）。字由 actor 之后镂空。
   雾团都收在画布里面，边缘不会被画布切出直线。 */
export function artFog(random, R, u, res = 1) {
  const w = R * 2.8;
  const h = R * 2.0;
  res = Math.min(res, ART_MAX / w);
  const { c, g } = canvas(w * res, h * res);
  g.scale(res, res);
  g.translate(w / 2, h / 2);
  const blobs = [];
  for (let i = 0; i < 13; i++) {
    const a = (i / 13) * TAU + random() * 0.4;
    const d = i === 0 ? 0 : R * (0.25 + random() * 0.32);
    blobs.push({ x: Math.cos(a) * d * 1.5, y: Math.sin(a) * d * 0.75, r: R * (0.42 + random() * 0.18) });
  }
  for (const b of blobs) {
    const gr = g.createRadialGradient(b.x, b.y, b.r * 0.12, b.x, b.y, b.r);
    gr.addColorStop(0, 'rgba(244,249,252,.6)');
    gr.addColorStop(0.65, 'rgba(244,249,252,.34)');
    gr.addColorStop(1, 'rgba(244,249,252,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.arc(b.x, b.y, b.r, 0, TAU);
    g.fill();
  }
  /* 凝结水珠：只放在雾浓的地方（离雾团中心近） */
  const beads = 110 + Math.floor(random() * 50);
  for (let i = 0; i < beads; i++) {
    const b = blobs[Math.floor(random() * blobs.length)];
    const a = random() * TAU;
    const d = Math.sqrt(random()) * b.r * 0.75;
    const x = b.x + Math.cos(a) * d;
    const y = b.y + Math.sin(a) * d;
    const rr = (2 + random() * 2.6) * u;
    g.beginPath();
    g.arc(x, y + rr * 0.35, rr, 0, TAU);
    g.fillStyle = 'rgba(150,180,196,.26)';
    g.fill();
    g.beginPath();
    g.arc(x, y, rr, 0, TAU);
    g.fillStyle = 'rgba(255,255,255,.6)';
    g.fill();
  }
  return { canvas: c, w, h };
}

export const STAIN_COLORS = Object.freeze({ yolkTrail: '#ffcf55', teaTrail: '#c99662', mud: '#8b5a34' });
export { tone };

/* 撕掉小广告后留下的一小块浆糊印：半透明、发黄、边上亮一点 */
export function artGlue(random, w, h, u, res = 1) {
  const { c, g } = canvas((w + 8) * res, (h + 8) * res);
  g.scale(res, res);
  g.translate((w + 8) / 2, (h + 8) / 2);
  const pts = [];
  const n = 11;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = 0.72 + random() * 0.28;
    pts.push([Math.cos(a) * (w / 2) * k, Math.sin(a) * (h / 2) * k]);
  }
  g.beginPath();
  smoothClosed(g, pts);
  g.fillStyle = 'rgba(240,228,190,.62)';
  g.fill();
  g.lineWidth = 1.6 * u;
  g.strokeStyle = 'rgba(196,176,120,.55)';
  g.stroke();
  g.strokeStyle = 'rgba(255,255,255,.7)';
  g.lineWidth = 1.4 * u;
  for (let i = 0; i < 3; i++) {
    const y = (i - 1) * h * 0.2;
    g.beginPath();
    g.moveTo(-w * 0.3, y);
    g.quadraticCurveTo(0, y + (random() - 0.5) * 4 * u, w * 0.28, y + (random() - 0.5) * 3 * u);
    g.stroke();
  }
  return { canvas: c, w: w + 8, h: h + 8 };
}
