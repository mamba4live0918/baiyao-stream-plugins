// 南瓜灯工坊（新版）入口：设置、存档、直播接入、画布，全部在这里接起来。
import { loadImages } from './assets.js';
import { createGame } from './game.js';
import { loadSettings, saveSettings, sanitizeSettings, safeStorage } from './settings.js';
import { Live } from './live.js';
import { createAudio } from './audio.js';
import { createFx } from './fx.js';
import { createBench } from './bench.js';
import { createTowerView } from './tower.js';
import { createQueueView } from './queue-view.js';
import { createMess } from './mess.js';
import { createStage } from './stage.js';
import { createBank } from './bank.js';
import { createShowcase } from './showcase.js';
import { createBoard } from './board.js';
import { createHelper } from './helper.js';
import { createEditor, widgetRects } from './widgets.js';
import { avatarCache } from './avatars.js';
import { createUI } from './ui.js';
import { moldPolygons, MOLDS } from './molds.js';

const KEY_STATE = 'pumpkin-lantern.v2.state';
const now = () => performance.now() / 1000;

const storage = safeStorage();
let settings = loadSettings(storage);
const game = createGame();
try { const saved = JSON.parse(storage?.getItem(KEY_STATE) || 'null'); if (saved) game.restore(saved); } catch { /* 存档坏了就从空的开始 */ }

// ---------- 存档：改动后 1 秒内合并写一次，离开页面时马上写 ----------
let saveTimer = 0;
function writeState() {
  saveTimer = 0;
  if (!storage) return;
  try { storage.setItem(KEY_STATE, JSON.stringify(game.snapshot())); } catch { ui?.say('存档失败（浏览器存储满了？）'); }
}
function changed() { if (!saveTimer) saveTimer = setTimeout(writeState, 1000); }
addEventListener('pagehide', () => { if (saveTimer) { clearTimeout(saveTimer); writeState(); } });

// ---------- 世界 ----------
const sprites = new Map();
function sprite(key, make) {
  let c = sprites.get(key);
  if (c) { sprites.delete(key); sprites.set(key, c); return c; }
  c = make();
  if (!c) return null;
  sprites.set(key, c);
  if (sprites.size > 160) sprites.delete(sprites.keys().next().value);
  return c;
}
const audio = createAudio(() => settings.audio);
const fx = createFx();
let stage = null, ui = null, wakeTimer = 0, wakeTimerAt = 0;
const world = {
  game, fx, audio, now, sprite, changed,
  settings: () => settings,
  dpr: () => stage?.dpr || 1,
  wake: () => stage?.wake(),
  wakeAt: sec => {   // 画面静止时，到点叫醒一次（比如手停下 2 秒后开始示范）
    const ms = Math.max(0, (sec - now()) * 1000);
    if (wakeTimer && wakeTimerAt <= sec) return;
    clearTimeout(wakeTimer);
    wakeTimerAt = sec;
    wakeTimer = setTimeout(() => { wakeTimer = 0; stage?.wake(); }, ms + 16);
  },
  onDone: (lantern, from) => { tower.arrive(lantern, { x: from.x, bottom: from.y + from.size * 0.43, size: from.size, fresh: true }); stage?.wake(); },
  onBroken: () => {},
  // 不给糖就捣蛋：够就扣糖、糖飞过去，返回 true；不够返回 false
  payCandy: (n, to) => { if (!game.spend(n)) return false; bank.flyOut(to, n); changed(); stage?.wake(); return true; },
  // 小车送达：报一下送达的名字，糖从车上飞进糖罐
  onShipped: (lanterns, gained, from) => {
    const names = lanterns.map(l => l.nick), list = names.slice(0, 4).join('、') + (names.length > 4 ? ' 等 ' + names.length + ' 人' : '');
    ui?.say('送达！' + list + (gained ? '　糖 +' + gained : ''));
    game.addCandy(gained);
    bank.flyIn(from, gained);
    showcase.deliver(lanterns, now());
    changed(); stage?.wake();
  },
  // 摆位置：拖的时候先改在内存里（画面跟着动），点「完成」才存
  editing: false,
  setLayout: (id, value) => { settings = { ...settings, layout: { ...settings.layout, [id]: value } }; stage?.wake(); },
  banner: (text, kind) => ui?.banner(text, kind),
  say: text => ui?.say(text)
};
const tower = createTowerView(world);
const bench = createBench(world);
const queueView = createQueueView(world);
const mess = createMess(world, tower);
const bank = createBank(world);
const showcase = createShowcase(world);
const board = createBoard(world);
const helper = createHelper(world, tower);
const editor = createEditor(world);

// ---------- 直播事件 → 订单 / 捣乱 ----------
function trigger(spec) {
  if (!spec) return false;
  if (spec.kind === 'order') {
    const who = { nick: spec.nick, uid: spec.uid || 'nick:' + spec.nick, face: spec.face || null, ...(spec.avatar ? { avatar: spec.avatar } : {}) };
    let added = 0;
    for (let i = 0; i < spec.count; i++) {
      const r = game.addOrder(who, { perPerson: settings.order.perPerson, via: spec.via || 'comment' });
      if (r.nudge) { queueView.nudge(r.nudge, now()); break; }
      added++;
    }
    if (added) { changed(); if (spec.via === 'gift' && added > 1) ui?.say(who.nick + ' 订了 ' + added + ' 个南瓜'); }
  } else if (spec.kind === 'help') {   // 帮做礼物：派南瓜精灵来
    helper.add(spec.nick, spec.uid || 'nick:' + spec.nick, spec.count);
  } else if (spec.kind === 'candy') {   // 粉丝送糖：加进糖罐（记在贡献榜上）
    const n = game.addCandy(spec.count, { nick: spec.nick, uid: spec.uid || 'nick:' + spec.nick });
    if (n) { changed(); ui?.say(spec.nick + ' 送来 ' + n + ' 颗糖'); const L = stage?.layout; if (L) bank.flyIn({ x: L.W * 0.5, y: L.H * 0.35 }, n); }
  } else mess.add(spec.kind, spec.count, spec.nick);
  stage?.wake();
  return true;
}
const live = new Live(trigger, () => settings, globalThis, () => ui?.liveChanged(live));

// ---------- 设置 ----------
function applySettings(next) {
  const sideChanged = next.tower.side !== settings.tower.side || next.tower.size !== settings.tower.size || next.bench.size !== settings.bench.size;
  settings = sanitizeSettings(next);
  saveSettings(settings, storage);
  if (sideChanged) { sprites.clear(); stage?.resize(); }
  stage?.wake();
}
function resetAll() {
  mess.clear();
  tower.clear();
  bank.clear();
  showcase.clear();
  helper.clear();
  fx.clear();
  game.reset();
  changed();
  bench.resume();
  stage?.wake();
}

// ---------- 摆位置 ----------
let layoutBefore = null;
function setEditing(on, keep = true) {
  if (on === world.editing) return;
  world.editing = on;
  if (on) layoutBefore = JSON.parse(JSON.stringify(settings.layout));
  else if (keep) applySettings(settings);   // 点「完成」：存下来
  else settings = { ...settings, layout: layoutBefore };
  ui?.editing(on);
  stage?.wake();
}
function resetLayout() { settings = { ...settings, layout: { garland: null, board: null, bank: null } }; stage?.wake(); }

// ---------- 试玩页 / QA 用的接口 ----------
const NAMES = ['小白不白', '大黄', '南瓜控', '夜猫子', '糖糖', '阿呆', '路过的鬼', '月亮船', '橘子汽水', '星星眨眼', '小透明', '奶茶三分糖'];
let simSeq = 0;
const pickName = () => NAMES[simSeq++ % NAMES.length] + (simSeq > NAMES.length ? Math.ceil(simSeq / NAMES.length) : '');
globalThis.pumpkinDemo = {
  order(n = 1, opts = {}) { for (let i = 0; i < n; i++) { const nick = opts.nick || pickName(); trigger({ kind: 'order', count: 1, nick, uid: opts.uid || 'sim:' + nick, face: opts.face || null, via: opts.via || 'gift', ...(opts.avatar ? { avatar: opts.avatar } : {}) }); } },
  gift(name, count = 1, nick = '试玩观众') { return live.simGift(name, count, nick); },
  comment(content, nick = '试玩观众') { return live.simComment({ content, nickname: nick, userId: 'sim:' + nick }); },
  mess(kind, n = 1, nick) { trigger({ kind, count: n, nick: nick || pickName() }); },
  candy(n = 10, nick) { trigger({ kind: 'candy', count: n, nick: nick || pickName() }); },
  help(n = 1, nick) { const who = nick || pickName(); trigger({ kind: 'help', count: n, nick: who, uid: 'sim:' + who }); },
  edit(on = true) { setEditing(on); },
  sweepAvatars() { avatarCache.sweep(); return avatarCache.size(); },
  stack(n = 5, opts = {}) {
    const L = stage.layout;
    for (let i = 0; i < n; i++) {
      const id = MOLDS[Math.floor(Math.random() * MOLDS.length)].id, nick = pickName();
      const lantern = game.addLantern({ nick, uid: 'sim:' + nick, ...(opts.avatar ? { avatar: opts.avatar } : {}) }, [{ kind: 'hole', paths: moldPolygons(id).map(p => p.map(([x, y]) => [Math.round(x * 1023), Math.round(y * 1023)])) }]);
      tower.arrive(lantern, { x: L.tower.x + (L.flip ? 1 : -1) * L.m * 0.3, bottom: L.floor, size: L.tower.size }, i * 0.05);
    }
    changed(); stage.wake();
  },
  reset: resetAll,
  settings: () => JSON.parse(JSON.stringify(settings)),
  setSettings: s => applySettings({ ...settings, ...s }),
  openSettings: () => ui?.openSettings(),
  state: () => ({ game: JSON.parse(JSON.stringify(game.snapshot())), bench: bench.info(), tower: tower.info(), mess: mess.info(), helper: helper.info(), showcase: { busy: showcase.busy, ...showcase.info() }, fans: game.topFans(5), widgets: stage && widgetRects(stage.layout, settings), editing: world.editing, avatars: avatarCache.size(), layout: stage?.layout, stage: stage?.stats(), live: live.status() })
};

// ---------- 开工 ----------
loadImages().then(() => {
  const canvas = document.getElementById('stage');
  stage = createStage(canvas, world, { bench, tower, queue: queueView, mess, fx, bank, showcase, board, helper, editor });
  ui = createUI({ getSettings: () => settings, apply: applySettings, reset: resetAll, trial: () => pumpkinDemo.order(1, { nick: '试做', uid: 'try' }), live, edit: setEditing, resetLayout });
  bench.resume();
  live.start();
  stage.wake();
  document.documentElement.dataset.ready = 'true';
});
