/* 直播事件标准化（纯逻辑，可直接用 Node 测试）：兼容菘蓝旧字段、白曜标准事件和本机转发的各种写法 */
export function typeOf(t) {
  t = String(t ?? '').toLowerCase();
  if (t.includes('gift') || t === '2') return 'gift';
  if (t.includes('chat') || t.includes('comment') || t.includes('danmaku') || t === '1') return 'chat';
  if (t.includes('like') || t === '5') return 'like';
  if (t.includes('follow') || t.includes('social') || t === '4') return 'follow';
  if (t.includes('member') || t.includes('enter') || t === '3') return 'member';
  return null;
}
/* 返回 { type, nick, uid, id, name?, count?, text? }；看不懂或数据不合理就返回 null（礼物个数 1–10000、点赞 1–1000） */
export function normEvent(raw, forced) {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw.data && typeof raw.data === 'object' && !Array.isArray(raw.data) ? { ...raw.data, ...raw, data: undefined } : raw;
  const type = forced || typeOf(d.type ?? d.msgType ?? d.method); if (!type) return null;
  const user = d.user && typeof d.user === 'object' ? d.user : {};
  const nick = String(d.nickName ?? d.nickname ?? user.nickname ?? user.nickName ?? d.userName ?? d.uname ?? '').trim().slice(0, 20) || '观众';
  const uid = String(d.userId ?? user.id ?? d.uid ?? nick).slice(0, 60);
  const id = d.eventId ?? d.event_id ?? d.msgId ?? d.msg_id ?? null;
  const ev = { type, nick, uid, id };
  if (type === 'gift') {
    const g = d.gift && typeof d.gift === 'object' ? d.gift : d;
    ev.name = String(d.giftName ?? g.giftName ?? g.name ?? '').trim().slice(0, 40);
    const c = Number(d.count ?? d.giftCount ?? d.comboCount ?? d.repeatCount ?? g.count ?? g.giftCount ?? 1);
    if (!ev.name || !Number.isInteger(c) || c < 1 || c > 10000) return null; ev.count = c;
  } else if (type === 'chat') { ev.text = String(d.content ?? d.text ?? d.msg ?? d.comment ?? '').slice(0, 200); if (!ev.text.trim()) return null; }
  else if (type === 'like') { const c = Number(d.count ?? d.likeCount ?? 1); ev.count = Number.isInteger(c) && c >= 1 && c <= 1000 ? c : 1; }
  return ev;
}
/* 10 秒内同一个事件 ID 只处理一次 */
export function createDupe(windowMs = 10000) {
  const seen = new Map();
  return (id, now = Date.now()) => {
    if (id === null || id === undefined || id === '') return false;
    const k = String(id).slice(0, 160);
    if (seen.size > 400) for (const [key, t] of seen) if (now - t > windowMs) seen.delete(key);
    const prev = seen.get(k); seen.set(k, now);
    return prev !== undefined && now - prev <= windowMs;
  };
}
/* 点赞按全场累计：一次最多触发 3 次，多出来的零头留着 */
export function likeTimes(acc, add, need) {
  let a = acc + add, times = 0;
  while (a >= need && times < 3) { a -= need; times++; }
  if (a >= need) a %= need;
  return { acc: a, times };
}
