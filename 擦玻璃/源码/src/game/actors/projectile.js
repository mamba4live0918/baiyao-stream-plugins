/* 飞来砸玻璃的东西（鸡蛋、奶茶、泥球）：可选的落点准星预警（带名字，点中能接住）→ 翻滚飞行（越飞越大，像朝镜头扔过来）→ 落地回调。
   接住：准星期间或飞行途中点中 → 反方向飞回去，「白曜回敬 @A」。 */
import { createSprite } from '../../glass/sprites.js';
import { LAYER } from '../../glass/stage.js';
import { drawReticle } from '../../art/props-art.js';
import { lerp, rand, clamp, easeInCubic, easeOutBack, TAU } from '../../util.js';

/* 从画面下沿或左右两侧外面飞进来（观众在玻璃前面扔） */
export function launchPoint(stage, to) {
  const W = stage.W;
  const H = stage.H;
  const side = Math.random();
  if (side < 0.5) return { x: clamp(to.x + rand(-0.35, 0.35) * W, -0.05 * W, 1.05 * W), y: H + 90 * stage.unit };
  const left = to.x > W / 2 ? side < 0.75 : side >= 0.75;
  return { x: left ? -90 * stage.unit : W + 90 * stage.unit, y: clamp(to.y + rand(-0.2, 0.25) * H, 0.2 * H, 0.95 * H) };
}

export function createProjectile(game, o) {
  const { stage, labels, audio, particles } = game.ctx;
  const u = stage.unit;
  const sprite = createSprite(stage, o.art.canvas, o.art.w, o.art.h, LAYER.ACTOR + 50);
  const from = o.from || launchPoint(stage, o.to);
  const to = o.to;
  const warn = o.warn || 0;
  const dur = o.dur ?? 0.6;
  const spin = (o.spin ?? 7) * (Math.random() < 0.5 ? -1 : 1);
  const arc = (o.arc ?? 170) * u;
  let reticle = null;
  let tag = null;
  if (warn > 0) {
    const r = drawReticle((o.reticleSize ?? 120) * u, o.color || '#ff5d73', Math.min(2, stage.dpr));
    reticle = createSprite(stage, r.canvas, r.w, r.h, LAYER.OVERHEAD);
    if (o.owner && o.owner.name) tag = labels.add(`@${o.owner.name} 的${o.what || ''}`, 'reticle');
  }
  let t = -(o.delay || 0);
  let rot = rand(0, TAU);
  let caught = false;
  let catchAt = null;
  let trailT = 0;
  let back = 0;
  let done = false;
  sprite.set(from.x, from.y, rot, 0, 0);

  function pos(k) {
    return { x: lerp(from.x, to.x, k), y: lerp(from.y, to.y, k) - Math.sin(Math.PI * k) * arc };
  }
  function clickable(x, y) {
    if (caught || done || !o.catchable || t < 0) return false;
    const R = (o.reticleSize ?? 120) * u * 0.62;
    if (t < warn && Math.hypot(x - to.x, y - to.y) < R) return true;
    if (t >= warn) {
      const p = pos(clamp((t - warn) / dur, 0, 1));
      return Math.hypot(x - p.x, y - p.y) < Math.max(o.art.w, o.art.h) * 0.7;
    }
    return false;
  }

  const actor = {
    kind: 'projectile',
    owner: o.owner,
    at: to,
    /* 还在飞：算进这个观众的同时上限 */
    pending: true,
    hit(x, y) {
      if (!clickable(x, y)) return null;
      return {
        click() {
          caught = true;
          actor.pending = false;
          back = 0;
          catchAt = t < warn ? { x: to.x, y: to.y } : pos(clamp((t - warn) / dur, 0, 1));
          audio.catchIt();
          game.ctx.glare.tap(x, y);
          if (o.onCatch) o.onCatch();
        }
      };
    },
    update(dt) {
      t += dt;
      if (t < 0) {
        sprite.set(from.x, from.y, rot, 0, 0);
        if (reticle) reticle.set(to.x, to.y, 0, 0, 0);
        if (tag) tag.set(to.x, to.y, 0);
        return true;
      }
      if (reticle) {
        const k = clamp(t / Math.max(0.2, warn), 0, 1);
        const vis = caught ? Math.max(0, 1 - back * 4) : t < warn + dur ? 1 : 0;
        const pulse = 1 + 0.06 * Math.sin(t * 14);
        reticle.set(to.x, to.y, t * 0.8, (0.55 + 0.45 * easeOutBack(Math.min(1, k * 2.2))) * pulse, vis * 0.95);
        if (tag) tag.set(to.x, to.y + (o.reticleSize ?? 120) * u * 0.62, vis);
      }
      if (caught) {
        /* 接住：在接住的位置停一下，然后旋转着飞回扔来的方向 */
        back += dt;
        const k = clamp(back / 0.55, 0, 1);
        const x = lerp(catchAt.x, from.x, easeInCubic(k));
        const y = lerp(catchAt.y, from.y, easeInCubic(k)) - Math.sin(Math.PI * k) * arc * 0.6;
        rot -= spin * dt * 1.6;
        sprite.set(x, y, rot, lerp(1.15, 0.5, k), 1 - k * 0.3);
        if (k >= 1) return false;
        return true;
      }
      if (t < warn) {
        sprite.set(from.x, from.y, rot, 0, 0);
        return true;
      }
      const k = clamp((t - warn) / dur, 0, 1);
      const p = pos(k);
      rot += spin * dt;
      sprite.set(p.x, p.y, rot, lerp(o.s0 ?? 0.6, o.s1 ?? 1.35, easeInCubic(k)), 1);
      trailT -= dt;
      if (o.trail !== undefined && trailT <= 0 && k < 0.95) {
        trailT = 0.035;
        particles.emit({ frame: o.trail, x: p.x + rand(-6, 6) * u, y: p.y + rand(-6, 6) * u, vx: rand(-40, 40) * u, vy: rand(-20, 30) * u, g: 900 * u, size: rand(8, 14) * u, life: 0.4, rot: rand(0, TAU) });
      }
      if (k >= 1 && !done) {
        done = true;
        actor.pending = false;
        if (o.onLand) o.onLand(to.x, to.y);
        return false;
      }
      return true;
    },
    dispose() {
      sprite.dispose();
      if (reticle) reticle.dispose();
      if (tag) tag.remove();
    }
  };
  return actor;
}
