// 画布：按需重画（有东西在动才画，静止时 0 次），DPR 最多 2，鼠标事件分给小鬼 → 工作台。
import { computeLayout } from './layout.js';

const CURSOR = (() => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><circle cx="16" cy="16" r="10" fill="none" stroke="#3a1a08" stroke-width="5"/><circle cx="16" cy="16" r="10" fill="none" stroke="#fff4de" stroke-width="2.5"/><circle cx="16" cy="16" r="2" fill="#fff4de"/></svg>';
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 16 16, crosshair`;
})();

export function createStage(canvas, world, parts) {
  const g = canvas.getContext('2d');
  const { bench, tower, queue, mess, fx, bank, showcase, board, helper, editor } = parts;
  let W = 1, H = 1, dpr = 1, L = null, raf = 0, last = 0, renders = 0, lastMs = 0, pointer = null;
  canvas.style.cursor = CURSOR;

  function resize() {
    W = Math.max(1, canvas.clientWidth || innerWidth);
    H = Math.max(1, canvas.clientHeight || innerHeight);
    dpr = Math.min(2, Math.max(1, devicePixelRatio || 1));
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    L = computeLayout(W, H, world.settings());
    for (const p of [bench, tower, queue, mess, bank, showcase, board, helper, editor]) p.relayout(L);
    wake();
  }

  function frame(ts) {
    raf = 0;
    // 帧时间和事件时间（鼠标、直播事件里的 world.now()）用同一个钟，计时不会错位
    const t0 = performance.now(), t = t0 / 1000, dt = last ? Math.min(0.05, Math.max(0, t - last)) : 1 / 60;
    last = t;
    let moving = false;
    moving = bench.update(t, dt) || moving;
    moving = tower.update(t, dt) || moving;
    moving = queue.update(t, dt) || moving;
    moving = mess.update(t, dt) || moving;
    moving = bank.update(t, dt) || moving;
    moving = showcase.update(t, dt) || moving;
    moving = helper.update(t, dt) || moving;
    if (world.editing) moving = true;
    if (fx.update(dt)) moving = true;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    tower.draw(g, t);
    queue.draw(g, t);
    bench.draw(g, t);
    fx.draw(g);
    mess.draw(g, t);
    helper.draw(g, t);
    board.draw(g, t, world.editing);
    showcase.draw(g, t, world.editing);
    bank.draw(g, t);
    if (world.editing) editor.draw(g, t);
    renders++;
    lastMs = performance.now() - t0;
    // 这一帧里有人调过 wake()（比如灯刚做好），raf 已经排上了，不能再排第二条
    if (moving && !raf) raf = requestAnimationFrame(frame);
    if (!raf) last = 0;
  }

  function wake() { if (!raf) raf = requestAnimationFrame(frame); }

  const at = e => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  canvas.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    world.audio.unlock();
    const [x, y] = at(e);
    pointer = e.pointerId;
    try { canvas.setPointerCapture(e.pointerId); } catch {}
    const t = performance.now() / 1000;
    if (world.editing ? editor.pointerDown(x, y) : (mess.click(x, y) || showcase.pointerDown(x, y, t) || bench.pointerDown(x, y))) e.preventDefault();
    wake();
  });
  canvas.addEventListener('pointermove', e => {
    if (pointer !== null && e.pointerId !== pointer) return;
    const [x, y] = at(e);
    const t = performance.now() / 1000;
    if (world.editing ? editor.pointerMove(x, y) : (showcase.pointerMove(x, y, t) || bench.pointerMove(x, y))) wake();
  });
  const up = e => {
    if (pointer === null || e.pointerId !== pointer) return;
    pointer = null;
    const [x, y] = at(e);
    const t = performance.now() / 1000;
    if (world.editing ? editor.pointerUp() : (showcase.pointerUp(x, y, t) || bench.pointerUp(x, y))) wake();
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('lostpointercapture', up);
  addEventListener('resize', resize);
  resize();

  return {
    wake, resize,
    get layout() { return L; },
    get dpr() { return dpr; },
    stats: () => ({ renders, lastMs, running: !!raf, W, H, dpr })
  };
}
