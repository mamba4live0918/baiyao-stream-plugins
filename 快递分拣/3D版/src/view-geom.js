/* 视口与视锥的纯数学（列主序 4×4 矩阵，与 three.js 的 elements 相同；NDC z=1 为远平面）
   用于：整窗渲染时把分拣台框进"分拣台位置"、窗口四边的隐形墙、露头圆的隐形圆锥。 */

export function stageRect(scene, winW, winH) {
  return { left: scene.x / 100 * winW, top: scene.y / 100 * winH, width: scene.w / 100 * winW, height: scene.h / 100 * winH };
}
/* camera.setViewOffset 的参数：以分拣台框为"完整画面"，整窗是它向外扩出的视口 */
export const viewOffsetArgs = (st, winW, winH) => [st.width, st.height, -st.left, -st.top, winW, winH];

export const screenToNdc = (x, y, w, h) => [x / w * 2 - 1, -(y / h * 2 - 1)];
export const ndcToScreen = (nx, ny, w, h) => [(nx + 1) / 2 * w, (1 - ny) / 2 * h];

export function unproject(nx, ny, nz, inv) {
  const x = inv[0] * nx + inv[4] * ny + inv[8] * nz + inv[12];
  const y = inv[1] * nx + inv[5] * ny + inv[9] * nz + inv[13];
  const z = inv[2] * nx + inv[6] * ny + inv[10] * nz + inv[14];
  const w = inv[3] * nx + inv[7] * ny + inv[11] * nz + inv[15];
  return [x / w, y / w, z / w];
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/* 窗口四边对应的四个视锥侧面：都过相机位置，法线朝视锥内；inset 为 NDC 内缩量（0.02 = 每边留 1%） */
export function frustumPlanes(camPos, invPV, inset = 0) {
  const k = 1 - inset, far = (x, y) => unproject(x * k, y * k, 1, invPV), centre = unproject(0, 0, 1, invPV);
  const TL = far(-1, 1), TR = far(1, 1), BL = far(-1, -1), BR = far(1, -1);
  const plane = (A, B) => {
    let n = unit(cross(sub(A, camPos), sub(B, camPos)));
    if (dot(n, sub(centre, camPos)) < 0) n = [-n[0], -n[1], -n[2]];
    return { n, p: [camPos[0], camPos[1], camPos[2]] };
  };
  return [plane(TL, BL), plane(BR, TR), plane(BL, BR), plane(TR, TL)];   // 左、右、下、上
}

export function insidePlanes(planes, p, margin = 0) {
  for (const { n, p: o } of planes) if (dot(n, sub(p, o)) < -margin) return false;
  return true;
}

/* 露头圆的圆锥凸包点：第 0 个点是相机，其余是屏幕圆周上 n 个点沿视线射出 length 后的位置 */
export function coneHullPoints(camPos, invPV, circle, winW, winH, length, n = 32) {
  const out = new Float32Array((n + 1) * 3);
  out[0] = camPos[0]; out[1] = camPos[1]; out[2] = camPos[2];
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2, [nx, ny] = screenToNdc(circle.cx + Math.cos(a) * circle.r, circle.cy + Math.sin(a) * circle.r, winW, winH);
    const d = unit(sub(unproject(nx, ny, 1, invPV), camPos));
    out.set([camPos[0] + d[0] * length, camPos[1] + d[1] * length, camPos[2] + d[2] * length], (i + 1) * 3);
  }
  return out;
}
