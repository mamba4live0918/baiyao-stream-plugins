/* 掉下去的东西（弹开的奶茶杯、撕下来的小广告、被赶跑后掉的东西）：带速度、重力、旋转，出画面就没了。 */
import { createSprite } from '../../glass/sprites.js';
import { LAYER } from '../../glass/stage.js';

export function createDebris(game, { art, x, y, vx, vy, rot = 0, vr = 0, g = 1600, scale = 1, scale1 = null, life = 3, layer = LAYER.ACTOR + 40, fade = 0.5 }) {
  const { stage } = game.ctx;
  const u = stage.unit;
  const sprite = createSprite(stage, art.canvas, art.w, art.h, layer);
  let t = 0;
  return {
    kind: 'debris',
    update(dt) {
      t += dt;
      vy += g * u * dt;
      x += vx * dt;
      y += vy * dt;
      rot += vr * dt;
      const k = Math.min(1, t / life);
      const s = scale1 === null ? scale : scale + (scale1 - scale) * k;
      const a = t > life - fade ? Math.max(0, (life - t) / fade) : 1;
      sprite.set(x, y, rot, s, a);
      return t < life && y < stage.H + Math.max(art.w, art.h) && x > -art.w * 2 && x < stage.W + art.w * 2;
    },
    dispose() {
      sprite.dispose();
    }
  };
}
