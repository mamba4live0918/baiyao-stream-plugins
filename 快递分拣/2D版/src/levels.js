/* 关卡与计时效果的小查询（当前关、传送带速度、剩余件数），HUD 和玩法都用 */
import { G } from './state.js';
import { segAt } from './timed.js';
import { clamp } from './util.js';

export const curLevels = () => G.S.mode === 'garbage' ? G.S.glevels : G.S.levels;
export const curIdx = () => G.S.mode === 'garbage' ? G.S.glevel : G.S.level;
export const setIdx = i => { if (G.S.mode === 'garbage') G.S.glevel = i; else G.S.level = i; };
export const curLevel = () => G.runLevel || curLevels()[clamp(curIdx(), 0, curLevels().length - 1)];
/* 加速、抽查：每份礼物一段，接在前一段后面，各用各的倍数和署名（见 timed.js） */
export const speedNow = () => (segAt(G.speedSegs, G.time) || { val: 1 }).val;
export const auditNow = () => segAt(G.auditSegs, G.time);
export const beltV = () => 1.9 * G.S.beltSpeed * (G.overtime ? 1 : curLevel().speed);
/* 还没分完的件：场上的（盲盒按里面的件数）+ 车上的 + 排队要落下来的 */
export function remaining() {
  let n = G.trickQueue.length;
  for (const q of G.bigQueue) n += q.n;
  for (const w of G.warns) n += w.n;
  for (const bt of G.truck.batches) n += bt.left;
  for (const b of G.items) if (b.st !== 'deliver') n += b.blind || 1;
  return n;
}
