/* 擦玻璃 · 陈年污垢（沉淀）。
   每块脏东西都有自己的画布，堆到几千块内存会爆。所以玻璃上"单独的块"超过 DETAIL_MAX 时，
   把最早的一块块"沉"进整屏分格（4×3）的污垢层：按它现在看起来的样子画进去，样子不变、照样能刮。
   沉下去的每块在账本里记一条；哪一格被刮掉多少脏就攒多少，攒够一块的量就算那块擦完（叮、计数、算到送的人头上）。
   这样玻璃上能堆成千上万块，内存和刮擦开销却不再涨。
   不沉的：正在往下流/滑的、贴在保护膜上的、刚出现不到 1.5 秒的、正被刮的；哈气本来就会散，挤不下时提前散掉。 */
import { GrimeLedger } from './grime-ledger.js';
import { flattenStain, commitTile } from '../glass/bake.js';
import { LAYER } from '../glass/stage.js';

/* 单独的块最多留多少（再多就沉）。沉下去的刮起来反而省事：一刮只动一两格污垢，不用动几十块叠在一起的画布 */
export const DETAIL_MAX = 100;
/* 沉得跟不上（礼物刷太猛）：单独的块（加上还在飞、还没落下的）超过 DETAIL_MAX + BACKLOG 时，新的捣乱先在队里等一下 */
const BACKLOG = 60;
/* 每帧最多花多少毫秒沉东西（至少沉一块）；积压得多时多花一点 */
const BAKE_MS = 3;
const BAKE_MS_HEAVY = 7;
const COLS = 4;
const ROWS = 3;
let gidSeq = 0;

export function createGrime(game, keyOf) {
  const { stage, names } = game.ctx;
  const ledger = new GrimeLedger();
  let grid = null;
  /* 验收用：沉了多少块、一共花了多少毫秒 */
  const prof = { n: 0, ms: 0, max: 0 };

  /* 当前画面尺寸的分格；画面尺寸变了就另起一套（旧格子照样留在玻璃上能擦，只是不再往里沉） */
  function layout() {
    if (!grid || grid.W !== stage.W || grid.H !== stage.H) grid = { W: stage.W, H: stage.H, tw: stage.W / COLS, th: stage.H / ROWS, tiles: new Array(COLS * ROWS).fill(null) };
    return grid;
  }

  function tileAt(i) {
    const g = layout();
    const old = g.tiles[i];
    if (old && old.state === 'live') return old;
    const c = i % COLS;
    const r = (i / COLS) | 0;
    const res = Math.min(2, stage.dpr);
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(g.tw * res);
    canvas.height = Math.ceil(g.th * res);
    /* 先按"常读写"建上下文：之后 Stain 再取拿到的是同一个（CPU 画布，压平和读像素都快） */
    canvas.getContext('2d', { willReadFrequently: true });
    const t = game.addStain({ kind: 'grime', grime: true, label: '陈年污垢', owner: null, tag: false, counts: false, x: (c + 0.5) * g.tw, y: (r + 0.5) * g.th, art: { canvas, w: g.tw, h: g.th }, toughness: 2, opacity: 1, smear: 0.6, pop: 0, layer: LAYER.STAIN - 1000 });
    t.gid = ++gidSeq;
    /* 整格剩下的脏不到"一小片"（约 30×30 像素那么多）才算擦完：
       用相对比例的话，大块擦掉后一个没碰过的小脚印会跟着整格一起消失 */
    const doneDirt = 0.005 * t.mask.width * t.mask.height * 255;
    t.doneTest = () => t.remaining * t.weightSum <= doneDirt;
    t.committedAt = -1;
    t.bankedTouch = -1;
    t.ldDirt = 0;
    t.onMeasure = bank;
    t.onComplete = tile => game.creditRecords(ledger.flush(tile.gid), tile.lastBy, tile.lastAt);
    t.onTakeAway = tile => ledger.drop(tile.gid);
    g.tiles[i] = t;
    return t;
  }

  /* 一格量过一次：比上次少了多少脏，就是这期间被刮掉的（露脸区变了这种不算） */
  function bank(t) {
    t.bankedTouch = t.lastTouch;
    const d = t.remaining * t.weightSum;
    if (t.resync) {
      t.resync = false;
      t.ldDirt = d;
      return;
    }
    const dec = t.ldDirt - d;
    t.ldDirt = d;
    if (dec > 0) game.creditRecords(ledger.cleaned(t.gid, dec), t.lastBy, t.lastAt);
  }

  /* 屏幕矩形 → 某格遮罩像素矩形 */
  function maskRect(t, x0, y0, x1, y1) {
    const ms = t.ms;
    const ox = t.mask.width / 2;
    const oy = t.mask.height / 2;
    return [(x0 - t.x) * ms + ox - 1, (y0 - t.y) * ms + oy - 1, (x1 - t.x) * ms + ox + 1, (y1 - t.y) * ms + oy + 1];
  }

  /* 把一块沉进污垢层：画进它压到的每一格，账记在压得最多的那一格 */
  function bake(s) {
    const g = layout();
    const c = Math.cos(s.rot);
    const sn = Math.sin(s.rot);
    const ex = Math.abs((s.w / 2) * c) + Math.abs((s.h / 2) * sn);
    const ey = Math.abs((s.w / 2) * sn) + Math.abs((s.h / 2) * c);
    const x0 = Math.max(0, s.x - ex);
    const y0 = Math.max(0, s.y - ey);
    const x1 = Math.min(stage.W, s.x + ex);
    const y1 = Math.min(stage.H, s.y + ey);
    names.detach(s);
    if (x1 <= x0 || y1 <= y0) {
      s.dispose();
      return;
    }
    const img = flattenStain(s);
    const alpha = s.material.uniforms.uOpacity.value;
    let best = null;
    let bestAdd = 0;
    const c0 = Math.floor(x0 / g.tw);
    const c1 = Math.min(COLS - 1, Math.floor((x1 - 0.001) / g.tw));
    const r0 = Math.floor(y0 / g.th);
    const r1 = Math.min(ROWS - 1, Math.floor((y1 - 0.001) / g.th));
    for (let r = r0; r <= r1; r++) {
      for (let col = c0; col <= c1; col++) {
        const t = tileAt(r * COLS + col);
        /* 上次记账以后又被刮过（或露脸区变了）：先量一遍，把刮掉的记上 */
        if (t.weightDirty || t.lastTouch > t.bankedTouch) t.measure();
        /* 这一格被刮过：整格压平、遮罩补满，免得把刮掉的旧污垢"复活" */
        if (t.lastTouch > t.committedAt) {
          if (t.passC) t.dropPass();
          commitTile(t);
          t.committedAt = t.lastTouch;
          t.resync = true;
          t.measure();
        }
        const [mx0, my0, mx1, my1] = maskRect(t, x0, y0, x1, y1);
        const before = t.regionDirt(mx0, my0, mx1, my1);
        const dirt0 = t.remaining * t.weightSum;
        const cg = t.colorG;
        cg.save();
        cg.setTransform(t.cs, 0, 0, t.cs, t.color.width / 2 - t.x * t.cs, t.color.height / 2 - t.y * t.cs);
        cg.translate(s.x, s.y);
        cg.rotate(s.rot);
        cg.globalAlpha = alpha;
        cg.drawImage(img.canvas, 0, 0, img.sw, img.sh, -s.w / 2, -s.h / 2, s.w, s.h);
        cg.restore();
        t.mapTex.needsUpdate = true;
        t.weightRect(mx0, my0, mx1, my1);
        const add = Math.max(0, t.regionDirt(mx0, my0, mx1, my1) - before);
        /* 剩余量和"还剩哪一片"直接算上（不用整格重量），沉下来的脏不算"刮掉"：账上的起点跟着加 */
        t.remaining = t.weightSum > 0 ? Math.min(1, (dirt0 + add) / t.weightSum) : 1;
        const tb = { x0: Math.max(x0, t.x - t.w / 2), y0: Math.max(y0, t.y - t.h / 2), x1: Math.min(x1, t.x + t.w / 2), y1: Math.min(y1, t.y + t.h / 2) };
        t.dirtBox = t.dirtBox ? { x0: Math.min(t.dirtBox.x0, tb.x0), y0: Math.min(t.dirtBox.y0, tb.y0), x1: Math.max(t.dirtBox.x1, tb.x1), y1: Math.max(t.dirtBox.y1, tb.y1) } : tb;
        t.hidden = t.weightSum <= 0;
        t.ldDirt += add;
        if (add > bestAdd) {
          bestAdd = add;
          best = t;
        }
      }
    }
    if (best) ledger.add(best.gid, { key: keyOf(s.owner), tagged: s.tagged, owner: s.owner, label: s.label, kind: s.kind, x: s.x, y: s.y, area: bestAdd });
    s.dispose();
  }

  function detailedLive() {
    let n = 0;
    for (const s of game.stains) if (s.state === 'live' && !s.grime) n++;
    return n;
  }

  /* 哈气要留够时间让手指把字写完、让人看到，才可能提前散 */
  function bakeable(s, now) {
    const age = now - (s.born ?? 0);
    return s.state === 'live' && !s.grime && !s.pinned && !s.growing && !s.onFilm && !s.hidden && (s.extFade ?? 1) >= 0.999 && age > (s.kind === 'fog' ? 8 : 1.5) && !(s.lastTouch >= 0 && now - s.lastTouch < 0.6);
  }

  return {
    /* 每帧：单独的块超了就沉最早的（一帧最多沉 1～2 块，不卡） */
    tick(now) {
      let n = detailedLive();
      if (n <= DETAIL_MAX) return;
      /* 积压得多：滑了一阵还在滑的蛋黄、茶痕先停下（停了才能沉），每帧也多沉几块 */
      const heavy = n > DETAIL_MAX + BACKLOG / 3;
      if (heavy) for (const a of game.actors) if (a.kind === 'slider' && a.age > 2.5) a.stop();
      const budget = heavy ? BAKE_MS_HEAVY : BAKE_MS;
      const start = performance.now();
      let done = 0;
      const list = game.stains.slice();
      for (const s of list) {
        if (n <= DETAIL_MAX || (done && performance.now() - start > budget)) break;
        if (!bakeable(s, now)) continue;
        if (s.kind === 'fog') game.takeAway(s);
        else {
          const t0 = performance.now();
          bake(s);
          const ms = performance.now() - t0;
          prof.n++;
          prof.ms += ms;
          prof.max = Math.max(prof.max, ms);
        }
        n--;
        done++;
      }
    },
    /* 沉得跟不上：新的捣乱先排队 */
    backlog() {
      let incoming = 0;
      for (const a of game.actors) incoming += a.pending ? 2 : a.kind === 'cat' ? 8 : a.kind === 'bird' ? 4 : 0;
      return detailedLive() + incoming > DETAIL_MAX + BACKLOG;
    },
    get size() {
      return ledger.size;
    },
    get prof() {
      return { bakes: prof.n, avgMs: prof.n ? +(prof.ms / prof.n).toFixed(2) : 0, maxMs: +prof.max.toFixed(2) };
    },
    ownerCount(key) {
      return ledger.ownerCount(key);
    },
    dropOldest() {
      return ledger.dropOldest();
    },
    /* 露脸区变了：各格的"看得见的脏"会变，下次量的时候重新对账，不算谁擦的 */
    zoneChanged() {
      for (const s of game.stains) if (s.grime) s.resync = true;
    },
    reset() {
      ledger.clear();
      grid = null;
    }
  };
}
