/* 淘金 3D · 通用小工具 */
import * as THREE from 'three';

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const rnd = (a, b) => a + Math.random() * (b - a);
export const rndi = (a, b) => Math.floor(rnd(a, b + 1));
export const pick = arr => arr[Math.floor(Math.random() * arr.length)];
export const smooth = t => t * t * (3 - 2 * t);
export const easeOut = t => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
export const easeInOut = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
/* 帧率无关的指数逼近 */
export const damp = (cur, target, lambda, dt) => lerp(cur, target, 1 - Math.exp(-lambda * dt));
export const round2 = v => Math.round(v * 100) / 100;

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function cvs(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/* 画布 → 贴图。srgb=false 用于法线、粗糙度这类数据贴图 */
export function tex(c, o = {}) {
  const t = new THREE.CanvasTexture(c);
  if (o.srgb !== false) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (o.repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(o.repeat[0], o.repeat[1]);
  }
  return t;
}

/* 由灰度高度画布生成切线空间法线贴图（strength 越大越凹凸） */
export function normalFromHeight(src, strength = 2) {
  const w = src.width;
  const h = src.height;
  const d = src.getContext('2d').getImageData(0, 0, w, h).data;
  const out = cvs(w, h);
  const g = out.getContext('2d');
  const img = g.createImageData(w, h);
  const H = (x, y) => d[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * strength;
      const dy = (H(x, y + 1) - H(x, y - 1)) * strength;
      const l = Math.hypot(dx, dy, 1);
      const i = (y * w + x) * 4;
      img.data[i] = (-dx / l * 0.5 + 0.5) * 255;
      img.data[i + 1] = (-dy / l * 0.5 + 0.5) * 255;
      img.data[i + 2] = (1 / l * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return out;
}

/* 平滑的值噪声（可平铺），用来做沙、石、木纹的起伏 */
export function valueNoise(w, h, cells, seed = 1) {
  const r = mulberry32(seed);
  const grid = [];
  for (let j = 0; j < cells; j++) {
    grid.push([]);
    for (let i = 0; i < cells; i++) grid[j].push(r());
  }
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const gx = (x / w) * cells;
      const gy = (y / h) * cells;
      const i0 = Math.floor(gx);
      const j0 = Math.floor(gy);
      const fx = smooth(gx - i0);
      const fy = smooth(gy - j0);
      const a = grid[j0 % cells][i0 % cells];
      const b = grid[j0 % cells][(i0 + 1) % cells];
      const c = grid[(j0 + 1) % cells][i0 % cells];
      const e = grid[(j0 + 1) % cells][(i0 + 1) % cells];
      out[y * w + x] = lerp(lerp(a, b, fx), lerp(c, e, fx), fy);
    }
  }
  return out;
}
