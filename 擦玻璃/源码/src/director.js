/* 擦玻璃 · 互动排队（纯逻辑）：先来先上；捣乱之间至少隔 minGapMs（默认 0 = 不留间隔，一帧放一条）；
   帮忙（机器人、保护膜）不受间隔限制；场上容不下的先等着，但不挡后面能上的。
   排队默认不限条数；主播在设置里填了"排队最多"（queueMax > 0）才会满。 */
import { isHelp } from './config.js';

export class Director {
  constructor() {
    this.queue = [];
    this.last = -Infinity;
  }

  /* 返回 'ok'、'full'（排满了）；spec 无效时返回 'bad' */
  push(spec, settings) {
    if (!spec) return 'bad';
    const max = settings && settings.limits ? settings.limits.queueMax : 0;
    if (max > 0 && this.queue.length >= max) return 'full';
    this.queue.push(spec);
    return 'ok';
  }

  /* now 以秒计；canRun(spec) 由场上状态决定 */
  next(now, settings, canRun) {
    const gap = settings.limits.minGapMs / 1000;
    for (let i = 0; i < this.queue.length; i++) {
      const s = this.queue[i];
      const mess = !isHelp(s.action);
      if (mess && now - this.last < gap) continue;
      if (!canRun(s)) continue;
      this.queue.splice(i, 1);
      if (mess) this.last = now;
      return s;
    }
    return null;
  }

  get size() {
    return this.queue.length;
  }

  /* 排了 ttlSec 秒还上不去的丢掉（只管 which(spec) 为真的，比如小动物一直满员），返回丢掉的条数 */
  prune(now, ttlSec, which = () => true) {
    const before = this.queue.length;
    this.queue = this.queue.filter(s => !(typeof s.queuedAt === 'number' && now - s.queuedAt > ttlSec && which(s)));
    return before - this.queue.length;
  }

  clear() {
    this.queue.length = 0;
  }
}
