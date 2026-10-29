// Screenshots the running dev server at chosen scroll positions with headless Chrome.
// Usage: node tools/shoot.mjs <out-dir> [p1,p2,...] [--scrub from:to:shots] [--url http://localhost:5179/]
// --scrub scrolls smoothly from `from` to `to` over ~1.5 s and takes `shots` frames
// along the way (used to catch the time-based explosions).
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const args = process.argv.slice(2);
const outDir = args[0];
if (!outDir) {
  console.error('usage: node tools/shoot.mjs <out-dir> [p1,p2,...] [--scrub from:to:shots]');
  process.exit(1);
}
const flag = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const url = flag('--url') || 'http://localhost:5179/';
const list = args[1] && !args[1].startsWith('--') ? args[1] : '';
const scrub = flag('--scrub');
const evalCode = flag('--eval'); // JS run in the page once it is ready (debugging)
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'],
});
const [vw, vh] = (flag('--size') || '1280x720').split('x').map(Number);
const page = await browser.newPage({ viewport: { width: vw, height: vh }, deviceScaleFactor: 1 });
if (args.includes('--reduced')) await page.emulateMedia({ reducedMotion: 'reduce' });
const problems = [];
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') problems.push(`${m.type()}: ${m.text()}`);
});
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));

await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(
  () => {
    const loader = document.getElementById('loader');
    return !loader || loader.classList.contains('done') || loader.classList.contains('error');
  },
  null,
  { timeout: 90000 },
);
const info = await page.evaluate(() => {
  const gl = document.createElement('canvas').getContext('webgl2');
  const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
  const loader = document.getElementById('loader');
  return {
    renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown',
    error: loader && loader.classList.contains('error') ? document.getElementById('loader-text').textContent : null,
  };
});
console.log(`gpu: ${info.renderer}`);
if (info.error) console.log(`page error: ${info.error}`);
if (evalCode) console.log(`eval: ${JSON.stringify(await page.evaluate(evalCode))}`);

const fps = async () =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        let frames = 0;
        const start = performance.now();
        const tick = () => {
          frames++;
          if (performance.now() - start < 1000) requestAnimationFrame(tick);
          else resolve(frames);
        };
        requestAnimationFrame(tick);
      }),
  );

// --mouse x,y moves the mouse there before each listed shot (hover checks).
const mouse = flag('--mouse');
for (const value of list ? list.split(',').map(Number) : []) {
  await page.evaluate((p) => window.__demo.setProgress(p), value);
  await page.waitForTimeout(1800);
  if (mouse) {
    const [mx, my] = mouse.split(',').map(Number);
    await page.mouse.move(mx - 20, my - 20);
    await page.mouse.move(mx, my, { steps: 5 });
    await page.waitForTimeout(900);
    // --click also clicks there and reports where the scroll ends up.
    if (args.includes('--click')) {
      await page.mouse.click(mx, my);
      await page.waitForTimeout(2500);
      console.log(`after click: progress ${(await page.evaluate(() => window.__demo.progress)).toFixed(3)}`);
    }
  }
  const file = join(outDir, `p-${value.toFixed(3)}.png`);
  await page.screenshot({ path: file });
  console.log(`shot ${file} (${await fps()} fps)`);
}

if (scrub) {
  const [from, to, shots] = scrub.split(':').map(Number);
  await page.evaluate((p) => window.__demo.setProgress(p), from);
  await page.waitForTimeout(1200);
  const steps = 45;
  for (let i = 1; i <= steps; i++) {
    const p = from + ((to - from) * i) / steps;
    await page.evaluate((v) => window.scrollTo(0, v * (document.documentElement.scrollHeight - innerHeight)), p);
    await page.waitForTimeout(33);
    if (i % Math.max(1, Math.floor(steps / shots)) === 0) {
      const file = join(outDir, `scrub-${p.toFixed(3)}.png`);
      await page.screenshot({ path: file });
      console.log(`shot ${file}`);
    }
  }
}

// --hold shots:ms keeps the scroll still and takes timed shots (explosions play in time).
const hold = flag('--hold');
if (hold) {
  const [shots, interval] = hold.split(':').map(Number);
  for (let i = 1; i <= shots; i++) {
    await page.waitForTimeout(interval);
    const file = join(outDir, `hold-${String(i * interval).padStart(4, '0')}ms.png`);
    await page.screenshot({ path: file });
    console.log(`shot ${file}`);
  }
}

if (problems.length) console.log(`console:\n  ${[...new Set(problems)].slice(0, 30).join('\n  ')}`);
await browser.close();
