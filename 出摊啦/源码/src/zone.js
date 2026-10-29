/* 擦玻璃 · 露脸区几何（纯函数）：一个多边形。
   设置里存 { enabled, pts: [[x, y], ...], feather }：每个点是占画面宽、高的百分比，3–24 个点按顺序连成一圈；feather 羽化像素（按 1080p）。
   这里换算成像素，提供：带符号距离（区内为负）、点/物体是否压到区、在区外找出生点、往脸边砸东西的落点、
   三个预设形状、旧存档（椭圆/圆角框）换成多边形。
   画面上的遮罩不在着色器里逐像素算多边形，而是画成一张小贴图（glass/zone-mask.js），着色器里只取一次样。 */
import { clamp } from './util.js';

export const ZONE_MIN_PTS = 3;
export const ZONE_MAX_PTS = 24;
export const ZONE_FEATHER = 36;

const r1 = v => Math.round(v * 10) / 10;
const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const finite = v => typeof v === 'number' && Number.isFinite(v);

/* 一圈椭圆上的点（相对中心的偏移），从正上方开始顺时针 */
function ring(hw, hh, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    out.push([r1(Math.sin(a) * hw), r1(-Math.cos(a) * hh)]);
  }
  return out;
}

/* 一圈椭圆上的点（百分比） */
export function ellipsePts(cx, cy, hw, hh, n = 12) {
  return ring(hw, hh, n).map(([x, y]) => [r1(clamp(cx + x, 0, 100)), r1(clamp(cy + y, 0, 100))]);
}

/* 预设形状：相对"脸的中心"的偏移（按 16:9 横屏的百分比写的），top = 头顶在中心上面多少。
   摆到别的比例的画面上时按短边换算（见 placePreset），竖屏、带鱼屏上形状不变形 */
const PRESETS = {
  face: { top: 15, pts: ring(8, 15, 12) },
  shoulder: {
    top: 15,
    pts: [[0, -15], [5.5, -11.5], [8.4, -2.6], [7.4, 7.5], [9, 13], [18, 18], [22, 26], [-22, 26], [-18, 18], [-9, 13], [-7.4, 7.5], [-8.4, -2.6], [-5.5, -11.5]]
  },
  half: {
    top: 17,
    pts: [[0, -17], [6.2, -13], [9.4, -3], [8.4, 8.5], [10, 14], [21, 20], [27, 32], [28, 70], [-28, 70], [-27, 32], [-21, 20], [-10, 14], [-8.4, 8.5], [-9.4, -3], [-6.2, -13]]
  }
};
/* 设置面板和编辑层里的三个按钮 */
export const ZONE_PRESETS = Object.freeze([['只露脸', 'face'], ['露到肩', 'shoulder'], ['露半身', 'half']]);

/* 预设形状摆到画面上：cx 左右中心、top 头顶（百分比），aspect = 画面宽 / 高。
   表里的偏移是 16:9 横屏的百分比；先换成"短边的百分比"，再按这块画面的宽、高换回百分比 */
const WIDE = 16 / 9;
function placePreset(kind, cx, top, aspect = WIDE) {
  const p = PRESETS[kind] || PRESETS.face;
  const a = finite(aspect) && aspect > 0 ? aspect : WIDE;
  const fx = WIDE * Math.min(1, 1 / a);
  const fy = Math.min(1, a);
  const cy = top + p.top * fy;
  return p.pts.map(([x, y]) => [r1(clamp(cx + x * fx, 0, 100)), r1(clamp(cy + y * fy, 0, 100))]);
}

/* 默认头顶在哪（占画面高度的百分比）：假设半身皮套站在画面底部、高度是短边的 0.958 倍，脸顶在皮套高度的 14.4% 处。
   横屏（短边是高）= 18%；竖屏（短边是宽）皮套撑满宽度站在下面，脸大概在画面中间 */
const defaultTop = aspect => 100 - 82 * Math.min(1, finite(aspect) && aspect > 0 ? aspect : WIDE);

/* 换成预设形状：左右居中对齐、头顶对齐现在这个框的顶上（换完脸还在原地） */
export function presetPts(kind, pts, aspect = WIDE) {
  if (!Array.isArray(pts) || pts.length < ZONE_MIN_PTS) return placePreset(kind, 50, defaultTop(aspect), aspect);
  const xs = pts.map(q => q[0]);
  return placePreset(kind, (Math.min(...xs) + Math.max(...xs)) / 2, Math.min(...pts.map(q => q[1])), aspect);
}

/* 默认只框住脸：画面中上部（半身皮套的脸），四周可以被脏东西糊满，"只剩一张脸"。
   auto = 还是出厂的默认框（没人动过）：画面换成别的比例时按新比例重新摆，不被拉变形 */
export function defaultZone(aspect = WIDE) {
  return { enabled: true, pts: placePreset('face', 50, defaultTop(aspect), aspect), feather: ZONE_FEATHER, auto: true };
}

const samePts = (a, b) => a.length === b.length && a.every((p, i) => p[0] === b[i][0] && p[1] === b[i][1]);

/* ---------- 旧存档（第 6 版及以前：椭圆/圆角框 {x, y, w, h, round}）→ 多边形 ---------- */
const OLD_DEFAULTS = [
  { x: 50, y: 34, w: 26, h: 40 },
  { x: 50, y: 33, w: 16, h: 30 }
];

function legacyPts(z) {
  const cx = clamp(z.x, 0, 100);
  const cy = clamp(z.y, 0, 100);
  const hw = clamp(z.w, 4, 100) / 2;
  const hh = clamp(z.h, 4, 100) / 2;
  const round = finite(z.round) ? clamp(z.round, 0, 1) : 0.6;
  if (round >= 0.999) return ellipsePts(cx, cy, hw, hh, 12);
  /* 圆角框：按 1920×1080 算圆角半径，四个角各取 3 个点 */
  const rPx = round * Math.min(hw * 19.2, hh * 10.8);
  const rx = rPx / 19.2;
  const ry = rPx / 10.8;
  const out = [];
  const corners = [[1, -1, -Math.PI / 2], [1, 1, 0], [-1, 1, Math.PI / 2], [-1, -1, Math.PI]];
  for (const [sx, sy, a0] of corners) {
    const ox = cx + sx * (hw - rx);
    const oy = cy + sy * (hh - ry);
    for (let k = 0; k < 3; k++) {
      const a = a0 + (k / 2) * (Math.PI / 2);
      const p = [r1(clamp(ox + Math.cos(a) * rx, 0, 100)), r1(clamp(oy + Math.sin(a) * ry, 0, 100))];
      const last = out[out.length - 1];
      if (!last || last[0] !== p[0] || last[1] !== p[1]) out.push(p);
    }
  }
  return out.length >= ZONE_MIN_PTS ? out : defaultZone().pts;
}

/* 设置校验：点数 3–24、坐标 0–100；没有多边形（旧存档）就从旧的框换过来，旧的出厂默认直接换成新的默认 */
export function sanitizeZone(z0) {
  const z = isObj(z0) ? z0 : {};
  const enabled = typeof z.enabled === 'boolean' ? z.enabled : true;
  const feather = finite(z.feather) ? clamp(z.feather, 0, 120) : ZONE_FEATHER;
  if (Array.isArray(z.pts)) {
    const pts = z.pts
      .filter(p => Array.isArray(p) && p.length >= 2 && finite(p[0]) && finite(p[1]))
      .slice(0, ZONE_MAX_PTS)
      .map(p => [r1(clamp(p[0], 0, 100)), r1(clamp(p[1], 0, 100))]);
    if (pts.length >= ZONE_MIN_PTS) {
      /* 旧存档没有 auto：点还是出厂的默认框就当作没动过 */
      const auto = typeof z.auto === 'boolean' ? z.auto : samePts(pts, defaultZone().pts);
      return { enabled, pts, feather, auto };
    }
    return { ...defaultZone(), enabled };
  }
  if (!['x', 'y', 'w', 'h'].every(k => finite(z[k]))) return { ...defaultZone(), enabled };
  if (OLD_DEFAULTS.some(o => Object.keys(o).every(k => z[k] === o[k]))) return { ...defaultZone(), enabled };
  return { enabled, pts: legacyPts(z), feather, auto: false };
}

/* ---------- 像素几何 ---------- */

/* 换算成像素：顶点、外接框（cx, cy 中心，hw, hh 半宽半高）、羽化、一个保证在区里的点（ix, iy，往脸边砸东西从这里往外找） */
export function zoneRect(z, W, H) {
  if (!z || !z.enabled || !Array.isArray(z.pts) || z.pts.length < ZONE_MIN_PTS) return null;
  const n = z.pts.length;
  const xs = new Float64Array(n);
  const ys = new Float64Array(n);
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let i = 0; i < n; i++) {
    const x = (z.pts[i][0] / 100) * W;
    const y = (z.pts[i][1] / 100) * H;
    xs[i] = x;
    ys[i] = y;
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  const zr = {
    n,
    xs,
    ys,
    W,
    H,
    x0,
    y0,
    x1,
    y1,
    cx: (x0 + x1) / 2,
    cy: (y0 + y1) / 2,
    hw: Math.max(2, (x1 - x0) / 2),
    hh: Math.max(2, (y1 - y0) / 2),
    feather: Math.max(1, (finite(z.feather) ? z.feather : ZONE_FEATHER) * (Math.min(W, H) / 1080)),
    ix: 0,
    iy: 0
  };
  /* 区里"最深"的一点：外接框里撒 12×12 个点，取离边最远的那个（凹进去的形状中心可能不在区里） */
  let best = Infinity;
  for (let a = 0; a < 12; a++) {
    for (let b = 0; b < 12; b++) {
      const x = x0 + ((a + 0.5) / 12) * (x1 - x0);
      const y = y0 + ((b + 0.5) / 12) * (y1 - y0);
      const d = zoneDist(zr, x, y);
      if (d < best) {
        best = d;
        zr.ix = x;
        zr.iy = y;
      }
    }
  }
  if (best >= 0) {
    zr.ix = zr.cx;
    zr.iy = zr.cy;
  }
  /* 验收脚本读状态时只要这几项 */
  Object.defineProperty(zr, 'toJSON', { value: () => ({ n, cx: zr.cx, cy: zr.cy, hw: zr.hw, hh: zr.hh, feather: zr.feather }) });
  return zr;
}

/* 带符号距离（像素）：区内为负，区外为正（多边形，奇偶规则，自己交叉的也能算） */
export function zoneDist(zr, x, y) {
  if (!zr) return 1e9;
  const { xs, ys, n } = zr;
  let d = Infinity;
  let s = 1;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const ex = xs[j] - xs[i];
    const ey = ys[j] - ys[i];
    const wx = x - xs[i];
    const wy = y - ys[i];
    const ee = ex * ex + ey * ey;
    const t = ee > 0 ? clamp((wx * ex + wy * ey) / ee, 0, 1) : 0;
    const bx = wx - ex * t;
    const by = wy - ey * t;
    const dd = bx * bx + by * by;
    if (dd < d) d = dd;
    const c1 = y >= ys[i];
    const c2 = y < ys[j];
    const c3 = ex * wy > ey * wx;
    if ((c1 && c2 && c3) || (!c1 && !c2 && !c3)) s = -s;
  }
  return s * Math.sqrt(d);
}

/* 物体（按外接圆半径 radius 粗算）是否压到露脸区，pad 为额外留白 */
export function hitsZone(zr, x, y, radius, pad = 0) {
  return zr ? zoneDist(zr, x, y) < radius + pad : false;
}

/* 在画面内、露脸区外找一个能放下半径 radius 物体的中心点；margin 为离画面边的距离。
   prefer 可给一个想要的位置（例如刚擦过的地方），找不到合适的再随机。实在放不下返回 null。
   overlap（0..1，淹没感）：0 = 整个物体都在区外；越大越能压进区的边上（中心始终在区外，压进去的部分被露脸区裁掉）。 */
export function placeOutside(zr, W, H, radius, { margin = 0, pad = 0, prefer = null, random = Math.random, tries = 40, yMin = 0, yMax = 1, overlap = 0 } = {}) {
  const x0 = margin + radius * 0.6;
  const x1 = W - margin - radius * 0.6;
  const y0 = Math.max(margin + radius * 0.6, H * yMin);
  const y1 = Math.min(H - margin - radius * 0.6, H * yMax);
  if (x1 <= x0 || y1 <= y0) return null;
  const keep = (radius + pad) * (1 - clamp(overlap, 0, 1));
  const ok = (x, y) => !zr || zoneDist(zr, x, y) >= keep;
  if (prefer) {
    const px = clamp(prefer.x, x0, x1);
    const py = clamp(prefer.y, y0, y1);
    if (ok(px, py)) return { x: px, y: py };
    for (let i = 0; i < 12; i++) {
      const a = random() * Math.PI * 2;
      const d = radius * (0.6 + i * 0.35);
      const x = clamp(px + Math.cos(a) * d, x0, x1);
      const y = clamp(py + Math.sin(a) * d, y0, y1);
      if (ok(x, y)) return { x, y };
    }
  }
  for (let i = 0; i < tries; i++) {
    const x = x0 + random() * (x1 - x0);
    const y = y0 + random() * (y1 - y0);
    if (ok(x, y)) return { x, y };
  }
  return null;
}

/* 一张转了 rot 角的长方形（宽 w 高 h，中心 x,y）离露脸区最近有多远：在纸面上均匀取 5×6 个点算（纸是硬的，不能被裁） */
export function rectZoneDist(zr, x, y, w, h, rot) {
  if (!zr) return 1e9;
  const c = Math.cos(rot);
  const sn = Math.sin(rot);
  let m = Infinity;
  for (let i = 0; i <= 4; i++) {
    for (let j = 0; j <= 5; j++) {
      const lx = -w / 2 + (w * i) / 4;
      const ly = -h / 2 + (h * j) / 5;
      m = Math.min(m, zoneDist(zr, x + lx * c - ly * sn, y + lx * sn + ly * c));
    }
  }
  return m;
}

/* 给一张长方形的纸找位置：整张都在露脸区外、离区至少 clearance。
   hug = 贴着脸：随便挑个方向，从脸边往外一点点挪，挪到刚好不压脸就停——一圈纸的边自然围出露脸的空隙（不裁纸）。
   纸可以有一小半在画面外（四边各留 25%），也别压住上沿的计数牌（yMin）。找不到返回 null。 */
export function placeRectOutside(zr, W, H, w, h, rot, { margin = 0, clearance = 0, hug = false, step = 10, random = Math.random, tries = 40, yMin = 0 } = {}) {
  const c = Math.abs(Math.cos(rot));
  const sn = Math.abs(Math.sin(rot));
  const ex = ((w / 2) * c + (h / 2) * sn) * 0.75;
  const ey = ((w / 2) * sn + (h / 2) * c) * 0.75;
  const x0 = margin + ex;
  const x1 = W - margin - ex;
  const y0 = Math.max(margin + ey, H * yMin);
  const y1 = H - margin - ey;
  if (x1 <= x0 || y1 <= y0) return null;
  const inside = (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
  const fits = (x, y) => rectZoneDist(zr, x, y, w, h, rot) >= clearance;
  if (zr && hug) {
    const far = Math.hypot(W, H);
    for (let k = 0; k < 12; k++) {
      const a = random() * Math.PI * 2;
      for (let d = 0; d < far; d += step) {
        const p = nearZone(zr, a, d);
        /* 走出画面了：这个方向没地方，换个方向 */
        if (p.x < 0 || p.x > W || p.y < 0 || p.y > H) break;
        if (inside(p.x, p.y) && fits(p.x, p.y)) return p;
      }
    }
  }
  for (let i = 0; i < tries; i++) {
    const x = x0 + random() * (x1 - x0);
    const y = y0 + random() * (y1 - y0);
    if (fits(x, y)) return { x, y };
  }
  return null;
}

/* 从区里最深的那点朝 angle 方向出去，过了区的边再往外 extra 像素（往脸边砸东西用；extra 为负就是边里面一点） */
export function nearZone(zr, angle, extra) {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  let best = -1;
  for (let i = 0, j = zr.n - 1; i < zr.n; j = i++) {
    const ax = zr.xs[j];
    const ay = zr.ys[j];
    const ex = zr.xs[i] - ax;
    const ey = zr.ys[i] - ay;
    const den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-9) continue;
    const ox = ax - zr.ix;
    const oy = ay - zr.iy;
    const t = (ox * ey - oy * ex) / den;
    const u = (ox * dy - oy * dx) / den;
    if (t > 0 && u >= 0 && u <= 1 && t > best) best = t;
  }
  if (best < 0) best = Math.hypot(zr.hw * dx, zr.hh * dy);
  return { x: zr.ix + dx * (best + extra), y: zr.iy + dy * (best + extra) };
}
