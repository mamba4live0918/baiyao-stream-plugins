/* 画面上的文字：左下滚动提示（最多 3 条，4 秒淡出）、右上「今天擦掉 N 处」、首次操作提示。
   全部 textContent。 */
import { fmtCount } from '../util.js';

const TOAST_LIFE = 4200;
const TOAST_MAX = 3;

export function createHud(root) {
  const ticker = root.querySelector('#gl-ticker');
  const counter = root.querySelector('#gl-counter');
  const counterNum = root.querySelector('#gl-counter b');
  const hint = root.querySelector('#gl-hint');
  const boardsEl = root.querySelector('#gl-boards');
  const booms = root.querySelector('#gl-booms');
  let shownCount = -1;
  let boardsKey = '';

  function toast(text, kind = 'mess') {
    const el = document.createElement('div');
    el.className = 'gl-toast ' + kind;
    el.textContent = text;
    ticker.append(el);
    while (ticker.children.length > TOAST_MAX) ticker.firstElementChild.remove();
    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 400);
    }, TOAST_LIFE);
  }

  return {
    toast,
    cleaned(s, helper, combo) {
      const who = s.owner && s.owner.name ? `@${s.owner.name} 的` : '';
      const what = s.label || '脏东西';
      if (helper) toast(`@${helper.name} 的机器人擦掉了 ${who}${what}`, 'help');
      else if (who) toast(`擦掉了 ${who}${what}${combo >= 2 ? `  连擦 ×${combo + 1}` : ''}`, 'clean');
    },
    setCounter(n, visible) {
      counter.hidden = !visible;
      if (n === shownCount) return;
      shownCount = n;
      counterNum.textContent = fmtCount(n);
      counter.classList.remove('pulse');
      void counter.offsetWidth;
      counter.classList.add('pulse');
    },
    /* 捣乱榜 / 帮忙榜（左上，默认关） */
    setBoards(b, visible) {
      boardsEl.hidden = !visible;
      if (!visible) return;
      const key = JSON.stringify(b);
      if (key === boardsKey) return;
      boardsKey = key;
      const box = (title, rows, cls) => {
        const d = document.createElement('div');
        d.className = 'gl-board ' + cls;
        const h = document.createElement('h4');
        h.textContent = title;
        d.append(h);
        if (!rows.length) {
          const p = document.createElement('p');
          p.textContent = '还没有人';
          d.append(p);
        }
        rows.forEach(([name, n], i) => {
          const r = document.createElement('div');
          r.className = 'row';
          const a = document.createElement('span');
          a.textContent = `${i + 1}. ${name}`;
          const c = document.createElement('b');
          c.textContent = String(n);
          r.append(a, c);
          d.append(r);
        });
        return d;
      };
      boardsEl.replaceChildren(box('今日捣乱榜', b.mess, 'mess'), box('今日帮忙榜', b.help, 'help'));
    },
    /* 落点蹦一个漫画拟声字（啪叽！哗啦！）：弹出来再往上飘走 */
    boom(text, x, y, strength = 1) {
      const el = document.createElement('div');
      el.className = 'gl-boom';
      el.textContent = text;
      const k = Math.max(0.8, Math.min(1.8, 0.75 + strength * 0.45));
      el.style.left = x.toFixed(0) + 'px';
      el.style.top = y.toFixed(0) + 'px';
      el.style.setProperty('--k', k.toFixed(2));
      el.style.setProperty('--r', ((Math.random() - 0.5) * 24).toFixed(1) + 'deg');
      booms.append(el);
      while (booms.children.length > 6) booms.firstElementChild.remove();
      setTimeout(() => el.remove(), 900);
    },
    hideHint() {
      if (hint) hint.classList.add('out');
    },
    showHint(v) {
      if (hint) hint.hidden = !v;
    }
  };
}
