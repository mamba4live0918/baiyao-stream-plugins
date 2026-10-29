/* 出摊啦 V1.3 · 画面上的牌子：按住拖动换位置，拖右下角圆点改大小。位置按画面比例存，大小是倍数。 */
export const BOARD_SCALE = Object.freeze({ min: 0.4, max: 3 });
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const finite = v => typeof v === 'number' && Number.isFinite(v);

/** 纯函数：按拖动距离算新的 {x, y, scale}。rect 是按下时的像素框（已含缩放），scale 是按下时的倍数。 */
export function dragBoard({ mode, rect, scale, dx, dy, viewport }) {
  const s = finite(scale) ? scale : 1;
  if (mode === 'move') {
    const x = clamp(rect.x + dx, 0, Math.max(0, viewport.width - rect.width));
    const y = clamp(rect.y + dy, 0, Math.max(0, viewport.height - rect.height));
    return { x: x / viewport.width, y: y / viewport.height, scale: s };
  }
  // 拖右下角：左上角不动，按比例放大缩小。
  // 横着拖和竖着拖取动得多的那个方向，往外拖放大、往里拖缩小。
  const ry = dy * rect.width / Math.max(1, rect.height), d = Math.abs(dx) >= Math.abs(ry) ? dx : ry;
  const width = Math.max(1, rect.width + d);
  return { x: rect.x / viewport.width, y: rect.y / viewport.height, scale: clamp(s * width / rect.width, BOARD_SCALE.min, BOARD_SCALE.max) };
}

/** 牌子中心落在露脸区里：画面会把它裁掉，看不见也点不到，所以不让放在那。zone 是设置里的露脸区（百分比点）。 */
export function onFace(rect, zone, viewport) {
  const pts = zone?.enabled ? zone.pts : null;
  if (!Array.isArray(pts) || pts.length < 3 || !rect) return false;
  const x = rect.x + rect.width / 2, y = rect.y + rect.height / 2;
  let hit = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const ax = pts[i][0] * viewport.width / 100, ay = pts[i][1] * viewport.height / 100, bx = pts[j][0] * viewport.width / 100, by = pts[j][1] * viewport.height / 100;
    if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) hit = !hit;
  }
  return hit;
}

/** 把存的位置换成像素：没存就返回 null（用默认位置），出了画面就拉回来。size 是 1 倍时的宽高。 */
export function boardRect(board, size, viewport) {
  const s = clamp(finite(board?.scale) ? board.scale : 1, BOARD_SCALE.min, BOARD_SCALE.max);
  const width = size.width * s, height = size.height * s;
  if (!board || !finite(board.x) || !finite(board.y)) return { x: null, y: null, width, height, scale: s };
  return { x: clamp(board.x * viewport.width, 0, Math.max(0, viewport.width - width)), y: clamp(board.y * viewport.height, 0, Math.max(0, viewport.height - height)), width, height, scale: s };
}

const CSS = `.ct-movable{pointer-events:auto!important;cursor:grab;touch-action:none;user-select:none}
.ct-movable[data-dragging="move"]{cursor:grabbing}
.ct-grip{position:absolute;right:-8px;bottom:-8px;width:20px;height:20px;border-radius:50%;background:#fff4d9;border:2px solid #49372d;box-shadow:0 2px 0 #49372d;cursor:nwse-resize;opacity:0;transition:opacity .15s;pointer-events:auto;box-sizing:border-box}
.ct-grip::after{content:"";position:absolute;inset:4px;border-right:2px solid #49372d;border-bottom:2px solid #49372d}
.ct-movable:hover>.ct-grip,.ct-movable[data-dragging]>.ct-grip{opacity:1}`;
let styled = false;

/**
 * node：要拖的元素（会加上 .ct-movable 和右下角圆点）。
 * getRect()：{rect:{x,y,width,height}（像素，含缩放）, scale}；
 * preview(next|null)：拖动中预览（null = 取消）；commit(next)：松手保存。
 * blocked(next)：松手的位置不能放（比如压在脸上）就返回 true，牌子弹回去并调 onBlocked()。
 */
export function makeMovable(node, { getRect, preview, commit, blocked = () => false, onBlocked = () => {}, title = '拖动换位置，拖右下角改大小' }) {
  if (!styled && typeof document !== 'undefined') { const s = document.createElement('style'); s.textContent = CSS; document.head.append(s); styled = true; }
  node.classList.add('ct-movable');
  if (!node.title) node.title = title;
  const grip = document.createElement('span'); grip.className = 'ct-grip'; grip.setAttribute('aria-hidden', 'true'); node.append(grip);
  let drag = null;
  node.addEventListener('pointerdown', e => {
    if (e.button !== 0 || drag) return;
    e.preventDefault(); e.stopPropagation();
    const { rect, scale } = getRect();
    drag = { mode: e.target === grip ? 'resize' : 'move', id: e.pointerId, start: { x: e.clientX, y: e.clientY }, rect, scale, next: null };
    node.dataset.dragging = drag.mode;
    try { node.setPointerCapture(e.pointerId); } catch { /* 不能捕获就照常走 */ }
  });
  node.addEventListener('pointermove', e => {
    if (!drag || drag.id !== e.pointerId) return;
    e.stopPropagation();
    drag.next = dragBoard({ mode: drag.mode, rect: drag.rect, scale: drag.scale, dx: e.clientX - drag.start.x, dy: e.clientY - drag.start.y, viewport: { width: innerWidth, height: innerHeight } });
    preview(drag.next);
  });
  const finish = (e, cancel) => {
    if (!drag || drag.id !== e.pointerId) return;
    e.stopPropagation();
    const d = drag; drag = null; delete node.dataset.dragging;
    try { node.releasePointerCapture(e.pointerId); } catch { /* 已释放 */ }
    const moved = !cancel && d.next && Math.hypot(e.clientX - d.start.x, e.clientY - d.start.y) >= 3;
    if (moved && blocked(d.next)) { preview(null); onBlocked(); }
    else if (moved) commit(d.next);
    else preview(null);
  };
  node.addEventListener('pointerup', e => finish(e, false));
  node.addEventListener('pointercancel', e => finish(e, true));
  // 切走窗口之类丢了鼠标：当作取消，牌子回原处
  node.addEventListener('lostpointercapture', e => finish(e, true));
  return { grip };
}
