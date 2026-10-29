const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const modulePath = path.join(__dirname, '../src/demo.js');
const Demo = fs.existsSync(modulePath) ? require(modulePath) : {};
const tick = () => new Promise(resolve => setImmediate(resolve));
test('an explicit sequence includes both kick appearances in order without mutating its input',async()=>{
 const played=[],sequence=['hit','pinch','kick-shoe','kick-barefoot'];
 const demo=Demo.create({sequence,countdownMs:0,gapMs:0,ready:()=>true,play:async kind=>played.push(kind)});
 await demo.start();assert.deepEqual(played,sequence);assert.deepEqual(sequence,['hit','pinch','kick-shoe','kick-barefoot']);
});
function create(options) {
  assert.equal(typeof Demo.create, 'function', 'demo scheduler implementation must exist');
  return Demo.create(options);
}

test('demo counts down five seconds then awaits hit pinch kick with two gaps', async () => {
  const events = [], seconds = [], waits = [];
  let activePlay = false, done = 0;
  const demo = create({
    ready: () => true,
    onCountdown: n => seconds.push(n),
    delay: async ms => { waits.push(ms); assert.equal(activePlay, false); },
    play: async (kind, signal) => {
      assert.equal(activePlay, false); assert.equal(signal.aborted, false);
      activePlay = true; events.push('start:' + kind); await tick(); events.push('end:' + kind); activePlay = false;
    },
    onDone: () => done++
  });
  const result = demo.start(); assert.equal(demo.running, true); await result;
  assert.deepEqual(seconds, [5, 4, 3, 2, 1, 0]);
  assert.deepEqual(waits, [1000, 1000, 1000, 1000, 1000, 2000, 2000]);
  assert.deepEqual(events, ['start:hit', 'end:hit', 'start:pinch', 'end:pinch', 'start:kick', 'end:kick']);
  assert.equal(done, 1); assert.equal(demo.running, false);
});

test('not-ready start rejects before countdown or play and reports the failure', async () => {
  const errors = []; let countdowns = 0, plays = 0;
  const demo = create({ ready: () => false, play: () => plays++, onCountdown: () => countdowns++, onError: e => errors.push(e) });
  await assert.rejects(demo.start(), /就绪|连接|ready/i);
  assert.equal(demo.running, false); assert.equal(countdowns, 0); assert.equal(plays, 0); assert.equal(errors.length, 1);
});

test('cancel ends the built-in countdown wait immediately and emits no later countdown or action', async () => {
  const seconds = []; let plays = 0, done = 0, errors = 0;
  const demo = create({ ready: () => true, play: () => plays++, onCountdown: n => seconds.push(n), onDone: () => done++, onError: () => errors++ });
  const result = demo.start(); const rejected = assert.rejects(result, { name: 'AbortError' });
  assert.deepEqual(seconds, [5]); demo.cancel(); demo.cancel(); await rejected; await tick();
  assert.equal(demo.running, false); assert.deepEqual(seconds, [5]); assert.equal(plays, 0); assert.equal(done, 0); assert.equal(errors, 0);
});

test('cancel during inter-action gap prevents the next action even if delay resolves late', async () => {
  const played = []; let releaseGap, gapSignal, done = 0;
  const demo = create({ countdownMs: 0, ready: () => true, play: async kind => played.push(kind), onDone: () => done++,
    delay: (ms, signal) => new Promise(resolve => { releaseGap = resolve; gapSignal = signal; }) });
  const result = demo.start(); const rejected = assert.rejects(result, { name: 'AbortError' }); await tick();
  assert.deepEqual(played, ['hit']); demo.cancel(); await rejected;
  assert.equal(gapSignal.aborted, true); releaseGap(); await tick();
  assert.deepEqual(played, ['hit']); assert.equal(done, 0);
});

test('cancel aborts the playing signal immediately and ignores a late play completion', async () => {
  const played = []; let releasePlay, playingSignal, done = 0;
  const demo = create({ countdownMs: 0, gapMs: 0, ready: () => true, onDone: () => done++,
    play: (kind, signal) => { played.push(kind); playingSignal = signal; return new Promise(resolve => { releasePlay = resolve; }); } });
  const result = demo.start(); const rejected = assert.rejects(result, { name: 'AbortError' }); await tick();
  demo.cancel(); assert.equal(playingSignal.aborted, true); await rejected;
  releasePlay(); await tick();
  assert.deepEqual(played, ['hit']); assert.equal(done, 0); assert.equal(demo.running, false);
});

test('ready is checked again before each action and disconnect stops the sequence', async () => {
  let connected = true, done = 0; const played = [], errors = [];
  const demo = create({ countdownMs: 0, gapMs: 0, ready: () => connected,
    play: async kind => { played.push(kind); connected = false; }, onDone: () => done++, onError: e => errors.push(e) });
  await assert.rejects(demo.start(), /就绪|连接|ready/i);
  assert.deepEqual(played, ['hit']); assert.equal(done, 0); assert.equal(errors.length, 1); assert.equal(demo.running, false);
});

test('concurrent start rejects without starting a second countdown or play', async () => {
  let plays = 0;
  const demo = create({ countdownMs: 0, ready: () => true, play: () => { plays++; return new Promise(() => {}); } });
  const first = demo.start(); const firstRejected = assert.rejects(first, { name: 'AbortError' }); await tick();
  await assert.rejects(demo.start(), /进行|运行|running|already/i);
  assert.equal(plays, 1); demo.cancel(); await firstRejected;
});

test('play failure is reported once and never calls onDone or later actions', async () => {
  const failure = new Error('模型动作失败'), errors = [], played = []; let done = 0;
  const demo = create({ countdownMs: 0, gapMs: 0, ready: () => true,
    play: async kind => { played.push(kind); throw failure; }, onError: e => errors.push(e), onDone: () => done++ });
  await assert.rejects(demo.start(), e => e === failure);
  assert.deepEqual(errors, [failure]); assert.deepEqual(played, ['hit']); assert.equal(done, 0); assert.equal(demo.running, false);
});

test('a new run is isolated from an older cancelled play that resolves late', async () => {
  let first = true, releaseOld, done = 0; const played = [];
  const demo = create({ countdownMs: 0, gapMs: 0, ready: () => true, onDone: () => done++,
    play: kind => { played.push(kind); if (first) { first = false; return new Promise(resolve => { releaseOld = resolve; }); } return Promise.resolve(); } });
  const oldRun = demo.start(); const oldRejected = assert.rejects(oldRun, { name: 'AbortError' }); await tick();
  demo.cancel(); await oldRejected; await demo.start(); releaseOld(); await tick();
  assert.deepEqual(played, ['hit', 'hit', 'pinch', 'kick']); assert.equal(done, 1); assert.equal(demo.running, false);
});

test('browser bundle exports PuppetDemo without a CommonJS runtime', () => {
  assert.equal(fs.existsSync(modulePath), true, 'demo scheduler implementation must exist');
  const sandbox = { AbortController, setTimeout, clearTimeout };
  vm.runInNewContext(fs.readFileSync(modulePath, 'utf8'), sandbox);
  assert.equal(typeof sandbox.PuppetDemo.create, 'function');
});
