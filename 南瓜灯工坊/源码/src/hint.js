// 示范手势：一个半透明的圆圈「手指」按下去、拖过去、松开，后面拖一条虚线。一遍 1.7 秒。
import { easeInOut, clamp, lerp } from './tween.js';

const CYCLE = 1.7;

export function drawHint(g, plan, clock, L) {
  if (clock < 0) return;
  const k = (clock % CYCLE) / CYCLE, r = L.m * 0.026;
  const move = clamp((k - 0.15) / 0.6, 0, 1), e = easeInOut(move);
  const alpha = k < 0.1 ? k / 0.1 : k > 0.85 ? (1 - k) / 0.15 : 1;
  let x, y, trail = [];
  if (plan.circle) {
    const c = plan.circle, a0 = -Math.PI / 2, n = 28;
    for (let i = 0; i <= n * e; i++) { const a = a0 + (i / n) * Math.PI * 2; trail.push([c.x + Math.cos(a) * c.r, c.y + Math.sin(a) * c.r]); }
    const a = a0 + e * Math.PI * 2;
    x = c.x + Math.cos(a) * c.r; y = c.y + Math.sin(a) * c.r;
  } else {
    const [[x0, y0], [x1, y1]] = plan.path;
    x = lerp(x0, x1, e); y = lerp(y0, y1, e);
    trail = [[x0, y0], [x, y]];
  }
  const pressed = k > 0.12 && k < 0.8;
  g.save();
  g.globalAlpha = alpha * 0.9;
  if (trail.length > 1) {
    g.beginPath();
    trail.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py)));
    g.setLineDash([r * 0.5, r * 0.45]);
    g.lineCap = 'round';
    g.strokeStyle = 'rgba(60,25,10,.55)'; g.lineWidth = r * 0.42; g.stroke();
    g.strokeStyle = '#FFF4DE'; g.lineWidth = r * 0.2; g.stroke();
    g.setLineDash([]);
  }
  const rr = r * (pressed ? 0.82 : 1.05);
  g.fillStyle = 'rgba(255,244,222,.35)';
  g.beginPath(); g.arc(x, y, rr, 0, Math.PI * 2); g.fill();
  g.lineWidth = r * 0.22; g.strokeStyle = 'rgba(60,25,10,.7)'; g.stroke();
  g.lineWidth = r * 0.12; g.strokeStyle = '#FFF4DE'; g.stroke();
  if (pressed) { g.fillStyle = '#FFF4DE'; g.beginPath(); g.arc(x, y, r * 0.25, 0, Math.PI * 2); g.fill(); }
  g.restore();
}
