/* 淘金 · 簸箕版 · 簸箕里的金子和石头。
   金子比沙重，埋在沙底；沙被淘走、露出来一会儿，就自己飞到“淘到”数字牌里（记在送矿观众名下）。
   晃得太猛时，露出来的、或靠近前口的金子会被甩出去掉进水里。石头压着沙也压着金子，点它扔出去。 */
import * as THREE from 'three';
import { lumpGeo } from './geo.js';
import { BASKET } from '../shape.js';
import { rnd, clamp } from '../util.js';

const SIZE = { flake: 0.07, nugget: 0.12, big: 0.2, rock: 0.2 };
const GRAV = -12;
const COLLECT_AFTER = 0.55; // 露出来多久自动收走（秒）
const PIN_R = 0.15; // 石头压住多大一片

export const isGold = it => it.kind !== 'rock';

export function createNuggets(ctx) {
  const { scene, root, sim, M, particles, counter, hooks } = ctx;
  const geos = {
    flake: [0, 1, 2, 3].map(i => lumpGeo(0.045, 1, 100 + i, 0.34, 0.32)),
    nugget: [0, 1, 2, 3].map(i => lumpGeo(0.065, 2, 200 + i, 0.72, 0.3)),
    big: [0, 1].map(i => lumpGeo(0.11, 3, 300 + i, 0.78, 0.36)),
    rock: [0, 1, 2, 3].map(i => lumpGeo(0.11, 1, 400 + i, 0.68, 0.3, false))
  };
  const hoverMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x777777, roughness: 0.6, flatShading: true });
  const list = [];
  const v = new THREE.Vector3();
  const q = new THREE.Quaternion();
  let seq = 0;
  let hovered = null;

  function make(kind, scale) {
    const variants = geos[kind];
    const m = new THREE.Mesh(variants[Math.floor(Math.random() * variants.length)], kind === 'rock' ? M.rock : M.gold);
    m.castShadow = true;
    m.receiveShadow = true;
    m.scale.setScalar(scale);
    m.rotation.set(rnd(-0.3, 0.3), rnd(0, 6.3), rnd(-0.3, 0.3));
    return m;
  }

  /* 埋进簸箕（簸箕坐标） */
  function bury(kind, x, z, owner = '', value = 0, sim2 = false) {
    const scale = kind === 'big' ? rnd(0.95, 1.12) : rnd(0.85, 1.2);
    const mesh = make(kind, scale);
    const it = { id: ++seq, kind, owner, value, sim: sim2, mesh, size: SIZE[kind] * scale, x, z, y: 0, state: 'rest', exposedFor: 0, glint: rnd(0.5, 2), t: 0, vel: new THREE.Vector3() };
    it.y = restY(it);
    mesh.position.set(x, it.y, z);
    root.add(mesh);
    list.push(it);
    return it;
  }

  /* 石头：从天上掉下来（世界坐标），砸进簸箕后就留在里面 */
  function dropRock(world, owner) {
    const mesh = make('rock', rnd(0.85, 1.15));
    mesh.position.copy(world);
    scene.add(mesh);
    const it = { id: ++seq, kind: 'rock', owner, value: 0, mesh, size: SIZE.rock * mesh.scale.x, x: 0, z: 0, y: 0, state: 'fall', t: 0, vel: new THREE.Vector3(0, -2, 0), spin: new THREE.Vector3(rnd(-4, 4), rnd(-4, 4), rnd(-4, 4)) };
    list.push(it);
    return it;
  }

  function restY(it) {
    /* 金子沉到底；石头压在沙面上 */
    return it.kind === 'rock' ? sim.topAt(it.x, it.z) + it.size * 0.25 : sim.floorAt(it.x, it.z) + it.size * 0.3;
  }

  function exposure(it) {
    return clamp(1 - sim.sandAt(it.x, it.z) / (it.size * 0.75), 0, 1);
  }

  function remove(it) {
    it.state = 'gone';
    if (it.mesh.parent) it.mesh.parent.remove(it.mesh);
    const k = list.indexOf(it);
    if (k >= 0) list.splice(k, 1);
    if (hovered === it) hovered = null;
  }

  /* 从簸箕里拿出来，换到世界坐标里飞 */
  function toWorld(it) {
    it.mesh.getWorldPosition(v);
    it.mesh.getWorldQuaternion(q);
    scene.attach(it.mesh);
    it.mesh.position.copy(v);
    it.mesh.quaternion.copy(q);
  }

  function underRock(it) {
    for (const r of list) {
      if (r.kind !== 'rock' || r.state !== 'rest') continue;
      if ((r.x - it.x) ** 2 + (r.z - it.z) ** 2 < PIN_R * PIN_R) return true;
    }
    return false;
  }

  /* 甩出去：顺着前口方向飞出，落水就没了 */
  function fling(it, power = 1) {
    toWorld(it);
    it.state = 'fly';
    it.t = 0;
    v.set(rnd(-0.6, 0.6), rnd(2.2, 3.4) * power, rnd(1.4, 2.4) * power).applyQuaternion(root.quaternion);
    it.vel.copy(v);
    it.spin = new THREE.Vector3(rnd(-8, 8), rnd(-8, 8), rnd(-8, 8));
  }

  function collect(it) {
    toWorld(it);
    it.state = 'collect';
    it.t = 0;
    it.from = it.mesh.position.clone();
    it.to = counter.mouth();
    counter.open(1.2);
  }

  /* 石头被点：往旁边弹出去 */
  function flick(it) {
    if (it.state !== 'rest') return false;
    toWorld(it);
    it.state = 'fly';
    it.t = 0;
    const side = it.x >= 0 ? 1 : -1;
    v.set(side * rnd(2.2, 3.2), rnd(3.2, 4.2), rnd(-0.6, 0.8));
    it.vel.copy(v);
    it.spin = new THREE.Vector3(rnd(-9, 9), rnd(-9, 9), rnd(-9, 9));
    return true;
  }

  /* 石头压住的地方，沙子不太动 */
  function pinSand() {
    sim.mob.fill(1);
    const { nx, nz, X, Z } = sim;
    for (const r of list) {
      if (r.kind !== 'rock' || r.state !== 'rest') continue;
      const i0 = Math.max(0, Math.floor((r.x - PIN_R - X[0]) / sim.cell));
      const i1 = Math.min(nx - 1, Math.ceil((r.x + PIN_R - X[0]) / sim.cell));
      const j0 = Math.max(0, Math.floor((r.z - PIN_R - Z[0]) / sim.cell));
      const j1 = Math.min(nz - 1, Math.ceil((r.z + PIN_R - Z[0]) / sim.cell));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if ((X[i] - r.x) ** 2 + (Z[j] - r.z) ** 2 < PIN_R * PIN_R) sim.mob[j * nx + i] = 0.15;
    }
  }

  /* 世界坐标里飞的东西：碰到簸箕就回到簸箕里，碰到水或地面就算掉了 */
  function updateFlying(it, dt, state) {
    it.vel.y += GRAV * dt;
    it.mesh.position.addScaledVector(it.vel, dt);
    if (it.spin) {
      it.mesh.rotation.x += it.spin.x * dt;
      it.mesh.rotation.z += it.spin.z * dt;
    }
    const p = it.mesh.position;
    if (it.state === 'fall' && it.vel.y < 0) {
      const local = root.worldToLocal(p.clone());
      if (Math.abs(local.x) < BASKET.W / 2 - 0.08 && Math.abs(local.z) < BASKET.D / 2 - 0.05 && local.y <= sim.topAt(local.x, local.z) + it.size * 0.3) {
        it.x = local.x;
        it.z = local.z;
        it.state = 'rest';
        root.attach(it.mesh);
        it.y = restY(it);
        it.mesh.position.set(it.x, it.y, it.z);
        hooks.landed(it, -it.vel.y);
        return;
      }
    }
    /* 掉出画面：甩出去的金子就算丢了 */
    if (p.y < state.fallOut || it.t > 6) {
      if (it.state === 'fly' && isGold(it)) hooks.lost(it);
      remove(it);
    }
  }

  function update(dt, state) {
    pinSand();
    const lip = BASKET.D / 2;
    for (let n = list.length - 1; n >= 0; n--) {
      const it = list[n];
      if (!it) continue;
      it.t += dt;
      if (it.state === 'rest') {
        it.y = restY(it);
        /* 晃的时候在原地轻轻抖 */
        const jig = state.A > 0.1 ? Math.sin(it.t * 31 + it.id) * 0.004 * state.A : 0;
        it.mesh.position.set(it.x + jig, it.y, it.z);
        if (!isGold(it)) continue;
        const e = exposure(it);
        const clean = e > 0.62 && !underRock(it) && state.murk < 0.5;
        it.exposedFor = clean ? it.exposedFor + dt : 0;
        if (e > 0.5 && state.murk < 0.5) {
          it.glint -= dt;
          if (it.glint <= 0) {
            it.glint = rnd(0.7, 1.6);
            v.set(it.x, it.y + it.size * 0.5, it.z);
            root.localToWorld(v);
            particles.sparkle(v.x, v.y, v.z, it.kind === 'big' ? 0.42 : it.kind === 'nugget' ? 0.3 : 0.22, 0.5);
          }
        }
        /* 太猛：露出来的、或者离前口很近的金子会被甩出去 */
        if (state.spill && state.A > state.danger && (e > 0.4 || it.z > lip - 0.28)) {
          const rate = (state.A - state.danger) * 1.4 * (1 + Math.max(0, state.pitch) * 3);
          if (Math.random() < rate * dt) {
            fling(it, 1);
            hooks.flung(it);
            continue;
          }
        }
        if (it.exposedFor >= COLLECT_AFTER) collect(it);
      } else if (it.state === 'collect') {
        const k = Math.min(1, it.t / 0.6);
        it.mesh.position.lerpVectors(it.from, it.to, k);
        it.mesh.position.y += Math.sin(k * Math.PI) * 0.8;
        it.mesh.rotation.y += dt * 9;
        if (k >= 1) {
          hooks.collected(it);
          remove(it);
        }
      } else if (it.state === 'fly' || it.state === 'fall') {
        updateFlying(it, dt, state);
      }
    }
  }

  return {
    list,
    bury,
    dropRock,
    flick,
    fling,
    exposure,
    remove,
    update,
    rocks: () => list.filter(it => it.kind === 'rock' && it.state === 'rest'),
    /* 点中检测：射线离石头中心够近 */
    pickRock(ray) {
      let best = null;
      let bestD = Infinity;
      const c = new THREE.Vector3();
      const t = new THREE.Vector3();
      for (const it of list) {
        if (it.kind !== 'rock' || it.state !== 'rest') continue;
        it.mesh.getWorldPosition(c);
        ray.closestPointToPoint(c, t);
        const d = t.distanceTo(c);
        if (d < Math.max(0.16, it.size * 1.1) && d < bestD) {
          bestD = d;
          best = it;
        }
      }
      return best;
    },
    setHover(it) {
      if (hovered === it) return;
      if (hovered && hovered.state === 'rest') hovered.mesh.material = M.rock;
      hovered = it;
      if (it) it.mesh.material = hoverMat;
    },
    clear() {
      for (const it of [...list]) remove(it);
    },
    materials: [hoverMat]
  };
}
