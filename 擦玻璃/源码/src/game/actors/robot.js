/* 擦窗机器人（帮忙）：背上写着送的人的名字，从边上滑进来"噗"地吸在玻璃上，挑最脏的一片走"之"字擦；
   主播可以拖着它去别的地方（拖的时候也在擦）。时间到了笑着滑走："@B 的机器人下班了，擦了 N 处"。
   机器人擦完的脏东西记在送它的人名下（帮忙榜）。 */
import { createSprite } from '../../glass/sprites.js';
import { LAYER } from '../../glass/stage.js';
import { drawRobot } from '../../art/helpers-art.js';
import { rand, clamp, follow, angleDiff, passTracker } from '../../util.js';
import { zoneDist } from '../../zone.js';

function regions(stage) {
  const W = stage.W;
  const H = stage.H;
  return [
    { x0: 0.02 * W, x1: 0.36 * W, y0: 0.06 * H, y1: 0.96 * H },
    { x0: 0.64 * W, x1: 0.98 * W, y0: 0.06 * H, y1: 0.96 * H },
    { x0: 0.04 * W, x1: 0.96 * W, y0: 0.6 * H, y1: 0.97 * H },
    { x0: 0.04 * W, x1: 0.96 * W, y0: 0.03 * H, y1: 0.32 * H }
  ];
}

function overlapsZone(z, r, pad) {
  if (!z) return false;
  return !(r.x1 < z.cx - z.hw - pad || r.x0 > z.cx + z.hw + pad || r.y1 < z.cy - z.hh - pad || r.y0 > z.cy + z.hh + pad);
}

export function createRobot(game, { owner, seconds, speed }) {
  const { stage, audio, glare, hud, particles, labels } = game.ctx;
  const u = stage.unit;
  const res = Math.min(2, stage.dpr);
  const size = 160 * u;
  const faces = { normal: drawRobot(size, 'normal', u, res), blink: drawRobot(size, 'blink', u, res), happy: drawRobot(size, 'happy', u, res) };
  const sprite = createSprite(stage, faces.normal.canvas, faces.normal.w, faces.normal.h, LAYER.ACTOR + 40);
  const tag = labels.add(`@${owner.name} 的机器人`, 'robot');
  owner.help = true;
  owner.cleaned = 0;
  const seed = (Math.random() * 1e9) | 0;
  const passes = passTracker();
  let path = [];
  let x = 0;
  let y = 0;
  let rot = 0;
  let state = 'in';
  let t = 0;
  let st = 0;
  let dragging = false;
  let enterFrom = null;
  let exitTo = null;
  let blinkT = rand(1.5, 3);
  let target = null;
  /* 盯上一块：记在那块上（几台机器人互相看得见谁在擦哪块） */
  const claim = s => {
    if (target) target.robots = Math.max(0, (target.robots || 1) - 1);
    target = s;
    if (s) s.robots = (s.robots || 0) + 1;
  };
  let hop = null;
  /* 够不着/擦了几遍还剩一点的块先放一放（到点再回来），别一直卡在一块上 */
  const skip = new Map();
  const skipped = s => (skip.get(s) ?? -1) > t;
  const tries = new Map();
  let targetRem = 1;
  let idleT = 0;
  /* 直线过去会不会穿过露脸区 */
  const crosses = (ax, ay, bx, by) => {
    for (let i = 1; i < 12; i++) {
      const k = i / 12;
      if (game.inZone(ax + (bx - ax) * k, ay + (by - ay) * k, size * 0.45)) return true;
    }
    return false;
  };
  let beepT = 0;
  const v = (speed ?? 1) * 460 * u;
  /* 路线离露脸区留多远（机器人身子贴着区边、不盖到脸）；离画面边留多远（身子可以稍微探出画面，好擦到边角） */
  const MARGIN = size * 0.5;
  const EDGE = size * 0.42;

  /* 这个点机器人站得上去吗：离露脸区太近就顺着"远离露脸区"的方向往外推一点（身子贴着区边擦，刮条照样够得着原来那里）；
     推得太远（点在区里头）就算站不上 */
  function reach(px, py) {
    const zr = stage.zone;
    const d = zoneDist(zr, px, py);
    if (d >= MARGIN) return { x: px, y: py, pushed: false };
    const need = MARGIN - d + 1;
    if (need > size * 0.45) return null;
    const gx = zoneDist(zr, px + 1, py) - zoneDist(zr, px - 1, py);
    const gy = zoneDist(zr, px, py + 1) - zoneDist(zr, px, py - 1);
    const gl = Math.hypot(gx, gy);
    if (!gl) return null;
    const q = { x: clamp(px + (gx / gl) * need, EDGE, stage.W - EDGE), y: clamp(py + (gy / gl) * need, EDGE, stage.H - EDGE), pushed: true };
    return game.inZone(q.x, q.y, MARGIN - 4) ? null : q;
  }

  /* 一行"之"字从 x0 擦到 x1：贴着露脸区的地方沿着区边绕，压在区里头的地方断开（之后"跳"过去） */
  function rowRuns(x0, x1, yy) {
    const n = Math.max(1, Math.ceil((x1 - x0) / (size * 0.12)));
    const runs = [];
    let run = null;
    for (let i = 0; i <= n; i++) {
      const p = reach(x0 + ((x1 - x0) * i) / n, yy);
      if (!p) {
        if (run) runs.push(run);
        run = null;
        continue;
      }
      if (!run) run = [];
      run.push(p);
    }
    if (run) runs.push(run);
    /* 直的那段只留两头，绕着区边的点都留着 */
    return runs.map(r => r.filter((p, i) => i === 0 || i === r.length - 1 || p.pushed));
  }

  const hasWork = () => game.liveStains().some(s => !s.hidden && !skipped(s));

  function pickTarget(from) {
    const W = stage.W;
    /* 中心压在露脸区里的块（改了露脸区以后会有）也擦它露在外面的部分；整块看不见的不管 */
    const dirty = game.liveStains().filter(s => !s.hidden && !skipped(s));
    if (!dirty.length) return null;
    /* 正在擦的那块还没擦完，先把它擦干净再换；来回 3 遍还没完、或者这一遍几乎没擦掉（够不着），先放一放 */
    if (target && target.state === 'live' && dirty.includes(target)) {
      const n = tries.get(target) || 0;
      const stuck = n > 0 && targetRem - target.remaining < 0.01;
      if (n < 3 && !stuck) return target;
      skip.set(target, t + 12);
      tries.delete(target);
    }
    /* 别的机器人已经在擦的块往后排：好几台机器人时各擦各的 */
    const score = s => (s.remaining * s.w * s.h) / (1 + Math.hypot(s.x - from.x, s.y - from.y) / (W * 0.35)) / (1 + 3 * ((s.robots || 0) - (s === target ? 1 : 0)));
    const pool = dirty.filter(s => !skipped(s));
    return pool.length ? pool.reduce((a, b) => (score(b) > score(a) ? b : a)) : null;
  }

  /* 直奔最脏的一块：在它"还剩东西"的范围里排一小片"之"字路线；玻璃上没东西就在两侧来回巡逻 */
  function plan(near, depth = 0) {
    const W = stage.W;
    const H = stage.H;
    const from = near || { x, y };
    const best = depth < 40 ? pickTarget(from) : null;
    let r;
    if (best) {
      if (best !== target) {
        tries.clear();
        claim(best);
      }
      tries.set(best, (tries.get(best) || 0) + 1);
      if (!best.dirtBox) best.measure();
      targetRem = best.remaining;
      const pad = 10 * u;
      const b = best.dirtBox;
      r = b ? { x0: b.x0 - pad, x1: b.x1 + pad, y0: b.y0 - pad, y1: b.y1 + pad } : { x0: best.x - best.w / 2 + pad * 2, x1: best.x + best.w / 2 - pad * 2, y0: best.y - best.h / 2 + pad * 2, y1: best.y + best.h / 2 - pad * 2 };
    } else {
      claim(null);
      const cands = regions(stage).filter(q => !overlapsZone(stage.zone, q, MARGIN));
      r = cands.length ? cands[Math.floor(Math.random() * cands.length)] : regions(stage)[2];
    }
    r = { x0: clamp(r.x0, EDGE, W - EDGE), x1: clamp(r.x1, EDGE, W - EDGE), y0: clamp(r.y0, EDGE, H - EDGE), y1: clamp(r.y1, EDGE, H - EDGE) };
    const gap = size * 0.8;
    const rows = [];
    for (let yy = r.y0; yy <= r.y1 + 1; yy += gap) rows.push(yy);
    if (!rows.length || r.y1 - rows[rows.length - 1] > gap * 0.3) rows.push(r.y1);
    const pts = [];
    let flip = false;
    for (const yy of rows) {
      const seq = [];
      for (const run of rowRuns(r.x0, r.x1, yy)) seq.push(...(run.length > 1 ? run : [run[0], run[0]]));
      if (!seq.length) continue;
      if (flip) seq.reverse();
      pts.push(...seq);
      flip = !flip;
    }
    /* 这块整个贴着露脸区、机器人够不着：先放一放，换下一块 */
    if (!pts.length && target) {
      skip.set(target, t + 8);
      if (skip.size > 60) skip.delete(skip.keys().next().value);
      return plan(near, depth + 1);
    }
    return pts;
  }

  path = plan(null);
  const first = path[0] || { x: stage.W * 0.2, y: stage.H * 0.8 };
  enterFrom = first.x < stage.W / 2 ? { x: -size, y: first.y } : { x: stage.W + size, y: first.y };
  x = enterFrom.x;
  y = enterFrom.y;

  /* 擦的是整个身子底下那一片：往前多擦半个身子，走到路线尽头时前面的边角也擦得到 */
  function clean(px, py, nx, ny) {
    const dx = nx - px;
    const dy = ny - py;
    const len = Math.hypot(dx, dy);
    if (len < 0.01) return;
    const ext = size * 0.42;
    const ex = nx + (dx / len) * ext;
    const ey = ny + (dy / len) * ext;
    const touched = game.wipe([{ x: px, y: py }, { x: ex, y: ey }], size * 0.96, 1.4, seed, owner, passes.next(dx, dy));
    if (touched && beepT <= 0) {
      beepT = 1.2;
      audio.beep();
    }
  }

  return {
    kind: 'robot',
    owner,
    get at() {
      return { x, y };
    },
    /* 试玩/排查用：现在盯着哪块、接下来往哪走 */
    get debug() {
      return { target: target ? { x: Math.round(target.x), y: Math.round(target.y), rem: +target.remaining.toFixed(3) } : null, tries: target ? tries.get(target) || 0 : 0, skipped: [...skip.values()].filter(v => v > t).length, next: path.slice(0, 4).map(p => [Math.round(p.x), Math.round(p.y)]), left: path.length };
    },
    hit(px, py) {
      if (state !== 'clean' || Math.abs(px - x) > size * 0.55 || Math.abs(py - y) > size * 0.55) return null;
      return {
        grab() {
          dragging = true;
          audio.suction();
        },
        move(mx, my) {
          if (!dragging || state !== 'clean') return;
          const nx = clamp(mx, EDGE, stage.W - EDGE);
          const ny = clamp(my, EDGE, stage.H - EDGE);
          clean(x, y, nx, ny);
          x = nx;
          y = ny;
        },
        release() {
          if (!dragging) return;
          dragging = false;
          if (state !== 'clean') return;
          path = plan({ x, y });
          audio.suction();
        }
      };
    },
    update(dt) {
      t += dt;
      st += dt;
      blinkT -= dt;
      beepT -= dt;
      let face = blinkT < 0.12 && blinkT > 0 ? 'blink' : 'normal';
      if (blinkT <= 0) blinkT = rand(2, 4);
      let scale = 1;
      if (state === 'in') {
        const k = clamp(st / 0.6, 0, 1);
        x = enterFrom.x + (first.x - enterFrom.x) * k;
        y = enterFrom.y + (first.y - enterFrom.y) * k;
        if (k >= 1) {
          state = 'clean';
          st = 0;
          audio.suction();
          glare.tap(x, y);
          particles.sparkle(x, y, 4, 40);
        }
      } else if (state === 'clean' && hop) {
        hop.t += dt;
        const k = clamp(hop.t / 0.55, 0, 1);
        x = hop.from.x + (hop.to.x - hop.from.x) * k;
        y = hop.from.y + (hop.to.y - hop.from.y) * k - Math.sin(k * Math.PI) * 90 * u;
        scale = 1 + Math.sin(k * Math.PI) * 0.22;
        face = 'happy';
        if (k >= 1) {
          hop = null;
          audio.suction();
          glare.tap(x, y);
        }
      } else if (state === 'clean') {
        if (st < 0.25) scale = 1 + 0.12 * Math.sin((st / 0.25) * Math.PI);
        if (!dragging) {
          /* 盯着的那块擦完了就换下一块；巡逻的时候有新活了也马上去 */
          if (!path.length || (target && target.state !== 'live') || (!target && hasWork())) path = plan(null);
          const goal = path[0];
          if (goal) {
            const dx = goal.x - x;
            const dy = goal.y - y;
            const d = Math.hypot(dx, dy);
            const step = Math.min(d, v * dt);
            const nx = x + (dx / (d || 1)) * step;
            const ny = y + (dy / (d || 1)) * step;
            if (crosses(x, y, goal.x, goal.y)) {
              /* 要去的地方隔着露脸区：松开吸盘"跳"过去，不在脸上擦 */
              hop = { from: { x, y }, to: { x: goal.x, y: goal.y }, t: 0 };
              path.shift();
              audio.suction();
            } else if (game.inZone(nx, ny, size * 0.45)) path.shift();
            else {
              clean(x, y, nx, ny);
              rot += angleDiff(rot, Math.sin(t * 2) * 0.08) * follow(4, dt);
              x = nx;
              y = ny;
            }
            if (d < 2 * u) path.shift();
          }
        }
        /* 玻璃上没活干了：干满 5 秒后闲 3 秒就提前下班，不占地方 */
        idleT = hasWork() ? 0 : idleT + dt;
        if (t > seconds || (t > 5 && idleT > 3 && !dragging)) {
          state = 'out';
          claim(null);
          dragging = false;
          st = 0;
          const edges = [{ x: -size, y }, { x: stage.W + size, y }, { x, y: stage.H + size }];
          edges.sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y));
          exitTo = { from: { x, y }, to: edges[0] };
          audio.beep();
          hud.toast(`@${owner.name} 的机器人下班了，擦了 ${owner.cleaned} 处`, 'help');
        }
      } else if (state === 'out') {
        face = 'happy';
        const k = clamp((st - 0.5) / 0.7, 0, 1);
        rot = st < 0.5 ? Math.sin(st * 30) * 0.12 : 0;
        x = exitTo.from.x + (exitTo.to.x - exitTo.from.x) * k * k;
        y = exitTo.from.y + (exitTo.to.y - exitTo.from.y) * k * k;
        if (k >= 1) return false;
      }
      sprite.swap(faces[face].canvas);
      sprite.set(x, y, rot, scale, 1);
      tag.set(x, y - size * 0.72, 1);
      return true;
    },
    dispose() {
      claim(null);
      sprite.dispose();
      tag.remove();
    }
  };
}
