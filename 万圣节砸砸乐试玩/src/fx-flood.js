/* B · 南瓜淹没：南瓜和糖从天上掉下来，从屏幕底部往上堆，绕开脸；堆满了就记 +N。
   堆好的东西画进一张底图里（不再每帧重画），每帧只在底图上挖出脸的位置。 */
(function () {
  'use strict';
  const HW = window.HW;
  const { range, rand, pick, label } = HW.util;
  const COL = 16, NCOL = Math.ceil(HW.W / COL), TOP = 46;

  const F = (HW.flood = {
    cols: new Float32Array(NCOL), falling: [], count: 0, overflow: 0, layer: null, cut: null, drain: -1,
    init() {
      F.layer = document.createElement('canvas');
      F.layer.width = HW.W; F.layer.height = HW.H;
      F.cut = document.createElement('canvas');
      F.cut.width = HW.W; F.cut.height = HW.H;
      F.reset();
    },
    reset() {
      F.cols.fill(HW.H); F.falling.length = 0; F.count = 0; F.overflow = 0; F.drain = -1;
      F.layer.getContext('2d').clearRect(0, 0, HW.W, HW.H);
    },
    // 一次掉一把：几个南瓜 + 几颗糖
    add(n = 6) {
      for (let i = 0; i < n; i++) {
        const isPumpkin = rand() < 0.45;
        F.falling.push({
          x: range(40, HW.W - 40), y: range(-260, -60), vx: range(-40, 40), vy: range(0, 200), rot: range(-0.5, 0.5), vr: range(-3, 3),
          img: isPumpkin ? pick(HW.art.pumpkins) : pick(HW.art.candies), w: isPumpkin ? range(130, 175) : range(84, 110), pumpkin: isPumpkin,
        });
      }
      HW.sfx.whoosh();
    },
    clear() { if (F.count || F.falling.length) { F.drain = 0; F.falling.length = 0; } },
    update(dt) {
      const s = dt / 1000;
      if (F.drain >= 0) {
        F.drain += s;
        if (F.drain > 1.1) F.reset();
        return;
      }
      for (let i = F.falling.length - 1; i >= 0; i--) {
        const p = F.falling[i];
        p.vy += 1900 * s; p.x += p.vx * s; p.y += p.vy * s; p.rot += p.vr * s;
        const h = p.w * (p.img.height / p.img.width);
        const surface = surfaceAt(p.x, p.w);
        if (p.y + h * 0.35 >= surface) { F.falling.splice(i, 1); settle(p, h); }
      }
    },
    // 堆在皮套前面，但脸的位置挖空
    draw(g) {
      if (!F.count && !F.falling.length) return;
      const off = F.drain >= 0 ? Math.pow(F.drain / 1.1, 2) * HW.H : 0;
      const c = F.cut.getContext('2d');
      c.globalCompositeOperation = 'source-over';
      c.clearRect(0, 0, HW.W, HW.H);
      c.drawImage(F.layer, 0, off);
      const A = HW.avatar, hole = A.FACE_HOLE, p = A.toStage(hole.x, hole.y), sc = A.scale();
      c.globalCompositeOperation = 'destination-out';
      c.save();
      c.translate(p.x, p.y);
      c.rotate(A.angle());
      c.scale(hole.rx * sc, hole.ry * sc);
      const gr = c.createRadialGradient(0, 0, 0.7, 0, 0, 1);
      gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = gr;
      c.beginPath(); c.arc(0, 0, 1, 0, Math.PI * 2); c.fill();
      c.restore();
      g.drawImage(F.cut, 0, 0);
      for (const q of F.falling) drawItem(g, q);
      if (F.overflow > 0) label(g, '堆满了 +' + F.overflow, HW.W - 40, 118, { size: 30, align: 'right', fill: '#FFD45C' });
    },
  });

  function surfaceAt(x, w) {
    let y = HW.H;
    const a = Math.max(0, Math.floor((x - w * 0.35) / COL)), b = Math.min(NCOL - 1, Math.floor((x + w * 0.35) / COL));
    for (let j = a; j <= b; j++) y = Math.min(y, F.cols[j]);
    return y;
  }
  // 脸附近（静止时的位置）不能放东西
  function blocked(x, y, w, h) {
    const A = HW.avatar, hole = A.FACE_HOLE, s = A.baseScale;
    const cx = A.stage.x + (hole.x - 545) * s, cy = A.stage.y + (hole.y - 520) * s;
    const rx = hole.rx * s + w * 0.4, ry = hole.ry * s + h * 0.4;
    return ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 < 1;
  }
  function settle(p, h) {
    let x = p.x, y = surfaceAt(x, p.w) - h * 0.32;
    // 挡住脸了就往旁边挪
    if (blocked(x, y, p.w, h)) {
      const dir = x < HW.W / 2 ? -1 : 1;
      let moved = false;
      for (let step = 1; step < 60; step++) {
        for (const d of [dir, -dir]) {
          const nx = x + d * step * 14;
          if (nx < 30 || nx > HW.W - 30) continue;
          const ny = surfaceAt(nx, p.w) - h * 0.32;
          if (!blocked(nx, ny, p.w, h)) { x = nx; y = ny; moved = true; break; }
        }
        if (moved) break;
      }
      if (!moved) { F.overflow++; return; }
    }
    if (y - h * 0.5 < TOP) { F.overflow++; return; }
    const a = Math.max(0, Math.floor((x - p.w * 0.42) / COL)), b = Math.min(NCOL - 1, Math.floor((x + p.w * 0.42) / COL));
    for (let j = a; j <= b; j++) F.cols[j] = Math.min(F.cols[j], y - h * 0.28);
    F.count++;
    drawItem(F.layer.getContext('2d'), { x, y, rot: p.rot * 0.3, w: p.w, img: p.img });
    if (p.pumpkin) HW.sfx.thud(); else if (rand() < 0.3) HW.sfx.pop();
  }
  function drawItem(g, q) {
    const h = q.w * (q.img.height / q.img.width);
    g.save();
    g.translate(q.x, q.y);
    g.rotate(q.rot);
    g.drawImage(q.img, -q.w / 2, -h / 2, q.w, h);
    g.restore();
  }
})();
