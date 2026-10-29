import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const root = resolve(import.meta.dirname);
const htmlPath = process.argv[2] ? resolve(process.argv[2]) : resolve(root, '拼豆-1.html');
const shots = resolve(root, process.argv[2] ? 'tmp/qa-zip' : 'tmp/qa');
await mkdir(shots, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
page.on('console', message => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
await page.goto(pathToFileURL(htmlPath).href + '?qa=1');
await page.waitForTimeout(2600);
await page.screenshot({ path: resolve(shots, 'initial.png'), omitBackground: true });
await page.getByRole('button', { name: '选择图案' }).click();
assert.equal(await page.locator('.pattern-card').count(), 52);
await page.screenshot({ path: resolve(shots, 'presets.png'), omitBackground: true });
await page.locator('#pattern-overlay [data-close]').click();
const targetPoint = await page.evaluate(() => {
  for (let y = 220; y < 620; y += 6) for (let x = 420; x < 1150; x += 6) {
    const hit = window.__pegQa?.hit(x, y);
    if (hit?.target === '#ef4b5a') return { x, y, hit };
  }
  return null;
});
assert.ok(targetPoint, 'a visible P03 target should be hittable');
await page.locator('.jar[aria-label*="P03"]').click();
await page.mouse.click(targetPoint.x, targetPoint.y);
await page.waitForTimeout(350);
const manualProgress = await page.locator('#progress-text').textContent();
await page.screenshot({ path: resolve(shots, 'manual.png'), omitBackground: true });
await page.getByRole('button', { name: '礼物与设置' }).click();
await page.locator('.rule').filter({ hasText: '帮助拼豆' }).getByRole('button', { name: '测试' }).click();
await page.waitForTimeout(350);
const helpProgress = await page.locator('#progress-text').textContent();
await page.locator('.rule').filter({ hasText: '打翻装豆托盘' }).getByRole('button', { name: '测试' }).click();
await page.locator('#settings-overlay [data-close]').first().click();
await page.waitForTimeout(450);
const spillVisible = await page.locator('#restore-panel').isVisible();
const spillProgress = await page.locator('#progress-text').textContent();
await page.screenshot({ path: resolve(shots, 'spill.png'), omitBackground: true });
await page.locator('#size-choices button').filter({ hasText: '20×20' }).click();
assert.equal(await page.locator('#board-size-note').textContent(), '16 × 16', 'tray spill cannot be bypassed by resizing the board');
for (let i = 0; i < 20; i++) await page.keyboard.press('Space');
await page.waitForTimeout(850);
const restoreVisible = await page.locator('#restore-panel').isVisible();
await page.screenshot({ path: resolve(shots, 'restored.png'), omitBackground: true });
await page.getByRole('button', { name: '礼物与设置' }).click();
const helpRow = page.locator('.rule').filter({ hasText: '帮助拼豆' });
await helpRow.locator('input[type=number]').fill('500');
await helpRow.locator('input[type=number]').blur();
await helpRow.getByRole('button', { name: '测试' }).click();
await page.locator('#settings-overlay [data-close]').first().click();
await page.waitForTimeout(400);
const fullProgress = await page.locator('#progress-text').textContent();
const ironEnabled = await page.locator('#iron-button').isEnabled();
let savedViewerCount = 0;
let galleryItems = 0;
if (ironEnabled) {
  await page.locator('#iron-button').click();
  await page.locator('#start-iron').click();
  await page.waitForTimeout(3800);
  assert.equal(await page.locator('#finished-viewer canvas.finished-3d-canvas').count(), 1);
  await page.screenshot({ path: resolve(shots, 'finished.png'), omitBackground: true });
  await page.locator('#iron-overlay [data-close]').click();
  await page.reload();
  await page.waitForTimeout(950);
  assert.equal(await page.locator('#iron-button').isEnabled(), true, 'unsaved finished piece must remain inspectable after refresh');
  await page.locator('#iron-button').click();
  assert.equal(await page.locator('#finished-viewer canvas.finished-3d-canvas').count(), 1);
  await page.locator('#save-button').click();
  await page.waitForTimeout(300);
  await page.locator('#iron-overlay [data-close]').click();
  await page.locator('#settings-button').click();
  await page.locator('.rule').filter({ hasText: '再拼一个' }).getByRole('button', { name: '测试' }).click();
  await page.locator('#settings-overlay [data-close]').first().click();
  assert.equal(await page.locator('#progress-text').textContent(), '0 / 76', 'extra round must clear the finished board');
  assert.equal(await page.locator('#round-tag').textContent(), '第 2 / 2 遍');
  await page.locator('#gallery-button').click();
  await page.waitForTimeout(250);
  galleryItems = await page.locator('.gallery-item').count();
  await page.screenshot({ path: resolve(shots, 'gallery.png'), omitBackground: true });
  await page.getByRole('button', { name: '3D 检视' }).click();
  savedViewerCount = await page.locator('#saved-finished-viewer canvas.finished-3d-canvas').count();
  assert.equal(savedViewerCount, 1);
  await page.screenshot({ path: resolve(shots, 'saved-3d.png'), omitBackground: true });
  const glbDownload = page.waitForEvent('download');
  await page.locator('#saved-glb-button').click();
  const glb = await glbDownload;
  await glb.saveAs(resolve(shots, 'saved-work.glb'));
  const glbHeader = (await readFile(resolve(shots, 'saved-work.glb'))).subarray(0, 4).toString('ascii');
  assert.equal(glbHeader, 'glTF');
  await page.locator('#viewer-overlay [data-close]').click();
  await page.locator('#gallery-overlay [data-close]').click();
  await page.reload();
  await page.waitForTimeout(900);
  await page.locator('#gallery-button').click();
  await page.waitForTimeout(250);
  assert.equal(await page.locator('.gallery-item').count(), 1);
  await page.locator('#gallery-overlay [data-close]').click();
  const uploadData = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 4; canvas.height = 4;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ef4b5a'; ctx.fillRect(0, 0, 4, 4);
    ctx.clearRect(0, 0, 1, 1);
    return canvas.toDataURL('image/png');
  });
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#image-input').setInputFiles({
    name: '我的图案.png', mimeType: 'image/png', buffer: Buffer.from(uploadData.split(',')[1], 'base64'),
  });
  await page.waitForTimeout(900);
  assert.equal(await page.locator('#pattern-name').textContent(), '我的图案');
  await page.screenshot({ path: resolve(shots, 'upload.png'), omitBackground: true });
  await page.locator('#image-input').setInputFiles({ name: '坏文件.txt', mimeType: 'text/plain', buffer: Buffer.from('not an image') });
  await page.waitForTimeout(120);
  assert.equal(await page.locator('#pattern-name').textContent(), '我的图案');
  await page.reload();
  await page.waitForTimeout(1000);
  assert.equal(await page.locator('#pattern-name').textContent(), '我的图案');
  await page.locator('#settings-button').click();
  await page.locator('#custom-board-size').fill('18');
  await page.locator('#apply-board-size').click();
  await page.waitForTimeout(400);
  assert.equal(await page.locator('#board-size-note').textContent(), '18 × 18');
  await page.locator('#settings-overlay [data-close]').first().click();
  await page.reload();
  await page.waitForTimeout(950);
  assert.equal(await page.locator('#board-size-note').textContent(), '18 × 18');
}
const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
await mobile.goto(pathToFileURL(htmlPath).href);
await mobile.waitForTimeout(1500);
await mobile.screenshot({ path: resolve(shots, 'mobile.png'), omitBackground: true });
const mobileLayout = await mobile.evaluate(() => ({
  scrollWidth: document.documentElement.scrollWidth,
  clientWidth: document.documentElement.clientWidth,
  sceneHeight: document.getElementById('scene').getBoundingClientRect().height,
}));
assert.ok(mobileLayout.scrollWidth <= mobileLayout.clientWidth + 2, 'mobile layout must not overflow horizontally');
assert.ok(mobileLayout.sceneHeight > 250, 'mobile board must remain visible');
await mobile.locator('.jar').first().scrollIntoViewIfNeeded();
const mobileJarRect = await mobile.locator('.jar').first().boundingBox();
assert.ok(mobileJarRect && mobileJarRect.y < 844 && mobileJarRect.y + mobileJarRect.height > 0, 'mobile jars must be reachable by scrolling');
await mobile.screenshot({ path: resolve(shots, 'mobile-jars.png'), omitBackground: true });
await mobile.close();
const fallbackContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
await fallbackContext.addInitScript(() => {
  const nativeGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
    if (['webgl', 'webgl2', 'experimental-webgl'].includes(kind)) return null;
    return nativeGetContext.call(this, kind, ...args);
  };
});
const fallback = await fallbackContext.newPage();
const fallbackErrors = [];
fallback.on('pageerror', error => fallbackErrors.push(error.message));
await fallback.goto(pathToFileURL(htmlPath).href);
await fallback.waitForTimeout(700);
assert.equal(await fallback.locator('.fallback-grid').count(), 1);
await fallback.locator('.jar[aria-label*="P03"]').click();
await fallback.locator('.fallback-cell').nth(9 * 16 + 3).click();
await fallback.locator('#settings-button').click();
const shakeRow = fallback.locator('.rule').filter({ hasText: '摇桌子' });
await shakeRow.locator('input[type=number]').fill('4');
await shakeRow.locator('input[type=number]').blur();
await shakeRow.getByRole('button', { name: '测试' }).click();
await fallback.locator('#settings-overlay [data-close]').first().click();
await fallback.waitForTimeout(5500);
assert.deepEqual(fallbackErrors, [], '2D fallback shake must not throw');
await fallback.screenshot({ path: resolve(shots, 'fallback.png'), omitBackground: true });
await fallbackContext.close();
const deniedContext = await browser.newContext({ viewport: { width: 1600, height: 900 } });
await deniedContext.addInitScript(() => {
  Storage.prototype.setItem = function () { throw new DOMException('quota exceeded', 'QuotaExceededError'); };
});
const denied = await deniedContext.newPage();
const deniedErrors = [];
denied.on('pageerror', error => deniedErrors.push(error.message));
await denied.goto(pathToFileURL(htmlPath).href + '?qa=1');
await denied.waitForTimeout(950);
assert.match(await denied.locator('#notice').textContent(), /浏览器存储不可用/);
const deniedTarget = await denied.evaluate(() => {
  for (let y = 300; y < 530; y += 12) for (let x = 540; x < 950; x += 12) {
    if (window.__pegQa?.hit(x, y)?.target === '#ef4b5a') return { x, y };
  }
  return null;
});
assert.ok(deniedTarget);
await denied.locator('.jar[aria-label*="P03"]').click();
await denied.mouse.click(deniedTarget.x, deniedTarget.y);
assert.equal(await denied.locator('#progress-text').textContent(), '1 / 76');
assert.deepEqual(deniedErrors, []);
await denied.screenshot({ path: resolve(shots, 'storage-denied.png'), omitBackground: true });
const summary = {
  title: await page.title(),
  progress: await page.locator('#progress-text').textContent(),
  presetCount: await page.locator('#preset-count').textContent(),
  canvasCount: await page.locator('canvas.three-canvas').count(),
  bodyBackground: await page.evaluate(() => getComputedStyle(document.body).backgroundColor),
  manualProgress, targetPoint, helpProgress, spillVisible, spillProgress, restoreVisible, fullProgress, ironEnabled,
  galleryItems,
  savedViewerCount,
  mobileLayout,
  fallbackErrors,
  deniedErrors,
  errors,
};
assert.equal(summary.spillVisible, true);
assert.equal(summary.spillProgress, summary.helpProgress);
assert.equal(summary.manualProgress, '1 / 76');
assert.equal(summary.restoreVisible, false);
assert.equal(summary.ironEnabled, true);
assert.equal(summary.galleryItems, 1);
assert.equal(summary.savedViewerCount, 1);
await writeFile(resolve(shots, 'summary.json'), JSON.stringify(summary, null, 2), 'utf8');
console.log(summary);
await browser.close();
