// 工作台：一次只做一个南瓜。开盖（按住盖子往上拔）→ 刻脸（拖模具上去，或直接在瓜上画）→ 点亮（点火棒碰一下）
// → 装糖（糖罐倒进瓜口）→ 盖子自己飞回去，灯跳到塔上。每一步只露出这一步要用的东西，手停下来会有虚线小手示范。
import { img, CANDIES } from './assets.js';
import { renderLantern, LID_BOX, cutPiece } from './lantern-art.js';
import { moldPolygons, MOLDS } from './molds.js';
import { classifyStroke, FACE } from './geometry.js';
import { benchToScreen, screenToBench, traySlot, queueSlot } from './layout.js';
import { tween, stepTween, squash, squashing, easeOut, easeIn, easeInOut, clamp, lerp } from './tween.js';
import { drawTool, drawJar, toolHit, flameTip, jarMouth, jarSize } from './tools.js';
import { drawHint } from './hint.js';
import { createJar } from './jar.js';

const q = p => p.map(([x, y]) => [Math.round(x * 1023), Math.round(y * 1023)]);
const R = (a, b) => a + Math.random() * (b - a);
const LID_C = { x: LID_BOX.x + LID_BOX.w / 2, y: LID_BOX.y + LID_BOX.h / 2 };
const POUR_FULL = 12;   // 倒进去这么多颗算装满（一罐 18 颗，倒掉大半罐）
// 瓜口（贴图里画好的那个洞）：中心、半宽、半高，单位是贴图边长。量自 pumpkin-1-skin（洞 x 359–677、y 265–324，1024 见方）
const HOLE = { cx: 0.506, cy: 0.288, rx: 0.155, ry: 0.029 };
// 瓜里那堆糖：[左右, 停在哪个高度（正 = 瓜口中线以下，大半被前沿挡住；负 = 冒出瓜口）, 角度]，先倒进去的在下面
const HEAP = [[-0.06, 0.03, 0.4], [0.07, 0.032, -0.6], [-0.11, 0.022, 1.2], [0.1, 0.02, -0.3], [0.01, 0.018, 0.9], [-0.03, 0.008, -1.1], [0.05, 0.004, 0.2], [-0.09, 0.0, 0.7], [0.11, -0.004, -0.9], [0.0, -0.012, 0.3], [-0.05, -0.02, -0.5], [0.06, -0.026, 1.0]];

export function createBench(world) {
  const { game, fx } = world;
  const jarSim = createJar();
  let L = null;
  const s = {
    phase: 'idle', phaseAt: 0, ver: 0, busyUntil: 0,
    pk: { x: 0, y: 0, s: 1, rot: 0, tw: null },        // 南瓜（贴图中心在 x y）
    lid: { mode: 'on', x: 0, y: 0, rot: 0, s: 1, tw: null },
    torch: { mode: 'hidden', x: 0, y: 0, rot: 0, s: 0, tw: null, grab: null },
    jar: { mode: 'hidden', x: 0, y: 0, rot: 0, s: 0, tw: null, grab: null, pour: 0, spawn: 0 },
    tray: [], trayAt: -9, trayOut: false,
    sq: { t0: -9, amp: 0 },
    drag: null, stroke: null, preview: null,
    candies: [], fill: 0,
    lastInput: 0, hintFrom: 0, hintSeen: {}
  };
  const P = () => L.bench.size;
  const now = () => world.now();
  const play = k => world.audio.play(k);
  const job = () => game.state.job;
  const seat = () => benchToScreen(L, LID_C.x, LID_C.y);
  const center = () => ({ x: L.bench.x, y: L.bench.y + P() * 0.6 });
  const opening = () => benchToScreen(L, HOLE.cx, HOLE.cy);
  const bump = (amp = 0.06) => { s.sq = { t0: now(), amp }; };
  const busy = sec => { s.busyUntil = Math.max(s.busyUntil, now() + sec); };

  function setPhase(p) {
    s.phase = p; s.phaseAt = now(); s.lastInput = now(); s.hintFrom = now();
    world.changed();
  }

  // ---------- 托盘 ----------
  function buildTray(j) {
    const pool = world.settings().making.molds.filter(id => id !== j.face);
    for (let i = pool.length - 1; i > 0; i--) { const k = Math.floor(Math.random() * (i + 1)); [pool[i], pool[k]] = [pool[k], pool[i]]; }
    const n = world.settings().making.trayCount, molds = (j.face && MOLDS.some(m => m.id === j.face) ? [j.face, ...pool] : pool).slice(0, n);
    s.tray = [{ kind: 'free' }, ...molds.map(id => ({ kind: 'mold', id, wanted: id === j.face })), { kind: 'undo' }];
  }
  const slotOf = i => traySlot(L, i, s.tray.length);
  const trayShift = t => { const k = clamp((t - s.trayAt) / 0.35, 0, 1), e = s.trayOut ? 1 - easeOut(k) : easeOut(k); return (1 - e) * (L.flip ? 1 : -1) * L.tray.slot * 1.6; };

  // ---------- 开始 / 恢复一单 ----------
  function arrive() {
    const j = game.startNext();
    if (!j) return false;
    world.changed();
    const from = queueSlot(L, 0), scale = from.size / P();
    s.ver++;
    s.pk.x = from.x; s.pk.y = from.y + from.size * 0.5; s.pk.s = scale;
    s.lid = { mode: 'on', x: 0, y: 0, rot: 0, s: 1, tw: null };
    s.candies = []; s.fill = 0; s.stroke = null; s.preview = null; s.drag = null;
    s.phase = 'arrive'; s.phaseAt = now();
    tween(s.pk, { x: L.bench.x, y: L.bench.y + P() * 0.5, s: 1 }, now(), 0.55, { arc: P() * 0.45, ease: easeInOut, then: () => { bump(0.1); play('land'); enter(j); } });
    buildTray(j);
    return true;
  }

  /** 按这一单进行到哪一步，把台面摆好（刷新页面后接着做也走这里）。 */
  function enter(j) {
    s.pk.x = L.bench.x; s.pk.y = L.bench.y + P() * 0.5; s.pk.s = 1; s.pk.tw = null;
    if (j.step === 'lid') { s.lid.mode = 'on'; hideTools(); setPhase('lid'); return; }
    if (s.lid.mode === 'on') { s.lid.mode = 'rest'; Object.assign(s.lid, restLid()); }
    if (!s.tray.length) buildTray(j);
    if (j.step === 'carve') { showTray(); showTool('torch'); setPhase('carve'); return; }
    if (j.step === 'candy') { hideTray(); hideTool('torch'); showTool('jar'); setPhase('candy'); }
  }

  /** 台面清空回到「等下一单」：清空全部 / 换了一单时用，旧的计时和动画全部作废。 */
  function clear() {
    timers.length = 0;
    s.phase = 'idle'; s.phaseAt = now(); s.drag = null; s.stroke = null; s.preview = null; s.press = null; s.flyBack = null;
    s.candies = []; s.fill = 0; s.tray = []; s.trayOut = true; s.trayAt = -9; caption = null;
    s.lid = { mode: 'on', x: 0, y: 0, rot: 0, s: 1, tw: null };
    s.pk.tw = null;
    for (const k of ['torch', 'jar']) Object.assign(s[k], { mode: 'hidden', s: 0, tw: null, grab: null, pour: 0 });
  }

  function resume() {
    clear();
    const j = job();
    if (!j) return;
    s.ver++; s.lid = { mode: 'on', x: 0, y: 0, rot: 0, s: 1, tw: null };
    buildTray(j);
    enter(j);
  }

  // ---------- 盖子 ----------
  const restLid = () => ({ x: L.lidRest.x, y: L.lidRest.y, rot: L.flip ? 0.28 : -0.28, s: 1 });
  function popLid() {
    const j = job();
    if (!j || j.step !== 'lid' || !game.openLid()) return;
    const sp = seat();
    if (s.lid.mode === 'on') { s.lid.x = sp.x; s.lid.y = sp.y; s.lid.rot = 0; }
    s.lid.mode = 'fly';
    const to = restLid();
    tween(s.lid, { ...to, rot: to.rot + (L.flip ? -1 : 1) * Math.PI * 2 }, now(), 0.55, { arc: P() * 0.55, ease: easeInOut, then: () => { s.lid.mode = 'rest'; s.lid.rot = to.rot; play('land'); dust(to.x, L.floor, 0.5); } });
    play('open'); bump(0.12);
    const o = opening();
    for (let i = 0; i < 3; i++) fx.add({ kind: 'img', sprite: img('smoke'), x: o.x + R(-0.08, 0.08) * P(), y: o.y, w: P() * 0.2, h: P() * 0.18, vx: R(-30, 30) * L.u, vy: R(-160, -90) * L.u, grow: 1.2, life: 0.9, alpha: 0.7, fade: 0.6, rot: R(-0.3, 0.3) });
    fx.add({ kind: 'ring', x: o.x, y: o.y, r0: P() * 0.05, r1: P() * 0.32, width: P() * 0.025, life: 0.45, color: '#FFE3A0' });
    world.changed();
    showTray(); showTool('torch'); setPhase('carve');
  }
  function closeLid(then) {
    const sp = seat();
    s.lid.mode = 'fly';
    tween(s.lid, { x: sp.x, y: sp.y, rot: 0, s: 1 }, now(), 0.4, { arc: P() * 0.4, ease: easeInOut, then: () => { s.lid.mode = 'on'; bump(0.1); play('open'); then?.(); } });
  }

  // ---------- 点火棒 / 糖罐 ----------
  const home = () => ({ x: L.tool.x, y: L.tool.y, rot: 0, s: 1 });
  function showTool(kind) {
    const o = s[kind];
    if (o.mode !== 'hidden' && o.mode !== 'out') return;
    Object.assign(o, home(), { s: 0, mode: 'in', grab: null });
    if (kind === 'jar') { const d = jarSize(L); jarSim.fill(d.w, d.h); o.pour = 0; o.pouring = false; o.rot = 0; }   // 每个南瓜换一罐满的
    tween(o, { s: 1 }, now(), 0.35, { ease: t => easeOut(t) * (1 + 0.25 * Math.sin(t * Math.PI)), then: () => { o.mode = 'rest'; } });
  }
  function hideTool(kind) {
    const o = s[kind];
    if (o.mode === 'hidden') return;
    o.mode = 'out'; o.grab = null;
    tween(o, { s: 0 }, now(), 0.25, { ease: easeIn, then: () => { o.mode = 'hidden'; } });
  }
  function hideTools() { hideTool('torch'); hideTool('jar'); hideTray(); }
  function showTray() { if (s.trayOut || s.trayAt < 0) { s.trayOut = false; s.trayAt = now(); } }
  function hideTray() { if (!s.trayOut) { s.trayOut = true; s.trayAt = now(); } }
  function goHome(kind, then) {
    const o = s[kind];
    o.mode = 'fly'; o.grab = null;
    tween(o, home(), now(), 0.4, { arc: P() * 0.15, ease: easeInOut, then: () => { o.mode = 'rest'; then?.(); } });
  }

  // ---------- 刻 ----------
  function addCuts(cut, pieces) {
    if (!game.addCut(cut)) return false;
    s.ver++; world.changed(); play('carve'); bump(0.07);
    for (const path of pieces) {
      const piece = cutPiece({ kind: cut.kind, paths: [path] }, P() * world.dpr());
      if (!piece) continue;
      const at = benchToScreen(L, piece.cx, piece.cy), w = piece.w * P(), h = piece.h * P();
      if (cut.kind === 'hole') fx.add({ kind: 'img', sprite: piece.canvas, x: at.x, y: at.y, w, h, vx: (at.x - L.bench.x) * 2.2 + R(-60, 60) * L.u, vy: R(-420, -280) * L.u, g: 2600 * L.u, vr: R(-7, 7), life: 1.0, fade: 0.35, floor: L.floor - h * 0.3, u: L.u });
      else for (let i = 0; i < 3; i++) fx.add({ kind: 'img', sprite: img('seed-' + (i % 3)), x: at.x, y: at.y, w: P() * 0.05, h: P() * 0.05, vx: R(-200, 200) * L.u, vy: R(-380, -200) * L.u, g: 2600 * L.u, vr: R(-9, 9), life: 1, fade: 0.3, floor: L.floor, u: L.u });
    }
    return true;
  }
  function endStroke() {
    const pts = s.stroke?.pts || [];
    s.stroke = null;
    const cut = classifyStroke(pts, { width: P() });
    if (cut.kind === 'none') {
      if (pts.length > 3) { play('miss'); say('在脸的范围里画', 1.2); }
      return;
    }
    addCuts(cut, cut.paths);
  }
  function stamp(id, from, slot = -1) {
    const polys = moldPolygons(id).map(q);
    if (!polys.length) return;
    const c = benchToScreen(L, 0.5, 0.6), mold = { x: from.x, y: from.y, rot: 0, s: (from.s ?? 1) * L.tray.slot * 0.95 / (P() * 0.82), tw: null };
    s.preview = null;
    s.press = { id, o: mold, t0: now() };
    tween(mold, { x: c.x, y: c.y, s: 1.0 }, now(), from.instant ? 0.01 : 0.28, {
      ease: easeOut, then: () => {
        tween(mold, { s: 0.9 }, now(), 0.1, { ease: easeIn, then: () => {
          addCuts({ kind: 'hole', paths: polys }, polys);
          fx.add({ kind: 'ring', x: c.x, y: c.y, r0: P() * 0.2, r1: P() * 0.48, width: P() * 0.03, life: 0.4, color: '#FFF1C8' });
          tween(mold, { s: 1.08, y: c.y - P() * 0.22 }, now(), 0.22, { ease: easeOut, then: () => {
            const home = slot >= 0 && s.tray[slot] ? slotOf(slot) : null;
            if (!home) { s.press = null; return; }
            tween(mold, { x: home.x, y: home.y, s: L.tray.slot * 0.95 / (P() * 0.82) }, now(), 0.3, { ease: easeInOut, then: () => { s.press = null; } });
          } });
        } });
      }
    });
  }
  function undo() {
    const cut = game.undoCut();
    if (!cut) { play('miss'); return; }
    s.ver++; world.changed(); play('wipe'); bump(0.05);
    const c = benchToScreen(L, 0.5, 0.58);
    fx.add({ kind: 'img', sprite: img('smoke'), x: c.x, y: c.y, w: P() * 0.35, h: P() * 0.3, grow: 0.6, life: 0.5, alpha: 0.75, fade: 0.6 });
  }

  // ---------- 点亮 ----------
  function light() {
    if (!game.light()) return;
    s.ver++; world.changed();
    play('light'); bump(0.14);
    const c = benchToScreen(L, 0.5, 0.55);
    fx.add({ kind: 'flash', x: c.x, y: c.y, r: P() * 0.9, life: 0.8, fade: 0.8 });
    fx.add({ kind: 'ring', x: c.x, y: c.y, r0: P() * 0.2, r1: P() * 0.75, width: P() * 0.04, life: 0.6, color: '#FFD86A' });
    for (let i = 0; i < 14; i++) {
      const a = R(0, Math.PI * 2), v = R(260, 620) * L.u;
      fx.add({ kind: 'spark', x: c.x, y: c.y - P() * 0.1, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 200 * L.u, g: 900 * L.u, r: R(0.018, 0.035) * P(), life: R(0.6, 1) });
    }
    hideTray(); hideTool('torch');
    later(0.45, () => { showTool('jar'); setPhase('candy'); });
    setPhase('lit');
  }

  // ---------- 装糖 ----------
  // 糖罐在南瓜上方附近（范围放宽）就自己歪过去倒，糖一颗颗瞄准瓜口飞进去，瓜口冒出一小堆糖，倒满了「装满啦！」
  const nearOpening = j => { const o = opening(), dx = j.x - o.x, dy = j.y - o.y; return Math.abs(dx) < P() * 0.7 && dy > -P() * 1.15 && dy < P() * 0.55; };
  function pourSpot() { const o = opening(), side = s.jar.x >= o.x ? 1 : -1; return { x: o.x + side * P() * 0.3, y: o.y - P() * 0.36 }; }
  function pourStep(t, dt) {
    const j = s.jar, o = opening(), over = nearOpening(j);
    if (j.mode === 'auto' && !j.tw) { const sp = pourSpot(), k = Math.min(1, dt * 8); j.x += (sp.x - j.x) * k; j.y += (sp.y - j.y) * k; }
    // 不在瓜口上方：拖着走会跟着晃；到了瓜口上方：歪过去倒
    const sway = clamp(-(j.vx || 0) * 0.00035, -0.45, 0.45);
    // 罐口要朝下糖才滚得出来：歪到 145° 左右，再抖一抖（不卡在罐肩上）
    const want = over ? (j.x >= o.x ? -2.55 : 2.55) + Math.sin(t * 26) * 0.08 : sway;
    j.rot += (want - j.rot) * Math.min(1, dt * (over ? 10 : 7));
    j.pouring = over && Math.abs(j.rot) > 1.1;
    if (j.pouring) j.pour += dt;
    if (s.fill >= POUR_FULL || (j.pouring && jarSim.count === 0) || j.pour >= 3.5) { full(); return true; }
    return false;
  }
  /** 从罐口掉出来的那颗糖：从它掉出来的地方，瞄着瓜口飞进去。 */
  function launchCandy(c) {
    const o = opening(), fly = 0.28, G = 2600 * L.u, tx = o.x + R(-0.08, 0.08) * P();
    s.candies.push({ k: c.k, x: c.x, y: c.y, vx: (tx - c.x) / fly, vy: (o.y - c.y) / fly - 0.5 * G * fly, rot: c.a, vr: R(-8, 8), ty: o.y, t: 0 });
  }
  function full() {
    const o = opening();
    fx.add({ kind: 'text', text: '装满啦！', x: o.x, y: o.y - P() * 0.3, vy: -50 * L.u, size: P() * 0.08, life: 1.1, fade: 0.4, pop: true, color: '#FFF1C0' });
    for (let i = 0; i < 10; i++) { const a = R(-Math.PI, 0), v = R(200, 420) * L.u; fx.add({ kind: 'spark', x: o.x, y: o.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 900 * L.u, r: P() * R(0.02, 0.035), life: R(0.5, 0.8) }); }
    finish();
  }
  function finish() {
    const j = s.jar;
    j.pour = 0;
    if (s.drag?.kind === 'jar') s.drag = null;
    goHome('jar', () => hideTool('jar'));
    s.phase = 'closing';
    later(0.25, () => closeLid(() => {
      const lantern = game.fill();
      if (!lantern) return;
      world.changed();
      const from = { x: L.bench.x, y: L.bench.y + P() * 0.5, size: P() };
      s.phase = 'leaving'; s.leaveAt = now();
      world.onDone(lantern, from);
      later(0.08, () => { s.phase = 'idle'; s.lid = { mode: 'on', x: 0, y: 0, rot: 0, s: 1, tw: null }; });
    }));
  }

  // ---------- 小工具 ----------
  const timers = [];
  function later(sec, fn) { timers.push({ at: now() + sec, fn }); }
  function dust(x, y, k = 1) {
    for (let i = 0; i < 5; i++) fx.add({ kind: 'img', sprite: img('smoke'), x: x + R(-0.15, 0.15) * P() * k, y, w: P() * 0.13 * k, h: P() * 0.11 * k, vx: R(-90, 90) * L.u, vy: R(-60, -20) * L.u, grow: 0.8, life: 0.55, alpha: 0.55, fade: 0.7 });
  }
  let caption = null;
  function say(text, sec = 2) { caption = { text, until: now() + sec }; }

  // ---------- 输入 ----------
  const onBody = (x, y) => { const [tx, ty] = screenToBench(L, x, y); return tx > 0.1 && tx < 0.9 && ty > 0.24 && ty < 0.93; };
  function pointerDown(x, y) {
    const j = job(), t = now();
    s.lastInput = t; s.hintFrom = t;
    if (!j || !L) return false;
    if (s.phase === 'lid') {
      const sp = seat(), w = LID_BOX.w * P(), h = LID_BOX.h * P();
      if (Math.abs(x - sp.x) < w * 0.62 && y > sp.y - h * 0.75 && y < sp.y + h * 0.7) {
        s.drag = { kind: 'lid', dx: sp.x - x, dy: sp.y - y, x0: x, y0: y };
        s.lid.mode = 'drag'; s.lid.x = sp.x; s.lid.y = sp.y; s.lid.rot = 0;
        return true;
      }
      if (onBody(x, y)) { s.hintFrom = t - 2.2; say('先按住盖子往上拔', 1.6); return true; }
      return false;
    }
    if (s.phase === 'carve') {
      for (let i = 0; i < s.tray.length; i++) {
        const sl = slotOf(i);
        if (Math.hypot(x - sl.x, y - (sl.y)) > sl.r * 1.08) continue;
        const it = s.tray[i];
        if (it.kind === 'undo') { undo(); return true; }
        if (it.kind === 'free') { s.hintFrom = t - 99; s.hintSeen.carveFree = false; s.freeHint = t; say('在南瓜上画个圈 = 挖个洞，画条线 = 刻道缝', 3.2); return true; }
        if (s.press) return true;
        s.drag = { kind: 'mold', id: it.id, x0: x, y0: y, o: { x: sl.x, y: sl.y, rot: 0, s: 1 }, slot: i };
        return true;
      }
      if (s.torch.mode === 'rest' && toolHit(s.torch, 'torch', L, x, y)) {
        s.drag = { kind: 'torch', dx: s.torch.x - x, dy: s.torch.y - y, x0: x, y0: y };
        s.torch.mode = 'drag';
        return true;
      }
      const [tx, ty] = screenToBench(L, x, y);
      if (tx > 0.1 && tx < 0.9 && ty > 0.24 && ty < 0.93 && !s.press) {
        s.stroke = { pts: [[tx, ty]] };
        return true;
      }
      return false;
    }
    if (s.phase === 'candy' && s.jar.mode === 'rest' && toolHit(s.jar, 'jar', L, x, y)) {
      s.drag = { kind: 'jar', dx: s.jar.x - x, dy: s.jar.y - y, x0: x, y0: y };
      s.jar.mode = 'drag'; s.jar.pour = 0;
      return true;
    }
    if (s.phase === 'candy' && onBody(x, y)) { s.hintFrom = t - 2.2; say('把糖罐拖到南瓜口', 1.6); return true; }
    return false;
  }

  function pointerMove(x, y) {
    const t = now();
    if (s.drag || s.stroke) { s.lastInput = t; s.hintFrom = t; }
    if (s.stroke) {
      const p = screenToBench(L, x, y), last = s.stroke.pts.at(-1);
      if (Math.hypot(p[0] - last[0], p[1] - last[1]) > 0.004) s.stroke.pts.push(p);
      if (s.stroke.pts.length % 3 === 0 && Math.random() < 0.5) { const at = benchToScreen(L, p[0], p[1]); fx.add({ kind: 'spark', x: at.x, y: at.y, vx: R(-80, 80) * L.u, vy: R(-120, -20) * L.u, g: 600 * L.u, r: P() * 0.02, life: 0.35, color: 'rgba(255,200,120,.8)' }); }
      return true;
    }
    const d = s.drag;
    if (!d) return false;
    if (d.kind === 'lid') {
      const sp = seat(), lift = Math.max(0, sp.y - (y + d.dy));
      s.lid.x = sp.x + (x + d.dx - sp.x) * 0.6;
      s.lid.y = sp.y - lift;
      s.lid.rot = clamp((s.lid.x - sp.x) / P() * 1.2, -0.5, 0.5);
      if (lift > P() * 0.2) { s.drag = null; popLid(); }
      return true;
    }
    if (d.kind === 'mold') {
      d.o.x = x; d.o.y = y; d.o.s = 1.25;
      const [tx, ty] = screenToBench(L, x, y);
      s.preview = Math.hypot(tx - 0.5, ty - 0.6) < 0.32 ? d.id : null;
      return true;
    }
    if (d.kind === 'torch') {
      s.torch.x = x + d.dx; s.torch.y = y + d.dy;
      const tip = flameTip(s.torch, L), [tx, ty] = screenToBench(L, tip.x, tip.y);
      if (tx > 0.14 && tx < 0.86 && ty > 0.1 && ty < 0.9) { s.drag = null; goHome('torch'); light(); }
      return true;
    }
    if (d.kind === 'jar') { s.jar.x = x + d.dx; s.jar.y = y + d.dy; return true; }
    return false;
  }

  function pointerUp(x, y) {
    if (s.stroke) { endStroke(); return true; }
    const d = s.drag;
    if (!d) return false;
    s.drag = null;
    const click = Math.hypot(x - d.x0, y - d.y0) < 8 * L.u + 4;
    if (d.kind === 'lid') {
      if (click) { popLid(); return true; }
      const sp = seat();
      s.lid.mode = 'fly';
      tween(s.lid, { x: sp.x, y: sp.y, rot: 0 }, now(), 0.25, { ease: easeOut, then: () => { s.lid.mode = 'on'; bump(0.05); } });
      return true;
    }
    if (d.kind === 'mold') {
      s.preview = null;
      if (click || (() => { const [tx, ty] = screenToBench(L, x, y); return Math.hypot(tx - 0.5, ty - 0.6) < 0.32; })()) { stamp(d.id, d.o, d.slot); return true; }
      s.flyBack = { o: d.o, id: d.id }; tween(d.o, { ...slotOf(d.slot), s: 1 }, now(), 0.25, { ease: easeOut, then: () => { s.flyBack = null; } });
      return true;
    }
    if (d.kind === 'torch') {
      if (click) {   // 点一下：点火棒自己飞过去点
        const o = opening(), tip = flameTip(s.torch, L);
        s.torch.mode = 'fly';
        tween(s.torch, { x: s.torch.x + (o.x - tip.x), y: s.torch.y + (o.y + P() * 0.08 - tip.y) }, now(), 0.32, { arc: P() * 0.2, ease: easeInOut, then: () => { goHome('torch'); light(); } });
      } else goHome('torch');
      return true;
    }
    if (d.kind === 'jar') {
      if (s.jar.mode !== 'drag') return true;
      if (click) {   // 点一下：糖罐自己飞过去倒
        s.jar.mode = 'auto';
        const sp = pourSpot();
        tween(s.jar, { x: sp.x, y: sp.y }, now(), 0.35, { arc: P() * 0.1, ease: easeInOut });
      } else if (nearOpening(s.jar)) s.jar.mode = 'auto';   // 拖到南瓜附近松手：接着倒完
      else goHome('jar');
      return true;
    }
    return false;
  }

  // ---------- 每帧 ----------
  function update(t, dt) {
    for (let i = timers.length - 1; i >= 0; i--) if (t >= timers[i].at) { const f = timers[i].fn; timers.splice(i, 1); f(); }
    let moving = timers.length > 0;
    for (const o of [s.pk, s.lid, s.torch, s.jar]) moving = stepTween(o, t) || moving;
    if (s.press) moving = stepTween(s.press.o, t) || true;
    if (s.flyBack) moving = stepTween(s.flyBack.o, t) || true;
    if (s.jar.mode !== 'hidden') {
      const j = s.jar;
      j.vx = dt > 0 && j.lastX !== undefined ? (j.x - j.lastX) / dt : 0;
      j.lastX = j.x;
      if (j.mode === 'drag' || j.mode === 'auto') { moving = true; if (!j.tw && pourStep(t, dt)) j.mode = 'fly'; }
      else j.pouring = false;
      // 罐子里的糖：跟着罐子晃，倒的时候一颗颗从罐口掉出来
      j.spawn = (j.spawn || 0) - dt;
      const r = jarSim.step(dt, j, 4200 * L.u, !!j.pouring && j.spawn <= 0);   // 罐子里的「重力」比外面大一点：糖滚得利索，倒得快
      if (r.moving) moving = true;
      if (r.out) { j.spawn = 0.04; launchCandy(r.out); }
    }
    for (let i = s.candies.length - 1; i >= 0; i--) {
      const c = s.candies[i];
      c.t += dt; c.vy += 2600 * L.u * dt; c.x += c.vx * dt; c.y += c.vy * dt; c.rot += c.vr * dt;
      if (c.vy > 0 && c.y >= c.ty + P() * 0.03) { s.candies.splice(i, 1); s.fill++; bump(0.02); play('candy'); continue; }   // 掉过瓜口前沿 = 进去了
      if (c.t > 1.5) s.candies.splice(i, 1);
    }
    if (s.candies.length) moving = true;
    if (squashing(s.sq, t)) moving = true;
    if (s.drag || s.stroke) moving = true;
    if (!job() && s.phase === 'idle' && !s.lid.tw) moving = arrive() || moving;
    if (hintActive(t)) moving = true;
    else if (!moving && hintPlan() && t - s.hintFrom < 2.2) world.wakeAt(s.hintFrom + 2.2);
    if (caption && t < caption.until) moving = true;
    if (t < s.busyUntil) moving = true;
    if (s.trayAt > 0 && t - s.trayAt < 0.4) moving = true;
    return moving;
  }

  // ---------- 示范手势 ----------
  function hintPlan() {
    const j = job();
    if (!j || !world.settings().making.hints) return null;
    const sp = seat(), c = benchToScreen(L, 0.5, 0.6), o = opening();
    if (s.phase === 'lid') return { key: 'lid', text: '按住盖子往上拔', path: [[sp.x, sp.y], [sp.x, sp.y - P() * 0.3]], press: true };
    if (s.phase === 'carve') {
      if (s.freeHint && now() - s.freeHint < 4) return { key: 'free', text: '在南瓜上画圈挖洞', circle: { x: c.x - P() * 0.12, y: c.y - P() * 0.1, r: P() * 0.07 } };
      if (!j.cuts.length) { const m = slotOf(1); return { key: 'carve', text: '把模具拖到南瓜上，或者直接在瓜上画', path: [[m.x, m.y], [c.x, c.y]], press: true }; }
      const tip = flameTip({ ...home() }, L);
      return { key: 'light', text: '刻好了就把点火棒拖到南瓜上', path: [[tip.x, tip.y], [o.x, o.y + P() * 0.1]], press: true };
    }
    if (s.phase === 'candy') { const m = jarMouth({ ...home() }, L); return { key: 'candy', text: '把糖罐拖到南瓜口', path: [[m.x, m.y], [o.x + P() * 0.1, o.y - P() * 0.25]], press: true }; }
    return null;
  }
  function hintActive(t) {
    const plan = hintPlan();
    if (!plan || s.drag || s.stroke || s.press) return false;
    if (plan.key === 'free') return true;
    const idle = t - s.hintFrom;
    return idle > 2.2 && idle < 2.2 + 1.7 * 2;   // 停手 2 秒以后示范两遍，然后就不动了（不常驻耗显卡）
  }

  // ---------- 画 ----------
  function draw(g, t) {
    const j = job();
    if (!L) return;
    const dpr = world.dpr();
    const showPk = j || s.phase === 'closing';
    if (s.lid.mode === 'rest' && showPk) drawLidAt(g, s.lid);
    if (showPk && j) {
      const key = j.id + '|' + s.ver + '|' + Math.round(P() * dpr);   // 工作台这一个南瓜自己存一张，刻一刀换一张（不进公共缓存，免得旧版本堆满内存）
      if (benchSprite.key !== key) benchSprite = { key, c: renderLantern({ cuts: j.cuts, lit: j.lit, lid: false, name: j.nick, redo: j.redo }, P() * dpr) };
      const sprite = benchSprite.c;
      const [sx, sy] = squash(s.sq, t), size = P() * s.pk.s, bottom = s.pk.y + size * 0.43;
      const local = fn => { g.save(); g.translate(s.pk.x, bottom); g.scale(sx, sy); fn(); g.restore(); };
      // 南瓜当容器画：瓜身 → 瓜口里的火光 → 瓜里的糖、正在掉进去的糖 → 瓜口前沿和瓜身再盖一遍（糖的下半截就被挡在瓜里）→ 盖子
      local(() => g.drawImage(sprite, -size / 2, -size * 0.93, size, size));
      if (j.lit && s.lid.mode !== 'on') local(() => glowHole(g, size));
      if (s.fill > 0 || s.candies.length) {
        drawHeap(g);
        drawCandies(g);
        local(() => frontLip(g, sprite, size));
      }
      if (s.lid.mode === 'on') local(() => { const lid = lidSprite(); g.drawImage(lid.c, (LID_BOX.x - 0.5) * size, (LID_BOX.y - 0.93) * size, LID_BOX.w * size, LID_BOX.h * size); });
      if (j.face && s.phase !== 'arrive') drawWish(g, j);
      if (s.stroke) drawStroke(g, s.stroke.pts);
      if (s.preview) drawPreview(g, s.preview);
    }
    if (showPk && (s.lid.mode === 'drag' || s.lid.mode === 'fly')) drawLidAt(g, s.lid);
    if (s.tray.length && (s.phase === 'carve' || (s.trayOut && t - s.trayAt < 0.4))) drawTray(g, t);
    if (s.press) drawMold(g, s.press.id, s.press.o, 1, P() * 0.82);
    if (s.flyBack) drawMold(g, s.flyBack.id, s.flyBack.o, 1, L.tray.slot * 0.95);
    if (s.drag?.kind === 'mold') drawMold(g, s.drag.id, s.drag.o, 0.92, L.tray.slot * 0.95);
    if (s.torch.mode !== 'hidden') drawTool(g, 'torch', s.torch, L, t, s.torch.mode === 'drag' || s.torch.mode === 'fly');
    if (s.jar.mode !== 'hidden') drawJar(g, s.jar, L, jarSim);
    const plan = hintActive(t) ? hintPlan() : null;
    if (plan) drawHint(g, plan, plan.key === 'free' ? t - s.freeHint : t - s.hintFrom - 2.2, L);
    const cap = caption && t < caption.until ? caption.text : plan?.text;
    if (cap && j) drawCaption(g, cap);
  }

  let lidCache = null, benchSprite = { key: '', c: null };
  function lidSprite() {
    const S = Math.round(P() * world.dpr());
    if (lidCache?.S === S) return lidCache;
    const c = document.createElement('canvas'), im = img('pumpkin-1-lid');
    c.width = Math.ceil(LID_BOX.w * S); c.height = Math.ceil(LID_BOX.h * S);
    if (im) c.getContext('2d').drawImage(im, LID_BOX.x * 1024, LID_BOX.y * 1024, LID_BOX.w * 1024, LID_BOX.h * 1024, 0, 0, c.width, c.height);
    lidCache = { S, c };
    return lidCache;
  }
  function drawLidAt(g, o) {
    const lid = lidSprite(), w = LID_BOX.w * P() * (o.s ?? 1), h = LID_BOX.h * P() * (o.s ?? 1);
    g.save(); g.translate(o.x, o.y); g.rotate(o.rot || 0);
    g.drawImage(lid.c, -w / 2, -h / 2, w, h);
    g.restore();
  }
  function drawCandies(g) {
    for (const c of s.candies) {
      const im = img(c.k), w = P() * 0.11, h = w * 120 / 180;
      if (!im) continue;
      g.save(); g.translate(c.x, c.y); g.rotate(c.rot); g.drawImage(im, -w / 2, -h / 2, w, h); g.restore();
    }
  }
  /** 瓜里的糖：倒进去一颗堆就高一点。画在瓜身之后、前沿之前，所以下半截被瓜口前沿挡住，像真的装在里面。 */
  function drawHeap(g) {
    const o = opening(), n = Math.min(HEAP.length, Math.floor(s.fill * HEAP.length / POUR_FULL));
    if (!n) return;
    for (let i = 0; i < n; i++) {
      const [dx, dy, rot] = HEAP[i], im = img(CANDIES[i % CANDIES.length]), w = P() * 0.11, h = w * 120 / 180;
      if (!im) continue;
      g.save(); g.translate(o.x + dx * P(), o.y + dy * P()); g.rotate(rot); g.drawImage(im, -w / 2, -h / 2, w, h); g.restore();
    }
    // 靠里那半圈被瓜壁挡着，暗一点，糖才像在洞里
    g.save();
    g.beginPath(); g.ellipse(o.x, o.y, HOLE.rx * P(), HOLE.ry * P(), 0, 0, Math.PI * 2); g.clip();
    const sh = g.createLinearGradient(0, o.y - HOLE.ry * P(), 0, o.y + HOLE.ry * P());
    sh.addColorStop(0, 'rgba(45,14,0,.55)'); sh.addColorStop(1, 'rgba(45,14,0,0)');
    g.fillStyle = sh; g.fillRect(o.x - HOLE.rx * P(), o.y - HOLE.ry * P(), HOLE.rx * P() * 2, HOLE.ry * P() * 2);
    g.restore();
  }
  /** 瓜口前沿 + 瓜口中线以下的瓜身，在南瓜自己的坐标里（原点 = 底边中点）再画一遍，盖住装进去的东西。 */
  function frontLip(g, sprite, size) {
    const x0 = -size / 2, y0 = -size * 0.93, cx = (HOLE.cx - 0.5) * size, cy = (HOLE.cy - 0.93) * size, rx = HOLE.rx * size, ry = HOLE.ry * size;
    g.beginPath();
    g.rect(x0, y0, size, size);
    g.moveTo(x0, y0); g.lineTo(x0 + size, y0); g.lineTo(x0 + size, cy); g.lineTo(cx + rx, cy);
    g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI);
    g.lineTo(x0, cy); g.closePath();
    g.clip('evenodd');
    g.drawImage(sprite, x0, y0, size, size);
  }
  /** 点亮以后、盖上盖子以前：瓜口里透出暖暖的火光。 */
  function glowHole(g, size) {
    const cx = (HOLE.cx - 0.5) * size, cy = (HOLE.cy - 0.93) * size, rx = HOLE.rx * size, ry = HOLE.ry * size;
    g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); g.clip();
    const gr = g.createRadialGradient(cx, cy + ry * 0.8, 0, cx, cy, rx);
    gr.addColorStop(0, 'rgba(255,240,170,.95)'); gr.addColorStop(0.5, 'rgba(255,190,80,.75)'); gr.addColorStop(1, 'rgba(230,110,30,.35)');
    g.fillStyle = gr; g.fillRect(cx - rx, cy - ry, rx * 2, ry * 2);
  }
  function drawStroke(g, pts) {
    if (pts.length < 2) return;
    g.save();
    g.beginPath();
    pts.forEach(([tx, ty], i) => { const p = benchToScreen(L, tx, ty); i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y); });
    g.lineCap = g.lineJoin = 'round';
    g.strokeStyle = 'rgba(70,25,5,.75)'; g.lineWidth = P() * 0.026; g.stroke();
    g.setLineDash([P() * 0.03, P() * 0.022]);
    g.strokeStyle = '#FFE7B0'; g.lineWidth = P() * 0.012; g.stroke();
    g.restore();
    drawFaceGuide(g);
  }
  function drawFaceGuide(g) {
    const c = benchToScreen(L, FACE.cx, FACE.cy);
    g.save();
    g.setLineDash([P() * 0.012, P() * 0.02]);
    g.strokeStyle = 'rgba(255,240,200,.45)'; g.lineWidth = Math.max(1.5, P() * 0.006);
    g.beginPath(); g.ellipse(c.x, c.y, FACE.rx * P(), FACE.ry * P(), 0, 0, Math.PI * 2); g.stroke();
    g.restore();
  }
  function drawPreview(g, id) {
    g.save();
    g.setLineDash([P() * 0.02, P() * 0.014]);
    g.strokeStyle = '#FFF4D0'; g.lineWidth = Math.max(2, P() * 0.008);
    g.fillStyle = 'rgba(60,20,5,.28)';
    for (const poly of moldPolygons(id)) {
      g.beginPath();
      poly.forEach(([tx, ty], i) => { const p = benchToScreen(L, tx, ty); i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y); });
      g.closePath(); g.fill(); g.stroke();
    }
    g.restore();
  }
  function drawMold(g, id, o, alpha, base) {
    const im = img('mold-' + id), size = base * (o.s ?? 1);
    if (!im) return;
    g.save(); g.globalAlpha = alpha; g.translate(o.x, o.y); g.rotate(o.rot || 0);
    g.drawImage(im, -size / 2, -size / 2, size, size);
    g.restore();
  }
  function drawTray(g, t) {
    const dx = trayShift(t), j = job();
    g.save();
    g.translate(dx, 0);
    s.tray.forEach((it, i) => {
      const sl = slotOf(i), r = sl.r;
      const dragging = s.drag?.kind === 'mold' && s.drag.slot === i;
      g.save();
      g.translate(sl.x, sl.y);
      g.fillStyle = 'rgba(60,25,10,.28)';
      g.beginPath(); g.arc(0, r * 0.08, r, 0, Math.PI * 2); g.fill();
      g.fillStyle = it.wanted ? '#FFE9B8' : '#FFF4DE';
      g.strokeStyle = it.wanted ? '#E8792B' : '#7A4527';
      g.lineWidth = Math.max(2, r * (it.wanted ? 0.11 : 0.07));
      g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill(); g.stroke();
      if (it.kind === 'mold' && !dragging) { const im = img('mold-' + it.id); if (im) g.drawImage(im, -r * 1.02, -r * 1.02, r * 2.04, r * 2.04); }
      if (it.kind === 'free') drawPen(g, r);
      if (it.kind === 'undo') drawUndo(g, r, j?.cuts.length > 0);
      if (it.wanted) label(g, '点名要', 0, -r * 1.02, r * 0.3, '#C2541A');
      g.restore();
    });
    g.restore();
  }
  function drawPen(g, r) {
    g.save();
    g.rotate(-0.7);
    g.fillStyle = '#F2A33A'; g.strokeStyle = '#6E3A1C'; g.lineWidth = Math.max(1.5, r * 0.06);
    g.beginPath(); g.roundRect ? g.roundRect(-r * 0.13, -r * 0.55, r * 0.26, r * 0.78, r * 0.06) : g.rect(-r * 0.13, -r * 0.55, r * 0.26, r * 0.78); g.fill(); g.stroke();
    g.fillStyle = '#FFE2B0';
    g.beginPath(); g.moveTo(-r * 0.13, r * 0.23); g.lineTo(r * 0.13, r * 0.23); g.lineTo(0, r * 0.5); g.closePath(); g.fill(); g.stroke();
    g.restore();
    g.strokeStyle = '#C2541A'; g.lineWidth = Math.max(1.5, r * 0.07); g.lineCap = 'round';
    g.beginPath(); g.moveTo(-r * 0.55, r * 0.5); g.quadraticCurveTo(-r * 0.3, r * 0.2, -r * 0.05, r * 0.5); g.stroke();
    label(g, '自由刻', 0, r * 0.72, r * 0.3, '#6E3A1C');
  }
  function drawUndo(g, r, enabled) {
    g.save();
    g.globalAlpha = enabled ? 1 : 0.35;
    g.strokeStyle = '#7A4527'; g.lineWidth = r * 0.13; g.lineCap = 'round';
    g.beginPath(); g.arc(r * 0.05, r * 0.02, r * 0.36, Math.PI * 1.05, Math.PI * 2.35); g.stroke();
    g.fillStyle = '#7A4527';
    g.beginPath(); g.moveTo(-r * 0.52, -r * 0.2); g.lineTo(-r * 0.2, -r * 0.08); g.lineTo(-r * 0.42, r * 0.18); g.closePath(); g.fill();
    label(g, '撤销', 0, r * 0.66, r * 0.3, '#6E3A1C');
    g.restore();
  }
  function label(g, text, x, y, size, color) {
    g.save();
    g.font = `900 ${Math.round(size)}px "Microsoft YaHei",sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    g.lineWidth = Math.max(2, size * 0.28); g.strokeStyle = '#FFF4DE'; g.strokeText(text, x, y);
    g.fillStyle = color; g.fillText(text, x, y);
    g.restore();
  }
  function drawWish(g, j) {
    const name = MOLDS.find(m => m.id === j.face)?.name;
    if (!name) return;
    const face = img('face-' + j.face), size = Math.round(P() * 0.06), at = benchToScreen(L, 0.5, s.lid.mode === 'on' ? -0.06 : 0.12);
    g.save();
    g.font = `900 ${size}px "Microsoft YaHei",sans-serif`;
    const text = '想要' + name + '脸', tw = g.measureText(text).width, icon = size * 1.5, w = tw + icon + size * 1.4, h = size * 1.9;
    const x = at.x - w / 2, y = at.y - h / 2;
    g.fillStyle = 'rgba(60,25,10,.3)';
    g.beginPath(); g.roundRect ? g.roundRect(x, y + size * 0.15, w, h, h / 2) : g.rect(x, y + size * 0.15, w, h); g.fill();
    g.fillStyle = '#FFF1D8'; g.strokeStyle = '#E8792B'; g.lineWidth = Math.max(2, size * 0.14);
    g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, h / 2) : g.rect(x, y, w, h); g.fill(); g.stroke();
    if (face) g.drawImage(face, x + size * 0.5, at.y - icon / 2, icon, icon);
    g.fillStyle = '#5A2A12'; g.textAlign = 'left'; g.textBaseline = 'middle';
    g.fillText(text, x + size * 0.6 + icon, at.y + size * 0.05);
    g.restore();
  }
  function drawCaption(g, text) {
    const size = Math.round(P() * 0.058), y = L.bench.y + P() * 0.44;
    g.save();
    g.font = `800 ${size}px "Microsoft YaHei",sans-serif`;
    const w = g.measureText(text).width + size * 1.4, h = size * 1.7;
    const edge = L.bench.x + (L.flip ? -1 : 1) * P() * 0.44;
    const left = clamp(L.flip ? edge - w : edge, L.margin * 0.5, L.W - w - L.margin * 0.5);
    g.fillStyle = 'rgba(58,28,12,.82)';
    g.beginPath(); g.roundRect ? g.roundRect(left, y - h / 2, w, h, h / 2) : g.rect(left, y - h / 2, w, h); g.fill();
    g.fillStyle = '#FFF0CF'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, left + w / 2, y + size * 0.05);
    g.restore();
  }

  function relayout(next) {
    const first = !L;
    L = next;
    if (first) return;
    const j = job();
    if (j && s.phase !== 'arrive') { s.pk.x = L.bench.x; s.pk.y = L.bench.y + P() * 0.5; }
    // 盖子飞去地上的半路：直接放到新位置（合盖那一下不能打断，它飞完才会把灯送上塔）
    if (s.lid.mode === 'rest' || (s.lid.mode === 'fly' && s.phase !== 'closing' && job()?.step !== 'lid')) Object.assign(s.lid, restLid(), { mode: 'rest', tw: null });
    // 画布大小变了（OBS 源改尺寸、换了塔的一边）：飞到一半 / 拖到一半的工具直接回家（这一步用不到的就收起来），免得朝旧位置倒糖倒不进去
    if (s.drag && s.drag.kind !== 'lid') s.drag = null;
    s.stroke = null; s.preview = null;
    const want = { torch: s.phase === 'carve', jar: s.phase === 'candy' };
    for (const k of ['torch', 'jar']) {
      if (s[k].mode === 'hidden') continue;
      if (want[k]) Object.assign(s[k], home(), { mode: 'rest', tw: null, pour: 0, s: 1, rot: 0 });
      else Object.assign(s[k], { mode: 'hidden', tw: null, s: 0, pour: 0 });
    }
  }

  /** 给 QA 用：现在各个东西在屏幕上的位置。 */
  function info() {
    const sp = L ? seat() : null;
    return {
      phase: s.phase, step: job()?.step || null, cuts: job()?.cuts.length || 0,
      lid: sp && { x: sp.x, y: sp.y }, lidMode: s.lid.mode, lidRest: L && { x: s.lid.x, y: s.lid.y },
      tray: L ? s.tray.map((it, i) => ({ ...it, ...slotOf(i) })) : [],
      torch: { mode: s.torch.mode, x: s.torch.x, y: s.torch.y }, jar: { mode: s.jar.mode, x: s.jar.x, y: s.jar.y },
      face: L && benchToScreen(L, 0.5, 0.6), size: L && P(), opening: L && opening()
    };
  }

  return { update, draw, pointerDown, pointerMove, pointerUp, relayout, resume, info, get phase() { return s.phase; }, get dragging() { return !!(s.drag || s.stroke); } };
}
