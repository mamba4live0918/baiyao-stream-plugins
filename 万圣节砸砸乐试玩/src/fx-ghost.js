/* C · 小幽灵附身：每次来一只小幽灵绕着头飞，凑够 NEED 只就附身——
   皮套变成半透明淡蓝色、眼睛发光、飘起来左右晃（真插件里用 VTS 染色 + 移动），10 秒后幽灵散开。 */
(function () {
  'use strict';
  const HW = window.HW;
  const { TAU, range, rand, lerp, seg, ease, label } = HW.util;
  const NEED = 5, HOLD = 10;

  const Gh = (HW.ghosts = {
    list: [], possess: -1, leaving: [],
    fx: { ghost: 0, alpha: 1, lift: 0, sway: 0 },          // 交给皮套的：染色、透明、上浮、摇晃
    reset() { Gh.list.length = 0; Gh.leaving.length = 0; Gh.possess = -1; restore(); },
    add() {
      const side = rand() < 0.5 ? -1 : 1;
      Gh.list.push({ phase: range(0, TAU), speed: range(1.1, 1.6), rx: range(250, 320), ry: range(70, 110), bob: range(0, TAU), variant: Math.floor(rand() * 3),
        x: side < 0 ? -120 : HW.W + 120, y: range(120, 500), enter: 0 });
      HW.sfx.boo();
      if (Gh.possess >= 0) Gh.possess = Math.max(0, Gh.possess - 2);   // 附身中再来一只：多附身 2 秒
      return Gh.list.length;
    },
    clear() { if (Gh.possess >= 0) Gh.possess = HOLD; scatter(); },
    update(dt) {
      const s = dt / 1000, c = HW.avatar.point('face');
      if (Gh.possess < 0 && Gh.list.length >= NEED && Gh.list.every(g => g.enter >= 1)) { Gh.possess = 0; HW.sfx.possess(); HW.ui.toast('小幽灵附身啦！'); }
      if (Gh.possess >= 0) {
        Gh.possess += s;
        const t = Gh.possess;
        // 前 1.2 秒：幽灵螺旋着钻进身体；然后附身 HOLD 秒；最后散开
        const k = ease.outCubic(seg(t, 1.0, 2.0)), back = seg(t, HOLD + 1.2, HOLD + 2.0);
        Gh.fx.ghost = k * (1 - back);
        Gh.fx.alpha = lerp(1, 0.7, k * (1 - back));
        Gh.fx.lift = 80 * ease.inOutSine(seg(t, 1.2, 2.6)) * (1 - back);
        Gh.fx.sway = 0.07 * Math.sin(t * 2.1) * k * (1 - back);
        if (t > 0.6 && t < 0.62 + s) HW.particles.sparks(c.x, c.y, 16, '#BFE6FF');
        if (t >= HOLD + 1.2 && Gh.list.length) { scatter(); HW.sfx.boo(); HW.particles.text(c.x, c.y - 160, 'Boo!', 60, '#DDF2FF'); }
        if (t >= HOLD + 2.0) { Gh.possess = -1; restore(); }
      }
      for (const g of Gh.list) {
        g.phase += g.speed * s;
        g.bob += 3 * s;
        let tx = c.x + Math.cos(g.phase) * g.rx, ty = c.y - 40 + Math.sin(g.phase) * g.ry + Math.sin(g.bob) * 10;
        if (Gh.possess >= 0) {
          const k = seg(Gh.possess, 0, 1.2);
          tx = lerp(tx, c.x, ease.inCubic(k)); ty = lerp(ty, c.y, ease.inCubic(k));
          g.speed = lerp(g.speed, 6, k * s * 2);
        }
        if (g.enter < 1) {
          g.enter = Math.min(1, g.enter + s / 0.9);
          const e = ease.outCubic(g.enter);
          g.x = lerp(g.x, tx, e * 0.25 + 0.05); g.y = lerp(g.y, ty, e * 0.25 + 0.05);
        } else { g.x = tx; g.y = ty; }
      }
      for (let i = Gh.leaving.length - 1; i >= 0; i--) {
        const g = Gh.leaving[i];
        g.x += g.vx * s; g.y += g.vy * s; g.age += s;
        if (g.age > 2) Gh.leaving.splice(i, 1);
      }
    },
    // depth < 0 的在皮套后面，> 0 的在前面
    draw(g, front) {
      const inside = Gh.possess >= 0 && Gh.possess > 1.2 && Gh.possess < HOLD + 1.2;
      for (const q of Gh.list) {
        if (inside) continue;
        const depth = Math.sin(q.phase);
        if ((depth > 0) !== front) continue;
        const k = Gh.possess >= 0 ? 1 - seg(Gh.possess, 0.6, 1.2) : 1;
        drawGhost(g, q.x, q.y, 0.82 + depth * 0.12, q.variant, (front ? 0.95 : 0.6) * k, Math.sin(q.bob) * 0.12);
      }
      if (front) {
        for (const q of Gh.leaving) drawGhost(g, q.x, q.y, 0.85, q.variant, 1 - q.age / 2, q.vx > 0 ? 0.2 : -0.2);
        if (Gh.list.length && Gh.possess < 0) label(g, '小幽灵 ' + Gh.list.length + '/' + NEED, 40, HW.H - 60, { size: 30, fill: '#DDF2FF' });
      }
    },
  });

  function scatter() {
    const c = HW.avatar.point('face');
    for (const q of Gh.list) {
      const a = range(0, TAU), sp = range(500, 900);
      Gh.leaving.push({ x: c.x, y: c.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 100, variant: q.variant, age: 0 });
    }
    Gh.list.length = 0;
  }
  function restore() { Object.assign(Gh.fx, { ghost: 0, alpha: 1, lift: 0, sway: 0 }); }
  function drawGhost(g, x, y, s, variant, alpha, rot) {
    const img = HW.art.ghosts[variant];
    g.save();
    g.globalAlpha = Math.max(0, alpha);
    g.translate(x, y);
    g.rotate(rot);
    g.scale(s, s);
    g.shadowColor = 'rgba(190,220,255,.8)';
    g.shadowBlur = 24;
    g.drawImage(img, -img.width / 2, -img.height / 2);
    g.restore();
  }
})();
