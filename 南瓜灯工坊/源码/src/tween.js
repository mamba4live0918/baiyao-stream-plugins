// 小工具：缓动、补间（位置 / 角度 / 缩放沿弧线走过去）、弹一下（挤压回弹）。时间都用秒。
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const easeOut = t => 1 - (1 - t) ** 3;
export const easeIn = t => t * t * t;
export const easeInOut = t => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
export const easeOutBack = t => { const s = 1.9; return 1 + (s + 1) * (t - 1) ** 3 + s * (t - 1) ** 2; };

/** obj 从现在的 x y rot s 走到 to；arc > 0 时中途往上拱 arc 像素。走完调 then。 */
export function tween(obj, to, t0, dur, { arc = 0, ease = easeOut, then = null } = {}) {
  obj.tw = { from: { x: obj.x, y: obj.y, rot: obj.rot || 0, s: obj.s ?? 1 }, to: { x: obj.x, y: obj.y, rot: obj.rot || 0, s: obj.s ?? 1, ...to }, t0, dur: Math.max(0.001, dur), arc, ease, then };
}

/** 往前走一步；返回 true = 还在动。 */
export function stepTween(obj, t) {
  const tw = obj.tw;
  if (!tw) return false;
  const k = clamp((t - tw.t0) / tw.dur, 0, 1), e = tw.ease(k);
  obj.x = lerp(tw.from.x, tw.to.x, e);
  obj.y = lerp(tw.from.y, tw.to.y, e) - tw.arc * 4 * k * (1 - k);
  obj.rot = lerp(tw.from.rot, tw.to.rot, e);
  obj.s = lerp(tw.from.s, tw.to.s, e);
  if (k >= 1) { obj.tw = null; tw.then?.(); }
  return true;
}

/** 挤压回弹：返回 [横向倍数, 纵向倍数]，amp 越大弹得越狠，0.7 秒后归零。 */
export function squash(sq, t) {
  const d = t - sq.t0;
  if (!(d >= 0 && d < 0.7) || !sq.amp) return [1, 1];
  const s = sq.amp * Math.exp(-7 * d) * Math.cos(20 * d);
  return [1 + s, 1 - s];
}
export const squashing = (sq, t) => t - sq.t0 >= 0 && t - sq.t0 < 0.7 && sq.amp > 0;
