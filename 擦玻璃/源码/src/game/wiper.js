/* 指针路由：按下时先问世界"点到了什么"——
   小动物/准星（点一下就处理）→ 小广告/保护膜（拖动撕）→ 都不是就开始刮。
   刮的时候每帧沿刮水器（平滑后的）移动轨迹擦一段，所以看到刮条走到哪里就干净到哪里。 */
import { clamp, passTracker } from '../util.js';

export function createWiper({ canvas, stage, tool, game, water, particles, audio, getBlade, isBlocked }) {
  let mode = 'idle';
  let pointerId = null;
  let drag = null;
  let stroke = 0;
  let seed = 1;
  let last = null;
  let strokeLen = 0;
  let now = 0;
  let lastSpray = 0;
  let beadAcc = 0;
  const passes = passTracker();
  const pointOf = e => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  function end() {
    if (mode === 'drag' && drag) drag.release(tool.x, tool.y);
    canvas.classList.remove('grabbing');
    tool.setHover(false);
    if (mode === 'wipe' && strokeLen > 60 * stage.unit) {
      /* 抬手：刮条两头各留一两颗水珠，慢慢往下滑 */
      for (const p of tool.ends()) if (Math.random() < 0.8) particles.bead(p.x, p.y, 7 + Math.random() * 5);
    }
    mode = 'idle';
    drag = null;
    last = null;
    pointerId = null;
    tool.release(now);
    audio.wipeEnd();
  }

  canvas.addEventListener('pointerdown', e => {
    if (e.button !== 0 || pointerId !== null || isBlocked()) return;
    e.preventDefault();
    const p = pointOf(e);
    if (tool.alphaHidden) tool.jump(p.x, p.y);
    tool.setTarget(p.x, p.y, now);
    const hit = game.hitTest(p.x, p.y);
    if (hit && hit.click) {
      hit.click(p.x, p.y);
      return;
    }
    pointerId = e.pointerId;
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch (err) {
      /* 捕获失败也能玩，只是拖出窗口会丢 */
    }
    if (hit && hit.grab) {
      mode = 'drag';
      drag = hit;
      canvas.classList.add('grabbing');
      tool.setHover(true);
      hit.grab(p.x, p.y);
      return;
    }
    mode = 'wipe';
    stroke++;
    passes.reset();
    seed = (Math.random() * 1e9) | 0;
    strokeLen = 0;
    last = null;
    tool.press(now);
    game.noteStroke();
  });
  canvas.addEventListener('pointermove', e => {
    if (pointerId !== null && e.pointerId !== pointerId) return;
    const p = pointOf(e);
    tool.setTarget(p.x, p.y, now);
    if (mode === 'drag' && drag) drag.move(p.x, p.y);
    if (mode === 'idle') game.hover(p.x, p.y);
  });
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    canvas.addEventListener(name, e => {
      if (pointerId !== null && e.pointerId !== pointerId) return;
      if (pointerId !== null || mode !== 'idle') end();
    });
  }
  addEventListener('blur', () => {
    if (mode !== 'idle') end();
  });

  return {
    get mode() {
      return mode;
    },
    cancel() {
      if (mode !== 'idle') end();
    },
    update(dt, t) {
      now = t;
      if (mode !== 'wipe') return;
      const cur = { x: tool.x, y: tool.y };
      if (!last) {
        last = cur;
        return;
      }
      const d = Math.hypot(cur.x - last.x, cur.y - last.y);
      if (d < 0.75) return;
      const L = getBlade();
      const before = passes.id;
      const pass = passes.next(cur.x - last.x, cur.y - last.y);
      /* 回头刮 = 新的一遍：换一组刮痕位置 */
      if (pass !== before) seed = (Math.random() * 1e9) | 0;
      const touched = game.wipe([last, cur], L, 1, seed, null, pass);
      strokeLen += d;
      water.add(cur.x, cur.y, tool.angle, L / 2, stroke, t);
      const speed = tool.speed / stage.unit;
      audio.wipe(clamp(speed / 1400, 0, 1), touched > 0);
      /* 刮过脏东西：刮条两头留下一颗颗挂着的水珠（走走停停往下滑） */
      if (touched) {
        beadAcc += d;
        if (beadAcc > 46 * stage.unit) {
          beadAcc = 0;
          const e = tool.ends()[Math.random() < 0.5 ? 0 : 1];
          if (!game.inZone(e.x, e.y, 8 * stage.unit)) particles.bead(e.x, e.y, 6 + Math.random() * 5);
        }
      }
      /* 快速刮过脏东西：刮条两头甩出水珠 */
      if (touched && speed > 500 && t - lastSpray > 0.05) {
        lastSpray = t;
        const ends = tool.ends();
        const dx = (cur.x - last.x) / d;
        const dy = (cur.y - last.y) / d;
        const e = ends[Math.random() < 0.5 ? 0 : 1];
        particles.spray(e.x, e.y, dx, dy, 2, 260 + speed * 0.2);
      }
      last = cur;
    }
  };
}
