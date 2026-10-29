/* 小广告：17 种版式（flyer-designs.js）× 四种粘法。纸的四周留一圈空白给阴影和卷边。 */
import { INK, canvas, rr, shape, shine, tone } from './ink.js';
import { drawPaper, gloss, dieCut, tape, pasteStreaks } from './flyer-kit.js';
import { DESIGNS } from './flyer-designs.js';

export { DESIGNS };

/* 轮着来：一袋里每种都出现一次再洗牌，连着贴的几张不会长得一样 */
let bag = [];
export function nextDesign() {
  if (!bag.length) bag = DESIGNS.map((_, i) => i).sort(() => Math.random() - 0.5);
  return DESIGNS[bag.pop()];
}

/* 名字太长就截断，排版放得下 */
const shortName = n => {
  const cs = [...String(n || '')];
  return cs.length > 9 ? cs.slice(0, 8).join('') + '…' : cs.join('');
};

/* 画一张小广告。w：纸宽（像素，已乘 u 和大小）；header：观众"贴xxx"时的字（没有就用版式自己的标题）。
   返回 { canvas, w, h（含四周留白）, paperW, paperH, axis（撕的方向，纸面局部单位向量：从翘起的那头指向粘死的那头）,
          stick, tapes（胶带在纸面上的位置）, back（纸背面颜色）, id, hot / core（版式说"这块也算纸" / "这块也盖得住"的范围，异形贴纸的名字签；没有为 null） } */
export function drawFlyer(design, { w, header, name, u, res = 1, random = Math.random }) {
  const pw = w;
  const ph = w * design.aspect;
  const pad = 14 * u;
  const cw = pw + pad * 2;
  const ch = ph + pad * 2;
  const { c, g } = canvas(cw * res, ch * res);
  g.scale(res, res);
  g.translate(cw / 2, ch / 2);
  drawPaper(g, design.paper, pw, ph, u, random);
  const custom = header ? String(header) : '';
  const extra = design.draw(g, { w: pw, h: ph, u, random, at: '@' + shortName(name), title: def => custom || def });
  /* 怎么粘的 → 撕的方向 */
  let ax = 0;
  let ay = -1;
  const tapes = [];
  if (design.stick === 'paste' || design.stick === 'sticker') {
    /* 一个角翘起来，顺着对角线撕 */
    const cx = random() < 0.5 ? -1 : 1;
    const cy = random() < 0.5 ? -1 : 1;
    const l = Math.hypot(pw, ph);
    ax = (-cx * pw) / l;
    ay = (-cy * ph) / l;
    if (design.stick === 'paste') pasteStreaks(g, pw, ph, u, ax, ay, random);
    else if (design.paper.kind !== 'custom') {
      gloss(g, pw, ph, u, design.paper.kind);
      if (design.paper.kind === 'sticker') dieCut(g, pw, ph, u);
    }
  } else if (design.stick === 'tape') {
    /* 胶带粘死一条边（多半是上边），对边翘起来，朝胶带那边撕 */
    const side = random() < 0.55 ? 'top' : ['left', 'right', 'bottom'][Math.floor(random() * 3)];
    const tw = Math.min(pw, ph) * 0.3;
    const th = tw * 0.34;
    const sp = side === 'top' || side === 'bottom' ? pw * 0.3 : ph * 0.3;
    for (const k of [-1, 1]) {
      const jitter = (random() - 0.5) * 0.3;
      if (side === 'top') tapes.push(tape(g, k * sp, -ph / 2, k * 0.2 + jitter, tw, th, u));
      else if (side === 'bottom') tapes.push(tape(g, k * sp, ph / 2, -k * 0.2 + jitter, tw, th, u));
      else if (side === 'left') tapes.push(tape(g, -pw / 2, k * sp, Math.PI / 2 + k * 0.2 + jitter, tw, th, u));
      else tapes.push(tape(g, pw / 2, k * sp, Math.PI / 2 - k * 0.2 + jitter, tw, th, u));
    }
    ax = side === 'left' ? -1 : side === 'right' ? 1 : 0;
    ay = side === 'top' ? -1 : side === 'bottom' ? 1 : 0;
  }
  /* note：背面上边一条胶，下边翘起来，往上撕（默认 ax=0, ay=-1） */
  return { canvas: c, w: cw, h: ch, paperW: pw, paperH: ph, pad, axis: { x: ax, y: ay }, stick: design.stick, tapes, back: design.back, id: design.id, res, hot: (extra && extra.hot) || null, core: (extra && extra.core) || null };
}

/* 写字的手指（指尖朝左下，指尖在画布的 tip 点） */
export function drawFinger(size, u, res = 1) {
  const w = size * 1.3;
  const h = size * 1.3;
  const { c, g } = canvas(w * res, h * res);
  g.scale(res, res);
  g.translate(w * 0.22, h * 0.78);
  g.rotate(-0.85);
  const fw = size * 0.3;
  const fl = size * 0.95;
  shape(g, p => rr(p, -fw / 2, -fl, fw, fl, fw / 2), '#ffd9c4', { line: 3 * u, shade: -0.1 });
  shape(g, p => {
    p.ellipse(0, -fw * 0.28, fw * 0.3, fw * 0.36, 0, 0, Math.PI * 2);
  }, '#fff0f2', { line: 2 * u, noShade: true });
  g.beginPath();
  g.moveTo(-fw * 0.3, -fl * 0.55);
  g.lineTo(fw * 0.1, -fl * 0.55);
  g.lineWidth = 2 * u;
  g.strokeStyle = tone('#ffd9c4', -0.3);
  g.stroke();
  shine(g, -fw * 0.18, -fl * 0.72, 2.4 * u, 8 * u, 0, 0.7);
  return { canvas: c, w, h, tip: [w * 0.22 - w / 2, h * 0.78 - h / 2] };
}
