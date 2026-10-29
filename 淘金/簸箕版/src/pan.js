/* 淘金 · 簸箕版 · 淘洗模拟（纯逻辑，不依赖 three）。
   沙子是簸箕里的一张高度场；水面始终是水平的——簸箕往前倾，水就涌到前口；
   晃得越带劲、水越深，沙子越容易被水带着往低处走，从前口冲出去。金子另算（见 nuggets.js）。 */
import { SandField } from './sandfield.js';
import { BASKET, surfaceY } from './shape.js';

const RATE = 3.8; // 沙子随水走的快慢
const DRY_MOB = 0.4; // 没水的地方，光晃也能挪一点
const WALL = 0.6; // 邻格的底比这里高出 0.6 格以上就算帮子，沙子爬不上去
const INFLOW = 0.004; // 竹筒每秒往簸箕里引多少水（立方米）
const CURRENT = 0.07; // 引水形成的往前口方向的水流（相当于多倾斜一点）

export class PanSim {
  static INFLOW = INFLOW;

  constructor(b = BASKET) {
    this.b = b;
    this.field = new SandField({ x0: -b.W / 2, z0: -b.D / 2, width: b.W, depth: b.D, cell: b.cell, maxH: 0.6 });
    const { nx, nz, cell } = this.field;
    this.nx = nx;
    this.nz = nz;
    this.cell = cell;
    this.X = Float32Array.from({ length: nx }, (_, i) => this.field.x0 + i * cell);
    this.Z = Float32Array.from({ length: nz }, (_, j) => this.field.z0 + j * cell);
    this.S = new Float32Array(nx * nz);
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) this.S[j * nx + i] = surfaceY(this.X[i], this.Z[j], b);
    this.water = new Float32Array(nx * nz);
    this.mob = new Float32Array(nx * nz).fill(1);
    this.delta = new Float32Array(nx * nz);
    this.spillSand = new Float32Array(nx);
    this.spillWater = new Float32Array(nx);
    this.inflow = INFLOW;
    this.waterVol = 0.012;
    this.waterOut = 0;
    this.level = 0;
    this.slope = [0, 0];
  }

  get h() {
    return this.field.h;
  }

  /* 双线性插值：底的高度、沙的厚度、合起来的表面 */
  floorAt(x, z) {
    return surfaceY(x, z, this.b);
  }

  sandAt(x, z) {
    return this.field.heightAt(x, z);
  }

  topAt(x, z) {
    return this.floorAt(x, z) + this.sandAt(x, z);
  }

  /* 水面在簸箕坐标里是一个斜面 y = level - bx·x - bz·z（bx、bz 由簸箕的倾斜算出）；
     找 level 使水的体积不变。顺手算出每格水深和前口溢出的水 */
  computeWater(bx, bz) {
    const { nx, nz, S, X, Z, water } = this;
    const h = this.field.h;
    const area = this.cell * this.cell;
    this.slope[0] = bx;
    this.slope[1] = bz;
    let lo = Infinity;
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) lo = Math.min(lo, S[j * nx + i] + h[j * nx + i] + bx * X[i] + bz * Z[j]);
    let hi = lo + 1.2;
    for (let it = 0; it < 26; it++) {
      const mid = (lo + hi) / 2;
      if (this.volumeAt(mid, bx, bz) < this.waterVol) lo = mid;
      else hi = mid;
    }
    const a = (lo + hi) / 2;
    this.level = a;
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        water[k] = Math.max(0, a - bx * X[i] - bz * Z[j] - S[k] - h[k]);
      }
    }
    const lip = nz - 1;
    for (let i = 0; i < nx; i++) {
      const rim = S[lip * nx + i] + this.b.lipH;
      this.spillWater[i] = Math.max(0, a - bx * X[i] - bz * Z[lip] - rim);
    }
    return a;
  }

  /* 水面定在 a 时簸箕里有多少水 */
  volumeAt(a, bx, bz) {
    const { nx, nz, S, X, Z } = this;
    const h = this.field.h;
    let v = 0;
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const d = a - bx * X[i] - bz * Z[j] - S[j * nx + i] - h[j * nx + i];
        if (d > 0) v += d;
      }
    }
    return v * this.cell * this.cell;
  }

  /* 这个倾斜下最多能盛多少水：水面碰到前口最低的那一点为止 */
  capacity(bx, bz) {
    const { nx, nz, S, X, Z } = this;
    const lip = nz - 1;
    let a = Infinity;
    for (let i = 0; i < nx; i++) a = Math.min(a, S[lip * nx + i] + this.b.lipH + bx * X[i] + bz * Z[lip]);
    return this.volumeAt(a, bx, bz);
  }

  /* 某点的水面高度（簸箕坐标） */
  waterY(x, z) {
    return this.level - this.slope[0] * x - this.slope[1] * z;
  }

  /* 晃一下：A = 晃动强度（0 不动），bx/bz = 倾斜；murk = 泥水浑浊度（越浑沙越黏）。返回这一步冲出前口的沙子体积 */
  step(dt, { A = 0, bx = 0, bz = 0, murk = 0 } = {}) {
    this.computeWater(bx, bz);
    /* 竹筒一直往里引水；水面高出前口边沿的部分按堰流漫出去（倾得越厉害漫得越快） */
    let out = 0;
    for (let i = 0; i < this.nx; i++) if (this.spillWater[i] > 0) out += 1.7 * this.spillWater[i] ** 1.5 * this.cell;
    this.waterOut = out;
    this.waterVol = Math.max(0, Math.min(0.08, this.waterVol + (this.inflow - out) * dt));
    this.spillSand.fill(0);
    let spilled = 0;
    /* 竹筒的水一直从后往前流，平端着晃也能把沙往前口带一点 */
    if (A > 0.02) spilled = this.transport(dt, A, -bx, -bz + CURRENT, murk);
    this.relaxTotal(A > 0.15 ? 0.42 : 0.62, 0.5);
    /* 晃起来沙子像液体一样摊开；不晃时只把薄薄一层抹匀（落下的沙粒不会一点一点的），沙堆本身不动 */
    if (A > 0.1) this.smoothTotal(Math.min(0.12, 0.09 * A), Infinity);
    else this.smoothTotal(0.03, 0.02);
    /* 被水泡着的沙是湿的 */
    const { water } = this;
    const wet = this.field.wet;
    for (let k = 0; k < water.length; k++) if (water[k] > 0.003) wet[k] = 1;
    this.field.version++;
    return spilled;
  }

  /* 迎风格式：沙子顺着倾斜方向 (gx, gz) 往低处走，最上面一层先走；从前口那一行再往前就冲出去了 */
  transport(dt, A, gx, gz, murk) {
    const { nx, nz, S, water, mob, delta, cell } = this;
    const h = this.field.h;
    const area = cell * cell;
    const lip = nz - 1;
    delta.fill(0);
    let spilled = 0;
    const sticky = 1 - 0.45 * Math.min(1, murk);
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        if (h[k] <= 1e-6) continue;
        const wetness = Math.min(1, water[k] / 0.03);
        const m = RATE * A * mob[k] * sticky * (DRY_MOB + (1 - DRY_MOB) * wetness);
        const hm = Math.min(h[k], 0.022 + 0.5 * water[k]);
        let fx = Math.max(-0.45, Math.min(0.45, (gx * m * dt) / cell)) * hm;
        let fz = Math.max(-0.45, Math.min(0.45, (gz * m * dt) / cell)) * hm;
        /* 横向：出界或撞上帮子就不走 */
        const ix = fx > 0 ? i + 1 : i - 1;
        if (ix < 0 || ix >= nx || S[j * nx + ix] - S[k] > WALL * cell) fx = 0;
        /* 纵向：往后背走不出界；往前口走、已经在最前一行，就冲出去 */
        let out = 0;
        if (fz > 0 && j === lip) {
          out = fz;
          fz = 0;
        } else {
          const jz = fz > 0 ? j + 1 : j - 1;
          if (jz < 0 || jz >= nz || S[jz * nx + i] - S[k] > WALL * cell) fz = 0;
        }
        const total = Math.abs(fx) + Math.abs(fz) + out;
        if (total <= 0) continue;
        /* 别一次搬走比现有的还多 */
        const scale = total > h[k] ? h[k] / total : 1;
        fx *= scale;
        fz *= scale;
        out *= scale;
        delta[k] -= Math.abs(fx) + Math.abs(fz) + out;
        if (fx) delta[j * nx + (fx > 0 ? i + 1 : i - 1)] += Math.abs(fx);
        if (fz) delta[(fz > 0 ? j + 1 : j - 1) * nx + i] += Math.abs(fz);
        if (out) {
          this.spillSand[i] += out * area;
          spilled += out * area;
        }
      }
    }
    for (let k = 0; k < h.length; k++) h[k] = Math.max(0, h[k] + delta[k]);
    return spilled;
  }

  /* 按休止角坍塌，比较的是“底 + 沙”的总高度，只挪沙子（帮子上的沙会滑到底上） */
  relaxTotal(maxSlope, rate) {
    const { nx, nz, S } = this;
    const h = this.field.h;
    const lim = maxSlope * this.cell;
    const pair = (a, b) => {
      const d = S[a] + h[a] - S[b] - h[b];
      if (d > lim && h[a] > 0) {
        const m = Math.min(h[a], (d - lim) * 0.5 * rate);
        h[a] -= m;
        h[b] += m;
      } else if (d < -lim && h[b] > 0) {
        const m = Math.min(h[b], (-d - lim) * 0.5 * rate);
        h[b] -= m;
        h[a] += m;
      }
    };
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx - 1; i++) pair(j * nx + i, j * nx + i + 1);
    for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx; i++) pair(j * nx + i, (j + 1) * nx + i);
  }

  /* 按总高度差匀一点（体积守恒）；thin = 只动沙比这薄的地方 */
  smoothTotal(rate, thin) {
    const { nx, nz, S } = this;
    const h = this.field.h;
    const pair = (a, b) => {
      if (h[a] > thin && h[b] > thin) return;
      const d = S[a] + h[a] - S[b] - h[b];
      if (d > 0) {
        const m = Math.min(h[a], d * rate * 0.5);
        h[a] -= m;
        h[b] += m;
      } else if (d < 0) {
        const m = Math.min(h[b], -d * rate * 0.5);
        h[b] -= m;
        h[a] += m;
      }
    };
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx - 1; i++) pair(j * nx + i, j * nx + i + 1);
    for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx; i++) pair(j * nx + i, (j + 1) * nx + i);
  }

  total() {
    return this.field.total();
  }

  clear() {
    this.field.clear();
    this.mob.fill(1);
  }
}
