/* 擦玻璃 · 设置面板：右上角齿轮或按 S 打开，Esc 或点面板外关闭。改动立刻生效并保存。
   只有一页，从上往下：接收直播间的礼物、① 捣乱池 ② 捣乱礼物 ③ 保护礼物 ④ 你的脸 ⑤ 声音，几个按钮；其余收在"高级设置"里（默认收起）。 */
import { el, numInput } from './dom.js';
import { defaultSettings } from '../config.js';
import { ZONE_PRESETS, presetPts } from '../zone.js';
import { poolSection, messSection, helpSection, advancedSection } from './pages.js';

const clone = x => JSON.parse(JSON.stringify(x));

export class SettingsUI {
  constructor(app) {
    this.app = app;
    this.advOpen = false;
    this.focusNewGift = false;
    this.root = el('section', { id: 'gl-settings', class: 'gl-hidden', role: 'dialog', 'aria-label': '擦玻璃设置' });
    document.body.append(this.root);
    addEventListener('keydown', e => {
      if (e.code === 'Escape' && this.isOpen && !app.zoneEditing()) this.close();
    });
    document.addEventListener('pointerdown', e => {
      if (!e.isTrusted) return;
      if (this.isOpen && !this.root.contains(e.target) && !e.target.closest('#gl-demo,#gl-gear,#gl-zone')) this.close();
    });
    app.onSettings(() => {
      if (this.isOpen && !this.root.contains(document.activeElement)) this.render();
    });
    /* 贴纸读完、上传完、删了：缩略图跟着变。正往输入框里打字时先不重画（打了一半的字会被冲掉），离开输入框再画 */
    app.onStickers(() => {
      if (!this.isOpen) return;
      if (this.typing()) this.stale = true;
      else this.render();
    });
    this.root.addEventListener('focusout', () => {
      setTimeout(() => {
        if (this.stale && this.isOpen && !this.typing()) this.render();
      }, 0);
    });
  }

  get isOpen() {
    return !this.root.classList.contains('gl-hidden');
  }

  /* 光标在面板里的输入框上（打字、填数字） */
  typing() {
    const a = document.activeElement;
    if (!a || !this.root.contains(a)) return false;
    return a.tagName === 'TEXTAREA' || a.tagName === 'SELECT' || (a.tagName === 'INPUT' && !['checkbox', 'radio', 'file', 'button', 'range'].includes(a.type));
  }

  open() {
    this.root.classList.remove('gl-hidden');
    this.render();
  }

  close() {
    this.root.classList.add('gl-hidden');
  }

  toggle() {
    if (this.isOpen) this.close();
    else this.open();
  }

  /* 改设置的唯一入口：复制 → 修改 → 校验 → 应用 → 重画 */
  edit(mutate, rerender = true) {
    this.app.applySettings(mutate(clone(this.app.settings)));
    if (rerender) this.render();
  }

  render() {
    this.stale = false;
    const keep = this.root.scrollTop;
    this.root.replaceChildren(
      el('button', { class: 'gl-x', 'aria-label': '关闭设置', text: '×', onclick: () => this.close() }),
      el('h2', { text: '擦玻璃 · 设置' }),
      el('p', { class: 'gl-lead', text: '改了马上生效，自动保存。' }),
      poolSection(this),
      messSection(this),
      helpSection(this),
      this.faceSection(),
      this.soundSection(),
      el('div', { class: 'gl-row gl-tools' },
        el('button', { text: '清空玻璃', onclick: () => { if (confirm('把玻璃上的脏东西、小广告和排队中的互动都清掉？')) { this.app.clearGlass(); this.render(); } } }),
        el('button', { text: '打开试玩面板', onclick: () => { this.app.showDemo(); this.close(); } }),
        el('button', { text: '恢复默认设置', onclick: () => { if (confirm('所有设置恢复成刚装上时的样子？统计不受影响。')) { this.app.applySettings(defaultSettings()); this.render(); } } })),
      advancedSection(this)
    );
    this.root.scrollTop = keep;
    /* 刚点了"添加一个礼物"：光标放到那张表新的一行，直接打礼物名 */
    if (this.focusNewGift) {
      const list = this.focusNewGift;
      this.focusNewGift = false;
      const inputs = this.root.querySelectorAll(`.gl-${list}:not(.gl-gift-head) input[list]`);
      const last = inputs[inputs.length - 1];
      if (last) {
        last.focus();
        last.select();
      }
    }
  }

  field(label, control, hint) {
    return el('label', { class: 'gl-field' }, el('span', { text: label }), control, hint ? el('em', { text: hint }) : null);
  }

  num(label, value, spec, apply) {
    return this.field(label, numInput(value, { ...spec, label }, n => this.edit(s => apply(s, n))), spec.unit);
  }

  check(label, value, apply) {
    return this.field(label, el('input', { type: 'checkbox', checked: value, onchange: e => this.edit(s => apply(s, e.target.checked), false) }));
  }

  /* 一个开关一句话：勾上 = 开 */
  switchRow(label, value, apply, hint) {
    return el('label', { class: 'gl-switch' },
      el('input', { type: 'checkbox', checked: value, onchange: e => this.edit(s => apply(s, e.target.checked), false) }),
      el('span', {}, el('b', { text: label }), hint ? el('em', { text: hint }) : null));
  }

  slider(label, value, apply, hint) {
    const r = el('input', { type: 'range', min: 0, max: 100, value: String(Math.round(value * 100)), 'aria-label': label });
    r.addEventListener('input', () => this.edit(x => apply(x, Number(r.value) / 100), false));
    return this.field(label, r, hint);
  }

  faceSection() {
    return el('section', { class: 'gl-sec' },
      el('h3', { text: '④ 你的脸' }),
      el('p', { class: 'gl-say', text: '框住的地方永远不会被挡住，四周可以被糊满。框是多边形：拖圆点改形状，沿着脸一圈点下去就能重新画。' }),
      el('div', { class: 'gl-row' },
        el('button', { class: 'gl-main', text: '在画面上框住我的脸', onclick: () => { this.close(); this.app.editZone(); } }),
        ...ZONE_PRESETS.map(([name, kind]) => el('button', { text: name, onclick: () => this.edit(x => ((x.display.zone = { ...x.display.zone, pts: presetPts(kind, x.display.zone.pts, innerWidth / innerHeight), enabled: true, auto: false }), x)) })))
    );
  }

  soundSection() {
    const a = this.app.settings.audio;
    return el('section', { class: 'gl-sec' },
      el('h3', { text: '⑤ 声音' }),
      this.switchRow('音效', a.enabled, (x, v) => ((x.audio.enabled = v), x)),
      this.slider('音量', a.volume, (x, v) => ((x.audio.volume = v), x))
    );
  }
}

export { numInput };
