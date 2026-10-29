import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const chrome = [
  process.env.CHROME_PATH,
  chromium.executablePath(),
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find(path => path && existsSync(path));

const script = chrome ? (await build({
  stdin: {
    contents: "import {createPegScene} from './src/scene.js'; window.createPegScene = createPegScene;",
    sourcefile: 'scene-browser-check.js',
    resolveDir: fileURLToPath(new URL('..', import.meta.url)),
  },
  bundle: true,
  write: false,
  platform: 'browser',
  format: 'iife',
})).outputFiles[0].text : null;

async function pageForScene() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: chrome,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl'],
  });
  const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
  await page.setContent('<style>html,body{margin:0;background:transparent}#scene{width:900px;height:900px}</style><div id="scene"></div>');
  await page.addScriptTag({ content: script });
  return { browser, page };
}

test('dense 48 by 48 target hints use bounded WebGL draw calls', { skip: !chrome }, async t => {
  const { browser, page } = await pageForScene();
  try {
    const count = await page.evaluate(() => {
      let draws = 0;
      const proto = WebGL2RenderingContext.prototype;
      const original = new Map();
      for (const name of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) {
        original.set(name, proto[name]);
        proto[name] = function (...args) { draws++; return original.get(name).apply(this, args); };
      }
      try {
        const pattern = { cells: Array(48 * 48).fill('#ff0000') };
        const view = createPegScene({ container: document.getElementById('scene'), size: 48, pattern,
          palette: [{ hex: '#ff0000', code: 'P' }], onCell: () => {} });
        if (view.isFallback) { view.destroy(); return null; }
        view.render();
        const oneFrame = draws;
        view.destroy();
        return oneFrame;
      } finally {
        for (const [name, fn] of original) proto[name] = fn;
      }
    });
    if (count == null) t.skip('WebGL2 is unavailable on this browser host');
    else assert.ok(count < 200, `dense empty board used ${count} draw calls`);
  } finally {
    await browser.close();
  }
});

test('destroy disconnects the board resize observer', { skip: !chrome }, async () => {
  const { browser, page } = await pageForScene();
  try {
    const disconnected = await page.evaluate(() => {
      const Original = window.ResizeObserver;
      let count = 0;
      window.ResizeObserver = class extends Original {
        disconnect() { count++; super.disconnect(); }
      };
      try {
        const view = createPegScene({ container: document.getElementById('scene'), size: 1,
          pattern: { cells: ['#ff0000'] }, palette: [{ hex: '#ff0000', code: 'P' }], onCell: () => {} });
        view.destroy();
        return count;
      } finally {
        window.ResizeObserver = Original;
      }
    });
    assert.equal(disconnected, 1);
  } finally {
    await browser.close();
  }
});
