/* 擦玻璃 · 撕小广告的几何（纯函数，方便单测）。
   每张小广告都有"撕的方向" axis（纸面局部坐标里的单位向量，从翘起来的那头指向粘死的那头）：
   贴的时候是从粘死的那头往翘起的那头抹平的，所以要顺着反方向把翘起的那头往回揭。
   拖动方向和 axis 的夹角不超过 TOLERANCE 就一路卷起来、整张撕下；超过（或者往外拽）就撕烂。 */

export const TOLERANCE = (40 * Math.PI) / 180;
/* 夹角超过这个就开始"嘶嘶"警告（快撕烂了） */
export const WARN = (27 * Math.PI) / 180;

/* 拖动向量 (dx, dy) 和撕的方向 (ax, ay) 都在纸面局部坐标里。
   返回 'wait'（拖得还太短，看不出方向）、'ok'（顺着撕）、'warn'（偏了，快撕烂）、'tear'（撕烂） */
export function peelVerdict(dx, dy, ax, ay, minDrag) {
  const len = Math.hypot(dx, dy);
  if (len < minDrag) return 'wait';
  const along = dx * ax + dy * ay;
  if (along <= 0) return 'tear';
  const ang = Math.atan2(Math.abs(dx * ay - dy * ax), along);
  if (ang > TOLERANCE) return 'tear';
  return ang > WARN ? 'warn' : 'ok';
}

/* 纸面一点卷起来以后的样子。s：这点沿撕的方向离翘起那头多远；P：已经揭起来多长；r：卷的半径。
   揭起来的部分绕着一根半径 r 的"卷"翻到上面、背面朝外；还贴着的部分在卷旁边有一点影子。
   返回 { s: 投影到玻璃上的新位置, shade: 亮度（1 = 不变） } */
export function rollPoint(s, P, r) {
  const u = P - s;
  if (u <= 0) {
    const d = -u;
    return { s, shade: P > 0 && d < 2 * r ? 0.8 + 0.2 * (d / (2 * r)) : 1 };
  }
  if (u <= Math.PI * r) {
    const phi = u / r;
    return { s: P - r * Math.sin(phi), shade: 0.66 + 0.34 * Math.abs(Math.cos(phi)) };
  }
  return { s: P + (u - Math.PI * r), shade: 0.97 };
}

/* 纸面矩形（宽 w 高 h，中心为原点）沿 axis 的范围 [min, max] */
export function axisSpan(w, h, ax, ay) {
  const e = (Math.abs(ax) * w) / 2 + (Math.abs(ay) * h) / 2;
  return [-e, e];
}

/* 揭起多长算整张撕下：剩下的一小截自己就掉了 */
export const DONE_SHARE = 0.72;
