/* 淘金 · 簸箕版 · 启动与主循环：搭场景 → 接玩法 → 接鼠标、文字层、声音、直播、设置面板 */
import * as THREE from 'three';
import { createView } from './view.js';
import { makeMaterials } from './scene/materials.js';
import { buildBasket } from './scene/basket.js';
import { createParticles } from './scene/particles.js';
import { createNuggets } from './scene/nuggets.js';
import { createSacks } from './scene/sack.js';
import { createThieves } from './scene/thief.js';
import { makeLabel, disposeLabel } from './scene/labels.js';
import { applyAssetOverrides } from './scene/assets.js';
import { PanSim } from './pan.js';
import { BASKET } from './shape.js';
import { Motion, ZONES } from './motion.js';
import { BASKET_REST, COUNTER } from './layout.js';
import { rnd } from './util.js';
import { Game } from './game.js';
import { createInput } from './input.js';
import { createHud } from './hud.js';
import { Audio } from './audio.js';
import { Live } from './live.js';
import { store, sanitizeSettings } from './settings.js';
import { buildSpec } from './tiers.js';
import { createApp } from './ui/app.js';

const params = new URLSearchParams(location.search);
const DEMO = params.get('demo') === '1';
const bg = params.get('bg');
if (bg) document.getElementById('bg').className = bg;
if (document.fonts && document.fonts.load) document.fonts.load('700 40px TJRound').catch(() => {});

let { settings, readable } = store.loadSettings();
let app = null;
const QUALITY = { high: [2, 4096], medium: [1.5, 2048], low: [1, 1024] };

const canvas = document.getElementById('cv');
const view = createView(canvas, { shadows: 'soft', zoom: settings.display.zoom });
const M = makeMaterials();
applyAssetOverrides(M, view.renderer);
const sim = new PanSim();
const basket = buildBasket(view.scene, M, sim);
const motion = new Motion(BASKET_REST.pitch);
/* 没有场景：簸箕下面什么都没有，掉出去的东西落出画面就算没了 */
const FALL_OUT = -1.6;

/* ---------- 粒子落地：落回簸箕就堆成沙，落进水里溅一下 ---------- */
const inv = new THREE.Matrix4();
const tmp = new THREE.Vector3();
function toLocal(p) {
  return tmp.set(p.x, p.y, p.z).applyMatrix4(inv);
}
const inBasket = l => Math.abs(l.x) <= BASKET.W / 2 && Math.abs(l.z) <= BASKET.D / 2;
let particles = null;
particles = createParticles(view.scene, {
  landGrain(p) {
    const l = toLocal(p);
    if (inBasket(l) && l.y > sim.floorAt(l.x, l.z) - 0.2) {
      if (l.y > sim.topAt(l.x, l.z)) return false;
      if (p.vol > 0) sim.field.deposit(l.x, l.z, p.vol, 0.16);
      return true;
    }
    return p.y < FALL_OUT;
  },
  landDrop(p) {
    const l = toLocal(p);
    if (inBasket(l) && l.y > sim.floorAt(l.x, l.z) - 0.2) return l.y <= sim.topAt(l.x, l.z) + 0.02;
    return p.y < FALL_OUT;
  }
});

/* ---------- 镜头抖动（装饰动画关闭时不抖） ---------- */
let shakeAmt = 0;
let shaking = false;
const motionOn = () => settings.display.motion === 'on' || (settings.display.motion === 'system' && !matchMedia('(prefers-reduced-motion: reduce)').matches);
function shake(a) {
  shakeAmt = Math.max(shakeAmt, a);
}
function applyShake(dt) {
  const amp = motionOn() ? shakeAmt : 0;
  shakeAmt = Math.max(0, shakeAmt - dt * 1.6);
  const cam = view.camera;
  if (amp > 0.0005) {
    cam.position.copy(view.base.pos).add(new THREE.Vector3(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).multiplyScalar(amp));
    cam.updateMatrixWorld();
    shaking = true;
  } else if (shaking) {
    cam.position.copy(view.base.pos);
    cam.updateMatrixWorld();
    shaking = false;
  }
}

/* ---------- 玩法 ---------- */
const listeners = [];
/* 金子飞去的地方：数字牌那里（没有 3D 的盆，数字牌跳一下就是收到了） */
const counter = {
  mouth: () => new THREE.Vector3(COUNTER.x, COUNTER.y, COUNTER.z),
  open: () => {},
  bump: () => w.hud.pulse()
};
const w = {
  view, M, sim, basket, counter, motion, particles,
  getSettings: () => settings,
  shake,
  emit: (type, data) => listeners.forEach(fn => fn(type, data))
};
w.hud = createHud(document.getElementById('hud'), { view, getSettings: () => settings });
w.audio = new Audio(settings);
const game = new Game(w);
w.nuggets = createNuggets({ scene: view.scene, root: basket.root, sim, M, particles, counter, hooks: game.nuggetHooks() });
w.sacks = createSacks(view.scene, {
  M,
  target: job => basket.root.localToWorld(new THREE.Vector3(job.local.x, sim.topAt(job.local.x, job.local.z), job.local.z)),
  onBurst: job => game.onBurst(job)
});
w.thieves = createThieves(view.scene, { M, particles, root: basket.root, counter, topAt: (x, z) => sim.topAt(x, z), getPointer: () => w.input.pointer(), shake: () => w.A || 0, ...game.thiefHooks() });

/* 金子存档：只存金额和榜单（试玩页单独一份）。旧存档读不出来就不覆盖它；存储出问题只提示一次 */
let warned = false;
function warnOnce(text) {
  if (warned) return;
  warned = true;
  w.hud.toast({ text, tone: 'bad' });
}
const vaultRead = store.loadVault(DEMO);
let vaultLocked = vaultRead.exists && (!vaultRead.ok || !game.eco.restore(vaultRead.value));
game.syncGold(true);
if (!readable || (!vaultRead.ok && !vaultRead.exists)) warnOnce('浏览器存储读不出来：这次的设置和金子只在本页有效');
else if (vaultLocked) warnOnce('金子存档读不出来，这次不覆盖它；到设置→存档清空后才重新保存');
w.onVaultReset = () => (vaultLocked = false);
function saveVault() {
  if (!game.dirty || vaultLocked) return;
  game.dirty = false;
  if (!store.saveVault(game.eco.export(), DEMO)) warnOnce('浏览器不让保存金子，这次淘到的只在本页有效');
}
setInterval(saveVault, 2000);
addEventListener('pagehide', saveVault);

/* ---------- 设置 ---------- */
const settingsListeners = [];
function applySettings(next, persist = true) {
  settings = sanitizeSettings(next);
  view.setOpts({ zoom: settings.display.zoom });
  view.setFrame(settings.display.frame);
  const q = QUALITY[settings.display.quality];
  view.setQuality(q[0], q[1]);
  w.audio.apply(settings);
  if (persist && !store.saveSettings(settings)) warnOnce('浏览器不让保存设置，这次的改动只在本页有效');
  settingsListeners.forEach(fn => fn(settings));
}

const live = new Live(game, () => settings);
w.input = createInput(canvas, {
  view, motion, nuggets: w.nuggets, thieves: w.thieves, audio: w.audio,
  onFirst: () => w.audio.unlock(),
  onDoubleClick: () => app && app.openSettings()
});

view.resize();
applySettings(settings, false);
addEventListener('resize', () => view.resize());

/* ---------- 簸箕的姿态 → 模拟需要的水面斜率 ---------- */
let bob = 0;
function placeBasket(dt) {
  motion.update(dt);
  bob += dt;
  const r = basket.root;
  r.position.set(BASKET_REST.x + motion.x, BASKET_REST.y + (motion.held ? 0 : Math.sin(bob * 1.1) * 0.01), BASKET_REST.z);
  r.rotation.set(motion.pitch, 0, motion.roll);
  r.updateMatrixWorld(true);
  inv.copy(r.matrixWorld).invert();
  const m = r.matrixWorld.elements;
  return { bx: m[1] / m[5], bz: m[9] / m[5] };
}

/* 前口往外倒：水滴 + 冲出去的沙粒 */
const lipPt = new THREE.Vector3();
const lipDir = new THREE.Vector3();
let pourLevel = 0;
function pourFromLip(dt, stepped) {
  const { nx, nz, X, Z, S, spillWater, spillSand } = sim;
  const lip = nz - 1;
  lipDir.set(0, 0, 1).applyQuaternion(basket.root.quaternion);
  let sand = 0;
  for (let i = 0; i < nx; i++) sand += spillSand[i];
  /* 按真正流出去的水量出水滴；水面只是贴着前口边沿时不滴 */
  pourLevel = Math.min(1, sim.waterOut / PanSim.INFLOW);
  let budgetW = sim.waterOut > PanSim.INFLOW * 0.08 ? Math.min(30, Math.round(pourLevel * 26 * dt * 60)) : 0;
  let budgetS = stepped ? Math.min(30, Math.round(sand / 0.0000015)) : 0;
  for (let n = 0; n < 60 && (budgetW > 0 || budgetS > 0); n++) {
    const i = Math.floor(Math.random() * nx);
    if (spillWater[i] <= 0.0015 && spillSand[i] <= 0) continue;
    lipPt.set(X[i] + rnd(-0.015, 0.015), S[lip * nx + i] + BASKET.lipH + rnd(0, 0.02), Z[lip] + 0.03);
    basket.root.localToWorld(lipPt);
    const sp = rnd(0.5, 1.1);
    if (spillWater[i] > 0.0015 && budgetW > 0) {
      budgetW--;
      particles.drop(lipPt.x, lipPt.y, lipPt.z, lipDir.x * sp, rnd(-0.2, 0.4), lipDir.z * sp, rnd(0.005, 0.01));
    }
    if (spillSand[i] > 0 && budgetS > 0) {
      budgetS--;
      particles.grain(lipPt.x, lipPt.y, lipPt.z, lipDir.x * sp * 0.9, rnd(-0.1, 0.4), lipDir.z * sp * 0.9, rnd(0.008, 0.016), 0);
    }
  }
}

/* ---------- 主循环 ---------- */
const SIM_DT = 1 / 60;
let simAcc = 0;
function update(dt) {
  game.update(dt);
  const slope = placeBasket(dt);
  const rocks = w.nuggets.rocks().length;
  /* 石头压着簸箕变沉：实际晃动强度打折（力度条、甩金子、甩小偷都用这个） */
  const A = motion.A * (1 - Math.min(0.6, rocks * 0.12));
  w.A = A;
  /* 端着晃的时候一边舀水一边往外倒；放下不动时不进水，水面落到前口边沿就不再往外流 */
  sim.inflow = motion.held && motion.A > 0.05 ? PanSim.INFLOW : 0;
  /* 模拟固定 1/60 秒一步，和屏幕帧率无关（一帧最多补 4 步） */
  simAcc = Math.min(simAcc + dt, SIM_DT * 4);
  let stepped = 0;
  while (simAcc >= SIM_DT - 1e-9) {
    sim.step(SIM_DT, { A, bx: slope.bx, bz: slope.bz, murk: game.troubles.murk });
    simAcc -= SIM_DT;
    stepped++;
  }
  pourFromLip(dt, stepped);
  w.sacks.update(dt);
  w.thieves.update(dt);
  w.nuggets.update(dt, { A, pitch: motion.pitch, murk: game.troubles.murk, spill: settings.play.spill, danger: ZONES.good, fallOut: FALL_OUT });
  M.waterMap.offset.y = (M.waterMap.offset.y + dt * (0.08 + A * 0.4)) % 1;
  particles.update(dt);
  sim.field.dry(dt);
  basket.update(game.troubles.murk);
  w.audio.ambient(motion.A, pourLevel);
  w.hud.update(dt, game.eco, game.troubles.warning);
  w.hud.meter(dt, A, w.input.holding());
  applyShake(dt);
  if (app) app.tick(dt);
}

function render() {
  view.renderer.render(view.scene, view.camera);
}

/* 预热：把之后才会出现的材质（麻袋、金子、名字牌……）先编译一遍，第一袋矿落下时不卡 */
function warmUp() {
  const g = new THREE.Group();
  const geo = new THREE.BoxGeometry(0.01, 0.01, 0.01);
  const mats = new Set([...Object.values(M).filter(v => v && v.isMaterial), ...w.nuggets.materials, ...w.sacks.materials()]);
  for (const m of mats) {
    for (const s of [false, true]) {
      const x = new THREE.Mesh(geo, m);
      x.castShadow = x.receiveShadow = s;
      g.add(x);
    }
  }
  const label = makeLabel('预热', {});
  g.add(label);
  view.scene.add(g);
  try {
    view.renderer.compile(view.scene, view.camera);
    for (const t of [label.material.map, ...particles.textures]) view.renderer.initTexture(t);
    view.renderer.render(view.scene, view.camera);
  } catch (e) {
    /* 预热失败不影响玩 */
  }
  view.scene.remove(g);
  disposeLabel(label);
  geo.dispose();
}
placeBasket(0);
sim.computeWater(0, 0);
basket.update(0);
warmUp();
w.audio.unlock();

let last = performance.now();
let manual = false;
let loopErrors = 0;
/* 先约好下一帧再干活：哪一帧出错也不会让整个画面停住 */
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;
  if (manual) return;
  try {
    update(dt);
    render();
  } catch (e) {
    if (++loopErrors === 1) {
      console.error('[淘金 簸箕版] 帧更新出错，已跳过并继续', e);
      w.hud.toast({ text: '画面出了点小错，已自动跳过', tone: 'bad' });
    }
  }
}

app = createApp({
  game, live, w,
  getSettings: () => settings,
  applySettings,
  onSettings: fn => settingsListeners.push(fn),
  onEvent: fn => listeners.push(fn),
  demo: DEMO
});
live.start();
requestAnimationFrame(loop);
document.getElementById('loading').remove();

/* ---------- 调试/验收接口：手动推进时间（截图用） ---------- */
window.TJ3 = {
  ready: true,
  THREE, view, sim, basket, motion, game, w, live,
  get settings() {
    return settings;
  },
  get app() {
    return app;
  },
  applySettings,
  /* 直接触发一个互动：TJ3.fire('ore','heavy',2,'阿花') */
  fire(action, tier, count = 1, who = '测试观众') {
    return game.trigger(buildSpec(settings, action, tier || settings.actions[action].defaultTier, count, who, 'sim'));
  },
  manual(on) {
    manual = !!on;
  },
  step(seconds, fps = 60) {
    const n = Math.max(1, Math.round(seconds * fps));
    for (let i = 0; i < n; i++) update(1 / fps);
    render();
  },
  render,
  update,
  /* 特写：把相机对准某一点（只用于检查细节） */
  focus(x, y, z, dist = 4, pitch = 35, yaw = 0) {
    const cam = view.camera;
    cam.clearViewOffset();
    cam.aspect = view.size.w / view.size.h;
    cam.updateProjectionMatrix();
    const p = THREE.MathUtils.degToRad(pitch);
    const yw = THREE.MathUtils.degToRad(yaw);
    cam.position.set(x + Math.sin(yw) * Math.cos(p) * dist, y + Math.sin(p) * dist, z + Math.cos(yw) * Math.cos(p) * dist);
    cam.lookAt(x, y, z);
    cam.updateMatrixWorld();
    render();
  },
  /* 世界坐标 → 屏幕像素（自动化测试用） */
  toScreen(x, y, z) {
    const v = new THREE.Vector3(x, y, z).project(view.camera);
    return { x: (v.x * 0.5 + 0.5) * view.size.w, y: (-v.y * 0.5 + 0.5) * view.size.h };
  },
  /* 簸箕里某点（簸箕坐标）在屏幕上的位置 */
  basketScreen(x, z) {
    const v = basket.root.localToWorld(new THREE.Vector3(x, sim.topAt(x, z), z));
    return this.toScreen(v.x, v.y, v.z);
  }
};
