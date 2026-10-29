/* 淘金 · 簸箕版 · 画面上的文字层（DOM）：“淘到的金子”数字牌、进账飘字、晃动力度条、事件提示、矿主榜/大盗榜、操作提示、
   “要撞了”警告。所有观众昵称都走 textContent，绝不拼进 HTML。 */
import * as THREE from 'three';
import { el } from './ui/dom.js';
import { COUNTER, BASKET_REST } from './layout.js';
import { BASKET } from './shape.js';
import { zoneOf, ZONES } from './motion.js';
import { damp } from './util.js';

const TOAST_MAX = 5;
const TOAST_LIFE = 4.6;
const fmt = g => (g >= 1000 ? g.toFixed(0) : g >= 100 ? g.toFixed(1) : g.toFixed(2));

export function createHud(root, { view, getSettings }) {
  const pill = el('div', { class: 'vin' }, el('span', { class: 'vk', text: '淘到' }), el('b', { class: 'vn', text: '0.00' }), el('span', { class: 'vu', text: '克' }));
  const tag = el('div', { class: 'vtag' }, pill);
  const toasts = el('div', { class: 'toasts', 'aria-live': 'polite' });
  const boards = el('div', { class: 'boards' });
  const hint = el('div', { class: 'hint' },
    el('span', {}, el('i', { text: '晃' }), '按住左右拖 = 晃簸箕'),
    el('span', {}, el('i', { text: '倒' }), '往下拖 = 往前倒水'),
    el('span', {}, el('i', { text: '石' }), '点石头扔掉'),
    el('span', {}, el('i', { text: '偷' }), '点小偷抓住它'));
  const warn = el('div', { class: 'bearwarn', text: '要撞过来了 · 按住簸箕稳住！' });
  /* 力度条：轻 / 刚好 / 太猛，指针跟着晃动强度走 */
  const needle = el('i', { class: 'mneedle' });
  const mlabel = el('b', { class: 'mlabel', text: '' });
  const meter = el('div', { class: 'meter' },
    el('div', { class: 'mtrack' }, el('span', { class: 'msoft' }), el('span', { class: 'mgood' }), el('span', { class: 'mhard' }), needle),
    mlabel);
  const SPAN = 1.4;
  meter.querySelector('.msoft').style.width = `${(ZONES.soft / SPAN) * 100}%`;
  meter.querySelector('.mgood').style.width = `${((ZONES.good - ZONES.soft) / SPAN) * 100}%`;
  meter.querySelector('.mhard').style.width = `${((SPAN - ZONES.good) / SPAN) * 100}%`;
  root.append(boards, toasts, tag, hint, warn, meter);
  let meterShow = 0;
  const v = new THREE.Vector3();
  let shown = 0;
  let target = 0;
  let boardKey = '';
  let boardEco = null;
  let boardVersion = -1;
  let floats = 0;

  function project(p) {
    v.copy(p).project(view.camera);
    const { w, h } = view.size;
    return { x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h, behind: v.z > 1 };
  }

  /* 数字牌放在簸箕右边（金子就飞到这里） */
  function placeTag() {
    const s = project(new THREE.Vector3(COUNTER.x, COUNTER.y + 0.12, COUNTER.z));
    tag.style.left = `${s.x.toFixed(1)}px`;
    tag.style.top = `${s.y.toFixed(1)}px`;
    return s;
  }

  /* 提示与榜单跟着取景框走：提示放在框的左下，事件提示在左上方往上长，榜单在右上 */
  function placeFrame() {
    const f = getSettings().display.frame;
    toasts.style.left = `${Math.max(0.5, f.x + 1)}%`;
    toasts.style.bottom = `${Math.min(96, 100 - f.y + 1)}%`;
    boards.style.right = `${Math.max(0.5, 100 - f.x - f.w + 1)}%`;
    boards.style.bottom = `${Math.min(96, 100 - f.y + 1)}%`;
    warn.style.top = `${Math.max(2, f.y - 9)}%`;
    /* 力度条放在簸箕左边，和右边的数字牌对称 */
    const m = project(new THREE.Vector3(BASKET_REST.x - BASKET.W / 2 - 0.85, COUNTER.y - 0.05, COUNTER.z));
    meter.style.left = `${m.x.toFixed(1)}px`;
    meter.style.top = `${m.y.toFixed(1)}px`;
    hint.style.left = `${Math.max(0.5, f.x + 1)}%`;
    hint.style.bottom = `${Math.max(0.5, 100 - f.y - f.h + 1.5)}%`;
  }

  function toast(o) {
    const t = el('div', { class: 'toast' + (o.tone ? ' ' + o.tone : '') },
      o.badge ? el('i', { class: 'tb', style: `background:${o.color || '#c9862f'}`, text: o.badge }) : null,
      o.who ? el('b', { text: o.who }) : null,
      el('span', { text: o.text }));
    toasts.append(t);
    while (toasts.children.length > TOAST_MAX) toasts.firstElementChild.remove();
    setTimeout(() => t.classList.add('out'), TOAST_LIFE * 1000);
    setTimeout(() => t.remove(), TOAST_LIFE * 1000 + 500);
  }

  /* 金库上方飘字：+0.23 克 / −0.50 克 */
  /* 金额飘字：短时间里连着进盆的合成一个（+0.85 克），不会叠成一团 */
  let lastGain = null;
  function gain(v, tone = '') {
    const now = performance.now();
    const sign = v >= 0 ? 1 : -1;
    if (lastGain && now - lastGain.t < 450 && lastGain.sign === sign && lastGain.el.isConnected) {
      lastGain.sum += v;
      lastGain.t = now;
      if (tone === 'big') lastGain.el.classList.add('big');
      lastGain.el.textContent = `${lastGain.sum >= 0 ? '+' : '−'}${Math.abs(lastGain.sum).toFixed(2)} 克`;
      lastGain.el.style.animation = 'none';
      void lastGain.el.offsetWidth;
      lastGain.el.style.animation = '';
      clearTimeout(lastGain.timer);
      lastGain.timer = setTimeout(() => lastGain && lastGain.el.remove(), 1500);
      return;
    }
    const s = placeTag();
    const f = el('div', { class: 'gain ' + tone, text: `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2)} 克` });
    floats = (floats + 1) % 3;
    f.style.left = `${(s.x + (floats - 1) * 26).toFixed(1)}px`;
    f.style.top = `${(s.y - 92 - floats * 6).toFixed(1)}px`;
    root.append(f);
    lastGain = { el: f, sum: v, t: now, sign, timer: setTimeout(() => f.remove(), 1500) };
  }

  function renderBoards(eco) {
    const s = getSettings();
    boards.hidden = !s.display.showBoard;
    if (boards.hidden || (eco === boardEco && eco.version === boardVersion)) return;
    boardEco = eco;
    boardVersion = eco.version;
    const owners = eco.top(eco.owners, 3);
    const thieves = eco.top(eco.thieves, 3);
    const key = JSON.stringify([owners, thieves]);
    if (key === boardKey) return;
    boardKey = key;
    const list = (title, rows, tone, empty) => el('div', { class: 'board ' + tone },
      el('h4', { text: title }),
      rows.length ? el('ol', {}, rows.map(r => el('li', {}, el('span', { text: r.name }), el('b', { text: fmt(r.gold) + ' 克' })))) : el('p', { text: empty }));
    boards.replaceChildren(list('矿主榜', owners, 'own', '还没有人送矿'), list('大盗榜', thieves, 'thief', '还没有人得手'));
  }

  return {
    toast,
    gain,
    setGold(g, instant) {
      target = g;
      if (instant) shown = g;
    },
    pulse() {
      pill.classList.remove('pop');
      void pill.offsetWidth;
      pill.classList.add('pop');
    },
    /* A = 晃动强度；holding = 是否按着簸箕 */
    meter(dt, A, holding) {
      meterShow = holding || A > 0.08 ? 1.2 : Math.max(0, meterShow - dt);
      meter.classList.toggle('on', meterShow > 0);
      const z = zoneOf(A);
      needle.style.left = `${Math.min(100, (A / SPAN) * 100).toFixed(1)}%`;
      meter.dataset.zone = z;
      mlabel.textContent = z === 'hard' ? '太猛了，金子会甩出去！' : z === 'good' ? '刚刚好' : z === 'soft' ? '再用点力' : '按住左右晃';
    },
    update(dt, eco, bumpWarning) {
      shown = Math.abs(target - shown) < 0.005 ? target : damp(shown, target, 7, dt);
      tag.querySelector('.vn').textContent = fmt(shown);
      placeTag();
      placeFrame();
      renderBoards(eco);
      hint.hidden = !getSettings().display.showHint;
      warn.classList.toggle("on", !!bumpWarning);
    }
  };
}
