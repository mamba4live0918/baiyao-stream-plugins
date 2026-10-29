/* 淘金 · 簸箕版 · 簸箕：竹编的内壁和外壳、一圈缠竹皮的包边；里面的沙面和水面跟着模拟实时变形。
   这些都挂在 root 下面，root 的位置和倾斜由 motion.js 控制。 */
import * as THREE from 'three';
import { BASKET } from '../shape.js';
import { mesh } from './geo.js';
import { valueNoise } from '../util.js';

const TILE = 0.32; // 竹编贴图一块铺多大（米）

/* 用和沙子一样的格子建簸箕内壁：两张网格完全重合，沙子退到 0 时刚好藏在竹编下面 */
function shellGeometry(sim, outer) {
  const { nx, nz, X, Z, S } = sim;
  const pos = new Float32Array(nx * nz * 3);
  const uv = new Float32Array(nx * nz * 2);
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      const x = X[i];
      const z = Z[j];
      const y = S[k];
      const u = Math.abs((2 * x) / BASKET.W);
      const v = (BASKET.D / 2 - z) / BASKET.D;
      pos[k * 3] = outer ? x * 1.012 : x;
      pos[k * 3 + 1] = outer ? y - 0.03 : y;
      pos[k * 3 + 2] = outer ? z + (j === nz - 1 ? 0.006 : 0) : z;
      /* 帮子上把高度折算进贴图坐标，竹篾不会被拉长 */
      uv[k * 2] = (x + Math.sign(x) * y * Math.min(1, u * 1.15) ** 2) / TILE;
      uv[k * 2 + 1] = (z - y * Math.min(1, v * 1.35) ** 2) / TILE;
    }
  }
  const index = [];
  for (let j = 0; j < nz - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i;
      const b = a + 1;
      const c = a + nx;
      const d = c + 1;
      if (outer) index.push(a, b, c, b, d, c);
      else index.push(a, c, b, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(index);
  geo.computeVertexNormals();
  return geo;
}

/* 包边：沿着两边和后背的顶沿一圈粗的，前口一道细的 */
function rimGeometry(sim) {
  const { nx, nz, X, Z, S } = sim;
  const pts = [];
  const at = (i, j) => new THREE.Vector3(X[i], S[j * nx + i] + 0.004, Z[j]);
  for (let j = nz - 1; j >= 0; j -= 3) pts.push(at(0, j));
  for (let i = 3; i < nx - 1; i += 3) pts.push(at(i, 0));
  for (let j = 0; j < nz; j += 3) pts.push(at(nx - 1, j));
  pts.push(at(nx - 1, nz - 1));
  const big = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'centripetal'), 260, 0.03, 10, false);
  const lipPts = [];
  for (let i = 0; i < nx; i += 3) lipPts.push(at(i, nz - 1));
  lipPts.push(at(nx - 1, nz - 1));
  const lip = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(lipPts, false, 'centripetal'), 120, 0.02, 8, false);
  return { big, lip };
}

/* 沙面：顶点 = 底 + 沙厚 − 6 毫米（没沙的地方正好藏在竹编下面）；颜色按干湿、泥、厚薄 */
function sandMesh(sim, M) {
  const { nx, nz, X, Z } = sim;
  const N = nx * nz;
  const pos = new Float32Array(N * 3);
  const nor = new Float32Array(N * 3);
  const col = new Float32Array(N * 3);
  const uv = new Float32Array(N * 2);
  const tint = new Float32Array(N);
  const noise = valueNoise(nx, nz, 7, 63);
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      pos[k * 3] = X[i];
      pos[k * 3 + 2] = Z[j];
      uv[k * 2] = (X[i] / BASKET.W) * 3;
      uv[k * 2 + 1] = (Z[j] / BASKET.D) * 2.4;
      tint[k] = 0.94 + noise[k] * 0.1;
    }
  }
  const index = [];
  for (let j = 0; j < nz - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i;
      index.push(a, a + nx, a + 1, a + 1, a + nx, a + nx + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(index);
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.2, 0), 1.6);
  const m = mesh(geo, M.sand);
  const dry = new THREE.Color(0xdcb877);
  const thin = new THREE.Color(0xb08a58);
  const wet = new THREE.Color(0x9a7246);
  const mud = new THREE.Color(0x5e3f24);
  const c = new THREE.Color();
  const blurA = new Float32Array(N);
  const blurB = new Float32Array(N);
  const R = 2;
  let seen = -1;

  function blur(h) {
    for (let j = 0; j < nz; j++) {
      let acc = 0;
      for (let i = -R; i <= R; i++) acc += h[j * nx + Math.min(nx - 1, Math.max(0, i))];
      for (let i = 0; i < nx; i++) {
        blurA[j * nx + i] = acc / (2 * R + 1);
        acc += h[j * nx + Math.min(nx - 1, i + R + 1)] - h[j * nx + Math.max(0, i - R)];
      }
    }
    for (let i = 0; i < nx; i++) {
      let acc = 0;
      for (let j = -R; j <= R; j++) acc += blurA[Math.min(nz - 1, Math.max(0, j)) * nx + i];
      for (let j = 0; j < nz; j++) {
        blurB[j * nx + i] = acc / (2 * R + 1);
        acc += blurA[Math.min(nz - 1, j + R + 1) * nx + i] - blurA[Math.max(0, j - R) * nx + i];
      }
    }
  }

  function update(force) {
    const f = sim.field;
    if (!force && f.version === seen) return;
    seen = f.version;
    const h = f.h;
    const S = sim.S;
    blur(h);
    const inv = 1 / (2 * sim.cell);
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        const hk = h[k];
        pos[k * 3 + 1] = S[k] + hk - 0.0025;
        const H = (kk, ok) => (ok ? S[kk] + h[kk] : S[k] + hk);
        const x = -(H(k + 1, i < nx - 1) - H(k - 1, i > 0)) * inv;
        const z = -(H(k + nx, j < nz - 1) - H(k - nx, j > 0)) * inv;
        const l = Math.hypot(x, 1, z);
        nor[k * 3] = x / l;
        nor[k * 3 + 1] = 1 / l;
        nor[k * 3 + 2] = z / l;
        c.copy(thin).lerp(dry, Math.min(1, hk / 0.035));
        c.lerp(wet, f.wet[k] * 0.8);
        c.lerp(mud, f.mud[k] * 0.9);
        const ao = Math.min(1.08, Math.max(0.66, 1 - (blurB[k] - hk) * 6));
        const kk = tint[k] * ao;
        col[k * 3] = c.r * kk;
        col[k * 3 + 1] = c.g * kk;
        col[k * 3 + 2] = c.b * kk;
      }
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.normal.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
  }
  update(true);
  return { mesh: m, update };
}

/* 簸箕里的水：水面始终水平（模拟算好的斜面），没水的地方顶点透明，边缘自然淡出 */
function waterMesh(sim, M) {
  const { nx, nz, X, Z } = sim;
  const N = nx * nz;
  const pos = new Float32Array(N * 3);
  const col = new Float32Array(N * 4);
  const uv = new Float32Array(N * 2);
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      pos[k * 3] = X[i];
      pos[k * 3 + 2] = Z[j];
      uv[k * 2] = X[i] / 0.6;
      uv[k * 2 + 1] = Z[j] / 0.6;
    }
  }
  const index = [];
  for (let j = 0; j < nz - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i;
      index.push(a, a + nx, a + 1, a + 1, a + nx, a + nx + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 4));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(index);
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.2, 0), 1.6);
  const mat = M.basketWater;
  mat.vertexColors = true;
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = 2;
  const clear = new THREE.Color(0x5fb8b4);
  const muddy = new THREE.Color(0x8a6a44);
  const c = new THREE.Color();

  function update(murk) {
    const h = sim.field.h;
    const S = sim.S;
    c.copy(clear).lerp(muddy, Math.min(1, murk));
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        const top = S[k] + h[k];
        const d = sim.water[k];
        pos[k * 3 + 1] = d > 0 ? top + d : top + 0.002;
        col[k * 4] = c.r;
        col[k * 4 + 1] = c.g;
        col[k * 4 + 2] = c.b;
        col[k * 4 + 3] = Math.min(1, d / 0.016) * (0.55 + Math.min(1, murk) * 0.4);
      }
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
    geo.computeVertexNormals();
  }
  return { mesh: m, update };
}

export function buildBasket(scene, M, sim) {
  const root = new THREE.Group();
  scene.add(root);
  const inner = mesh(shellGeometry(sim, false), M.weave);
  root.add(inner);
  const outer = mesh(shellGeometry(sim, true), M.weaveOuter);
  root.add(outer);
  const rims = rimGeometry(sim);
  root.add(mesh(rims.big, M.binding));
  root.add(mesh(rims.lip, M.binding));
  const sand = sandMesh(sim, M);
  root.add(sand.mesh);
  const water = waterMesh(sim, M);
  root.add(water.mesh);
  return {
    root,
    sand,
    water,
    update(murk) {
      sand.update();
      water.update(murk);
    }
  };
}
