// 南瓜塔（照叠南瓜的样子）：一盏叠一盏，每层像弹簧一样晃；高出屏幕就在顶上写「↑ N 层」。
// 被推倒：上面那截飞出去，落地按层数决定碎不碎（碎了 = 碎片 + 糖果撒一地 + 那位观众重新排队）；没碎的弹一下，自己跳回塔顶。
import { img, CANDIES } from './assets.js';
import { renderLantern, shatter } from './lantern-art.js';
import { clamp, lerp, easeInOut } from './tween.js';

const R = (a, b) => a + Math.random() * (b - a);
const K = 70, C = 7;   // 弹簧硬度、阻尼

export function createTowerView(world) {
  const { game, fx } = world;
  const views = new Map();
  const falling = [];
  let L = null, nextHop = 0, textAt = -9, textRow = 0, cart = null;
  const now = () => world.now();
  const T = () => L.tower.size;
  const tower = () => game.state.tower;
  const view = l => { let v = views.get(l.id); if (!v) { v = { theta: 0, omega: 0, sq: -9, arrive: null }; views.set(l.id, v); } return v; };
  const sprite = l => world.sprite('L|' + l.id + '|' + Math.round(T() * world.dpr()), () => renderLantern({ cuts: l.cuts, lit: true, lid: true, name: l.nick }, T() * world.dpr()));

  /** 每层的落脚点（底边中点）和总角度。 */
  function stack() {
    const out = [];
    let x = L.tower.x, y = L.tower.y, phi = 0;
    for (const l of tower()) {
      const v = view(l);
      phi = clamp(phi + (l.tilt || 0) * 0.35 + v.theta, -0.5, 0.5);   // 整座塔最多歪这么多，再高也不会卷回画面里
      x += (l.dx || 0) * T() * 0.25 * Math.cos(phi);
      out.push({ l, v, x, y, phi });
      x += Math.sin(phi) * L.tower.layer;
      y -= Math.cos(phi) * L.tower.layer;
    }
    return out;
  }

  /** 这一层现在画在哪：正在往塔上跳的，按跳到一半的位置算。返回底边中点 x y、角度、缩放。 */
  function shown(p, t = now()) {
    const a = p.v.arrive;
    if (!a) return { x: p.x, y: p.y, rot: p.phi, s: 1 };
    const k = clamp((t - a.t0) / a.dur, 0, 1), e = easeInOut(k);
    const dist = Math.hypot(p.x - a.x, p.y - a.y);
    let y = lerp(a.y, p.y, e) - Math.sin(k * Math.PI) * (T() * 0.6 + dist * 0.25);
    if (t < a.t0 && a.hop) y -= Math.abs(Math.sin((a.t0 - t) * 9)) * T() * 0.08;
    return { x: lerp(a.x, p.x, e), y, rot: lerp(a.rot, p.phi, e), s: lerp(a.size, T(), e) / T() };
  }

  function topAnchor() {
    const st = stack();
    if (!st.length) return { x: L.tower.x, y: L.tower.y, n: 0 };
    const a = st.at(-1);
    return { x: a.x + Math.sin(a.phi) * L.tower.layer, y: a.y - Math.cos(a.phi) * L.tower.layer, n: st.length };
  }

  // ---------- 外部调用 ----------
  /** 一盏灯从 from（底边中点 x / bottom、贴图边长 size）跳到塔顶。 */
  function arrive(lantern, from, delay = 0) {
    const v = view(lantern), t = now();
    const start = Math.max(t + delay, nextHop);
    nextHop = start + 0.16;
    v.arrive = { x: from.x, y: from.bottom, size: from.size, rot: from.rot || 0, t0: start, dur: 0.75, hop: from.hop || 0, fresh: !!from.fresh };
  }

  function wobble(amp) {
    const st = tower(), n = st.length;
    st.forEach((l, i) => { view(l).omega += R(-1, 1) * amp * (0.4 + i / Math.max(1, n)); });
  }

  function push(dir, strength) {
    const st = tower(), n = st.length;
    st.forEach((l, i) => { view(l).omega += dir * strength * (0.5 + i / Math.max(1, n)); });
  }

  /** 从下往上第 from+1 层起全部掉下来，往 dir 那边飞。 */
  function knock(from, dir = 1, power = 1) {
    const pos = stack();
    const fell = game.knock(from);
    if (!fell.length) return 0;
    world.changed();
    const u = L.u;
    fell.forEach((f, i) => {
      const p = pos[from + i];
      const at = p ? shown(p) : { x: L.tower.x, y: L.tower.y, rot: 0, s: 1 };   // 正在往上跳的那盏，从它现在的位置掉
      const h = T() * 0.33 * at.s;   // 底边中点 → 身子中心
      const v = views.get(f.lantern.id);
      if (v) v.arrive = null;
      falling.push({ lantern: f.lantern, sprite: sprite(f.lantern), layer: f.layer, x: at.x + Math.sin(at.rot) * h, y: Math.max(at.y - Math.cos(at.rot) * h, -T() * R(0.3, 1.2)), rot: at.rot, vx: dir * R(140, 380) * u * power + R(-60, 60) * u, vy: R(-380, -60) * u, vr: dir * R(1.5, 6) });
    });
    world.audio.play(fell.length > 1 ? 'collapse' : 'land');
    wobble(1.2);
    if (fell.length >= 3) world.say('塔塌啦！刚才叠到 ' + (from + fell.length) + ' 层');
    return fell.length;
  }

  /** 小鬼叼走塔顶那盏：返回它现在的位置，之后由小鬼负责画。 */
  function detachTop() {
    const pos = stack(), top = pos.at(-1);
    const got = game.takeTop();
    if (!got) return null;
    world.changed();
    views.delete(got.lantern.id);
    const p = top || { x: L.tower.x, y: L.tower.y, phi: 0 };
    return { lantern: got.lantern, layer: got.layer, x: p.x, y: p.y - T() * 0.43, rot: p.phi, size: T() };
  }

  /** 被抢回来的灯：轻轻落回塔顶，不会碎。 */
  function rescue(lantern, at) {
    game.landed(lantern, 1, { safe: 1, step: 0 });
    world.changed();
    arrive(lantern, { x: at.x, bottom: at.y + T() * 0.33, size: T() });
  }

  // ---------- 每帧 ----------
  function update(t, dt) {
    if (!L) return false;
    let moving = false;
    const st = tower(), h = Math.min(dt, 1 / 30);
    for (let pass = 0; pass < 2; pass++) for (const l of st) {
      const v = view(l);
      if (Math.abs(v.theta) < 1e-4 && Math.abs(v.omega) < 1e-4) { v.theta = 0; v.omega = 0; continue; }
      v.omega += (-K * v.theta - C * v.omega) * h / 2;
      v.theta = clamp(v.theta + v.omega * h / 2, -0.35, 0.35);
      moving = true;
    }
    for (const l of st) {
      const v = view(l), a = v.arrive;
      if (t - v.sq < 0.6) moving = true;
      if (!a) continue;
      moving = true;
      if (t >= a.t0 + a.dur) {
        v.arrive = null; v.sq = t;
        world.audio.play('land');
        wobble(0.35);
        const top = stack().find(p => p.l === l);
        if (top) dust(top.x, top.y);
        if (top && a.fresh) {   // 刚做好的灯落到塔上：名字冒一下，撒几颗火星
          const cy = top.y - T() * 0.55;
          fx.add({ kind: 'text', text: l.nick + ' 的灯做好啦', x: clamp(top.x, L.m * 0.22, L.W - L.m * 0.22), y: cy - T() * 0.45, vy: -36 * L.u, size: L.m * 0.03, life: 1.6, fade: 0.4, pop: true, color: '#FFF1C0' });
          for (let i = 0; i < 8; i++) { const ang = R(0, Math.PI * 2), sp = R(160, 340) * L.u; fx.add({ kind: 'spark', x: top.x, y: cy, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 120 * L.u, g: 700 * L.u, r: T() * R(0.04, 0.07), life: R(0.5, 0.8) }); }
        }
      }
    }
    const shipAt = world.settings().tower.shipAt;
    if (!cart && shipAt > 0 && st.length >= shipAt && !falling.length && st.every(l => !view(l).arrive)) startCart(t);
    if (cart) { stepCart(t); moving = true; }
    const floorC = L.floor - T() * 0.36, u = L.u;
    for (let i = falling.length - 1; i >= 0; i--) {
      const f = falling[i];
      f.vy += 2600 * u * dt; f.x += f.vx * dt; f.y += f.vy * dt; f.rot += f.vr * dt;
      const half = T() * 0.4;
      if (f.x < half) { f.x = half; f.vx = Math.abs(f.vx) * 0.5; }
      if (f.x > L.W - half) { f.x = L.W - half; f.vx = -Math.abs(f.vx) * 0.5; }
      moving = true;
      if (f.y < floorC) continue;
      falling.splice(i, 1);
      const safe = world.settings().tower.safeLayers, step = world.settings().tower.breakStep;
      const broken = game.landed(f.lantern, f.layer, { safe, step });
      world.changed();
      if (broken) smash(f);
      else { world.audio.play('land'); dust(f.x, L.floor); arrive(f.lantern, { x: f.x, bottom: L.floor, size: T(), rot: Math.atan2(Math.sin(f.rot), Math.cos(f.rot)) * 0.3, hop: 1 }, 0.35); }
    }
    return moving;
  }

  function dust(x, y) {
    for (let i = 0; i < 4; i++) fx.add({ kind: 'img', sprite: img('smoke'), x: x + R(-0.25, 0.25) * T(), y: y - T() * 0.05, w: T() * 0.22, h: T() * 0.19, vx: R(-80, 80) * L.u, vy: R(-50, -15) * L.u, grow: 0.7, life: 0.55, alpha: 0.5, fade: 0.7 });
  }

  function smash(f) {
    const u = L.u, size = T();
    world.audio.play('break');
    const pieces = shatter(f.sprite || sprite(f.lantern));
    for (const p of pieces) {
      const a = p.dir;
      fx.add({ kind: 'img', sprite: p.canvas, x: f.x + (p.cx - 0.5) * size, y: f.y + (p.cy - 0.6) * size, w: p.canvas.width / world.dpr(), h: p.canvas.height / world.dpr(), vx: Math.cos(a) * R(150, 420) * u + f.vx * 0.3, vy: Math.sin(a) * R(150, 360) * u - 420 * u, g: 2400 * u, rot: f.rot, vr: R(-8, 8), life: 1.2, fade: 0.4, floor: L.floor - size * 0.08, bounce: 0.3, u });
    }
    for (let i = 0; i < 9; i++) {
      const im = img(CANDIES[i % CANDIES.length]), w = size * R(0.16, 0.22);
      fx.add({ kind: 'img', sprite: im, x: f.x, y: f.y, w, h: w * 120 / 180, vx: R(-420, 420) * u, vy: R(-760, -360) * u, g: 2600 * u, rot: R(0, 6), vr: R(-9, 9), life: 2.4, fade: 0.35, floor: L.floor - w * 0.25, bounce: 0.45, u });
    }
    fx.add({ kind: 'flash', x: f.x, y: f.y, r: size * 0.7, life: 0.35, fade: 0.9 });
    fx.add({ kind: 'img', sprite: img('smoke'), x: f.x, y: f.y - size * 0.1, w: size * 0.5, h: size * 0.45, vy: -60 * u, grow: 0.8, life: 0.8, alpha: 0.75, fade: 0.7 });
    const t = now();
    textRow = t - textAt < 0.9 ? textRow + 1 : 0;
    textAt = t;
    fx.add({ kind: 'text', text: f.lantern.nick + ' 的灯碎了', x: clamp(f.x, L.m * 0.2, L.W - L.m * 0.2), y: L.floor - size * 0.9 - textRow * L.m * 0.065, vy: -28 * u, size: L.m * 0.03, life: 1.8, fade: 0.4, pop: true });
    world.onBroken?.(f.lantern);
  }

  // ---------- 小车 ----------
  // 塔叠到设置的盏数（默认 6）：小车从屏幕边开过来，停在塔的里侧；塔上的灯从顶往下一盏盏跳进车斗，车开走 = 安全送走，不会再被推倒。
  // 车身图 cart-body（720×350）：后挡板在 x 105–425、y 60–128，前挡板从 y 128 往下；车斗中间在 x 265。
  const CW = () => T() * 2.1, CH = () => CW() * 350 / 720, WR = () => CW() * 0.11;
  const BED = { x0: 105 / 720, x1: 425 / 720, top: 60 / 350, front: 128 / 350, mid: 265 / 720 };
  const PILE = 0.5;   // 车斗里的灯缩小到这么大
  function pileSpot(i) {   // 车斗里第 i 盏：底下一排 3 个、上面 2 个、再上 1 个，再多就往上叠；底排沉在前挡板后面
    const rows = [[-0.31, 0, 0.31], [-0.16, 0.16], [0]];
    let r = 0, k = i;
    while (r < rows.length && k >= rows[r].length) { k -= rows[r].length; r++; }
    const dx = r < rows.length ? rows[r][k] : 0, row = r < rows.length ? r : rows.length + k;
    return { dx: (BED.mid - 0.5) * CW() + dx * (BED.x1 - BED.x0) * CW(), up: row * T() * PILE * 0.42, row };
  }
  function cartPose(c, t) {
    const edge = L.flip ? -CW() : L.W + CW(), park = L.tower.x + inward() * (CW() * 0.5 + T() * 0.42);
    if (c.phase === 'come') { const k = clamp((t - c.t0) / 0.9, 0, 1); return lerp(edge, park, 1 - (1 - k) ** 3); }
    if (c.phase === 'leave') { const k = clamp((t - c.t0) / 1.0, 0, 1); return lerp(park, edge, k * k * k); }
    return park;
  }
  const inward = () => (L.flip ? 1 : -1);
  function startCart(t) {
    const pos = stack();
    const from = new Map(pos.map(p => [p.l, shown(p, t)]));
    const c = world.settings().candy;
    const { lanterns: out, gained } = game.ship({ per: c.perLantern, bonus: c.fullBonus, full: world.settings().tower.shipAt });
    if (!out.length) return;
    world.changed();
    cart = { phase: 'come', t0: t, gained, items: out.map((l, i) => ({ l, sprite: sprite(l), from: from.get(l) || { x: L.tower.x, y: L.tower.y, rot: 0, s: 1 }, i })), x: 0, spin: 0 };
    cart.x = cartPose(cart, t);
    for (const l of out) views.delete(l.id);
    world.audio.play('roll');
  }
  function stepCart(t) {
    const c = cart, x = cartPose(c, t);
    c.spin += (x - c.x) / WR();
    c.x = x;
    if (c.phase === 'come' && t - c.t0 >= 0.9) { c.phase = 'load'; c.t0 = t; }
    if (c.phase === 'load') {
      for (const it of c.items) if (!it.landed && t >= c.t0 + it.i * 0.14 + 0.42) { it.landed = true; world.audio.play('land'); }
      if (t - c.t0 >= c.items.length * 0.14 + 0.42 + 0.35) { c.phase = 'leave'; c.t0 = t; world.audio.play('roll'); }
    }
    if (c.phase === 'leave' && t - c.t0 >= 0.35 && !c.paid) {   // 车一开动就结账：糖从车上飞进糖罐
      c.paid = true;
      world.onShipped?.(c.items.map(it => it.l), c.gained, { x: c.x, y: L.floor - CH() });
    }
    if (c.phase === 'leave' && t - c.t0 >= 1.0) cart = null;
  }
  /** 小车当容器画：车身整张（含后挡板）→ 车斗里的灯（上排先画、底排后画）→ 前挡板和两根柱子再盖一遍 → 轮子。 */
  function drawCart(g, t) {
    const c = cart, w = CW(), h = CH(), wr = WR(), top = L.floor - wr * 0.5 - h, left = c.x - w / 2;
    const body = img('cart-body'), wheel = img('wheel'), s = T() * PILE;
    const placed = [], waiting = [];
    for (const it of c.items) {
      const spot = pileSpot(it.i), tx = c.x + spot.dx, tb = top + h * 0.47 - spot.up;
      let k = 1;
      if (c.phase === 'come') k = 0;
      else if (c.phase === 'load') k = clamp((t - (c.t0 + it.i * 0.14)) / 0.42, 0, 1);
      if (k <= 0) { waiting.push({ it, x: it.from.x, y: it.from.y, rot: it.from.rot, size: T() * (it.from.s || 1) }); continue; }
      const e = easeInOut(k), f = it.from;
      placed.push({ it, row: spot.row, x: lerp(f.x, tx, e), y: lerp(f.y, tb, e) - Math.sin(k * Math.PI) * T() * 0.5, rot: lerp(f.rot, 0, e), size: lerp(T() * (f.s || 1), s, e) });
    }
    const lamp = p => { g.save(); g.translate(p.x, p.y); g.rotate(p.rot); g.drawImage(p.it.sprite, -p.size / 2, -p.size * 0.93, p.size, p.size); g.restore(); };
    for (const p of waiting) lamp(p);   // 还在塔上等着的（车从它们前面开过）
    if (body) g.drawImage(body, left, top, w, h);
    placed.sort((a, b) => b.row - a.row);   // 上排在后面，先画
    for (const p of placed) lamp(p);
    if (body) {   // 前挡板 + 柱子 + 车把：整张图去掉后挡板那一块，再盖一遍
      g.save();
      g.beginPath();
      g.rect(left, top, w, h);
      g.rect(left + BED.x0 * w, top - h, (BED.x1 - BED.x0) * w, h + BED.front * h);
      g.clip('evenodd');
      g.drawImage(body, left, top, w, h);
      g.restore();
    }
    if (wheel) for (const dx of [-0.3, 0.12]) {
      g.save(); g.translate(c.x + dx * w, L.floor - wr); g.rotate(c.spin);
      g.drawImage(wheel, -wr, -wr, wr * 2, wr * 2);
      g.restore();
    }
  }

  // ---------- 画 ----------
  function draw(g, t) {
    if (!L) return;
    const pos = stack(), size = T();
    let off = 0;
    for (const p of pos) {
      const a = p.v.arrive;
      if (a) continue;
      if (p.y < -size * 0.1) { off++; continue; }
      const sq = t - p.v.sq < 0.5 ? Math.exp(-7 * (t - p.v.sq)) * Math.cos(22 * (t - p.v.sq)) * 0.12 : 0;
      g.save();
      g.translate(p.x, p.y);
      g.rotate(p.phi);
      g.scale(1 + sq, 1 - sq);
      g.drawImage(sprite(p.l), -size / 2, -size * 0.93, size, size);
      g.restore();
    }
    // 正在往塔上跳的（画在最上面）
    for (const p of pos) {
      if (!p.v.arrive) continue;
      const { x, y, rot, s } = shown(p, t);
      g.save();
      g.translate(x, y);
      g.rotate(rot);
      g.scale(s, s);
      g.drawImage(sprite(p.l), -size / 2, -size * 0.93, size, size);
      g.restore();
    }
    for (const f of falling) {
      g.save();
      g.translate(f.x, f.y);
      g.rotate(f.rot);
      g.drawImage(f.sprite, -size / 2, -size * 0.6, size, size);
      g.restore();
    }
    if (cart) drawCart(g, t);
    const n = pos.length, shipAt = world.settings().tower.shipAt;
    if (n >= 1 && (shipAt > 0 || n >= 2)) {
      const top = topAnchor(), fs = L.m * 0.03, text = shipAt > 0 ? n + ' / ' + shipAt + ' 装车' : n + ' 层';
      if (off > 0 || top.y < fs * 3) label(g, '↑ ' + text, clamp(L.tower.x, fs * 4, L.W - fs * 4), fs * 1.6, fs);
      else label(g, text, clamp(top.x, fs * 4, L.W - fs * 4), top.y - size * 0.42, fs);
    }
  }

  function label(g, text, x, y, size) {
    g.save();
    g.font = `900 ${Math.round(size)}px "Microsoft YaHei",sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    g.lineWidth = size * 0.3; g.strokeStyle = '#4A2410'; g.strokeText(text, x, y);
    g.fillStyle = '#FFD45C'; g.fillText(text, x, y);
    g.restore();
  }

  function clear() { falling.length = 0; views.clear(); nextHop = 0; cart = null; }

  function info() {
    return { cart: cart && { phase: cart.phase, n: cart.items.length, x: cart.x }, count: tower().length, falling: falling.length, top: L && topAnchor(), layers: L ? stack().map(p => ({ x: p.x, y: p.y, nick: p.l.nick })) : [] };
  }

  return { clear, spriteOf: sprite, update, draw, arrive, wobble, push, knock, detachTop, rescue, topAnchor, stack, info, relayout: next => { L = next; }, get busy() { return falling.length > 0; } };
}
