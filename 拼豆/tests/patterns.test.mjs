import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BEAD_PALETTE,
  GENERATED_PALETTE,
  CATEGORIES,
  PRESETS,
  listPresets,
  createPresetPattern,
  mapGridToBoard,
  rasterToPattern,
  colorByHex,
} from '../src/patterns.js';

test('every bead shade has a stable unique code and resolves from its hex color', () => {
  assert.ok(BEAD_PALETTE.length >= 20);
  assert.equal(new Set(BEAD_PALETTE.map(item => item.code)).size, BEAD_PALETTE.length);
  assert.equal(new Set(BEAD_PALETTE.map(item => item.hex)).size, BEAD_PALETTE.length);
  for (const shade of BEAD_PALETTE) {
    assert.match(shade.code, /^P\d{2}$/);
    assert.ok(shade.name);
    assert.equal(colorByHex(shade.hex), shade);
  }
  assert.equal(colorByHex('#0102fe').code, '#0102FE');assert.equal(colorByHex('invalid'),null);
  assert.equal(new Set(GENERATED_PALETTE.map(c=>c.code)).size,GENERATED_PALETTE.length);
  for(const shade of GENERATED_PALETTE){assert.match(shade.code,/^[PG]\d+$/);assert.equal(colorByHex(shade.hex),shade);}
});

test('52 generated patterns replace the gallery, preserve native grids and stay connected', () => {
  assert.equal(PRESETS.length, 52);
  assert.equal(CATEGORIES.length, 6);
  assert.ok(listPresets().every(item=>item.id.startsWith('gen-')));
  assert.equal(new Set(PRESETS.map(item=>item.id)).size, 52);
  const appearances = new Set();
  for (const entry of PRESETS) {
    assert.ok(CATEGORIES.some(group=>group.id===entry.category));
    assert.equal(entry.source.kind,'generated');
    const p=createPresetPattern(entry.id,16),large=createPresetPattern(entry.id,48);
    assert.equal(p.size,Math.max(16,entry.width,entry.height));
    assert.ok(p.size<=48);
    assert.equal(p.cells.length,p.size*p.size);
    assert.equal(p.cells.filter(Boolean).length,entry.source.beads);
    assert.equal(new Set(p.cells.filter(Boolean)).size,entry.source.colors);
    assert.ok(p.cells.every(c=>c===null||/^#[0-9a-f]{6}$/.test(c)));
    assert.equal(large.cells.filter(Boolean).length,p.cells.filter(Boolean).length);
    assert.deepEqual(large.preview,p.preview);
    assert.deepEqual(p.sourceCells,p.cells);
    assert.ok(p.cells.slice(0,p.size).every(c=>c===null));
    const reached=new Set(),todo=[p.cells.findIndex(Boolean)];
    while(todo.length){const i=todo.pop();if(reached.has(i)||!p.cells[i])continue;reached.add(i);const x=i%p.size,y=Math.floor(i/p.size);for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const xx=x+dx,yy=y+dy;if(xx>=0&&xx<p.size&&yy>=0&&yy<p.size)todo.push(yy*p.size+xx);}}
    assert.equal(reached.size,entry.source.beads,entry.name+' must fuse as one piece');
    appearances.add(p.preview.cells.join(','));
  }
  assert.equal(appearances.size,52);
  assert.equal(listPresets('desserts').length,16);
  assert.equal(listPresets('cats-rabbits').length,8);
  assert.deepEqual(listPresets('nonexistent'),[]);
});

test('presets map to 16 through 64 board cells and retain transparent margins', () => {
  for (const size of [16, 24, 32, 48, 64]) {
    const image = createPresetPattern('apple', size);
    assert.equal(image.size, size);
    assert.equal(image.cells.length, size * size);
    assert.equal(image.cells[0], null);
    assert.ok(image.cells.some(Boolean));
  }
  assert.throws(() => createPresetPattern('apple', 15), RangeError);
  assert.throws(() => createPresetPattern('apple', 65), RangeError);
  assert.throws(() => createPresetPattern('apple', 24.5), RangeError);
  assert.throws(() => createPresetPattern('absent', 24), RangeError);
});

test('a larger board adds working space around a preset instead of enlarging its pixels', () => {
  const small = createPresetPattern('cherries', 16);
  const large = createPresetPattern('cherries', 30);
  assert.equal(large.cells.filter(Boolean).length, small.cells.filter(Boolean).length);
  assert.ok(large.cells.slice(0, 7 * 30).every(cell => cell === null));
});

test('a wide pixel image is scaled uniformly and centered on a square board', () => {
  const cells = mapGridToBoard(['#ef4b5a', '#367ac3'], 2, 1, 16);
  assert.equal(cells.length, 256);
  assert.deepEqual(cells.slice(0, 16), Array(16).fill(null));
  assert.deepEqual(cells.slice(4 * 16, 5 * 16), [
    ...Array(8).fill('#ef4b5a'),
    ...Array(8).fill('#367ac3'),
  ]);
  assert.deepEqual(cells.slice(12 * 16, 13 * 16), Array(16).fill(null));
});

test('uploaded raster samples into bead colors while preserving unquantized preview colors', () => {
  const image = {
    width: 2,
    height: 2,
    data: new Uint8ClampedArray([
      239, 75, 90, 255,
      54, 122, 195, 255,
      28, 200, 20, 0,
      255, 90, 150, 255,
    ]),
  };
  const result = rasterToPattern(image, 16);
  assert.equal(result.category, 'custom');
  assert.deepEqual(result.preview, {
    width: 2,
    height: 2,
    cells: ['#ef4b5a', '#367ac3', null, '#ff5a96'],
  });
  assert.equal(result.cells[2 * 16 + 2], '#ef4b5a');
  assert.equal(result.cells[2 * 16 + 12], '#367ac3');
  assert.equal(result.cells[12 * 16 + 2], null);
  assert.ok(new Set(BEAD_PALETTE.map(item => item.hex)).has(result.cells[12 * 16 + 12]));
  assert.notEqual(result.cells[12 * 16 + 12], '#ff5a96');
});

test('alpha threshold skips transparent pixels and malformed rasters cannot enter the board', () => {
  const image = {width: 1, height: 2, data: new Uint8Array([239, 75, 90, 127, 239, 75, 90, 128])};
  const result = rasterToPattern(image, 16);
  assert.equal(result.cells[1 * 16 + 8], null);
  assert.equal(result.cells[12 * 16 + 8], '#ef4b5a');
  assert.throws(() => rasterToPattern({width: 2, height: 2, data: [1, 2, 3]}, 16), RangeError);
  assert.throws(() => rasterToPattern({width: 0, height: 2, data: []}, 16), RangeError);
});

test('shrinking an uploaded picture averages each source area before choosing a bead shade', () => {
  const data = new Uint8ClampedArray(32 * 32 * 4);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const at = (y * 32 + x) * 4;
    const channel = (x + y) % 2 ? 255 : 0;
    data.set([channel, channel, channel, 255], at);
  }
  const image = rasterToPattern({width: 32, height: 32, data}, 16);
  assert.ok(image.cells.every(color => color === '#7d8b99'));
  assert.equal(image.preview.cells[0], '#000000');
  assert.equal(image.preview.cells[1], '#ffffff');
});

test('every generated pattern has smaller and larger versions that stay one fusible piece in the same colors', async () => {
  const { patternVariants, variantForBoard } = await import('../src/patterns.js');
  for (const entry of PRESETS) {
    const list = patternVariants(entry.id), palette = new Set(createPresetPattern(entry.id, 48).cells.filter(Boolean));
    assert.ok(list.length >= 9, entry.name);
    assert.ok(list.some(v => v.native));
    assert.ok(Math.max(list[0].width, list[0].height) <= 16, entry.name + ' needs a version for a 16 board');
    assert.ok(Math.max(...list.map(v => Math.max(v.width, v.height))) === 64 || Math.max(...list.map(v => Math.max(v.width, v.height))) >= 62, entry.name);
    for (const v of list) {
      const { width: w, height: h, cells } = v;
      assert.equal(cells.length, w * h);
      assert.ok(cells.every(c => c === null || palette.has(c)), entry.name + ' keeps its own colours');
      for (let x = 0; x < w; x++) assert.ok(cells[x] === null && cells[(h - 1) * w + x] === null);
      for (let y = 0; y < h; y++) assert.ok(cells[y * w] === null && cells[y * w + w - 1] === null);
      const reached = new Set(), todo = [cells.findIndex(Boolean)];
      while (todo.length) { const i = todo.pop(); if (reached.has(i) || !cells[i]) continue; reached.add(i); const x = i % w, y = Math.floor(i / w); for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) { const xx = x + dx, yy = y + dy; if (xx >= 0 && xx < w && yy >= 0 && yy < h) todo.push(yy * w + xx); } }
      assert.equal(reached.size, cells.filter(Boolean).length, `${entry.name} ${w}×${h} must fuse as one piece`);
    }
    // 板格越大，选到的版本越大（豆数不减）。
    let last = 0;
    for (const size of [16, 20, 24, 30, 36, 40, 48, 56, 64]) {
      const p = createPresetPattern(entry.id, size, { fit: 'board' });
      const beads = p.cells.filter(Boolean).length;
      assert.ok(p.size === size || (size === 16 && p.size <= 17), `${entry.name} on ${size}: board ${p.size}`);
      assert.ok(beads >= last, `${entry.name} bead count should grow with the board`);
      last = beads;
      assert.equal(variantForBoard(entry.id, size).width, p.nativeWidth);
    }
  }
  const native = createPresetPattern(PRESETS[0].id, 30);
  assert.equal(native.variant, 'native');
  assert.equal(createPresetPattern(PRESETS[0].id, 30, { fit: 'board' }).variant, 'smaller');
  assert.equal(createPresetPattern(PRESETS[0].id, 64, { fit: 'board' }).variant, 'larger');
});
