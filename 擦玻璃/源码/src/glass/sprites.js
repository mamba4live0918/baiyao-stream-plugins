/* 画布精灵：把一张程序画好的画布贴到四边形上，按屏幕像素摆放、旋转、缩放、淡入淡出。
   角色和飞行物用它；它们会飞过露脸区（一闪而过），所以不做露脸区遮罩。 */
import * as THREE from 'three';
import { canvasTexture } from './stage.js';

export function createSprite(stage, canvas, w, h, layer, { pivot = [0, 0], texture = null } = {}) {
  /* texture：几个精灵共用一张贴图（例如一杯奶茶的所有珍珠），这时 dispose 不释放它 */
  const tex = texture || canvasTexture(canvas);
  const ownTex = !texture;
  const material = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false });
  const geo = new THREE.PlaneGeometry(w, h);
  /* pivot：相对中心的支点偏移（像素，y 向下），旋转和缩放都绕支点 */
  geo.translate(-pivot[0], pivot[1], 0);
  const mesh = new THREE.Mesh(geo, material);
  mesh.renderOrder = layer;
  mesh.frustumCulled = false;
  stage.scene.add(mesh);
  const s = {
    mesh,
    tex,
    material,
    set(x, y, rot = 0, scale = 1, alpha = 1) {
      mesh.position.set(x, stage.H - y, 0);
      mesh.rotation.z = -rot;
      mesh.scale.set(scale, scale, 1);
      material.opacity = alpha;
      mesh.visible = alpha > 0.001;
    },
    scaleXY(sx, sy) {
      mesh.scale.set(sx, sy, 1);
    },
    /* 换一张图（动画帧） */
    swap(c) {
      if (tex.image === c) return;
      tex.image = c;
      tex.needsUpdate = true;
    },
    refresh() {
      tex.needsUpdate = true;
    },
    dispose() {
      stage.scene.remove(mesh);
      geo.dispose();
      material.dispose();
      if (ownTex) tex.dispose();
    }
  };
  return s;
}
