/* 万圣节砸砸乐试玩 · 皮套替身
   用白曜的立绘代替 VTS 模型。鼠标拖动 = 主播晃头（真实插件里来自 VTS 的头部跟随）。
   药水、附身这些效果在真插件里由 VTS 完成（移动 / 缩放 / 旋转 / 染色），这里用变换模拟。 */
(function () {
  'use strict';
  const HW = window.HW;
  const { clamp, sprite } = HW.util;

  // 立绘图片里的关键点（像素）
  const PIVOT = { x: 545, y: 520 };            // 头歪的时候绕着脖子转
  const POINTS = {
    headTop: { x: 543, y: 96 }, face: { x: 543, y: 330 }, mouth: { x: 541, y: 398 },
    eyeL: { x: 490, y: 313 }, eyeR: { x: 598, y: 313 }, earL: { x: 425, y: 78 }, earR: { x: 660, y: 78 },
    hairL: { x: 372, y: 236 }, hairR: { x: 728, y: 236 }, chest: { x: 545, y: 640 }, bottom: { x: 585, y: 900 }, center: { x: 585, y: 470 },
  };
  const FACE_HOLE = { x: 543, y: 300, rx: 210, ry: 235 };   // 「淹没」时一定露出来的脸（含头发）

  const A = (HW.avatar = {
    img: null, tints: {},
    stage: { x: 774, y: 649 }, baseScale: 0.66,
    // 头的晃动（弹簧跟着目标走）
    pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 }, tilt: 0, tiltVel: 0,
    target: { x: 0, y: 0, tilt: 0 },
    acc: { x: 0, y: 0 }, angAcc: 0,
    // 效果叠加：缩放、翻转、上浮、透明、染色
    fx: { scale: 1, scaleAnchor: POINTS.bottom, flip: 0, lift: 0, sway: 0, alpha: 1, ghost: 0, green: 0, chomp: 0 },
    drag: null, auto: false, shakeT: -1, time: 0,
    matrix: null, POINTS, FACE_HOLE,

    init(img) {
      A.img = img;
      // 染色版本只做一次：淡蓝（附身）和绿色（药水）
      const tint = color => sprite(img.naturalWidth, img.naturalHeight, g => {
        g.drawImage(img, 0, 0);
        g.globalCompositeOperation = 'source-atop';
        g.fillStyle = color;
        g.fillRect(0, 0, img.naturalWidth, img.naturalHeight);
      });
      A.tints.ghost = tint('rgba(150,205,255,.62)');
      A.tints.green = tint('rgba(110,220,80,.58)');
      A.reset();
    },
    reset() {
      A.pos.x = A.pos.y = A.vel.x = A.vel.y = A.tilt = A.tiltVel = 0;
      A.target.x = A.target.y = A.target.tilt = 0;
      Object.assign(A.fx, { scale: 1, scaleAnchor: POINTS.bottom, flip: 0, lift: 0, sway: 0, alpha: 1, ghost: 0, green: 0, chomp: 0 });
      A.shakeT = -1;
      A.update(0);
    },
    // 拖动：按下的位置为起点，拖多远头就偏多少、往哪边歪
    dragStart(x, y) { A.drag = { x0: x, y0: y }; },
    dragMove(x, y) {
      if (!A.drag) return;
      const dx = x - A.drag.x0, dy = y - A.drag.y0;
      A.target.x = clamp(dx, -300, 300);
      A.target.y = clamp(dy * 0.5, -70, 90);
      A.target.tilt = clamp(dx / 800, -0.42, 0.42);
    },
    dragEnd() { A.drag = null; A.target.x = A.target.y = A.target.tilt = 0; },
    shake() { A.shakeT = 0; },

    update(dt) {
      const s = dt / 1000;
      A.time += s;
      // 目标：拖动 > 甩头 > 自动轻晃 > 回正
      if (!A.drag) {
        if (A.shakeT >= 0) {
          A.shakeT += s;
          // 使劲甩头：左右甩 3 下（2.4 次/秒），越甩越轻
          const env = Math.max(0, 1 - A.shakeT / 1.3), w = Math.PI * 2 * 2.4;
          A.target.tilt = 0.5 * Math.sin(w * A.shakeT) * env;
          A.target.x = 110 * Math.sin(w * A.shakeT + Math.PI / 2) * env;
          A.target.y = 0;
          if (A.shakeT > 1.3) { A.shakeT = -1; A.target.tilt = A.target.x = 0; }
        } else if (A.auto) {
          A.target.x = 30 * Math.sin(A.time * 0.9) + 10 * Math.sin(A.time * 2.3);
          A.target.tilt = 0.07 * Math.sin(A.time * 1.3 + 1);
          A.target.y = 6 * Math.sin(A.time * 1.7);
        } else {
          A.target.x = A.target.y = A.target.tilt = 0;
        }
      }
      if (s > 0) {
        const k = 260, c = 2 * Math.sqrt(k) * 0.6;
        const ax = k * (A.target.x - A.pos.x) - c * A.vel.x;
        const ay = k * (A.target.y - A.pos.y) - c * A.vel.y;
        const at = 300 * (A.target.tilt - A.tilt) - 2 * Math.sqrt(300) * 0.55 * A.tiltVel;
        A.vel.x += ax * s; A.vel.y += ay * s; A.tiltVel += at * s;
        A.pos.x += A.vel.x * s; A.pos.y += A.vel.y * s; A.tilt += A.tiltVel * s;
        A.acc.x = ax; A.acc.y = ay; A.angAcc = at;
      }
      // 图片坐标 → 舞台坐标
      const f = A.fx;
      const rot = A.tilt + f.sway;
      const sc = A.baseScale * (1 + f.chomp * 0.035);
      const m = new DOMMatrix()
        .translate(A.stage.x + A.pos.x, A.stage.y + A.pos.y - f.lift)
        .rotate((rot * 180) / Math.PI)
        .scale(sc, sc)
        .translate(-PIVOT.x, -PIVOT.y)
        .translate(POINTS.center.x, POINTS.center.y)
        .rotate((f.flip * 180) / Math.PI)
        .translate(-POINTS.center.x, -POINTS.center.y)
        .translate(f.scaleAnchor.x, f.scaleAnchor.y)
        .scale(f.scale, f.scale)
        .translate(-f.scaleAnchor.x, -f.scaleAnchor.y);
      A.matrix = m;
    },
    // 关键点在舞台上的位置
    point(name) { const p = POINTS[name]; return A.toStage(p.x, p.y); },
    toStage(x, y) { const m = A.matrix; return { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f }; },
    // 头的整体朝向（弧度）和缩放：贴在头上的东西用它
    angle() { return Math.atan2(A.matrix.b, A.matrix.a); },
    scale() { return Math.hypot(A.matrix.a, A.matrix.b); },
    // 在皮套坐标系里画东西（图片像素为单位）
    withFrame(g, fn) { g.save(); const m = A.matrix; g.transform(m.a, m.b, m.c, m.d, m.e, m.f); fn(g); g.restore(); },

    draw(g) {
      const f = A.fx;
      if (!(f.alpha > 0.01)) return;
      A.withFrame(g, g => {
        g.globalAlpha = f.alpha;
        g.drawImage(A.img, 0, 0);
        if (f.ghost > 0.01) { g.globalAlpha = f.alpha * f.ghost; g.drawImage(A.tints.ghost, 0, 0); }
        if (f.green > 0.01) { g.globalAlpha = f.alpha * f.green; g.drawImage(A.tints.green, 0, 0); }
      });
      // 附身时眼睛发蓝光
      if (f.ghost > 0.05) {
        g.save();
        g.globalCompositeOperation = 'lighter';
        const r = 46 * A.scale() / A.baseScale * 0.66;
        for (const e of ['eyeL', 'eyeR']) {
          const p = A.point(e), gr = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
          gr.addColorStop(0, 'rgba(170,240,255,' + (0.9 * f.ghost).toFixed(3) + ')');
          gr.addColorStop(0.35, 'rgba(90,190,255,' + (0.45 * f.ghost).toFixed(3) + ')');
          gr.addColorStop(1, 'rgba(60,150,255,0)');
          g.fillStyle = gr;
          g.fillRect(p.x - r, p.y - r, r * 2, r * 2);
        }
        g.restore();
      }
    },
  });
})();
