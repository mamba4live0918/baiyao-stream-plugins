/* 淘金 3D · 界面外壳：右上角齿轮（鼠标动了才出现）、设置面板、试玩面板、自动演示 */
import { el } from './dom.js';
import { SettingsUI } from './settings-ui.js';
import { DemoUI } from './demo-ui.js';
import { Autoplay } from './autoplay.js';

const GEAR_IDLE = 2.5;

export function createApp(o) {
  const { game, live, w, getSettings, applySettings, onSettings } = o;
  const app = {
    game,
    live,
    get settings() {
      return getSettings();
    },
    applySettings,
    onSettings,
    settingsOpen: () => ui.isOpen,
    toggleSettings: () => ui.toggle(),
    showDemo: () => {
      if (!demo) demo = new DemoUI(app);
      else if (demo.min) demo.toggle();
    }
  };
  const ui = new SettingsUI(app);
  app.autoplay = new Autoplay({
    canvas: document.getElementById('cv'),
    w,
    game,
    toScreen: (x, y, z) => window.TJ3.toScreen(x, y, z),
    getSettings,
    onChange: () => demo && demo.render()
  });
  let demo = o.demo ? new DemoUI(app) : null;

  /* 齿轮：鼠标在画面上动一下才出现，停 2.5 秒自动隐藏，直播画面平时看不到 */
  const gear = el('button', { id: 'tj-gear', title: '设置', 'aria-label': '打开设置', text: '⚙', onclick: () => ui.toggle() });
  document.body.append(gear);
  let idle = 0;
  addEventListener('pointermove', e => {
    if (!e.isTrusted) return;
    idle = 0;
    gear.classList.add('show');
  });
  addEventListener('keydown', e => {
    if (e.code === 'KeyS' && !e.repeat && !ui.isOpen && !(e.target.closest && e.target.closest('input,select,textarea'))) ui.open();
  });

  return {
    autoplay: app.autoplay,
    settingsUI: ui,
    showDemo: app.showDemo,
    openSettings: () => ui.open(),
    tick(dt) {
      idle += dt;
      if (idle > GEAR_IDLE && !ui.isOpen) gear.classList.remove('show');
      app.autoplay.tick(dt);
    }
  };
}
