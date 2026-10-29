/* 平时慢慢落灰：玻璃快擦干净、又没人送礼的时候，隔一阵在露脸区外落一小片灰尘/干掉的水渍圈，随时有东西可以顺手擦。
   礼物多、玻璃上已经有东西的时候不落。设置里四档：关 / 少 / 正常 / 多。灰尘不挂名字，擦掉照样"叮"、照样计数。 */
import { artDust } from '../art/stains-art.js';
import { P } from '../glass/particles.js';
import { rng, rand } from '../util.js';

/* 玻璃上（不算灰）不超过这么多块，才算"快擦干净了" */
const QUIET = 2;

export function createAmbient(game, getSettings) {
  let next = rand(6, 12);
  return {
    tick(dt) {
      const d = getSettings().play.dust;
      if (!d || !d.enabled) return;
      next -= dt;
      if (next > 0) return;
      next = (60 / Math.max(0.2, d.perMin)) * rand(0.6, 1.4);
      /* 玻璃上除了灰还有不少东西（礼物砸的）：这次不落 */
      if (game.messCount(true) > QUIET) return;
      game.spawnDust(d.max);
    }
  };
}

/* 落一片灰（也给试玩按钮用） */
export function spawnDust(game, max = 99) {
  const { stage, particles } = game.ctx;
  if (game.liveStains().filter(s => s.kind === 'dust').length >= max) return null;
  const u = stage.unit;
  const size = rand(170, 280) * u;
  const at = game.place(size * 0.5, { margin: 6 * u });
  if (!at) return null;
  const s = game.addStain({ kind: 'dust', label: '灰尘', owner: null, x: at.x, y: at.y, art: artDust(rng((Math.random() * 1e9) | 0), size, u, Math.min(2, stage.dpr)), toughness: 1, opacity: 0.95, smear: 0.3, pop: 0.3 });
  for (let i = 0; i < 4; i++) particles.emit({ frame: P.PUFF, x: at.x + rand(-0.3, 0.3) * size, y: at.y + rand(-0.3, 0.3) * size, vx: rand(-30, 30) * u, vy: rand(-40, -10) * u, size: rand(40, 70) * u, size1: rand(70, 110) * u, life: 0.9, alpha: 0.5 });
  return s;
}
