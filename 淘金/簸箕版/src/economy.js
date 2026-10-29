/* 淘金 3D · 金库账本（纯逻辑）：入库记在矿主名下，被偷记在小偷名下，假金扣钱，抓到小偷追回 */
const r2 = v => Math.round(v * 100) / 100;
const KEEP = 500; // 榜单存档最多留多少人（按金额从高到低）
const clean = v => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);

export class Economy {
  constructor() {
    this.gold = 0;
    this.best = 0;
    this.pieces = 0;
    this.owners = new Map();
    this.thieves = new Map();
    this.version = 0;
  }

  /* 一块真金进库 */
  bank(value, owner) {
    const v = r2(clean(value));
    this.gold = r2(this.gold + v);
    this.pieces += 1;
    this.best = Math.max(this.best, v);
    if (owner) this.owners.set(owner, r2((this.owners.get(owner) || 0) + v));
    this.version++;
    return v;
  }

  /* 假金进库被骗：扣一点，不会扣成负数 */
  penalty(amount) {
    const take = r2(Math.min(this.gold, clean(amount)));
    this.gold = r2(this.gold - take);
    this.version++;
    return take;
  }

  /* 小偷按比例偷走（至少偷 0.01，最多偷光） */
  steal(fraction, thief) {
    if (this.gold <= 0) return 0;
    const take = r2(Math.min(this.gold, Math.max(0.01, this.gold * Math.min(1, clean(fraction)))));
    this.gold = r2(this.gold - take);
    if (thief) this.thieves.set(thief, r2((this.thieves.get(thief) || 0) + take));
    this.version++;
    return take;
  }

  /* 抓到小偷：赃物原数退回，大盗榜也扣掉 */
  recover(amount, thief) {
    const v = r2(clean(amount));
    this.gold = r2(this.gold + v);
    if (thief && this.thieves.has(thief)) {
      const left = r2(this.thieves.get(thief) - v);
      if (left > 0) this.thieves.set(thief, left);
      else this.thieves.delete(thief);
    }
    this.version++;
    return v;
  }

  top(map, n = 3) {
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([name, g]) => ({ name, gold: g }));
  }

  export() {
    const top = map => [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, KEEP);
    return { version: 1, gold: this.gold, best: this.best, pieces: this.pieces, owners: top(this.owners), thieves: top(this.thieves) };
  }

  restore(s) {
    if (!s || s.version !== 1) return false;
    this.gold = r2(Math.min(1e9, clean(s.gold)));
    this.best = r2(Math.min(1e9, clean(s.best)));
    this.pieces = Math.floor(Math.min(1e9, clean(s.pieces)));
    const pairs = v =>
      Array.isArray(v)
        ? v
            .filter(p => Array.isArray(p) && typeof p[0] === 'string' && p[0].length <= 40)
            .map(p => [p[0], r2(clean(p[1]))])
            .sort((a, b) => b[1] - a[1])
            .slice(0, KEEP)
        : [];
    this.owners = new Map(pairs(s.owners));
    this.thieves = new Map(pairs(s.thieves));
    this.version++;
    return true;
  }
}
