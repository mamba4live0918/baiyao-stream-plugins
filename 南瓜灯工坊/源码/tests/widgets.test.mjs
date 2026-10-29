// 摆位置：三个小组件的框。挪了贡献榜或糖罐，没摆过的灯展不能跟着变窄（以前会被挤成一盏灯宽）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { widgetRects } from '../src/widgets.js';

const L = { W: 1920, H: 1080, m: 1080, margin: 30, flip: false, tower: { x: 1790 } };
const base = { show: { garland: true, board: true }, layout: { garland: null, board: null, bank: null } };

test('default layout: board left, bank right, garland between them', () => {
  const r = widgetRects(L, base);
  assert.ok(r.board.x < r.garland.x && r.garland.x + r.garland.w < r.bank.x);
  assert.ok(r.garland.w > 800, 'garland spans the gap: ' + r.garland.w);
});

test('moving the board or the bank does not squeeze an unplaced garland', () => {
  const before = widgetRects(L, base).garland;
  const movedBoard = widgetRects(L, { ...base, layout: { ...base.layout, board: { x: 0.6, y: 0.2, s: 1 } } });
  assert.deepEqual(movedBoard.garland, before);
  assert.ok(Math.abs(movedBoard.board.x - 0.6 * L.W) < 1, 'the board itself moved');
  const movedBank = widgetRects(L, { ...base, layout: { ...base.layout, bank: { x: 0.3, y: 0.5, s: 1.5 } } });
  assert.deepEqual(movedBank.garland, before);
});

test('a placed garland keeps its own place and length', () => {
  const r = widgetRects(L, { ...base, layout: { ...base.layout, garland: { x: 0.1, y: 0.4, w: 0.5, s: 1.2 } } });
  assert.ok(Math.abs(r.garland.x - 192) < 1 && Math.abs(r.garland.w - 960) < 1 && Math.abs(r.garland.y - 432) < 1);
});

test('hidden board: the unplaced garland runs from the edge to the bank', () => {
  const r = widgetRects(L, { ...base, show: { garland: true, board: false } });
  assert.equal(r.board, undefined);
  assert.ok(r.garland.x <= L.margin + 1 && r.garland.x + r.garland.w < r.bank.x);
});
