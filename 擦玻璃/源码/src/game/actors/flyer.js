/* 小广告：从粘死的那头往翘起的那头"唰"地抹平贴上（贴的方向一眼能看出来：浆糊刷痕、胶带、翘起来的角/边）。
   撕法：按住拖，顺着贴的方向把翘起的那头往回揭（偏差 40° 以内）→ 纸一路卷起来，揭到七成整张掉下来，干干净净；
   方向不对（横着拽、往外拽）→ "嘶啦"撕烂：揭起来的那截被扯走，剩下半张还粘着（毛边那头翘着，可以接着顺着撕）；
   撕烂两三次、剩得太小 → 变成碎纸粘在玻璃上，只能刮掉。鼠标停在纸上会在翘起的地方出现箭头提示。
   叠着贴的：整张被上面贴平的纸盖住时会"睡"（flyer-cover.js）——不画、不占贴图，只留位置和长相的种子；
   上面的被揭开、露出来时照原样画回来。所以看得见的每一张都得顺着撕，没有"压死了只能刮"的。 */
import * as THREE from 'three';
import { LAYER, canvasTexture } from '../../glass/stage.js';
import { createSprite } from '../../glass/sprites.js';
import { drawFlyer } from '../../art/paper-art.js';
import { artTape, artGlue } from '../../art/stains-art.js';
import { canvas as mkCanvas, INK } from '../../art/ink.js';
import { createDebris } from './debris.js';
import { peelVerdict, rollPoint, axisSpan, DONE_SHARE } from './flyer-peel.js';
import { coverShape, paperEnvelope, eachPaperSample, liftBand } from './flyer-shape.js';
import { P } from '../../glass/particles.js';
import { rng, rand, clamp, easeOutCubic } from '../../util.js';

const SX = 18;
const SY = 22;
/* 拖动距离 → 揭起长度 */
const GAIN = 0.62;
/* 叠放顺序 z → 层级（后贴的在上面）：z 由 flyer-cover.js 分配、不超过 MAX_Z，整摞占不到 0.4 层；提示箭头在 +1.5 */
const Z_STEP = 1e-6;
/* 撕下来的、撕烂扯走的那截从别的纸上面飞走 */
const DEBRIS_LAYER = LAYER.FLYER + 1;
/* 检查"整张盖没盖住"时取点的间距（× u）：纸边一圈、纸面里面都是 2.5u 一个点（再疏，两张纸之间几个像素宽的细缝会漏看，
   睡下去以后那条缝里本该露出的一点纸就没画，醒来时会"闪"一下） */
const EDGE_STEP = 2.5;
const FILL_STEP = 2.5;
/* 揭起来又松手贴回去：过一会儿再让底下露出来的那几张睡（来回抓放时不用一遍遍重画） */
const SETTLE_DELAY = 1.2;
/* 撕下来以后整张带着卷边掉下去、淡掉要多久（秒） */
const FALL_TIME = 0.8;
/* 睡下 / 醒来时影子慢慢淡出 / 淡入（秒）：纸本身那时候整张被盖着，只有伸出来的一点影子边会变——慢慢变就看不出来 */
const SHADOW_FADE = 0.4;

const vertexShader = /* glsl */ `
attribute float aShade;
varying vec2 vUv;
varying float vShade;
void main() {
  vUv = uv;
  vShade = aShade;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const fragmentShader = /* glsl */ `
precision highp float;
uniform sampler2D uMap;
uniform vec3 uBack;
uniform float uOpacity;
uniform float uShadow;
varying vec2 vUv;
varying float vShade;
void main() {
  vec4 c = texture2D(uMap, vUv);
  if (c.a < 0.004) discard;
  if (uShadow > 0.5) {
    gl_FragColor = vec4(0.16, 0.1, 0.06, c.a * uOpacity);
    return;
  }
  /* 背面：纸背的颜色，透出一点点反着的字 */
  vec3 col = gl_FrontFacing ? c.rgb : mix(uBack, c.rgb, 0.1);
  gl_FragColor = vec4(col * vShade, c.a * uOpacity);
}`;

function makeMaterial(tex, back, shadow) {
  return new THREE.ShaderMaterial({
    uniforms: { uMap: { value: tex }, uBack: { value: new THREE.Color(back) }, uOpacity: { value: 0 }, uShadow: { value: shadow ? 1 : 0 } },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide
  });
}

/* 纸的影子贴图：纸的轮廓糊一下。反正是糊的，画在四分之一大小的画布上（省内存，放大了看不出来） */
const SHADOW_SCALE = 0.25;
function shadowCanvas(src, blur) {
  const { c, g } = mkCanvas(src.width * SHADOW_SCALE, src.height * SHADOW_SCALE);
  g.filter = `blur(${blur * SHADOW_SCALE}px)`;
  g.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

/* 贴图传上显卡以后，画布就换成这张 1×1 的空图放掉（要用时照种子重画） */
let blank = null;
const blankCanvas = () => blank || (blank = mkCanvas(1, 1).c);

/* 提示箭头大家共用一张贴图 */
const arrows = new Map();
function arrowArt(u, res) {
  const k = u + '|' + res;
  if (!arrows.has(k)) {
    const a = drawArrow(u, res);
    arrows.set(k, { ...a, tex: canvasTexture(a.canvas) });
  }
  return arrows.get(k);
}

/* 拷一张画布（撕开时分成两半用） */
function copyCanvas(src) {
  const { c, g } = mkCanvas(src.width, src.height);
  g.drawImage(src, 0, 0);
  return { c, g };
}

export function createFlyer(game, { x, y, w, rot, owner, header, design }) {
  /* 提示里怎么叫它：主播上传的叫贴纸 */
  const what = design.custom ? '贴纸' : '小广告';
  const { stage, audio, glare, particles, hud } = game.ctx;
  const u = stage.unit;
  const res = Math.min(2, stage.dpr);
  /* 长相的种子：睡下去再醒过来时照它重画，一模一样 */
  const seed = ((Math.random() * 1e9) | 0) + 1;
  let random = rng(seed);
  const first = drawFlyer(design, { w, header, name: owner.name, u, res, random });
  /* 纸的尺寸、撕的方向、胶带位置这些（不含画布：画布只在醒着时留着） */
  const art = { ...first, canvas: null };
  const ax = art.axis.x;
  const ay = art.axis.y;
  const px = -ay;
  const py = ax;
  /* 纸沿撕的方向从哪儿到哪儿。异形贴纸按图案算：翘起的角从图案的边开始（外框的角多半是透明的，翘了也看不见） */
  const [s0, s1] = (design.span && design.span(ax, ay, art.paperW, art.paperH)) || axisSpan(art.paperW, art.paperH, ax, ay);
  const L0 = s1 - s0;
  let sMin = s0;
  /* 撕烂以后剩下那截从哪儿开始：异形贴纸跳过撕口后面透明的那段，从图案开始 */
  const artFrom = s => (design.span ? Math.min(s1, (design.span(ax, ay, art.paperW, art.paperH, s) || [s])[0]) : s);
  /* 名字签这些画在透明地方的东西也算纸（点得到、看自己露没露出来时也要算上） */
  const inRect = (r, lx, ly) => !!r && lx >= r[0] && lx <= r[2] && ly >= r[1] && ly <= r[3];
  const inHot = (lx, ly) => inRect(art.hot, lx, ly);
  const grabbable = design.inside ? (lx, ly) => design.inside(lx, ly, art.paperW, art.paperH) || inHot(lx, ly) : null;
  const visible = design.shows ? (lx, ly) => design.shows(lx, ly, art.paperW, art.paperH) || inHot(lx, ly) : null;
  const R = clamp(L0 * 0.035, 6 * u, 12 * u);
  const restP = () => Math.min(L0 * 0.07, (s1 - sMin) * 0.2);
  /* 贴平了能盖严实的部分 / 纸最外沿（看自己露没露出来时沿它取点），见 flyer-shape.js；异形贴纸按图案里完全不透明的格子算 */
  const coverArea = design.covers ? (lx, ly) => design.covers(lx, ly, art.paperW, art.paperH) || inRect(art.core, lx, ly) : coverShape(design.paper.kind, art.paperW, art.paperH, u);
  const envelope = paperEnvelope(design.paper.kind, art.paperW, art.paperH, u);
  const sampling = { tapes: art.tapes, u, edge: EDGE_STEP * u, fill: FILL_STEP * u };

  /* 画面上的东西：醒着才有，睡下去全部释放 */
  let texCanvas = null;
  let tex = null;
  let shTex = null;
  let geo = null;
  let shade = null;
  let tri0 = null;
  let keys = null;
  let order = null;
  /* 每个顶点在纸面上沿撕的方向 / 横向的坐标 */
  let vs = null;
  let vt = null;
  let material = null;
  let shMaterial = null;
  let mesh = null;
  let shMesh = null;
  /* 鼠标停在纸上时，翘起的地方出现的箭头 */
  let arrow = null;
  let arrowA = 0;
  let z = 0;
  let asleep = false;
  /* 刚睡下、影子还在淡出（画面上的东西淡完才放掉）；影子深浅（1 = 正常） */
  let dozing = false;
  let shadowK = 1;

  function setLayer() {
    if (!mesh) return;
    /* 后贴的盖在上面（和点中谁的顺序一致） */
    const layer = LAYER.FLYER + z * Z_STEP;
    mesh.renderOrder = layer;
    shMesh.renderOrder = layer - Z_STEP / 2;
  }

  /* 照种子把纸重画一遍（和第一次画的一模一样） */
  function redraw() {
    random = rng(seed);
    return drawFlyer(design, { w, header, name: owner.name, u, res, random }).canvas;
  }

  /* 贴图马上传上显卡，然后放掉画布（完好的纸要撕的时候再照种子重画；撕烂过的样子画不回来，留着） */
  function upload() {
    stage.renderer.initTexture(tex);
    stage.renderer.initTexture(shTex);
    tex.image = blankCanvas();
    shTex.image = blankCanvas();
    if (!damage) texCanvas = null;
  }

  function makeTextures(c) {
    texCanvas = c;
    tex = canvasTexture(c);
    shTex = canvasTexture(shadowCanvas(c, 5 * u * res));
  }

  function build(c) {
    makeTextures(c);
    upload();
    geo = new THREE.PlaneGeometry(art.w, art.h, SX, SY);
    const base = geo.attributes.position.array;
    shade = new Float32Array(geo.attributes.position.count).fill(1);
    geo.setAttribute('aShade', new THREE.BufferAttribute(shade, 1));
    tri0 = Uint32Array.from(geo.index.array);
    keys = new Float32Array(tri0.length / 3);
    order = Array.from(keys, (_, i) => i);
    vs = new Float32Array(shade.length);
    vt = new Float32Array(shade.length);
    for (let i = 0; i < shade.length; i++) {
      const lx = base[i * 3];
      const ly = -base[i * 3 + 1];
      vs[i] = lx * ax + ly * ay;
      vt[i] = lx * px + ly * py;
    }
    material = makeMaterial(tex, art.back, false);
    shMaterial = makeMaterial(shTex, art.back, true);
    mesh = new THREE.Mesh(geo, material);
    shMesh = new THREE.Mesh(geo, shMaterial);
    mesh.frustumCulled = false;
    shMesh.frustumCulled = false;
    mesh.rotation.z = -rot;
    shMesh.rotation.z = -rot;
    setLayer();
    stage.pane.add(shMesh);
    stage.pane.add(mesh);
    const ar = arrowArt(u, res);
    arrow = createSprite(stage, ar.canvas, ar.w, ar.h, LAYER.FLYER + 1.5, { texture: ar.tex });
    /* 新建的精灵默认是显示的：先藏起来，鼠标指着才出来 */
    arrowA = 0;
    arrow.set(x, y, 0, 1, 0);
    lastKey = -1;
    shown = null;
  }

  function free() {
    stage.pane.remove(mesh);
    stage.pane.remove(shMesh);
    geo.dispose();
    material.dispose();
    shMaterial.dispose();
    tex.dispose();
    shTex.dispose();
    arrow.dispose();
    texCanvas = tex = shTex = geo = shade = tri0 = keys = order = vs = vt = null;
    material = shMaterial = mesh = shMesh = arrow = null;
  }

  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  const toLocal = (sx, sy) => {
    const dx = sx - x;
    const dy = sy - y;
    return { x: dx * cos + dy * sin, y: -dx * sin + dy * cos };
  };
  const toScreen = (lx, ly) => ({ x: x + lx * cos - ly * sin, y: y + lx * sin + ly * cos });

  let state = 'slap';
  let t = 0;
  let peel = L0 * 0.86;
  let peelGoal = peel;
  let skew = 0;
  let grab = null;
  let vel = { x: 0, y: 0 };
  let last = null;
  let hovered = false;
  let warnT = 0;
  let damage = 0;
  let lastKey = -1;
  let settleT = 0;
  /* 撕下来正在往下掉：位移、速度、转角、计时 */
  let fall = null;
  /* 上次按什么样子摆的顶点（揭起多少、歪多少）：没变就不用每帧重算、重传（几百张醒着时很要紧） */
  let shown = null;

  function deform() {
    if (shown && Math.abs(peel - shown.peel) < 0.02 && Math.abs(skew - shown.skew) < 0.02) return;
    shown = { peel, skew };
    const pos = geo.attributes.position.array;
    let folded = false;
    for (let i = 0; i < shade.length; i++) {
      const s = vs[i] - sMin;
      const r = rollPoint(s, peel, R);
      let nt = vt[i];
      if (s < peel) {
        nt += skew * clamp((peel - s) / Math.max(1, peel), 0, 1);
        folded = true;
      }
      const ns = r.s + sMin;
      const lx = ax * ns + px * nt;
      const ly = ay * ns + py * nt;
      pos[i * 3] = lx;
      pos[i * 3 + 1] = -ly;
      shade[i] = r.shade;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.aShade.needsUpdate = true;
    /* 卷起来翻到上面的那部分最后画（盖在还贴着的纸上面） */
    const key = folded ? Math.round(peel) : 0;
    if (key === lastKey) return;
    lastKey = key;
    for (let k = 0; k < keys.length; k++) {
      const a = tri0[k * 3];
      const b = tri0[k * 3 + 1];
      const c = tri0[k * 3 + 2];
      keys[k] = Math.max(peel - (vs[a] - sMin), peel - (vs[b] - sMin), peel - (vs[c] - sMin));
    }
    order.sort((p, q) => keys[p] - keys[q]);
    const out = geo.index.array;
    for (let k = 0; k < order.length; k++) {
      const o = order[k] * 3;
      out[k * 3] = tri0[o];
      out[k * 3 + 1] = tri0[o + 1];
      out[k * 3 + 2] = tri0[o + 2];
    }
    geo.index.needsUpdate = true;
  }

  function place(scale = 1) {
    mesh.position.set(x, stage.H - y, 0);
    shMesh.position.set(x + 3 * u, stage.H - y - 5 * u, 0);
    mesh.scale.set(scale, scale, 1);
    shMesh.scale.set(scale, scale, 1);
  }

  /* 纸面局部点在不在还粘着的纸上 */
  function onPaper(l) {
    if (Math.abs(l.x) > art.paperW / 2 + 4 * u || Math.abs(l.y) > art.paperH / 2 + 4 * u) return false;
    const along = l.x * ax + l.y * ay;
    /* 翘起来卷着的那一小截也能抓 */
    if (along < sMin - R) return false;
    /* 异形贴纸：透明的地方抓不到（底下的照样能刮）；翘起的那头前面一点点（R 以内）看正前方有没有图案，好下手 */
    if (grabbable) {
      const f = Math.max(0, sMin - along);
      if (!grabbable(l.x + ax * f, l.y + ay * f)) return false;
    }
    return true;
  }

  function setTexture(c) {
    tex.dispose();
    shTex.dispose();
    makeTextures(c);
    material.uniforms.uMap.value = tex;
    shMaterial.uniforms.uMap.value = shTex;
  }

  /* 纸面局部坐标的多边形 → 画布像素路径 */
  function polyPath(g, pts) {
    g.beginPath();
    pts.forEach(([lx, ly], i) => {
      const cx = (lx + art.w / 2) * res;
      const cy = (ly + art.h / 2) * res;
      if (i) g.lineTo(cx, cy);
      else g.moveTo(cx, cy);
    });
    g.closePath();
  }

  /* 撕烂：沿 cut（沿撕的方向的位置）一条毛边，翘起那头那截被扯走，剩下的还粘着 */
  function tear(dirX, dirY) {
    const L = s1 - sMin;
    const cut = sMin + clamp(Math.max(peel, L * 0.34) + rand(-0.04, 0.04) * L, L * 0.22, L * 0.8);
    const T = Math.hypot(art.w, art.h);
    const edge = [];
    for (let tt = -T / 2; tt <= T / 2; tt += 7 * u) {
      const j = (random() - 0.5) * 12 * u + Math.sin(tt / (9 * u)) * 3 * u;
      edge.push([ax * (cut + j) + px * tt, ay * (cut + j) + py * tt]);
    }
    const far = cut - T;
    const piecePoly = [...edge, [ax * far + px * (T / 2), ay * far + py * (T / 2)], [ax * far - px * (T / 2), ay * far - py * (T / 2)]];
    const piece = copyCanvas(texCanvas);
    piece.g.globalCompositeOperation = 'destination-in';
    polyPath(piece.g, piecePoly);
    piece.g.fill();
    const rest = copyCanvas(texCanvas);
    rest.g.globalCompositeOperation = 'destination-out';
    polyPath(rest.g, piecePoly);
    rest.g.fill();
    /* 毛边：纸芯是白的，撕口露出一圈白纤维 */
    for (const part of [piece, rest]) {
      part.g.globalCompositeOperation = 'source-atop';
      part.g.beginPath();
      edge.forEach(([lx, ly], i) => {
        const cx = (lx + art.w / 2) * res;
        const cy = (ly + art.h / 2) * res;
        if (i) part.g.lineTo(cx, cy);
        else part.g.moveTo(cx, cy);
      });
      part.g.lineWidth = 4 * u * res;
      part.g.strokeStyle = 'rgba(255,253,246,.95)';
      part.g.stroke();
      part.g.lineWidth = 1.2 * u * res;
      part.g.strokeStyle = 'rgba(160,140,110,.5)';
      part.g.stroke();
    }
    const mid = toScreen(ax * (sMin + cut) * 0.5, ay * (sMin + cut) * 0.5);
    game.addActor(createDebris(game, { art: { canvas: piece.c, w: art.w, h: art.h }, x, y, vx: clamp(vel.x, -1600, 1600) + dirX * 500 * u, vy: clamp(vel.y, -1600, 1600) + dirY * 500 * u - 250 * u, rot, vr: rand(-5, 5), g: 1500, life: 2.2, scale: 1, scale1: 0.75, layer: DEBRIS_LAYER }));
    for (let i = 0; i < 10; i++) particles.emit({ frame: P.SHARD, x: mid.x + rand(-30, 30) * u, y: mid.y + rand(-30, 30) * u, vx: rand(-260, 260) * u, vy: rand(-320, -60) * u, g: 1400 * u, size: rand(9, 16) * u, rot: rand(0, 6), life: 0.9, alpha: 0.9 });
    audio.tear();
    glare.tap(mid.x, mid.y);
    damage++;
    sMin = artFrom(cut);
    grab = null;
    skew = 0;
    if (s1 - sMin < L0 * 0.3 || damage >= 3) {
      toScrap(rest.c);
      return false;
    }
    setTexture(rest.c);
    peel = 0;
    peelGoal = restP();
    lastKey = -1;
    shown = null;
    state = 'stuck';
    game.flyerCovering(self, true);
    if (damage === 1) hud.toast(`撕烂了！@${owner.name} 的${what}还粘着半张`, 'block');
    return true;
  }

  /* 剩下一小块撕不动了：变成碎纸粘在玻璃上，只能刮 */
  function toScrap(c) {
    const { c: cc, g } = mkCanvas(c.width, c.height);
    g.drawImage(c, 0, 0);
    game.addStain({ kind: 'scrap', label: '碎纸', owner, tag: false, x, y, rot, art: { canvas: cc, w: art.w, h: art.h }, toughness: 2, opacity: 1, smear: 0.35, pop: 0 });
    hud.toast(`@${owner.name} 的${what}撕成碎纸粘住了，刮掉它`, 'block');
    state = 'gone';
  }

  /* 顺着撕下来了：整张飞走；胶带那头留两块胶印，浆糊留一点点浆糊印 */
  function peelOff() {
    /* 不再换成一张"平的整张"飞走（那样一撕完纸会突然变回平的，像闪了一下）：就用它自己，带着卷边接着卷、往下掉、淡掉 */
    state = 'off';
    fall = { t: 0, x: 0, y: 0, vx: clamp(vel.x, -1400, 1400) * 0.5, vy: clamp(vel.y, -1400, 1400) * 0.5 - 220 * u, spin: 0, vr: rand(-1.6, 1.6), goal: Math.min(s1 - sMin, peel + (s1 - sMin) * 0.15) };
    grab = null;
    hovered = false;
    arrowA = 0;
    arrow.set(x, y, 0, 1, 0);
    mesh.renderOrder = DEBRIS_LAYER;
    shMesh.renderOrder = DEBRIS_LAYER - 0.0005;
    audio.peel(1);
    glare.tap(x, y);
    for (const tp of art.tapes) {
      if (tp.x * ax + tp.y * ay < sMin) continue;
      const s = toScreen(tp.x, tp.y);
      game.addStain({ kind: 'tape', label: '胶印', owner, tag: false, x: s.x, y: s.y, rot: rot + tp.rot, art: artTape(random, tp.w, tp.h, u, res), toughness: 2, opacity: 0.8, smear: 0.4 });
    }
    if (art.stick === 'paste') {
      for (let i = 0; i < 2; i++) {
        const sAt = s1 - (0.12 + random() * 0.25) * L0;
        const tAt = (random() - 0.5) * Math.min(art.paperW, art.paperH) * 0.5;
        const s = toScreen(ax * sAt + px * tAt, ay * sAt + py * tAt);
        const gw = rand(40, 70) * u;
        game.addStain({ kind: 'glue', label: '浆糊印', owner, tag: false, x: s.x, y: s.y, rot: rand(0, 6), art: artGlue(random, gw, gw * rand(0.5, 0.8), u, res), toughness: 1, opacity: 0.85, smear: 0.3 });
      }
    }
    if (!damage) particles.sparkle(x, y, 10, 80);
    game.credit(what, owner, x, y, damage ? `撕掉了 @${owner.name} 的${what}` : `完整撕下 @${owner.name} 的${what}！`);
  }

  /* 撕下来的纸往下掉：剩下那截再卷一点，带着卷边掉、转一点、缩一点、淡掉；影子很快就没了（纸离开玻璃了） */
  function falling(dt) {
    fall.t += dt;
    fall.vy += 1500 * u * dt;
    fall.x += fall.vx * dt;
    fall.y += fall.vy * dt;
    fall.spin += fall.vr * dt;
    peel += (fall.goal - peel) * Math.min(1, dt * 10);
    skew *= Math.exp(-dt * 6);
    const k = clamp(fall.t / FALL_TIME, 0, 1);
    const sc = 1 - 0.12 * k;
    mesh.position.set(x + fall.x, stage.H - (y + fall.y), 0);
    shMesh.position.set(x + fall.x + 3 * u, stage.H - (y + fall.y) - 5 * u, 0);
    mesh.rotation.z = -(rot + fall.spin);
    shMesh.rotation.z = mesh.rotation.z;
    mesh.scale.set(sc, sc, 1);
    shMesh.scale.set(sc, sc, 1);
    material.uniforms.uOpacity.value = 1 - clamp((k - 0.4) / 0.6, 0, 1);
    shMaterial.uniforms.uOpacity.value = 0.32 * clamp(1 - fall.t / 0.2, 0, 1);
    deform();
    return k < 1;
  }

  function arrowUpdate(dt) {
    const show = hovered && state === 'stuck' ? 1 : 0;
    /* 没指着、箭头也已经淡没了：不用每帧摆 */
    if (!show && arrowA < 0.002) {
      if (arrowA > 0) {
        arrowA = 0;
        arrow.set(x, y, 0, 1, 0);
      }
      return;
    }
    arrowA += (show - arrowA) * Math.min(1, dt * 10);
    const k = sMin + Math.min((s1 - sMin) * 0.3, 70 * u) + Math.sin(t * 6) * 5 * u;
    const at = toScreen(ax * k, ay * k);
    arrow.set(at.x, at.y, rot + Math.atan2(ay, ax), 1, arrowA);
  }

  /* 纸、胶带、影子的屏幕外框（判断叠没叠在一起用） */
  const ex = Math.abs((art.w / 2) * cos) + Math.abs((art.h / 2) * sin);
  const ey = Math.abs((art.w / 2) * sin) + Math.abs((art.h / 2) * cos);
  const box = { x0: x - ex, y0: y - ey, x1: x + ex + 8 * u, y1: y + ey + 10 * u };

  const self = {
    kind: 'flyer',
    owner,
    at: { x, y },
    box,
    get z() {
      return z;
    },
    setZ(v) {
      z = v;
      setLayer();
    },
    get asleep() {
      return asleep;
    },
    /* 只有完好、贴平的才睡（撕烂过的样子没法照种子重画） */
    get canSleep() {
      return !asleep && state === 'stuck' && !damage;
    },
    /* (sx, sy) 被这张贴平的部分盖着：纸的轮廓往里一点；翘起的角（鼠标停上去还会再翘高一点）掀开的那块不算 */
    covers(sx, sy) {
      if (state !== 'stuck') return false;
      const dx = sx - x;
      const dy = sy - y;
      const lx = dx * cos + dy * sin;
      const ly = -dx * sin + dy * cos;
      return lx * ax + ly * ay >= sMin + liftBand(restP(), u) && coverArea(lx, ly);
    },
    /* 要盖住它得盖住这些点：纸最外沿一圈（不干胶白边、毛边都算）、胶带四角、纸面里一格格的点 */
    everySample(fn) {
      /* 异形贴纸透明的地方没有纸，不用盖 */
      return eachPaperSample(envelope, sampling, (lx, ly) => (visible && !visible(lx, ly)) || fn(x + lx * cos - ly * sin, y + lx * sin + ly * cos));
    },
    /* 整张被盖住：画面上的东西全放掉 */
    /* now：马上放掉（验收用）；平时先让影子淡出，淡完再放 */
    sleep(now = false) {
      if (asleep) return;
      asleep = true;
      hovered = false;
      arrowA = 0;
      arrow.set(x, y, 0, 1, 0);
      dozing = !now;
      if (now) free();
    },
    /* 露出来了：照种子重画，原样贴在原处；影子从没有淡入（instant：影子直接画全，验收用） */
    wake(instant = false) {
      if (!asleep) return;
      asleep = false;
      if (dozing) {
        /* 还没放掉（影子正在淡出）：接着用，影子从现在的深浅再淡入回去 */
        dozing = false;
        if (instant) shadowK = 1;
        shMaterial.uniforms.uOpacity.value = 0.32 * shadowK;
        return;
      }
      build(redraw());
      material.uniforms.uOpacity.value = 1;
      shadowK = instant ? 1 : 0;
      shMaterial.uniforms.uOpacity.value = 0.32 * shadowK;
      peel = restP();
      peelGoal = peel;
      skew = 0;
      place(1);
      deform();
      arrowUpdate(0);
    },
    /* 试玩/自动演示/验收用：从哪儿按、往哪个方向拖、拖多远 */
    get peelHint() {
      if (asleep || state === 'off' || state === 'gone') return null;
      /* 从翘起的那头往里一点按。那头伸出画面了就顺着撕的方向往里挪，挪到画面里（纸上哪儿按住都能顺着揭） */
      const m = 12 * u;
      const off = p => p.x < m || p.y < m || p.x > stage.W - m || p.y > stage.H - m;
      let k = sMin + Math.min((s1 - sMin) * 0.12, 30 * u);
      let p0 = toScreen(ax * k, ay * k);
      /* 异形贴纸：翘起的角可能是透明的，往里挪到有图案的地方 */
      const blank = () => design.inside && !design.inside(ax * k, ay * k, art.paperW, art.paperH);
      while ((off(p0) || blank()) && k < s1 - 30 * u) {
        k += 8 * u;
        p0 = toScreen(ax * k, ay * k);
      }
      const d = { x: ax * cos - ay * sin, y: ax * sin + ay * cos };
      return { x: p0.x, y: p0.y, dx: d.x, dy: d.y, len: ((s1 - sMin) * DONE_SHARE) / GAIN + 40 * u };
    },
    get debug() {
      return { design: design.id, stick: art.stick, damage, state, asleep };
    },
    hover(hx, hy, top) {
      hovered = !asleep && !!top && state === 'stuck' && !game.inZone(hx, hy) && onPaper(toLocal(hx, hy));
    },
    hit(hx, hy) {
      /* 露脸区里那部分是看不见的：点脸不会抓到小广告 */
      if (asleep || state !== 'stuck' || game.inZone(hx, hy) || !onPaper(toLocal(hx, hy))) return null;
      return {
        grab(gx, gy) {
          /* 撕烂、撕下来都要用到纸的画布 */
          if (!texCanvas) texCanvas = redraw();
          settleT = 0;
          grab = { x: gx, y: gy, p0: peel };
          last = { x: gx, y: gy, t: game.time };
          vel = { x: 0, y: 0 };
          state = 'peel';
          /* 一揭起来，底下被它盖住的那几张马上醒过来（揭开的地方露出来的是它们） */
          game.flyerCovering(self, false);
          audio.peel(0.35);
        },
        move(mx, my) {
          if (state !== 'peel' || !grab) return;
          const dt = Math.max(0.008, game.time - last.t);
          vel = { x: (mx - last.x) / dt, y: (my - last.y) / dt };
          last = { x: mx, y: my, t: game.time };
          const dx = mx - grab.x;
          const dy = my - grab.y;
          const lx = dx * cos + dy * sin;
          const ly = -dx * sin + dy * cos;
          const v = peelVerdict(lx, ly, ax, ay, 18 * u);
          if (v === 'tear') {
            const len = Math.hypot(dx, dy) || 1;
            tear(dx / len, dy / len);
            return;
          }
          if (v === 'wait') return;
          const along = lx * ax + ly * ay;
          peelGoal = Math.max(restP(), grab.p0 + along * GAIN);
          skew = clamp((lx * px + ly * py) * 0.45, -60 * u, 60 * u);
          if (v === 'warn' && warnT <= 0) {
            warnT = 0.2;
            audio.peel(1.2);
          }
        },
        release() {
          if (state !== 'peel') return;
          grab = null;
          /* 手已经拉到头了（拉得快，纸还没跟上）：照样算撕下来 */
          if (peelGoal >= (s1 - sMin) * DONE_SHARE) peelOff();
          else state = 'back';
        }
      };
    },
    update(dt) {
      if (state === 'gone') return false;
      if (asleep) {
        if (dozing) {
          shadowK = Math.max(0, shadowK - dt / SHADOW_FADE);
          shMaterial.uniforms.uOpacity.value = 0.32 * shadowK;
          if (shadowK <= 0) {
            dozing = false;
            free();
          }
        }
        return true;
      }
      if (state === 'off') return falling(dt);
      if (shadowK < 1 && state !== 'slap') {
        shadowK = Math.min(1, shadowK + dt / SHADOW_FADE);
        shMaterial.uniforms.uOpacity.value = 0.32 * shadowK;
      }
      t += dt;
      warnT -= dt;
      if (state === 'slap') {
        /* 从粘死的那头往翘起的那头抹平 */
        const k = clamp(t / 0.45, 0, 1);
        const e = easeOutCubic(k);
        peel = L0 * 0.86 + (restP() - L0 * 0.86) * e;
        material.uniforms.uOpacity.value = Math.min(1, k * 4);
        shMaterial.uniforms.uOpacity.value = 0.32 * Math.min(1, k * 4);
        place(1.06 - 0.06 * e);
        if (k >= 1) {
          state = 'stuck';
          peelGoal = restP();
          game.flyerCovering(self, true);
          /* 它自己也可能刚贴平就整张被盖住，睡下了 */
          if (asleep) return true;
        }
      } else if (state === 'peel') {
        peel += (peelGoal - peel) * Math.min(1, dt * 18);
        if (peel >= (s1 - sMin) * DONE_SHARE) {
          peelOff();
          return true;
        }
        if (peel > restP() * 1.5 && Math.random() < dt * 6) audio.peel(0.5);
      } else {
        /* 松手没撕完：弹回去重新粘上；平时翘起的角，鼠标停上去会抖一抖 */
        if (state === 'back' && Math.abs(peel - restP()) < 1) {
          state = 'stuck';
          settleT = SETTLE_DELAY;
        } else if (state === 'stuck' && settleT > 0) {
          settleT -= dt;
          if (settleT <= 0) {
            upload();
            game.flyerCovering(self, true);
            if (asleep) return true;
          }
        }
        skew *= Math.exp(-dt * 12);
        const goal = restP() * (hovered && state === 'stuck' ? 1.35 + 0.25 * Math.sin(t * 9) : 1);
        peel += (goal - peel) * Math.min(1, dt * (state === 'back' ? 10 : 8));
      }
      deform();
      arrowUpdate(dt);
      return true;
    },
    /* 显卡上下文丢了又恢复：贴图重新传（画布早放掉了，照种子重画；撕烂过的用留着的画布）。
       旧贴图跟着旧上下文一起没了，不用（也不能）再释放 */
    restore() {
      if (!mesh) return;
      /* 睡下了、影子正在淡出：不用淡了，直接放掉 */
      if (asleep) {
        dozing = false;
        free();
        return;
      }
      makeTextures(texCanvas || redraw());
      material.uniforms.uMap.value = tex;
      shMaterial.uniforms.uMap.value = shTex;
      if (state === 'stuck' || state === 'slap') upload();
    },
    dispose() {
      /* 清空玻璃时可能正被拖着：之后再拖、松手都不理它 */
      state = 'gone';
      grab = null;
      dozing = false;
      if (mesh) free();
    }
  };

  build(first.canvas);
  place(1.06);
  deform();
  return self;
}

/* 提示箭头：两道白色 V 形（指向 +x） */
function drawArrow(u, res) {
  const w = 54 * u;
  const h = 34 * u;
  const { c, g } = mkCanvas(w * res, h * res);
  g.scale(res, res);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  for (const [k, a] of [[0, 0.65], [1, 1]]) {
    const x0 = 10 * u + k * 16 * u;
    g.beginPath();
    g.moveTo(x0, 6 * u);
    g.lineTo(x0 + 13 * u, h / 2);
    g.lineTo(x0, h - 6 * u);
    g.lineWidth = 9 * u;
    g.strokeStyle = INK;
    g.globalAlpha = a;
    g.stroke();
    g.lineWidth = 5 * u;
    g.strokeStyle = '#ffffff';
    g.stroke();
  }
  return { canvas: c, w, h };
}
