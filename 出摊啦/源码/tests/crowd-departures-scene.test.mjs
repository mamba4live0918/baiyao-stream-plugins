import test from 'node:test';
import assert from 'node:assert/strict';
import { CrowdScene } from '../src/crowd/renderer.js';
import { nextAbandonmentAt } from '../src/crowd/departures.js';

function scheduling(run) {
  const original = Object.fromEntries(['requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout', 'clearTimeout'].map(key => [key, globalThis[key]]));
  const dateNow = Date.now, state = { now: 1000, frames: new Map(), timers: new Map(), serial: 0 };
  Date.now = () => state.now;
  globalThis.requestAnimationFrame = callback => { const id = ++state.serial; state.frames.set(id, callback); return id; };
  globalThis.cancelAnimationFrame = id => state.frames.delete(id);
  globalThis.setTimeout = (callback, delay) => { const id = ++state.serial; state.timers.set(id, { callback, delay }); return id; };
  globalThis.clearTimeout = id => state.timers.delete(id);
  state.step = () => { assert.equal(state.frames.size, 1, 'one finite RAF chain'); const [id, callback] = state.frames.entries().next().value; state.frames.delete(id); callback(); };
  try { run(state); } finally { Object.assign(globalThis, original); Date.now = dateNow; }
}

function fixture(initialOrders, settings = {}) {
  let orders = initialOrders;
  const draws = [], text = [], clips = [], stack = [];
  const g = { globalAlpha: 1, setTransform() {}, clearRect() {}, beginPath() {}, rect() {}, moveTo() {}, lineTo() {}, closePath() {},
    clip(rule) { clips.push(rule); },
    save() { stack.push(this.globalAlpha); }, restore() { this.globalAlpha = stack.pop(); },
    drawImage(image, x, y) { draws.push({ id: image.id, x, y, alpha: this.globalAlpha }); },
    strokeText() {}, fillText(value) { text.push(value); }, measureText(value) { return { width: value.length * 10 }; },
  };
  const scene = Object.assign(Object.create(CrowdScene.prototype), {
    canvas: { width: 1920, height: 1080 }, g, clockOffset: 0, pausedAt: null, frame: 0, timer: null, destroyed: false, inTick: false,
    width: 1920, height: 1080, dpr: 1, renderCount: 0, layoutDirty: true, views: [], byKey: new Map(), departures: [],
    layoutResult: { slots: [], capacity: 0, outside: 0, compressed: false }, backStamp: '', backLayer: null, backBuilds: 0,
    lastBehavior: null, summaryStamp: '', collect: false, samples: [], frameTimes: [],
    getOrders: () => orders, getSettings: () => ({ shop: 'noodle', display: { names: false }, crowd: { moodSeconds: [30, 60, 120] }, ...settings }),
    getZone: () => ({ enabled: true, pts: [[42, 5], [58, 5], [58, 28], [42, 28]] }), onChange() {}, onTime() {},
    bank: { sprite: (id, width, height) => ({ image: { id }, width, height }),
      counterLayer: () => ({ image: { id: 'counter' }, proofCandidates: [] }), stats: () => ({}) },
  });
  return { scene, draws, text, clips, setOrders(value) { orders = value; } };
}
const order = (key, receivedAt = 1000) => ({ key, receivedAt, nick: key, appearance: 1 });
const abandonment = { order: { abandon: { enabled: true, angryWaitSeconds: 60 } } };

test('onTime runs before queue reads and sync within the callback does not create another RAF', () => scheduling(state => {
  const f = fixture([order('a')]); let callbacks = 0, queueReads = 0;
  const getOrders = f.scene.getOrders;
  f.scene.getOrders = () => { queueReads++; assert.equal(callbacks, 1); return getOrders(); };
  f.scene.onTime = now => { callbacks++; assert.equal(now, state.now); assert.equal(queueReads, 0); f.setOrders([]); f.scene.sync(); };
  f.scene.invalidate(); state.step();
  assert.equal(callbacks, 1); assert.equal(f.scene.views.length, 0);
  assert.equal(state.frames.size, 0); assert.equal(state.timers.size, 0);
}));

test('a wall-clock correction in onTime is reread before layout and deadline scheduling', () => scheduling(state => {
  state.now = 31000;
  const { scene } = fixture([order('a')], abandonment);
  scene.onTime = now => { assert.equal(now, 31000); scene.clockOffset -= 30000; };
  scene.invalidate(); state.step();
  assert.equal(scene.views[0].since, 1000);
  assert.equal(scene.lastBehavior.actors[0].mood, 'happy');
  scene.destroy();
}));

test('a still crowd wakes at the nearest patience deadline and disabled abandonment adds no wake', () => scheduling(state => {
  let customer, deadline;
  for (let i = 0; i < 100; i++) {
    customer = order(`order:${i}`); deadline = nextAbandonmentAt([customer], abandonment, 0);
    if ((deadline - 1) % 5000 >= 320 && (deadline - 1 - 121000) % 8000 >= 900) break;
  }
  state.now = deadline - 1;
  const { scene } = fixture([customer], abandonment);
  scene.updateLayout(state.now - 1000); scene.invalidate(); state.step();
  assert.equal(state.frames.size, 0);
  assert.equal(state.timers.size, 1);
  assert.equal([...state.timers.values()][0].delay, 1);
  scene.destroy();
  const disabled = fixture([customer], { order: { abandon: { enabled: false } } }).scene;
  disabled.updateLayout(state.now - 1000); disabled.invalidate(); state.step();
  assert.equal(state.frames.size, 0); assert.equal(state.timers.size, 1);
  assert.ok([...state.timers.values()][0].delay > 1);
  disabled.destroy();
}));

test('visible departures stomp once, speak individually, fade, then stop all redraws after 1.2 seconds', () => scheduling(state => {
  const customers = [order('a'), order('b')], f = fixture(customers), { scene } = f;
  scene.updateLayout(state.now - 1000);
  const oldY = scene.byKey.get('a').target.y;
  assert.equal(scene.announceDepartures(customers, '哼！不吃了'), 2);
  f.setOrders([]); scene.sync(); state.step();
  assert.equal(f.text.filter(value => value === '哼！不吃了').length, 2, 'individual bubbles, no aggregate banner');
  assert.equal(f.draws.at(-1).id, 'counter'); assert.ok(f.clips.includes('evenodd'));
  state.now = 1160; f.draws.length = 0; state.step();
  assert.ok(f.draws.some(draw => draw.id === 'customer_01_angry' && draw.y < oldY));
  state.now = 1800; f.draws.length = 0; state.step();
  assert.ok(f.draws.some(draw => draw.id === 'customer_01_angry' && draw.alpha > 0 && draw.alpha < 1));
  state.now = 2200; f.draws.length = 0; state.step();
  assert.equal(scene.departures.length, 0);
  assert.ok(f.draws.every(draw => draw.id === 'counter'));
  assert.equal(state.frames.size, 0); assert.equal(state.timers.size, 0);
}));

test('outside customers never create invented departing actors and repeat announcements stay bounded', () => scheduling(state => {
  const customers = Array.from({ length: 500 }, (_, i) => order(`order:${i}`)), { scene } = fixture(customers);
  scene.updateLayout(state.now - 1000);
  const visible = scene.views.length;
  assert.ok(visible > 0 && visible < customers.length);
  assert.equal(scene.announceDepartures(customers), visible);
  assert.equal(scene.departures.length, visible);
  assert.equal(scene.announceDepartures(customers), 0);
  assert.equal(scene.departures.length, visible);
  scene.destroy();
}));

test('pause cancels scheduling and excludes real idle time from patience and finite departures', () => scheduling(state => {
  const customers = [order('a')], { scene, setOrders } = fixture(customers, abandonment);
  scene.updateLayout(state.now - 1000); scene.announceDepartures(customers); setOrders([]);
  state.step(); state.now = 1160; state.step();
  scene.pause(); const frozen = scene.now();
  assert.equal(state.frames.size, 0); assert.equal(state.timers.size, 0);
  state.now += 3600000; assert.equal(scene.now(), frozen);
  scene.resume(); assert.equal(scene.now(), frozen); state.step();
  assert.equal(scene.departures.length, 1);
  state.now += 1040; state.step();
  assert.equal(scene.departures.length, 0); assert.equal(state.frames.size, 0); assert.equal(state.timers.size, 0);
}));

test('starting a new session clears departed customers immediately and the next paint goes idle', () => scheduling(state => {
  const customers = [order('a')], f = fixture(customers), { scene } = f;
  scene.updateLayout(state.now - 1000); scene.announceDepartures(customers); f.setOrders([]); state.step();
  assert.equal(scene.departures.length, 1);
  scene.clearDepartures(); assert.equal(scene.departures.length, 0, 'new session releases effects synchronously');
  f.draws.length = 0; state.step();
  assert.deepEqual(f.draws.map(draw => draw.id), ['counter']);
  assert.equal(state.frames.size, 0); assert.equal(state.timers.size, 0);
}));

test('clearing departures before rewinding a debug clock cannot leave future effects or RAF behind', () => scheduling(state => {
  const customers = [order('a')], f = fixture(customers), { scene } = f;
  scene.updateLayout(state.now - 1000); scene.advance(600000); scene.announceDepartures(customers); f.setOrders([]); state.step();
  assert.ok(scene.departures[0].since > state.now, 'effect was created on the advanced game clock');
  scene.clearDepartures(); scene.clockOffset = 0;
  f.draws.length = 0; state.step();
  assert.equal(scene.now(), 1000); assert.equal(scene.departures.length, 0);
  assert.deepEqual(f.draws.map(draw => draw.id), ['counter']);
  assert.equal(state.frames.size, 0); assert.equal(state.timers.size, 0);
}));
