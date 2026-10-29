/* 画面有没有变：每帧扫一遍场景里看得见的东西，决定这一帧要不要真的画。
   - 位置、转角、缩放：和上次真画时比，挪了 1 像素以上（或转了、缩放了一点点）才算"动了"——
     慢慢往下淌的流痕、滑着的珍珠一帧只挪零点几个像素，攒够了再画；
   - 透明度、着色器参数、几何（粒子、水痕、卷起的小广告）的版本：一变就画；
   - 贴图的版本（往下淌时一点点画长的流痕、哈气写字）：一变也画，但没人动鼠标时一秒最多画 20 次。
   玻璃静着的时候（主播在聊天、没人送礼）就一帧都不画，显卡几乎不干活。 */
let hA = 0;
let hT = 0;
const SEED = 2166136261 | 0;
const mixA = v => {
  hA = Math.imul(hA ^ (v | 0), 16777619);
};
const mixT = v => {
  hT = Math.imul(hT ^ (v | 0), 16777619);
};
const numA = v => mixA(Math.round(v * 256));
/* 层级（renderOrder）会差到小数点后很多位（小广告叠放），按浮点数的原样比 */
const f64 = new Float64Array(1);
const u32 = new Uint32Array(f64.buffer);
const bitsA = v => {
  f64[0] = v;
  mixA(u32[0]);
  mixA(u32[1]);
};

function value(v) {
  if (typeof v === 'number') numA(v);
  else if (typeof v === 'boolean') mixA(v ? 1 : 2);
  else if (!v) mixA(0);
  else if (v.isTexture) {
    mixT(v.id);
    mixT(v.version);
  } else if (v.isVector2) {
    numA(v.x);
    numA(v.y);
  } else if (v.isVector3) {
    numA(v.x);
    numA(v.y);
    numA(v.z);
  } else if (v.isVector4) {
    numA(v.x);
    numA(v.y);
    numA(v.z);
    numA(v.w);
  } else if (v.isColor) {
    numA(v.r);
    numA(v.g);
    numA(v.b);
  } else if (Array.isArray(v)) for (const x of v) value(x);
  else if (v.elements) for (const x of v.elements) numA(x);
}

/* 除了位置、转角、缩放以外，会影响画面的东西 */
function props(o) {
  mixA(o.id);
  bitsA(o.renderOrder);
  const m = o.material;
  if (m) {
    mixA(m.id);
    mixA(m.version);
    numA(m.opacity);
    mixA(m.visible ? 1 : 2);
    if (m.map) value(m.map);
    if (m.color) value(m.color);
    const u = m.uniforms;
    if (u) for (const k in u) value(u[k].value);
  }
  const g = o.geometry;
  if (g) {
    mixA(g.id);
    const a = g.attributes;
    for (const k in a) mixA(a[k].version);
    if (g.index) mixA(g.index.version);
    mixA(g.drawRange.start);
    mixA(g.drawRange.count === Infinity ? -1 : g.drawRange.count);
    if (g.instanceCount !== undefined) mixA(g.instanceCount === Infinity ? -1 : g.instanceCount);
  }
  if (o.isInstancedMesh) {
    mixA(o.count);
    mixA(o.instanceMatrix.version);
  }
}

/* 上次真画的时候每样东西在哪（同一张表一直用，不每帧重建） */
const ref = new Map();
let refCount = 0;
let gen = 0;
const MOVE = 1;
const TURN = 0.004;

/* 这一帧：a = 参数指纹，t = 贴图指纹，moved = 有东西动了 / 多了 / 少了 */
export function scan(scene) {
  hA = SEED;
  hT = SEED;
  let moved = false;
  let n = 0;
  scene.traverseVisible(o => {
    n++;
    props(o);
    if (moved) return;
    const p = ref.get(o.id);
    if (!p) moved = true;
    else if (Math.abs(o.position.x - p[0]) >= MOVE || Math.abs(o.position.y - p[1]) >= MOVE || Math.abs(o.rotation.z - p[2]) >= TURN || Math.abs(o.scale.x - p[3]) >= TURN || Math.abs(o.scale.y - p[4]) >= TURN) moved = true;
  });
  if (n !== refCount) moved = true;
  return { a: hA >>> 0, t: hT >>> 0, moved };
}

/* 真画了一帧：记下这时每样东西的位置；这一帧没看见的从表里去掉 */
export function markRendered(scene) {
  gen++;
  scene.traverseVisible(o => {
    let p = ref.get(o.id);
    if (!p) {
      p = new Float64Array(6);
      ref.set(o.id, p);
    }
    p[0] = o.position.x;
    p[1] = o.position.y;
    p[2] = o.rotation.z;
    p[3] = o.scale.x;
    p[4] = o.scale.y;
    p[5] = gen;
  });
  for (const [id, p] of ref) if (p[5] !== gen) ref.delete(id);
  refCount = ref.size;
}

/* 验收用：每个看得见的东西各自的指纹（找"是谁一直在变、让画面停不下来"） */
export function objectSignatures(scene) {
  const out = new Map();
  scene.traverseVisible(o => {
    hA = SEED;
    hT = SEED;
    props(o);
    const p = o.position;
    out.set(o.id, { h: (hA ^ Math.imul(hT, 31)) >>> 0, pos: [p.x, p.y], order: o.renderOrder, type: o.type });
  });
  return out;
}
