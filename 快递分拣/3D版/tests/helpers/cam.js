// 测试用的最小相机数学（与 three.js 相同的列主序与 NDC 约定），避免测试依赖 three
export function perspective(fovDeg, aspect, near, far, view) {
  let top = near * Math.tan(fovDeg * Math.PI / 360), height = 2 * top, width = aspect * height, left = -width / 2;
  if (view) { left += view.offsetX * width / view.fullWidth; top -= view.offsetY * height / view.fullHeight; width *= view.width / view.fullWidth; height *= view.height / view.fullHeight; }
  const right = left + width, bottom = top - height;
  const x = 2 * near / (right - left), y = 2 * near / (top - bottom), a = (right + left) / (right - left), b = (top + bottom) / (top - bottom), c = -(far + near) / (far - near), d = -2 * far * near / (far - near);
  return [x, 0, 0, 0, 0, y, 0, 0, a, b, c, -1, 0, 0, d, 0];
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = a => { const l = Math.hypot(...a); return a.map(v => v / l); };
// 相机世界矩阵（lookAt），列主序
export function lookAtWorld(eye, target, up = [0, 1, 0]) {
  const z = norm(sub(eye, target)), x = norm(cross(up, z)), y = cross(z, x);
  return [x[0], x[1], x[2], 0, y[0], y[1], y[2], 0, z[0], z[1], z[2], 0, eye[0], eye[1], eye[2], 1];
}
export function mul(a, b) {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
}
export function invert(m) {
  const a = m.slice(), inv = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const at = (M, r, c) => M[c * 4 + r], set = (M, r, c, v) => { M[c * 4 + r] = v; };
  for (let col = 0; col < 4; col++) {
    let p = col; for (let r = col + 1; r < 4; r++) if (Math.abs(at(a, r, col)) > Math.abs(at(a, p, col))) p = r;
    for (let c = 0; c < 4; c++) { const t = at(a, col, c); set(a, col, c, at(a, p, c)); set(a, p, c, t); const u = at(inv, col, c); set(inv, col, c, at(inv, p, c)); set(inv, p, c, u); }
    const d = at(a, col, col); for (let c = 0; c < 4; c++) { set(a, col, c, at(a, col, c) / d); set(inv, col, c, at(inv, col, c) / d); }
    for (let r = 0; r < 4; r++) if (r !== col) { const f = at(a, r, col); for (let c = 0; c < 4; c++) { set(a, r, c, at(a, r, c) - f * at(a, col, c)); set(inv, r, c, at(inv, r, c) - f * at(inv, col, c)); } }
  }
  return inv;
}
export function project(pv, p) {
  const x = pv[0] * p[0] + pv[4] * p[1] + pv[8] * p[2] + pv[12], y = pv[1] * p[0] + pv[5] * p[1] + pv[9] * p[2] + pv[13], w = pv[3] * p[0] + pv[7] * p[1] + pv[11] * p[2] + pv[15];
  return [x / w, y / w];
}
// 一台看向原点的测试相机：返回 projection×view、它的逆和相机位置
export function testCamera({ eye = [0, 10, 10], target = [0, 0, 0], fov = 30, aspect = 16 / 9, view } = {}) {
  const world = lookAtWorld(eye, target), P = perspective(fov, aspect, .5, 160, view), V = invert(world), PV = mul(P, V);
  return { eye, PV, invPV: invert(PV) };
}
