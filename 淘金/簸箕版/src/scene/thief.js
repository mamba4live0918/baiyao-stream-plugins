/* 淘金 · 簸箕版 · 小偷浣熊：从簸箕右边跳上帮沿，踮脚沿着帮沿溜到后角，从你淘到的金子里偷一把，
   再沿后沿跑到左边跳下去。点中它就抓住；也可以使劲晃簸箕把它甩下去（金子掉回来，但晃太猛金子也会甩出去）。
   它站在簸箕上，跟着簸箕一起晃。带着赃物逃跑时会躲你的鼠标。 */
import * as THREE from 'three';
import { disposeGeometries } from './geo.js';
import { buildRaccoon } from './raccoon.js';
import { makeLabel, disposeLabel } from './labels.js';
import { BASKET, surfaceY } from '../shape.js';
import { clamp, damp, easeInOut, rnd } from '../util.js';

const SCALE = 0.6;
const GRIP = 0.7; // 晃到“太猛”能撑多久（秒）就被甩下去
const SHAKE_OFF = 0.95;
const GRAV = -10;

/* 簸箕坐标里帮沿上的一点（站在沿上） */
const W2 = BASKET.W / 2 - 0.03;
const rim = (x, z) => new THREE.Vector3(x, surfaceY(x, z) + 0.02, z);
const START = new THREE.Vector3(W2 + 0.55, -0.75, 0.1);
const ON = () => rim(W2, 0.15);
const CORNER = () => rim(W2 - 0.04, -BASKET.D / 2 + 0.06);
const BACK_L = () => rim(-W2 + 0.04, -BASKET.D / 2 + 0.06);
const OFF_L = new THREE.Vector3(-W2 - 0.6, -0.9, -BASKET.D / 2 - 0.1);
const OFF_R = new THREE.Vector3(W2 + 0.6, -0.9, 0.0);
const ON_RIM = new Set(['approach', 'steal', 'escape']);

export function createThieves(scene, ctx) {
  const { M, particles, root, counter, topAt, onSteal, onCatch, onGone, getPointer, shake } = ctx;
  const list = [];
  const v = new THREE.Vector3();

  function add(spec) {
    const m = buildRaccoon(M);
    const label = makeLabel(spec.who, { badge: '偷', badgeBg: '#d4604a', border: '#d4604a', height: 0.2 / SCALE });
    label.position.y = 1.12;
    m.g.add(label);
    m.g.position.copy(START);
    m.g.scale.setScalar(SCALE);
    root.add(m.g);
    list.push({ spec, m, label, state: 'climb', t: 0, loot: 0, phase: 0, dodges: 0, dodgeCd: 0, path: null, grip: GRIP, off: null });
  }

  function remove(th) {
    if (th.m.g.parent) th.m.g.parent.remove(th.m.g);
    disposeLabel(th.label);
    disposeGeometries(th.m.g);
    const k = list.indexOf(th);
    if (k >= 0) list.splice(k, 1);
  }

  function face(th, dx, dz, dt, k = 10) {
    if (Math.abs(dx) + Math.abs(dz) < 1e-4) return;
    const want = Math.atan2(dx, dz);
    const cur = th.m.g.rotation.y;
    const d = Math.atan2(Math.sin(want - cur), Math.cos(want - cur));
    th.m.g.rotation.y = cur + d * (1 - Math.exp(-k * dt));
  }

  /* 走路动画：腿前后摆、身子一颠一颠、尾巴甩 */
  function animate(th, dt, speed, sneak) {
    th.phase += dt * (sneak ? 9 : 16) * clamp(speed * 2, 0.4, 1.6);
    const s = Math.sin(th.phase);
    th.m.legs[0].rotation.x = s * 0.7;
    th.m.legs[1].rotation.x = -s * 0.7;
    th.m.arms[0].rotation.x = -s * 0.6;
    th.m.arms[1].rotation.x = s * 0.6;
    th.m.body.position.y = Math.abs(Math.cos(th.phase)) * (sneak ? 0.02 : 0.05);
    th.m.body.rotation.x = sneak ? 0.22 : 0.12;
    th.m.tail.rotation.y = Math.sin(th.phase * 0.5) * 0.5;
  }

  /* 沿着几个点走；最后一段是跳下去，加一道抛物线 */
  function follow(th, dt, dur, jumpLast) {
    const pts = th.path;
    const k = clamp(th.t / dur, 0, 1);
    const seg = Math.min(pts.length - 2, Math.floor(k * (pts.length - 1)));
    const f = k * (pts.length - 1) - seg;
    const p = th.m.g.position;
    const before = p.clone();
    p.lerpVectors(pts[seg], pts[seg + 1], f);
    const jumping = jumpLast && seg === pts.length - 2;
    if (th.off) {
      p.add(th.off);
      /* 躲进簸箕里：踩在沙面（或竹编）上 */
      if (!jumping) p.y = topAt(p.x, p.z) + 0.02;
    }
    if (jumping) p.y += Math.sin(f * Math.PI) * 0.4;
    th.jumping = jumping;
    face(th, p.x - before.x, p.z - before.z, dt, 14);
    return k;
  }

  /* 带着赃物逃跑时，鼠标靠近就往簸箕里跳开一点（最多躲两次） */
  function dodge(th, dt) {
    th.dodgeCd -= dt;
    if (th.off) th.off.lerp(th.offTo, 1 - Math.exp(-9 * dt));
    const ptr = getPointer();
    if (!ptr || th.dodges >= 2 || th.dodgeCd > 0) return;
    th.m.g.getWorldPosition(v);
    if (Math.hypot(ptr.x - v.x, ptr.z - v.z) > 0.6) return;
    th.dodges++;
    th.dodgeCd = 0.9;
    th.off = th.off || new THREE.Vector3();
    th.offTo = th.off.clone().add(new THREE.Vector3(rnd(-0.2, 0.2), 0, 0.3));
  }

  /* 被甩下去：换到世界坐标里自由落体 */
  function drop(th, vx, vy, vz) {
    scene.attach(th.m.g);
    th.state = 'fall';
    th.t = 0;
    th.vel = new THREE.Vector3(vx, vy, vz);
  }

  function shakenOff(th) {
    const had = th.loot;
    th.loot = 0;
    th.m.sack.visible = false;
    th.m.stars.visible = true;
    drop(th, rnd(-1.4, 1.4), 2.4, 1.0);
    onCatch(th, had, 'shaken');
  }

  function stealSparkles(th, dt) {
    if (Math.random() >= dt * 14) return;
    const from = counter.mouth();
    th.m.g.getWorldPosition(v);
    const k = Math.random();
    particles.sparkle(from.x + (v.x - from.x) * k, from.y + (v.y + 0.3 - from.y) * k + Math.sin(k * Math.PI) * 0.3, from.z + (v.z - from.z) * k, 0.2, 0.45);
  }

  function update(dt) {
    const A = shake();
    for (const th of [...list]) {
      th.t += dt;
      const p = th.m.g.position;
      /* 站在帮沿上时，晃得太猛会抓不住 */
      if (ON_RIM.has(th.state)) {
        th.grip = A > SHAKE_OFF ? th.grip - dt : Math.min(GRIP, th.grip + dt * 0.5);
        th.m.body.rotation.z = A > SHAKE_OFF ? Math.sin(th.t * 30) * 0.25 : damp(th.m.body.rotation.z, 0, 8, dt);
        if (th.grip <= 0) {
          shakenOff(th);
          continue;
        }
      }
      if (th.state === 'climb') {
        const k = clamp(th.t / 0.8, 0, 1);
        p.lerpVectors(START, ON(), easeInOut(k));
        p.y += Math.sin(k * Math.PI) * 0.35;
        face(th, -1, -0.2, dt, 20);
        animate(th, dt, 0.6, false);
        if (k >= 1) {
          th.state = 'approach';
          th.t = 0;
          th.path = [ON(), rim(W2, -0.2), CORNER()];
        }
      } else if (th.state === 'approach') {
        const k = follow(th, dt, th.spec.params.approach, false);
        animate(th, dt, 0.4, true);
        if (k >= 1) {
          th.state = 'steal';
          th.t = 0;
          counter.open(1.3);
        }
      } else if (th.state === 'steal') {
        face(th, 1, 0.2, dt, 12);
        th.m.arms[0].rotation.x = -1.6 + Math.sin(th.t * 18) * 0.3;
        th.m.arms[1].rotation.x = -1.6 - Math.sin(th.t * 18) * 0.3;
        th.m.body.rotation.x = 0.3;
        stealSparkles(th, dt);
        if (th.t >= 1.1) {
          th.loot = onSteal(th);
          th.m.sack.visible = th.loot > 0;
          th.state = 'escape';
          th.t = 0;
          th.path = [CORNER(), BACK_L(), OFF_L.clone()];
        }
      } else if (th.state === 'escape' || th.state === 'flee') {
        const dur = th.state === 'escape' ? 2.6 : 1.1;
        if (th.state === 'escape') dodge(th, dt);
        const k = follow(th, dt, dur, true);
        animate(th, dt, 1.4, false);
        if (k >= 1) {
          onGone(th, th.loot > 0 && th.state === 'escape');
          remove(th);
          continue;
        }
      } else if (th.state === 'caught') {
        th.m.stars.visible = true;
        th.m.stars.rotation.y += dt * 8;
        th.m.g.rotation.y += dt * 9 * Math.max(0, 1 - th.t);
        if (th.t >= 1.0) {
          th.m.stars.visible = false;
          th.state = 'flee';
          th.t = 0;
          th.off = null;
          th.path = [p.clone(), OFF_R.clone()];
        }
      } else if (th.state === 'fall') {
        th.vel.y += GRAV * dt;
        p.addScaledVector(th.vel, dt);
        th.m.g.rotation.x += dt * 6;
        th.m.g.rotation.z += dt * 4;
        th.m.stars.rotation.y += dt * 8;
        if (th.t > 2.2) {
          remove(th);
          continue;
        }
      }
    }
  }

  /* 点中检测：射线离身体中心够近 */
  function hit(ray) {
    const c = new THREE.Vector3();
    const q = new THREE.Vector3();
    let best = null;
    let bestD = Infinity;
    for (const th of list) {
      if (!ON_RIM.has(th.state)) continue;
      th.m.body.getWorldPosition(c);
      c.y += 0.36 * SCALE;
      ray.closestPointToPoint(c, q);
      const d = q.distanceTo(c);
      if (d < 0.4 * SCALE + 0.08 && d < bestD) {
        bestD = d;
        best = th;
      }
    }
    return best;
  }

  function catchIt(th) {
    const had = th.loot;
    th.loot = 0;
    th.m.sack.visible = false;
    if (th.jumping) {
      /* 已经跳出去了：直接掉下去，不在半空里定住 */
      th.m.stars.visible = true;
      drop(th, rnd(-0.6, 0.6), 1.2, 0.4);
    } else {
      th.state = 'caught';
      th.t = 0;
    }
    onCatch(th, had, 'click');
  }

  return {
    list,
    add,
    update,
    hit,
    catchIt,
    busy: () => list.length,
    onRim: () => list.some(th => ON_RIM.has(th.state)),
    clear() {
      for (const th of [...list]) remove(th);
    }
  };
}
