/* 淘金 · 簸箕版 · 可替换的贴图位：簸箕版/assets/ 里放同名图片（png/jpg/webp），重新构建就会内联进 HTML 并替换程序生成的贴图。
   没放就用程序生成的，玩法完全不受影响。 */
import * as THREE from 'three';

/* 槽位名 → 用到这张贴图的材质（换竹编时连凹凸贴图一起去掉，免得纹路对不上） */
export const SLOTS = {
  weave: M => [M.weave, M.weaveOuter],
  sand: M => [M.sand],
  burlap: M => [M.burlap]
};

export function applyAssetOverrides(M, renderer) {
  const assets = (typeof window !== 'undefined' && window.__TJ_ASSETS__) || {};
  const loader = new THREE.TextureLoader();
  const applied = [];
  for (const [name, pick] of Object.entries(SLOTS)) {
    const src = assets[name];
    if (typeof src !== 'string' || !src.startsWith('data:image/')) continue;
    const mats = pick(M).filter(Boolean);
    if (!mats.length) continue;
    applied.push(name);
    loader.load(src, tex => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      for (const m of mats) {
        if (m.map) tex.repeat.copy(m.map.repeat);
        m.map = tex;
        if (name === 'weave') m.normalMap = null;
        m.needsUpdate = true;
      }
    });
  }
  return applied;
}
