/* 淘金 · 簸箕版 · 粒子：飞起来的沙粒（落回簸箕就变成沙面的一部分）、水滴、尘土、闪光。
   落地判定交给外面：land(p) 返回 true 表示这粒已经落下（簸箕、水面、草地），由外面决定堆沙还是溅水 */
import * as THREE from 'three';
import { dotTex, starTex } from './textures.js';
import { rnd } from '../util.js';

const MAX_GRAIN = 3200;
const MAX_DROP = 1200;
const MAX_SPRITE = 160;
const G = -14;
const WATER = new THREE.Color(0x9ccfd8);
export const MUD = new THREE.Color(0x7a5532);

export function createParticles(scene, ctx) {
  const { landGrain, landDrop } = ctx;
  const grainGeo = new THREE.IcosahedronGeometry(1, 0);
  const grainMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
  const grains = new THREE.InstancedMesh(grainGeo, grainMat, MAX_GRAIN);
  grains.castShadow = true;
  grains.frustumCulled = false;
  grains.count = 0;
  const dropMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.72 });
  const drops = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), dropMat, MAX_DROP);
  drops.frustumCulled = false;
  drops.count = 0;
  /* 先放一个颜色进去：实例颜色属性从一开始就存在，着色器只编译一次 */
  grains.setColorAt(0, new THREE.Color(1, 1, 1));
  drops.setColorAt(0, new THREE.Color(1, 1, 1));
  scene.add(grains, drops);

  const G_ = [];
  const D_ = [];
  const sprites = [];
  const dot = dotTex();
  const star = starTex();
  const o = new THREE.Object3D();
  const col = new THREE.Color();
  const sandTones = [0xd9b16e, 0xc99d5c, 0xe6c58a, 0xb98e52, 0xf0d39a].map(h => new THREE.Color(h));

  function sprite(kind, x, y, z, s, life, color, vel) {
    let sp = sprites.find(p => !p.alive);
    if (!sp) {
      if (sprites.length >= MAX_SPRITE) return;
      const mat = new THREE.SpriteMaterial({ map: kind === 'star' ? star : dot, transparent: true, depthWrite: false });
      sp = { obj: new THREE.Sprite(mat), alive: false };
      scene.add(sp.obj);
      sprites.push(sp);
    }
    const m = sp.obj.material;
    m.map = kind === 'star' ? star : dot;
    m.blending = kind === 'star' ? THREE.AdditiveBlending : THREE.NormalBlending;
    m.color.set(color);
    sp.alive = true;
    sp.kind = kind;
    sp.age = 0;
    sp.life = life;
    sp.s0 = s;
    sp.v = vel || new THREE.Vector3();
    sp.obj.position.set(x, y, z);
    sp.obj.visible = true;
  }

  return {
    grains: G_,
    textures: [dot, star],
    /* 一粒沙：带着体积 vol，落进盘里就堆上去 */
    grain(x, y, z, vx, vy, vz, size, vol) {
      if (G_.length >= MAX_GRAIN) G_.shift();
      G_.push({ x, y, z, vx, vy, vz, size, vol, rot: rnd(0, 6), spin: rnd(-8, 8), c: sandTones[(Math.random() * sandTones.length) | 0] });
    },
    /* 水滴；color 传泥水色就是泥点 */
    drop(x, y, z, vx, vy, vz, size, color = WATER) {
      if (D_.length >= MAX_DROP) D_.shift();
      D_.push({ x, y, z, vx, vy, vz, size, c: color });
    },
    dust(x, y, z, s = 0.6, color = 0xe8d5b5, life = 0.9, vel) {
      sprite('dust', x, y, z, s, life, color, vel);
    },
    sparkle(x, y, z, s = 0.5, life = 0.6) {
      sprite('star', x, y, z, s, life, 0xffe7a6);
    },
    busy() {
      return G_.length;
    },
    update(dt) {
      /* 沙粒 */
      let n = 0;
      for (let i = 0; i < G_.length; i++) {
        const p = G_[i];
        p.vy += G * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        p.rot += p.spin * dt;
        if ((p.vy < 0 && landGrain(p)) || p.y < -2) continue;
        G_[n++] = p;
      }
      G_.length = n;
      for (let i = 0; i < n; i++) {
        const p = G_[i];
        o.position.set(p.x, p.y, p.z);
        o.rotation.set(p.rot, p.rot * 0.7, 0);
        o.scale.setScalar(p.size);
        o.updateMatrix();
        grains.setMatrixAt(i, o.matrix);
        grains.setColorAt(i, col.copy(p.c));
      }
      grains.count = n;
      grains.instanceMatrix.needsUpdate = true;
      if (grains.instanceColor) grains.instanceColor.needsUpdate = true;

      /* 水滴 */
      let m = 0;
      for (let i = 0; i < D_.length; i++) {
        const p = D_[i];
        p.vy += G * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        if ((p.vy < 0 && landDrop(p)) || p.y < -2) continue;
        D_[m++] = p;
      }
      D_.length = m;
      for (let i = 0; i < m; i++) {
        const p = D_[i];
        o.position.set(p.x, p.y, p.z);
        o.rotation.set(0, 0, 0);
        o.scale.set(p.size, p.size * 1.6, p.size);
        o.updateMatrix();
        drops.setMatrixAt(i, o.matrix);
        drops.setColorAt(i, p.c);
      }
      drops.count = m;
      drops.instanceMatrix.needsUpdate = true;
      if (drops.instanceColor) drops.instanceColor.needsUpdate = true;

      /* 尘土与闪光 */
      for (const sp of sprites) {
        if (!sp.alive) continue;
        sp.age += dt;
        const k = sp.age / sp.life;
        if (k >= 1) {
          sp.alive = false;
          sp.obj.visible = false;
          continue;
        }
        sp.obj.position.addScaledVector(sp.v, dt);
        if (sp.kind === 'dust') {
          sp.obj.scale.setScalar(sp.s0 * (0.6 + k * 1.4));
          sp.obj.material.opacity = (1 - k) * 0.55;
        } else {
          const pulse = Math.sin(k * Math.PI);
          sp.obj.scale.setScalar(sp.s0 * (0.4 + pulse));
          sp.obj.material.opacity = pulse * 0.85;
          sp.obj.material.rotation = k * 1.2;
        }
      }
    }
  };
}
