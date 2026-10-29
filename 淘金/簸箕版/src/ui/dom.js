/* 淘金 3D · 极简 DOM 助手：所有文字走 textContent，观众昵称之类绝不拼进 HTML */
const PROPS = new Set(['value', 'checked', 'selected', 'disabled', 'hidden']);

export function el(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else if (PROPS.has(k)) e[k] = v;
      else e.setAttribute(k, v === true ? '' : v);
    }
  }
  for (const kid of kids.flat(3)) {
    if (kid === undefined || kid === null || kid === false) continue;
    e.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return e;
}

/* 数字输入：失焦/回车才提交；无效输入直接丢弃并让界面回显原值 */
export function numInput(value, spec, onCommit) {
  const input = el('input', { type: 'number', min: spec.min, max: spec.max, step: spec.step || 1, value: String(value) });
  if (spec.label) input.setAttribute('aria-label', spec.label);
  input.addEventListener('change', () => {
    const n = Number(input.value);
    if (input.value.trim() === '' || !Number.isFinite(n)) {
      input.value = String(value);
      return;
    }
    onCommit(n);
  });
  return input;
}
