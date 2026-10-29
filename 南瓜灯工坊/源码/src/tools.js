// 点火棒和糖罐：画、点中判断、火苗 / 罐口在哪。工作台在右边（塔在左）时左右镜像，火苗和罐口总是朝着南瓜。
import { img, CANDIES } from './assets.js';

const FLAME = { x: 0.13, y: 0.17 };   // 火苗中心在点火棒图里的位置（图 268×300）
const TORCH_ASPECT = 268 / 300;

const dims = (kind, L, o) => {
  const h = L.tool.size * (kind === 'jar' ? 1.05 : 1) * (o.s ?? 1);
  return { w: h * (kind === 'jar' ? 0.7 : TORCH_ASPECT), h };
};
/** 糖罐不缩放时的宽高（罐子里的糖按这个尺寸算物理）。 */
export const jarSize = L => dims('jar', L, { s: 1 });
const rotate = (o, lx, ly) => {
  const c = Math.cos(o.rot || 0), s = Math.sin(o.rot || 0);
  return { x: o.x + lx * c - ly * s, y: o.y + lx * s + ly * c };
};

export function flameTip(o, L) {
  const { w, h } = dims('torch', L, o), m = L.flip ? -1 : 1;
  return rotate(o, (FLAME.x - 0.5) * w * m, (FLAME.y - 0.5) * h);
}

export function jarMouth(o, L) {
  const { h } = dims('jar', L, o);
  return rotate(o, 0, -h * 0.46);
}

export function toolHit(o, kind, L, x, y) {
  const { w, h } = dims(kind, L, { ...o, s: 1 });
  return Math.abs(x - o.x) < w * 0.6 && Math.abs(y - o.y) < h * 0.6;
}

export function drawTool(g, kind, o, L, t, burning) {
  if (!(o.s > 0.01)) return;
  const { w, h } = dims('torch', L, o), frame = burning ? Math.floor(t * 12) % 3 : 0, im = img('wand-' + frame);
  g.save();
  g.translate(o.x, o.y);
  g.rotate(o.rot || 0);
  if (L.flip) g.scale(-1, 1);
  if (im) g.drawImage(im, -w / 2, -h / 2, w, h);
  const fx = (FLAME.x - 0.5) * w, fy = (FLAME.y - 0.5) * h, r = h * (burning ? 0.32 : 0.22);
  g.globalCompositeOperation = 'lighter';
  const gr = g.createRadialGradient(fx, fy, 0, fx, fy, r);
  gr.addColorStop(0, 'rgba(255,230,150,.55)');
  gr.addColorStop(1, 'rgba(255,150,40,0)');
  g.fillStyle = gr;
  g.fillRect(fx - r, fy - r, r * 2, r * 2);
  g.restore();
}

/** 糖罐：圆肚子玻璃罐，里面装满砸砸乐的糖果。 */
export function drawJar(g, o, L, sim) {
  if (!(o.s > 0.01)) return;
  const { w, h } = dims('jar', L, o), lw = Math.max(2, h * 0.022);
  g.save();
  g.translate(o.x, o.y);
  g.rotate(o.rot || 0);
  const body = () => {
    g.beginPath();
    g.moveTo(-w * 0.3, -h * 0.4);
    g.lineTo(w * 0.3, -h * 0.4);
    g.quadraticCurveTo(w * 0.32, -h * 0.3, w * 0.46, -h * 0.18);
    g.quadraticCurveTo(w * 0.56, h * 0.25, w * 0.4, h * 0.44);
    g.quadraticCurveTo(0, h * 0.53, -w * 0.4, h * 0.44);
    g.quadraticCurveTo(-w * 0.56, h * 0.25, -w * 0.46, -h * 0.18);
    g.quadraticCurveTo(-w * 0.32, -h * 0.3, -w * 0.3, -h * 0.4);
    g.closePath();
  };
  body();
  g.fillStyle = 'rgba(235,246,255,.24)';   // 玻璃很透，里面的糖颜色要亮；轮廓和高光让人看出是玻璃
  g.fill();
  g.save();
  body(); g.clip();
  sim?.draw(g, o.s ?? 1);   // 罐子里的糖（会滚、会晃、会从罐口掉出去）
  g.fillStyle = 'rgba(255,255,255,.28)';
  g.beginPath(); g.ellipse(-w * 0.26, -h * 0.02, w * 0.06, h * 0.26, 0.15, 0, Math.PI * 2); g.fill();
  g.restore();
  body();
  g.strokeStyle = '#6E3A1C'; g.lineWidth = lw; g.stroke();
  // 罐口一圈
  g.fillStyle = '#FFE3B5';
  g.beginPath(); g.ellipse(0, -h * 0.42, w * 0.34, h * 0.05, 0, 0, Math.PI * 2); g.fill(); g.stroke();
  // 小标签
  g.fillStyle = '#FF9F43';
  g.beginPath(); g.roundRect ? g.roundRect(-w * 0.2, h * 0.02, w * 0.4, h * 0.17, h * 0.04) : g.rect(-w * 0.2, h * 0.02, w * 0.4, h * 0.17); g.fill(); g.stroke();
  g.font = `900 ${Math.round(h * 0.12)}px "Microsoft YaHei",sans-serif`;
  g.fillStyle = '#FFF4DE'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('糖', 0, h * 0.11);
  g.restore();
}
