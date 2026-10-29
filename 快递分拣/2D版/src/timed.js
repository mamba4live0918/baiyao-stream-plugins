/* 限时效果排队（传送带加速、抽查）：后到的礼物接在前一段后面，每段用自己的倍数和署名。
   这样便宜档不会借用贵档的倍数，也不会把别人的档位记到自己名下。纯数据，不改传入的数组。 */

/* 加一段：从 max(现在, 上一段结束) 开始，持续 dur 秒，最多排到「现在 + horizon」；返回新的段列表和实际加上的秒数 */
export function pushSeg(segs, now, dur, val, name, horizon) {
  const live = segs.filter(s => s.end > now), last = live[live.length - 1];
  const start = Math.max(now, last ? last.end : now), end = Math.min(now + horizon, start + Math.max(0, dur));
  if (end - start < .05) return { segs: live, added: 0 };
  // 同一个人、同一个倍数接着送，直接延长上一段，标签不来回换
  if (last && last.end === start && last.val === val && last.name === name) return { segs: [...live.slice(0, -1), { ...last, end }], added: end - start };
  return { segs: [...live, { start, end, val, name }], added: end - start };
}

/* 此刻生效的那一段（没有就是 null） */
export const segAt = (segs, now) => segs.find(s => s.start <= now && now < s.end) || null;

/* 排到哪一秒结束（没有排队就是 now） */
export const segsEnd = (segs, now) => segs.reduce((m, s) => Math.max(m, s.end), now);

/* 当前这一段后面紧接着的一段 */
export const segAfter = (segs, cur) => (cur ? segs.find(s => s.start >= cur.end) : null) || null;
