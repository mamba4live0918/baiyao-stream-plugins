/* G · 不给糖就捣蛋：糖飞进嘴里（嚼嚼），再落进右下角的南瓜桶。
   桶装满 FULL 颗：所有捣蛋立刻解除，再给 SHIELD 秒保护罩，期间来的捣蛋全变成糖。 */
(function () {
  'use strict';
  const HW = window.HW;
  const { TAU, range, rand, pick, seg, ease, arcPoint, label } = HW.util;
  const FULL = 20, SHIELD = 15;
  const BUCKET = { x: 1450, y: 800, s: 0.9 };

  const Ca = (HW.candy = {
    queue: [], flying: [], toBucket: [], count: 0, shield: -1, fx: { chomp: 0 }, pending: 0,
    reset() { Ca.queue.length = 0; Ca.flying.length = 0; Ca.toBucket.length = 0; Ca.count = 0; Ca.shield = -1; Ca.fx.chomp = 0; },
    // n 颗糖排着队一颗颗飞
    add(name, n = 1, converted = false) {
      for (let i = 0; i < n; i++) Ca.queue.push({ name, delay: i * 0.14, converted });
      return Ca.count + Ca.flying.length + Ca.toBucket.length + Ca.queue.length;
    },
    shielded() { return Ca.shield >= 0; },
    update(dt) {
      const s = dt / 1000, A = HW.avatar, mouth = A.point('mouth');
      for (let i = Ca.queue.length - 1; i >= 0; i--) {
        const q = Ca.queue[i];
        q.delay -= s;
        if (q.delay <= 0) {
          Ca.queue.splice(i, 1);
          const side = rand() < 0.5 ? -1 : 1;
          Ca.flying.push({ t: 0, from: { x: side < 0 ? range(-60, 200) : range(HW.W - 200, HW.W + 60), y: HW.H + 40 }, img: pick(HW.art.candies), spin: range(-10, 10), converted: q.converted });
          HW.sfx.pop();
        }
      }
      for (let i = Ca.flying.length - 1; i >= 0; i--) {
        const c = Ca.flying[i];
        c.t += s / 0.55;
        if (c.t >= 1) {
          Ca.flying.splice(i, 1);
          Ca.fx.chomp = 1;
          HW.sfx.chomp();
          if (rand() < 0.35) HW.particles.text(mouth.x + 70, mouth.y - 20, '嚼嚼', 32, '#FFC2DA');
          Ca.toBucket.push({ t: 0, from: { x: mouth.x, y: mouth.y + 20 }, img: c.img, spin: c.spin });
        }
      }
      for (let i = Ca.toBucket.length - 1; i >= 0; i--) {
        const c = Ca.toBucket[i];
        c.t += s / 0.6;
        if (c.t >= 1) {
          Ca.toBucket.splice(i, 1);
          Ca.count++;
          HW.sfx.coin();
          HW.particles.sparks(BUCKET.x, BUCKET.y - 70, 4, '#FFE3A0');
          if (Ca.count >= FULL) full();
        }
      }
      Ca.fx.chomp = Math.max(0, Ca.fx.chomp - s * 5);
      if (Ca.shield >= 0) { Ca.shield += s; if (Ca.shield >= SHIELD) { Ca.shield = -1; HW.ui.toast('保护罩消失了，小心捣蛋！'); } }
    },
    drawBack(g, t) {
      // 保护罩的后半圈（在皮套后面）
      if (Ca.shield >= 0) drawShield(g, t, false);
    },
    draw(g, t) {
      const A = HW.avatar, mouth = A.point('mouth');
      for (const c of Ca.flying) {
        const p = arcPoint(c.from, mouth, ease.outCubic(c.t), 220);
        drawImg(g, c.img, p.x, p.y, 64 * (1 - 0.3 * c.t), c.t * c.spin);
      }
      const opening = { x: BUCKET.x, y: BUCKET.y - 70 };
      for (const c of Ca.toBucket) {
        const p = arcPoint(c.from, opening, c.t, 180);
        drawImg(g, c.img, p.x, p.y, 44, c.t * c.spin);
      }
      drawBucket(g);
      if (Ca.shield >= 0) drawShield(g, t, true);
    },
  });

  function full() {
    HW.sfx.jingle();
    HW.ui.toast('糖够啦！捣蛋全部解除');
    HW.particles.burstCandy(BUCKET.x, BUCKET.y - 80, 40, 1.3);
    Ca.count = 0;
    HW.main.clearTricks();
    Ca.shield = 0;
    setTimeout(() => HW.sfx.shield(), 300);
  }
  function drawImg(g, img, x, y, w, rot) {
    const h = w * (img.height / img.width);
    g.save(); g.translate(x, y); g.rotate(rot); g.drawImage(img, -w / 2, -h / 2, w, h); g.restore();
  }
  function drawBucket(g) {
    const { x, y, s } = BUCKET, back = HW.art.bucketBack, front = HW.art.bucketFront;
    const w = back.width * s, h = back.height * s, left = x - w / 2, top = y - h / 2;
    g.drawImage(back, left, top, w, h);
    // 桶里的糖：越多堆得越高
    const fill = Math.min(1, Ca.count / FULL);
    if (Ca.count > 0) {
      g.save();
      g.beginPath();
      g.ellipse(x, top + 66 * s, 84 * s, 22 * s + fill * 40 * s, 0, Math.PI, 0);
      g.rect(x - 84 * s, top + 66 * s, 168 * s, 40 * s);
      g.clip();
      const n = Math.min(24, 4 + Ca.count);
      for (let i = 0; i < n; i++) {
        const u = (i * 0.618) % 1, v = (i * 0.37) % 1;
        drawImg(g, HW.art.candies[i % 6], x + (u - 0.5) * 150 * s, top + (70 - fill * 34 - v * 22) * s, 40 * s, (u - 0.5) * 2);
      }
      g.restore();
    }
    g.drawImage(front, left, top, w, h);
    // 计数条（只写数字，不写别的）
    const bw = 170, bx = x - bw / 2, by = top - 26;
    g.fillStyle = 'rgba(30,20,48,.75)';
    g.beginPath(); g.roundRect(bx, by, bw, 18, 9); g.fill();
    g.fillStyle = '#FF8FB8';
    g.beginPath(); g.roundRect(bx + 2, by + 2, Math.max(0, (bw - 4) * fill), 14, 7); g.fill();
    label(g, Ca.count + ' / ' + FULL, x, by - 20, { size: 26, align: 'center', fill: '#FFE3EE' });
  }
  function drawShield(g, t, front) {
    const A = HW.avatar, c = A.point('face'), r = 300, cy = c.y + 90;
    const left = 1 - Ca.shield / SHIELD, appear = ease.outBack(seg(Ca.shield, 0, 0.5)), fade = Ca.shield > SHIELD - 1 ? 0.5 + 0.5 * Math.sin(t * 20) : 1;
    g.save();
    g.globalAlpha = 0.85 * fade;
    g.translate(c.x, cy);
    g.scale(appear, appear);
    g.lineWidth = 6;
    const grd = g.createLinearGradient(-r, -r, r, r);
    grd.addColorStop(0, 'rgba(255,170,210,.95)'); grd.addColorStop(0.5, 'rgba(160,240,215,.95)'); grd.addColorStop(1, 'rgba(255,220,130,.95)');
    g.strokeStyle = grd;
    g.beginPath();
    if (front) g.arc(0, 0, r, 0.05 * Math.PI, 0.95 * Math.PI); else g.arc(0, 0, r, Math.PI, TAU);
    g.stroke();
    if (front) {
      g.fillStyle = 'rgba(200,240,255,.08)';
      g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill();
      // 剩余时间：顶上一段圆弧
      g.lineWidth = 10; g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineCap = 'round';
      g.beginPath(); g.arc(0, 0, r + 22, -Math.PI / 2 - left * Math.PI * 0.45, -Math.PI / 2 + left * Math.PI * 0.45); g.stroke();
      for (let i = 0; i < 6; i++) {
        const a = t * 0.8 + (i * TAU) / 6;
        g.fillStyle = 'rgba(255,255,255,.9)';
        g.beginPath(); g.arc(Math.cos(a) * r, Math.sin(a) * r, 5, 0, TAU); g.fill();
      }
    }
    g.restore();
  }
})();
