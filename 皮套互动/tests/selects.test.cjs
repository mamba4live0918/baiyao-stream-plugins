'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const script = path.join(__dirname, '../src/selects.js');
const css = path.join(__dirname, '../src/selects.css');
let browser;
test.before(async () => {
  let playwright;
  try { playwright = require('playwright'); }
  catch { playwright = require(process.env.PUPPET_PLAYWRIGHT || path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
  const chrome = process.env.PUPPET_BROWSER || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : undefined);
  browser = await playwright.chromium.launch({ headless: true, ...(chrome ? { executablePath: chrome } : {}) });
});
test.after(async () => { if (browser) await browser.close(); });
async function pageFor(t, markup = '') {
  assert.equal(fs.existsSync(script), true, 'in-page select implementation must exist');
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  t.after(() => page.close());
  await page.setContent('<!doctype html><title>Select test</title><style>body{margin:20px}#settings{width:360px}label{display:flex;gap:12px;align-items:center}</style><section id="settings">' + (markup || '<label>画布分辨率 <select id="resolution"><option value="hd">1920 × 1080</option><option value="portrait">720 × 1280</option><option value="custom">自定义</option></select></label>') + '</section><button id="outside">Outside</button>');
  await page.addStyleTag({ path: css });
  await page.addScriptTag({ path: script });
  await page.evaluate(() => { window.events = []; window.errors = []; document.querySelector('#settings').addEventListener('input', e => events.push('input:' + e.target.value)); document.querySelector('#settings').addEventListener('change', e => events.push('change:' + e.target.value)); window.controls = PuppetSelects.setup(document.querySelector('#settings')); });
  return page;
}

test('clicking a combobox exposes in-page options and updates the retained native select', async t => {
  const page = await pageFor(t);
  const combo = page.getByRole('combobox', { name: '画布分辨率', exact: true });
  assert.equal(await combo.count(), 1);
  assert.equal(await combo.getAttribute('data-select-id'), 'resolution');
  assert.deepEqual(await page.locator('#resolution').evaluate(el => ({ hidden: el.hidden, aria: el.getAttribute('aria-hidden'), tab: el.tabIndex })), { hidden: true, aria: 'true', tab: -1 });
  await combo.click();
  assert.equal(await page.getByRole('listbox').count(), 1);
  assert.equal(await page.getByRole('listbox').evaluate(el => el.parentNode === document.body), true);
  await page.getByRole('option', { name: '720 × 1280', exact: true }).click();
  assert.equal(await page.locator('#resolution').inputValue(), 'portrait');
  assert.equal(await combo.innerText(), '720 × 1280');
  assert.deepEqual(await page.evaluate(() => events), ['input:portrait', 'change:portrait']);
  assert.equal(await page.getByRole('listbox').count(), 0);
});

test('choosing the current preset still dispatches native change for a pending custom draft', async t => {
  const page = await pageFor(t);
  await page.evaluate(() => {
    window.customDraftVisible = true;
    document.querySelector('#resolution').onchange = () => { window.customDraftVisible = false; };
  });
  await page.getByRole('combobox').click();
  await page.getByRole('option', { name: '1920 × 1080', exact: true }).click();
  assert.equal(await page.locator('#resolution').inputValue(), 'hd');
  assert.deepEqual(await page.evaluate(() => events), ['input:hd', 'change:hd']);
  assert.equal(await page.evaluate(() => customDraftVisible), false);
});

test('keyboard navigation skips disabled options and Escape never closes the parent settings', async t => {
  const page = await pageFor(t, '<select id="choice" aria-label="动作"><option value="a">打</option><option value="disabled" disabled>不可用</option><option value="b">捏</option><option value="c">踢</option></select>');
  await page.evaluate(() => { window.parentEscapes = 0; document.addEventListener('keydown', e => { if (e.key === 'Escape') parentEscapes++; }); });
  const combo = page.getByRole('combobox', { name: '动作', exact: true });
  await combo.focus(); await combo.press('ArrowDown'); await combo.press('ArrowDown'); await combo.press('Enter');
  assert.equal(await page.locator('#choice').inputValue(), 'b');
  await combo.press('Space'); await combo.press('End'); await combo.press('Enter');
  assert.equal(await page.locator('#choice').inputValue(), 'c');
  await combo.press('Home'); await combo.press('Enter');
  assert.equal(await page.locator('#choice').inputValue(), 'a');
  await combo.press('Enter'); await combo.press('Escape');
  assert.equal(await page.getByRole('listbox').count(), 0);
  assert.equal(await page.evaluate(() => parentEscapes), 0);
  await combo.press('Escape');
  assert.equal(await page.evaluate(() => parentEscapes), 1);
});

test('explicit refresh reflects programmatic value without dispatching user changes', async t => {
  const page = await pageFor(t);
  await page.evaluate(() => { const select = document.querySelector('#resolution'); select.value = 'custom'; PuppetSelects.refresh(select); });
  assert.equal(await page.getByRole('combobox').innerText(), '自定义');
  assert.deepEqual(await page.evaluate(() => events), []);
  await page.evaluate(() => { document.querySelector('#resolution').value = 'hd'; PuppetSelects.refresh(); });
  assert.equal(await page.getByRole('combobox').innerText(), '1920 × 1080');
});

test('new rule selects and replaced VTS options are enhanced without duplicate controls', async t => {
  const page = await pageFor(t);
  await page.evaluate(() => { const row = document.createElement('div'); row.id = 'rule'; row.innerHTML = '<select aria-label="礼物动作 1"><option value="hit">打</option><option value="kick">踢</option></select>'; document.querySelector('#settings').append(row); });
  const gift = page.getByRole('combobox', { name: '礼物动作 1', exact: true });
  await gift.waitFor();
  await page.evaluate(() => { const select = document.querySelector('#resolution'); select.replaceChildren(new Option('新表情', 'expression')); PuppetSelects.setup(document.querySelector('#settings')); });
  await page.waitForFunction(() => document.querySelector('[role="combobox"]').textContent === '新表情');
  assert.equal(await page.getByRole('combobox').count(), 2);
  await gift.click(); await page.getByRole('option', { name: '踢', exact: true }).click();
  assert.equal(await page.locator('#rule select').inputValue(), 'kick');
});

test('disabled select changes close its menu and disabled optgroups cannot be selected', async t => {
  const page = await pageFor(t, '<select id="choice" aria-label="动作"><optgroup label="不可用" disabled><option value="x">禁止</option></optgroup><option value="a" selected>打</option><option value="b">捏</option></select>');
  const combo = page.getByRole('combobox', { name: '动作', exact: true });
  await combo.click();
  assert.equal(await page.getByRole('option', { name: '禁止', exact: true }).isDisabled(), true);
  await page.evaluate(() => { document.querySelector('#choice').disabled = true; });
  await page.waitForFunction(() => document.querySelector('[role="combobox"]').disabled);
  assert.equal(await page.getByRole('listbox').count(), 0);
  await page.evaluate(() => { document.querySelector('#choice').disabled = false; });
  await page.waitForFunction(() => !document.querySelector('[role="combobox"]').disabled);
});

test('outside clicks, outside scrolling and viewport resizing close menus', async t => {
  const page = await pageFor(t);
  const combo = page.getByRole('combobox');
  await combo.click(); await page.locator('#outside').click();
  assert.equal(await page.getByRole('listbox').count(), 0);
  await combo.click(); await page.evaluate(() => document.querySelector('#settings').dispatchEvent(new Event('scroll')));
  assert.equal(await page.getByRole('listbox').count(), 0);
  await combo.click(); await page.setViewportSize({ width: 700, height: 500 });
  await page.waitForFunction(() => !document.querySelector('[role="listbox"]'));
});

test('narrow-screen popup remains inside the viewport and its own scroll stays open', async t => {
  const options = Array.from({ length: 24 }, (_, i) => `<option value="${i}">很长的模型参数说明 ${i}，可以在菜单中换行阅读</option>`).join('');
  const page = await pageFor(t, '<select aria-label="长参数">' + options + '</select>');
  await page.setViewportSize({ width: 320, height: 260 });
  await page.evaluate(() => { document.querySelector('#settings').style.cssText = 'position:fixed;right:2px;bottom:2px;width:160px'; });
  await page.getByRole('combobox').click();
  const box = await page.getByRole('listbox').boundingBox();
  assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= 320 && box.y + box.height <= 260, JSON.stringify(box));
  await page.getByRole('listbox').evaluate(el => { el.scrollTop = 50; el.dispatchEvent(new Event('scroll')); });
  assert.equal(await page.getByRole('listbox').count(), 1);
});

test('removing a dynamic select releases its open menu and setup cleanup restores originals', async t => {
  const page = await pageFor(t);
  await page.getByRole('combobox').click();
  await page.evaluate(() => document.querySelector('#resolution').remove());
  await page.waitForFunction(() => !document.querySelector('[role="listbox"]'));
  assert.equal(await page.locator('.ui-select').count(), 0);
  await page.evaluate(() => { document.querySelector('#settings').innerHTML = '<label>方向 <select id="direction"><option>左</option></select></label>'; });
  await page.getByRole('combobox', { name: '方向', exact: true }).waitFor();
  await page.evaluate(() => controls.destroy());
  assert.equal(await page.locator('.ui-select').count(), 0);
  assert.equal(await page.locator('#direction').isVisible(), true);
  assert.equal(await page.locator('#direction').getAttribute('aria-hidden'), null);
});
