/* 擦玻璃 · 通用小工具（纯函数，测试可直接载入） */
export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (a, b) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
export const pick = arr => arr[Math.floor(Math.random() * arr.length)];
export const chance = p => Math.random() < p;
export const easeOutCubic = t => 1 - (1 - t) ** 3;
export const easeInCubic = t => t * t * t;
export const easeInOut = t => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
export const easeOutBack = (t, s = 1.70158) => 1 + (s + 1) * (t - 1) ** 3 + s * (t - 1) ** 2;
/* 帧率无关的平滑跟随系数：rate 越大跟得越紧 */
export const follow = (rate, dt) => 1 - Math.exp(-rate * dt);

/* 0..1 的整数哈希，同样的输入永远得到同样的结果（刮痕、颗粒都靠它，避免每帧闪烁） */
export function hash1(n) {
  let x = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967295;
}

/* 可复现的随机数（造型用）：同一个种子画出同一块污渍 */
export function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* 最短角度差（-π..π） */
export function angleDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

/* 刮条朝向：取与当前角度最接近的、垂直于运动方向的角（模 π），来回刷时不会 180° 翻面 */
export function bladeAngleFor(current, vx, vy) {
  const base = Math.atan2(vy, vx) + Math.PI / 2;
  const d = angleDiff(current, base);
  const alt = d > Math.PI / 2 ? base - Math.PI : d < -Math.PI / 2 ? base + Math.PI : base;
  return current + angleDiff(current, alt);
}

export const fmtCount = n => (n >= 10000 ? (n / 10000).toFixed(1).replace(/\.0$/, '') + '万' : String(n));

/* 刮"遍"的编号：回头刮（和这一遍开头的方向比，转过去一百多度）或抬手再按就算新的一遍。
   刮水器跟手有平滑，掉头是一段弧，所以要和这一遍开头的方向比，不能和上一帧比。编号全局唯一，不同工具不会撞号 */
let passSeq = 0;
export function passTracker() {
  let id = ++passSeq;
  let ref = null;
  return {
    get id() {
      return id;
    },
    next(dx, dy) {
      const l = Math.hypot(dx, dy);
      if (l < 1.5) return id;
      const nx = dx / l;
      const ny = dy / l;
      if (!ref) ref = [nx, ny];
      else if (nx * ref[0] + ny * ref[1] < -0.2) {
        id = ++passSeq;
        ref = [nx, ny];
      }
      return id;
    },
    reset() {
      id = ++passSeq;
      ref = null;
    }
  };
}
