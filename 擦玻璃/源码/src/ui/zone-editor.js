/* 露脸区编辑层：多边形，怎么框都行。
   - 拖圆点 = 改形状；点两个圆点中间的小点 = 在那里加一个点（按住还能接着拖）；右键或双击圆点 = 删掉这个点（至少留 3 个）；
   - 按住框里面拖 = 整个挪；
   - 「重新画」：沿着脸一圈点下去，点回第一个点（或双击、回车）就画好了，Esc 取消；
   - 「只露脸」「露到肩」「露半身」：一键换成现成的形状（头顶位置不动）。
   拖的时候只预览（一帧最多更新一次），松手才保存。坐标都是占画面宽、高的百分比。 */
import { el } from './dom.js';
import { ZONE_MAX_PTS, ZONE_MIN_PTS, ZONE_PRESETS, presetPts } from '../zone.js';

const NS = 'http://www.w3.org/2000/svg';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const r1 = v => Math.round(v * 10) / 10;
const TIP = '拖圆点改形状 · 点两点中间的小点加一个点 · 右键圆点删掉 · 按住框里面拖整个挪';
const TIP_DRAW = '沿着脸一圈点下去，点回第一个点（或双击、回车）就画好了 · Esc 取消';

function svgEl(tag, attrs = {}) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

export function createZoneEditor({ getZone, setZone, previewZone, onDone }) {
  const svg = svgEl('svg', { class: 'zsvg' });
  const shade = svgEl('path', { class: 'zshade', 'fill-rule': 'evenodd' });
  const shape = svgEl('polygon', { class: 'zpoly' });
  const guide = svgEl('polyline', { class: 'zguide' });
  const mids = svgEl('g');
  const dots = svgEl('g');
  svg.append(shade, shape, guide, mids, dots);
  const tip = el('span', { class: 'ztip', text: TIP });
  const redraw = el('button', { type: 'button', class: 'zsub', text: '重新画' });
  const done = el('button', { type: 'button', text: '完成' });
  const bar = el('div', { class: 'zbar' }, tip, redraw, ...ZONE_PRESETS.map(([name, kind]) => el('button', { type: 'button', class: 'zsub', text: name, onclick: () => usePreset(kind) })), done);
  const root = el('div', { id: 'gl-zone', hidden: true }, svg, bar);
  document.body.append(root);

  let pts = [];
  let drag = null;
  let drawing = null;
  let hover = null;
  let raf = 0;
  let lastDown = null;

  const W = () => innerWidth;
  const H = () => innerHeight;
  const px = p => [(p[0] / 100) * W(), (p[1] / 100) * H()];
  const pct = (x, y) => [r1(clamp((x / W()) * 100, 0, 100)), r1(clamp((y / H()) * 100, 0, 100))];
  const at = e => {
    const r = svg.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };

  function render() {
    svg.setAttribute('viewBox', `0 0 ${W()} ${H()}`);
    const list = drawing ? drawing : pts;
    const ring = list.map(px);
    const str = ring.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
    /* 框外压暗一点，框里亮着 */
    shade.setAttribute('d', `M0 0H${W()}V${H()}H0Z` + (!drawing && ring.length >= 3 ? 'M' + ring.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join('L') + 'Z' : ''));
    shape.setAttribute('points', drawing ? '' : str);
    guide.setAttribute('points', drawing ? str + (hover ? ` ${hover[0].toFixed(1)},${hover[1].toFixed(1)}` : '') : '');
    dots.replaceChildren(...ring.map(([x, y], i) => svgEl('circle', { class: 'zpt' + (drawing && i === 0 ? ' zfirst' : ''), cx: x, cy: y, r: drawing && i === 0 ? 11 : 9, 'data-i': i })));
    if (drawing || pts.length >= ZONE_MAX_PTS) mids.replaceChildren();
    else {
      mids.replaceChildren(...ring.map(([x, y], i) => {
        const [x2, y2] = ring[(i + 1) % ring.length];
        return svgEl('circle', { class: 'zmid', cx: (x + x2) / 2, cy: (y + y2) / 2, r: 6, 'data-i': i });
      }));
    }
    tip.textContent = drawing ? TIP_DRAW : TIP;
    redraw.textContent = drawing ? '取消重画' : '重新画';
  }

  /* 拖的时候：一帧最多预览一次 */
  function preview() {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      previewZone({ ...getZone(), pts: pts.map(p => p.slice()) });
    });
  }
  function commit() {
    if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
    setZone({ ...getZone(), pts: pts.map(p => p.slice()) });
  }

  function usePreset(kind) {
    drawing = null;
    pts = presetPts(kind, pts, W() / H());
    commit();
    render();
  }

  function removePoint(i) {
    if (pts.length <= ZONE_MIN_PTS) return;
    pts.splice(i, 1);
    commit();
    render();
  }

  function finishDrawing() {
    if (!drawing || drawing.length < ZONE_MIN_PTS) return;
    pts = drawing.slice(0, ZONE_MAX_PTS);
    drawing = null;
    hover = null;
    commit();
    render();
  }

  svg.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const [x, y] = at(e);
    if (drawing) {
      /* 点回第一个点就画好了 */
      if (drawing.length >= ZONE_MIN_PTS) {
        const [fx, fy] = px(drawing[0]);
        if (Math.hypot(x - fx, y - fy) < 16) {
          finishDrawing();
          return;
        }
      }
      if (drawing.length < ZONE_MAX_PTS) drawing.push(pct(x, y));
      render();
      return;
    }
    const t = e.target;
    /* 双击圆点 = 删掉：同一个圆点 0.4 秒内按两下（按住拖的时候指针被框接管，浏览器的 dblclick 落不到圆点上，自己认） */
    if (t.classList.contains('zpt')) {
      const i = Number(t.dataset.i);
      const now = performance.now();
      if (lastDown && lastDown.i === i && now - lastDown.t < 400 && Math.hypot(x - lastDown.x, y - lastDown.y) < 8) {
        lastDown = null;
        removePoint(i);
        return;
      }
      lastDown = { i, t: now, x, y };
    } else lastDown = null;
    svg.setPointerCapture(e.pointerId);
    if (t.classList.contains('zpt')) drag = { mode: 'pt', i: Number(t.dataset.i) };
    else if (t.classList.contains('zmid')) {
      const i = Number(t.dataset.i) + 1;
      pts.splice(i, 0, pct(x, y));
      drag = { mode: 'pt', i };
      render();
      preview();
    } else if (t === shape) drag = { mode: 'all', x0: x, y0: y, orig: pts.map(p => p.slice()) };
    else drag = null;
  });

  svg.addEventListener('pointermove', e => {
    const [x, y] = at(e);
    if (drawing) {
      hover = [x, y];
      render();
      return;
    }
    if (!drag) return;
    /* 松开了但没收到 pointerup（比如鼠标跑出窗口）：当作结束 */
    if (e.buttons === 0) {
      end();
      return;
    }
    if (drag.mode === 'pt') pts[drag.i] = pct(x, y);
    else {
      /* 整个挪：不让任何一个点跑出画面 */
      const xs = drag.orig.map(p => p[0]);
      const ys = drag.orig.map(p => p[1]);
      const dx = clamp(((x - drag.x0) / W()) * 100, -Math.min(...xs), 100 - Math.max(...xs));
      const dy = clamp(((y - drag.y0) / H()) * 100, -Math.min(...ys), 100 - Math.max(...ys));
      pts = drag.orig.map(([px0, py0]) => [r1(px0 + dx), r1(py0 + dy)]);
    }
    render();
    preview();
  });

  const end = () => {
    if (!drag) return;
    drag = null;
    commit();
  };
  svg.addEventListener('pointerup', end);
  svg.addEventListener('pointercancel', end);
  svg.addEventListener('contextmenu', e => {
    e.preventDefault();
    if (!drawing && e.target.classList.contains('zpt')) removePoint(Number(e.target.dataset.i));
  });
  svg.addEventListener('dblclick', () => {
    if (!drawing) return;
    /* 双击会先补一个点：把多出来的那个去掉再收口 */
    if (drawing.length > ZONE_MIN_PTS) drawing.pop();
    finishDrawing();
  });
  redraw.onclick = () => {
    drawing = drawing ? null : [];
    hover = null;
    render();
  };
  /* 点过的按钮不留焦点：不然回车收口时，按钮又被回车按了一次（又开始重画） */
  bar.addEventListener('click', e => {
    if (e.target.tagName === 'BUTTON') e.target.blur();
  });
  done.onclick = () => close(true);
  addEventListener('resize', () => {
    if (!root.hidden) render();
  });
  addEventListener('keydown', e => {
    if (root.hidden) return;
    if (e.code === 'Escape' || e.code === 'Enter' || e.code === 'NumpadEnter') e.preventDefault();
    if (e.code === 'Escape') {
      if (drawing) {
        drawing = null;
        hover = null;
        render();
      } else close(true);
    } else if ((e.code === 'Enter' || e.code === 'NumpadEnter') && drawing) finishDrawing();
  });

  function open() {
    pts = (getZone().pts || []).map(p => p.slice());
    drawing = null;
    hover = null;
    root.hidden = false;
    render();
  }
  function close(finished) {
    if (root.hidden) return;
    root.hidden = true;
    /* 正拖着就关了：拖到哪存到哪（不留一个没存的预览在画面上） */
    if (drag) {
      drag = null;
      commit();
    }
    drawing = null;
    if (finished && onDone) onDone();
  }
  return { open, close, isOpen: () => !root.hidden };
}
