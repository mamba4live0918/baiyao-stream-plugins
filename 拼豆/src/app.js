import { BEAD_PALETTE, CATEGORIES, PRESETS, isLegacyPreset, listPresets, createPresetPattern, rasterToPattern, colorByHex, FULL_PALETTE, paletteForTier, recolorPattern, validColorTier } from './patterns.js';
import { PegGame } from './game.js';
import { createPegPhysics } from './physics.js';
import { createWorkbenchScene as createPegScene } from './workbench-scene.js';
import { createGiftTransport } from './transport.js';
import { createGalleryStore } from './gallery.js';
import { createFinishedViewer, IRON_STYLES, isKnownIronStyle, normalizeFinishQuality } from './finished-viewer.js';
import { prepareFinished, finishWorkerActive } from './finish-worker-client.js';
import { createIcons, CircleDot, Image as ImageIcon, Layers, SlidersHorizontal, CircleHelp, Upload, Undo2, ChevronLeft, ChevronRight, Minus, Plus } from 'lucide';
import { INTERACTIONS, MAX_INTERACTION_LEVELS, createInteractionLevel, createInteractionRules, resolveGiftRule, validateRuleSet } from './interaction-rules.js';
import { createLayoutController, normalizeLayout } from './layout-controller.js';

import {MODES,freePattern,validPattern,normalizeCampaign,levelPattern,makeLevel} from './play-modes.js';

import {createProgressStore,makeProgressSave,parseProgressSave,validateProgressSave,progressSummary,MAX_SAVE_BYTES} from './progress-saves.js';
import {installInlineSelects} from './inline-select.js';

import {normalizeToolSensitivity,validToolSensitivity,normalizeDefaultTool,normalizePenCapacity,validPenCapacity} from './mouse-controls.js';
import {showGraphicsRequired} from './graphics-required.js';

const $ = id => document.getElementById(id);
const STATE_KEY = 'songlan-peg-studio-v2';
const SIZES = [16, 20, 24, 30, 36, 40, 48, 56, 64];
const validBoardSize = value => Number.isInteger(value) && value >= 16 && value <= 64;
const EFFECTS = INTERACTIONS;
const STYLES = IRON_STYLES;

let savedReadError = null;
const saved = readSaved();
let rulesLoadError = savedReadError;
let initialRules;
try {
  if(rulesLoadError)throw rulesLoadError;
  if(saved!==null&&(!saved.settings||!Object.hasOwn(saved.settings,'rules')))throw new Error('已有浏览器记录缺少互动规则');
  initialRules = createInteractionRules(saved?.settings?.rules);
}
catch (error) { rulesLoadError = error; initialRules = createInteractionRules(); }
const settings = {
  presetLibraryVersion:saved?.settings?.presetLibraryVersion===1?1:0,
  toolSensitivity:normalizeToolSensitivity(saved?.settings?.toolSensitivity),
  defaultTool:normalizeDefaultTool(saved?.settings?.defaultTool),
  penCapacity:normalizePenCapacity(saved?.settings?.penCapacity),
  // 画质：成品 3D 默认「高」；工作台默认「高」（与旧版相同）。
  finishQuality:normalizeFinishQuality(saved?.settings?.finishQuality),
  workbenchQuality:normalizeFinishQuality(saved?.settings?.workbenchQuality),
  colorTier:validColorTier(saved?.settings?.colorTier)?saved.settings.colorTier:'original',
  customColors:Array.isArray(saved?.settings?.customColors)?saved.settings.customColors.filter(c=>!!colorByHex(c)).slice(0,128):[],
  appearanceVersion: 3,
  desk: saved?.settings?.appearanceVersion === 3 ? saved.settings.desk === true : false,
  hint: saved?.settings?.hint !== false,
  // 拿着豆时，板上需要这个颜色的空位闪烁提示（遮图纸或关闭提示时不亮）。
  heldGlow: saved?.settings?.heldGlow !== false,
  jarFilter: saved?.settings?.jarFilter === 'needed' ? 'needed' : 'all',
  rules: initialRules,
  layout: normalizeLayout(saved?.settings?.layout),
  magnifierKey: /^Key[A-Z]$|^Digit[0-9]$/.test(saved?.settings?.magnifierKey||'') ? saved.settings.magnifierKey : 'KeyM',
  magnifierMode:saved?.settings?.magnifierMode==='toggle'?'toggle':'hold',
  magnifierZoom: Number.isFinite(saved?.settings?.magnifierZoom) ? Math.max(1.5,Math.min(5,saved.settings.magnifierZoom)) : 2.5,
  magnifierSize: Number.isFinite(saved?.settings?.magnifierSize) ? Math.max(120,Math.min(360,saved.settings.magnifierSize)) : 220,
};

let playMode=MODES.includes(saved?.playMode)?saved.playMode:'pattern';
let campaign=normalizeCampaign(saved?.campaign);
let modeSessions=saved?.modeSessions&&typeof saved.modeSessions==='object'?saved.modeSessions:{};
let palettePage=0,paletteSearch='',patternDestination='board';
let pattern = restorePattern(saved) || createPresetPattern(PRESETS[0].id, 30);
let game;
let view;
let selectUI=null;
let magnifierActive=false;
function setMagnifierEnabled(active){magnifierActive=!!active;view?.setMagnifier?.(magnifierActive,{zoom:settings.magnifierZoom,size:settings.magnifierSize});}
let physics;
let boardGeneration = 0;
let held = null;
let lastPointer = { x: 0, y: 0 };
let manualHistory = [];
let giftQueue = Array.isArray(saved?.giftQueue) ? saved.giftQueue.filter(validQueuedGift).slice(0, 200) : [];
let drainingGifts = false;
let noticeTimer;
let savingFailed = !!rulesLoadError;
let category = 'all';
let selectedPreset = pattern.id;
let currentStyle = 'matte';
let previewTextureSeed = 1;
let finishedData = restoreFinishedMeta(saved?.finished);
let ironDone = !!finishedData;
let finishedViewer = null;
let savedViewer = null;
let selectedSavedRecord = null;
let ignoreClickUntil = 0;
let layoutController = null;
let graphicsBlocked=false;
function blockGraphics(error,lost=false){
  if(graphicsBlocked)return;
  graphicsBlocked=true;
  transport.disconnect();
  layoutController?.destroy();layoutController=null;
  physics?.destroy();physics=null;
  finishedViewer?.dispose();finishedViewer=null;
  savedViewer?.dispose();savedViewer=null;
  const oldView=view;view=null;oldView?.destroy();
  document.querySelectorAll('.overlay.open').forEach(el=>el.classList.remove('open'));
  showGraphicsRequired({lost});
}
let activeEffect = 'shake';
let lastFallenSave = 0;
const progressStore=createProgressStore();
let lastAutoSave=0,loadingArchive=false,pendingImport=null,saveListSerial=0,importSerial=0;
const deferredLiveGifts=[];
const gallery = createGalleryStore();
const trayArtwork = new Map();
const transport = createGiftTransport({
  onGift: gift => { if(loadingArchive){deferredLiveGifts.push(gift);return;}giftQueue.push(gift); persist(); drainGiftQueue(); },
  onStatus: status => { $('gift-status').textContent = status; if($('menu-connection'))$('menu-connection').textContent=status; },
});

function readSaved() {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if(raw===null)return null;
    const data=JSON.parse(raw);
    if(!data||typeof data!=='object'||Array.isArray(data))throw new Error('浏览器记录格式无效');
    return data;
  } catch(error) { savedReadError=error;return null; }
}

function restorePattern(data) {
  const info = data?.pattern;
  if (!info || !validBoardSize(info.size)) return null;
  if (['custom','free'].includes(info.id) && Array.isArray(info.cells) && info.cells.length === info.size ** 2) {
    const cellsValid = info.cells.every(cell => cell === null || !!colorByHex(cell));
    if (!cellsValid) return null;
    return { ...info, id: info.id, mode:info.id==='free'?'free':info.mode, name: String(info.name || '自定义图片').slice(0, 60), category: 'custom', size: info.size, cells: info.cells, preview: info.preview || { width: info.size, height: info.size, cells: info.cells } };
  }
  try { return validPattern(info)?structuredClone(info):createPresetPattern(info.id, info.size); }
  catch { return null; }
}

function validQueuedGift(gift) {
  return gift && typeof gift.name === 'string' && Number.isSafeInteger(gift.count) && gift.count >= 1 && gift.count <= 10000;
}

function restoreFinishedMeta(info) {
  if (!info || !validBoardSize(info.size) || !isKnownIronStyle(info.style) ||
      typeof info.id !== 'string' || typeof info.name !== 'string' || !Array.isArray(info.cells) ||
      info.cells.length !== info.size ** 2 || !info.cells.every(cell => cell === null || !!colorByHex(cell))) return null;
  return { id: info.id, name: info.name, size: info.size, style: info.style, cells: info.cells, textureSeed: Number.isSafeInteger(info.textureSeed) ? info.textureSeed : 1, dataUrl: null };
}

function persist() {
  if(graphicsBlocked)return;
  if (!game) return;
  if(rulesLoadError){if($('auto-save-status'))$('auto-save-status').textContent='互动设置损坏：原浏览器记录未覆盖，本页临时使用。';return;}
  for(const bead of game.fallen){const pose=physics?.getBeadPose(bead.id);if(pose)game.updateFallenPose(bead.id,pose);}
  const record = {
    version: 1,
    pattern,playMode,campaign,modeSessions,
    game: game.snapshot(),
    settings,
    giftQueue,
    finished: finishedData ? { id: finishedData.id, name: finishedData.name, size: finishedData.size, style: finishedData.style, cells: finishedData.cells, textureSeed: finishedData.textureSeed } : null,
  };
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(record));
    savingFailed = false;lastAutoSave=Date.now();if($('auto-save-status'))$('auto-save-status').textContent=`自动保存成功 · ${new Date(lastAutoSave).toLocaleTimeString()}`;
  } catch {
    if (!savingFailed) notify('浏览器存储不可用：本页可继续，刷新后可能无法恢复进度。');
    savingFailed = true;if($('auto-save-status'))$('auto-save-status').textContent='自动保存失败，请立即导出本地存档。';
  }
}

function notify(message, duration = 3400) {
  const node = $('notice');
  node.textContent = message;
  node.classList.add('show');
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => node.classList.remove('show'), duration);
}

// 观众礼物播报：多条礼物同时到达时逐条叠放，不会互相覆盖。
const FEED_MAX = 4, FEED_MS = 5200;
// 同时做真实碰撞的掉落豆数量，随「工作台画质」调整；其余的豆走简化抛物线，落地即静止。
const PHYSICS_BODIES = { standard: 48, high: 96, ultra: 128 };
function announce(actor, text) {
  const feed = $('gift-feed');
  if (!feed) { notify(`${actor || ''}${text}`); return; }
  const item = document.createElement('div');
  item.className = 'gift-feed-item';
  if (actor) { const who = document.createElement('b'); who.textContent = actor; item.append(who, ' '); }
  item.append(text);
  feed.appendChild(item);
  while (feed.children.length > FEED_MAX) feed.firstElementChild.remove();
  requestAnimationFrame(() => item.classList.add('show'));
  setTimeout(() => { item.classList.remove('show'); item.classList.add('leaving'); setTimeout(() => item.remove(), 420); }, FEED_MS);
}

// 页面内确认框：OBS 浏览器源不显示浏览器自带的确认弹窗（直接当作取消），所以不用原生确认框。
let confirmResolve = null;
function askConfirm(message, { ok = '继续', cancel = '取消', preview = null } = {}) {
  if (confirmResolve) confirmResolve(false);
  const layer = $('confirm-layer');
  $('confirm-message').textContent = message;
  const canvas = $('confirm-preview');
  canvas.hidden = !preview;
  if (preview) drawPixelPreview(canvas, preview);
  $('confirm-ok').textContent = ok;
  $('confirm-cancel').textContent = cancel;
  layer.hidden = false;
  requestAnimationFrame(() => $('confirm-ok').focus({ preventScroll: true }));
  return new Promise(resolve => { confirmResolve = resolve; });
}
function closeConfirm(result) {
  const resolve = confirmResolve;
  confirmResolve = null;
  $('confirm-layer').hidden = true;
  resolve?.(result);
}
const confirmOpen = () => !!confirmResolve;
// 会清空当前豆板的操作：确认后再核对一次，防止等待确认期间礼物打翻托盘或摇落豆子。
async function confirmBoardChange(message) {
  if (!game.placed.some(Boolean)) return true;
  const generation = boardGeneration;
  if (!await askConfirm(message)) return false;
  if (generation !== boardGeneration) return false;
  if (game.fallen.length || game.traySpilled) { notify('确认期间出现了掉落豆或托盘被打翻，请先处理再操作。'); return false; }
  return true;
}

// 工具：默认工具（镊子或拼豆笔）可被没收；观众送的升级拼豆笔不受没收影响。
const giftPenActive = () => !!game?.penAvailable;
const defaultToolReady = () => !!game?.tweezersAvailable;
const toolReady = () => defaultToolReady() || giftPenActive();
const toolLabel = () => settings.defaultTool === 'pen' ? '拼豆笔' : '镊子';
function pickCapacity() {
  const base = settings.defaultTool === 'pen' ? settings.penCapacity : 1;
  if (giftPenActive()) return Math.max(game.penCapacity, base);
  return defaultToolReady() ? base : 0;
}
const multiPick = () => giftPenActive() || settings.defaultTool === 'pen';

function cellIndex(row, col) { return row * pattern.size + col; }

function drawPixelPreview(canvas, preview) {
  if (!canvas || !preview) return;
  const ctx = canvas.getContext('2d');
  const { width, height, cells } = preview;
  canvas.width = Math.max(1, width);
  canvas.height = Math.max(1, height);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < cells.length; i++) {
    if (!cells[i]) continue;
    ctx.fillStyle = cells[i];
    ctx.fillRect(i % width, Math.floor(i / width), 1, 1);
  }
}

function renderSizes() {
  const parent = $('size-choices');
  parent.replaceChildren();
  for (const size of SIZES) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = `${size}×${size}`;
    button.classList.toggle('active', pattern.size === size);
    button.addEventListener('click', () => resizeBoard(size));
    parent.appendChild(button);
  }
  $('board-size-note').textContent = `${pattern.size} × ${pattern.size}`;
}

function inventoryColors(){
 const needed=new Set(game?.goalCells.filter(Boolean)||pattern.cells.filter(Boolean));
 const base=paletteForTier(playMode==='free'?'original':settings.colorTier);
 const all=new Map(base.map(c=>[c.hex,c]));for(const hex of [...needed,...settings.customColors,...(game?.pieceCells||[]).filter(Boolean)])all.set(hex,colorByHex(hex));
 let colors=[...all.values()].sort((a,b)=>Number(needed.has(b.hex))-Number(needed.has(a.hex)));if(settings.jarFilter==='needed'&&playMode!=='free')colors=colors.filter(c=>needed.has(c.hex));
 if(paletteSearch)colors=colors.filter(c=>(c.code+' '+c.name+' '+c.hex).toLowerCase().includes(paletteSearch.toLowerCase()));
 return colors;
}
function renderJars() {
  // 托盘散落时也要画出豆盒（刷新后需要恢复散落的样子）；翻页和搜索在散落时另有拦截。
  const needed=new Set(game?.goalCells.filter(Boolean)||pattern.cells.filter(Boolean)),all=inventoryColors();
  const pages=Math.max(1,Math.ceil(all.length/48));palettePage=Math.min(pages-1,Math.max(0,palettePage));const colors=all.slice(palettePage*48,palettePage*48+48),matched=colors.filter(c=>needed.has(c.hex));
  view?.setPalette?.(colors);view?.setPaletteFilter?.(colors.length<24?'needed':'all',colors.map(c=>c.hex));
  $('palette-page-note').textContent=`${palettePage+1} / ${pages} · ${all.length} 色`;$('palette-prev').disabled=palettePage===0;$('palette-next').disabled=palettePage>=pages-1;
  $('palette-pager').hidden=all.length<=48&&!paletteSearch;$('color-count').textContent=`本图实际 ${needed.size} 色 · ${settings.colorTier==='original'?'原色保留':settings.colorTier+' 色精度'}${playMode==='free'?' · 自由模式开放全部色库':''}`;
  const parent = $('jars');
  parent.replaceChildren();
  for (const color of colors) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `jar${needed.has(color.hex) ? ' needed' : ' spare'}`;
    button.style.setProperty('--bean', color.hex);
    button.setAttribute('aria-label', `取 ${color.code} ${color.name} 拼豆`);
    const artwork = trayArtwork.get(color.hex);
    const beads = document.createElement('span');
    beads.className = 'jar-beads';
    if (artwork) {
      for (const [kind, src] of [['empty', artwork.empty], ['full', artwork.full]]) {
        const image = document.createElement('img');
        image.className = `jar-art jar-art-${kind}`;
        image.src = src;
        image.alt = '';
        image.draggable = false;
        beads.appendChild(image);
      }
    } else for (let i = 0; i < 36; i++) {
      const bead = document.createElement('i');
      bead.style.setProperty('--twist', `${(i * 43) % 130}deg`);
      beads.appendChild(bead);
    }
    const label = document.createElement('span');
    label.className = 'jar-label';
    const code = document.createElement('b'); code.textContent = color.code;
    const name = document.createElement('small'); name.textContent = color.name;
    label.append(code, name);
    button.title = `${color.code} ${color.name}${needed.has(color.hex) ? ' · 本图需要' : ' · 备用豆色'}`;
    button.append(beads, label);
    button.addEventListener('pointerdown', () => takeBead(color));
    button.addEventListener('click', () => takeBead(color));
    parent.appendChild(button);
  }
  $('jar-count').textContent = `本图 ${matched.length} 色 / ${colors.length} 格`;
  updateHeld();
  renderTraySpill();
}

function renderTraySpill() {
  view?.setTrayState?.(!!game?.traySpilled, game?.trayRestoreStage || 0);
  if (view && !view.isFallback) return;
  const shelf = $('jar-shelf');
  const layer = $('tray-spill');
  shelf.classList.toggle('spilled', !!game?.traySpilled);
  shelf.style.setProperty('--tray-fill', game?.traySpilled ? String(game.trayRestoreStage / 5) : '1');
  layer.replaceChildren();
  if (!game?.traySpilled) return;
  const colors = BEAD_PALETTE.filter(item => pattern.cells.includes(item.hex));
  for (let i = 0; i < 50; i++) {
    const bead = document.createElement('i');
    bead.className = `tray-loose-bead${i < game.trayRestoreStage * 10 ? ' gone' : ''}`;
    const color = colors[i % Math.max(1, colors.length)] || BEAD_PALETTE[i % BEAD_PALETTE.length];
    bead.style.setProperty('--bean', color.hex);
    bead.style.setProperty('--x', `${25 + (i * 31) % 230}px`);
    bead.style.setProperty('--y', `${35 + (i * 47) % 220}px`);
    bead.style.setProperty('--dx', `${25 + (i * 83) % 430}px`);
    bead.style.setProperty('--dy', `${80 + (i * 67) % 370}px`);
    bead.style.setProperty('--spin', `${(i % 2 ? -1 : 1) * (90 + (i * 53) % 270)}deg`);
    bead.style.setProperty('--delay', `${(i % 8) * 32}ms`);
    layer.appendChild(bead);
  }
}

function advanceTraySpill(stage) {
  view?.setTrayState?.(game.traySpilled, stage);
  if (view && !view.isFallback) return;
  $('jar-shelf').style.setProperty('--tray-fill', String(stage / 5));
  const beads = [...$('tray-spill').children];
  for (let index = (stage - 1) * 10; index < stage * 10; index++) {
    const bead = beads[index];
    if (!bead) continue;
    bead.classList.add('returning');
    setTimeout(() => bead.classList.add('gone'), 620);
  }
  if (stage === 5) {
    setTimeout(() => {
      $('jar-shelf').classList.remove('spilled');
      $('tray-spill').replaceChildren();
    }, 690);
  }
}

function takeBead(color) {
  if (game.traySpilled) { notify('先按空格把装豆盒托盘复原。'); return; }
  if (!toolReady()) { notify(`${toolLabel()}被没收了，等待返还，或等观众送来升级拼豆笔。`); return; }
  held = { color: color.hex, code: color.code, remaining: pickCapacity() };
  updateHeld();
}

function updateHeld() {
  view?.setHeld?.(held);
  $('held-name').textContent = held ? `${held.code} ${colorByHex(held.color)?.name || ''}${held.remaining > 1 ? ' ×' + held.remaining : ''}` : '还没有豆子';
  $('held-swatch').style.setProperty('--held-color', held?.color || '#dedfd1');
  const bead = $('held-bead');
  bead.classList.toggle('show', !!held);
  if (held) {
    bead.style.setProperty('--held-color', held.color);
    bead.style.left = `${lastPointer.x}px`;
    bead.style.top = `${lastPointer.y}px`;
    $('held-code').textContent = `${held.code}${held.remaining > 1 ? ' ×' + held.remaining : ''}`;
  }
  for (const jar of $('jars').children) jar.classList.toggle('active', !!held && jar.getAttribute('aria-label')?.includes(held.code));
}

function updateStatus() {
  if (!game) return;
  const correct = game.correctCount;
  const target = game.targetCount;
  if(game.isFree)drawPixelPreview($('current-preview'),{width:pattern.size,height:pattern.size,cells:game.replayCells||game.pieceCells});
  $('progress-text').textContent = game.isFree&&!game.replayCells?`已拼 ${correct} 颗`:`${correct} / ${target}`;
  $('progress-fill').style.width = `${target ? 100 * correct / target : 0}%`;
  $('round-tag').textContent = (playMode==='campaign'?`关卡 ${campaign.index+1}/${campaign.levels.length} · `:playMode==='free'?'自由 · ':'')+`第 ${Math.min(game.completedRounds + 1, game.requiredRounds)} / ${game.requiredRounds} 遍`;
  const errors=game.errors;
  const wrong=errors.filter(bead=>bead.type==='wrong').length,extra=errors.length-wrong;
  view?.setErrors?.(errors);
  const time = Date.now();
  let note = `双击空白打开菜单 · 双击部件解锁布局 · ${settings.magnifierMode==='toggle'?'按':'按住'} ${settings.magnifierKey.replace('Key','').replace('Digit','')} ${settings.magnifierMode==='toggle'?'开关局部放大':'局部放大'}`;
  if (game.traySpilled) note = `装豆盒托盘散落中：已复原 ${game.trayRestoreStage} / 5 段。`;
  else if ((!game.isFree||game.replayCells)&&(wrong || extra)) note = `红圈：${wrong} 颗错色 · 橙圈：${extra} 颗多余豆${game.fallen.length?` · 蓝圈：${game.fallen.length} 颗脱位豆`:""}，点击清理。`;
  else if (game.fallen.length) note = `蓝圈：${game.fallen.length} 颗脱位豆，点击直接移走，继续拼需从豆盒取新豆。`;
  else if(game.isFree&&!game.replayCells)note='自由创作：任意选色、任意放置，完成后点击完成作品。';
  else if (game.complete) note = game.completedRounds + 1 < game.requiredRounds ? '本遍完成，可烫制并继续下一遍。' : '图案已拼好，可以烫制成品。';
  else if (game.hintHiddenUntil > time) note = `提示隐藏中：还剩 ${Math.ceil((game.hintHiddenUntil - time) / 1000)} 秒。`;
  const giftPen = giftPenActive(), locked = !defaultToolReady(), basePen = settings.defaultTool === 'pen';
  const penLeft = Math.ceil((game.penUntil - time) / 1000), lockLeft = Math.ceil((game.tweezersLockedUntil - time) / 1000);
  if(giftPen) note += ` · 升级拼豆笔 ${penLeft} 秒 / 每次 ${pickCapacity()} 颗 · 按住划动连放`;
  if(locked) note += ` · ${toolLabel()}被没收 ${lockLeft} 秒`;
  $('status-note').textContent = note;
  view?.setTools?.({ locked, pen: giftPen || (basePen && !locked) });
  $('toolbox').classList.toggle('locked', locked && !giftPen);
  $('tool-icon').textContent = giftPen || (basePen && !locked) ? '🖊️' : locked ? '🔒' : '🪡';
  $('tool-name').textContent = giftPen ? '升级拼豆笔生效中' : locked ? `${toolLabel()}暂被没收` : `${toolLabel()}就绪`;
  $('tool-description').textContent = giftPen ? `还剩 ${penLeft} 秒 · 每次取 ${pickCapacity()} 颗 · 按住划动连续放豆${locked ? ` · ${toolLabel()}被没收 ${lockLeft} 秒` : ''}` : locked ? `还剩 ${lockLeft} 秒` : basePen ? `每次取 ${settings.penCapacity} 颗同色豆，逐颗点到柱位` : '逐颗取豆、放豆和移走掉落豆';
  $('iron-button').disabled = (!game.complete || game.completedRounds >= game.requiredRounds) && !finishedData;
  $('iron-button').textContent = finishedData && !game.complete ? '检视上遍成品' : finishedData && game.completedRounds >= game.requiredRounds ? '检视成品' : '完成作品';
  $('preview-button').textContent = `底图 ${settings.hint && game.hintVisible ? '开' : '关'}`;
  $('preview-button').disabled = !game.hintVisible;
  view?.setHintVisible(settings.hint && game.hintVisible);
  $('restore-panel').classList.toggle('show', game.traySpilled);
  $('restore-fill').style.width = `${game.restoreProgress}%`;
  $('next-level').hidden=!(playMode==='campaign'&&game.completedRounds>=game.requiredRounds&&!campaign.done);
  $('next-level').textContent=campaign.index+1<campaign.levels.length?'下一关':'完成闯关';
  $('restore-note').textContent = `已复原 ${game.trayRestoreStage} / 5 段 · 空格继续`;
}

function onBoardCell(cell) {
  if (performance.now() < ignoreClickUntil || !cell || !game) return;
  if(layoutController&&!layoutController.isLocked('board'))return;
  if (game.traySpilled) { notify('装豆盒托盘还没复原，连续单击空格。'); return; }
  const old = game.placed[cellIndex(cell.row, cell.col)];
  if (held) {
    if (!toolReady()) { notify(`${toolLabel()}暂时不可用。`); return; }
    if (old) { notify('这里已有一颗豆，先取走它。'); return; }
    const result = placeHeld(cell);
    if (!result) return;
    if (result.wrong) notify(`放错色了：这里需要 ${colorByHex(result.goal)?.code ?? '目标色'}。`);
    if (result.extra) notify('这里不是图案位置，可以空手点击取走。');
  } else if (old) {
    if (!defaultToolReady()) { notify(`${toolLabel()}暂时被没收，无法取豆。`); return; }
    removeAt(cell.row, cell.col);
  } else {
    notify('先从左侧装豆盒取一颗豆。');
    return;
  }
  updateStatus();
  persist();
}

// 放下手里的一颗豆；单击与划动共用。
function placeHeld(cell) {
  const bead = game.place(held.color, cell.row, cell.col);
  if (!bead) return null;
  view.addBead(bead);
  physics?.addBead(bead.id, bead.row, bead.col, bead.color);
  manualHistory.push(bead.id);
  const goal = game.goalCells[cellIndex(cell.row, cell.col)];
  held.remaining--;
  if (held.remaining <= 0 || !multiPick()) held = null;
  updateHeld();
  return { bead, goal, wrong: !!goal && goal !== bead.color, extra: !goal && (!game.isFree || !!game.replayCells) };
}

// 升级拼豆笔：按住在板上划动连续放豆。已有豆的格子跳过；放错、划出图案或豆用完就停笔。
let stroke = null;
function canStroke() {
  return !!(game && held && held.remaining > 0 && giftPenActive() && !game.traySpilled && !confirmOpen()
    && !(layoutController && !layoutController.isLocked('board')) && performance.now() >= ignoreClickUntil);
}
function stopStroke(note) { if (stroke && note) stroke.note = note; return false; }
function onStroke(cell, phase) {
  if (phase === 'end') {
    if (stroke) { updateStatus(); persist(); if (stroke.note) notify(stroke.note); }
    stroke = null;
    return false;
  }
  if (phase === 'start') stroke = { placed: 0, note: '' };
  if (!stroke) return false;
  if (!game || game.traySpilled) return stopStroke('装豆托盘被打翻了，先按空格复原。');
  if (!giftPenActive()) return stopStroke('升级拼豆笔时间到了，划动已停。');
  if (!held) return stopStroke('笔里的豆用完了，再去豆盒取一次。');
  if (!cell) return stopStroke('划出了豆板，已停笔。');
  const index = cellIndex(cell.row, cell.col), goal = game.goalCells[index];
  if (game.placed[index]) return true;
  if (!goal && (!game.isFree || game.replayCells)) return stopStroke('划出了图案区域，已停笔。');
  const result = placeHeld(cell);
  if (!result) return stopStroke('');
  stroke.placed++;
  if (result.wrong) return stopStroke(`放错色了：这里需要 ${colorByHex(result.goal)?.code ?? '目标色'}，已停笔。`);
  if (!held) return stopStroke(`连放 ${stroke.placed} 颗，笔里的豆用完了。`);
  return true;
}

function removeAt(row, col) {
  const removed = game.remove(row, col);
  if (!removed) return null;
  physics?.removeBead(removed.id);
  view.removeBead(removed.id, row, col);
  updateStatus();
  persist();
  return removed;
}

function onFallen(id) {
  if (!game) return;
  const bead = game.fall(id, physics?.getBeadPose(id));
  if (!bead) return;
  view?.setTargetVisibility(bead.row, bead.col, true);
  if (view?.isFallback) {
    view.removeBead(id, bead.row, bead.col);
  }
  // 一次摇晃可能同时掉几百颗：逐颗记账，但提示、列表、状态和存档合并成一次（以前每颗都存一次档，掉得越多越卡）。
  if (!fallenFlushPending) { fallenFlushPending = true; queueMicrotask(flushFallen); }
}

let fallenFlushPending = false;
function flushFallen() {
  fallenFlushPending = false;
  if (!game) return;
  notify('豆子被摇落了：点击桌面上的掉落豆直接移走，之后从豆盒取新豆。');
  renderFallenList();
  updateStatus();
  persist();
}

function pickupFallen(id) {
  if(!toolReady()){notify(`${toolLabel()}暂时不可用。`);return;}
  if(game.traySpilled){notify('先复原装豆托盘，再移走桌面的掉落豆。');return;}
  const bead=game.pickupFallen(id);if(!bead)return;
  physics?.removeBead(id);view?.removeBead(id);
  renderFallenList();updateStatus();persist();
}

function renderFallenList() {
  const list=$('fallen-list');if(!list)return;list.replaceChildren();
  if(!view?.isFallback)return;
  for(const bead of game.fallen){const button=document.createElement('button');button.className='fallen-highlight-button';button.textContent=`移走 ${colorByHex(bead.color)?.code||'豆'} · 脱位`;button.addEventListener('click',()=>pickupFallen(bead.id));list.appendChild(button);}
}

async function mountBoard(nextPattern, snapshot = null, { keepFinished = false } = {}) {
  setMagnifierEnabled(false);
  const generation = ++boardGeneration;
  selectUI?.setBusy(true);
  try {
  if (!keepFinished) {
    finishedData = null;
    ironDone = false;
    finishedViewer?.dispose();
    finishedViewer = null;
  }
  physics?.destroy();
  view?.destroy();
  physics = null;
  pattern = nextPattern;
  game = snapshot ? PegGame.fromSnapshot(snapshot, { pattern }) : new PegGame({ pattern });
  view = createPegScene({ container: $('scene'), size: pattern.size, pattern, palette: paletteForTier(settings.colorTier).slice(0,48), toolSensitivity:settings.toolSensitivity,quality:settings.workbenchQuality,onCell: onBoardCell, canStroke, onStroke, onPickColor: takeBead, onPickFallen:pickupFallen,onGraphicsError:blockGraphics, onAction: action => { if (action === 'iron') { if (game.complete) openIron(); else notify('先完成图案并移走掉落豆，再选择熨烫方式。'); } }, desk: settings.desk });
  $('app').classList.toggle('fallback-mode', view.isFallback);
  $('desk-toggle').textContent = settings.desk ? '浅木桌面' : '透明直播';
  view.setHeldGlow?.(settings.heldGlow);
  try {
    const nextPhysics = await createPegPhysics({ size: pattern.size, reportAll: false, maxBodies: PHYSICS_BODIES[settings.workbenchQuality] || 96, onUpdate: poses => view?.updatePoses(poses), onFallen });
    if (generation !== boardGeneration) { nextPhysics.destroy(); return; }
    physics = nextPhysics;
  } catch (error) {
    notify(`3D 物理初始化失败，当前仅能使用画面：${error.message}`, 6500);
  }
  view.showPattern({...pattern,cells:game.goalCells});
  for (const bead of game.placed.filter(Boolean)) {
    view.addBead(bead);
    physics?.addBead(bead.id, bead.row, bead.col, bead.color);
  }
  for(const bead of game.fallen){view.addBead(bead);physics?.addLooseBead(bead);}
  layoutController?.apply();
  renderFallenList();
  $('pattern-name').textContent = (isLegacyPreset(pattern.id)?'旧版进度 · ':'')+pattern.name;
  const sourceLabel=$('current-pattern-source');sourceLabel.hidden=pattern.source?.kind!=='generated';if(!sourceLabel.hidden)sourceLabel.textContent=`${pattern.nativeWidth}×${pattern.nativeHeight}${pattern.variant==='smaller'?' · 缩小版':pattern.variant==='larger'?' · 放大版':''} · AI 辅助设计`;
  $('preset-count').textContent = `${PRESETS.length} 张新图纸`;
  drawPixelPreview($('current-preview'), pattern.preview);
  renderSizes();
  renderJars();
  updateStatus();
  persist();
  if (new URL(location.href).searchParams.has('qa')) {
    window.__pegQa = { mode(){return {playMode,campaign,settings};}, inventory(){return inventoryColors();},hit(x, y) {
      const cell = view.cellFromClient?.(x, y);
      return cell ? { ...cell, target: game.goalCells[cellIndex(cell.row, cell.col)], placed: game.placed[cellIndex(cell.row, cell.col)] } : null;
    }, snapshot() { return game.snapshot(); }, palettePoint(code) { return view.palettePoint?.(code); }, cellPoint(row,col) { return view.cellPoint?.(row,col); }, fallenPoint(id){return view.fallenPoint?.(id);}, physicsMode(){return physics?.mode||null;}, layout(){return layoutController?.state;},bounds(part){return view.boundsFor?.(part);}, stats() { return view.stats?.(); }, finishStats(){ return finishedViewer?.stats?.() ?? null; }, finishWorker(){ return finishWorkerActive(); }, savedStats(){ return savedViewer?.stats?.() ?? null; } };
  }
  } catch(error){if(error.code==='WEBGL_REQUIRED'){blockGraphics(error);return false;}throw error;}
  finally {if(generation===boardGeneration)selectUI?.setBusy(false);}

}

async function resizeBoard(size) {
  if(playMode==='campaign'){notify('关卡板格在关卡列表中设置，当前关卡不可直接修改。');return;}
  if (size === pattern.size) return;
  if(game.fallen.length){notify('先移走桌面上的摇落豆，再调整板格。');return;}
  if (game.traySpilled) { notify('请先按空格复原装豆托盘，再调整画板。'); return; }
  let next;
  // 生成图纸：换板格时从高清原图换成缩小（省豆）或放大（更多细节）的版本，确认前先看预览。
  if(playMode!=='free'&&pattern.source?.kind==='generated'){
    next=recolorPattern(createPresetPattern(pattern.id,size,{fit:'board'}),settings.colorTier);
    const beads=next.cells.filter(Boolean).length,current=game.targetCount,sameArt=next.nativeWidth===pattern.nativeWidth&&next.nativeHeight===pattern.nativeHeight;
    const change=sameArt?'图纸不变':next.variant==='native'?`图纸换回原尺寸 ${next.nativeWidth}×${next.nativeHeight}`:`图纸${beads<current?'缩小':'放大'}为 ${next.nativeWidth}×${next.nativeHeight}`;
    const note=next.size>size?`（这张图最小要 ${next.size} 格，板格会用 ${next.size}）`:'';
    const generation=boardGeneration;
    if(!await askConfirm(`换成 ${next.size}×${next.size} 板${note}：${change}，共 ${beads} 颗豆（现在 ${current} 颗）。${game.placed.some(Boolean)?'当前拼豆进度会清空。':''}`,{ok:'换板',preview:next.preview}))return;
    if(generation!==boardGeneration)return;
    if(game.fallen.length||game.traySpilled){notify('确认期间出现了掉落豆或托盘被打翻，请先处理再操作。');return;}
    held=null;mountBoard(next);return;
  }
  if (!await confirmBoardChange('调整画板大小会清空当前拼豆进度，继续吗？')) return;
  if(playMode==='free')next=freePattern(size,pattern.name);
  else if(pattern.id==='custom'){
   const source=pattern.preview,temp=document.createElement('canvas');temp.width=source.width;temp.height=source.height;const ctx=temp.getContext('2d');source.cells.forEach((hex,index)=>{if(hex){ctx.fillStyle=hex;ctx.fillRect(index%source.width,Math.floor(index/source.width),1,1);}});next=rasterToPattern(ctx.getImageData(0,0,temp.width,temp.height),size,{name:pattern.name,colorTier:settings.colorTier});
  }else next=recolorPattern(createPresetPattern(pattern.id,Math.min(size,48)),settings.colorTier);

  held = null;
  mountBoard(next);
}

function openOverlay(id) { selectUI?.close();setMagnifierEnabled(false);$(id).classList.add('open');selectUI?.sync(); }
function closeOverlay(id) {
  selectUI?.close();
  $(id).classList.remove('open');
  if (id === 'iron-overlay') { finishedViewer?.dispose(); finishedViewer = null; }
  if (id === 'viewer-overlay') { savedViewer?.dispose(); savedViewer = null; selectedSavedRecord = null; }
}

function selectedPattern(id,size,fit='native'){return recolorPattern(createPresetPattern(id,size,{fit}),settings.colorTier);}
function renderPatternModal() {
  const categoryRow = $('categories');
  categoryRow.replaceChildren();
  for (const item of [{ id: 'all', name: '全部' }, ...CATEGORIES]) {
    const button = document.createElement('button');
    button.className = `chip${category === item.id ? ' active' : ''}`;
    button.textContent = item.name;
    button.addEventListener('click', () => { category = item.id; renderPatternModal(); });
    categoryRow.appendChild(button);
  }
  const grid = $('pattern-grid');
  grid.replaceChildren();
  const presets = category === 'all' ? listPresets() : listPresets(category);
  for (const entry of presets) {
    const miniPattern = createPresetPattern(entry.id, 16);
    const button = document.createElement('button');
    button.className = `pattern-card${selectedPreset === entry.id ? ' selected' : ''}`;
    const canvas = document.createElement('canvas');
    drawPixelPreview(canvas, miniPattern.preview);
    const name = document.createElement('b');
    name.textContent = entry.name;
    const meta=document.createElement('small');meta.textContent=`${entry.width}×${entry.height} · ${entry.source.colors} 色 · ${entry.source.beads} 豆`;button.append(canvas,name,meta);
    button.addEventListener('click', () => choosePattern(entry.id));
    const card=document.createElement('article');card.className='pattern-entry';card.append(button);grid.append(card);
  }
}

async function choosePattern(id) {
  if(patternDestination.startsWith('level')){saveLevelPattern(selectedPattern(id,levelDestinationSize(),'board'),patternDestination);closeOverlay('pattern-overlay');openSettings();return;}
  if(playMode!=='pattern'){notify('请切换到单图模式更换当前图案；关卡图案在关卡列表中编辑。');return;}
  if (id === pattern.id) { closeOverlay('pattern-overlay'); return; }
  if(game.fallen.length){notify('先移走桌面上的摇落豆，再更换图案。');return;}
  if (game.traySpilled) { notify('请先按空格复原装豆托盘，再更换图案。'); return; }
  if (!await confirmBoardChange('更换图案会清空当前拼豆进度，继续吗？')) return;
  const next = selectedPattern(id,pattern.size);settings.colorTier=next.colorTier;
  if(next.size>pattern.size)notify(`原图 ${next.nativeWidth}×${next.nativeHeight}，豆板已扩大到 ${next.size} 格以保留像素。`);
  selectedPreset = id;
  held = null;
  closeOverlay('pattern-overlay');
  mountBoard(next);
}

let uploadSerial = 0;
async function handleImageUpload(file) {
  if (!file) return;
  if(game.fallen.length){notify('先移走摇落豆，再导入新图案。');$('image-input').value='';return;}
  if (game.traySpilled) { notify('请先按空格复原装豆托盘，再导入图片。'); $('image-input').value = ''; return; }
  const serial = ++uploadSerial;
  const generation = boardGeneration,destination=patternDestination;
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024) {
    notify('只支持不超过 8 MB 的 PNG/JPEG/WebP 图片。');
    return;
  }
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
    if (serial !== uploadSerial || generation !== boardGeneration) return;
    if (bitmap.width * bitmap.height > 16_000_000) throw new Error('图片像素过大，请缩小后上传');
    const scale = Math.min(1, 256 / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bitmap, 0, 0, width, height);
    const next = rasterToPattern(ctx.getImageData(0, 0, width, height), destination.startsWith('level')?levelDestinationSize():pattern.size, { colorTier:settings.colorTier,name: file.name.replace(/\.[^.]+$/, '').slice(0, 32) || '自定义图片' });
    if (!next.cells.some(Boolean)) throw new Error('图片没有可拼的非透明像素');
    if (serial !== uploadSerial || generation !== boardGeneration) return;
    if (game.traySpilled) { notify('托盘在图片读取期间被打翻，请先复原后再导入。'); return; }
    if (game.fallen.length) { notify('请先移走散落的豆子，再导入图片。'); return; }
    if(destination.startsWith('level')){saveLevelPattern(next,destination);closeOverlay('pattern-overlay');openSettings();notify('关卡图案已更新。');return;}
    if(playMode!=='pattern'){notify('请在单图模式导入图案，或使用关卡编辑中的上传按钮。');return;}
    if (!await confirmBoardChange('导入图片会清空当前拼豆进度，继续吗？')) return;
    if (serial !== uploadSerial) return;
    selectedPreset = 'custom';
    held = null;
    closeOverlay('pattern-overlay');
    await mountBoard(next);
    notify(`已载入图片：${next.name}，自动匹配 ${new Set(next.cells.filter(Boolean)).size} 种豆色。`);
  } catch (error) {
    notify(`图片导入失败：${error.message}`);
  } finally {
    bitmap?.close();
    $('image-input').value = '';
  }
}

function levelDestinationSize(){const i=Number(patternDestination.split(':')[1]);return Number.isInteger(i)&&campaign.levels[i]?campaign.levels[i].pattern.size:Number($('level-size').value)||30;}
function saveLevelPattern(p,destination){const i=Number(destination.split(':')[1]);if(Number.isInteger(i)&&campaign.levels[i])campaign.levels[i]={...makeLevel(p),id:campaign.levels[i].id};else if(campaign.levels.length<100)campaign.levels.push(makeLevel(p));campaignChanged();}
function modeCheckpoint(){return{pattern:structuredClone(pattern),game:game.snapshot(),finished:finishedData?{...finishedData,dataUrl:null}:null};}
function campaignChanged(){campaign.index=0;campaign.done=false;delete modeSessions.campaign;persist();renderModeSettings();}
function mayChangeBoard(){if(game.traySpilled||game.fallen.length){notify('先复原托盘并移走全部掉落豆，再切换。');return false;}if(document.querySelector('#iron-stage.ironing')){notify('请等待熨烫结束。');return false;}return true;}
async function switchMode(next){
 if(!MODES.includes(next)||next===playMode)return;if(!mayChangeBoard()){renderModeSettings();return;}
 modeSessions[playMode]=modeCheckpoint();playMode=next;palettePage=0;paletteSearch='';
 const prior=modeSessions[next];finishedData=restoreFinishedMeta(prior?.finished);ironDone=!!finishedData;held=null;
 const p=prior&&validPattern(prior.pattern)?structuredClone(prior.pattern):next==='free'?freePattern(pattern.size):next==='campaign'?levelPattern(campaign.levels[campaign.index]):recolorPattern(createPresetPattern(PRESETS[0].id,pattern.size),settings.colorTier);
 if(p.colorTier)settings.colorTier=p.colorTier;
 await mountBoard(p,prior?.game,{keepFinished:!!finishedData});renderSettings();persist();
}
async function nextLevel(){
 if(playMode!=='campaign'||game.completedRounds<game.requiredRounds||!mayChangeBoard())return;
 if(campaign.index+1>=campaign.levels.length){campaign.done=true;notify('全部关卡完成！成品可以继续保存与检视。');persist();updateStatus();return;}
 campaign.index++;held=null;const p=levelPattern(campaign.levels[campaign.index]);settings.colorTier=p.colorTier||48;closeOverlay('iron-overlay');await mountBoard(p);persist();notify(`第 ${campaign.index+1} 关：${p.name}`);
}
function levelSizeValid(){const n=Number($('level-size').value);if(!validBoardSize(n)){notify('关卡板格须为 16–64 的整数。');return false;}return true;}
function renderModeSettings(){
 $('play-mode').value=playMode;$('color-tier').value=String(settings.colorTier);$('color-tier').disabled=playMode!=='pattern';$('palette-search').value=paletteSearch;
 $('free-name').value=playMode==='free'?pattern.name:'自由作品';$('free-controls').hidden=playMode!=='free';
 $('campaign-state').textContent=playMode==='campaign'?`正在挑战第 ${campaign.index+1}/${campaign.levels.length} 关${campaign.done?' · 已通关':''}。切换到其他模式后可编辑列表。`:`共 ${campaign.levels.length} 关，进入关卡模式按顺序挑战。`;
 const list=$('level-list');list.replaceChildren();
 campaign.levels.forEach((level,index)=>{
  const row=document.createElement('div');row.className='level-row';row.dataset.level=index;
  const thumb=document.createElement('canvas');drawPixelPreview(thumb,{width:level.pattern.size,height:level.pattern.size,cells:level.pattern.cells});
  const title=document.createElement('input');title.value=level.name;title.maxLength=60;title.setAttribute('aria-label',`第 ${index+1} 关名称`);title.disabled=playMode==='campaign';title.addEventListener('change',()=>{level.name=title.value.trim()||level.pattern.name;campaignChanged();});
  const info=document.createElement('small');info.textContent=`${index+1}. ${level.pattern.size}×${level.pattern.size} · ${new Set(level.pattern.cells.filter(Boolean)).size} 色`;
  const details=document.createElement('div');details.append(title,info);row.append(thumb,details);const replace=document.createElement('button');replace.textContent='换图';replace.className='menu-secondary';replace.disabled=playMode==='campaign';replace.addEventListener('click',()=>{patternDestination=`level:${index}`;closeOverlay('settings-overlay');renderPatternModal();openOverlay('pattern-overlay');});row.append(replace);
  const tier=document.createElement('select');tier.setAttribute('aria-label',`第 ${index+1} 关颜色精细度`);for(const n of [48,96,144,256,'original']){const o=document.createElement('option');o.value=n;o.textContent=n==='original'?'原色':n+' 色';tier.append(o);}tier.value=String(level.pattern.colorTier||48);tier.disabled=playMode==='campaign';tier.addEventListener('change',()=>{level.pattern=recolorPattern(level.pattern,tier.value==='original'?'original':Number(tier.value));campaignChanged();});row.append(tier);
  for(const[label,delta]of [['↑',-1],['↓',1],['删除',0]]){const button=document.createElement('button');button.className='menu-secondary';button.textContent=label;button.disabled=playMode==='campaign'||(delta===-1&&index===0)||(delta===1&&index===campaign.levels.length-1)||(delta===0&&campaign.levels.length===1);button.addEventListener('click',()=>{if(delta)[campaign.levels[index],campaign.levels[index+delta]]=[campaign.levels[index+delta],campaign.levels[index]];else campaign.levels.splice(index,1);campaignChanged();});row.append(button);}list.append(row);
 });
 for(const id of ['level-add-preset','level-add-upload','level-add-current'])$(id).disabled=playMode==='campaign'||campaign.levels.length>=100;
 $('color-count').textContent=`本图实际 ${new Set(game.goalCells.filter(Boolean)).size} 色 · ${settings.colorTier==='original'?'原色保留':settings.colorTier+' 色精度'}`;
}
function bindModeUi(){
 $('play-mode').addEventListener('change',e=>switchMode(e.target.value));
 $('next-level').addEventListener('click',nextLevel);
 $('free-name').addEventListener('change',e=>{if(playMode==='free'){pattern.name=e.target.value.trim().slice(0,60)||'自由作品';$('pattern-name').textContent=pattern.name;persist();}});
 $('free-new').addEventListener('click',async()=>{if(!mayChangeBoard())return;if(!await confirmBoardChange('新建会清空当前自由作品，已存成品不受影响。继续吗？'))return;held=null;await mountBoard(freePattern(pattern.size));persist();renderSettings();});
 $('free-color-add').addEventListener('click',()=>{const hex=$('free-color').value.toLowerCase();if(!settings.customColors.includes(hex))settings.customColors.push(hex);settings.customColors=settings.customColors.slice(-128);paletteSearch=hex;palettePage=0;renderJars();persist();notify(`已加入 ${colorByHex(hex).code}，关闭菜单后从豆盒取用。`);});
 $('palette-search').addEventListener('input',e=>{if(game.traySpilled)return;paletteSearch=e.target.value.trim();palettePage=0;renderJars();});
 for(const[id,dir]of [['palette-prev',-1],['palette-next',1]])$(id).addEventListener('click',()=>{if(game.traySpilled){notify('先复原库存托盘。');return;}palettePage+=dir;renderJars();});
 $('color-tier').addEventListener('change',async e=>{
  const tier=e.target.value==='original'?'original':Number(e.target.value);if(!validColorTier(tier))return;
  if(playMode==='campaign'){notify('请在关卡列表分别设置精细度。');renderSettings();return;}
  if(!mayChangeBoard()){renderSettings();return;}
  if(playMode==='free'){settings.colorTier=tier;renderJars();persist();return;}
  if(!await confirmBoardChange('更改颜色精细度会重新转换当前图案并清空本次拼豆，继续吗？')){renderSettings();return;}
  settings.colorTier=tier;held=null;await mountBoard(recolorPattern(pattern,tier));renderSettings();persist();
 });
 $('level-add-preset').addEventListener('click',()=>{if(!levelSizeValid())return;patternDestination='level';closeOverlay('settings-overlay');renderPatternModal();openOverlay('pattern-overlay');});
 $('level-add-upload').addEventListener('click',()=>{if(!levelSizeValid())return;patternDestination='level';$('image-input').click();});
 $('level-add-current').addEventListener('click',()=>{try{campaign.levels.push(makeLevel(game.isFree?{...pattern,id:'custom',mode:'pattern',cells:game.pieceCells,sourceCells:game.pieceCells}:pattern));campaignChanged();}catch(e){notify(e.message);}});
 $('campaign-restart').addEventListener('click',async()=>{if(!mayChangeBoard())return;if(!await askConfirm('从第一关重新开始这组关卡？'))return;if(!mayChangeBoard())return;delete modeSessions.campaign;campaign.index=0;campaign.done=false;if(playMode==='campaign'){held=null;await mountBoard(levelPattern(campaign.levels[0]));persist();renderSettings();}else await switchMode('campaign');});
}

function captureProgress(name){
 if(document.querySelector('#iron-stage.ironing'))throw new Error('请等待熨烫动画结束再保存。');
 while(giftQueue.length){applyGift(giftQueue.shift());}
 persist();return makeProgressSave({...modeCheckpoint(),playMode,campaign:structuredClone(campaign),modeSessions:structuredClone(modeSessions),settings:structuredClone(settings)},name||$('save-name').value||pattern.name);
}
function downloadSave(save){const blob=new Blob([JSON.stringify(save,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`${save.name.replace(/[<>:"/\\|?*]/g,'_')}.拼豆存档.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function renderSaveList(){
 if(!$('save-list'))return;const serial=++saveListSerial;
 try{const records=await progressStore.list();if(serial!==saveListSerial)return;const list=$('save-list');list.replaceChildren();
 if(!records.length){const empty=document.createElement('p');empty.textContent='暂无命名存档。当前进度仍会自动保存；也可以导出本地文件。';list.append(empty);}
 for(const record of records){const row=document.createElement('div');row.className='progress-save-row';row.dataset.saveId=record.id;const label=document.createElement('div'),title=document.createElement('b'),note=document.createElement('small');title.textContent=record.id==='recovery'?'读取前的恢复备份':record.save.name;
 try{validateProgressSave(record.save);note.textContent=`${progressSummary(record.save)} · ${new Date(record.save.savedAt).toLocaleString()}`;}catch{note.textContent='此存档损坏，不能继续；可以导出原文件检查。';}
 label.append(title,note);row.append(label);
 for(const[text,action]of [['继续拼豆',()=>loadProgress(record.save)],['导出',()=>downloadSave(record.save)],['覆盖为当前',async()=>{if(!await askConfirm(`用当前进度覆盖「${record.save.name}」？`,{ok:'覆盖'}))return;await progressStore.save(record.id,captureProgress(record.save.name));await renderSaveList();notify('存档已更新。');}],['删除',async()=>{if(!await askConfirm(`删除「${record.save.name}」？已导出的本地文件不受影响。`,{ok:'删除'}))return;await progressStore.remove(record.id);await renderSaveList();}]]){const button=document.createElement('button');button.className='menu-secondary';button.textContent=text;button.addEventListener('click',()=>Promise.resolve().then(action).catch(e=>notify(e.message,6000)));row.append(button);}list.append(row);}
 }catch(e){$('save-list').textContent=`存档库不可用：${e.message}。仍可使用本地导出。`;}
}
async function loadProgress(raw){
 const save=validateProgressSave(raw);if(loadingArchive)return;if(document.querySelector('#iron-stage.ironing')){notify('请等待熨烫结束。');return;}
 if(!await askConfirm(`继续「${save.name}」？当前进度会先备份，再读取所选存档。`))return;
 if(loadingArchive)return;if(document.querySelector('#iron-stage.ironing')){notify('请等待熨烫结束。');return;}
 const before=captureProgress('读取前的恢复备份');loadingArchive=true;
 try{
  await progressStore.save('recovery',before);
  const state=save.state;for(const key of Object.keys(settings))if(Object.hasOwn(state.settings,key))settings[key]=structuredClone(state.settings[key]);settings.layout=normalizeLayout(settings.layout);
  playMode=state.playMode;campaign=normalizeCampaign(state.campaign);modeSessions=structuredClone(state.modeSessions);palettePage=0;paletteSearch='';held=null;manualHistory=[];giftQueue=[];
  finishedData=restoreFinishedMeta(state.finished);ironDone=!!finishedData;document.querySelectorAll('.overlay.open').forEach(el=>closeOverlay(el.id));
  await mountBoard(structuredClone(state.pattern),state.game,{keepFinished:!!finishedData});if(layoutController){Object.assign(layoutController.state,normalizeLayout(settings.layout));layoutController.apply();}
  persist();notify(savingFailed?`已载入：${save.name}，但自动保存不可用；请用命名存档或本地导出保留后续进度。`:`已继续：${save.name}。读取前进度已保留在恢复备份。`,savingFailed?8000:3400);
 }catch(e){notify(`读取未完成：${e.message}。请从存档页的恢复备份恢复。`,8000);}
 finally{loadingArchive=false;giftQueue.push(...deferredLiveGifts.splice(0));drainGiftQueue();renderSaveList();}
}
function bindSaveUi(){
 $('save-progress').addEventListener('click',async()=>{try{if(loadingArchive)return;const save=captureProgress();await progressStore.save(crypto.randomUUID(),save);notify('已保存为独立存档。');renderSaveList();}catch(e){notify(e.message,7000);}});
 $('export-progress').addEventListener('click',()=>{try{downloadSave(captureProgress());notify('已导出本地存档文件。');}catch(e){notify(e.message,7000);}});
 $('import-progress').addEventListener('click',()=>$('save-file').click());
 $('save-file').addEventListener('change',async e=>{const file=e.target.files?.[0],serial=++importSerial;pendingImport=null;$('save-import-preview').hidden=true;if(!file)return;try{if(file.size>MAX_SAVE_BYTES)throw new Error('存档文件不能超过 15 MB。');const save=parseProgressSave(await file.text());if(serial!==importSerial)return;pendingImport=save;$('save-import-summary').textContent=`${save.name} · ${progressSummary(save)} · ${new Date(save.savedAt).toLocaleString()}`;$('save-import-preview').hidden=false;}catch(err){notify(err.message,7000);}finally{e.target.value='';}});
 $('confirm-save-import').addEventListener('click',async()=>{if(!pendingImport)return;try{await progressStore.save(crypto.randomUUID(),pendingImport);pendingImport=null;$('save-import-preview').hidden=true;await renderSaveList();notify('已导入存档库，点击继续拼豆即可读取。');}catch(e){notify(e.message,7000);}});
 $('cancel-save-import').addEventListener('click',()=>{pendingImport=null;importSerial++;$('save-import-preview').hidden=true;});
}

function renderSettings() {
  renderModeSettings();renderSaveList();
  $('custom-board-size').value=pattern.size;
  $('hint-toggle').checked=settings.hint;
  $('held-glow-toggle').checked=settings.heldGlow;
  $('jar-filter').value=settings.jarFilter;
  $('transparent-background').checked=!settings.desk;
  $('magnifier-key').value=settings.magnifierKey.replace('Key','').replace('Digit','');
  $('magnifier-mode').value=settings.magnifierMode;
  $('tool-sensitivity').value=settings.toolSensitivity;
  $('default-tool').value=settings.defaultTool;
  $('finish-quality').value=settings.finishQuality;
  $('workbench-quality').value=settings.workbenchQuality;
  $('pen-capacity').value=settings.penCapacity;
  $('magnifier-zoom').value=settings.magnifierZoom;
  $('magnifier-size').value=settings.magnifierSize;
  $('menu-connection').textContent=$('gift-status').textContent;
  renderEffectSettings();
  selectUI?.sync();
}

function renderEffectSettings() {
  const nav=$('effect-tabs');nav.replaceChildren();
  for(const effect of EFFECTS){const button=document.createElement('button');button.type='button';button.textContent=effect.label;button.dataset.effect=effect.id;button.className=effect.id===activeEffect?'active':'';button.addEventListener('click',()=>{activeEffect=effect.id;renderEffectSettings();});nav.appendChild(button);}
  const effect=EFFECTS.find(item=>item.id===activeEffect),rule=settings.rules.find(item=>item.id===activeEffect);
  $('effect-title').textContent=effect.label;$('effect-description').textContent=effect.description;
  $('damaged-rules-warning').hidden=!rulesLoadError;
  $('replace-damaged-rules').onclick=async()=>{
    if(!rulesLoadError)return;
    if(!await askConfirm('互动规则读取失败，原浏览器记录尚未覆盖。确定用当前页面的规则与进度替换原记录？',{ok:'覆盖原记录'}))return;
    rulesLoadError=null;savingFailed=false;persist();renderEffectSettings();notify('当前规则与进度已保存。');
  };
  $('interaction-level-count').textContent=`已设置 ${rule.levels.length} 个互动级别（最多 ${MAX_INTERACTION_LEVELS} 个）`;
  const parent=$('rules');parent.replaceChildren();
  const add=$('add-interaction-level');add.disabled=rule.levels.length>=MAX_INTERACTION_LEVELS;
  add.onclick=()=>{
    const level=createInteractionLevel(effect.id,rule.levels);rule.levels.push(level);
    const issues=validateRuleSet(settings.rules);
    if(issues.length){rule.levels.pop();notify(issues[0]);return;}
    persist();renderEffectSettings();
    parent.querySelector(`[data-tier="${level.id}"] [data-param="name"]`)?.focus();
  };
  if(!rule.levels.length){const empty=document.createElement('p');empty.className='interaction-empty';empty.textContent='还没有礼物规则。点击「添加互动级别」，填写礼物名称和参数后启用。';parent.appendChild(empty);}
  for(const [index,level] of rule.levels.entries()){
    const card=document.createElement('section');card.className='tier-card';card.dataset.tier=level.id;
    const head=document.createElement('div');head.className='tier-head';const title=document.createElement('h4');title.textContent=`级别 ${index+1}`;
    const enableLabel=document.createElement('label');enableLabel.className='tier-enable';const enable=document.createElement('input');enable.type='checkbox';enable.checked=level.enabled;enable.setAttribute('aria-label',`${effect.label}${level.name}启用`);enableLabel.append(enable,document.createTextNode('启用'));head.append(title,enableLabel);card.appendChild(head);
    function commit(key,value){const old=level[key];level[key]=value;const issues=validateRuleSet(settings.rules);if(issues.length){level[key]=old;notify(issues[0]);return false;}persist();return true;}
    enable.addEventListener('change',()=>{if(!commit('enabled',enable.checked))enable.checked=level.enabled;});
    function textField(label,key,max){const wrap=document.createElement('label');wrap.className='tier-field';wrap.appendChild(document.createTextNode(label));const input=document.createElement('input');input.type='text';input.value=level[key];input.maxLength=max;input.dataset.param=key;input.setAttribute('aria-label',`${effect.label}级别 ${index+1}${label}`);input.addEventListener('change',()=>{if(!commit(key,input.value.trim()))input.value=level[key];else input.value=level[key];});wrap.appendChild(input);card.appendChild(wrap);}
    textField('互动级别名称','name',60);
    textField('对应礼物名称','giftName',100);
    function field(label,key,max,min=1){const wrap=document.createElement('label');wrap.className='tier-field';const text=document.createElement('span');text.textContent=label;const input=document.createElement('input');input.type='number';input.min=min;input.max=max;input.step=1;input.value=level[key];input.dataset.param=key;input.setAttribute('aria-label',`${effect.label}级别 ${index+1}${label}`);input.addEventListener('change',()=>{if(!commit(key,Number(input.value)))input.value=level[key];});wrap.append(text,input);card.appendChild(wrap);}
    if(effect.id!=='spill')field(`每份用量（${effect.unit}）`,'amount',effect.max);
    if(effect.id==='shake'){field('摇晃力度（%）','strength',100);field('动画时长（秒）','duration',15);}
    if(effect.id==='spill'){field('每段连按次数','presses',50,2);field('停按回落（%/秒）','decay',50,0);}
    if(effect.id==='pen')field('一次装豆容量','capacity',20,2);
    const actions=document.createElement('div');actions.className='tier-actions';
    const test=document.createElement('button');test.className='tier-preview';test.type='button';test.textContent='预览此级别';test.addEventListener('click',()=>{const issues=validateRuleSet(settings.rules);if(issues.length){notify(issues[0]);return;}const preview={...level,id:effect.id,tier:level.id,count:level.amount};closeOverlay('settings-overlay');requestAnimationFrame(()=>{executeInteraction(preview,'本地测试');persist();});});
    const remove=document.createElement('button');remove.className='tier-remove';remove.type='button';remove.textContent='删除级别';remove.addEventListener('click',async()=>{if(!await askConfirm(`删除「${level.name}」及其礼物规则？`,{ok:'删除'}))return;const position=rule.levels.findIndex(item=>item.id===level.id);if(position<0)return;rule.levels.splice(position,1);persist();renderEffectSettings();});
    actions.append(test,remove);card.appendChild(actions);parent.appendChild(card);
  }
}

function openSettings(){renderSettings();openOverlay('settings-overlay');}

function applyGift(gift) {
  const rule=resolveGiftRule(settings.rules,gift);
  if(!rule)return -1;
  return executeInteraction(rule,gift.nickname||'观众');
}

const SHAKE_GAP_MS = 450;
// 执行一条互动，返回这条效果还要持续占用的毫秒数（多次摇桌会逐次摇），礼物队列据此排队。
function executeInteraction(rule,actor='本地测试') {
  const count=rule.count;
  let hold=0;
  if(game.isFree&&rule.id==='help'){announce(actor,'想帮忙拼豆，但自由模式没有标准答案，未执行。');return 0;}
  switch (rule.id) {
    case 'shake': {
      const power = rule.strength / 100, generation = boardGeneration;
      physics?.shake(power);
      for (let i = 1; i < count; i++) setTimeout(() => { if (generation === boardGeneration && !graphicsBlocked) physics?.shake(power); }, i * SHAKE_GAP_MS);
      hold = (count - 1) * SHAKE_GAP_MS;
      view?.shakeVisual(rule.duration + hold / 1000);
      announce(actor, count > 1 ? `摇了 ${count} 次桌子！` : '摇了桌子！');
      break;
    }
    case 'swap': {
      const changes = game.swapRandom(count, inventoryColors().map(item => item.hex));
      changes.forEach(item => view.updateBeadColor(item));
      announce(actor, `换掉了 ${changes.length} 颗已拼豆的颜色。`);
      break;
    }
    case 'help': {
      const changes = game.help(count);
      for (const bead of changes) {
        if (bead.oldId) {
          physics?.removeBead(bead.oldId);
          view.removeBead(bead.oldId, bead.row, bead.col);
        }
        view.addBead(bead);
        physics?.addBead(bead.id, bead.row, bead.col, bead.color);
      }
      announce(actor, `帮你拼了 ${changes.length} 颗豆。`);
      break;
    }
    case 'remove': {
      const changes = game.removeRandom(count);
      for (const bead of changes) {
        physics?.removeBead(bead.id);
        view.removeBead(bead.id, bead.row, bead.col);
      }
      announce(actor, `减去了 ${changes.length} 颗豆。`);
      break;
    }
    case 'hide': {
      game.hideHint(count);
      announce(actor, `遮住图纸 ${count} 秒！（共剩 ${Math.ceil((game.hintHiddenUntil - Date.now()) / 1000)} 秒）`);
      break;
    }
    case 'spill': {
      const started = game.spill({presses:rule.presses,decay:rule.decay});
      if (started) {
        held = null;
        updateHeld();
        view?.setTrayState?.(true, 0, { animate: true });
        renderTraySpill();
        announce(actor, '打翻了装豆盒托盘！按空格分五段收回库存豆。');
      } else announce(actor, '又掀了一下托盘，托盘已经散着，继续按空格复原。');
      break;
    }
    case 'confiscate': {
      game.confiscate(count);
      if (!giftPenActive()) { held = null; updateHeld(); }
      announce(actor, `没收了${toolLabel()} ${count} 秒！（共剩 ${Math.ceil((game.tweezersLockedUntil - Date.now()) / 1000)} 秒）`);
      break;
    }
    case 'pen': {
      game.grantPen(count, rule.capacity);
      announce(actor, `送来升级拼豆笔 ${count} 秒！每次取 ${pickCapacity()} 颗，可按住划动连放。（共剩 ${Math.ceil((game.penUntil - Date.now()) / 1000)} 秒）`);
      break;
    }
    case 'extra': {
      const before = game.placed.filter(Boolean);
      const previousRounds=game.requiredRounds;
      const restarted = game.addRounds(count);
      if (restarted) {
        for (const bead of before) physics?.removeBead(bead.id);
        view.clearBeads();view.showPattern({...pattern,cells:game.goalCells});
        held = null;
        updateHeld();
      }
      const added=game.requiredRounds-previousRounds;
      announce(actor, added?`加了 ${added} 遍！这张图还要再拼。`:'已达到 20 遍上限，本次未增加遍数。');
      break;
    }
  }
  updateStatus();
  return hold;
}

// 礼物逐个结算，每条之间留出间隔，让观众看清是谁送了什么、产生了什么效果。
const GIFT_GAP_MS = 900;
async function drainGiftQueue() {
  if (drainingGifts || !game || loadingArchive) return;
  drainingGifts = true;
  try {
    while (giftQueue.length && !loadingArchive) {
      const gift = giftQueue[0];
      let hold = -1;
      try { hold = applyGift(gift); }
      catch (error) { notify(`礼物效果执行失败：${error.message}`); hold = 0; }
      giftQueue.shift();
      persist();
      // 没有对应规则的礼物不占用间隔；刷新时已结算的礼物不会重复执行。
      // 最后一条也要等间隔结束，之后到达的礼物才不会和它挤在一起。
      if (hold >= 0) await new Promise(resolve => setTimeout(resolve, Math.max(GIFT_GAP_MS, hold)));
    }
  } finally { drainingGifts = false; }
}

function pressRestore(event) {
  if (!game?.traySpilled || event.repeat) return;
  const stage = game.pressRestore({ repeat: false });
  if (stage) {
    advanceTraySpill(stage);
    notify(stage === 5 ? '装豆盒和托盘复原完成，可以继续取豆！' : `第 ${stage} 段完成，一部分库存豆正在飞回装豆盒。`);
  }
  updateStatus();
  persist();
}

function finishedPng(style, cells = pattern.cells, size = pattern.size) {
  const pitch = 30;
  const pad = 24;
  const canvas = document.createElement('canvas');
  canvas.width = size * pitch + pad * 2;
  canvas.height = size * pitch + pad * 2;
  const ctx = canvas.getContext('2d');
  const radius = style === 'light' ? 0.41 : style === 'fusion' ? 0.51 : 0.47;
  const hole = ({light:.17,fusion:.045,matte:.055,crinkle:.045,soft:.075,double:.17,flat:0})[style] ?? .09;
  for (let index = 0; index < cells.length; index++) {
    const color = cells[index];
    if (!color) continue;
    const x = pad + (index % size + 0.5) * pitch;
    const y = pad + (Math.floor(index / size) + 0.5) * pitch;
    const r = radius * pitch;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(50,31,49,.18)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    if (style !== 'fusion') {
      ctx.fillStyle = 'rgba(255,255,255,.23)';
      ctx.beginPath();
      ctx.arc(x - r * 0.24, y - r * 0.28, r * 0.44, Math.PI * 1.05, Math.PI * 1.65);
      ctx.strokeStyle = 'rgba(255,255,255,.52)';
      ctx.lineWidth = 2.2;
      ctx.stroke();
    }
    if (hole > 0) {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.arc(x, y, hole * pitch, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }
  }
  return canvas.toDataURL('image/png');
}

function renderIronOptions() {
  const row = $('iron-options');
  row.replaceChildren();
  for (const style of STYLES) {
    const button = document.createElement('button');
    button.className = `iron-option${currentStyle === style.id ? ' active' : ''}`;
    button.disabled = ironDone;
    const title = document.createElement('b'); title.textContent = style.name;
    const detail = document.createElement('span'); detail.textContent = style.detail;
    button.append(title, detail);
    button.addEventListener('click', () => {
      if ($('iron-stage').classList.contains('ironing')) return;
      currentStyle = style.id;
      ironDone = false;
      finishedData = null;
      finishedViewer?.dispose();
      finishedViewer = null;
      $('iron-stage').classList.remove('revealed');
      $('download-button').disabled = true;
      $('download-glb-button').disabled = true;
      $('save-button').disabled = true;
      $('reset-finished-view').disabled = true;
      $('start-iron').disabled = false;
      $('start-iron').textContent = '开始熨烫';
      $('iron-preview').src = finishedPng(currentStyle,currentPieceCells());
      mountIronPreview();
      renderIronOptions();
    });
    row.appendChild(button);
  }
}

function currentPieceCells(){return game?.isFree?game.pieceCells:pattern.cells;}

function openIron() {
  document.querySelector('#iron-overlay h2').textContent = '选择熨烫方式';
  if (finishedData && (!game.complete || game.completedRounds >= game.requiredRounds)) {
    finishedData.dataUrl ||= finishedPng(finishedData.style, finishedData.cells, finishedData.size);
    ironDone = true;
    currentStyle = finishedData.style;
    renderIronOptions();
    openOverlay('iron-overlay');
    mountFinishedViewer();
    $('download-button').disabled = false;
    $('download-glb-button').disabled = false;
    $('save-button').disabled = false;
    $('start-iron').disabled = false;
    $('start-iron').textContent = '完成，返回工作台';
    return;
  }
  if (!game.complete || game.completedRounds >= game.requiredRounds) return;
  finishedViewer?.dispose();
  finishedViewer = null;
  $('iron-stage').classList.remove('revealed');
  ironDone = false;
  finishedData = null;
  $('download-button').disabled = true;
  $('download-glb-button').disabled = true;
  $('save-button').disabled = true;
  $('reset-finished-view').disabled = true;
  $('start-iron').disabled = false;
  $('start-iron').textContent = '开始熨烫';
  $('iron-preview').src = finishedPng(currentStyle,currentPieceCells());
  renderIronOptions();
  openOverlay('iron-overlay');
  previewTextureSeed = crypto.getRandomValues(new Uint32Array(1))[0];
  mountIronPreview();
}

function mountIronPreview() {
  finishedViewer?.dispose();
  finishedViewer = null;
  $('iron-stage').classList.add('preview');
  // 选择熨烫方式时的小预览用标准画质，切换更快；熨烫完成后的成品按设置的画质生成。
  try { finishedViewer = createFinishedViewer({ container: $('finished-viewer'), cells: currentPieceCells(), size: pattern.size, style: currentStyle, seed: previewTextureSeed, quality: 'standard' }); }
  catch { $('iron-stage').classList.remove('preview'); }
}

// 成品数据在后台线程生成（可以提前开始，例如熨烫动画一开始就算），好了再创建 3D 检视器。
let finishToken = 0;
function finishOptions(data) { return { cells: data.cells, size: data.size, style: data.style, seed: data.textureSeed, quality: settings.finishQuality }; }
async function mountFinishedViewer(preparing = null) {
  if (!finishedData) return;
  const token = ++finishToken, target = finishedData;
  document.querySelector('#iron-overlay h2').textContent = `${finishedData.name} · ${STYLES.find(item => item.id === finishedData.style)?.name || '已保存成品'}`;
  finishedViewer?.dispose();
  finishedViewer = null;
  $('iron-stage').classList.remove('preview');
  $('iron-stage').classList.add('generating');
  $('download-glb-button').disabled = true;
  $('reset-finished-view').disabled = true;
  let prepared = null;
  try { prepared = await (preparing || prepareFinished(finishOptions(finishedData))); }
  catch { prepared = null; }
  if (token !== finishToken || target !== finishedData) return;
  $('iron-stage').classList.remove('generating');
  mountFinishedViewerNow(prepared);
}
function mountFinishedViewerNow(prepared) {
  try {
    $('iron-stage').classList.remove('preview');
    $('iron-stage').classList.add('revealed');
    finishedViewer = createFinishedViewer({
      container: $('finished-viewer'),
      cells: finishedData.cells,
      size: finishedData.size,
      style: finishedData.style,
      seed: finishedData.textureSeed,
      quality: settings.finishQuality,
      prepared,
    });
    finishedViewer.render();
    finishedData.dataUrl = finishedViewer.capturePng();
    $('reset-finished-view').disabled = false;
    $('download-glb-button').disabled = false;
  } catch (error) {
    $('iron-stage').classList.remove('revealed');
    $('download-glb-button').disabled = true;
    notify(`3D 检视器启动失败：${error.message}`, 6500);
  }
}

function downloadPng(dataUrl, name) {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = `${String(name || '拼豆作品').replace(/[<>:"/\\|?*]/g, '_')}.png`;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${String(filename || '拼豆成品').replace(/[<>:"/\\|?*]/g, '_')}.glb`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function startIron() {
  if(ironDone){closeOverlay('iron-overlay');return;}
  if (!game.complete || ironDone || $('iron-stage').classList.contains('ironing')) return;
  const generation = boardGeneration;
  const style = currentStyle;
  const textureSeed = previewTextureSeed;
  const cells = [...currentPieceCells()];
  const data = finishedPng(style,cells);
  const name = pattern.name;
  const size = pattern.size;
  $('start-iron').disabled = true;
  $('iron-stage').classList.add('ironing');
  finishedViewer?.dispose();
  finishedViewer = null;
  $('iron-overlay').classList.remove('open');
  // 熨烫动画一开始就在后台线程生成成品，动画不被打断；动画结束时通常已经算好。
  const preparing = prepareFinished({ cells, size, style, seed: textureSeed, quality: settings.finishQuality });
  preparing.catch(() => {});
  await (view?.animateIron ? view.animateIron() : new Promise(resolve => setTimeout(resolve,3300)));
  {
    $('iron-stage').classList.remove('ironing');
    if (generation !== boardGeneration || !game.complete || (game.isFree&&game.pieceCells.some((c,i)=>c!==cells[i]))) {
      $('start-iron').disabled = false;
      notify('拼豆状态发生变化，请先修好画板再熨烫。');
      return;
    }
    finishedData = { dataUrl: data, cells, name, size, style, textureSeed, id: `work-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` };
    ironDone = true;
    $('iron-preview').src = data;
    $('download-button').disabled = false;
    $('save-button').disabled = false;
    $('start-iron').disabled = false;
    $('start-iron').textContent = '完成，返回工作台';
    openOverlay('iron-overlay');
    mountFinishedViewer(preparing);
    const roundResult = game.completeRound();
    if (roundResult === 'next') {
      const snapshot = game.snapshot();
      await mountBoard(pattern, snapshot, { keepFinished: true });
      notify(`本遍成品完成！还需再拼 ${game.requiredRounds - game.completedRounds} 遍。`);
    } else {
      updateStatus();
      persist();
      notify('熨烫完成！可以下载或存入成品库。');
    }
  }
}

async function saveFinished() {
  if (!ironDone || !finishedData) return;
  finishedData.dataUrl ||= finishedPng(finishedData.style, finishedData.cells, finishedData.size);
  if (finishedViewer) finishedData.dataUrl = finishedViewer.capturePng();
  try {
    await gallery.save({
      id: finishedData.id,
      name: finishedData.name,
      size: finishedData.size,
      style: finishedData.style,
      pngDataUrl: finishedData.dataUrl,
      cells: finishedData.cells,
      textureSeed: finishedData.textureSeed,
      createdAt: Date.now(),
    });
    $('save-button').disabled = true;
    notify('成品已保存到当前浏览器的作品库。');
  } catch (error) {
    notify(`${error.message} 请下载 3D 模型与 PNG 留存作品。`, 6000);
  }
}

async function renderGallery() {
  const grid = $('gallery-grid');
  grid.replaceChildren();
  let records;
  try { records = await gallery.list(); }
  catch (error) {
    const note = document.createElement('p');
    note.className = 'empty-gallery';
    note.textContent = error.message;
    grid.appendChild(note);
    return;
  }
  if (!records.length) {
    const note = document.createElement('p');
    note.className = 'empty-gallery';
    note.textContent = '这里还没有成品。拼好图案并熨烫后，就可以保存进来。';
    grid.appendChild(note);
    return;
  }
  for (const record of records) {
    const card = document.createElement('div'); card.className = 'gallery-item';
    const image = document.createElement('img'); image.src = record.pngDataUrl; image.alt = record.name;
    const title = document.createElement('b'); title.textContent = record.name;
    const styleName = STYLES.find(item => item.id === record.style)?.name || record.style;
    const meta = document.createElement('small'); meta.textContent = `${record.size}×${record.size} · ${styleName} · ${new Date(record.createdAt).toLocaleDateString('zh-CN')}`;
    const actions = document.createElement('div'); actions.className = 'gallery-item-actions';
    if (record.has3DData && isKnownIronStyle(record.style)) {
      const inspect = document.createElement('button');
      inspect.textContent = '3D 检视';
      inspect.addEventListener('click', () => openSavedViewer(record));
      actions.appendChild(inspect);
    }
    const download = document.createElement('button'); download.textContent = '下载'; download.addEventListener('click', () => downloadPng(record.pngDataUrl, record.name));
    const remove = document.createElement('button'); remove.textContent = '删除'; remove.addEventListener('click', async () => {
      if (!await askConfirm(`删除成品「${record.name}」？`, { ok: '删除' })) return;
      try { await gallery.remove(record.id); await renderGallery(); }
      catch (error) { notify(error.message); }
    });
    actions.append(download, remove);
    card.append(image, title, meta, actions);
    grid.appendChild(card);
  }
}

function openSavedViewer(record) {
  savedViewer?.dispose();
  savedViewer = null;
  selectedSavedRecord = record;
  $('saved-viewer-title').textContent = record.name;
  $('saved-viewer-style').textContent = `${record.size}×${record.size} · ${STYLES.find(item => item.id === record.style)?.name || record.style}`;
  openOverlay('viewer-overlay');
  const options = { cells: record.cells, size: record.size, style: record.style, seed: record.textureSeed ?? 1, quality: settings.finishQuality };
  $('saved-finished-viewer').classList.add('generating');
  prepareFinished(options).catch(() => null).then(prepared => {
    $('saved-finished-viewer').classList.remove('generating');
    // 等待期间关掉了检视窗口或换了别的作品，就不再创建。
    if (selectedSavedRecord !== record || !$('viewer-overlay').classList.contains('open') || savedViewer) return;
    try {
      savedViewer = createFinishedViewer({ container: $('saved-finished-viewer'), ...options, prepared });
      savedViewer.render();
    } catch (error) {
      notify(`此成品暂时无法开启 3D 检视：${error.message}`, 6500);
      closeOverlay('viewer-overlay');
    }
  });
}

async function downloadCurrentGlb(viewer, name) {
  if (!viewer) return;
  try { downloadBlob(await viewer.exportGlb(), name); }
  catch (error) { notify(`3D 模型导出失败：${error.message}`, 6500); }
}

function bindUi() {
  bindModeUi();bindSaveUi();
  document.addEventListener('pointermove', event => {
    lastPointer = { x: event.clientX, y: event.clientY };
    view?.setPointer?.(event.clientX,event.clientY);
    if (held) updateHeld();
  });
  document.addEventListener('keydown', event => {
    if (confirmOpen()) {
      if (event.key === 'Escape') { event.preventDefault(); closeConfirm(false); }
      else if (event.key === 'Enter' && !event.repeat) { event.preventDefault(); closeConfirm(document.activeElement !== $('confirm-cancel')); }
      else if (event.code === 'Space' && !(event.target instanceof Element && event.target.closest('button'))) event.preventDefault();
      return;
    }
    const editable = event.target instanceof Element && event.target.closest('input,select,textarea,[contenteditable="true"]');
    if (event.key === 'Escape') {
      setMagnifierEnabled(false);
      held = null;
      updateHeld();
      document.querySelectorAll('.overlay.open').forEach(item => closeOverlay(item.id));
      return;
    }
    if(event.code===settings.magnifierKey&&!event.ctrlKey&&!event.altKey&&!event.metaKey&&!editable&&!document.querySelector('.overlay.open')){event.preventDefault();if(settings.magnifierMode==='hold')setMagnifierEnabled(true);else if(!event.repeat)setMagnifierEnabled(!magnifierActive);return;}
    if (event.code !== 'Space' || editable || document.querySelector('.overlay.open')) return;
    if (game?.traySpilled) {
      event.preventDefault();
      pressRestore(event);
    }
  });
  $('choose-pattern').addEventListener('click', () => { renderPatternModal(); openOverlay('pattern-overlay'); });
  $('preview-button').addEventListener('click', () => { settings.hint = !settings.hint; updateStatus(); persist(); });
  $('upload-pattern').addEventListener('click', () => $('image-input').click());
  $('pattern-upload-button').addEventListener('click', () => $('image-input').click());
  $('image-input').addEventListener('change', event => handleImageUpload(event.target.files?.[0]));
  $('settings-button').addEventListener('click', openSettings);
  $('board-size-button').addEventListener('click', openSettings);
  $('desk-toggle').addEventListener('click', () => { settings.desk = !settings.desk; view?.setDesk?.(settings.desk); $('desk-toggle').textContent = settings.desk ? '浅木桌面' : '透明直播'; persist(); });
  $('help-button').addEventListener('click', () => notify('点豆盒取豆，再点对应柱位；空手点豆可取走。双击部件解锁后可拖动、缩放，双击空白打开设置。', 7500));
  $('zoom-in').addEventListener('click', () => view?.setZoom(view.getZoom() + .15));
  $('zoom-out').addEventListener('click', () => view?.setZoom(view.getZoom() - .15));
  $('view-top').addEventListener('click', () => view?.setView?.('top'));
  $('view-angle').addEventListener('click', () => view?.setView?.('angle'));
  for (const [id, direction] of [['pattern-prev', -1], ['pattern-next', 1]]) $(id).addEventListener('click', () => {
    if(playMode!=='pattern'){notify('当前模式请使用设置里的关卡或自由创作操作。');return;}
    const index = Math.max(0, PRESETS.findIndex(item => item.id === pattern.id));
    choosePattern(PRESETS[(index + direction + PRESETS.length) % PRESETS.length].id);
  });
  document.addEventListener('keyup',event=>{if(event.code===settings.magnifierKey&&settings.magnifierMode==='hold')setMagnifierEnabled(false);});
  window.addEventListener('blur',()=>setMagnifierEnabled(false));
  document.addEventListener('visibilitychange',()=>{if(document.hidden)setMagnifierEnabled(false);});
  $('tool-sensitivity').addEventListener('change',event=>{const value=Number(event.target.value);if(!validToolSensitivity(value)){event.target.value=settings.toolSensitivity;notify('镊子灵敏度须为 0.25–3 倍。');return;}settings.toolSensitivity=value;view?.setToolSensitivity?.(value);persist();});
  $('tool-sensitivity-reset').addEventListener('click',()=>{settings.toolSensitivity=1;$('tool-sensitivity').value=1;view?.setToolSensitivity?.(1);persist();notify('镊子跟随灵敏度已恢复为 1 倍。');});
  $('confirm-ok').addEventListener('click', () => closeConfirm(true));
  $('confirm-cancel').addEventListener('click', () => closeConfirm(false));
  $('confirm-layer').addEventListener('pointerdown', event => { if (event.target === $('confirm-layer')) closeConfirm(false); });
  $('default-tool').addEventListener('change', event => {
    settings.defaultTool = normalizeDefaultTool(event.target.value);
    held = null; updateHeld(); updateStatus(); persist();
    notify(settings.defaultTool === 'pen' ? `默认改为拼豆笔：每次取 ${settings.penCapacity} 颗同色豆。` : '默认改为镊子：每次取一颗豆。');
  });
  $('pen-capacity').addEventListener('change', event => {
    const value = Number(event.target.value);
    if (!validPenCapacity(value)) { event.target.value = settings.penCapacity; notify('拼豆笔每次取豆须为 2–20 颗。'); return; }
    settings.penCapacity = value; updateStatus(); persist();
  });
  $('finish-quality').addEventListener('change', event => {
    settings.finishQuality = normalizeFinishQuality(event.target.value); persist();
    // 正在查看的成品立即按新画质重建。
    if (finishedViewer && $('iron-stage').classList.contains('revealed')) mountFinishedViewer();
    if (savedViewer && selectedSavedRecord) openSavedViewer(selectedSavedRecord);
    notify(`成品 3D 画质：${{standard:'标准',high:'高',ultra:'超高'}[settings.finishQuality]}。下载的 GLB 模型也按此精度。`);
  });
  $('workbench-quality').addEventListener('change', async event => {
    const next = normalizeFinishQuality(event.target.value);
    if (next === settings.workbenchQuality) return;
    if (document.querySelector('#iron-stage.ironing') || loadingArchive) { event.target.value = settings.workbenchQuality; selectUI?.sync(); notify('请等熨烫或读取存档结束后再切换工作台画质。'); return; }
    settings.workbenchQuality = next; persist();
    // 用当前进度重建工作台：已拼豆、掉落豆和托盘状态都保留。
    await mountBoard(pattern, game.snapshot(), { keepFinished: true });
    notify(`工作台画质：${{standard:'标准',high:'高',ultra:'超高'}[next]}。`);
  });
  $('feed-position').addEventListener('click', () => {
    closeOverlay('settings-overlay');
    if (layoutController?.isLocked('feed')) layoutController.toggle('feed');
    announce('示例观众', '送来一个礼物（示例播报：拖动虚线框调整位置，双击锁定）。');
  });
  $('magnifier-mode').addEventListener('change',event=>{settings.magnifierMode=event.target.value==='toggle'?'toggle':'hold';setMagnifierEnabled(false);persist();updateStatus();});
  window.addEventListener('beforeunload',persist);window.addEventListener('pagehide',persist);document.addEventListener('visibilitychange',()=>{if(document.hidden)persist();});
  for(const tab of document.querySelectorAll('[data-menu-tab]'))tab.addEventListener('click',()=>{document.querySelectorAll('[data-menu-tab]').forEach(item=>item.classList.toggle('active',item===tab));document.querySelectorAll('[data-menu-pane]').forEach(pane=>pane.classList.toggle('active',pane.dataset.menuPane===tab.dataset.menuTab));});
  $('transparent-background').addEventListener('change',event=>{settings.desk=!event.target.checked;view?.setDesk?.(settings.desk);$('desk-toggle').textContent=settings.desk?'浅木桌面':'透明直播';persist();});
  $('magnifier-key').addEventListener('keydown',event=>{event.preventDefault();event.stopPropagation();if(/^Key[A-Z]$|^Digit[0-9]$/.test(event.code)){settings.magnifierKey=event.code;event.target.value=event.code.replace('Key','').replace('Digit','');event.target.blur();persist();updateStatus();}else if(event.key==='Escape')event.target.blur();});
  for(const[id,key,min,max]of[['magnifier-zoom','magnifierZoom',1.5,5],['magnifier-size','magnifierSize',120,360]])$(id).addEventListener('change',event=>{const value=Number(event.target.value);if(!Number.isFinite(value)||value<min||value>max){event.target.value=settings[key];notify(`数值须为 ${min}–${max}`);return;}settings[key]=value;persist();});
  $('reset-layout').addEventListener('click',()=>{layoutController?.reset();notify('布局已恢复并锁定。');});
  $('menu-choose-pattern').addEventListener('click',()=>{patternDestination='board';closeOverlay('settings-overlay');renderPatternModal();openOverlay('pattern-overlay');});
  $('menu-upload').addEventListener('click',()=>{patternDestination='board';$('image-input').click();});
  $('menu-gallery').addEventListener('click',()=>{closeOverlay('settings-overlay');openOverlay('gallery-overlay');renderGallery();});
  $('apply-board-size').addEventListener('click', () => {
    const size = Number($('custom-board-size').value);
    if (!validBoardSize(size)) { notify('自定义板格须为 16–64 的整数。'); return; }
    resizeBoard(size);
  });
  $('hint-toggle').addEventListener('change', event => { settings.hint = event.target.checked; updateStatus(); persist(); });
  $('held-glow-toggle').addEventListener('change', event => { settings.heldGlow = event.target.checked; view?.setHeldGlow?.(settings.heldGlow); persist(); });
  $('jar-filter').addEventListener('change', event => { settings.jarFilter = event.target.value; renderJars(); persist(); });
  $('reset-button').addEventListener('click', async () => {
    if(game.fallen.length){notify('先移走桌面的摇落豆，不能用清空跳过。');return;}
    if (game.traySpilled) { notify('请先按空格复原装豆托盘，不能用清空画板跳过。'); return; }
    const generation = boardGeneration;
    if (!await askConfirm('清空当前画板并重新开始这张图？', { ok: '清空' })) return;
    if (generation !== boardGeneration) return;
    if (game.fallen.length || game.traySpilled) { notify('确认期间出现了掉落豆或托盘被打翻，请先处理。'); return; }
    held = null;
    mountBoard(pattern);
    notify('当前画板已清空。');
  });
  $('undo-button').addEventListener('click', () => {
    if (!defaultToolReady()) { notify(`${toolLabel()}被没收时不能取豆。`); return; }
    while (manualHistory.length) {
      const id = manualHistory.pop();
      const bead = game.placed.find(item => item?.id === id);
      if (bead) { removeAt(bead.row, bead.col); return; }
    }
    notify('没有可取走的手动拼豆。');
  });
  $('iron-button').addEventListener('click', openIron);
  $('start-iron').addEventListener('click', startIron);
  $('download-button').addEventListener('click', () => { if (finishedData) downloadPng(finishedViewer?.capturePng() || finishedData.dataUrl, finishedData.name); });
  $('download-glb-button').addEventListener('click', () => downloadCurrentGlb(finishedViewer, finishedData?.name));
  $('reset-finished-view').addEventListener('click', () => finishedViewer?.resetView());
  $('save-button').addEventListener('click', saveFinished);
  $('gallery-button').addEventListener('click', () => { openOverlay('gallery-overlay'); renderGallery(); });
  $('saved-png-button').addEventListener('click', () => { if (selectedSavedRecord) downloadPng(savedViewer?.capturePng() || selectedSavedRecord.pngDataUrl, selectedSavedRecord.name); });
  $('saved-glb-button').addEventListener('click', () => downloadCurrentGlb(savedViewer, selectedSavedRecord?.name));
  $('reset-saved-view').addEventListener('click', () => savedViewer?.resetView());
  document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => closeOverlay(button.dataset.close)));
  document.querySelectorAll('.overlay').forEach(overlay => overlay.addEventListener('pointerdown', event => { if (event.target === overlay) closeOverlay(overlay.id); }));
}

let lastFrame = performance.now();
let lastStatusUpdate = 0;
function frame(time) {
  if(graphicsBlocked)return;
  const dt = Math.min(0.08, Math.max(0, (time - lastFrame) / 1000));
  lastFrame = time;
  if (game) {
    if(loadingArchive){requestAnimationFrame(frame);return;}
    game.tick(dt);
    try { physics?.step(dt); }
    catch (error) { console.error('拼豆物理步进失败', error); physics = null; notify('物理引擎中断，请刷新页面恢复。'); }
    view?.render();
    const trayBounds=view?.boundsFor?.('tray');if(trayBounds){$('palette-pager').style.left=`${Math.max(4,Math.min(innerWidth-230,trayBounds.x))}px`;$('palette-pager').style.top=`${Math.min(innerHeight-100,trayBounds.y+trayBounds.height+4)}px`;}
    layoutController?.update();
    if(Date.now()-lastAutoSave>15000&&!savingFailed)persist();
    if(game.fallen.length&&time-lastFallenSave>1000){lastFallenSave=time;persist();}
    if (time - lastStatusUpdate > 220 || game.traySpilled) {
      updateStatus();
      lastStatusUpdate = time;
    }
  }
  requestAnimationFrame(frame);
}

async function main() {
  bindUi();
  selectUI=installInlineSelects($('settings-overlay'));
  createIcons({ icons: { CircleDot, Image: ImageIcon, Layers, SlidersHorizontal, CircleHelp, Upload, Undo2, ChevronLeft, ChevronRight, Minus, Plus } });
  if(await mountBoard(pattern, saved?.game, { keepFinished: !!finishedData })===false)return;
  layoutController=createLayoutController({getView:()=>view,elements:{card:document.querySelector('.paper-card'),dock:document.querySelector('.bottom-dock'),feed:$('gift-feed')},saved:settings.layout,onChange:state=>{settings.layout=state;persist();},onMenu:openSettings,onToast:notify});
  transport.connect();
  drainGiftQueue();
  if(rulesLoadError){$('auto-save-status').textContent='互动设置损坏：原浏览器记录未覆盖，本页临时使用。';notify('互动设置读取失败，原记录未覆盖；可在红黑互动中检查当前规则并选择替换。',10000);}
  if(settings.presetLibraryVersion!==1){settings.presetLibraryVersion=1;persist();if(saved&&isLegacyPreset(pattern.id)){patternDestination='board';renderPatternModal();openOverlay('pattern-overlay');notify('52 张新图纸已上线；你正在拼的旧作品进度已保留，可先存档再换新图。',6500);}}
  requestAnimationFrame(frame);
}

main().catch(error => {
  console.error('拼豆工坊启动失败', error);
  notify(`启动失败：${error.message}`, 10000);
});
