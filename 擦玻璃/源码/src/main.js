/* 擦玻璃 V1.5：启动、装配、主循环（画面没变的帧不重画）。
   ?demo=1 = 试玩模式（打开试玩面板、显示操作提示、统计单独存一份）。 */
import { createStage } from './glass/stage.js';
import { createParticles } from './glass/particles.js';
import { createWater } from './glass/water.js';
import { createGlare } from './glass/glare.js';
import { createAudio } from './audio.js';
import { createNames } from './game/names.js';
import { createLabels } from './game/labels.js';
import { createHud } from './game/hud.js';
import { createStats } from './stats.js';
import { createGame } from './game/game.js';
import { createTool } from './game/tool.js';
import { createWiper } from './game/wiper.js';
import { runAction } from './game/actions.js';
import { createAmbient } from './game/ambient.js';
import { zoneRect, defaultZone } from './zone.js';
import { store, sanitizeSettings, KEY_STATS, KEY_STATS_DEMO, ACTOR_KINDS } from './settings.js';
import { Director } from './director.js';
import { createStickerLibrary } from './stickers.js';
import { scan, markRendered, objectSignatures } from './glass/signature.js';
import { splitSpec } from './tiers.js';
import { Live } from './live.js';
import { createApp } from './ui/app.js';
import { actionDef, isHelp } from './config.js';

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const demoMode = params.get('demo') === '1';
const canvas = $('gl-stage');

let stage;
try {
  stage = createStage(canvas);
} catch (e) {
  const box = $('gl-error');
  box.style.display = 'block';
  box.textContent = 'WebGL 没有启动，请在 OBS 浏览器源里开启硬件加速，或换用支持显卡加速的浏览器。';
  throw e;
}

/* ---------- 设置 ---------- */
const loaded = store.loadSettings();
let settings = loaded.settings;
const listeners = new Set();
const reducedMotion = () => (settings.display.motion === 'off' ? true : settings.display.motion === 'system' ? matchMedia('(prefers-reduced-motion: reduce)').matches : false);

const particles = createParticles(stage);
const water = createWater(stage);
const glare = createGlare(stage);
const audio = createAudio();
const names = createNames(stage, $('gl-names'));
const labels = createLabels($('gl-labels'));
const hud = createHud($('gl-hud'));
const stats = createStats(demoMode ? KEY_STATS_DEMO : KEY_STATS);
const getSettings = () => settings;
/* 主播上传的异形贴纸（存在浏览器的 IndexedDB 里） */
const stickerListeners = new Set();
const stickers = createStickerLibrary({ onChange: () => stickerListeners.forEach(fn => fn()), toast: t => hud.toast(t, 'block') });
stickers.load();
const game = createGame({ stage, particles, water, glare, audio, hud, names, labels, stats, getSettings, reducedMotion, stickers });
const tool = createTool(stage);
const blade = () => (settings.play.blade / 100) * Math.min(stage.W, stage.H);
const ambient = createAmbient(game, getSettings);
const director = new Director();

let zoneKey = '';
function applyLook() {
  /* 露脸框还是出厂的默认框：按这块画面的比例重新摆（竖屏、带鱼屏上也是脸的形状），不存档 */
  const z0 = settings.display.zone;
  if (z0.auto) {
    const fit = defaultZone(stage.W / stage.H).pts;
    if (JSON.stringify(fit) !== JSON.stringify(z0.pts)) settings = { ...settings, display: { ...settings.display, zone: { ...z0, pts: fit } } };
  }
  /* 露脸区真变了（任何一个点、开关、羽化、画面尺寸）才重画遮罩、重算玻璃上每块"看得见、擦得着"的部分；调音量这种不碰它 */
  const key = JSON.stringify([settings.display.zone, stage.W, stage.H]);
  if (key !== zoneKey) {
    zoneKey = key;
    stage.setZone(zoneRect(settings.display.zone, stage.W, stage.H));
    game.zoneChanged();
  }
  tool.setLength(blade());
  glare.setStrength(settings.display.glass);
  glare.setReduced(reducedMotion());
  names.setEnabled(settings.display.names);
  audio.setEnabled(settings.audio.enabled);
  audio.setVolume(settings.audio.volume);
  hud.showHint(demoMode || settings.display.hint);
}

function applySettings(next) {
  settings = sanitizeSettings(next);
  if (!store.saveSettings(settings)) hud.toast('设置没能保存（浏览器存储被拒绝），这次直播里照常生效', 'block');
  applyLook();
  for (const fn of listeners) fn(settings);
}

/* 画面没变就不重画（见 glass/signature.js）；尺寸变了、显卡重置了一定重画 */
let lastA = -1;
let lastT = -1;
let lastRenderAt = 0;
let lastInput = 0;
let forceRender = true;
let renders = 0;
/* 鼠标在动、在刮：贴图一变就画（刮的手感要跟手）；没人动时贴图的小变化一秒最多画 20 次 */
const TEX_GAP = 50;
const INPUT_HOT = 600;
for (const ev of ['pointermove', 'pointerdown', 'pointerup', 'keydown']) addEventListener(ev, () => (lastInput = performance.now()), true);
function resize() {
  forceRender = true;
  stage.resize();
  document.documentElement.style.setProperty('--u', String(stage.unit));
  applyLook();
}
addEventListener('resize', resize);
canvas.addEventListener('webglcontextrestored', () => (forceRender = true));
resize();
if (!loaded.readable) hud.toast('旧设置读不出来，先用默认设置（没有覆盖旧存档）', 'block');

/* ---------- 互动入口：所有来源（试玩、礼物、弹幕、点赞、白曜动作）都先排队，按间隔放出来 ---------- */
function trigger(spec) {
  if (!spec || !actionDef(spec.action)) return false;
  /* 礼物送得多、放大后超过"一次最多"：拆成好几批排队，一批批来 */
  let full = 0;
  for (const part of splitSpec(spec)) {
    part.queuedAt = game.time;
    if (director.push(part, settings) === 'full') full++;
  }
  if (full) hud.toast(`排队满了（设置里限了最多 ${settings.limits.queueMax} 条），有 ${full} 批先跳过`, 'block');
  return full === 0;
}
/* 场上容得下才放出来：默认不限；主播在设置里给猫/鸟/壁虎/机器人/小广告填了上限，满了的在队里等。
   礼物刷得太猛、旧脏东西沉进污垢层跟不上时，新的捣乱也先等一下（帮忙不等） */
/* 每帧开头算一次（队伍可能很长，别每条都去数场上的东西） */
const room = { backlog: false, count: {} };
function measureRoom() {
  room.backlog = game.grimeBacklog();
  for (const k of ACTOR_KINDS) room.count[k] = 0;
  for (const a of game.actors) if (a.kind in room.count) room.count[a.kind]++;
  room.count.flyer = game.flyerCount();
}
function canRun(spec) {
  if (!isHelp(spec.action) && room.backlog) return false;
  /* 我的贴纸也是小广告，占小广告的名额 */
  const kind = spec.action === 'sticker' ? 'flyer' : spec.action;
  const cap = settings.limits.actors[kind];
  if (!(cap > 0)) return true;
  if (room.count[kind] < cap) {
    room.count[kind]++;
    return true;
  }
  /* 卡在名额上：从这时开始算等了多久（被"沉得跟不上"挡着的不算） */
  if (spec.capSince === undefined) spec.capSince = game.time;
  return false;
}
let pruneT = 0;
function clearGlass() {
  director.clear();
  game.clearAll();
  /* 正拖着的东西（小广告、机器人）已经清掉了：松开手 */
  wiper.cancel();
}

const live = new Live(trigger, getSettings);
live.start();

/* 拖露脸区时的实时预览：只改画面，不存档 */
const previewZone = z => stage.setZone(zoneRect(z, stage.W, stage.H));
const ui = createApp({ canvas, game, live, stats, director, trigger, clearGlass, getSettings, applySettings, previewZone, onSettings: fn => listeners.add(fn), toast: (t, kind = 'block') => hud.toast(t, kind), stickers, onStickers: fn => stickerListeners.add(fn), demo: demoMode });
const wiper = createWiper({ canvas, stage, tool, game, water, particles, audio, getBlade: blade, isBlocked: () => ui.blocked() });
canvas.addEventListener('pointerdown', () => {
  audio.unlock();
  hud.hideHint();
});
/* 鼠标指到能点的东西（小动物、准星）或能拖的东西（小广告、膜角）上，换成手形光标 */
canvas.addEventListener('pointermove', e => {
  if (wiper.mode !== 'idle') return;
  const r = canvas.getBoundingClientRect();
  const h = game.hitTest(e.clientX - r.left, e.clientY - r.top);
  canvas.classList.toggle('pointer', !!(h && h.click));
  canvas.classList.toggle('grab', !!(h && h.grab));
  tool.setHover(!!h);
});

let prev = performance.now();
/* 每帧主循环花了多少毫秒（验收用：最近 120 帧的平均和最大，以及各段平均） */
const work = [];
const parts = { queue: 0, ui: 0, input: 0, world: 0, fx: 0, hud: 0, render: 0 };
let frames = 0;
function loop(now) {
  requestAnimationFrame(loop);
  const t0 = performance.now();
  const dt = Math.min(0.05, Math.max(0, (now - prev) / 1000));
  prev = now;
  let t = t0;
  const lap = k => {
    const n = performance.now();
    parts[k] += n - t;
    t = n;
  };
  measureRoom();
  const spec = director.next(game.time, settings, canRun);
  if (spec) runAction(game, spec);
  pruneT += dt;
  if (pruneT > 1) {
    pruneT = 0;
    /* 主播设了"排队最多等几秒"才会丢（默认 0 = 一直等） */
    const wait = settings.limits.waitSec;
    const dropped = wait > 0 ? director.prune(game.time, wait, s => s.capSince !== undefined && game.time - s.capSince > wait) : 0;
    if (dropped) hud.toast(`有 ${dropped} 条互动排了 ${wait} 秒还没轮上，先跳过了`, 'block');
  }
  lap('queue');
  ui.tick(dt);
  lap('ui');
  tool.update(dt, game.time);
  wiper.update(dt, game.time);
  lap('input');
  game.update(dt);
  ambient.tick(dt);
  lap('world');
  particles.update(dt);
  water.update(game.time);
  glare.update(dt);
  lap('fx');
  hud.setCounter(stats.today, settings.display.counter);
  if (settings.display.boards) hud.setBoards(stats.boards(), true);
  else hud.setBoards(null, false);
  stats.tick(now);
  lap('hud');
  const sc = scan(stage.scene);
  const tNow = performance.now();
  const texDue = sc.t !== lastT && (tNow - lastInput < INPUT_HOT || tNow - lastRenderAt >= TEX_GAP);
  if (forceRender || sc.moved || sc.a !== lastA || texDue) {
    stage.render();
    markRendered(stage.scene);
    lastA = sc.a;
    lastT = sc.t;
    lastRenderAt = tNow;
    forceRender = false;
    renders++;
  }
  lap('render');
  frames++;
  work.push(performance.now() - t0);
  if (work.length > 120) work.shift();
}
requestAnimationFrame(loop);
document.body.dataset.loaded = 'true';
/* 画布写字要用内置的糖圆体：先让它加载好 */
if (document.fonts && document.fonts.load) document.fonts.load('400 40px TJRound').catch(() => {});

/* 试玩台 / 验收脚本用的接口（只读状态 + 模拟输入，不改设置） */
let peeked = [];
window.glassDemo = {
  trigger(action, p = {}, who = '测试观众') {
    return runAction(game, { action, params: p, who, uid: 'sim-' + who, source: 'sim' });
  },
  queue: spec => trigger(spec),
  /* 模拟送礼（走礼物表和排队，和真实礼物同一条路） */
  gift: (name, price = 0, count = 1, nick = '测试观众') => live.simGift(name, price, count, nick),
  state() {
    return {
      ready: true,
      stains: game.liveStains().map(s => ({ kind: s.kind, owner: s.owner && s.owner.name, remaining: +s.remaining.toFixed(3), x: Math.round(s.x), y: Math.round(s.y), box: s.dirtBox ? [s.dirtBox.x0, s.dirtBox.y0, s.dirtBox.x1, s.dirtBox.y1].map(Math.round) : null })),
      actors: game.actors.map(a => ({ kind: a.kind, at: a.at ? { x: Math.round(a.at.x), y: Math.round(a.at.y) } : null, debug: a.debug || null, hint: a.peelHint || null })),
      today: stats.today,
      particles: particles.count,
      queue: director.size,
      baked: game.messCount() - game.liveStains().filter(s => !s.grime).length,
      bake: game.grimeProf(),
      flyers: game.flyerStats(),
      mode: wiper.mode,
      zone: stage.zone,
      live: live.status()
    };
  },
  settings: () => JSON.parse(JSON.stringify(settings)),
  /* 验收用：把睡着的小广告照真醒来那样临时画出来、立刻重画一帧，截完图再放回去（对比：醒来那一下画面变不变）。
     raise = 临时提到最上面一层、影子画全（这时必须有变化，证明这种比法看得出来） */
  peekSleepers: (on, raise = false) => {
    if (on) {
      peeked = game.actors.filter(a => a.kind === 'flyer' && a.asleep).map(f => ({ f, z: f.z }));
      for (const { f, z } of peeked) {
        f.wake(raise);
        if (raise) f.setZ(z + 1e5);
      }
    } else {
      for (const { f, z } of peeked) {
        f.setZ(z);
        f.sleep(true);
      }
      peeked = [];
    }
    stage.render();
    return peeked.length;
  },
  /* 验收用：让每张能睡的小广告睡一下再醒（看醒过来是不是和原来一模一样） */
  napFlyers: () => {
    const list = game.actors.filter(a => a.kind === 'flyer' && a.canSleep);
    for (const f of list) f.sleep(true);
    for (const f of list) f.wake(true);
    return list.length;
  },
  /* 验收用：贴纸库（上传、数量） */
  stickers: () => ({ count: stickers.count, persistent: stickers.persistent, list: stickers.list().map(s => s.name) }),
  /* 一共真正画了几帧（静着的时候不涨） */
  renders: () => renders,
  /* 验收用：和上次调用比，哪些东西变了（层级 + 类型） */
  changed: (() => {
    let last = new Map();
    return () => {
      const now = objectSignatures(stage.scene);
      const diff = [];
      for (const [id, v] of now) {
        const o = last.get(id);
        if (!o || o.h !== v.h) diff.push(v.order + ':' + v.type + ':props');
        else if (Math.hypot(o.pos[0] - v.pos[0], o.pos[1] - v.pos[1]) >= 1) diff.push(v.order + ':' + v.type + ':moved');
      }
      last = now;
      return diff;
    };
  })(),
  perfParts: () => {
    const r = {};
    for (const k in parts) r[k] = +(parts[k] / Math.max(1, frames)).toFixed(3);
    for (const k in parts) parts[k] = 0;
    frames = 0;
    return r;
  },
  /* 显存/内存估算：脏东西各张画布的像素（颜色 + 遮罩 + 正在刮的两张临时画布），按 4 字节算 */
  memory: () => {
    let px = 0;
    for (const st of game.liveStains()) {
      px += st.color.width * st.color.height + st.mask.width * st.mask.height;
      if (st.passC) px += st.passC.width * st.passC.height * 2;
    }
    const heap = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null;
    return { canvasMB: Math.round((px * 4) / 1048576), textures: stage.renderer.info.memory.textures, geometries: stage.renderer.info.memory.geometries, heapMB: heap };
  },
  perf: () => ({ avgMs: +(work.reduce((a, b) => a + b, 0) / Math.max(1, work.length)).toFixed(2), maxMs: +Math.max(0, ...work).toFixed(2), stains: game.liveStains().length, actors: game.actors.length, particles: particles.count, calls: stage.renderer.info.render.calls }),
  autoplay: () => ui.autoplay.toggle(),
  showDemo: () => ui.showDemo(),
  openSettings: () => ui.openSettings(),
  clear: () => clearGlass()
};
