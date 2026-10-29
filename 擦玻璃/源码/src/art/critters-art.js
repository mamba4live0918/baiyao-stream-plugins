/* 小动物（扁平卡通）：圆滚滚的小鸟（飞 2 帧 + 停着）、肚皮贴玻璃的壁虎（腿按相位动）、断下来的壁虎尾巴。 */
import { INK, canvas, shape, shine, tone, rr } from './ink.js';
import { TAU } from '../util.js';

/* 小鸟侧面，朝右。pose: 'up' | 'down' | 'sit' | 'poop' */
export function drawBird(size, pose, u, res = 1) {
  const w = size * 1.5;
  const h = size * 1.3;
  const { c, g } = canvas(w * res, h * res);
  g.scale(res, res);
  g.translate(w / 2, h / 2);
  const line = 3 * u;
  const body = '#c9a27a';
  const belly = '#fff1df';
  const R = size * 0.42;
  /* 尾巴 */
  shape(g, p => {
    p.moveTo(-R * 0.7, -R * 0.1);
    p.lineTo(-R * 1.45, pose === 'poop' ? -R * 0.85 : -R * 0.45);
    p.lineTo(-R * 1.38, pose === 'poop' ? -R * 0.35 : -R * 0.05);
    p.lineTo(-R * 0.75, R * 0.25);
    p.closePath();
  }, tone(body, -0.18), { line });
  /* 脚 */
  if (pose === 'sit' || pose === 'poop') {
    for (const dx of [-0.15, 0.2]) {
      g.beginPath();
      g.moveTo(dx * R, R * 0.85);
      g.lineTo(dx * R, R * 1.18);
      g.moveTo(dx * R - R * 0.14, R * 1.2);
      g.lineTo(dx * R + R * 0.16, R * 1.2);
      g.lineWidth = 3.2 * u;
      g.strokeStyle = '#e08a3c';
      g.lineCap = 'round';
      g.stroke();
    }
  }
  /* 身体 */
  shape(g, p => p.ellipse(0, 0, R * 1.05, R * 0.92, 0, 0, TAU), body, { line, shade: -0.12 });
  g.save();
  g.beginPath();
  g.ellipse(0, 0, R * 1.05, R * 0.92, 0, 0, TAU);
  g.clip();
  g.beginPath();
  g.ellipse(R * 0.25, R * 0.45, R * 0.8, R * 0.62, 0, 0, TAU);
  g.fillStyle = belly;
  g.fill();
  g.restore();
  g.beginPath();
  g.ellipse(0, 0, R * 1.05, R * 0.92, 0, 0, TAU);
  g.lineWidth = line;
  g.strokeStyle = INK;
  g.stroke();
  /* 翅膀 */
  const wingUp = pose === 'up';
  shape(g, p => {
    if (wingUp) {
      p.moveTo(-R * 0.25, -R * 0.15);
      p.quadraticCurveTo(-R * 0.6, -R * 1.5, R * 0.5, -R * 1.25);
      p.quadraticCurveTo(R * 0.3, -R * 0.55, R * 0.15, -R * 0.05);
    } else {
      p.moveTo(-R * 0.45, -R * 0.05);
      p.quadraticCurveTo(-R * 0.35, R * 0.75, R * 0.45, R * 0.35);
      p.quadraticCurveTo(R * 0.2, -R * 0.05, -R * 0.45, -R * 0.05);
    }
    p.closePath();
  }, tone(body, -0.12), { line, shade: -0.1 });
  /* 头上的嘴、眼睛、腮红 */
  shape(g, p => {
    p.moveTo(R * 0.98, -R * 0.2);
    p.lineTo(R * 1.38, -R * 0.06);
    p.lineTo(R * 0.98, R * 0.1);
    p.closePath();
  }, '#f2a23c', { line: line * 0.9, noShade: true });
  g.beginPath();
  g.arc(R * 0.55, -R * 0.28, R * 0.13, 0, TAU);
  g.fillStyle = INK;
  g.fill();
  g.beginPath();
  g.arc(R * 0.5, -R * 0.33, R * 0.045, 0, TAU);
  g.fillStyle = '#fff';
  g.fill();
  g.beginPath();
  g.ellipse(R * 0.55, R * 0.02, R * 0.14, R * 0.08, 0, 0, TAU);
  g.fillStyle = 'rgba(255,140,150,.55)';
  g.fill();
  shine(g, -R * 0.35, -R * 0.5, R * 0.18, R * 0.09, -0.5, 0.75);
  return { canvas: c, w, h };
}

/* 壁虎（肚皮贴玻璃的俯视），头朝上。phase 0..1 腿的摆动。 */
export function drawGecko(size, phase, u, res = 1, tail = true) {
  const w = size * 1.1;
  const h = size * 1.7;
  const { c, g } = canvas(w * res, h * res);
  g.scale(res, res);
  g.translate(w / 2, h * 0.38);
  const line = 2.8 * u;
  const skin = '#bfe0a6';
  const belly = '#f3efd4';
  const pad = '#ffb7c5';
  const L = size;
  const swing = Math.sin(phase * TAU) * 0.45;
  /* 尾巴：S 形（断尾以后只剩一个小尖） */
  if (!tail) {
    shape(g, p => {
      p.moveTo(-L * 0.07, L * 0.3);
      p.lineTo(0, L * 0.42);
      p.lineTo(L * 0.07, L * 0.3);
      p.closePath();
    }, skin, { line, shade: -0.1 });
  } else shape(g, p => {
    p.moveTo(-L * 0.07, L * 0.3);
    p.bezierCurveTo(-L * 0.08 + swing * L * 0.18, L * 0.55, L * 0.12 - swing * L * 0.15, L * 0.75, swing * L * 0.12, L * 1.0);
    p.bezierCurveTo(L * 0.06 - swing * L * 0.12, L * 0.76, L * 0.08 + swing * L * 0.16, L * 0.55, L * 0.07, L * 0.3);
    p.closePath();
  }, skin, { line, shade: -0.1 });
  /* 四条腿：前后对角同步摆 */
  const legs = [[-1, -0.12, 1], [1, -0.12, -1], [-1, 0.22, -1], [1, 0.22, 1]];
  for (const [sx, ly, ph] of legs) {
    const a = (ly < 0 ? -0.6 : 0.6) + ph * swing * 0.6;
    const kx = sx * L * 0.2;
    const ky = ly * L;
    const fx = kx + sx * Math.cos(a) * L * 0.16;
    const fy = ky + Math.sin(a) * L * 0.16 * (ly < 0 ? 1 : 1);
    g.beginPath();
    g.moveTo(sx * L * 0.08, ky);
    g.quadraticCurveTo(kx, ky - L * 0.02, fx, fy);
    g.lineWidth = L * 0.07 + line;
    g.strokeStyle = INK;
    g.lineCap = 'round';
    g.stroke();
    g.lineWidth = L * 0.07;
    g.strokeStyle = skin;
    g.stroke();
    /* 脚趾吸盘 */
    for (let k = -1; k <= 1; k++) {
      const ta = a + k * 0.55 + (sx < 0 ? Math.PI : 0) * 0;
      const tx = fx + sx * Math.cos(a + k * 0.5) * L * 0.07;
      const ty = fy + Math.sin(a + k * 0.5) * L * 0.07;
      g.beginPath();
      g.arc(tx, ty, L * 0.028, 0, TAU);
      g.fillStyle = pad;
      g.fill();
      g.lineWidth = 1.6 * u;
      g.strokeStyle = INK;
      g.stroke();
      void ta;
    }
  }
  /* 身体 + 肚皮 */
  shape(g, p => p.ellipse(0, L * 0.05, L * 0.13, L * 0.3, 0, 0, TAU), skin, { line, shade: -0.08 });
  g.beginPath();
  g.ellipse(0, L * 0.06, L * 0.08, L * 0.24, 0, 0, TAU);
  g.fillStyle = belly;
  g.fill();
  /* 头 */
  shape(g, p => p.ellipse(0, -L * 0.3, L * 0.12, L * 0.12, 0, 0, TAU), skin, { line, shade: -0.06 });
  for (const sx of [-1, 1]) {
    g.beginPath();
    g.arc(sx * L * 0.075, -L * 0.36, L * 0.035, 0, TAU);
    g.fillStyle = INK;
    g.fill();
    g.beginPath();
    g.arc(sx * L * 0.075 - L * 0.01, -L * 0.37, L * 0.012, 0, TAU);
    g.fillStyle = '#fff';
    g.fill();
  }
  shine(g, -L * 0.05, -L * 0.05, L * 0.03, L * 0.1, 0, 0.6);
  return { canvas: c, w, h, pivotY: h * 0.38 - h / 2 };
}

/* 断下来的尾巴：横着、扭一扭 */
export function drawTail(len, wig, u, res = 1) {
  const w = len * 1.15;
  const h = len * 0.5;
  const { c, g } = canvas(w * res, h * res);
  g.scale(res, res);
  g.translate(w / 2, h / 2);
  shape(g, p => {
    p.moveTo(-len * 0.48, -len * 0.06);
    p.bezierCurveTo(-len * 0.15, -len * 0.06 - wig * len * 0.2, len * 0.15, -len * 0.02 + wig * len * 0.2, len * 0.5, wig * len * 0.08);
    p.bezierCurveTo(len * 0.15, len * 0.02 + wig * len * 0.2, -len * 0.15, len * 0.06 - wig * len * 0.2, -len * 0.48, len * 0.06);
    p.closePath();
  }, '#bfe0a6', { line: 2.6 * u, shade: -0.1 });
  return { canvas: c, w, h };
}

export { rr };
