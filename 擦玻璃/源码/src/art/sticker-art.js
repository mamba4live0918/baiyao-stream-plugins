/* 擦玻璃 · 主播上传的异形贴纸：裁掉透明的边、缩放到合适大小、按图案轮廓加一圈白色刀模边，
   再算几张粗格子（哪儿有图案、哪儿完全不透明），做成小广告系统认识的"版式"（design）——和不干胶小广告一样贴、一样揭、一样会撕烂。
   trimBounds / gridFromAlpha / gridInside / spanAlong / fullInside / distanceField 是纯函数（单测）；其余要用画布。 */
import { FONT, rr } from './ink.js';

/* 透明度高于这个才算有图案（软阴影那种很淡的不算） */
const SOLID = 24;
/* 透明度到这个才算完全不透明（盖得住底下的东西） */
const OPAQUE = 250;
/* 刀模白边从哪儿量起：透明度高于这个的才算剪影（头发丝、软阴影那种半透明的不算，白边才不会长毛刺） */
const SILHOUETTE = 96;
/* 太小的图先放大到这么大再剪白边（白边才圆滑） */
const MIN_SIDE = 192;

/* 图案实际占的范围（裁掉四周全透明的边）：返回 { x0, y0, x1, y1 }（x1、y1 不含），全透明返回 null */
export function trimBounds(alpha, w, h, threshold = SOLID) {
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      if (alpha[row + x] > threshold) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return x1 < 0 ? null : { x0, y0, x1: x1 + 1, y1: y1 + 1 };
}

/* 格子：n×m 格（贴纸画在玻璃上大约 3 像素一格）。
   - raw：格里有一点图案就算 1（看自己露没露出来用）；
   - cells：raw 再往外扩一格（点的时候边上好抓、不会因为一两个像素抓不到）；
   - full：格里每个像素都完全不透明（贴平了盖得住底下的东西） */
export function gridFromAlpha(alpha, w, h, n = 96, threshold = SOLID) {
  const m = Math.max(1, Math.round((n * h) / w));
  const raw = new Uint8Array(n * m);
  const total = new Uint32Array(n * m);
  const opaque = new Uint32Array(n * m);
  for (let y = 0; y < h; y++) {
    const gy = Math.min(m - 1, Math.floor((y * m) / h));
    const row = y * w;
    for (let x = 0; x < w; x++) {
      const i = gy * n + Math.min(n - 1, Math.floor((x * n) / w));
      const a = alpha[row + x];
      total[i]++;
      if (a > threshold) raw[i] = 1;
      if (a >= OPAQUE) opaque[i]++;
    }
  }
  const cells = new Uint8Array(n * m);
  const full = new Uint8Array(n * m);
  for (let gy = 0; gy < m; gy++) {
    for (let gx = 0; gx < n; gx++) {
      const i = gy * n + gx;
      full[i] = total[i] > 0 && opaque[i] === total[i] ? 1 : 0;
      let on = 0;
      for (let dy = -1; dy <= 1 && !on; dy++) {
        for (let dx = -1; dx <= 1 && !on; dx++) {
          const x = gx + dx;
          const y = gy + dy;
          if (x >= 0 && y >= 0 && x < n && y < m && raw[y * n + x]) on = 1;
        }
      }
      cells[i] = on;
    }
  }
  return { n, m, cells, raw, full };
}

/* 纸面局部坐标（中心为原点、宽 pw 高 ph）落在哪一格；纸外面返回 -1 */
function cellAt(grid, lx, ly, pw, ph) {
  const gx = Math.floor(((lx + pw / 2) / pw) * grid.n);
  const gy = Math.floor(((ly + ph / 2) / ph) * grid.m);
  return gx < 0 || gy < 0 || gx >= grid.n || gy >= grid.m ? -1 : gy * grid.n + gx;
}

/* 这一点有没有图案（扩过一格的，点的时候用） */
export function gridInside(grid, lx, ly, pw, ph) {
  const i = cellAt(grid, lx, ly, pw, ph);
  return i >= 0 && grid.cells[i] === 1;
}

/* 这一点有没有图案（没扩过的，看露没露出来用） */
export function rawInside(grid, lx, ly, pw, ph) {
  const i = cellAt(grid, lx, ly, pw, ph);
  return i >= 0 && grid.raw[i] === 1;
}

/* 这一点完全不透明（盖得住底下的） */
export function fullInside(grid, lx, ly, pw, ph) {
  const i = cellAt(grid, lx, ly, pw, ph);
  return i >= 0 && grid.full[i] === 1;
}

/* 图案沿撕的方向（单位向量 ax, ay）从哪儿到哪儿：[开头, 结尾]（纸面局部单位）。
   from：撕烂以后剩下的那截从 from 往后算——只看伸过 from 的格子，开头不早于 from。一格图案都没有返回 null */
export function spanAlong(grid, ax, ay, pw, ph, from = -Infinity) {
  const cw = pw / grid.n;
  const ch = ph / grid.m;
  const half = (Math.abs(ax) * cw + Math.abs(ay) * ch) / 2;
  let lo = Infinity;
  let hi = -Infinity;
  for (let gy = 0; gy < grid.m; gy++) {
    const cy = -ph / 2 + (gy + 0.5) * ch;
    for (let gx = 0; gx < grid.n; gx++) {
      if (!grid.raw[gy * grid.n + gx]) continue;
      const c = (-pw / 2 + (gx + 0.5) * cw) * ax + cy * ay;
      if (c + half <= from) continue;
      if (c - half < lo) lo = c - half;
      if (c + half > hi) hi = c + half;
    }
  }
  return hi < lo ? null : [Math.max(from, lo), hi];
}

/* 每个像素到最近的图案像素有多远（欧氏距离，像素）。solid[i] 为真的是图案。
   Felzenszwalb–Huttenlocher 一维平方距离变换，先按列再按行，O(像素数) */
export function distanceField(solid, w, h) {
  const INF = 1e20;
  const n = Math.max(w, h);
  const f = new Float64Array(n);
  const d = new Float64Array(n);
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);
  const sq = new Float64Array(w * h);
  for (let i = 0; i < w * h; i++) sq[i] = solid[i] ? 0 : INF;
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = sq[y * w + x];
    edt1d(f, h, d, v, z);
    for (let y = 0; y < h; y++) sq[y * w + x] = d[y];
  }
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) f[x] = sq[row + x];
    edt1d(f, w, d, v, z);
    for (let x = 0; x < w; x++) out[row + x] = Math.sqrt(d[x]);
  }
  return out;
}

/* 一维：d[q] = min over p of (q − p)² + f[p]（抛物线下包络） */
function edt1d(f, n, d, v, z) {
  let k = 0;
  v[0] = 0;
  z[0] = -Infinity;
  z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let p = v[k];
    let s = (f[q] + q * q - (f[p] + p * p)) / (2 * q - 2 * p);
    while (s <= z[k]) {
      k--;
      p = v[k];
      s = (f[q] + q * q - (f[p] + p * p)) / (2 * q - 2 * p);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    const p = v[k];
    d[q] = (q - p) * (q - p) + f[p];
  }
}

const mk = (w, h) => {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
};
const alphaOf = (c, g) => {
  const d = g.getImageData(0, 0, c.width, c.height).data;
  const a = new Uint8ClampedArray(c.width * c.height);
  for (let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3];
  return a;
};
const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);

/* 图片（Image / ImageBitmap / 画布）→ 裁掉透明边、最长边不超过 maxSide（太小的放大到 MIN_SIDE）的画布。全透明返回 null */
export function trimAndScale(img, maxSide = 512) {
  const w0 = img.naturalWidth || img.width;
  const h0 = img.naturalHeight || img.height;
  if (!w0 || !h0) return null;
  /* 先缩到 2 倍目标大小再找边（大图逐像素太慢） */
  const k0 = Math.min(1, (maxSide * 2) / Math.max(w0, h0));
  const a = mk(w0 * k0, h0 * k0);
  const ga = a.getContext('2d', { willReadFrequently: true });
  ga.drawImage(img, 0, 0, a.width, a.height);
  const b = trimBounds(alphaOf(a, ga), a.width, a.height);
  if (!b) return null;
  const bw = b.x1 - b.x0;
  const bh = b.y1 - b.y0;
  const long = Math.max(bw, bh);
  const k = long < MIN_SIDE ? MIN_SIDE / long : Math.min(1, maxSide / long);
  const out = mk(bw * k, bh * k);
  const go = out.getContext('2d');
  go.imageSmoothingQuality = 'high';
  go.drawImage(a, b.x0, b.y0, bw, bh, 0, 0, out.width, out.height);
  return out;
}

/* 刀模：按图案的轮廓往外扩一圈白边（外面再描一道很淡的灰线），图案盖在上面。
   白边按"到图案的距离"一个像素一个像素算出来：细线、小点、发丝旁边也是一整圈实心白边，不会漏洞、不会一道道的 */
export function dieCutCanvas(src) {
  const border = Math.max(4, Math.round(Math.max(src.width, src.height) * 0.045));
  const pad = border + 3;
  const w = src.width + pad * 2;
  const h = src.height + pad * 2;
  const sg = src.getContext('2d', { willReadFrequently: true });
  const sa = alphaOf(src, sg);
  const solid = new Uint8Array(w * h);
  for (let y = 0; y < src.height; y++) {
    const row = (y + pad) * w + pad;
    for (let x = 0; x < src.width; x++) if (sa[y * src.width + x] > SILHOUETTE) solid[row + x] = 1;
  }
  const dist = distanceField(solid, w, h);
  const out = mk(w, h);
  const g = out.getContext('2d', { willReadFrequently: true });
  const img = g.createImageData(w, h);
  const px = img.data;
  for (let i = 0; i < w * h; i++) {
    const d = dist[i];
    /* 白边（边缘一个像素的过渡）叠在淡灰描边上 */
    const aw = clamp01(border + 0.5 - d);
    const ao = 0.45 * clamp01(border + 2 - d);
    const a = aw + ao * (1 - aw);
    if (a <= 0) continue;
    const o = ao * (1 - aw);
    px[i * 4] = (255 * aw + 120 * o) / a;
    px[i * 4 + 1] = (255 * aw + 110 * o) / a;
    px[i * 4 + 2] = (255 * aw + 98 * o) / a;
    px[i * 4 + 3] = a * 255;
  }
  g.putImageData(img, 0, 0);
  g.drawImage(src, pad, pad);
  return { canvas: out, grid: gridFromAlpha(alphaOf(out, g), w, h) };
}

/* 小缩略图（设置面板里用） */
export function thumbOf(c, size = 72) {
  const k = size / Math.max(c.width, c.height);
  const t = mk(c.width * k, c.height * k);
  t.getContext('2d').drawImage(c, 0, 0, t.width, t.height);
  return t.toDataURL('image/png');
}

/* 名字签：贴纸右下角一个小白签，写"@名字"。返回 { hot：它占的范围 [x0, y0, x1, y1]（纸面局部坐标，留了一点余量；点它也能抓起贴纸）,
   core：里面一定实心的那块（去掉两头圆角和转了一点点的余量；它也盖得住底下的） } */
function namePill(g, k) {
  const fs = Math.max(11 * k.u, k.w * 0.075);
  g.save();
  g.font = `900 ${fs}px ${FONT}`;
  const tw = Math.min(g.measureText(k.at).width, k.w * 0.8);
  const ph = fs * 1.5;
  const pw = tw + fs * 1.1;
  const x = k.w / 2 - pw - k.w * 0.02;
  const y = k.h / 2 - ph - k.h * 0.02;
  g.translate(x + pw / 2, y + ph / 2);
  g.rotate(-0.06);
  g.beginPath();
  rr(g, -pw / 2, -ph / 2, pw, ph, ph / 2);
  g.fillStyle = '#fffdf6';
  g.fill();
  g.lineWidth = Math.max(1, 1.3 * k.u);
  g.strokeStyle = 'rgba(74,51,40,.55)';
  g.stroke();
  g.fillStyle = '#3b2f29';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(k.at, 0, fs * 0.04, tw);
  g.restore();
  const m = pw * 0.04 + 2 * k.u;
  const slack = pw * 0.035 + k.u;
  return { hot: [x - m, y - m, x + pw + m, y + ph + m], core: [x + ph / 2, y + slack, x + pw - ph / 2, y + ph - slack] };
}

/* 做成小广告系统认识的版式：像不干胶一样粘，纸面就是这张图（透明的地方没有纸） */
export function makeStickerDesign(id, die) {
  const c = die.canvas;
  const grid = die.grid;
  return {
    id: 'sticker:' + id,
    custom: true,
    aspect: c.height / c.width,
    stick: 'sticker',
    paper: { kind: 'custom' },
    back: '#f4f1ea',
    /* 返回名字签占的范围（hot：点它也算点到贴纸；core：它实心的那块也盖得住底下的） */
    draw(g, k) {
      g.drawImage(c, -k.w / 2, -k.h / 2, k.w, k.h);
      return namePill(g, k);
    },
    /* 纸面局部坐标上有没有图案（点透明的地方抓不到它，底下的照样能刮；边上宽一格好抓） */
    inside: (lx, ly, pw, ph) => gridInside(grid, lx, ly, pw, ph),
    /* 这一点看得见图案（不放宽：整张被盖住没有，按它取点） */
    shows: (lx, ly, pw, ph) => rawInside(grid, lx, ly, pw, ph),
    /* 图案沿撕的方向从哪儿到哪儿（翘起的角从图案的边开始，不从透明的外框角开始） */
    span: (ax, ay, pw, ph, from) => spanAlong(grid, ax, ay, pw, ph, from),
    /* 贴平了盖得住底下的地方：完全不透明的格子，再往里让两个原图像素（缩放时边上会糊一点） */
    covers(lx, ly, pw, ph) {
      const e = (2 * pw) / c.width;
      return fullInside(grid, lx - e, ly - e, pw, ph) && fullInside(grid, lx + e, ly - e, pw, ph) && fullInside(grid, lx - e, ly + e, pw, ph) && fullInside(grid, lx + e, ly + e, pw, ph);
    }
  };
}
