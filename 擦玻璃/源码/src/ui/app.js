/* 擦玻璃 · 界面外壳：右上角齿轮（鼠标动了才出现，停 2.5 秒隐藏）、设置面板、试玩面板、自动演示、露脸区编辑。 */
import { el } from './dom.js';
import { SettingsUI } from './settings-ui.js';
import { DemoUI } from './demo-ui.js';
import { Autoplay } from './autoplay.js';
import { createZoneEditor } from './zone-editor.js';

const GEAR_IDLE = 2.5;

export function createApp(o) {
  const { canvas, getSettings, applySettings, onSettings } = o;
  let demo = null;
  const app = {
    game: o.game,
    live: o.live,
    stats: o.stats,
    director: o.director,
    trigger: o.trigger,
    clearGlass: o.clearGlass,
    toast: o.toast || (() => {}),
    stickers: o.stickers,
    onStickers: o.onStickers || (() => {}),
    get settings() {
      return getSettings();
    },
    applySettings,
    onSettings,
    settingsOpen: () => ui.isOpen,
    toggleSettings: () => ui.toggle(),
    zoneEditing: () => zone.isOpen(),
    editZone: () => zone.open(),
    showDemo: () => {
      if (!demo) demo = new DemoUI(app);
      else if (demo.min) demo.toggle();
    },
    onAutoplay: () => demo && demo.render()
  };
  const ui = new SettingsUI(app);
  const zone = createZoneEditor({
    getZone: () => getSettings().display.zone,
    setZone: z => applySettings({ ...getSettings(), display: { ...getSettings().display, zone: { ...z, enabled: true, auto: false } } }),
    previewZone: z => o.previewZone({ ...z, enabled: true }),
    onDone: () => ui.isOpen && ui.render()
  });
  app.autoplay = new Autoplay({ canvas, app });
  if (o.demo) demo = new DemoUI(app);

  const gear = el('button', { id: 'gl-gear', title: '设置', 'aria-label': '打开设置', text: '⚙', onclick: () => ui.toggle() });
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
    showDemo: app.showDemo,
    openSettings: () => ui.open(),
    blocked: () => zone.isOpen(),
    tick(dt) {
      idle += dt;
      if (idle > GEAR_IDLE && !ui.isOpen) gear.classList.remove('show');
      app.autoplay.tick(dt);
    }
  };
}
