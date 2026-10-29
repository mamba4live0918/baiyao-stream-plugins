// V5.6 升级拼豆笔补镜：蜷睡橘猫画板上实际取 16 颗，按住划动连续放豆。
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
const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: TMP, size: { width: 1280, height: 720 } } });
await context.routeWebSocket('**/*', socket => socket.close());
await context.addInitScript(() => addEventListener('DOMContentLoaded', () => {
  const dot = document.createElement('div');
  Object.assign(dot.style, { position: 'fixed', width: '22px', height: '22px', border: '2px solid #eafff3', borderRadius: '50%', background: '#54e5af44', boxShadow: '0 0 0 3px #1b483c99,0 0 14px #58e5bbaa', pointerEvents: 'none', zIndex: '2147483647', opacity: '0', transform: 'translate(-50%,-50%)' });
  document.body.append(dot);
  document.addEventListener('pointermove', event => { dot.style.left = `${event.clientX}px`; dot.style.top = `${event.clientY}px`; dot.style.opacity = '1'; }, { capture: true });
}, { once: true }));
const page = await context.newPage(), errors = [];
page.setDefaultTimeout(60000);
page.on('pageerror', error => errors.push(error.message));
const wait = ms => page.waitForTimeout(ms);
async function click(locator, delay = 1000) {
  await locator.scrollIntoViewIfNeeded();
  const b = await locator.boundingBox();
  assert(b);
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 20 });
  await wait(250);
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  await wait(delay);
}
async function menu(tab) {
  await page.mouse.move(30, 35, { steps: 20 });
  await wait(250);
  await page.mouse.dblclick(30, 35, { delay: 140 });
  await page.locator('#settings-overlay.open').waitFor();
  await click(page.locator(`[data-menu-tab="${tab}"]`), 700);
}
async function close() { await click(page.getByRole('button', { name: '完成设置', exact: true }), 900); }
try {
  await page.goto(pathToFileURL(resolve(ROOT, '拼豆-1.html')).href + '?qa=1');
  await page.waitForFunction(() => window.__pegQa?.snapshot());
  await menu('base');
  await click(page.locator('#transparent-background'), 650);
  await close();
  await menu('library');
  await click(page.locator('#menu-choose-pattern'), 600);
  await page.locator('#pattern-overlay.open').waitFor();
  await click(page.locator('#pattern-grid .pattern-card').filter({ hasText: '蜷睡橘猫' }).first(), 800);
  await page.waitForFunction(() => document.getElementById('pattern-name').textContent.includes('蜷睡橘猫'));
  await menu('base');
  await chooseOption(page, '#jar-filter', 'needed');
  await wait(700);
  await close();
  await menu('effects');
  await click(page.locator('[data-effect="help"]'), 700);
  const help = page.locator('#rules .tier-card[data-tier="medium"]');
  await click(help.locator('[data-param="amount"]'), 200);
  await help.locator('[data-param="amount"]').fill('800');
  await help.locator('[data-param="amount"]').press('Tab');
  await wait(650);
  await click(help.getByRole('button', { name: '预览此级别' }), 600);
  await page.locator('#settings-overlay').waitFor({ state: 'hidden' });
  await page.waitForFunction(() => window.__pegQa.snapshot().placed.filter(Boolean).length >= 800);
  await wait(1300);
  await menu('effects');
  await click(page.locator('[data-effect="pen"]'), 950);
  const card = page.locator('#rules .tier-card[data-tier="medium"]');
  for (const [key, value] of [['amount', '60'], ['capacity', '16']]) {
    const field = card.locator(`[data-param="${key}"]`);
    await click(field, 200);
    await field.fill(value);
    await field.press('Tab');
    await wait(650);
  }
  await wait(900);
  await click(card.getByRole('button', { name: '预览此级别' }), 700);
  await page.locator('#settings-overlay').waitFor({ state: 'hidden' });
  await page.waitForFunction(() => window.__pegQa.snapshot().penUntil > Date.now());
  await wait(1600);
  const target = await page.evaluate(() => {
    const qa = window.__pegQa, state = qa.snapshot(), inventory = qa.inventory();
    let best = null;
    for (let row = 0; row < state.size; row++) for (let col = 0; col < state.size; col++) {
      const i = row * state.size + col, point = qa.cellPoint(row, col), hit = qa.hit(point.x, point.y);
      if (!hit?.target || state.placed[i]) continue;
      const color = hit.target, shade = inventory.find(item => item.hex === color);
      const jar = shade && qa.palettePoint(shade.code);
      if (!jar) continue;
      let length = 1;
      while (col + length < state.size) {
        const j = row * state.size + col + length, next = qa.cellPoint(row, col + length), nextHit = qa.hit(next.x, next.y);
        if (state.placed[j] || nextHit?.target !== color) break;
        length++;
      }
      if (!best || length > best.length) best = { row, col, length, jar };
    }
    return best;
  });
  assert.ok(target?.length >= 3, `找不到三个相邻的同色空位：${JSON.stringify(target)}`);
  const length = Math.min(target.length, 12);
  await page.mouse.move(target.jar.x, target.jar.y, { steps: 32 });
  await wait(500);
  await page.mouse.click(target.jar.x, target.jar.y);
  await page.waitForFunction(() => /×16/.test(document.getElementById('held-name').textContent));
  await wait(1700);
  const before = await page.evaluate(() => window.__pegQa.snapshot().placed.filter(Boolean).length);
  const first = await page.evaluate(t => window.__pegQa.cellPoint(t.row, t.col), target);
  await page.mouse.move(first.x, first.y, { steps: 28 });
  await wait(500);
  await page.mouse.down();
  for (let col = target.col + 1; col < target.col + length; col++) {
    const p = await page.evaluate(t => window.__pegQa.cellPoint(t.row, t.col), { row: target.row, col });
    await page.mouse.move(p.x, p.y, { steps: 8 });
    await wait(110);
  }
  await page.mouse.up();
  await wait(1500);
  const after = await page.evaluate(() => window.__pegQa.snapshot().placed.filter(Boolean).length);
  assert.ok(after >= before + 3, `划动连续放豆失败：${before} → ${after}`);
  await page.screenshot({ path: resolve(TMP, 'V5.6-拼豆笔划动-结果.png') });
  await wait(2400);
  assert.deepEqual(errors, []);
  const video = page.video();
  await page.close();
  const raw = resolve(TMP, 'V5.6-拼豆笔划动-浏览器原片.webm');
  await video.saveAs(raw);
  await context.close();
  await browser.close();
  browser = null;
  const output = resolve(TMP, 'V5.6-拼豆笔操作-补镜.mp4');
  const ff = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', raw, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', output], { encoding: 'utf8' });
  assert.equal(ff.status, 0, ff.stderr);
  const info = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration,size:stream=width,height,nb_frames', '-of', 'json', output], { encoding: 'utf8' });
  assert.equal(info.status, 0, info.stderr);
  console.log(JSON.stringify({ output, beadsBefore: before, beadsAfter: after, strokeLength: length, ...JSON.parse(info.stdout) }));
} catch (error) {
  await page.screenshot({ path: resolve(TMP, 'V5.6-拼豆笔划动-失败.png') }).catch(() => {});
  console.error(errors);
  throw error;
} finally { if (browser) await browser.close(); }
