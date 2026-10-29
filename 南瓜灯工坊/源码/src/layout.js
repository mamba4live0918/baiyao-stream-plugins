// 画面布局：全部按短边算（横屏、竖屏 1080×1920、4:3、带鱼屏都一样好用）。
// 塔在一边（默认右边），工作台在另一边：模具一竖排贴着屏幕边，南瓜在它旁边，盖子拿下来放在南瓜外侧的地上，
// 点火棒 / 糖罐浮在盖子上方；排队的南瓜沿底边排到塔脚（竖屏放在工作台上面一排）。
export function computeLayout(W, H, settings = {}) {
  const m = Math.min(W, H), u = m / 1080;
  const flip = settings.tower?.side === 'left';   // 塔在左边时整套左右镜像
  const X = x => (flip ? W - x : x);
  const margin = 0.028 * m;
  const floor = H - 0.03 * m;
  const T = 0.2 * m * (settings.tower?.size || 1);    // 塔上一盏灯的贴图边长
  const slot = 0.088 * m * Math.min(1.2, settings.bench?.size || 1);
  // 工作台南瓜尽量大（方便自由刻）：短边的 0.48，但要给盖子、塔留出地方（竖屏会自动小一点）
  const room = W - margin - T * 0.95 - (margin + slot + 0.012 * m);
  const portraitish = W / H < 0.9;
  // 横屏还要给排队的南瓜留 3 个位置（排队的南瓜可以小一点，工作台的南瓜尽量大）
  const P = Math.min(0.48 * m * (settings.bench?.size || 1), room / 1.45, portraitish ? Infinity : (room - 2.7 * 0.105 * m) / 1.36);   // 工作台南瓜的贴图边长
  const trayX = margin + slot / 2;
  const benchLeft = margin + slot + 0.012 * m - 0.08 * P;
  const bench = { x: X(benchLeft + P / 2), y: floor - 0.93 * P, size: P };   // 贴图左上角 = (x - P/2, y)
  const bodyOuter = benchLeft + 0.92 * P;
  const lidRest = { x: X(bodyOuter + 0.25 * P), y: floor - 0.13 * P };       // 盖子落地后，盖子中心
  const tool = { x: X(bodyOuter + 0.24 * P), y: bench.y + 0.14 * P, size: 0.21 * m };
  const towerX = X(W - margin - T * 0.46);
  const tower = { x: towerX, y: floor, size: T, layer: 0.6 * T };
  const portrait = portraitish;
  let queue, q = 0.13 * m;
  if (!portrait) {
    const from = bodyOuter + 0.52 * P, to = W - margin - T * 0.95;
    q = Math.max(0.08 * m, Math.min(q, (to - from) / 2.7));
    queue = { x0: X(from + q / 2), dir: flip ? -1 : 1, y: floor - 0.93 * q, size: q, gap: q * 0.9, n: Math.max(1, Math.floor((to - from) / (q * 0.9))) };
  } else {
    const from = margin, to = W - margin - T * 0.95;
    queue = { x0: X(from + q / 2), dir: flip ? -1 : 1, y: bench.y - 0.42 * P - 0.93 * q, size: q, gap: q * 0.9, n: Math.max(1, Math.floor((to - from) / (q * 0.9))) };
  }
  return { W, H, m, u, flip, X, margin, floor, bench, lidRest, tool, tower, queue, tray: { x: X(trayX), bottom: floor, slot }, portrait };
}

/** 贴图坐标（0..1）↔ 屏幕坐标：工作台南瓜。 */
export const benchToScreen = (L, tx, ty) => ({ x: L.bench.x - L.bench.size / 2 + tx * L.bench.size, y: L.bench.y + ty * L.bench.size });
export const screenToBench = (L, x, y) => [(x - (L.bench.x - L.bench.size / 2)) / L.bench.size, (y - L.bench.y) / L.bench.size];

/** 排队第 i 个南瓜的位置（贴图左上角 x 是 cx - size/2）。 */
export const queueSlot = (L, i) => ({ x: L.queue.x0 + L.queue.dir * i * L.queue.gap, y: L.queue.y, size: L.queue.size });

/** 模具托盘一共 count 格，第 i 格（从上往下）的中心。 */
export const traySlot = (L, i, count) => ({ x: L.tray.x, y: L.tray.bottom - L.tray.slot * 1.05 * (count - i - 0.5), r: L.tray.slot * 0.47 });
