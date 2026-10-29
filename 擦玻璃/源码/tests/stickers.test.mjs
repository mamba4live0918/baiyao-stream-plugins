import test from 'node:test';
import assert from 'node:assert/strict';
import { trimBounds, gridFromAlpha, gridInside, rawInside, fullInside, spanAlong, distanceField } from '../src/art/sticker-art.js';
import { coverShape, paperEnvelope } from '../src/game/actors/flyer-shape.js';
import { defaultQty, actionDef } from '../src/config.js';

/* 一张 w×h 的透明度图：fn(x, y) 为真的地方是图案 */
const alphaMap = (w, h, fn) => {
  const a = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) a[y * w + x] = fn(x, y) ? 255 : 0;
  return a;
};

test('我的贴纸：裁掉四周透明的边；全透明的图认不出来', () => {
  const a = alphaMap(100, 80, (x, y) => x >= 20 && x < 60 && y >= 10 && y < 70);
  assert.deepEqual(trimBounds(a, 100, 80), { x0: 20, y0: 10, x1: 60, y1: 70 });
  assert.equal(trimBounds(new Uint8ClampedArray(50 * 50), 50, 50), null);
  const soft = alphaMap(40, 40, () => false);
  soft[5 * 40 + 5] = 10;
  assert.equal(trimBounds(soft, 40, 40), null, '很淡的软阴影不算图案');
});

test('我的贴纸：粗格子记住哪儿有图案（圆形贴纸的四个角是空的），边上往外宽一格好抓', () => {
  const w = 96;
  const h = 96;
  const a = alphaMap(w, h, (x, y) => (x - 48) ** 2 + (y - 48) ** 2 < 40 ** 2);
  const g = gridFromAlpha(a, w, h, 48);
  assert.equal(g.n, 48);
  assert.equal(g.m, 48);
  const pw = 300;
  const ph = 300;
  assert.ok(gridInside(g, 0, 0, pw, ph), '中间有图案');
  assert.ok(!gridInside(g, -145, -145, pw, ph), '左上角是空的');
  assert.ok(!gridInside(g, 145, 140, pw, ph), '右下角是空的');
  assert.ok(gridInside(g, 0, -126, pw, ph), '圆的上沿（往外宽了一格）也算');
  assert.ok(!rawInside(g, 0, -126, pw, ph) && rawInside(g, 0, -118, pw, ph), '看露没露出来用的格子不放宽');
  assert.ok(!gridInside(g, 0, -151, pw, ph), '纸外面不算');
});

test('我的贴纸：通用的纸面形状不猜异形（盖没盖住由版式按不透明格子算）；最外沿按整个长方形算', () => {
  const cover = coverShape('custom', 300, 200, 1);
  assert.equal(cover(0, 0), false, '通用形状不替异形贴纸做主');
  const env = paperEnvelope('custom', 300, 200, 1);
  assert.equal(env.hw, 150);
  assert.equal(env.hh, 100);
  assert.equal(env.r, 0);
  assert.ok(env.inside(149, 99) && !env.inside(151, 0));
  assert.equal(defaultQty('sticker'), 1, '一下 = 我的贴纸 1 张');
  assert.equal(actionDef('sticker').kind, 'mess');
});

test('我的贴纸：刀模白边按到图案的距离算——孤零零一个点、一条细线旁边都是实心的一圈，没有漏洞', () => {
  const w = 60;
  const h = 40;
  const solid = new Uint8Array(w * h);
  solid[20 * w + 15] = 1;
  for (let x = 35; x < 55; x++) solid[20 * w + x] = 1;
  const d = distanceField(solid, w, h);
  assert.equal(d[20 * w + 15], 0);
  assert.ok(Math.abs(d[20 * w + 18] - 3) < 1e-6, '正右边 3 像素');
  assert.ok(Math.abs(d[24 * w + 18] - 5) < 1e-6, '3-4-5');
  /* 半径 6 以内每个像素都离图案不超过 6：白边是实心的（以前只在圆周上盖印，点和白圈之间是空的） */
  const r = 6;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const near = Math.hypot(x - 15, y - 20) <= r || (Math.abs(y - 20) <= r && x >= 35 - r && x <= 54 + r && (x >= 35 && x <= 54 ? true : Math.hypot(x < 35 ? x - 35 : x - 54, y - 20) <= r));
      if (near) assert.ok(d[y * w + x] <= r + 1e-6, `(${x},${y}) 应该在白边里`);
    }
  }
  assert.ok(d[0] > 10, '远处的不算');
});

test('我的贴纸：翘起的角从图案的边开始——圆形贴纸斜着撕，开头在圆上，不在透明的外框角上', () => {
  const w = 96;
  const h = 96;
  const a = alphaMap(w, h, (x, y) => (x - 48) ** 2 + (y - 48) ** 2 < 40 ** 2);
  const g = gridFromAlpha(a, w, h, 48);
  const pw = 300;
  const ph = 300;
  const ax = Math.SQRT1_2;
  const ay = Math.SQRT1_2;
  const [s0, s1] = spanAlong(g, ax, ay, pw, ph);
  const R = (40 / 96) * pw;
  assert.ok(Math.abs(s0 + R) < 12 && Math.abs(s1 - R) < 12, `图案沿对角线从 ${s0.toFixed(1)} 到 ${s1.toFixed(1)}，圆半径 ${R.toFixed(1)}`);
  assert.ok(s0 > -pw * Math.SQRT1_2 + 30, '比外框的角（-212）靠里得多');
  /* 撕烂以后从撕口往后算：开头不早于撕口 */
  const [t0] = spanAlong(g, ax, ay, pw, ph, 20);
  assert.ok(t0 >= 20 && t0 < 30);
  assert.equal(spanAlong(g, ax, ay, pw, ph, R + 20), null, '撕口后面没有图案了');
});

test('我的贴纸：只有完全不透明的格子算"盖得住"——圆心盖得住，四个角、半透明的边盖不住', () => {
  const w = 96;
  const h = 96;
  const a = alphaMap(w, h, (x, y) => (x - 48) ** 2 + (y - 48) ** 2 < 40 ** 2);
  for (let x = 0; x < w; x++) a[48 * w + x] = Math.min(a[48 * w + x], 200);
  const g = gridFromAlpha(a, w, h, 48);
  const pw = 300;
  const ph = 300;
  assert.ok(fullInside(g, 0, -60, pw, ph), '圆里面盖得住');
  assert.ok(!fullInside(g, -145, -145, pw, ph), '角上是透明的');
  assert.ok(!fullInside(g, 0, (48.5 / 96) * ph - ph / 2, pw, ph), '半透明的那一行盖不住');
  assert.ok(gridInside(g, 0, (48.5 / 96) * ph - ph / 2, pw, ph), '但点得到');
});
