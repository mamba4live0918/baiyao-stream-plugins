/* 淘金 · 簸箕版 · 鼠标（只用左键）：
   按住任意地方 = 端起簸箕；左右拖 = 晃，往下拖 = 前口往下倒水，松手簸箕回原位；
   点石头 = 扔出去；点小偷 = 抓住它。撞簸箕之前按住不动也算“稳住”。 */
import * as THREE from 'three';
import { BASKET_REST } from './layout.js';
import { BASKET } from './shape.js';

const PITCH_DRAG = 0.2; // 往下拖窗口高度的这个比例 = 前倾到最大
const SWAY_GAIN = 1.25; // 鼠标横移 1 米 → 簸箕横移多少

export function createInput(canvas, ctx) {
  const { view, motion, nuggets, thieves, audio, onFirst, onDoubleClick } = ctx;
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  /* 簸箕所在高度的水平面：鼠标在“簸箕平面”上的位置（小偷躲鼠标、双击判断用） */
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -BASKET_REST.y);
  let grab = null;
  let pid = null;
  let ground = null;
  let enabled = true;
  let filter = null; // 自动演示时只认演示的虚拟鼠标
  const ok = e => enabled && (!filter || filter(e));

  function setRay(e) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, view.camera);
  }

  function trackGround() {
    const p = new THREE.Vector3();
    ground = ray.ray.intersectPlane(groundPlane, p) ? p : null;
  }

  /* 屏幕上 1 像素约等于簸箕那里多少米 */
  function metersPerPixel() {
    const a = new THREE.Vector3(BASKET_REST.x, BASKET_REST.y, BASKET_REST.z).project(view.camera);
    const b = new THREE.Vector3(BASKET_REST.x + 1, BASKET_REST.y, BASKET_REST.z).project(view.camera);
    const px = Math.abs(b.x - a.x) * 0.5 * view.size.w;
    return px > 1 ? 1 / px : 0.004;
  }

  function capture(e) {
    pid = e.pointerId;
    try {
      canvas.setPointerCapture(pid);
    } catch (err) {
      pid = null;
    }
  }

  function end() {
    if (grab) motion.release();
    grab = null;
    if (pid !== null) {
      try {
        canvas.releasePointerCapture(pid);
      } catch (err) {
        /* 已经释放 */
      }
    }
    pid = null;
    canvas.style.cursor = 'grab';
  }

  function hover() {
    const rock = nuggets.pickRock(ray.ray);
    nuggets.setHover(rock);
    const th = thieves.hit(ray.ray);
    canvas.style.cursor = rock || th ? 'pointer' : 'grab';
  }

  canvas.addEventListener('pointerdown', e => {
    if (e.button !== 0 || !ok(e)) return;
    if (grab) end();
    onFirst();
    setRay(e);
    trackGround();
    const th = thieves.hit(ray.ray);
    if (th) {
      thieves.catchIt(th);
      return;
    }
    const rock = nuggets.pickRock(ray.ray);
    if (rock) {
      nuggets.setHover(null);
      if (nuggets.flick(rock)) audio.play('pick');
      return;
    }
    grab = { x: e.clientX, y: e.clientY, bx: motion.tx, bp: motion.tp, mpp: metersPerPixel() };
    motion.grab();
    capture(e);
    canvas.style.cursor = 'grabbing';
  });

  canvas.addEventListener('pointermove', e => {
    if (!ok(e)) return;
    setRay(e);
    trackGround();
    if (grab && !(e.buttons & 1)) {
      end();
      return;
    }
    if (grab) {
      const dx = (e.clientX - grab.x) * grab.mpp * SWAY_GAIN;
      const dy = (e.clientY - grab.y) / Math.max(200, view.size.h * PITCH_DRAG);
      motion.aim(grab.bx + dx, grab.bp + dy * 0.42);
    } else hover();
  });

  canvas.addEventListener('pointerup', e => ok(e) && end());
  canvas.addEventListener('pointercancel', e => ok(e) && end());
  canvas.addEventListener('lostpointercapture', () => {
    if (grab) end();
  });
  canvas.addEventListener('pointerleave', () => {
    if (!grab) {
      nuggets.setHover(null);
      ground = null;
    }
  });
  /* 双击簸箕外面的空白处打开设置（簸箕上双击还是端簸箕） */
  canvas.addEventListener('dblclick', e => {
    setRay(e);
    trackGround();
    const far = !ground || Math.abs(ground.x - BASKET_REST.x) > BASKET.W / 2 + 0.4 || Math.abs(ground.z - BASKET_REST.z) > BASKET.D / 2 + 0.4;
    if (far) onDoubleClick();
  });
  addEventListener('blur', () => {
    if (grab) end();
  });
  canvas.style.cursor = 'grab';

  return {
    holding: () => !!grab,
    pointer: () => ground,
    setEnabled(on) {
      enabled = on;
      if (!on) end();
    },
    setFilter(fn) {
      filter = fn;
      end();
    }
  };
}
