/* 擦玻璃 · 陈年污垢的账本（纯逻辑，不碰画布）。
   玻璃上单独的脏东西太多时，最早的会"沉"进几张整屏分块的污垢层里（样子不变、照样能刮），
   这里给沉下去的每块记一条：谁的、什么、算多少"脏"（area）。
   某一格污垢被刮掉多少脏，就攒进那一格的池子；攒够最早那条的量就算那条擦完（先进先出）。
   一整格擦干净时，格里剩下的都算擦完（flush）；整格被拿走（撕膜、看不见）时不算（drop）。 */

/* 一条擦掉多少才算完：和单块的"剩 6% 算擦完"一致 */
const DONE_SHARE = 0.94;

export class GrimeLedger {
  constructor() {
    this.cells = new Map();
    this.byOwner = new Map();
    this.total = 0;
    this.seq = 0;
  }

  get size() {
    return this.total;
  }

  /* rec: { key（观众标识，'' 表示没主）, tagged（算不算"主块"）, area, ...随便带的展示信息 } */
  add(cellId, rec) {
    let c = this.cells.get(cellId);
    if (!c) {
      c = { queue: [], pool: 0 };
      this.cells.set(cellId, c);
    }
    /* 格里本来没账：之前刮掉的不能算到新来的头上 */
    if (!c.queue.length) c.pool = 0;
    const r = { ...rec, area: Math.max(1, Number(rec.area) || 0), seq: ++this.seq };
    c.queue.push(r);
    this.total++;
    this.bump(r, 1);
    return r;
  }

  /* 这一格被刮掉了 amount 的脏：返回因此擦完的那些条（先进先出） */
  cleaned(cellId, amount) {
    const c = this.cells.get(cellId);
    if (!c || !(amount > 0) || !c.queue.length) return [];
    c.pool += amount;
    const done = [];
    while (c.queue.length && c.pool >= c.queue[0].area * DONE_SHARE) {
      const r = c.queue.shift();
      c.pool = Math.max(0, c.pool - r.area * DONE_SHARE);
      this.total--;
      this.bump(r, -1);
      done.push(r);
    }
    if (!c.queue.length) c.pool = 0;
    return done;
  }

  /* 整格擦干净了：剩下的全算擦完 */
  flush(cellId) {
    const c = this.cells.get(cellId);
    if (!c) return [];
    this.cells.delete(cellId);
    for (const r of c.queue) {
      this.total--;
      this.bump(r, -1);
    }
    return c.queue;
  }

  /* 整格被拿走（不算谁擦的）：返回丢掉的条数 */
  drop(cellId) {
    return this.flush(cellId).length;
  }

  /* 玻璃上的总数超了上限：丢掉全场最早的一条（画面不变，只是不再记它） */
  dropOldest() {
    let best = null;
    for (const c of this.cells.values()) {
      if (c.queue.length && (!best || c.queue[0].seq < best.queue[0].seq)) best = c;
    }
    if (!best) return null;
    const r = best.queue.shift();
    if (!best.queue.length) best.pool = 0;
    this.total--;
    this.bump(r, -1);
    return r;
  }

  /* 某个观众沉在污垢里、还没擦掉的"主块"条数 */
  ownerCount(key) {
    return key ? this.byOwner.get(key) || 0 : 0;
  }

  clear() {
    this.cells.clear();
    this.byOwner.clear();
    this.total = 0;
  }

  bump(r, d) {
    if (!r.key || !r.tagged) return;
    const n = (this.byOwner.get(r.key) || 0) + d;
    if (n > 0) this.byOwner.set(r.key, n);
    else this.byOwner.delete(r.key);
  }
}
