// 排队的南瓜：沿底边一个挨一个（离工作台最近的是下一个），新来的从上面掉下来弹一下；
// 放不下时最后一格换成「+N」。弹幕重复点单的人，他的南瓜跳一下。
import { renderLantern } from './lantern-art.js';
import { queueSlot } from './layout.js';
import { clamp } from './tween.js';

export function createQueueView(world) {
  const { game } = world;
  const view = new Map();
  let L = null;

  const sprite = (o, size) => world.sprite('q|' + o.id + '|' + o.redo + '|' + Math.round(size * world.dpr()), () => renderLantern({ name: o.nick, redo: o.redo }, size * world.dpr()));

  function visible() {
    const q = game.state.queue, n = L.queue.n;
    return q.length <= n ? { list: q, more: 0 } : { list: q.slice(0, n - 1), more: q.length - (n - 1) };
  }

  function update(t, dt) {
    if (!L) return false;
    const { list } = visible();
    let moving = false;
    const alive = new Set();
    list.forEach((o, i) => {
      const slot = queueSlot(L, i);
      let v = view.get(o.id);
      if (!v) { v = { x: slot.x, born: t, jump: -9 }; view.set(o.id, v); }
      alive.add(o.id);
      const d = slot.x - v.x;
      if (Math.abs(d) > 0.5) { v.x += d * Math.min(1, dt * 9); moving = true; } else v.x = slot.x;
      if (t - v.born < 0.6 || t - v.jump < 0.6) moving = true;
    });
    for (const id of view.keys()) if (!alive.has(id)) view.delete(id);
    return moving;
  }

  function draw(g, t) {
    if (!L) return;
    const { list, more } = visible(), size = L.queue.size;
    for (let i = list.length - 1; i >= 0; i--) {
      const o = list[i], v = view.get(o.id);
      if (!v) continue;
      const born = clamp((t - v.born) / 0.55, 0, 1);
      const drop = born < 1 ? -((1 - born) ** 2) * size * 0.9 : 0;
      const hop = t - v.jump < 0.5 ? -Math.sin(((t - v.jump) / 0.5) * Math.PI) * size * 0.35 : 0;
      const land = born < 1 && born > 0.7 ? Math.sin((born - 0.7) / 0.3 * Math.PI) * 0.12 : 0;
      g.save();
      g.globalAlpha = Math.min(1, born * 3);
      g.translate(v.x, L.queue.y + size * 0.93 + drop + hop);
      g.scale(1 + land, 1 - land);
      g.drawImage(sprite(o, size), -size / 2, -size * 0.93, size, size);
      g.restore();
    }
    if (more > 0) {
      const slot = queueSlot(L, list.length), r = size * 0.3, y = L.queue.y + size * 0.6;
      g.save();
      g.fillStyle = '#FFF1D8'; g.strokeStyle = '#6E3A1C'; g.lineWidth = Math.max(2, r * 0.1);
      g.beginPath(); g.arc(slot.x, y, r, 0, Math.PI * 2); g.fill(); g.stroke();
      g.font = `900 ${Math.round(r * (more > 999 ? 0.5 : 0.7))}px "Microsoft YaHei",sans-serif`;
      g.fillStyle = '#5A2A12'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('+' + more, slot.x, y + r * 0.04);
      g.restore();
    }
  }

  function nudge(uid, t) {
    for (const o of game.state.queue) if (o.uid === uid) { const v = view.get(o.id); if (v) v.jump = t; }
  }

  return { update, draw, nudge, relayout: next => { L = next; } };
}
