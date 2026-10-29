/* 一块脏东西：颜色画布（画一次，流痕/写字会继续往上画）+ 擦除遮罩（alpha = 剩余量）+ 一个四边形。
   刮擦 = 在遮罩上用"梳齿"粗线 destination-out；硬的污渍每遍只去掉一部分，梳齿强弱不一，自然留下顺着刮的方向的刮痕。
   剩余量 = Σ(遮罩 × 颜色不透明度) / Σ(颜色不透明度)，在遮罩分辨率上算，只给最近刮过的块算。 */
import * as THREE from 'three';
import { clamp, hash1, easeOutBack } from '../util.js';
import { passStrength } from './wipe-math.js';
import { zoneDist } from '../zone.js';
import { canvasTexture, LAYER } from './stage.js';
import { createStainMaterial } from './stain-material.js';

const MASK_MAX = 288;
const TEETH = 9;
const DONE_AT = 0.06;
let order = 0;
let scratchCanvas = null;
/* 算权重用的临时画布：全局一张，反复用 */
const scratch = () => scratchCanvas || (scratchCanvas = document.createElement('canvas'));

export { passStrength };

export class Stain {
  /* o: { kind, label, owner, x, y, rot, art:{canvas,w,h}, toughness, opacity, smear, pop, layer } */
  constructor(stage, o) {
    this.stage = stage;
    this.kind = o.kind;
    this.label = o.label || '';
    this.owner = o.owner || null;
    this.x = o.x;
    this.y = o.y;
    this.rot = o.rot || 0;
    this.w = o.art.w;
    this.h = o.art.h;
    this.toughness = o.toughness ?? 1;
    this.counts = o.counts !== false;
    this.color = o.art.canvas;
    this.colorG = this.color.getContext('2d');
    this.cs = this.color.width / this.w;
    const ms = Math.min(o.maskRes ?? 0.75, MASK_MAX / Math.max(this.w, this.h));
    this.ms = ms;
    this.mask = document.createElement('canvas');
    this.mask.width = Math.max(8, Math.ceil(this.w * ms));
    this.mask.height = Math.max(8, Math.ceil(this.h * ms));
    this.maskG = this.mask.getContext('2d', { willReadFrequently: true });
    this.maskG.fillStyle = '#fff';
    this.maskG.fillRect(0, 0, this.mask.width, this.mask.height);
    this.mapTex = canvasTexture(this.color);
    this.maskTex = canvasTexture(this.mask);
    this.material = createStainMaterial(stage, this.mapTex, this.maskTex, { opacity: o.opacity ?? 1, smear: o.smear ?? 0.6 });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(this.w, this.h), this.material);
    this.mesh.renderOrder = (o.layer ?? LAYER.STAIN) + (++order % 1300) * 0.5;
    stage.place(this.mesh, this.x, this.y);
    this.mesh.rotation.z = -this.rot;
    stage.pane.add(this.mesh);
    this.weight = null;
    this.weightSum = 0;
    this.weightDirty = true;
    this.remaining = 1;
    this.coverDirty = false;
    this.lastTouch = -1;
    this.lastMeasure = 0;
    this.state = 'live';
    this.age = 0;
    this.pop = o.pop ?? 0.16;
    this.fade = 1;
    this.extFade = 1;
    this.radius = 0.5 * Math.hypot(this.w, this.h);
    this.tags = o.tags || {};
    if (this.pop > 0) this.mesh.scale.setScalar(0.4);
  }

  /* 整块挪位置（往下滑的蛋黄）：遮罩跟着一起走 */
  moveTo(x, y) {
    this.x = x;
    this.y = y;
    this.stage.place(this.mesh, x, y);
    this.weightDirty = true;
  }

  /* 屏幕坐标 → 本块未旋转的局部坐标（中心为原点） */
  local(x, y) {
    const dx = x - this.x;
    const dy = y - this.y;
    const c = Math.cos(this.rot);
    const s = Math.sin(this.rot);
    return [dx * c + dy * s, -dx * s + dy * c];
  }

  contains(x, y, pad = 0) {
    const [lx, ly] = this.local(x, y);
    return Math.abs(lx) <= this.w / 2 + pad && Math.abs(ly) <= this.h / 2 + pad;
  }

  /* 线段（带半宽）是否可能碰到本块 */
  near(x0, y0, x1, y1, half) {
    const vx = x1 - x0;
    const vy = y1 - y0;
    const l2 = vx * vx + vy * vy;
    const t = l2 > 0 ? clamp(((this.x - x0) * vx + (this.y - y0) * vy) / l2, 0, 1) : 0;
    const px = x0 + vx * t - this.x;
    const py = y0 + vy * t - this.y;
    return px * px + py * py < (this.radius + half) ** 2;
  }

  /* 一"遍"= 同一个方向刮过去的那一段（回头刮、抬手再按都算新的一遍）。
     遍内每帧的擦除先用 lighter 累加在 pass 画布上（相邻两帧的接缝抗锯齿各一半，正好凑满，不会留细线），
     然后遮罩 = 这一遍开始时的遮罩 ×（1 − 累加覆盖）。
     pts：屏幕坐标折线；width：刮条宽（像素）；strength：工具强度倍数；seed：本遍的随机种子（刮痕位置）；passId：第几遍 */
  erase(pts, width, strength, seed, now, passId = 0) {
    if (this.state !== 'live' || pts.length < 2) return false;
    const ms = this.ms;
    const mw = this.mask.width;
    const mh = this.mask.height;
    const ox = mw / 2;
    const oy = mh / 2;
    const L = pts.map(p => {
      const [lx, ly] = this.local(p.x, p.y);
      return [lx * ms + ox, ly * ms + oy];
    });
    /* 这一帧刮到的范围（遮罩像素）：只重算这一小块，满屏叠着几百块时刮起来也不卡 */
    const halfBand = width * ms * 0.56 + 4;
    let bx0 = Infinity;
    let by0 = Infinity;
    let bx1 = -Infinity;
    let by1 = -Infinity;
    for (const [x, y] of L) {
      bx0 = Math.min(bx0, x);
      by0 = Math.min(by0, y);
      bx1 = Math.max(bx1, x);
      by1 = Math.max(by1, y);
    }
    bx0 = Math.max(0, Math.floor(bx0 - halfBand));
    by0 = Math.max(0, Math.floor(by0 - halfBand));
    bx1 = Math.min(mw, Math.ceil(bx1 + halfBand));
    by1 = Math.min(mh, Math.ceil(by1 + halfBand));
    if (bx1 <= bx0 || by1 <= by0) return false;
    if (!this.passG || this.passId !== passId) this.beginPass(passId);
    const g = this.passG;
    const n = L.length;
    const normals = L.map((_, i) => {
      const a = L[Math.max(0, i - 1)];
      const b = L[Math.min(n - 1, i + 1)];
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const len = Math.hypot(dx, dy) || 1;
      return [-dy / len, dx / len];
    });
    const base = passStrength(this.toughness) * strength;
    const tough = this.toughness > 1;
    const span = width * ms;
    const tooth = (span / TEETH) * 1.5;
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.lineCap = 'butt';
    g.lineJoin = 'round';
    for (let k = 0; k < TEETH; k++) {
      const off = (k / (TEETH - 1) - 0.5) * span * (1 - 1 / TEETH);
      const a = tough ? clamp(base * (0.8 + 0.2 * hash1(seed * 31 + k * 7 + this.mask.width)), 0, 1) : clamp(base, 0, 1);
      g.strokeStyle = `rgba(255,255,255,${a.toFixed(3)})`;
      g.lineWidth = tooth;
      g.beginPath();
      for (let i = 0; i < n; i++) {
        const x = L[i][0] + normals[i][0] * off;
        const y = L[i][1] + normals[i][1] * off;
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
    }
    g.restore();
    /* 遮罩 = 这一遍开始时的遮罩 ×（1 − 累加覆盖）：只在刮到的那一块里重算（别处的累加这一帧没变） */
    const m = this.maskG;
    const bw = bx1 - bx0;
    const bh = by1 - by0;
    m.save();
    m.beginPath();
    m.rect(bx0, by0, bw, bh);
    m.clip();
    m.globalCompositeOperation = 'copy';
    m.drawImage(this.baseC, bx0, by0, bw, bh, bx0, by0, bw, bh);
    m.globalCompositeOperation = 'destination-out';
    m.drawImage(this.passC, bx0, by0, bw, bh, bx0, by0, bw, bh);
    m.restore();
    this.maskTex.needsUpdate = true;
    this.coverDirty = true;
    this.lastTouch = now;
    return true;
  }

  /* 新的一遍：把当前遮罩记成起点，清空累加 */
  beginPass(passId) {
    const mw = this.mask.width;
    const mh = this.mask.height;
    if (!this.passC) {
      this.passC = document.createElement('canvas');
      this.passC.width = mw;
      this.passC.height = mh;
      this.passG = this.passC.getContext('2d', { willReadFrequently: true });
      this.baseC = document.createElement('canvas');
      this.baseC.width = mw;
      this.baseC.height = mh;
      this.baseG = this.baseC.getContext('2d', { willReadFrequently: true });
    }
    this.passG.clearRect(0, 0, mw, mh);
    this.baseG.save();
    this.baseG.globalCompositeOperation = 'copy';
    this.baseG.drawImage(this.mask, 0, 0);
    this.baseG.restore();
    this.passId = passId;
  }

  /* 一阵子没人刮了：把两张临时画布还掉（下次刮会重新从当前遮罩开始） */
  dropPass() {
    this.passC = this.passG = this.baseC = this.baseG = null;
    this.passId = null;
  }

  /* 往本块上继续画（流痕、写字等）。fn(g, forMask)：forMask 时请用不透明白色画同样的形状，等于"新弄脏" */
  paint(fn, { mask = true } = {}) {
    const g = this.colorG;
    g.save();
    g.setTransform(this.cs, 0, 0, this.cs, this.color.width / 2, this.color.height / 2);
    fn(g, false);
    g.restore();
    if (mask) {
      const m = this.maskG;
      m.save();
      m.setTransform(this.ms, 0, 0, this.ms, this.mask.width / 2, this.mask.height / 2);
      m.fillStyle = '#fff';
      m.strokeStyle = '#fff';
      fn(m, true);
      m.restore();
      if (this.baseG) {
        const b = this.baseG;
        b.save();
        b.setTransform(this.ms, 0, 0, this.ms, this.mask.width / 2, this.mask.height / 2);
        b.fillStyle = '#fff';
        b.strokeStyle = '#fff';
        fn(b, true);
        b.restore();
        const q = this.passG;
        q.save();
        q.setTransform(this.ms, 0, 0, this.ms, this.mask.width / 2, this.mask.height / 2);
        q.globalCompositeOperation = 'destination-out';
        q.fillStyle = '#fff';
        q.strokeStyle = '#fff';
        fn(q, true);
        q.restore();
      }
      this.maskTex.needsUpdate = true;
    }
    this.mapTex.needsUpdate = true;
    /* 只标记"权重要重算"；剩余量等真被刮到的时候再算（往下流的痕迹每帧都在画，别每次都读像素） */
    this.weightDirty = true;
    if (this.lastTouch >= 0) this.coverDirty = true;
  }

  /* 直接在颜色画布上镂空（哈气写字用），不动遮罩 */
  carve(fn) {
    const g = this.colorG;
    g.save();
    g.setTransform(this.cs, 0, 0, this.cs, this.color.width / 2, this.color.height / 2);
    g.globalCompositeOperation = 'destination-out';
    fn(g);
    g.restore();
    this.mapTex.needsUpdate = true;
    this.weightDirty = true;
    if (this.lastTouch >= 0) this.coverDirty = true;
  }

  /* 权重 = 每个遮罩像素上颜色有多不透明；画面外、露脸区里的部分看不见也擦不着，不算（不然永远擦不完） */
  computeWeight() {
    this.weight = new Uint8Array(this.mask.width * this.mask.height);
    this.weightSum = 0;
    this.weightRect(0, 0, this.mask.width, this.mask.height);
    this.weightDirty = false;
  }

  /* 只重算遮罩矩形 [x0,x1)×[y0,y1) 里的权重，总数跟着增减（沉淀污垢往一格里画了新东西时用） */
  weightRect(x0, y0, x1, y1) {
    const mw = this.mask.width;
    const mh = this.mask.height;
    x0 = Math.max(0, Math.floor(x0));
    y0 = Math.max(0, Math.floor(y0));
    x1 = Math.min(mw, Math.ceil(x1));
    y1 = Math.min(mh, Math.ceil(y1));
    const bw = x1 - x0;
    const bh = y1 - y0;
    if (bw <= 0 || bh <= 0) return;
    const t = scratch();
    if (t.width < bw || t.height < bh) {
      t.width = Math.max(t.width, bw);
      t.height = Math.max(t.height, bh);
    }
    const tg = t.getContext('2d', { willReadFrequently: true });
    tg.clearRect(0, 0, bw, bh);
    const fx = this.color.width / mw;
    const fy = this.color.height / mh;
    tg.drawImage(this.color, x0 * fx, y0 * fy, bw * fx, bh * fy, 0, 0, bw, bh);
    const d = tg.getImageData(0, 0, bw, bh).data;
    const w = this.weight;
    const st = this.stage;
    const zr = st.zone;
    const ms = this.ms;
    const c = Math.cos(this.rot);
    const sn = Math.sin(this.rot);
    const W = st.W;
    const H = st.H;
    const F2 = zr ? zr.feather / 2 : 0;
    /* 一个遮罩像素（相对这一片的 xx, yy）在不在画面里、离露脸区多远 → 权重 */
    const exact = (xx, yy, a) => {
      const lx = (x0 + xx + 0.5 - mw / 2) / ms;
      const ly = (y0 + yy + 0.5 - mh / 2) / ms;
      const sx = this.x + lx * c - ly * sn;
      const sy = this.y + lx * sn + ly * c;
      if (sx < 0 || sy < 0 || sx > W || sy > H) return 0;
      if (!zr) return a;
      /* 羽化边里面那半圈几乎看不见，只算外面半圈（机器人也正好擦到这里） */
      const k = zoneDist(zr, sx, sy) / F2;
      if (k <= 0) return 0;
      return k < 1 ? Math.round(a * k * k * (3 - 2 * k)) : a;
    };
    /* 按 8×8 小格判断：整格都在画面里、离露脸区够远就直接照抄透明度；整格在区里就是 0；只有压在边上的小格逐像素算。
       遮罩尺寸是向上取整的，画面边上留 3 像素余量 */
    const B = 8;
    const hb = (B / ms) * 0.7072;
    let sum = 0;
    for (let by = 0; by < bh; by += B) {
      const ey = Math.min(bh, by + B);
      for (let bx = 0; bx < bw; bx += B) {
        const ex = Math.min(bw, bx + B);
        const lx = (x0 + (bx + ex) / 2 - mw / 2) / ms;
        const ly = (y0 + (by + ey) / 2 - mh / 2) / ms;
        const cx = this.x + lx * c - ly * sn;
        const cy = this.y + lx * sn + ly * c;
        const onScreen = cx - hb >= -3 && cy - hb >= -3 && cx + hb <= W + 3 && cy + hb <= H + 3;
        const dz = zr ? zoneDist(zr, cx, cy) : Infinity;
        /* mode：1 = 照抄，0 = 全是 0，2 = 逐像素 */
        const mode = dz + hb <= 0 ? 0 : onScreen && dz - hb >= F2 ? 1 : 2;
        for (let yy = by; yy < ey; yy++) {
          const row = (y0 + yy) * mw + x0;
          const drow = yy * bw;
          for (let xx = bx; xx < ex; xx++) {
            const i = row + xx;
            sum -= w[i];
            const a = d[(drow + xx) * 4 + 3];
            const v = !a || mode === 0 ? 0 : mode === 1 ? a : exact(xx, yy, a);
            w[i] = v;
            sum += v;
          }
        }
      }
    }
    this.weightSum += sum;
  }

  /* 遮罩矩形里还剩多少"脏"（遮罩 × 权重 / 255），沉淀污垢记账用 */
  regionDirt(x0, y0, x1, y1) {
    if (this.weightDirty || !this.weight) this.computeWeight();
    const mw = this.mask.width;
    x0 = Math.max(0, Math.floor(x0));
    y0 = Math.max(0, Math.floor(y0));
    x1 = Math.min(mw, Math.ceil(x1));
    y1 = Math.min(this.mask.height, Math.ceil(y1));
    const bw = x1 - x0;
    const bh = y1 - y0;
    if (bw <= 0 || bh <= 0) return 0;
    const d = this.maskG.getImageData(x0, y0, bw, bh).data;
    const w = this.weight;
    let sum = 0;
    for (let yy = 0; yy < bh; yy++) {
      const row = (y0 + yy) * mw + x0;
      for (let xx = 0; xx < bw; xx++) {
        const wi = w[row + xx];
        if (wi) sum += d[(yy * bw + xx) * 4 + 3] * wi;
      }
    }
    return sum / 255;
  }

  measure() {
    if (this.weightDirty || !this.weight) this.computeWeight();
    if (!this.weightSum) {
      /* 还没画上东西（刚开始流的痕迹）先不算；整块都在画面外/露脸区里的，标成"看不见"，由游戏悄悄收走（不算谁擦的） */
      this.remaining = 1;
      this.hidden = !this.growing;
      this.dirtBox = null;
      this.coverDirty = false;
      return 1;
    }
    this.hidden = false;
    const mw = this.mask.width;
    const d = this.maskG.getImageData(0, 0, mw, this.mask.height).data;
    const w = this.weight;
    let sum = 0;
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -1;
    let y1 = -1;
    for (let i = 0, j = 3; i < w.length; i++, j += 4) {
      if (!w[i]) continue;
      const v = d[j] * w[i];
      sum += v;
      /* 顺便记下"还剩东西"的范围，机器人照着这个去擦 */
      if (v > 1600) {
        const x = i % mw;
        const y = (i / mw) | 0;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
    this.remaining = sum / (255 * this.weightSum);
    this.dirtBox = x1 >= 0 ? this.maskBoxToScreen(x0, y0, x1 + 1, y1 + 1) : null;
    this.coverDirty = false;
    if (this.onMeasure) this.onMeasure(this);
    return this.remaining;
  }

  /* 遮罩像素里的矩形 → 屏幕上的外接矩形（考虑旋转） */
  maskBoxToScreen(x0, y0, x1, y1) {
    const ms = this.ms;
    const ox = this.mask.width / 2;
    const oy = this.mask.height / 2;
    const c = Math.cos(this.rot);
    const sn = Math.sin(this.rot);
    let a = Infinity;
    let b = Infinity;
    let e = -Infinity;
    let f = -Infinity;
    for (const [mx, my] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) {
      const lx = (mx - ox) / ms;
      const ly = (my - oy) / ms;
      const sx = this.x + lx * c - ly * sn;
      const sy = this.y + lx * sn + ly * c;
      a = Math.min(a, sx);
      b = Math.min(b, sy);
      e = Math.max(e, sx);
      f = Math.max(f, sy);
    }
    return { x0: a, y0: b, x1: e, y1: f };
  }

  /* 每帧：出场弹一下、擦完淡出；返回 false 表示可以移除了 */
  update(dt, now) {
    this.age += dt;
    if (this.pop > 0) {
      if (this.age < this.pop * 1.6) {
        const t = clamp(this.age / this.pop, 0, 1);
        this.mesh.scale.setScalar(0.4 + 0.6 * easeOutBack(t, 2.2));
      } else if (this.state === 'live') this.mesh.scale.setScalar(1);
    }
    if (this.passC && now - this.lastTouch > 1.5) this.dropPass();
    if (this.state === 'live' && this.coverDirty && now - this.lastMeasure > 0.14) {
      this.lastMeasure = now;
      this.measure();
    }
    if (this.state === 'done') {
      this.fade = Math.max(0, this.fade - dt / 0.3);
      this.mesh.scale.setScalar(1 + (1 - this.fade) * 0.05);
      if (this.fade <= 0) return false;
    }
    this.material.uniforms.uFade.value = this.fade * this.extFade;
    return true;
  }

  get isClean() {
    if (this.state !== 'live') return false;
    return this.doneTest ? this.doneTest() : this.remaining <= DONE_AT;
  }

  finish() {
    if (this.state !== 'live') return;
    this.state = 'done';
  }

  /* 立刻拿走（撕膜带走、重开清空） */
  dispose() {
    this.stage.pane.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.mapTex.dispose();
    this.maskTex.dispose();
    this.state = 'gone';
  }
}
