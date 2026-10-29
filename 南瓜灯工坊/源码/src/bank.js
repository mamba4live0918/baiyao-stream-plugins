// 糖罐计数（位置、大小可以在「摆位置」里拖）。小车送达、粉丝送糖 → 糖一颗颗飞进来，数字跳一下；
// 给捣蛋鬼糖 → 糖从这里飞到它手里。显示的数 = 真实的数减去还在路上的。
import { img, CANDIES } from './assets.js';
import { clamp, lerp, easeInOut } from './tween.js';
import { widgetRects } from './widgets.js';

export function createBank(world) {
  let L = null, popAt = -9, incoming = 0;
  const flying = [];
  const rect = () => widgetRects(L, world.settings()).bank;
  const iconAt = () => { const r = rect(); return { x: r.x + r.h * 0.75, y: r.y + r.h / 2 }; };

  /** n 颗糖从 from 飞进糖罐（最多飞 12 颗，数字按到达的份数往上跳）。 */
  function flyIn(from, n, t = world.now()) {
    if (!(n > 0) || !L) return;
    const k = Math.min(12, n), each = n / k, to = iconAt();
    incoming += n;
    for (let i = 0; i < k; i++) flying.push({ x0: from.x + (Math.random() - 0.5) * L.m * 0.06, y0: from.y, x1: to.x, y1: to.y, t0: t + i * 0.06, dur: 0.55, k: CANDIES[i % CANDIES.length], into: true, share: i === k - 1 ? n - each * (k - 1) : each });
  }

  /** n 颗糖从糖罐飞到 to（给捣蛋鬼的）。数字已经扣过了。 */
  function flyOut(to, n, t = world.now()) {
    if (!(n > 0) || !L) return;
    const k = Math.min(10, n), from = iconAt();
    popAt = t;
    for (let i = 0; i < k; i++) flying.push({ x0: from.x, y0: from.y, x1: to.x + (Math.random() - 0.5) * L.m * 0.04, y1: to.y, t0: t + i * 0.05, dur: 0.45, k: CANDIES[(i + 2) % CANDIES.length], into: false, share: 0 });
  }

  function update(t) {
    if (!L) return false;
    for (let i = flying.length - 1; i >= 0; i--) {
      const f = flying[i];
      if (t < f.t0 + f.dur) continue;
      flying.splice(i, 1);
      if (f.into) { incoming = Math.max(0, incoming - f.share); popAt = t; world.audio.play('candy'); }
    }
    return flying.length > 0 || t - popAt < 0.4;
  }

  function draw(g, t) {
    if (!L) return;
    const r = rect(), shown = Math.max(0, Math.round(world.game.state.candy - incoming));
    const pop = t - popAt < 0.4 ? 1 + Math.sin((t - popAt) / 0.4 * Math.PI) * 0.18 : 1, fs = r.h * 0.6;
    g.save();
    g.translate(r.x + r.w / 2, r.y + r.h / 2);
    g.scale(pop, pop);
    const w = r.w, h = r.h, x0 = -w / 2, y0 = -h / 2;
    g.fillStyle = 'rgba(60,25,10,.3)';
    g.beginPath(); g.roundRect ? g.roundRect(x0, y0 + h * 0.08, w, h, h / 2) : g.rect(x0, y0, w, h); g.fill();
    g.fillStyle = '#FFF4DE'; g.strokeStyle = '#6E3A1C'; g.lineWidth = Math.max(2, h * 0.07);
    g.beginPath(); g.roundRect ? g.roundRect(x0, y0, w, h, h / 2) : g.rect(x0, y0, w, h); g.fill(); g.stroke();
    const icon = img(CANDIES[2]), iw = h * 1.15, ih = iw * 120 / 180;
    if (icon) g.drawImage(icon, x0 + h * 0.2, -ih / 2, iw, ih);
    g.font = `900 ${Math.round(fs)}px "Microsoft YaHei",sans-serif`;
    g.fillStyle = '#5A2A12'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(String(shown), x0 + h * 0.2 + iw + (w - h * 0.2 - iw) / 2 - h * 0.1, fs * 0.05);
    g.restore();
    for (const f of flying) {
      if (t < f.t0) continue;
      const k = clamp((t - f.t0) / f.dur, 0, 1), e = easeInOut(k), im = img(f.k), cw = L.m * 0.05, ch = cw * 120 / 180;
      if (!im) continue;
      const x = lerp(f.x0, f.x1, e), y = lerp(f.y0, f.y1, e) - Math.sin(k * Math.PI) * L.m * 0.12;
      g.save(); g.translate(x, y); g.rotate(k * 8); g.drawImage(im, -cw / 2, -ch / 2, cw, ch); g.restore();
    }
  }

  return { flyIn, flyOut, update, draw, pos: () => L && iconAt(), relayout: next => { L = next; }, clear: () => { flying.length = 0; incoming = 0; } };
}
