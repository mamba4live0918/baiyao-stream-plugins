/* 观众昵称上屏前过一遍：去掉控制字符和零宽/方向控制字符、压空格、限长；带联系方式、网址、长串数字这些的换掉（抖音合规）。
   （弹幕文字上屏 V1.5 起不要了，这里只管昵称。） */

/* 按码位过滤，不在源码里写转义（避免把控制字符本身写进文件） */
function strip(s) {
  let out = '';
  for (const ch of s) {
    const c = ch.codePointAt(0);
    if (c < 32 || c === 127) continue;
    if (c >= 0x200b && c <= 0x200f) continue;
    if (c >= 0x2028 && c <= 0x202e) continue;
    if (c >= 0x2060 && c <= 0x206f) continue;
    if (c === 0xfeff) continue;
    out += ch;
  }
  return out;
}

/* 抖音直播合规：不管设置里的屏蔽词怎么改，这些一律不上屏——
   联系方式 / 站外引流、网址、长串数字（电话、QQ 号）、钱和红包、刷单兼职、赌、黄。
   先把字"压平"再查：全角→半角、圈数字→数字（NFKC），去掉空格、标点、符号、零宽字符和变体符号，
   所以"加 微 信""ＶＸ""138-1234-5678""①③⑧…"这种绕法都拦得住。 */
const ALWAYS_BANNED = ['微信', '威信', '薇信', '徽信', 'v信', 'vx', 'wx', '加v', 'qq', '扣扣', '企鹅号', '抖音号', '私信', '私聊', '加我', '加群', '进群', '群号', '电话', '手机号', '联系方式', '二维码', '扫码', '链接', '网址', '红包', '返利', '返现', '刷单', '兼职', '赚钱', '代理', '贷款', '借钱', '转账', '赌', '博彩', '彩票', '下注', '色情', '约炮', '裸'];
const URL_RE = /https?|www|:\/\/|[.。．·・]\s*(com|cn|net|top|xyz|cc|vip)\b/i;
const NOISE_RE = /[\p{Z}\p{P}\p{S}\p{Cf}\p{M}\s]/gu;
/* 连着 5 个以上数字：电话、QQ 号之类；1314、520 这种不拦。中文数字（一三八……）也换成数字一起算 */
const DIGITS_RE = /\p{Nd}{5,}/u;
const CN_DIGITS = { 零: '0', 〇: '0', 一: '1', 壹: '1', 二: '2', 贰: '2', 两: '2', 三: '3', 叁: '3', 四: '4', 肆: '4', 五: '5', 伍: '5', 六: '6', 陆: '6', 七: '7', 柒: '7', 八: '8', 捌: '8', 九: '9', 玖: '9' };

const flat = t => t.normalize('NFKC').toLowerCase();

export function isCompliant(t) {
  const f = flat(String(t));
  if (URL_RE.test(f)) return false;
  const compact = f.replace(NOISE_RE, '');
  if (DIGITS_RE.test(compact)) return false;
  if (DIGITS_RE.test(compact.replace(/[零〇一壹二贰两三叁四肆五伍六陆七柒八捌九玖]/g, c => CN_DIGITS[c]))) return false;
  return !ALWAYS_BANNED.some(w => compact.includes(w));
}

/* 观众昵称上屏前也过一遍：长串数字打成 ***（抖音默认昵称"用户123456…"），还不行就叫"观众" */
export function safeName(n) {
  if (typeof n !== 'string') return '观众';
  const t = strip(n).replace(/\s+/g, ' ').trim().slice(0, 30);
  if (!t) return '观众';
  if (isCompliant(t)) return t;
  const masked = t.normalize('NFKC').replace(/\p{Nd}{5,}/gu, '***');
  return isCompliant(masked) ? masked : '观众';
}
