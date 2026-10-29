/* E · 木乃伊缠绕：每次多缠一圈绷带（跟着头动），缠满 10 圈只露眼睛；
   主播使劲甩头会把最外面的一圈甩掉（真插件里用 VTS 头部跟随的速度来判断）。 */
(function () {
  'use strict';
  const HW = window.HW;
  const { range, rand, seg, label } = HW.util;
  // 每一圈的位置（立绘像素）：x, y, 角度, 长, 粗。眼睛那一条（y≈290–335）不横着缠，留出来
  const SLOTS = [
    [545, 262, 0.07, 450, 60], [545, 365, -0.06, 430, 58], [545, 205, -0.1, 440, 62], [545, 420, 0.09, 410, 56],
    [545, 345, 1.15, 440, 50], [545, 345, -1.15, 440, 50], [548, 465, -0.04, 360, 54], [545, 150, 0.04, 390, 60],
    [428, 380, 1.42, 250, 50], [662, 380, -1.42, 250, 50],
  ];
  const WRAP_T = 0.35;

  const M = (HW.mummy = {
    strips: [], loose: [], energy: 0, full: false,
    reset() { M.strips.length = 0; M.loose.length = 0; M.energy = 0; M.full = false; },
    add() {
      if (M.strips.length >= SLOTS.length) return M.strips.length;
      const used = new Set(M.strips.map(s => s.slot));
      const free = SLOTS.map((_, i) => i).filter(i => !used.has(i));
      const slot = free.length > 4 && rand() < 0.5 ? free[Math.floor(rand() * Math.min(3, free.length))] : free[0];
      M.strips.push({ slot, t: 0, variant: Math.floor(rand() * 3), dir: rand() < 0.5 ? -1 : 1 });
      HW.sfx.wrap();
      if (M.strips.length === SLOTS.length && !M.full) { M.full = true; setTimeout(() => HW.ui.toast('变成木乃伊啦！'), 400); }
      return M.strips.length;
    },
    clear() { while (M.strips.length) unwrap(true); },
    update(dt) {
      const s = dt / 1000, A = HW.avatar;
      for (const st of M.strips) st.t += s;
      // 甩头的力度攒起来，攒够就甩掉一圈
      const spin = Math.abs(A.tiltVel), speed = Math.abs(A.vel.x);
      M.energy = Math.max(0, M.energy - 0.6 * s) + (spin > 1.1 ? (spin - 1.1) * 1.6 * s : 0) + (speed > 450 ? ((speed - 450) / 450) * 1.4 * s : 0);
      if (M.energy > 1 && M.strips.length) { M.energy -= 1; unwrap(false); }
      if (M.strips.length < SLOTS.length) M.full = false;
      for (let i = M.loose.length - 1; i >= 0; i--) {
        const q = M.loose[i];
        q.age += s; q.vy += 700 * s; q.vx *= Math.exp(-0.8 * s); q.vy *= Math.exp(-0.8 * s);
        q.x += q.vx * s; q.y += q.vy * s; q.rot += q.vr * s + Math.sin(q.age * 9) * 0.6 * s;
        if (q.age > 1.8) M.loose.splice(i, 1);
      }
    },
    draw(g) {
      const A = HW.avatar, bands = HW.art.bandages;
      if (M.strips.length) {
        A.withFrame(g, g => {
          for (const st of M.strips) {
            const [x, y, ang, len, th] = SLOTS[st.slot];
            const k = seg(st.t, 0, WRAP_T), img = bands[st.variant];
            g.save();
            g.translate(x, y);
            g.rotate(ang);
            // 从一头往另一头缠上来
            g.beginPath();
            if (st.dir > 0) g.rect(-len / 2, -th, len * k, th * 2); else g.rect(len / 2 - len * k, -th, len * k, th * 2);
            g.clip();
            g.drawImage(img, -len / 2, -th / 2, len, th);
            g.restore();
          }
        });
      }
      for (const q of M.loose) {
        g.save();
        g.globalAlpha = 1 - seg(q.age, 1.2, 1.8);
        g.translate(q.x, q.y);
        g.rotate(q.rot);
        g.drawImage(bands[q.variant], -q.len / 2, -q.th / 2, q.len, q.th);
        g.restore();
      }
      if (M.strips.length >= 3) label(g, '绷带 ' + M.strips.length + '/' + SLOTS.length, 40, HW.H - 110, { size: 30, fill: '#F3E7CF' });
    },
  });

  function unwrap(gentle) {
    const A = HW.avatar, st = M.strips.pop(), [x, y, ang, len, th] = SLOTS[st.slot];
    const p = A.toStage(x, y), sc = A.scale(), side = Math.sign(A.vel.x || range(-1, 1));
    M.loose.push({ x: p.x, y: p.y, rot: ang + A.angle(), len: len * sc, th: th * sc, variant: st.variant, age: 0,
      vx: gentle ? range(-300, 300) : side * range(500, 900) + A.vel.x * 0.4, vy: gentle ? range(-500, -250) : range(-450, -150), vr: range(-5, 5) });
    HW.sfx.swish();
  }
})();
