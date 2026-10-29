import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { RoundedBoxGeometry } from 'three/addons/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/RoomEnvironment.js';
import { installInlineSelects } from './inline-select.js';
import { DEFAULTS, DEFAULT_LEVELS, DEFAULT_GLEVELS, loadConfig, cleanLevel, cleanGLevel, clone, exportPayload, parseImport, defaultLayout } from './config.js';
import { MODES, MODE_IDS, EFFECTS, EFF, effLabel, resolveEffect, ACTION_ALIAS, LEVEL_FIELDS, binLabels } from './modes.js';
import { SRC, DEFAULT_RULES, normKey, validRule, validRules } from './rules.js';
import { GARBAGE, GARBAGE_BY_ID, itemsByCat, trickyItems, enabledItems, wrongTip, binName, catOf } from './garbage-catalog.js';
import { judgeDrop, newStats, recordWrong, statsLine, topStumper } from './mistake.js';
import { stageRect, viewOffsetArgs, frustumPlanes, insidePlanes, coneHullPoints } from './view-geom.js';
import { RefCache } from './tex-pool.js';
import { TIER_PARAMS, DEFAULT_TIERS, MAX_TIERS, tierOf, findTier, defaultTier, newTier, parseTierAction, fixParam, cleanTierName, normTierRefs } from './tiers.js';
import { pushSeg, segAt, segsEnd, segAfter } from './timed.js';
import { STAGE_IDS, STAGE_LABEL, stageOf, dockCells } from './stages.js';
import { createHeadEditor } from './head-editor.js';
import { createGarbageKit } from './garbage-models.js';
import { dockLoad, advanceStall, topOfStack } from './conveyor-flow.js';
import { binRearGuards } from './bin-rear-guards.js';
import { RestingBatches } from './resting-batches.js';

/* ================= 工具 ================= */
const $ = id => document.getElementById(id);
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const eOut = t => 1 - Math.pow(1 - t, 3);
const eIO = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const FONT = '"Microsoft YaHei UI","Microsoft YaHei","PingFang SC","Noto Sans CJK SC",sans-serif';
const COL = MODES.express.bins;
const isGarbage = () => S.mode === 'garbage';
const kit = createGarbageKit(THREE, RoundedBoxGeometry); // 垃圾模型（筐的分类标签在建筐时就要用）
const NAMES = ['小王', '阿橙', '大熊', '木木', '七七', '豆包', '阿杰', '小鹿', '饭团', 'Momo'];

/* ================= 设置（全部可在管理面板里改，存本机浏览器；默认值、范围与迁移见 config.js） ================= */
/* 每次存档格式变化都换新键：第一次打开读入上一版的（V2.0 的 v4、V1.0 的 v3），之后只写新键、不碰旧版的存档。
   旧版关页面时会按自己的格式整份重写设置，共用一个键的话，退回旧版再回来，新版的设置就没了 */
const KEY = 'kd-3d-config-v7', OLD_KEYS = ['kd-3d-config-v6', 'kd-3d-config-v5', 'kd-3d-config-v4', 'kd-3d-config-v3'];
const S = loadConfig(null);
let storageWarned = false;
try {
  let o = JSON.parse([KEY, ...OLD_KEYS].map(k => localStorage.getItem(k)).find(Boolean) || 'null');
  if (!o) { const old = JSON.parse(localStorage.getItem('kd-3d-demo-v1') || 'null'); if (old) o = { sound: old.sound, bg: old.bg, link: { ws: old.wsOn !== false, port: old.port || 10030 }, layout: { board: { on: old.board !== false } } }; }
  // 从交付版升级时保留用户正在看的经典布局和位置。
  if (o?.layout && !o.layout.stage) o.layout.stage = 'classic';
  if (o) Object.assign(S, loadConfig(o));
} catch (e) { console.warn('设置读取失败，已使用默认设置', e); }
/* 分拣台布局（柜台 / 经典俯视，见 stages.js）：场景和碰撞体按它一次建好，切换布局会重新载入页面 */
const STAGE = stageOf(S.layout.stage);
let saveT = 0;
function save(now) {
  clearTimeout(saveT);
  const run = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { if (!storageWarned) { storageWarned = true; setTimeout(() => toast('浏览器没能保存设置，本页可以继续用，刷新后会丢失'), 0); } } };
  if (now) run(); else saveT = setTimeout(run, 300);
}
addEventListener('pagehide', () => save(true));

/* ================= 声音（合成） ================= */
let AC = null, master = null, nbuf = null, time = 0;
function au() { if (!S.sound) return null; try { if (!AC) { AC = new (window.AudioContext || window.webkitAudioContext)(); master = AC.createGain(); master.gain.value = S.volume / 100; master.connect(AC.destination); } if (AC.state === 'suspended') AC.resume(); } catch (e) { return null; } return AC; }
function tone(f, dur, type, vol, f2, delay) { const a = au(); if (!a) return; const t = a.currentTime + (delay || 0); const o = a.createOscillator(), g = a.createGain(); o.type = type || 'sine'; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur); g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + .008); g.gain.exponentialRampToValueAtTime(.0001, t + dur); o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + .03); }
function noise(dur, vol, freq, delay, q, type) { const a = au(); if (!a) return; if (!nbuf) { nbuf = a.createBuffer(1, a.sampleRate, a.sampleRate); const d = nbuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; } const t = a.currentTime + (delay || 0); const s = a.createBufferSource(); s.buffer = nbuf; const f = a.createBiquadFilter(); f.type = type || 'bandpass'; f.frequency.value = freq; f.Q.value = q || .8; const g = a.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + dur); s.connect(f); f.connect(g); g.connect(master); s.start(t, Math.random() * .5); s.stop(t + dur + .03); }
let lastLand = 0;
const sfx = {
  pick() { tone(420, .07, 'sine', .06, 640); noise(.05, .06, 2400); },
  drop() { tone(165, .16, 'sine', .3, 80); noise(.07, .18, 1500); },
  bigBin() { tone(105, .32, 'sine', .4, 48); noise(.2, .28, 650); },
  wrong() { tone(240, .12, 'square', .035, 170); tone(190, .14, 'square', .035, 130, .1); },
  split() { noise(.12, .16, 1900, 0, 1.2); tone(520, .14, 'triangle', .07, 1040); tone(780, .16, 'triangle', .06, 1560, .07); },
  land(v) { if (time - lastLand < .045) return; lastLand = time; const k = clamp(v / 14, 0, 1); noise(.06, .03 + k * .12, 900 + Math.random() * 500); tone(130 + Math.random() * 40, .07, 'sine', .02 + k * .08, 80); },
  heavy() { tone(78, .5, 'sine', .55, 34); noise(.4, .38, 380, 0, .6, 'lowpass'); noise(.14, .22, 1700, .02); },
  truck() { noise(1.1, .09, 150, 0, .5, 'lowpass'); tone(1050, .09, 'square', .03, null, .25); tone(1050, .09, 'square', .03, null, .55); },
  thump() { noise(.07, .08, 900); },
  robot() { tone(880, .08, 'sine', .05, 1400); tone(1320, .1, 'sine', .05, 1900, .09); },
  zip() { tone(620, .08, 'triangle', .05, 1200); },
  blocked() { tone(160, .08, 'triangle', .08, 120); },
  rip() { noise(.1, .18, 3800, 0, 1.5, 'highpass'); noise(.07, .1, 2600, .05, 1.2); },
  swoosh() { noise(.38, .12, 900, 0, .7); tone(300, .3, 'sine', .05, 700); },
  kick() { tone(66, .45, 'sine', .6, 30); noise(.32, .42, 280, 0, .6, 'lowpass'); for (let i = 0; i < 6; i++) noise(.06, .12, rnd(900, 2200), .07 + i * .06); },
  tapeOn() { noise(.3, .08, 3000, 0, 2); tone(900, .22, 'triangle', .03, 500); },
  whistle() { tone(1400, .5, 'sine', .04, 500); },
  audit() { for (let i = 0; i < 3; i++) { tone(1180, .16, 'square', .035, 900, i * .22); tone(880, .16, 'square', .03, 700, i * .22 + .11); } },
  prank() { tone(310, .16, 'sawtooth', .04, 200); tone(260, .2, 'sawtooth', .04, 160, .14); tone(420, .1, 'square', .025, 300, .3); },
  speedUp() { tone(200, .6, 'sawtooth', .05, 900); noise(.5, .08, 1200, 0, .8); },
  scanOk() { tone(1320, .08, 'square', .04); tone(1760, .12, 'square', .04, null, .09); },
  done() { noise(.03, .25, 3200); tone(1320, .55, 'sine', .12, null, .1); tone(1760, .7, 'sine', .08, null, .2); },
};

/* ================= 贴图 ================= */
function cvs(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function rr(g, x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function shape2d(g, k, x, y, s, fill) { g.beginPath(); if (k === 0) g.arc(x, y, s * .5, 0, Math.PI * 2); else if (k === 1) { g.moveTo(x, y - s * .56); g.lineTo(x + s * .6, y + s * .46); g.lineTo(x - s * .6, y + s * .46); g.closePath(); } else { rr(g, x - s * .44, y - s * .44, s * .88, s * .88, s * .08); } g.fillStyle = fill; g.fill(); }
function fitText(g, t, max) { if (g.measureText(t).width <= max) return t; while (t.length > 1 && g.measureText(t + '…').width > max) t = t.slice(0, -1); return t + '…'; }
function tex(c, rep) { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; } return t; }

const CARD = (() => {
  const c = cvs(512, 512), g = c.getContext('2d');
  g.fillStyle = '#c8935a'; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 70; i++) { const x = Math.random() * 512, y = Math.random() * 512, r = 40 + Math.random() * 140; const gr = g.createRadialGradient(x, y, 0, x, y, r); const d = Math.random() < .5; gr.addColorStop(0, d ? 'rgba(120,70,30,.08)' : 'rgba(255,232,196,.08)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); }
  for (let i = 0; i < 16000; i++) { g.fillStyle = Math.random() < .5 ? `rgba(90,52,22,${Math.random() * .14})` : `rgba(255,238,205,${Math.random() * .12})`; g.fillRect(Math.random() * 512, Math.random() * 512, 1 + Math.random() * 1.6, 1); }
  g.lineCap = 'round';
  for (let i = 0; i < 600; i++) { const x = Math.random() * 512, y = Math.random() * 512; g.strokeStyle = `rgba(105,65,30,${Math.random() * .08})`; g.lineWidth = Math.random() * 1.3; g.beginPath(); g.moveTo(x, y); g.lineTo(x + rnd(-6, 6), y + rnd(10, 46)); g.stroke(); }
  return c;
})();
const BUMP = (() => { const c = cvs(512, 512), g = c.getContext('2d'); g.fillStyle = '#808080'; g.fillRect(0, 0, 512, 512); for (let i = 0; i < 9000; i++) { const v = Math.floor(rnd(90, 170)); g.fillStyle = `rgba(${v},${v},${v},.35)`; g.fillRect(Math.random() * 512, Math.random() * 512, 1 + Math.random() * 2, 1 + Math.random()); } for (let y = 0; y < 512; y += 9) { g.fillStyle = 'rgba(255,255,255,.05)'; g.fillRect(0, y, 512, 3); } const t = new THREE.CanvasTexture(c); return t; })();

function cardBase(g, w, h) {
  g.drawImage(CARD, 0, 0, 512, 512, 0, 0, w, h);
  const e = Math.min(w, h);
  for (const [a, lw] of [[.3, 6], [.14, 18], [.06, 40]]) { g.strokeStyle = `rgba(70,38,12,${a})`; g.lineWidth = lw; g.strokeRect(0, 0, w, h); }
  const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(255,240,215,.10)'); gr.addColorStop(1, 'rgba(60,30,10,.08)'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
  return e;
}
function tapeStrip(g, x, y, w, h, color, vertical) {
  g.save(); g.fillStyle = COL[color].hex; g.globalAlpha = .93; g.fillRect(x, y, w, h); g.globalAlpha = 1;
  const gr = vertical ? g.createLinearGradient(x, 0, x + w, 0) : g.createLinearGradient(0, y, 0, y + h);
  gr.addColorStop(0, 'rgba(255,255,255,.0)'); gr.addColorStop(.25, 'rgba(255,255,255,.32)'); gr.addColorStop(.35, 'rgba(255,255,255,.05)'); gr.addColorStop(1, 'rgba(0,0,0,.12)');
  g.fillStyle = gr; g.fillRect(x, y, w, h);
  g.fillStyle = 'rgba(0,0,0,.18)'; if (vertical) { g.fillRect(x, y, 2, h); g.fillRect(x + w - 2, y, 2, h); } else { g.fillRect(x, y, w, 2); g.fillRect(x, y + h - 2, w, 2); }
  g.restore();
}
function arrows(g, x, y, s, a) { g.save(); g.fillStyle = `rgba(55,32,12,${a})`; for (const dx of [0, s * .9]) { g.beginPath(); g.moveTo(x + dx, y - s); g.lineTo(x + dx + s * .38, y - s * .45); g.lineTo(x + dx + s * .14, y - s * .45); g.lineTo(x + dx + s * .14, y + s * .3); g.lineTo(x + dx - s * .14, y + s * .3); g.lineTo(x + dx - s * .14, y - s * .45); g.lineTo(x + dx - s * .38, y - s * .45); g.closePath(); g.fill(); } g.fillRect(x - s * .45, y + s * .45, s * 1.8, s * .1); g.restore(); }

const texCache = new Map();
function sideTex(color, name, big, serial) {
  const key = `s${color}|${big ? 1 : 0}|${serial % 6}`; if (!name && texCache.has(key)) return texCache.get(key);
  const w = 512, h = big ? 346 : 368, c = cvs(w, h), g = c.getContext('2d');
  cardBase(g, w, h);
  const tw = big ? 84 : 96; tapeStrip(g, w / 2 - tw / 2, 0, tw, big ? 62 : 74, color, true);
  if (big) { tapeStrip(g, 0, h * .54, w, 44, color, false); }
  const lw = big ? 320 : 400, lh = big ? 160 : 196, lx = big ? 28 : 22, ly = big ? 92 : 132;
  g.save(); g.translate(lx + lw / 2, ly + lh / 2); g.rotate(-.014);
  g.shadowColor = 'rgba(60,30,8,.3)'; g.shadowBlur = 8; g.shadowOffsetY = 3; g.fillStyle = '#fbf8f1'; rr(g, -lw / 2, -lh / 2, lw, lh, 14); g.fill(); g.shadowColor = 'transparent';
  const bs = lh - 32; g.fillStyle = COL[color].hex; rr(g, -lw / 2 + 16, -lh / 2 + 16, bs, bs, 12); g.fill();
  g.fillStyle = 'rgba(255,255,255,.18)'; rr(g, -lw / 2 + 16, -lh / 2 + 16, bs, bs * .45, 12); g.fill();
  shape2d(g, color, -lw / 2 + 16 + bs / 2, 0, bs * .54, '#fff');
  const tx = -lw / 2 + bs + 32, tmax = lw / 2 - tx - 14;
  g.textBaseline = 'alphabetic'; g.textAlign = 'left';
  g.fillStyle = '#9a8876'; g.font = `600 ${big ? 20 : 21}px ${FONT}`; g.fillText(name ? '寄件人' : '单号', tx, -lh / 2 + (big ? 36 : 38));
  g.fillStyle = '#26190e'; g.font = `900 ${name ? (big ? 58 : 66) : 34}px ${FONT}`; g.fillText(fitText(g, name || ('KD' + (38100 + (serial * 7919) % 900)), tmax), tx, -lh / 2 + (name ? (big ? 100 : 112) : 92));
  g.fillStyle = '#26190e'; for (let i = 0; i < 24; i++) g.fillRect(tx + i * (tmax / 24), lh / 2 - (big ? 40 : 46), i % 3 === 0 ? 3.2 : 1.6, big ? 22 : 26);
  g.restore();
  if (big) {
    g.save(); g.translate(w - 108, 116); g.rotate(-.2); g.strokeStyle = '#c62c22'; g.lineWidth = 7; rr(g, -84, -40, 168, 80, 12); g.stroke(); g.lineWidth = 2.5; rr(g, -74, -30, 148, 60, 8); g.stroke(); g.fillStyle = '#c62c22'; g.font = `900 44px ${FONT}`; g.textAlign = 'center'; g.fillText('超大件', 0, 16); g.restore();
    arrows(g, w - 120, h - 52, 30, .55);
  } else arrows(g, w - 86, h - 46, 26, .45);
  const t = tex(c); if (!name) texCache.set(key, t); return t;
}
function topTex(color, big) {
  const key = `t${color}|${big ? 1 : 0}`; if (texCache.has(key)) return texCache.get(key);
  const w = 512, h = 512, c = cvs(w, h), g = c.getContext('2d'); cardBase(g, w, h);
  g.fillStyle = 'rgba(60,32,10,.35)'; g.fillRect(0, h / 2 - 2, w, 4);
  tapeStrip(g, 0, h / 2 - (big ? 44 : 58), w, big ? 88 : 116, color, false);
  if (big) tapeStrip(g, w / 2 - 44, 0, 88, h, color, true);
  const t = tex(c); texCache.set(key, t); return t;
}
function plainTex() { if (texCache.has('p')) return texCache.get('p'); const c = cvs(256, 256), g = c.getContext('2d'); cardBase(g, 256, 256); const t = tex(c); texCache.set('p', t); return t; }
function softDot() { const c = cvs(64, 64), g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.5, 'rgba(255,255,255,.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); return t; }
function woodTex() {
  const c = cvs(1024, 512), g = c.getContext('2d');
  g.fillStyle = '#b98752'; g.fillRect(0, 0, 1024, 512);
  const planks = 5, ph = 512 / planks;
  for (let p = 0; p < planks; p++) {
    const base = ['#bb8a55', '#b27f4b', '#c09060', '#b5834f', '#bd8d58'][p]; g.fillStyle = base; g.fillRect(0, p * ph, 1024, ph);
    for (let i = 0; i < 26; i++) { g.strokeStyle = `rgba(${Math.random() < .5 ? '110,65,28' : '230,190,140'},${rnd(.05, .14)})`; g.lineWidth = rnd(.6, 2.2); g.beginPath(); const y0 = p * ph + rnd(4, ph - 4); g.moveTo(0, y0); for (let x = 0; x <= 1024; x += 32) g.lineTo(x, y0 + Math.sin(x / rnd(60, 140) + i) * rnd(1, 4)); g.stroke(); }
    g.fillStyle = 'rgba(60,32,10,.45)'; g.fillRect(0, p * ph, 1024, 2.5);
    for (let k = 0; k < 2; k++) { const x = rnd(0, 1024); g.fillStyle = 'rgba(60,32,10,.35)'; g.fillRect(x, p * ph, 2, ph); }
  }
  for (let i = 0; i < 4000; i++) { g.fillStyle = `rgba(80,45,15,${Math.random() * .08})`; g.fillRect(Math.random() * 1024, Math.random() * 512, 2, 1); }
  const t = tex(c); return t;
}
function beltTex() {
  const c = cvs(256, 128), g = c.getContext('2d'); g.fillStyle = '#1d2125'; g.fillRect(0, 0, 256, 128);
  for (let i = 0; i < 3000; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * .03})`; g.fillRect(Math.random() * 256, Math.random() * 128, 1.5, 1.5); }
  g.strokeStyle = 'rgba(255,255,255,.07)'; g.lineWidth = 6; for (let x = 0; x < 256; x += 64) { g.beginPath(); g.moveTo(x, 8); g.lineTo(x + 26, 64); g.lineTo(x, 120); g.stroke(); }
  g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = 2; for (let x = 0; x < 256; x += 64) { g.beginPath(); g.moveTo(x + 4, 8); g.lineTo(x + 30, 64); g.lineTo(x + 4, 120); g.stroke(); }
  const t = tex(c, true); return t;
}
function hazardTex() { const c = cvs(512, 64), g = c.getContext('2d'); g.fillStyle = '#f2b01e'; g.fillRect(0, 0, 512, 64); g.fillStyle = '#1e1f22'; for (let x = -64; x < 560; x += 64) { g.beginPath(); g.moveTo(x, 64); g.lineTo(x + 32, 0); g.lineTo(x + 64, 0); g.lineTo(x + 32, 64); g.closePath(); g.fill(); } return tex(c); }
function emblemTex(i) { const c = cvs(256, 256), g = c.getContext('2d'); g.shadowColor = 'rgba(0,0,0,.25)'; g.shadowBlur = 10; g.shadowOffsetY = 4; g.fillStyle = '#fbfaf7'; g.beginPath(); g.arc(128, 124, 104, 0, Math.PI * 2); g.fill(); g.shadowColor = 'transparent'; g.strokeStyle = 'rgba(0,0,0,.06)'; g.lineWidth = 4; g.stroke(); shape2d(g, i, 128, 126, 118, COL[i].hex); return tex(c); }

/* ================= 渲染器与场景 ================= */
const canvas = $('cv'), stageFrame = $('stageFrame');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: S.perf.aa, alpha: true, powerPreference: 'high-performance', preserveDrawingBuffer: false });
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.02;
renderer.shadowMap.enabled = S.perf.shadow !== 'off';
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.shadowMap.autoUpdate = false;
const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), .04).texture;
scene.environmentIntensity = .55;

const camera = new THREE.PerspectiveCamera(30, 16 / 9, .5, 1200);
/* 3D 画面铺满整个窗口；「分拣台位置」只决定分拣台框在哪里（相机按这个框拟合，再用 setViewOffset 扩到整窗） */
let VR = { left: 0, top: 0, width: innerWidth, height: innerHeight }, ST = stageRect(S.layout.scene, innerWidth, innerHeight);
const CAM_VIEWS = { oblique: { pitch: 42, yaw: 0 }, high: { pitch: 62, yaw: 0 }, front: { pitch: 22, yaw: 0 }, side: { pitch: 38, yaw: -18 } };
const FIT_PTS = []; for (const f of STAGE.fit) for (const x of f.x) for (const y of f.y) for (const z of f.z) FIT_PTS.push(new THREE.Vector3(x, y, z));
const FIT_C = FIT_PTS.reduce((a, v) => a.add(v), new THREE.Vector3()).divideScalar(FIT_PTS.length);
let pileFit = [], bulkJob = 0, bulkBuilding = false;
const camBase = { pos: new THREE.Vector3(0, 13, 15), target: new THREE.Vector3(-1, 1, -.8) };
function fitCamera() {
  const fitPoints = FIT_PTS.concat(pileFit);
  const fitExtent = new THREE.Box3().setFromPoints(fitPoints).getSize(new THREE.Vector3()).length();
  camera.far = Math.max(160, fitExtent * 12 + 100);
  ST = stageRect(S.layout.scene, VR.width, VR.height);
  camera.clearViewOffset(); camera.aspect = Math.max(1, ST.width) / Math.max(1, ST.height); camera.updateProjectionMatrix();
  const C = S.layout.cam, p = THREE.MathUtils.degToRad(clamp(C.pitch, 12, 80)), yw = THREE.MathUtils.degToRad(clamp(C.yaw, -40, 40));
  const dir = new THREE.Vector3(Math.sin(yw) * Math.cos(p), Math.sin(p), Math.cos(yw) * Math.cos(p));
  const target = new THREE.Vector3(FIT_C.x, 1, FIT_C.z), q = new THREE.Vector3(); let d = 30;
  const place = dd => { camera.position.copy(target).addScaledVector(dir, dd); camera.lookAt(target); camera.updateMatrixWorld(); };
  const measure = () => { let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; for (const v of fitPoints) { q.copy(v).project(camera); x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); } return { x0, x1, y0, y1 }; };
  const tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  for (let it = 0; it < 4; it++) {
    let lo = 4, hi = Math.max(160, fitExtent * 6 + 100);
    for (let k = 0; k < 26; k++) { const mid = (lo + hi) / 2; place(mid); const m = measure(); if (Math.max(-m.x0, m.x1, -m.y0, m.y1) > .96) lo = mid; else hi = mid; }
    d = hi; place(d); const m = measure(), cx = (m.x0 + m.x1) / 2, cy = (m.y0 + m.y1) / 2;
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0), up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    target.addScaledVector(right, cx * tanH * camera.aspect * d).addScaledVector(up, cy * tanH * d);
  }
  place(d);
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0), up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
  d /= clamp(C.zoom, 40, 300) / 100;
  target.addScaledVector(right, -C.panX / 100 * tanH * camera.aspect * d * 2).addScaledVector(up, -C.panY / 100 * tanH * d * 2);
  camBase.target.copy(target); camBase.pos.copy(target).addScaledVector(dir, d);
  camera.position.copy(camBase.pos); camera.lookAt(camBase.target);
  camera.setViewOffset(...viewOffsetArgs({ left: ST.left, top: ST.top, width: Math.max(1, ST.width), height: Math.max(1, ST.height) }, VR.width, VR.height));
  camera.updateMatrixWorld();
  requestRender(true); markBoundsDirty();
}
function applyStage() {
  const L = S.layout.scene; stageFrame.style.left = L.x + '%'; stageFrame.style.top = L.y + '%'; stageFrame.style.width = L.w + '%'; stageFrame.style.height = L.h + '%';
  resize();
}
function resize() {
  VR = { left: 0, top: 0, width: Math.max(1, innerWidth), height: Math.max(1, innerHeight) };
  renderer.setPixelRatio(clamp((devicePixelRatio || 1) * S.perf.scale, .3, 2.5)); renderer.setSize(VR.width, VR.height, false);
  fitCamera();
}
let renderAsked = true, shadowAsked = true, boundsDirty = true;
function markBoundsDirty() { boundsDirty = true; }
function requestRender(shadow) { renderAsked = true; if (shadow) shadowAsked = true; }
/* 窗口变化：3D 立即跟上；计数牌、说明牌、署名的缩放防抖后更新（OBS 里改浏览器源宽高不刷新页面时也对） */
let hudT = 0;
let lastVW = innerWidth, lastVH = innerHeight;
function onViewport(force) { if (!force && innerWidth === lastVW && innerHeight === lastVH) return; lastVW = innerWidth; lastVH = innerHeight; resize(); clearTimeout(hudT); hudT = setTimeout(applyHud, 150); }
addEventListener('resize', () => onViewport(true));
// 有些宿主（以及浏览器的视口模拟）改尺寸时不发 resize 事件，用 ResizeObserver 兜底
new ResizeObserver(() => onViewport(false)).observe(document.documentElement);

const hemi = new THREE.HemisphereLight(0xfff3e2, 0x5d5044, .7); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff0dc, 2.6); sun.position.set(-7, 16, 10); sun.target.position.set(1, 0, -1); scene.add(sun, sun.target);
sun.castShadow = true; sun.shadow.mapSize.set(S.perf.shadow === 'soft' ? 2048 : 1024, S.perf.shadow === 'soft' ? 2048 : 1024); Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 12, bottom: -12, near: 1, far: 56 }); sun.shadow.bias = -.0004; sun.shadow.normalBias = .025; sun.shadow.radius = 3;
const rim = new THREE.DirectionalLight(0xdfe9ff, .7); rim.position.set(9, 8, -8); scene.add(rim);
/* 地台：整个分拣站放在一块完整的地台上，透明底上看起来是一个独立的小场景，而不是东西飘在空中 */
const PLAT = STAGE.plat;
function floorTex() {
  const c = cvs(1024, 640), g = c.getContext('2d'); g.fillStyle = '#cfc9bf'; g.fillRect(0, 0, 1024, 640);
  for (let i = 0; i < 9000; i++) { const v = Math.floor(rnd(150, 225)); g.fillStyle = `rgba(${v},${v - 4},${v - 10},.18)`; g.fillRect(Math.random() * 1024, Math.random() * 640, rnd(1, 3), rnd(1, 3)); }
  g.strokeStyle = 'rgba(120,112,100,.28)'; g.lineWidth = 2; for (let x = 0; x <= 1024; x += 1024 / 8) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 640); g.stroke(); } for (let y = 0; y <= 640; y += 640 / 5) { g.beginPath(); g.moveTo(0, y); g.lineTo(1024, y); g.stroke(); }
  g.strokeStyle = '#e8b62a'; g.lineWidth = 14; g.strokeRect(22, 22, 1024 - 44, 640 - 44);
  return tex(c);
}

/* ================= 物理 ================= */
await RAPIER.init();
const world = new RAPIER.World({ x: 0, y: -28, z: 0 });
world.timestep = 1 / 60;
const fixedBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
function staticBox(hx, hy, hz, x, y, z, fr) { return world.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z).setFriction(fr ?? .7), fixedBody); }
/* 这个版本的 Rapier 没有 ColliderDesc.halfspace，用 HalfSpace 形状构造：法线指向空的一侧 */
const halfspaceDesc = n => new RAPIER.ColliderDesc(new RAPIER.HalfSpace(n));
world.createCollider(halfspaceDesc({ x: 0, y: 1, z: 0 }).setFriction(.8), fixedBody); // 地面：无限大，整窗模式下地台外也是隐形地面
/* 「只在地台上」用 V1.0 的地台四面墙；「整个窗口」改用窗口四边对应的视锥侧面 + 地台后方的后墙（rebuildBounds） */
const platWalls = [staticBox(.5, 6, 30, PLAT.x0 - .5, 6, 0), staticBox(.5, 6, 30, PLAT.x1 + .5, 6, 0), staticBox(40, 6, .5, 0, 6, PLAT.z1 + .5), staticBox(40, 6, .5, 0, 6, STAGE.backZ != null ? STAGE.backZ - .5 : PLAT.z0 + .2)]; // 墙高 12，炸飞的件翻不出去
const BACK = { small: 6, mid: 14, large: 30 };
/* 碰撞组（高 16 位 = 成员，低 16 位 = 过滤）：窗口墙 0x0004、露头圆锥 0x0002 只用来挡物件；
   「台面有多高」之类的射线只查成员含 0x0001 的普通碰撞体，不会被隐形墙和圆锥挡住 */
const WALL_GROUPS = 0x0004ffff, SCENE_QUERY = 0x00010001;
let winWalls = [], viewPlanes = null, backZ = STAGE.backZ ?? PLAT.z0 - BACK.mid, boundsAt = -1;
const winMode = () => S.play.range === 'window';
/* 不带晃动的相机：视锥平面和露头圆都按它算 */
function camInv() { camera.position.copy(camBase.pos); camera.lookAt(camBase.target); camera.updateMatrixWorld(); return new THREE.Matrix4().multiplyMatrices(camera.matrixWorld, camera.projectionMatrixInverse).elements; }
function rebuildBounds() {
  boundsDirty = false; boundsAt = time;
  for (const c of winWalls) world.removeCollider(c, false); winWalls = [];
  const win = winMode(); for (const c of platWalls) c.setEnabled(!win);
  const inv = camInv(), cam = [camBase.pos.x, camBase.pos.y, camBase.pos.z];
  viewPlanes = frustumPlanes(cam, inv, .03); backZ = STAGE.backZ ?? PLAT.z0 - BACK[S.play.back];
  if (win) {
    // 墙面再往里收 0.6 米：件的中心以外那半边也留在画面里，不会被窗口边切掉
    for (const { n, p } of viewPlanes) winWalls.push(world.createCollider(halfspaceDesc({ x: n[0], y: n[1], z: n[2] }).setTranslation(p[0] + n[0] * .6, p[1] + n[1] * .6, p[2] + n[2] * .6).setFriction(.3).setCollisionGroups(WALL_GROUPS), fixedBody));
    winWalls.push(world.createCollider(halfspaceDesc({ x: 0, y: 0, z: 1 }).setTranslation(0, 0, backZ).setFriction(.3).setCollisionGroups(WALL_GROUPS), fixedBody));
    if (STAGE.frontZ != null) winWalls.push(world.createCollider(halfspaceDesc({ x: 0, y: 0, z: -1 }).setTranslation(0, 0, STAGE.frontZ).setFriction(.3).setCollisionGroups(WALL_GROUPS), fixedBody));
    if (STAGE.sideX) for (const [nx, x] of [[1, STAGE.sideX[0]], [-1, STAGE.sideX[1]]]) winWalls.push(world.createCollider(halfspaceDesc({ x: nx, y: 0, z: 0 }).setTranslation(x, 0, 0).setFriction(.3).setCollisionGroups(WALL_GROUPS), fixedBody));
  }
  rebuildHead(inv, cam);
  for (const b of boxes) if (b.st === 'free') b.body.wakeUp();
}
/* 把拖动目标点水平推回窗口和后墙以内，m 为留给物件的边距 */
function keepInside(v, m) {
  if (!viewPlanes) return;
  for (let it = 0; it < 4; it++) for (const { n, p } of viewPlanes) {
    const d = n[0] * (v.x - p[0]) + n[1] * (v.y - p[1]) + n[2] * (v.z - p[2]); if (d >= m) continue;
    const hh = n[0] * n[0] + n[2] * n[2]; if (hh < 1e-4) continue; const k = (m - d) / hh; v.x += n[0] * k; v.z += n[2] * k;
  }
  v.z = Math.max(v.z, backZ + m); if (STAGE.frontZ != null) v.z = Math.min(v.z, STAGE.frontZ - m);
  if (STAGE.sideX) v.x = clamp(v.x, STAGE.sideX[0] + m, STAGE.sideX[1] - m);
}
/* 从高处落下的东西（盲盒、垃圾袋、刁钻垃圾）的起始高度：整窗模式下要在窗口上沿的隐形墙以内 */
function spawnHeight(x, z, want) {
  if (!winMode() || !viewPlanes) return want;
  for (let y = want; y > 2.5; y -= .25) if (insidePlanes(viewPlanes, [x, y, z], 1.6)) return y;
  return 2.5;
}
const outOfBounds = p => winMode() ? (p.y < -3 || p.z < backZ - 2 || (viewPlanes && !insidePlanes(viewPlanes, [p.x, p.y, p.z], 2))) : (p.y < -3 || p.x < PLAT.x0 - 1.5 || p.x > PLAT.x1 + 1.5 || p.z < PLAT.z0 - 1 || p.z > PLAT.z1 + 1.5);

/* ================= 材质 ================= */
const M = {
  steel: new THREE.MeshStandardMaterial({ color: 0xb8c0c6, metalness: .85, roughness: .32 }),
  graphite: new THREE.MeshStandardMaterial({ color: 0x3a4148, metalness: .35, roughness: .55 }),
  graphite2: new THREE.MeshStandardMaterial({ color: 0x4b545c, metalness: .3, roughness: .5 }),
  rubber: new THREE.MeshStandardMaterial({ color: 0xffffff, map: beltTex(), roughness: .92, metalness: 0 }),
  wood: new THREE.MeshStandardMaterial({ color: 0xffffff, map: woodTex(), roughness: .62, metalness: 0 }),
  hazard: new THREE.MeshStandardMaterial({ map: hazardTex(), roughness: .6 }),
  lamp: new THREE.MeshStandardMaterial({ color: 0x3ad17e, emissive: 0x3ad17e, emissiveIntensity: 1.6, roughness: .3 }),
  curtain: new THREE.MeshPhysicalMaterial({ color: 0xa9c2cf, transparent: true, opacity: .45, roughness: .15, side: THREE.DoubleSide, depthWrite: false }),
  tape: new THREE.MeshPhysicalMaterial({ color: 0xcfe6f6, transparent: true, opacity: .74, roughness: .12, metalness: 0, clearcoat: 1, clearcoatRoughness: .1, depthWrite: false }),
};
function mesh(geo, mat, cast = true, recv = true) { const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = recv; return m; }
const RB = (w, h, d, r = .05, s = 2) => new RoundedBoxGeometry(w, h, d, s, r);
if (STAGE.floor) {   // 柜台布局不画地台：柜台和桶坐在画面下沿上，后面就是主播
  const W = PLAT.x1 - PLAT.x0, D = PLAT.z1 - PLAT.z0;
  const topM = new THREE.MeshStandardMaterial({ map: floorTex(), roughness: .92 }), edgeM = new THREE.MeshStandardMaterial({ color: 0x5b5f63, roughness: .7 });
  const slab = mesh(RB(W, .5, D, .18, 2), [edgeM, edgeM, topM, edgeM, edgeM, edgeM], false, true); slab.position.set((PLAT.x0 + PLAT.x1) / 2, -.25, (PLAT.z0 + PLAT.z1) / 2); scene.add(slab);
}

/* ================= 布局 ================= */
const BELT = STAGE.belt, TABLE = STAGE.table, SCAN = STAGE.scan;
const BIN = { w: 2.6, d: 2.0, h: .85, t: .1 }, BASE = STAGE.base;
/* 台面中央上方的一点（标签、自动演示用） */
const tableAnchor = (dy = 3.3) => new THREE.Vector3((TABLE.x0 + TABLE.x1) / 2, TABLE.top + dy, (TABLE.z0 + TABLE.z1) / 2);
const SMALL = [1.15, .82, .92], BIGS = [2.1, 1.45, 1.6];
const TRUCK = STAGE.truck, DOCK = STAGE.dock, FEED = STAGE.feed;
const TDIR = new THREE.Vector3(Math.cos(TRUCK.yaw), 0, -Math.sin(TRUCK.yaw));
function truckAt(s) { return new THREE.Vector3(TRUCK.park, 0, TRUCK.z).addScaledVector(TDIR, s); }
if (STAGE.road) { // 货车进出的车道
  const laneM = new THREE.MeshStandardMaterial({ color: 0x4a4e53, roughness: .85 }), dashM = new THREE.MeshStandardMaterial({ color: 0xf2e6c8, roughness: .6 });
  const lane = mesh(RB(4.2, .44, 7, .14, 2), laneM, false, true); lane.position.set(TRUCK.park, -.24, PLAT.z0 - 3.4); scene.add(lane);
  for (let i = 0; i < 3; i++) { const d = mesh(new THREE.BoxGeometry(.14, .02, 1), dashM, false, true); d.position.set(TRUCK.park, .0, PLAT.z0 - 1.3 - i * 2); scene.add(d); }
}

/* ---------- 传送带 ---------- */
const belt = new THREE.Group(); scene.add(belt);
{
  const L = BELT.x1 - BELT.x0, cx = (BELT.x0 + BELT.x1) / 2;
  const frame = mesh(RB(L + .5, .42, 2.0, .12), M.graphite); frame.position.set(cx, BELT.top - .31, BELT.z); belt.add(frame);
  const top = mesh(new THREE.BoxGeometry(L, .06, BELT.w), M.rubber); top.position.set(cx, BELT.top - .03, BELT.z); belt.add(top);
  M.rubber.map.repeat.set(L / 1.1, 1);
  for (const x of [BELT.x0, BELT.x1]) { const r = mesh(new THREE.CylinderGeometry(.24, .24, BELT.w + .06, 24), M.graphite2); r.rotation.x = Math.PI / 2; r.position.set(x, BELT.top - .24, BELT.z); belt.add(r); }
  for (const s of [-1, 1]) { const g = mesh(RB(L + .3, .16, .07, .03), M.steel); g.position.set(cx, BELT.top + .14, BELT.z + s * (BELT.w / 2 + .06)); belt.add(g); for (let x = BELT.x0 + .6; x < BELT.x1; x += 2.2) { const p = mesh(new THREE.BoxGeometry(.06, .2, .06), M.steel); p.position.set(x, BELT.top + .02, BELT.z + s * (BELT.w / 2 + .06)); belt.add(p); } }
  if (!STAGE.legs) {   // 柜台布局：传送带下面是实心机箱，东西钻不进去
    const bd = TABLE.z1 - TABLE.z0, bz = (TABLE.z0 + TABLE.z1) / 2;
    const box = mesh(RB(L + .4, BELT.top - .52, bd, .08), M.graphite2); box.position.set(cx, (BELT.top - .52) / 2, bz); belt.add(box);
    const stripe = mesh(RB(L + .42, .1, .05, .02), M.hazard); stripe.position.set(cx, BELT.top - .64, TABLE.z1 + .01); belt.add(stripe);
    world.createCollider(RAPIER.ColliderDesc.cuboid((L + .4) / 2, (BELT.top - .52) / 2, bd / 2).setTranslation(cx, (BELT.top - .52) / 2, bz), fixedBody);
    // 带子背后到后墙之间的窄缝用背板填上，小件掉不进去
    const gz0 = TABLE.z0, gz1 = BELT.z - BELT.w / 2 - .1, gh = BELT.top + .3;
    if (gz1 - gz0 > .02) { const back = mesh(RB(L + .4, gh, gz1 - gz0, .03), M.graphite2); back.position.set(cx, gh / 2, (gz0 + gz1) / 2); belt.add(back); world.createCollider(RAPIER.ColliderDesc.cuboid((L + .4) / 2, gh / 2, (gz1 - gz0) / 2).setTranslation(cx, gh / 2, (gz0 + gz1) / 2), fixedBody); }
  } else for (const x of [BELT.x0 + .7, cx - 1.2, BELT.x1 - .9]) for (const s of [-1, 1]) { const l = mesh(RB(.16, 1.05, .16, .03), M.graphite2); l.position.set(x, .52, BELT.z + s * .78); belt.add(l); const f = mesh(RB(.4, .06, .3, .02), M.graphite); f.position.set(x, .03, BELT.z + s * .78); belt.add(f); }
  if (STAGE.legs) { const bar = mesh(RB(L - 1.6, .1, .1, .03), M.graphite2); bar.position.set(cx - .3, .35, BELT.z + .78); belt.add(bar); }
  // 状态灯
  const pole = mesh(new THREE.CylinderGeometry(.04, .04, .9, 12), M.steel); pole.position.set(BELT.x1 - .2, BELT.top + .6, BELT.z - 1.0); belt.add(pole);
  const lamp = mesh(new THREE.SphereGeometry(.13, 20, 14), M.lamp, false, false); lamp.position.set(BELT.x1 - .2, BELT.top + 1.1, BELT.z - 1.0); belt.add(lamp);
  const strips = [];
  belt.userData = { lamp, strips, top };
}
world.createCollider(RAPIER.ColliderDesc.cuboid((BELT.x1 - BELT.x0) / 2, .2, 1.0).setTranslation((BELT.x0 + BELT.x1) / 2, BELT.top - .2, BELT.z).setFriction(.35), fixedBody);
world.createCollider(RAPIER.ColliderDesc.cuboid((BELT.x1 - BELT.x0) / 2 + .2, (BELT.top - .5) / 2, .95).setTranslation((BELT.x0 + BELT.x1) / 2, (BELT.top - .5) / 2, BELT.z), fixedBody);
for (const s of [-1, 1]) staticBox((BELT.x1 - BELT.x0) / 2, .2, .04, (BELT.x0 + BELT.x1) / 2, BELT.top + .2, BELT.z + s * (BELT.w / 2 + .06), .3);
staticBox(.06, .35, BELT.w / 2 + .1, BELT.x0 - .05, BELT.top + .3, BELT.z, .3);
{ const stop = mesh(RB(.12, .7, BELT.w + .2, .04), M.graphite2); stop.position.set(BELT.x0 - .05, BELT.top + .3, BELT.z); scene.add(stop); const stripe = mesh(RB(.13, .12, BELT.w + .22, .02), M.hazard); stripe.position.set(BELT.x0 - .05, BELT.top + .55, BELT.z); scene.add(stripe); }
/* 柜台布局：带子末端接一段斜溜槽，东西顺着滑进台面里面，不会堵在出口。溜槽下面是实心楔形，不留缝 */
const CHUTE = STAGE.legs ? null : { x0: BELT.x1, x1: BELT.x1 + 1.5 };
if (CHUTE) {
  const L2 = CHUTE.x1 - CHUTE.x0, x0 = BELT.x1, x1 = BELT.x1 + L2, yT = BELT.top, yB = TABLE.top + .04, z0 = BELT.z - BELT.w / 2 - .1, z1 = BELT.z + BELT.w / 2 + .1;
  const pts = []; for (const z of [z0, z1]) pts.push(x0, TABLE.top, z, x0, yT, z, x1, yB, z, x1, TABLE.top, z);
  world.createCollider(RAPIER.ColliderDesc.convexHull(new Float32Array(pts)).setFriction(.06).setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min), fixedBody);
  const sh = new THREE.Shape([new THREE.Vector2(x0, TABLE.top), new THREE.Vector2(x0, yT), new THREE.Vector2(x1, yB), new THREE.Vector2(x1, TABLE.top)]);
  const wedge = mesh(new THREE.ExtrudeGeometry(sh, { depth: z1 - z0, bevelEnabled: false }), M.steel); wedge.position.z = z0; scene.add(wedge);
  for (const z of [z0, z1]) { const lip = mesh(RB(Math.hypot(L2, yT - yB), .14, .05, .02), M.graphite2); lip.position.set((x0 + x1) / 2, (yT + yB) / 2 + .07, z); lip.rotation.z = -Math.atan2(yT - yB, L2); scene.add(lip); }
}
/* ---------- 入口堆货台：货车在这里卸货，箱子往后堆，传送带从最前面取件 ---------- */
const dock = new THREE.Group(); scene.add(dock);
const dockSignCv = cvs(512, 128), dockSignTex = tex(dockSignCv);
function drawDockSign() { const sg = dockSignCv.getContext('2d'); sg.fillStyle = '#2b3136'; sg.fillRect(0, 0, 512, 128); sg.fillStyle = '#f2b01e'; sg.font = `900 64px ${FONT}`; sg.textAlign = 'center'; sg.textBaseline = 'middle'; sg.fillText(MODES[S.mode].dockSign, 256, 66); dockSignTex.needsUpdate = true; }
drawDockSign();
{
  const W = DOCK.x1 - DOCK.x0, D = DOCK.z1 - DOCK.z0, cx = (DOCK.x0 + DOCK.x1) / 2, cz = (DOCK.z0 + DOCK.z1) / 2;
  const topM = new THREE.MeshStandardMaterial({ map: woodTex(), roughness: .66 }); topM.map.repeat.set(1.4, .6);
  const top = mesh(RB(W, .14, D, .04), topM); top.position.set(cx, DOCK.top - .07, cz); dock.add(top);
  const base = mesh(RB(W - .2, DOCK.top - .16, D - .2, .06), M.graphite); base.position.set(cx, (DOCK.top - .14) / 2, cz); dock.add(base);
  const edge = mesh(RB(W, .1, .06, .02), M.hazard); edge.position.set(cx, DOCK.top - .05, DOCK.z1 + .01); dock.add(edge);
  const back = mesh(RB(W + .1, .22, .1, .04), M.graphite2); back.position.set(cx - .05, DOCK.top + .11, DOCK.z0 - .02); dock.add(back);
  const right = mesh(RB(.1, .9, D, .04), M.graphite2); right.position.set(DOCK.x1 + .02, DOCK.top + .45, cz); dock.add(right);
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(1.8, .45), new THREE.MeshStandardMaterial({ map: dockSignTex, roughness: .6 })); plate.position.set(DOCK.x0 + .04, DOCK.top + .55, cz); plate.rotation.y = Math.PI / 2; dock.add(plate);
  world.createCollider(RAPIER.ColliderDesc.cuboid(W / 2, DOCK.top / 2, D / 2).setTranslation(cx, DOCK.top / 2, cz).setFriction(.8), fixedBody);
  staticBox(W / 2 + .05, .11, .05, cx - .05, DOCK.top + .11, DOCK.z0 - .02, .5);
  staticBox(.05, .45, D / 2, DOCK.x1 + .02, DOCK.top + .45, cz, .5);
  const left = mesh(RB(.1, .9, D, .04), M.graphite2); left.position.set(DOCK.x0 - .02, DOCK.top + .45, cz); dock.add(left);
  staticBox(.05, .45, D / 2, DOCK.x0 - .02, DOCK.top + .45, cz, .5);
  // 前挡板：柜台布局镜头正对着，挡板矮一些，台上平放的件也看得见
  const fh = STAGE.id === 'counter' ? .3 : .9, fw = BELT.x0 - .1 - DOCK.x0, front = mesh(RB(fw, fh, .1, .04), M.graphite2); front.position.set(DOCK.x0 + fw / 2, DOCK.top + fh / 2, DOCK.z1 + .02); dock.add(front);
  staticBox(fw / 2, fh / 2, .05, DOCK.x0 + fw / 2, DOCK.top + fh / 2, DOCK.z1 + .02, .5);
  if (STAGE.id === 'counter') {   // 正面镜头看得到的牌子挂在前挡板上
    const fp = new THREE.Mesh(new THREE.PlaneGeometry(2.0, .5), new THREE.MeshStandardMaterial({ map: dockSignTex, roughness: .6 })); fp.position.set(DOCK.x0 + fw / 2, DOCK.top - .55, DOCK.z1 + .03); dock.add(fp);
    const skirt = mesh(RB(W, DOCK.top - .2, .08, .03), M.graphite2); skirt.position.set(cx, (DOCK.top - .2) / 2, DOCK.z1 - .02); dock.add(skirt);
    const st = mesh(RB(W + .02, .1, .06, .02), M.hazard); st.position.set(cx, DOCK.top - .32, DOCK.z1 + .02); dock.add(st);
  }
  // 传送带起始段前侧加高挡板，防止从堆货台滑下来的件翻出去
  const gl = 3.2, guard = mesh(RB(gl, .75, .06, .03), new THREE.MeshPhysicalMaterial({ color: 0xbfd3de, transparent: true, opacity: .35, roughness: .1, clearcoat: 1, depthWrite: false }), false, false); guard.position.set(BELT.x0 + gl / 2, BELT.top + .4, BELT.z + BELT.w / 2 + .1); dock.add(guard);
  const gframe = mesh(RB(gl, .06, .08, .02), M.steel); gframe.position.set(BELT.x0 + gl / 2, BELT.top + .78, BELT.z + BELT.w / 2 + .1); dock.add(gframe);
  staticBox(gl / 2, .4, .04, BELT.x0 + gl / 2, BELT.top + .4, BELT.z + BELT.w / 2 + .1, .3);
}
const onDock = p => p.x > DOCK.x0 - .2 && p.x < DOCK.x1 + .1 && p.z > DOCK.z0 - .1 && p.z < DOCK.z1 + .25 && p.y > DOCK.top - .05;
/* 从靠近传送带的一端开始堆，堆到两层半就往后、往左挪 */
const DOCK_CELLS = dockCells(DOCK, FEED);
const slotOcc = new Map();
function freeSlot() {
  if (dockLoad(boxes.map(b => ({ st: b.st, p: b.body.translation() })), DOCK) >= DOCK.cap) return null;
  for (let layer = 0; layer < (DOCK.layers || 3); layer++) for (const c of DOCK_CELLS) {
    const key = DOCK_CELLS.indexOf(c) + ':' + layer, o = slotOcc.get(key);
    if (o && o.st !== 'gone' && o.st !== 'deliver') { const p = o.body.translation(); if (Math.abs(p.x - c.x) < .5 && Math.abs(p.z - c.z) < .45 && Math.abs(p.y - (DOCK.top + .41 + layer * .82)) < .35) continue; if (o.st === 'unload') continue; }
    // 下面一层必须有箱子托着
    if (layer > 0) { const below = slotOcc.get(DOCK_CELLS.indexOf(c) + ':' + (layer - 1)); if (!below || below.st !== 'free' && below.st !== 'unload') continue; const bp = below.body.translation(); if (Math.abs(bp.x - c.x) > .5 || Math.abs(bp.z - c.z) > .45) continue; }
    if (surfaceY(c.x, c.z) > DOCK.top + layer * .82 + .3) continue;
    return { key, x: c.x, y: DOCK.top + .41 + layer * .82, z: c.z };
  }
  return null;
}
const unloads = [];
function updUnloads(dt) {
  for (let i = unloads.length - 1; i >= 0; i--) {
    const u = unloads[i], b = u.b; if (b.st !== 'unload') { unloads.splice(i, 1); continue; }
    u.t += dt; const k = Math.min(1, u.t / u.dur), e = k * k * (3 - 2 * k);
    const pos = u.f.clone().lerp(u.to, e); pos.y = lerp(u.f.y, u.to.y, e) + Math.sin(k * Math.PI) * u.apex;
    b.body.setNextKinematicTranslation(pos); b.body.setNextKinematicRotation(u.q0.clone().slerp(u.q1, e));
    if (k >= 1) { b.body.collider(0).setEnabled(true); b.st = 'free'; b.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true); b.body.setLinvel({ x: 0, y: -.5, z: 0 }, true); b.body.setAngvel({ x: 0, y: 0, z: 0 }, true); unloads.splice(i, 1); sfx.land(6); }
  }
}
function dockTarget(claim) { for (const c of DOCK_CELLS) { const pend = (c.pend || []).filter(t => time - t < 1.3); c.pend = pend; const h = surfaceY(c.x, c.z) + pend.length * .82; if (h < DOCK.top + 1.1) { if (claim) c.pend.push(time); return { x: c.x + rnd(-.15, .15), y: h, z: c.z + rnd(-.1, .1) }; } } const c = DOCK_CELLS[Math.floor(Math.random() * DOCK_CELLS.length)]; return { x: c.x, y: surfaceY(c.x, c.z), z: c.z }; }

/* ---------- 工作台 ---------- */
const table = new THREE.Group(); scene.add(table);
if (STAGE.id === 'counter') buildCounter();
else {
  const W = TABLE.x1 - TABLE.x0, D = TABLE.z1 - TABLE.z0, cx = (TABLE.x0 + TABLE.x1) / 2, cz = (TABLE.z0 + TABLE.z1) / 2;
  M.wood.map.repeat.set(1, 1);
  const top = mesh(RB(W, .16, D, .05), M.wood); top.position.set(cx, TABLE.top - .08, cz); table.add(top);
  const base = mesh(RB(W - .3, TABLE.top - .2, D - .35, .08), M.graphite); base.position.set(cx, (TABLE.top - .16) / 2 + .02, cz); table.add(base);
  const dw = (W - .7) / 3;
  for (let i = 0; i < 3; i++) { const d = mesh(RB(dw - .12, TABLE.top - .44, .06, .03), M.graphite2); d.position.set(TABLE.x0 + .35 + dw * (i + .5), .44, TABLE.z1 - .16); table.add(d); const hdl = mesh(RB(.6, .07, .07, .03), M.steel); hdl.position.set(TABLE.x0 + .35 + dw * (i + .5), .58, TABLE.z1 - .11); table.add(hdl); }
  const board = mesh(RB(W, 1.1, .12, .05), M.graphite2); board.position.set(cx, TABLE.top + .55, TABLE.z0 + .06); table.add(board);
  for (let i = 0; i < 9; i++) { const hole = mesh(new THREE.CylinderGeometry(.035, .035, .02, 10), M.graphite); hole.rotation.x = Math.PI / 2; hole.position.set(TABLE.x0 + .5 + i * (W - 1) / 8, TABLE.top + .78, TABLE.z0 + .13); table.add(hole); }
  const railR = mesh(RB(.1, .12, D, .04), M.steel); railR.position.set(TABLE.x1 - .06, TABLE.top + .32, cz); table.add(railR);
  for (const [x, z] of [[TABLE.x1 - .06, cz], [TABLE.x1 - .06, TABLE.z1 - .2]]) { const p = mesh(new THREE.CylinderGeometry(.035, .035, .34, 10), M.steel); p.position.set(x, TABLE.top + .17, z); table.add(p); }
  world.createCollider(RAPIER.ColliderDesc.cuboid(W / 2, TABLE.top / 2, D / 2).setTranslation(cx, TABLE.top / 2, cz).setFriction(.8), fixedBody);
  staticBox(W / 2, .55, .06, cx, TABLE.top + .55, TABLE.z0 + .06, .5);
  staticBox(.06, .22, D / 2, TABLE.x1 - .06, TABLE.top + .22, cz, .5);
}

/* 柜台布局的台面：一整块实心柜台。台面木纹，前脸深灰带警示条；前沿一块透明挡板（台面上堆的东西只会往上越堆越高，
   不会自己漫进桶里；拿着东西拖过去时直接穿过），后沿一道矮栏，再往上是贴着后沿的隐形墙（rebuildBounds） */
function buildCounter() {
  const W = TABLE.x1 - TABLE.x0, D = TABLE.z1 - TABLE.z0, cx = (TABLE.x0 + TABLE.x1) / 2, cz = (TABLE.z0 + TABLE.z1) / 2, T = TABLE.top;
  M.wood.map.repeat.set(W / 5.8, 1);
  const top = mesh(RB(W + .1, .16, D + .1, .05), M.wood); top.position.set(cx, T - .08, cz); table.add(top);
  const body = mesh(RB(W - .1, T - .16, D - .1, .08), M.graphite); body.position.set(cx, (T - .16) / 2, cz); table.add(body);
  const face = mesh(RB(W - .2, .3, .06, .03), M.graphite2); face.position.set(cx, T - .34, TABLE.z1 + .02); table.add(face);
  const stripe = mesh(RB(W - .2, .07, .07, .02), M.hazard); stripe.position.set(cx, T - .5, TABLE.z1 + .03); table.add(stripe);
  const GUARD_H = 1.1;
  const lip = mesh(RB(W, .16, .1, .04), M.steel); lip.position.set(cx, T + .08, TABLE.z1 - .05); table.add(lip);
  const glass = mesh(RB(W, GUARD_H - .16, .05, .02), new THREE.MeshPhysicalMaterial({ color: 0xd8ecf4, transparent: true, opacity: .16, roughness: .05, clearcoat: 1, depthWrite: false }), false, false);
  glass.position.set(cx, T + .16 + (GUARD_H - .16) / 2, TABLE.z1 - .05); glass.renderOrder = 2; table.add(glass);
  const cap = mesh(RB(W, .05, .08, .02), M.steel); cap.position.set(cx, T + GUARD_H, TABLE.z1 - .05); table.add(cap);
  for (let x = TABLE.x0 + .1; x <= TABLE.x1 - .05; x += (W - .2) / 6) { const post = mesh(RB(.06, GUARD_H, .08, .02), M.steel); post.position.set(x, T + GUARD_H / 2, TABLE.z1 - .05); table.add(post); }
  const rail = mesh(RB(W, .22, .1, .04), M.graphite2); rail.position.set(cx, T + .11, TABLE.z0 + .05); table.add(rail);
  world.createCollider(RAPIER.ColliderDesc.cuboid(W / 2, T / 2, D / 2).setTranslation(cx, T / 2, cz).setFriction(.8), fixedBody);
  staticBox(W / 2, GUARD_H / 2, .05, cx, T + GUARD_H / 2, TABLE.z1 - .05, .3);
  staticBox(W / 2, .11, .05, cx, T + .11, TABLE.z0 + .05, .5);
}

/* ---------- 分拣筐 ---------- */
let bins = [];
function makeBin(i, mode) {
  const MB = MODES[mode].bins[i], SL = STAGE.slots[mode][i], NEXT = STAGE.slots[mode][i + 1];
  const g = new THREE.Group(); scene.add(g);
  const mat = new THREE.MeshPhysicalMaterial({ color: MB.three, roughness: .42, metalness: 0, clearcoat: .55, clearcoatRoughness: .3 });
  const inner = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(MB.three).multiplyScalar(.72), roughness: .55, clearcoat: .2 });
  const rimMat = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(MB.three).lerp(new THREE.Color(0xffffff), .12), roughness: .35, clearcoat: .7, emissive: 0xffffff, emissiveIntensity: 0 });
  const { w, d, h, t } = BIN;
  const add = (geo, m, x, y, z, parent = g) => { const o = mesh(geo, m); o.position.set(x, y, z); parent.add(o); return o; };
  // 活门底板：以后沿为轴，漏筐时向下翻开
  const hinge = new THREE.Group(); hinge.position.set(0, 0, -d / 2 + t); g.add(hinge);
  add(RB(w - .1, t, d - .12, .04), inner, 0, t / 2, (d - .12) / 2 - .02, hinge);
  add(RB(w, h, t, .045), mat, 0, h / 2, d / 2 - t / 2);
  add(RB(w, h, t, .045), mat, 0, h / 2, -d / 2 + t / 2);
  add(RB(t, h, d, .045), mat, -w / 2 + t / 2, h / 2, 0);
  add(RB(t, h, d, .045), mat, w / 2 - t / 2, h / 2, 0);
  for (const [gw, gd, x, z] of [[w + .14, .2, 0, d / 2 - .04], [w + .14, .2, 0, -d / 2 + .04], [.2, d + .1, -w / 2 + .04, 0], [.2, d + .1, w / 2 - .04, 0]]) add(RB(gw, .13, gd, .06), rimMat, x, h, z);
  add(RB(w * .9, .06, .05, .025), mat, 0, .14, d / 2 + .02);
  for (const s of [-1, 1]) add(RB(.07, h * .7, .05, .025), mat, s * (w / 2 - .32), h * .48, d / 2 + .02);
  // 快递筐正面是圆形图标；垃圾桶正面是白色图标 + 分类名（国标 / 上海叫法）
  let label = null;
  if (mode === 'express') { const em = new THREE.Mesh(new THREE.CircleGeometry(.36, 48), new THREE.MeshStandardMaterial({ map: emblemTex(i), transparent: true, roughness: .5 })); em.position.set(0, h * .5, d / 2 + .035); g.add(em); }
  else { label = new THREE.Mesh(new THREE.PlaneGeometry(1.5, .75), new THREE.MeshStandardMaterial({ map: kit.binLabel(i, binName(i, S.garbage.naming)), transparent: true, roughness: .5, depthWrite: false })); label.position.set(0, h * .5, d / 2 + .035); label.userData.keep = true; g.add(label); }
  // 钢架与滑槽（固定在地面，不随筐跳动）
  const stand = new THREE.Group(); stand.position.set(SL[0], 0, SL[1]); scene.add(stand);
  if (STAGE.legs) {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { add(RB(.12, BASE, .12, .03), M.graphite2, sx * (w / 2 - .12), BASE / 2, sz * (d / 2 - .12), stand); add(RB(.34, .05, .3, .02), M.graphite, sx * (w / 2 - .12), .025, sz * (d / 2 - .12), stand); }
    for (const sz of [-1, 1]) add(RB(w - .1, .09, .09, .03), M.steel, 0, BASE - .05, sz * (d / 2 - .12), stand);
    for (const sx of [-1, 1]) add(RB(.09, .09, d - .1, .03), M.steel, sx * (w / 2 - .12), BASE - .05, 0, stand);
  } else {   // 柜台布局：桶座两侧和背面是实心板，正面敞开露出滑槽（漏桶时东西从这里滑出来，落在桶前面看得见的地方）
    for (const sx of [-1, 1]) add(RB(.1, BASE, d, .03), M.graphite2, sx * (w / 2 - .05), BASE / 2, 0, stand);
    add(RB(w, BASE, .1, .03), M.graphite2, 0, BASE / 2, -d / 2 + .05, stand);
    add(RB(w + .02, .07, .12, .02), M.hazard, 0, BASE - .06, d / 2 - .04, stand);
  }
  const yB = STAGE.legs ? BASE - .55 : BASE - .14, yF = .05, zB = -d / 2, zF = d / 2 + (STAGE.legs ? .75 : .6), L = Math.hypot(zF - zB, yB - yF), ang = Math.atan2(yB - yF, zF - zB), cy = (yB + yF) / 2, cz = (zB + zF) / 2;
  const chute = add(RB(w - .5, .05, L, .02), M.graphite2, 0, cy, cz, stand); chute.rotation.x = ang;
  for (const sx of [-1, 1]) { const lip = add(RB(.05, .16, L, .02), M.steel, sx * (w / 2 - .27), cy + .08, cz, stand); lip.rotation.x = ang; }
  const cq = new THREE.Quaternion().setFromEuler(new THREE.Euler(ang, 0, 0));
  const fixed = [];
  // 桶背后的空气墙兼托底：填平遮挡区，桶口、前方滑槽和传送带仍然开放。
  const rearGuard = binRearGuards(STAGE, mode, BIN)[i];
  if (rearGuard) {
    const { x0, x1, y0, y1, z0, z1 } = rearGuard;
    fixed.push(world.createCollider(RAPIER.ColliderDesc.cuboid((x1-x0)/2, (y1-y0)/2, (z1-z0)/2)
      .setTranslation((x0+x1)/2, (y0+y1)/2, (z0+z1)/2).setFriction(.3).setRestitution(.05).setCollisionGroups(WALL_GROUPS), fixedBody));
  }
  fixed.push(world.createCollider(RAPIER.ColliderDesc.cuboid((w - .5) / 2, .04, L / 2).setTranslation(SL[0], cy - .02, SL[1] + cz).setRotation({ x: cq.x, y: cq.y, z: cq.z, w: cq.w }).setFriction(.02).setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min), fixedBody));
  for (const sx of [-1, 1]) fixed.push(world.createCollider(RAPIER.ColliderDesc.cuboid(.05, BASE / 2, (d - .1) / 2).setTranslation(SL[0] + sx * (w / 2 - .12), BASE / 2, SL[1]), fixedBody));
  if (!STAGE.legs && NEXT) {   // 和右边那个桶之间的缝用隔板填上，落在缝上的东西会滑进其中一个桶
    const gx = (SL[0] + w / 2 + NEXT[0] - w / 2) / 2, gw = Math.max(.06, NEXT[0] - SL[0] - w), gh = BASE + h + .08;
    add(RB(gw + .04, gh, d, .03), M.graphite2, gx - SL[0], gh / 2, 0, stand);
    fixed.push(world.createCollider(RAPIER.ColliderDesc.cuboid(gw / 2 + .02, gh / 2, d / 2).setTranslation(gx, gh / 2, SL[1]).setFriction(.2), fixedBody));
  }
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(SL[0], BASE, SL[1]));
  const c = (hx, hy, hz, x, y, z) => world.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z).setFriction(.6).setRestitution(.05), body);
  const bottom = c(w / 2, t / 2, d / 2, 0, t / 2, 0); c(w / 2, h / 2, t / 2, 0, h / 2, d / 2 - t / 2); c(w / 2, h / 2, t / 2, 0, h / 2, -d / 2 + t / 2); c(t / 2, h / 2, d / 2, -w / 2 + t / 2, h / 2, 0); c(t / 2, h / 2, d / 2, w / 2 - t / 2, h / 2, 0);
  // 柜台布局：桶座正面一道隐形挡门，平时关着（地上的件滚不进桶底下），漏桶时打开让漏下来的件滑出来
  const gate = STAGE.legs ? null : world.createCollider(RAPIER.ColliderDesc.cuboid(w / 2 - .1, BASE / 2, .04).setTranslation(SL[0], BASE / 2, SL[1] + d / 2 - .02).setFriction(.3), fixedBody);
  const b = { i, mode, g, stand, body, fixed, gate, label, rimMat, bottom, hinge, x: SL[0], z: SL[1], slot: i, move: null, count: 0, pulse: 0, jolt: 0, hover: 0, el: $('bc' + i), seal: null, leak: null, door: 0 };
  g.position.set(b.x, BASE, b.z); g.traverse(o => { if (o.isMesh) o.userData.bin = b; });
  return b;
}
const binSets = Object.fromEntries(MODE_IDS.map(m => [m, MODES[m].bins.map((_, i) => makeBin(i, m))]));
/* 柜台布局：桶排两头到地台边各补一块和桶口一样高的实心挡块，挂在最左 / 最右那个桶上，跟着这套筐一起显示和启用 */
if (!STAGE.legs) for (const m of MODE_IDS) {
  const set = binSets[m], { w, d, h } = BIN, top = BASE + h;
  for (const [bin, xa, xb] of [[set[0], PLAT.x0, set[0].x - w / 2], [set[set.length - 1], set[set.length - 1].x + w / 2, PLAT.x1]]) {
    if (xb - xa < .05) continue; const cw = xb - xa, cx = (xa + xb) / 2;
    const cap = mesh(RB(cw, top, d, .04), M.graphite2); cap.position.set(cx - bin.x, top / 2, 0); bin.stand.add(cap);
    const st = mesh(RB(cw + .02, .07, .06, .02), M.hazard); st.position.set(cx - bin.x, top - .1, d / 2 + .01); bin.stand.add(st);
    bin.fixed.push(world.createCollider(RAPIER.ColliderDesc.cuboid(cw / 2, top / 2, d / 2).setTranslation(cx, top / 2, bin.z).setFriction(.6), fixedBody));
  }
}
function enableBins(set, on) { for (const b of set) { b.g.visible = b.stand.visible = on; b.body.setEnabled(on); for (const c of b.fixed) c.setEnabled(on); if (b.gate) b.gate.setEnabled(on && !b.leak); } }
/* 两套筐共用 bc0–bc3 四个计数元素：只按当前这套决定显示几个 */
function syncBinEls() { for (let i = 0; i < 4; i++) $('bc' + i).style.display = i < bins.length ? '' : 'none'; }
bins = binSets[S.mode]; for (const m of MODE_IDS) enableBins(binSets[m], m === S.mode); syncBinEls();
function refreshBinLabels() { for (const b of binSets.garbage) { const old = b.label.material.map; b.label.material.map = kit.binLabel(b.i, binName(b.i, S.garbage.naming)); b.label.material.needsUpdate = true; old.dispose(); } }

/* ---------- 货车 ---------- */
const truck = { g: new THREE.Group(), s: 14, waiting: 0, st: 'gone', t: 0, door: 0, batches: [], unT: 0, name: '', wheels: [], doors: [], sideCanvas: null, sideTex: null };
{
  const g = truck.g; scene.add(g); g.position.copy(truckAt(14)); g.rotation.y = TRUCK.yaw; g.scale.setScalar(TRUCK.scale || 1);
  const c = cvs(1024, 512); truck.sideCanvas = c; truck.sideTex = tex(c);
  const cream = new THREE.MeshPhysicalMaterial({ color: 0xf4eee4, roughness: .45, clearcoat: .6, clearcoatRoughness: .25 });
  const side = new THREE.MeshPhysicalMaterial({ map: truck.sideTex, roughness: .45, clearcoat: .6, clearcoatRoughness: .25 });
  // 车厢做成后开口的空箱子，里面的货物是真实模型，卸一件少一件
  const dark = new THREE.MeshStandardMaterial({ color: 0x2a221c, roughness: .95, side: THREE.BackSide });
  const woodFloor = new THREE.MeshStandardMaterial({ map: woodTex(), roughness: .8 });
  for (const [geo, m, x, y, z] of [[RB(3.8, .12, 2.4, .05), cream, 1.9, 3.24, 0], [RB(3.8, .14, 2.4, .05), woodFloor, 1.9, .67, 0], [RB(.12, 2.7, 2.4, .05), cream, 3.74, 1.95, 0]]) { const o = mesh(geo, m); o.position.set(x, y, z); g.add(o); }
  for (const zz of [-1.15, 1.15]) { const o = mesh(RB(3.8, 2.7, .1, .05), [cream, cream, cream, cream, side, side]); o.position.set(1.9, 1.95, zz); o.userData.keep = true; g.add(o); }
  const lining = new THREE.Mesh(new THREE.BoxGeometry(3.64, 2.46, 2.2), dark); lining.position.set(1.92, 1.97, 0); lining.userData.keep = true; g.add(lining);
  truck.cargo = []; const cm = new THREE.MeshStandardMaterial({ map: plainTex(), roughness: .86, bumpMap: BUMP, bumpScale: .6 }), cg = RB(1.0, .74, .98, .04, 1);
  for (let ix = 0; ix < 3; ix++) for (let iy = 2; iy >= 0; iy--) for (const iz of [-1, 1]) { const o = mesh(cg, cm); o.position.set(.62 + ix * 1.04, .74 + .38 + iy * .76, iz * .52); o.rotation.y = rnd(-.06, .06); o.userData.keep = true; g.add(o); truck.cargo.push(o); }
  truck.loadMax = 0;
  const orange = new THREE.MeshPhysicalMaterial({ color: 0xea6f2e, roughness: .38, clearcoat: .8, clearcoatRoughness: .2 }); truck.cabMat = orange;
  const cab = mesh(RB(1.7, 2.05, 2.3, .28), orange); cab.position.set(4.75, 1.45, 0); g.add(cab);
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x223644, roughness: .08, metalness: .2, clearcoat: 1 });
  const ws = mesh(RB(.9, .8, 2.02, .12), glass, false); ws.position.set(5.05, 2.0, 0); g.add(ws);
  const chassis = mesh(RB(5.9, .34, 2.1, .08), M.graphite); chassis.position.set(2.85, .62, 0); g.add(chassis);
  const bump = mesh(RB(.18, .3, 2.3, .06), M.graphite2); bump.position.set(-.05, .62, 0); g.add(bump);
  const light = mesh(RB(.08, .18, .3, .04), new THREE.MeshStandardMaterial({ color: 0xff3b2f, emissive: 0xff2a1e, emissiveIntensity: .8 })); for (const s of [-1, 1]) { const l = light.clone(); l.position.set(-.04, .95, s * .95); g.add(l); }
  const tire = new THREE.MeshStandardMaterial({ color: 0x1b1e21, roughness: .85 }), hub = new THREE.MeshStandardMaterial({ color: 0xcfd5da, metalness: .7, roughness: .3 });
  for (const x of [.95, 3.0, 4.75]) for (const s of [-1, 1]) { const w = new THREE.Group(); w.position.set(x, .52, s * 1.1); const t = mesh(new THREE.CylinderGeometry(.52, .52, .38, 28), tire); t.rotation.x = Math.PI / 2; w.add(t); const hb = mesh(new THREE.CylinderGeometry(.24, .24, .4, 16), hub); hb.rotation.x = Math.PI / 2; w.add(hb); for (let k = 0; k < 5; k++) { const sp = mesh(new THREE.BoxGeometry(.06, .34, .41), hub); sp.rotation.z = k * Math.PI * 2 / 5; w.add(sp); } g.add(w); truck.wheels.push(w); }
  for (const s of [-1, 1]) { const piv = new THREE.Group(); piv.position.set(-.02, 1.95, s * 1.18); const dr = mesh(RB(.07, 2.6, 1.17, .04), cream); dr.position.z = -s * .585; piv.add(dr); const hd = mesh(RB(.06, .5, .06, .02), M.steel); hd.position.set(-.05, 0, -s * 1.02); piv.add(hd); g.add(piv); truck.doors.push({ piv, s }); }
}
/* 整窗渲染后货车不再被画面边缘挡住：远处一段渐隐渐显，看起来是从远方开来、开走，而不是在半空里越开越小。
   车用到的公共材质先复制一份，淡出时不影响分拣台本身 */
{
  const own = new Map(); truck.g.traverse(o => { if (!o.isMesh) return; const one = m => { if (!Object.values(M).includes(m)) return m; if (!own.has(m)) own.set(m, m.clone()); return own.get(m); }; o.material = Array.isArray(o.material) ? o.material.map(one) : one(o.material); });
  const set = new Set(); truck.g.traverse(o => { if (o.isMesh) for (const m of [].concat(o.material)) set.add(m); });
  truck.fadeMats = [...set].map(m => ({ m, t: m.transparent, op: m.opacity, dw: m.depthWrite })); truck.fading = false;
}
function setTruckAlpha(a) {
  const T = truck;
  if (a >= .999) { if (!T.fading) return; T.fading = false; for (const f of T.fadeMats) { f.m.transparent = f.t; f.m.opacity = f.op; f.m.depthWrite = f.dw; f.m.needsUpdate = true; } T.g.traverse(o => { if (o.isMesh) o.castShadow = true; }); return; }
  if (!T.fading) { T.fading = true; for (const f of T.fadeMats) { f.m.transparent = true; f.m.depthWrite = false; f.m.needsUpdate = true; } T.g.traverse(o => { if (o.isMesh) o.castShadow = false; }); }
  for (const f of T.fadeMats) f.m.opacity = f.op * a;
}
/* 货车车身碰撞体：倒车时把车道上的件推开（只和动态物件相互作用） */
truck.body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(truck.g.position.x, 0, truck.g.position.z).setRotation({ x: 0, y: Math.sin(TRUCK.yaw / 2), z: 0, w: Math.cos(TRUCK.yaw / 2) }));
world.createCollider(RAPIER.ColliderDesc.cuboid(2.95, 1.65, 1.2).setTranslation(2.85, 1.65, 0).setFriction(.5), truck.body);
function drawTruckSide(name) {
  const c = truck.sideCanvas, g = c.getContext('2d'); const w = 1024, h = 512;
  g.fillStyle = '#f4eee4'; g.fillRect(0, 0, w, h);
  const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(255,255,255,.3)'); gr.addColorStop(1, 'rgba(0,0,0,.06)'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
  const gb = isGarbage(), c1 = gb ? '#2f9b55' : '#ea6f2e', c2 = gb ? '#1f7a40' : '#c95a20';
  g.fillStyle = c1; g.fillRect(0, h * .68, w, 58); g.fillStyle = c2; g.fillRect(0, h * .68 + 58, w, 10);
  g.fillStyle = c1; rr(g, 70, 90, 150, 150, 26); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 12; g.lineJoin = 'round'; g.beginPath(); g.moveTo(105, 140); g.lineTo(145, 118); g.lineTo(185, 140); g.lineTo(185, 195); g.lineTo(145, 217); g.lineTo(105, 195); g.closePath(); g.moveTo(105, 140); g.lineTo(145, 162); g.lineTo(185, 140); g.moveTo(145, 162); g.lineTo(145, 217); g.stroke();
  g.fillStyle = '#26190e'; g.font = `900 104px ${FONT}`; g.textBaseline = 'alphabetic'; const nm = name ? fitText(g, name, 560) : gb ? '垃圾清运' : '今日快件'; g.fillText(nm, 260, 200);
  const nw = Math.min(560, g.measureText(nm).width); if (name) { g.fillStyle = c1; g.fillText(gb ? '倒' : '寄', 260 + nw + 24, 200); }
  g.fillStyle = '#8f7c69'; g.font = `600 40px ${FONT}`; g.fillText(gb ? '观众专线 · 分类投放' : '观众专线 · 不准下班', 262, 262);
  truck.sideTex.needsUpdate = true;
}
drawTruckSide('');

/* ---------- 无人机：帮忙（白绿）与捣乱（黑红、怒眉）各一架，可以同时出现 ---------- */
function makeDrone(kind) {
  const prank = kind === 'prank', d = { kind, g: new THREE.Group(), st: 'gone', tw: null, carry: null, name: '', plan: 0, need: 0, done: 0, tag: null, prop: null, eyes: [], queue: [], home: prank ? 15 : -14 };
  const g = d.g; scene.add(g); g.position.set(d.home, 8, 0); g.visible = false;
  const shell = new THREE.MeshPhysicalMaterial({ color: prank ? 0x2c3136 : 0xf6f8fa, roughness: .28, clearcoat: 1, clearcoatRoughness: .15 });
  const body = mesh(new THREE.SphereGeometry(.46, 32, 24), shell); body.scale.y = .86; g.add(body);
  const band = mesh(new THREE.TorusGeometry(.43, .06, 12, 40), new THREE.MeshPhysicalMaterial({ color: prank ? 0xd63a2f : 0x2fae82, roughness: .35, clearcoat: .6 })); band.rotation.x = Math.PI / 2; band.position.y = -.06; g.add(band);
  const visor = mesh(RB(.56, .26, .2, .12), new THREE.MeshPhysicalMaterial({ color: 0x141b22, roughness: .1, clearcoat: 1 })); visor.position.set(0, .06, .38); g.add(visor);
  const eyeM = new THREE.MeshStandardMaterial(prank ? { color: 0xff5a3c, emissive: 0xff3a1e, emissiveIntensity: 2.2 } : { color: 0x77ffe0, emissive: 0x55f0cc, emissiveIntensity: 2 });
  for (const sd of [-1, 1]) { const e = mesh(new THREE.SphereGeometry(.05, 12, 10), eyeM, false, false); e.scale.set(1, 1.35, .6); e.position.set(sd * .11, .07, .49); g.add(e); d.eyes.push(e); }
  if (prank) for (const sd of [-1, 1]) { const brow = mesh(RB(.13, .03, .03, .012), eyeM, false, false); brow.position.set(sd * .11, .15, .49); brow.rotation.z = sd * .45; g.add(brow); }
  const mast = mesh(new THREE.CylinderGeometry(.03, .03, .2, 8), M.steel); mast.position.y = .47; g.add(mast);
  const prop = new THREE.Group(); prop.position.y = .58; for (let k = 0; k < 3; k++) { const pb = mesh(RB(.9, .02, .12, .01), new THREE.MeshStandardMaterial({ color: prank ? 0x5a2a26 : 0x9aa6af, metalness: .5, roughness: .4 })); pb.rotation.y = k * Math.PI / 3 * 2; prop.add(pb); } g.add(prop); d.prop = prop;
  for (const sd of [-1, 1]) { const arm = mesh(new THREE.CylinderGeometry(.025, .025, .42, 8), M.steel); arm.position.set(sd * .2, -.5, 0); arm.rotation.z = sd * .25; g.add(arm); }
  return d;
}
const drone = makeDrone('help'), prankDrone = makeDrone('prank');

/* ================= 性能：静态模型按材质合并，减少绘制次数 ================= */
function mergeStatic(group) {
  const buckets = new Map();
  for (const m of [...group.children]) {
    if (!m.isMesh || m.userData.keep || Array.isArray(m.material) || !m.geometry.attributes.uv) continue;
    const k = m.material.uuid + (m.castShadow ? 'c' : '') + (m.receiveShadow ? 'r' : '') + (m.renderOrder || 0);
    if (!buckets.has(k)) buckets.set(k, []); buckets.get(k).push(m);
  }
  for (const list of buckets.values()) {
    if (list.length < 2) continue;
    const pos = [], nor = [], uv = [], nm = new THREE.Matrix3(), v = new THREE.Vector3();
    for (const m of list) {
      m.updateMatrix(); const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry; nm.getNormalMatrix(m.matrix);
      const P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv;
      for (let i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i).applyMatrix4(m.matrix); pos.push(v.x, v.y, v.z); v.fromBufferAttribute(N, i).applyMatrix3(nm).normalize(); nor.push(v.x, v.y, v.z); uv.push(U.getX(i), U.getY(i)); }
      group.remove(m);
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.computeBoundingSphere();
    const mm = new THREE.Mesh(geo, list[0].material); mm.castShadow = list[0].castShadow; mm.receiveShadow = list[0].receiveShadow; mm.renderOrder = list[0].renderOrder; Object.assign(mm.userData, list[0].userData); group.add(mm);
  }
}

/* ================= 包裹 ================= */
/* 性能：把盒子 6 个面的材质分组合并成 2 组（侧面+底面 / 顶面），每个箱子只需 2 次绘制 */
function twoGroups(geo) {
  const order = []; for (const pass of [0, 1]) for (const g of geo.groups) if ((g.materialIndex === 2) === !!pass) for (let i = g.start; i < g.start + g.count; i++) order.push(i);
  const idx = geo.index ? geo.index.array : null, out = new THREE.BufferGeometry();
  for (const [name, attr] of Object.entries(geo.attributes)) { const n = attr.itemSize, arr = new Float32Array(order.length * n); order.forEach((vi, j) => { const v = idx ? idx[vi] : vi; for (let c = 0; c < n; c++) arr[j * n + c] = attr.array[v * n + c]; }); out.setAttribute(name, new THREE.BufferAttribute(arr, n)); }
  const sideN = geo.groups.filter(g => g.materialIndex !== 2).reduce((n, g) => n + g.count, 0);
  out.addGroup(0, sideN, 0); out.addGroup(sideN, order.length - sideN, 2); out.computeBoundingSphere(); geo.dispose(); return out;
}
const geoSmall = twoGroups(RB(...SMALL, .045, 2)), geoBig = twoGroups(RB(...BIGS, .07, 2));
const boxes = [];
const movingBoxes = new Set(), restingPool = new RestingBatches(THREE, scene);
function freezeBox(b) {
  if (b.dormant || b.st !== 'free' || b.big || b.tape || b.stripped || b.onBelt) return;
  const p = b.body.translation(), r = b.body.rotation(); b.mesh.position.copy(p); b.mesh.quaternion.copy(r);
  b.body.setBodyType(RAPIER.RigidBodyType.Fixed, true); b.dormant = true; movingBoxes.delete(b); restingPool.add(b);
}
function thawBox(b, neighbors = false) {
  if (!b.dormant) return;
  const p = b.mesh.position.clone(); restingPool.remove(b); b.dormant = false; movingBoxes.add(b); scene.add(b.mesh);
  b.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true); b.body.wakeUp();
  if (neighbors) for (const o of restingPool.near(p, 1.5).filter(o => o.mesh.position.y > p.y).slice(0, 24)) thawBox(o);
}
let uid = 1;
/* 箱子材质：无名箱子只有 36 种，常驻缓存；带观众名的按「颜色|名字|大件」引用计数，最后一个同名箱子移走时释放贴图和材质 */
const matCache = new Map(), SEP = '';
function makeBoxMats(color, name, big, serial) {
  const side = sideTex(color, name, big, serial), top = topTex(color, big), plain = plainTex();
  const mk = map => new THREE.MeshStandardMaterial({ map, roughness: .86, metalness: 0, bumpMap: BUMP, bumpScale: .8 });
  const ms = mk(side); return [ms, ms, mk(top), mk(plain), ms, ms];
}
function disposeMats(m, ownMap) { if (ownMap) m[0].map.dispose(); for (const mm of new Set(m)) mm.dispose(); }
const namedMats = new RefCache(k => { const [c, name, big] = k.split(SEP); return makeBoxMats(+c, name, big === '1', 0); }, m => disposeMats(m, true));
function boxMats(color, name, big, serial) {
  if (name) { const k = [color, name, big ? 1 : 0].join(SEP); return { mats: namedMats.acquire(k), release: () => namedMats.release(k) }; }
  const k = `${color}|${big ? 1 : 0}|${serial % 6}`;
  if (!matCache.has(k)) matCache.set(k, makeBoxMats(color, '', big, serial));
  return { mats: matCache.get(k), release: null };
}
function spawnBox({ color, name = '', big = false, blind = 0, pos, vel, ang, rot, resting = false, scale = 1 }) {
  const dims = (big ? BIGS : SMALL).map(v => v * scale); const id = uid++;
  const mm = blind ? { mats: blindPool.acquire(name), release: () => blindPool.release(name) } : boxMats(color, name, big, id), mats = mm.mats;
  const m = new THREE.Mesh(big ? geoBig : geoSmall, mats); m.scale.setScalar(scale); m.castShadow = m.receiveShadow = true; scene.add(m);
  const desc = (resting ? RAPIER.RigidBodyDesc.fixed() : RAPIER.RigidBodyDesc.dynamic()).setTranslation(pos.x, pos.y, pos.z).setLinearDamping(.08).setAngularDamping(.35).setCcdEnabled(true);
  if (rot) desc.setRotation(rot); if (vel) desc.setLinvel(vel.x, vel.y, vel.z); if (ang) desc.setAngvel(ang);
  const body = world.createRigidBody(desc);
  world.createCollider(RAPIER.ColliderDesc.cuboid(dims[0] / 2 - .01, dims[1] / 2 - .01, dims[2] / 2 - .01).setDensity(big ? 3.2 : 1).setFriction(.72).setRestitution(.06), body);
  const b = { id, kind: 'box', cat: color, color, name, big, blind, hits: 0, stripped: false, mats, matRelease: mm.release, dims, mesh: m, body, st: 'free', tape: 0, tapeBy: '', bands: [], dT: 0, rejectCD: 0, pv: 0, wig: 0, born: time, onBelt: false };
  b.itemScale = scale; m.userData.box = b; body.userData = { box: b }; b.listIndex = boxes.length; boxes.push(b); movingBoxes.add(b); return b;
}
/* 垃圾物件：模型来自 garbage-models（同品种共用几何体和材质）；碰撞体按模型给的形状建 */
/* 圆柱、胶囊用多边形凸包代替：这个版本的 Rapier 里真圆柱 / 胶囊侧躺会一直滚（模型子代理实测 16 次掉落 13–16 次停不下来），凸包约 1 秒停稳 */
function cylHull(hh, r, n = 16) { const R = r / Math.cos(Math.PI / n), p = []; for (let i = 0; i < n; i++) { const a = (i + .5) / n * Math.PI * 2; p.push(Math.cos(a) * R, -hh, Math.sin(a) * R, Math.cos(a) * R, hh, Math.sin(a) * R); } return RAPIER.ColliderDesc.convexHull(new Float32Array(p)); }
function capHull(hh, r, n = 12) { const R = r / Math.cos(Math.PI / n), p = []; for (const sg of [-1, 1]) { for (const t of [0, Math.PI / 6, Math.PI / 3]) for (let i = 0; i < n; i++) { const a = (i + .5) / n * Math.PI * 2; p.push(Math.cos(a) * R * Math.cos(t), sg * (hh + r * Math.sin(t)), Math.sin(a) * R * Math.cos(t)); } p.push(0, sg * (hh + r), 0); } return RAPIER.ColliderDesc.convexHull(new Float32Array(p)); }
/* 纸团：略扁的二十面体凸包。真球在地上没有滚动阻力，会一直慢慢滚出画面；有棱面的纸团落地滚几下就停 */
function ballHull(r) { const f = (1 + Math.sqrt(5)) / 2, k = r * 1.05 / Math.hypot(1, f), p = []; for (const a of [-1, 1]) for (const b of [-f, f]) p.push(0, a * k * .88, b * k, a * k, b * k * .88, 0, b * k, 0, a * k); return RAPIER.ColliderDesc.convexHull(new Float32Array(p)); }
function shapeDesc(sh) {
  if (sh.kind === 'cylinder') return cylHull(sh.hh, sh.r) || RAPIER.ColliderDesc.cylinder(sh.hh, sh.r);
  if (sh.kind === 'ball') return ballHull(sh.r) || RAPIER.ColliderDesc.ball(sh.r);
  if (sh.kind === 'capsule') return capHull(sh.hh, sh.r) || RAPIER.ColliderDesc.capsule(sh.hh, sh.r);
  const cd = RAPIER.ColliderDesc.cuboid(sh.hx, sh.hy, sh.hz);
  // 扁平件（最薄的是高度）把质心压到底面附近，落地总是平躺，不会立在窄边上
  if (sh.hy <= Math.min(sh.hx, sh.hz)) { const m = 8 * sh.hx * sh.hy * sh.hz; cd.setMassProperties(m, { x: 0, y: -1.15 * sh.hy, z: 0 }, { x: m / 3 * (sh.hy ** 2 + sh.hz ** 2), y: m / 3 * (sh.hx ** 2 + sh.hz ** 2), z: m / 3 * (sh.hx ** 2 + sh.hy ** 2) }, { x: 0, y: 0, z: 0, w: 1 }); }
  return cd;
}
function spawnGarbage({ itemId, cat, name = '', blind = 0, pos, vel, ang, rot, trickBy, resting = false, scale = 1 }) {
  const id = uid++, made = blind ? kit.bag() : kit.build(itemId), m = made.object;
  m.scale.setScalar(scale); made.dims = made.dims.map(v => v * scale);
  for (const k of Object.keys(made.shape)) if (typeof made.shape[k] === 'number') made.shape[k] *= scale;
  m.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); scene.add(m);
  const desc = (resting ? RAPIER.RigidBodyDesc.fixed() : RAPIER.RigidBodyDesc.dynamic()).setTranslation(pos.x, pos.y, pos.z).setLinearDamping(.08).setAngularDamping(blind ? .35 : .9).setCcdEnabled(true);
  if (rot) desc.setRotation(rot); if (vel) desc.setLinvel(vel.x, vel.y, vel.z); if (ang) desc.setAngvel(ang);
  const body = world.createRigidBody(desc);
  const cd = shapeDesc(made.shape); if (!cd.massPropsMode && !cd.mass) cd.setDensity(blind ? 3.2 : 1); else if (blind) cd.setDensity(3.2);
  world.createCollider(cd.setFriction(.78).setRestitution(.06), body);
  const g = GARBAGE_BY_ID[itemId];
  const b = { id, kind: 'garbage', itemId: blind ? '' : itemId, cat: blind ? -1 : (Number.isInteger(cat) ? cat : catOf(g, S.garbage.items)), color: -1, name, big: !!blind, blind, hits: 0, stripped: false, mats: null, matRelease: null, dims: made.dims, mesh: m, body, st: 'free', tape: 0, tapeBy: '', bands: [], dT: 0, rejectCD: 0, pv: 0, wig: 0, born: time, onBelt: false, trickBy: trickBy || '' };
  b.itemScale = scale; m.userData.box = b; body.userData = { box: b }; b.listIndex = boxes.length; boxes.push(b); movingBoxes.add(b); return b;
}
/* 当前玩法下随机一件：快递随机颜色，垃圾在启用品种里随机 */
function randomItem() {
  if (!isGarbage()) { const c = Math.floor(Math.random() * 3); return { kind: 'box', color: c, cat: c }; }
  const on = enabledItems(S.garbage.items), g = on[Math.floor(Math.random() * on.length)] || GARBAGE[0];
  return { kind: 'garbage', itemId: g.id, cat: catOf(g, S.garbage.items) };
}
function removeBox(b) { if (b.st === 'gone') return; restingPool.remove(b); movingBoxes.delete(b); b.st = 'gone'; if (b.matRelease) { b.matRelease(); b.matRelease = null; } world.removeRigidBody(b.body); scene.remove(b.mesh); const i = b.listIndex, last = boxes.pop(); if (last !== b) { boxes[i] = last; last.listIndex = i; } }
function wrapTape(b, name, layers = tierOf(S.tiers, 'tape').layers) {
  thawBox(b);
  b.tape = clamp(Math.round(layers), 1, 6); b.tapeBy = name; const localDims = b.dims.map(v => v / (b.itemScale || 1)), [x, y, z] = localDims, e = .035;
  if (b.kind === 'garbage') { for (let j = 0; j < b.tape; j++) { const L = kit.bagLayer(localDims, j); L.traverse(o => { o.userData.layer = true; }); b.mesh.add(L); b.bands.push(L); } burst('tape', b.mesh.position, 8); return; }
  const bands = [new THREE.BoxGeometry(x + e, y + e, .26), new THREE.BoxGeometry(.26, y + e * 1.3, z + e * 1.3), new THREE.BoxGeometry(x + e * 1.6, .22, z + e * 1.6)];
  for (let j = 0; j < b.tape; j++) { const i = j % 3; const m = new THREE.Mesh(bands[i], M.tape); m.renderOrder = 2; if (i === 0) m.position.z = rnd(-.15, .15); if (i === 1) m.position.x = rnd(-.2, .2); if (i === 2) m.position.y = rnd(-.12, .12); m.rotation.set(0, 0, 0); b.mesh.add(m); b.bands.push(m); }
  burst('tape', b.mesh.position, 8);
}
function tear(b) { const m = b.bands.pop(); if (m) { b.mesh.remove(m); if (!m.userData.sharedGeo) m.traverse(o => { if (o.geometry) o.geometry.dispose(); }); } b.tape = Math.max(0, b.tape - 1); b.wig = 1; sfx.rip(); burst('shred', b.mesh.position, 12); b.body.applyImpulse({ x: 0, y: b.body.mass() * 2.2, z: 0 }, true); }

/* ================= 地台外的接地阴影（整窗模式；隐形地面上的件不像飘在空中） ================= */
const blobHead = { value: new THREE.Vector4(0, 0, 0, 0) };
const blobMesh = (() => {
  const c = cvs(128, 128), g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.55, 'rgba(255,255,255,.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const mat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), color: 0x000000, transparent: true, opacity: .34, depthWrite: false });
  // 露头圆里一个像素都不画：阴影贴在地面上，挨着圆的件的阴影也不能渗进圆里
  mat.onBeforeCompile = sh => { sh.uniforms.uHead = blobHead; sh.fragmentShader = 'uniform vec4 uHead;\n' + sh.fragmentShader.replace('void main() {', 'void main() {\n  if (uHead.w > .5 && distance(gl_FragCoord.xy, uHead.xy) < uHead.z) discard;'); };
  const m = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), mat, 320);
  m.renderOrder = 1; m.frustumCulled = false; m.count = 0; m.castShadow = m.receiveShadow = false; scene.add(m); return m;
})();
const BM = new THREE.Matrix4();
function updBlobs() {
  if (!S.play.blob || !winMode()) { if (blobMesh.count) { blobMesh.count = 0; } return; }
  let n = 0;
  for (const b of boxes) {
    if (n >= 320) break; const p = b.mesh.position;
    if (p.x > PLAT.x0 && p.x < PLAT.x1 && p.z > PLAT.z0 && p.z < PLAT.z1) continue;
    const h = Math.max(0, p.y - b.dims[1] / 2); if (h > 5) continue;
    const s = Math.max(b.dims[0], b.dims[2]) * (1.3 + h * .18); BM.makeScale(s, 1, s).setPosition(p.x, .012, p.z); blobMesh.setMatrixAt(n++, BM);
  }
  blobMesh.count = n; blobMesh.instanceMatrix.needsUpdate = true;
  const hc = headCircle(), k = renderer.domElement.width / VR.width;
  blobHead.value.set(hc.cx * k, (VR.height - hc.cy) * k, (hc.r + 2) * k, S.layout.head.on ? 1 : 0);
}
/* ================= 主播露头圆：屏幕上的一个圆 = 3D 里从镜头射出去的隐形圆锥（凸包碰撞体），任何角度的件都挡不住圆里的画面 ================= */
let headCollider = null;
const headCircle = () => ({ cx: S.layout.head.x / 100 * VR.width, cy: S.layout.head.y / 100 * VR.height, r: S.layout.head.r / 100 * VR.height });
/* 中心落在露头圆里的件放回台面：圆锥离镜头近的一段很细（柜台布局镜头近），打开或挪动露头圆时，
   圆锥可能直接生成在件里面把它「串」在脸前；正常飞过来的件有连续碰撞检测，会被圆锥挡开 */
let headClearT = 0;
function clearHeadCircle() {
  if (!S.layout.head.on) return; const c = headCircle();
  for (const b of boxes) { if (b.st !== 'free') continue; const s = toScreen(b.mesh.position); if (s.z < 1 && Math.hypot(s.x - c.cx, s.y - c.cy) < c.r) ejectToTable(b, true); }   // 不在脸前冒灰
}
function rebuildHead(inv, cam) {
  if (headCollider) { world.removeCollider(headCollider, false); headCollider = null; }
  if (!S.layout.head.on) return;
  // 碰撞体比画面上的圆大一圈（4 像素或半径的 4%）：箱子棱角和接触容差都压不进看得见的圆
  // 圆锥比画面上的圆外扩一圈：压在圆锥上的件会嵌进去几厘米，镜头近（柜台布局）时这几厘米也有好几个像素
  const hc = headCircle(), pad = Math.max(10, hc.r * .06);
  const desc = RAPIER.ColliderDesc.convexHull(coneHullPoints(cam, inv, { ...hc, r: hc.r + pad }, VR.width, VR.height, 260, 32));
  if (!desc) { toast('露头圆生成失败，换个位置或大小试试'); return; }
  // 碰撞组：只和物件相撞（成员 0x0002，过滤 0x0001），不影响静态场景
  headCollider = world.createCollider(desc.setFriction(.15).setRestitution(.1).setCollisionGroups(0x00020001), fixedBody);
}
/* 圆压到传送带、工作台、堆货台或筐时提示：台上的件会被推开 */
function headOverlapsStation() {
  if (!S.layout.head.on) return false;
  const c = headCircle(), pts = [];
  const area = (x0, x1, z0, z1, y) => { for (let i = 0; i <= 4; i++) for (let j = 0; j <= 2; j++) pts.push(new THREE.Vector3(lerp(x0, x1, i / 4), y, lerp(z0, z1, j / 2))); };
  area(BELT.x0, BELT.x1, BELT.z - .85, BELT.z + .85, BELT.top); area(TABLE.x0, TABLE.x1, TABLE.z0, TABLE.z1, TABLE.top); area(DOCK.x0, DOCK.x1, DOCK.z0, DOCK.z1, DOCK.top);
  for (const b of bins) area(b.x - BIN.w / 2, b.x + BIN.w / 2, b.z - BIN.d / 2, b.z + BIN.d / 2, BASE + BIN.h);
  return pts.some(v => { const p = toScreen(v); return Math.hypot(p.x - c.cx, p.y - c.cy) < c.r; });
}
/* DOM 标签避开露头圆：中心落在圆里就沿径向推到圆外 */
function avoidHead(x, y, h) {
  if (!S.layout.head.on) return [x, y];
  const c = headCircle(), dx = x - c.cx, dy = y - h / 2 - c.cy, d = Math.hypot(dx, dy), need = c.r + h / 2 + 6;
  if (d >= need) return [x, y];
  const ux = d > 1 ? dx / d : 0, uy = d > 1 ? dy / d : 1;
  return [c.cx + ux * need, c.cy + uy * need + h / 2];
}

/* ================= 粒子 ================= */
const DOT = softDot();
const parts = [];
function burst(kind, p, n, opt = {}) {
  for (let i = 0; i < n; i++) {
    let m;
    if (kind === 'dust') { m = new THREE.Sprite(new THREE.SpriteMaterial({ map: DOT, color: 0xe2cfb2, transparent: true, opacity: .55, depthWrite: false })); m.scale.setScalar(rnd(.3, .6) * (opt.s || 1)); }
    else if (kind === 'shred' || kind === 'tape') { m = new THREE.Mesh(new THREE.PlaneGeometry(rnd(.12, .26), rnd(.06, .12)), new THREE.MeshBasicMaterial({ color: 0xdcebf4, transparent: true, opacity: .85, side: THREE.DoubleSide, depthWrite: false })); }
    else { m = new THREE.Mesh(new THREE.PlaneGeometry(.12, .07), new THREE.MeshBasicMaterial({ color: [0xe2503f, 0xf2ae1c, 0x2d84d8, 0xffffff][i % 4], side: THREE.DoubleSide })); }
    m.position.set(p.x + rnd(-.4, .4) * (opt.r || 1), p.y + rnd(-.2, .3), p.z + rnd(-.4, .4) * (opt.r || 1)); scene.add(m);
    const sp = opt.sp || 1;
    parts.push({ m, kind, life: 0, max: kind === 'dust' ? rnd(.5, .9) : rnd(.6, 1.1), v: new THREE.Vector3(rnd(-3, 3) * sp, (kind === 'dust' ? rnd(.4, 1.6) : rnd(2, 6)) * sp, rnd(-3, 3) * sp), r: new THREE.Vector3(rnd(-12, 12), rnd(-12, 12), rnd(-12, 12)) });
  }
}
function updParts(dt) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i]; p.life += dt; const k = p.life / p.max;
    if (p.kind === 'dust') { p.v.multiplyScalar(.93); p.m.position.addScaledVector(p.v, dt); p.m.material.opacity = .55 * (1 - k); p.m.scale.multiplyScalar(1 + dt * 1.6); }
    else { p.v.y -= 14 * dt; p.m.position.addScaledVector(p.v, dt); p.m.rotation.x += p.r.x * dt; p.m.rotation.y += p.r.y * dt; p.m.material.opacity = 1 - k * k; p.m.material.transparent = true; }
    if (k >= 1) { scene.remove(p.m); p.m.material.dispose(); if (p.m.geometry && p.kind !== 'dust') p.m.geometry.dispose(); parts.splice(i, 1); }
  }
}

/* ================= 状态 ================= */
let stats = newStats(), auditSegs = [], speedSegs = [], prankQueue = [];
const trickQueue = [];
const splits = [];
let supply = 0, delivered = 0, state = 'work', elapsed = 0, doneT = 0, spawnT = 0, jamT = 0, beltPos = 0, shake = 0, shiftNo = 0;
let pendingStrip = [], speedTag = null;
/* 加速、抽查：每份礼物一段，接在前一段后面，各用各的倍数和署名（见 timed.js） */
const speedNow = () => (segAt(speedSegs, time) || { val: 1 }).val;
const auditNow = () => segAt(auditSegs, time);
/* 限时效果标签：当前这一段的倍数与剩余秒数；后面还排着别人就带一句「接着 谁 几倍」 */
function segLine(segs, cur, next) { const s = segAt(segs, time); if (!s) return ''; const nx = segAfter(segs, s); return `${cur(s)} · ${Math.max(0, Math.ceil(s.end - time))}s` + (nx ? ` · 接着 ${nx.name} ${next(nx)}` : ''); }
let held = null, bigQueue = [], warns = [], helpQueue = [], pendingTape = [], tableShake = 0;
function remaining() { let n = supply + trickQueue.length; for (const q of bigQueue) n += q.n; for (const w of warns) n += w.n; for (const s of splits) n += s.copies; for (const bt of truck.batches) n += bt.left; for (const b of boxes) if (b.st !== 'deliver') n += b.blind || 1; return n; }
const MAX_WORK = 1000000;
// 预留盲盒展开、预告和翻倍的容量；货车队列仅存计数，不占物理场景容量。
function activeLoad() { return boxes.reduce((n, b) => n + (b.blind || 1), 0) + warns.reduce((n, w) => n + w.n, 0) + splits.reduce((n, s) => n + s.copies, 0); }
const activeRoom = () => Math.max(0, S.play.cap - activeLoad());
function onTable(p) { return p.x > TABLE.x0 - .1 && p.x < TABLE.x1 + .1 && p.z > TABLE.z0 - .1 && p.z < TABLE.z1 + .1 && p.y > TABLE.top - .05; }
function tableCount() { let n = 0; for (const b of boxes) { if (b.st !== 'free') continue; if (onTable(b.body.translation())) n += b.big ? 3 : 1; } return n; }
let overtime = false;
let runLevel = null;
const curLevels = () => S.mode === 'garbage' ? S.glevels : S.levels;
const curIdx = () => S.mode === 'garbage' ? S.glevel : S.level;
const setIdx = i => { if (S.mode === 'garbage') S.glevel = i; else S.level = i; };
const curLevel = () => runLevel || curLevels()[clamp(curIdx(), 0, curLevels().length - 1)];
const beltV = () => 1.9 * S.beltSpeed * (S.endless || overtime ? 1 : curLevel().speed);
function startLevel(i) {
  bulkJob++; bulkBuilding = false; pileFit = []; fitCamera();
  if (S.endless) stopAll(true);
  const LV = curLevels();
  if (i !== undefined) { setIdx(((i % LV.length) + LV.length) % LV.length); save(); }
  runLevel = clone(LV[clamp(curIdx(), 0, LV.length - 1)]); const L = runLevel;
  for (const d of [drone, prankDrone]) if (d.st !== 'gone') { d.carry = null; droneOut(d); }
  for (const b of [...boxes]) removeBox(b); slotOcc.clear(); unloads.length = 0; feeding = null;
  held = null; aim.visible = false; supply = 0; delivered = 0; stats = newStats(); splits.length = 0; for (const o of pops) o.el.remove(); pops.length = 0; state = 'work'; overtime = false; elapsed = 0; doneT = 0; spawnT = 0; shiftNo++;
  for (const b of bins) { b.count = 0; b.el.textContent = '0'; }
  // 按关卡配置生成这一关的物件：快递按颜色，垃圾按分类在启用品种里随机；再挑出缠胶带/套袋、无面单/糊泥的
  const items = [], miss = [];
  if (S.endless) { /* 只由观众加件，空场候场。 */ }
  else if (isGarbage()) {
    const by = itemsByCat(S.garbage.items);
    for (const [c, k] of [[0, 'rec'], [1, 'haz'], [2, 'kit'], [3, 'oth']]) { if (!L[k]) continue; if (!by[c].length) { miss.push(binName(c, S.garbage.naming)); continue; } for (let j = 0; j < L[k]; j++) { const g = by[c][Math.floor(Math.random() * by[c].length)]; items.push({ kind: 'garbage', itemId: g.id, cat: c }); } }
  } else for (const [c, k] of [[0, 'red'], [1, 'yellow'], [2, 'blue']]) for (let j = 0; j < L[k]; j++) items.push({ kind: 'box', color: c, cat: c });
  if (miss.length) setTimeout(() => toast(`${miss.join('、')}没有启用的品种，这一类本关不出`), 0);
  for (let j = items.length - 1; j > 0; j--) { const r = Math.floor(Math.random() * (j + 1)); [items[j], items[r]] = [items[r], items[j]]; }
  const idx = items.map((_, j) => j).sort(() => Math.random() - .5);
  const nTape = isGarbage() ? L.bag : L.tape, nStrip = isGarbage() ? L.mud : L.strip;
  for (let j = 0; j < nTape && j < idx.length; j++) items[idx[j]].tape = true;
  for (let j = 0; j < nStrip && j < idx.length; j++) items[idx[idx.length - 1 - j]].strip = true;
  const viewerBatches = truck.batches.filter(bt => bt.name && bt.left > 0);
  truck.batches = (items.length ? [{ name: '', left: items.length, items }] : []).concat(viewerBatches); if (truck.st !== 'gone' && !truck.batches.length) { truck.st = 'close'; truck.t = 0; }
  // 观众送礼排队的效果（带名字的盲盒、胶带、面单、帮忙、踹一脚）跨关保留；正在落下的盲盒放回队列
  bigQueue = bigQueue.filter(q => q.name); for (const w of warns) { scene.remove(w.m); w.m.material.dispose(); if (w.name && !S.endless) bigQueue.unshift({ name: w.name, color: w.color, n: w.n, hits: w.hits }); } warns = [];
  for (let j = 0; !S.endless && j < L.blind; j++) bigQueue.push({ name: '', color: 0, n: L.blindSize, hits: tierOf(S.tiers, 'blind').hits }); bigT = 4;
  for (const b of bins) { unseal(b, true); unleak(b, true); }
  showResult(null); refreshHud(true);
}
function nextLevel() { const n = curLevels().length, i = curIdx(), last = i >= n - 1; startLevel(last ? (S.loopLevels ? 0 : i) : i + 1); }

/* ================= 标签（署名） ================= */
const ICONS = {
  truck: '<svg viewBox="0 0 16 16"><path d="M1 4h8v7H1zM9 7h3l3 3v1H9z" fill="#fff"/><circle cx="4" cy="12.5" r="1.6" fill="#fff"/><circle cx="12" cy="12.5" r="1.6" fill="#fff"/></svg>',
  big: '<svg viewBox="0 0 16 16"><path d="M8 1l6 3v8l-6 3-6-3V4z" fill="#fff"/><path d="M2 4l6 3 6-3M8 7v8" stroke="#8b5a2b" stroke-width="1.2" fill="none"/></svg>',
  swap: '<svg viewBox="0 0 16 16"><path d="M2 5h10l-3-3M14 11H4l3 3" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  tape: '<svg viewBox="0 0 16 16"><circle cx="7" cy="8" r="5" stroke="#fff" stroke-width="2.4" fill="none"/><path d="M11 12h4" stroke="#fff" stroke-width="2.4"/></svg>',
  kick: '<svg viewBox="0 0 16 16"><path d="M3 2h4v6l5 2c2 1 2 4 0 4H3z" fill="#fff"/></svg>',
  help: '<svg viewBox="0 0 16 16"><path d="M8 14S2 10 2 6a3 3 0 0 1 6-1 3 3 0 0 1 6 1c0 4-6 8-6 8z" fill="#fff"/></svg>',
  blind: '<svg viewBox="0 0 16 16"><path d="M2 5h12v9H2z" fill="#fff"/><path d="M1 3h14v3H1z" fill="#fff" opacity=".7"/><text x="8" y="12.5" font-size="8" font-weight="900" text-anchor="middle" fill="#8b5a2b">?</text></svg>',
  seal: '<svg viewBox="0 0 16 16"><rect x="3" y="7" width="10" height="7" rx="1.5" fill="#fff"/><path d="M5 7V5a3 3 0 0 1 6 0v2" stroke="#fff" stroke-width="2" fill="none"/></svg>',
  speed: '<svg viewBox="0 0 16 16"><path d="M9 1L3 9h4l-1 6 6-8H8z" fill="#fff"/></svg>',
  leak: '<svg viewBox="0 0 16 16"><path d="M8 2s-4 5-4 8a4 4 0 0 0 8 0c0-3-4-8-4-8z" fill="#fff"/></svg>',
  strip: '<svg viewBox="0 0 16 16"><text x="8" y="13" font-size="13" font-weight="900" text-anchor="middle" fill="#fff">?</text></svg>',
  full: '<svg viewBox="0 0 16 16"><path d="M8 3v6M8 12v1" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/></svg>',
  wrong: '<svg viewBox="0 0 16 16"><path d="M4 4l8 8M12 4l-8 8" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/></svg>',
  audit: '<svg viewBox="0 0 16 16"><circle cx="7" cy="7" r="4.2" stroke="#fff" stroke-width="2.2" fill="none"/><path d="M10.2 10.2l3.6 3.6" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/></svg>',
  tricky: '<svg viewBox="0 0 16 16"><path d="M4 5.2a1.8 1.8 0 1 1 2.4-1.7L9.6 6.7a1.8 1.8 0 1 1 1.7 2.4 1.8 1.8 0 1 1-1.7 2.4L6.4 8.3A1.8 1.8 0 1 1 4 5.2z" fill="#fff"/></svg>',
  prank: '<svg viewBox="0 0 16 16"><circle cx="8" cy="9" r="4.6" fill="#fff"/><path d="M3.5 5L5 2.5 6.5 4.8M12.5 5L11 2.5 9.5 4.8" fill="#fff"/><path d="M5.8 9.2l1.4.6M10.2 9.2l-1.4.6" stroke="#c8372d" stroke-width="1.4" stroke-linecap="round"/></svg>',
};
const ICBG = { wrong: '#d4382c', audit: '#c0392b', tricky: '#8a6a2e', prank: '#b8322a', truck: '#e0703a', big: '#8b5a2b', blind: '#b0642a', seal: '#7a5bd0', speed: '#d9811c', leak: '#2c7fb8', strip: '#8a6a4a', swap: '#7a5bd0', tape: '#4f95b8', kick: '#c8372d', help: '#2f9a74', full: '#6b737a' };
const tags = [];
function addTag(key, kind, name, textFn, anchor, add, life = 3.6) {
  let t = tags.find(t => t.key === key && t.life > 0);
  if (t) { t.count += add; t.life = Math.max(t.life, life); if (anchor) t.anchor = anchor; t.el.classList.remove('pop'); void t.el.offsetWidth; t.el.classList.add('pop'); }
  else {
    const el = document.createElement('div'); el.className = 'tag in';
    el.innerHTML = `<span class="ic" style="background:${ICBG[kind]}">${ICONS[kind]}</span><span><b></b> <span class="tx"></span></span>`;
    $('tags').appendChild(el);
    t = { key, kind, name, textFn, anchor, count: add, life, el }; tags.push(t);
  }
  t.el.querySelector('b').textContent = t.name; t.el.querySelector('.tx').textContent = t.textFn(t.count);
  return t;
}
const V = new THREE.Vector3();
function toScreen(v) { V.copy(v).project(camera); return { x: VR.left + (V.x + 1) / 2 * VR.width, y: VR.top + (1 - V.y) / 2 * VR.height, z: V.z }; }
function setNdc(sx, sy) { ndc.set((sx - VR.left) / VR.width * 2 - 1, -((sy - VR.top) / VR.height) * 2 + 1); }
function updTags(dt) {
  const placed = []; const bd = $('board'); if (bd && !bd.hidden) { const r = bd.getBoundingClientRect(); placed.push({ x: r.left + r.width / 2, y: r.bottom, w: r.width, h: r.height }); }
  for (let i = tags.length - 1; i >= 0; i--) {
    const t = tags[i]; t.life -= dt;
    if (t.life <= 0) { t.el.remove(); tags.splice(i, 1); continue; }
    t.el.querySelector('.tx').textContent = t.textFn(t.count);
    if (t.nameFn) { const nm = t.nameFn(), b = t.el.querySelector('b'); if (b.textContent !== nm) b.textContent = nm; }
    const a = typeof t.anchor === 'function' ? t.anchor() : t.anchor; if (!a) continue;
    const s = toScreen(a); const w = (t.el.offsetWidth || 160) * tagK, h = (t.el.offsetHeight || 36) * tagK;
    let x = clamp(s.x, w / 2 + 8, innerWidth - w / 2 - 8), y = clamp(s.y, h + 8, innerHeight - 8);
    for (let k = 0; k < 8; k++) { const hit = placed.find(r => Math.abs(r.x - x) < (r.w + w) / 2 + 6 && Math.abs((r.y - r.h / 2) - (y - h / 2)) < (r.h + h) / 2 + 4); if (!hit) break; y = hit.y + h + 6; }
    [x, y] = avoidHead(x, y, h); x = clamp(x, w / 2 + 8, innerWidth - w / 2 - 8); y = clamp(y, h + 8, innerHeight - 8);
    placed.push({ x, y, w, h });
    // 位置用 translate 属性，居中和缩放放在 transform 里；跳动动画只改 scale 属性，以锚点为中心，不会把标签带跑
    t.el.style.translate = `${x}px ${y}px`; t.el.style.transform = `scale(${tagK}) translate(-50%,-100%)`; t.el.style.opacity = S.layout.tags.on ? Math.min(1, t.life / .4) : 0;
  }
}

/* ================= 观众互动 ================= */
function ensureWork() { if (state === 'done') { state = 'work'; overtime = true; showResult(null); } }
const truckAnchor = () => truck.g.position.clone().addScaledVector(TDIR, 1.2).setY(4.4);
const defAmount = (t, tier) => tierOf(S.tiers, t, tier).amt;
const CNAME = ['红', '黄', '蓝'];
/* 筐 / 桶的叫法跟着玩法走：快递「红筐」，垃圾「可回收物桶」（国标 / 上海叫法） */
const binWord = i => isGarbage() ? binName(i, S.garbage.naming) + '桶' : CNAME[i] + '筐';
let kickQueue = [], kickNext = 0;
const binAnchor = bin => () => new THREE.Vector3(bin.x, BASE + BIN.h + 1.0, bin.z);
/* 一次挑 n 个不同的筐：先挑没被封（漏）的，不够再从已经封（漏）的里补；同一份礼物不会把同一个筐算两次 */
function pickBins(key, n) { const sh = a => a.map(b => [Math.random(), b]).sort((x, y) => x[0] - y[0]).map(x => x[1]); return [...sh(bins.filter(b => !b[key])), ...sh(bins.filter(b => b[key]))].slice(0, n); }
/* amount：本次效果的总量（件 / 秒 / 次），已经乘过礼物个数 */
/* tier：档位 id（也认名字、「第几档」数字）；不给就用这种互动的默认档。数量不给时用这一档的数量；其他参数（点几下、倍数、几个筐、速度、力度……）都取这一档 */
function gift(type, name, amount, tier) {
  name = String(name || '').trim().slice(0, 14) || NAMES[Math.floor(Math.random() * NAMES.length)];
  if (!EFF[type]) return 0;
  const T = tierOf(S.tiers, type, tier); type = resolveEffect(type, S.mode);   // 先按原互动取档（刁钻垃圾在快递模式也用自己的档位），再换成实际执行的效果
  amount = Math.max(1, Math.floor(Number(amount) || T.amt));
  const full = () => addTag('full:' + name, 'full', name, () => isGarbage() ? '的垃圾没倒上（已达上限）' : '寄件没装上（已达上限）', truckAnchor, 0);
  if (type === 'truck') {
    ensureWork();
    const n = Math.min(amount, Math.max(0, MAX_WORK - remaining()));
    if (n <= 0) { full(); return 0; }
    const last = truck.batches[truck.batches.length - 1]; if (last && last.name === name) last.left += n; else truck.batches.push({ name, left: n });
    if (truck.st === 'close') { truck.st = 'open'; truck.t = truck.door * .3; }
    if (n < amount) toast(`待处理最多 ${MAX_WORK} 件，本次接收 ${n} / ${amount} 件`);
    addTag('truck:' + name, 'truck', name, c => isGarbage() ? `倒来 ${c} 件垃圾` : `寄来 ${c} 件`, truckAnchor, n); return n;
  }
  if (type === 'blind') {
    ensureWork(); let total = Math.min(amount, 60, Math.max(0, MAX_WORK - remaining())); if (total < 1) { full(); return 0; }
    const k = Math.min(3, Math.ceil(total / 20)); let left = total;
    for (let i = 0; i < k; i++) { const n = Math.max(1, Math.round(left / (k - i))); left -= n; bigQueue.push({ name, color: Math.floor(Math.random() * 3), n, hits: T.hits }); }
    addTag('blind:' + name, 'blind', name, c => isGarbage() ? `扔来大垃圾袋（里面 ${c} 件）` : `寄来爆箱盲盒（里面 ${c} 件）`, tableAnchor(3.28), total); return total;
  }
  if (type === 'seal' || type === 'leak') {
    const dur = Math.min(60, amount), n = Math.min(T.bins, bins.length);
    for (const bin of pickBins(type, n)) (type === 'seal' ? sealBin : leakBin)(bin, name, dur, T.hits);
    return dur;
  }
  if (type === 'speed') {
    const r = pushSeg(speedSegs, time, Math.min(30, amount), T.mul, name, 45); if (!r.added) return 0;
    speedSegs = r.segs; sfx.speedUp(); const life = segsEnd(speedSegs, time) - time + .4;
    speedTag = addTag('speed', 'speed', name, () => segLine(speedSegs, s => `把传送带调到 ${s.val} 倍速`, nx => `${nx.val} 倍速`), new THREE.Vector3(BELT.x0 + 3.6, BELT.top + 1.85, BELT.z), 0, life);
    speedTag.nameFn = () => (segAt(speedSegs, time) || speedTag).name; speedTag.life = life; return Math.round(r.added);
  }
  if (type === 'strip') {
    const n = Math.min(20, amount);
    const c = boxes.filter(b => b.st === 'free' && !b.big && !b.stripped).sort(() => Math.random() - .5); let done = 0, first = null;
    for (const b of c) { if (done >= n) break; stripBox(b, name, T.scan); first = first || b; done++; }
    for (let i = done; i < n && pendingStrip.length < 20; i++) pendingStrip.push({ name, scan: T.scan });
    if (done) sfx.rip();
    addTag('strip:' + name, 'strip', name, k => isGarbage() ? `给 ${k} 件垃圾糊上了泥` : `撕掉了 ${k} 件面单`, first ? () => first.st === 'gone' ? null : first.mesh.position.clone().add(new THREE.Vector3(0, 1.1, 0)) : new THREE.Vector3(BELT.x0 + 2.6, BELT.top + 1.65, BELT.z), n); return n;
  }
  const count = amount;
  if (type === 'tape') {
    const n = Math.min(30, amount);
    const c = boxes.filter(b => b.st === 'free' && !b.big && b.tape === 0).sort(() => Math.random() - .5); let done = 0, first = null;
    for (const b of c) { if (done >= n) break; wrapTape(b, name, T.layers); first = first || b; done++; }
    for (let i = done; i < n && pendingTape.length < 30; i++) pendingTape.push({ name, layers: T.layers });
    if (done) sfx.tapeOn();
    addTag('tape:' + name, 'tape', name, k => isGarbage() ? `给 ${k} 件套了塑料袋` : `给 ${k} 件缠了胶带`, first ? () => first.st === 'gone' ? null : first.mesh.position.clone().add(new THREE.Vector3(0, 1.1, 0)) : new THREE.Vector3(BELT.x0 + 2.6, BELT.top + 1.65, BELT.z), n); return n;
  }
  if (type === 'kick') { const k = Math.min(3, amount); for (let i = 0; i < k && kickQueue.length < 6; i++) kickQueue.push({ name, loss: T.loss, power: T.power }); return k; }
  if (type === 'audit') {
    const r = pushSeg(auditSegs, time, Math.min(EFF.audit.max, amount), T.mult, name, 90); if (!r.added) return 0;
    auditSegs = r.segs; sfx.audit(); const life = segsEnd(auditSegs, time) - time + .4;
    const t = addTag('audit', 'audit', name, () => segLine(auditSegs, s => `发起了${effLabel('audit', S.mode)} · 分错 ×${Math.max(s.val, S.play.mult)}`, nx => `×${Math.max(nx.val, S.play.mult)}`), () => { const a = bins[0], z = bins[bins.length - 1]; return new THREE.Vector3((a.x + z.x) / 2, BASE + BIN.h + 2.4, a.z); }, 0, life);
    t.nameFn = () => (auditNow() || t).name; t.life = life; return Math.round(r.added);
  }
  if (type === 'prank') {
    const n = Math.min(EFF.prank.max, amount);
    if (prankDrone.st !== 'gone' && prankDrone.st !== 'out' && prankDrone.name === name) { prankDrone.need += n; prankDrone.plan += n; if (prankDrone.tag) prankDrone.tag.life = 3.6; return n; }
    const q = prankQueue.find(h => h.name === name); if (q) { q.count += n; q.speed = Math.max(q.speed, T.speed); } else prankQueue.push({ name, count: n, speed: T.speed }); return n;
  }
  if (type === 'tricky') return trickyGift(name, amount);
  if (type === 'help') {
    const n = Math.min(40, amount);
    if (drone.st !== 'gone' && drone.st !== 'out' && drone.name === name) { drone.need += n; drone.plan = Math.min(drone.need, drone.done + available()); if (drone.tag) drone.tag.life = 3.6; return n; }
    const q = helpQueue.find(h => h.name === name); if (q) { q.count += n; q.speed = Math.max(q.speed, T.speed); } else helpQueue.push({ name, count: n, speed: T.speed }); return n;
  }
  return 0;
}

/* ================= 新互动：封筐 / 漏筐 / 撕面单 / 盲盒 ================= */
const lidMat = new THREE.MeshStandardMaterial({ map: plainTex(), roughness: .85, bumpMap: BUMP, bumpScale: .6 });
function sealBin(bin, name, dur, hits = tierOf(S.tiers, 'seal').hits) {
  if (bin.seal) { const s = bin.seal, h = clamp(Math.round(hits), 1, 50); s.until = Math.min(time + 60, s.until + dur); s.tag.life = s.until - time + .5; if (h > s.need) { s.need = h; s.tag.name = name; s.tag.el.querySelector('b').textContent = name; } return; }
  const g = new THREE.Group(); const { w, d, h } = BIN;
  const lid = mesh(RB(w + .16, .09, d + .12, .03), lidMat); g.add(lid);
  const strips = [];
  for (const [rz, s] of [[.62, 1], [-.62, -1], [0, 0]]) { const st = mesh(new THREE.BoxGeometry(Math.hypot(w, d) * (s ? 1 : .0) + (s ? 0 : w + .2), .02, .3), M.hazard, false); st.position.y = .06; st.rotation.y = s ? Math.atan2(d, w) * s : 0; if (!s) st.scale.set(1, 1, 1); g.add(st); strips.push(st); }
  g.position.set(0, h + .09, 0); g.scale.setScalar(.2); bin.g.add(g);
  const col = world.createCollider(RAPIER.ColliderDesc.cuboid((w + .16) / 2, .06, (d + .12) / 2).setTranslation(0, h + .1, 0).setFriction(.4), bin.body);
  g.traverse(o => { if (o.isMesh) o.userData.lid = bin; });
  const tag = addTag('seal:' + bin.i, 'seal', name, () => `封了${binWord(bin.i)} · ${Math.max(0, Math.ceil((bin.seal?.until ?? 0) - time))}s · 连点 ${Math.max(0, (bin.seal?.need ?? 0) - (bin.seal?.clicks ?? 0))} 下撕开`, binAnchor(bin), 0, dur + .5);
  tag.name = name; tag.el.querySelector('b').textContent = name;
  bin.seal = { g, col, strips, until: time + dur, clicks: 0, need: clamp(Math.round(hits), 1, 50), tag, pop: 0, t: 0 };
  sfx.tapeOn(); bin.pulse = 1;
}
function unseal(bin, silent) {
  const s = bin.seal; if (!s) return; bin.seal = null;
  world.removeCollider(s.col, true); s.tag.life = Math.min(s.tag.life, .4);
  if (silent) { bin.g.remove(s.g); return; }
  // 盖板掀飞
  const wp = new THREE.Vector3(); s.g.getWorldPosition(wp); bin.g.remove(s.g); s.g.position.copy(wp); s.g.scale.setScalar(1); scene.add(s.g);
  flyers.push({ o: s.g, v: new THREE.Vector3(rnd(-2, 2), 7, rnd(2, 4)), r: new THREE.Vector3(rnd(-4, 4), rnd(-3, 3), rnd(-4, 4)), life: 0 });
  sfx.rip(); sfx.thump(); burst('shred', wp, 10);
  for (const b of boxes) { if (b.st !== 'free') continue; const p = b.body.translation(); if (Math.abs(p.x - bin.x) < BIN.w / 2 + .2 && Math.abs(p.z - bin.z) < BIN.d / 2 + .2 && p.y > BASE + BIN.h - .1) b.body.wakeUp(); }
}
function updSeal(bin, dt) {
  const s = bin.seal; if (!s) return; s.t += dt;
  const k = Math.min(1, s.t / .35); s.g.scale.setScalar(.2 + .8 * (k < 1 ? 1 - Math.pow(1 - k, 3) * (1 - k) : 1) + Math.sin(k * Math.PI) * .12); s.g.position.y = BIN.h + .09 + (1 - k) * 1.2;
  s.pop = Math.max(0, s.pop - dt * 5); s.g.rotation.z = Math.sin(time * 60) * s.pop * .03;
  if (time >= s.until || s.clicks >= s.need) unseal(bin);
}
function hitSeal(bin) { const s = bin.seal; if (!s) return; s.clicks++; s.pop = 1; sfx.rip(); burst('shred', new THREE.Vector3(bin.x + rnd(-.8, .8), BASE + BIN.h + .2, bin.z + rnd(-.5, .5)), 5); const st = s.strips[s.clicks % s.strips.length]; if (st) st.scale.x = Math.max(.15, st.scale.x - .3); }
function leakBin(bin, name, dur, hits = tierOf(S.tiers, 'leak').hits) {
  if (bin.leak) { const l = bin.leak, h = clamp(Math.round(hits), 1, 50); l.until = Math.min(time + 60, l.until + dur); l.tag.life = l.until - time + .5; if (h > l.need) { l.need = h; l.tag.name = name; l.tag.el.querySelector('b').textContent = name; } return; }
  bin.bottom.setEnabled(false); if (bin.gate) bin.gate.setEnabled(false);
  const tag = addTag('leak:' + bin.i, 'leak', name, () => `把${binWord(bin.i)}底捅漏了 · ${Math.max(0, Math.ceil((bin.leak?.until ?? 0) - time))}s · 点 ${Math.max(0, (bin.leak?.need ?? 0) - (bin.leak?.clicks ?? 0))} 下修好`, binAnchor(bin), 0, dur + .5);
  tag.name = name; tag.el.querySelector('b').textContent = name;
  bin.leak = { t0: time, until: time + dur, clicks: 0, need: clamp(Math.round(hits), 1, 50), tag }; bin.jolt = 1; sfx.kick();
  for (const b of boxes) if (b.st === 'deliver' && inBinZone(b.body.translation()) === bin) b.body.wakeUp();
}
function unleak(bin, silent) { const l = bin.leak; if (!l) return; bin.leak = null; bin.bottom.setEnabled(true); if (bin.gate) bin.gate.setEnabled(true); l.tag.life = Math.min(l.tag.life, .4); if (!silent) { sfx.land(10); bin.pulse = 1; burst('conf', new THREE.Vector3(bin.x, BASE + .3, bin.z + BIN.d / 2), 6, { sp: .6 }); } }
function updLeak(bin, dt) { const l = bin.leak; if (!l) return; if (time >= l.until || l.clicks >= l.need) unleak(bin); }
function hitLeak(bin) { const l = bin.leak; if (!l) return; l.clicks++; bin.jolt = .6; tone(1800, .05, 'square', .04); noise(.08, .1, 3000); burst('conf', new THREE.Vector3(bin.x + rnd(-1, 1), BASE + .1, bin.z + BIN.d / 2), 5, { sp: .8 }); }
const flyers = [];
function updFlyers(dt) { for (let i = flyers.length - 1; i >= 0; i--) { const f = flyers[i]; f.life += dt; f.v.y -= 20 * dt; f.o.position.addScaledVector(f.v, dt); f.o.rotation.x += f.r.x * dt; f.o.rotation.y += f.r.y * dt; f.o.rotation.z += f.r.z * dt; if (f.life > 1.6 || f.o.position.y < -3) { scene.remove(f.o); flyers.splice(i, 1); } } }

/* ---------- 撕面单与扫码台 ---------- */
let stripMats = null;
function getStripMats() {
  if (stripMats) return stripMats;
  const c = cvs(512, 368), g = c.getContext('2d'); cardBase(g, 512, 368);
  g.fillStyle = 'rgba(250,246,238,.85)'; g.beginPath(); g.moveTo(30, 140); g.lineTo(150, 128); g.lineTo(138, 170); g.lineTo(180, 196); g.lineTo(120, 230); g.lineTo(40, 214); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(300, 250); g.lineTo(380, 240); g.lineTo(372, 300); g.lineTo(320, 292); g.closePath(); g.fill();
  g.fillStyle = 'rgba(80,50,25,.25)'; g.fillRect(230, 0, 60, 60);
  g.fillStyle = '#fff'; g.beginPath(); g.arc(256, 184, 92, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#26190e'; g.lineWidth = 8; g.stroke();
  g.fillStyle = '#26190e'; g.font = `900 130px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('?', 256, 190);
  const side = new THREE.MeshStandardMaterial({ map: tex(c), roughness: .86, bumpMap: BUMP, bumpScale: .8 }), plain = new THREE.MeshStandardMaterial({ map: plainTex(), roughness: .86, bumpMap: BUMP, bumpScale: .8 });
  stripMats = [side, side, plain, plain, side, side]; return stripMats;
}
/* 撕面单（快递）/ 糊泥（垃圾）：垃圾的每个子网格换成泥材质，识别后换回；塑料袋层不糊泥 */
function setMud(b, on) {
  b.mesh.traverse(o => { if (!o.isMesh || o.userData.layer) return; if (on) { if (!o.userData.mat0) o.userData.mat0 = o.material; o.material = kit.mudMaterial; } else if (o.userData.mat0) { o.material = o.userData.mat0; o.userData.mat0 = null; } });
}
function stripBox(b, name, scan = tierOf(S.tiers, 'strip').scan) { thawBox(b); b.stripped = true; b.stripBy = name; b.scanT = 0; b.scanNeed = scan; if (b.kind === 'garbage') setMud(b, true); else b.mesh.material = getStripMats(); b.wig = 1; burst('shred', b.mesh.position, 8); }
function reveal(b) { b.stripped = false; if (b.kind === 'garbage') setMud(b, false); else b.mesh.material = b.mats; sfx.scanOk(); burst('conf', b.mesh.position, 8, { sp: .6 }); b.wig = 1; }
const scanner = new THREE.Group(); scene.add(scanner); scanner.position.set(SCAN.x, 0, SCAN.z);
const scanGlow = new THREE.MeshStandardMaterial({ color: 0xff4636, emissive: 0xff2a1a, emissiveIntensity: 1.2, transparent: true, opacity: .9, roughness: .2 });
{
  if (STAGE.id === 'classic') { const base = mesh(RB(1.25, SCAN.top - .06, 1.25, .08), M.graphite); base.position.y = (SCAN.top - .06) / 2; scanner.add(base); }
  const pad = mesh(RB(1.05, .06, 1.05, .03), scanGlow, false); pad.position.y = SCAN.top - .03; scanner.add(pad);
  const post = mesh(RB(.1, 1.1, .1, .03), M.steel); post.position.set(-.5, SCAN.top + .55, -.5); scanner.add(post);
  const head = mesh(RB(.7, .12, .22, .04), M.graphite2); head.position.set(-.2, SCAN.top + 1.1, -.5); head.rotation.y = -.78; scanner.add(head);
  const beam = new THREE.Mesh(new THREE.PlaneGeometry(.9, .02), new THREE.MeshBasicMaterial({ color: 0xff3b2f, transparent: true, opacity: .8, depthWrite: false })); beam.rotation.x = -Math.PI / 2; beam.position.y = SCAN.top + .02; scanner.add(beam); scanner.userData.beam = beam; beam.userData.keep = true;
  world.createCollider(RAPIER.ColliderDesc.cuboid(.62, SCAN.top / 2, .62).setTranslation(SCAN.x, SCAN.top / 2, SCAN.z).setFriction(.8), fixedBody);
}
function nearScan(p) { return Math.hypot(p.x - SCAN.x, p.z - SCAN.z) < .75; }
let scanBeep = 0;
function updScan(h, dt) { const b = h.b; if (!b.stripped) return; if (nearScan(h.pos)) { b.scanT += dt; if (time - scanBeep > .18) { scanBeep = time; tone(1500, .04, 'square', .03); } if (b.scanT >= (b.scanNeed || .7)) reveal(b); } else b.scanT = Math.max(0, b.scanT - dt * 2); }
function updScanner(dt) {
  const any = boxes.some(b => b.stripped);
  const beam = scanner.userData.beam; beam.position.z = Math.sin(time * 5) * .4; scanGlow.emissiveIntensity = (any ? 1.4 : .5) + Math.sin(time * 6) * .3;
  for (const b of boxes) { if (!b.stripped || b.st !== 'free') continue; const p = b.body.translation(); if (nearScan(p) && p.y < SCAN.top + .9) { b.scanT += dt; if (b.scanT >= (b.scanNeed || .7)) reveal(b); } }
  const el = $('scanTag'); if (el) { el.style.display = any ? 'flex' : 'none'; const sp = toScreen(new THREE.Vector3(SCAN.x, SCAN.top + 1.5, SCAN.z)); el.style.transform = `translate(${sp.x}px,${sp.y}px) translate(-50%,-100%) scale(${tagK})`; }
}

/* ---------- 爆箱盲盒 ---------- */
const blindPool = new RefCache(name => blindMats(name), m => { for (const mm of new Set(m)) { mm.map.dispose(); mm.dispose(); } });
function blindMats(name) {
  const c = cvs(512, 346), g = c.getContext('2d'); cardBase(g, 512, 346);
  const cols = ['#e2503f', '#f2ae1c', '#2d84d8', '#7a5bd0', '#2fae82'];
  for (let i = 0; i < 9; i++) { g.save(); g.translate(rnd(40, 470), rnd(40, 300)); g.rotate(rnd(-.5, .5)); g.fillStyle = cols[i % 5]; g.beginPath(); g.arc(0, 0, rnd(20, 34), 0, Math.PI * 2); g.fill(); g.fillStyle = '#fff'; g.font = `900 36px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('?', 0, 2); g.restore(); }
  g.save(); g.translate(256, 176); g.rotate(-.06); g.fillStyle = '#26190e'; rr(g, -170, -58, 340, 116, 18); g.fill(); g.fillStyle = '#ffd24a'; g.font = `900 70px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('爆箱盲盒', 0, -6); g.fillStyle = '#fff'; g.font = `700 26px ${FONT}`; g.fillText(fitText(g, (name || '今日快件') + (name ? ' 寄' : ''), 300), 0, 40); g.restore();
  const side = new THREE.MeshStandardMaterial({ map: tex(c), roughness: .8, bumpMap: BUMP, bumpScale: .8 });
  const tc = cvs(512, 512), tg = tc.getContext('2d'); cardBase(tg, 512, 512); tapeStrip(tg, 0, 200, 512, 112, 0, false); tapeStrip(tg, 200, 0, 112, 512, 1, true); tg.fillStyle = '#26190e'; tg.font = `900 120px ${FONT}`; tg.textAlign = 'center'; tg.textBaseline = 'middle'; tg.fillText('?', 256, 262);
  const top = new THREE.MeshStandardMaterial({ map: tex(tc), roughness: .8, bumpMap: BUMP, bumpScale: .8 });
  return [side, side, top, top, side, side];
}
function hitBlind(b) {
  b.hits++; b.wig = 1; sfx.thump(); tone(300 + b.hits * 120, .08, 'triangle', .06); burst('shred', b.mesh.position, 4);
  b.body.applyImpulse({ x: 0, y: b.body.mass() * 1.6, z: 0 }, true);
  if (b.hits >= clamp(Math.round(b.blindHits || tierOf(S.tiers, 'blind').hits), 1, 30)) explodeBlind(b);
}
function explodeBlind(b) {
  for (const o of restingPool.near(b.mesh.position, 3.2).slice(0,80)) thawBox(o);
  const p = b.body.translation(), n = b.blind, name = b.name; b.blind = 0; removeBox(b);
  sfx.heavy(); tone(900, .25, 'triangle', .08, 1800); shake = Math.max(shake, .8);
  burst('conf', p, 26, { sp: 1.6 }); burst('dust', p, 14, { r: 1.5, s: 1.4 });
  const back = STAGE.id === 'counter';
  for (let i = 0; i < n; i++) { const a = back ? rnd(Math.PI * 1.04, Math.PI * 1.96) : Math.random() * Math.PI * 2, sp = back ? rnd(1.5, 4.2) : rnd(3, 7); const nb = spawnItem({ ...randomItem(), name, pos: { x: p.x + Math.cos(a) * rnd(0, .6), y: p.y + rnd(.2, 1.2), z: p.z + Math.sin(a) * rnd(0, .6) }, vel: { x: Math.cos(a) * sp, y: rnd(6, 11), z: Math.sin(a) * sp }, ang: { x: rnd(-8, 8), y: rnd(-8, 8), z: rnd(-8, 8) } }); nb.born = time; nb.launchedAt = time; }
  for (const o of boxes) { if (o.st !== 'free') continue; const q = o.body.translation(); const d = Math.hypot(q.x - p.x, q.z - p.z); if (d < 2.5) { const m = o.body.mass(), pz = (q.z - p.z) / (d || 1) * m * 3; o.body.applyImpulse({ x: (q.x - p.x) / (d || 1) * m * 3, y: m * 5, z: back ? Math.min(0, pz) : pz }, true); o.launchedAt = time; } }
  addTag('boom:' + name + ':' + Math.floor(time), 'blind', name || (isGarbage() ? '分类站' : '快递站'), () => `的${isGarbage() ? '大垃圾袋' : '盲盒'}炸出 ${n} 件`, new THREE.Vector3(p.x, p.y + 2.2, p.z), 0, 3);
}


/* ---------- 踹一脚 ---------- */
function kick(k) {
  if (restingPool.size) for (const b of boxes.filter(b => b.dormant && onTable(b.mesh.position)).sort((a,b)=>b.mesh.position.y-a.mesh.position.y).slice(0,80)) thawBox(b);
  const name = k.name, pw = k.power ?? 1; shake = 1.2 * Math.min(1.4, pw); tableShake = Math.min(1.4, pw); sfx.kick(); let lost = 0;
  burst('dust', new THREE.Vector3((TABLE.x0 + TABLE.x1) / 2, TABLE.top, TABLE.z1), 14, { r: 5, s: 1.4 });
  for (const b of boxes) {
    if (b.st !== 'free') continue; const p = b.body.translation(); const m = b.body.mass();
    if (onTable(p)) {
      const off = !b.big && Math.random() < (k.loss ?? 30) / 100;
      b.body.applyImpulse({ x: m * rnd(-2.5, 2.5) * pw, y: m * rnd(6, 10) * (b.big ? .6 : 1) * pw, z: (off ? m * rnd(5, 7.5) : m * rnd(-2, 2.5)) * pw }, true);
      b.body.applyTorqueImpulse({ x: m * rnd(-.6, .6), y: m * rnd(-.6, .6), z: m * rnd(-.6, .6) }, true); b.launchedAt = time;
      if (off) lost++;
    } else if (b.onBelt) b.body.applyImpulse({ x: 0, y: m * rnd(2, 4), z: 0 }, true);
  }
  addTag('kick:' + name + ':' + Math.floor(time), 'kick', name, () => lost ? `踹了一脚桌子（踹掉 ${lost} 件）` : '踹了一脚桌子', tableAnchor(2.68), 1);
}

/* ---------- 超大件 ---------- */
const ringGeo = new THREE.RingGeometry(.7, 1.0, 48);
function surfaceY(x, z) { const ray = new RAPIER.Ray({ x, y: 12, z }, { x: 0, y: -1, z: 0 }); const hit = world.castRay(ray, 20, true, undefined, SCENE_QUERY, undefined, held ? held.body : undefined); return hit ? 12 - hit.timeOfImpact : 0; }
let bigT = 0;
function updBig(dt) {
  bigT -= dt;
  const present = boxes.filter(b => b.big && b.st !== 'deliver').length + warns.length;
  if (bigQueue.length && bigT <= 0 && present < 3 && state !== 'fail' && activeRoom() >= bigQueue[0].n) {
    const it = bigQueue.shift(); const x = rnd(TABLE.x0 + 1.4, TABLE.x1 - 1.3), z = rnd(TABLE.z0 + 1.0, TABLE.z1 - 1.0);
    const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xff7a3a, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide })); m.rotation.x = -Math.PI / 2; m.renderOrder = 3; scene.add(m);
    warns.push({ ...it, x, z, t: 0, m }); bigT = 1.0; sfx.whistle();
  }
  for (let i = warns.length - 1; i >= 0; i--) {
    const w = warns[i]; w.t += dt; const y = surfaceY(w.x, w.z) + .03; w.m.position.set(w.x, y, w.z);
    const k = Math.min(1, w.t / .55); w.m.material.opacity = .25 + .55 * k; w.m.scale.setScalar(1.6 - .6 * k + Math.sin(w.t * 30) * .03);
    if (w.t >= .55) {
      scene.remove(w.m); warns.splice(i, 1);
      const b = spawnItem({ kind: isGarbage() ? 'garbage' : 'box', color: w.color, name: w.name, big: true, blind: w.n, pos: { x: w.x, y: spawnHeight(w.x, w.z, 13), z: w.z }, vel: { x: 0, y: -16, z: 0 }, ang: { x: rnd(-.6, .6), y: rnd(-1, 1), z: rnd(-.6, .6) } });
      b.falling = true; b.blindHits = w.hits;
      const t = tags.find(t => t.key === 'blind:' + w.name && t.life > 0); if (t) { t.anchor = () => b.st === 'gone' ? null : b.mesh.position.clone().add(new THREE.Vector3(0, 1.4, 0)); t.life = Math.max(t.life, 2.8); }
    }
  }
}
function bigImpact(b) {
  for (const o of restingPool.near(b.mesh.position, 3.2).slice(0,80)) thawBox(o);
  b.falling = false; const p = b.body.translation(); sfx.heavy(); shake = Math.max(shake, 1); tableShake = Math.max(tableShake, .7);
  // 重袋子 / 大箱子落地是「砸」：横向速度和转动大部分吃掉，砸在货堆上也不会顺势滑出台边
  const v = b.body.linvel(), w = b.body.angvel(); b.body.setLinvel({ x: v.x * .15, y: Math.min(v.y, .5), z: v.z * .15 }, true); b.body.setAngvel({ x: w.x * .2, y: w.y * .2, z: w.z * .2 }, true);
  b.body.setLinearDamping(.3); b.body.setAngularDamping(1.6);
  burst('dust', p, 18, { r: 2.2, s: 1.6, sp: 1.3 });
  for (const o of boxes) { if (o === b || o.st !== 'free') continue; const q = o.body.translation(); const dx = q.x - p.x, dz = q.z - p.z, d = Math.hypot(dx, dz); if (d > 3.2) continue; const m = o.body.mass(), f = (1 - d / 3.2); o.body.applyImpulse({ x: dx / (d || 1) * m * 4 * f, y: m * rnd(5, 8) * f, z: dz / (d || 1) * m * 4 * f }, true); o.body.applyTorqueImpulse({ x: m * rnd(-.4, .4), y: 0, z: m * rnd(-.4, .4) }, true); }
}

/* ---------- 小助手 ---------- */
function available() { let n = supply; for (const b of boxes) if (b.st === 'free' && !b.big) n++; return n; }
function dtw(d, x, y, z, dur, cb) { const p = d.g.position; d.tw = { f: p.clone(), t: new THREE.Vector3(x, y, z), k: 0, dur: dur / (d.speed || 1), cb }; }
function droneOut(d) { d.st = 'out'; dtw(d, d.g.position.x < 0 ? -15 : 15, 9, -2, .7, () => { d.st = 'gone'; d.g.visible = false; }); }
function pickDroneTarget() {
  const free = boxes.filter(b => b.st === 'free' && !b.big && !bins[b.cat].seal && !bins[b.cat].leak).map(b => ({b,p:b.dormant?b.mesh.position:b.body.translation()})).filter(o => !inBinZone(o.p));
  free.sort((a,b) => (onTable(a.p)?0:a.b.onBelt?1:2)-(onTable(b.p)?0:b.b.onBelt?1:2) || b.p.y-a.p.y);
  return free.find(o => !pinned(o.b))?.b || null;
}
/* 捣乱无人机只抓已识别、没缠胶带/没套袋、没被压住、不在筐里的普通件；优先台面，其次传送带、堆货台、地上 */
function pickPrankTarget() {
  const free = boxes.filter(b => b.st === 'free' && !b.big && !b.blind && !b.stripped && !b.tape).map(b=>({b,p:b.dormant?b.mesh.position:b.body.translation()})).filter(o=>!inBinZone(o.p));
  const rank = o => onTable(o.p)?0:o.b.onBelt?1:onDock(o.p)?2:3;
  free.sort((a,b)=>rank(a)-rank(b)||b.p.y-a.p.y);
  return free.find(o=>!pinned(o.b))?.b || null;
}
/* 丢进哪个错筐：优先没封、没漏的；都不行就随便一个错筐（会被盖板挡回来） */
function wrongBinFor(b) {
  const wrong = bins.filter(x => x.i !== b.cat), ok = wrong.filter(x => !x.seal && !x.leak && !x.move);
  const list = ok.length ? ok : wrong; return list[Math.floor(Math.random() * list.length)];
}
function updDrone(d, dt) {
  const g = d.g; d.prop.rotation.y += dt * 40;
  const blink = (time % 3.3) < .12 ? .15 : 1; for (const e of d.eyes) e.scale.y = 1.35 * blink;
  if (d.tw) {
    const w = d.tw; w.k += dt; const k = eIO(Math.min(1, w.k / w.dur)); g.position.lerpVectors(w.f, w.t, k); g.position.y += Math.sin(k * Math.PI) * .6;
    const vx = (w.t.x - w.f.x) / w.dur; g.rotation.z = lerp(g.rotation.z, -vx * .03, .2);
    if (w.k >= w.dur) { d.tw = null; w.cb && w.cb(); }
  } else { g.position.y += Math.sin(time * 5) * .004; g.rotation.z *= .9; }
  if (d.carry) { const c = d.carry; const p = g.position; c.body.setNextKinematicTranslation({ x: p.x, y: p.y - .62 - c.dims[1] / 2, z: p.z }); c.body.setNextKinematicRotation(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.sin(time * 3) * .15, Math.sin(time * 4) * .06))); }
  if (d.tw) return;
  const prank = d.kind === 'prank';
  if (d.st === 'gone') {
    const q = prank ? prankQueue : helpQueue;
    if (!q.length || state === 'fail') return; const h = q.shift();
    d.name = h.name; d.need = h.count; d.done = 0; d.speed = h.speed || 1; d.plan = prank ? h.count : Math.min(h.count, available());
    d.st = 'in'; g.visible = true; g.position.set(d.home, 8, 1); prank ? sfx.prank() : sfx.robot();
    d.tag = prank
      ? addTag('prank:' + h.name + ':' + time, 'prank', h.name, () => `的捣乱无人机来了 · 丢错 ${d.plan} 件`, () => g.visible ? g.position.clone().add(new THREE.Vector3(0, 1.1, 0)) : null, 0, 4)
      : addTag('help:' + h.name + ':' + time, 'help', h.name, () => d.plan > 0 ? `帮收 ${d.plan} 件` : '来帮忙了，台面已经空了', () => g.visible ? g.position.clone().add(new THREE.Vector3(0, 1.1, 0)) : null, 0, 4);
    dtw(d, prank ? 2.5 : -2.5, 4.6, .2, .7, () => { d.st = 'work'; }); return;
  }
  if (d.st !== 'work') return;
  if (d.tag) d.tag.life = Math.max(d.tag.life, 1.4);
  if (d.done >= d.plan) { droneOut(d); return; }
  const b = prank ? pickPrankTarget() : pickDroneTarget();
  if (!b && prank) { d.waitT = d.waitT || time; if (time - d.waitT < 8) return; }   // 刚开局台上还没东西：捣乱无人机先盘旋等一会儿
  d.waitT = 0;
  if (!b) { if (prank && d.done === 0) addTag('prank-none:' + d.name, 'prank', d.name, () => '的捣乱无人机没找到能抓的件，走了', () => g.visible ? g.position.clone().add(new THREE.Vector3(0, 1.1, 0)) : null, 0, 2.6); d.plan = d.done; droneOut(d); return; }
  thawBox(b, true); const p = b.body.translation(); b.st = 'robot';
  b.body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
  dtw(d, p.x, p.y + b.dims[1] / 2 + .62, p.z, .32, () => {
    d.carry = b; sfx.zip();
    if (!prank) { if (b.tape > 0) { while (b.tape > 0) tear(b); } if (b.stripped) reveal(b); }
    const bin = prank ? wrongBinFor(b) : bins[b.cat];
    dtw(d, bin.x, 4.2, bin.z, prank ? .62 : .5, () => {
      d.carry = null; b.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true); b.body.setLinvel({ x: 0, y: -1, z: 0 }, true); b.st = 'free'; b.launchedAt = time; d.done++; if (prank) b.prankBy = d.name;
      if (prank) { sfx.prank(); const what = itemName(b), where = binWord(bin.i); addTag('prank-drop:' + b.id + ':' + Math.round(time * 10), 'prank', d.name, () => `的捣乱无人机把${what}丢进了${where}`, binAnchor(bin), 0, 3); }
    });
  });
}

/* ---------- 货车 ---------- */
function updTruck(dt) {
  const T = truck, g = T.g;
  const setX = ns => { const dx = ns - T.s; T.s = ns; g.position.copy(truckAt(ns)); for (const w of T.wheels) w.rotation.z -= dx / .52; };
  if (T.st === 'gone') { if (T.batches.length && state !== 'fail') { T.st = 'in'; T.t = 0; T.name = T.batches[0].name; drawTruckSide(T.name); sfx.truck(); } }
  else if (T.st === 'close' && T.batches.length) { T.st = 'open'; T.t = T.door * .3; }
  else {
    T.t += dt;
    if (T.st === 'in') { const k = eOut(Math.min(1, T.t / 1.0)); setX(lerp(14, 0, k)); if (T.t >= 1) { T.st = 'open'; T.t = 0; shake = Math.max(shake, .25); } }
    else if (T.st === 'open') { T.door = Math.min(1, T.t / .3); if (T.t >= .3) { T.st = 'unload'; T.t = 0; T.unT = 0; } }
    else if (T.st === 'unload') {
      T.unT = T.batches.length && state !== 'fail' ? T.unT + dt : 0;
      while (T.unT >= .2 && T.batches.length) {
        if (activeRoom() < 1) { T.unT = 0; break; }
        T.unT -= .2; const bt = T.batches[0]; if (T.name !== bt.name) { T.name = bt.name; drawTruckSide(bt.name); }
        const slot = freeSlot();
        if (slot) {
          const q = g.position.clone().addScaledVector(TDIR, -.2).add(new THREE.Vector3(rnd(-.5, .5), 0, 0)); q.y = 1.9;
          const it = (bt.items && bt.items.shift()) || randomItem(); const b = spawnItem({ ...it, name: bt.name, pos: { x: q.x, y: q.y, z: q.z } });
          b.st = 'unload'; b.body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true); b.body.collider(0).setEnabled(false); slotOcc.set(slot.key, b);
          unloads.push({ b, apex: Math.max(1.2, DOCK.top + 3.3 - Math.max(q.y, slot.y)), t: 0, dur: .6, f: q.clone(), to: new THREE.Vector3(slot.x, slot.y + .015, slot.z), q0: new THREE.Quaternion().setFromEuler(new THREE.Euler(rnd(-.5, .5), rnd(-.8, .8), rnd(-.5, .5))), q1: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rnd(-.03, .03), 0)) });
          b.fromTruck = true; if (it?.tape) wrapTape(b, ''); else if (it?.strip) stripBox(b, ''); else if (pendingTape.length) { const q = pendingTape.shift(); wrapTape(b, q.name, q.layers); } else if (pendingStrip.length) { const q = pendingStrip.shift(); stripBox(b, q.name, q.scan); }
          bt.left--; sfx.thump();
        } else { T.unT = 0; break; }
        if (bt.left <= 0) T.batches.shift();
      }
      if (!T.batches.length) { if (T.t > .5 + T.unT) { T.st = 'close'; T.t = 0; } } else T.t = 0;
    }
    else if (T.st === 'close') { T.door = 1 - Math.min(1, T.t / .3); if (T.t >= .3) { T.st = 'out'; T.t = 0; } }
    else if (T.st === 'out') { const k = Math.min(1, T.t / .9); setX(lerp(0, 14, k * k)); if (T.t >= .9) { T.st = 'gone'; T.door = 0; } }
  }
  for (const d of T.doors) d.piv.rotation.y = d.s * T.door * 1.75;
  const alpha = T.st === 'gone' ? 0 : clamp((14 - T.s) / 3.5, 0, 1); g.visible = alpha > .01; setTruckAlpha(alpha);
  T.body.setNextKinematicTranslation({ x: g.position.x, y: g.position.y, z: g.position.z });
  const on = T.st !== 'gone'; if (T.bodyOn !== on) { T.bodyOn = on; T.body.setEnabled(on); }
  const rem = T.batches.reduce((n, bt) => n + bt.left, 0);
  if (T.st === 'gone') T.loadMax = 0; else T.loadMax = Math.max(T.loadMax, rem);
  const show = T.loadMax ? Math.ceil(T.cargo.length * rem / T.loadMax) : 0;
  T.cargo.forEach((o, i) => { o.visible = i >= T.cargo.length - show; });
}

/* ================= 拿起与投递 ================= */
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
const ptr = { x: 0, y: 0, has: false, id: null };
function ptrRay(sx, sy) { setNdc(sx, sy); ray.setFromCamera(ndc, camera); return ray.ray; }
/* 柜台布局（正面镜头）拿着东西时：东西一直在鼠标下面（取鼠标射线上的一点），深度按鼠标指着哪一片定——
   指着桶这一排（射线在桶那一层的高度低于台面）就停在桶上方，松手落进桶；否则停在柜台中线上，松手落到台面上 */
function counterAim(sx, sy, big) {
  const r = ptrRay(sx, sy), at = z => { if (Math.abs(r.direction.z) < 1e-4) return null; const t = (z - r.origin.z) / r.direction.z; return t > 0 ? r.origin.clone().addScaledVector(r.direction, t) : null; };
  const lift = big ? .8 : .5, onBins = at(bins.length ? bins[0].z : TABLE.z1 + 1);
  if (onBins && onBins.y < TABLE.top + .15) { onBins.y = Math.max(onBins.y, BASE + BIN.h + lift); return onBins; }
  const mid = at((TABLE.z0 + TABLE.z1) / 2); if (!mid) return null; mid.y = Math.max(mid.y, TABLE.top + lift + .35); return mid;
}
function ptrWorld(sx, sy, y) { setNdc(sx, sy); ray.setFromCamera(ndc, camera); const pl = new THREE.Plane(new THREE.Vector3(0, 1, 0), -y); const out = new THREE.Vector3(); return ray.ray.intersectPlane(pl, out) ? out : null; }
function pickAt(sx, sy) {
  setNdc(sx, sy); ray.setFromCamera(ndc, camera);
  if (restingPool.size) {
    const hit = world.castRay(new RAPIER.Ray(ray.ray.origin, ray.ray.direction), camera.far, true, undefined, undefined, undefined, undefined, c => c.parent()?.userData?.box?.st === 'free');
    return hit?.collider.parent()?.userData?.box || null;
  }
  const hits = ray.intersectObjects(boxes.filter(b => b.st === 'free').map(b => b.mesh), true);
  for (const h of hits) { let o = h.object; while (o && !o.userData.box) o = o.parent; if (o) return o.userData.box; }
  return null;
}
function pickBinAt(sx, sy) {
  setNdc(sx, sy); ray.setFromCamera(ndc, camera);
  const hits = ray.intersectObjects(bins.map(b => b.g), true);
  for (const h of hits) { const lid = h.object.userData.lid, bin = h.object.userData.bin; if (lid && lid.seal) return { bin: lid, kind: 'seal' }; if (bin && bin.seal) return { bin, kind: 'seal' }; if (bin && bin.leak) return { bin, kind: 'leak' }; }
  return null;
}
function clickTarget(sx, sy) {
  const b = pickAt(sx, sy);
  if (b) return b;
  const t = pickBinAt(sx, sy); if (t) { t.kind === 'seal' ? hitSeal(t.bin) : hitLeak(t.bin); return 'hit'; }
  return null;
}
function inBinZone(p) { for (const bin of bins) { if (Math.abs(p.x - bin.x) < BIN.w / 2 && Math.abs(p.z - bin.z) < BIN.d / 2 && p.y > BASE - .05 && p.y < BASE + BIN.h + .3) return bin; } return null; }
function pinned(b) {
  const p = b.body.translation(), hy = b.dims[1] / 2;
  const candidates = restingPool.size ? [...movingBoxes, ...restingPool.near(p, (Math.max(...b.dims)+restingPool.maxDim)/2+.2)] : boxes;
  for (const o of candidates) {
    if (o === b || o.st !== 'free') continue; const q = o.dormant ? o.mesh.position : o.body.translation();
    if (q.y < p.y + hy * .6) continue; if (q.y - p.y > hy + o.dims[1] / 2 + .2) continue;
    const ox = (b.dims[0] + o.dims[0]) / 2 * .8, oz = (b.dims[2] + o.dims[2]) / 2 * .8;
    if (Math.abs(q.x - p.x) < ox && Math.abs(q.z - p.z) < oz) return true;
  }
  return false;
}
function grab(b, sx, sy) {
  canvas.dataset.lastGrab = String(b.id); canvas.dataset.grabWasCovered = String(pinned(b));
  thawBox(b, true);
  b.st = 'held'; b.body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
  b.body.collider(0).setEnabled(false);
  const p = b.body.translation(), r = b.body.rotation();
  const e = new THREE.Euler().setFromQuaternion(new THREE.Quaternion(r.x, r.y, r.z, r.w), 'YXZ');
  held = { b, pos: new THREE.Vector3(p.x, p.y, p.z), prev: new THREE.Vector3(p.x, p.y, p.z), vel: new THREE.Vector3(), q: new THREE.Quaternion(r.x, r.y, r.z, r.w), yaw: Math.round(e.y / (Math.PI / 2)) * (Math.PI / 2), tx: 0, tz: 0, vtx: 0, vtz: 0, sx, sy, downX: sx, downY: sy, dragged: false };
  sfx.pick();
}
const HQ = new THREE.Quaternion(), HE = new THREE.Euler(), AIM_Y = BASE + BIN.h + .05;
const aim = mesh(new THREE.RingGeometry(.36, .5, 44), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .95, depthWrite: false, depthTest: false }), false, false); aim.rotation.x = -Math.PI / 2; aim.renderOrder = 4; aim.visible = false; scene.add(aim);
const aimDot = mesh(new THREE.RingGeometry(.5, .56, 44), new THREE.MeshBasicMaterial({ color: 0x1a1a1a, transparent: true, opacity: .35, depthWrite: false, depthTest: false }), false, false); aimDot.rotation.x = -Math.PI / 2; aimDot.renderOrder = 4; aim.add(aimDot); aimDot.rotation.x = 0;
function updHeld(dt) {
  if (!held) return; const h = held, b = h.b, big = b.big;
  let tp;
  if (STAGE.id === 'counter') tp = counterAim(h.sx, h.sy, big) || h.pos.clone();
  else { tp = ptrWorld(h.sx, h.sy, AIM_Y) || h.pos.clone(); tp.y = big ? 4.3 : 3.5; }
  if (winMode()) keepInside(tp, Math.max(b.dims[0], b.dims[2]) * .6 + .1); else { tp.x = clamp(tp.x, STAGE.drag.x[0], STAGE.drag.x[1]); tp.z = clamp(tp.z, STAGE.drag.z[0], STAGE.drag.z[1]); }
  h.prev.copy(h.pos); const k = Math.min(1, dt * (big ? 11 : 18)); h.pos.lerp(tp, k);
  h.vel.subVectors(h.pos, h.prev).divideScalar(Math.max(dt, 1e-3));
  const ks = big ? 60 : 140, kd = big ? 7 : 15, g = big ? .05 : .03;
  h.vtz += ((-h.vel.x * g) - h.tz) * ks * dt - h.vtz * kd * dt; h.tz += h.vtz * dt;
  h.vtx += ((h.vel.z * g) - h.tx) * ks * dt - h.vtx * kd * dt; h.tx += h.vtx * dt;
  h.tz = clamp(h.tz, -.6, .6); h.tx = clamp(h.tx, -.6, .6);
  HE.set(h.tx, h.yaw, h.tz, 'YXZ'); HQ.setFromEuler(HE); h.q.slerp(HQ, Math.min(1, dt * 10));
  b.body.setNextKinematicTranslation({ x: h.pos.x, y: h.pos.y, z: h.pos.z }); b.body.setNextKinematicRotation(h.q);
  const hb = hoverBin(); aim.visible = true; aim.position.set(h.pos.x, hb ? (hb.seal ? hb.g.position.y + BIN.h + .12 : hb.g.position.y + .12) : surfaceY(h.pos.x, h.pos.z) + .03, h.pos.z); updScan(h, dt);  aim.scale.setScalar(1 + Math.sin(time * 8) * .06);
}
function release() {
  if (!held) return; const { b, vel } = held; held = null; aim.visible = false;
  b.body.collider(0).setEnabled(true);
  b.st = 'free'; b.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true); b.launchedAt = time;
  const v = vel.clone(); v.y = Math.min(0, v.y); if (v.length() > 9) v.setLength(9); v.multiplyScalar(.55);
  b.body.setLinvel({ x: v.x, y: v.y, z: v.z }, true); b.body.setAngvel({ x: v.z * .3, y: 0, z: -v.x * .3 }, true);
}
function hoverBin() { if (!held) return null; const p = held.pos; for (const bin of bins) if (!bin.move && Math.abs(p.x - bin.x) < BIN.w / 2 + .1 && Math.abs(p.z - bin.z) < BIN.d / 2 + .1) return bin; return null; }

/* ================= 每帧逻辑 ================= */
function hopPop() { const e = $('hop'); e.classList.remove('pop'); void e.offsetWidth; e.classList.add('pop'); }
const ENTRY = Math.min(1.9, (BELT.x1 - BELT.x0) / 2);   // 入口区：带子前半段（经典布局 1.9 米）
function updBelt(dt) {
  const boost = speedNow(), v = beltV() * boost; const running = state === 'work';
  if (running) beltPos += v * dt; M.rubber.map.offset.x = -beltPos / 1.1 % 1;
  let jamNow = false, entryBlocked = false;
  const stalled = [];
  for (const b of movingBoxes) {
    b.onBelt = false; if (b.st !== 'free') { b.conveyorProgress = null; continue; } const p = b.body.translation();
    // 在带面上 = 底面贴着带面（柜台布局的带子只比台面高一点，台面上叠第二层的件不能算成在带子上）
    const bottom = p.y - b.dims[1] / 2;
    if (p.x > BELT.x0 && p.x < BELT.x1 + .1 && Math.abs(p.z - BELT.z) < .85 && p.y > BELT.top && bottom < BELT.top + .18) {
      b.onBelt = true; b.beltT = time; if (!running) continue;
      b.conveyorProgress = advanceStall(b.conveyorProgress, p.x, dt);
      if (b.conveyorProgress.seconds >= 1.5 && !b.big) stalled.push(b);
      const lv = b.body.linvel(); b.body.setLinvel({ x: lerp(lv.x, v, .22), y: lv.y, z: lerp(lv.z, (BELT.z - p.z) * 2, .2) }, true);
      const av = b.body.angvel(); b.body.setAngvel({ x: av.x * .9, y: av.y * .9, z: av.z * .9 }, true);
      if (BELT.kick && p.x > BELT.x1 - .35 && lv.x > .2) b.body.setLinvel({ x: Math.max(lv.x, BELT.kick * boost), y: lv.y, z: lv.z }, true);
      if (p.x > BELT.x1 - 1.7 && lv.x < .3) jamNow = true;
      if (p.x < BELT.x0 + ENTRY) entryBlocked = true;
    }
    if (!b.onBelt) b.conveyorProgress = null;
    if (p.x < BELT.x0 + ENTRY && p.x > BELT.x0 - .3 && Math.abs(p.z - BELT.z) < BELT.w / 2 && p.y > BELT.top - .1 && p.y < BELT.top + 2) entryBlocked = true;
  }
  // 卡住的件自动抬送到台面空处；仍是同一件，不删除、不计作已收、不额外生成。
  if (running && !feeding && stalled.length) {
    stalled.sort((a, b) => b.body.translation().x - a.body.translation().x);
    const top = topOfStack(boxes.map(b => ({ id: b.id, st: b.st, dims: b.dims, p: b.body.translation() })), stalled[0].id);
    const b = boxes.find(b => b.id === top.id); feedBox(b, clearTableTarget(b));
  }
  // 柜台布局：刚从带子上下来 2.5 秒内、停在溜槽口往里 3 米内的件往台面中间推（铺到主播面前），出口不会被头几件堵死；
  // 只推刚下来的，推不动的过一会儿就不管了，能停稳（这一片堆满时照样会堵）
  if (CHUTE && running) for (const b of boxes) {
    if (b.st !== 'free' || b.onBelt || b === held?.b || !(time - (b.beltT ?? -9) < 2.5)) continue; const p = b.body.translation();
    if (p.x > CHUTE.x0 && p.x < CHUTE.x1 + 3 && Math.abs(p.z - BELT.z) < BELT.w / 2 + .3 && p.y < TABLE.top + 1.6) { const lv = b.body.linvel(); if (lv.x < 1.4) b.body.setLinvel({ x: 1.4, y: lv.y, z: lv.z }, true); }   // 直接给速度：台面摩擦大，慢慢加速推不动
  }
  jamT = jamNow ? jamT + dt : Math.max(0, jamT - dt * 2);
  const jam = jamT > .6;
  M.lamp.color.set(state !== 'work' ? 0x59626a : boost > 1 ? 0xff3b2f : jam ? 0xf0a431 : 0x3ad17e); M.lamp.emissive.copy(M.lamp.color); M.lamp.emissiveIntensity = state !== 'work' ? .1 : boost > 1 ? 1 + Math.abs(Math.sin(time * 14)) * 2 : jam ? 1.4 + Math.sin(time * 10) * .8 : 1.6;
  spawnT += dt;
  if (running && !jam && !entryBlocked && spawnT >= S.feedGap / (beltV() / 1.9) / boost && !feeding) {
    const c = boxes.filter(b => b.st === 'free' && !b.big && onDock(b.body.translation()) && !pinned(b)).sort((a, b) => { const pa = a.body.translation(), pb = b.body.translation(); return ((pa.x - FEED.x) ** 2 + (pa.z - FEED.z) ** 2) - ((pb.x - FEED.x) ** 2 + (pb.z - FEED.z) ** 2); });
    if (c.length) { feedBox(c[0]); spawnT = 0; }
  }
  if (running && supply > 0 && activeRoom() >= 1 && !jam && !entryBlocked && spawnT >= S.feedGap / (beltV() / 1.9) / boost) {
    const b = spawnBox({ color: Math.floor(Math.random() * 3), pos: { x: BELT.x0 + .75, y: BELT.top + .5, z: BELT.z + rnd(-.08, .08) }, vel: { x: v, y: 0, z: 0 } });
    if (pendingTape.length) { const q = pendingTape.shift(); wrapTape(b, q.name, q.layers); } else if (pendingStrip.length) { const q = pendingStrip.shift(); stripBox(b, q.name, q.scan); }
    supply--; spawnT = 0; hopPop();
  }
  for (const [i, s] of belt.userData.strips.entries()) { let push = 0; for (const b of boxes) { const p = b.mesh.position; if (Math.abs(p.x - (BELT.x0 + .35)) < .8 && Math.abs(p.z - (BELT.z - .84 + i * .28)) < .6 && p.y < BELT.top + 1.3) push = Math.max(push, 1 - Math.abs(p.x - (BELT.x0 + .35)) / .8); } s.rotation.z = lerp(s.rotation.z, -push * 1.0, .25); }
}
let feeding = null;
function clearTableTarget(b) {
  const x0 = Math.max(TABLE.x0 + .7, BELT.x1 + .65), x1 = TABLE.x1 - 1.5;
  let target = null;
  for (let ix = 0; ix < 4; ix++) for (let iz = 0; iz < 3; iz++) {
    const x = lerp(x0, Math.max(x0, x1), (ix + .5) / 4), z = lerp(TABLE.z0 + .55, TABLE.z1 - .55, (iz + .5) / 3);
    const y = Math.max(TABLE.top, surfaceY(x, z)) + b.dims[1] / 2 + .12;
    if (!target || y < target.y) target = new THREE.Vector3(x, y, z);
  }
  return target;
}
function feedBox(b, target = null) {
  thawBox(b, true);
  const p = b.body.translation(); b.st = 'feed'; b.body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true); b.body.collider(0).setEnabled(false);
  const r = b.body.rotation(); const e = new THREE.Euler().setFromQuaternion(new THREE.Quaternion(r.x, r.y, r.z, r.w), 'YXZ');
  feeding = { b, target, f: new THREE.Vector3(p.x, p.y, p.z), q0: new THREE.Quaternion(r.x, r.y, r.z, r.w), q1: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.round(e.y / (Math.PI / 2)) * Math.PI / 2, 0)), t: 0 };
  sfx.zip();
}
function updFeed(dt) {
  const f = feeding; if (!f) return; const b = f.b;
  if (b.st !== 'feed') { feeding = null; return; }
  f.t += dt; const k = Math.min(1, f.t / .5), e = eIO(k);
  const to = f.target || new THREE.Vector3(BELT.x0 + 1.0, BELT.top + b.dims[1] / 2 + .04, BELT.z);
  const pos = f.f.clone().lerp(to, e); pos.y = lerp(f.f.y, to.y, e) + Math.sin(k * Math.PI) * (1.0 + Math.max(0, f.f.y - to.y));
  b.body.setNextKinematicTranslation(pos); b.body.setNextKinematicRotation(f.q0.clone().slerp(f.q1, e));
  if (k >= 1) { b.body.collider(0).setEnabled(true); b.st = 'free'; b.conveyorProgress = null; b.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true); b.body.setLinvel({ x: f.target ? 0 : beltV(), y: f.target ? -.5 : 0, z: 0 }, true); b.body.setAngvel({ x: 0, y: 0, z: 0 }, true); feeding = null; }
}
function updBins(dt) {
  const hv = hoverBin();
  for (const bin of bins) {
    let y = 0;
    if (bin.move) { const m = bin.move; m.t += dt; const k = eIO(Math.min(1, m.t / m.dur)); bin.x = lerp(m.fx, m.tx, k); bin.z = lerp(m.fz, m.tz, k) + Math.sin(k * Math.PI) * m.dz; y = Math.sin(k * Math.PI) * m.hop; if (m.t >= m.dur) { bin.move = null; bin.pulse = 1; sfx.land(10); } }
    bin.body.setNextKinematicTranslation({ x: bin.x, y: BASE + y, z: bin.z });
    bin.pulse = Math.max(0, bin.pulse - dt * 3.2); bin.jolt = Math.max(0, bin.jolt - dt * 3);
    bin.hover = lerp(bin.hover, hv === bin ? 1 : 0, Math.min(1, dt * 12));
    const sq = Math.sin(bin.pulse * Math.PI) * .05;
    bin.g.position.set(bin.x + Math.sin(time * 60) * bin.jolt * .09, BASE + y + bin.jolt * .12, bin.z);
    bin.g.scale.set(1 + sq, 1 - sq, 1 + sq);
    bin.door = lerp(bin.door, bin.leak ? 1 : 0, Math.min(1, dt * 9)); bin.hinge.rotation.x = bin.door * 1.35;
    if (bin.leak) { bin.rimMat.emissive.set(0xff3b2f); bin.rimMat.emissiveIntensity = .35 + Math.sin(time * 10) * .3; }
    else { bin.rimMat.emissive.set(0xffffff); bin.rimMat.emissiveIntensity = bin.hover * .5; }
    updSeal(bin, dt); updLeak(bin, dt);
  }
}
function updBoxes(dt) {
  for (let i = boxes.length - 1; i >= 0; i--) {
    const b = boxes[i]; if (b.dormant) continue; const p = b.body.translation(), r = b.body.rotation();
    b.mesh.position.set(p.x, p.y, p.z); b.mesh.quaternion.set(r.x, r.y, r.z, r.w);
    if (b.wig > 0) { b.wig = Math.max(0, b.wig - dt * 4); b.mesh.rotateZ(Math.sin(time * 70) * b.wig * .08); }
    if (b.st === 'deliver') {
      b.dT += dt; if (b.dT > .75) { const s = Math.max(0, 1 - (b.dT - .75) / .28); b.mesh.scale.setScalar(s * (b.itemScale || 1)); if (s <= 0) removeBox(b); }
      continue;
    }
    if (b.st === 'free') {
      const lv = b.body.linvel();
      if (b.pv < -4 && lv.y > b.pv + 4) { if (b.falling && b.big) bigImpact(b); else { sfx.land(-b.pv); if (-b.pv > 8) burst('dust', { x: p.x, y: p.y - b.dims[1] / 2, z: p.z }, 3, { s: .8 }); } }
      if (b.falling && lv.y > -1 && time - b.born > .3) b.falling = false;
      b.pv = lv.y; b.rejectCD = Math.max(0, b.rejectCD - dt);
      const bin = inBinZone(p);
      if (bin && !bin.move && !bin.seal && !bin.leak && !b.blind && p.y < BASE + BIN.h + .1 && Math.hypot(lv.x, lv.z) < 3.5) {
        const res = judgeDrop(b.cat, !b.stripped, bin.i, { wrongMode: S.play.wrong, audit: !!auditNow(), remaining: activeLoad(), cap: Math.min(S.play.cap, activeLoad() + Math.max(0, MAX_WORK - remaining())), base: S.play.mult, auditMult: (auditNow() || { val: 3 }).val });
        if (res.kind === 'accept') { b.st = 'deliver'; b.dT = 0; delivered++; bin.count++; bin.el.textContent = bin.count; bin.el.classList.remove('pop'); void bin.el.offsetWidth; bin.el.classList.add('pop'); bin.pulse = 1; b.big ? sfx.bigBin() : sfx.drop(); burst('dust', { x: bin.x, y: BASE + BIN.h, z: bin.z }, b.big ? 8 : 4, { r: 1.4, s: .8 }); if (b.big) shake = Math.max(shake, .35); }
        else if (b.rejectCD <= 0) {
          b.rejectCD = 1;
          // 上次弹了却没出这个筐（被别的件压着），或者不是被抛进来的（台面堆满自己滚进来、弹出来又落进别的筐）：
          // 放回台面，不算分错、不翻倍——否则会连锁翻倍、每秒重复记一次
          if (b.popBin === bin || !launched(b)) ejectToTable(b);
          else { b.popBin = bin; popOut(b, bin); if (res.kind === 'unidentified') addTag('scanfirst', 'strip', '', () => MODES[S.mode].scanFirst, binAnchor(bin), 0, 2.4); else onWrong(b, bin, res); }
        }
      }
      if (!bin) b.popBin = null;
      if (!b.falling && outOfBounds(p)) { const t = dockTarget(); b.body.setTranslation({ x: t.x, y: t.y + 2.5, z: t.z }, true); b.body.setLinvel({ x: 0, y: 0, z: 0 }, true); }
      if (boxes.length > 500 && b.body.isSleeping() && !onDock(p) && !inBinZone(p)) freezeBox(b);
    }
  }
}
/* ================= 分错：弹出筐外，在空中一变二（抽查期间一变三） ================= */
/* 弹出方向：地台模式朝工作台（同 V1.0）；整窗模式往后、往两侧散开，飞到画面任何地方 */
/* 「抛出去」的件：主播松手、无人机丢下、被踹、被炸、观众扔来的刁钻垃圾，3.5 秒内掉进错筐才算分错（翻倍）。
   分错弹出来的件、翻倍出来的复制件、台面上自己滚落的都不算 */
const LAUNCH_WINDOW = 3.5;
const launched = b => time - (b.launchedAt ?? -1e9) < LAUNCH_WINDOW;
/* 卡在错筐里弹不出来、或不算分错的件：闪一下，回到台面上方随机一处落下 */
function ejectToTable(b, quiet) {
  thawBox(b);
  const p = b.body.translation(); if (!quiet) burst('dust', p, 6, { s: .8 });
  const x = rnd(TABLE.x0 + 1, TABLE.x1 - 1.6), z = rnd(TABLE.z0 + .5, TABLE.z1 - .5);
  b.body.setTranslation({ x, y: spawnHeight(x, z, TABLE.top + 2.2), z }, true); b.body.setLinvel({ x: 0, y: -1, z: 0 }, true); b.body.setAngvel({ x: rnd(-3, 3), y: rnd(-3, 3), z: rnd(-3, 3) }, true);
  b.popBin = null;
}
function popOut(b, bin) {
  bin.jolt = 1; sfx.wrong(); b.launchedAt = -1e9;   // 弹出来的件不再算「抛出去」：落进别的错筐只放回台面，不连锁翻倍
  const p = b.body.translation(), m = b.body.mass();
  let dx, dz, sp;
  let up = 13;
  if (STAGE.id === 'counter') { dx = rnd(-.3, .3); dz = -1; sp = rnd(2.4, 3.3); up = 14.5; }   // 越过柜台前的挡板落回台面
  else if (winMode()) { const a = rnd(-Math.PI * .92, -Math.PI * .08); dx = Math.cos(a); dz = Math.sin(a); sp = rnd(6, 9); }
  else { dx = 3.8 - p.x; dz = -1.3 - p.z; const d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d; sp = 5.5; }
  b.body.applyImpulse({ x: dx * m * sp, y: m * up, z: dz * m * sp }, true);
  b.body.applyTorqueImpulse({ x: m * rnd(-.4, .4), y: m * rnd(-.3, .3), z: m * rnd(-.4, .4) }, true);
}
const itemName = b => b.kind === 'garbage' ? GARBAGE_BY_ID[b.itemId]?.name || '垃圾' : CNAME[b.cat] + '件';
function wrongText(b, bin, res) {
  const tail = res.copies > 0 ? ` ×${res.copies + 1}` : res.capped ? '（件数到上限，没有翻倍）' : '，弹回去了';
  if (b.kind === 'garbage') {
    const g = GARBAGE_BY_ID[b.itemId];
    if (b.prankBy) return `的捣乱无人机把${g.name}丢错了${tail}（该投${binName(b.cat, S.garbage.naming)}）`;
    if (b.trickBy) return `的${g.name}难倒了主播${tail}（该投${binName(b.cat, S.garbage.naming)}）`;
    return wrongTip(g, S.garbage.items, S.garbage.naming) + tail;
  }
  if (b.prankBy) return `的捣乱无人机把${CNAME[b.color] || ''}件丢进了${binWord(bin.i)}${tail}`;
  return `${b.name ? '的' : ''}${CNAME[b.color] || ''}件进了${binWord(bin.i)} · 分错${tail}`;
}
function onWrong(b, bin, res) {
  const by = b.prankBy ? '' : b.trickBy || ''; stats = recordWrong(stats, res.copies, by);
  const msg = wrongText(b, bin, res);
  // 一下子分错很多件（踹飞、炸开、整堆滑进桶）时，详细提示最多同时 3 条，其余合成一条计数，免得把画面盖住
  if (tags.filter(t => t.life > .3 && t.key.startsWith('wrong:')).length < 3) addTag('wrong:' + b.id + ':' + Math.round(time * 10), 'wrong', b.prankBy || b.trickBy || b.name || '', () => msg, binAnchor(bin), 0, 3.2);
  else addTag('wrong-many', 'wrong', '', c => `还有 ${c} 件也分错了`, () => { const a = bins[0], z = bins[bins.length - 1]; return new THREE.Vector3((a.x + z.x) / 2, BASE + BIN.h + 1.6, a.z); }, 1, 3.2);
  b.prankBy = '';
  if (res.copies > 0) { const p = b.body.translation(); splits.push({ b, t: .18, copies: res.copies, mult: res.copies + 1, p: { x: p.x, y: p.y, z: p.z } }); }
}
/* 复制一件：种类、颜色/分类、品种、送礼人、刁钻署名都继承；胶带、面单、泥不继承 */
function cloneItem(b, pos, vel) {
  const o = { kind: b.kind, color: b.color, cat: b.cat, itemId: b.itemId, scale: b.itemScale || 1, name: b.name, trickBy: b.trickBy, pos, vel, ang: { x: rnd(-8, 8), y: rnd(-8, 8), z: rnd(-8, 8) } };
  return spawnItem(o);
}
function spawnItem(o) { const b = o.kind === 'garbage' ? spawnGarbage(o) : spawnBox(o); if (o.trickBy) b.trickBy = o.trickBy; return b; }
function updSplits(dt) {
  for (let i = splits.length - 1; i >= 0; i--) {
    const s = splits[i]; s.t -= dt; if (s.t > 0) continue; splits.splice(i, 1);
    const b = s.b, alive = b.st !== 'gone' && b.st !== 'deliver', p = alive ? b.body.translation() : s.p, v = alive && b.st === 'free' ? b.body.linvel() : { x: 0, y: 3, z: 0 };
    for (let k = 0; k < s.copies; k++) {
      const a = (k % 2 ? 1 : -1) * (.65 + .35 * Math.floor(k / 2)), c = Math.cos(a), sn = Math.sin(a);
      const nb = cloneItem(b, { x: p.x + rnd(-.25, .25), y: p.y + .35, z: p.z + rnd(-.25, .25) }, { x: v.x * c - v.z * sn, y: Math.max(v.y, 3) + rnd(1, 3), z: v.x * sn + v.z * c });
      nb.rejectCD = 1;
    }
    burst('conf', p, 16, { sp: 1.3 }); sfx.split(); multPop(p, s.mult);
  }
}
/* 红色大字 ×2 / ×3：在分裂的位置弹出来，1.1 秒后消失。按游戏时钟逐帧驱动（和署名一样），暂停、快进、逐帧录像都对得上 */
const pops = [];
function multPop(p, mult) {
  const el = document.createElement('span');
  el.className = 'multpop' + (mult >= 3 ? ' x3' : ''); el.textContent = '×' + mult; $('hud').append(el);
  pops.push({ el, a: new THREE.Vector3(p.x, p.y + .4, p.z), t: 0 });
}
function updPops(dt) {
  for (let i = pops.length - 1; i >= 0; i--) {
    const o = pops[i]; o.t += dt; const k = o.t / 1.1;
    if (k >= 1) { o.el.remove(); pops.splice(i, 1); continue; }
    const sp = toScreen(o.a), grow = k < .18 ? .3 + k / .18 * .95 : k < .35 ? 1.25 - (k - .18) / .17 * .25 : 1;
    const rise = k < .18 ? 10 - k / .18 * 16 : -6 - (k - .18) / .82 * 46, op = k < .1 ? k / .1 : k > .75 ? 1 - (k - .75) / .25 : 1;
    o.el.style.transform = `translate(${sp.x}px,${sp.y + rise * tagK}px) translate(-50%,-50%) scale(${grow * tagK})`; o.el.style.opacity = op;
  }
}

let prevRemain = -1, prevDeliv = -1;
function refreshHud(force) {
  const r = remaining();
  if (r !== prevRemain || force) { const el = $('remain'); el.textContent = r; if (prevRemain >= 0 && !force) { el.className = 'num ' + (r > prevRemain ? 'up' : 'down'); el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); clearTimeout(el._t); el._t = setTimeout(() => el.className = 'num', 700); } prevRemain = r; }
  if (delivered !== prevDeliv || force) { $('deliv').textContent = delivered; prevDeliv = delivered; }
  const L = curLevel(), lv = S.endless ? `无尽模式 · ${r ? '处理中' : '等待观众加件'}` : `第 ${curIdx() + 1}/${curLevels().length} 关 · ${overtime ? '加班中' : L.name}` + (state === 'work' && !overtime && L.time > 0 ? ` · ${fmtT(L.time - elapsed)}` : ''); if ($('lvLine').textContent !== lv) $('lvLine').textContent = lv; $('lvLine').classList.toggle('hurry', !S.endless && state === 'work' && !overtime && L.time > 0 && L.time - elapsed < 20);
  const queue = truck.batches.reduce((n, bt) => n + bt.left, 0);
  $('queueLine').textContent = `场上 ${boxes.filter(b => b.st !== 'deliver').length} 件 · 排队 ${queue + supply + trickQueue.length + bigQueue.reduce((n, q) => n + q.n, 0)} 件`;
  const as = auditNow(), au = as ? `${effLabel('audit', S.mode)}中 ×${Math.max(as.val, S.play.mult)} · ${Math.ceil(segsEnd(auditSegs, time) - time)}s` : ''; const ap = $('auditPill'); if (ap.textContent !== au) ap.textContent = au;
  const inTruck = truck.st === 'gone' ? 0 : truck.batches.reduce((n, bt) => n + bt.left, 0); const hop = $('hop'); hop.style.display = inTruck + supply > 0 ? 'flex' : 'none'; $('hopN').textContent = (truck.st !== 'gone' && inTruck ? '车上还有 ' : '') + '×' + (inTruck + supply);
}
function updShift(dt) {
  if (S.endless) { if (state !== 'work') { state = 'work'; showResult(null); } elapsed += dt; return; }
  if (state === 'work') {
    elapsed += dt; const L = curLevel();
    if (!overtime && L.time > 0 && elapsed >= L.time && remaining() > 0) { state = 'fail'; doneT = 0; sfx.wrong(); showResult(false); }
    else if (remaining() === 0 && !held && !drone.carry && !prankDrone.carry) {
      state = 'done'; doneT = 0; sfx.done(); showResult(true);
      for (const bin of bins) burst('conf', { x: bin.x, y: BASE + 1.2, z: bin.z }, 14, { sp: 1.2 });
    }
  } else { doneT += dt; if (S.afterLevel === 'auto' && doneT >= S.autoNextSec) state === 'done' ? nextLevel() : startLevel(); }
}
const fmtT = t => { t = Math.max(0, Math.ceil(t)); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); };
function showResult(ok) {
  const c = $('counter'); c.classList.toggle('done', ok !== null); c.classList.toggle('fail', ok === false); c.classList.toggle('force', ok !== null);
  if (ok === null) return;
  $('finTitle').textContent = ok ? (overtime ? '加班结束' : '收工') : '超时';
  $('finInfo').textContent = ok ? `${curLevel().name} · ${delivered} 件 · ${fmtT(elapsed)}` : `还剩 ${remaining()} 件没分完`;
  const top = topStumper(stats); $('finStats').textContent = [statsLine(stats), top ? `被${top.name}的刁钻垃圾难倒 ${top.n} 次` : ''].filter(Boolean).join(' · ');
  $('nextBtn').textContent = ok ? (curIdx() >= curLevels().length - 1 && !S.loopLevels ? '再来一次' : '下一关') : '重玩本关';
  $('nextBtn').hidden = false;
}
let tagK = 1;
const hudK = () => clamp(innerHeight / 1080, .45, 2.2);
function applyHud() {
  const L = S.layout, k = hudK();
  for (const id of ['counter', 'board']) { const o = L[id], el = $(id); el.style.left = o.x + '%'; el.style.top = o.y + '%'; el.style.transform = `scale(${o.s / 100 * k * 1.2})`; el.classList.toggle('off', !o.on); }
  tagK = L.tags.s / 100 * k * 1.15;
  document.body.classList.toggle('no-badges', !L.badges); document.body.classList.toggle('no-bincount', !L.binCounts); document.body.classList.toggle('no-cursor', !L.cursor);
  refreshBoard(true);
}
function applyLayout() { applyHud(); applyStage(); }
function updHudPos() {
  const hn = $('heldName'), hb = held && held.b, showName = hb && hb.kind === 'garbage' && S.garbage.names && !hb.stripped && hb.itemId;
  if (showName) { const sp = toScreen(hb.mesh.position.clone().add(new THREE.Vector3(0, hb.dims[1] / 2 + .55, 0))); hn.textContent = GARBAGE_BY_ID[hb.itemId].name; hn.style.transform = `translate(${sp.x}px,${sp.y}px) translate(-50%,-100%) scale(${tagK})`; hn.style.display = 'block'; } else if (hn.style.display !== 'none') hn.style.display = 'none';
  const hp = truck.st !== 'gone' ? toScreen(truck.g.position.clone().addScaledVector(TDIR, .3).add(new THREE.Vector3(1.6, 0, 0)).setY(3.2)) : toScreen(new THREE.Vector3(BELT.x0 + .35, 3.35, BELT.z)); const hop = $('hop'); const [hx, hy] = avoidHead(hp.x, hp.y, (hop.offsetHeight || 28) * tagK); hop.style.translate = `${hx}px ${hy}px`; hop.style.transform = `scale(${tagK}) translate(-50%,-100%)`;
  for (const bin of bins) { const s = toScreen(new THREE.Vector3(bin.x + BIN.w / 2 - .25, bin.g.position.y + BIN.h * .5, bin.z + BIN.d / 2 + .05)); bin.el.style.translate = `${s.x}px ${s.y}px`; bin.el.style.transform = `scale(${tagK}) translate(-50%,-50%)`; bin.el.style.visibility = bin.count > 0 ? 'visible' : 'hidden'; }
}

/* ================= 自动演示 ================= */
const demo = { on: false, forceWrong: 0, giftT: 2.5, x: innerWidth / 2, y: innerHeight * .7, tw: null, wait: .6, box: null };
function gtw(x, y, dur, cb) { demo.tw = { fx: demo.x, fy: demo.y, tx: x, ty: y, t: 0, dur, cb }; }
function updDemo(dt) {
  const gh = $('ghost'); gh.style.display = demo.on ? 'block' : 'none'; $('demoPill').style.display = demo.on ? 'block' : 'none';
  if (!demo.on) return;
  demo.giftT -= dt;
  if (demo.giftT <= 0) { const r = Math.random(), n = NAMES[Math.floor(Math.random() * NAMES.length)]; { const t = r < .2 ? 'truck' : r < .28 ? 'blind' : r < .36 ? 'seal' : r < .43 ? 'speed' : r < .5 ? 'leak' : r < .58 ? 'strip' : r < .66 ? 'tape' : r < .73 ? 'kick' : r < .8 ? 'help' : r < .86 ? 'audit' : r < .93 ? 'prank' : S.mode === 'garbage' ? 'tricky' : 'truck'; { const L = S.tiers[t]; gift(t, n, undefined, L[Math.floor(Math.random() * L.length)].id); } } demo.giftT = rnd(5, 9); }
  if (state !== 'work' && doneT > 2.5 && S.afterLevel !== 'auto') { state === 'done' ? nextLevel() : startLevel(); }
  if (demo.tw) {
    const w = demo.tw; w.t += dt; const k = eIO(Math.min(1, w.t / w.dur)); demo.x = lerp(w.fx, w.tx, k); demo.y = lerp(w.fy, w.ty, k);
    if (held && held.b === demo.box) { held.sx = demo.x; held.sy = demo.y; }
    if (w.t >= w.dur) { demo.tw = null; w.cb && w.cb(); }
  } else if (!held) {
    demo.wait -= dt;
    if (demo.wait <= 0 && state === 'work') {
      const clickAt = (v, fn) => { const s = toScreen(v); gtw(s.x, s.y, Math.hypot(s.x - demo.x, s.y - demo.y) < 12 ? .1 : .35, () => { fn(); demo.wait = .14; }); };
      const blind = boxes.find(b => b.st === 'free' && b.blind && !b.falling);
      const sealed = bins.find(b => b.seal && b.seal.t > 4), leaky = bins.find(b => b.leak && time - b.leak.t0 > 5);
      if (blind) { clickAt(blind.mesh.position, () => { if (blind.st === 'free' && blind.blind) hitBlind(blind); }); }
      else if (sealed && Math.random() < .6) { clickAt(new THREE.Vector3(sealed.x, BASE + BIN.h + .1, sealed.z), () => hitSeal(sealed)); }
      else if (leaky && Math.random() < .6) { clickAt(new THREE.Vector3(leaky.x, BASE + BIN.h * .5, leaky.z + BIN.d / 2), () => hitLeak(leaky)); }
      else {
        const c = boxes.filter(b => b.st === 'free' && !b.blind && !pinned(b) && !(b.onBelt && b.body.translation().x < BELT.x0 + 1.5) && !(inBinZone(b.body.translation()) && b.body.translation().y < BASE + BIN.h) && (b.stripped || (!bins[b.cat].seal && !bins[b.cat].leak)));
        c.sort((a, b) => (onTable(b.body.translation()) - onTable(a.body.translation())) || b.body.translation().y - a.body.translation().y);
        const b = c[0];
        if (!b) demo.wait = .3;
        else {
          const s = toScreen(b.mesh.position);
          gtw(s.x, s.y, Math.hypot(s.x - demo.x, s.y - demo.y) < 12 ? .1 : .38, () => {
            if (b.st !== 'free' || pinned(b)) { demo.wait = .1; return; }
            if (b.tape > 0) { tear(b); demo.wait = .12; return; }
            grab(b, demo.x, demo.y); demo.box = b;
            const toBin = () => {
              if (bins[b.cat].seal || bins[b.cat].leak) { const t = toScreen(tableAnchor(Math.max(AIM_Y - TABLE.top, .4)).add(new THREE.Vector3(-.2, 0, .1))); gtw(t.x, t.y, .5, () => { if (held && held.b === b) release(); demo.box = null; demo.wait = .3; }); return; }
              // forceWrong：演示视频里让光标故意投错一次（正常自动演示 8% 失误）
              const wrong = demo.forceWrong > 0 || Math.random() < .08, bin = bins[wrong ? (b.cat + 1) % bins.length : b.cat]; if (demo.forceWrong > 0) demo.forceWrong--;
              const t = toScreen(new THREE.Vector3(bin.x, AIM_Y, bin.z));
              gtw(t.x + rnd(-15, 15), t.y, b.big ? .8 : .55, () => { if (held && held.b === b) release(); demo.box = null; demo.wait = rnd(.15, .45); });
            };
            if (b.stripped) { const t = toScreen(new THREE.Vector3(SCAN.x, AIM_Y, SCAN.z)); gtw(t.x, t.y, .5, () => gtw(t.x, t.y, .85, toBin)); }
            else toBin();
          });
        }
      }
    }
  }
  gh.style.transform = `translate(${demo.x - 2}px,${demo.y - 2}px)`;
}
function setDemo(on) { demo.on = on; demo.tw = null; if (!on && held && held.b === demo.box) release(); demo.box = null; $('demoBtn').classList.toggle('on', on); $('demoBtn').textContent = on ? '■ 停止演示' : '▶ 自动演示'; }

/* ================= 主循环 ================= */
let acc = 0, last = performance.now();
function simulate(dt) {
  time += dt;
  if (boundsDirty && time - boundsAt > .1) rebuildBounds();
  if ((headClearT -= dt) <= 0) { headClearT = .2; clearHeadCircle(); }
  acc += dt; let steps = 0;
  while (acc >= 1 / 60 && steps < 3) {
    const h = 1 / 60;
    updHeld(h); updBelt(h); updFeed(h); updUnloads(h); updBins(h);
    world.step(); acc -= h; steps++;
  }
  if (steps === 3) acc = 0;
  if (kickQueue.length && time >= kickNext) { kick(kickQueue.shift()); kickNext = time + .8; }
  updFlyers(dt); updScanner(dt);
  updBoxes(dt); updSplits(dt); updTruck(dt); updBig(dt); updDrone(drone, dt); updDrone(prankDrone, dt); updTricky(dt); updDemo(dt); updShift(dt); updParts(dt); updBlobs();
  tableShake = Math.max(0, tableShake - dt * 2.4); table.position.set(Math.sin(time * 48) * tableShake * .07, Math.abs(Math.sin(time * 37)) * tableShake * .05, 0);
  shake = Math.max(0, shake - dt * 3);
  camera.position.copy(camBase.pos);
  if (shake > 0) camera.position.add(new THREE.Vector3(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).multiplyScalar(shake * .12 * camBase.pos.distanceTo(camBase.target) / 20));
  camera.lookAt(camBase.target);
}
/* 性能：帧率上限；场上没有任何动静时降到 12 帧并停止刷新阴影 */
let idleFor = 0, lastDraw = 0;
function busy() {
  if (held || feeding || unloads.length || truck.st !== 'gone' || drone.st !== 'gone' || prankDrone.st !== 'gone' || segsEnd(auditSegs, time) > time || splits.length || pops.length || demo.on || tags.length || parts.length || flyers.length || warns.length || kickQueue.length || shake > 0 || tableShake > 0) return true;
  for (const bin of bins) if (bin.move || bin.seal || bin.leak || bin.pulse > 0 || bin.jolt > 0) return true;
  for (const b of movingBoxes) if (b.st !== 'free' || b.wig > 0 || !b.body.isSleeping()) return true;
  return false;
}
let perfFrames = 0, perfAt = performance.now();
function draw(dt, active) {
  if (renderer.shadowMap.enabled && (active || shadowAsked)) renderer.shadowMap.needsUpdate = true;
  renderer.render(scene, camera); renderAsked = shadowAsked = false;
  perfFrames++; const perfNow = performance.now(); if (perfNow - perfAt > 1000) {
    Object.assign(canvas.dataset, { fps: String(Math.round(perfFrames * 1000 / (perfNow - perfAt))), objects: String(boxes.length), batched: String(restingPool.size), physics: String(movingBoxes.size), drawCalls: String(renderer.info.render.calls) }); perfAt = perfNow; perfFrames = 0;
  }
  refreshHud(); updHudPos(); updTags(dt); updPops(dt); tickBoard(dt);
}
function frame(now) {
  requestAnimationFrame(frame); if (paused) return;
  const idle = S.perf.idle && idleFor > 1.5 && !renderAsked, gap = 1000 / (idle ? 12 : S.perf.fps) - 2;
  if (now - lastDraw < gap) return; lastDraw = now;
  const dt = Math.min(.25, (now - last) / 1000); last = now; // 空闲 12 帧时也按真实时间走；物理每帧最多 3 步
  simulate(dt); const active = busy() || (state === 'work' && boxes.some(b => b.onBelt));
  idleFor = active ? 0 : idleFor + dt; draw(dt, active);
}
let paused = false;

/* ================= 输入 ================= */
canvas.addEventListener('pointerdown', e => {
  au(); if (held) return; if (demo.on) setDemo(false);
  const b = clickTarget(e.clientX, e.clientY); if (b) lastHitT = performance.now(); if (!b || b === 'hit') return;
  ptr.id = e.pointerId; try { canvas.setPointerCapture(e.pointerId); } catch (_) { }
  grab(b, e.clientX, e.clientY);
});
canvas.addEventListener('pointermove', e => {
  if (held && !demo.on && (ptr.id === null || e.pointerId === ptr.id)) { held.sx = e.clientX; held.sy = e.clientY; if (Math.hypot(e.clientX-held.downX,e.clientY-held.downY)>6) held.dragged = true; canvas.style.cursor = 'grabbing'; return; }
  if (!held) { const b = pickAt(e.clientX, e.clientY); canvas.style.cursor = b ? 'grab' : pickBinAt(e.clientX, e.clientY) ? 'pointer' : 'default'; }
});
function endPtr(e) {
  if (held && !demo.on && (ptr.id === null || e.pointerId === ptr.id)) {
    const { b, dragged } = held; release(); ptr.id = null;
    if (!dragged && e.type === 'pointerup') { if (b.blind) hitBlind(b); else if (b.tape > 0) tear(b); }
  }
}
addEventListener('pointermove', e => { const c = S.panel.side === 'left' ? e.clientX < 170 : e.clientX > innerWidth - 170; document.body.classList.toggle('corner', c && e.clientY > innerHeight - 150); }, { passive: true });
canvas.addEventListener('pointerup', endPtr); canvas.addEventListener('pointercancel', endPtr);
addEventListener('blur', () => { if (held && !demo.on) release(); });
addEventListener('keydown', e => {
  if (e.repeat) return;
  const k = (e.key || '').toLowerCase();
  if (headEd.isOpen() && !document.body.classList.contains('layout-mode')) { if (k === 'escape' || k === 'enter') headEd.close(true); return; }
  if (document.body.classList.contains('layout-mode')) { if (k === 'escape' || k === 'enter') setLayoutMode(false); return; }
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA' || e.target.closest?.('#panel,.inline-select-popup'))) { if (k === 'escape') togglePanel(false); return; }
  if (k === 'h') togglePanel();
  else if (k === 'escape') { if (held) release(); else togglePanel(false); }
  else { const m = { '1': 'truck', '2': 'blind', '3': 'seal', '4': 'speed', '5': 'leak', '6': 'strip', '7': 'tape', '8': 'kick', '9': 'help', '0': 'audit' }[k]; if (m) { au(); gift(m, $('nm').value); } }
});


/* ================= 直播互动接入（菘蓝 SDK / 白曜动作 / 本机转发） =================
   做法与红黑破锁、抓小牛、插件通用模板一致：
   · 菘蓝 SDK（SonglanPlugin.onGift/onChat/onLike/onFollow/onMember）优先，每 1.2 秒尝试绑定一次；
   · 白曜重工 BaiyaoPlugin.onAction：规则在白曜里配，本插件只执行动作；
   · 无 SDK 时回退本机 ws://localhost:10030，断线 3 秒重连；
   · eventId / actionId 去重（10 秒内同 ID 只处理一次）；
   · 礼物名按 NFKC、忽略大小写与首尾空格匹配；数量 = 规则数值 × 礼物个数。 */
const RKEY = 'kd-3d-rules-v4';   // 大数量规则另存，退回旧版不会覆盖。
let rules = DEFAULT_RULES.map(r => ({ ...r }));
try { const raw = localStorage.getItem(RKEY) || localStorage.getItem('kd-3d-rules-v3') || localStorage.getItem('kd-3d-rules-v2') || localStorage.getItem('kd-3d-rules-v1'); if (raw) rules = normTierRefs(validRules(JSON.parse(raw)), S.tiers); } catch (e) { console.warn('互动规则读取失败，已使用默认规则', e); }
const saveRules = () => { try { localStorage.setItem(RKEY, JSON.stringify(rules)); return true; } catch (e) { toast('浏览器没能保存规则，本页可继续使用'); return false; } };

/* ---------- 去重 / 冷却 / 点赞累计 ---------- */
const seenIds = new Map();
function dupe(id) { if (id === null || id === undefined || id === '') return false; const now = Date.now(), k = String(id).slice(0, 160); if (seenIds.size > 400) for (const [key, t] of seenIds) if (now - t > 10000) seenIds.delete(key); const prev = seenIds.get(k); seenIds.set(k, now); return prev !== undefined && now - prev <= 10000; }
const cdMap = new Map();
function coolOk(rule, who) { if (!rule.cd) return true; const k = rule.id + '|' + who, now = Date.now(), t = cdMap.get(k) || 0; if (now - t < rule.cd * 1000) return false; cdMap.set(k, now); if (cdMap.size > 3000) cdMap.clear(); return true; }
const likeAcc = new Map();

/* ---------- 事件标准化（兼容菘蓝旧字段与白曜标准事件） ---------- */
function typeOf(t) {
  t = String(t ?? '').toLowerCase();
  if (t.includes('gift') || t === '2') return 'gift';
  if (t.includes('chat') || t.includes('comment') || t.includes('danmaku') || t === '1') return 'chat';
  if (t.includes('like') || t === '5') return 'like';
  if (t.includes('follow') || t.includes('social') || t === '4') return 'follow';
  if (t.includes('member') || t.includes('enter') || t === '3') return 'member';
  return null;
}
function normEvent(raw, forced) {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw.data && typeof raw.data === 'object' && !Array.isArray(raw.data) ? { ...raw.data, ...raw, data: undefined } : raw;
  const type = forced || typeOf(d.type ?? d.msgType ?? d.method); if (!type) return null;
  const user = d.user && typeof d.user === 'object' ? d.user : {};
  const nick = String(d.nickName ?? d.nickname ?? user.nickname ?? user.nickName ?? d.userName ?? d.uname ?? '').trim().slice(0, 20) || '观众';
  const uid = String(d.userId ?? user.id ?? d.uid ?? nick).slice(0, 60);
  const id = d.eventId ?? d.event_id ?? d.msgId ?? d.msg_id ?? null;
  const ev = { type, nick, uid, id };
  if (type === 'gift') {
    const g = d.gift && typeof d.gift === 'object' ? d.gift : d;
    ev.name = String(d.giftName ?? g.giftName ?? g.name ?? '').trim().slice(0, 40);
    const c = Number(d.count ?? d.giftCount ?? d.comboCount ?? d.repeatCount ?? g.count ?? g.giftCount ?? 1);
    if (!ev.name || !Number.isInteger(c) || c < 1 || c > 10000) return null; ev.count = c;
  } else if (type === 'chat') { ev.text = String(d.content ?? d.text ?? d.msg ?? d.comment ?? '').slice(0, 200); if (!ev.text.trim()) return null; }
  else if (type === 'like') { const c = Number(d.count ?? d.likeCount ?? 1); ev.count = Number.isInteger(c) && c >= 1 && c <= 1000 ? c : 1; }
  return ev;
}

/* ---------- 路由 ---------- */
const evLog = [];
function logEv(via, ev, result) { evLog.unshift({ t: new Date(), via, ev, result }); if (evLog.length > 30) evLog.pop(); if (document.body.classList.contains('panel-open')) renderLog(); }
function fire(effect, who, amount, rule) { au(); return gift(effect, who, amount, rule ? rule.tier : undefined); }
const hitText = (eff, got) => got > 0 ? `${effLabel(eff, S.mode)} ${got}${EFF[resolveEffect(eff, S.mode)].unit}` : `${effLabel(eff, S.mode)}（已到上限，没有执行）`;
function route(ev, via) {
  const hits = [];
  if (ev.type === 'gift') {
    const r = rules.find(r => r.on && r.src === 'gift' && normKey(r.match) === normKey(ev.name));
    if (r && coolOk(r, ev.uid)) { const amt = Math.min(EFF[r.effect].max * 10, r.value * ev.count); hits.push(hitText(r.effect, fire(r.effect, ev.nick, amt, r))); }
  } else if (ev.type === 'chat') {
    const text = normKey(ev.text);
    for (const r of rules) if (r.on && r.src === 'chat' && text.includes(normKey(r.match)) && coolOk(r, ev.uid)) { hits.push(hitText(r.effect, fire(r.effect, ev.nick, r.value, r))); break; }
  } else if (ev.type === 'like') {
    for (const r of rules) {
      if (!r.on || r.src !== 'like') continue; const need = Number(r.match); let acc = (likeAcc.get(r.id) || 0) + ev.count; let times = 0;
      while (acc >= need && times < 3) { acc -= need; times++; }
      if (acc >= need) acc = acc % need;
      likeAcc.set(r.id, acc);
      for (let i = 0; i < times; i++) hits.push(`点赞满 ${need} → ` + hitText(r.effect, fire(r.effect, '点赞满' + need, r.value, r)));
    }
  } else {
    for (const r of rules) if (r.on && r.src === ev.type && coolOk(r, ev.uid)) { hits.push(hitText(r.effect, fire(r.effect, ev.nick, r.value, r))); break; }
  }
  return hits.length ? hits.join('，') : (ev.type === 'gift' ? '没有匹配规则' : ev.type === 'like' ? '累计中' : '未触发');
}
function receive(raw, forced, via) {
  const ev = normEvent(raw, forced); if (!ev) return;
  if (!S.link.live && via !== '模拟' && via !== '接口') { if (!dupe(ev.id ? 'off:' + ev.type + ':' + ev.id : null)) logEv(via, ev, '接收已关闭，未执行'); return; }
  if (dupe(ev.id ? ev.type + ':' + ev.id : null)) return;
  const res = route(ev, via); if (!(ev.type === 'like' && res === '累计中')) logEv(via, ev, res); refreshBoard();
}
function onAction(p) {
  if (!p || typeof p !== 'object') return; const pa = parseTierAction(p.action), whole = ACTION_ALIAS[String(p.action ?? '').trim()], eff = whole || ACTION_ALIAS[pa.action];
  const tier = whole ? (p.tier !== undefined && p.tier !== null ? String(p.tier) : undefined) : pa.tier ?? (p.tier !== undefined && p.tier !== null ? String(p.tier) : undefined);
  if (dupe(p.actionId !== undefined && p.actionId !== null && p.actionId !== '' ? 'action:' + p.actionId : null)) return;
  if (!eff) { logEv('白曜动作', { type: 'action', nick: String(p.event?.user?.nickname ?? '观众').slice(0, 20), text: String(p.ruleName ?? p.action ?? '').slice(0, 30) }, `不认识的动作「${String(p.action ?? '').slice(0, 20)}」，没有执行`); return; }
  if (!S.link.live && !p.preview) { logEv('白曜动作', { type: 'action', nick: String(p.event?.user?.nickname ?? '观众').slice(0, 20), text: String(p.ruleName ?? p.action).slice(0, 30) }, '接收已关闭，未执行'); return; }
  const nick = String(p.event?.user?.nickname ?? '').trim().slice(0, 20) || '观众';
  const v = Number(p.value), amt = Number.isInteger(v) && v >= 1 ? Math.min(v, EFF[eff].max * 10) : defAmount(eff, tier);
  const got = fire(eff, nick, amt, { tier });
  logEv(p.preview ? '白曜预览' : '白曜动作', { type: 'action', nick, text: String(p.ruleName ?? p.action).slice(0, 30) }, hitText(eff, got));
}

/* ---------- 通道 ---------- */
let sdkOn = false, baiyaoOn = false, ws = null, wsTimer = null, linkText = '本地预览（未接入直播）';
function linkStatus(t) { linkText = t; const el = $('linkStatus'); if (el) el.textContent = t; const dot = $('linkDot'); if (dot) dot.className = sdkOn || baiyaoOn || (ws && ws.readyState === 1) ? 'on' : ''; }
function attachSdk() {
  const B = window.BaiyaoPlugin;
  if (!baiyaoOn && B && typeof B.onAction === 'function') { try { B.onAction(onAction); baiyaoOn = true; } catch (e) { } }
  const SP = window.SonglanPlugin;
  if (!sdkOn && SP && typeof SP.onGift === 'function') {
    sdkOn = true; closeWs();
    for (const [fn, type] of [['onGift', 'gift'], ['onChat', 'chat'], ['onLike', 'like'], ['onFollow', 'follow'], ['onMember', 'member']]) if (typeof SP[fn] === 'function') { try { SP[fn](d => receive(d, type, 'SDK')); } catch (e) { } }
  }
  if (sdkOn || baiyaoOn) linkStatus((sdkOn ? '菘蓝 SDK 已接入' : '') + (sdkOn && baiyaoOn ? ' · ' : '') + (baiyaoOn ? '白曜动作已接入' : '') + ' · 等待互动');
}
function closeWs() { clearTimeout(wsTimer); if (ws) { const o = ws; ws = null; o.onclose = null; try { o.close(); } catch (e) { } } }
function connectWs() {
  clearTimeout(wsTimer); if (sdkOn) return; if (!S.link.ws) { closeWs(); linkStatus('本地预览（本机转发已关闭）'); return; }
  if (ws && ws.readyState < 2) return;
  try {
    const sock = new WebSocket('ws://localhost:' + S.link.port); ws = sock; linkStatus('正在连接本机礼物转发 ' + S.link.port + '…');
    sock.onopen = () => { if (sock !== ws) return; try { sock.send(JSON.stringify({ action: 'identify', module: '自定义插件' })); } catch (e) { } linkStatus('本机礼物通道已连接（' + S.link.port + '）· 等待互动'); };
    sock.onmessage = e => { if (sock !== ws || sdkOn) return; try { const m = JSON.parse(e.data); for (const x of Array.isArray(m) ? m.slice(0, 50) : [m]) receive(x, null, '本机'); } catch (err) { } };
    sock.onerror = () => { try { sock.close(); } catch (e) { } };
    sock.onclose = () => { if (sock !== ws) return; ws = null; if (!sdkOn && S.link.ws) { linkStatus('本机转发未连接，3 秒后重试'); wsTimer = setTimeout(connectWs, 3000); } };
  } catch (e) { linkStatus('当前环境不允许本机连接'); }
}

/* 刁钻垃圾：从启用的易错品种里随机，带送礼人名，每 0.25 秒从工作台上方落一件；主播分错就记「XX 难倒了主播」 */
function trickyGift(name, amount) {
  if (!isGarbage()) return gift('truck', name, amount);
  ensureWork();
  const n = Math.min(amount, EFF.tricky.max, Math.max(0, MAX_WORK - remaining()));
  if (n < 1) { addTag('full:' + name, 'full', name, () => '扔的垃圾没装上（已达上限）', () => tableAnchor(3.28), 0); return 0; }
  const tp = trickyItems(S.garbage.items), pool = tp.length ? tp : GARBAGE, t0 = trickQueue.length ? trickQueue[trickQueue.length - 1].t : 0;
  for (let i = 0; i < n; i++) trickQueue.push({ name, itemId: pool[Math.floor(Math.random() * pool.length)].id, t: t0 + .25 * (i + 1) });
  addTag('tricky:' + name, 'tricky', name, c => `扔来 ${c} 件刁钻垃圾`, () => tableAnchor(3.48), n); sfx.whistle();
  return n;
}
function updTricky(dt) {
  if (state === 'fail') return;
  for (const q of trickQueue) q.t -= dt;
  while (trickQueue.length && trickQueue[0].t <= 0 && activeRoom() >= 1) {
    const q = trickQueue.shift(), g = GARBAGE_BY_ID[q.itemId];
    const b = spawnItem({ kind: 'garbage', itemId: q.itemId, cat: catOf(g, S.garbage.items), name: q.name, trickBy: q.name, pos: (() => { const x = rnd(TABLE.x0 + .9, TABLE.x1 - .9), z = rnd(TABLE.z0 + .7, TABLE.z1 - .7); return { x, y: spawnHeight(x, z, 8.5), z }; })(), vel: { x: 0, y: -5, z: 0 }, ang: { x: rnd(-4, 4), y: rnd(-4, 4), z: rnd(-4, 4) } }); b.launchedAt = time;
    addTag('trickitem:' + b.id, 'tricky', q.name, () => `的刁钻题：${g.name}`, () => b.st === 'gone' || b.st === 'deliver' ? null : b.mesh.position.clone().add(new THREE.Vector3(0, 1.1, 0)), 0, 3.4);
  }
}
function stopAll(quiet = false) {
  for (const t of truck.batches) if (t.name) t.left = 0; truck.batches = truck.batches.filter(t => t.left > 0);
  bigQueue = bigQueue.filter(q => !q.name); helpQueue = []; prankQueue = []; trickQueue.length = 0; pendingTape = []; pendingStrip = []; kickQueue = []; speedSegs = []; auditSegs = []; tags.forEach(t => { if (t.key === 'speed' || t.key === 'audit') t.life = .3; });
  for (const b of bins) { unseal(b); unleak(b); }
  if (!quiet) toast('已停止所有观众效果，清空排队');
}

/* ---------- 画面互动说明牌 ---------- */
const EICON = ICONS;
function srcText(r) { return r.src === 'gift' ? `送「${r.match}」` : r.src === 'chat' ? `弹幕「${r.match}」` : r.src === 'like' ? `点赞每 ${r.match}` : r.src === 'follow' ? '关注主播' : '进直播间'; }
/* 说明牌：规则明确选了某一档才写档名（如「封筐·超重」）；用默认档的规则不写，免得每条都挂一个「·中」 */
function effText(r) { const e = EFF[resolveEffect(r.effect, S.mode)], t = findTier(S.tiers, r.effect, r.tier), lb = effLabel(r.effect, S.mode) + (t ? '·' + t.name : ''); return r.effect === 'kick' ? `${lb}${r.value > 1 ? ' ×' + r.value : ''}` : `${lb} ${r.value}${e.unit}${r.src === 'gift' ? '/个' : ''}`; }
let boardPage = 0, boardT = 0;
function boardList() {
  const on = rules.filter(r => r.on), pin = on.filter(r => r.src === 'like').slice(0, 1), rest = on.filter(r => r.src !== 'like');
  const pages = Math.max(1, Math.ceil(rest.length / 5)); boardPage %= pages;
  return { list: [...rest.slice(boardPage * 5, boardPage * 5 + 5), ...pin], pages };
}
function tickBoard(dt) { boardT += dt; if (boardT > 6) { boardT = 0; const { pages } = boardList(); if (pages > 1) { boardPage = (boardPage + 1) % pages; const ul = $('board').querySelector('ul'); ul.classList.remove('flip'); void ul.offsetWidth; ul.classList.add('flip'); refreshBoard(); } } }
function refreshBoard(rebuild) {
  const box = $('board'); if (!box) return;
  box.hidden = !S.layout.board.on || !rules.some(r => r.on);
  const { list, pages } = boardList(); box.querySelector('h4 small').textContent = pages > 1 ? `${boardPage + 1}/${pages}` : '';
  if (rebuild || box.dataset.sig !== JSON.stringify(list)) {
    box.dataset.sig = JSON.stringify(list); const ul = box.querySelector('ul'); ul.replaceChildren();
    for (const r of list) {
      const li = document.createElement('li'); li.dataset.rid = r.id;
      const ic = document.createElement('span'); ic.className = 'ic'; ic.style.background = ICBG[r.effect]; ic.innerHTML = EICON[r.effect];
      const a = document.createElement('span'); a.className = 'k'; a.textContent = srcText(r);
      const b = document.createElement('span'); b.className = 'v'; b.textContent = effText(r);
      li.append(ic, a, b);
      if (r.src === 'like') { const bar = document.createElement('i'); bar.className = 'bar'; li.append(bar); }
      ul.append(li);
    }
  }
  for (const r of list) if (r.src === 'like') { const el = box.querySelector(`li[data-rid="${r.id}"] .bar`); if (el) el.style.setProperty('--p', Math.min(1, (likeAcc.get(r.id) || 0) / Number(r.match))); }
}

/* ---------- 面板：规则编辑 ---------- */
function toast(t) { const el = $('toast'); if (!el) return; el.textContent = t; el.classList.add('show'); clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('show'), 2600); }
/* 档位下拉：先列「默认（当前默认档名）」，再列这种互动的全部档位；记住的档位被删了就显示默认 */
function tierOptions(sel, effect, cur) {
  const list = S.tiers[effect] || DEFAULT_TIERS[effect], hit = findTier(S.tiers, effect, cur);
  sel.replaceChildren(new Option(`默认（${defaultTier(list).name}）`, ''), ...list.map(t => new Option(t.name, t.id)));
  sel.value = hit ? hit.id : '';
}
function ruleRow(r) {
  const row = document.createElement('div'); row.className = 'rule'; row.dataset.id = r.id;
  row.innerHTML = `<div class="l1"><input type="checkbox" class="on" title="启用"><select class="src"></select><input class="match" maxlength="40"><button class="t" title="按这条规则测试">测试</button><button class="x" title="删除">×</button></div><div class="l2"><select class="eff" title="效果"></select><select class="tier" title="档位：其他参数按这一档"></select><input type="number" class="val" min="1"><span class="unit"></span><label class="cdw">冷却<input type="number" class="cd" min="0" max="3600">秒</label></div>`;
  const q = c => row.querySelector(c);
  for (const [k, v] of Object.entries(SRC)) q('.src').append(new Option(v, k));
  for (const e of EFFECTS) q('.eff').append(new Option(e.id === 'tricky' && S.mode !== 'garbage' ? '刁钻垃圾（快递=又来一车）' : effLabel(e.id, S.mode), e.id));
  q('.on').checked = r.on; q('.src').value = r.src; q('.match').value = r.match; q('.eff').value = r.effect; tierOptions(q('.tier'), r.effect, r.tier); q('.val').value = r.value; q('.cd').value = r.cd;
  const sync = () => { const s = q('.src').value, e = EFF[q('.eff').value]; q('.match').placeholder = s === 'gift' ? '礼物名，如 玫瑰' : s === 'chat' ? '弹幕里包含的字，如 加班' : s === 'like' ? '累计多少赞触发，如 300' : '（任何观众）'; q('.match').disabled = s === 'follow' || s === 'member'; q('.match').type = s === 'like' ? 'number' : 'text'; q('.val').max = e.max; q('.unit').textContent = e.unit + (s === 'gift' ? '/个' : ''); q('.cdw').style.visibility = s === 'like' ? 'hidden' : 'visible'; };
  q('.src').onchange = sync; q('.eff').onchange = () => { q('.val').value = Math.min(Number(q('.val').value) || 1, EFF[q('.eff').value].max); tierOptions(q('.tier'), q('.eff').value, ''); sync(); };
  q('.x').onclick = () => row.remove();
  q('.t').onclick = () => { try { const r2 = validRule(readRow(row), 0); au(); fire(r2.effect, ($('nm').value || '').trim() || '测试观众', r2.value, r2); toast(`已按「${srcText(r2)} → ${effText(r2)}」测试`); } catch (e) { toast(e.message); } };
  sync(); return row;
}
function readRow(row) { const q = c => row.querySelector(c); return { id: row.dataset.id, on: q('.on').checked, src: q('.src').value, match: q('.match').value, effect: q('.eff').value, tier: q('.tier').value, value: Number(q('.val').value), cd: Number(q('.cd').value || 0) }; }
function renderRules() { const box = $('ruleList'); box.replaceChildren(...rules.map(ruleRow)); }
function renderLog() {
  const box = $('evLog'); if (!box) return; box.replaceChildren();
  if (!evLog.length) { box.textContent = '还没有收到互动。可以用上面的「模拟直播事件」按规则测试。'; return; }
  for (const x of evLog.slice(0, 14)) {
    const d = document.createElement('div'); const ev = x.ev;
    const what = ev.type === 'gift' ? `送 ${ev.name} ×${ev.count}` : ev.type === 'chat' ? `弹幕：${ev.text}` : ev.type === 'like' ? `点赞 ×${ev.count}` : ev.type === 'follow' ? '关注了主播' : ev.type === 'member' ? '进入直播间' : `动作：${ev.text}`;
    d.textContent = `${x.t.toTimeString().slice(0, 8)} [${x.via}] ${ev.nick} ${what} → ${x.result}`; box.append(d);
  }
}

/* ================= 管理面板 ================= */
const isPanelOpen = () => document.body.classList.contains('panel-open');
function togglePanel(on) {
  if (document.body.classList.contains('layout-mode')) return;
  document.body.classList.toggle('panel-open', on === undefined ? !isPanelOpen() : on);
  if (isPanelOpen()) { fillPanel(); renderLog(); }
}
$('gear').onclick = () => togglePanel(); $('pclose').onclick = () => togglePanel(false);
// 双击画面空白处开关设置（和其他插件一致）。双击的任何一下按到了按钮、面板、物件或筐（包括刚被点掉的盲盒、封筐），都不算
let lastHitT = -1e9;
addEventListener('pointerdown', e => { if (e.target.closest?.('button,input,select,textarea,label,#panel,.inline-select-popup,.edit-frame,.head-edit,#layoutBar,#counter,#board')) lastHitT = performance.now(); }, true);
addEventListener('dblclick', e => {
  if (performance.now() - lastHitT < 600) return;
  if (e.target.closest('#panel,.inline-select-popup,#layoutBar')) return;
  if (document.body.classList.contains('layout-mode')) { setLayoutMode(false); return; }
  if (e.target === canvas && (pickAt(e.clientX, e.clientY) || pickBinAt(e.clientX, e.clientY))) return;
  togglePanel();
});
for (const el of [$('panel')]) { el.addEventListener('pointerdown', e => e.stopPropagation()); }

/* ---------- 测试页 ---------- */
const FX_BTN = [['truck', 'b1'], ['blind', 'b2'], ['seal', 'b5'], ['speed', 'b8'], ['leak', 'b9'], ['strip', 'b10'], ['tape', 'b6'], ['kick', 'b7'], ['help', 'b3'], ['audit', 'b11'], ['tricky', 'b12'], ['prank', 'b13']];
const FX_KEY = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '', ''];
function fxHint(t) {
  const T = tierOf(S.tiers, t), G = isGarbage(), nb = Math.min(T.bins || 1, bins.length);   // 快递只有 3 个筐，档位写 4 个也只封 3 个
  return ({ truck: `+${T.amt} 件`, blind: `点 ${T.hits} 下炸出 ${T.amt} 件`, seal: `封 ${nb} 个 ${T.amt} 秒`, speed: `${T.mul} 倍速 ${T.amt} 秒`, leak: `漏 ${nb} 个 ${T.amt} 秒`, strip: `${T.amt} 件要${G ? '识别' : '扫码'}`, tape: `${T.amt} 件 ${T.layers} 层`, kick: `踹 ${T.amt} 脚 · 力度 ${T.power}`, help: `帮收 ${T.amt} 件`, audit: `${T.amt} 秒内 ×${Math.max(T.mult, S.play.mult)}`, tricky: G ? `扔 ${T.amt} 件易错垃圾` : `快递模式 = +${T.amt} 件`, prank: `丢错 ${T.amt} 件` })[t];
}
function renderFxBtns() { $('restart').textContent = S.endless ? '清空重开' : '重开本关'; $('fxBtns').replaceChildren(...FX_BTN.map(([t, c], i) => { const b = document.createElement('button'); b.className = c; b.dataset.g = t; b.innerHTML = `${FX_KEY[i] ? FX_KEY[i] + ' ' : ''}${t === 'tricky' ? EFF.tricky.label.garbage : effLabel(t, S.mode)}<small></small>`; b.querySelector('small').textContent = fxHint(t); b.onclick = () => { au(); gift(t, $('nm').value); }; return b; })); }
function bulkCount() { const n = Number($('bulkCount').value); if (!Number.isInteger(n) || n < 1 || n > 50000) { toast('加件数量须为 1–50000 的整数'); return 0; } return n; }
function fitWholePile() {
  let top = 0; for (const b of boxes) top = Math.max(top, b.mesh.position.y + b.dims[1]);
  pileFit = []; if (top > 4) for (const x of [PLAT.x0, PLAT.x1]) for (const z of [PLAT.z0, PLAT.z1]) for (const y of [0, top]) pileFit.push(new THREE.Vector3(x, y, z));
  fitCamera();
}
function pileCells(scale = 1) {
  const cells = [], guards = binRearGuards(STAGE, S.mode, BIN);
  let rayTop = 900; for (const b of boxes) rayTop = Math.max(rayTop, b.mesh.position.y + b.dims[1] + 10);
  for (let x = PLAT.x0 + .8; x < PLAT.x1 - .6; x += 1.2 * scale) for (let z = PLAT.z0 + .8; z < PLAT.z1 - .6; z += 1.2 * scale) {
    if (bins.some(b => Math.abs(x-b.x) < BIN.w/2+.45 && Math.abs(z-b.z) < BIN.d/2+.75)) continue;
    if (x > BELT.x0-.5 && x < BELT.x1+.5 && Math.abs(z-BELT.z) < BELT.w/2+.5) continue;
    if (x > DOCK.x0-.5 && x < DOCK.x1+.5 && z > DOCK.z0-.5 && z < DOCK.z1+.5) continue;
    const hit = world.castRay(new RAPIER.Ray({x,y:rayTop,z},{x:0,y:-1,z:0}),rayTop+100,true,undefined,SCENE_QUERY);
    let height = hit ? rayTop-hit.timeOfImpact : 0;
    for (const g of guards) if(x>=g.x0&&x<=g.x1&&z>=g.z0&&z<=g.z1) height=Math.max(height,g.y1);
    cells.push({x,z,height,weight:Math.hypot(x-(TABLE.x0+TABLE.x1)/2,z-(TABLE.z0+TABLE.z1)/2)*.15});
  }
  return cells;
}
async function pilePreview(want) {
  if (bulkBuilding) { toast('正在生成，完成后可继续加件'); return 0; }
  setDemo(false); ensureWork();
  const n = Math.min(want, activeRoom(), Math.max(0, MAX_WORK - remaining())), scale = Number($('bulkScale').value);
  if (!Number.isFinite(scale) || scale < .1 || scale > 1) { toast('物件大小须为0.1–1倍'); return 0; }
  if (n > 500) {
    const job = ++bulkJob, cells = pileCells(scale); let made = 0; bulkBuilding = true;
    try {
      while (made < n && job === bulkJob) {
        const count = Math.min(100,n-made,activeRoom()); if (!count) break;
        for(let j=0;j<count;j++) {
          let cell=cells[0]; for(const c of cells) if(c.height+c.weight<cell.height+cell.weight) cell=c;
          const b=spawnItem({...randomItem(),scale,resting:true,pos:{x:cell.x,y:cell.height,z:cell.z}});
          b.body.setTranslation({x:cell.x,y:cell.height+b.dims[1]/2+.02,z:cell.z},true);
          b.body.setRotation(new THREE.Quaternion().setFromEuler(new THREE.Euler(0,rnd(-.12,.12),0)),true);
          cell.height+=b.dims[1]+.04*scale; freezeBox(b); made++;
        }
        refreshHud(true); toast(`正在放入场景 ${made} / ${n} 件`);
        await new Promise(requestAnimationFrame);
      }
      if (job === bulkJob) { toast(`场上新增 ${made} 件，可逐件抓取${made<want?'；更多请提高场上上限':''}`); }
      return made;
    } finally { if (job === bulkJob) bulkBuilding = false; }
  }
  for (let i = 0; i < n; i++) {
    const x = rnd(TABLE.x0 + .6, TABLE.x1 - 1.8), z = rnd(TABLE.z0 + .35, TABLE.z1 - .35);
    spawnItem({ ...randomItem(), scale, pos: { x, y: spawnHeight(x, z, TABLE.top + 1.5 + Math.random() * 3), z }, ang: { x: rnd(-3, 3), y: rnd(-3, 3), z: rnd(-3, 3) } });
  }
  refreshHud(true); toast(`已在台面堆入 ${n} 件${n < want ? '（达到场上容量；更多请提高场上上限）' : ''}`); return n;
}
$('bulkTruck').onclick = () => { const n = bulkCount(); if (n) { setDemo(false); const got = gift('truck', $('nm').value || '堆积测试', n); refreshHud(true); toast(`已接收 ${got} / ${n} 件，货车按空位分批卸货`); } };
$('bulkPile').onclick = () => { const n = bulkCount(); if (n) pilePreview(n); };
$('bulkCap').value = S.play.cap;
$('bulkCap').onchange = () => { const n = Number($('bulkCap').value); if (Number.isInteger(n) && n >= 1 && n <= 50000) { S.play.cap = n; save(); } else toast('场上上限须为1–50000的整数'); $('bulkCap').value = S.play.cap; };
$('bulkCap').oninput = () => { const n = Number($('bulkCap').value); if (Number.isInteger(n) && n >= 1 && n <= 50000) { S.play.cap = n; save(); } };
$('fitPile').onclick = fitWholePile;
$('normalView').onclick = () => { pileFit = []; fitCamera(); };
document.querySelector('[data-g="combo"]').onclick = () => { au(); const n = $('nm').value.trim() || NAMES[Math.floor(Math.random() * NAMES.length)]; for (let i = 0; i < 5; i++) setTimeout(() => gift('truck', n), i * 220); };
$('demoBtn').onclick = () => { au(); setDemo(!demo.on); };
$('restart').onclick = e => { if (S.endless) armClick(e.target, '清空重开', () => { setDemo(false); startLevel(); }); else { setDemo(false); startLevel(); } };
$('stopAll').onclick = () => stopAll();
$('nextBtn').onclick = () => { state === 'done' ? nextLevel() : startLevel(); };
function applyBg() { $('bg').className = S.bg === 'none' ? '' : S.bg; document.querySelectorAll('#bgSeg button').forEach(b => b.classList.toggle('on', b.dataset.bg === S.bg)); }
document.querySelectorAll('#bgSeg button').forEach(b => b.onclick = () => { S.bg = b.dataset.bg; applyBg(); save(); });
$('simSend').onclick = () => { const type = $('simType').value, nick = ($('nm').value || '').trim() || NAMES[Math.floor(Math.random() * NAMES.length)], v = $('simText').value.trim(), c = Math.max(1, Math.min(1000, Number($('simCount').value) || 1)); const raw = { type, eventId: 'sim-' + Date.now() + Math.random(), nickName: nick, userId: 'sim-' + nick }; if (type === 'gift') { if (!v) { toast('填写礼物名'); return; } raw.giftName = v; raw.count = c; } else if (type === 'chat') { if (!v) { toast('填写弹幕内容'); return; } raw.content = v; } else if (type === 'like') raw.count = c; receive(raw, type, '模拟'); renderLog(); const last = evLog[0]; if (last) toast(last.result); };
$('simType').onchange = () => { const t = $('simType').value; $('simText').placeholder = t === 'gift' ? '礼物名' : t === 'chat' ? '弹幕内容' : '（不用填）'; $('simText').disabled = t !== 'gift' && t !== 'chat'; $('simCount').disabled = t !== 'gift' && t !== 'like'; };

/* ---------- 关卡页（快递、垃圾两种玩法各一套关卡） ---------- */
const LEVEL_RANGE = { red: [0, 99], yellow: [0, 99], blue: [0, 99], tape: [0, 60], strip: [0, 60], rec: [0, 99], haz: [0, 99], kit: [0, 99], oth: [0, 99], bag: [0, 60], mud: [0, 60], blind: [0, 5], blindSize: [2, 20], speed: [.3, 3], time: [0, 3600] };
let draftLevels = null;
const fieldLabel = (k, lab) => S.garbage.naming === 'shanghai' && (k === 'kit' || k === 'oth') ? (k === 'kit' ? '湿垃圾' : '干垃圾') : lab;
function levelCard(l, i) {
  const card = document.createElement('div'); card.className = 'card' + (l.id && l.id === runLevel?.id ? ' cur' : '');
  const hd = document.createElement('div'); hd.className = 'hd';
  const nm = document.createElement('input'); nm.value = l.name; nm.maxLength = 16; nm.oninput = () => { l.name = nm.value; };
  const mk = (t, fn, cls) => { const b = document.createElement('button'); b.textContent = t; if (cls) b.className = cls; b.onclick = fn; return b; };
  hd.append(document.createTextNode(`第 ${i + 1} 关`), nm,
    mk('▶ 开始', () => { commitLevels(true); startLevel(i); fillLevels(); toast(`开始第 ${i + 1} 关`); }, 'go'),
    mk('↑', () => { if (i > 0) { [draftLevels[i - 1], draftLevels[i]] = [draftLevels[i], draftLevels[i - 1]]; renderLevelCards(); } }),
    mk('↓', () => { if (i < draftLevels.length - 1) { [draftLevels[i + 1], draftLevels[i]] = [draftLevels[i], draftLevels[i + 1]]; renderLevelCards(); } }),
    mk('×', () => { if (draftLevels.length <= 1) { toast('至少保留一关'); return; } draftLevels.splice(i, 1); renderLevelCards(); }));
  const g = document.createElement('div'); g.className = 'lvgrid';
  for (const [k, lab, cls] of LEVEL_FIELDS[S.mode]) { const w = document.createElement('label'); if (cls) w.className = cls; const inp = document.createElement('input'); inp.type = 'number'; const [a, b] = LEVEL_RANGE[k]; inp.min = a; inp.max = b; inp.step = k === 'speed' ? .1 : 1; inp.value = l[k]; inp.oninput = () => { l[k] = Number(inp.value); }; w.append(fieldLabel(k, lab), inp); g.append(w); }
  card.append(hd, g); return card;
}
function renderLevelCards() { $('levelList').replaceChildren(...draftLevels.map(levelCard)); }
function fillLevels() { $('endlessMode').checked = S.endless; $('legacyLevels').hidden = S.endless; draftLevels = clone(curLevels()); renderLevelCards(); $('sAfter').value = S.afterLevel; $('sAutoSec').value = S.autoNextSec; $('sLoop').checked = S.loopLevels; fillGarbage(); }
$('endlessMode').onchange = () => { S.endless = $('endlessMode').checked; setDemo(false); if (S.endless) { state = 'work'; overtime = false; showResult(null); } else startLevel(); save(); fillLevels(); renderFxBtns(); refreshHud(true); };
function commitLevels(quiet) {
  const list = draftLevels.map(S.mode === 'garbage' ? cleanGLevel : cleanLevel);
  if (S.mode === 'garbage') S.glevels = list; else S.levels = list;
  const at = list.findIndex(l => l.id === runLevel?.id); setIdx(at >= 0 ? at : clamp(curIdx(), 0, list.length - 1));
  save(); draftLevels = clone(list); if (!quiet) { renderLevelCards(); toast('关卡已保存，下一次开始关卡时生效'); } refreshHud(true);
}
$('addLevel').onclick = () => { if (draftLevels.length >= 30) { toast('最多 30 关'); return; } const last = draftLevels[draftLevels.length - 1]; draftLevels.push({ ...clone(last), id: '', name: `第 ${draftLevels.length + 1} 关` }); renderLevelCards(); };
$('saveLevels').onclick = () => commitLevels();
$('resetLevels').onclick = e => armClick(e.target, '恢复示例关卡', () => { draftLevels = clone(S.mode === 'garbage' ? DEFAULT_GLEVELS : DEFAULT_LEVELS).map(l => ({ ...l, id: '' })); renderLevelCards(); commitLevels(); });
$('sAfter').onchange = () => { S.afterLevel = $('sAfter').value; save(); };
$('sAutoSec').onchange = () => { const v = Number($('sAutoSec').value); if (Number.isInteger(v) && v >= 2 && v <= 60) { S.autoNextSec = v; save(); } else $('sAutoSec').value = S.autoNextSec; };
$('sLoop').onchange = () => { S.loopLevels = $('sLoop').checked; save(); };
function fillGarbage() {
  const box = $('garbageCfg'); if (!box) return; box.hidden = !isGarbage(); if (!isGarbage()) return;
  $('gNaming').value = S.garbage.naming; $('gNaming').onchange = () => { S.garbage.naming = $('gNaming').value; save(); refreshBinLabels(); renderLevelCards(); fillGarbage(); refreshBoard(true); };
  $('gNames').checked = S.garbage.names; $('gNames').onchange = () => { S.garbage.names = $('gNames').checked; save(); };
  const ov = S.garbage.items, list = $('gItems'), groups = [[], [], [], []];
  for (const g of GARBAGE) groups[g.cat].push(g);
  list.replaceChildren(...groups.flatMap((items, c) => [Object.assign(document.createElement('div'), { className: 'gcat g' + c, textContent: binName(c, S.garbage.naming) }), ...items.map(g => {
    const row = document.createElement('label'); row.className = 'gitem';
    const on = document.createElement('input'); on.type = 'checkbox'; on.checked = ov[g.id]?.on !== false;
    const sel = document.createElement('select'); for (let k = 0; k < 4; k++) sel.append(new Option(binName(k, S.garbage.naming), k)); sel.value = String(catOf(g, ov));
    const nm = document.createElement('span'); nm.textContent = g.name + (g.tricky ? ' ★' : ''); nm.title = g.why;
    const put = () => { const o = { ...(ov[g.id] || {}) }; if (on.checked) delete o.on; else o.on = false; const c = Number(sel.value); if (c === g.cat) delete o.cat; else o.cat = c; if (Object.keys(o).length) ov[g.id] = o; else delete ov[g.id]; save(); };
    on.onchange = put; sel.onchange = put; row.append(on, nm, sel); return row;
  })]));
}
function armClick(btn, label, fn) { if (btn.dataset.arm !== '1') { btn.dataset.arm = '1'; btn.textContent = '再点一次确认'; setTimeout(() => { btn.dataset.arm = ''; btn.textContent = label; }, 3500); return; } btn.dataset.arm = ''; btn.textContent = label; fn(); }

/* ---------- 互动规则页 ---------- */
$('addRule').onclick = () => { if ($('ruleList').children.length >= 60) { toast('最多 60 条规则'); return; } const r = { id: 'r' + Date.now().toString(36), on: true, src: 'gift', match: '', effect: 'truck', value: 1, cd: 0 }; $('ruleList').append(ruleRow(r)); };
$('saveRules').onclick = () => { try { rules = validRules([...$('ruleList').children].map(readRow)); likeAcc.clear(); saveRules(); refreshBoard(true); toast('互动规则已保存'); } catch (e) { toast(e.message); } };
$('resetRules').onclick = e => armClick(e.target, '恢复示例规则', () => { rules = DEFAULT_RULES.map(r => ({ ...r })); saveRules(); renderRules(); refreshBoard(true); toast('已恢复示例规则'); });

/* ---------- 参数页 ---------- */
/* 互动分档表：每种互动一张卡，一档一行（名字、这种互动的全部参数、默认档、试一下、删除），档位数量自定，最多 MAX_TIERS 档 */
function tierChanged(id) { save(); renderFxBtns(); refreshBoard(true); if (curTab === 'rules') renderRules(); }
function tierCard(id) {
  const list = S.tiers[id], params = TIER_PARAMS[id], card = document.createElement('div'); card.className = 'card tiercard';
  const hd = document.createElement('div'); hd.className = 'hd'; hd.textContent = (id === 'tricky' ? EFF.tricky.label.garbage + (isGarbage() ? '' : '（快递模式按「又来一车」）') : effLabel(id, S.mode)) + ` · ${list.length} 档`; card.append(hd);
  const g = document.createElement('div'); g.className = 'tiergrid'; g.style.gridTemplateColumns = `minmax(52px,1fr) repeat(${params.length},54px) 30px 30px 24px`;
  g.append(Object.assign(document.createElement('b'), { textContent: '档位' }), ...params.map(([k, label]) => Object.assign(document.createElement('b'), { textContent: label + (k === 'amt' ? `（${EFF[id].unit}）` : '') })), Object.assign(document.createElement('b'), { textContent: '默认' }), document.createElement('b'), document.createElement('b'));
  list.forEach((t, i) => {
    const nm = document.createElement('input'); Object.assign(nm, { value: t.name, maxLength: 8, className: 'tname', title: '档位名字（规则、说明牌、白曜动作后缀用这个名字）' });
    nm.onchange = () => { const raw = nm.value.trim(), v = cleanTierName(raw); if (v && !list.some(x => x !== t && x.name === v)) { t.name = v; tierChanged(id); } else toast(!raw ? '档位名字不能为空' : !v ? '档位名字不能只是数字（数字留给「第几档」的写法）' : '同一种互动里档位名字不能重复'); nm.value = t.name; };
    g.append(nm);
    for (const [k, , lo, hi, step] of params) {
      const inp = document.createElement('input'); Object.assign(inp, { type: 'number', min: lo, max: hi, step, value: t[k] });
      inp.onchange = () => { const v = Number(inp.value); if (Number.isFinite(v) && v >= lo && v <= hi) { t[k] = fixParam(id, k, v); tierChanged(id); } inp.value = t[k]; };
      g.append(inp);
    }
    const def = document.createElement('input'); Object.assign(def, { type: 'radio', name: 'tdef-' + id, checked: !!t.def, title: '设为默认档（测试按钮、快捷键、没选档位的规则用它）' });
    def.onchange = () => { list.forEach(x => { x.def = x === t; }); tierChanged(id); fillFx(); };
    const run = document.createElement('button'); Object.assign(run, { textContent: '▶', title: '按这一档试一下', className: 'trun' }); run.onclick = () => { au(); gift(id, $('nm').value, undefined, t.id); };
    const del = document.createElement('button'); Object.assign(del, { textContent: '×', title: '删除这一档（用它的规则改用默认档）', className: 'tdel' }); del.disabled = list.length <= 1;
    del.onclick = () => { if (list.length <= 1) return; list.splice(i, 1); if (!list.some(x => x.def)) list[0].def = true; tierChanged(id); fillFx(); toast(`已删除「${t.name}」，选了它的规则改用默认档`); };
    g.append(def, run, del);
  });
  card.append(g);
  const add = document.createElement('button'); add.className = 'tadd'; add.textContent = list.length >= MAX_TIERS ? `最多 ${MAX_TIERS} 档` : '＋ 加一档'; add.disabled = list.length >= MAX_TIERS;
  add.onclick = () => { if (list.length >= MAX_TIERS) return; list.push(newTier(list)); tierChanged(id); fillFx(); };
  card.append(add); return card;
}
function fillFx() {
  const keep = $('panel').scrollTop; $('tierCards').replaceChildren(...EFFECTS.map(e => tierCard(e.id))); $('panel').scrollTop = keep;
  bindRange('fBelt', () => S.beltSpeed, v => S.beltSpeed = v, v => v.toFixed(1) + '×');
  bindRange('fGap', () => S.feedGap, v => S.feedGap = v, v => v.toFixed(1) + ' 秒');
  $('tierReset').onclick = e => armClick(e.target, '分档恢复默认', () => { S.tiers = JSON.parse(JSON.stringify(DEFAULT_TIERS)); save(); fillFx(); renderFxBtns(); refreshBoard(true); toast('互动分档已恢复默认'); });
  $('pMult').value = String(S.play.mult); $('pMult').onchange = () => { S.play.mult = Number($('pMult').value); save(); renderFxBtns(); };
  const P = S.play;
  $('pWrong').value = P.wrong; $('pWrong').onchange = () => { P.wrong = $('pWrong').value; save(); };
  $('pCap').value = P.cap; $('pCap').onchange = () => { const v = Number($('pCap').value); if (Number.isInteger(v) && v >= 1 && v <= 50000) { P.cap = v; $('bulkCap').value = v; save(); } else toast('场上上限须为1–50000的整数'); $('pCap').value = P.cap; };
  $('pRange').value = P.range; $('pRange').onchange = () => { P.range = $('pRange').value; save(); markBoundsDirty(); };
  $('pBack').value = P.back; $('pBack').onchange = () => { P.back = $('pBack').value; save(); markBoundsDirty(); };
  $('pBack').closest('label').hidden = STAGE.backZ != null;   // 柜台布局的后墙固定贴着柜台
  $('pBlob').checked = P.blob; $('pBlob').onchange = () => { P.blob = $('pBlob').checked; save(); requestRender(); };
}
function bindRange(id, get, set, fmt, after) {
  const el = $(id), out = $(id + 'V'); el.value = get(); if (out) out.textContent = fmt(get());
  el.oninput = () => { const v = Number(el.value); set(v); if (out) out.textContent = fmt(v); after && after(); save(); };
}

/* ---------- 画面页 ---------- */
const SCENE_PRESETS = { full: { x: 0, y: 0, w: 100, h: 100 }, bottom: { x: 0, y: 34, w: 100, h: 66 }, strip: { x: 0, y: 58, w: 100, h: 42 }, bl: { x: 0, y: 45, w: 55, h: 55 }, br: { x: 45, y: 45, w: 55, h: 55 } };
/* 换布局：记下当前布局的分拣台位置和视角，换上另一个布局记着的（没有就用它的默认），存档后重新载入页面 */
function switchStage(nx) {
  if (nx === STAGE.id || !STAGE_IDS.includes(nx)) return;
  const L = S.layout; L.saved[STAGE.id] = { scene: { ...L.scene }, cam: { ...L.cam } };
  const v = L.saved[nx] || stageOf(nx).view; L.scene = { ...v.scene }; L.cam = { ...v.cam }; L.stage = nx;
  save(true); toast('正在切换分拣台布局…'); setTimeout(() => location.reload(), 250);
}
function fillView() {
  const L = S.layout, C = L.cam;
  $('pStage').replaceChildren(...STAGE_IDS.map(id => new Option(STAGE_LABEL[id], id))); $('pStage').value = STAGE.id; $('pStage').onchange = () => switchStage($('pStage').value);
  $('hOn').checked = L.head.on; $('hOn').onchange = () => { L.head.on = $('hOn').checked; save(); markBoundsDirty(); };
  bindRange('hR', () => L.head.r, v => { L.head.r = v; markBoundsDirty(); headEd.sync(); }, v => v + '%');
  $('hEdit').onclick = () => editHead();
  $('hReset').onclick = () => { Object.assign(L.head, { x: DEFAULTS.layout.head.x, y: DEFAULTS.layout.head.y, r: DEFAULTS.layout.head.r }); save(); markBoundsDirty(); fillView(); toast('露头圆已回到默认位置'); };
  for (const [id, k] of [['scX', 'x'], ['scY', 'y'], ['scW', 'w'], ['scH', 'h']]) { const el = $(id); el.value = Math.round(L.scene[k]); el.onchange = () => { const v = Number(el.value); if (Number.isFinite(v)) { L.scene[k] = clamp(v, k === 'w' || k === 'h' ? 10 : -50, k === 'w' || k === 'h' ? 150 : 100); save(); applyStage(); } el.value = Math.round(L.scene[k]); }; }
  document.querySelectorAll('#scenePresets button').forEach(b => b.onclick = () => { Object.assign(L.scene, SCENE_PRESETS[b.dataset.p]); save(); applyStage(); fillView(); });
  document.querySelectorAll('#camPresets button').forEach(b => { b.classList.toggle('on', C.view === b.dataset.v); b.onclick = () => { C.view = b.dataset.v; Object.assign(C, CAM_VIEWS[C.view]); C.zoom = 100; C.panX = C.panY = 0; save(); fitCamera(); fillView(); }; });
  const cam = (id, k, fmt) => bindRange(id, () => C[k], v => { C[k] = v; C.view = 'custom'; }, fmt, () => { fitCamera(); document.querySelectorAll('#camPresets button').forEach(b => b.classList.remove('on')); });
  cam('cPitch', 'pitch', v => v + '°'); cam('cYaw', 'yaw', v => v + '°'); cam('cZoom', 'zoom', v => v + '%'); cam('cPanX', 'panX', v => v + '%'); cam('cPanY', 'panY', v => v + '%');
  for (const [o, sId, key] of [['oCounter', 'sCounter', 'counter'], ['oBoard', 'sBoard', 'board'], ['oTags', 'sTags', 'tags']]) {
    $(o).checked = L[key].on; $(o).onchange = () => { L[key].on = $(o).checked; save(); applyLayout(); };
    bindRange(sId, () => L[key].s, v => L[key].s = v, v => v + '%', applyLayout);
  }
  for (const [id, key] of [['oBadges', 'badges'], ['oBinCount', 'binCounts'], ['oCursor', 'cursor']]) { $(id).checked = L[key]; $(id).onchange = () => { L[key] = $(id).checked; save(); applyLayout(); }; }
  bindRange('pScale', () => S.panel.scale, v => S.panel.scale = v, v => v + '%', applyPanel);
  $('pSide').value = S.panel.side; $('pSide').onchange = () => { S.panel.side = $('pSide').value; save(); applyPanel(); };
  $('sSound').checked = S.sound; $('sSound').onchange = () => { S.sound = $('sSound').checked; save(); };
  bindRange('sVol', () => S.volume, v => S.volume = v, v => v + '%', () => { if (master) master.gain.value = S.volume / 100; });
  $('pfScale').value = String(S.perf.scale); $('pfScale').onchange = () => { S.perf.scale = Number($('pfScale').value); save(); resize(); };
  $('pfFps').value = String(S.perf.fps); $('pfFps').onchange = () => { S.perf.fps = Number($('pfFps').value); save(); };
  $('pfShadow').value = S.perf.shadow; $('pfShadow').onchange = () => { S.perf.shadow = $('pfShadow').value; save(); applyShadow(); };
  $('pfIdle').checked = S.perf.idle; $('pfIdle').onchange = () => { S.perf.idle = $('pfIdle').checked; save(); };
  $('pfAa').checked = S.perf.aa; $('pfAa').onchange = () => { S.perf.aa = $('pfAa').checked; save(true); toast('抗锯齿设置已保存，刷新页面后生效'); };
}
function applyPanel() { const p = $('panel'); p.style.transform = `scale(${S.panel.scale / 100})`; document.body.classList.toggle('panel-left', S.panel.side === 'left'); p.style.maxHeight = `calc(${100 / (S.panel.scale / 100)}vh - ${28 / (S.panel.scale / 100)}px)`; }
function applyShadow() {
  const m = S.perf.shadow, en = m !== 'off';
  if (renderer.shadowMap.enabled !== en) { renderer.shadowMap.enabled = en; scene.traverse(o => { if (o.material) for (const mm of [].concat(o.material)) mm.needsUpdate = true; }); }
  const sz = m === 'soft' ? 2048 : 1024; if (sun.shadow.mapSize.x !== sz) { sun.shadow.mapSize.set(sz, sz); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
  sun.shadow.radius = m === 'soft' ? 3 : 1; requestRender(true);
}
$('layoutEdit').onclick = () => setLayoutMode(true);
$('layoutReset').onclick = e => armClick(e.target, '布局恢复默认', () => { S.layout = defaultLayout(STAGE.id, S.layout.saved); save(); applyLayout(); fitCamera(); fillView(); toast('布局已恢复默认'); });

/* ---------- 布局调整模式：拖动场景 / 计数牌 / 说明牌，拖圆点改大小 ---------- */
function setLayoutMode(on) {
  document.body.classList.toggle('layout-mode', on);
  if (on) { document.body.classList.remove('panel-open'); for (const id of ['counter', 'board']) $(id).classList.remove('off'); $('board').hidden = false; if (S.layout.head.on) headEd.open({ bar: false }); }
  else { headEd.close(); applyLayout(); save(true); togglePanel(true); }
}
/* 露头圆编辑：从画面页"调整位置和大小"进入，面板收起；完成后虚线框消失 */
const headEd = createHeadEditor({
  getHead: () => S.layout.head,
  setHead: h => { Object.assign(S.layout.head, h); },
  onChange: () => { save(); markBoundsDirty(); requestRender(); },
  onDone: () => { save(true); markBoundsDirty(); if (!document.body.classList.contains('layout-mode')) togglePanel(true); toast('露头圆位置已保存'); },
  warnText: () => headOverlapsStation() ? '圆压到了分拣台，台上的件会被推开' : '',
});
function editHead() { if (!S.layout.head.on) { S.layout.head.on = true; save(); markBoundsDirty(); } document.body.classList.remove('panel-open'); headEd.open(); }
$('layoutDone').onclick = () => setLayoutMode(false);
for (const fr of document.querySelectorAll('.edit-frame')) {
  const key = fr.dataset.edit;
  fr.addEventListener('pointerdown', e => {
    e.preventDefault(); e.stopPropagation(); fr.setPointerCapture(e.pointerId);
    const rz = e.target.classList.contains('rz'), W = innerWidth, H = innerHeight, sx = e.clientX, sy = e.clientY;
    const o = key === 'scene' ? S.layout.scene : S.layout[key], start = { ...o }, el = key === 'scene' ? stageFrame : $(key), bw = el.getBoundingClientRect().width;
    const move = ev => {
      const dx = ev.clientX - sx, dy = ev.clientY - sy;
      if (key === 'scene') { if (rz) { o.w = clamp(start.w + dx / W * 100, 10, 150); o.h = clamp(start.h + dy / H * 100, 10, 150); } else { o.x = clamp(start.x + dx / W * 100, -50, 100); o.y = clamp(start.y + dy / H * 100, -50, 100); } applyStage(); }
      else { if (rz) o.s = clamp(Math.round(start.s * (bw + dx) / bw), 40, 250); else { o.x = clamp(start.x + dx / W * 100, 0, 98); o.y = clamp(start.y + dy / H * 100, 0, 98); } applyLayout(); }
    };
    const up = () => { fr.removeEventListener('pointermove', move); fr.removeEventListener('pointerup', up); fr.removeEventListener('pointercancel', up); save(); };
    fr.addEventListener('pointermove', move); fr.addEventListener('pointerup', up); fr.addEventListener('pointercancel', up);
  });
}

/* ---------- 连接页 ---------- */
function fillLink() {
  $('lLive').checked = S.link.live; $('lLive').onchange = () => { S.link.live = $('lLive').checked; save(); toast(S.link.live ? '已开启接收直播互动' : '已关闭接收直播互动'); };
  $('sWs').checked = S.link.ws; $('sWs').onchange = () => { S.link.ws = $('sWs').checked; save(); closeWs(); connectWs(); };
  $('sPort').value = S.link.port; $('sPort').onchange = () => { const v = Number($('sPort').value); if (Number.isInteger(v) && v >= 1 && v <= 65535) { S.link.port = v; save(); closeWs(); connectWs(); } else $('sPort').value = S.link.port; };
  document.querySelectorAll('[data-port]').forEach(b => { b.classList.toggle('on', Number(b.dataset.port) === S.link.port); b.onclick = () => { S.link.port = Number(b.dataset.port); save(); closeWs(); connectWs(); fillLink(); }; });
  linkStatus(linkText);
}

/* ---------- 备份页：导出 / 导入 / 恢复默认 ---------- */
let pendingImport = null;
$('exportAll').onclick = () => { try { const blob = new Blob([JSON.stringify(exportPayload(S, rules), null, 2)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = '快递分拣3D-设置.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); } catch (e) { toast('导出失败：' + e.message); } };
$('importAll').onchange = async () => {
  const f = $('importAll').files[0]; pendingImport = null; $('importOk').hidden = $('importNo').hidden = true; if (!f) return;
  try { if (f.size > 1024 * 1024) throw new Error('文件太大'); const { cfg, rules: rl } = parseImport(JSON.parse(await f.text()));
    pendingImport = { cfg, rl }; $('importInfo').textContent = `将替换：${cfg ? `全部设置（快递 ${cfg.levels.length} 关、垃圾 ${cfg.glevels.length} 关）` : ''}${cfg && rl ? '、' : ''}${rl ? `${rl.length} 条互动规则` : ''}。确认后立即生效。`; $('importOk').hidden = $('importNo').hidden = false;
  } catch (e) { $('importInfo').textContent = '导入失败：' + e.message; }
  $('importAll').value = '';
};
$('importNo').onclick = () => { pendingImport = null; $('importOk').hidden = $('importNo').hidden = true; $('importInfo').textContent = '已取消。'; };
$('importOk').onclick = () => { if (!pendingImport) return; const { cfg, rl } = pendingImport; pendingImport = null; if (rl) rules = rl; if (cfg) applyLoaded(cfg); else { save(true); fillPanel(); refreshBoard(true); } if (rl) { rules = normTierRefs(rules, S.tiers); saveRules(); renderRules(); refreshBoard(true); } $('importOk').hidden = $('importNo').hidden = true; $('importInfo').textContent = '已导入。'; toast('设置已导入'); };
$('factory').onclick = e => armClick(e.target, '全部恢复默认', () => { rules = DEFAULT_RULES.map(r => ({ ...r })); saveRules(); applyLoaded(loadConfig(null)); toast('已全部恢复默认'); });
/* 载入一整份设置（导入 / 恢复默认）：先按当前玩法应用其余设置，玩法不同再走 setMode 的完整切换 */
function applyLoaded(cfg) {
  const want = cfg.mode, cur = S.mode;
  Object.assign(S, cfg); S.mode = cur; save(true);
  if (S.layout.stage !== STAGE.id) { S.mode = want; save(true); toast('分拣台布局变了，正在重新载入…'); setTimeout(() => location.reload(), 250); return; }   // 场景按布局建，换布局要重载
  applyAll(); refreshBinLabels();
  if (want !== cur) setMode(want); else { runLevel = null; applyModeLook(); startLevel(); renderFxBtns(); refreshBoard(true); }
  fillPanel();
}

/* ---------- 标签页切换 ---------- */
let curTab = 'test';
for (const b of document.querySelectorAll('#tabs button')) b.onclick = () => { curTab = b.dataset.tab; for (const x of document.querySelectorAll('#tabs button')) x.classList.toggle('on', x === b); for (const pg of document.querySelectorAll('[data-page]')) pg.hidden = pg.dataset.page !== curTab; fillPanel(); };
function fillPanel() {
  $('bulkCap').value = S.play.cap;
  if (curTab === 'test') renderFxBtns(); else if (curTab === 'levels') fillLevels(); else if (curTab === 'rules') renderRules(); else if (curTab === 'fx') fillFx(); else if (curTab === 'view') fillView(); else if (curTab === 'link') { fillLink(); renderLog(); }
}
function applyAll() { applyBg(); applyPanel(); applyShadow(); applyLayout(); fitCamera(); if (master) master.gain.value = S.volume / 100; closeWs(); connectWs(); }

installInlineSelects(document.body);
applyBg(); applyPanel(); applyLayout(); renderFxBtns(); linkStatus(linkText); attachSdk(); setInterval(attachSdk, 1200); if (!sdkOn) connectWs();

/* ================= 玩法切换：快递分拣 / 垃圾分类 ================= */
function applyModeLook() {
  truck.cabMat.color.set(isGarbage() ? 0x2f9b55 : 0xea6f2e); drawTruckSide(truck.name || ''); drawDockSign();
  $('scanTag').textContent = MODES[S.mode].scanHint;
  document.body.classList.toggle('mode-garbage', isGarbage());
  document.querySelectorAll('#modeSeg button').forEach(b => b.classList.toggle('on', b.dataset.mode === S.mode));
  requestRender(true);
}
function setMode(m) {
  if (!MODES[m] || m === S.mode) return;
  setDemo(false); if (held) release();
  for (const b of bins) { unseal(b, true); unleak(b, true); }
  enableBins(bins, false); S.mode = m; bins = binSets[m]; enableBins(bins, true); syncBinEls();
  runLevel = null; trickQueue.length = 0; save(true); applyModeLook(); startLevel(); renderFxBtns(); refreshBoard(true); if (isPanelOpen()) fillPanel();
  toast(`已切换到${MODES[m].label}`);
}
document.querySelectorAll('#modeSeg button').forEach(b => b.onclick = () => { if (b.dataset.mode === S.mode) return; if (b.dataset.arm !== '1') { b.dataset.arm = '1'; const t = b.textContent; b.textContent = '再点一次切换'; setTimeout(() => { b.dataset.arm = ''; b.textContent = t; }, 3000); return; } b.dataset.arm = ''; b.textContent = MODES[b.dataset.mode].label; setMode(b.dataset.mode); });
applyModeLook();

/* ================= 对外接口 ================= */
window.KuaidiDemo = {
  gift, receive: (raw, type) => receive(raw, type || null, '接口'), startShift: () => startLevel(), startLevel, setDemo,
  _live: { rules: () => rules, log: () => evLog, link: () => linkText, likeAcc },
  state: () => ({ state, remaining: remaining(), delivered, supply, table: tableCount(), boxes: boxes.length, bins: bins.map(b => b.count), held: !!held }),
  _debug: {
    pools: { namedMats, blindPool, matCache },
    /* 测试用：在分拣站上空往四面八方抛 n 个箱子 */
    spray(n, speed = 9) { for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, v = rnd(.4, 1) * speed; spawnItem({ ...randomItem(), pos: { x: rnd(-6, 5), y: rnd(4, 7), z: rnd(-3, 2) }, vel: { x: Math.cos(a) * v, y: rnd(3, 9), z: Math.sin(a) * v }, ang: { x: rnd(-6, 6), y: rnd(-6, 6), z: rnd(-6, 6) } }).launchedAt = time; } },
    items: () => boxes.filter(b => b.st !== 'gone').map(b => { const p = b.body.translation(), sc = toScreen(new THREE.Vector3(p.x, p.y, p.z)); return { id: b.id, kind: b.kind, itemId: b.itemId, st: b.st, cat: b.cat, name: b.name, trickBy: b.trickBy, stripped: b.stripped, tape: b.tape, blind: b.blind, p: [p.x, p.y, p.z], sx: sc.x, sy: sc.y, dims: b.dims }; }),
    bounds: () => ({ planes: viewPlanes, backZ, frontZ: STAGE.frontZ ?? null, range: S.play.range, plat: PLAT }),
    setPlay(o) { Object.assign(S.play, o); markBoundsDirty(); },
    setHead(o) { Object.assign(S.layout.head, o); markBoundsDirty(); },
    stats: () => stats, setMode, kit, onAction, S, tiers: () => S.tiers, speedMul: () => speedNow(), auditMult: () => (auditNow() || { val: 0 }).val, speedSegs: () => speedSegs, auditSegs: () => auditSegs, seals: () => bins.map(b => b.seal ? b.seal.need : 0), drones: () => [drone, prankDrone].map(d => ({ kind: d.kind, st: d.st, done: d.done, plan: d.plan })), auditLeft: () => Math.max(0, segsEnd(auditSegs, time) - time), evLog: () => evLog.map(x => x.result), state: () => state, viewport: () => ({ lastVW, lastVH, VR: { ...VR } }), viewerQueues: () => ({ truck: truck.batches.map(b => ({ name: b.name, left: b.left })), big: bigQueue.length, help: helpQueue.length, tape: pendingTape.length }),
    /* 测试用：把某件放到某个筐正上方松开（模拟投进这个筐） */
    dropInto(id, bi) { const b = boxes.find(x => x.id === id), bin = bins[bi]; if (!b || !bin) return false; if (b.st !== 'free') { b.st = 'free'; b.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true); b.body.collider(0).setEnabled(true); } b.body.setTranslation({ x: bin.x, y: BASE + BIN.h + .9, z: bin.z }, true); b.body.setLinvel({ x: 0, y: -1, z: 0 }, true); b.body.setAngvel({ x: 0, y: 0, z: 0 }, true); b.launchedAt = time; b.popBin = null; return true; },
    headCircle, headOverlapsStation, editHead, headEd,
    /* 测试用：沿屏幕某点的视线，在 1.5–6 米高处生成 n 个箱子（露头圆测试用来往圆锥里塞） */
    // 往台面上方随机倒 n 件（不算「抛出去」：滚进错筐只会放回台面），测堆满用
    fillTable(n) { for (let i = 0; i < n; i++) { const x = rnd(TABLE.x0 + .6, TABLE.x1 - 1.8), z = rnd(TABLE.z0 + .35, TABLE.z1 - .35); spawnItem({ ...randomItem(), pos: { x, y: spawnHeight(x, z, TABLE.top + 1.5 + Math.random() * 3), z }, ang: { x: rnd(-3, 3), y: rnd(-3, 3), z: rnd(-3, 3) } }); } },
    // 沿这一点的视线、在镜头前方放 n 件（按离镜头的距离取，不按高度：柜台布局的镜头低，按高度会放到镜头背后）
    sprayAt(sx, sy, n) { setNdc(sx, sy); ray.setFromCamera(ndc, camera); const o = ray.ray.origin, d = ray.ray.direction, dist = camBase.pos.distanceTo(camBase.target); for (let i = 0; i < n; i++) { const t = rnd(.4, .9) * dist; spawnItem({ ...randomItem(), pos: { x: o.x + d.x * t + rnd(-.3, .3), y: Math.max(.6, o.y + d.y * t), z: o.z + d.z * t + rnd(-.3, .3) } }).launchedAt = time; } },
    /* 渲染一帧并立即读回画布像素：返回露头圆内不透明像素个数（preserveDrawingBuffer 关闭时必须同一任务内读） */
    alphaInCircle() {
      renderer.render(scene, camera); const gl = renderer.getContext(), c = headCircle(), k = renderer.domElement.width / VR.width;
      const x0 = Math.max(0, Math.floor((c.cx - c.r) * k)), y0 = Math.max(0, Math.floor((VR.height - c.cy - c.r) * k)), w = Math.min(renderer.domElement.width - x0, Math.ceil(2 * c.r * k)), h = Math.min(renderer.domElement.height - y0, Math.ceil(2 * c.r * k));
      const px = new Uint8Array(w * h * 4); gl.readPixels(x0, y0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      let n = 0, total = 0; for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const sx = (x0 + i + .5) / k, sy = VR.height - (y0 + j + .5) / k; if (Math.hypot(sx - c.cx, sy - c.cy) > c.r - 2) continue; total++; if (px[(j * w + i) * 4 + 3] > 8) n++; }
      return { opaque: n, total };
    },
    renderer, scene, boxes, get bins() { return bins; }, stage: STAGE, heldId: () => (held ? held.b.id : null), toScreen, pinned, THREE, camera, pickBinAt, pickAt, demo, freeSlot, slotOcc, truck, DOCK_CELLS, surfaceY },
  _advance(sec) { paused = true; const n = Math.round(sec * 60); for (let i = 0; i < n; i++) { simulate(1 / 60); updTags(1 / 60); updPops(1 / 60); } draw(0, true); },
  _resume() { paused = false; last = performance.now(); },
  _ptr(type, x, y) { const o = { clientX: x, clientY: y, pointerId: 1, bubbles: true }; canvas.dispatchEvent(new PointerEvent(type, o)); },
};
addEventListener('message', e => { const d = e.data; const pa = d && parseTierAction(d.action); if (d && d.type === 'kd-gift' && EFF[ACTION_ALIAS[pa.action] || pa.action]) gift(ACTION_ALIAS[pa.action] || pa.action, String(d.name || ''), Number(d.amount ?? d.count) || defAmount(ACTION_ALIAS[pa.action] || pa.action, pa.tier ?? (d.tier != null ? String(d.tier) : undefined)), pa.tier ?? (d.tier != null ? String(d.tier) : undefined)); });

for (const g of [belt, dock, table, scanner, truck.g, ...MODE_IDS.flatMap(m => binSets[m].flatMap(b => [b.g, b.stand]))]) mergeStatic(g);
$('loading').remove();
startLevel();
requestAnimationFrame(frame);
