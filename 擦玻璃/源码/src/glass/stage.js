/* 渲染舞台：three.js 正交相机，按屏幕像素摆东西（左上角为原点、y 向下，内部换成 three 的 y 向上）。
   颜色不做色彩空间转换：画布里画的颜色就是上屏的颜色（和 Canvas 2D 合成一致）。
   所有玻璃层共用一组 uniform：露脸区、画面尺寸、时间、玻璃抖动。 */
import * as THREE from 'three';
import { createZoneMask } from './zone-mask.js';

/* 层级（renderOrder）：越大越靠前 */
export const LAYER = Object.freeze({
  STAIN: 100,
  FILM: 1500,
  FILM_STAIN: 1600,
  GLARE: 2500,
  WATER: 2600,
  ACTOR: 3000,
  FLYER: 3200,
  PARTICLE: 4000,
  OVERHEAD: 4500,
  TOOL: 5000
});

export function createStage(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, premultipliedAlpha: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.sortObjects = true;
  const scene = new THREE.Scene();
  /* 玻璃本身（脏东西、水痕）放在一个组里：砸中时整块玻璃连同上面的东西一起震 */
  const pane = new THREE.Group();
  scene.add(pane);
  const camera = new THREE.OrthographicCamera(0, 1, 1, 0, -1000, 1000);
  camera.position.z = 10;

  /* 露脸区遮罩：一张小贴图（区里黑、区外白）；uZoneP = (1/画布宽, 1/画布高, 有没有露脸区) */
  const zoneMask = createZoneMask();
  const shared = {
    uZoneTex: { value: zoneMask.texture },
    uZoneP: { value: new THREE.Vector3(1, 1, 0) },
    uRes: { value: new THREE.Vector2(1, 1) },
    uTime: { value: 0 },
    uWobble: { value: new THREE.Vector2(0, 0) }
  };

  const stage = {
    THREE,
    renderer,
    scene,
    pane,
    camera,
    shared,
    W: 1,
    H: 1,
    dpr: 1,
    unit: 1,
    zone: null,
    /* 屏幕像素 → three 世界坐标 */
    wx: x => x,
    wy: y => stage.H - y,
    place(obj, x, y, z = 0) {
      obj.position.set(x, stage.H - y, z);
    },
    resize() {
      const W = Math.max(1, innerWidth);
      const H = Math.max(1, innerHeight);
      stage.W = W;
      stage.H = H;
      /* 大小按短边算（横屏是高、竖屏是宽）：横屏竖屏、不同分辨率下东西的实际大小都一样 */
      stage.unit = Math.min(W, H) / 1080;
      stage.dpr = Math.min(2, devicePixelRatio || 1);
      renderer.setPixelRatio(stage.dpr);
      renderer.setSize(W, H, false);
      camera.left = 0;
      camera.right = W;
      camera.top = H;
      camera.bottom = 0;
      camera.updateProjectionMatrix();
      shared.uRes.value.set(W * stage.dpr, H * stage.dpr);
      stage.setZone(stage.zone);
    },
    setZone(zr) {
      stage.zone = zr;
      zoneMask.draw(zr);
      shared.uZoneP.value.set(1 / (stage.W * stage.dpr), 1 / (stage.H * stage.dpr), zr ? 1 : 0);
    },
    render() {
      renderer.render(scene, camera);
    }
  };
  return stage;
}

/* 露脸区遮罩的 GLSL 片段：p 是 gl_FragCoord.xy，返回 0（区内）..1（区外）；uZoneP.z = 0 表示没有露脸区。
   遮罩贴图的 (0,0) 在左下角，和 gl_FragCoord 一样，直接按画布尺寸换算成 0..1 取样 */
export const ZONE_GLSL = /* glsl */ `
uniform sampler2D uZoneTex;
uniform vec3 uZoneP;
float zoneMask(vec2 p) {
  if (uZoneP.z < 0.5) return 1.0;
  return texture2D(uZoneTex, p * uZoneP.xy).r;
}
`;

/* 画布 → 纹理（不做色彩空间转换、不生成 mipmap，线性过滤） */
export function canvasTexture(c) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  t.generateMipmaps = false;
  t.minFilter = THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.premultiplyAlpha = false;
  t.needsUpdate = true;
  return t;
}
