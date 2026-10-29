/* 擦玻璃 · 小广告上的小插图（扁平卡通：平涂 + 一层阴影 + 深棕描边 + 白高光）。
   每个函数在 (x, y) 处画一个大约 s 大小的图标。 */
import { INK, rr, shape, stroke, shine, tone } from './ink.js';

const TAU = Math.PI * 2;
const lw = s => Math.max(1.2, s * 0.045);

export function drop(g, x, y, s, color = '#5cc4ff') {
  shape(g, p => {
    p.moveTo(x, y - s * 0.5);
    p.bezierCurveTo(x + s * 0.12, y - s * 0.28, x + s * 0.36, y - s * 0.06, x + s * 0.36, y + s * 0.16);
    p.arc(x, y + s * 0.16, s * 0.36, 0, Math.PI);
    p.bezierCurveTo(x - s * 0.36, y - s * 0.06, x - s * 0.12, y - s * 0.28, x, y - s * 0.5);
  }, color, { line: lw(s), off: [s * 0.08, s * 0.1] });
  shine(g, x - s * 0.13, y + s * 0.1, s * 0.05, s * 0.12, 0.2, 0.9);
}

export function key(g, x, y, s, rot = -0.6, color = '#ffc93c') {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  shape(g, p => {
    p.arc(-s * 0.26, 0, s * 0.22, 0, TAU);
  }, color, { line: lw(s), off: [s * 0.06, s * 0.07] });
  shape(g, p => {
    rr(p, -s * 0.06, -s * 0.07, s * 0.58, s * 0.14, s * 0.04);
    p.rect(s * 0.3, s * 0.05, s * 0.07, s * 0.13);
    p.rect(s * 0.42, s * 0.05, s * 0.07, s * 0.1);
  }, color, { line: lw(s), off: [s * 0.04, s * 0.05] });
  g.beginPath();
  g.arc(-s * 0.26, 0, s * 0.08, 0, TAU);
  g.fillStyle = '#fffaf0';
  g.fill();
  g.lineWidth = lw(s);
  g.strokeStyle = INK;
  g.stroke();
  g.restore();
}

/* 小猫头（寻猫启事） */
export function catFace(g, x, y, s, fur = '#fffaf4', patch = '#f2a65a') {
  shape(g, p => {
    p.moveTo(x - s * 0.42, y - s * 0.05);
    p.lineTo(x - s * 0.36, y - s * 0.5);
    p.lineTo(x - s * 0.12, y - s * 0.3);
    p.quadraticCurveTo(x, y - s * 0.34, x + s * 0.12, y - s * 0.3);
    p.lineTo(x + s * 0.36, y - s * 0.5);
    p.lineTo(x + s * 0.42, y - s * 0.05);
    p.quadraticCurveTo(x + s * 0.46, y + s * 0.36, x, y + s * 0.38);
    p.quadraticCurveTo(x - s * 0.46, y + s * 0.36, x - s * 0.42, y - s * 0.05);
  }, fur, { line: lw(s), shade: -0.08 });
  g.save();
  g.beginPath();
  g.ellipse(x + s * 0.2, y - s * 0.18, s * 0.17, s * 0.14, 0.4, 0, TAU);
  g.fillStyle = patch;
  g.fill();
  g.restore();
  for (const sx of [-1, 1]) {
    g.beginPath();
    g.ellipse(x + sx * s * 0.15, y - s * 0.02, s * 0.055, s * 0.075, 0, 0, TAU);
    g.fillStyle = INK;
    g.fill();
    shine(g, x + sx * s * 0.15 - s * 0.015, y - s * 0.04, s * 0.02, s * 0.025, 0, 1);
    g.beginPath();
    g.ellipse(x + sx * s * 0.26, y + s * 0.1, s * 0.07, s * 0.04, 0, 0, TAU);
    g.fillStyle = 'rgba(255,140,160,.5)';
    g.fill();
  }
  stroke(g, p => {
    p.moveTo(x - s * 0.06, y + s * 0.1);
    p.quadraticCurveTo(x, y + s * 0.15, x, y + s * 0.09);
    p.quadraticCurveTo(x, y + s * 0.15, x + s * 0.06, y + s * 0.1);
  }, lw(s) * 0.8);
  g.beginPath();
  g.moveTo(x - s * 0.025, y + s * 0.05);
  g.lineTo(x + s * 0.025, y + s * 0.05);
  g.lineTo(x, y + s * 0.08);
  g.closePath();
  g.fillStyle = '#ff8fa3';
  g.fill();
}

/* 循环箭头（垃圾分类） */
export function recycle(g, x, y, s, color = '#38b26b') {
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU - Math.PI / 2;
    g.save();
    g.translate(x, y);
    g.rotate(a);
    shape(g, p => {
      p.arc(0, 0, s * 0.42, -0.35, 1.25);
      p.lineTo(Math.cos(1.25) * s * 0.26, Math.sin(1.25) * s * 0.26);
      p.arc(0, 0, s * 0.26, 1.25, -0.35, true);
      p.closePath();
    }, color, { line: lw(s), off: [s * 0.04, s * 0.05] });
    shape(g, p => {
      const r1 = s * 0.47;
      const r0 = s * 0.2;
      const b = 1.25;
      p.moveTo(Math.cos(b) * r1, Math.sin(b) * r1);
      p.lineTo(Math.cos(b + 0.55) * s * 0.34, Math.sin(b + 0.55) * s * 0.34);
      p.lineTo(Math.cos(b) * r0, Math.sin(b) * r0);
      p.closePath();
    }, color, { line: lw(s), off: [s * 0.03, s * 0.04] });
    g.restore();
  }
}

export function heart(g, x, y, s, color = '#ff6f91') {
  shape(g, p => {
    p.moveTo(x, y + s * 0.38);
    p.bezierCurveTo(x - s * 0.62, y - s * 0.06, x - s * 0.3, y - s * 0.52, x, y - s * 0.18);
    p.bezierCurveTo(x + s * 0.3, y - s * 0.52, x + s * 0.62, y - s * 0.06, x, y + s * 0.38);
  }, color, { line: lw(s), off: [s * 0.08, s * 0.08] });
  shine(g, x - s * 0.2, y - s * 0.16, s * 0.07, s * 0.04, -0.6, 0.9);
}

/* 白曜Q版头像：银白头发 + 狼耳 + 粉眼睛 */
export function chibi(g, x, y, s) {
  const hair = '#e9edf3';
  for (const sx of [-1, 1]) {
    shape(g, p => {
      p.moveTo(x + sx * s * 0.18, y - s * 0.3);
      p.lineTo(x + sx * s * 0.36, y - s * 0.62);
      p.lineTo(x + sx * s * 0.42, y - s * 0.22);
      p.closePath();
    }, hair, { line: lw(s), shade: -0.12 });
    g.beginPath();
    g.moveTo(x + sx * s * 0.25, y - s * 0.3);
    g.lineTo(x + sx * s * 0.35, y - s * 0.5);
    g.lineTo(x + sx * s * 0.37, y - s * 0.3);
    g.closePath();
    g.fillStyle = '#ffc2cf';
    g.fill();
  }
  shape(g, p => {
    p.ellipse(x, y + s * 0.02, s * 0.36, s * 0.34, 0, 0, TAU);
  }, '#ffe9dc', { line: lw(s), shade: -0.06 });
  shape(g, p => {
    p.moveTo(x - s * 0.4, y + s * 0.06);
    p.quadraticCurveTo(x - s * 0.44, y - s * 0.4, x, y - s * 0.38);
    p.quadraticCurveTo(x + s * 0.44, y - s * 0.4, x + s * 0.4, y + s * 0.06);
    p.lineTo(x + s * 0.26, y - s * 0.1);
    p.lineTo(x + s * 0.14, y + s * 0.02);
    p.lineTo(x + s * 0.04, y - s * 0.12);
    p.lineTo(x - s * 0.08, y + s * 0.0);
    p.lineTo(x - s * 0.2, y - s * 0.12);
    p.lineTo(x - s * 0.3, y + s * 0.02);
    p.closePath();
  }, hair, { line: lw(s), shade: -0.1 });
  for (const sx of [-1, 1]) {
    g.beginPath();
    g.ellipse(x + sx * s * 0.13, y + s * 0.1, s * 0.06, s * 0.08, 0, 0, TAU);
    g.fillStyle = '#ff7aa8';
    g.fill();
    g.lineWidth = lw(s) * 0.7;
    g.strokeStyle = INK;
    g.stroke();
    shine(g, x + sx * s * 0.13 - s * 0.02, y + s * 0.07, s * 0.02, s * 0.03, 0, 1);
  }
  stroke(g, p => {
    p.moveTo(x - s * 0.04, y + s * 0.22);
    p.quadraticCurveTo(x, y + s * 0.25, x + s * 0.04, y + s * 0.22);
  }, lw(s) * 0.7);
}

/* 水龙头弯管 + 水滴（节约用水） */
export function pipe(g, x, y, s, color = '#9fb4c8') {
  shape(g, p => {
    p.moveTo(x - s * 0.45, y - s * 0.32);
    p.lineTo(x + s * 0.05, y - s * 0.32);
    p.quadraticCurveTo(x + s * 0.3, y - s * 0.32, x + s * 0.3, y - s * 0.06);
    p.lineTo(x + s * 0.3, y + s * 0.3);
    p.lineTo(x + s * 0.08, y + s * 0.3);
    p.lineTo(x + s * 0.08, y - s * 0.04);
    p.quadraticCurveTo(x + s * 0.08, y - s * 0.12, x, y - s * 0.12);
    p.lineTo(x - s * 0.45, y - s * 0.12);
    p.closePath();
  }, color, { line: lw(s) });
  shape(g, p => rr(p, x + s * 0.02, y + s * 0.26, s * 0.34, s * 0.1, s * 0.03), tone(color, -0.15), { line: lw(s) });
  drop(g, x + s * 0.19, y + s * 0.5, s * 0.22);
}

/* 饭碗 + 小鱼（猫猫食谱） */
export function bowl(g, x, y, s) {
  shape(g, p => {
    p.ellipse(x, y - s * 0.08, s * 0.36, s * 0.14, 0, Math.PI, TAU);
    p.closePath();
  }, '#fffaf0', { line: lw(s), noShade: true });
  shape(g, p => {
    p.moveTo(x - s * 0.44, y - s * 0.08);
    p.lineTo(x + s * 0.44, y - s * 0.08);
    p.quadraticCurveTo(x + s * 0.4, y + s * 0.34, x, y + s * 0.36);
    p.quadraticCurveTo(x - s * 0.4, y + s * 0.34, x - s * 0.44, y - s * 0.08);
  }, '#ff9f6b', { line: lw(s) });
  stroke(g, p => {
    p.moveTo(x - s * 0.3, y + s * 0.1);
    p.lineTo(x + s * 0.3, y + s * 0.1);
  }, lw(s) * 0.8, 'rgba(255,255,255,.8)');
  /* 小鱼 */
  shape(g, p => {
    p.ellipse(x + s * 0.02, y - s * 0.26, s * 0.16, s * 0.08, -0.2, 0, TAU);
    p.moveTo(x + s * 0.16, y - s * 0.29);
    p.lineTo(x + s * 0.28, y - s * 0.38);
    p.lineTo(x + s * 0.27, y - s * 0.2);
    p.closePath();
  }, '#7cc8ff', { line: lw(s) * 0.8 });
}

export function dumbbell(g, x, y, s, rot = -0.4) {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  shape(g, p => rr(p, -s * 0.3, -s * 0.05, s * 0.6, s * 0.1, s * 0.03), '#c9ced6', { line: lw(s) });
  for (const sx of [-1, 1]) {
    shape(g, p => rr(p, sx * s * 0.3 - s * 0.08, -s * 0.24, s * 0.16, s * 0.48, s * 0.05), '#3d4250', { line: lw(s), shade: -0.3 });
    shape(g, p => rr(p, sx * s * 0.44 - s * 0.05, -s * 0.16, s * 0.1, s * 0.32, s * 0.04), '#3d4250', { line: lw(s), shade: -0.3 });
  }
  g.restore();
}

/* 碎鸡蛋（失物招领） */
export function crackedEgg(g, x, y, s) {
  shape(g, p => {
    p.ellipse(x, y + s * 0.12, s * 0.46, s * 0.2, 0, 0, TAU);
  }, '#fffdf6', { line: lw(s), shade: -0.06 });
  shape(g, p => p.arc(x + s * 0.04, y + s * 0.1, s * 0.15, 0, TAU), '#ffc93c', { line: lw(s), off: [s * 0.04, s * 0.05] });
  shine(g, x - s * 0.02, y + s * 0.05, s * 0.05, s * 0.03, -0.4, 0.95);
  shape(g, p => {
    p.moveTo(x - s * 0.36, y - s * 0.02);
    p.lineTo(x - s * 0.3, y - s * 0.32);
    p.lineTo(x - s * 0.2, y - s * 0.22);
    p.lineTo(x - s * 0.12, y - s * 0.36);
    p.lineTo(x - s * 0.04, y - s * 0.2);
    p.lineTo(x - s * 0.06, y);
    p.closePath();
  }, '#fff3dc', { line: lw(s) });
}

/* 玻璃小房子（观景台、易碎品） */
export function glassHouse(g, x, y, s) {
  shape(g, p => {
    p.moveTo(x - s * 0.4, y - s * 0.02);
    p.lineTo(x, y - s * 0.42);
    p.lineTo(x + s * 0.4, y - s * 0.02);
    p.closePath();
  }, '#ff8a7a', { line: lw(s) });
  shape(g, p => rr(p, x - s * 0.32, y - s * 0.04, s * 0.64, s * 0.44, s * 0.03), '#bfe8ff', { line: lw(s), shade: -0.08 });
  g.save();
  g.strokeStyle = 'rgba(255,255,255,.95)';
  g.lineWidth = lw(s) * 1.2;
  g.beginPath();
  g.moveTo(x - s * 0.2, y + s * 0.32);
  g.lineTo(x - s * 0.06, y + s * 0.04);
  g.moveTo(x - s * 0.06, y + s * 0.32);
  g.lineTo(x + s * 0.06, y + s * 0.08);
  g.stroke();
  g.restore();
  stroke(g, p => {
    p.moveTo(x, y - s * 0.04);
    p.lineTo(x, y + s * 0.4);
    p.moveTo(x - s * 0.32, y + s * 0.18);
    p.lineTo(x + s * 0.32, y + s * 0.18);
  }, lw(s) * 0.8);
}

export function bucket(g, x, y, s) {
  stroke(g, p => {
    p.arc(x, y - s * 0.12, s * 0.3, Math.PI * 1.1, Math.PI * 1.9);
  }, lw(s));
  shape(g, p => {
    p.moveTo(x - s * 0.34, y - s * 0.16);
    p.lineTo(x + s * 0.34, y - s * 0.16);
    p.lineTo(x + s * 0.26, y + s * 0.38);
    p.lineTo(x - s * 0.26, y + s * 0.38);
    p.closePath();
  }, '#5ba8ff', { line: lw(s) });
  g.beginPath();
  g.ellipse(x, y - s * 0.16, s * 0.3, s * 0.07, 0, 0, TAU);
  g.fillStyle = '#bfe8ff';
  g.fill();
  shine(g, x - s * 0.18, y + s * 0.08, s * 0.04, s * 0.12, 0.1, 0.8);
}

export function squeegee(g, x, y, s, rot = 0.5) {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  shape(g, p => rr(p, -s * 0.05, -s * 0.05, s * 0.1, s * 0.5, s * 0.04), '#ff9ebb', { line: lw(s) });
  shape(g, p => rr(p, -s * 0.36, -s * 0.14, s * 0.72, s * 0.12, s * 0.03), '#45a6e6', { line: lw(s) });
  shape(g, p => rr(p, -s * 0.38, -s * 0.2, s * 0.76, s * 0.07, s * 0.02), '#2c3340', { line: lw(s) * 0.8, noShade: true });
  g.restore();
}

export function truck(g, x, y, s, color = '#47b86b') {
  shape(g, p => rr(p, x - s * 0.48, y - s * 0.28, s * 0.6, s * 0.4, s * 0.04), color, { line: lw(s) });
  shape(g, p => {
    p.moveTo(x + s * 0.14, y - s * 0.16);
    p.lineTo(x + s * 0.34, y - s * 0.16);
    p.lineTo(x + s * 0.48, y);
    p.lineTo(x + s * 0.48, y + s * 0.12);
    p.lineTo(x + s * 0.14, y + s * 0.12);
    p.closePath();
  }, tone(color, -0.1), { line: lw(s) });
  g.beginPath();
  g.moveTo(x + s * 0.2, y - s * 0.1);
  g.lineTo(x + s * 0.32, y - s * 0.1);
  g.lineTo(x + s * 0.4, y);
  g.lineTo(x + s * 0.2, y);
  g.closePath();
  g.fillStyle = '#d8f2ff';
  g.fill();
  for (const wx of [-0.3, 0.3]) {
    shape(g, p => p.arc(x + wx * s, y + s * 0.16, s * 0.1, 0, TAU), '#3a3f4b', { line: lw(s), noShade: true });
    g.beginPath();
    g.arc(x + wx * s, y + s * 0.16, s * 0.04, 0, TAU);
    g.fillStyle = '#e6e9ee';
    g.fill();
  }
}

/* 小星星（装饰） */
export function star(g, x, y, s, color = '#ffd23e') {
  shape(g, p => {
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? s * 0.22 : s * 0.5;
      const a = (i / 10) * TAU - Math.PI / 2;
      if (i) p.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      else p.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    p.closePath();
  }, color, { line: lw(s), off: [s * 0.06, s * 0.07] });
}

/* 四叶草（好运）：四片心形叶子，尖朝中心 */
export function clover(g, x, y, s, color = '#5cc46e') {
  stroke(g, p => {
    p.moveTo(x, y + s * 0.04);
    p.quadraticCurveTo(x + s * 0.08, y + s * 0.3, x + s * 0.2, y + s * 0.44);
  }, lw(s) * 1.8, '#3d8a4c');
  for (let i = 0; i < 4; i++) {
    g.save();
    g.translate(x, y - s * 0.04);
    g.rotate((i / 4) * TAU + Math.PI / 4);
    const r = s * 0.25;
    shape(g, p => {
      p.moveTo(0, 0);
      p.bezierCurveTo(-r * 0.15, -r * 0.25, -r * 0.95, -r * 0.55, -r * 0.62, -r * 1.05);
      p.bezierCurveTo(-r * 0.38, -r * 1.38, -r * 0.02, -r * 1.2, 0, -r * 0.92);
      p.bezierCurveTo(r * 0.02, -r * 1.2, r * 0.38, -r * 1.38, r * 0.62, -r * 1.05);
      p.bezierCurveTo(r * 0.95, -r * 0.55, r * 0.15, -r * 0.25, 0, 0);
    }, color, { line: lw(s), off: [s * 0.03, s * 0.04] });
    g.restore();
  }
  g.beginPath();
  g.arc(x, y - s * 0.04, s * 0.05, 0, TAU);
  g.fillStyle = '#3d8a4c';
  g.fill();
  shine(g, x - s * 0.2, y - s * 0.26, s * 0.05, s * 0.03, -0.6, 0.9);
}
