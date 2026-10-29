/* 淘金 · 簸箕版 · 自动演示：一个虚拟鼠标替主播玩——端起簸箕左右晃、往前压着倒水，点石头、点小偷，要撞了就按住稳住；
   同时隔几秒随机来一个观众互动。走的是和真鼠标完全一样的事件，所以也是一个活的回归测试。 */
import { el } from './dom.js';
import { buildSpec } from '../tiers.js';
import { ACTIONS } from '../config.js';
import { BASKET_REST } from '../layout.js';
import { rnd } from '../util.js';

const SPEED = 1500; // 虚拟鼠标移动速度（像素/秒）
const PID = 77;

export class Autoplay {
  constructor({ canvas, w, game, toScreen, getSettings, onChange }) {
    this.canvas = canvas;
    this.w = w;
    this.game = game;
    this.toScreen = toScreen;
    this.getSettings = getSettings;
    this.onChange = onChange;
    this.on = false;
    this.pos = { x: innerWidth * 0.5, y: innerHeight * 0.7 };
    this.down = false;
    this.dt = 0;
    this.nextEvent = 0;
    this.cursor = el('div', { class: 'bot-cursor', 'aria-hidden': 'true' });
    document.body.append(this.cursor);
  }

  toggle() {
    this.on = !this.on;
    this.cursor.classList.toggle('on', this.on);
    this.w.input.setFilter(this.on ? e => !e.isTrusted : null);
    if (this.on) {
      this.brain = this.think();
      this.nextEvent = 0.5;
    } else {
      this.up();
      this.brain = null;
    }
    this.onChange();
  }

  fire(type) {
    const ev = new PointerEvent(type, { clientX: this.pos.x, clientY: this.pos.y, pointerId: PID, pointerType: 'mouse', isPrimary: true, button: 0, buttons: this.down ? 1 : 0, bubbles: true });
    this.canvas.dispatchEvent(ev);
  }

  press() {
    this.down = true;
    this.fire('pointerdown');
  }

  up() {
    if (!this.down) return;
    this.down = false;
    this.fire('pointerup');
  }

  tick(dt) {
    if (!this.on) return;
    this.dt = dt;
    this.nextEvent -= dt;
    if (this.nextEvent <= 0) {
      this.nextEvent = rnd(8, 12);
      this.randomEvent();
    }
    this.brain.next();
    this.cursor.style.transform = `translate(${this.pos.x.toFixed(1)}px, ${this.pos.y.toFixed(1)}px)`;
    this.cursor.classList.toggle('down', this.down);
  }

  randomEvent() {
    const s = this.getSettings();
    const enabled = ACTIONS.filter(a => s.actions[a.id].enabled);
    if (!enabled.length) return;
    const ore = enabled.find(a => a.id === 'ore');
    /* 簸箕里沙还多就少送矿，多来点捣乱；快淘完了就送矿 */
    const total = this.w.sim.total();
    const trolls = enabled.filter(a => a.id !== 'ore');
    const troll = trolls.length ? trolls[Math.floor(Math.random() * trolls.length)] : null;
    const wantOre = ore && (total < 0.03 || (total < 0.09 && Math.random() < 0.55));
    const def = wantOre ? ore : troll || ore;
    if (!def) return;
    const tiers = s.actions[def.id].tiers;
    const names = ['阿花', '小鱼干', '路过的星星', '今天也要加油', '大胃王', '一只柠檬精', '夜猫子'];
    this.game.trigger(buildSpec(s, def.id, tiers[Math.floor(Math.random() * tiers.length)].id, 1, names[Math.floor(Math.random() * names.length)], 'sim'));
  }

  /* ---------- 小动作 ---------- */
  *moveTo(get, tol = 6, speed = SPEED) {
    for (let k = 0; k < 400; k++) {
      const t = get();
      if (!t) return false;
      const dx = t.x - this.pos.x;
      const dy = t.y - this.pos.y;
      const d = Math.hypot(dx, dy);
      if (d <= tol) {
        this.fire('pointermove');
        return true;
      }
      const step = Math.min(d, speed * this.dt);
      this.pos.x += (dx / d) * step;
      this.pos.y += (dy / d) * step;
      this.fire('pointermove');
      yield;
    }
    return false;
  }

  *wait(sec) {
    let t = 0;
    while (t < sec) {
      t += this.dt;
      yield;
    }
  }

  thief() {
    return this.w.thieves.list.find(t => t.state === 'approach' || t.state === 'steal' || t.state === 'escape');
  }

  busy() {
    return !!this.thief() || this.w.nuggets.rocks().length > 0 || this.game.troubles.warning;
  }

  /* ---------- 大脑 ---------- */
  *think() {
    for (;;) {
      const th = this.thief();
      if (th) {
        this.up();
        const at = () => {
          if (!this.w.thieves.list.includes(th) || !['approach', 'steal', 'escape'].includes(th.state)) return null;
          const v = th.m.body.getWorldPosition(th.m.body.position.clone());
          return this.toScreen(v.x, v.y + 0.22, v.z);
        };
        if (!(yield* this.moveTo(at, 10))) continue;
        this.press();
        this.up();
        yield* this.wait(0.35);
        continue;
      }
      const rock = this.w.nuggets.rocks()[0];
      if (rock) {
        this.up();
        const at = () => {
          if (rock.state !== 'rest') return null;
          const v = rock.mesh.getWorldPosition(rock.mesh.position.clone());
          return this.toScreen(v.x, v.y, v.z);
        };
        if (yield* this.moveTo(at, 4)) {
          this.press();
          this.up();
        }
        yield* this.wait(0.3);
        continue;
      }
      if (this.game.troubles.warning) {
        /* 要撞了：按住不动 */
        if (!this.down) this.press();
        while (this.game.troubles.warning) yield;
        yield* this.wait(0.25);
        this.up();
        continue;
      }
      if (this.w.sim.total() > 0.003 || this.w.nuggets.list.some(it => it.kind !== 'rock' && it.state === 'rest')) {
        yield* this.pan(rnd(2.5, 4));
        continue;
      }
      this.up();
      yield* this.wait(0.3);
    }
  }

  /* 端起簸箕：左右晃、往下压一点，碰到要紧事就停 */
  *pan(sec) {
    const c = this.toScreen(BASKET_REST.x, BASKET_REST.y + 0.2, BASKET_REST.z);
    if (!(yield* this.moveTo(() => c, 8))) return;
    this.press();
    const amp = rnd(40, 62);
    const freq = rnd(1.1, 1.4);
    const tilt = rnd(45, 80);
    let t = 0;
    while (t < sec && !this.busy()) {
      t += this.dt;
      this.pos.x = c.x + Math.sin(t * Math.PI * 2 * freq) * amp;
      this.pos.y = c.y + Math.min(1, t / 0.6) * tilt;
      this.fire('pointermove');
      yield;
    }
    this.up();
    yield* this.wait(0.15);
  }
}
