/* 本机端口的消息解码与本地回放共用此入口；本模块没有网络、存储或游戏状态。 */
import { MESS_IDS, normalizeGiftEvent, normalizeCommentEvent, routeGift, routeComment, giftKey } from './rules.js';

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const preset = (id, label, description, message) => Object.freeze({ id, label, description, json: JSON.stringify(message, null, 2) });
export const MESSAGE_TEST_PRESETS = Object.freeze([
  preset('songlan-gift', '菘蓝端口（9910）', '菘蓝与白曜兼容端口使用相同 gift/chat 格式。此处仅本地回放，不验证端口连通。',
    { type: 'gift', giftName: '小心心', count: 2, nickName: '测试观众', userId: 'menu-viewer-a', avatar: '', eventId: 'menu-songlan-gift' }),
  preset('baiyao-gift', '白曜兼容端口（9910 / 10030）', '与菘蓝端口采用同一消息格式；选择此示例不会连接白曜或任何端口。',
    { type: 'gift', giftName: '小心心', count: 2, nickName: '测试观众', userId: 'menu-viewer-b', avatar: '', giftIcon: '', eventId: 'menu-baiyao-gift' }),
  preset('chat', '弹幕点单', '按当前点单开关和口令匹配；同一观众再次点单可能是催单。',
    { type: 'chat', content: '点单', nickName: '测试观众', userId: 'menu-viewer-a', avatar: '', eventId: 'menu-chat' })
]);

const decoded = (status, reason, raw = null, event = null) => ({ status, reason, kind: event?.kind || null, raw, event });

/** Accept the exact JSON text supplied by WebSocket.onmessage or the local test textarea. */
export function decodePortMessage(text) {
  if (typeof text !== 'string') return decoded('error', '请输入 JSON 文本。');
  let raw;
  try { raw = JSON.parse(text); }
  catch { return decoded('error', 'JSON 格式错误，请检查引号、逗号和括号。'); }
  if (!record(raw)) return decoded('error', 'JSON 顶层必须是一个消息对象，不能是数组或空值。');
  if (raw.type !== 'gift' && raw.type !== 'chat') {
    return decoded('ignored', '已忽略：只处理 type 为 gift 或 chat 的消息；心跳、场景和动作命令不执行。', raw);
  }
  const data = record(raw.data) ? raw.data : raw;
  if (raw.type === 'gift') {
    const gift = record(data.gift) ? data.gift : data;
    if (data.comboEnd === true || gift.comboEnd === true) return decoded('ignored', '已忽略连击结束包，不重复计算礼物。', raw);
    // 与 normalizeGiftEvent 保持同一数量优先级；这里只解释拒绝原因，不改变其兼容规则。
    const count = [data.effectiveGiftCount, gift.effectiveGiftCount, data.giftCount, data.count, data.comboCount, data.repeatCount, gift.count].find(value => value !== undefined && value !== null);
    try {
      if (count !== undefined && Number(count) === 0) return decoded('ignored', '已忽略有效数量为 0 的礼物包。', raw);
      const event = normalizeGiftEvent(raw);
      if (event) return decoded('valid', '礼物解析成功。', raw, event);
    } catch { /* 不可信 JSON 字段不能中断真实端口回调。 */ }
    const name = data.giftName ?? gift.giftName ?? gift.name ?? data.name;
    if (!['string', 'number'].includes(typeof name) || !String(name).trim()) return decoded('error', '缺少有效礼物名，请检查 giftName 或 gift.name。', raw);
    return decoded('error', '礼物数量无效；按现有规则换算后必须是至少 1 的有限数量。', raw);
  }
  const event = normalizeCommentEvent(raw);
  return event ? decoded('valid', '弹幕解析成功。', raw, event) : decoded('error', '缺少有效弹幕内容，请检查 content（也兼容 text）。', raw);
}

function unmatchedReason(settings, event) {
  if (event.kind === 'comment') return settings.order?.enabled === false ? '弹幕点单已关闭。' : '没有命中当前点单口令。';
  const rules = settings.rules || {}, mess = rules.mess || [], help = rules.help || [], order = rules.order || [];
  if (!mess.length && !help.length && !order.length) return '礼物表为空，请先配置点单、捣乱或帮忙礼物。';
  const key = giftKey(event.gift.name), row = mess.find(item => giftKey(item.name) === key);
  if (order.some(item => giftKey(item.name) === key)) return '已找到点单礼物，但没有生成顾客，请检查 N～M 设置。';
  if (row) {
    if (!(rules.pool || []).some(id => MESS_IDS.includes(id))) return '捣乱池为空，请至少勾选一种捣乱；帮忙礼物不受此项限制。';
    return '已找到捣乱礼物，但没有生成有效次数，请检查 N～M 设置。';
  }
  if (help.some(item => giftKey(item.name) === key)) return '已找到帮忙礼物，请检查帮忙类型和 N～M 设置。';
  return '表外礼物：不在点单、捣乱或帮忙礼物表中，不触发互动。';
}

/** Pure preview: no receipt counters, deduplication, notifications, storage or network. */
export function inspectPortMessage(text, settings = {}, random = Math.random) {
  const result = decodePortMessage(text);
  if (result.status !== 'valid') return { ok: false, status: result.status, reason: result.reason, event: result.event, matches: [], specs: [] };
  const event = result.event;
  try {
    const routed = event.kind === 'gift' ? routeGift(settings, event, random) : routeComment(settings, event);
    const specs = Array.isArray(routed) ? routed : routed ? [routed] : [];
    return {
      ok: true, status: specs.length ? 'matched' : 'unmatched',
      reason: specs.length ? '解析成功，已匹配互动；尚未执行。' : unmatchedReason(settings, event),
      event, matches: specs.map(({ kind, count }) => ({ kind, count })), specs
    };
  } catch {
    return { ok: false, status: 'error', reason: '消息已解析，但规则设置无效，请检查礼物表和数量范围。', event, matches: [], specs: [] };
  }
}
