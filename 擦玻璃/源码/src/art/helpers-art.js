/* 帮忙的道具：擦窗机器人（方方的、会眨眼）、保护膜卷起的角。 */
import { INK, canvas, rr, shape, shine, tone } from './ink.js';
import { TAU } from '../util.js';

/* 擦窗机器人俯视：白色圆角方块 + 淡蓝边、外圈清洁布、脸上的小屏幕（眼睛 ^ ^ / 眨眼 / 开心） */
export function drawRobot(size, face, u, res = 1) {
  const w = size * 1.12;
  const { c, g } = canvas(w * res, w * res);
  g.scale(res, res);
  g.translate(w / 2, w / 2);
  const S = size;
  const line = 3.2 * u;
  /* 清洁布（外圈，灰蓝毛边） */
  shape(g, p => rr(p, -S * 0.52, -S * 0.52, S * 1.04, S * 1.04, S * 0.24), '#cfdbe4', { line, shade: -0.1 });
  g.save();
  g.strokeStyle = 'rgba(255,255,255,.7)';
  g.lineWidth = 2 * u;
  g.setLineDash([4 * u, 5 * u]);
  g.beginPath();
  rr(g, -S * 0.47, -S * 0.47, S * 0.94, S * 0.94, S * 0.2);
  g.stroke();
  g.restore();
  /* 机身 */
  shape(g, p => rr(p, -S * 0.42, -S * 0.42, S * 0.84, S * 0.84, S * 0.2), '#fbfdff', { line, shade: -0.07 });
  shape(g, p => rr(p, -S * 0.42, S * 0.18, S * 0.84, S * 0.24, S * 0.12), '#8fd0ff', { line: line * 0.8, shade: -0.12 });
  /* 屏幕脸 */
  shape(g, p => rr(p, -S * 0.27, -S * 0.27, S * 0.54, S * 0.36, S * 0.1), '#22313b', { line: line * 0.8, noShade: true });
  g.strokeStyle = '#8fffe0';
  g.fillStyle = '#8fffe0';
  g.lineWidth = 3.4 * u;
  g.lineCap = 'round';
  for (const sx of [-1, 1]) {
    const ex = sx * S * 0.11;
    const ey = -S * 0.1;
    g.beginPath();
    if (face === 'blink') {
      g.moveTo(ex - S * 0.05, ey);
      g.lineTo(ex + S * 0.05, ey);
    } else if (face === 'happy') {
      g.moveTo(ex - S * 0.055, ey + S * 0.02);
      g.lineTo(ex, ey - S * 0.04);
      g.lineTo(ex + S * 0.055, ey + S * 0.02);
    } else {
      g.arc(ex, ey, S * 0.035, 0, TAU);
      g.fill();
      continue;
    }
    g.stroke();
  }
  g.beginPath();
  g.ellipse(-S * 0.2, S * 0.03, S * 0.04, S * 0.022, 0, 0, TAU);
  g.ellipse(S * 0.2, S * 0.03, S * 0.04, S * 0.022, 0, 0, TAU);
  g.fillStyle = 'rgba(255,140,170,.75)';
  g.fill();
  shine(g, -S * 0.28, -S * 0.33, S * 0.07, S * 0.03, -0.3, 0.9);
  /* 指示灯 */
  g.beginPath();
  g.arc(S * 0.28, S * 0.3, S * 0.035, 0, TAU);
  g.fillStyle = '#7cf29a';
  g.fill();
  g.lineWidth = 1.6 * u;
  g.strokeStyle = INK;
  g.stroke();
  return { canvas: c, w, h: w };
}

/* 保护膜卷起来的角（右下角），size = 卷角大小 */
export function drawFilmCorner(size, u, res = 1) {
  const { c, g } = canvas(size * res, size * res);
  g.scale(res, res);
  g.beginPath();
  g.moveTo(size, size * 0.15);
  g.lineTo(size, size);
  g.lineTo(size * 0.15, size);
  g.closePath();
  g.fillStyle = 'rgba(30,40,50,.12)';
  g.fill();
  g.beginPath();
  g.moveTo(size * 0.98, size * 0.18);
  g.quadraticCurveTo(size * 0.45, size * 0.45, size * 0.18, size * 0.98);
  g.lineTo(size * 0.55, size * 0.55);
  g.closePath();
  const gr = g.createLinearGradient(size * 0.2, size * 0.2, size, size);
  gr.addColorStop(0, 'rgba(255,255,255,.95)');
  gr.addColorStop(1, 'rgba(196,226,246,.9)');
  g.fillStyle = gr;
  g.fill();
  g.lineWidth = 2.2 * u;
  g.strokeStyle = '#3f86b8';
  g.lineJoin = 'round';
  g.stroke();
  g.beginPath();
  g.moveTo(size * 0.8, size * 0.3);
  g.quadraticCurveTo(size * 0.5, size * 0.5, size * 0.3, size * 0.8);
  g.lineWidth = 2 * u;
  g.strokeStyle = 'rgba(255,255,255,.95)';
  g.stroke();
  return { canvas: c, w: size, h: size };
}

export { tone };
