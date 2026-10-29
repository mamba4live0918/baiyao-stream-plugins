/* 名字标签：挂在脏东西旁边的「@小明」小牌子（多的写 ×N）。只给最新的 MAX_SHOWN 块显示，免得满屏都是字。
   全部用 textContent，观众昵称不进 HTML。 */
import { hitsZone } from '../zone.js';

const MAX_SHOWN = 8;

export function createNames(stage, root) {
  const tags = new Map();
  let enabled = true;

  function label(s) {
    const n = s.owner && s.owner.name ? s.owner.name : '';
    const extra = s.extra > 0 ? ` ×${s.extra + 1}` : '';
    return `@${n}${extra}`;
  }

  return {
    setEnabled(v) {
      enabled = v;
      root.hidden = !v;
    },
    attach(s) {
      if (tags.has(s) || !s.owner || !s.owner.name) return;
      const el = document.createElement('div');
      el.className = 'gl-tag' + (s.owner.help ? ' help' : '');
      el.textContent = label(s);
      root.append(el);
      tags.set(s, { el, text: el.textContent, born: s.born ?? 0 });
    },
    /* 观众超出同时上限时，把多出来的记在他最新那块的牌子上 */
    bump(s) {
      s.extra = (s.extra || 0) + 1;
      const t = tags.get(s);
      if (t) {
        t.text = label(s);
        t.el.textContent = t.text;
        t.el.classList.remove('bump');
        void t.el.offsetWidth;
        t.el.classList.add('bump');
      }
    },
    detach(s) {
      const t = tags.get(s);
      if (!t) return;
      t.el.classList.add('out');
      setTimeout(() => t.el.remove(), 260);
      tags.delete(s);
    },
    update(stains) {
      if (!enabled || !tags.size) return;
      const list = [...tags.keys()].sort((a, b) => (b.born ?? 0) - (a.born ?? 0));
      list.forEach((s, i) => {
        const t = tags.get(s);
        const x = Math.min(stage.W - 60 * stage.unit, Math.max(10 * stage.unit, s.x - s.w * 0.18));
        const y = Math.min(stage.H - 30 * stage.unit, Math.max(8 * stage.unit, s.y - s.h * 0.3));
        /* 牌子会压到露脸区就先不显示（脸永远干干净净） */
        const inFace = hitsZone(stage.zone, x + 50 * stage.unit, y + 14 * stage.unit, 60 * stage.unit);
        const show = i < MAX_SHOWN && s.state === 'live' && !inFace;
        t.el.style.opacity = show ? String(Math.max(0.55, 1 - i * 0.06) * (s.extFade ?? 1)) : '0';
        if (!show) return;
        t.el.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`;
      });
    },
    clear() {
      for (const t of tags.values()) t.el.remove();
      tags.clear();
    }
  };
}
