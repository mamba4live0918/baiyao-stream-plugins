/* 互动规则：来源 → 效果 × 数值（从 main.js 移出，效果上限来自 modes.js） */
import { EFF } from './modes.js';

export const SRC = { gift: '礼物', chat: '弹幕', like: '点赞', follow: '关注', member: '进场' };

export const DEFAULT_RULES = [
  { src: 'gift', match: '小心心', effect: 'help', value: 1, cd: 0 },
  { src: 'gift', match: '玫瑰', effect: 'truck', value: 2, cd: 0 },
  { src: 'gift', match: '人气票', effect: 'tape', value: 1, cd: 0 },
  { src: 'gift', match: '比心', effect: 'strip', value: 2, cd: 0 },
  { src: 'gift', match: '棒棒糖', effect: 'seal', value: 15, cd: 0 },
  { src: 'gift', match: '你最好看', effect: 'speed', value: 10, cd: 0 },
  { src: 'gift', match: '抖音', effect: 'leak', value: 15, cd: 0 },
  { src: 'gift', match: '大啤酒', effect: 'blind', value: 8, cd: 0 },
  { src: 'gift', match: '加油鸭', effect: 'kick', value: 1, cd: 0 },
  { src: 'gift', match: '墨镜', effect: 'audit', value: 15, cd: 0 },
  { src: 'gift', match: '礼花筒', effect: 'prank', value: 1, cd: 0 },
  { src: 'gift', match: '爱你哟', effect: 'tricky', value: 2, cd: 0 },
  { src: 'chat', match: '加班', effect: 'truck', value: 1, cd: 60 },
  { src: 'chat', match: '救命', effect: 'help', value: 1, cd: 60 },
  { src: 'like', match: '300', effect: 'truck', value: 3, cd: 0 },
  { src: 'follow', match: '', effect: 'truck', value: 1, cd: 0 },
  { src: 'member', match: '', effect: 'truck', value: 1, cd: 600, off: true },
].map((r, i) => { const { off, ...rest } = r; return { id: 'r' + i, on: !off, tier: '', ...rest }; });

export const normKey = v => String(v ?? '').normalize('NFKC').trim().toLocaleLowerCase();

/* 规则记住的档位：档位 id（字符串）；旧开发版存的是数字下标也保留；空字符串 = 这种互动的默认档 */
const cleanTierRef = t => typeof t === 'string' ? t.trim().slice(0, 24) : Number.isInteger(t) && t >= 0 && t < 12 ? t : '';
export function validRule(r, i) {
  if (!r || typeof r !== 'object') throw new Error(`第 ${i + 1} 条规则无效`);
  const src = String(r.src); let effect = String(r.effect);
  if (effect === 'big') effect = 'blind'; if (effect === 'swap') effect = 'seal';
  if (!SRC[src]) throw new Error(`第 ${i + 1} 条：未知来源`);
  if (!EFF[effect]) throw new Error(`第 ${i + 1} 条：未知效果`);
  let match = String(r.match ?? '').trim().slice(0, 40);
  if ((src === 'gift' || src === 'chat') && !match) throw new Error(`第 ${i + 1} 条：${src === 'gift' ? '礼物名' : '弹幕关键词'}不能为空`);
  if (src === 'like') { const n = Number(match); if (!Number.isInteger(n) || n < 10 || n > 100000) throw new Error(`第 ${i + 1} 条：点赞累计数须为 10–100000 的整数`); match = String(n); }
  if (src === 'follow' || src === 'member') match = '';
  const value = Number(r.value), cd = Number(r.cd ?? 0);
  if (!Number.isInteger(value) || value < 1 || value > EFF[effect].max) throw new Error(`第 ${i + 1} 条：${EFF[effect].label.express}数值须为 1–${EFF[effect].max}`);
  if (!Number.isInteger(cd) || cd < 0 || cd > 3600) throw new Error(`第 ${i + 1} 条：冷却须为 0–3600 秒`);
  return { id: String(r.id || ('r' + Date.now().toString(36) + i)).slice(0, 40), on: r.on !== false, src, match, effect, tier: cleanTierRef(r.tier), value, cd };
}

export function validRules(list) {
  if (!Array.isArray(list) || list.length > 60) throw new Error('规则最多 60 条');
  const out = list.map(validRule), seen = new Set();
  for (const r of out) {
    if (r.src !== 'gift' || !r.on) continue;
    const k = normKey(r.match);
    if (seen.has(k)) throw new Error(`礼物「${r.match}」重复，请只保留一条启用的规则`);
    seen.add(k);
  }
  return out;
}
