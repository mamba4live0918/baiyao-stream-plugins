import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layout2d, BASE_W } from '../src/layout2d.js';

const SIZES = [[2048, 1536], [1920, 1080], [1440, 2560], [1280, 720], [800, 600]];

test('the world is 15 m wide at size 100, wider or narrower with the size setting', () => {
  const L = layout2d(2048, 1536); assert.equal(L.worldW, BASE_W); assert.ok(Math.abs(L.ppm - 2048 / 15) < 1e-9); assert.ok(Math.abs(L.worldH - 1536 / L.ppm) < 1e-9);
  assert.ok(Math.abs(layout2d(2048, 1536, { size: 150 }).worldW - 10) < 1e-9, '150% 大小 = 10 米宽');
});

test('bins sit in front of the counter, centered, with their rims below the counter top', () => {
  for (const [W, H] of SIZES) for (const mode of ['garbage', 'express']) for (const size of [60, 100, 140, 180]) for (const counterY of [8, 20, 40]) {
    const L = layout2d(W, H, { size, counterY, mode }), n = mode === 'garbage' ? 4 : 3, tag = `${W}×${H} ${mode} ${size}% ${counterY}%`;
    assert.equal(L.bins.length, n, tag);
    const mid = (L.bins[0].x + L.bins[n - 1].x) / 2; assert.ok(Math.abs(mid - L.worldW / 2) < 1e-6, tag + ' 桶排居中');
    for (const b of L.bins) { assert.ok(b.top <= L.counter.top - .2, tag + ' 桶口低于台面'); assert.ok(b.bottom >= .2, tag + ' 桶下面留出漏桶落地的空'); assert.ok(b.x - b.w / 2 >= -1e-9 && b.x + b.w / 2 <= L.worldW + 1e-9, tag + ' 桶在窗口里'); }
    for (let i = 1; i < n; i++) assert.ok(L.bins[i].x - L.bins[i - 1].x >= L.bins[i].w, tag + ' 桶不重叠');
    assert.ok(L.truck.x1 <= L.bins[0].x - L.bins[0].w / 2 + 1e-9, tag + ' 货车不压到第一个桶');
    assert.ok(L.belt.x0 >= L.truck.x1 - 1e-9 && L.belt.x1 > L.belt.x0 + 1, tag + ' 传送带接在车尾后面');
    assert.ok(L.counter.x0 <= L.belt.x1 && L.counter.x1 === L.worldW, tag + ' 柜台从传送带末端铺到右边');
    assert.ok(L.scan.x > L.counter.x0 + 1 && L.scan.x < L.worldW - .4, tag + ' 识别台在台面右端');
    assert.ok(L.counter.top >= 2.0 && L.counter.top < L.worldH * .6, tag + ' 台面高度合理');
  }
});

test('the counter top follows the setting until the bins no longer fit', () => {
  const lo = layout2d(2048, 1536, { counterY: 10 }), hi = layout2d(2048, 1536, { counterY: 35 });
  assert.ok(hi.counter.top > lo.counter.top); assert.ok(Math.abs(hi.counter.top - hi.worldH * .35) < 1e-9);
  assert.ok(lo.counter.top >= 2.0, '太低时托底，桶还放得下');
  assert.ok(hi.bins[0].h > lo.bins[0].h, '台面高时桶也大一点');
});
