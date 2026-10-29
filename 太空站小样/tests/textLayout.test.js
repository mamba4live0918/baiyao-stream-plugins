import { test } from 'node:test';
import assert from 'node:assert/strict';
import { glyphQuad, layoutText } from '../src/text/textLayout.js';

// Fake glyph metrics at a 10px atlas size.
const glyph = (char) => ({
  fontSize: 10,
  advance: char === ' ' ? 5 : 10,
  glyphTop: 8,
  glyphLeft: 0,
  buffer: 2,
  width: 14,
  height: 14,
});

test('pens advance by the glyph advance scaled to the requested size', () => {
  const { chars, width } = layoutText('AB', { glyph, size: 20 });
  assert.deepEqual(chars.map((c) => c.pen), [0, 20]);
  assert.equal(width, 40);
});

test('letter spacing goes between glyphs but not after the last one', () => {
  const { chars, width } = layoutText('AB', { glyph, size: 20, letterSpacing: 0.1 });
  assert.deepEqual(chars.map((c) => c.pen), [0, 22]);
  assert.equal(width, 42);
});

test('right and centre alignment shift each line to the anchor', () => {
  assert.deepEqual(layoutText('AB', { glyph, size: 20, align: 'right' }).chars.map((c) => c.pen), [-40, -20]);
  assert.deepEqual(layoutText('AB', { glyph, size: 20, align: 'center' }).chars.map((c) => c.pen), [-20, 0]);
});

test('each new line drops by lineHeight and the block reports its size', () => {
  const layout = layoutText('AB\nC', { glyph, size: 20, lineHeight: 1.3 });
  const baselines = layout.chars.map((c) => +c.baseline.toFixed(6));
  assert.deepEqual(baselines, [-18, -18, -44]);
  assert.equal(layout.width, 40);
  assert.ok(Math.abs(layout.height - 52) < 1e-9);
});

test('empty lines keep zero width', () => {
  const layout = layoutText('\nA', { glyph, size: 10, letterSpacing: 0.5 });
  assert.equal(layout.chars.length, 1);
  assert.equal(layout.width, 10);
});

test('glyph quads include the SDF padding on every side', () => {
  const q = glyphQuad(100, -18, 2, glyph('A'));
  assert.deepEqual(q, { x: 96, y: 2, w: 28, h: 28 });
});
