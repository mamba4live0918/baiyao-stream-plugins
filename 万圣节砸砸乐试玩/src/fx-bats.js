/* F · 蝙蝠倒挂：蝙蝠飞来倒挂在屏幕上沿的绳子上，或者挂在耳朵、头发上（跟着头晃），越挂越多；
   大礼物「吓一跳」全部惊飞。主播猛甩头，挂在头上的会被甩到绳子上去。 */
(function () {
  'use strict';
  const HW = window.HW;
  const { TAU, range, rand, pick, lerp, label } = HW.util;
  const ROPE_Y = 26;
  const HEAD_SPOTS = [['earL', -6, 18], ['earR', 6, 18], ['hairL', -10, 26], ['hairR', 10, 26]];

  const B = (HW.bats = {
    list: [], rope: 0,
    reset() { B.list.length = 0; B.rope = 0; },
    add(n = 2) {
      for (let i = 0; i < n; i++) {
        const onHead = rand() < 0.45 && headFree().length;
        const target = onHead ? { type: 'head', spot: pick(headFree()) } : { type: 'rope', x: range(60, HW.W - 60) };
        const side = rand() < 0.5 ? -1 : 1;
        B.list.push({ state: 'in', x: side < 0 ? -60 : HW.W + 60, y: range(80, 420), vx: 0, vy: 0, flap: range(0, TAU), target, swing: 0, swingV: 0, seed: range(0, TAU), s: range(1.25, 1.55) });
      }
      HW.sfx.flap();
      return B.list.length;
    },
    scare() {
      if (!B.list.length) return;
      for (const b of B.list) { b.state = 'scared'; const a = range(-Math.PI * 0.95, -Math.PI * 0.05); b.vx = Math.cos(a) * range(600, 1000); b.vy = Math.sin(a) * range(500, 900); }
      HW.sfx.squeak(); HW.sfx.flap();
      HW.ui.toast('蝙蝠全被吓飞啦！');
    },
    clear() { B.scare(); },
    update(dt) {
      const s = dt / 1000, A = HW.avatar;
      const shaking = Math.abs(A.vel.x) > 900 || Math.abs(A.tiltVel) > 2.6;
      for (let i = B.list.length - 1; i >= 0; i--) {
        const b = B.list[i];
        if (b.state === 'scared') {
          b.flap += 22 * s; b.x += b.vx * s; b.y += b.vy * s; b.vy -= 200 * s;
          if (b.x < -150 || b.x > HW.W + 150 || b.y < -150) B.list.splice(i, 1);
          continue;
        }
        const t = targetOf(b);
        if (b.state === 'in') {
          b.flap += 18 * s;
          const dx = t.x - b.x, dy = t.y - b.y, d = Math.hypot(dx, dy), sp = Math.min(900, 140 + d * 3);
          b.vx = lerp(b.vx, (dx / (d || 1)) * sp, Math.min(1, s * 6));
          b.vy = lerp(b.vy, (dy / (d || 1)) * sp + Math.sin(b.flap * 0.5) * 60, Math.min(1, s * 6));
          b.x += b.vx * s; b.y += b.vy * s;
          if (d < 10) { b.state = 'hang'; b.swingV = b.vx * 0.004; HW.sfx.squeak(); }
        } else {
          // 倒挂：像小钟摆一样晃，挂在头上的跟着头的加速度晃得更厉害
          const push = b.target.type === 'head' ? -A.acc.x / 260 - A.angAcc * 0.25 : 0;
          b.swingV += (-26 * b.swing - 2.2 * b.swingV + push) * s;
          b.swing += b.swingV * s;
          b.x = t.x; b.y = t.y;
          if (b.target.type === 'head' && shaking) { b.state = 'in'; b.target = { type: 'rope', x: range(60, HW.W - 60) }; b.vx = A.vel.x * 0.8; b.vy = -400; HW.sfx.squeak(); }
          if (rand() < s * 0.25) b.twitch = 0.35;
        }
        if (b.twitch > 0) b.twitch -= s;
      }
      B.rope = lerp(B.rope, B.list.some(b => b.target.type === 'rope' && b.state !== 'scared') ? 1 : 0, Math.min(1, s * 3));
    },
    draw(g, t) {
      if (B.rope > 0.01) {
        g.save();
        g.globalAlpha = B.rope;
        g.strokeStyle = '#4A3B63';
        g.lineWidth = 5;
        g.beginPath();
        for (let x = 0; x <= HW.W; x += 40) g.lineTo(x, ROPE_Y - 8 + Math.sin(x * 0.011) * 7);
        g.stroke();
        g.restore();
      }
      const A = HW.avatar;
      for (const b of B.list) {
        if (b.state === 'hang') {
          const twitch = b.twitch > 0;
          const rot = b.swing + (b.target.type === 'head' ? A.angle() * 0.6 : 0) + Math.sin(t * 2 + b.seed) * 0.05;
          // 挂点在脚上：先移到挂点，再往下画
          g.save();
          g.translate(b.x, b.y);
          g.rotate(rot);
          HW.art.drawBat(g, 0, 30 * b.s, b.s, twitch ? t * 30 : 0, !twitch, twitch ? Math.PI : 0);
          g.restore();
        } else {
          HW.art.drawBat(g, b.x, b.y, b.s, b.flap, false, Math.max(-0.4, Math.min(0.4, b.vx / 2000)));
        }
      }
      const n = B.list.filter(b => b.state !== 'scared').length;
      if (n) label(g, '蝙蝠 ' + n + ' 只', HW.W - 40, 70, { size: 28, align: 'right', fill: '#E6DCFF' });
    },
  });

  function headFree() {
    const used = B.list.filter(b => b.target.type === 'head' && b.state !== 'scared').map(b => b.target.spot[0]);
    return HEAD_SPOTS.filter(s => !used.includes(s[0]));
  }
  function targetOf(b) {
    if (b.target.type === 'rope') return { x: b.target.x, y: ROPE_Y - 6 + Math.sin(b.target.x * 0.011) * 7 };
    const [name, dx, dy] = b.target.spot, p = HW.avatar.point(name);
    return { x: p.x + dx, y: p.y + dy };
  }
})();
