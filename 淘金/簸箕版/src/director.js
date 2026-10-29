/* 淘金 3D · 互动排队（纯逻辑）：先来先上；捣乱之间至少隔 minGapMs，加矿不受间隔限制；
   场上容不下的（比如麻袋太多、小偷已经两个）先等着，但不挡后面能上的 */
export class Director {
  constructor() {
    this.queue = [];
    this.last = -Infinity;
  }

  /* 返回 'ok' 或 'full' */
  push(spec, settings) {
    if (!spec) return 'full';
    if (this.queue.length >= settings.limits.queueMax) return 'full';
    this.queue.push(spec);
    return 'ok';
  }

  /* now 以秒计；canRun(spec) 由场上状态决定 */
  next(now, settings, canRun) {
    const gap = settings.limits.minGapMs / 1000;
    for (let i = 0; i < this.queue.length; i++) {
      const s = this.queue[i];
      const troll = s.action !== 'ore';
      if (troll && now - this.last < gap) continue;
      if (!canRun(s)) continue;
      this.queue.splice(i, 1);
      if (troll) this.last = now;
      return s;
    }
    return null;
  }

  get size() {
    return this.queue.length;
  }

  clear() {
    this.queue.length = 0;
  }
}
