/* 哈气写字："哈～"一团雾从中心长开 → 一根手指在雾上写字（字是透明的，能看到后面）→ 写完字底下挂几颗水珠往下滑
   → 停一会儿 → 慢慢散掉（散掉不算擦）。主播刮掉它算"擦掉了 @小明 的哈气"。 */
import { createSprite } from '../../glass/sprites.js';
import { LAYER } from '../../glass/stage.js';
import { artFog } from '../../art/stains-art.js';
import { drawFinger } from '../../art/paper-art.js';
import { HAND_FONT } from '../../art/ink.js';
import { rng, rand, clamp, easeOutCubic } from '../../util.js';

const BREATH = 0.7;
const EVAP = 4;

export function createFog(game, { x, y, R, text, owner, hold }) {
  const { stage, audio, particles } = game.ctx;
  const u = stage.unit;
  const res = Math.min(2, stage.dpr);
  const art = artFog(rng((Math.random() * 1e9) | 0), R, u, res);
  const stain = game.addStain({ kind: 'fog', label: '哈气', owner, x, y, art, toughness: 1, opacity: 0.92, smear: 0.15, pop: 0 });
  stain.extFade = 0;
  stain.mesh.scale.setScalar(0.7);

  /* 字的镂空模板：和颜色画布一样大，字居中 */
  const cw = art.canvas.width;
  const ch = art.canvas.height;
  const mask = document.createElement('canvas');
  mask.width = cw;
  mask.height = ch;
  const mg = mask.getContext('2d');
  let size = ch * 0.34;
  mg.font = `400 ${size}px ${HAND_FONT}`;
  while (size > 10 && mg.measureText(text).width > cw * 0.78) {
    size -= 2;
    mg.font = `400 ${size}px ${HAND_FONT}`;
  }
  mg.textAlign = 'center';
  mg.textBaseline = 'middle';
  mg.lineJoin = 'round';
  mg.lineWidth = size * 0.07;
  mg.strokeStyle = '#000';
  mg.fillStyle = '#000';
  mg.strokeText(text, cw / 2, ch / 2);
  mg.fillText(text, cw / 2, ch / 2);
  const textW = Math.min(cw * 0.86, mg.measureText(text).width + size * 0.2);
  const x0 = (cw - textW) / 2;
  const writeDur = 0.4 + 0.24 * [...text].length;
  const finger = drawFinger(104 * u, u, res);
  const fsprite = createSprite(stage, finger.canvas, finger.w, finger.h, LAYER.OVERHEAD, { pivot: finger.tip });
  let t = 0;
  let carved = 0;
  let dripped = false;
  let gone = false;
  const drop = () => {
    if (!gone) fsprite.dispose();
    gone = true;
  };
  audio.breath();

  /* 画布像素 → 屏幕：画布的实际倍率（大雾会降分辨率画），中心对齐污渍中心 */
  const ares = cw / art.w;
  const toScreenX = px => x - art.w / 2 + px / ares;
  const toScreenY = py => y - art.h / 2 + py / ares;

  return {
    kind: 'fog',
    owner,
    at: { x, y },
    update(dt) {
      t += dt;
      if (stain.state !== 'live') {
        drop();
        return false;
      }
      if (t < BREATH) {
        const k = easeOutCubic(clamp(t / BREATH, 0, 1));
        stain.extFade = k;
        stain.mesh.scale.setScalar(0.7 + 0.3 * k);
      } else {
        stain.mesh.scale.setScalar(1);
        stain.extFade = Math.max(stain.extFade, 1);
      }
      const wt = t - BREATH * 0.8;
      const p = clamp(wt / writeDur, 0, 1);
      if (wt > 0 && carved < p) {
        const xa = x0 + textW * carved;
        const xb = x0 + textW * p;
        stain.carve(g => {
          g.save();
          g.beginPath();
          g.rect((xa - cw / 2) / stain.cs, -art.h / 2, (xb - xa) / stain.cs + 1 / stain.cs, art.h);
          g.clip();
          /* 先画一圈水痕边（比镂空宽一点），再把字镂空：剩下字外面一圈细线，浅底深底都看得清 */
          g.globalCompositeOperation = 'source-over';
          g.font = `400 ${size / stain.cs}px ${HAND_FONT}`;
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.lineJoin = 'round';
          g.lineWidth = (size * 0.07 + Math.max(3, size * 0.055)) / stain.cs;
          g.strokeStyle = 'rgba(104,140,164,.8)';
          g.strokeText(text, 0, 0);
          g.globalCompositeOperation = 'destination-out';
          g.drawImage(mask, -art.w / 2, -art.h / 2, art.w, art.h);
          g.restore();
        });
        carved = p;
      }
      /* 手指：写字时跟着笔尖走，写完抬起来淡出 */
      if (wt > -0.2 && wt < writeDur + 0.5) {
        const head = x0 + textW * p;
        const wob = Math.sin(p * Math.PI * [...text].length * 1.3) * size * 0.16;
        const fx = toScreenX(head);
        const fy = toScreenY(ch / 2 + wob);
        const lift = wt > writeDur ? clamp((wt - writeDur) / 0.5, 0, 1) : 0;
        fsprite.set(fx + lift * 30 * u, fy - lift * 40 * u, 0, 1, (wt < 0 ? clamp((wt + 0.2) / 0.2, 0, 1) : 1) * (1 - lift));
      } else fsprite.set(0, 0, 0, 1, 0);
      if (!dripped && wt > writeDur) {
        dripped = true;
        for (let i = 0; i < 3; i++) {
          const px = x0 + textW * rand(0.1, 0.9);
          particles.bead(toScreenX(px), toScreenY(ch / 2 + size * 0.42), rand(5, 8));
        }
      }
      /* 停够时间就慢慢散掉，不算擦 */
      const end = BREATH + writeDur + hold;
      if (t > end) {
        stain.extFade = Math.max(0, 1 - (t - end) / EVAP);
        if (stain.extFade <= 0) {
          game.takeAway(stain);
          drop();
          return false;
        }
      }
      return true;
    },
    dispose() {
      drop();
    }
  };
}
