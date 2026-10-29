/* 道具与飞行物（扁平卡通）：刮水器、鸡蛋、奶茶杯、泥球、准星、气泡。
   每个函数返回 { canvas, w, h }：w/h 是上屏尺寸（像素），画布按 res 倍绘制。 */
import { INK, FONT, canvas, rr, shape, shine, tone, smoothClosed, stroke } from './ink.js';
import { TAU } from '../util.js';

/* 刮水器：刮条沿 x 轴、中心在画布中心；手柄朝 -y。L = 刮条长度（像素） */
export function drawSqueegee(L, res = 1) {
  const w = L * 1.16;
  const h = L * 1.72;
  const { c, g } = canvas(w * res, h * res);
  g.scale(res, res);
  g.translate(w / 2, h / 2);
  const u = L / 150;
  const line = 3.6 * u;
  const bladeH = 13 * u;
  const chanH = 22 * u;
  const top = -bladeH / 2 - chanH;
  /* 手柄：从金属槽中间往上，粉色握把（和白曜的卫衣同色）+ 白色猫爪贴纸 + 挂孔 */
  const hw = 30 * u;
  const hl = 76 * u;
  const hy = top - 16 * u - hl;
  shape(g, p => rr(p, -hw * 0.4, top - 20 * u, hw * 0.8, 24 * u, 5 * u), '#c9d4dc', { line });
  shape(g, p => rr(p, -hw / 2, hy, hw, hl, hw / 2), '#f6a7bd', { line, shade: -0.14 });
  for (let i = 0; i < 3; i++) {
    const y = top - 26 * u - i * 9 * u;
    stroke(g, p => {
      p.moveTo(-hw * 0.28, y);
      p.lineTo(hw * 0.28, y);
    }, 2.8 * u, tone('#f6a7bd', -0.3));
  }
  /* 猫爪贴纸 */
  const py = hy + hl * 0.4;
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.ellipse(0, py + 3 * u, 6.5 * u, 5.2 * u, 0, 0, TAU);
  for (const [x, y] of [[-6.5, -3.5], [-2.2, -7], [2.2, -7], [6.5, -3.5]]) {
    g.moveTo(x * u + 2.4 * u, py + y * u);
    g.arc(x * u, py + y * u, 2.4 * u, 0, TAU);
  }
  g.fill();
  g.beginPath();
  g.arc(0, hy + 11 * u, 5 * u, 0, TAU);
  g.fillStyle = '#fff6f8';
  g.fill();
  g.lineWidth = line * 0.8;
  g.strokeStyle = INK;
  g.stroke();
  shine(g, -hw * 0.22, hy + hl * 0.62, 3.4 * u, 13 * u, 0, 0.8);
  /* 金属槽 */
  shape(g, p => rr(p, -L * 0.54, top, L * 1.08, chanH, 8 * u), '#dfe8ee', { line, shade: -0.2 });
  g.fillStyle = 'rgba(255,255,255,.9)';
  g.beginPath();
  rr(g, -L * 0.47, top + 4.5 * u, L * 0.94, 4 * u, 2 * u);
  g.fill();
  for (const sx of [-1, 1]) {
    g.beginPath();
    g.arc(sx * L * 0.44, top + chanH * 0.55, 3.4 * u, 0, TAU);
    g.fillStyle = '#9fb0bc';
    g.fill();
    g.lineWidth = 1.6 * u;
    g.strokeStyle = INK;
    g.stroke();
  }
  /* 橡胶刮条 */
  shape(g, p => rr(p, -L / 2, -bladeH / 2, L, bladeH, 4 * u), '#3d434c', { line, shade: -0.28 });
  g.fillStyle = 'rgba(255,255,255,.32)';
  g.beginPath();
  rr(g, -L * 0.45, -bladeH / 2 + 3 * u, L * 0.9, 2.4 * u, 1.2 * u);
  g.fill();
  return { canvas: c, w, h };
}

/* 刮水器底下的软阴影 */
export function drawToolShadow(L, res = 1) {
  const w = L * 1.2;
  const h = L * 0.5;
  const { c, g } = canvas(w * res, h * res);
  g.scale(res, res);
  const gr = g.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2);
  gr.addColorStop(0, 'rgba(30,24,40,.35)');
  gr.addColorStop(0.55, 'rgba(30,24,40,.16)');
  gr.addColorStop(1, 'rgba(30,24,40,0)');
  g.fillStyle = gr;
  g.save();
  g.translate(w / 2, h / 2);
  g.scale(1, 0.32);
  g.beginPath();
  g.arc(0, 0, w / 2, 0, TAU);
  g.restore();
  g.fill();
  return { canvas: c, w, h };
}

export function drawEgg(size, res = 1) {
  const w = size;
  const h = size * 1.25;
  const { c, g } = canvas((w + 8) * res, (h + 8) * res);
  g.scale(res, res);
  g.translate((w + 8) / 2, (h + 8) / 2);
  const u = size / 80;
  shape(g, p => {
    p.moveTo(0, -h / 2);
    p.bezierCurveTo(w * 0.52, -h / 2, w / 2, h * 0.18, w / 2, h * 0.12);
    p.bezierCurveTo(w / 2, h * 0.42, w * 0.28, h / 2, 0, h / 2);
    p.bezierCurveTo(-w * 0.28, h / 2, -w / 2, h * 0.42, -w / 2, h * 0.12);
    p.bezierCurveTo(-w / 2, h * 0.18, -w * 0.52, -h / 2, 0, -h / 2);
  }, '#fff3da', { line: 3 * u, shade: -0.1 });
  shine(g, -w * 0.18, -h * 0.18, 6 * u, 12 * u, 0.4, 0.95);
  g.fillStyle = 'rgba(200,150,90,.45)';
  for (const [x, y] of [[w * 0.18, h * 0.1], [w * 0.05, h * 0.28], [-w * 0.2, h * 0.22]]) {
    g.beginPath();
    g.arc(x, y, 2.6 * u, 0, TAU);
    g.fill();
  }
  return { canvas: c, w: w + 8, h: h + 8 };
}

export function drawMudBall(size, res = 1) {
  const { c, g } = canvas((size + 10) * res, (size + 10) * res);
  g.scale(res, res);
  g.translate((size + 10) / 2, (size + 10) / 2);
  const u = size / 80;
  const pts = [];
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * TAU;
    const r = size * 0.5 * (0.88 + 0.12 * Math.sin(i * 2.7) + 0.08 * Math.cos(i * 5.1));
    pts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  shape(g, p => smoothClosed(p, pts), '#8b5a34', { line: 3 * u, shade: -0.22 });
  g.fillStyle = '#6b4226';
  for (const [x, y, r] of [[10, -6, 6], [-12, 8, 5], [4, 14, 4]]) {
    g.beginPath();
    g.arc(x * u, y * u, r * u, 0, TAU);
    g.fill();
  }
  shine(g, -size * 0.18, -size * 0.2, 7 * u, 4 * u, -0.6, 0.8);
  return { canvas: c, w: size + 10, h: size + 10 };
}

/* 奶茶杯：杯身、杯盖、吸管、底部珍珠 */
export function drawCup(size, res = 1) {
  const w = size * 0.8;
  const h = size * 1.2;
  const { c, g } = canvas((w + 16) * res, (h + 30) * res);
  g.scale(res, res);
  g.translate((w + 16) / 2, (h + 30) / 2 + 8);
  const u = size / 100;
  const line = 3 * u;
  const top = -h / 2;
  shape(g, p => {
    p.moveTo(-w / 2, top + 10 * u);
    p.lineTo(w / 2, top + 10 * u);
    p.lineTo(w * 0.38, h / 2);
    p.lineTo(-w * 0.38, h / 2);
    p.closePath();
  }, '#c79565', { line, shade: -0.14 });
  g.save();
  g.beginPath();
  g.moveTo(-w / 2, top + 10 * u);
  g.lineTo(w / 2, top + 10 * u);
  g.lineTo(w * 0.38, h / 2);
  g.lineTo(-w * 0.38, h / 2);
  g.closePath();
  g.clip();
  g.fillStyle = 'rgba(255,255,255,.35)';
  g.fillRect(-w / 2, top + 10 * u, w, 14 * u);
  for (let i = 0; i < 9; i++) {
    const x = (-0.28 + (i % 5) * 0.14) * w + (i > 4 ? 0.07 * w : 0);
    const y = h / 2 - (i > 4 ? 22 : 10) * u;
    g.beginPath();
    g.arc(x, y, 6 * u, 0, TAU);
    g.fillStyle = '#3d2a20';
    g.fill();
    g.beginPath();
    g.arc(x - 2 * u, y - 2 * u, 1.8 * u, 0, TAU);
    g.fillStyle = 'rgba(255,255,255,.85)';
    g.fill();
  }
  g.restore();
  g.beginPath();
  g.moveTo(-w / 2, top + 10 * u);
  g.lineTo(w * 0.38 * -1, h / 2);
  g.lineTo(w * 0.38, h / 2);
  g.lineTo(w / 2, top + 10 * u);
  g.lineWidth = line;
  g.strokeStyle = INK;
  g.lineJoin = 'round';
  g.stroke();
  /* 杯盖 + 吸管 */
  shape(g, p => rr(p, -w * 0.56, top, w * 1.12, 12 * u, 5 * u), '#fffaf0', { line, shade: -0.08 });
  shape(g, p => rr(p, w * 0.06, top - 26 * u, 9 * u, 30 * u, 3 * u), '#ff9fb6', { line: line * 0.9, shade: -0.18 });
  shine(g, -w * 0.28, top + h * 0.35, 4 * u, 16 * u, 0.15, 0.7);
  /* 杯身小标签 */
  shape(g, p => rr(p, -w * 0.22, top + h * 0.42, w * 0.44, 18 * u, 6 * u), '#fffaf0', { line: line * 0.8, noShade: true });
  g.fillStyle = INK;
  g.font = `800 ${11 * u}px ${FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('奶茶', 0, top + h * 0.42 + 9 * u);
  return { canvas: c, w: w + 16, h: h + 30 };
}

/* 落点准星（预警）：一圈虚线 + 十字 */
export function drawReticle(size, color = '#ff5d73', res = 1) {
  const { c, g } = canvas((size + 8) * res, (size + 8) * res);
  g.scale(res, res);
  g.translate((size + 8) / 2, (size + 8) / 2);
  const u = size / 100;
  g.lineWidth = 5 * u;
  g.strokeStyle = 'rgba(255,255,255,.92)';
  g.beginPath();
  g.arc(0, 0, size * 0.44, 0, TAU);
  g.stroke();
  g.setLineDash([12 * u, 9 * u]);
  g.lineWidth = 4 * u;
  g.strokeStyle = color;
  g.beginPath();
  g.arc(0, 0, size * 0.44, 0, TAU);
  g.stroke();
  g.setLineDash([]);
  g.lineCap = 'round';
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU;
    g.beginPath();
    g.moveTo(Math.cos(a) * size * 0.22, Math.sin(a) * size * 0.22);
    g.lineTo(Math.cos(a) * size * 0.34, Math.sin(a) * size * 0.34);
    g.lineWidth = 6 * u;
    g.strokeStyle = 'rgba(255,255,255,.95)';
    g.stroke();
    g.lineWidth = 3.5 * u;
    g.strokeStyle = color;
    g.stroke();
  }
  g.beginPath();
  g.arc(0, 0, 5 * u, 0, TAU);
  g.fillStyle = color;
  g.fill();
  return { canvas: c, w: size + 8, h: size + 8 };
}

/* 头顶气泡：「？」「！」 */
export function drawBubble(text, size, res = 1) {
  const { c, g } = canvas((size + 10) * res, (size * 1.1 + 10) * res);
  g.scale(res, res);
  g.translate((size + 10) / 2, size * 0.5 + 5);
  const u = size / 60;
  shape(g, p => {
    p.arc(0, 0, size * 0.42, 0.62 * Math.PI, 0.38 * Math.PI + TAU, false);
    p.lineTo(0, size * 0.6);
    p.closePath();
  }, '#ffffff', { line: 3 * u, noShade: true });
  g.fillStyle = text === '！' ? '#ff5d73' : INK;
  g.font = `900 ${size * 0.5}px ${FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 0, 2 * u);
  return { canvas: c, w: size + 10, h: size * 1.1 + 10 };
}
