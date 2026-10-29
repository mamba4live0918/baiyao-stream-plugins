/* 擦玻璃 · 小广告纸面的形状（纯函数，方便单测）。和 art/flyer-kit.js 的 paperPath / dieCut / drawPaper 对应。
   纸面局部坐标：中心为原点，y 向下，纸宽 pw、高 ph。
   - coverShape：贴平了真能把底下盖严实的范围——比轮廓往里让一点，圆角、牛皮纸毛边、本子纸上沿锯齿、票根缺口都让开；
   - paperEnvelope：纸最外沿（连不干胶外面那圈白边、牛皮纸往外的毛边、纸边那道细线）——看自己露没露出来时沿它取点，宁可多要求一点；
   - eachPaperSample：沿最外沿走一圈、胶带四角、再在里面一格格，把点交给 fn。 */

const radiusOf = (kind, m, u) =>
  kind === 'custom' ? 0 : kind === 'sticker' ? m * 0.09 : kind === 'label' ? 7 * u : kind === 'ticket' ? 4 * u : kind === 'note' ? 2.5 * u : kind === 'kraft' || kind === 'lined' ? 0 : 2 * u;
/* 票根：左右两边各一个半圆缺口（paperPath：ny = 上沿 + 0.68 高，半径 0.07 × 短边） */
const notchOf = (kind, pw, ph) => (kind === 'ticket' ? { x: pw / 2, y: -ph / 2 + ph * 0.68, r: Math.min(pw, ph) * 0.07 } : null);
/* 纸边那道细线（drawPaper 里 1.5u 宽，一半在轮廓外） */
const EDGE_LINE = 0.75;
/* 不干胶外面那圈白边（dieCut 里 7u 宽，一半在轮廓外） */
const DIE_CUT = 3.5;
/* 牛皮纸毛边最多往外 / 往里 1.2u；本子纸上沿的锯齿最深 3.42u（只往里） */
const KRAFT_JAG = 1.2;
const LINED_TEETH = 3.6;

/* 贴平了能盖严实的范围：轮廓往里让 e（默认 0.6u） */
export function coverShape(kind, pw, ph, u, e = 0.6 * u) {
  /* 主播上传的异形贴纸：形状在版式里（design.covers 按完全不透明的格子算），这里不猜 */
  if (kind === 'custom') return () => false;
  const r = radiusOf(kind, Math.min(pw, ph), u);
  const jag = kind === 'kraft' ? (KRAFT_JAG + 0.2) * u : 0;
  const top = kind === 'lined' ? LINED_TEETH * u : 0;
  const notch = notchOf(kind, pw, ph);
  const hw = pw / 2 - e - jag;
  const hh = ph / 2 - e - jag;
  return (lx, ly) => {
    const qx = Math.abs(lx);
    const qy = Math.abs(ly);
    if (qx > hw || qy > hh || ly < -hh + top) return false;
    if (r > 0) {
      const cx = qx - (pw / 2 - r);
      const cy = qy - (ph / 2 - r);
      if (cx > 0 && cy > 0 && cx * cx + cy * cy > (r - e) * (r - e)) return false;
    }
    if (notch) {
      const dx = qx - notch.x;
      const dy = ly - notch.y;
      const nr = notch.r + e;
      if (dx * dx + dy * dy < nr * nr) return false;
    }
    return true;
  };
}

/* 纸最外沿：返回 { hw, hh, r（圆角半径，0 = 直角）, notch（票根缺口，没有为 null）, inside(lx, ly) } */
export function paperEnvelope(kind, pw, ph, u) {
  const grow = (kind === 'custom' ? 0 : kind === 'sticker' ? DIE_CUT : kind === 'kraft' ? KRAFT_JAG + EDGE_LINE : EDGE_LINE) * u;
  const r0 = radiusOf(kind, Math.min(pw, ph), u);
  const hw = pw / 2 + grow;
  const hh = ph / 2 + grow;
  const r = r0 > 0 ? r0 + grow : 0;
  const n = notchOf(kind, pw, ph);
  const notch = n ? { x: n.x, y: n.y, r: Math.max(0, n.r - EDGE_LINE * u) } : null;
  const inside = (lx, ly) => {
    const qx = Math.abs(lx);
    const qy = Math.abs(ly);
    if (qx > hw || qy > hh) return false;
    if (r > 0) {
      const cx = qx - (hw - r);
      const cy = qy - (hh - r);
      if (cx > 0 && cy > 0 && cx * cx + cy * cy > r * r) return false;
    }
    if (notch) {
      const dx = qx - notch.x;
      const dy = ly - notch.y;
      if (dx * dx + dy * dy < notch.r * notch.r) return false;
    }
    return true;
  };
  return { hw, hh, r, notch, inside };
}

/* 翘起的那个角（或那条边）掀开、露出底下的那一截，沿撕的方向从纸的这头算起有多长：
   平时翘 restP，鼠标停上去最多翘到 1.6 倍；再留 4u */
export const liftBand = (restP, u) => 1.7 * restP + 4 * u;

const CORNERS = [
  [0, 0],
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1]
];

/* 把要检查的点（纸面局部坐标）一个个交给 fn：最外沿一圈（直边、圆角、票根缺口，间距 edge）先给——露着的多半在边上；
   再给胶带四角和中间；最后是里面一格格（间距 fill）。fn 返回 false 就停，结果也是 false */
export function eachPaperSample(env, { tapes = [], u = 1, edge, fill }, fn) {
  const { hw, hh, r, notch, inside } = env;
  const sx = hw - r;
  const sy = hh - r;
  const nx = Math.max(1, Math.ceil((2 * sx) / edge));
  for (let i = 0; i <= nx; i++) {
    const lx = -sx + (2 * sx * i) / nx;
    if (!fn(lx, -hh) || !fn(lx, hh)) return false;
  }
  const ny = Math.max(1, Math.ceil((2 * sy) / edge));
  for (let j = 0; j <= ny; j++) {
    const ly = -sy + (2 * sy * j) / ny;
    if (notch && Math.abs(ly - notch.y) < notch.r) continue;
    if (!fn(-hw, ly) || !fn(hw, ly)) return false;
  }
  if (r > 0) {
    const na = Math.max(2, Math.ceil(((Math.PI / 2) * r) / edge));
    for (let k = 1; k < na; k++) {
      const a = (k / na) * (Math.PI / 2);
      const cx = sx + r * Math.cos(a);
      const cy = sy + r * Math.sin(a);
      if (!fn(cx, cy) || !fn(-cx, cy) || !fn(cx, -cy) || !fn(-cx, -cy)) return false;
    }
  }
  if (notch && notch.r > 0) {
    const nn = Math.max(3, Math.ceil((Math.PI * notch.r) / edge));
    for (let k = 0; k <= nn; k++) {
      const a = -Math.PI / 2 + (k / nn) * Math.PI;
      const ox = notch.x - notch.r * Math.cos(a);
      const oy = notch.y + notch.r * Math.sin(a);
      if (!fn(ox, oy) || !fn(-ox, oy)) return false;
    }
  }
  for (const tp of tapes) {
    const c = Math.cos(tp.rot);
    const s = Math.sin(tp.rot);
    const tw = tp.w / 2 + 2 * u;
    const th = tp.h / 2 + 2 * u;
    for (const [qx, qy] of CORNERS) if (!fn(tp.x + qx * tw * c - qy * th * s, tp.y + qx * tw * s + qy * th * c)) return false;
  }
  const mx = Math.max(1, Math.ceil((2 * hw) / fill));
  const my = Math.max(1, Math.ceil((2 * hh) / fill));
  for (let i = 1; i < mx; i++) {
    for (let j = 1; j < my; j++) {
      const lx = -hw + (2 * hw * i) / mx;
      const ly = -hh + (2 * hh * j) / my;
      if (inside(lx, ly) && !fn(lx, ly)) return false;
    }
  }
  return true;
}
