/* 擦玻璃 · 试玩面板：点一下来一下每种互动、假装有人送礼物（按设置里的捣乱礼物 / 保护礼物）、撒灰、自动演示。
   可收起（H），正式上屏默认不出现（?demo=1 或从设置里打开）。 */
import { el, numInput } from './dom.js';
import { ACTIONS, actionDef, defaultQty } from '../config.js';
import { qtySpecs } from '../rules.js';

const MIN_KEY = 'glass2d.demo.min';
const NAMES = ['小明', '路过的猫', '奶茶星人', '鸡蛋侠', '摸鱼王', '白曜的狗', '雾里看花', '小广告王', '好心人', '守护骑士'];

export class DemoUI {
  constructor(app) {
    this.app = app;
    this.gift = '大厨煎蛋';
    this.count = 1;
    this.min = this.readMin();
    this.root = el('aside', { id: 'gl-demo', 'aria-label': '试玩面板' });
    document.body.append(this.root);
    this.status = el('p', { class: 'gl-note gl-status' });
    this.render();
    app.onSettings(() => {
      if (!this.root.contains(document.activeElement)) this.render();
    });
    setInterval(() => this.refreshStatus(), 500);
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
    const app = this.app;
    const kinds = {};
    for (const a of app.game.actors) kinds[a.kind] = (kinds[a.kind] || 0) + 1;
    const parts = [app.live.sdk || app.live.bay ? '已连上直播间' : '没连直播间', '玻璃上 ' + app.game.messCount() + ' 块', '排队 ' + app.director.size];
    for (const [k, n] of Object.entries(kinds)) if (['cat', 'bird', 'gecko', 'robot', 'film', 'flyer'].includes(k)) parts.push((actionDef(k) ? actionDef(k).name : k) + ' ' + n);
    this.status.textContent = parts.join(' · ');
  }

  name() {
    return NAMES[Math.floor(Math.random() * NAMES.length)];
  }

  /* 点一下来一下（数量按默认：鸡蛋 2 个、泥巴 3 团……） */
  once(def) {
    const who = this.name();
    for (const spec of qtySpecs(this.app.settings, def.id, defaultQty(def.id), who, 'sim', { uid: 'sim-' + who })) this.app.trigger(spec);
  }

  render() {
    const app = this.app;
    const s = app.settings;
    this.root.classList.toggle('min', this.min);
    if (this.min) {
      this.root.replaceChildren(el('button', { class: 'gl-open', text: '试玩面板 (H)', onclick: () => this.toggle() }));
      return;
    }
    const giftIn = el('input', { value: this.gift, maxlength: 40, 'aria-label': '礼物名', list: 'gl-demo-gifts' });
    giftIn.addEventListener('change', () => (this.gift = giftIn.value.trim() || '玫瑰'));
    const names = el('datalist', { id: 'gl-demo-gifts' }, [...s.rules.mess, ...s.rules.help].map(g => el('option', { value: g.name })));
    const countIn = numInput(this.count, { min: 1, max: 1000, step: 1, label: '送几个' }, n => (this.count = Math.max(1, Math.floor(n))));
    const auto = app.autoplay.on;
    this.root.replaceChildren(
      el('div', { class: 'gl-dhead' }, el('b', { text: '试玩 · 假装有观众' }), el('button', { text: '收起 (H)', onclick: () => this.toggle() })),
      el('div', { class: 'gl-dsec' },
        el('button', { class: 'gl-big' + (auto ? ' on' : ''), text: auto ? '■ 停止自动演示' : '▶ 自动演示（假观众捣乱 + 假鼠标替你擦）', onclick: () => app.autoplay.toggle() }),
        el('p', { class: 'gl-note', text: auto ? '演示中你的鼠标也能一起擦。' : '也可以自己玩：按住鼠标拖动刮玻璃。' })),
      el('div', { class: 'gl-dsec' },
        el('div', { class: 'gl-dlabel', text: '点一下来一下' }),
        el('div', { class: 'gl-dgrid' }, ACTIONS.map(d => el('button', { onclick: () => this.once(d) },
          el('b', { class: 'gl-badge', style: `background:${d.color}`, text: d.badge }), d.name)))),
      el('div', { class: 'gl-dsec' },
        el('div', { class: 'gl-dlabel', text: '假装有人送礼物（按设置里的捣乱礼物 / 保护礼物）' }),
        el('div', { class: 'gl-row' }, giftIn, names),
        el('div', { class: 'gl-row' }, el('span', { text: '送' }), countIn, el('span', { text: '个' }),
          el('button', { text: '送出', onclick: () => app.live.simGift(this.gift, null, this.count, this.name()) }))),
      el('div', { class: 'gl-dsec' },
        el('div', { class: 'gl-row' },
          el('button', { text: '撒一片灰', onclick: () => app.game.spawnDust() }),
          el('button', { text: '清空玻璃', onclick: () => app.clearGlass() }),
          el('button', { text: '框住我的脸', onclick: () => app.editZone() }),
          el('button', { text: '设置', onclick: () => app.toggleSettings() }))),
      this.status
    );
    this.refreshStatus();
  }
}
