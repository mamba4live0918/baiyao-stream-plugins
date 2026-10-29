/* 互动的执行入口：模拟按钮、试玩面板、真实礼物、白曜规则动作都走这里（spec 见 tiers.buildSpec）。
   spec = { action, params, count, who, uid, source, tierName, text } */
import { rng, rand, clamp, pick } from '../util.js';
import { createProjectile } from './actors/projectile.js';
import { createSlider, SLIDER_COLORS } from './actors/slider.js';
import { createPearls } from './actors/pearls.js';
import { createDebris } from './actors/debris.js';
import { createFlyer } from './actors/flyer.js';
import { createFog } from './actors/fog.js';
import { createCat } from './actors/cat.js';
import { createBird } from './actors/bird.js';
import { createGecko } from './actors/gecko.js';
import { createRobot } from './actors/robot.js';
import { createFilm } from './actors/film.js';
import { spawnDust } from './ambient.js';
import { drawMudBall, drawEgg, drawCup } from '../art/props-art.js';
import { artMud, artEggWhite, artYolk, artTea } from '../art/stains-art.js';
import { nextDesign, DESIGNS } from '../art/paper-art.js';
import { safeName } from '../text.js';
import { nearZone, placeRectOutside } from '../zone.js';
import { P } from '../glass/particles.js';

/* 名字上屏前过一遍合规（长串数字打码、带联系方式的叫"观众"）；同一个人还是按 uid 认 */
export function ownerOf(spec) {
  return { name: safeName(spec.who), uid: spec.uid || spec.who || '', source: spec.source || 'sim' };
}

/* 落点：优先砸在主播刚擦干净的地方（"白擦了"），否则随机；都在露脸区外 */
/* 落在 (x, y) 的一滩：相对中心的某处画上去会不会伸进脸里（露脸区外再留几像素） */
export function awayFromFace(game, x, y) {
  const pad = 6 * game.ctx.stage.unit;
  return (lx, ly, rad) => !game.inZone(x + lx, y + ly, rad + pad);
}

export function aim(game, radius, spread = 0.12, opts = {}) {
  const { stage } = game.ctx;
  const fresh = game.time - game.recent.t < 6;
  let prefer = fresh ? { x: game.recent.x + rand(-spread, spread) * stage.W, y: game.recent.y + rand(-spread, spread) * stage.H } : null;
  /* 淹没感：一部分直接往脸边上砸，越堆越贴着脸 */
  const k = game.engulf();
  if (stage.zone && Math.random() < 0.15 + 0.55 * k) prefer = nearZone(stage.zone, rand(0, Math.PI * 2), radius * rand(-0.2, 0.7) * (1 - k * 0.5));
  return game.place(radius, { prefer, ...opts });
}

/* 这个观众同时在玻璃上的块数到上限了：记到他最新那块的名字牌上（×N），不再加新的 */
export function overCap(game, owner) {
  const cap = game.ownerCap();
  if (!(cap > 0) || game.ownerCount(owner) < cap) return false;
  const latest = game.latestTagged(owner);
  if (latest) game.ctx.names.bump(latest);
  else game.ctx.hud.toast(`@${owner.name} 的东西太多了，这次先记着`, 'block');
  return true;
}

const res = game => Math.min(2, game.ctx.stage.dpr);
const seed = () => (Math.random() * 1e9) | 0;
const count = (v, max) => clamp(Math.round(v ?? 1), 1, max);
const BOOM = {
  mud: ['啪叽！', '啪！', '噗叽！'],
  egg: ['啪！', '咔嚓！', '啪叽！'],
  tea: ['哗啦！', '噗——！'],
  flyer: ['啪！', '贴！']
};

/* 溅一圈：颜色对应的小点往四周飞、带重力掉下去 */
function splash(game, x, y, frame, n, speed, size) {
  const { particles, stage } = game.ctx;
  const u = stage.unit;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = rand(0.35, 1) * speed * u;
    particles.emit({ frame, x: x + Math.cos(a) * 10 * u, y: y + Math.sin(a) * 10 * u, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - rand(80, 260) * u, g: 1900 * u, size: rand(0.6, 1) * size * u, rot: a, vr: rand(-6, 6), life: rand(0.6, 1.05) });
  }
}

/* ---------- 甩泥巴 ---------- */
function mud(game, spec) {
  const { stage, audio } = game.ctx;
  const u = stage.unit;
  const owner = ownerOf(spec);
  const n = count(spec.params.count, 50);
  const size = (spec.params.size ?? 1) * game.messScale();
  for (let i = 0; i < n; i++) {
    if (overCap(game, owner)) break;
    const r = Math.min(rand(105, 145) * size, 330) * u;
    const to = aim(game, r * 1.2, 0.16);
    if (!to) break;
    const sd = seed();
    game.addActor(createProjectile(game, {
      art: drawMudBall(r * 0.85, res(game)),
      trail: P.MUD,
      to,
      owner,
      delay: i * 0.18,
      dur: rand(0.48, 0.6),
      onLand(x, y) {
        game.impact(x, y, 1.1 * size, pick(BOOM.mud));
        game.addStain({ kind: 'mud', label: '泥巴', owner, x, y, art: artMud(rng(sd), r, u, res(game), awayFromFace(game, x, y)), toughness: 2, opacity: 0.97, smear: 0.75 });
        splash(game, x, y, P.MUD, 20, 620 * size, 26 * Math.sqrt(size));
        audio.splat(1.1);
      }
    }));
  }
  game.ctx.stats.messed(owner, n);
}

/* ---------- 扔鸡蛋：带名字的准星预警，点中能接住"回敬" ---------- */
function egg(game, spec) {
  const { stage, audio, hud, particles } = game.ctx;
  const u = stage.unit;
  const owner = ownerOf(spec);
  const n = count(spec.params.count, 40);
  const size = (spec.params.size ?? 1) * game.messScale();
  const warn = clamp(spec.params.warn ?? 1.2, 0, 4);
  for (let i = 0; i < n; i++) {
    if (overCap(game, owner)) break;
    const r = Math.min(rand(118, 150) * size, 330) * u;
    const to = aim(game, r * 1.2, 0.16);
    if (!to) break;
    const sd = seed();
    game.addActor(createProjectile(game, {
      art: drawEgg(r * 0.62, res(game)),
      to,
      owner,
      what: '鸡蛋',
      warn,
      catchable: warn > 0,
      reticleSize: (r * 1.9) / u,
      delay: i * 0.42,
      dur: rand(0.48, 0.58),
      spin: 9,
      onCatch() {
        hud.toast(`白曜接住了 @${owner.name} 的鸡蛋，回敬！`, 'catch');
        game.ctx.stats.cleaned({ owner, label: '鸡蛋' }, null);
        particles.sparkle(to.x, to.y, 8, 80);
      },
      onLand(x, y) {
        game.impact(x, y, 1.2 * size, pick(BOOM.egg));
        audio.crack();
        audio.splat(0.9);
        game.addStain({ kind: 'egg', label: '鸡蛋', owner, x, y, art: artEggWhite(rng(sd), r, u, res(game), awayFromFace(game, x, y)), toughness: 2, opacity: 0.9, smear: 0.55 });
        const yr = r * 0.4;
        const yx = x + rand(-0.15, 0.15) * r;
        const yy = y + rand(-0.1, 0.1) * r;
        const yolk = game.addStain({ kind: 'yolk', label: '蛋黄', owner, tag: false, x: yx, y: yy, art: artYolk(yr, u, res(game)), toughness: 2, opacity: 1, smear: 0.6 });
        game.addActor(createSlider(game, { kind: 'yolk', blob: yolk, x: yx, y: yy, r: yr, maxLen: rand(240, 400) * size * u, speed: 34, decay: 0.2, minSpeed: 5, owner, trailLabel: '蛋黄印', trailTough: 2, ...SLIDER_COLORS.yolk }));
        for (let k = 0; k < 8; k++) particles.emit({ frame: P.SHARD, x, y, vx: rand(-420, 420) * u, vy: rand(-560, -160) * u, g: 1900 * u, size: rand(20, 34) * u * Math.sqrt(size), rot: rand(0, 6), vr: rand(-12, 12), life: 1.2 });
        splash(game, x, y, P.DROP, 14, 560 * size, 20 * Math.sqrt(size));
      }
    }));
  }
  game.ctx.stats.messed(owner, n);
}

/* ---------- 泼奶茶：茶渍 + 往下流的茶痕 + 粘住的珍珠；杯子弹开掉下去 ---------- */
function tea(game, spec) {
  const { stage, audio } = game.ctx;
  const u = stage.unit;
  const owner = ownerOf(spec);
  const n = count(spec.params.cups, 12);
  const size = (spec.params.size ?? 1) * game.messScale();
  const pearls = clamp(Math.round(spec.params.pearls ?? 10), 0, 40);
  for (let i = 0; i < n; i++) {
    if (overCap(game, owner)) break;
    const r = Math.min(rand(145, 180) * size, 360) * u;
    const to = aim(game, r * 1.25, 0.16, { yMax: 0.78 });
    if (!to) break;
    const sd = seed();
    const cup = drawCup(r * 0.78, res(game));
    game.addActor(createProjectile(game, {
      art: cup,
      trail: P.TEA,
      to,
      owner,
      delay: i * 0.35,
      dur: rand(0.58, 0.68),
      spin: 5,
      arc: 230,
      onLand(x, y) {
        game.impact(x, y, 1.45 * size, pick(BOOM.tea));
        audio.splat(1.4);
        audio.slap();
        const art = artTea(rng(sd), r, u, res(game), awayFromFace(game, x, y));
        game.addStain({ kind: 'tea', label: '奶茶', owner, x, y, art, toughness: 2, opacity: 0.9, smear: 0.6 });
        /* 流痕：从溅射下沿挂下来的几条，越流越慢 */
        const drips = art.splat ? art.splat.drips : [];
        for (const d of drips.slice(0, 6)) {
          game.addActor(createSlider(game, { kind: 'tea', x: x + d.x, y: y + d.y + d.len, r: Math.max(9 * u, d.w * 0.9), maxLen: rand(200, 420) * size * u, speed: 56, decay: 0.28, minSpeed: 6, owner, trailLabel: '茶痕', trailTough: 1, ...SLIDER_COLORS.tea }));
        }
        if (pearls) game.addActor(createPearls(game, { x, y, n: pearls, spread: r * 0.95, owner }));
        splash(game, x, y, P.TEA, 22, 700 * size, 24 * Math.sqrt(size));
        game.addActor(createDebris(game, { art: cup, x, y, vx: rand(-300, 300) * u, vy: -rand(240, 460) * u, rot: rand(-1, 1), vr: rand(-8, 8), g: 2000, life: 1.6, scale: 1.3, scale1: 1.0 }));
      }
    }));
  }
  game.ctx.stats.messed(owner, n);
}

/* ---------- 贴小广告（pickDesign：挑哪一种；我的贴纸也走这里） ---------- */
function flyer(game, spec, pickDesign = nextDesign) {
  const { stage, audio } = game.ctx;
  const u = stage.unit;
  const owner = ownerOf(spec);
  const n = count(spec.params.count, 40);
  const size = (spec.params.size ?? 1) * Math.sqrt(game.messScale());
  /* 主播给小广告设了上限（0 = 不限）：场上的 + 排好还没贴上的不超过它 */
  const cap = game.ctx.getSettings ? game.ctx.getSettings().limits.actors.flyer : 0;
  let placed = 0;
  for (let i = 0; i < n; i++) {
    if (cap > 0 && game.flyerCount() >= cap) break;
    const design = pickDesign();
    /* 异形贴纸按面积定大小（高的瘦一点、扁的宽一点），和小广告差不多大 */
    const w = design.custom ? clamp((rand(250, 300) * size) / Math.sqrt(design.aspect), 140, 520) * u : Math.min(rand(270, 310) * size * (design.size || 1), 520) * u;
    const h = w * design.aspect;
    const rot = rand(-0.16, 0.16);
    /* 纸是硬的、不能被露脸区裁：按整张长方形找位置，整张都在脸外面。
       淹没感越大，越多张直接贴着脸的边（离脸只留一条缝），一圈纸边自然围出露脸的空隙 */
    const k = game.engulf();
    const at = placeRectOutside(stage.zone, stage.W, stage.H, w, h, rot, { margin: 10 * u, yMin: 0.08, clearance: (4 + (1 - k) * 70) * u, hug: Math.random() < 0.2 + 0.7 * k, step: 8 * u });
    if (!at) break;
    placed++;
    const header = spec.text || '';
    game.pendingFlyers++;
    game.later(i * 0.26, () => {
      game.pendingFlyers--;
      game.addActor(createFlyer(game, { x: at.x, y: at.y, w, rot, owner, header, design }));
      audio.slap();
      game.impact(at.x, at.y, 0.7, pick(BOOM.flyer));
    });
  }
  game.ctx.stats.messed(owner, placed);
}

/* ---------- 我的贴纸：主播上传的异形贴纸，轮着贴；还没上传就照常贴小广告 ---------- */
function sticker(game, spec) {
  const lib = game.ctx.stickers;
  if (!lib || !lib.count) return flyer(game, spec);
  return flyer(game, spec, () => lib.next() || nextDesign());
}

/* ---------- 哈气写字 ---------- */
function fog(game, spec) {
  const { stage } = game.ctx;
  const u = stage.unit;
  const owner = ownerOf(spec);
  if (overCap(game, owner)) return;
  const size = clamp(spec.params.size ?? 1, 0.5, 3) * game.messScale();
  const R = Math.min(260 * size, 470) * u;
  const at = aim(game, R * 1.15, 0.1, { margin: 10 * u });
  if (!at) return;
  const name = owner.name.slice(0, 8);
  const text = spec.text || (name.length <= 5 ? `${name}来过` : name);
  game.addActor(createFog(game, { x: at.x, y: at.y, R, text, owner, hold: Math.max(5, spec.params.hold ?? 45) }));
  game.ctx.stats.messed(owner, 1);
}

/* 主播在设置里给这种小动物/机器人设的场上上限（0 = 不限）；排队那边已经按它放行，这里防直接触发时超 */
function full(game, kind) {
  const cap = game.ctx.getSettings ? game.ctx.getSettings().limits.actors[kind] : 0;
  return cap > 0 && game.actors.filter(a => a.kind === kind).length >= cap;
}

/* ---------- 猫猫 ---------- */
function cat(game, spec) {
  const owner = ownerOf(spec);
  if (full(game, 'cat')) return;
  game.addActor(createCat(game, { owner, paws: clamp(Math.round(spec.params.paws ?? 10), 1, 80), speed: clamp(spec.params.speed ?? 1, 0.4, 2.5) }));
  game.ctx.stats.messed(owner, 1);
}

/* ---------- 小鸟 ---------- */
function bird(game, spec) {
  const owner = ownerOf(spec);
  if (full(game, 'bird')) return;
  game.addActor(createBird(game, { owner, poops: clamp(Math.round(spec.params.poops ?? 1), 1, 12), warn: clamp(spec.params.warn ?? 2.5, 0.8, 8) }));
  game.ctx.stats.messed(owner, 1);
}

/* ---------- 壁虎 ---------- */
function gecko(game, spec) {
  const owner = ownerOf(spec);
  if (full(game, 'gecko')) return;
  game.addActor(createGecko(game, { owner, stay: Math.max(4, spec.params.stay ?? 20), tailChance: clamp(spec.params.tail ?? 0.5, 0, 1) }));
  game.ctx.stats.messed(owner, 1);
}

/* ---------- 擦窗机器人（帮忙） ---------- */
function robot(game, spec) {
  const owner = ownerOf(spec);
  if (full(game, 'robot')) {
    game.ctx.hud.toast(`机器人满员了，@${owner.name} 的那台在门口排队失败`, 'help');
    return;
  }
  game.addActor(createRobot(game, { owner, seconds: Math.max(5, spec.params.seconds ?? 20), speed: clamp(spec.params.speed ?? 1, 0.4, 2.5) }));
  game.ctx.hud.toast(`@${owner.name} 派来一台擦窗机器人`, 'help');
}

/* ---------- 保护膜（帮忙/对抗）：能挡几下；已经贴着就加耐久 ---------- */
function film(game, spec) {
  const owner = ownerOf(spec);
  const hits = Math.max(1, Math.round(spec.params.hits ?? 20));
  const cur = game.actors.find(a => a.kind === 'film' && a.alive);
  if (cur) {
    cur.addHits(hits);
    game.ctx.hud.toast(`@${owner.name} 给保护膜加了 ${hits} 下耐久`, 'help');
    return;
  }
  game.addActor(createFilm(game, { owner, hits }));
  game.ctx.hud.toast(`@${owner.name} 给玻璃贴了一层保护膜（能挡 ${hits} 下）`, 'help');
}

/* ---------- 撒灰（试玩按钮；平时落灰由 ambient 自动来） ---------- */
function dust(game, spec) {
  const n = count(spec.params.count, 10);
  for (let i = 0; i < n; i++) spawnDust(game);
}

/* ---------- 验收用：所有小广告版式排成一排排（不在互动列表里，观众触发不了） ---------- */
function flyerGallery(game, spec) {
  const { stage } = game.ctx;
  const u = stage.unit;
  const owner = ownerOf(spec);
  const cols = 6;
  const cw = stage.W / cols;
  const rows = Math.ceil(DESIGNS.length / cols);
  const rh = stage.H / rows;
  DESIGNS.forEach((design, i) => {
    const w = Math.min(cw * 0.78, (rh * 0.84) / design.aspect, 300 * u) * (design.size || 1);
    game.addActor(createFlyer(game, { x: cw * ((i % cols) + 0.5), y: rh * (Math.floor(i / cols) + 0.5), w, rot: 0, owner, header: spec.text || '', design }));
  });
}

export const RUNNERS = { mud, egg, tea, flyer, sticker, fog, cat, bird, gecko, robot, film, dust, flyerGallery };

export function runAction(game, spec) {
  const fn = RUNNERS[spec.action];
  if (!fn) return false;
  fn(game, spec);
  return true;
}
