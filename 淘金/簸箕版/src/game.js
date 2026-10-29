/* 淘金 · 簸箕版 · 玩法中枢：观众的矿砂袋落进簸箕炸开、金子埋在沙底；主播晃簸箕把沙淘掉，
   金子露出来就自己飞到“淘到的金子”数字牌里；捣乱按排队一个个上场。画面、声音、文字都从这里收到事件。 */
import * as THREE from 'three';
import { Director } from './director.js';
import { Economy } from './economy.js';
import { VALUES, actionDef } from './config.js';
import { BASKET, floorSpot } from './shape.js';
import { rnd, round2, clamp } from './util.js';
import { createTroubles } from './troubles.js';

const TIER_COLORS = ['#9a7a52', '#c9862f', '#e2a522', '#d9622b', '#b8458f', '#4f86c6', '#3f9e7a', '#7a62c9'];
const MAX_THIEVES = 2;
/* 试玩面板、自动演示、档位试用、白曜预览：照常玩，但不记进矿主榜/大盗榜 */
const isSim = spec => spec.source === 'sim' || spec.source === 'preview';

export class Game {
  /* w：场景里的各个部件（见 main.js） */
  constructor(w) {
    this.w = w;
    this.eco = new Economy();
    this.director = new Director();
    this.time = 0;
    this.later = [];
    this.dirty = false;
    this.stats = { sacks: 0, collected: 0, flung: 0, lostGold: 0, stolen: 0, recovered: 0, trolls: 0, braced: 0 };
    this.troubles = createTroubles(this);
  }

  get settings() {
    return this.w.getSettings();
  }

  /* ---------- 入口：所有互动（直播、试玩、白曜规则）都走这里 ---------- */
  trigger(spec) {
    if (!spec || !actionDef(spec.action)) return false;
    if (this.director.push(spec, this.settings) === 'full') {
      this.w.hud.toast({ text: '互动排队已满，这条先跳过', tone: 'muted' });
      return false;
    }
    return true;
  }

  canRun(spec) {
    const { sacks, thieves } = this.w;
    if (spec.action === 'ore') return sacks.pending() === 0 || sacks.pending() + spec.params.sacks <= this.settings.limits.maxSacks;
    if (spec.action === 'thief') return thieves.busy() < MAX_THIEVES;
    return true;
  }

  run(spec) {
    const def = actionDef(spec.action);
    const tierIdx = Math.max(0, this.settings.actions[spec.action].tiers.findIndex(t => t.id === spec.tierId));
    const base = { badge: def.badge, color: def.color, who: spec.who };
    if (spec.action === 'ore') return this.runOre(spec, tierIdx, base);
    this.stats.trolls++;
    if (spec.action === 'thief') {
      this.w.thieves.add(spec);
      this.w.hud.toast({ ...base, text: '派来了小偷！点它，或者使劲晃把它甩下去' });
      this.w.audio.play('alarm');
    } else {
      this.troubles.start(spec, base);
    }
    this.w.emit('troll', spec);
  }

  /* ---------- 加矿砂：一袋袋从天上掉进簸箕 ---------- */
  runOre(spec, tierIdx, base) {
    const { sacks, hud, audio } = this.w;
    const n = spec.params.sacks;
    const color = TIER_COLORS[tierIdx % TIER_COLORS.length];
    const taken = [];
    for (let i = 0; i < n; i++) {
      const at = this.dropSpot(taken);
      taken.push(at);
      sacks.add({ local: at, owner: spec.who, sim: isSim(spec), scale: 0.42 + spec.params.sand * 2.6, stamp: (spec.tierName || '矿').slice(0, 1), badge: '矿', color, params: spec.params });
    }
    hud.toast({ ...base, color, text: `送来了${spec.tierName}${n > 1 ? ' ×' + n + '袋' : ''}` });
    audio.play('whistle');
  }

  /* 挑落点：簸箕底上随机几个候选，挑沙少、离别的袋子远的 */
  dropSpot(taken) {
    const { sim } = this.w;
    let best = null;
    let bestScore = Infinity;
    for (let k = 0; k < 8; k++) {
      const c = floorSpot(Math.random);
      let crowd = 0;
      for (const p of taken) crowd += Math.max(0, 0.7 - Math.hypot(p.x - c.x, p.z - c.z));
      const score = sim.sandAt(c.x, c.z) * 4 + crowd + Math.random() * 0.1;
      if (score < bestScore) {
        bestScore = score;
        best = c;
      }
    }
    return best;
  }

  /* 一袋炸开：落点堆起一包沙，沙粒溅起来；金子埋在沙底 */
  onBurst(job) {
    const { sim, nuggets, particles, basket, audio } = this.w;
    const p = job.params;
    const { x, z } = job.local;
    const heap = p.sand * 0.5;
    sim.field.deposit(x, z, heap * 0.6, 0.22);
    sim.field.deposit(x, z, heap * 0.4, 0.42);
    const top = new THREE.Vector3(x, sim.topAt(x, z) + 0.12, z);
    basket.root.localToWorld(top);
    const rest = p.sand - heap;
    const n = 650;
    for (let i = 0; i < n; i++) {
      const a = rnd(0, Math.PI * 2);
      const r = Math.random();
      const sp = r < 0.6 ? rnd(0.3, 1.1) : r < 0.92 ? rnd(1.1, 2.2) : rnd(2.2, 3.4);
      particles.grain(top.x + Math.cos(a) * 0.06, top.y + rnd(0, 0.12), top.z + Math.sin(a) * 0.06, Math.cos(a) * sp, rnd(1.8, 3.8), Math.sin(a) * sp * 0.8, rnd(0.008, 0.02), rest / n);
    }
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      particles.dust(top.x + Math.cos(a) * 0.18, top.y + 0.05, top.z + Math.sin(a) * 0.18, rnd(0.4, 0.7), 0xead9ba, rnd(0.7, 1.1), new THREE.Vector3(Math.cos(a) * 0.9, rnd(0.2, 0.6), Math.sin(a) * 0.9));
    }
    for (let i = 0; i < 2; i++) particles.sparkle(top.x + rnd(-0.2, 0.2), top.y + rnd(0, 0.2), top.z + rnd(-0.2, 0.2), 0.16, 0.5);
    this.w.shake(0.08);
    audio.play('burst');
    this.stats.sacks++;
    const put = (kind, count, rMax) => {
      for (let i = 0; i < count; i++) {
        const a = rnd(0, Math.PI * 2);
        const r = rMax * Math.sqrt(Math.random());
        const gx = clamp(x + Math.cos(a) * r, -BASKET.W / 2 + 0.28, BASKET.W / 2 - 0.28);
        const gz = clamp(z + Math.sin(a) * r, -BASKET.D / 2 + 0.38, BASKET.D / 2 - 0.12);
        const value = round2(rnd(VALUES[kind][0], VALUES[kind][1]));
        nuggets.bury(kind, gx, gz, job.owner, value, job.sim);
      }
    };
    put('flake', p.flakes, 0.32);
    put('nugget', p.nuggets, 0.22);
    if (Math.random() < p.big) put('big', 1, 0.12);
  }

  /* ---------- 簸箕里东西的事件 ---------- */
  nuggetHooks() {
    const { hud, audio, particles, counter, sim } = this.w;
    return {
      collected: it => {
        const v = this.eco.bank(it.value, it.sim ? '' : it.owner);
        this.stats.collected++;
        this.dirty = true;
        audio.play(it.kind === 'big' ? 'big' : it.kind === 'nugget' ? 'nugget' : 'collect');
        counter.bump();
        hud.gain(v, it.kind === 'big' ? 'big' : '');
        hud.pulse();
        if (it.kind === 'big') hud.toast({ badge: '金', color: '#e2a522', who: it.owner || '', text: '的矿里淘出了狗头金！', tone: 'gold' });
        this.syncGold();
      },
      flung: it => {
        this.stats.flung++;
        audio.play('fling');
        if (it.value >= 0.8) hud.toast({ badge: '甩', color: '#d9622b', text: `晃得太猛，一块 ${it.value.toFixed(2)} 克的金子甩出去了`, tone: 'bad' });
      },
      lost: it => {
        this.stats.lostGold += it.value;
      },
      landed: (it, speed) => {
        if (it.kind === 'rock' && speed > 3) {
          sim.field.deposit(it.x, it.z, 0.004, 0.2);
          const at = it.mesh.getWorldPosition(new THREE.Vector3());
          for (let i = 0; i < 40; i++) {
            const a = rnd(0, Math.PI * 2);
            const sp = rnd(0.5, 1.8);
            particles.grain(at.x, at.y + 0.05, at.z, Math.cos(a) * sp, rnd(1.2, 2.6), Math.sin(a) * sp, rnd(0.008, 0.016), 0);
          }
          audio.play('thud');
          this.w.shake(0.05);
          this.w.motion.kick(rnd(-1.5, 1.5), 0.8);
        }
      },
      splash: (it, at) => {
        audio.play('splash');
        for (let i = 0; i < 14; i++) particles.drop(at.x, at.y + 0.02, at.z, rnd(-0.8, 0.8), rnd(1.4, 2.6), rnd(-0.8, 0.8), rnd(0.015, 0.03));
      }
    };
  }

  syncGold(instant) {
    this.w.hud.setGold(this.eco.gold, instant);
  }

  /* ---------- 小偷 ---------- */
  thiefHooks() {
    const { hud, audio } = this.w;
    return {
      onSteal: th => {
        const amt = this.eco.steal(th.spec.params.fraction, isSim(th.spec) ? '' : th.spec.who);
        this.dirty = true;
        if (amt > 0) {
          this.stats.stolen += amt;
          audio.play('steal');
          hud.gain(-amt, 'bad');
          hud.toast({ badge: '偷', color: '#d4604a', who: th.spec.who, text: `的小偷偷走了 ${amt.toFixed(2)} 克！点它或者晃下去追回来`, tone: 'bad' });
        } else {
          hud.toast({ badge: '偷', color: '#d4604a', who: th.spec.who, text: '的小偷扒拉半天，你还一粒金子都没淘到', tone: 'muted' });
        }
        this.syncGold();
        return amt;
      },
      /* how = click（点中）/ shaken（晃下去） */
      onCatch: (th, had, how) => {
        audio.play('caught');
        const verb = how === 'shaken' ? '被晃下簸箕了' : '被抓住了';
        if (had > 0) {
          const v = this.eco.recover(had, isSim(th.spec) ? '' : th.spec.who);
          this.stats.recovered += v;
          this.dirty = true;
          hud.gain(v, '');
          hud.toast({ badge: '抓', color: '#3f9e7a', who: th.spec.who, text: `的小偷${verb}，追回 ${v.toFixed(2)} 克`, tone: 'good' });
          this.syncGold();
        } else {
          hud.toast({ badge: '抓', color: '#3f9e7a', who: th.spec.who, text: how === 'shaken' ? '的小偷被晃下簸箕了' : '的小偷被你吓跑了', tone: 'good' });
        }
        this.w.emit('caught', th);
      },
      onGone: (th, escaped) => {
        if (escaped) {
          audio.play('bad');
          hud.toast({ badge: '偷', color: '#d4604a', who: th.spec.who, text: `的小偷带着 ${th.loot.toFixed(2)} 克跑掉了`, tone: 'bad' });
        }
      }
    };
  }

  /* ---------- 每帧 ---------- */
  update(dt) {
    this.time += dt;
    let spec;
    while ((spec = this.director.next(this.time, this.settings, s => this.canRun(s)))) this.run(spec);
    for (let i = this.later.length - 1; i >= 0; i--) {
      if (this.time >= this.later[i].at) {
        const job = this.later[i];
        this.later.splice(i, 1);
        job.fn();
      }
    }
    this.troubles.update(dt);
  }

  after(sec, fn) {
    this.later.push({ at: this.time + sec, fn });
  }

  /* 清空簸箕（淘到的金子不动）：小偷手里还拿着的金子先还回去 */
  clearBasket() {
    const { nuggets, sim, sacks, thieves } = this.w;
    for (const th of thieves.list) {
      if (th.loot > 0) this.eco.recover(th.loot, isSim(th.spec) ? '' : th.spec.who);
      th.loot = 0;
    }
    /* 已经在飞向数字牌的金子照样记上 */
    const hooks = this.nuggetHooks();
    for (const it of [...nuggets.list]) if (it.state === 'collect') hooks.collected(it);
    this.dirty = true;
    this.syncGold();
    nuggets.clear();
    sacks.clear();
    thieves.clear();
    sim.clear();
    this.director.clear();
    this.later.length = 0;
    this.troubles.clear();
  }

  /* 清空淘到的金子和榜单：场上小偷手里的赃物也作废 */
  resetVault() {
    this.eco = new Economy();
    for (const th of this.w.thieves.list) {
      th.loot = 0;
      th.m.sack.visible = false;
    }
    this.dirty = true;
    this.syncGold(true);
    if (this.w.onVaultReset) this.w.onVaultReset();
  }
}
