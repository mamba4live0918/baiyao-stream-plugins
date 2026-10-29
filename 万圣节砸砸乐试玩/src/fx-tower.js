/* A · 南瓜叠叠乐：南瓜灯一层层叠在头顶，塔跟着头晃；晃太猛、歪太久、倒立都会塌。
   每层是一个「倒立摆」：重力想让它倒，层与层之间的摩擦想让它站直，头的加速度把它甩来甩去。 */
(function () {
  'use strict';
  const HW = window.HW;
  const { range, rand, clamp, label } = HW.util;
  const BODY_W = 185;                       // 南瓜小图里身体的宽度（像素）
  const G = 5.5, C = 4.2, SLIP = 0.4, STEEP = 1.05, FLOOR = 900;

  const T = (HW.tower = {
    layers: [], falling: [], loose: [], record: 0, tiltHold: 0, peak: 0, lastCrash: -9,
    clear(gentle) {
      if (T.layers.length) collapse(0, gentle);
      T.falling.length = 0;
    },
    reset() { T.layers.length = 0; T.falling.length = 0; T.loose.length = 0; T.record = 0; T.tiltHold = 0; T.peak = 0; T.lastCrash = -9; },
    count() { return T.layers.length; },
    add() {
      const top = topPoint(), n = T.layers.length + T.falling.length;
      const w = widthOf(n);
      T.falling.push({ x: top.x + range(-36, 36), y: -140, vx: range(-30, 30), vy: 260, rot: range(-0.3, 0.3), vr: range(-2, 2), w, variant: Math.floor(rand() * 3) });
      HW.sfx.whoosh();
      return n + 1;
    },
    update(dt) {
      const s = dt / 1000, A = HW.avatar;
      // 头歪着不动太久，最底层会滑
      const phi = A.angle();
      T.tiltHold = Math.abs(phi) > 0.6 ? T.tiltHold + s : 0;
      if (T.layers.length && T.tiltHold > 0.5) collapse(0);
      // 物理：分 3 小步算，稳定一些
      const steps = 3, h = s / steps;
      for (let k = 0; k < steps && T.layers.length; k++) {
        let Phi = phi;
        for (let i = 0; i < T.layers.length; i++) {
          const L = T.layers[i];
          Phi += L.theta;
          const K = Math.max(12, 40 - 2.6 * i);
          const alpha = G * Math.sin(Phi) - (A.acc.x * Math.cos(Phi) + A.acc.y * Math.sin(Phi)) / 420 - A.angAcc * 0.35 - K * L.theta - C * L.omega;
          L.omega += alpha * h;
          L.theta += L.omega * h;
        }
      }
      // 太歪 / 滑开就从那一层开始塌
      let Phi = phi;
      for (let i = 0; i < T.layers.length; i++) {
        Phi += T.layers[i].theta;
        if (Math.abs(T.layers[i].theta) > SLIP || Math.abs(Phi) > STEEP) { collapse(i); break; }
      }
      for (const L of T.layers) L.squash = Math.max(0, L.squash - s * 4);
      // 正在掉下来的南瓜：碰到塔顶就叠上去
      for (let i = T.falling.length - 1; i >= 0; i--) {
        const p = T.falling[i];
        p.vy += 2400 * s; p.x += p.vx * s; p.y += p.vy * s; p.rot += p.vr * s;
        const top = topPoint(), hh = p.w * 0.36;
        if (p.vy > 0 && p.y + hh >= top.y && p.y + hh < top.y + 80) {
          const dx = p.x - top.x;
          if (Math.abs(dx) < p.w * 0.75) {
            T.falling.splice(i, 1);
            land(p, dx);
            continue;
          }
        }
        if (p.y > FLOOR + 200) { T.falling.splice(i, 1); }
        else if (p.y > top.y + 120) { T.falling.splice(i, 1); T.loose.push(Object.assign(p, { bounced: 0 })); }
      }
      updateLoose(s);
    },
    draw(g, t) {
      const A = HW.avatar;
      for (const p of T.loose) drawPumpkin(g, p.x, p.y, p.rot, p.w, p.variant, 0, t, 0);
      if (T.layers.length) {
        let base = A.point('headTop'), Phi = A.angle();
        for (let i = 0; i < T.layers.length; i++) {
          const L = T.layers[i];
          Phi += L.theta;
          const h = L.w * 0.62, sin = Math.sin(Phi), cos = Math.cos(Phi);
          const cx = base.x + sin * h * 0.5, cy = base.y - cos * h * 0.5;
          drawPumpkin(g, cx, cy, Phi, L.w, L.variant, L.squash, t, i);
          base = { x: base.x + sin * h, y: base.y - cos * h };
        }
        // 层数：塔顶旁边，塔顶出了屏幕就在上沿提示
        const n = T.layers.length;
        if (n >= 2) {
          if (base.y < 30) label(g, '↑ ' + n + ' 层', clamp(base.x, 80, 1520), 40, { size: 34, align: 'center', fill: '#FFD45C' });
          else label(g, n + ' 层', base.x + 70, base.y + 20, { size: 30, fill: '#FFD45C' });
        }
      }
      for (const p of T.falling) drawPumpkin(g, p.x, p.y, p.rot, p.w, p.variant, 0, t, 0);
    },
  });

  function widthOf(i) { return 128 * Math.pow(0.95, i); }
  function topPoint() {
    const A = HW.avatar;
    let base = A.point('headTop'), Phi = A.angle();
    for (const L of T.layers) {
      Phi += L.theta;
      const h = L.w * 0.62;
      base = { x: base.x + Math.sin(Phi) * h, y: base.y - Math.cos(Phi) * h };
    }
    return base;
  }
  function land(p, dx) {
    const L = { w: widthOf(T.layers.length), variant: p.variant, theta: clamp(dx / (p.w * 1.8) + p.rot * 0.15, -0.22, 0.22), omega: clamp(p.vx / 300, -1, 1) + range(-0.6, 0.6), squash: 1 };
    T.layers.push(L);
    for (const other of T.layers) other.omega += range(-0.25, 0.25);
    T.record = Math.max(T.record, T.layers.length);
    T.peak = Math.max(T.peak, T.layers.length);
    HW.sfx.thud();
  }
  // 从第 k 层开始往上全部变成散落的南瓜
  function collapse(k, gentle) {
    const A = HW.avatar;
    let base = A.point('headTop'), Phi = A.angle();
    const out = [];
    for (let i = 0; i < T.layers.length; i++) {
      const L = T.layers[i];
      Phi += L.theta;
      const h = L.w * 0.62, sin = Math.sin(Phi), cos = Math.cos(Phi);
      if (i >= k) {
        const lean = Math.sign(Phi || range(-1, 1));
        out.push({ x: base.x + sin * h * 0.5, y: base.y - cos * h * 0.5, w: L.w, variant: L.variant, rot: Phi,
          vx: gentle ? range(-160, 160) : A.vel.x * 0.6 + lean * range(160, 420) + L.omega * 120,
          vy: gentle ? range(-520, -300) : range(-260, -60), vr: gentle ? range(-3, 3) : lean * range(2, 6) + L.omega, bounced: 0, gentle: !!gentle });
      }
      base = { x: base.x + sin * h, y: base.y - cos * h };
    }
    const n = T.layers.length;
    T.layers.length = k;
    T.loose.push(...out);
    // 一次倒塌常常是从上往下连着几层掉：1.5 秒内只提示一次，报这一轮叠到的最高层数
    const now = HW.avatar.time;
    if (out.length && !gentle) {
      HW.sfx.crash();
      if (now - T.lastCrash > 1.5) HW.ui.toast('南瓜塔塌啦！这次叠到 ' + Math.max(n, T.peak) + ' 层');
      T.lastCrash = now;
    }
    if (!T.layers.length) T.peak = 0;
  }
  function updateLoose(s) {
    for (let i = T.loose.length - 1; i >= 0; i--) {
      const p = T.loose[i];
      p.vy += 2200 * s; p.x += p.vx * s; p.y += p.vy * s; p.rot += p.vr * s;
      const floor = FLOOR - p.w * 0.3;
      if (p.y >= floor) {
        if (p.gentle || p.bounced >= 1 || Math.abs(p.vy) > 500) {
          // 摔开变糖
          HW.particles.burstCandy(p.x, floor, 16, 0.9);
          for (let j = 0; j < 6; j++) HW.particles.add({ kind: 'shard', x: p.x, y: floor - 10, vx: range(-300, 300), vy: range(-500, -200), g: 1500, life: range(0.6, 1), size: range(10, 18), vr: range(-8, 8), color: '#F58A22' });
          if (!p.gentle) HW.sfx.pop();
          T.loose.splice(i, 1);
          continue;
        }
        p.y = floor; p.vy *= -0.4; p.vx *= 0.7; p.bounced++;
      }
      if (p.x < -200 || p.x > 1800) T.loose.splice(i, 1);
    }
  }
  function drawPumpkin(g, x, y, rot, w, variant, squash, t, i) {
    const img = HW.art.pumpkins[variant], s = w / BODY_W;
    g.save();
    g.translate(x, y);
    g.rotate(rot);
    g.scale(s * (1 + 0.14 * squash), s * (1 - 0.14 * squash));
    g.drawImage(img, -img.width / 2, -img.height * 0.6);
    // 南瓜灯里的火光一闪一闪
    g.globalCompositeOperation = 'lighter';
    const fl = 0.22 + 0.1 * Math.sin(t * 13 + i * 2.1) + 0.06 * Math.sin(t * 29 + i);
    const gr = g.createRadialGradient(0, 4, 0, 0, 4, 90);
    gr.addColorStop(0, 'rgba(255,200,80,' + fl.toFixed(3) + ')');
    gr.addColorStop(1, 'rgba(255,140,30,0)');
    g.fillStyle = gr;
    g.fillRect(-100, -86, 200, 180);
    g.restore();
  }
})();
