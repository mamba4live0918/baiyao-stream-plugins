/* 淘金 · 簸箕版 · 摆放（米）。没有场景：画面里只有一只簸箕，右边浮着“淘到的金子”数字牌。 */
import { BASKET } from './shape.js';

/* 簸箕平时的位置和姿态：前口朝镜头，几乎端平 */
export const BASKET_REST = { x: 0, y: 0.35, z: 0, pitch: 0.03 };
export const SWAY = { x: 0.6, pitchMax: 0.42, pitchMin: -0.06 };

/* 金子飞去的地方：簸箕右边，数字牌就挂在这里 */
export const COUNTER = { x: BASKET.W / 2 + 0.85, y: 0.62, z: -0.15 };

/* 相机取景用的点：簸箕晃到两边的范围，上到后背，下到前口以下一点，右边带上数字牌 */
export const FIT = [];
for (const x of [-BASKET.W / 2 - SWAY.x, BASKET.W / 2 + SWAY.x]) {
  for (const z of [-BASKET.D / 2, BASKET.D / 2]) for (const y of [-0.1, 0.85]) FIT.push([x, y, z]);
}
FIT.push([COUNTER.x + 0.35, COUNTER.y + 0.3, COUNTER.z]);

export const CAMERA = { fov: 30, pitch: 40, yaw: 0 };
/* 默认取景框：窗口下方居中（百分比） */
export const STAGE_FRAME = { x: 14, y: 46, w: 72, h: 52 };
