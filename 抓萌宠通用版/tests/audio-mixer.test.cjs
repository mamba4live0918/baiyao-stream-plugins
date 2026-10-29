const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const modulePath = path.join(__dirname, '../src/audio-mixer.js');
const PetAudioMixer = fs.existsSync(modulePath) ? require(modulePath) : null;
const KEY = 'pet-catch-audio-levels-v1';
function storage(initial = {}) {
  const entries = new Map(Object.entries(initial));
  return { entries, getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value) };
}
function mixer(options = {}) {
  assert.equal(typeof PetAudioMixer, 'function', 'audio mixer module is available');
  return new PetAudioMixer({ storage: storage(), ...options });
}
class AudioPlayer extends EventTarget {
  constructor() { super(); this.volume = 1; this.paused = true; this.ended = false; this.writes = 0; }
  set volume(value) { this.value = value; this.writes++; }
  get volume() { return this.value; }
  play() { this.paused = false; this.ended = false; this.dispatchEvent(new Event('play')); }
  pause() { this.paused = true; this.dispatchEvent(new Event('pause')); }
}
test('new and existing installs begin quietly without changing legacy preferences', () => {
  const store = storage({ 'pet-catch-v1-settings': '{"voice":false,"sound":true}' });
  const m = mixer({ storage: store });
  assert.equal(m.volume('audio:start', .8), .24);
  assert.equal(m.getMaster(), 30);
  assert.equal(m.getLevel('tier:default-15'), 100);
  assert.equal(store.entries.size, 1);
});
test('master and each source persist independently, including mute', () => {
  const store = storage(), m = mixer({ storage: store });
  m.setMaster(50); m.setLevel('audio:start', 40); m.setLevel('tier:custom_one', 0);
  const restored = mixer({ storage: store });
  assert.equal(restored.volume('audio:start'), .2);
  assert.equal(restored.volume('audio:ask'), .5);
  assert.equal(restored.volume('tier:custom_one'), 0);
  assert.equal(restored.volume('tier:default-15'), .5);
  assert.deepEqual([...store.entries.keys()], [KEY]);
});
test('levels reject invalid values and source keys; finite base values clamp the final volume', () => {
  const m = mixer();
  for (const invalid of [-1, 101, 2.5, '30', NaN, Infinity, null]) {
    assert.throws(() => m.setMaster(invalid));
    assert.throws(() => m.setLevel('audio:start', invalid));
  }
  for (const invalid of ['', '__proto__', 'audio:unknown', 'tier:', 'tier:<x>', null]) assert.throws(() => m.setLevel(invalid, 50));
  assert.throws(() => m.volume('audio:start', NaN));
  assert.throws(() => m.volume('audio:start', '1'));
  assert.equal(m.volume('audio:start', -5), 0);
  assert.equal(m.volume('audio:start', 100), 1);
  assert.equal(m.getMaster(), 30);
  assert.equal(m.getLevel('audio:start'), 100);
});
test('corrupt records fall back without overwriting the old record', () => {
  for (const raw of ['broken', 'null', '[]', '{"master":101,"levels":{}}', '{"master":50,"levels":{"audio:start":"5"}}']) {
    const warnings = [], store = storage({ [KEY]: raw }), m = mixer({ storage: store, onWarning: message => warnings.push(message) });
    assert.equal(m.volume('audio:start'), .3);
    m.setMaster(20);
    assert.equal(m.volume('audio:start'), .2);
    assert.equal(store.getItem(KEY), raw);
    assert(warnings.length > 0);
  }
});
test('blocked reads and quota failures keep current-session adjustments usable and warn', () => {
  for (const store of [null, { getItem() { throw Error('denied'); } }, { getItem() { return null; }, setItem() { throw Error('quota'); } }]) {
    const warnings = [], m = mixer({ storage: store, onWarning: message => warnings.push(message) });
    m.setMaster(15); m.setLevel('audio:start', 20);
    assert.equal(m.volume('audio:start'), .03);
    assert(warnings.length > 0);
  }
});
test('HTML audio adjusts while playing and returns to current settings on replay', () => {
  const m = mixer(), start = new AudioPlayer(), ask = new AudioPlayer();
  m.attach(start, 'audio:start', .8); m.attach(ask, 'audio:ask');
  assert.equal(start.volume, .24);
  start.play(); ask.play(); m.setLevel('audio:start', 50);
  assert.equal(start.volume, .12); assert.equal(ask.volume, .3);
  m.setMaster(0); assert.equal(start.volume, 0); assert.equal(ask.volume, 0);
  start.pause(); const writes = start.writes;
  m.setMaster(50); assert.equal(start.writes, writes); assert.equal(ask.volume, .5);
  start.play(); assert.equal(start.volume, .2);
});
test('ended/error/disposed players stop receiving updates and attaching twice replaces the route', () => {
  const m = mixer(), a = new AudioPlayer();
  m.attach(a, 'audio:start'); const dispose = m.attach(a, 'audio:ask', .5);
  a.play(); m.setLevel('audio:start', 0); assert.equal(a.volume, .15);
  for (const event of ['ended', 'error']) {
    a.dispatchEvent(new Event(event)); const writes = a.writes;
    m.setMaster(m.getMaster() === 30 ? 40 : 30); assert.equal(a.writes, writes);
    a.play(); assert.equal(a.volume, m.getMaster() / 200);
  }
  dispose(); const writes = a.writes;
  m.setMaster(50); a.play(); assert.equal(a.writes, writes);
});
test('oscillator level gains mute and track only their route until disposed', () => {
  const m = mixer(), grab = { gain: { value: 1 } }, home = { gain: { value: 1 } };
  const dispose = m.attachGain(grab, 'audio:grab'); m.attachGain(home, 'audio:home', .5);
  assert.equal(grab.gain.value, .3); assert.equal(home.gain.value, .15);
  m.setLevel('audio:grab', 0); assert.equal(grab.gain.value, 0); assert.equal(home.gain.value, .15);
  m.setMaster(60); assert.equal(home.gain.value, .3);
  dispose(); m.setLevel('audio:grab', 100); assert.equal(grab.gain.value, 0);
});
test('browser export survives a localStorage access exception', () => {
  assert.equal(typeof PetAudioMixer, 'function');
  const sandbox = { console };
  Object.defineProperty(sandbox, 'localStorage', { get() { throw Error('SecurityError'); } });
  vm.runInNewContext(fs.readFileSync(modulePath, 'utf8'), sandbox);
  const warnings = [], m = new sandbox.PetAudioMixer({ onWarning: message => warnings.push(message) });
  m.setMaster(10);
  assert.equal(m.volume('audio:clap'), .1);
  assert(warnings.length > 0);
});
test('sliders synchronize duplicate controls and ignore removed controls', () => {
  class Element extends EventTarget {
    constructor(doc, tag) { super(); this.ownerDocument = doc; this.tagName = tag; this.dataset = {}; this.children = []; this.attributes = {}; }
    append(...children) { this.children.push(...children); }
    setAttribute(key, value) { this.attributes[key] = String(value); }
    querySelector(tag) { return this.children.find(child => child.tagName === tag); }
  }
  const doc = { createElement: tag => new Element(doc, tag), querySelectorAll(selector) {
    const id = selector.match(/="([^"]+)"/)[1], all = [];
    const walk = node => { if (node.dataset.petAudioMixer === id) all.push(node); node.children.forEach(walk); };
    walk(doc.body); return all;
  } };
  doc.body = new Element(doc, 'body');
  const m = mixer(), master = m.mountMaster(doc.body), first = m.mountLevel(doc.body, 'audio:start', 'Start volume'), second = m.mountLevel(doc.body, 'audio:start', 'Start volume');
  assert.equal(master.querySelector('input').value, '30');
  assert.equal(master.querySelector('output').textContent, '30%');
  const slider = first.querySelector('input');
  assert.equal(slider.type, 'range'); assert.equal(slider.min, '0'); assert.equal(slider.max, '100');
  assert.equal(slider.attributes['aria-label'], 'Start volume');
  slider.value = '25'; slider.dispatchEvent(new Event('input'));
  assert.equal(m.getLevel('audio:start'), 25);
  assert.equal(second.querySelector('input').value, '25');
  assert.equal(second.querySelector('output').textContent, '25%');
  doc.body.children = doc.body.children.filter(child => child !== first);
  m.setLevel('audio:start', 70);
  assert.equal(first.querySelector('input').value, '25');
  assert.equal(second.querySelector('input').value, '70');
  m.setMaster(0); assert.equal(master.querySelector('output').textContent, '0%');
});
