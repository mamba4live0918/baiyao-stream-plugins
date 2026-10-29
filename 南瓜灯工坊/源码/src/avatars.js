// 观众头像（事件里带的抖音头像网址）。白曜不让插件页面自己上网，就请白曜代下载（0.27.4 起有 BaiyaoPlugin.getAvatar，回 data: 图）；
// 菘蓝、浏览器里直接加载网址。下不到（网不好）、旧版白曜、没有头像，就画圆形徽章写名字的第一个字，颜色按观众固定。
// 下不到的，之后重画时隔 30 秒、1 分钟、2 分钟（以后每 2 分钟）再要一次：网好了头像自己出来。
// 要的时候才下，用完就删：画面上不显示的头像 2 分钟后删掉（每分钟查一次），再显示时重新要；正显示着的不删。
// 同一个网址同时只要一次，最多记 300 个。
const cache = new Map();
const KEEP = 300, RETRY = [30, 60, 120], IDLE_MS = 120000, SWEEP_MS = 60000;
let frame = 0, sweeper = 0;

/** 每画一帧灯展先调一次：这一帧画到的头像算「正在用」，清理时不动它们。 */
export function avatarFrame() { frame++; }

function sweep() {
  const t = Date.now();
  for (const [url, a] of cache) if (!a.busy && a.frame !== frame && t - a.used > IDLE_MS) cache.delete(url);
}

function fetchAvatar(url, a, onReady) {
  a.busy = true;
  const fail = () => { a.busy = false; a.retryAt = Date.now() + RETRY[Math.min(a.fails++, RETRY.length - 1)] * 1000; };
  const show = (src, direct) => {
    try {
      const im = new Image();
      if (direct) im.referrerPolicy = 'no-referrer';
      im.onload = () => { a.busy = false; a.img = im; onReady?.(); };
      im.onerror = fail;
      im.src = src;
    } catch { fail(); }
  };
  const host = globalThis.BaiyaoPlugin;
  if (!host || url.startsWith('data:')) { show(url, true); return; }
  // 白曜里直接加载网上的图会被安全策略拦下，所以请白曜下载；旧版白曜没有这个接口，就一直用徽章
  if (typeof host.getAvatar !== 'function') { a.busy = false; a.retryAt = Infinity; return; }
  Promise.resolve().then(() => host.getAvatar(url)).then(src => (typeof src === 'string' && src.startsWith('data:image/') ? show(src) : fail()), fail);
}

function load(url, onReady) {
  let a = cache.get(url);
  if (a) { cache.delete(url); cache.set(url, a); }
  else {
    a = { img: null, busy: false, fails: 0, retryAt: 0, used: 0, frame: 0 };
    cache.set(url, a);
    if (cache.size > KEEP) cache.delete(cache.keys().next().value);
  }
  a.used = Date.now(); a.frame = frame;
  if (!sweeper) sweeper = setInterval(sweep, SWEEP_MS);
  if (!a.img && !a.busy && Date.now() >= a.retryAt) fetchAvatar(url, a, onReady);
  return a;
}

/** 测试用：现在记着几个头像、清理一次。 */
export const avatarCache = { size: () => cache.size, sweep };

const hue = s => { let h = 0; for (const ch of String(s)) h = (h * 31 + ch.codePointAt(0)) >>> 0; return h % 360; };

/** 在 (x, y) 画半径 r 的头像（或名字首字徽章），白边 + 一点阴影。头像下好了调 onReady 让画面重画。 */
export function drawAvatar(g, who, x, y, r, onReady) {
  const a = who?.avatar ? load(who.avatar, onReady) : null;
  g.save();
  g.fillStyle = 'rgba(40,15,5,.35)';
  g.beginPath(); g.arc(x, y + r * 0.08, r * 1.12, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#FFF6E8';
  g.beginPath(); g.arc(x, y, r * 1.12, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.closePath();
  if (a?.img) {
    g.clip();
    const im = a.img, k = Math.max((2 * r) / im.naturalWidth, (2 * r) / im.naturalHeight);
    g.drawImage(im, x - im.naturalWidth * k / 2, y - im.naturalHeight * k / 2, im.naturalWidth * k, im.naturalHeight * k);
  } else {
    const h = hue(who?.uid || who?.nick);
    g.fillStyle = `hsl(${h} 62% 58%)`; g.fill();
    g.fillStyle = '#FFFFFF';
    g.font = `900 ${Math.round(r * 1.15)}px "Microsoft YaHei",sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText([...(who?.nick || '观')][0], x, y + r * 0.06);
  }
  g.restore();
}
