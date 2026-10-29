'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const file = path.join(__dirname, '../src/pinch-marks.js');
function marks() {
  assert.ok(fs.existsSync(file), 'the pinch skin renderer must exist');
  return require(file);
}
function rgb(hex) { return [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)); }
function close(a, b) { assert.ok(Math.abs(a - b) < 1e-8, `${a} should equal ${b}`); }

test('palette keeps the chosen skin color and readable related shades across skin tones', () => {
  const api = marks();
  for (const hex of ['#FFF7EE', '#edbb9c', '#bb855d', '#593923']) {
    const p = api.palette(hex);
    assert.equal(p.base, hex.toLowerCase());
    assert.deepEqual(Object.keys(p).sort(), ['base', 'blush', 'deep', 'light', 'shadow']);
    Object.values(p).forEach(value => assert.match(value, /^#[0-9a-f]{6}$/));
    const b = rgb(p.base), s = rgb(p.shadow), d = rgb(p.deep), l = rgb(p.light);
    assert.ok(s.every((v, i) => v < b[i]), 'shadow should be darker than the selected skin');
    assert.ok(d.every((v, i) => v < s[i]), 'crease should be deeper than the soft shadow');
    assert.ok(l.some((v, i) => v > b[i]), 'highlight should remain visible');
    assert.ok(d[1] > d[0] * 0.3 && d[2] > d[0] * 0.2, 'crease must not become a blood-red mark');
  }
});

test('only strict six digit hex colors are accepted; injected markup never reaches SVG', () => {
  const api = marks();
  for (const value of ['', '#fff', 'ffffff', '#ffffffff', ' #ffffff', '#12345g', '#ffffff\n', 'red', null, 123, { toString: () => '#ffffff' }, '#ffffff\"><script>alert(1)</script>']) {
    assert.throws(() => api.palette(value), /color/i);
    assert.throws(() => api.markup(value), /color/i);
  }
});

test('rendered SVG actually changes skin fill and exposes separately fading skin and creases', () => {
  const api = marks();
  const light = api.markup('#f5d2bb');
  const dark = api.markup('#68432d', { opacity: 0.6 });
  assert.match(light, /fill="#f5d2bb"/);
  assert.match(dark, /fill="#68432d"/);
  for (const svg of [light, dark]) {
    assert.match(svg, /^<svg\b/);
    assert.match(svg, /viewBox="0 0 160 80"/);
    assert.match(svg, /<g class="pm-skin"/);
    assert.match(svg, /<g class="pm-creases"/);
    assert.match(svg, /<mask\b/);
    assert.match(svg, /stop-opacity="0"/);
    assert.match(svg, /<\/svg>$/);
  }
  assert.match(light, /opacity="0\.85"/);
  assert.match(dark, /opacity="0\.6"/);
});

test('every gradient and mask reference resolves locally with no IDs reused by simultaneous marks', () => {
  const api = marks();
  const seen = new Set();
  for (let i = 0; i < 20; i++) {
    const svg = api.markup('#cc9f80');
    const ids = [...svg.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
    assert.ok(ids.length >= 2);
    assert.equal(new Set(ids).size, ids.length);
    ids.forEach(id => { assert.equal(seen.has(id), false); seen.add(id); });
    for (const ref of svg.matchAll(/url\(#([^)]*)\)/g)) assert.ok(ids.includes(ref[1]));
    const content = svg.replace('http://www.w3.org/2000/svg', '');
    assert.doesNotMatch(content, /<script|<foreignObject|<image|<iframe|\bon[a-z]+\s*=|\bhref\s*=|(?:https?:|data:|javascript:)/i);
    assert.doesNotMatch(content, /url\((?!#)/i);
  }
});

test('opacity is numeric and bounded, and cannot inject attributes', () => {
  const api = marks();
  assert.match(api.markup('#eeccaa', { opacity: -2 }), /opacity="0"/);
  assert.match(api.markup('#eeccaa', { opacity: 3 }), /opacity="1"/);
  for (const opacity of [NaN, Infinity, '0.8', '1\" onload=\"alert(1)']) {
    assert.throws(() => api.markup('#eeccaa', { opacity }), /opacity/i);
  }
});

test('browser UMD export renders without Node APIs or document access', () => {
  marks();
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(file, 'utf8'), context);
  assert.equal(typeof context.PuppetPinchMarks.markup, 'function');
  assert.match(context.PuppetPinchMarks.markup('#ccaa88'), /^<svg\b/);
});

test('geometry aligns the SVG pinch tip and face root on both mirrored cheeks', () => {
  const api = marks();
  const anchor = { x: 1000, y: 500 };
  for (const [mirror, expectedRoot, expectedTip] of [[false, 1020, 970], [true, 980, 1030]]) {
    const g = api.geometry(anchor, 100, 30, mirror);
    close(g.width, 58.39416058394161);
    close(g.height, 13);
    close(g.top, 493.5);
    close(g.left + g.width * (mirror ? 10 / 160 : 150 / 160), expectedRoot);
    close(g.left + g.width * (mirror ? 147 / 160 : 13 / 160), expectedTip);
    assert.equal(g.transform, mirror ? 'scaleX(-1)' : 'none');
  }
  const zero = api.geometry(anchor, 100, 0, false, 2);
  close(zero.left + zero.width * 13 / 160, 1000);
  close(zero.height, 26);
  assert.deepEqual(anchor, { x: 1000, y: 500 });
});

test('geometry rejects invalid coordinates and dimensions and bounds extreme finite requests', () => {
  const api = marks();
  for (const args of [[null, 100, 30, false], [{ x: NaN, y: 1 }, 100, 1, false], [{ x: 1, y: Infinity }, 100, 1, false], [{ x: 0, y: 0 }, 0, 1, false], [{ x: 0, y: 0 }, 100, -1, false], [{ x: 0, y: 0 }, 100, 1, 'true'], [{ x: 0, y: 0 }, 100, 1, false, 0]]) {
    assert.throws(() => api.geometry(...args), /anchor|baseSize|pull|mirror|scale/);
  }
  const g = api.geometry({ x: 0, y: 0 }, 1e20, 1e20, false, 1e20);
  ['left', 'top', 'width', 'height'].forEach(key => assert.ok(Number.isFinite(g[key])));
  assert.ok(g.width < 100000 && g.height <= 10400);
});

test('pressure contacts are two separate feathered fingertip patches without a connecting skin path',()=>{
 const api=marks(),points=[{x:.89,y:.17,angle:30},{x:.93,y:.24,angle:-35}];
 const svg=api.pressureMarkup('#f9e1d2',points,1246,1263,1);
 assert.equal((svg.match(/class="pm-pad-rim"/g)||[]).length,2);assert.equal((svg.match(/class="pm-pad-shadow"/g)||[]).length,2);assert.equal((svg.match(/class="pm-pressure-crease"/g)||[]).length,2);assert.equal((svg.match(/class="pm-pad-flush"/g)||[]).length,2);assert.match(svg,/stop-opacity="0"/);assert.match(svg,/#f9e1d2/);
 for(const bad of [NaN,Infinity,'1'])assert.throws(()=>api.pressureMarkup('#f9e1d2',points,1246,1263,bad));
 assert.throws(()=>api.pressureMarkup('#f9e1d2',[{x:2,y:.2,angle:0},points[1]],1246,1263,1));
});
