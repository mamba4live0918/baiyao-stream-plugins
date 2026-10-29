/* 主播露头圆的编辑界面（和扫叶子一样：圆内拖动移动，右侧圆点拖动改大小，完成后虚线框消失）
   坐标：x、y 为窗口宽高的百分比，r 为窗口高度的百分比。只负责界面，物理碰撞体由 main.js 按设置重建。 */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function createHeadEditor({ getHead, setHead, onChange, onDone, warnText }) {
  const root = document.createElement('div');
  root.className = 'head-edit'; root.hidden = true;
  root.innerHTML = '<div class="head-ring"><span class="head-tip">拖动移动 · 右侧圆点缩放</span><i class="head-dot" title="拖动改大小"></i></div>'
    + '<div class="head-bar"><span>主播露头圆：拖到脸上，拖右侧圆点改大小</span><em class="head-warn"></em><button type="button">完成</button></div>';
  document.body.append(root);
  const ring = root.querySelector('.head-ring'), dot = root.querySelector('.head-dot'), warn = root.querySelector('.head-warn');
  let drag = null, changeT = 0;

  function place() {
    const h = getHead(), W = innerWidth, H = innerHeight, r = h.r / 100 * H;
    Object.assign(ring.style, { left: h.x / 100 * W - r + 'px', top: h.y / 100 * H - r + 'px', width: 2 * r + 'px', height: 2 * r + 'px' });
    warn.textContent = (warnText && warnText()) || '';
  }
  function changed() {
    place();
    const now = performance.now();
    if (now - changeT > 100) { changeT = now; onChange(); }
    else { clearTimeout(changed.t); changed.t = setTimeout(() => { changeT = performance.now(); onChange(); }, 110); }
  }
  ring.addEventListener('pointerdown', e => {
    e.preventDefault(); e.stopPropagation(); ring.setPointerCapture(e.pointerId);
    const h = getHead(), W = innerWidth, H = innerHeight, cx = h.x / 100 * W, cy = h.y / 100 * H;
    drag = e.target === dot ? { mode: 'size', cx, cy } : { mode: 'move', dx: e.clientX - cx, dy: e.clientY - cy };
  });
  ring.addEventListener('pointermove', e => {
    if (!drag) return;
    const W = innerWidth, H = innerHeight, h = getHead();
    if (drag.mode === 'size') setHead({ ...h, r: Math.round(clamp(Math.hypot(e.clientX - drag.cx, e.clientY - drag.cy) / H * 100, 3, 45) * 10) / 10 });
    else setHead({ ...h, x: Math.round(clamp((e.clientX - drag.dx) / W * 100, 0, 100) * 10) / 10, y: Math.round(clamp((e.clientY - drag.dy) / H * 100, 0, 100) * 10) / 10 });
    changed();
  });
  const end = () => { if (drag) { drag = null; onChange(); } };
  ring.addEventListener('pointerup', end); ring.addEventListener('pointercancel', end);
  root.querySelector('.head-bar button').onclick = () => close(true);
  addEventListener('resize', () => { if (!root.hidden) place(); });

  function open({ bar = true } = {}) { root.classList.toggle('nobar', !bar); root.hidden = false; place(); }
  function close(done) { if (root.hidden) return; root.hidden = true; drag = null; if (done && onDone) onDone(); }
  return { open, close, sync: place, isOpen: () => !root.hidden, el: root };
}
