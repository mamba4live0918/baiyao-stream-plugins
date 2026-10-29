/* 分错判定与统计（纯逻辑）
   judgeDrop：一件东西落进某个筐时该怎么办。
   - 没扫码/没识别（面单被撕、糊了泥）：进哪个筐都只弹出，不算分错；
   - 分类正确：收下；
   - 分错：弹出，补 (倍数 − 1) 件；平时倍数 base（默认 2），抽查期间 auditMult（按抽查的档位，不低于平时）；补件数受件数上限约束。 */
export function judgeDrop(itemCat, identified, binIndex, { wrongMode, audit, remaining, cap, base = 2, auditMult = 3 }) {
  if (!identified) return { kind: 'unidentified' };
  if (itemCat === binIndex) return { kind: 'accept' };
  if (wrongMode !== 'double') return { kind: 'wrong', copies: 0, mult: 1, capped: false };
  const mult = audit ? Math.max(base, auditMult) : base, want = mult - 1, room = Math.max(0, cap - remaining), copies = Math.min(want, room);
  return { kind: 'wrong', copies, mult, capped: copies < want };
}

export const newStats = () => ({ wrong: 0, extra: 0, stumped: {} });

export function recordWrong(stats, copies, trickBy) {
  const stumped = trickBy ? { ...stats.stumped, [trickBy]: (stats.stumped[trickBy] || 0) + 1 } : stats.stumped;
  return { wrong: stats.wrong + 1, extra: stats.extra + copies, stumped };
}

export function statsLine(s) {
  if (!s.wrong) return '';
  return `分错 ${s.wrong} 次` + (s.extra ? ` · 多干 ${s.extra} 件` : '');
}

export function topStumper(s) {
  let best = null;
  for (const [name, n] of Object.entries(s.stumped)) if (!best || n > best.n) best = { name, n };
  return best;
}
