/* D · 变身药水：药水瓶飞过来砸到脸上溅开，随机变身 HOLD 秒，时间到「噗」一团烟变回来。
   瓶子颜色就是效果：紫=缩小、红=变大、绿=变绿、蓝=倒立、白粉=隐身。
   真插件里由 VTS 完成（缩放 / 旋转 / 染色 / 透明），这里用皮套替身的变换模拟。 */
(function () {
  'use strict';
  const HW = window.HW;
  const { TAU, range, rand, pick, seg, ease, arcPoint, lerp } = HW.util;
  const HOLD = 8, FLY = 0.75;
  const KEYS = ['shrink', 'grow', 'green', 'flip', 'fade'];

  const Po = (HW.potion = {
    flying: [], cur: null,
    fx: { scale: 1, anchor: 'bottom', flip: 0, green: 0, alpha: 1 },
    reset() { Po.flying.length = 0; Po.cur = null; Object.assign(Po.fx, { scale: 1, anchor: 'bottom', flip: 0, green: 0, alpha: 1 }); },
    add(name, key = pick(KEYS)) {
      const side = rand() < 0.5 ? -1 : 1;
      Po.flying.push({ key, name, t: 0, from: { x: side < 0 ? -90 : HW.W + 90, y: range(480, 700) }, spin: side * range(8, 12) });
      HW.sfx.whoosh();
      return HW.art.POTIONS[key].name;
    },
    clear() { if (Po.cur && Po.cur.t < HOLD) { Po.cur.t = HOLD; poof(); } Po.flying.length = 0; },
    update(dt) {
      const s = dt / 1000, A = HW.avatar;
      for (let i = Po.flying.length - 1; i >= 0; i--) {
        const b = Po.flying[i];
        b.t += s / FLY;
        if (b.t >= 1) { Po.flying.splice(i, 1); hit(b, A.point('face')); }
      }
      const f = Po.fx;
      Object.assign(f, { scale: 1, flip: 0, green: 0, alpha: 1 });
      const c = Po.cur;
      if (!c) return;
      c.t += s;
      const out = seg(c.t, HOLD, HOLD + 0.45), inK = seg(c.t, 0, 0.6), on = 1 - out;
      switch (c.key) {
        case 'shrink': f.anchor = 'bottom'; f.scale = lerp(1, 0.45, ease.outElastic(inK) * on); break;
        case 'grow': f.anchor = 'face'; f.scale = lerp(1, 1.75, ease.outElastic(inK) * on); break;
        case 'green': f.green = ease.inOutSine(inK) * on;
          if (c.t < HOLD && rand() < s * 7) { const p = A.point('headTop'); HW.particles.add({ kind: 'bubble', x: p.x + range(-120, 120), y: p.y + range(0, 80), vy: range(-140, -70), vx: range(-20, 20), life: range(1, 1.6), size: range(8, 16) }); if (rand() < 0.4) HW.sfx.bubble(); }
          break;
        case 'flip': f.flip = Math.PI * ease.outBack(inK) * on; break;
        case 'fade': f.alpha = lerp(1, 0.14, ease.inOutSine(inK) * on);
          if (c.t < HOLD && rand() < s * 6) { const p = A.point('chest'); HW.particles.add({ kind: 'spark', x: p.x + range(-260, 260), y: p.y + range(-420, 100), life: 0.7, size: range(8, 14), color: '#F7E6FF' }); }
          break;
      }
      if (c.t >= HOLD && !c.poofed) { c.poofed = true; poof(); }
      if (c.t >= HOLD + 0.5) Po.cur = null;
    },
    draw(g) {
      const A = HW.avatar, to = A.point('face');
      for (const b of Po.flying) {
        const p = arcPoint(b.from, to, ease.inCubic(b.t) * 0.35 + b.t * 0.65, 260), img = HW.art.potions[b.key];
        g.save();
        g.translate(p.x, p.y);
        g.rotate(b.t * b.spin);
        g.drawImage(img, -img.width / 2 * 0.8, -img.height / 2 * 0.8, img.width * 0.8, img.height * 0.8);
        g.restore();
      }
    },
  });

  function hit(b, at) {
    const P = HW.art.POTIONS[b.key];
    HW.sfx.glass();
    for (let i = 0; i < 22; i++) {
      const a = range(0, TAU), sp = range(200, 700);
      HW.particles.add({ kind: 'drop', x: at.x, y: at.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 120, g: 1400, drag: 1, life: range(0.5, 0.9), size: range(8, 15), color: P.color, rot: a });
    }
    for (let i = 0; i < 8; i++) HW.particles.add({ kind: 'shard', x: at.x, y: at.y, vx: range(-420, 420), vy: range(-500, -100), g: 1500, life: range(0.5, 0.8), size: range(6, 11), vr: range(-10, 10), color: 'rgba(200,236,255,.9)' });
    if (Po.cur && Po.cur.t < HOLD) poof();
    Po.cur = { key: b.key, t: 0 };
    HW.ui.toast(b.name + ' 的变身药水：' + P.name + '！');
    HW.particles.text(at.x, at.y - 170, P.name + '！', 54, P.color);
    setTimeout(() => HW.sfx.boing(), 120);
  }
  function poof() {
    const c = HW.avatar.point('chest');
    HW.particles.puffs(c.x, c.y - 120, 14, 110);
    HW.sfx.poof();
  }
})();
