/* 淘金 3D · 试玩面板：模拟观众（礼物 / 弹幕公投 / 点赞 / 每种互动的每一档）、自动演示。可收起（H），正式上屏默认不出现 */
import { el, numInput } from './dom.js';
import { ACTIONS, actionDef } from '../config.js';
import { buildSpec } from '../tiers.js';

const MIN_KEY = 'taojin3d.demo.min';

export class DemoUI {
  constructor(app) {
    this.app = app;
    this.gift = '玫瑰';
    this.price = 10;
    this.count = 1;
    this.min = this.readMin();
    this.root = el('aside', { id: 'tj-demo', 'aria-label': '试玩面板' });
    this.root.addEventListener('dblclick', e => e.stopPropagation());
    document.body.append(this.root);
    this.status = el('p', { class: 'tj-note tj-status' });
    this.render();
    app.onSettings(() => {
      if (!this.root.contains(document.activeElement)) this.render();
    });
    setInterval(() => this.refreshStatus(), 400);
    addEventListener('keydown', e => {
      if (e.code !== 'KeyH' || e.repeat || app.settingsOpen() || (e.target.closest && e.target.closest('input,select,textarea'))) return;
      this.toggle();
    });
  }

  readMin() {
    try {
      return sessionStorage.getItem(MIN_KEY) === '1';
    } catch (e) {
      return false;
    }
  }

  toggle() {
    this.min = !this.min;
    try {
      sessionStorage.setItem(MIN_KEY, this.min ? '1' : '0');
    } catch (e) {
      /* 存储被拒绝时只在本页生效 */
    }
    this.render();
  }

  refreshStatus() {
    const g = this.app.game;
    const w = g.w;
    const parts = [this.app.live.status(), '排队 ' + g.director.size];
    if (w.thieves.busy()) parts.push('小偷 ×' + w.thieves.busy());
    if (w.nuggets.rocks().length) parts.push('石头 ×' + w.nuggets.rocks().length);
    for (const [k, v] of Object.entries(g.troubles.active)) if (v) parts.push(actionDef(k).name + ' ' + Math.max(0, v.left).toFixed(0) + '秒');
    this.status.textContent = parts.join(' · ');
  }

  actionRow(def) {
    const s = this.app.settings;
    const cfg = s.actions[def.id];
    return el('div', { class: 'tj-drow' },
      el('b', { class: 'tj-badge', style: `background:${def.color}`, text: def.badge }),
      el('span', { class: 'tj-dname', text: def.name }),
      cfg.tiers.map(t => el('button', {
        class: t.id === cfg.defaultTier ? 'def' : '',
        disabled: !cfg.enabled,
        title: t.id === cfg.defaultTier ? '默认档' : '',
        text: t.name,
        onclick: () => this.app.game.trigger(buildSpec(this.app.settings, def.id, t.id, 1, '测试观众', 'sim'))
      })));
  }

  render() {
    const app = this.app;
    const s = app.settings;
    this.root.classList.toggle('min', this.min);
    if (this.min) {
      this.root.replaceChildren(el('button', { class: 'tj-open', text: '试玩面板 (H)', onclick: () => this.toggle() }));
      return;
    }
    const giftIn = el('input', { value: this.gift, maxlength: 40, 'aria-label': '礼物名', list: 'tj-gift-names' });
    giftIn.addEventListener('change', () => (this.gift = giftIn.value.trim() || '玫瑰'));
    const names = el('datalist', { id: 'tj-gift-names' }, s.rules.gifts.map(g => el('option', { value: g.name })));
    const priceIn = numInput(this.price, { min: 0, max: 100000, step: 1, label: '礼物单价' }, n => (this.price = n));
    const countIn = numInput(this.count, { min: 1, max: 1000, step: 1, label: '礼物数量' }, n => (this.count = Math.floor(n)));
    const auto = app.autoplay.on;
    this.root.replaceChildren(
      el('div', { class: 'tj-dhead' }, el('b', { text: '试玩 · 模拟观众' }), el('button', { text: '收起 (H)', onclick: () => this.toggle() })),
      el('div', { class: 'tj-dsec' },
        el('button', { class: 'tj-big' + (auto ? ' on' : ''), text: auto ? '■ 停止自动演示' : '▶ 自动演示（虚拟鼠标替你玩）', onclick: () => app.autoplay.toggle() }),
        el('p', { class: 'tj-note', text: auto ? '演示中真鼠标不进游戏，点上面的按钮停止。' : '也可以自己玩：按住左右拖晃簸箕，往下拖往前倒水。' })),
      el('div', { class: 'tj-dsec' }, el('div', { class: 'tj-dlabel', text: '每种互动、每一档（★ 默认档描金边）' }), ACTIONS.map(d => this.actionRow(d))),
      el('div', { class: 'tj-dsec' },
        el('div', { class: 'tj-dlabel', text: '模拟礼物（规则表里的按规则，其余按单价选档）' }),
        el('div', { class: 'tj-row' }, giftIn, names),
        el('div', { class: 'tj-row' }, el('span', { text: '单价' }), priceIn, el('span', { text: '钻 ×' }), countIn,
          el('button', { text: '送出', onclick: () => app.live.simGift(this.gift, this.price, this.count) })),
        el('div', { class: 'tj-dlabel', text: '模拟弹幕公投（' + s.rules.chat.threshold + ' 人）' }),
        el('div', { class: 'tj-row wrap' }, s.rules.chat.words.map(w =>
          el('button', { text: w.word, title: '触发：' + actionDef(w.action).name, onclick: () => app.live.simVotes(w.word, s.rules.chat.threshold) }))),
        el('div', { class: 'tj-row' }, el('button', { text: '点赞 ×' + s.rules.like.pulses, onclick: () => app.live.simLikes(s.rules.like.pulses) }))),
      el('div', { class: 'tj-dsec' },
        el('div', { class: 'tj-row wrap' },
          el('button', { text: '清空簸箕', onclick: () => app.game.clearBasket() }),
          el('button', { text: '设置', onclick: () => app.toggleSettings() }))),
      this.status
    );
    this.refreshStatus();
  }
}
