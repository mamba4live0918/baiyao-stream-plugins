/* 淘金 · 簸箕版 · 程序生成的贴图：竹编、沙粒、粗麻布、石头、水波、泥土、草、釉面 */
import { cvs, tex, normalFromHeight, valueNoise, mulberry32 } from '../util.js';

/* 沙粒：接近白色的细粒，颜色交给顶点色（干湿、深浅） */
export function sandMaps(size = 512) {
  const c = cvs(size, size);
  const g = c.getContext('2d');
  const r = mulberry32(11);
  g.fillStyle = '#f2ede4';
  g.fillRect(0, 0, size, size);
  const n = valueNoise(size, size, 16, 4);
  const img = g.getImageData(0, 0, size, size);
  for (let i = 0; i < size * size; i++) {
    const k = 0.9 + n[i] * 0.12;
    img.data[i * 4] *= k;
    img.data[i * 4 + 1] *= k;
    img.data[i * 4 + 2] *= k;
  }
  g.putImageData(img, 0, 0);
  for (let i = 0; i < 26000; i++) {
    const v = r();
    g.fillStyle = v < 0.45 ? `rgba(120,96,64,${0.18 + r() * 0.3})` : v < 0.9 ? `rgba(255,250,240,${0.3 + r() * 0.4})` : `rgba(60,52,44,${0.3 + r() * 0.4})`;
    const s = 0.8 + r() * 1.8;
    g.fillRect(r() * size, r() * size, s, s);
  }
  /* 高度：细粒 + 小波纹，用来生成法线 */
  const hc = cvs(size, size);
  const hg = hc.getContext('2d');
  const hn = valueNoise(size, size, 32, 9);
  const himg = hg.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const v = (hn[i] * 0.55 + r() * 0.45) * 255;
    himg.data[i * 4] = himg.data[i * 4 + 1] = himg.data[i * 4 + 2] = v;
    himg.data[i * 4 + 3] = 255;
  }
  hg.putImageData(himg, 0, 0);
  return {
    map: tex(c, { repeat: [7, 2.6] }),
    normal: tex(normalFromHeight(hc, 2.4), { repeat: [7, 2.6], srgb: false })
  };
}

/* 粗麻布：经纬交织 */
export function burlapTex(size = 256) {
  const c = cvs(size, size);
  const g = c.getContext('2d');
  const r = mulberry32(5);
  g.fillStyle = '#c7a06a';
  g.fillRect(0, 0, size, size);
  for (let y = 0; y < size; y += 4) {
    g.fillStyle = `rgba(110,74,34,${0.18 + r() * 0.12})`;
    g.fillRect(0, y, size, 1.4);
  }
  for (let x = 0; x < size; x += 4) {
    g.fillStyle = `rgba(255,230,180,${0.12 + r() * 0.1})`;
    g.fillRect(x, 0, 1.4, size);
  }
  for (let i = 0; i < 1600; i++) {
    g.fillStyle = `rgba(90,60,26,${r() * 0.18})`;
    g.fillRect(r() * size, r() * size, 2, 2);
  }
  return tex(c, { repeat: [2, 2] });
}

/* 水面法线：两层噪声，流动时平移 offset */
export function waterNormal(size = 256) {
  const hc = cvs(size, size);
  const g = hc.getContext('2d');
  const a = valueNoise(size, size, 12, 21);
  const b = valueNoise(size, size, 28, 22);
  const img = g.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const v = (a[i] * 0.6 + b[i] * 0.4) * 255;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return tex(normalFromHeight(hc, 3.2), { repeat: [6, 1.2], srgb: false });
}

/* 柔和圆点（尘土、水雾、闪光的底） */
export function dotTex(size = 128) {
  const c = cvs(size, size);
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.45, 'rgba(255,255,255,.55)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, size, size);
  return tex(c);
}

/* 四角星闪光 */
export function starTex(size = 128) {
  const c = cvs(size, size);
  const g = c.getContext('2d');
  const m = size / 2;
  const gr = g.createRadialGradient(m, m, 0, m, m, m);
  gr.addColorStop(0, 'rgba(255,255,240,1)');
  gr.addColorStop(0.2, 'rgba(255,236,160,.6)');
  gr.addColorStop(1, 'rgba(255,220,120,0)');
  g.fillStyle = gr;
  g.beginPath();
  g.arc(m, m, m * 0.5, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,.95)';
  g.beginPath();
  g.moveTo(m, 2);
  g.quadraticCurveTo(m + size * 0.05, m - size * 0.05, size - 2, m);
  g.quadraticCurveTo(m + size * 0.05, m + size * 0.05, m, size - 2);
  g.quadraticCurveTo(m - size * 0.05, m + size * 0.05, 2, m);
  g.quadraticCurveTo(m - size * 0.05, m - size * 0.05, m, 2);
  g.fill();
  return tex(c);
}

/* 竹编：横竖两层竹篾一上一下交错，篾片中间亮、两边暗，带细纤维纹；同时给一张高度图做凹凸 */
export function weaveTex(size = 1024, n = 12) {
  const c = cvs(size, size);
  const hc = cvs(size, size);
  const g = c.getContext('2d');
  const hg = hc.getContext('2d');
  const r = mulberry32(31);
  const pitch = size / n;
  const sw = pitch * 0.84;
  g.fillStyle = '#4a2f17';
  g.fillRect(0, 0, size, size);
  hg.fillStyle = '#000';
  hg.fillRect(0, 0, size, size);
  const tone = { h: [], v: [] };
  for (let i = 0; i < n; i++) {
    tone.h.push(0.86 + r() * 0.24);
    tone.v.push(0.84 + r() * 0.24);
  }
  /* 画一段篾片：horizontal 决定方向，k 是这根篾的明暗，top 表示压在上面 */
  function strip(x, y, w, h, horizontal, k, top) {
    const across = horizontal ? g.createLinearGradient(0, y, 0, y + h) : g.createLinearGradient(x, 0, x + w, 0);
    const base = [217 * k, 176 * k, 116 * k];
    const dark = base.map(v => v * 0.68);
    const lit = base.map(v => Math.min(255, v * 1.12));
    const col = a => `rgb(${a[0] | 0},${a[1] | 0},${a[2] | 0})`;
    across.addColorStop(0, col(dark));
    across.addColorStop(0.3, col(lit));
    across.addColorStop(0.7, col(base));
    across.addColorStop(1, col(dark));
    g.fillStyle = across;
    g.fillRect(x, y, w, h);
    /* 钻到下面的两头压暗 */
    const along = horizontal ? g.createLinearGradient(x, 0, x + w, 0) : g.createLinearGradient(0, y, 0, y + h);
    along.addColorStop(0, top ? 'rgba(40,22,6,.35)' : 'rgba(40,22,6,.55)');
    along.addColorStop(0.22, 'rgba(40,22,6,0)');
    along.addColorStop(0.78, 'rgba(40,22,6,0)');
    along.addColorStop(1, top ? 'rgba(40,22,6,.35)' : 'rgba(40,22,6,.55)');
    g.fillStyle = along;
    g.fillRect(x, y, w, h);
    /* 纤维 */
    g.strokeStyle = 'rgba(110,70,28,.22)';
    g.lineWidth = 1;
    for (let f = 0; f < 7; f++) {
      g.beginPath();
      if (horizontal) {
        const yy = y + 3 + r() * (h - 6);
        g.moveTo(x, yy);
        g.lineTo(x + w, yy + (r() - 0.5) * 2);
      } else {
        const xx = x + 3 + r() * (w - 6);
        g.moveTo(xx, y);
        g.lineTo(xx + (r() - 0.5) * 2, y + h);
      }
      g.stroke();
    }
    /* 高度：压在上面的鼓起来 */
    const hgrad = horizontal ? hg.createLinearGradient(0, y, 0, y + h) : hg.createLinearGradient(x, 0, x + w, 0);
    const peak = top ? 255 : 150;
    hgrad.addColorStop(0, `rgb(${peak * 0.35 | 0},${peak * 0.35 | 0},${peak * 0.35 | 0})`);
    hgrad.addColorStop(0.5, `rgb(${peak},${peak},${peak})`);
    hgrad.addColorStop(1, `rgb(${peak * 0.35 | 0},${peak * 0.35 | 0},${peak * 0.35 | 0})`);
    hg.fillStyle = hgrad;
    hg.fillRect(x, y, w, h);
  }
  const off = (pitch - sw) / 2;
  for (let a = 0; a < n; a++) {
    for (let b = 0; b < n; b++) {
      const x = b * pitch;
      const y = a * pitch;
      const hTop = (a + b) % 2 === 0;
      const H = () => strip(x, y + off, pitch, sw, true, tone.h[a], hTop);
      const V = () => strip(x + off, y, sw, pitch, false, tone.v[b], !hTop);
      if (hTop) {
        V();
        H();
      } else {
        H();
        V();
      }
    }
  }
  for (let i = 0; i < 3000; i++) {
    g.fillStyle = `rgba(70,40,12,${r() * 0.08})`;
    g.fillRect(r() * size, r() * size, 2, 1);
  }
  return { map: c, height: hc };
}

/* 包边：竹皮一圈圈斜着缠 */
export function bindingTex(w = 512, h = 64) {
  const c = cvs(w, h);
  const g = c.getContext('2d');
  g.fillStyle = '#c99a5a';
  g.fillRect(0, 0, w, h);
  for (let x = -h; x < w + h; x += 18) {
    const grad = g.createLinearGradient(x, 0, x + 14, 0);
    grad.addColorStop(0, '#8f6230');
    grad.addColorStop(0.5, '#e7c288');
    grad.addColorStop(1, '#a8743c');
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(x, h);
    g.lineTo(x + 14, h);
    g.lineTo(x + 14 + h * 0.5, 0);
    g.lineTo(x + h * 0.5, 0);
    g.closePath();
    g.fill();
  }
  return c;
}

