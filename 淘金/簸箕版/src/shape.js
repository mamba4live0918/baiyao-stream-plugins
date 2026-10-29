/* 淘金 · 簸箕版 · 簸箕的形状（纯函数，不依赖 three）。
   簸箕自己的坐标：x 横向（左右），z 前后——z = +D/2 是敞开的前口（朝镜头），z = -D/2 是后背；y 向上。
   底是浅浅的一个凹，往后微微抬高（水会积在前半边）；后背和两边的帮子从前往后越来越高。 */

export const BASKET = Object.freeze({
  W: 1.9, // 宽（米）
  D: 1.5, // 深（前口到后背）
  cell: 0.03, // 沙子格子
  backH: 0.42, // 后背高
  lipH: 0.035 // 前口边沿比底高多少
});

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smoothstep = (a, b, t) => {
  const k = clamp((t - a) / (b - a), 0, 1);
  return k * k * (3 - 2 * k);
};

/* (u, v)：u 横向 -1~1，v 从前口 0 到后背 1 */
export function surfaceUV(u, v, b = BASKET) {
  const back = b.backH * Math.pow(smoothstep(0.55, 1, v), 1.6);
  const sideH = 0.03 + 0.34 * v;
  const side = sideH * Math.pow(smoothstep(0.62, 1, Math.abs(u)), 1.5);
  const dish = 0.03 * u * u + 0.025 * v;
  /* 后背和两边的帮子在角上取“平滑的较大值”（p 范数），角不会翘成两只耳朵，底上也不会凭空抬高 */
  const hmax = Math.cbrt(back ** 3 + side ** 3);
  return dish + hmax;
}

export const toUV = (x, z, b = BASKET) => [clamp((2 * x) / b.W, -1, 1), clamp((b.D / 2 - z) / b.D, 0, 1)];

/* 簸箕内表面在 (x, z) 处的高度 */
export function surfaceY(x, z, b = BASKET) {
  const [u, v] = toUV(x, z, b);
  return surfaceUV(u, v, b);
}

/* 是不是在簸箕里面（留一点边） */
export const insideBasket = (x, z, margin = 0, b = BASKET) => Math.abs(x) <= b.W / 2 - margin && Math.abs(z) <= b.D / 2 - margin;

/* 适合放东西的“底”：离后背和两边的高帮远一点 */
export function floorSpot(rand, b = BASKET) {
  return { x: (rand() * 2 - 1) * b.W * 0.3, z: b.D / 2 - (0.3 + rand() * 0.42) * b.D };
}
