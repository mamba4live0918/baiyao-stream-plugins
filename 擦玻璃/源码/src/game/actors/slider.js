/* 往下滑的一团（蛋黄、茶滴）：带着一块 Stain 慢慢往下走（越走越慢、走走停停），边走边在下面的"痕迹"块上画。
   被刮掉一半、走到露脸区边上、走够长度，就停下。痕迹也是一块能刮的脏东西（不挂名字）。 */
import { trailBoard } from '../../art/stains-art.js';
import { LAYER } from '../../glass/stage.js';
import { rand, clamp, TAU } from '../../util.js';

/* 最后那点慢慢爬的劲儿，按这个时间常数（秒）慢慢消掉 */
const CREEP = 14;

export function createSlider(game, o) {
  const { stage } = game.ctx;
  const u = stage.unit;
  const r = o.r;
  const maxLen = o.maxLen;
  const res = Math.min(2, stage.dpr);
  const tw = r * 2.6;
  const th = maxLen + r * 2.4;
  const board = trailBoard(tw, th, res);
  const trail = game.addStain({
    kind: o.kind + '-trail',
    label: o.trailLabel,
    owner: o.owner,
    tag: false,
    x: o.x,
    y: o.y + th / 2 - r * 1.2,
    art: { canvas: board.canvas, w: tw, h: th },
    toughness: o.trailTough ?? 1,
    opacity: o.trailOpacity ?? 0.85,
    smear: 0.5,
    pop: 0,
    layer: LAYER.STAIN - 90
  });
  trail.growing = true;
  const blob = o.blob || null;
  /* 滑着的那一团还在被挪动，别沉进陈年污垢 */
  if (blob) blob.pinned = true;
  let x = o.x;
  let y = o.y;
  let t = 0;
  let pause = rand(0.15, 0.5);
  let moving = true;
  let traveled = 0;
  let paintedY = y - 1e9;
  const phase = rand(0, 6.28);

  function paint() {
    const ly = y - trail.y;
    const lx = x - trail.x;
    const k = 0.44 + 0.12 * Math.sin(traveled / (r * 1.9) + phase);
    trail.paint((g, forMask) => {
      g.beginPath();
      g.ellipse(lx, ly, r * k, r * 0.62, 0, 0, TAU);
      g.fillStyle = forMask ? '#fff' : o.color;
      g.fill();
      if (!forMask && o.shine) {
        g.beginPath();
        g.ellipse(lx - r * 0.2, ly, r * 0.1, r * 0.4, 0, 0, TAU);
        g.fillStyle = o.shine;
        g.fill();
      }
    });
    paintedY = y;
  }

  return {
    kind: 'slider',
    update(dt) {
      t += dt;
      if (moving) {
        pause -= dt;
        const blobGone = blob && (blob.state !== 'live' || blob.remaining < 0.5);
        if (blobGone || traveled >= maxLen) moving = false;
        else if (pause <= 0) {
          /* 越走越慢：最后那点慢慢爬的劲儿十几秒里也慢慢没了，慢到几乎不动就停（不然要爬一分多钟、一直重画） */
          const v = (o.speed * Math.exp(-(o.decay ?? 0.35) * t) + (o.minSpeed ?? 6) * Math.exp(-t / CREEP)) * u;
          const ny = y + v * dt;
          if (v < 0.8 * u || game.inZone(x, ny + r, r * 0.8) || ny > stage.H - r) moving = false;
          else {
            y = ny;
            x += Math.sin(t * 1.6 + phase) * 0.25 * u;
            traveled += v * dt;
            if (blob) blob.moveTo(x, y);
            /* 每走 4 像素盖一个印子（印子本身十几像素宽，看不出一节一节；少传几次贴图） */
            if (y - paintedY > 4 * u) paint();
            if (Math.random() < dt * (o.stopRate ?? 0.6)) pause = rand(0.2, 0.9);
          }
        }
      }
      if (!moving) {
        trail.growing = false;
        if (blob) blob.pinned = false;
      }
      /* 痕迹从来没画上就收掉；痕迹和团都没了就结束 */
      if (!moving && paintedY < -1e8 && trail.state === 'live') game.takeAway(trail);
      const trailDone = trail.state !== 'live';
      const blobDone = !blob || blob.state !== 'live';
      return !(trailDone && blobDone && !moving) && t < 600;
    },
    stop() {
      moving = false;
    },
    get age() {
      return t;
    }
  };
}

export const SLIDER_COLORS = Object.freeze({
  yolk: { color: '#ffcf55', shine: 'rgba(255,240,190,.95)' },
  tea: { color: '#c99662', shine: 'rgba(236,204,166,.9)' },
  mud: { color: '#8b5a34', shine: null },
  poop: { color: '#ecebdf', shine: 'rgba(255,255,255,.9)' }
});

export { clamp };
