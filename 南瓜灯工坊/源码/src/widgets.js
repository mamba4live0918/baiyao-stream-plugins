// 画面上能自己摆的三样：灯展（顶上一串灯）、贡献榜、糖罐。
// 没摆过就自动放：贡献榜在工作台那一侧的左上角，糖罐在塔那一侧的上方，灯展挂在它们中间。
// 摆过的按「左上角占画面的比例 + 大小倍数」放（灯展还多一个长度），换画布大小也大致在原处。
import { clamp } from './tween.js';

export const WIDGETS = ['board', 'garland', 'bank'];
export const WIDGET_NAMES = { board: '贡献榜', garland: '灯展', bank: '糖罐' };

/** 三样各自的框（屏幕像素）和大小倍数 k（1 = 默认大小）。关掉的不在结果里。 */
export function widgetRects(L, settings) {
  const m = L.m, lay = settings.layout || {}, show = settings.show || {}, gap = 0.03 * m, top = L.margin * 0.6;
  const fit = r => ({ ...r, x: clamp(r.x, 0, Math.max(0, L.W - r.w)), y: clamp(r.y, 0, Math.max(0, L.H - r.h)) });
  const out = {};
  {
    const p = lay.bank, k = p ? p.s : 1, w = 0.17 * m * k, h = 0.065 * m * k, inward = L.flip ? 1 : -1;
    out.bank = fit({ x: p ? p.x * L.W : L.tower.x + inward * 0.2 * m - w / 2, y: p ? p.y * L.H : top, w, h, k });
  }
  if (show.board !== false) {
    const p = lay.board, k = p ? p.s : 1, w = 0.3 * m * k, h = 0.29 * m * k;
    out.board = fit({ x: p ? p.x * L.W : (L.flip ? L.W - L.margin - w : L.margin), y: p ? p.y * L.H : top, w, h, k });
  }
  if (show.garland !== false) {
    const p = lay.garland, k = p ? p.s : 1, h = 0.19 * m * k;
    let x, w;
    if (p) { x = p.x * L.W; w = p.w * L.W; }
    else {   // 挂在贡献榜和糖罐「默认位置」的中间：挪了它俩，没摆过的灯展不跟着变窄
      const home = widgetRects(L, { ...settings, layout: {}, show: { ...show, garland: false } });
      const spans = [home.board, home.bank].filter(Boolean).sort((a, b) => a.x - b.x);
      const left = spans.length === 2 ? spans[0].x + spans[0].w + gap : home.bank.x > L.W / 2 ? L.margin : home.bank.x + home.bank.w + gap;
      const right = spans.length === 2 ? spans[1].x - gap : home.bank.x > L.W / 2 ? home.bank.x - gap : L.W - L.margin;
      x = left; w = Math.max(0.2 * m, right - left);
    }
    out.garland = fit({ x, y: p ? p.y * L.H : top, w: Math.min(w, L.W), h, k });
  }
  return out;
}

/** 摆位置模式：拖框里 = 挪位置，拖右下角的圆点 = 改大小（灯展横着拖改长度、竖着拖改大小）。 */
export function createEditor(world) {
  let L = null, drag = null;
  const rects = () => widgetRects(L, world.settings());
  const handle = () => L.m * 0.03;

  function pointerDown(x, y) {
    const rs = rects();
    for (const id of [...WIDGETS].reverse()) {
      const r = rs[id];
      if (!r) continue;
      if (Math.hypot(x - (r.x + r.w), y - (r.y + r.h)) < handle() * 1.2) { drag = { id, mode: 'size', x0: x, y0: y, r }; return true; }
      if (x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h) { drag = { id, mode: 'move', dx: x - r.x, dy: y - r.y, r }; return true; }
    }
    return false;
  }

  function pointerMove(x, y) {
    if (!drag) return false;
    const { id, r } = drag, m = L.m;
    let next;
    if (drag.mode === 'move') next = { x: clamp(x - drag.dx, 0, L.W - r.w) / L.W, y: clamp(y - drag.dy, 0, L.H - r.h) / L.H, s: r.k };
    else if (id === 'garland') {
      const w = clamp(r.w + (x - drag.x0), 0.2 * m, L.W - r.x), k = clamp(r.k * (r.h + (y - drag.y0)) / r.h, 0.4, 3);
      next = { x: r.x / L.W, y: r.y / L.H, s: k, w: w / L.W };
    } else {
      const k = clamp(r.k * Math.max((r.w + (x - drag.x0)) / r.w, (r.h + (y - drag.y0)) / r.h), 0.4, 3);
      next = { x: r.x / L.W, y: r.y / L.H, s: k };
    }
    if (id === 'garland' && drag.mode === 'move') next.w = r.w / L.W;
    world.setLayout(id, next);
    return true;
  }

  function pointerUp() { const had = !!drag; drag = null; return had; }

  function draw(g, t) {
    const rs = rects(), h = handle();
    g.save();
    for (const id of WIDGETS) {
      const r = rs[id];
      if (!r) continue;
      const active = drag?.id === id;
      g.fillStyle = active ? 'rgba(255,200,90,.16)' : 'rgba(255,240,210,.08)';
      g.fillRect(r.x, r.y, r.w, r.h);
      g.setLineDash([L.m * 0.012, L.m * 0.008]);
      g.lineDashOffset = -t * L.m * 0.03;
      g.lineWidth = Math.max(2, L.m * 0.003);
      g.strokeStyle = active ? '#FFC24D' : '#FFF1D8';
      g.strokeRect(r.x, r.y, r.w, r.h);
      g.setLineDash([]);
      const fs = Math.round(L.m * 0.022);
      g.font = `900 ${fs}px "Microsoft YaHei",sans-serif`;
      const label = WIDGET_NAMES[id] + (id === 'garland' ? '（横拖改长度、竖拖改大小）' : '');
      const tw = g.measureText(label).width + fs;
      g.fillStyle = 'rgba(58,28,12,.85)';
      g.fillRect(r.x, r.y - fs * 1.5 < 0 ? r.y : r.y - fs * 1.5, tw, fs * 1.5);
      g.fillStyle = '#FFF1D8'; g.textBaseline = 'middle';
      g.fillText(label, r.x + fs * 0.5, (r.y - fs * 1.5 < 0 ? r.y : r.y - fs * 1.5) + fs * 0.78);
      g.beginPath(); g.arc(r.x + r.w, r.y + r.h, h * 0.55, 0, Math.PI * 2);
      g.fillStyle = '#FFC24D'; g.fill();
      g.lineWidth = Math.max(2, h * 0.12); g.strokeStyle = '#6E3A1C'; g.stroke();
    }
    g.restore();
  }

  return { pointerDown, pointerMove, pointerUp, draw, relayout: next => { L = next; }, get dragging() { return !!drag; } };
}
