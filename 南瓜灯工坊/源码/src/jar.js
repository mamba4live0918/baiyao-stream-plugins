// 糖罐里的糖：每颗糖当一个小圆球，在罐子自己的坐标里算重力、互相挤、碰罐壁。
// 罐子被拖着晃 → 糖跟着晃；罐子歪过来 → 糖滚到低处、从罐口一颗颗掉出去（掉出去的交给工作台，飞进南瓜）。
// 静止下来就睡着（不算也不画），罐子一动再醒。
import { img, CANDIES } from './assets.js';

const FULL = 18;   // 一罐装这么多颗（颗大一点、挤满一点，远看也看得清）

export function createJar() {
  let w = 1, h = 1, parts = [], wall = [], still = 0, last = null;

  /** 罐身（罐子坐标，原点在罐子中心，y 向下）：第 0 条边是罐口，开着；比画出来的轮廓往里收一点，糖不会戳出玻璃。 */
  function shape() {
    const k = 0.93;
    wall = [[-0.29, -0.42], [0.29, -0.42], [0.45, -0.18], [0.49, 0.15], [0.39, 0.43], [0, 0.49], [-0.39, 0.43], [-0.49, 0.15], [-0.45, -0.18]]
      .map(([x, y]) => [x * w * k, y * h * k]);
  }
  const r = () => w * 0.135;

  /** 装满一罐，先让它们沉到底（开局不会「炸开」）。 */
  function fill(nw, nh, n = FULL) {
    w = nw; h = nh; shape(); parts = [];
    const rr = r(), seed = [0.3, 0.7, 0.1, 0.9, 0.5, 0.2, 0.8, 0.4, 0.6];
    for (let i = 0; i < n; i++) {
      const row = Math.floor(i / 3), col = i % 3;
      const x = (col - 1) * rr * 2.05 + (row % 2 ? rr * 0.5 : 0), y = h * 0.34 - row * rr * 1.75;
      parts.push({ x, y, px: x, py: y, a: seed[i % seed.length] * 6.28, k: CANDIES[i % CANDIES.length], r: rr });
    }
    for (let i = 0; i < 120; i++) sub(1 / 60, 0, 2600 * h / 300, false);
    still = 0; last = null;
  }

  /** 一小步：gx gy 是罐子坐标里的「重力」（已经算上罐子自己加速带来的惯性）。canExit：罐口能不能出糖。返回掉出去的那颗（罐子坐标）。 */
  function sub(dt, gx, gy, canExit) {
    for (const p of parts) {
      const vx = (p.x - p.px) * 0.99, vy = (p.y - p.py) * 0.99;
      p.px = p.x; p.py = p.y;
      p.x += vx + gx * dt * dt; p.y += vy + gy * dt * dt;
      p.a += vx / p.r * 0.6;
    }
    let out = null;
    for (let it = 0; it < 3; it++) {
      for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) {
        const a = parts[i], b = parts[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), min = a.r + b.r;
        if (d >= min || d < 1e-6) continue;
        const push = (min - d) / 2 / d;
        a.x -= dx * push; a.y -= dy * push; b.x += dx * push; b.y += dy * push;
      }
      for (const p of parts) for (let e = 0; e < wall.length; e++) {
        const [ax, ay] = wall[e], [bx, by] = wall[(e + 1) % wall.length];
        let nx = ay - by, ny = bx - ax;   // 朝里的法线（顺时针排的点，y 向下）
        const len = Math.hypot(nx, ny) || 1; nx /= len; ny /= len;
        const dist = (p.x - ax) * nx + (p.y - ay) * ny;
        if (e === 0) {   // 罐口：能出糖时放它出去，不能时当一面墙
          const inMouth = p.x > ax && p.x < bx;
          if (inMouth && canExit) { if (!out && dist < 0) out = p; continue; }
          if (!inMouth && dist >= p.r) continue;
        }
        if (dist < p.r) {
          const fix = p.r - dist;
          p.x += nx * fix; p.y += ny * fix;
          // 贴着罐壁有一点摩擦，晃完能停下来
          const vx = p.x - p.px, vy = p.y - p.py, along = vx * -ny + vy * nx;
          p.px += -ny * along * 0.08; p.py += nx * along * 0.08;
        }
      }
    }
    if (out) parts.splice(parts.indexOf(out), 1);
    return out;
  }

  /**
   * 跟着罐子走一帧。jar：{x, y, rot}（屏幕坐标），canExit：这一帧能不能从罐口出一颗。
   * 返回 { moving, out }：out 是掉出去的那颗（屏幕坐标、屏幕速度、哪种糖），没有就是 null。
   */
  function step(dt, jar, g, canExit) {
    const now = { x: jar.x, y: jar.y, rot: jar.rot || 0 };
    let ax = 0, ay = 0, vx = 0, vy = 0;
    if (last && dt > 0) {
      vx = (now.x - last.x) / dt; vy = (now.y - last.y) / dt;
      ax = Math.max(-g * 3, Math.min(g * 3, (vx - last.vx) / dt)); ay = Math.max(-g * 3, Math.min(g * 3, (vy - last.vy) / dt));
    }
    const turned = last ? Math.abs(now.rot - last.rot) : 1, moved = last ? Math.hypot(now.x - last.x, now.y - last.y) : 1;
    last = { ...now, vx, vy };
    if (moved > 0.2 || turned > 0.002 || canExit) still = 0;
    if (still > 25) return { moving: false, out: null };   // 睡着了
    const c = Math.cos(now.rot), s = Math.sin(now.rot), wx = -ax, wy = g - ay;
    const gx = wx * c + wy * s, gy = -wx * s + wy * c;   // 世界里的重力 + 惯性 → 罐子坐标
    const steps = Math.max(1, Math.min(3, Math.round(dt * 60)));
    let out = null, maxMove = 0;
    for (let i = 0; i < steps; i++) {
      const o = sub(dt / steps, gx, gy, canExit && !out);
      if (o) out = o;
    }
    for (const p of parts) maxMove = Math.max(maxMove, Math.abs(p.x - p.px) + Math.abs(p.y - p.py));
    still = maxMove < 0.05 ? still + 1 : 0;
    if (!out) return { moving: true, out: null };
    const lvx = (out.x - out.px) / (dt / steps), lvy = (out.y - out.py) / (dt / steps);
    return {
      moving: true,
      out: { x: now.x + out.x * c - out.y * s, y: now.y + out.x * s + out.y * c, vx: vx + lvx * c - lvy * s, vy: vy + lvx * s + lvy * c, k: out.k, a: out.a }
    };
  }

  /** 在罐子坐标里画糖（调用方已经平移旋转好、并且裁在罐身里）。 */
  function draw(g, scale = 1) {
    for (const p of parts) {
      const im = img(p.k);
      if (!im) continue;
      const cw = p.r * 2.9 * scale, ch = cw * 120 / 180;   // 画得比碰撞圈大一点，看起来挤挤的
      g.save(); g.translate(p.x * scale, p.y * scale); g.rotate(p.a); g.drawImage(im, -cw / 2, -ch / 2, cw, ch); g.restore();
    }
  }

  return { fill, step, draw, get count() { return parts.length; }, get asleep() { return still > 25; }, wake() { still = 0; } };
}
