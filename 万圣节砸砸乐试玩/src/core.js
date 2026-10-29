/* 万圣节砸砸乐试玩 · 公共工具
   舞台是 1600×900 的逻辑坐标（和直播画布 16:9 一致），所有效果都用这个坐标。 */
(function () {
  'use strict';
  const HW = (window.HW = window.HW || {});
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const seg = (t, a, b) => (b <= a ? (t >= b ? 1 : 0) : clamp((t - a) / (b - a), 0, 1));
  const ease = {
    outCubic: k => 1 - Math.pow(1 - k, 3),
    inCubic: k => k * k * k,
    inOutSine: k => -(Math.cos(Math.PI * k) - 1) / 2,
    outBack: k => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); },
    outElastic: k => (k <= 0 ? 0 : k >= 1 ? 1 : Math.pow(2, -10 * k) * Math.sin((k * 10 - 0.75) * (TAU / 3)) + 1),
  };

  // 可重复的随机数：重置时回到同一个种子，方便对比
  let seed = 20261031;
  const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const reseed = s => { seed = s >>> 0; };
  const range = (a, b) => a + (b - a) * rand();
  const pick = list => list[Math.floor(rand() * list.length) % list.length];

  // 画一次、以后反复用的小图
  function sprite(w, h, paint) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w));
    c.height = Math.max(1, Math.ceil(h));
    paint(c.getContext('2d'), c.width, c.height);
    return c;
  }
  // 带描边的粗体字（舞台上的提示字都用它）
  function label(g, text, x, y, o = {}) {
    const size = o.size || 30;
    g.save();
    g.font = (o.weight || 800) + ' ' + size + 'px "Microsoft YaHei UI","Microsoft YaHei","PingFang SC",sans-serif';
    g.textAlign = o.align || 'left';
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    g.globalAlpha *= o.alpha ?? 1;
    g.lineWidth = o.strokeW ?? size * 0.22;
    g.strokeStyle = o.stroke || 'rgba(32,20,48,.92)';
    g.strokeText(text, x, y);
    g.fillStyle = o.fill || '#FFF6E8';
    g.fillText(text, x, y);
    g.restore();
  }
  // 两点之间的抛物线位置（u 从 0 到 1，arc 是中点抬高多少）
  function arcPoint(a, b, u, arc) {
    return { x: lerp(a.x, b.x, u), y: lerp(a.y, b.y, u) - Math.sin(Math.PI * u) * arc };
  }

  HW.W = 1600;
  HW.H = 900;
  HW.util = { TAU, clamp, lerp, seg, ease, rand, reseed, range, pick, sprite, label, arcPoint };
  HW.names = ['小白兔', '奶油泡芙', '月亮不睡', '橘子汽水', '小熊软糖', '夜猫子', '南瓜派', '咕噜咕噜', '棉花糖', '星星眼', '布丁', '小鱼干'];
})();
