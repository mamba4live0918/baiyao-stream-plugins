/* 世界：玻璃上的脏东西（Stain）和正在演的角色/事件（actor）。
   刮擦分发给附近的块；块剩余 ≤ 6% 就算擦完：叮 + ✨ + 「擦掉了 @小明 的鸡蛋」+ 记统计。
   上限（设置里能改）：玻璃上同时最多 maxStains 块，超出先挤掉最早的落灰；单个观众同时最多 ownerCap 块，多的记成名字牌上的 ×N。
   单独的块太多时最早的会沉进"陈年污垢"（grime.js），样子不变、照样能擦、擦掉照样算数。
   小广告叠得再多也都得撕：整张被盖住的先"睡"（flyer-cover.js），露出来再醒。 */
import { Stain } from '../glass/stain.js';
import { placeOutside, hitsZone } from '../zone.js';
import { P } from '../glass/particles.js';
import { spawnDust } from './ambient.js';
import { createGrime } from './grime.js';
import { createFlyerCover } from './flyer-cover.js';

const limit = (ctx, key, def) => {
  const s = ctx.getSettings ? ctx.getSettings() : null;
  return s && s.limits && typeof s.limits[key] === 'number' ? s.limits[key] : def;
};

export function createGame(ctx) {
  const { stage, particles, water, glare, audio, hud, names, stats } = ctx;
  const stains = [];
  const actors = [];
  let time = 0;
  const timers = [];
  let combo = 0;
  let comboT = -10;
  const recent = { x: stage.W * 0.3, y: stage.H * 0.6, t: -10 };

  function ownerKey(o) {
    return o ? o.uid || o.name : '';
  }

  let grime = null;
  /* 小广告谁盖着谁（画面外的部分不用盖） */
  const cover = createFlyerCover({ view: () => stage });
  /* 显卡上下文恢复后，小广告的贴图要重传（它们的画布传完就放掉了） */
  stage.renderer.domElement.addEventListener('webglcontextrestored', () => {
    for (const a of actors) if (a.restore) a.restore();
  });
  /* 擦掉陈年污垢攒下的"叮"：一帧里擦完好几块只叮一声、只弹一条提示 */
  const credits = [];

  /* 玻璃上的块数（单独的 + 沉在污垢里的）超了上限：先挤掉最早的灰，再丢最早沉下去的账，再挤最早的单独块 */
  function enforceCap() {
    const max = limit(ctx, 'maxStains', 0);
    if (!(max > 0)) return;
    let n = grime ? grime.size : 0;
    for (const s of stains) if (s.state === 'live' && !s.grime) n++;
    while (n > max) {
      const dust = stains.find(s => s.state === 'live' && s.kind === 'dust');
      if (dust) {
        dust.finish();
        names.detach(dust);
      } else if (!(grime && grime.dropOldest())) {
        const old = stains.find(s => s.state === 'live' && !s.grime);
        if (!old) break;
        old.finish();
        names.detach(old);
      }
      n--;
    }
  }

  /* 陈年污垢擦掉的块：统计每块都记；叮和提示攒一下，最多 0.4 秒一次（一刮就擦掉一大片时不刷屏） */
  const pend = { n: 0, by: null, last: null, at: -10 };
  function flushCredits() {
    const list = credits.splice(0);
    for (let i = 0; i < list.length; i++) {
      const { r, by, at } = list[i];
      if (by && typeof by.cleaned === 'number') by.cleaned++;
      stats.cleaned(r, by);
      if (i < 3) particles.sparkle(at ? at.x : r.x, at ? at.y : r.y, 5, 50);
    }
    pend.n += list.length;
    pend.by = list[list.length - 1].by;
    pend.last = list[list.length - 1].r;
  }
  function emitCredits() {
    combo = time - comboT < 2.4 ? combo + 1 : 0;
    comboT = time;
    audio.ding(combo);
    glare.flash(0.55 + Math.min(0.4, combo * 0.08));
    if (pend.n === 1) hud.cleaned(pend.last, pend.by, combo);
    else if (pend.by) hud.toast(`@${pend.by.name} 的机器人擦掉了 ${pend.n} 处陈年污垢`, 'help');
    else hud.toast(`擦掉了 ${pend.n} 处陈年污垢${combo >= 2 ? `  连擦 ×${combo + 1}` : ''}`, 'clean');
    pend.n = 0;
    pend.at = time;
  }

  const game = {
    ctx,
    stage,
    stains,
    actors,
    recent,
    /* 新脏东西出现时要通知的人（保护膜用它把脏东西"接"到膜上） */
    stainHooks: [],
    get time() {
      return time;
    },
    /* 在画面内、露脸区外找个能放下 radius 的位置（整块都在脸外；"往脸边挤"由 aim 的落点偏向管） */
    place(radius, opts = {}) {
      return placeOutside(stage.zone, stage.W, stage.H, radius, { margin: 10 * stage.unit, pad: 8 * stage.unit, ...opts });
    },
    /* 淹没感 0..1：脏东西往脸边挤、能压进露脸区边上多少 */
    engulf() {
      const s = ctx.getSettings ? ctx.getSettings() : null;
      return s && s.play && typeof s.play.engulf === 'number' ? s.play.engulf : 0;
    },
    inZone(x, y, radius = 0) {
      return hitsZone(stage.zone, x, y, radius);
    },
    /* 0 = 不限 */
    ownerCap() {
      return limit(ctx, 'ownerCap', 0);
    },
    /* 设置里的「捣乱幅度」：所有脏东西的大小都乘它 */
    messScale() {
      const s = ctx.getSettings ? ctx.getSettings() : null;
      return s && s.play && typeof s.play.messScale === 'number' ? s.play.messScale : 1;
    },
    /* 这个观众现在玻璃上有几块"主块"（挂名字的那块；蛋黄、流痕、胶印这些附属痕迹不算）+ 还在飞的 */
    ownerCount(owner) {
      const k = ownerKey(owner);
      if (!k) return 0;
      const onGlass = stains.filter(s => s.state === 'live' && s.tagged && s.owner && ownerKey(s.owner) === k).length;
      const flying = actors.filter(a => a.pending && a.owner && ownerKey(a.owner) === k).length;
      return onGlass + flying + grime.ownerCount(k);
    },
    /* 他最新的那块主块（用来记 ×N） */
    latestTagged(owner) {
      const k = ownerKey(owner);
      for (let i = stains.length - 1; i >= 0; i--) {
        const s = stains[i];
        if (s.state === 'live' && s.tagged && s.owner && ownerKey(s.owner) === k) return s;
      }
      return null;
    },
    addStain(o) {
      const s = new Stain(stage, o);
      s.born = time;
      s.grime = !!o.grime;
      s.tagged = !!(s.owner && o.tag !== false);
      stains.push(s);
      for (const f of game.stainHooks) f(s, o);
      if (s.owner && o.tag !== false) names.attach(s);
      enforceCap();
      return s;
    },
    addActor(a) {
      actors.push(a);
      if (a.kind === 'flyer') cover.add(a);
      return a;
    },
    /* 按游戏时间延后执行（重开/清空时一起取消） */
    later(sec, fn) {
      timers.push({ at: time + sec, fn });
    },
    /* 刮一段：pts 屏幕坐标折线，width 刮条宽，by = 帮忙的人（null = 主播自己） */
    wipe(pts, width, strength, seed, by, passId = 0) {
      const a = pts[0];
      const b = pts[pts.length - 1];
      const half = width / 2;
      let touched = 0;
      for (const s of stains) {
        if (s.state !== 'live' || !s.near(a.x, a.y, b.x, b.y, half)) continue;
        if (s.erase(pts, width, strength, seed, time, passId)) {
          touched++;
          s.lastBy = by;
          s.lastAt = b;
        }
      }
      for (const act of actors) if (act.onWipe) touched += act.onWipe(pts, width, by) || 0;
      if (!by) {
        recent.x = b.x;
        recent.y = b.y;
        recent.t = time;
      }
      return touched;
    },
    /* 砸中：玻璃（连同上面的脏东西）震一下、出震波；word 是落点蹦出来的拟声字 */
    impact(x, y, strength = 1, word = '') {
      glare.impact(x, y, strength);
      audio.thud(Math.min(1.6, strength));
      if (word && !(ctx.reducedMotion && ctx.reducedMotion())) hud.boom(word, x, y, strength);
    },
    /* 一块擦完：连续擦完的"叮"音调一级级升高 */
    complete(s) {
      if (s.state !== 'live') return;
      s.finish();
      names.detach(s);
      if (s.onComplete) s.onComplete(s);
      if (!s.counts) return;
      combo = time - comboT < 2.4 ? combo + 1 : 0;
      comboT = time;
      particles.sparkle(s.x, s.y, 5 + Math.min(4, combo), 40 + Math.min(s.radius * 0.3, 60));
      glare.flash(0.55 + Math.min(0.4, combo * 0.08));
      audio.ding(combo);
      const helper = s.lastBy;
      if (helper && typeof helper.cleaned === 'number') helper.cleaned++;
      stats.cleaned(s, helper);
      hud.cleaned(s, helper, combo);
    },
    /* 不是刮掉的那种"清理"（撕下小广告、赶走壁虎）也给一份奖励：叮 + ✨ + 提示 + 计数 */
    credit(label, owner, x, y, text) {
      combo = time - comboT < 2.4 ? combo + 1 : 0;
      comboT = time;
      particles.sparkle(x, y, 6 + Math.min(4, combo), 70);
      glare.flash(0.5);
      audio.ding(combo);
      stats.cleaned({ owner, label }, null);
      hud.toast(text || `清掉了 ${owner && owner.name ? '@' + owner.name + ' 的' : ''}${label}`, 'clean');
    },
    /* 按下时点到了什么：从最上层的角色往下问 */
    hitTest(x, y) {
      for (let i = actors.length - 1; i >= 0; i--) {
        const a = actors[i];
        if (!a.hit) continue;
        const h = a.hit(x, y);
        if (h) return h;
      }
      return null;
    },
    /* 鼠标停在哪：只有最上面那个能点/能拖的东西算"指着"（叠在一起的小广告只亮最上面那张的提示） */
    hover(x, y) {
      let top = null;
      for (let i = actors.length - 1; i >= 0 && !top; i--) if (actors[i].hit && actors[i].hit(x, y)) top = actors[i];
      for (const a of actors) if (a.hover) a.hover(x, y, a === top);
    },
    noteStroke() {
      stats.stroke();
    },
    update(dt) {
      time += dt;
      for (let i = timers.length - 1; i >= 0; i--) {
        if (timers[i].at > time) continue;
        const { fn } = timers[i];
        timers.splice(i, 1);
        try {
          fn();
        } catch (err) {
          console.warn('[擦玻璃] 延后任务出错', err);
        }
      }
      for (let i = actors.length - 1; i >= 0; i--) {
        const a = actors[i];
        let alive = true;
        try {
          alive = a.update(dt, time) !== false;
        } catch (err) {
          alive = false;
          console.warn('[擦玻璃] 角色出错，已移除', a.kind, err);
        }
        if (!alive) {
          if (a.kind === 'flyer') cover.remove(a);
          if (a.dispose) a.dispose();
          actors.splice(i, 1);
        }
      }
      grime.tick(time);
      for (let i = stains.length - 1; i >= 0; i--) {
        const s = stains[i];
        if (s.state === 'gone') {
          stains.splice(i, 1);
          continue;
        }
        if (s.hidden && s.state === 'live') game.takeAway(s);
        else if (s.isClean) game.complete(s);
        if (!s.update(dt, time)) {
          s.dispose();
          stains.splice(i, 1);
        }
      }
      names.update(stains);
      if (credits.length) flushCredits();
      if (pend.n && time - pend.at >= 0.4) emitCredits();
    },
    /* 沉在污垢里的块擦完了（grime.js 记账算出来的）：攒到这一帧末尾一起叮 */
    creditRecords(list, by, at) {
      for (const r of list) credits.push({ r, by: by || null, at: at || null });
    },
    /* 玻璃上一共几块（单独的 + 沉在污垢里的）；noDust 时不算灰 */
    messCount(noDust = false) {
      let n = grime.size;
      for (const s of stains) if (s.state === 'live' && !s.grime && !(noDust && s.kind === 'dust')) n++;
      return n;
    },
    /* 沉得跟不上（礼物刷太猛）：新的捣乱先在队里等一下 */
    grimeBacklog() {
      return grime.backlog();
    },
    grimeProf() {
      return grime.prof;
    },
    /* 小广告：场上的 + 已经排好、还没"啪"上去的（主播设了小广告上限时用） */
    pendingFlyers: 0,
    flyerCount() {
      let n = game.pendingFlyers;
      for (const a of actors) if (a.kind === 'flyer') n++;
      return n;
    },
    /* 一张小广告贴平了（true）/ 被揭起来了（false）：底下被它盖住的那些跟着睡下或醒来 */
    flyerCovering(f, flat) {
      if (flat) cover.more(f);
      else cover.less(f);
    },
    /* 验收用：一共几张、醒着（在画）几张、睡着几张 */
    flyerStats() {
      return { total: cover.size, awake: cover.awake, asleep: cover.asleep };
    },
    /* 清空玻璃（设置里的按钮、试玩重开） */
    clearAll() {
      timers.length = 0;
      game.pendingFlyers = 0;
      cover.clear();
      for (const a of actors) if (a.dispose) a.dispose();
      actors.length = 0;
      for (const s of stains) {
        names.detach(s);
        s.dispose();
      }
      stains.length = 0;
      grime.reset();
      credits.length = 0;
      pend.n = 0;
      particles.clear();
      water.clear();
    },
    /* 撕膜/机器人这类"整片带走"：直接移除，不算擦完 */
    takeAway(s) {
      names.detach(s);
      if (s.onTakeAway && s.state === 'live') s.onTakeAway(s);
      s.finish();
    },
    spawnDust(max) {
      return spawnDust(game, max);
    },
    /* 露脸区或画面尺寸变了：重算每块"看得见、擦得着"的部分 */
    zoneChanged() {
      for (const s of stains) {
        s.weightDirty = true;
        s.coverDirty = true;
        /* 分到接下来半秒里重算，别挤在同一帧（拖完露脸框松手那一下不卡） */
        s.lastMeasure = game.time - 0.14 + Math.random() * 0.5;
      }
      grime.zoneChanged();
      cover.viewChanged();
    },
    liveStains() {
      return stains.filter(s => s.state === 'live');
    },
    spawnMudDots(x, y, n, frame = P.MUD) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        particles.emit({ frame, x, y, vx: Math.cos(a) * (180 + Math.random() * 380) * stage.unit, vy: Math.sin(a) * (180 + Math.random() * 380) * stage.unit - 120 * stage.unit, g: 1700 * stage.unit, size: (10 + Math.random() * 12) * stage.unit, rot: a, life: 0.7 });
      }
    }
  };
  grime = createGrime(game, ownerKey);
  return game;
}
