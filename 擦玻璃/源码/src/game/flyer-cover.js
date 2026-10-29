/* 小广告一层层叠着贴。整张都被上面"贴平了"的纸盖住的那张：看不见、也抓不到，就让它睡——
   不画、不占贴图内存，只留位置和长相的种子；上面那张一被揭起、撕烂或撕掉，露出哪怕一角，它就照原样醒过来。
   这样贴几千张，真正在画的只有看得见的那些；而每一张看得见的，都得顺着撕下来（不会变成能直接刮掉的旧广告）。

   "整张被盖住"：它纸面上（连胶带、影子）一圈和里面均匀取的点，每个都落在上面某张贴平了的纸里
   （纸边一圈、圆角、翘起来的那个角不算）。睡下去时记下是哪几张盖住了它（每个点记离它最近的那张）；
   以后只有这几张动了才回头再看它——所以纸再多，每次也只看动了的那张底下那几张。

   纸（f）要提供：z（越大越在上面，这里分配：setZ）、box（纸、胶带和影子的屏幕外框）、
   covers(x, y)（这个点是不是被它贴平的部分盖着）、everySample(fn)（把要检查的点一个个交给 fn，
   fn 返回 false 就停下并返回 false）、canSleep、sleep()、wake()。 */

const CELL = 64;
/* z 用到这么大就从 1 重新排一遍（先后顺序不变）：层级 = LAYER.FLYER + z × 步长，不能挤出小广告那一层 */
export const MAX_Z = 400000;

const overlaps = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

export function createFlyerCover({ view = null, cell = CELL, maxZ = MAX_Z } = {}) {
  /* 屏幕分格 → 外框压到这一格的纸（按 z 从下到上） */
  const grid = new Map();
  /* 所有纸（从下到上）、醒着的纸 */
  const all = [];
  const awake = new Set();
  /* 睡着的纸 → 盖住它的那几张；纸 → 靠它盖住的那些睡着的纸 */
  const cert = new Map();
  const deps = new Map();
  let zSeq = 0;
  /* 上次看到的画面大小（画面变大时，原来伸出画面的那截可能露出来） */
  let seen = null;
  /* 醒着的纸上次露着的那个点：下次先看它还露不露（多半还露着，就不用整张再看一遍） */
  const witness = new Map();

  const key = (cx, cy) => (cx + 4096) * 16384 + (cy + 4096);

  function eachCell(b, fn) {
    const c0 = Math.floor(b.x0 / cell);
    const c1 = Math.floor(b.x1 / cell);
    const r0 = Math.floor(b.y0 / cell);
    const r1 = Math.floor(b.y1 / cell);
    for (let c = c0; c <= c1; c++) for (let r = r0; r <= r1; r++) fn(key(c, r));
  }

  /* 比 z 高的纸里，离它最近、贴平盖住 (x, y) 的那张 */
  function coverAbove(z, x, y) {
    const list = grid.get(key(Math.floor(x / cell), Math.floor(y / cell)));
    if (!list) return null;
    let lo = 0;
    let hi = list.length;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (list[m].z <= z) lo = m + 1;
      else hi = m;
    }
    for (let i = lo; i < list.length; i++) if (list[i].covers(x, y)) return list[i];
    return null;
  }

  const offView = (v, x, y) => v && (x < 0 || y < 0 || x > v.W || y > v.H);

  /* 整张都被盖住：返回盖住它的那几张；有一个点露着就返回 null，并记下那个点（画面外的点不用盖） */
  function coverOf(f) {
    const v = view ? view() : null;
    const by = new Set();
    let hole = null;
    /* 挨着的点多半被同一张盖着：先问上一个点的那张，问不着再去格子里找 */
    let last = null;
    const ok = f.everySample((x, y) => {
      if (offView(v, x, y)) return true;
      if (last && last.covers(x, y)) return true;
      const h = coverAbove(f.z, x, y);
      if (!h) {
        hole = [x, y];
        return false;
      }
      by.add(h);
      last = h;
      return true;
    });
    if (ok) {
      witness.delete(f);
      return by;
    }
    witness.set(f, hole);
    return null;
  }

  /* 上次露着的点还露着吗 */
  function stillShows(f) {
    const w = witness.get(f);
    if (!w) return false;
    const v = view ? view() : null;
    return !offView(v, w[0], w[1]) && !coverAbove(f.z, w[0], w[1]);
  }

  function link(f, by) {
    cert.set(f, by);
    for (const h of by) {
      let s = deps.get(h);
      if (!s) deps.set(h, (s = new Set()));
      s.add(f);
    }
  }

  function unlink(f) {
    const by = cert.get(f);
    if (!by) return;
    cert.delete(f);
    for (const h of by) {
      const s = deps.get(h);
      if (!s) continue;
      s.delete(f);
      if (!s.size) deps.delete(h);
    }
  }

  /* 醒着的 g 整张被盖住了就睡 */
  function tryBury(g) {
    if (stillShows(g)) return;
    const by = coverOf(g);
    if (!by) return;
    link(g, by);
    awake.delete(g);
    g.sleep();
  }

  /* 睡着的 g 重新看一遍：还盖得住就换几张"靠山"，露出来了就醒 */
  function rejudge(g) {
    unlink(g);
    const by = coverOf(g);
    if (by) link(g, by);
    else {
      awake.add(g);
      g.wake();
    }
  }

  /* f 盖得没那么多了：靠它盖住的那几张重新看一遍 */
  function recheck(f) {
    const list = deps.get(f);
    if (!list) return;
    deps.delete(f);
    for (const g of list) rejudge(g);
  }

  const viewNow = () => {
    const v = view ? view() : null;
    return v ? { W: v.W, H: v.H } : null;
  };

  function renumber() {
    for (let i = 0; i < all.length; i++) all[i].setZ(i + 1);
    zSeq = all.length;
  }

  return {
    /* 新贴上来的一张（在最上面；"啪"的时候还没贴平，不盖东西） */
    add(f) {
      if (!seen) seen = viewNow();
      if (zSeq >= maxZ) renumber();
      f.setZ(++zSeq);
      all.push(f);
      awake.add(f);
      eachCell(f.box, k => {
        const l = grid.get(k);
        if (l) l.push(f);
        else grid.set(k, [f]);
      });
    },
    /* f 刚贴平（抹平了、松手弹回去贴好了、撕烂剩下的贴回去了）：它底下醒着的那些也许整张被盖住了；
       它自己也可能整张被盖住（同一帧里上面那张先贴平了，或者它被揭着的时候上面又贴了一张） */
    more(f) {
      for (const g of [...awake]) if (g !== f && g.z < f.z && g.canSleep && overlaps(g.box, f.box)) tryBury(g);
      if (awake.has(f) && f.canSleep) tryBury(f);
    },
    /* f 被揭起来了（或者撕烂了一截）：靠它盖住的重新看 */
    less: recheck,
    /* f 没了（撕下来了、成了碎纸、清空） */
    remove(f) {
      eachCell(f.box, k => {
        const l = grid.get(k);
        if (!l) return;
        const i = l.indexOf(f);
        if (i >= 0) l.splice(i, 1);
        if (!l.length) grid.delete(k);
      });
      const i = all.indexOf(f);
      if (i >= 0) all.splice(i, 1);
      awake.delete(f);
      witness.delete(f);
      unlink(f);
      recheck(f);
    },
    /* 画面大小变了：变大时，睡着的、外框伸出旧画面的重新看（原来在画面外的那截可能露出来了） */
    viewChanged() {
      const old = seen;
      seen = viewNow();
      if (!old || !seen || (seen.W <= old.W && seen.H <= old.H)) return;
      for (const g of [...cert.keys()]) if (g.box.x1 > old.W || g.box.y1 > old.H) rejudge(g);
    },
    clear() {
      grid.clear();
      all.length = 0;
      awake.clear();
      cert.clear();
      deps.clear();
      witness.clear();
      zSeq = 0;
    },
    get size() {
      return all.length;
    },
    get awake() {
      return awake.size;
    },
    get asleep() {
      return all.length - awake.size;
    }
  };
}
