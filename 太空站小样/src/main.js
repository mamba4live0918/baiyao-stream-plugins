import {
  ACESFilmicToneMapping,
  Clock,
  PCFSoftShadowMap,
  PerspectiveCamera,
  Plane,
  Raycaster,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { EARTH, MAX_PIXEL_RATIO, PARTICLES, SCROLL_PAGES, STATION_SIZE, SUN_DIRECTION, TIMELINE } from './config.js';
import { COMMUNITY, CREDITS, MISSION, PLUGINS } from './content.js';
import { cameraAKeys, createDirector, createPose, viewState } from './core/director.js';
import { FONT_FAMILIES, loadAssets } from './core/loader.js';
import { clamp, remap } from './core/math.js';
import { createScroll } from './core/scroll.js';
import { createPipeline } from './post/pipeline.js';
import { activeWindow, SLOTS, STORY, WINDOWS } from './story.js';
import { createHud } from './text/hud.js';
import { SdfAtlas } from './text/sdfAtlas.js';
import { createBolts } from './world/bolts.js';
import { createCommunity } from './world/community.js';
import { createEarth } from './world/earth.js';
import { createLighting } from './world/lighting.js';
import { createServer } from './world/server.js';
import { vec3From } from './world/shared.js';
import { createSky } from './world/sky.js';
import { createStation } from './world/station.js';

const loader = document.getElementById('loader');
const loaderText = document.getElementById('loader-text');
const loaderBar = document.getElementById('loader-bar');

function showError(message) {
  loader.classList.add('error');
  loader.classList.remove('done');
  loaderText.textContent = message;
}

function fillScreenReaderCopy() {
  const main = document.getElementById('sr-copy');
  const add = (tag, text) => {
    const el = document.createElement(tag);
    el.textContent = text;
    main.append(el);
  };
  add('h1', MISSION.name);
  for (const s of STORY) {
    if (!s.title) continue;
    add('h2', s.title);
    const line = [s.label, s.body].filter(Boolean).join('。');
    if (line) add('p', line);
  }
  add('h2', '全部插件');
  for (const p of PLUGINS) add('p', `${p.name}（${p.tag}）：${p.desc}`);
  add('h2', COMMUNITY.title);
  for (const [label, value] of COMMUNITY.rows) add('p', `${label}：${value}`);
  add('p', CREDITS.join('；'));
}

function formatClock(seconds) {
  const s = Math.floor(seconds);
  return `T+ ${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

const framedTarget = new Vector3();
const framedPosition = new Vector3();

function applyPose(camera, pose, aspect, pointerX, pointerY) {
  // The keys put the subject (always at x = 0) right of centre to clear the
  // story block. Narrower screens shift it back towards the middle, and portrait
  // screens also step the camera back so the subject fits the narrow frame.
  framedTarget.copy(pose.target);
  framedTarget.x *= clamp((aspect - 0.75) / 0.75, 0, 1);
  framedPosition.copy(pose.position);
  // The keys are framed for ~16:9 (1.55+); narrower screens step back.
  const stepBack = Math.pow(Math.max(1, 1.55 / aspect), 0.6);
  framedPosition.sub(framedTarget).multiplyScalar(stepBack).add(framedTarget);
  camera.position.copy(framedPosition);
  camera.lookAt(framedTarget);
  // Parallax scales with how far the camera is from what it looks at, so the
  // close-ups on the rack do not swing as much as the wide opening shot.
  const reach = framedPosition.distanceTo(framedTarget) * 0.03;
  camera.translateX(pointerX * reach);
  camera.translateY(pointerY * reach * 0.6);
  camera.lookAt(framedTarget);
  // Portrait screens also get a slightly wider lens.
  const fov = aspect < 1 ? pose.fov / Math.pow(Math.max(aspect, 0.45), 0.25) : pose.fov;
  if (Math.abs(camera.fov - fov) > 1e-3 || camera.aspect !== aspect) {
    camera.fov = fov;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
  }
  // lookAt leaves matrixWorld stale; the hover ray is built from it before render.
  camera.updateMatrixWorld();
}

// Compile every material and upload every texture up front so nothing hitches
// when it first appears. Shader variants depend on the render target (tone
// mapping and colour space are only applied on screen), so compile against the
// HDR target the scene uses, with every layer enabled.
async function precompile(renderer, scene, camera, target) {
  const hidden = [];
  const textures = new Set();
  scene.traverse((o) => {
    if (!o.visible) {
      hidden.push(o);
      o.visible = true;
    }
    for (const material of [o.material].flat()) {
      if (!material) continue;
      for (const key of ['map', 'emissiveMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap']) {
        if (material[key]) textures.add(material[key]);
      }
    }
  });
  const layers = camera.layers.mask;
  camera.layers.enableAll();
  renderer.setRenderTarget(target);
  if (renderer.compileAsync) await renderer.compileAsync(scene, camera);
  else renderer.compile(scene, camera);
  renderer.setRenderTarget(null);
  camera.layers.mask = layers;
  for (const texture of textures) renderer.initTexture(texture);
  for (const o of hidden) o.visible = false;
}

// Objects only camera B (the community screen) should draw.
const COMMUNITY_LAYER = 2;

async function start() {
  const canvas = document.getElementById('gl');
  // Probe on a throwaway canvas: getContext on #gl would create the real context
  // with default settings, and WebGLRenderer would silently reuse it.
  const probe = document.createElement('canvas').getContext('webgl2');
  if (!probe) {
    showError('这个浏览器不支持 WebGL 2，请用最新版 Chrome 或 Edge 打开');
    return;
  }
  probe.getExtension('WEBGL_lose_context')?.loseContext();

  const renderer = new WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
  const pixelRatio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(canvas.clientWidth || window.innerWidth, canvas.clientHeight || window.innerHeight, false);
  renderer.setClearColor(0x04060b, 1);
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    showError('显卡渲染中断了，恢复后会自动重新加载；一直没恢复的话请刷新页面');
  });
  // Some GPU-only state (the reflection map) cannot be rebuilt in place.
  canvas.addEventListener('webglcontextrestored', () => window.location.reload());

  const assets = await loadAssets((p) => {
    loaderText.textContent = `LOADING ${Math.round(p * 100)}%`;
    loaderBar.style.width = `${p * 100}%`;
  });

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const sunDirection = vec3From(SUN_DIRECTION).normalize();
  const scene = new Scene();
  scene.add(createSky(assets.starmap));
  const earth = createEarth({
    day: assets.earthDay,
    night: assets.earthNight,
    clouds: assets.earthClouds,
    sunDirection,
    radius: EARTH.radius,
    center: EARTH.center,
  });
  scene.add(earth.group);
  createLighting(renderer, scene, sunDirection);

  const station = createStation(assets.station, { size: STATION_SIZE });
  scene.add(station.group, station.ghosts);
  const bolts = createBolts({
    station,
    sheets: [
      { texture: assets.explosion01, grid: 5, frames: 25 },
      { texture: assets.explosion02, grid: 5, frames: 25 },
    ],
  });
  scene.add(bolts.group);
  const server = createServer({ slots: SLOTS, windows: WINDOWS });
  scene.add(server.group, server.lights);

  const atlas = new SdfAtlas({
    title: { family: FONT_FAMILIES.title, fontSize: 56 },
    mono: { family: `${FONT_FAMILIES.mono}, ${FONT_FAMILIES.title}`, fontSize: 44 },
    monoBold: { family: `${FONT_FAMILIES.mono}, ${FONT_FAMILIES.title}`, fontSize: 44, weight: '700' },
  });
  const community = createCommunity({ atlas, pixelRatio });
  scene.add(community.group);
  community.group.traverse((o) => o.layers.set(COMMUNITY_LAYER));

  const cameraA = new PerspectiveCamera(40, 1, 0.1, 6000);
  const cameraB = new PerspectiveCamera(40, 1, 0.1, 6000);
  cameraB.layers.enable(COMMUNITY_LAYER); // camera A never sees the (unbooted) monitor
  const director = createDirector(cameraAKeys(server.layout, WINDOWS));
  const hud = createHud(atlas, { story: STORY, slots: SLOTS, reduceMotion });
  const pipeline = createPipeline(renderer, scene, cameraA, cameraB);
  const scroll = createScroll({ pages: SCROLL_PAGES, spacer: document.getElementById('scroll-space') });
  fillScreenReaderCopy();

  // Size from the canvas itself (CSS fills the visible viewport, which differs
  // from innerHeight on mobile while toolbars show) and re-read the pixel ratio,
  // which changes with browser zoom or a move to another monitor.
  const viewport = { width: 1, height: 1 };
  const resize = () => {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
    viewport.width = w;
    viewport.height = h;
    renderer.setPixelRatio(ratio);
    renderer.setSize(w, h, false);
    pipeline.setSize(w, h, ratio);
    community.setPixelRatio(ratio);
    hud.resize(w, h);
  };
  window.addEventListener('resize', resize);
  resize();

  const pose = createPose();
  applyPose(cameraA, director.poseA(0, pose), viewport.width / viewport.height, 0, 0);
  station.update(0, 0);
  await precompile(renderer, scene, cameraA, pipeline.sceneTarget);

  // Pointer interaction: hover/click rack blades (camera A), push the particles (camera B).
  const raycaster = new Raycaster();
  const ndc = new Vector2();
  const particlePlane = new Plane(new Vector3(0, 0, 1), -PARTICLES.center[2]);
  const planeHit = new Vector3();
  const particlePointer = new Vector3();
  let view = viewState(0);
  let hoveredSlot = -1;
  const isFeatured = (slot) => WINDOWS.some((w) => w.slot === slot);

  canvas.addEventListener('click', (e) => {
    if (!view.needA || view.needB) return;
    const rect = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, cameraA);
    const slot = server.pick(raycaster);
    const window_ = WINDOWS.find((w) => w.slot === slot);
    if (window_) scroll.scrollToProgress(window_.mid);
  });

  window.__demo = {
    setProgress: (p) => scroll.setProgress(p),
    get progress() {
      return scroll.progress;
    },
  };
  if (import.meta.env.DEV) Object.assign(window.__demo, { scene, cameraA, cameraB, station });

  const clock = new Clock();
  let firstFrame = true;
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05);
    const time = clock.elapsedTime;
    const p = scroll.update(dt);
    const jumped = scroll.consumeJump();
    const aspect = viewport.width / viewport.height;
    view = viewState(p);

    earth.update(time);
    station.update(p, time);
    bolts.update(p, time, jumped);

    const px = scroll.pointer.smoothX;
    const py = scroll.pointer.smoothY;
    if (view.needA) applyPose(cameraA, director.poseA(p, pose), aspect, px, py);
    if (view.needB) applyPose(cameraB, director.poseB(p, pose), aspect, px, py);

    hoveredSlot = -1;
    if (view.needA && !view.needB && scroll.pointer.active) {
      ndc.set(scroll.pointer.x, scroll.pointer.y);
      raycaster.setFromCamera(ndc, cameraA);
      hoveredSlot = server.pick(raycaster);
    }
    canvas.style.cursor = hoveredSlot >= 0 && isFeatured(hoveredSlot) ? 'pointer' : '';
    server.update(p, time, dt, hoveredSlot);

    let pointerOnParticles = null;
    if (view.needB && !view.needA && scroll.pointer.active) {
      ndc.set(scroll.pointer.x, scroll.pointer.y);
      raycaster.setFromCamera(ndc, cameraB);
      if (raycaster.ray.intersectPlane(particlePlane, planeHit)) {
        pointerOnParticles = particlePointer.copy(planeHit).sub(community.particleCenter);
      }
    }
    community.update(p, time, pointerOnParticles);

    const activeFeatured = activeWindow(p, WINDOWS);
    const online = Math.round(SLOTS.length * remap(p, TIMELINE.rackReveal[0], TIMELINE.rackReveal[1]));
    const transitionPeak = view.needA && view.needB ? 1 - Math.abs(view.transition * 2 - 1) : 0;
    hud.update(p, time, dt, {
      altitude: 408.2 + Math.sin(time * 0.7) * 0.05,
      velocity: 7.66 + Math.sin(time * 1.3) * 0.004,
      plugins: `${online}/${SLOTS.length}`,
      clock: formatClock(time),
      transitionPeak,
      hover: hoveredSlot >= 0 ? { plugin: SLOTS[hoveredSlot], slot: hoveredSlot } : null,
      activeSlot: activeFeatured ? WINDOWS[activeFeatured.index].slot : -1,
    });

    // Only camera A's shots have anything casting shadows worth updating.
    renderer.shadowMap.needsUpdate = view.needA;
    pipeline.render({
      transition: view.transition,
      needA: view.needA,
      needB: view.needB,
      time,
      flash: 0,
      alert: 0,
      strength: reduceMotion ? 0.45 : 1,
    });
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(hud.scene, hud.camera);
    renderer.autoClear = true;

    if (firstFrame) {
      firstFrame = false;
      // Hidden, not removed: showError reuses it if the GPU context is lost later.
      loader.classList.add('done');
    }
  });
}

start().catch((err) => {
  console.error(err);
  showError(`启动失败：${err?.message || err}`);
});
