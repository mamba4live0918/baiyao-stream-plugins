/* 擦玻璃 · "压平"：把一块脏东西现在看起来的样子画成一张普通图片（颜色 × 擦除遮罩，用和着色器同一条曲线），
   好沉进陈年污垢层里。沉下去以后用全新的遮罩（= 1）显示，看起来和沉之前一样。 */

const SMOOTH_A = 0.045;
const SMOOTH_B = 0.15;
let tmp = null;
let tmp2 = null;

function canvasOf(slot, w, h) {
  let c = slot === 1 ? tmp : tmp2;
  if (!c) {
    c = document.createElement('canvas');
    if (slot === 1) tmp = c;
    else tmp2 = c;
  }
  if (c.width < w || c.height < h) {
    c.width = Math.max(c.width, w);
    c.height = Math.max(c.height, h);
  }
  return c;
}

/* 遮罩值 m（0..1）在画面上留下多少：和 stain-material 的 keep 一样 */
function keepOf(m) {
  const t = Math.min(1, Math.max(0, (m - SMOOTH_A) / (SMOOTH_B - SMOOTH_A)));
  return t * t * (3 - 2 * t) * (0.25 + 0.75 * m);
}

/* 颜色像素 cd（RGBA）× 放大到同尺寸的遮罩 md：原地改成"看起来的样子"（抹开的地方变浅、略灰） */
function applyMask(cd, md, smear) {
  for (let j = 0; j < cd.length; j += 4) {
    const a = cd[j + 3];
    if (!a) continue;
    const m = md[j + 3] / 255;
    if (m >= 0.999) continue;
    const k = keepOf(m);
    const na = a * k;
    if (na < 1) {
      cd[j + 3] = 0;
      continue;
    }
    const s = (1 - m) * smear;
    cd[j] += (33 - 0.18 * cd[j]) * s;
    cd[j + 1] += (33 - 0.18 * cd[j + 1]) * s;
    cd[j + 2] += (33 - 0.18 * cd[j + 2]) * s;
    cd[j + 3] = na;
  }
}

/* 一块脏东西压平后的图（颜色画布同尺寸）。没被刮过就直接用原图。
   返回 { canvas, sw, sh }：canvas 左上 sw×sh 是有效区域；透明度还没乘整体不透明度（画的时候用 globalAlpha） */
export function flattenStain(s) {
  const cw = s.color.width;
  const ch = s.color.height;
  if (s.lastTouch < 0) return { canvas: s.color, sw: cw, sh: ch };
  const mc = canvasOf(1, cw, ch);
  const mg = mc.getContext('2d', { willReadFrequently: true });
  mg.clearRect(0, 0, cw, ch);
  mg.drawImage(s.mask, 0, 0, cw, ch);
  const md = mg.getImageData(0, 0, cw, ch).data;
  const img = s.colorG.getImageData(0, 0, cw, ch);
  applyMask(img.data, md, s.material.uniforms.uSmear.value);
  const oc = canvasOf(2, cw, ch);
  const og = oc.getContext('2d', { willReadFrequently: true });
  og.clearRect(0, 0, oc.width, oc.height);
  og.putImageData(img, 0, 0);
  return { canvas: oc, sw: cw, sh: ch };
}

/* 污垢格 tile 被刮过以后要往里画新东西：先把整格刮过的样子"压"进颜色，再把遮罩补满。
   这样新沉下来的东西不会把以前刮掉的旧污垢一起"复活"；整格一起压，不会留接缝。 */
export function commitTile(tile) {
  const cw = tile.color.width;
  const ch = tile.color.height;
  const mc = canvasOf(1, cw, ch);
  const mg = mc.getContext('2d', { willReadFrequently: true });
  mg.clearRect(0, 0, cw, ch);
  mg.drawImage(tile.mask, 0, 0, cw, ch);
  const md = mg.getImageData(0, 0, cw, ch).data;
  const img = tile.colorG.getImageData(0, 0, cw, ch);
  applyMask(img.data, md, tile.material.uniforms.uSmear.value);
  tile.colorG.putImageData(img, 0, 0);
  const m = tile.maskG;
  m.save();
  m.globalCompositeOperation = 'source-over';
  m.fillStyle = '#fff';
  m.fillRect(0, 0, tile.mask.width, tile.mask.height);
  m.restore();
  tile.maskTex.needsUpdate = true;
  tile.mapTex.needsUpdate = true;
  tile.weightDirty = true;
}
