// V5.6 特性补镜：模式/存档入口、五种熨烫、真实 3D 检视与成品库。
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright';
import { chooseOption } from './qa-select-helper.mjs';

const ROOT = import.meta.dirname, TMP = resolve(ROOT, 'tmp');
await mkdir(TMP, { recursive: true });
const args = ['--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
let browser;
try { browser = await chromium.launch({ channel: 'chrome', headless: true, args }); }
catch { browser = await chromium.launch({ headless: true, args }); }
const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: TMP, size: { width: 1280, height: 720 } }, acceptDownloads: true });
await context.routeWebSocket('**/*', socket => socket.close());
await context.addInitScript(() => addEventListener('DOMContentLoaded', () => {
  const dot = document.createElement('div');
  Object.assign(dot.style, { position: 'fixed', width: '22px', height: '22px', border: '2px solid #eafff3', borderRadius: '50%', background: '#54e5af44', boxShadow: '0 0 0 3px #1b483c99,0 0 14px #58e5bbaa', pointerEvents: 'none', zIndex: '2147483647', opacity: '0', transform: 'translate(-50%,-50%)' });
  document.body.append(dot);
  document.addEventListener('pointermove', event => { dot.style.left = `${event.clientX}px`; dot.style.top = `${event.clientY}px`; dot.style.opacity = '1'; }, { capture: true });
}, { once: true }));
const page = await context.newPage(), errors = [];
page.setDefaultTimeout(180000);
page.on('pageerror', error => errors.push(error.message));
const wait = ms => page.waitForTimeout(ms);
async function click(locator, after = 1100) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  assert(box, '控件不可见');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 22 });
  await wait(300);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await wait(after);
}
async function menu(tab) {
  await page.mouse.move(30, 35, { steps: 20 });
  await wait(300);
  await page.mouse.dblclick(30, 35, { delay: 140 });
  await page.locator('#settings-overlay.open').waitFor();
  await click(page.locator(`[data-menu-tab="${tab}"]`), 850);
}
async function close() { await click(page.getByRole('button', { name: '完成设置', exact: true }), 850); }
try {
  await page.goto(pathToFileURL(resolve(ROOT, '拼豆-1.html')).href + '?qa=1');
  await page.waitForFunction(() => window.__pegQa?.snapshot());
  await menu('base');
  await click(page.locator('#transparent-background'), 650);
  await close();
  await menu('library');
  await click(page.locator('#menu-choose-pattern'), 600);
  await page.locator('#pattern-overlay.open').waitFor();
  await click(page.locator('#pattern-grid .pattern-card').filter({ hasText: '蜷睡橘猫' }).first(), 900);
  await page.waitForFunction(() => document.getElementById('pattern-name').textContent.includes('蜷睡橘猫'));

  // 明确拍到另外两个功能入口，并实际打开关卡模式后返回单图。
  await menu('modes');
  await wait(1500);
  await chooseOption(page, '#play-mode', 'campaign');
  await page.waitForFunction(() => window.__pegQa.mode().playMode === 'campaign');
  await wait(1600);
  await chooseOption(page, '#play-mode', 'pattern');
  await page.waitForFunction(() => window.__pegQa.mode().playMode === 'pattern');
  await wait(750);
  await click(page.locator('[data-menu-tab="saves"]'), 1800);
  await page.screenshot({ path: resolve(TMP, 'V5.6-熨烫成品-存档入口.png') });
  await close();

  await menu('effects');
  await click(page.locator('[data-effect="help"]'), 900);
  const help = page.locator('#rules .tier-card[data-tier="medium"]');
  await click(help.locator('[data-param="amount"]'), 200);
  await help.locator('[data-param="amount"]').fill('2304');
  await help.locator('[data-param="amount"]').press('Tab');
  await wait(650);
  await click(help.getByRole('button', { name: '预览此级别' }), 650);
  await page.locator('#settings-overlay').waitFor({ state: 'hidden' });
  await page.waitForFunction(() => !document.getElementById('iron-button').disabled);
  const filled = await page.evaluate(() => window.__pegQa.snapshot().placed.filter(Boolean).length);
  assert.ok(filled > 1000, `自动补齐后仅 ${filled} 颗`);
  await wait(2100);
  await page.screenshot({ path: resolve(TMP, 'V5.6-熨烫成品-拼好.png') });
  await click(page.locator('#iron-button'), 900);
  await page.locator('#iron-overlay.open').waitFor();
  for (const name of ['澡巾烫', '褶皱烘焙纸烫', '毛巾烫', '双面保孔烫', '单面无孔烫']) {
    await click(page.locator('.iron-option').filter({ hasText: name }), 1050);
  }
  await click(page.locator('.iron-option').filter({ hasText: '褶皱烘焙纸烫' }), 1000);
  await page.screenshot({ path: resolve(TMP, 'V5.6-熨烫成品-五种方式.png') });
  await click(page.locator('#start-iron'), 650);
  await page.waitForFunction(() => !document.getElementById('save-button').disabled && document.getElementById('iron-overlay').classList.contains('open'), null, { timeout: 240000 });
  await page.waitForFunction(() => window.__pegQa.finishStats(), null, { timeout: 240000 });
  await wait(2200);
  const viewer = page.locator('#finished-viewer canvas');
  const bounds = await viewer.boundingBox();
  assert(bounds, '3D 成品画布不可见');
  await page.mouse.move(bounds.x + bounds.width * .42, bounds.y + bounds.height * .54, { steps: 24 });
  await wait(500);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * .78, bounds.y + bounds.height * .42, { steps: 40 });
  await page.mouse.up();
  await wait(2200);
  await page.screenshot({ path: resolve(TMP, 'V5.6-熨烫成品-3D旋转.png') });
  const stats = await page.evaluate(() => window.__pegQa.finishStats());
  assert.ok(stats, '成品 3D 未生成');
  await click(page.locator('#save-button'), 1200);
  await page.waitForFunction(() => document.getElementById('save-button').disabled);
  await wait(1000);
  await click(page.locator('#start-iron'), 750);
  await menu('library');
  await click(page.locator('#menu-gallery'), 850);
  await page.locator('#gallery-overlay.open').waitFor();
  await page.getByRole('button', { name: '3D 检视', exact: true }).waitFor();
  await wait(1400);
  await click(page.getByRole('button', { name: '3D 检视', exact: true }), 850);
  await page.locator('#viewer-overlay.open').waitFor();
  await page.waitForFunction(() => window.__pegQa.savedStats(), null, { timeout: 240000 });
  await wait(2600);
  await page.screenshot({ path: resolve(TMP, 'V5.6-熨烫成品-作品库3D.png') });
  assert.deepEqual(errors, []);

  const video = page.video();
  await page.close();
  const raw = resolve(TMP, 'V5.6-熨烫成品-浏览器原片.webm');
  await video.saveAs(raw);
  await context.close();
  await browser.close();
  browser = null;
  const output = resolve(TMP, 'V5.6-熨烫成品-补镜.mp4');
  const ff = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', raw, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', output], { encoding: 'utf8' });
  assert.equal(ff.status, 0, ff.stderr);
  const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration,size:stream=width,height,nb_frames', '-of', 'json', output], { encoding: 'utf8' });
  assert.equal(probe.status, 0, probe.stderr);
  console.log(JSON.stringify({ output, filled, finishStats: stats, ...JSON.parse(probe.stdout) }));
} catch (error) {
  await page.screenshot({ path: resolve(TMP, 'V5.6-熨烫成品-失败.png') }).catch(() => {});
  console.error(errors);
  throw error;
} finally { if (browser) await browser.close(); }
