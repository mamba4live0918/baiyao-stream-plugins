/* 淘金 · 簸箕版 · 渲染器、相机取景、灯光（沿用快递分拣 3D 的做法：整窗透明画布 + 取景框 + ACES + 环境光照） */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/RoomEnvironment.js';
import { FIT, CAMERA, STAGE_FRAME } from './layout.js';
import { clamp } from './util.js';

export function createView(canvas, opts) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = opts.shadows !== 'off';
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.5;

  const camera = new THREE.PerspectiveCamera(CAMERA.fov, 16 / 9, 0.5, 120);
  const base = { pos: new THREE.Vector3(), target: new THREE.Vector3() };

  /* 灯光：暖色太阳投影 + 天光 + 冷色轮廓光，和快递分拣同一套比例 */
  const hemi = new THREE.HemisphereLight(0xfff1dc, 0x5a4c40, 0.58);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffe6c4, 3.2);
  sun.position.set(-5, 8.5, 5.5);
  sun.target.position.set(0.3, 0, 0);
  sun.castShadow = renderer.shadowMap.enabled;
  const hi = opts.shadows === 'soft';
  sun.shadow.mapSize.set(hi ? 4096 : 2048, hi ? 4096 : 2048);
  Object.assign(sun.shadow.camera, { left: -5.5, right: 5.5, top: 4.5, bottom: -4.5, near: 1, far: 30 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  sun.shadow.radius = 3;
  scene.add(sun, sun.target);
  const rim = new THREE.DirectionalLight(0xdfe9ff, 0.75);
  rim.position.set(9, 7, -9);
  scene.add(rim);

  let frame = { ...STAGE_FRAME };
  let VW = 1;
  let VH = 1;

  /* 让平台刚好框进取景框：二分相机距离使所有取景点落在框内，再用 setViewOffset 扩到整窗 */
  function fit() {
    const fr = { left: (frame.x / 100) * VW, top: (frame.y / 100) * VH, width: Math.max(1, (frame.w / 100) * VW), height: Math.max(1, (frame.h / 100) * VH) };
    camera.clearViewOffset();
    camera.aspect = fr.width / fr.height;
    camera.updateProjectionMatrix();
    const p = THREE.MathUtils.degToRad(clamp(opts.pitch ?? CAMERA.pitch, 12, 75));
    const yw = THREE.MathUtils.degToRad(opts.yaw ?? CAMERA.yaw);
    const dir = new THREE.Vector3(Math.sin(yw) * Math.cos(p), Math.sin(p), Math.cos(yw) * Math.cos(p));
    const pts = FIT.map(a => new THREE.Vector3(a[0], a[1], a[2]));
    const centre = pts.reduce((s, v) => s.add(v), new THREE.Vector3()).divideScalar(pts.length);
    const target = new THREE.Vector3(centre.x, 0.6, centre.z);
    const q = new THREE.Vector3();
    const place = d => {
      camera.position.copy(target).addScaledVector(dir, d);
      camera.lookAt(target);
      camera.updateMatrixWorld();
    };
    const measure = () => {
      let x0 = 1e9;
      let x1 = -1e9;
      let y0 = 1e9;
      let y1 = -1e9;
      for (const v of pts) {
        q.copy(v).project(camera);
        x0 = Math.min(x0, q.x);
        x1 = Math.max(x1, q.x);
        y0 = Math.min(y0, q.y);
        y1 = Math.max(y1, q.y);
      }
      return { x0, x1, y0, y1 };
    };
    const tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    let d = 30;
    for (let it = 0; it < 4; it++) {
      let lo = 4;
      let hiD = 140;
      for (let k = 0; k < 26; k++) {
        const mid = (lo + hiD) / 2;
        place(mid);
        const m = measure();
        if (Math.max(-m.x0, m.x1, -m.y0, m.y1) > 0.97) lo = mid;
        else hiD = mid;
      }
      d = hiD;
      place(d);
      const m = measure();
      const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
      const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
      target.addScaledVector(right, ((m.x0 + m.x1) / 2) * tanH * camera.aspect * d).addScaledVector(up, ((m.y0 + m.y1) / 2) * tanH * d);
    }
    d /= (opts.zoom ?? 100) / 100;
    place(d);
    base.pos.copy(camera.position);
    base.target.copy(target);
    camera.setViewOffset(fr.width, fr.height, -fr.left, -fr.top, VW, VH);
    camera.updateMatrixWorld();
  }

  function resize() {
    VW = Math.max(1, window.innerWidth);
    VH = Math.max(1, window.innerHeight);
    renderer.setPixelRatio(clamp((window.devicePixelRatio || 1) * (opts.resolution ?? 1), 0.5, opts.maxPR ?? 2));
    renderer.setSize(VW, VH, false);
    fit();
  }

  return {
    renderer,
    scene,
    camera,
    sun,
    base,
    resize,
    setFrame(f) {
      frame = { ...frame, ...f };
      fit();
    },
    setOpts(o) {
      Object.assign(opts, o);
      fit();
    },
    /* 画质：像素比上限 + 阴影贴图大小 */
    setQuality(maxPR, shadowSize) {
      opts.maxPR = maxPR;
      if (sun.shadow.mapSize.x !== shadowSize) {
        sun.shadow.mapSize.set(shadowSize, shadowSize);
        if (sun.shadow.map) {
          sun.shadow.map.dispose();
          sun.shadow.map = null;
        }
      }
      resize();
    },
    get size() {
      return { w: VW, h: VH };
    }
  };
}
