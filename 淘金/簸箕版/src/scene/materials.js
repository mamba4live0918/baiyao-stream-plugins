/* 淘金 · 簸箕版 · 材质：竹编、包边、沙、水、金、石、麻袋、浣熊毛 */
import * as THREE from 'three';
import { weaveTex, bindingTex, sandMaps, burlapTex, waterNormal } from './textures.js';
import { tex, normalFromHeight } from '../util.js';

export function makeMaterials() {
  const weave = weaveTex();
  const weaveMap = tex(weave.map, { repeat: [1, 1] });
  const weaveNormal = tex(normalFromHeight(weave.height, 3.2), { repeat: [1, 1], srgb: false });
  const sand = sandMaps();
  const water = waterNormal();
  water.repeat.set(3, 3);
  const M = {
    weave: new THREE.MeshStandardMaterial({ map: weaveMap, normalMap: weaveNormal, normalScale: new THREE.Vector2(0.9, 0.9), roughness: 0.78, side: THREE.DoubleSide }),
    weaveOuter: new THREE.MeshStandardMaterial({ map: weaveMap, normalMap: weaveNormal, normalScale: new THREE.Vector2(0.7, 0.7), color: 0xd8c2a0, roughness: 0.82 }),
    binding: new THREE.MeshStandardMaterial({ map: tex(bindingTex(), { repeat: [24, 1] }), roughness: 0.6 }),
    sand: new THREE.MeshStandardMaterial({ map: sand.map, normalMap: sand.normal, normalScale: new THREE.Vector2(0.8, 0.8), vertexColors: true, roughness: 0.95, metalness: 0, envMapIntensity: 0.45 }),
    basketWater: new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0, roughness: 0.03, normalMap: water, normalScale: new THREE.Vector2(0.6, 0.6), transparent: true, opacity: 1, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 0.9, depthWrite: false }),
    gold: new THREE.MeshPhysicalMaterial({ color: 0xffc247, metalness: 1, roughness: 0.2, clearcoat: 0.6, clearcoatRoughness: 0.15, emissive: 0x3a2400, emissiveIntensity: 0.35 }),
    rock: new THREE.MeshStandardMaterial({ color: 0x8d949a, roughness: 0.86, metalness: 0.04, flatShading: true }),
    burlap: new THREE.MeshStandardMaterial({ map: burlapTex(), color: 0xd9b88a, roughness: 0.96 }),
    rope: new THREE.MeshStandardMaterial({ color: 0xb08a50, roughness: 0.9 }),
    furGray: new THREE.MeshStandardMaterial({ color: 0x8e939b, roughness: 0.92 }),
    furDark: new THREE.MeshStandardMaterial({ color: 0x33363c, roughness: 0.9 }),
    furLight: new THREE.MeshStandardMaterial({ color: 0xece6dc, roughness: 0.92 }),
    eye: new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.12, metalness: 0.2 }),
    eyeShine: new THREE.MeshBasicMaterial({ color: 0xffffff }),
    nose: new THREE.MeshStandardMaterial({ color: 0x1d1c1e, roughness: 0.3 }),
    redCloth: new THREE.MeshStandardMaterial({ color: 0xd8473e, roughness: 0.8 }),
    brass: new THREE.MeshStandardMaterial({ color: 0xd8a446, metalness: 0.92, roughness: 0.28 })
  };
  M.waterMap = water;
  return M;
}
