/* 壁虎：肚皮贴着玻璃从边上爬进来，在露脸区外到处爬、时不时停一下挡视线；待够时间自己爬走。
   点它 → 吓得飞快窜走，有几率断尾：尾巴粘在玻璃上扭来扭去，刮一下或点一下就弹下去。 */
import { createSprite } from '../../glass/sprites.js';
import { LAYER } from '../../glass/stage.js';
import { drawGecko, drawTail } from '../../art/critters-art.js';
import { createDebris } from './debris.js';
import { rand, clamp, angleDiff, follow, chance } from '../../util.js';

const PHASES = 8;

function edgePoint(stage, margin) {
  const side = Math.floor(Math.random() * 3);
  if (side === 0) return { x: -margin, y: rand(0.3, 0.9) * stage.H };
  if (side === 1) return { x: stage.W + margin, y: rand(0.3, 0.9) * stage.H };
  return { x: rand(0.1, 0.9) * stage.W, y: stage.H + margin };
}

function createTail(game, { x, y, rot, owner }) {
  const { stage, audio, particles } = game.ctx;
  const u = stage.unit;
  const res = Math.min(2, stage.dpr);
  const len = 70 * u;
  const frames = [-1, -0.5, 0, 0.5, 1, 0.5, 0, -0.5].map(w => drawTail(len, w, u, res));
  const sprite = createSprite(stage, frames[0].canvas, frames[0].w, frames[0].h, LAYER.ACTOR - 5);
  let t = 0;
  let gone = false;
  function flick(dx, dy) {
    if (gone) return;
    gone = true;
    audio.pop();
    game.addActor(createDebris(game, { art: frames[2], x, y, vx: dx * 500 * u, vy: dy * 500 * u - 200 * u, rot, vr: rand(-10, 10), g: 1800, life: 1.6 }));
    game.credit('壁虎尾巴', owner, x, y, `擦掉了 @${owner.name} 的壁虎尾巴`);
  }
  return {
    kind: 'tail',
    owner,
    hit(px, py) {
      if (gone || Math.hypot(px - x, py - y) > len * 0.6) return null;
      return { click: () => flick(0, -1) };
    },
    onWipe(pts, width) {
      if (gone) return 0;
      const a = pts[0];
      const b = pts[pts.length - 1];
      const vx = b.x - a.x;
      const vy = b.y - a.y;
      const L = Math.hypot(vx, vy) || 1;
      const k = clamp(((x - a.x) * vx + (y - a.y) * vy) / (L * L), 0, 1);
      if (Math.hypot(a.x + vx * k - x, a.y + vy * k - y) > width / 2 + len * 0.3) return 0;
      flick(vx / L, vy / L);
      particles.sparkle(x, y, 3, 30);
      return 1;
    },
    update(dt) {
      t += dt;
      if (gone) return false;
      /* 刚断的时候扭得欢，慢慢就不动了 */
      const speed = t < 6 ? 14 : t < 12 ? 5 : 0;
      const f = frames[Math.floor(t * speed) % frames.length];
      sprite.swap(f.canvas);
      sprite.set(x, y, rot, 1, 1);
      return true;
    },
    dispose() {
      sprite.dispose();
    }
  };
}

export function createGecko(game, { owner, stay, tailChance }) {
  const { stage, audio, glare, hud, particles } = game.ctx;
  const u = stage.unit;
  const res = Math.min(2, stage.dpr);
  const size = 185 * u;
  const frames = Array.from({ length: PHASES }, (_, i) => drawGecko(size, i / PHASES, u, res));
  let stubby = null;
  const f0 = frames[0];
  const sprite = createSprite(stage, f0.canvas, f0.w, f0.h, LAYER.ACTOR + 20, { pivot: [0, f0.pivotY + size * 0.05] });
  const tag = game.ctx.labels.add(`@${owner.name} 的壁虎`, '');
  const start = edgePoint(stage, size);
  let x = start.x;
  let y = start.y;
  let rot = 0;
  let t = 0;
  let walked = 0;
  let pause = 0;
  let state = 'roam';
  let goal = null;
  let hasTail = true;
  const speed0 = 110 * u;

  function pickGoal() {
    goal = game.place(size * 1.0, { prefer: { x: rand(0.1, 0.9) * stage.W, y: rand(0.2, 0.9) * stage.H }, margin: size * 0.4, overlap: 0 });
    if (!goal) goal = { x: stage.W * 0.5, y: stage.H * 0.85 };
  }
  pickGoal();

  /* 离开：挑最近、且直线过去不穿过露脸区的那条边 */
  function exitGoal() {
    const cands = [{ x: -size, y }, { x: stage.W + size, y }, { x, y: stage.H + size }];
    cands.sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y));
    const clear = c => {
      for (let i = 1; i < 10; i++) {
        const k = i / 10;
        if (game.inZone(x + (c.x - x) * k, y + (c.y - y) * k, size * 0.6)) return false;
      }
      return true;
    };
    return cands.find(clear) || cands[0];
  }

  return {
    kind: 'gecko',
    owner,
    get at() {
      return { x, y };
    },
    hit(px, py) {
      if (state === 'flee' || Math.hypot(px - x, py - y) > size * 0.45) return null;
      return {
        click() {
          state = 'flee';
          goal = exitGoal();
          audio.knock();
          glare.tap(px, py);
          particles.sparkle(x, y, 4, 40);
          const tx = x - Math.sin(rot) * size * 0.55;
          const ty = y + Math.cos(rot) * size * 0.55;
          /* 尾巴会粘在玻璃上：落点压到露脸区就不断尾 */
          if (hasTail && chance(tailChance) && !game.inZone(tx, ty, size * 0.5)) {
            hasTail = false;
            stubby = Array.from({ length: PHASES }, (_, i) => drawGecko(size, i / PHASES, u, res, false));
            game.addActor(createTail(game, { x: tx, y: ty, rot: rot + Math.PI / 2, owner }));
            hud.toast(`@${owner.name} 的壁虎吓得断了尾巴！`, 'catch');
          } else hud.toast(`白曜赶走了 @${owner.name} 的壁虎`, 'catch');
        }
      };
    },
    update(dt) {
      t += dt;
      if (state === 'roam' && t > stay) {
        state = 'leave';
        goal = exitGoal();
      }
      let moving = false;
      if (pause > 0) pause -= dt;
      else {
        const sp = state === 'flee' ? speed0 * 4.2 : state === 'leave' ? speed0 * 1.4 : speed0;
        const dx = goal.x - x;
        const dy = goal.y - y;
        const d = Math.hypot(dx, dy);
        if (d < 8 * u) {
          if (state === 'roam') {
            pause = rand(0.8, 2.6);
            pickGoal();
          } else return false;
        } else {
          const want = Math.atan2(dy, dx) + Math.PI / 2;
          rot += angleDiff(rot, want) * follow(state === 'flee' ? 14 : 6, dt);
          const step = Math.min(d, sp * dt);
          /* 朝着头的方向爬（转弯时走得慢一点） */
          const ahead = Math.cos(angleDiff(rot, want));
          const s = step * clamp(ahead, 0.25, 1);
          const nx = x + Math.sin(rot) * s;
          const ny = y - Math.cos(rot) * s;
          if (state === 'roam' && game.inZone(nx, ny, size * 0.95)) pickGoal();
          else {
            x = nx;
            y = ny;
            walked += s;
            moving = true;
          }
        }
      }
      const phase = Math.floor((walked / (size * 0.35)) * PHASES) % PHASES;
      const f = (stubby || frames)[moving ? phase : 0];
      sprite.swap(f.canvas);
      sprite.set(x, y, rot, 1, 1);
      tag.set(x, y - size * 0.62, state === 'flee' ? 0 : 1);
      return x > -size * 2 && x < stage.W + size * 2 && y < stage.H + size * 2;
    },
    dispose() {
      sprite.dispose();
      tag.remove();
    }
  };
}
