/* 淘金 · 簸箕版 · 观众的捣乱（小偷另算）：
   扔石头 —— 石头砸进簸箕，压住沙也压住下面的金子，簸箕也变沉、晃不动；点石头扔出去；
   倒泥水 —— 泥水泼进簸箕，水变浑：沙子变黏冲不动，金子看不见也收不上来；多晃一会儿就清了；
   撞簸箕 —— 隔一会儿撞一下，撞之前有提示：按住簸箕就稳住，没按住就被撞得乱晃，露出来的金子会被甩出去。
   持续型的同类叠加只延长时间（最多 60 秒）、强度取大的。 */
import * as THREE from 'three';
import { BASKET, floorSpot } from './shape.js';
import { rnd } from './util.js';
import { MUD } from './scene/particles.js';

const MAX_LEFT = 60;
const WARN = 0.7; // 撞之前提前多久提示（秒）

export function createTroubles(game) {
  const active = { mud: null, bump: null };
  const pours = [];
  const st = { murk: 0, warning: false };
  const w = () => game.w;
  const v = new THREE.Vector3();

  function above(local, h) {
    v.set(local.x, w().sim.topAt(local.x, local.z) + h, local.z);
    return w().basket.root.localToWorld(v.clone());
  }

  function start(spec, base) {
    const { hud, audio } = w();
    const p = spec.params;
    if (spec.action === 'rocks') {
      for (let i = 0; i < p.count; i++) {
        game.after(i * 0.2, () => {
          const at = above(floorSpot(Math.random), 3.6 + rnd(0, 0.8));
          w().nuggets.dropRock(at, spec.who);
        });
      }
      hud.toast({ ...base, text: `往簸箕里扔了 ${p.count} 块石头：点石头扔出去` });
      audio.play('whistle');
      return;
    }
    const cur = active[spec.action];
    if (cur) {
      cur.left = Math.min(MAX_LEFT, Math.max(0, cur.left) + p.dur);
      cur.power = Math.max(cur.power, p.power);
      hud.toast({ ...base, text: `让${spec.action === 'mud' ? '泥水' : '撞簸箕'}多持续 ${p.dur} 秒` });
      return;
    }
    active[spec.action] = { left: Math.min(MAX_LEFT, p.dur), power: p.power, who: spec.who, next: spec.action === 'bump' ? 1.6 : 0, warned: false };
    if (spec.action === 'mud') {
      hud.toast({ ...base, text: '往簸箕里倒了泥水：水浑了金子看不见，多晃一会儿就清了' });
      audio.play('pour');
    } else {
      hud.toast({ ...base, text: '要来撞你的簸箕：听到提示就按住簸箕稳住' });
      audio.play('warn');
    }
  }

  /* ---------- 泥水：一桶桶泼进簸箕 ---------- */
  function updateMud(dt, A) {
    const m = active.mud;
    const { particles, sim } = w();
    if (m) {
      m.left -= dt;
      m.next -= dt;
      if (m.next <= 0 && m.left > 0) {
        m.next = rnd(1.1, 1.7);
        pours.push({ local: floorSpot(Math.random), t: 0, power: m.power });
        w().audio.play('pour');
      }
      if (m.left <= 0) active.mud = null;
    }
    for (let i = pours.length - 1; i >= 0; i--) {
      const p = pours[i];
      p.t += dt;
      if (p.t < 0.5) {
        const at = above(p.local, 1.3);
        for (let k = 0; k < 7; k++) particles.drop(at.x + rnd(-0.07, 0.07), at.y + rnd(0, 0.15), at.z + rnd(-0.07, 0.07), rnd(-0.15, 0.15), rnd(-2.6, -1.8), rnd(-0.15, 0.15), rnd(0.008, 0.014), MUD);
      }
      if (p.t >= 0.75) {
        sim.field.smear(p.local.x, p.local.z, 0.45, p.power * 0.9);
        st.murk = Math.min(1, st.murk + p.power * 0.45);
        pours.splice(i, 1);
      }
    }
    /* 水慢慢变清，晃得越起劲清得越快；泥水没停时清不到底 */
    const floor = m ? m.power * 0.55 : 0;
    st.murk = Math.max(floor, st.murk - dt * (0.03 + 0.22 * A));
  }

  /* ---------- 撞簸箕：提示 → 撞 ---------- */
  function updateBump(dt, holding) {
    const b = active.bump;
    st.warning = false;
    if (!b) return;
    b.left -= dt;
    b.next -= dt;
    /* 时间到了、又没有正在提示的那一下，就结束；已经提示过的那一下照样撞完 */
    if (b.left <= 0 && b.next > WARN) {
      active.bump = null;
      return;
    }
    if (b.next <= WARN) {
      st.warning = true;
      if (!b.warned) {
        b.warned = true;
        w().audio.play('warn');
      }
    }
    if (b.next <= 0) jolt(b, holding());
  }

  function jolt(b, braced) {
    const { motion, nuggets, particles, sim, audio, hud } = w();
    b.next = rnd(1.7, 2.6);
    b.warned = false;
    const side = Math.random() < 0.5 ? -1 : 1;
    if (braced) {
      motion.kick(side * 0.9, 0.3);
      audio.play('brace');
      game.stats.braced++;
      if (!b.saidBraced) {
        b.saidBraced = true;
        hud.toast({ badge: '稳', color: '#3f9e7a', text: '稳住了！', tone: 'good' });
      }
      return;
    }
    motion.kick(side * (4 + 3 * b.power), 2 + 2 * b.power, side * 1.2);
    audio.play('bump');
    game.w.shake(0.14 * b.power);
    /* 沙子被颠出去一点 */
    for (let n = 0; n < 3; n++) {
      const at = floorSpot(Math.random);
      const removed = sim.field.dig(at.x, at.z, 0.18, 0.02 * b.power);
      if (removed <= 0) continue;
      v.set(at.x, sim.topAt(at.x, at.z) + 0.03, at.z);
      w().basket.root.localToWorld(v);
      for (let i = 0; i < 50; i++) particles.grain(v.x, v.y, v.z, rnd(-1.6, 1.6), rnd(1.8, 3.4), rnd(-0.6, 1.6), rnd(0.008, 0.018), 0);
    }
    /* 露出来的、靠近前口的金子可能被撞飞 */
    for (const it of [...nuggets.list]) {
      if (it.state !== 'rest' || it.kind === 'rock') continue;
      const risky = nuggets.exposure(it) > 0.4 || it.z > BASKET.D / 2 - 0.3;
      if (risky && Math.random() < 0.35 * b.power) {
        nuggets.fling(it, 1.1);
        game.nuggetHooks().flung(it);
      }
    }
  }

  return {
    start,
    active,
    get murk() {
      return st.murk;
    },
    get warning() {
      return st.warning;
    },
    update(dt) {
      updateMud(dt, w().motion.A);
      updateBump(dt, () => w().input.holding());
    },
    clear() {
      active.mud = active.bump = null;
      pours.length = 0;
      st.murk = 0;
      st.warning = false;
    }
  };
}
