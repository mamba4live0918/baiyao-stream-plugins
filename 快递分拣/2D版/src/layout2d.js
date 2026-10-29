/* 2D 画面布局（纯计算，可直接用 Node 测试）。
   世界坐标用米：x 向右、y 向上，原点在窗口左下角；地面就是窗口下沿。
   世界宽 = 15 米 ÷（画面大小 / 100），像素 / 米 = 窗口宽 ÷ 世界宽；台面高度按窗口高的百分比，托底 2 米（桶要放得下）。
   左下角是货车（车头在窗口外），车尾接一小段传送带，传送带末端接柜台，柜台铺到右边；台面右端是识别台；桶在柜台前面居中排开。 */
export const BASE_W = 15;
const TRUCK = { w: 3.5, h: 1.68, x1: 3.3 };   // 车身宽高、车尾最靠右的位置
const BELT_LEN = 1.95, GAP = .16;

export function layout2d(W, H, { size = 100, counterY = 20, mode = 'garbage' } = {}) {
  const worldW = BASE_W / (size / 100), ppm = W / worldW, worldH = H / ppm;
  const top = Math.max(2.0, worldH * counterY / 100);
  // 桶：比台面矮一截（桶口离台面至少 0.3 米），下面垫 0.3 米高的脚，漏桶时东西落到桶底下的地面上
  const feet = .3, binH = Math.min(1.9, Math.max(1.0, top - feet - .3)), binW = binH * 1.28;
  const n = mode === 'express' ? 3 : 4, span = n * binW + (n - 1) * GAP;
  // 窗口太窄放不下时，桶按比例缩小
  const k = Math.min(1, (worldW - .2) / span), bw = binW * k, bh = binH * k, step = bw + GAP * k, x0 = worldW / 2 - (n - 1) * step / 2;
  const bins = Array.from({ length: n }, (_, i) => ({ i, x: x0 + i * step, w: bw, h: bh, bottom: feet, top: feet + bh }));
  // 货车：车尾不越过第一个桶的左边，放不下就往窗口外多藏一点
  const binsLeft = bins[0].x - bw / 2, tx1 = Math.min(TRUCK.x1, binsLeft);
  const truck = { x0: tx1 - TRUCK.w, x1: tx1, w: TRUCK.w, h: TRUCK.h, x: tx1 - TRUCK.w / 2, away: -TRUCK.w - 2 };
  const belt = { x0: tx1, x1: tx1 + BELT_LEN, top };
  const counter = { x0: belt.x1 - .3, x1: worldW, top };
  const scan = { x: worldW - Math.min(1.1, (worldW - counter.x0) * .12), top };
  return { worldW, worldH, ppm, size, counter, belt, truck, scan, bins, mode };
}
