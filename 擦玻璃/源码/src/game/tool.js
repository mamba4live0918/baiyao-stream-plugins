/* 刮水器：跟着指针走（有一点惯性），按住拖动时刮条自动转到和拖动方向垂直；
   不动 2.5 秒自己隐藏，不常驻在直播画面上。 */
import { createSprite } from '../glass/sprites.js';
import { LAYER } from '../glass/stage.js';
import { drawSqueegee, drawToolShadow } from '../art/props-art.js';
import { follow, bladeAngleFor, angleDiff, clamp } from '../util.js';

const HIDE_AFTER = 2.5;

export function createTool(stage) {
  let L = 0;
  let sprite = null;
  let shadow = null;
  const st = { x: stage.W / 2, y: stage.H / 2, tx: stage.W / 2, ty: stage.H / 2, angle: 0, vx: 0, vy: 0, pressed: false, lastMove: -10, alpha: 0, now: 0, hover: false };

  function build(len) {
    L = len;
    if (sprite) sprite.dispose();
    if (shadow) shadow.dispose();
    const res = Math.min(2, stage.dpr);
    const art = drawSqueegee(L, res);
    sprite = createSprite(stage, art.canvas, art.w, art.h, LAYER.TOOL);
    const sh = drawToolShadow(L, res);
    shadow = createSprite(stage, sh.canvas, sh.w, sh.h, LAYER.TOOL - 1);
  }

  return {
    get x() {
      return st.x;
    },
    get y() {
      return st.y;
    },
    get angle() {
      return st.angle;
    },
    get length() {
      return L;
    },
    get pressed() {
      return st.pressed;
    },
    get speed() {
      return Math.hypot(st.vx, st.vy);
    },
    get alphaHidden() {
      return st.alpha < 0.05;
    },
    /* 指到能点/能拖的东西上：先把刮水器藏起来，露出手形光标 */
    setHover(v) {
      st.hover = !!v;
    },
    setLength(len) {
      if (Math.abs(len - L) > 0.5) build(len);
    },
    setTarget(x, y, now) {
      st.tx = x;
      st.ty = y;
      st.lastMove = now;
    },
    /* 第一次出现时直接到位，不从屏幕中间飞过来 */
    jump(x, y) {
      st.x = st.tx = x;
      st.y = st.ty = y;
    },
    press(now) {
      st.pressed = true;
      st.lastMove = now;
    },
    release(now) {
      st.pressed = false;
      st.lastMove = now;
    },
    /* 两端点（刮条两头） */
    ends() {
      const c = Math.cos(st.angle) * L * 0.5;
      const s = Math.sin(st.angle) * L * 0.5;
      return [{ x: st.x - c, y: st.y - s }, { x: st.x + c, y: st.y + s }];
    },
    update(dt, now) {
      st.now = now;
      const px = st.x;
      const py = st.y;
      const k = follow(st.pressed ? 26 : 34, dt);
      st.x += (st.tx - st.x) * k;
      st.y += (st.ty - st.y) * k;
      const ivx = (st.x - px) / Math.max(dt, 1e-3);
      const ivy = (st.y - py) / Math.max(dt, 1e-3);
      const kv = follow(14, dt);
      st.vx += (ivx - st.vx) * kv;
      st.vy += (ivy - st.vy) * kv;
      const sp = Math.hypot(st.vx, st.vy);
      if (st.pressed && sp > 40 * stage.unit) {
        const target = bladeAngleFor(st.angle, st.vx, st.vy);
        st.angle += angleDiff(st.angle, target) * follow(16, dt);
      } else if (!st.pressed) {
        /* 悬空时慢慢回正（刮条水平、手柄朝上） */
        st.angle += angleDiff(st.angle, 0) * follow(2.2, dt);
      }
      const show = !st.hover && (st.pressed || now - st.lastMove < HIDE_AFTER);
      st.alpha = clamp(st.alpha + (show ? dt * 6 : -dt * 2.5), 0, 1);
      if (!sprite) return;
      const lean = clamp(-st.vx * 0.00012, -0.12, 0.12);
      const sc = st.pressed ? 0.97 : 1.02;
      sprite.set(st.x, st.y, st.angle + (st.pressed ? 0 : lean), sc, st.alpha);
      const off = st.pressed ? 7 : 20;
      shadow.set(st.x + off * stage.unit, st.y + off * 1.25 * stage.unit, st.angle, st.pressed ? 0.92 : 1.05, st.alpha * (st.pressed ? 0.75 : 0.45));
    }
  };
}
