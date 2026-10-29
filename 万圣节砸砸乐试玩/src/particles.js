/* 万圣节砸砸乐试玩 · 通用粒子：糖果碎屑、药水滴、玻璃渣、烟、星星、泡泡、飘字、小图 */
(function () {
  'use strict';
  const HW = window.HW;
  const { TAU, range, pick, label } = HW.util;
  const list = [];
  const P = (HW.particles = {
    list,
    add(p) { list.push(Object.assign({ age: 0, life: 1, vx: 0, vy: 0, g: 0, drag: 0, rot: 0, vr: 0, size: 10, o: 1, grow: 0 }, p)); },
    clear() { list.length = 0; },
    update(dt) {
      const s = dt / 1000;
      for (let i = list.length - 1; i >= 0; i--) {
        const p = list[i];
        p.age += s;
        if (p.age >= p.life) { list.splice(i, 1); continue; }
        p.vy += p.g * s;
        const d = Math.exp(-p.drag * s);
        p.vx *= d; p.vy *= d;
        p.x += p.vx * s; p.y += p.vy * s; p.rot += p.vr * s;
        if (p.floor && p.y > p.floor) { p.y = p.floor; p.vy *= -0.35; p.vx *= 0.7; }
      }
    },
    draw(g) {
      for (const p of list) {
        const k = p.age / p.life, fade = p.o * (k > 0.65 ? 1 - (k - 0.65) / 0.35 : 1);
        g.save();
        g.globalAlpha = fade;
        g.translate(p.x, p.y);
        g.rotate(p.rot);
        const sz = p.size * (1 + p.grow * k);
        switch (p.kind) {
          case 'confetti':
            g.fillStyle = p.color; g.fillRect(-sz / 2, -sz / 4, sz, sz / 2); break;
          case 'drop':
            g.fillStyle = p.color; g.beginPath(); g.ellipse(0, 0, sz * 0.6, sz, 0, 0, TAU); g.fill();
            g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.arc(-sz * 0.2, -sz * 0.35, sz * 0.18, 0, TAU); g.fill(); break;
          case 'shard':
            g.fillStyle = p.color; g.strokeStyle = 'rgba(40,30,60,.5)'; g.lineWidth = 1.5;
            g.beginPath(); g.moveTo(-sz, -sz * 0.3); g.lineTo(sz * 0.8, -sz * 0.6); g.lineTo(sz * 0.4, sz * 0.7); g.closePath(); g.fill(); g.stroke(); break;
          case 'puff': {
            const gr = g.createRadialGradient(0, 0, 0, 0, 0, sz);
            gr.addColorStop(0, p.color || 'rgba(240,236,250,.95)'); gr.addColorStop(0.6, 'rgba(210,204,230,.55)'); gr.addColorStop(1, 'rgba(200,195,225,0)');
            g.fillStyle = gr; g.beginPath(); g.arc(0, 0, sz, 0, TAU); g.fill(); break;
          }
          case 'spark':
            g.globalCompositeOperation = 'lighter';
            g.fillStyle = p.color || '#FFF2B0';
            g.beginPath();
            for (let i = 0; i < 8; i++) { const a = (i * Math.PI) / 4, r = i % 2 ? sz * 0.22 : sz; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
            g.closePath(); g.fill(); break;
          case 'bubble':
            g.strokeStyle = p.color || 'rgba(160,255,140,.9)'; g.lineWidth = 3; g.beginPath(); g.arc(0, 0, sz, 0, TAU); g.stroke();
            g.fillStyle = 'rgba(255,255,255,.6)'; g.beginPath(); g.arc(-sz * 0.35, -sz * 0.35, sz * 0.22, 0, TAU); g.fill(); break;
          case 'image':
            g.drawImage(p.image, -sz / 2, -sz / 2 * (p.image.height / p.image.width), sz, sz * (p.image.height / p.image.width)); break;
          case 'text':
            g.rotate(-p.rot);
            label(g, p.text, 0, 0, { size: sz, fill: p.color || '#FFF6E8', align: 'center' }); break;
        }
        g.restore();
      }
    },
    // 常用的一团：糖果碎屑
    burstCandy(x, y, n = 18, spread = 1) {
      for (let i = 0; i < n; i++) {
        const a = range(-Math.PI, 0), sp = range(220, 620) * spread;
        P.add({ kind: 'confetti', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 1100, drag: 1.2, life: range(0.9, 1.5), size: range(10, 18), vr: range(-9, 9), color: pick(['#FF8FB8', '#7FE0C2', '#FFD24A', '#B99BFF', '#FF8A1F']) });
      }
    },
    puffs(x, y, n = 10, r = 60) {
      for (let i = 0; i < n; i++) {
        const a = range(0, TAU), sp = range(40, 160);
        P.add({ kind: 'puff', x: x + Math.cos(a) * r * 0.4, y: y + Math.sin(a) * r * 0.4, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40, drag: 2.2, life: range(0.6, 1.1), size: range(r * 0.5, r), grow: 0.8 });
      }
    },
    sparks(x, y, n = 8, color) {
      for (let i = 0; i < n; i++) {
        const a = range(0, TAU), sp = range(80, 300);
        P.add({ kind: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 2.5, life: range(0.4, 0.8), size: range(8, 16), vr: range(-6, 6), color });
      }
    },
    text(x, y, text, size = 40, color) { P.add({ kind: 'text', x, y, vy: -60, drag: 1.5, life: 1.1, size, text, color }); },
  });
})();
