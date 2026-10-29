/* 淘金 3D · 沙面高度场（纯逻辑，不依赖 three）。
   高度 h 以米计，体积 = h × 格子面积。沙子落下来 deposit、鼠标扒开 dig、水冲 wash、按休止角慢慢塌 relax。 */

export class SandField {
  constructor({ x0, z0, width, depth, cell, maxH = 0.95 }) {
    this.x0 = x0;
    this.z0 = z0;
    this.cell = cell;
    this.nx = Math.round(width / cell) + 1;
    this.nz = Math.round(depth / cell) + 1;
    this.width = (this.nx - 1) * cell;
    this.depth = (this.nz - 1) * cell;
    this.maxH = maxH;
    this.h = new Float32Array(this.nx * this.nz);
    this.wet = new Float32Array(this.nx * this.nz);
    this.mud = new Float32Array(this.nx * this.nz);
    this.version = 0;
    this.flip = false;
  }

  get area() {
    return this.cell * this.cell;
  }

  inside(x, z, margin = 0) {
    return x >= this.x0 + margin && x <= this.x0 + this.width - margin && z >= this.z0 + margin && z <= this.z0 + this.depth - margin;
  }

  /* 双线性插值的沙面高度；在格子外按边缘取值 */
  heightAt(x, z) {
    const fx = Math.min(this.nx - 1.0001, Math.max(0, (x - this.x0) / this.cell));
    const fz = Math.min(this.nz - 1.0001, Math.max(0, (z - this.z0) / this.cell));
    const i = Math.floor(fx);
    const j = Math.floor(fz);
    const tx = fx - i;
    const tz = fz - j;
    const n = this.nx;
    const h = this.h;
    const a = h[j * n + i];
    const b = h[j * n + i + 1];
    const c = h[(j + 1) * n + i];
    const d = h[(j + 1) * n + i + 1];
    return (a + (b - a) * tx) * (1 - tz) + (c + (d - c) * tx) * tz;
  }

  /* 对 (x,z) 半径 r（米）内的格子逐个回调：fn(index, 距离/半径) */
  each(x, z, r, fn) {
    const c = this.cell;
    const i0 = Math.max(0, Math.floor((x - r - this.x0) / c));
    const i1 = Math.min(this.nx - 1, Math.ceil((x + r - this.x0) / c));
    const j0 = Math.max(0, Math.floor((z - r - this.z0) / c));
    const j1 = Math.min(this.nz - 1, Math.ceil((z + r - this.z0) / c));
    for (let j = j0; j <= j1; j++) {
      const dz = this.z0 + j * c - z;
      for (let i = i0; i <= i1; i++) {
        const dx = this.x0 + i * c - x;
        const d = Math.sqrt(dx * dx + dz * dz);
        if (d <= r) fn(j * this.nx + i, d / r);
      }
    }
  }

  /* 撒下体积 vol 的沙，按高斯分布在半径 r 内；返回实际落下的体积（超过最高处的部分不收） */
  deposit(x, z, vol, r = 0.12) {
    if (!(vol > 0) || !this.inside(x, z)) return 0;
    const cells = [];
    let sum = 0;
    this.each(x, z, Math.max(r, this.cell * 0.75), (k, t) => {
      const w = Math.exp(-t * t * 3);
      cells.push(k, w);
      sum += w;
    });
    if (!sum) return 0;
    let added = 0;
    const per = vol / (sum * this.area);
    for (let n = 0; n < cells.length; n += 2) {
      const k = cells[n];
      const dh = Math.min(per * cells[n + 1], this.maxH - this.h[k]);
      if (dh > 0) {
        this.h[k] += dh;
        added += dh * this.area;
      }
    }
    if (added > 0) this.version++;
    return added;
  }

  /* 挖掉：中心挖 depth 米，往外平滑减弱；返回挖走的体积 */
  dig(x, z, r, depth) {
    let removed = 0;
    this.each(x, z, r, (k, t) => {
      const take = Math.min(this.h[k], depth * (1 - t * t));
      if (take > 0) {
        this.h[k] -= take;
        removed += take * this.area;
      }
    });
    if (removed > 0) this.version++;
    return removed;
  }

  /* 水冲：和挖一样，同时把沙打湿 */
  wash(x, z, r, depth, wetness = 0.5) {
    this.each(x, z, r, (k, t) => {
      this.wet[k] = Math.min(1, this.wet[k] + wetness * (1 - t));
      this.mud[k] *= 0.9;
    });
    return this.dig(x, z, r, depth);
  }

  /* 只打湿，不挖（涨水的浪、泥水） */
  wetten(x, z, r, amount) {
    this.each(x, z, r, (k, t) => {
      this.wet[k] = Math.min(1, this.wet[k] + amount * (1 - t));
    });
    this.version++;
  }

  /* 泥巴糊上去（捣乱） */
  smear(x, z, r, amount) {
    this.each(x, z, r, (k, t) => {
      this.mud[k] = Math.min(1, this.mud[k] + amount * (1 - t * t));
    });
    this.version++;
  }

  /* 按休止角坍塌：相邻格高差超过 maxSlope×格宽 就往低处匀一点；返回本次移动的体积 */
  relax(maxSlope = 0.65, rate = 0.5) {
    const lim = maxSlope * this.cell;
    const h = this.h;
    const n = this.nx;
    let moved = 0;
    const pair = (a, b) => {
      const d = h[a] - h[b];
      if (d > lim) {
        const m = (d - lim) * 0.5 * rate;
        h[a] -= m;
        h[b] += m;
        moved += m;
      } else if (d < -lim) {
        const m = (-d - lim) * 0.5 * rate;
        h[b] -= m;
        h[a] += m;
        moved += m;
      }
    };
    this.flip = !this.flip;
    if (this.flip) {
      for (let j = 0; j < this.nz; j++) for (let i = 0; i < n - 1; i++) pair(j * n + i, j * n + i + 1);
      for (let j = 0; j < this.nz - 1; j++) for (let i = 0; i < n; i++) pair(j * n + i, (j + 1) * n + i);
    } else {
      for (let j = this.nz - 1; j >= 0; j--) for (let i = n - 2; i >= 0; i--) pair(j * n + i, j * n + i + 1);
      for (let j = this.nz - 2; j >= 0; j--) for (let i = n - 1; i >= 0; i--) pair(j * n + i, (j + 1) * n + i);
    }
    if (moved > 1e-7) this.version++;
    return moved * this.area;
  }

  /* 轻微扩散：抹平细碎的小鼓包（体积守恒），让沙面像真的沙一样柔和 */
  diffuse(rate = 0.08) {
    const h = this.h;
    const n = this.nx;
    let moved = 0;
    const pair = (a, b) => {
      const m = (h[a] - h[b]) * rate * 0.5;
      if (m > 0 ? h[a] < m : h[b] < -m) return;
      h[a] -= m;
      h[b] += m;
      moved += Math.abs(m);
    };
    for (let j = 0; j < this.nz; j++) for (let i = 0; i < n - 1; i++) pair(j * n + i, j * n + i + 1);
    for (let j = 0; j < this.nz - 1; j++) for (let i = 0; i < n; i++) pair(j * n + i, (j + 1) * n + i);
    if (moved > 1e-7) this.version++;
    return moved * this.area;
  }

  /* 湿沙慢慢变干、泥巴慢慢淡 */
  dry(dt, wetTau = 8, mudTau = 40) {
    const kw = Math.exp(-dt / wetTau);
    const km = Math.exp(-dt / mudTau);
    for (let k = 0; k < this.wet.length; k++) {
      this.wet[k] *= kw;
      this.mud[k] *= km;
    }
  }

  total() {
    let s = 0;
    for (let k = 0; k < this.h.length; k++) s += this.h[k];
    return s * this.area;
  }

  clear() {
    this.h.fill(0);
    this.wet.fill(0);
    this.mud.fill(0);
    this.version++;
  }
}
