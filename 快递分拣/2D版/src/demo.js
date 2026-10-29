/* 自动演示：一个假光标自己拿件、拆盲盒、撕封条、修桶底，每隔几秒随机来一份礼物。演示视频和试玩用 */
import { G, toScreen } from './state.js';
import { pos, pinned, binHolding, tear, counterX } from './items.js';
import { grab, release, startLevel, nextLevel } from './play.js';
import { gift, hitBlind, hitSeal, hitLeak } from './effects.js';
import { $, rnd, lerp, eIO, NAMES } from './util.js';

export const demo = { on: false, forceWrong: 0, giftT: 2.5, x: 0, y: 0, tw: null, wait: .6, box: null };
const GIFTS = [['truck', .2], ['blind', .08], ['seal', .08], ['speed', .07], ['leak', .07], ['strip', .08], ['tape', .08], ['kick', .07], ['help', .07], ['audit', .06], ['prank', .07], ['tricky', .07]];
function gtw(x, y, dur, cb) { demo.tw = { fx: demo.x, fy: demo.y, tx: x, ty: y, t: 0, dur, cb }; }
function randomGift() {
  let r = Math.random(), t = 'truck'; for (const [k, p] of GIFTS) { if (r < p) { t = k; break; } r -= p; }
  if (t === 'tricky' && G.S.mode !== 'garbage') t = 'truck';
  const L = G.S.tiers[t]; gift(t, NAMES[Math.floor(Math.random() * NAMES.length)], undefined, L[Math.floor(Math.random() * L.length)].id);
}
export function updDemo(dt) {
  const gh = $('ghost'); gh.style.display = demo.on ? 'block' : 'none'; $('demoPill').style.display = demo.on ? 'block' : 'none';
  if (!demo.on) return;
  demo.giftT -= dt; if (demo.giftT <= 0) { randomGift(); demo.giftT = rnd(5, 9); }
  if (G.state !== 'work' && G.doneT > 2.5 && G.S.afterLevel !== 'auto') { G.state === 'done' ? nextLevel() : startLevel(); }
  if (demo.tw) {
    const w = demo.tw; w.t += dt; const k = eIO(Math.min(1, w.t / w.dur)); demo.x = lerp(w.fx, w.tx, k); demo.y = lerp(w.fy, w.ty, k);
    if (G.held && G.held.b === demo.box) { G.held.sx = demo.x; G.held.sy = demo.y; }
    if (w.t >= w.dur) { demo.tw = null; w.cb && w.cb(); }
  } else if (!G.held) { demo.wait -= dt; if (demo.wait <= 0 && G.state === 'work') decide(); }
  gh.style.transform = `translate(${demo.x - 2}px,${demo.y - 2}px)`;
}
function decide() {
  const L = G.L, clickAt = (p, fn) => { const s = toScreen(p); gtw(s.x, s.y, Math.hypot(s.x - demo.x, s.y - demo.y) < 12 ? .1 : .35, () => { fn(); demo.wait = .14; }); };
  const blind = G.items.find(b => b.st === 'free' && b.blind && !b.falling);
  const sealed = G.bins.find(b => b.seal && b.seal.t > 4), leaky = G.bins.find(b => b.leak && G.time - b.leak.t0 > 5);
  if (blind) { clickAt(pos(blind), () => { if (blind.st === 'free' && blind.blind) hitBlind(blind); }); return; }
  if (sealed && Math.random() < .6) { clickAt({ x: sealed.x, y: sealed.top - .35 }, () => hitSeal(sealed)); return; }
  if (leaky && Math.random() < .6) { clickAt({ x: leaky.x, y: leaky.bottom + leaky.h * .4 }, () => hitLeak(leaky)); return; }
  const open = b => b.stripped || (G.bins[b.cat] && !G.bins[b.cat].seal && !G.bins[b.cat].leak);
  const c = G.items.filter(b => b.st === 'free' && !b.blind && !pinned(b) && !(b.onBelt && pos(b).x < L.belt.x0 + 1.2) && !(b.layer === 'front' && binHolding(b)) && open(b));
  const onPile = b => b.layer === 'back' && !b.onBelt;
  c.sort((a, b) => (onPile(b) - onPile(a)) || pos(b).y - pos(a).y);
  const b = c[0];
  if (!b) { demo.wait = .3; return; }
  const s = toScreen(pos(b));
  gtw(s.x, s.y, Math.hypot(s.x - demo.x, s.y - demo.y) < 12 ? .1 : .38, () => {
    if (b.st !== 'free' || pinned(b)) { demo.wait = .1; return; }
    if (b.tape > 0) { tear(b); demo.wait = .12; return; }
    grab(b, demo.x, demo.y); demo.box = b;
    const done = w => () => { if (G.held && G.held.b === b) release(); demo.box = null; demo.wait = w; };
    const toBin = () => {
      const own = G.bins[b.cat];
      if (!own || own.seal || own.leak) { const t = toScreen({ x: counterX(.5), y: L.counter.top + 2.2 }); gtw(t.x, t.y, .5, done(.3)); return; }
      // forceWrong：演示视频里让光标故意投错一次（正常自动演示 8% 失误）
      const wrong = demo.forceWrong > 0 || Math.random() < .08, bin = G.bins[wrong ? (b.cat + 1) % G.bins.length : b.cat]; if (demo.forceWrong > 0) demo.forceWrong--;
      const t = toScreen({ x: bin.x, y: bin.top + .45 + b.size[1] / 2 });
      gtw(t.x + rnd(-12, 12), t.y, b.big ? .8 : .55, done(rnd(.15, .45)));
    };
    if (b.stripped) { const t = toScreen({ x: L.scan.x, y: L.scan.top + .75 }); gtw(t.x, t.y, .5, () => gtw(t.x, t.y, (b.scanNeed || .7) + .3, toBin)); }
    else toBin();
  });
}
export function setDemo(on) {
  demo.on = on; demo.tw = null; if (!on && G.held && G.held.b === demo.box) release(); demo.box = null;
  const btn = $('demoBtn'); btn.classList.toggle('on', on); btn.textContent = on ? '■ 停止演示' : '▶ 自动演示';
}
