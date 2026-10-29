/* 刮擦的数学（纯函数，测试可直接载入） */

/* 每遍的去除强度：遍数 T 越大，每遍去掉越少；T ≤ 1 一遍刮干净。
   梳齿强度在 0.8～1.0 倍之间，平均约 0.9 倍，所以除以 0.9：大约刮 T 遍剩下 5%。 */
export function passStrength(toughness) {
  if (toughness <= 1) return 1;
  const avg = 1 - Math.pow(0.05, 1 / toughness);
  return Math.min(1, avg / 0.9);
}

/* 平均刮 n 遍以后还剩多少（每遍按平均强度算） */
export function remainingAfter(toughness, passes) {
  const a = passStrength(toughness) * 0.9;
  return Math.pow(1 - Math.min(1, a), passes);
}
