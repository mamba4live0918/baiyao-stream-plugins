/* 垃圾分类模式：25 种垃圾 + 大黑袋的程序化 3D 模型、泥巴材质、塑料袋层、分类桶标签贴图。
 *
 * 本文件不 import 任何东西：THREE 与 RoundedBoxGeometry 由调用方传入（与 main.js 共用同一份 three.js）。
 *   const kit = createGarbageKit(THREE, RoundedBoxGeometry);
 *   const { object, shape, dims } = kit.build('bottle');
 * 约定：
 *   - object 是 THREE.Group；模型包围盒中心 = Group 原点 = 刚体中心；dims = 包围盒尺寸 [x, y, z]（局部坐标）。
 *   - shape 用 Rapier 约定：{kind:'cuboid',hx,hy,hz} | {kind:'cylinder',hh,r} | {kind:'ball',r} | {kind:'capsule',hh,r}；
 *     cylinder / capsule 沿局部 Y 轴，capsule 总长 = 2*hh + 2*r。
 *   - 每种垃圾的几何体、材质、贴图只在第一次 build 时生成并缓存；之后 build 只新建 Group/Mesh 外壳，共用几何体与材质。
 *   - 所有随机都用按 id 播种的伪随机数：同一种垃圾的每一份、每次运行都长得一样。
 */

export const GARBAGE_IDS = ['bottle', 'can', 'newspaper', 'carton', 'glass', 'shirt', 'battery', 'tube', 'medicine', 'paint', 'thermo', 'spray', 'banana', 'apple', 'fishbone', 'melon', 'eggshell', 'veg', 'tissue', 'bigbone', 'butt', 'bowl', 'durian', 'milktea', 'diaper'];

const FONT = '"Microsoft YaHei UI","Microsoft YaHei","PingFang SC","Noto Sans CJK SC",sans-serif';
const TAU = Math.PI * 2;
const BIN_TEXT = ['可回收物', '有害垃圾', '厨余垃圾', '其他垃圾'];

function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
/** mulberry32：小而稳定的可播种伪随机数，返回 [0,1) */
function seeded(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const clamp01 = x => Math.min(1, Math.max(0, x));
const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
/** 绕一圈首尾相接的平滑噪声（几个随机相位的正弦叠加），车削体接缝处不会裂开；返回值约在 [-1, 1] */
function ringNoise(R, terms = 4, base = 2) {
  const k = []; for (let i = 0; i < terms; i++) k.push([base + i, R() * TAU, (.4 + R() * .6) / (i + 1)]);
  const sum = k.reduce((s, q) => s + q[2], 0);
  return (ph, off = 0) => k.reduce((s, [f, p, a]) => s + a * Math.sin(f * ph + p + off), 0) / sum;
}

export function createGarbageKit(THREE, RoundedBoxGeometry) {
  if (!THREE || typeof THREE.BufferGeometry !== 'function' || typeof RoundedBoxGeometry !== 'function') throw new Error('createGarbageKit(THREE, RoundedBoxGeometry)：缺少 three.js 或 RoundedBoxGeometry');
  const V3 = THREE.Vector3;

  /* ================= 画布贴图工具 ================= */
  function cvs(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function rr(g, x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  function tex(c, wrap) { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; if (wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; }
  function rawTex(c) { const t = new THREE.CanvasTexture(c); t.anisotropy = 8; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; }
  /** 细碎颗粒：dark/light 是 "r,g,b" 字符串 */
  function grain(g, R, x, y, w, h, n, dark, light, amax, size = 1.6) { for (let i = 0; i < n; i++) { g.fillStyle = `rgba(${R() < .5 ? dark : light},${R() * amax})`; g.fillRect(x + R() * w, y + R() * h, 1 + R() * size, 1 + R() * size * .6); } }
  function dots(g, R, x, y, w, h, n, color, r0, r1, a0 = 1, a1 = 1) { g.save(); g.fillStyle = color; for (let i = 0; i < n; i++) { g.globalAlpha = a0 + (a1 - a0) * R(); g.beginPath(); g.arc(x + R() * w, y + R() * h, r0 + (r1 - r0) * R(), 0, TAU); g.fill(); } g.restore(); }
  function txt(g, s, x, y, size, color, o = {}) {
    g.save(); g.translate(x, y); if (o.rot) g.rotate(o.rot); if (o.sx) g.scale(o.sx, 1);
    g.font = `${o.weight || 900} ${size}px ${FONT}`; g.textAlign = o.align || 'center'; g.textBaseline = 'middle';
    if (o.shadow) { g.shadowColor = o.shadow; g.shadowBlur = o.blur ?? size * .12; g.shadowOffsetY = o.dy ?? size * .05; }
    if (o.stroke) { g.lineJoin = 'round'; g.lineWidth = o.lw || size * .16; g.strokeStyle = o.stroke; g.strokeText(s, 0, 0); g.shadowColor = 'transparent'; }
    g.fillStyle = color; g.fillText(s, 0, 0); g.restore();
  }
  function poly(g, pts, fill) { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); if (fill) { g.fillStyle = fill; g.fill(); } }
  function starPath(g, cx, cy, r0, r1, n = 5, rot = -Math.PI / 2) { g.beginPath(); for (let i = 0; i < n * 2; i++) { const r = i % 2 ? r1 : r0, a = rot + i * Math.PI / n; g[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * r, cy + Math.sin(a) * r); } g.closePath(); }
  function heartPath(g, cx, cy, s) { g.beginPath(); g.moveTo(cx, cy + s * .35); g.bezierCurveTo(cx - s * .9, cy - s * .2, cx - s * .45, cy - s * .85, cx, cy - s * .35); g.bezierCurveTo(cx + s * .45, cy - s * .85, cx + s * .9, cy - s * .2, cx, cy + s * .35); g.closePath(); }
  function plus(g, cx, cy, size, thick, color) { g.fillStyle = color; rr(g, cx - size / 2, cy - thick / 2, size, thick, thick * .25); g.fill(); rr(g, cx - thick / 2, cy - size / 2, thick, size, thick * .25); g.fill(); }
  function bolt(g, cx, cy, s, rot, color) { g.save(); g.translate(cx, cy); g.rotate(rot); poly(g, [[.16, -.5], [-.26, .07], [.01, .07], [-.14, .5], [.3, -.1], [.03, -.1]].map(([x, y]) => [x * s, y * s]), color); g.restore(); }

  /* ================= 几何工具 ================= */
  function fromArrays(pos, uv, idx, nor) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    if (idx) g.setIndex(idx);
    if (nor) g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); else g.computeVertexNormals();
    return g;
  }
  const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
  /** 对几何体做 缩放→旋转(XYZ 欧拉)→平移 */
  function xf(g, { p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1] } = {}) { _m4.compose(new V3(p[0], p[1], p[2]), _q.setFromEuler(_e.set(r[0], r[1], r[2])), new V3(s[0], s[1], s[2])); g.applyMatrix4(_m4); return g; }
  /** 画布像素矩形 [x0,y0,x1,y1] → 把 [0,1]² 的 uv 映射进去（v=1 对应矩形上沿） */
  const rect = (r, W, H) => (u, v) => [(r[0] + u * (r[2] - r[0])) / W, 1 - (r[3] - v * (r[3] - r[1])) / H];
  function remapUV(g, r, W, H) { const m = rect(r, W, H), U = g.attributes.uv; for (let i = 0; i < U.count; i++) { const t = m(U.getX(i), U.getY(i)); U.setXY(i, t[0], t[1]); } return g; }
  function fillUV(g, u, v) { const U = g.attributes.uv; for (let i = 0; i < U.count; i++) U.setXY(i, u, v); return g; }

  /** 车削体。prof=[[r,y],…] 按“实体在右手边”的方向排列（底部轴心→外侧→顶部轴心）；相邻两点重合表示硬边。
   *  o.mod(φ, j, r, y) 可逐点扰动（之后重算法线并修补接缝/极点），o.range(j) 可让每一行的角度范围不同（破碗）。 */
  function lathe(prof, segs, o = {}) {
    const n = prof.length, L = [0];
    for (let j = 1; j < n; j++) L[j] = L[j - 1] + Math.hypot(prof[j][0] - prof[j - 1][0], prof[j][1] - prof[j - 1][1]);
    const tot = L[n - 1] || 1, v0 = o.v0 ?? 0, v1 = o.v1 ?? 1, nr = [], ny = [];
    const same = (a, b) => a && b && Math.abs(a[0] - b[0]) < 1e-7 && Math.abs(a[1] - b[1]) < 1e-7;
    for (let j = 0; j < n; j++) {
      const p = prof[j], a = prof[j - 1], b = prof[j + 1]; let tx = 0, ty = 0;
      const seg = (q0, q1) => { const dx = q1[0] - q0[0], dy = q1[1] - q0[1], l = Math.hypot(dx, dy); if (l > 1e-9) { tx += dx / l; ty += dy / l; } };
      if (same(a, p)) { if (b) seg(p, b); } else if (same(b, p)) { if (a) seg(a, p); } else { if (a) seg(a, p); if (b) seg(p, b); }
      const l = Math.hypot(tx, ty) || 1; nr[j] = ty / l; ny[j] = -tx / l;
    }
    const ph0 = o.phi0 || 0, phL = o.phiLen || TAU, range = o.range || (() => [ph0, ph0 + phL]);
    const pos = [], nor = [], uv = [], idx = [];
    for (let i = 0; i <= segs; i++) for (let j = 0; j < n; j++) {
      const [a0, a1] = range(j), ph = a0 + (a1 - a0) * i / segs, s = Math.sin(ph), c = Math.cos(ph);
      let r = prof[j][0], y = prof[j][1];
      if (o.mod) [r, y] = o.mod(ph, j, r, y, i);
      pos.push(r * s, y, r * c); nor.push(nr[j] * s, ny[j], nr[j] * c);
      uv.push(o.uAbs ? ph / TAU : i / segs, v0 + (v1 - v0) * L[j] / tot);
    }
    for (let i = 0; i < segs; i++) for (let j = 0; j < n - 1; j++) {
      const a = i * n + j, b = a + n, c = b + 1, d = a + 1;
      if (prof[j][0] > 1e-7) idx.push(a, b, d);
      if (prof[j + 1][0] > 1e-7) idx.push(b, c, d);
    }
    const g = fromArrays(pos, uv, idx, nor);
    if (o.mod && o.smooth !== false) {
      g.computeVertexNormals();
      const N = g.attributes.normal, full = !o.range && Math.abs(phL - TAU) < 1e-6;
      for (let j = 0; j < n; j++) {
        if (full) { const a = j, b = segs * n + j, x = N.getX(a) + N.getX(b), y = N.getY(a) + N.getY(b), z = N.getZ(a) + N.getZ(b), l = Math.hypot(x, y, z) || 1; N.setXYZ(a, x / l, y / l, z / l); N.setXYZ(b, x / l, y / l, z / l); }
        if (prof[j][0] <= 1e-7) for (let i = 0; i <= segs; i++) N.setXYZ(i * n + j, 0, Math.sign(ny[j]) || 1, 0);
      }
    }
    return g;
  }

  /** 参数曲面网格：fn(u,v,i,j) → [x,y,z]；正面朝 ∂P/∂u × ∂P/∂v（flip 反过来）。seamU：u=0 与 u=1 两列法线取平均 */
  function grid(nu, nv, fn, o = {}) {
    const pos = [], uv = [], idx = [], w = nu + 1;
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) { const u = i / nu, v = j / nv, p = fn(u, v, i, j); pos.push(p[0], p[1], p[2]); const t = o.uv ? o.uv(u, v) : [u, v]; uv.push(t[0], t[1]); }
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = j * w + i, b = a + 1, d = a + w, c = d + 1; if (o.flip) idx.push(a, d, b, b, d, c); else idx.push(a, b, d, b, c, d); }
    const g = fromArrays(pos, uv, idx), N = g.attributes.normal;
    if (o.seamU) for (let j = 0; j <= nv; j++) { const a = j * w, b = a + nu, x = N.getX(a) + N.getX(b), y = N.getY(a) + N.getY(b), z = N.getZ(a) + N.getZ(b), l = Math.hypot(x, y, z) || 1; N.setXYZ(a, x / l, y / l, z / l); N.setXYZ(b, x / l, y / l, z / l); }
    if (o.poleV0) for (let i = 0; i <= nu; i++) N.setXYZ(i, ...o.poleV0);
    return g;
  }

  /** 有厚度的薄片：fn 给出上表面，下表面沿法线向里偏移 th，四周补边。返回 { top, bot, edge } 三块几何体 */
  function shell(nu, nv, fn, th, o = {}) {
    const w = nu + 1, P = [], B = [];
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) P.push(new V3(...fn(i / nu, j / nv)));
    const at = (i, j) => P[Math.min(nv, Math.max(0, j)) * w + Math.min(nu, Math.max(0, i))];
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
      const n = new V3().subVectors(at(i + 1, j), at(i - 1, j)).cross(new V3().subVectors(at(i, j + 1), at(i, j - 1)));
      if (n.lengthSq() < 1e-14) n.set(0, 1, 0);
      B.push(P[j * w + i].clone().addScaledVector(n.normalize(), -th));
    }
    const top = grid(nu, nv, (u, v, i, j) => P[j * w + i].toArray(), { uv: o.uvTop });
    const bot = grid(nu, nv, (u, v, i, j) => B[j * w + i].toArray(), { uv: o.uvBot, flip: true });
    const uvE = o.uvEdge || (() => [0, 0]);
    const strip = (len, pick, flip) => grid(len, 1, (u, v, i, jj) => (jj ? B : P)[pick(i)].toArray(), { flip, uv: uvE });
    const edge = merge([
      strip(nu, i => i, true), strip(nu, i => nv * w + i, false),
      strip(nv, j => j * w, false), strip(nv, j => j * w + nu, true),
    ]);
    return { top, bot, edge };
  }

  /** 管子（可变半径）。pts=[[x,y,z],…]；rad 为常数或 t→r；两端半径>0 时自动封口 */
  function tube(pts, rad, segs, radial, o = {}) {
    const vs = pts.map(p => new V3(p[0], p[1], p[2]));
    const curve = vs.length > 2 ? new THREE.CatmullRomCurve3(vs, false, 'centripetal') : new THREE.LineCurve3(vs[0], vs[1]);
    const fr = curve.computeFrenetFrames(segs, false), radAt = typeof rad === 'function' ? rad : () => rad;
    const pos = [], nor = [], uv = [], idx = [], P = new V3(), N = new V3(), w = radial + 1;
    for (let i = 0; i <= segs; i++) {
      const t = i / segs, r = radAt(t); curve.getPointAt(t, P);
      for (let k = 0; k <= radial; k++) {
        const a = k / radial * TAU; N.copy(fr.normals[i]).multiplyScalar(Math.cos(a)).addScaledVector(fr.binormals[i], Math.sin(a)).normalize();
        pos.push(P.x + N.x * r, P.y + N.y * r, P.z + N.z * r); nor.push(N.x, N.y, N.z); uv.push(t, k / radial);
      }
    }
    for (let i = 0; i < segs; i++) for (let k = 0; k < radial; k++) { const a = i * w + k, b = a + w, c = b + 1, d = a + 1; idx.push(a, d, b, b, d, c); }
    for (const end of [0, 1]) {
      if (radAt(end) < 1e-5 || o.caps === false) continue;
      const i = end ? segs : 0; curve.getPointAt(end, P); const T = fr.tangents[i].clone().multiplyScalar(end ? 1 : -1);
      const ci = pos.length / 3; pos.push(P.x, P.y, P.z); nor.push(T.x, T.y, T.z); uv.push(end, .5);
      const ri = pos.length / 3;
      for (let k = 0; k <= radial; k++) { const s = (i * w + k) * 3; pos.push(pos[s], pos[s + 1], pos[s + 2]); nor.push(T.x, T.y, T.z); uv.push(end, k / radial); }
      for (let k = 0; k < radial; k++) if (end) idx.push(ci, ri + k, ri + k + 1); else idx.push(ci, ri + k + 1, ri + k);
    }
    return fromArrays(pos, uv, idx, nor);
  }

  /** 圆角盒（或 segs=0 时的普通盒），6 个面（+x,-x,+y,-y,+z,-z）各自映射到同一张画布的不同矩形 */
  function atlasBox(w, h, d, segs, r, faces, W, H) {
    let g = segs > 0 && r > 0 ? new RoundedBoxGeometry(w, h, d, segs, r) : new THREE.BoxGeometry(w, h, d);
    if (g.index) g = g.toNonIndexed();
    const U = g.attributes.uv, per = U.count / 6;
    for (let f = 0; f < 6; f++) { const m = rect(faces[f], W, H); for (let i = f * per; i < (f + 1) * per; i++) { const t = m(U.getX(i), U.getY(i)); U.setXY(i, t[0], t[1]); } }
    g.clearGroups(); return g;
  }

  /** 侧面法线按位置焊接后平滑（只在夹角 < maxDeg 的面之间平滑），用于挤出体的倒角 */
  function smoothRange(g, start, count, maxDeg) {
    const P = g.attributes.position, N = g.attributes.normal, cosT = Math.cos(maxDeg * Math.PI / 180);
    const key = i => `${Math.round(P.getX(i) * 1e4)}|${Math.round(P.getY(i) * 1e4)}|${Math.round(P.getZ(i) * 1e4)}`;
    const a = new V3(), b = new V3(), c = new V3(), faces = [], buckets = new Map();
    for (let i = start; i < start + count; i += 3) {
      a.fromBufferAttribute(P, i); b.fromBufferAttribute(P, i + 1); c.fromBufferAttribute(P, i + 2);
      const n = new V3().subVectors(c, b).cross(new V3().subVectors(a, b)), u = n.clone().normalize();
      faces.push(u);
      for (let k = 0; k < 3; k++) { const kk = key(i + k); if (!buckets.has(kk)) buckets.set(kk, []); buckets.get(kk).push([n, u]); }
    }
    const s = new V3();
    for (let i = start, f = 0; i < start + count; i += 3, f++) for (let k = 0; k < 3; k++) {
      s.set(0, 0, 0); for (const [n, u] of buckets.get(key(i + k))) if (u.dot(faces[f]) >= cosT) s.add(n);
      if (s.lengthSq() === 0) s.copy(faces[f]); s.normalize(); N.setXYZ(i + k, s.x, s.y, s.z);
    }
    N.needsUpdate = true;
  }

  /** 平面轮廓挤出成“平躺”的软垫：形状的 xy → 世界 x、-z，厚度沿 +y 居中；uv 按俯视平面投影到 [0,1]² */
  function extrudeFlat(shape, depth, bev, o = {}) {
    const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bev > 0, bevelThickness: bev, bevelSize: bev, bevelSegments: o.bevelSegments ?? 3, curveSegments: o.curveSegments ?? 6, steps: 1 });
    g.computeBoundingBox(); const b = g.boundingBox, box = [b.min.x, b.min.y, b.max.x, b.max.y], P = g.attributes.position, U = g.attributes.uv;
    for (let i = 0; i < P.count; i++) U.setXY(i, (P.getX(i) - box[0]) / (box[2] - box[0]), (P.getY(i) - box[1]) / (box[3] - box[1]));
    const side = g.groups[1]; if (side) smoothRange(g, side.start, side.count, o.smoothAngle ?? 70);
    g.clearGroups(); g.translate(0, 0, -depth / 2); g.rotateX(-Math.PI / 2);   // 注意：translate/rotate 会就地重算 g.boundingBox，所以上面先把数值拷出来
    return { geo: g, box };
  }
  function rrShape(s, x, y, w, h, r) { s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h); s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); return s; }

  /** 若干三角形，逐个按参考方向定朝向（破碗断口用），平面着色 */
  function facets(tris, ref, uvAt) {
    const pos = [], uv = [], a = new V3(), b = new V3(), c = new V3(), n = new V3();
    tris.forEach((t, k) => {
      a.fromArray(t[0]); b.fromArray(t[1]); c.fromArray(t[2]);
      n.subVectors(c, b).cross(new V3().subVectors(a, b));
      const list = n.dot(ref(k)) >= 0 ? [t[0], t[1], t[2]] : [t[0], t[2], t[1]];
      for (const p of list) { pos.push(p[0], p[1], p[2]); uv.push(...uvAt); }
    });
    return fromArrays(pos, uv, null);
  }

  /** 合并成一个带索引的几何体（position / normal / uv / 可选 color） */
  function merge(list) {
    let nv = 0, ni = 0; const hasCol = list.some(g => g.attributes.color);
    for (const g of list) { if (!g.attributes.normal) g.computeVertexNormals(); nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
    const P = new Float32Array(nv * 3), N = new Float32Array(nv * 3), U = new Float32Array(nv * 2), C = hasCol ? new Float32Array(nv * 3).fill(1) : null;
    const I = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
    let vo = 0, io = 0;
    for (const g of list) {
      const p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv, c = g.attributes.color, cnt = p.count;
      for (let i = 0; i < cnt; i++) {
        const o3 = (vo + i) * 3, o2 = (vo + i) * 2;
        P[o3] = p.getX(i); P[o3 + 1] = p.getY(i); P[o3 + 2] = p.getZ(i);
        N[o3] = n.getX(i); N[o3 + 1] = n.getY(i); N[o3 + 2] = n.getZ(i);
        if (u) { U[o2] = u.getX(i); U[o2 + 1] = u.getY(i); }
        if (C && c) { C[o3] = c.getX(i); C[o3 + 1] = c.getY(i); C[o3 + 2] = c.getZ(i); }
      }
      if (g.index) for (let k = 0; k < g.index.count; k++) I[io + k] = g.index.getX(k) + vo;
      else for (let k = 0; k < cnt; k++) I[io + k] = vo + k;
      io += g.index ? g.index.count : cnt; vo += cnt; g.dispose();
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(P, 3)); out.setAttribute('normal', new THREE.BufferAttribute(N, 3)); out.setAttribute('uv', new THREE.BufferAttribute(U, 2));
    if (C) out.setAttribute('color', new THREE.BufferAttribute(C, 3));
    out.setIndex(new THREE.BufferAttribute(I, 1));
    return out;
  }
  /** 一组几何体按同一变换摆放后，整体贴地（最低点 y=0） */
  function placeOnGround(list, t) { for (const g of list) xf(g, t); let y = Infinity; for (const g of list) { g.computeBoundingBox(); y = Math.min(y, g.boundingBox.min.y); } for (const g of list) g.translate(0, -y, 0); return list; }

  const std = o => new THREE.MeshStandardMaterial(o);
  const phys = o => new THREE.MeshPhysicalMaterial(o);

  /* ---------- 碰撞体：按包围盒尺寸给出（cylinder/capsule 沿局部 Y） ---------- */
  const r3 = v => Math.round(v * 1000) / 1000;
  const cuboid = (k = [1, 1, 1]) => d => ({ kind: 'cuboid', hx: r3(d[0] / 2 * k[0]), hy: r3(d[1] / 2 * k[1]), hz: r3(d[2] / 2 * k[2]) });
  const cyl = (rk = 1, hk = 1) => d => ({ kind: 'cylinder', hh: r3(d[1] / 2 * hk), r: r3(Math.max(d[0], d[2]) / 2 * rk) });
  const capsule = r => d => ({ kind: 'capsule', hh: r3(d[1] / 2 - r), r: r3(r) });
  const ballOf = (k = 1) => d => ({ kind: 'ball', r: r3((d[0] + d[1] + d[2]) / 6 * k) });

  /* ================= 25 种垃圾 ================= */
  const RECIPES = {
    /* ---- 可回收物 ---- */
    bottle(R, add) {
      const y0 = -.575;
      add(lathe([[0, y0 + .03], [.12, y0 + .006], [.2, y0], [.244, y0 + .02], [.26, y0 + .065], [.26, -.31], [.248, -.285], [.26, -.26], [.26, .11], [.249, .135], [.26, .16], [.252, .215], [.226, .275], [.184, .33], [.138, .375], [.108, .405], [.104, .428], [.13, .432], [.13, .447], [.104, .452], [.104, .47]], 24),
        phys({ color: 0xa9dbf7, transparent: true, opacity: .5, roughness: .05, clearcoat: 1, clearcoatRoughness: .04, side: THREE.DoubleSide }));
      const cc = cvs(128, 64), cg = cc.getContext('2d');
      cg.fillStyle = '#f7f9fb'; cg.fillRect(0, 0, 128, 64); cg.fillStyle = '#cdd6de'; for (let x = 1; x < 128; x += 4) cg.fillRect(x, 16, 2, 48);
      add(lathe([[.1, .448], [.123, .448], [.128, .457], [.128, .557], [.12, .575], [.06, .577], [0, .577]], 24), phys({ map: tex(cc), roughness: .35, clearcoat: .6 }));
      const lc = cvs(512, 96), g = lc.getContext('2d');
      const gr = g.createLinearGradient(0, 0, 0, 96); gr.addColorStop(0, '#4fa3f3'); gr.addColorStop(1, '#1a5cc6'); g.fillStyle = gr; g.fillRect(0, 0, 512, 96);
      g.fillStyle = 'rgba(236,247,255,.96)'; g.beginPath(); g.moveTo(0, 96);
      for (let x = 0; x <= 512; x += 8) g.lineTo(x, 80 - 18 * Math.pow(Math.abs(Math.sin(x / 512 * Math.PI * 3)), 1.8));
      g.lineTo(512, 96); g.fill();
      g.fillStyle = '#ffffff'; g.fillRect(0, 4, 512, 3);
      for (const x of [128, 384]) txt(g, '矿泉水', x, 40, 38, '#ffffff', { stroke: 'rgba(12,58,140,.6)', lw: 6 });
      add(xf(new THREE.CylinderGeometry(.264, .264, .3, 24, 1, true), { p: [0, -.07, 0] }), phys({ map: tex(lc), roughness: .4, clearcoat: .5 }));
      return { shape: cyl() };
    },

    can(R, add) {
      const metal = phys({ color: 0xd9dfe5, metalness: 1, roughness: .26 });
      const lc = cvs(512, 200), g = lc.getContext('2d');
      const gr = g.createLinearGradient(0, 0, 0, 200); gr.addColorStop(0, '#f24b3e'); gr.addColorStop(.55, '#d92b24'); gr.addColorStop(1, '#a6181a'); g.fillStyle = gr; g.fillRect(0, 0, 512, 200);
      g.fillStyle = '#ffffff'; g.beginPath();
      for (let x = 0; x <= 512; x += 8) g.lineTo(x, 126 + 12 * Math.sin(x / 512 * TAU * 2));
      for (let x = 512; x >= 0; x -= 8) g.lineTo(x, 152 + 12 * Math.sin(x / 512 * TAU * 2 + .7));
      g.closePath(); g.fill();
      dots(g, R, 0, 18, 512, 92, 30, '#ffffff', 2, 6, .2, .55);
      for (const x of [128, 384]) { g.save(); g.translate(x, 70); g.transform(1, 0, -.18, 1, 0, 0); txt(g, '汽水', 0, 0, 74, '#ffffff', { stroke: 'rgba(110,8,8,.45)', lw: 8 }); g.restore(); }
      g.fillStyle = '#c9cfd5'; g.fillRect(0, 0, 512, 7); g.fillRect(0, 193, 512, 7);
      add(new THREE.CylinderGeometry(.2, .2, .5, 28, 1, true), phys({ map: tex(lc), metalness: .5, roughness: .3, clearcoat: 1, clearcoatRoughness: .12 }));
      add(lathe([[.2, .25], [.2, .262], [.183, .292], [.174, .302], [.176, .312], [.168, .319], [.156, .313], [.152, .301], [0, .299]], 28), metal);
      add(lathe([[0, -.287], [.11, -.301], [.15, -.311], [.172, -.306], [.19, -.286], [.2, -.263], [.2, -.25]], 28), metal);
      const s = rrShape(new THREE.Shape(), -.034, -.03, .068, .118, .03), hole = new THREE.Path(); hole.absellipse(0, .045, .019, .025, 0, TAU, true); s.holes.push(hole);
      add(xf(new THREE.ExtrudeGeometry(s, { depth: .007, bevelEnabled: false, curveSegments: 5 }), { p: [0, .3, .02], r: [-Math.PI / 2, 0, 0] }), metal);
      return { shape: cyl() };
    },

    newspaper(R, add) {
      const W = 512, H = 512, c = cvs(W, H), g = c.getContext('2d');
      const A = [0, 0, 512, 358], B = [0, 366, 512, 398], C = [0, 404, 512, 512];
      const paper = ([x0, y0, x1, y1]) => { g.fillStyle = '#efe8d4'; g.fillRect(x0, y0, x1 - x0, y1 - y0); grain(g, R, x0, y0, x1 - x0, y1 - y0, (x1 - x0) * (y1 - y0) / 50, '120,105,80', '255,252,240', .12); };
      const lines = (x, w, ya, yb, step = 11, col = '#77736a') => { g.fillStyle = col; for (let y = ya; y < yb; y += step) g.fillRect(x, y, (R() < .16 ? .45 + R() * .4 : 1) * w, 4.5); };
      paper(A);
      txt(g, '日报', 80, 46, 64, '#c3291f');
      g.fillStyle = '#8b8577'; for (let i = 0; i < 3; i++) g.fillRect(166, 26 + i * 14, 110 + R() * 190, 6);
      g.fillStyle = '#1d1b18'; g.fillRect(14, 86, 484, 4); g.fillRect(14, 94, 484, 1.5);
      txt(g, '垃圾分类 从我做起', 16, 122, 34, '#1d1b18', { align: 'left' });
      g.fillStyle = '#9a978d'; g.fillRect(16, 148, 198, 122);
      g.fillStyle = '#c9c6bb'; g.beginPath(); g.arc(170, 182, 18, 0, TAU); g.fill();
      poly(g, [[16, 270], [70, 200], [110, 238], [150, 208], [214, 270]], '#6f6c63');
      lines(230, 124, 150, 346); lines(366, 132, 150, 346); lines(16, 198, 282, 346);
      g.fillStyle = '#e6decb'; g.fillRect(0, B[1], 512, B[3] - B[1]); for (let y = B[1] + 1; y < B[3]; y += 3) { g.fillStyle = `rgba(110,98,76,${.25 + R() * .2})`; g.fillRect(0, y, 512, 1); }
      paper(C); lines(14, 150, 414, 506, 10); lines(176, 150, 414, 506, 10);
      g.fillStyle = '#d8453a'; g.fillRect(340, 418, 158, 84); txt(g, '大促', 419, 460, 40, '#fff4d0');
      const mat = std({ map: tex(c), roughness: .88 });
      add(xf(atlasBox(1.0, .05, .7, 1, .012, [B, B, A, C, B, B], W, H), { p: [0, .025, 0] }), mat);
      add(xf(atlasBox(.97, .05, .68, 1, .012, [B, B, C, C, B, B], W, H), { p: [.035, -.0255, .03], r: [0, .13, 0] }), mat);
      return { shape: cuboid([.97, 1, .97]) };
    },

    carton(R, add) {
      const W = 512, H = 256, c = cvs(W, H), g = c.getContext('2d');
      const K = [0, 0, 256, 128], I = [256, 0, 512, 128], F = [0, 128, 256, 256], T = [256, 128, 512, 256];
      const kraft = ([x0, y0, x1, y1], dark) => {
        const w = x1 - x0, h = y1 - y0; g.fillStyle = dark ? '#a9773f' : '#cc9c5f'; g.fillRect(x0, y0, w, h);
        grain(g, R, x0, y0, w, h, w * h / 16, '96,56,22', '255,236,200', .16);
        g.lineCap = 'round'; for (let i = 0; i < w * h / 150; i++) { const x = x0 + R() * w, y = y0 + R() * h; g.strokeStyle = `rgba(105,65,30,${R() * .09})`; g.lineWidth = R() * 1.2; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (R() - .5) * 8, y + 6 + R() * 24); g.stroke(); }
        const gr = g.createLinearGradient(0, y0, 0, y1); gr.addColorStop(0, `rgba(60,32,10,${dark ? .04 : 0})`); gr.addColorStop(1, `rgba(60,32,10,${dark ? .32 : .1})`); g.fillStyle = gr; g.fillRect(x0, y0, w, h);
      };
      kraft(K); kraft(I, true); kraft(F); kraft(T);
      g.save(); g.translate(172, 190); g.rotate(-.04);
      g.shadowColor = 'rgba(60,30,8,.3)'; g.shadowBlur = 5; g.shadowOffsetY = 2; g.fillStyle = '#fbf8f1'; rr(g, -64, -44, 128, 88, 6); g.fill(); g.shadowColor = 'transparent';
      g.fillStyle = '#e2503f'; rr(g, -64, -44, 128, 20, 6); g.fill(); g.fillRect(-64, -32, 128, 8);
      txt(g, '快递', -30, -34, 14, '#ffffff'); g.fillStyle = '#9b8c7c'; g.fillRect(-56, -14, 70, 6); g.fillRect(-56, -4, 52, 6);
      g.fillStyle = '#26190e'; for (let i = 0; i < 26; i++) g.fillRect(-56 + i * 4.3, 10, i % 3 ? 1.6 : 3, 24);
      g.restore();
      for (const dx of [0, 22]) poly(g, [[40 + dx, 160], [52 + dx, 174], [45 + dx, 174], [45 + dx, 196], [35 + dx, 196], [35 + dx, 174], [28 + dx, 174]], 'rgba(55,32,12,.5)');
      g.fillRect(26, 202, 50, 4);
      g.fillStyle = 'rgba(238,216,162,.88)'; g.beginPath(); g.moveTo(256, 128); g.lineTo(512, 128); for (let x = 512; x >= 256; x -= 8) g.lineTo(x, 160 + (R() - .5) * 12); g.closePath(); g.fill();
      g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(256, 134, 256, 4);
      const mat = std({ map: tex(c), roughness: .86 });
      const w = .62, h = .32, d = .46, t = .028, fl = .2, fs = .17;
      const box = (sx, sy, sz, f, p) => add(xf(atlasBox(sx, sy, sz, 1, .008, f, W, H), { p }), mat);
      box(w - 2 * t, t, d - 2 * t, [K, K, I, K, K, K], [0, t / 2, 0]);   // 底板夹在四面墙之间，和墙底不重叠（避免从下面看闪烁）
      box(w, h, t, [K, K, K, K, F, I], [0, h / 2, d / 2 - t / 2]);
      box(w, h, t, [K, K, K, K, I, K], [0, h / 2, -d / 2 + t / 2]);
      box(t, h, d - 2 * t, [K, I, K, K, K, K], [w / 2 - t / 2, h / 2, 0]);
      box(t, h, d - 2 * t, [I, K, K, K, K, K], [-w / 2 + t / 2, h / 2, 0]);
      const flap = (sx, sy, sz, f, hinge, rot) => { const geo = atlasBox(sx, sy, sz, 1, .006, f, W, H); geo.translate(0, sy / 2, 0); add(xf(geo, { p: hinge, r: rot }), mat); };
      flap(w - .012, fl, .016, [K, K, K, K, T, I], [0, h - .006, d / 2 - .012], [.72, 0, 0]);
      flap(w - .012, fl, .016, [K, K, K, K, I, T], [0, h - .006, -d / 2 + .012], [-.6, 0, 0]);
      flap(.016, fs, d - .07, [T, I, K, K, K, K], [w / 2 - .012, h - .006, 0], [0, 0, -.42]);
      flap(.016, fs, d - .07, [I, T, K, K, K, K], [-w / 2 + .012, h - .006, 0], [0, 0, .5]);
      return { shape: cuboid([.98, 1, .98]) };
    },

    glass(R, add) {
      const y0 = -.575;
      add(lathe([[0, y0 + .04], [.1, y0 + .022], [.168, y0], [.192, y0 + .016], [.2, y0 + .055], [.2, 0], [.194, .065], [.172, .135], [.132, .195], [.097, .245], [.081, .3], [.074, .36], [.074, .468], [.085, .478], [.085, .498], [.075, .504]], 22),
        phys({ color: 0x2a9a48, transparent: true, opacity: .74, roughness: .04, clearcoat: 1, clearcoatRoughness: .03, side: THREE.DoubleSide }));
      add(lathe([[.072, .493], [.089, .495], [.092, .528], [.086, .544], [.062, .55], [0, .551]], 20), phys({ color: 0xe3bb4c, metalness: 1, roughness: .3 }));
      const W = 512, H = 160, c = cvs(W, H), g = c.getContext('2d');
      const gr = g.createLinearGradient(0, 0, 0, 120); gr.addColorStop(0, '#f8eed2'); gr.addColorStop(1, '#ead9b0'); g.fillStyle = gr; g.fillRect(0, 0, W, 120);
      g.fillStyle = '#c9a227'; g.fillRect(0, 6, W, 4); g.fillRect(0, 110, W, 4);
      for (const x of [128, 384]) { g.fillStyle = '#c3242c'; g.beginPath(); g.ellipse(x, 60, 70, 40, 0, 0, TAU); g.fill(); g.strokeStyle = '#e8c65a'; g.lineWidth = 4; g.stroke(); txt(g, '啤酒', x, 60, 40, '#ffffff'); }
      g.fillStyle = '#c3242c'; g.fillRect(0, 128, W, 32); g.fillStyle = '#e8c65a'; g.fillRect(0, 130, W, 4); g.fillRect(0, 154, W, 4);
      for (const x of [64, 192, 320, 448]) txt(g, '冰爽', x, 145, 16, '#ffffff');
      const lab = phys({ map: tex(c), roughness: .5, clearcoat: .3 });
      add(remapUV(xf(new THREE.CylinderGeometry(.204, .204, .3, 22, 1, true), { p: [0, -.2, 0] }), [0, 0, W, 120], W, H), lab);
      add(remapUV(xf(new THREE.CylinderGeometry(.078, .078, .09, 14, 1, true), { p: [0, .39, 0] }), [0, 128, W, 160], W, H), lab);
      return { shape: cyl() };
    },

    shirt(R, add) {
      const pts = [[0, -.335], [.205, -.335], [.232, -.31], [.228, .085], [.345, .02], [.405, .158], [.165, .272], [.092, .292]];
      const s = new THREE.Shape(); s.moveTo(...pts[0]); for (let i = 1; i < pts.length; i++) s.lineTo(...pts[i]);
      s.quadraticCurveTo(.075, .215, 0, .214); s.quadraticCurveTo(-.075, .215, -.092, .292);
      for (let i = pts.length - 2; i >= 1; i--) s.lineTo(-pts[i][0], pts[i][1]);
      s.closePath();
      const { geo, box } = extrudeFlat(s, .06, .042, { bevelSegments: 3, curveSegments: 6 });
      const W = 256, H = Math.round(W * (box[3] - box[1]) / (box[2] - box[0])), c = cvs(W, H), g = c.getContext('2d');
      const X = x => (x - box[0]) / (box[2] - box[0]) * W, Y = y => (1 - (y - box[1]) / (box[3] - box[1])) * H;
      g.fillStyle = '#1fae9c'; g.fillRect(0, 0, W, H);
      const rg = g.createRadialGradient(W / 2, H * .45, 10, W / 2, H * .5, W * .62); rg.addColorStop(0, 'rgba(255,255,255,.14)'); rg.addColorStop(1, 'rgba(0,40,40,.2)'); g.fillStyle = rg; g.fillRect(0, 0, W, H);
      grain(g, R, 0, 0, W, H, 2600, '0,60,55', '220,255,250', .12);
      g.lineCap = 'round'; g.strokeStyle = '#1d7f75'; g.lineWidth = 11;
      g.beginPath(); g.moveTo(X(.1), Y(.29)); g.quadraticCurveTo(X(.075), Y(.205), X(0), Y(.2)); g.quadraticCurveTo(X(-.075), Y(.205), X(-.1), Y(.29)); g.stroke();
      g.strokeStyle = '#238b80'; g.lineWidth = 8;
      for (const k of [1, -1]) { g.beginPath(); g.moveTo(X(k * .328), Y(.048)); g.lineTo(X(k * .382), Y(.168)); g.stroke(); }
      g.fillStyle = '#238b80'; g.fillRect(X(-.225), Y(-.305), X(.225) - X(-.225), 7);
      g.fillStyle = '#fff4cf'; starPath(g, X(.01), Y(.015), 30, 13); g.fill();
      g.save(); g.translate(X(-.13), Y(-.2)); g.rotate(-.2); g.fillStyle = '#f2b544'; g.fillRect(-15, -12, 30, 24); g.setLineDash([3, 3]); g.strokeStyle = '#7a4a10'; g.lineWidth = 1.6; g.strokeRect(-11.5, -8.5, 23, 17); g.restore();
      g.lineWidth = 3; for (let i = 0; i < 7; i++) { const x = X(-.2 + R() * .4), y = Y(-.28 + R() * .45); g.strokeStyle = R() < .5 ? 'rgba(0,55,50,.13)' : 'rgba(255,255,255,.11)'; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 14, y - 6 + R() * 12, x + 22 + R() * 14, y + (R() - .5) * 10); g.stroke(); }
      add(geo, phys({ map: tex(c), roughness: .9, sheen: .4, sheenRoughness: .6, sheenColor: new THREE.Color(0x8fe8dc) }));
      return { shape: cuboid([.96, 1, .96]) };
    },

    /* ---- 有害垃圾 ---- */
    battery(R, add) {
      const c = cvs(512, 256), g = c.getContext('2d');
      let gr = g.createLinearGradient(0, 0, 0, 150); gr.addColorStop(0, '#41d175'); gr.addColorStop(1, '#22a052'); g.fillStyle = gr; g.fillRect(0, 0, 512, 150);
      gr = g.createLinearGradient(0, 150, 0, 256); gr.addColorStop(0, '#31363b'); gr.addColorStop(1, '#1d2024'); g.fillStyle = gr; g.fillRect(0, 150, 512, 106);
      g.fillStyle = '#e9edf0'; g.fillRect(0, 147, 512, 4); g.fillStyle = 'rgba(255,255,255,.8)'; g.fillRect(0, 0, 512, 5);
      for (const x of [128, 384]) { txt(g, '充电电池', x, 76, 31, '#ffffff', { rot: -Math.PI / 2, stroke: 'rgba(0,60,25,.45)', lw: 4 }); txt(g, 'Ni-MH', x, 204, 25, '#ffffff', { rot: -Math.PI / 2, weight: 800 }); }
      for (const x of [0, 256, 512]) { bolt(g, x, 76, 92, -Math.PI / 2, '#ffd83c'); txt(g, '1.2V', x, 204, 20, '#d8dde2', { rot: -Math.PI / 2, weight: 700 }); }
      txt(g, '+', 128, 16, 22, '#ffffff', { rot: -Math.PI / 2 }); txt(g, '+', 384, 16, 22, '#ffffff', { rot: -Math.PI / 2 });
      const metal = phys({ color: 0xdadfe4, metalness: 1, roughness: .22 });
      add(xf(new THREE.CylinderGeometry(.17, .17, .54, 24, 1, true), { p: [0, -.02, 0] }), phys({ map: tex(c), roughness: .32, clearcoat: .9, clearcoatRoughness: .15 }));
      add(lathe([[0, -.31], [.14, -.31], [.162, -.304], [.17, -.29]], 24), metal);
      add(lathe([[.17, .25], [.163, .266], [.148, .273], [.072, .273], [.065, .277], [.063, .302], [.056, .31], [0, .31]], 24), metal);
      return { shape: cyl() };
    },

    tube(R, add) {
      const c = cvs(32, 256), g = c.getContext('2d');
      g.fillStyle = '#fbfdff'; g.fillRect(0, 0, 32, 256);
      for (const [y0, dir] of [[0, 1], [256, -1]]) { const gr = g.createLinearGradient(0, y0, 0, y0 + dir * 36); gr.addColorStop(0, 'rgba(112,104,92,.8)'); gr.addColorStop(.45, 'rgba(150,142,130,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, Math.min(y0, y0 + dir * 36), 32, 36); }
      const t = tex(c);
      add(new THREE.CylinderGeometry(.08, .08, 1.12, 18, 1, true), phys({ map: t, emissive: 0xe4f3ff, emissiveMap: t, emissiveIntensity: .5, roughness: .22, clearcoat: 1, clearcoatRoughness: .08 }));
      const alu = std({ color: 0xcfd4da, metalness: .9, roughness: .3 });
      add(lathe([[.079, .552], [.088, .558], [.088, .598], [.083, .608], [.036, .61], [0, .61]], 18), alu);
      add(lathe([[0, -.61], [.036, -.61], [.083, -.608], [.088, -.598], [.088, -.558], [.079, -.552]], 18), alu);
      for (const sy of [1, -1]) for (const sx of [-1, 1]) add(xf(new THREE.CylinderGeometry(.011, .011, .05, 6), { p: [sx * .032, sy * .628, 0] }), alu);
      return { shape: capsule(.088) };
    },

    medicine(R, add) {
      const W = 512, H = 512, c = cvs(W, H), g = c.getContext('2d');
      const FR = [0, 0, 512, 256], TP = [0, 256, 360, 512], SD = [360, 256, 512, 362], SD2 = [360, 366, 512, 472], WH = [366, 480, 506, 508];
      g.fillStyle = '#fbfbf7'; g.fillRect(0, 0, W, H);
      const green = '#16955a', dg = '#0f6e43';
      g.fillStyle = green; g.fillRect(0, 0, 150, 256); plus(g, 75, 120, 96, 30, '#ffffff');
      txt(g, '药', 252, 118, 122, dg);
      g.fillStyle = '#9aa29e'; for (let i = 0; i < 4; i++) g.fillRect(332, 62 + i * 24, 140 - (i % 2) * 44, 9);
      g.fillStyle = green; g.fillRect(150, 228, 362, 28);
      g.save(); g.translate(402, 176); g.rotate(-.22); g.strokeStyle = 'rgba(214,40,32,.92)'; g.lineWidth = 7; rr(g, -72, -32, 144, 64, 10); g.stroke(); txt(g, '过期', 0, 2, 46, 'rgba(214,40,32,.92)'); g.restore();
      g.fillStyle = green; g.fillRect(0, 256, 40, 256); g.beginPath(); g.arc(118, 384, 58, 0, TAU); g.fill(); plus(g, 118, 384, 76, 26, '#ffffff');
      txt(g, '药品', 262, 362, 60, dg); g.fillStyle = '#a3aaa6'; for (let i = 0; i < 3; i++) g.fillRect(196, 412 + i * 22, 132 - i * 24, 9);
      for (const r of [SD, SD2]) { g.fillStyle = green; g.fillRect(r[0], r[1], 152, 24); g.fillStyle = '#a3aaa6'; for (let i = 0; i < 3; i++) g.fillRect(r[0] + 16, r[1] + 40 + i * 18, 100 - i * 18, 7); }
      g.fillStyle = '#3a3f3c'; rr(g, 386, 404, 100, 36, 6); g.fill();
      const box = phys({ map: tex(c), roughness: .5, clearcoat: .45 });
      add(atlasBox(.56, .28, .4, 2, .026, [SD2, SD, TP, TP, FR, FR], W, H), box);
      const m = new THREE.Matrix4().compose(new V3(.33, -.012, .02), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, .16, -.07)), new V3(1, 1, 1));
      add(new RoundedBoxGeometry(.27, .014, .2, 1, .005).applyMatrix4(m), phys({ color: 0xd3dae1, metalness: .9, roughness: .26 }));
      const wu = (WH[0] + WH[2]) / 2 / W, wv = 1 - (WH[1] + WH[3]) / 2 / H;
      for (const [px, pz] of [[-.07, -.05], [0, -.05], [.07, -.05], [-.07, .05], [0, .05], [.07, .05]]) add(fillUV(new THREE.SphereGeometry(.031, 8, 4, 0, TAU, 0, Math.PI / 2).scale(1, .8, 1).translate(px, .006, pz).applyMatrix4(m), wu, wv), box);
      return { shape: cuboid([.96, 1, .96]) };
    },

    paint(R, add) {
      const c = cvs(512, 114), g = c.getContext('2d');
      const band = (y, h) => { const gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, '#dfe4e8'); gr.addColorStop(.5, '#aeb6bd'); gr.addColorStop(1, '#c9d0d6'); g.fillStyle = gr; g.fillRect(0, y, 512, h); };
      g.fillStyle = '#fbfaf6'; g.fillRect(0, 0, 512, 114); band(0, 13); band(101, 13);
      for (const ox of [0, 256]) {
        g.lineCap = 'round'; ['#e8423b', '#f5b82c', '#3cb96a', '#2f7de0'].forEach((col, k) => { g.strokeStyle = col; g.lineWidth = 11; g.beginPath(); g.arc(ox + 64, 104, 66 - k * 13, Math.PI * 1.05, Math.PI * 1.95); g.stroke(); });
        txt(g, '油漆', ox + 186, 50, 40, '#1c3b6e'); txt(g, 'PAINT', ox + 186, 82, 15, '#5b6b84', { weight: 800 });
      }
      add(xf(new THREE.CylinderGeometry(.3, .3, .42, 32, 1, true), { p: [0, -.01, 0] }), phys({ map: tex(c), metalness: .3, roughness: .4, clearcoat: .6 }));
      const metal = std({ color: 0xc3cad0, metalness: .85, roughness: .32 });
      add(lathe([[0, -.245], [.27, -.245], [.3, -.238], [.309, -.222], [.3, -.208]], 24), metal);
      // 桶口的卷边被溢出的油漆整个盖住，所以不单独建模
      const blue = phys({ color: 0x2b80e4, roughness: .1, clearcoat: 1, clearcoatRoughness: .04 });
      add(lathe([[.299, .168], [.316, .178], [.322, .2], [.32, .222], [.307, .238], [.277, .25], [.22, .257], [.12, .26], [0, .261]], 28), blue);
      for (const [ph, len] of [[.35, .17], [1.3, .09], [2.45, .23], [3.7, .12], [4.9, .15], [5.6, .07]]) {
        const a = ph + (R() - .5) * .2;
        add(xf(new THREE.CapsuleGeometry(.03, len, 2, 6), { p: [Math.sin(a) * .303, .19 - len / 2, Math.cos(a) * .303], r: [0, a - Math.PI / 2, 0], s: [.55, 1, 1] }), blue);
      }
      const pts = [], tilt = 1.0; for (let i = 0; i <= 12; i++) { const a = i / 12 * Math.PI, x = -Math.cos(a) * .33, yy = Math.sin(a) * .33; pts.push([x, .17 + yy * Math.cos(tilt), -yy * Math.sin(tilt)]); }
      add(tube(pts, .012, 18, 5), metal);
      for (const k of [-1, 1]) add(xf(new THREE.BoxGeometry(.03, .06, .05), { p: [k * .312, .17, 0] }), metal);
      return { shape: cyl() };
    },

    thermo(R, add) {
      add(lathe([[0, -.45], [.048, -.442], [.08, -.414], [.095, -.375], [.09, -.33], [.072, -.298], [.073, -.278], [.073, .418], [.064, .44], [.035, .45], [0, .451]], 18),
        phys({ color: 0xdff2ff, transparent: true, opacity: .34, roughness: .03, clearcoat: 1, side: THREE.DoubleSide }));
      const silver = phys({ color: 0xe3e8ed, metalness: 1, roughness: .12 });
      add(xf(new THREE.SphereGeometry(.068, 12, 8), { p: [0, -.375, 0], s: [1, 1.2, 1] }), silver);
      add(xf(new THREE.CylinderGeometry(.017, .017, .48, 6, 1, true), { p: [0, -.1, .018] }), silver);
      const W = 64, H = 520, c = cvs(W, H), g = c.getContext('2d');
      g.fillStyle = '#fcfcfa'; g.fillRect(0, 0, W, H);
      const step = 58.5;
      for (let k = 0; k <= 70; k++) { const y = 490 - k * step / 10; g.fillStyle = '#2c2f33'; g.fillRect(4, y - 1, k % 10 === 0 ? 26 : k % 5 === 0 ? 18 : 11, k % 10 === 0 ? 2.6 : 1.4); if (k % 10 === 0) txt(g, String(35 + k / 10), 46, y, 15, '#2c2f33', { rot: -Math.PI / 2, weight: 800 }); }
      g.fillStyle = 'rgba(224,48,42,.85)'; g.fillRect(56, 490 - 7 * step, 6, 4.5 * step);   // 37.5° 以上的发烧红区
      poly(g, [[30, 490 - 2 * step - 6], [40, 490 - 2 * step], [30, 490 - 2 * step + 6]], '#e0302a');
      g.fillStyle = '#fcfcfa'; g.fillRect(0, 512, W, 8);
      const SC = [0, 0, 64, 512], WH = [0, 513, 64, 519];
      add(xf(atlasBox(.088, .66, .008, 0, 0, [WH, WH, WH, WH, SC, WH], W, H), { p: [0, .06, -.016] }), std({ map: tex(c), roughness: .45 }));
      return { shape: capsule(.095) };
    },

    spray(R, add) {
      const c = cvs(512, 232), g = c.getContext('2d');
      const gr = g.createLinearGradient(0, 0, 512, 0); for (let k = 0; k <= 4; k++) gr.addColorStop(k / 4, k % 2 ? '#ffe04a' : '#ffcc12'); g.fillStyle = gr; g.fillRect(0, 0, 512, 232);
      g.fillStyle = '#e3352a'; g.fillRect(0, 0, 512, 30); g.fillRect(0, 204, 512, 28); g.fillStyle = '#ffffff'; g.fillRect(0, 30, 512, 4); g.fillRect(0, 200, 512, 4);
      for (const ox of [0, 256]) {
        const cx = ox + 70, cy = 116;
        g.save(); g.translate(cx, cy); g.rotate(-.5);
        g.strokeStyle = '#3d2412'; g.lineWidth = 4; g.lineCap = 'round';
        for (const k of [-1, 1]) for (const [y, l] of [[-12, 30], [0, 34], [12, 30]]) { g.beginPath(); g.moveTo(0, y); g.lineTo(k * l, y + k * 4 + (y > 0 ? 10 : y < 0 ? -8 : 0)); g.stroke(); }
        g.beginPath(); g.moveTo(-5, -30); g.quadraticCurveTo(-14, -48, -26, -54); g.moveTo(5, -30); g.quadraticCurveTo(14, -48, 26, -54); g.stroke();
        g.fillStyle = '#6b3a1c'; g.beginPath(); g.ellipse(0, 6, 17, 28, 0, 0, TAU); g.fill(); g.fillStyle = '#4a2812'; g.beginPath(); g.ellipse(0, -26, 11, 9, 0, 0, TAU); g.fill();
        g.fillStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.ellipse(-6, -2, 4, 12, -.2, 0, TAU); g.fill();
        g.restore();
        g.strokeStyle = '#e3352a'; g.lineWidth = 10; g.beginPath(); g.arc(cx, cy, 54, 0, TAU); g.stroke(); g.beginPath(); g.moveTo(cx - 38, cy - 38); g.lineTo(cx + 38, cy + 38); g.stroke();
        txt(g, '杀虫剂', ox + 186, 104, 44, '#d92a22', { stroke: '#ffffff', lw: 7 });
        txt(g, '灭蚊 灭蟑', ox + 186, 150, 21, '#3a2a10');
      }
      add(xf(new THREE.CylinderGeometry(.17, .17, .48, 24, 1, true), { p: [0, -.09, 0] }), phys({ map: tex(c), metalness: .25, roughness: .3, clearcoat: .9 }));
      const metal = phys({ color: 0xd6dce2, metalness: 1, roughness: .25 }), red = phys({ color: 0xe0352b, roughness: .35, clearcoat: .6 });
      add(lathe([[0, -.326], [.11, -.347], [.15, -.352], [.167, -.345], [.17, -.33]], 24), metal);
      add(lathe([[.17, .15], [.169, .168], [.156, .208], [.122, .243], [.083, .261], [.076, .27], [.069, .281], [0, .282]], 24), metal);
      add(lathe([[0, .272], [.048, .272], [.051, .29], [.05, .332], [.042, .344], [0, .348]], 14), red);
      add(xf(new THREE.CylinderGeometry(.013, .013, .06, 8), { p: [0, .322, .065], r: [Math.PI / 2, 0, 0] }), red);
      return { shape: cyl() };
    },

    /* ---- 厨余垃圾 ---- */
    banana(R, add) {
      const c = cvs(256, 256), g = c.getContext('2d');
      const gr = g.createLinearGradient(0, 0, 0, 236); gr.addColorStop(0, '#5e3c12'); gr.addColorStop(.08, '#b8861c'); gr.addColorStop(.17, '#f2c01a'); gr.addColorStop(.7, '#f6c81e'); gr.addColorStop(1, '#cdbf2c'); g.fillStyle = gr; g.fillRect(0, 0, 256, 236);
      const eg = g.createLinearGradient(0, 0, 256, 0); eg.addColorStop(0, 'rgba(150,100,10,.35)'); eg.addColorStop(.18, 'rgba(150,100,10,0)'); eg.addColorStop(.82, 'rgba(150,100,10,0)'); eg.addColorStop(1, 'rgba(150,100,10,.35)'); g.fillStyle = eg; g.fillRect(0, 0, 256, 236);
      for (let i = 0; i < 70; i++) { const x = R() * 256, y = 18 + R() * 205, rx = 1.5 + R() * 5.5; g.fillStyle = `rgba(${85 + R() * 30},${52 + R() * 18},12,${.55 + R() * .4})`; g.beginPath(); g.ellipse(x, y, rx, rx * (.5 + R() * .5), R() * 3, 0, TAU); g.fill(); }
      g.strokeStyle = 'rgba(160,110,10,.35)'; g.lineWidth = 2.5; for (const x of [64, 128, 192]) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 236); g.stroke(); }
      g.fillStyle = '#3e2810'; g.fillRect(0, 238, 256, 18);
      const outer = phys({ map: tex(c), roughness: .55, clearcoat: .15 }), inner = phys({ color: 0xf2df8e, roughness: .8 });
      const uvTop = (u, v) => [u, 1 - (236 - v * 220) / 256];
      [[.2, .36], [1.78, .31], [3.3, .35], [4.82, .3]].forEach(([ang, L], k) => {
        const ca = Math.cos(ang), sa = Math.sin(ang), lift = k * .004;
        const fn = (u, v) => {
          const s = u * 2 - 1, t = v, w = (.036 + .08 * Math.sin(Math.PI * t)) * (1 - t ** 4);
          const x = .045 + L * t, fall = Math.min(1, t / .62);
          const y = .19 * Math.pow(Math.cos(fall * Math.PI / 2), 1.25) + .014 + .045 * Math.max(0, (t - .84) / .16) ** 2 - .5 * s * s * w * (1 - .4 * t) + lift;
          const z = s * w; return [x * ca + z * sa, y, -x * sa + z * ca];
        };
        const { top, bot, edge } = shell(5, 9, fn, .015, { uvTop });
        add(top, outer); add(bot, inner); add(edge, inner);
      });
      add(lathe([[.062, .04], [.06, .15], [.052, .186], [.035, .205], [0, .212]], 16, { v0: .1, v1: .32 }), outer);
      add(lathe([[0, .2], [.03, .204], [.033, .222], [.023, .238], [0, .242]], 10, { v0: .005, v1: .06 }), outer);
      return { shape: cuboid([.95, 1, .95]) };
    },

    apple(R, add) {
      const prof = [[0, -.272], [.045, -.279], [.1, -.276], [.155, -.258], [.195, -.226], [.212, -.19], [.206, -.152], [.172, -.122], [.13, -.088], [.104, -.04], [.096, .01], [.102, .06], [.128, .103], [.172, .136], [.205, .162], [.222, .198], [.214, .235], [.18, .262], [.12, .276], [.055, .268], [.02, .255], [0, .25]];
      const bite = [0, 0, 0, 0, 0, 0, .25, .8, 1, 1, 1, 1, 1, .8, .25, 0, 0, 0, 0, 0, 0, 0], NB = 6;
      const L = [0]; for (let j = 1; j < prof.length; j++) L[j] = L[j - 1] + Math.hypot(prof[j][0] - prof[j - 1][0], prof[j][1] - prof[j - 1][1]);
      const vj = j => L[j] / L[L.length - 1];
      const W = 256, H = 288, c = cvs(W, H), g = c.getContext('2d'), yOf = v => (1 - v) * 256;
      const vLo = (vj(6) + vj(7)) / 2, vHi = (vj(13) + vj(14)) / 2;
      g.fillStyle = '#f6e6b4'; g.fillRect(0, 0, W, 256);
      const core = g.createLinearGradient(0, yOf(vHi), 0, yOf(vLo)); core.addColorStop(0, 'rgba(232,196,128,.9)'); core.addColorStop(.18, 'rgba(246,230,180,0)'); core.addColorStop(.82, 'rgba(246,230,180,0)'); core.addColorStop(1, 'rgba(232,196,128,.9)'); g.fillStyle = core; g.fillRect(0, yOf(vHi), W, yOf(vLo) - yOf(vHi));
      g.fillStyle = 'rgba(214,190,140,.55)'; g.fillRect(0, yOf((vLo + vHi) / 2) - 9, W, 18);
      const skin = (yEdge, dir) => {
        g.beginPath(); g.moveTo(0, dir > 0 ? 256 : 0);
        for (let x = 0; x <= W; x += 4) { const u = x / W, sc = 1 - Math.abs(Math.sin(NB * Math.PI * u)); g.lineTo(x, yEdge - dir * (5 + 7 * sc)); }
        g.lineTo(W, dir > 0 ? 256 : 0); g.closePath();
        const gr = g.createLinearGradient(0, dir > 0 ? 256 : 0, 0, yEdge); gr.addColorStop(0, '#b81f22'); gr.addColorStop(.7, '#de3a33'); gr.addColorStop(1, '#ef5845'); g.fillStyle = gr; g.fill();
      };
      skin(yOf(vLo), 1); skin(yOf(vHi), -1);
      g.strokeStyle = 'rgba(255,214,150,.5)'; g.lineWidth = 2; for (let i = 0; i < 26; i++) { const x = R() * W, y = R() < .5 ? R() * (yOf(vHi) - 14) : yOf(vLo) + 14 + R() * (240 - yOf(vLo)); g.beginPath(); g.moveTo(x, y); g.lineTo(x + (R() - .5) * 3, y + 6 + R() * 10); g.stroke(); }
      dots(g, R, 0, 0, W, yOf(vHi) - 16, 30, '#ffd986', .8, 1.6, .5, .9); dots(g, R, 0, yOf(vLo) + 16, W, 236 - yOf(vLo), 30, '#ffd986', .8, 1.6, .5, .9);
      for (const u of [.12, .45, .79]) { const x = u * W, y = yOf((vLo + vHi) / 2); g.fillStyle = '#4a2814'; g.beginPath(); g.ellipse(x, y, 6, 10, .3, 0, TAU); g.fill(); g.fillStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.ellipse(x - 2, y - 3, 1.5, 3, .3, 0, TAU); g.fill(); }
      g.fillStyle = '#5a3a1e'; g.fillRect(0, 244, W, 12); g.fillStyle = '#7a2a1c'; g.fillRect(0, 0, W, 7);
      g.fillStyle = '#6b4423'; g.fillRect(0, 256, 128, 32); g.fillStyle = '#4caf3e'; g.fillRect(128, 256, 128, 32);
      const mat = phys({ map: tex(c), roughness: .42, clearcoat: .45 });
      add(lathe(prof, 26, { v0: 32 / 288, v1: 1, mod: (ph, j, r, y) => [r * (1 + .2 * bite[j] * (1 - Math.abs(Math.sin(NB * ph / 2)))), y] }), mat);
      add(fillUV(tube([[0, .24, 0], [.006, .3, 0], [.026, .35, .004], [.042, .385, .01]], t => .017 - .005 * t, 6, 6), 64 / W, 1 - 272 / H), mat);
      const { top, bot, edge } = shell(4, 6, (u, v) => { const s = u * 2 - 1, w = .062 * Math.pow(Math.sin(Math.PI * v), .8); return [.03 + .16 * v, .345 + .05 * v + .025 * s * s - .02 * v * v, s * w]; }, .008);
      for (const geo of [top, bot, edge]) add(xf(fillUV(geo, 192 / W, 1 - 272 / H), { r: [0, -.5, 0] }), mat);
      return { shape: cyl(.95) };
    },

    fishbone(R, add) {
      const W = 256, H = 128, c = cvs(W, H), g = c.getContext('2d');
      g.fillStyle = '#f3e9d2'; g.fillRect(0, 0, W, H);
      const hs = new THREE.Shape(); hs.moveTo(-.45, .014); hs.lineTo(-.418, 0); hs.lineTo(-.45, -.014);
      hs.quadraticCurveTo(-.43, -.105, -.3, -.13); hs.quadraticCurveTo(-.22, -.138, -.19, -.112); hs.quadraticCurveTo(-.235, 0, -.19, .112); hs.quadraticCurveTo(-.22, .138, -.3, .13); hs.quadraticCurveTo(-.43, .105, -.45, .014);
      const head = extrudeFlat(hs, .045, .03, { bevelSegments: 2, curveSegments: 5 }), HR = [0, 0, 176, 128], hb = head.box;
      const X = x => HR[0] + (x - hb[0]) / (hb[2] - hb[0]) * (HR[2] - HR[0]), Y = y => HR[1] + (1 - (y - hb[1]) / (hb[3] - hb[1])) * (HR[3] - HR[1]);
      const hg = g.createRadialGradient(X(-.33), Y(0), 4, X(-.33), Y(0), 70); hg.addColorStop(0, '#fbf4e2'); hg.addColorStop(1, '#e9dcbc'); g.fillStyle = hg; g.fillRect(0, 0, 176, 128);
      g.fillStyle = '#4a3a2c'; g.beginPath(); g.arc(X(-.34), Y(-.035), 9, 0, TAU); g.fill(); g.fillStyle = '#f3e9d2'; g.beginPath(); g.arc(X(-.345), Y(-.03), 3, 0, TAU); g.fill();
      g.strokeStyle = 'rgba(150,120,80,.55)'; g.lineWidth = 3; g.beginPath(); g.moveTo(X(-.25), Y(.1)); g.quadraticCurveTo(X(-.285), Y(0), X(-.25), Y(-.1)); g.stroke();
      g.strokeStyle = 'rgba(150,120,80,.4)'; g.lineWidth = 2; g.beginPath(); g.moveTo(X(-.44), Y(-.005)); g.lineTo(X(-.4), Y(-.03)); g.stroke();
      const mat = phys({ map: tex(c), roughness: .5, clearcoat: .25 }), pu = 216 / W, pv = .5;
      add(remapUV(head.geo, HR, W, H), mat);
      add(fillUV(tube([[-.22, -.01, 0], [0, -.01, .008], [.2, -.012, -.006], [.34, -.014, 0]], .022, 12, 6), pu, pv), mat);
      for (let k = 0; k < 6; k++) {
        const x = -.135 + k * .076, L = .17 - k * .019;
        for (const sz of [1, -1]) add(fillUV(tube([[x, -.012, 0], [x + .02, -.012, sz * L * .45], [x + .05, -.014, sz * L * .8], [x + .082, -.02, sz * L]], t => .016 - .008 * t, 5, 5), pu, pv), mat);
      }
      const ts = new THREE.Shape(); ts.moveTo(.31, 0); ts.quadraticCurveTo(.37, .1, .43, .15); ts.lineTo(.462, .14); ts.quadraticCurveTo(.42, .07, .395, 0); ts.quadraticCurveTo(.42, -.07, .462, -.14); ts.lineTo(.43, -.15); ts.quadraticCurveTo(.37, -.1, .31, 0);
      add(xf(fillUV(extrudeFlat(ts, .02, .015, { bevelSegments: 2, curveSegments: 5 }).geo, pu, pv), { p: [0, -.026, 0] }), mat);
      return { shape: cuboid([.98, 1, .96]) };
    },

    melon(R, add) {
      const W = 512, H = 256, c = cvs(W, H), g = c.getContext('2d');
      const A = [0, 0, 256, 256], B = [256, 0, 512, 160], C = [256, 168, 512, 256];
      g.fillStyle = '#5aa63c'; g.fillRect(0, 0, 256, 256);
      for (let k = 0; k < 7; k++) { const x0 = k * 256 / 7 + 6; g.fillStyle = '#1d5a22'; g.beginPath(); g.moveTo(x0, 0); for (let y = 0; y <= 256; y += 8) g.lineTo(x0 + 9 * Math.sin(y * .09 + k) + (R() - .5) * 5, y); for (let y = 256; y >= 0; y -= 8) g.lineTo(x0 + 18 + 9 * Math.sin(y * .09 + k + .5) + (R() - .5) * 5, y); g.closePath(); g.fill(); }
      grain(g, R, 0, 0, 256, 256, 1500, '20,60,20', '200,240,170', .15);
      const fg = g.createLinearGradient(256, 0, 256, 160); fg.addColorStop(0, '#f6525c'); fg.addColorStop(1, '#ee3f4c'); g.fillStyle = fg; g.fillRect(256, 0, 256, 160);
      grain(g, R, 256, 0, 256, 160, 1200, '200,30,40', '255,170,170', .25);
      for (let i = 0; i < 14; i++) { const x = 270 + R() * 228, y = 16 + R() * 128; g.save(); g.translate(x, y); g.rotate(R() * TAU); g.fillStyle = R() < .8 ? '#1a1210' : '#f4e9d8'; g.beginPath(); g.ellipse(0, 0, 4, 7, 0, 0, TAU); g.fill(); g.restore(); }
      const cg = g.createLinearGradient(256, 0, 512, 0);
      [[0, '#ee4b55'], [.16, '#f27a78'], [.26, '#f6e0d2'], [.34, '#f2f7e4'], [.74, '#e4f2cc'], [.82, '#9fd16e'], [.88, '#2d7d31'], [1, '#1f5f24']].forEach(([s, col]) => cg.addColorStop(s, col));
      g.fillStyle = cg; g.fillRect(256, 168, 256, 88);
      const mat = phys({ map: tex(c), roughness: .42, clearcoat: .5 });
      const R0 = .42, R1 = .55, TM = 1.2, D = .225, rOut = z => R1 - .03 * Math.pow(Math.abs(z) / D, 3);
      const at = (r, th, z) => [r * Math.sin(th), -r * Math.cos(th), z], th = u => -TM + 2 * TM * u;
      const cu = f => [(256 + f * 256) / W, 1 - 212 / H];
      add(grid(20, 6, (u, v) => { const z = -D + 2 * D * v; return at(rOut(z), th(u), z); }, { uv: rect(A, W, H) }), mat);
      add(grid(20, 2, (u, v) => at(R0, th(u), -D + 2 * D * v), { uv: rect(B, W, H), flip: true }), mat);
      for (const [zz, flip] of [[D, true], [-D, false]]) add(grid(20, 2, (u, v) => at(R0 + (rOut(zz) - R0) * v, th(u), zz), { uv: (u, v) => cu(v), flip }), mat);
      for (const [ang, flip] of [[TM, true], [-TM, false]]) add(grid(2, 6, (u, v) => { const z = -D + 2 * D * v; return at(R0 + (rOut(z) - R0) * u, ang, z); }, { uv: (u) => cu(u), flip }), mat);
      return { shape: cuboid([.96, 1, .96]) };
    },

    eggshell(R, add) {
      const c = cvs(128, 128), g = c.getContext('2d');
      const gr = g.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, '#e9bf8c'); gr.addColorStop(1, '#d49d68'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
      dots(g, R, 0, 0, 128, 128, 180, '#a8703f', .5, 1.5, .3, .7);
      const outM = phys({ map: tex(c), roughness: .55, clearcoat: .25 }), inM = phys({ color: 0xfbf7ee, roughness: .45, clearcoat: .3 });
      const half = () => {
        const N = 20, T = 6, Re = .165, He = .205, k = .9, jag = [];
        for (let i = 0; i < N; i++) jag.push((i % 2 ? .2 : -.15) + (R() - .5) * .14); jag.push(jag[0]);
        const P = (i, t, sc) => { const ph = i / N * TAU, a = t * (Math.PI / 2 + jag[i]); return [sc * Re * Math.sin(a) * Math.sin(ph), -sc * He * Math.cos(a), sc * Re * Math.sin(a) * Math.cos(ph)]; };
        const o = grid(N, T, (u, v, i) => P(i, v, 1), { seamU: true, poleV0: [0, -1, 0] });
        const n = grid(N, T, (u, v, i) => P(i, v, k), { flip: true, seamU: true, poleV0: [0, 1, 0] });
        const rim = grid(N, 1, (u, v, i, j) => P(i, 1, j ? k : 1));
        return [o, n, rim];
      };
      const a = half(), b = half();
      placeOnGround(a, { p: [-.12, 0, .02], r: [.18, 0, .12] });
      placeOnGround(b, { p: [.15, 0, -.03], r: [1.3, .75, 0] });
      for (const [o, n, rim] of [a, b]) { add(o, outM); add(n, inM); add(rim, inM); }
      return { shape: cuboid([.92, 1, .92]) };
    },

    veg(R, add) {
      const c = cvs(128, 256), g = c.getContext('2d');
      const gr = g.createLinearGradient(0, 256, 0, 0); gr.addColorStop(0, '#9bd36a'); gr.addColorStop(.3, '#4fae43'); gr.addColorStop(1, '#2d8a35'); g.fillStyle = gr; g.fillRect(0, 0, 128, 256);
      const vg = g.createLinearGradient(0, 0, 128, 0); vg.addColorStop(0, 'rgba(20,70,25,.35)'); vg.addColorStop(.25, 'rgba(20,70,25,0)'); vg.addColorStop(.75, 'rgba(20,70,25,0)'); vg.addColorStop(1, 'rgba(20,70,25,.35)'); g.fillStyle = vg; g.fillRect(0, 0, 128, 256);
      g.strokeStyle = 'rgba(205,240,170,.75)'; g.lineCap = 'round';
      for (let k = 0; k < 7; k++) { const y = 230 - k * 30; g.lineWidth = 2.6 - k * .2; for (const s of [-1, 1]) { g.beginPath(); g.moveTo(64, y); g.quadraticCurveTo(64 + s * 26, y - 12, 64 + s * 54, y - 34); g.stroke(); } }
      g.fillStyle = '#e8f4d4'; g.beginPath(); g.moveTo(52, 256); g.lineTo(76, 256); g.lineTo(65.5, 14); g.lineTo(62.5, 14); g.closePath(); g.fill();
      const leafM = phys({ map: tex(c), side: THREE.DoubleSide, roughness: .5, clearcoat: .35 }), stemM = phys({ color: 0xeff6e0, roughness: .3, clearcoat: .7 });
      for (const [yaw, sc, dy] of [[-.36, .94, 0], [.04, 1.05, .016], [.4, .9, .008]]) {
        const blade = grid(8, 12, (u, v) => { const s = u * 2 - 1, w = .165 * Math.pow(Math.sin(Math.PI * Math.min(1, .12 + .88 * v)), .7); return [.2 + .5 * v, .022 + .06 * s * s * (w / .165) + .012 * Math.sin(10 * v + 3 * s) * Math.abs(s) + .028 * Math.sin(Math.PI * v), s * w]; });
        add(xf(blade, { p: [0, dy, 0], r: [0, yaw, 0], s: [sc, 1, sc] }), leafM);
        const stem = xf(new THREE.CapsuleGeometry(.042, .2, 3, 8), { p: [.142, .026, 0], r: [0, 0, -Math.PI / 2], s: [1, 1, 1] });
        stem.scale(1, .56, 1.45);
        add(xf(stem, { p: [0, dy + .012, 0], r: [0, yaw, 0], s: [sc, 1, sc] }), stemM);
      }
      return { shape: cuboid([.95, 1, .95]) };
    },

    /* ---- 其他垃圾 ---- */
    tissue(R, add) {
      // 揉皱的纸团：二十面体细分后，按“位置”做确定性的凹折与尖角（同一顶点的几份拷贝位移一致，不会裂开），平面着色出折痕
      const geo = new THREE.IcosahedronGeometry(.26, 3), P = geo.attributes.position, v = new V3(), d = new V3();
      const dents = []; for (let k = 0; k < 30; k++) dents.push([new V3(R() * 2 - 1, R() * 2 - 1, R() * 2 - 1).normalize(), k < 20 ? -(.08 + R() * .16) : .07 + R() * .12, k < 20 ? .012 + R() * .05 : .006 + R() * .02]);
      const jit = (x, y, z) => (hashStr(`${Math.round(x * 1e4)},${Math.round(y * 1e4)},${Math.round(z * 1e4)}`) % 1000) / 1000 - .5;
      for (let i = 0; i < P.count; i++) {
        v.fromBufferAttribute(P, i); d.copy(v).normalize();
        let s = 1 + jit(v.x, v.y, v.z) * .2; for (const [cdir, a, w] of dents) s += a * Math.exp(-(1 - d.dot(cdir)) / w);
        v.copy(d).multiplyScalar(.26 * s); v.y *= .88; P.setXYZ(i, v.x, v.y, v.z);
      }
      geo.computeVertexNormals();
      const col = []; for (let f = 0; f < P.count / 3; f++) { const k = .78 + R() * .22; for (let j = 0; j < 3; j++) col.push(k, k, k * .98); }
      geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      add(geo, std({ color: 0xffffff, vertexColors: true, roughness: .95 }));
      return { shape: ballOf(1.02) };
    },

    bigbone(R, add) {
      const m = phys({ color: 0xf1e5c9, roughness: .45, clearcoat: .35, clearcoatRoughness: .35 });
      add(lathe([[.1, -.335], [.082, -.25], [.074, -.1], [.072, 0], [.074, .1], [.082, .25], [.1, .335]], 16), m);
      for (const sy of [-1, 1]) for (const sx of [-1, 1]) add(xf(new THREE.SphereGeometry(.138, 14, 10), { p: [sx * .085, sy * .337, 0] }), m);
      return { shape: cuboid([.96, .97, .96]) };
    },

    butt(R, add) {
      const prof = [[0, -.275], [.084, -.275], [.097, -.268], [.1, -.255], [.1, -.03], [.1, .196], [.098, .21], [.094, .222], [.087, .24], [.074, .257], [.05, .27], [.022, .275], [0, .276]];
      const L = [0]; for (let j = 1; j < prof.length; j++) L[j] = L[j - 1] + Math.hypot(prof[j][0] - prof[j - 1][0], prof[j][1] - prof[j - 1][1]);
      const yOf = j => (1 - L[j] / L[L.length - 1]) * 256;
      const c = cvs(64, 256), g = c.getContext('2d');
      g.fillStyle = '#f2e3c6'; g.fillRect(0, yOf(1), 64, 256 - yOf(1));
      g.fillStyle = '#e8974a'; g.fillRect(0, yOf(4), 64, yOf(1) - yOf(4)); dots(g, R, 0, yOf(4), 64, yOf(1) - yOf(4), 70, '#b9652a', .6, 1.6, .5, .9);
      g.fillStyle = '#d9b24a'; g.fillRect(0, yOf(4) - 3, 64, 3);
      g.fillStyle = '#f8f6f0'; g.fillRect(0, yOf(5), 64, yOf(4) - 3 - yOf(5)); g.fillStyle = 'rgba(180,170,150,.25)'; for (let x = 4; x < 64; x += 9) g.fillRect(x, yOf(5), 1, yOf(4) - yOf(5));
      const cg = g.createLinearGradient(0, yOf(5), 0, yOf(7)); cg.addColorStop(0, '#5a4636'); cg.addColorStop(1, '#2f2a27'); g.fillStyle = cg; g.fillRect(0, yOf(7), 64, yOf(5) - yOf(7));
      g.fillStyle = '#a7a49e'; g.fillRect(0, 0, 64, yOf(7)); dots(g, R, 0, 0, 64, yOf(7), 50, '#6c6964', .5, 1.4, .4, .9); dots(g, R, 0, 0, 64, yOf(7), 20, '#d8d5cf', .5, 1.2, .4, .9);
      const n1 = ringNoise(R, 4, 2), n2 = ringNoise(R, 3, 3);
      add(lathe(prof, 20, { mod: (ph, j, r, y) => j >= 7 ? [r * (1 + .1 * n1(ph)), y + .012 * n2(ph) * (j - 6) / 6] : [r, y] }), std({ map: tex(c), roughness: .8 }));
      return { shape: cyl() };
    },

    bowl(R, add) {
      const out = [[0, -.1], [.11, -.1], [.12, -.118], [.13, -.125], [.165, -.125], [.176, -.116], [.181, -.092], [.25, -.06], [.32, -.012], [.368, .046], [.392, .096], [.398, .118]];
      const rim = [.39, .128], inn = [[.381, .121], [.376, .1], [.352, .048], [.302, -.004], [.232, -.044], [.16, -.064], [.08, -.074], [0, -.077]];
      const loop = [...out, rim, ...inn];
      const pairs = [[7, 17], [8, 16], [9, 15], [10, 14], [11, 13]], gap = [0, .7, 1.15, 1.45, 1.6];
      const jl = gap.map((q, k) => k ? (R() - .5) * .26 : 0), jr = gap.map((q, k) => k ? (R() - .5) * .26 : 0), PC = Math.PI * .5;
      const rng = new Array(loop.length).fill(null);
      pairs.forEach(([o, i], k) => { const r2 = [PC + gap[k] / 2 + jr[k], PC + TAU - gap[k] / 2 - jl[k]]; rng[o] = r2; rng[i] = r2; if (k === pairs.length - 1) rng[12] = r2; });
      const range = j => rng[j] || [PC, PC + TAU];
      const L = [0]; for (let j = 1; j < loop.length; j++) L[j] = L[j - 1] + Math.hypot(loop[j][0] - loop[j - 1][0], loop[j][1] - loop[j - 1][1]);
      const VS = .94, yOf = j => (1 - VS * L[j] / L[L.length - 1]) * 256;
      const W = 512, H = 256, c = cvs(W, H), g = c.getContext('2d'), blue = '#2c5fb3';
      g.fillStyle = '#f9f9f5'; g.fillRect(0, 0, W, H);
      g.fillStyle = '#ece5d6'; g.fillRect(0, 0, W, 13);
      g.fillStyle = blue; g.fillRect(0, yOf(4) - 2, W, 4); g.fillRect(0, yOf(6) - 3, W, 3);
      const y7 = yOf(7), y10 = yOf(10), mid = (y7 + y10) / 2;
      g.strokeStyle = blue; g.lineWidth = 3.5; g.beginPath(); for (let x = 0; x <= W; x += 4) g.lineTo(x, mid + 7 * Math.sin(x / W * TAU * 8)); g.stroke();
      for (let k = 0; k < 8; k++) { const x = (k + .5) * W / 8, y = mid + 7 * Math.sin((k + .5) * TAU) - 1; g.fillStyle = blue; for (let p = 0; p < 5; p++) { const a = p / 5 * TAU; g.beginPath(); g.arc(x + Math.cos(a) * 7, y + Math.sin(a) * 7, 4.8, 0, TAU); g.fill(); } g.fillStyle = '#f9f9f5'; g.beginPath(); g.arc(x, y, 3, 0, TAU); g.fill(); }
      g.fillStyle = blue; g.fillRect(0, yOf(11) - 6, W, yOf(13) - yOf(11) + 12);
      g.fillRect(0, yOf(14) + 4, W, 2.5); g.fillRect(0, yOf(14) + 9, W, 1.5);
      g.fillRect(0, yOf(19) - 2, W, 3); g.fillRect(0, yOf(19) + 3, W, 1.5);
      for (let k = 0; k < 6; k++) { g.beginPath(); g.arc((k + .5) * W / 6, yOf(20) - 4, 3, 0, TAU); g.fill(); }
      grain(g, R, 0, 13, W, H - 13, 1400, '120,140,170', '255,255,255', .06);
      const t = tex(c); t.wrapS = THREE.RepeatWrapping;
      const mat = phys({ map: t, roughness: .16, clearcoat: 1, clearcoatRoughness: .05 });
      add(lathe(loop, 36, { range, uAbs: true, v0: 0, v1: VS }), mat);
      const P = (j, ph) => [loop[j][0] * Math.sin(ph), loop[j][1], loop[j][0] * Math.cos(ph)];
      const tris = [], refs = [];
      for (const end of [0, 1]) {
        const phOf = j => range(j)[end], tan = ph => new V3(Math.cos(ph), 0, -Math.sin(ph)).multiplyScalar(end ? 1 : -1);
        for (let k = 0; k < pairs.length - 1; k++) {
          const [o0, i0] = pairs[k], [o1, i1] = pairs[k + 1];
          const q = [P(o0, phOf(o0)), P(o1, phOf(o1)), P(i1, phOf(i1)), P(i0, phOf(i0))];
          tris.push([q[0], q[1], q[2]], [q[0], q[2], q[3]]); const rf = tan(phOf(o1)); refs.push(rf, rf);
        }
        const [ot, it] = pairs[pairs.length - 1]; tris.push([P(ot, phOf(ot)), P(12, phOf(12)), P(it, phOf(it))]); refs.push(tan(phOf(12)));
      }
      add(facets(tris, k => refs[k], [.5, 1 - 6 / H]), mat);
      return { shape: cuboid([.96, 1, .96]) };
    },

    durian(R, add) {
      const Rs = .3, t = .045, N = 24, rimN = ringNoise(R, 4, 3), rimY = ph => .022 * rimN(ph);
      const c = cvs(128, 256), g = c.getContext('2d');
      g.fillStyle = '#b5c24a'; g.fillRect(0, 0, 128, 256);
      for (let i = 0; i < 40; i++) { const x = R() * 128, y = 52 + R() * 204, r = 6 + R() * 16, gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(120,140,40,.45)'); gr.addColorStop(1, 'rgba(120,140,40,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); }
      const sg = g.createLinearGradient(0, 0, 0, 46); sg.addColorStop(0, '#6d6a2c'); sg.addColorStop(1, '#a9b845'); g.fillStyle = sg; g.fillRect(0, 0, 128, 46);
      const outM = phys({ map: tex(c), roughness: .6, clearcoat: .15 });
      const ic = cvs(128, 128), ig = ic.getContext('2d'); ig.fillStyle = '#f4e2ae'; ig.fillRect(0, 0, 128, 128);
      ig.strokeStyle = 'rgba(205,175,110,.5)'; ig.lineWidth = 1.4; for (let i = 0; i < 46; i++) { const x = R() * 128; ig.beginPath(); ig.moveTo(x, 0); ig.lineTo(x + (R() - .5) * 10, 128); ig.stroke(); }
      ig.fillStyle = '#fbf3d8'; ig.fillRect(0, 0, 128, 12);
      const inM = phys({ map: tex(ic), roughness: .7 });
      const outer = []; for (let k = 0; k <= 8; k++) { const a = k / 8 * Math.PI / 2; outer.push([Rs * Math.sin(a), -Rs * Math.cos(a)]); }
      add(lathe(outer, N, { v0: 0, v1: .8, mod: (ph, j, r, y) => [r, y + rimY(ph) * (j === 8 ? 1 : j === 7 ? .35 : 0)] }), outM);
      const innerL = [[Rs, 0], [Rs - t / 2, .006], [Rs - t, 0]]; for (let k = 7; k >= 0; k--) { const a = k / 8 * Math.PI / 2; innerL.push([(Rs - t) * Math.sin(a), -(Rs - t) * Math.cos(a)]); }
      add(lathe(innerL, N, { mod: (ph, j, r, y) => [r, y + rimY(ph) * (j <= 2 ? 1 : j === 3 ? .35 : 0)] }), inM);
      const pos = [], uv = [], K = 46, gold = Math.PI * (3 - Math.sqrt(5)), up = new V3(0, 1, 0);
      for (let k = 0; k < K; k++) {
        const y = -(k + .5) / K; if (y > -.1) continue;
        const rr2 = Math.sqrt(1 - y * y), a = k * gold, d = new V3(rr2 * Math.cos(a), y, rr2 * Math.sin(a));
        const t1 = new V3().crossVectors(d, Math.abs(d.y) > .9 ? new V3(1, 0, 0) : up).normalize(), t2 = new V3().crossVectors(d, t1);
        const base = d.clone().multiplyScalar(Rs - .012), apex = d.clone().multiplyScalar(Rs + .07 + R() * .025), b = .043;
        const ring = []; for (let m = 0; m < 5; m++) { const q = m / 5 * TAU + R() * .3; ring.push(base.clone().addScaledVector(t1, Math.cos(q) * b).addScaledVector(t2, Math.sin(q) * b)); }
        for (let m = 0; m < 5; m++) {
          const p0 = ring[m], p1 = ring[(m + 1) % 5], n = new V3().subVectors(p1, p0).cross(new V3().subVectors(apex, p0));
          const tri = n.dot(d) >= 0 ? [p0, p1, apex] : [p1, p0, apex];
          for (const p of tri) { pos.push(p.x, p.y, p.z); uv.push(.5, p === apex ? .985 : .86); }
        }
      }
      add(fromArrays(pos, uv, null), outM);
      return { shape: cuboid([.96, 1, .96]) };
    },

    milktea(R, add) {
      const b = -.36, cupM = phys({ color: 0xffffff, transparent: true, opacity: .34, roughness: .1, clearcoat: 1, side: THREE.DoubleSide });
      add(lathe([[0, b], [.152, b], [.166, b + .014], [.218, b + .5], [.226, b + .506]], 24), cupM);
      add(lathe([[.212, b + .497], [.233, b + .501], [.235, b + .517], [.227, b + .524], [.2, b + .538], [.16, b + .567], [.1, b + .589], [.04, b + .597], [0, b + .598]], 24), cupM);
      const liq = [[0, b + .013], [.149, b + .013], [.158, b + .026], [.184, b + .21], [0, b + .21]];
      const L = [0]; for (let j = 1; j < liq.length; j++) L[j] = L[j - 1] + Math.hypot(liq[j][0] - liq[j - 1][0], liq[j][1] - liq[j - 1][1]);
      const W = 256, H = 256, c = cvs(W, H), g = c.getContext('2d'), yL = j => (1 - (.5 + .5 * L[j] / L[L.length - 1])) * H;
      const lg = g.createLinearGradient(0, 0, 0, 128); lg.addColorStop(0, '#d4a676'); lg.addColorStop(1, '#b98a5a'); g.fillStyle = lg; g.fillRect(0, 0, W, 128);
      for (let i = 0; i < 70; i++) { const x = R() * W, y = yL(3) + R() * (yL(1) - yL(3) + 6), r = 7 + R() * 2.5; g.fillStyle = '#2a1912'; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); g.fillStyle = 'rgba(255,255,255,.28)'; g.beginPath(); g.arc(x - r * .35, y - r * .35, r * .3, 0, TAU); g.fill(); }
      const bg = g.createLinearGradient(0, 128, 0, 256); bg.addColorStop(0, '#f58cb6'); bg.addColorStop(1, '#ea6c9f'); g.fillStyle = bg; g.fillRect(0, 128, W, 128);
      g.fillStyle = '#ffffff'; g.fillRect(0, 134, W, 5); g.fillRect(0, 245, W, 5);
      for (const x of [64, 192]) {
        g.fillStyle = '#ffffff'; g.beginPath(); g.arc(x - 30, 192, 22, 0, TAU); g.fill();
        g.fillStyle = '#ea6c9f'; g.beginPath(); g.arc(x - 38, 186, 3.5, 0, TAU); g.arc(x - 22, 186, 3.5, 0, TAU); g.fill(); g.beginPath(); g.arc(x - 30, 196, 6, 0, Math.PI); g.fill();
        txt(g, '奶茶', x + 22, 192, 30, '#ffffff', { stroke: 'rgba(190,60,110,.5)', lw: 5 });
      }
      const fill = phys({ map: tex(c), roughness: .32, clearcoat: .5 });
      add(lathe(liq, 24, { v0: .5, v1: 1 }), fill);
      const rAt = h => .166 + (.218 - .166) * (h - .014) / .486;
      add(lathe([[rAt(.27) + .004, b + .27], [rAt(.41) + .004, b + .41]], 24, { v0: 0, v1: .5 }), fill);
      add(tube([[.04, b + .06, .02], [.115, b + .74, -.035]], .024, 2, 10, { caps: false }), phys({ color: 0xff6aa2, roughness: .3, clearcoat: .6, side: THREE.DoubleSide }));
      return { shape: cyl() };
    },

    diaper(R, add) {
      // 贴图按参数空间 (u 沿长度, s 横跨宽度) 铺，沙漏形收腰由几何体完成；s=±1 就是边缘
      const W = 512, H = 384, c = cvs(W, H), g = c.getContext('2d'), TOP = [0, 0, 512, 348], TAB = [256, 352, 512, 384];
      g.fillStyle = '#fdfdfd'; g.fillRect(0, 0, W, H);
      g.strokeStyle = 'rgba(190,205,225,.4)'; g.lineWidth = 1.2; for (let k = -12; k < 18; k++) for (const sgn of [1, -1]) { g.beginPath(); g.moveTo(k * 34, sgn > 0 ? 0 : 348); g.lineTo(k * 34 + 348, sgn > 0 ? 348 : 0); g.stroke(); }
      for (const [x0, dir] of [[0, 1], [512, -1]]) {
        g.fillStyle = '#62bcec'; g.beginPath(); g.moveTo(x0, 0); for (let y = 0; y <= 348; y += 6) g.lineTo(x0 + dir * (46 + 5 * Math.sin(y / 348 * Math.PI * 14)), y); g.lineTo(x0, 348); g.closePath(); g.fill();
        g.strokeStyle = 'rgba(255,255,255,.8)'; g.lineWidth = 2; for (let y = 6; y < 348; y += 9) { g.beginPath(); g.moveTo(x0 + dir * 6, y); g.lineTo(x0 + dir * 34, y); g.stroke(); }
      }
      g.strokeStyle = '#7cc8f0'; g.lineWidth = 6; g.setLineDash([8, 5]); for (const y of [17, 331]) { g.beginPath(); g.moveTo(66, y); g.lineTo(446, y); g.stroke(); } g.setLineDash([]);
      for (const [x, y, kind] of [[100, 92, 's'], [150, 262, 'h'], [92, 205, 'c'], [205, 120, 's'], [330, 96, 'h'], [372, 262, 's'], [414, 168, 'c'], [300, 228, 'c'], [255, 74, 's'], [250, 286, 'h'], [158, 58, 'h'], [404, 66, 'c'], [420, 292, 'h'], [96, 300, 's'], [340, 168, 's']]) {
        if (kind === 's') { g.fillStyle = '#ffcc33'; starPath(g, x, y, 15, 6.5); g.fill(); }
        else if (kind === 'h') { g.fillStyle = '#ff86ad'; heartPath(g, x, y, 22); g.fill(); }
        else { g.fillStyle = '#7fc6f3'; g.beginPath(); g.arc(x - 9, y + 2, 9, 0, TAU); g.arc(x + 1, y - 4, 11, 0, TAU); g.arc(x + 11, y + 2, 8.5, 0, TAU); g.fill(); }
      }
      g.fillStyle = '#f2c18a'; for (const [dx, dy, r] of [[-22, -22, 11], [22, -22, 11], [0, 0, 29]]) { g.beginPath(); g.arc(178 + dx, 174 + dy, r, 0, TAU); g.fill(); }
      g.fillStyle = '#5a3a22'; for (const dx of [-10, 10]) { g.beginPath(); g.arc(178 + dx, 168, 3.5, 0, TAU); g.fill(); } g.beginPath(); g.ellipse(178, 180, 5, 3.5, 0, 0, TAU); g.fill();
      g.fillStyle = 'rgba(255,140,160,.6)'; for (const dx of [-18, 18]) { g.beginPath(); g.arc(178 + dx, 182, 5, 0, TAU); g.fill(); }
      g.fillStyle = '#ecd23a'; g.fillRect(230, 171, 190, 5);
      g.fillStyle = '#4fa9e6'; g.fillRect(256, 352, 256, 32); g.fillStyle = '#ffe36a'; g.fillRect(300, 358, 64, 20);
      const mat = phys({ map: tex(c), roughness: .78, sheen: .35, sheenRoughness: .6, sheenColor: new THREE.Color(0xffffff) });
      const X0 = -.36, X1 = .36, hw = x => .25 - .105 * Math.exp(-((x / .16) ** 2));
      const E = (u, s) => Math.pow(Math.max(0, 1 - Math.abs(s) ** 5), .2) * Math.pow(Math.max(0, 1 - Math.abs(2 * u - 1) ** 6), 1 / 6);
      const core = (u, s) => Math.max(0, 1 - Math.abs(s) / .62) ** 2 * Math.max(0, 1 - Math.abs(2 * u - 1) / .78);
      const bend = u => .075 * (2 * u - 1) ** 2, top = rect(TOP, W, H);
      add(grid(26, 10, (u, v) => { const s = 2 * v - 1, x = X0 + (X1 - X0) * u; return [x, bend(u) + .08 * E(u, s) + .032 * core(u, s), s * hw(x)]; }, { flip: true, uv: (u, v) => top(u, 1 - v) }), mat);
      const wu = 128 / W, wv = 1 - 368 / H;
      add(grid(26, 10, (u, v) => { const s = 2 * v - 1, x = X0 + (X1 - X0) * u; return [x, bend(u) - .032 * E(u, s), s * hw(x)]; }, { uv: () => [wu, wv] }), mat);
      for (const k of [1, -1]) { const x = .27, u = (x - X0) / (X1 - X0); add(xf(atlasBox(.12, .016, .08, 1, .005, [TAB, TAB, TAB, TAB, TAB, TAB], W, H), { p: [x, bend(u) + .03, k * (hw(x) + .035)], r: [k * .25, k * .18, 0] }), mat); }
      return { shape: cuboid([.96, 1, .96]) };
    },
  };

  /* ================= 组装与缓存 ================= */
  const cache = new Map();
  function assemble(id, recipe) {
    const R = seeded(hashStr(id)), parts = [];
    const add = (geo, mat) => { let p = parts.find(q => q.mat === mat); if (!p) parts.push(p = { mat, geos: [] }); p.geos.push(geo); return geo; };
    const spec = recipe(R, add);
    const list = parts.map(p => ({ mat: p.mat, geo: merge(p.geos) })), box = new THREE.Box3();
    for (const p of list) { p.geo.computeBoundingBox(); box.union(p.geo.boundingBox); }
    const ctr = box.getCenter(new V3()), size = box.getSize(new V3());
    for (const p of list) { p.geo.translate(-ctr.x, -ctr.y, -ctr.z); p.geo.computeBoundingBox(); p.geo.computeBoundingSphere(); }
    const dims = [r3(size.x), r3(size.y), r3(size.z)];
    const tris = list.reduce((n, p) => n + p.geo.index.count / 3, 0);
    return { id, list, dims, shape: spec.shape(dims), tris };
  }
  function get(id) {
    if (cache.has(id)) return cache.get(id);
    const recipe = id === '__bag' ? makeBag : RECIPES[id];
    if (!recipe) throw new Error(`未知的垃圾种类：${id}（可用：${GARBAGE_IDS.join(', ')}）`);
    const a = assemble(id === '__bag' ? 'bag' : id, recipe); cache.set(id, a); return a;
  }
  function instance(a) {
    const g = new THREE.Group(); g.name = 'garbage:' + a.id; g.userData.garbageId = a.id; g.userData.tris = a.tris;
    for (const p of a.list) { const m = new THREE.Mesh(p.geo, p.mat); m.castShadow = true; m.receiveShadow = true; g.add(m); }
    return { object: g, shape: { ...a.shape }, dims: [...a.dims] };
  }

  /* ================= 大黑袋 ================= */
  function makeBag(R, add) {
    const bc = cvs(256, 256), g = bc.getContext('2d'); g.fillStyle = '#808080'; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 60; i++) { const x = R() * 256, y = R() * 256, r = 20 + R() * 50, gr = g.createRadialGradient(x, y, 0, x, y, r), v = R() < .5 ? 60 : 200; gr.addColorStop(0, `rgba(${v},${v},${v},.25)`); gr.addColorStop(1, `rgba(${v},${v},${v},0)`); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); }
    g.lineCap = 'round'; for (let i = 0; i < 140; i++) { const x = R() * 256, y = R() * 256, a = R() * Math.PI, l = 8 + R() * 30, v = R() < .5 ? 40 : 220; g.strokeStyle = `rgba(${v},${v},${v},${.25 + R() * .35})`; g.lineWidth = .6 + R() * 1.6; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
    const mat = phys({ color: 0x1d1f23, roughness: .36, clearcoat: .85, clearcoatRoughness: .22, bumpMap: rawTex(bc), bumpScale: 2.5 });
    // 鸭梨形的鼓囊袋身：底部压平、肚子最宽、往上收成一圈褶皱，顶上一个结和两只“耳朵”
    const ctrl = [[0, -.72], [.55, -.735], [.88, -.69], [1.0, -.47], [.99, -.2], [.9, .06], [.72, .27], [.48, .42], [.27, .52], [.15, .58], [.1, .615]].map(([x, y]) => new THREE.Vector2(x, y));
    const prof = new THREE.SplineCurve(ctrl).getPoints(17).map(p => [Math.max(0, p.x), p.y]); prof[0][0] = 0;
    const np = prof.length, n2 = ringNoise(R, 4, 3), lumps = [];
    for (let k = 0; k < 10; k++) lumps.push([R() * TAU, .22 + R() * .5, (k < 7 ? 1 : -.6) * (.05 + R() * .06), .35 + R() * .4, .08 + R() * .1]);
    const angD = (a, b) => { const d = Math.abs(a - b) % TAU; return d > Math.PI ? TAU - d : d; };
    add(lathe(prof, 30, { mod: (ph, j, r, y) => {
      const t = j / (np - 1); let lump = 0; for (const [p0, t0, a, wp, wt] of lumps) lump += a * Math.exp(-((angD(ph, p0) / wp) ** 2) - ((t - t0) / wt) ** 2);
      const fold = .24 * Math.sin(7 * ph + .4) * sstep(.66, .95, t) + .05 * Math.sin(13 * ph + 1.3) * sstep(.5, .8, t) * (1 - sstep(.85, 1, t));
      return [r * (1 + lump * sstep(.04, .2, t) + fold), y + .03 * n2(ph, t * 3) * sstep(.25, .5, t) * (1 - sstep(.6, .8, t))];
    } }), mat);
    add(xf(new THREE.SphereGeometry(.12, 10, 8), { p: [0, .65, 0], s: [1.05, .78, 1] }), mat);
    for (const k of [-1, 1]) add(xf(new THREE.ConeGeometry(.11, .3, 6), { p: [k * .14, .77, 0], r: [0, 0, -k * .8], s: [1, 1, .42] }), mat);
    return { shape: cuboid([.9, 1, .9]) };   // 用方盒而不是圆柱：圆柱倒下会像轮胎一样滚
  }

  /* ================= 泥巴材质（三平面投影：不依赖物体自己的 uv，任何垃圾套上都均匀） ================= */
  let mud = null;
  function mudMaterial() {
    if (mud) return mud;
    const R = seeded(hashStr('mud')), S = 512, c = cvs(S, S), g = c.getContext('2d');
    g.fillStyle = '#5f4834'; g.fillRect(0, 0, S, S);
    const wrapDraw = (x, y, r, fn) => { for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) if (x + dx + r > 0 && x + dx - r < S && y + dy + r > 0 && y + dy - r < S) fn(x + dx, y + dy); };
    for (let i = 0; i < 70; i++) { const x = R() * S, y = R() * S, r = 30 + R() * 90, v = R() < .5 ? '58,42,28' : '128,108,84', a = .12 + R() * .18; wrapDraw(x, y, r, (px, py) => { const gr = g.createRadialGradient(px, py, 0, px, py, r); gr.addColorStop(0, `rgba(${v},${a})`); gr.addColorStop(1, `rgba(${v},0)`); g.fillStyle = gr; g.fillRect(px - r, py - r, r * 2, r * 2); }); }
    // 龟裂：扭曲过的 Voronoi 边界（扭曲用整数频率的正弦，贴图仍可无缝平铺）
    // 每格一个抖动种子（Worley），每个像素只查周围 3×3 格，首次生成只要几十毫秒
    const img = g.getImageData(0, 0, S, S), d = img.data, G = 7, cell = S / G, seeds = [];
    for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) seeds.push([(i + .15 + R() * .7) * cell, (j + .15 + R() * .7) * cell]);
    // a·sin(2π(fx·x+fy·y)/S+p) 拆成按行、按列预先算好的表：sin(A+B)=sinA·cosB+cosA·sinB
    const wave = () => {
      const T = [];
      for (let k = 0; k < 3; k++) {
        const fx = 1 + Math.floor(R() * 3), fy = 1 + Math.floor(R() * 3), p = R() * TAU, a = 5 + R() * 9, sx = new Float32Array(S), cx = new Float32Array(S), sy = new Float32Array(S), cy = new Float32Array(S);
        for (let i = 0; i < S; i++) { sx[i] = a * Math.sin(TAU * fx * i / S); cx[i] = a * Math.cos(TAU * fx * i / S); sy[i] = Math.sin(TAU * fy * i / S + p); cy[i] = Math.cos(TAU * fy * i / S + p); }
        T.push([sx, cx, sy, cy]);
      }
      return (x, y) => T[0][0][x] * T[0][3][y] + T[0][1][x] * T[0][2][y] + T[1][0][x] * T[1][3][y] + T[1][1][x] * T[1][2][y] + T[2][0][x] * T[2][3][y] + T[2][1][x] * T[2][2][y];
    };
    const wx = wave(), wy = wave();
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const X = x + wx(x, y), Y = y + wy(x, y), ci = Math.floor(X / cell), cj = Math.floor(Y / cell); let d1 = 1e9, d2 = 1e9;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const ii = ci + di, jj = cj + dj, si = ((ii % G) + G) % G, sj = ((jj % G) + G) % G, sd = seeds[sj * G + si];
        const dx = X - sd[0] - (ii - si) * cell, dy = Y - sd[1] - (jj - sj) * cell, dd = dx * dx + dy * dy;
        if (dd < d1) { d2 = d1; d1 = dd; } else if (dd < d2) d2 = dd;
      }
      const e = Math.sqrt(d2) - Math.sqrt(d1), k = (y * S + x) * 4;
      const f = e < 1.6 ? .3 : e < 3 ? .3 + (e - 1.6) / 1.4 * .55 : e < 7 ? 1.12 - (e - 3) * .02 : Math.min(1.06, .96 + e / 300);
      d[k] *= f; d[k + 1] *= f; d[k + 2] *= f;
    }
    g.putImageData(img, 0, 0);
    grain(g, R, 0, 0, S, S, 9000, '50,32,15', '190,160,120', .3, 2);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let i = 0; i < 7; i++) {
      const x = R() * S, y = R() * S, rot = (R() - .5) * 1.1, size = 86 + R() * 34;
      wrapDraw(x, y, size, (px, py) => { g.save(); g.translate(px, py); g.rotate(rot); g.font = `900 ${size}px ${FONT}`; g.fillStyle = 'rgba(30,18,6,.42)'; g.fillText('?', 4, 4); g.fillStyle = 'rgba(214,176,124,.4)'; g.fillText('?', 0, 0); g.restore(); });
    }
    mud = std({ map: tex(c, true), roughness: .96, metalness: 0 });
    mud.name = 'garbage-mud';
    mud.onBeforeCompile = sh => {
      sh.uniforms.mudScale = { value: 1.55 };
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vMudP;\nvarying vec3 vMudN;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvMudP = position;\nvMudN = normal;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vMudP;\nvarying vec3 vMudN;\nuniform float mudScale;').replace('#include <map_fragment>',
        'vec3 mudW = pow(abs(normalize(vMudN)), vec3(4.0)); mudW /= (mudW.x + mudW.y + mudW.z + 1e-5);\nvec3 mudP = vMudP * mudScale;\ndiffuseColor *= texture2D(map, mudP.zy) * mudW.x + texture2D(map, mudP.xz + 0.37) * mudW.y + texture2D(map, mudP.xy + 0.71) * mudW.z;');
    };
    mud.customProgramCacheKey = () => 'garbage-mud-triplanar-v1';
    return mud;
  }

  /* ================= 塑料袋层 ================= */
  let bagMat = null; const bagGeo = new Map();
  function bagLayerMaterial() {
    if (bagMat) return bagMat;
    const R = seeded(hashStr('baglayer')), c = cvs(256, 256), g = c.getContext('2d'); g.fillStyle = '#808080'; g.fillRect(0, 0, 256, 256);
    g.lineCap = 'round'; for (let i = 0; i < 160; i++) { const x = R() * 256, y = R() * 256, a = R() * Math.PI, l = 10 + R() * 40, v = R() < .5 ? 50 : 215; g.strokeStyle = `rgba(${v},${v},${v},${.3 + R() * .4})`; g.lineWidth = .8 + R() * 2; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a + .5) * l * .5, y + Math.sin(a + .5) * l * .5, x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
    bagMat = phys({ color: 0xf3f5f8, transparent: true, opacity: .42, roughness: .45, metalness: 0, clearcoat: .5, clearcoatRoughness: .3, bumpMap: rawTex(c), bumpScale: 2, depthWrite: false, side: THREE.DoubleSide });
    bagMat.name = 'garbage-bag-layer';
    return bagMat;
  }
  function bagLayer(dims, k = 0) {
    if (!Array.isArray(dims) || dims.length < 3 || !dims.every(v => Number.isFinite(v) && v > 0)) throw new Error('bagLayer(dims, k)：dims 需要是三个正数 [x, y, z]');
    const kk = Math.max(0, Math.floor(Number(k) || 0)), key = dims.slice(0, 3).map(v => v.toFixed(3)).join(',') + '|' + kk;
    let geo = bagGeo.get(key);
    if (!geo) {
      const m = .08 + .05 * kk, sx = dims[0] + m, sy = dims[1] + m, sz = dims[2] + m, top = sy / 2;
      const a = kk * 1.9 + .4, ox = Math.cos(a) * .035 * kk, oz = Math.sin(a) * .035 * kk, kr = .045 + .008 * kk;
      const parts = [new RoundedBoxGeometry(sx, sy, sz, 3, Math.min(sx, sy, sz) * .42)];
      parts.push(xf(new THREE.ConeGeometry(.1 + .01 * kk, .07, 10, 1, true), { p: [ox, top + .02, oz] }));
      parts.push(xf(new THREE.SphereGeometry(kr, 10, 7), { p: [ox, top + .055, oz], s: [1.15, .75, 1] }));
      for (const s of [-1, 1]) parts.push(xf(new THREE.ConeGeometry(.04, .13, 6), { p: [ox + Math.cos(a) * s * .05, top + .1, oz - Math.sin(a) * s * .05], r: [0, a, s * .85], s: [1, 1, .45] }));
      geo = merge(parts); geo.computeBoundingSphere(); bagGeo.set(key, geo);
    }
    const mesh = new THREE.Mesh(geo, bagLayerMaterial()); mesh.name = 'bagLayer' + kk; mesh.renderOrder = 2; mesh.castShadow = true; mesh.receiveShadow = false;
    mesh.userData.sharedGeo = true;   // 几何体按尺寸缓存、多件共用：撕袋时不要 dispose（main.js 的 tear() 会看这个标记）
    return mesh;
  }

  /* ================= 分类桶标签 ================= */
  function drawBinIcon(g, cat, cx, cy, s) {
    g.save(); g.translate(cx, cy); g.fillStyle = '#ffffff'; g.strokeStyle = '#ffffff'; g.lineJoin = 'round'; g.lineCap = 'round';
    if (cat === 0) {
      const R0 = s * .4, V = k => [Math.sin(k * TAU / 3) * R0, -Math.cos(k * TAU / 3) * R0 + s * .06];
      for (let k = 0; k < 3; k++) {
        const a = V(k), b = V(k + 1), dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy), ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
        const p0 = [a[0] + dx * .14, a[1] + dy * .14], p1 = [a[0] + dx * .64, a[1] + dy * .64], tip = [a[0] + dx * .9, a[1] + dy * .9], hw = s * .13;
        g.lineWidth = s * .13; g.beginPath(); g.moveTo(...p0); g.lineTo(...p1); g.stroke();
        poly(g, [[p1[0] + nx * hw, p1[1] + ny * hw], tip, [p1[0] - nx * hw, p1[1] - ny * hw]], '#ffffff');
      }
    } else if (cat === 1) {
      const h = s * .86, w = s * .98; g.lineWidth = s * .08; g.beginPath(); g.moveTo(0, -h / 2); g.lineTo(w / 2, h / 2); g.lineTo(-w / 2, h / 2); g.closePath(); g.fill(); g.stroke();
      g.globalCompositeOperation = 'destination-out'; rr(g, -s * .06, -h * .14, s * .12, h * .4, s * .05); g.fill(); g.beginPath(); g.arc(0, h * .36, s * .07, 0, TAU); g.fill();
    } else if (cat === 2) {
      g.save(); g.rotate(-.12);
      g.beginPath(); g.moveTo(-s * .5, 0); g.quadraticCurveTo(-s * .42, -s * .2, -s * .24, -s * .2); g.quadraticCurveTo(-s * .3, 0, -s * .24, s * .2); g.quadraticCurveTo(-s * .42, s * .2, -s * .5, 0); g.fill();
      g.lineWidth = s * .065; g.beginPath(); g.moveTo(-s * .26, 0); g.lineTo(s * .3, 0); g.stroke();
      for (let k = 0; k < 4; k++) { const x = -s * .14 + k * s * .11, l = s * (.2 - k * .025); g.lineWidth = s * .05; g.beginPath(); g.moveTo(x, -l); g.quadraticCurveTo(x - s * .05, 0, x, l); g.stroke(); }
      poly(g, [[s * .26, 0], [s * .5, -s * .2], [s * .44, 0], [s * .5, s * .2]], '#ffffff');
      g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.arc(-s * .37, -s * .05, s * .045, 0, TAU); g.fill();
      g.restore();
    } else {
      rr(g, -s * .36, -s * .34, s * .72, s * .1, s * .03); g.fill(); rr(g, -s * .1, -s * .45, s * .2, s * .12, s * .04); g.fill();
      g.beginPath(); g.moveTo(-s * .31, -s * .2); g.lineTo(s * .31, -s * .2); g.lineTo(s * .25, s * .46); g.lineTo(-s * .25, s * .46); g.closePath(); g.fill();
      g.globalCompositeOperation = 'destination-out'; for (const x of [-.13, 0, .13]) { rr(g, s * x - s * .025, -s * .1, s * .05, s * .46, s * .025); g.fill(); }
    }
    g.restore();
  }
  function binLabel(cat, text) {
    // 每次都返回新贴图（调用方换名字时会 dispose 旧的，所以这里不缓存）
    const k = Math.min(3, Math.max(0, Math.floor(Number(cat)) || 0)), s = String(text ?? '').trim().slice(0, 8) || BIN_TEXT[k];
    const W = 512, H = 256, c = cvs(W, H), g = c.getContext('2d');
    g.font = `900 100px ${FONT}`; const per100 = Math.max(1, g.measureText(s).width) / 100;
    const sideFont = Math.min(140, 236 / per100), stackFont = Math.min(104, 470 / per100);
    const shadow = { shadow: 'rgba(0,0,0,.3)', blur: 8, dy: 3 };
    const icon = (x, y, size) => { const ic = cvs(W, H), ig = ic.getContext('2d'); drawBinIcon(ig, k, x, y, size); g.save(); g.shadowColor = 'rgba(0,0,0,.28)'; g.shadowBlur = 10; g.shadowOffsetY = 4; g.drawImage(ic, 0, 0); g.restore(); };
    if (sideFont >= stackFont) { icon(118, 128, 190); txt(g, s, 238 + (W - 254) / 2, 130, sideFont, '#ffffff', shadow); }
    else { icon(256, 66, 108); txt(g, s, 256, 176, stackFont, '#ffffff', shadow); }   // 上下都留出余量，桶身遮住一点也不会切到字
    return tex(c);
  }

  // 泥巴贴图第一次生成约 0.1 秒：浏览器空闲时先做好，第一份“糊泥巴”礼物到达时不卡顿
  if (typeof requestIdleCallback === 'function') requestIdleCallback(() => { try { mudMaterial(); } catch (e) { console.warn('泥巴材质预生成失败，真正用到时会再生成一次', e); } }, { timeout: 8000 });

  return {
    ids: GARBAGE_IDS,
    build(id) { return instance(get(id)); },
    bag() { return instance(get('__bag')); },
    get mudMaterial() { return mudMaterial(); },
    bagLayer,
    binLabel,
  };
}
