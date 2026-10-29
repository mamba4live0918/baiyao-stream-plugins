/* 淘金 · 簸箕版 · 簸箕怎么动（纯逻辑）：鼠标给目标位置和前倾，簸箕像被手端着一样弹簧跟随；
   左右晃的时候会顺势侧倾（水跟着来回荡）。晃动强度 A 由横移速度和侧倾速度算出来，起得快、落得慢，方便看力度条。 */
import { SWAY } from './layout.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export class Motion {
  constructor(restPitch = 0.08) {
    this.rest = restPitch;
    this.x = 0;
    this.pitch = restPitch;
    this.roll = 0;
    this.vx = 0;
    this.vp = 0;
    this.vr = 0;
    this.tx = 0;
    this.tp = restPitch;
    this.A = 0;
    this.held = false;
    this.t = 0;
  }

  grab() {
    this.held = true;
  }

  release() {
    this.held = false;
    this.tx = 0;
    this.tp = this.rest;
  }

  /* 目标：横向位置（米）、前倾（弧度） */
  aim(x, pitch) {
    this.tx = clamp(x, -SWAY.x, SWAY.x);
    this.tp = clamp(pitch, SWAY.pitchMin, SWAY.pitchMax);
  }

  /* 被撞了一下：直接加速度 */
  kick(roll, pitch, x = 0) {
    this.vr += roll;
    this.vp += pitch;
    this.vx += x;
  }

  update(dt) {
    this.t += dt;
    /* 横移：硬一点的弹簧，跟手 */
    const ax = 170 * (this.tx - this.x) - 15 * this.vx;
    this.vx += ax * dt;
    this.x += this.vx * dt;
    /* 前倾 */
    const ap = 95 * (this.tp - this.pitch) - 12 * this.vp;
    this.vp += ap * dt;
    this.pitch = clamp(this.pitch + this.vp * dt, SWAY.pitchMin - 0.08, SWAY.pitchMax + 0.1);
    /* 侧倾：顺着横移方向倾，弹性大一点，看着像水在晃 */
    const idle = this.held ? 0 : Math.sin(this.t * 1.3) * 0.012;
    const tr = clamp(-this.vx * 0.1, -0.28, 0.28) + idle;
    const ar = 75 * (tr - this.roll) - 7 * this.vr;
    this.vr += ar * dt;
    this.roll = clamp(this.roll + this.vr * dt, -0.45, 0.45);
    /* 晃动强度：起得快、落得慢 */
    const raw = Math.abs(this.vx) / 4.5 + Math.abs(this.vr) / 18;
    const tau = raw > this.A ? 0.07 : 0.4;
    this.A += (raw - this.A) * (1 - Math.exp(-dt / tau));
    return this;
  }
}

/* 力度分档：给力度条和提示用 */
export const ZONES = Object.freeze({ soft: 0.3, good: 0.95 });
export function zoneOf(A) {
  if (A < 0.05) return 'idle';
  if (A < ZONES.soft) return 'soft';
  if (A <= ZONES.good) return 'good';
  return 'hard';
}
