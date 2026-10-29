/* 小鸟：扑腾着飞来，停在画面上沿（窗框上），冒「？」→「！」，到点就拉一坨在下面的玻璃上；拉够了开心地飞走。
   预警期间点它 → 吓得扑腾飞走，一坨都不拉。 */
import { awayFromFace } from '../actions.js';
import { createSprite } from '../../glass/sprites.js';
import { LAYER } from '../../glass/stage.js';
import { drawBird, } from '../../art/critters-art.js';
import { drawBubble } from '../../art/props-art.js';
import { artPoop } from '../../art/stains-art.js';
import { createSlider, SLIDER_COLORS } from './slider.js';
import { rng, rand, clamp, lerp, easeInOut } from '../../util.js';

export function createBird(game, { owner, poops, warn }) {
  const { stage, audio, glare, hud, particles } = game.ctx;
  const u = stage.unit;
  const res = Math.min(2, stage.dpr);
  const size = 130 * u;
  const frames = { up: drawBird(size, 'up', u, res), down: drawBird(size, 'down', u, res), sit: drawBird(size, 'sit', u, res), poop: drawBird(size, 'poop', u, res) };
  const sprite = createSprite(stage, frames.sit.canvas, frames.sit.w, frames.sit.h, LAYER.ACTOR + 30);
  const qb = drawBubble('？', 46 * u, res);
  const eb = drawBubble('！', 46 * u, res);
  const bubble = createSprite(stage, qb.canvas, qb.w, qb.h, LAYER.OVERHEAD);
  const tag = game.ctx.labels.add(`@${owner.name} 的鸟`, '');
  /* 先定拉屎的落点（露脸区外），鸟就停在它正上方的上沿 */
  const target = game.place(60 * u, { prefer: { x: rand(0.15, 0.85) * stage.W, y: rand(0.22, 0.5) * stage.H }, yMin: 0.16, yMax: 0.62, overlap: 0 }) || { x: stage.W * 0.2, y: stage.H * 0.4 };
  const perch = { x: clamp(target.x, size, stage.W - size), y: size * 0.78 };
  const fromLeft = perch.x > stage.W / 2 ? false : true;
  const start = { x: fromLeft ? -size : stage.W + size, y: rand(0.05, 0.3) * stage.H };
  let state = 'in';
  let t = 0;
  let st = 0;
  let left = clamp(Math.round(poops), 1, 12);
  let flee = null;
  const face = () => (state === 'out' || state === 'scared' ? (fromLeft ? 1 : -1) : fromLeft ? 1 : -1);
  audio.chirp();

  function poop() {
    const big = game.messScale();
    const p = game.place(80 * u * big, { prefer: { x: perch.x + rand(-30, 30) * u, y: target.y + rand(-0.06, 0.06) * stage.H }, yMin: 0.12, yMax: 0.7 });
    if (!p) return;
    audio.plop();
    /* 一小坨先往下掉，到了再"啪" */
    const r = rand(66, 90) * u * big;
    game.later(0.28, () => {
      game.impact(p.x, p.y, 0.75 * big, '噗！');
      audio.splat(0.8);
      const s = game.addStain({ kind: 'poop', label: '鸟屎', owner, x: p.x, y: p.y, art: artPoop(rng((Math.random() * 1e9) | 0), r, u, res, awayFromFace(game, p.x, p.y)), toughness: 2, opacity: 0.97, smear: 0.5 });
      game.addActor(createSlider(game, { kind: 'poop', x: p.x, y: p.y + r * 0.6, r: r * 0.34, maxLen: rand(70, 150) * u * big, speed: 20, decay: 0.5, minSpeed: 3, owner, trailLabel: '鸟屎印', trailTough: 1, ...SLIDER_COLORS.poop }));
      void s;
    });
    const fall = Math.max(0.1, p.y - perch.y - size * 0.3);
    particles.emit({ frame: 4, x: perch.x - size * 0.25 * (fromLeft ? 1 : -1), y: perch.y + size * 0.3, vx: (p.x - perch.x) / 0.28, vy: fall / 0.28 - 0.5 * 1200 * u * 0.28, g: 1200 * u, size: 30 * u, size1: 22 * u, life: 0.28 });
  }

  return {
    kind: 'bird',
    owner,
    get at() {
      return perch;
    },
    hit(px, py) {
      if (state !== 'sit' && state !== 'warn' && state !== 'in') return null;
      const bx = state === 'in' ? null : perch.x;
      if (bx === null) return null;
      if (Math.abs(px - perch.x) > size * 0.7 || Math.abs(py - perch.y) > size * 0.7) return null;
      return {
        click() {
          state = 'scared';
          st = 0;
          flee = { x: perch.x, y: perch.y };
          audio.chirp();
          audio.knock();
          glare.tap(px, py);
          particles.sparkle(perch.x, perch.y, 4, 40);
          hud.toast(`白曜赶走了 @${owner.name} 的小鸟`, 'catch');
        }
      };
    },
    update(dt) {
      t += dt;
      st += dt;
      let x = perch.x;
      let y = perch.y;
      let frame = frames.sit;
      let bub = null;
      const flap = Math.floor(t * 12) % 2 ? frames.up : frames.down;
      if (state === 'in') {
        const k = easeInOut(clamp(st / 1.3, 0, 1));
        x = lerp(start.x, perch.x, k);
        y = lerp(start.y, perch.y, k) - Math.sin(k * Math.PI) * 60 * u;
        frame = flap;
        if (k >= 1) {
          state = 'sit';
          st = 0;
          audio.chirp();
        }
      } else if (state === 'sit') {
        bub = qb;
        if (st > 0.9) {
          state = 'warn';
          st = 0;
        }
      } else if (state === 'warn') {
        bub = eb;
        y += Math.sin(st * 30) * 2 * u;
        if (st > warn) {
          state = 'poop';
          st = 0;
          poop();
          left--;
        }
      } else if (state === 'poop') {
        frame = frames.poop;
        if (st > 0.45) {
          st = 0;
          state = left > 0 ? 'warn' : 'out';
          if (state === 'warn') warn = Math.max(0.7, warn * 0.6);
          else audio.chirp();
        }
      } else if (state === 'out' || state === 'scared') {
        const from = flee || perch;
        const k = clamp(st / (state === 'scared' ? 0.8 : 1.4), 0, 1);
        const dx = fromLeft ? 1 : -1;
        x = from.x + dx * k * stage.W * 0.6;
        y = from.y - Math.sin(k * Math.PI * 0.5) * 120 * u - k * 40 * u;
        frame = Math.floor(t * (state === 'scared' ? 22 : 12)) % 2 ? frames.up : frames.down;
        if (k >= 1 || x < -size * 2 || x > stage.W + size * 2) return false;
      }
      sprite.swap(frame.canvas);
      sprite.set(x, y, 0, 1, 1);
      sprite.scaleXY(face(), 1);
      if (bub) {
        bubble.swap(bub.canvas);
        /* 气泡放在鸟的前上方，贴着画面上沿也不会被切掉 */
        bubble.set(x + size * 0.78 * face(), Math.max(size * 0.42, y - size * 0.55), 0, 1, 1);
      } else bubble.set(0, 0, 0, 1, 0);
      tag.set(x, y + size * 0.62, state === 'out' || state === 'scared' ? 0 : 1);
      return true;
    },
    dispose() {
      sprite.dispose();
      bubble.dispose();
      tag.remove();
    }
  };
}
