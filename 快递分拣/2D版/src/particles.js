/* 粒子（灰尘、彩纸、碎纸、星星）和飞走的封条：只是画面效果，不参与物理。位置用世界坐标（米） */
import { G } from './state.js';
import { rnd } from './util.js';

const CONF = ['#ef6450', '#f2c230', '#3d8fe0', '#ffffff', '#36a86d', '#ff9ec0'];
const MAX_PARTS = 420;
/* kind：dust 灰尘 / conf 彩纸 / shred 碎纸 / star 星星；opt.sp 速度倍数、opt.r 散开范围倍数、opt.s 大小倍数 */
export function burst(kind, p, n, opt = {}) {
  const sp = opt.sp || 1, r = opt.r || 1;
  for (let i = 0; i < n && G.parts.length < MAX_PARTS; i++) {
    const dust = kind === 'dust';
    G.parts.push({
      kind: dust ? 'puff' : kind, x: p.x + rnd(-.35, .35) * r, y: p.y + rnd(-.15, .25),
      vx: rnd(-3, 3) * sp * (dust ? .45 : 1), vy: (dust ? rnd(.4, 1.6) : rnd(2, 6)) * sp,
      rot: rnd(0, Math.PI * 2), vr: rnd(-12, 12), life: 0, max: dust ? rnd(.5, .9) : rnd(.6, 1.1),
      s: (dust ? rnd(.5, .9) : rnd(.8, 1.15)) * (opt.s || 1), color: CONF[i % CONF.length], k: Math.random(),
    });
  }
}
export function updParts(dt) {
  for (let i = G.parts.length - 1; i >= 0; i--) {
    const p = G.parts[i]; p.life += dt;
    if (p.life >= p.max) { G.parts.splice(i, 1); continue; }
    if (p.kind === 'puff') { p.vx *= .93; p.vy *= .93; p.s *= 1 + dt * 1.2; } else p.vy -= 14 * dt;
    p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
  }
}
/* 撕开的封条从桶口飞走 */
export function flyLid(x, y, w) { G.flyers.push({ x, y, w, vx: rnd(-2, 2), vy: 7, rot: 0, vr: rnd(-4, 4), life: 0 }); }
export function updFlyers(dt) {
  for (let i = G.flyers.length - 1; i >= 0; i--) {
    const f = G.flyers[i]; f.life += dt; f.vy -= 20 * dt; f.x += f.vx * dt; f.y += f.vy * dt; f.rot += f.vr * dt;
    if (f.life > 1.6 || f.y < -3) G.flyers.splice(i, 1);
  }
}
