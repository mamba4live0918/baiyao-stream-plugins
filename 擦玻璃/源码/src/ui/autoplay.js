/* 擦玻璃 · 自动演示：虚拟观众隔几秒随机捣乱/帮忙；虚拟鼠标（派发真正的 PointerEvent）去接鸡蛋、赶小动物、撕小广告、撕膜、刮脏东西。
   演示送来的东西照常计数，但不进榜单。 */
import { el } from './dom.js';
import { ACTIONS } from '../config.js';
import { qtySpecs } from '../rules.js';
import { defaultQty } from '../config.js';

const PID = 77;
const NAMES = ['小明', '路过的猫', '奶茶星人', '鸡蛋侠', '摸鱼王', '白曜的狗', '雾里看花', '小广告王', '好心人', '守护骑士', '番茄炒蛋', '壁虎君'];
const rand = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];

export class Autoplay {
  constructor({ canvas, app }) {
    this.canvas = canvas;
    this.app = app;
    this.on = false;
    this.cursor = el('div', { class: 'bot-cursor' });
    document.body.append(this.cursor);
    this.pos = { x: innerWidth * 0.5, y: innerHeight * 0.6 };
    this.task = null;
    this.down = false;
    this.nextViewer = 1;
  }

  toggle() {
    this.on = !this.on;
    this.cursor.classList.toggle('on', this.on);
    if (!this.on) this.release();
    this.task = null;
    this.app.onAutoplay();
  }

  fire(type, x, y) {
    this.canvas.dispatchEvent(new PointerEvent(type, { pointerId: PID, clientX: x, clientY: y, button: 0, buttons: type === 'pointerup' ? 0 : 1, bubbles: true, pointerType: 'mouse', isPrimary: true }));
  }

  release() {
    if (this.down) this.fire('pointerup', this.pos.x, this.pos.y);
    this.down = false;
  }

  /* 虚拟观众：照设置里的礼物表送礼（捣乱礼物多、保护礼物少），和真观众走同一条路；表都删空了就直接来一样捣乱 */
  viewer() {
    const app = this.app;
    const r = app.settings.rules;
    const who = pick(NAMES);
    const list = r.help.length && Math.random() < 0.12 ? r.help : r.mess;
    if (list.length) {
      app.live.simGift(pick(list).name, null, 1, who);
      return;
    }
    const def = pick(ACTIONS.filter(a => a.kind === 'mess'));
    for (const spec of qtySpecs(app.settings, def.id, defaultQty(def.id), who, 'sim', { uid: 'auto-' + who })) app.trigger(spec);
  }

  /* 挑一件最要紧的事做 */
  plan() {
    const g = this.app.game;
    const W = innerWidth;
    const H = innerHeight;
    for (const a of g.actors) {
      if (a.kind === 'projectile' && a.at && Math.random() < 0.7) return { kind: 'click', at: { ...a.at }, wait: 0.15 };
    }
    const animal = g.actors.find(a => (a.kind === 'bird' || a.kind === 'gecko' || a.kind === 'cat') && a.at && Math.random() < 0.5);
    if (animal) return { kind: 'click', at: { ...animal.at }, wait: 0.1 };
    /* 撕最上面那张小广告：多半顺着翘起的角往回揭，偶尔手滑横着拽（演示撕烂） */
    const flyer = [...g.actors].reverse().find(a => a.kind === 'flyer' && a.peelHint);
    if (flyer && Math.random() < 0.6) {
      const h = flyer.peelHint;
      const ok = Math.random() < 0.8;
      const dx = ok ? h.dx : -h.dy;
      const dy = ok ? h.dy : h.dx;
      const len = ok ? h.len * 1.1 : 200;
      return { kind: 'drag', path: [{ x: h.x, y: h.y }, { x: h.x + dx * len * 0.5, y: h.y + dy * len * 0.5 }, { x: h.x + dx * len, y: h.y + dy * len }] };
    }
    const film = g.actors.find(a => a.kind === 'film');
    if (film && Math.random() < 0.3) return { kind: 'drag', path: [{ x: W - 46, y: H - 46 }, { x: W * 0.4, y: H - 140 }] };
    const live = g.liveStains();
    if (live.length) {
      const s = live.reduce((a, b) => (b.w * b.h * b.remaining > a.w * a.h * a.remaining ? b : a));
      const rx = s.w * 0.32;
      const ry = s.h * 0.32;
      const path = [];
      const n = 4 + Math.floor(Math.random() * 3);
      for (let i = 0; i <= n; i++) path.push({ x: s.x - rx + (2 * rx * i) / n, y: s.y + (i % 2 ? ry : -ry) });
      for (const p of path) {
        p.x = Math.max(8, Math.min(W - 8, p.x));
        p.y = Math.max(8, Math.min(H - 8, p.y));
      }
      return { kind: 'drag', path };
    }
    return { kind: 'idle', at: { x: rand(0.15, 0.85) * W, y: rand(0.5, 0.9) * H }, wait: rand(0.6, 1.4) };
  }

  moveToward(target, dt, speed) {
    const dx = target.x - this.pos.x;
    const dy = target.y - this.pos.y;
    const d = Math.hypot(dx, dy);
    const step = Math.min(d, speed * dt);
    if (d > 0) {
      this.pos.x += (dx / d) * step;
      this.pos.y += (dy / d) * step;
    }
    this.fire('pointermove', this.pos.x, this.pos.y);
    return d - step < 1;
  }

  tick(dt) {
    if (!this.on) return;
    this.nextViewer -= dt;
    if (this.nextViewer <= 0) {
      this.nextViewer = rand(2.5, 5);
      this.viewer();
    }
    if (!this.task) this.task = this.plan();
    const t = this.task;
    if (t.kind === 'click' || t.kind === 'idle') {
      if (!t.arrived) t.arrived = this.moveToward(t.at, dt, 2200);
      else {
        if (t.kind === 'click' && !t.clicked) {
          this.fire('pointerdown', this.pos.x, this.pos.y);
          this.fire('pointerup', this.pos.x, this.pos.y);
          t.clicked = true;
        }
        t.wait -= dt;
        if (t.wait <= 0) this.task = null;
      }
    } else if (t.kind === 'drag') {
      t.i = t.i || 0;
      if (!this.down) {
        if (this.moveToward(t.path[0], dt, 2200)) {
          this.fire('pointerdown', this.pos.x, this.pos.y);
          this.down = true;
          t.i = 1;
        }
      } else if (this.moveToward(t.path[t.i], dt, 1500)) {
        t.i++;
        if (t.i >= t.path.length) {
          this.release();
          this.task = null;
        }
      }
    }
    this.cursor.style.transform = `translate(${this.pos.x}px,${this.pos.y}px)`;
  }
}
