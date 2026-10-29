/* 跟着角色走的小字牌（准星上的「@小明 的鸡蛋」、机器人背上的名字、保护膜的「挡下 N 次」）。全部 textContent。 */
export function createLabels(root) {
  return {
    add(text, cls = '') {
      const el = document.createElement('div');
      el.className = 'gl-label ' + cls;
      el.textContent = text;
      root.append(el);
      return {
        el,
        set(x, y, alpha = 1) {
          el.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) translate(-50%,-50%)`;
          el.style.opacity = String(alpha);
        },
        text(t) {
          if (el.textContent !== t) el.textContent = t;
        },
        remove() {
          el.classList.add('out');
          setTimeout(() => el.remove(), 250);
        }
      };
    }
  };
}
