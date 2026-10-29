// 南瓜精灵（观众送「帮做礼物」派来的）：带着送礼人的名字飞到排队最前面的南瓜上，挥一下魔法棒，
// 南瓜直接变成亮着的灯（点名要的脸就刻那张，没点名就随机一张），跳到塔上。送几个帮几盏；主播工作台上那个不动。
// 排队的做完了，精灵说「做完啦」飞走，剩下的不算。
import { img } from './assets.js';
import { moldPolygons } from './molds.js';
import { queueSlot } from './layout.js';
import { clamp, lerp, easeOut, easeIn } from './tween.js';

const R = (a, b) => a + Math.random() * (b - a);
const q = p => p.map(([x, y]) => [Math.round(x * 1023), Math.round(y * 1023)]);

export function createHelper(world, tower) {
  const queue = [];
  let actor = null, L = null;
  const size = () => L.m * 0.15;

  function add(nick, uid, n) {
    if (!(n > 0)) return;
    const last = queue.at(-1);
    if (last && last.uid === uid) last.left += n; else queue.push({ nick, uid, left: n });
    world.say(nick + ' 派来南瓜精灵，帮主播做 ' + n + ' 盏');
  }

  const target = () => { const s = queueSlot(L, 0); return { x: s.x, y: s.y - size() * 0.35 }; };

  function start(t) {
    const b = queue.shift(), tg = target();
    actor = { b, phase: 'in', t0: t, x: tg.x + L.m * 0.25 * (L.flip ? 1 : -1), y: -size(), fromX: tg.x + L.m * 0.25 * (L.flip ? 1 : -1), fromY: -size(), made: 0 };
    world.audio.play('sprite');
  }

  function cast(a, t) {
    const job = world.game.state.queue[0];
    if (!job) { a.phase = 'bye'; a.t0 = t; world.fx.add({ kind: 'text', text: '排队的都做完啦', x: a.x, y: a.y - size() * 0.7, vy: -40 * L.u, size: L.m * 0.026, life: 1.4, pop: true }); return; }
    const molds = world.settings().making.molds, id = job.face && molds.includes(job.face) ? job.face : molds[Math.floor(Math.random() * molds.length)] || 'classic';
    const got = world.game.helpMake([{ kind: 'hole', paths: moldPolygons(id).map(q) }], { nick: a.b.nick, uid: a.b.uid });
    if (!got) { a.phase = 'bye'; a.t0 = t; return; }
    world.changed();
    const s = queueSlot(L, 0), qs = L.queue.size;
    tower.arrive(got.lantern, { x: s.x, bottom: s.y + qs * 0.93, size: qs, fresh: true });
    const cx = s.x, cy = s.y + qs * 0.55;
    world.fx.add({ kind: 'flash', x: cx, y: cy, r: qs * 0.9, life: 0.5, fade: 0.9 });
    for (let i = 0; i < 12; i++) { const ang = R(0, Math.PI * 2), v = R(160, 380) * L.u; world.fx.add({ kind: 'spark', x: cx, y: cy, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v - 120 * L.u, g: 500 * L.u, r: qs * R(0.05, 0.09), life: R(0.5, 0.9), color: 'rgba(255,230,140,.85)' }); }
    world.audio.play('light');
    a.b.left--; a.made++;
  }

  function update(t) {
    if (!L) return false;
    if (!actor && queue.length) start(t);
    const a = actor;
    if (!a) return false;
    const d = t - a.t0, tg = target();
    if (a.phase === 'in') {
      const k = clamp(d / 0.7, 0, 1);
      a.x = lerp(a.fromX, tg.x, easeOut(k)); a.y = lerp(a.fromY, tg.y, easeOut(k));
      if (k >= 1) { a.phase = 'cast'; a.t0 = t; }
    } else if (a.phase === 'cast') {
      a.x += (tg.x - a.x) * 0.2; a.y = tg.y + Math.sin(t * 5) * size() * 0.05;
      if (d >= 0.5) { cast(a, t); if (a.phase === 'cast') { a.phase = 'next'; a.t0 = t; } }
    } else if (a.phase === 'next') {
      a.x += (tg.x - a.x) * 0.2; a.y = tg.y + Math.sin(t * 5) * size() * 0.05;
      if (d >= 0.35) {
        if (a.b.left > 0 && world.game.state.queue.length) { a.phase = 'cast'; a.t0 = t; }
        else { if (a.b.left > 0 && !world.game.state.queue.length) world.fx.add({ kind: 'text', text: '排队的都做完啦', x: a.x, y: a.y - size() * 0.7, vy: -40 * L.u, size: L.m * 0.026, life: 1.4, pop: true }); a.phase = 'out'; a.t0 = t; a.fromX = a.x; a.fromY = a.y; }
      }
    } else if (a.phase === 'bye') {
      if (d >= 0.9) { a.phase = 'out'; a.t0 = t; a.fromX = a.x; a.fromY = a.y; }
    } else if (a.phase === 'out') {
      const k = clamp(d / 0.7, 0, 1);
      a.x = lerp(a.fromX, a.fromX + L.m * 0.2 * (L.flip ? -1 : 1), k); a.y = lerp(a.fromY, -size() * 1.5, easeIn(k));
      if (k >= 1) actor = null;
    }
    return true;
  }

  function draw(g, t) {
    const a = actor;
    if (!a || !L) return;
    const frame = a.phase === 'cast' ? 2 : a.phase === 'next' || a.phase === 'bye' ? 1 : 0, im = img('sprite-' + frame), s = size();
    if (im) { g.save(); g.translate(a.x, a.y); g.rotate(Math.sin(t * 4) * 0.08); g.drawImage(im, -s / 2, -s / 2, s, s); g.restore(); }
    const fs = Math.round(L.m * 0.022), text = a.b.nick + ' 的南瓜精灵';
    g.save();
    g.font = `900 ${fs}px "Microsoft YaHei",sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    g.lineWidth = fs * 0.3; g.strokeStyle = '#3A1E0C'; g.strokeText(text, a.x, a.y - s * 0.62);
    g.fillStyle = '#FFF1C0'; g.fillText(text, a.x, a.y - s * 0.62);
    g.restore();
  }

  function info() { return { queue: queue.map(b => ({ nick: b.nick, left: b.left })), actor: actor && { phase: actor.phase, nick: actor.b.nick, made: actor.made, left: actor.b.left } }; }
  function clear() { queue.length = 0; actor = null; }

  return { add, update, draw, info, clear, relayout: next => { L = next; }, get active() { return !!actor || queue.length > 0; } };
}
