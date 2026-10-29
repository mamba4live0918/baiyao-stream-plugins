/* 粘在玻璃上的珍珠：走走停停往下滑（比水珠慢）；刮条扫过或者点一下就被弹下去、转着掉出画面。 */
import { createSprite } from '../../glass/sprites.js';
import { LAYER, canvasTexture } from '../../glass/stage.js';
import { canvas, shine, tone } from '../../art/ink.js';
import { rand, TAU, clamp } from '../../util.js';

function drawPearl(r, res) {
  const s = Math.ceil(r * 2 + 6);
  const { c, g } = canvas(s * res, s * res);
  g.scale(res, res);
  g.translate(s / 2, s / 2);
  g.beginPath();
  g.arc(0, 0, r, 0, TAU);
  g.fillStyle = '#3d2a20';
  g.fill();
  g.save();
  g.clip();
  g.beginPath();
  g.arc(r * 0.25, r * 0.3, r * 0.85, 0, TAU);
  g.fillStyle = tone('#3d2a20', -0.25);
  g.fill();
  g.beginPath();
  g.arc(-r * 0.05, -r * 0.05, r * 0.8, 0, TAU);
  g.fillStyle = '#4a3326';
  g.fill();
  g.restore();
  g.beginPath();
  g.arc(0, 0, r, 0, TAU);
  g.lineWidth = Math.max(1.5, r * 0.16);
  g.strokeStyle = '#1e140f';
  g.stroke();
  shine(g, -r * 0.35, -r * 0.38, r * 0.28, r * 0.18, -0.6, 0.95);
  return { canvas: c, w: s, h: s };
}

/* 全场的珍珠：超过上限就让最早的自己掉下去；粘太久（LIFE 秒）也会自己掉，不会越积越多 */
const ALL = new Set();
const MAX_ALL = 120;
const LIFE = 75;
/* 刚粘上时走走停停往下滑一小段，十几秒后就粘住不动了（不动就不用一直重画） */
const SLIDE_FOR = 12;

export function createPearls(game, { x, y, n, spread, owner }) {
  const { stage, audio, particles } = game.ctx;
  const u = stage.unit;
  const res = Math.min(2, stage.dpr);
  const r = 11 * u;
  const art = drawPearl(r, res);
  const shared = canvasTexture(art.canvas);
  const list = [];
  for (let i = 0; i < n; i++) {
    const a = rand(0, TAU);
    const d = Math.sqrt(Math.random()) * spread;
    const px = x + Math.cos(a) * d;
    const py = y + Math.sin(a) * d * 0.8;
    if (game.inZone(px, py, r * 2)) continue;
    const sprite = createSprite(stage, art.canvas, art.w, art.h, LAYER.ACTOR, { texture: shared });
    const p = { x: px, y: py, sprite, vx: 0, vy: 0, rot: rand(0, TAU), vr: 0, loose: false, pause: rand(0.6, 2.4), slide: 0, scale: 0, age: 0, slideFor: SLIDE_FOR * rand(0.7, 1.3) };
    list.push(p);
    ALL.add(p);
  }
  let removed = 0;
  /* 自己掉下去（不算主播清掉的，不叮） */
  function drop(p) {
    p.loose = true;
    p.vx = rand(-40, 40) * u;
    p.vy = rand(20, 80) * u;
    p.vr = rand(-4, 4);
    ALL.delete(p);
  }
  while (ALL.size > MAX_ALL) {
    const oldest = ALL.values().next().value;
    oldest.dropMe = true;
    ALL.delete(oldest);
  }

  function flick(p, dx, dy, speed) {
    ALL.delete(p);
    p.loose = true;
    p.vx = dx * speed + rand(-80, 80) * u;
    p.vy = dy * speed - rand(60, 200) * u;
    p.vr = rand(-12, 12);
    removed++;
    audio.pop();
    particles.sparkle(p.x, p.y, 3, 26);
  }

  return {
    kind: 'pearls',
    owner,
    hit(hx, hy) {
      const p = list.find(q => !q.loose && Math.hypot(q.x - hx, q.y - hy) < r * 2.2);
      if (!p) return null;
      return {
        click() {
          const a = rand(-0.5, 0.5) - Math.PI / 2;
          flick(p, Math.cos(a), Math.sin(a), 420 * u);
          game.ctx.glare.tap(hx, hy);
        }
      };
    },
    onWipe(pts, width) {
      const a = pts[0];
      const b = pts[pts.length - 1];
      const vx = b.x - a.x;
      const vy = b.y - a.y;
      const len = Math.hypot(vx, vy) || 1;
      let n = 0;
      for (const p of list) {
        if (p.loose) continue;
        const t = clamp(((p.x - a.x) * vx + (p.y - a.y) * vy) / (len * len), 0, 1);
        const d = Math.hypot(a.x + vx * t - p.x, a.y + vy * t - p.y);
        if (d < width / 2 + r) {
          flick(p, vx / len, vy / len, 520 * u);
          n++;
        }
      }
      return n;
    },
    update(dt) {
      let alive = 0;
      for (const p of list) {
        if (p.gone) continue;
        p.scale = Math.min(1, p.scale + dt * 6);
        if (p.loose) {
          p.vy += 1800 * u * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.rot += p.vr * dt;
          if (p.y > stage.H + 40 * u || p.x < -40 * u || p.x > stage.W + 40 * u) {
            p.gone = true;
            p.sprite.dispose();
            continue;
          }
        } else {
          p.age += dt;
          if (p.age > LIFE || p.dropMe) drop(p);
          p.pause -= dt;
          if (p.age > p.slideFor) p.slide = 0;
          else if (p.pause <= 0) {
            if (p.slide > 0) {
              p.slide = 0;
              p.pause = rand(0.8, 2.6);
            } else {
              p.slide = rand(14, 34) * u;
              p.pause = rand(0.2, 0.6);
            }
          }
          const ny = p.y + p.slide * dt;
          if (p.slide > 0 && !game.inZone(p.x, ny, r * 1.6) && ny < stage.H - r) p.y = ny;
        }
        p.sprite.set(p.x, p.y, p.rot, p.scale, 1);
        alive++;
      }
      return alive > 0;
    },
    get left() {
      return list.filter(p => !p.loose).length;
    },
    get removed() {
      return removed;
    },
    dispose() {
      for (const p of list) {
        ALL.delete(p);
        if (!p.gone) p.sprite.dispose();
      }
      shared.dispose();
    }
  };
}
