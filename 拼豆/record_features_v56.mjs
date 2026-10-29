/**
 * V5.6 功能与互动实录。直接打开交付用单 HTML；不连接直播间，不模拟宿主界面。
 * 录制：node record_features_v56.mjs --record
 * 快速检查画面：node record_features_v56.mjs --probe
 * 输出：tmp/V5.6-功能互动-原片.mp4（无配音、无字幕）
 */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright';
import { chooseOption } from './qa-select-helper.mjs';

const ROOT = import.meta.dirname;
const TMP = resolve(ROOT, 'tmp');
const HTML = resolve(ROOT, '拼豆-1.html');
const VIDEO = resolve(TMP, 'V5.6-功能互动-原片.mp4');
const PROBE = process.argv.includes('--probe');
assert(PROBE || process.argv.includes('--record'), '请传入 --record 或 --probe');
await mkdir(TMP, { recursive: true });

const chromeArgs = ['--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
let browser;
try { browser = await chromium.launch({ channel: 'chrome', headless: true, args: chromeArgs }); }
catch { browser = await chromium.launch({ headless: true, args: chromeArgs }); }
const context = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  recordVideo: PROBE ? undefined : { dir: TMP, size: { width: 1280, height: 720 } },
  acceptDownloads: true,
});
// 只使用页面内置的离线预览按钮；录制时不建立直播间或礼物 WebSocket 连接。
await context.routeWebSocket('**/*', socket => socket.close());
await context.addInitScript(() => {
  addEventListener('DOMContentLoaded', () => {
    const cursor = document.createElement('div');
    cursor.setAttribute('aria-hidden', 'true');
    Object.assign(cursor.style, {
      position: 'fixed', left: '0', top: '0', width: '22px', height: '22px',
      border: '2px solid #eafff3', borderRadius: '50%', background: '#54e5af44',
      boxShadow: '0 0 0 3px #1b483c99,0 0 14px #58e5bbaa',
      pointerEvents: 'none', zIndex: '2147483647', opacity: '0',
      transform: 'translate(-50%,-50%)', transition: 'transform .14s,background .14s',
    });
    document.body.appendChild(cursor);
    document.addEventListener('pointermove', event => {
      cursor.style.left = `${event.clientX}px`;
      cursor.style.top = `${event.clientY}px`;
      cursor.style.opacity = '1';
    }, { capture: true });
    document.addEventListener('pointerdown', () => { cursor.style.background = '#58ffcdaa'; cursor.style.transform = 'translate(-50%,-50%) scale(.72)'; }, { capture: true });
    document.addEventListener('pointerup', () => { cursor.style.background = '#54e5af44'; cursor.style.transform = 'translate(-50%,-50%)'; }, { capture: true });
  }, { once: true });
});
const page = await context.newPage();
page.setDefaultTimeout(60000);
const errors = [], beats = [];
page.on('pageerror', error => errors.push(error.message));
const start = Date.now();
const pause = ms => page.waitForTimeout(PROBE ? Math.min(ms, 150) : ms);
const snap = () => page.evaluate(() => window.__pegQa.snapshot());
const note = async label => {
  const state = await snap();
  beats.push({ second: Number(((Date.now() - start) / 1000).toFixed(1)), label,
    placed: state.placed.filter(Boolean).length, fallen: state.fallen.length,
    traySpilled: state.traySpilled, restoreStage: state.trayRestoreStage,
    requiredRounds: state.requiredRounds, hintHidden: state.hintHiddenUntil > Date.now(),
    toolLocked: state.tweezersLockedUntil > Date.now(), penActive: state.penUntil > Date.now() });
  console.log(`${beats.at(-1).second}s ${label}: ${beats.at(-1).placed} 颗已拼`);
};

async function slowClick(locator, after = 1150) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  assert(box, '待点击控件不可见');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 20 });
  await pause(280);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await pause(after);
}
async function slowFill(locator, value) {
  await slowClick(locator, 220);
  await locator.fill(String(value));
  await pause(600);
  await locator.press('Tab');
  await pause(550);
}
async function openMenu(tab = 'effects') {
  // 直播画面隐藏了顶部按钮；双击空白是产品提供的常驻设置入口。
  await page.mouse.move(30, 35, { steps: 20 });
  await pause(300);
  await page.mouse.dblclick(30, 35, { delay: 140 });
  await pause(600);
  await page.locator('#settings-overlay.open').waitFor();
  await slowClick(page.locator(`[data-menu-tab="${tab}"]`), 650);
}
async function closeMenu() {
  await slowClick(page.getByRole('button', { name: '完成设置', exact: true }), 700);
}
async function effect(id, fields = {}, options = {}) {
  const before = await snap();
  await openMenu();
  await slowClick(page.locator(`[data-effect="${id}"]`), 1150);
  const card = page.locator(`#rules .tier-card[data-tier="${options.level || 'medium'}"]`);
  for (const [key, value] of Object.entries(fields)) await slowFill(card.locator(`[data-param="${key}"]`), value);
  await pause(800);
  await slowClick(card.getByRole('button', { name: '预览此级别' }), 500);
  await page.locator('#settings-overlay').waitFor({ state: 'hidden' });
  await pause(options.watch ?? 2100);
  const after = await snap();
  await note(`互动 ${id}`);
  return { before, after };
}
async function screenshot(name) {
  await page.screenshot({ path: resolve(TMP, `V5.6-功能互动-${name}.png`) });
}

try {
  await page.goto(pathToFileURL(HTML).href + '?qa=1');
  await page.waitForFunction(() => window.__pegQa?.snapshot() && document.getElementById('pattern-name')?.textContent);
  await pause(1700);
  assert.match(await page.title(), /拼豆/);
  await note('工作台初始画面');
  await screenshot('起始');
  if (PROBE) {
    await openMenu();
    await screenshot('互动设置');
    console.log(JSON.stringify({ probe: true, title: await page.title(), menu: await page.locator('#effect-tabs').textContent(), errors }));
  } else {
    // 工作台、图纸和模式：所有画面与变化均来自真实 HTML 控件。
    await openMenu('base');
    await slowClick(page.locator('#transparent-background'), 800);
    await closeMenu();
    await pause(1100);
    await openMenu('library');
    await slowClick(page.locator('#menu-choose-pattern'), 700);
    await page.locator('#pattern-overlay.open').waitFor();
    await pause(1300);
    await slowClick(page.locator('#pattern-grid .pattern-card').filter({ hasText: '蜷睡橘猫' }).first(), 1100);
    await page.waitForFunction(() => document.getElementById('pattern-name').textContent.includes('蜷睡橘猫'));
    await note('选用蜷睡橘猫图纸');
    await screenshot('选图');

    await openMenu('modes');
    await pause(1300);
    await chooseOption(page, '#play-mode', 'free');
    await page.waitForFunction(() => window.__pegQa.mode().playMode === 'free');
    await pause(1600);
    await closeMenu();
    await note('自由创作模式');
    await pause(1200);
    await openMenu('modes');
    await chooseOption(page, '#play-mode', 'pattern');
    await page.waitForFunction(() => window.__pegQa.mode().playMode === 'pattern');
    await pause(900);
    await closeMenu();
    await note('返回单图模式');

    await openMenu('base');
    await chooseOption(page, '#jar-filter', 'needed');
    await pause(1000);
    await closeMenu();
    // QA 钩子只定位真实柱位与豆盒，实际拿豆、放豆仍用鼠标操作。
    const cells = await page.evaluate(() => {
      const size = window.__pegQa.snapshot().size;
      const inv = window.__pegQa.inventory();
      const out = [];
      for (let row = 0; row < size && out.length < 6; row++) for (let col = 0; col < size && out.length < 6; col++) {
        const point = window.__pegQa.cellPoint(row, col);
        const hit = window.__pegQa.hit(point.x, point.y);
        if (!hit?.target) continue;
        const shade = inv.find(item => item.hex === hit.target);
        const jar = shade && window.__pegQa.palettePoint(shade.code);
        if (jar) out.push({ row, col, point, jar });
      }
      return out;
    });
    assert.equal(cells.length, 6, '没有找到六个可拼的柱位与豆盒');
    await page.mouse.move(cells[0].point.x, cells[0].point.y, { steps: 22 });
    await page.keyboard.down('KeyM');
    await pause(2000);
    await page.keyboard.up('KeyM');
    for (const cell of cells) {
      await page.mouse.move(cell.jar.x, cell.jar.y, { steps: 25 });
      await pause(330);
      await page.mouse.click(cell.jar.x, cell.jar.y);
      await pause(800);
      await page.mouse.move(cell.point.x, cell.point.y, { steps: 28 });
      await pause(320);
      await page.mouse.click(cell.point.x, cell.point.y);
      await pause(1050);
    }
    assert.ok((await snap()).placed.filter(Boolean).length >= 4, '手工取豆放豆未生效');
    await note('逐颗取豆并放到柱位');
    await screenshot('手动拼豆');

    // 互动级别由主播新增、命名、绑定礼物、设用量并启用；再直接预览新增级别。
    await openMenu();
    await slowClick(page.locator('[data-effect="help"]'), 1000);
    await slowClick(page.locator('#add-interaction-level'), 900);
    const custom = page.locator('#rules .tier-card').last();
    const customId = await custom.getAttribute('data-tier');
    assert.ok(customId?.startsWith('custom-'), '新增级别未显示');
    await slowFill(custom.locator('[data-param="name"]'), '满屏助力');
    await slowFill(custom.locator('[data-param="giftName"]'), '助力冲刺');
    await slowFill(custom.locator('[data-param="amount"]'), '900');
    await slowClick(custom.locator('input[type="checkbox"]'), 900);
    assert.equal(await custom.locator('input[type="checkbox"]').isChecked(), true);
    await screenshot('自定义级别');
    await pause(1600);
    await slowClick(custom.getByRole('button', { name: '预览此级别' }), 600);
    await page.locator('#settings-overlay').waitFor({ state: 'hidden' });
    await page.waitForFunction(() => window.__pegQa.snapshot().placed.filter(Boolean).length >= 900);
    await pause(2400);
    await note('自定义级别帮助拼豆 900 颗');
    await screenshot('帮助拼豆');

    const swap = await effect('swap', { amount: 95 }, { watch: 2400 });
    assert.ok(swap.after.placed.some((bead, i) => bead && swap.before.placed[i] && bead.color !== swap.before.placed[i].color), '随机换豆未改变颜色');
    await screenshot('随机换豆');
    const remove = await effect('remove', { amount: 105 }, { watch: 2200 });
    assert.ok(remove.after.placed.filter(Boolean).length < remove.before.placed.filter(Boolean).length, '减豆子未移走豆');
    await screenshot('减豆子');
    const hide = await effect('hide', { amount: 8 }, { watch: 2600 });
    assert.ok(hide.after.hintHiddenUntil > Date.now(), '隐藏提示未生效');
    await screenshot('隐藏提示');
    await pause(5300);

    const confiscate = await effect('confiscate', { amount: 60 }, { watch: 1800 });
    assert.ok(confiscate.after.tweezersLockedUntil > Date.now(), '工具没收未生效');
    const blockedJar = cells[0].jar;
    await page.mouse.move(blockedJar.x, blockedJar.y, { steps: 25 });
    await page.mouse.click(blockedJar.x, blockedJar.y);
    await pause(1800);
    await screenshot('没收工具');
    await pause(1800);

    const pen = await effect('pen', { amount: 60, capacity: 16 }, { watch: 1800 });
    assert.ok(pen.after.penUntil > Date.now(), '升级拼豆笔未生效');
    assert.match(await page.locator('#tool-name').textContent(), /升级拼豆笔/);
    await screenshot('升级拼豆笔');
    const extra = await effect('extra', { amount: 2 }, { watch: 2300 });
    assert.ok(extra.after.requiredRounds > extra.before.requiredRounds, '增加必拼遍数未生效');
    await screenshot('增加遍数');

    const spill = await effect('spill', { presses: 2, decay: 0 }, { watch: 2300 });
    assert.equal(spill.after.traySpilled, true, '装豆托盘未打翻');
    await screenshot('打翻托盘');
    // 五段复原；每下都是独立 KeyDown/KeyUp，留出时间看进度与飞回的豆盒。
    for (let stage = 0; stage < 5; stage++) {
      for (let press = 0; press < 2; press++) {
        await page.keyboard.press('Space');
        await pause(620);
      }
      await pause(900);
      await note(`托盘复原第 ${stage + 1} 段`);
    }
    await page.waitForFunction(() => !window.__pegQa.snapshot().traySpilled);
    await screenshot('托盘复原');
    await pause(1700);

    const shake = await effect('shake', { amount: 3, strength: 100, duration: 4 }, { watch: 5400 });
    await page.waitForFunction(() => window.__pegQa.snapshot().fallen.length > 0, null, { timeout: 15000 });
    assert.ok(shake.after.fallen.length > 0 || (await snap()).fallen.length > 0, '摇桌未摇落已拼豆');
    await screenshot('摇桌落豆');
    await note('九种互动效果全部预览完毕');
    await pause(3200);

    assert.deepEqual(errors, [], '录制期间出现页面脚本错误');
    const video = page.video();
    await page.close();
    const raw = resolve(TMP, 'V5.6-功能互动-浏览器原片.webm');
    await video.saveAs(raw);
    await context.close();
    await browser.close();
    browser = null;
    const encode = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', raw,
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart', '-an', VIDEO], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
    assert.equal(encode.status, 0, encode.stderr);
    const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration,size:stream=codec_name,width,height,nb_frames', '-of', 'json', VIDEO], { encoding: 'utf8' });
    assert.equal(probe.status, 0, probe.stderr);
    const info = JSON.parse(probe.stdout);
    const report = { file: VIDEO, format: info.format, video: info.streams[0], beats, pageErrors: errors };
    await writeFile(resolve(TMP, 'V5.6-功能互动-录制检查.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ output: VIDEO, duration: info.format.duration, size: info.format.size, frames: info.streams[0].nb_frames, beats: beats.length, pageErrors: errors.length }));
  }
} catch (error) {
  await screenshot('失败现场').catch(() => {});
  console.error('页面错误', errors);
  throw error;
} finally {
  if (browser) await browser.close();
}
