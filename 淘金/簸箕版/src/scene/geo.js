/* 淘金 · 簸箕版 · 几何小工具：带阴影的网格、圆角盒、有起伏的圆润块（石头、金块） */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/RoundedBoxGeometry.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32 } from '../util.js';

export function mesh(geo, mat, cast = true, recv = true) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast;
  m.receiveShadow = recv;
  return m;
}
/* 拆掉一个临时模型（小偷、熊）：只释放它自己的几何体，材质是全场共用的，不动 */
export function disposeGeometries(root) {
  root.traverse(o => {
    if (o.isMesh && !o.isInstancedMesh) o.geometry.dispose();
  });
}

export const RB = (w, h, d, r = 0.05, s = 3) => new RoundedBoxGeometry(w, h, d, s, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001));

/* 有起伏的圆润块（石头、灌木、金块都用） */
export function lumpGeo(r, detail, seed, squash = 0.8, amp = 0.22, smooth = true) {
  let g = new THREE.IcosahedronGeometry(r, detail);
  if (smooth) {
    g.deleteAttribute('normal');
    g.deleteAttribute('uv');
    g = mergeVertices(g);
  }
  const rand = mulberry32(seed);
  const p = g.attributes.position;
  const seen = new Map();
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i).toFixed(4)},${p.getY(i).toFixed(4)},${p.getZ(i).toFixed(4)}`;
    if (!seen.has(key)) seen.set(key, 1 + (rand() - 0.5) * amp * 2);
    const k = seen.get(key);
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * squash, p.getZ(i) * k);
  }
  g.computeVertexNormals();
  return g;
}
