/* 淘金 3D · 设置面板：右上角齿轮或双击空白处打开，Esc 或点面板外关闭。改动立刻生效并保存 */
import { el, numInput } from './dom.js';
import { defaultSettings } from '../config.js';
import { actionsPage, rulesPage } from './pages.js';

const PAGES = [
  ['play', '玩法'],
  ['actions', '互动档位'],
  ['rules', '接入规则'],
  ['look', '外观声音'],
  ['save', '存档']
];
const clone = x => JSON.parse(JSON.stringify(x));
const fmt = g => g.toFixed(2) + ' 克';

export class SettingsUI {
  constructor(app) {
    this.app = app;
    this.page = 'play';
    this.openAction = 'ore';
    this.root = el('section', { id: 'tj-settings', class: 'tj-hidden', role: 'dialog', 'aria-label': '淘金设置' });
    this.root.addEventListener('dblclick', e => e.stopPropagation());
    document.body.append(this.root);
    addEventListener('keydown', e => {
      if (e.code === 'Escape' && this.isOpen) this.close();
    });
    document.addEventListener('pointerdown', e => {
      if (!e.isTrusted) return;
      if (this.isOpen && !this.root.contains(e.target) && !e.target.closest('#tj-demo,#tj-gear')) this.close();
    });
    app.onSettings(() => {
      if (this.isOpen && !this.root.contains(document.activeElement)) this.render();
    });
  }

  get isOpen() {
    return !this.root.classList.contains('tj-hidden');
  }

  open() {
    this.root.classList.remove('tj-hidden');
    this.render();
  }

  close() {
    this.root.classList.add('tj-hidden');
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
    const keep = this.root.scrollTop;
    const body = { play: this.playPage, actions: actionsPage, rules: rulesPage, look: this.lookPage, save: this.savePage }[this.page];
    this.root.replaceChildren(
      el('button', { class: 'tj-x', 'aria-label': '关闭设置', text: '×', onclick: () => this.close() }),
      el('h2', { text: '淘金 · 设置' }),
      el('div', { class: 'tj-tabs' }, PAGES.map(([id, name]) =>
        el('button', { class: id === this.page ? 'on' : '', text: name, onclick: () => { this.page = id; this.render(); } }))),
      body.call(this)
    );
    this.root.scrollTop = keep;
  }

  field(label, control, hint) {
    return el('label', { class: 'tj-field' }, el('span', { text: label }), control, hint ? el('em', { text: hint }) : null);
  }

  num(label, value, spec, apply) {
    return this.field(label, numInput(value, { ...spec, label }, n => this.edit(s => apply(s, n))), spec.unit);
  }

  check(label, value, apply) {
    return this.field(label, el('input', { type: 'checkbox', checked: value, onchange: e => this.edit(s => apply(s, e.target.checked), false) }));
  }

  playPage() {
    const s = this.app.settings;
    const g = this.app.game;
    return el('div', {},
      el('h3', { text: '怎么玩' }),
      el('ul', { class: 'tj-how' },
        el('li', { text: '观众送礼物 = 送来一袋矿砂：麻袋带着名字掉进簸箕炸开，金子沉在沙底。' }),
        el('li', { text: '按住画面任意地方 = 端起簸箕：左右拖是晃，往下拖是把前口压低往外倒水。沙子会跟着水从前口冲出去。' }),
        el('li', { text: '金子露出来洗干净了，会自己飞到右边的“淘到”数字牌里，记在送矿的观众名下。' }),
        el('li', { text: '力度条在绿区最好；晃得太猛进了红区，露出来的金子会被甩出去。' }),
        el('li', { text: '石头：点它扔出去。泥水：水浑了金子收不上来，多晃一会儿就清了。撞簸箕：听到提示就按住簸箕稳住。小偷爬上簸箕偷金子：点它，或者使劲晃把它甩下去（太猛金子也会甩出去）。' })),
      el('h3', { text: '难度' }),
      this.check('太猛会把金子甩出去', s.play.spill, (x, v) => ((x.play.spill = v), x)),
      el('p', { class: 'tj-note', text: '关掉后怎么晃都不会丢金子（撞簸箕没稳住还是会甩出去）。' }),
      el('h3', { text: '这一盘' }),
      el('p', { class: 'tj-note', text: `簸箕里：${g.w.nuggets.list.length} 块金子和石头 · 排队中 ${g.director.size} 条互动` }),
      el('div', { class: 'tj-row' },
        el('button', { text: '清空簸箕（淘到的金子保留）', onclick: () => { if (confirm('清空簸箕里的沙和所有东西？还在排队的互动和正在往下掉的矿袋也会清掉。淘到的金子不受影响。')) { g.clearBasket(); this.render(); } } }),
        el('button', { text: '打开试玩面板', onclick: () => { this.app.showDemo(); this.close(); } }))
    );
  }

  lookPage() {
    const s = this.app.settings;
    const sel = (value, opts, apply) => el('select', { onchange: e => this.edit(x => apply(x, e.target.value), false) },
      opts.map(([v, t]) => el('option', { value: v, text: t, selected: value === v })));
    const vol = el('input', { type: 'range', min: 0, max: 100, value: String(Math.round(s.audio.volume * 100)), 'aria-label': '音量' });
    vol.addEventListener('input', () => this.edit(x => ((x.audio.volume = Number(vol.value) / 100), x), false));
    const f = s.display.frame;
    return el('div', {},
      el('h3', { text: '画面' }),
      this.field('画质', sel(s.display.quality, [['high', '精致'], ['medium', '均衡'], ['low', '省电']], (x, v) => ((x.display.quality = v), x)), '电脑吃力时调低：降低清晰度和阴影精度，玩法不变'),
      this.field('装饰动画', sel(s.display.motion, [['on', '开启'], ['system', '跟随系统'], ['off', '关闭']], (x, v) => ((x.display.motion = v), x)), '关闭后不再镜头抖动；明确选“开启”时不受系统“减少动画”影响'),
      this.num('镜头远近', s.display.zoom, { min: 50, max: 220, step: 5, unit: '%' }, (x, n) => ((x.display.zoom = n), x)),
      el('h3', { text: '取景框（簸箕放在窗口的哪一块，百分比）' }),
      this.num('左边', f.x, { min: -20, max: 80, step: 1, unit: '%' }, (x, n) => ((x.display.frame.x = n), x)),
      this.num('上边', f.y, { min: -20, max: 90, step: 1, unit: '%' }, (x, n) => ((x.display.frame.y = n), x)),
      this.num('宽', f.w, { min: 20, max: 140, step: 1, unit: '%' }, (x, n) => ((x.display.frame.w = n), x)),
      this.num('高', f.h, { min: 15, max: 140, step: 1, unit: '%' }, (x, n) => ((x.display.frame.h = n), x)),
      el('div', { class: 'tj-row' }, el('button', { text: '取景复位', onclick: () => this.edit(x => ((x.display.frame = clone(defaultSettings().display.frame)), (x.display.zoom = 100), x)) })),
      el('h3', { text: '文字' }),
      this.check('显示矿主榜 / 大盗榜', s.display.showBoard, (x, v) => ((x.display.showBoard = v), x)),
      this.check('显示操作提示', s.display.showHint, (x, v) => ((x.display.showHint = v), x)),
      el('h3', { text: '声音' }),
      this.check('开启音效', s.audio.enabled, (x, v) => ((x.audio.enabled = v), x)),
      this.field('音量', vol)
    );
  }

  savePage() {
    const g = this.app.game;
    const e = g.eco;
    const st = g.stats;
    const rows = [
      ['淘到的金子', fmt(e.gold)],
      ['淘出来的金子', e.pieces + ' 块'],
      ['单块最大', fmt(e.best)],
      ['本次直播：拆开的矿袋', st.sacks + ' 袋'],
      ['本次直播：观众捣乱', st.trolls + ' 次'],
      ['本次直播：被偷走 / 追回', fmt(st.stolen) + ' / ' + fmt(st.recovered)],
      ['本次直播：甩出去的金子', st.flung + ' 块（' + fmt(st.lostGold) + '）'],
      ['本次直播：稳住撞击', st.braced + ' 次']
    ];
    return el('div', {},
      el('h3', { text: '淘到的金子' }),
      el('dl', { class: 'tj-stats' }, rows.map(([k, v]) => [el('dt', { text: k }), el('dd', { text: v })])),
      el('p', { class: 'tj-note', text: '淘到的金子、矿主榜和大盗榜自动保存在当前浏览器/宿主里；簸箕里还没淘出来的金子不保存。换一个浏览器来源不会带过去。试玩面板和自动演示送来的金子照常计数，但不进榜单。' }),
      el('div', { class: 'tj-row' },
        el('button', { text: '清空金子和榜单', onclick: () => { if (confirm('清空淘到的金子、矿主榜和大盗榜？簸箕不受影响。')) { g.resetVault(); this.render(); } } }),
        el('button', { text: '恢复默认设置', onclick: () => { if (confirm('所有设置恢复出厂值？淘到的金子不受影响。')) { this.app.applySettings(defaultSettings()); this.render(); } } }))
    );
  }
}
