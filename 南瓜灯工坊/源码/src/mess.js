// 观众捣乱：妖风、黑猫、女巫、小鬼。一个一个来（同一种连着送就合成一批），塔空了就扑个空、这一批作废。
// 不给糖就捣蛋：每个捣蛋鬼先停下来讨糖（头上冒价钱和倒计时），主播点它就给糖，它吃了糖开心走掉；
// 不给、糖不够、倒计时走完，它才去捣乱。
// 妖风：贴着塔往上卷，上面四成飞出去。黑猫：蹲在塔顶旁边，一爪子拍掉一盏，送几下拍几盏。
// 女巫：在要撞的那一层亮警告线，飞过来撞倒那一层往上。小鬼：叼走塔顶那盏飘走，主播点它几下还能抢回来。
import { img, CANDIES } from './assets.js';
import { MESS_NAMES } from './rules.js';
import { clamp, lerp, easeInOut, easeOut, easeIn } from './tween.js';

const R = (a, b) => a + Math.random() * (b - a);
const RI = (a, b) => Math.floor(R(a, b + 1));

export function createMess(world, tower) {
  const queue = [];
  let actor = null, L = null, gapUntil = 0, announced = null;
  const now = () => world.now();
  const T = () => L.tower.size;
  const inward = () => (L.flip ? 1 : -1);   // 从塔指向画面中间
  const outward = () => -inward();
  const count = () => world.game.state.tower.length;
  const settings = () => world.settings();

  function add(kind, n, nick) {
    if (!MESS_NAMES[kind] || !(n > 0)) return;
    const last = queue.at(-1);
    if (last && last.kind === kind) { last.left += n; last.total += n; if (!last.nicks.includes(nick)) last.nicks.push(nick); }
    else queue.push({ kind, left: n, total: n, nicks: [nick] });
  }

  /** 塔只剩最下面摔不碎的那几层时，推倒也只会弹一下跳回去：这一批演过一次就收工，不然一万只猫能拍一个钟头。 */
  const standing = () => world.game.state.tower.length + world.game.state.air.length;   // 还在天上掉的也算，落地可能没碎又跳回去
  const harmless = b => b.kind !== 'ghost' && b.acted > 0 && standing() <= settings().tower.safeLayers;

  function start(t) {
    const b = queue[0];
    if (!b) return;
    if (harmless(b)) { fizzle(b, true); queue.shift(); gapUntil = t; return; }
    b.acted = (b.acted || 0) + 1;
    const who = b.nicks.length > 1 ? b.nicks[0] + ' 等' + b.nicks.length + '人' : b.nicks[0];
    if (announced !== b) world.banner(who + ' 叫来了' + MESS_NAMES[b.kind] + (b.total > 1 ? ' ×' + b.total : ''), b.kind);
    announced = b;
    const make = { wind: startWind, cat: startCat, witch: startWitch, ghost: startGhost }[b.kind];
    actor = make(t, b);
    actor.batch = b;
  }

  function done(t, gap = 0.5) {
    const b = actor?.batch;
    actor = null;
    gapUntil = t + gap;
    if (b && b.left <= 0) queue.shift();
  }

  function fizzle(b, tired = false) {
    if (b.left > 1) world.say(tired ? MESS_NAMES[b.kind] + '闹累了，剩下的 ' + b.left + ' 下不算了' : MESS_NAMES[b.kind] + '扑了个空（塔是空的）');
    b.left = 0;
  }

  // ---------- 讨糖 ----------
  const unit = kind => settings().candy.price[kind] ?? 2;
  /** 开始讨糖：塔上有灯才讨（没东西可捣乱就不讨）。黑猫一次讨它这一批全部的（拍几下 × 单价）。 */
  function ask(a, t, seconds) {
    const price = a.kind === 'cat' ? unit('cat') * Math.max(1, a.batch.left) : unit(a.kind);
    a.ask = { price, t0: t, seconds: Math.max(0.5, seconds), shake: -9 };
    a.phase = 'ask';
    world.audio.play(a.kind === 'witch' ? 'witch' : a.kind === 'cat' ? 'cat' : 'ghost');
  }
  const askLeft = (a, t) => (a.ask ? a.ask.seconds - (t - a.ask.t0) : 0);
  /** 给了糖：这一个（黑猫是这一批）不捣乱了，开心走掉。 */
  function paid(a, t) {
    if (a.kind === 'cat') a.batch.left = 0; else a.batch.left--;
    a.phase = 'thanks'; a.t0 = t; a.fromX = a.x; a.fromY = a.y; a.ask = null;
    world.fx.add({ kind: 'text', text: '谢谢糖！', x: a.x, y: a.y - a.size * 0.75, vy: -50 * L.u, size: L.m * 0.032, life: 1.2, fade: 0.4, pop: true, color: '#FFE3F0' });
    for (let i = 0; i < 10; i++) { const ang = R(0, Math.PI * 2), v = R(140, 320) * L.u; world.fx.add({ kind: 'spark', x: a.x, y: a.y - a.size * 0.2, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v - 100 * L.u, g: 500 * L.u, r: a.size * R(0.05, 0.09), life: R(0.5, 0.9), color: 'rgba(255,150,200,.85)', core: 'rgba(255,240,250,1)' }); }
    world.audio.play('sprite');
  }

  /** 点捣蛋鬼：讨糖的时候点 = 给糖；小鬼叼着灯的时候点 = 抢灯。 */
  function click(x, y) {
    const a = actor;
    if (!a || !L) return false;
    if (a.phase === 'ask') {
      const b = bubbleRect(a), onBubble = b && x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h;
      if (!onBubble && Math.hypot(x - a.x, y - a.y) > a.size * 0.75) return false;
      if (world.payCandy(a.ask.price, { x: a.x, y: a.y })) paid(a, now());
      else { a.ask.shake = now(); world.audio.play('miss'); world.fx.add({ kind: 'text', text: '糖不够！', x: a.x, y: a.y + a.size * 0.55, vy: -40 * L.u, size: L.m * 0.028, life: 0.9, fade: 0.4, pop: true, color: '#FFB0A0' }); }
      return true;
    }
    if (a.kind === 'ghost' && a.phase === 'carry') return hitGhost(a, x, y);
    return false;
  }

  // ---------- 妖风 ----------
  function startWind(t) {
    const size = L.m * 0.34, x = L.tower.x + inward() * T() * 0.7, a = { kind: 'wind', t0: t, x, y: L.floor - size * 0.35, size, hit: false };
    if (count()) ask(a, t, settings().mess.askSeconds); else { a.phase = 'blow'; world.audio.play('wind'); }
    return a;
  }
  function stepWind(a, t, dt) {
    if (a.phase === 'ask') {
      a.y = L.floor - a.size * 0.35 + Math.sin(t * 3) * a.size * 0.04;
      if (askLeft(a, t) <= 0) { a.phase = 'blow'; a.t0 = t; a.ask = null; world.audio.play('wind'); }
      return;
    }
    if (a.phase === 'thanks') { if (t - a.t0 > 0.9) done(t); return; }
    const k = (t - a.t0) / 1.6, top = tower.topAnchor();
    const ty = Math.max(L.m * 0.15, top.y);
    a.y = lerp(L.floor - a.size * 0.35, ty - a.size * 0.2, easeInOut(clamp(k / 0.7, 0, 1)));
    a.x = L.tower.x + inward() * T() * (0.55 - 0.35 * Math.sin(k * 9));
    if (k < 0.75) tower.push(Math.sin(t * 14) > 0 ? 1 : -1, 10 * dt);
    if (!a.hit && k >= 0.7) {
      a.hit = true;
      const n = count();
      if (!n) { fizzle(a.batch); return; }
      a.batch.left--;
      tower.knock(Math.max(0, n - Math.max(1, Math.ceil(n * 0.4))), Math.random() < 0.5 ? 1 : -1, 1.2);
    }
    if (k >= 1) done(t);
  }

  // ---------- 黑猫 ----------
  // 从塔里侧的屏幕底下蹦上来，蹲在塔顶旁边讨糖；不给就朝外一爪子一盏；拍完跳回屏幕底下。
  const CAT_FACING = [1, 1, 1, -1, 0, 0];   // 每一帧图本来朝哪边（1 朝右，-1 朝左，0 正面）
  function startCat(t) {
    const size = L.m * 0.2, spot = catSpot();
    world.audio.play('cat');
    const fromX = spot.x + inward() * L.m * 0.22, fromY = L.H + size * 0.6;
    return { kind: 'cat', t0: t, phase: 'in', size, x: fromX, y: fromY, fromX, fromY, frame: 0, swats: 0 };
  }
  function catSpot() {
    const size = L.m * 0.2, top = tower.topAnchor();
    return { x: clamp(L.tower.x + inward() * T() * 0.62, size * 0.5, L.W - size * 0.5), y: clamp(top.y + T() * 0.2, L.m * 0.2, L.floor - T() * 0.3) };
  }
  const leaveCat = (a, t) => { a.phase = 'out'; a.t0 = t; a.fromX = a.x; a.fromY = a.y; };
  function stepCat(a, t) {
    const d = t - a.t0;
    if (a.phase === 'in') {
      const to = catSpot(), k = clamp(d / 0.6, 0, 1);
      a.x = lerp(a.fromX, to.x, easeOut(k)); a.y = lerp(a.fromY, to.y, easeOut(k)) - Math.sin(k * Math.PI) * L.m * 0.12; a.frame = 0;
      if (k >= 1) { if (count()) ask(a, t, settings().mess.askSeconds); else { a.phase = 'puzzled'; a.t0 = t; fizzle(a.batch); } }
      return;
    }
    if (a.phase === 'ask') {
      const to = catSpot();
      a.x += (to.x - a.x) * 0.2; a.y += (to.y - a.y) * 0.2; a.frame = 1;
      if (askLeft(a, t) <= 0) { a.phase = 'swat'; a.t0 = t; a.ask = null; }
      return;
    }
    if (a.phase === 'thanks') { a.frame = 4; if (d > 0.8) leaveCat(a, t); return; }
    if (a.phase === 'swat') {
      const to = catSpot();
      a.x += (to.x - a.x) * 0.3; a.y += (to.y - a.y) * 0.3;
      a.frame = d < 0.18 ? 2 : d < 0.42 ? 3 : 1;
      if (d >= 0.22 && !a.hitDone) {
        a.hitDone = true;
        const n = count();
        if (n) { tower.knock(n - 1, outward(), 0.9); a.batch.left--; a.swats++; world.audio.play('cat'); }
      }
      if (d >= 0.55) {
        a.hitDone = false; a.t0 = t;
        const tired = a.batch.left > 0 && standing() <= settings().tower.safeLayers;
        if (a.batch.left <= 0 || !count() || tired) { if (a.batch.left > 0) fizzle(a.batch, tired); leaveCat(a, t); }
      }
      return;
    }
    if (a.phase === 'puzzled') { a.frame = 5; if (d > 0.8) leaveCat(a, t); return; }
    if (a.phase === 'out') {
      const k = clamp(d / 0.55, 0, 1);
      a.x = lerp(a.fromX, a.fromX + inward() * L.m * 0.25, k); a.y = lerp(a.fromY, L.H + a.size, easeIn(k)) - Math.sin(k * Math.PI) * L.m * 0.08; a.frame = 0;
      if (k >= 1) done(t);
    }
  }
  const catFlip = a => { const want = a.phase === 'out' ? inward() : outward(), f = CAT_FACING[a.frame] || 0; return f !== 0 && f !== want; };

  // ---------- 女巫 ----------
  // 停在画面另一边那一层的高度讨糖（亮警告线）；不给就横着飞过来撞塔。
  function startWitch(t) {
    const n = count(), size = L.m * 0.36, layer = n ? RI(Math.ceil(n / 2), n) : 0;
    const a = { kind: 'witch', t0: t, size, layer, x: 0, y: 0, rot: 0, frame: 0, empty: !n };
    a.x = witchHome(a); a.y = witchY(a);
    if (n) ask(a, t, Math.max(settings().mess.witchWarning, settings().mess.askSeconds));
    else { a.phase = 'fly'; a.y0 = a.y; world.audio.play('witch'); }
    return a;
  }
  const witchHome = a => (L.flip ? L.W - a.size * 0.55 : a.size * 0.55);
  function witchY(a) {
    const st = tower.stack(), p = st[a.layer - 1];
    return clamp(p ? p.y - T() * 0.4 : L.floor - T() * 0.5, L.m * 0.2, L.floor - T() * 0.3);
  }
  function stepWitch(a, t, dt) {
    const d = t - a.t0;
    if (a.phase === 'ask') {
      a.x = witchHome(a); a.y = witchY(a) + Math.sin(t * 4) * L.m * 0.012; a.frame = Math.floor(t * 4) % 2;
      if (askLeft(a, t) <= 0) { a.phase = 'fly'; a.t0 = t; a.y0 = a.y; a.ask = null; world.audio.play('witch'); }
      return;
    }
    if (a.phase === 'thanks') {
      const k = clamp(d / 1.1, 0, 1);
      a.frame = 1; a.x = lerp(a.fromX, a.fromX + inward() * L.m * 0.3, k); a.y = lerp(a.fromY, -a.size, easeIn(k));
      if (k >= 1) done(t);
      return;
    }
    if (a.phase === 'fly') {
      const from = witchHome(a), target = L.tower.x + inward() * T() * 0.35, k = clamp(d / 0.9, 0, 1);
      a.x = lerp(from, target, easeIn(k)); a.y = a.y0 + Math.sin(t * 9) * L.m * 0.01; a.frame = Math.floor(t * 8) % 2;
      if (k >= 1) {
        a.phase = 'crash'; a.t0 = t; a.vx = outward() * 260 * L.u; a.vy = -520 * L.u; a.rot = 0;
        const n = count();
        if (!a.empty && n) { tower.knock(Math.min(n - 1, a.layer - 1), outward(), 1.4); world.audio.play('collapse'); }
        if (!n) fizzle(a.batch); else a.batch.left--;
        world.fx.add({ kind: 'ring', x: a.x, y: a.y, r0: a.size * 0.1, r1: a.size * 0.6, width: a.size * 0.05, life: 0.4, color: '#FFF0C0' });
      }
      return;
    }
    if (a.phase === 'crash') {
      a.vy += 2400 * L.u * dt; a.x += a.vx * dt; a.y += a.vy * dt; a.rot += outward() * 9 * dt; a.frame = 2;
      if (a.y > L.H + a.size) done(t);
    }
  }

  // ---------- 小鬼 ----------
  function startGhost(t) {
    const size = L.m * 0.17, top = tower.topAnchor();
    world.audio.play('ghost');
    return { kind: 'ghost', t0: t, phase: 'in', size, x: top.x, y: -size, fromY: -size, hits: 0, carry: null, shake: -9, frame: 0 };
  }
  const ghostSpot = () => { const top = tower.topAnchor(); return { x: clamp(top.x + inward() * T() * 0.35, L.m * 0.12, L.W - L.m * 0.12), y: clamp(top.y - T() * 0.95, L.m * 0.2, L.H) }; };
  function grab(a, t) {
    const got = count() ? tower.detachTop() : null;
    if (!got) { fizzle(a.batch); a.phase = 'leave'; a.t0 = t; a.fromX = a.x; a.fromY = a.y; return; }
    a.batch.left--;
    a.carry = got; a.phase = 'carry'; a.t0 = t; a.fromX = a.x; a.fromY = a.y;
    world.audio.play('ghost');
  }
  function stepGhost(a, t) {
    const d = t - a.t0, s = settings().mess;
    a.frame = Math.floor(t * 5) % 3;
    if (a.phase === 'in') {
      const k = clamp(d / 0.8, 0, 1), sp = ghostSpot();
      a.x = lerp(a.x, sp.x, 0.2); a.y = lerp(a.fromY, sp.y, easeOut(k));
      if (k >= 1) { if (count()) ask(a, t, s.askSeconds); else grab(a, t); }
      return;
    }
    if (a.phase === 'ask') {
      const sp = ghostSpot();
      a.x += (sp.x - a.x) * 0.15; a.y = sp.y + Math.sin(t * 3.4) * a.size * 0.08;
      if (askLeft(a, t) <= 0) { a.ask = null; grab(a, t); }
      return;
    }
    if (a.phase === 'thanks') { a.phase = 'leave'; a.t0 = t; a.fromX = a.x; a.fromY = a.y; return; }
    if (a.phase === 'carry') {
      const k = clamp(d / s.ghostSeconds, 0, 1), toX = L.flip ? -a.size * 2 : L.W + a.size * 2;
      a.x = lerp(a.fromX, toX, easeIn(k)) + Math.sin(t * 2.4) * L.m * 0.03;
      a.y = lerp(a.fromY, L.m * 0.1, k) + Math.sin(t * 3.1) * L.m * 0.02;
      if (k >= 1) {
        world.game.lose(a.carry.lantern); world.changed();
        world.say('小鬼把 ' + a.carry.lantern.nick + ' 的灯拿走了，重做一个');
        a.carry = null; done(t);
      }
      return;
    }
    if (a.phase === 'leave') {
      const k = clamp(d / 0.8, 0, 1);
      a.y = lerp(a.fromY, -a.size * 1.5, easeIn(k));
      if (k >= 1) done(t);
    }
  }

  function hitGhost(a, x, y) {
    if (Math.hypot(x - a.x, y - (a.y + a.size * 0.3)) > a.size * 0.9) return false;
    a.hits++; a.shake = now();
    world.audio.play('ghost');
    world.fx.add({ kind: 'ring', x: a.x, y: a.y, r0: a.size * 0.2, r1: a.size * 0.7, width: a.size * 0.06, life: 0.3, color: '#E9E1FF' });
    if (a.hits >= settings().mess.ghostHits) {
      const at = { x: a.x, y: a.y + a.size * 0.75 };
      tower.rescue(a.carry.lantern, at);
      world.fx.add({ kind: 'img', sprite: img('smoke'), x: a.x, y: a.y, w: a.size * 1.2, h: a.size, grow: 0.8, life: 0.6, alpha: 0.85, fade: 0.7 });
      world.fx.add({ kind: 'text', text: '抢回来了！', x: a.x, y: a.y - a.size * 0.6, vy: -60 * L.u, size: L.m * 0.034, life: 1.3, pop: true });
      world.audio.play('sprite');
      a.carry = null;
      done(now(), 0.3);
    }
    return true;
  }

  // ---------- 每帧 ----------
  function update(t, dt) {
    if (!L) return false;
    if (!actor && queue.length && t >= gapUntil) start(t);
    if (!actor) return queue.length > 0;
    ({ wind: stepWind, cat: stepCat, witch: stepWitch, ghost: stepGhost })[actor.kind](actor, t, dt);
    return true;
  }

  function sprite(g, key, x, y, size, { rot = 0, flip = false, alpha = 1, scale = 1 } = {}) {
    const im = img(key);
    if (!im) return;
    const w = size * scale, h = w * im.height / im.width;
    g.save(); g.globalAlpha = alpha; g.translate(x, y); g.rotate(rot); if (flip) g.scale(-1, 1);
    g.drawImage(im, -w / 2, -h / 2, w, h);
    g.restore();
  }

  function draw(g, t) {
    const a = actor;
    if (!a || !L) return;
    const happy = a.phase === 'thanks' ? 1 + Math.sin((t - a.t0) * 18) * 0.06 * Math.max(0, 1 - (t - a.t0)) : 1;
    if (a.kind === 'wind') sprite(g, 'wind-' + (Math.floor(t * (a.phase === 'ask' ? 5 : 10)) % 3), a.x, a.y, a.size, { rot: Math.sin(t * 6) * 0.15, alpha: a.phase === 'thanks' ? Math.max(0, 1 - (t - a.t0) / 0.9) : Math.min(1, (t - a.t0) * 4 + 0.3), scale: a.phase === 'thanks' ? 1 + (t - a.t0) * 0.6 : 1 });
    if (a.kind === 'cat') sprite(g, 'cat-' + a.frame, a.x, a.y, a.size, { flip: catFlip(a), scale: happy });
    if (a.kind === 'witch') {
      if (a.phase === 'ask') drawWarning(g, a, t);
      sprite(g, 'witch-' + a.frame, a.x, a.y, a.size, { rot: a.rot, flip: L.flip, scale: happy });
    }
    if (a.kind === 'ghost') {
      const shake = t - a.shake < 0.25 ? Math.sin((t - a.shake) * 60) * a.size * 0.06 : 0;
      if (a.carry) {
        const lamp = tower.spriteOf(a.carry.lantern);
        if (lamp) { const size = T() * 0.9; g.save(); g.translate(a.x + shake, a.y + a.size * 0.35); g.rotate(Math.sin(t * 3) * 0.12); g.drawImage(lamp, -size / 2, -size * 0.1, size, size); g.restore(); }
      }
      sprite(g, 'ghost-' + a.frame, a.x + shake, a.y, a.size, { scale: happy });
      if (a.phase === 'carry') drawPips(g, a);
    }
    if (a.phase === 'ask') drawBubble(g, a, t);
  }

  /** 讨糖气泡放在哪：捣蛋鬼头顶（贴着画面边就往里挪）。 */
  function bubbleRect(a) {
    if (!a.ask) return null;
    const fs = L.m * 0.026, w = fs * 8.6, h = fs * 3.9;
    const x = clamp(a.x - w / 2, L.margin * 0.5, L.W - w - L.margin * 0.5);
    let y = a.y - a.size * 0.62 - h;
    if (y < L.margin * 0.5) y = a.y + a.size * 0.55;
    return { x, y, w, h, fs };
  }

  /** 「不给糖就捣蛋！」+ 糖 ×价钱 + 倒计时条。糖不够时价钱变红。 */
  function drawBubble(g, a, t) {
    const b = bubbleRect(a);
    if (!b) return;
    const left = clamp(askLeft(a, t) / a.ask.seconds, 0, 1), afford = world.game.state.candy >= a.ask.price;
    const shake = t - a.ask.shake < 0.35 ? Math.sin((t - a.ask.shake) * 50) * b.fs * 0.4 : 0;
    const pulse = 1 + Math.sin(t * 7) * 0.025;
    g.save();
    g.translate(b.x + b.w / 2 + shake, b.y + b.h / 2);
    g.scale(pulse, pulse);
    const x0 = -b.w / 2, y0 = -b.h / 2, r = b.fs * 0.9;
    g.fillStyle = 'rgba(60,25,10,.3)';
    g.beginPath(); g.roundRect ? g.roundRect(x0, y0 + b.fs * 0.2, b.w, b.h, r) : g.rect(x0, y0, b.w, b.h); g.fill();
    g.fillStyle = '#FFF6E6'; g.strokeStyle = '#6E3A1C'; g.lineWidth = Math.max(2, b.fs * 0.14);
    g.beginPath(); g.roundRect ? g.roundRect(x0, y0, b.w, b.h, r) : g.rect(x0, y0, b.w, b.h); g.fill(); g.stroke();
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `900 ${Math.round(b.fs)}px "Microsoft YaHei",sans-serif`;
    g.fillStyle = '#7A3B18';
    g.fillText('不给糖就捣蛋！', 0, y0 + b.fs * 1.0);
    const icon = img(CANDIES[2]), iw = b.fs * 2.1, ih = iw * 120 / 180, py = y0 + b.fs * 2.45;
    g.font = `900 ${Math.round(b.fs * 1.45)}px "Microsoft YaHei",sans-serif`;
    const text = '×' + a.ask.price, tw = g.measureText(text).width, x = -(iw + tw) / 2;
    if (icon) g.drawImage(icon, x, py - ih / 2, iw, ih);
    g.textAlign = 'left';
    g.fillStyle = afford ? '#5A2A12' : '#D2381E';
    g.fillText(text, x + iw + b.fs * 0.1, py + b.fs * 0.05);
    // 倒计时：底边一条，越来越短
    g.fillStyle = 'rgba(122,59,24,.18)';
    g.fillRect(x0 + r * 0.6, y0 + b.h - b.fs * 0.55, b.w - r * 1.2, b.fs * 0.28);
    g.fillStyle = left > 0.35 ? '#FF9F43' : '#E5532D';
    g.fillRect(x0 + r * 0.6, y0 + b.h - b.fs * 0.55, (b.w - r * 1.2) * left, b.fs * 0.28);
    g.restore();
    if (!afford) {   // 不够：气泡下面小字
      g.save();
      g.font = `800 ${Math.round(b.fs * 0.8)}px "Microsoft YaHei",sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'top'; g.lineJoin = 'round';
      g.lineWidth = b.fs * 0.25; g.strokeStyle = '#4A2410'; g.strokeText('糖不够', b.x + b.w / 2, b.y + b.h + b.fs * 0.3);
      g.fillStyle = '#FFD0C0'; g.fillText('糖不够', b.x + b.w / 2, b.y + b.h + b.fs * 0.3);
      g.restore();
    }
  }

  function drawWarning(g, a, t) {
    const y = witchY(a), blink = Math.floor(t * 6) % 2 === 0;
    const x0 = a.x + inward() * -a.size * 0.3, x1 = L.tower.x;
    g.save();
    g.setLineDash([L.m * 0.02, L.m * 0.014]);
    g.strokeStyle = blink ? 'rgba(255,90,60,.9)' : 'rgba(255,200,80,.85)'; g.lineWidth = L.m * 0.006;
    g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.stroke();
    g.restore();
  }

  function drawPips(g, a) {
    const n = settings().mess.ghostHits, r = a.size * 0.07, y = a.y - a.size * 0.72;
    g.save();
    for (let i = 0; i < n; i++) {
      const x = a.x + (i - (n - 1) / 2) * r * 2.6;
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2);
      g.fillStyle = i < a.hits ? '#FFD45C' : 'rgba(255,244,222,.5)'; g.fill();
      g.lineWidth = Math.max(1.5, r * 0.3); g.strokeStyle = '#4A2410'; g.stroke();
    }
    g.font = `900 ${Math.round(a.size * 0.16)}px "Microsoft YaHei",sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    g.lineWidth = a.size * 0.05; g.strokeStyle = '#4A2410'; g.strokeText('点它抢回来', a.x, y - r * 2.6);
    g.fillStyle = '#FFF4DE'; g.fillText('点它抢回来', a.x, y - r * 2.6);
    g.restore();
  }

  function info() { return { queue: queue.map(b => ({ kind: b.kind, left: b.left, acted: b.acted || 0 })), gapIn: Math.max(0, gapUntil - now()), actor: actor && { kind: actor.kind, phase: actor.phase, x: actor.x, y: actor.y, hits: actor.hits, price: actor.ask?.price ?? null, bubble: bubbleRect(actor) } }; }
  function clear() { queue.length = 0; if (actor?.carry) world.game.lose(actor.carry.lantern); actor = null; }

  return { add, update, draw, click, info, clear, relayout: next => { L = next; }, get active() { return !!actor || queue.length > 0; } };
}
