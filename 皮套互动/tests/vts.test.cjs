const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const modulePath = path.join(__dirname, '../src/vts.js');
const VTS = fs.existsSync(modulePath) ? require(modulePath) : {};
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

function model(id = 'model-a') {
  return { modelLoaded: !!id, modelID: id || '', modelName: id || '', modelPosition: { positionX: .23, positionY: -.41, rotation: 17, size: -8 } };
}
function inputs() {
  return { modelLoaded: true, defaultParameters: [
    { name: 'FaceAngleX', value: 0, min: -30, max: 30 },
    { name: 'FaceAngleZ', value: 0, min: -30, max: 30 },
    { name: 'EyeOpenLeft', value: 1, min: 0, max: 1 },
    { name: 'EyeOpenRight', value: 1, min: 0, max: 1 }
  ], customParameters: [{ name: 'CheekPull', value: 0, min: -2, max: 2, addedBy: 'other' }] };
}
function environment(overrides = {}, options = {}) {
  assert.equal(typeof VTS.Client, 'function', 'Client implementation must exist');
  const sockets = [], sent = [], errors = [], statuses = [], models = [], saved = new Map();
  const handlers = {
    AuthenticationTokenRequest: () => ({ authenticationToken: 'fake-new-token' }),
    AuthenticationRequest: () => ({ authenticated: true, reason: '' }),
    EventSubscriptionRequest: () => ({ subscribedEventCount: 1, subscribedEvents: ['ModelLoadedEvent'] }),
    CurrentModelRequest: () => model(),
    HotkeysInCurrentModelRequest: () => ({ modelLoaded: true, availableHotkeys: [{ name: 'Smile', hotkeyID: 'smile-id', type: 'ToggleExpression' }] }),
    InputParameterListRequest: inputs,
    ...overrides
  };
  class FakeSocket {
    constructor(url) { this.url = url; this.readyState = 0; sockets.push(this); queueMicrotask(() => { if (this.readyState === 0) { this.readyState = 1; this.onopen?.({}); } }); }
    send(raw) {
      const msg = JSON.parse(raw); sent.push(msg);
      const answer = handlers[msg.messageType]?.(msg, this);
      if (answer !== undefined) Promise.resolve(answer).then(data => this.reply(msg, data));
    }
    reply(msg, data, type) { this.onmessage?.({ data: JSON.stringify({ apiName: 'VTubeStudioPublicAPI', apiVersion: '1.0', requestID: msg.requestID, messageType: type || msg.messageType.replace(/Request$/, 'Response'), data }) }); }
    close() { this.readyState = 3; this.onclose?.({}); }
  }
  const client = new VTS.Client({ WebSocket: FakeSocket, requestTimeout: 40, connectTimeout: 40, authorizationTimeout: 80, refreshInterval: 0,
    storage: { getItem: key => saved.get(key) || null, setItem: (key, value) => saved.set(key, value), removeItem: key => saved.delete(key) },
    onError: e => errors.push(e), onStatus: (s, text) => statuses.push([s, text]), onModel: m => models.push(m), ...options });
  return { client, sockets, sent, errors, statuses, models, saved, handlers };
}

test('connect authenticates independently and parses VTS input metadata', async t => {
  const e = environment(); t.after(() => e.client.disconnect());
  await e.client.connect(8001);
  assert.equal(e.sockets[0].url, 'ws://127.0.0.1:8001');
  assert.equal(e.client.authenticated, true);
  assert.equal(e.client.model.modelID, 'model-a');
  assert.equal(e.client.hotkeys[0].hotkeyID, 'smile-id');
  assert.deepEqual(e.client.inputs.map(x => x.name), ['FaceAngleX', 'FaceAngleZ', 'EyeOpenLeft', 'EyeOpenRight', 'CheekPull']);
  const auth = e.sent.find(x => x.messageType === 'AuthenticationRequest');
  assert.equal(auth.data.pluginName, '皮套互动整蛊');
  assert.equal(auth.data.authenticationToken, 'fake-new-token');
  assert.equal(e.saved.size, 1);
  assert.equal(e.models.length, 1);
});

test('invalid saved token requests authorization once and replaces token after successful auth', async t => {
  const attempts = [];
  const e = environment({ AuthenticationRequest: msg => { attempts.push(msg.data.authenticationToken); return { authenticated: msg.data.authenticationToken !== 'fake-old-token' }; } },
    { storage: { getItem: () => 'fake-old-token', setItem: () => {}, removeItem: () => {} } });
  t.after(() => e.client.disconnect()); await e.client.connect();
  assert.deepEqual(attempts, ['fake-old-token', 'fake-new-token']);
  assert.equal(e.sent.filter(x => x.messageType === 'AuthenticationTokenRequest').length, 1);
});

test('denied authorization rejects without retrying or becoming authenticated', async () => {
  const e = environment({ AuthenticationTokenRequest: (msg, socket) => { queueMicrotask(() => socket.reply(msg, { errorID: 50, message: 'User denied' }, 'APIError')); } });
  await assert.rejects(e.client.connect(), /denied/i);
  assert.equal(e.client.authenticated, false);
  assert.equal(e.sent.filter(x => x.messageType === 'AuthenticationTokenRequest').length, 1);
  assert.equal(e.sockets[0].readyState, 3);
});

test('requests correlate out of order responses and time out missing responses', async t => {
  const held = [];
  const e = environment({ ProbeRequest: (msg, socket) => { held.push([msg, socket]); } });
  t.after(() => e.client.disconnect()); await e.client.connect();
  const first = e.client.request('ProbeRequest', { n: 1 }), second = e.client.request('ProbeRequest', { n: 2 });
  held[1][1].reply(held[1][0], { result: 2 }); held[0][1].reply(held[0][0], { result: 1 });
  assert.deepEqual(await first, { result: 1 }); assert.deepEqual(await second, { result: 2 });
  await assert.rejects(e.client.request('NeverRequest'), /超时|timeout/i);
  assert.notEqual(held[0][0].requestID, held[1][0].requestID);
});

test('disconnect rejects pending work and late old session responses cannot affect reconnect', async t => {
  let old;
  const e = environment({ DelayedRequest: (msg, socket) => { old = [msg, socket, socket.onmessage]; } });
  t.after(() => e.client.disconnect()); await e.client.connect();
  const generation = e.client.sessionId;
  const pending = e.client.request('DelayedRequest'); const rejected = assert.rejects(pending, /断开|disconnect/i);
  e.client.disconnect(); await rejected; await e.client.connect();
  old[2]({ data: JSON.stringify({ requestID: old[0].requestID, messageType: 'DelayedResponse', data: { modelID: 'wrong' } }) });
  assert.ok(e.client.sessionId > generation); assert.equal(e.client.model.modelID, 'model-a');
  assert.equal(e.sent.filter(x => x.messageType === 'DelayedRequest').length, 1);
});

test('model switches refresh metadata and no-model clears state', async t => {
  let current = 'model-a';
  const e = environment({ CurrentModelRequest: () => model(current) });
  t.after(() => e.client.disconnect()); await e.client.connect();
  await e.client.refresh(); assert.equal(e.models.length, 1);
  current = 'model-b'; await e.client.refresh();
  assert.equal(e.client.model.modelID, 'model-b'); assert.equal(e.models.length, 2);
  current = null; await e.client.refresh();
  assert.equal(e.client.model, null); assert.deepEqual(e.client.hotkeys, []); assert.deepEqual(e.client.inputs, []);
  assert.ok(e.statuses.some(([s]) => s === 'no-model'));
});

test('storage failures report temporary access while connection stays usable', async t => {
  const e = environment({}, { storage: { getItem() { throw Error('denied'); }, setItem() { throw Error('full'); }, removeItem() { throw Error('denied'); } } });
  t.after(() => e.client.disconnect()); await e.client.connect();
  assert.equal(e.client.authenticated, true); assert.ok(e.errors.some(x => /存储/.test(x.message)));
});

test('loaded event invalidates action generation immediately without waiting for polling', async t => {
  const e = environment(); t.after(() => e.client.disconnect()); await e.client.connect();
  assert.ok(e.sent.some(x => x.messageType === 'EventSubscriptionRequest' && x.data.eventName === 'ModelLoadedEvent'));
  const before = e.client.modelRevision;
  e.handlers.CurrentModelRequest = () => model('model-b');
  e.sockets[0].onmessage({ data: JSON.stringify({ messageType: 'ModelLoadedEvent', data: { modelLoaded: true, modelID: 'model-b', modelName: 'B' } }) });
  assert.equal(e.client.model.modelID, 'model-b'); assert.ok(e.client.modelRevision > before);
  await pause(5); assert.equal(e.client.inputs.length, 5);
});

test('polling refreshes model automatically and stops when disconnected', async () => {
  let current = 'model-a'; const e = environment({ CurrentModelRequest: () => model(current) }, { refreshInterval: 20 });
  await e.client.connect(); current = 'model-b'; await pause(60);
  assert.equal(e.client.model.modelID, 'model-b'); e.client.disconnect();
  const count = e.sent.length; await pause(50); assert.equal(e.sent.length, count);
});

function actionClient() {
  const calls = [], errors = [];
  const client = { authenticated: true, sessionId: 1, modelRevision: 1, model: model(), inputs: [...inputs().defaultParameters, ...inputs().customParameters], hotkeys: [{ hotkeyID: 'smile-id' }],
    options: { onError: e => errors.push(e) },
    async request(type, data) { calls.push({ type, data }); return type === 'CurrentModelRequest' ? model() : {}; } };
  return { client, calls, errors };
}

function virtualTimeVTS() {
  let now = 0, id = 0;
  const timers = new Map();
  const sandbox = {
    module: { exports: {} }, AbortController,
    Date: class extends Date { static now() { return now; } },
    setTimeout(callback, ms) {
      const timer = ++id; timers.set(timer, true);
      queueMicrotask(() => { if (timers.delete(timer)) { now += ms; callback(); } });
      return timer;
    },
    clearTimeout(timer) { timers.delete(timer); }
  };
  vm.runInNewContext(fs.readFileSync(modulePath, 'utf8'), sandbox);
  return { api: sandbox.module.exports, now: () => now };
}

test('hit uses bounded add impulses and ends with zero for every parameter including eyes', async () => {
  assert.equal(typeof VTS.runAction, 'function');
  const e = actionClient(); let impact = 0;
  await VTS.runAction(e.client, 'hit', { intensity: 1, duration: .12 }, { onImpact: () => impact++ });
  const data = e.calls.filter(x => x.type === 'InjectParameterDataRequest').map(x => x.data);
  assert.equal(impact, 1); assert.ok(data.length >= 2 && data.length <= 8);
  assert.ok(data.every(x => x.mode === 'add'));
  assert.ok(data.some(x => x.parameterValues.some(p => p.id === 'FaceAngleX' && p.value !== 0)));
  assert.ok(data.every(x => x.parameterValues.filter(p => p.id.startsWith('EyeOpen')).every(p => p.value <= 0)));
  assert.ok(data.at(-1).parameterValues.every(p => p.value === 0));
});

test('pinch accepts existing input plus one hotkey and rejects unknown output ID or out-of-range value', async () => {
  assert.equal(typeof VTS.runAction, 'function'); const e = actionClient();
  await VTS.runAction(e.client, 'pinch-right', { duration: .2, parameter: 'CheekPull', parameterValue: 1.25, hotkeyID: 'smile-id' });
  assert.equal(e.calls.filter(x => x.type === 'HotkeyTriggerRequest').length, 1);
  const custom = e.calls.filter(x => x.type === 'InjectParameterDataRequest').map(x => x.data.parameterValues.find(p => p.id === 'CheekPull'));
  assert.ok(custom.length >= 2);
  assert.ok(custom.every(p => p && p.value >= 0 && p.value <= 1.25));
  assert.equal(custom.at(-1).value, 0);
  await assert.rejects(VTS.runAction(e.client, 'pinch-left', { parameter: 'ParamAngleX', parameterValue: 1 }), /输入参数/);
  await assert.rejects(VTS.runAction(e.client, 'pinch-left', { parameter: 'CheekPull', parameterValue: 3 }), /范围/);
});

test('stopping an additive action zeroes active offsets and never writes positive eyes', async () => {
  assert.equal(typeof VTS.runAction, 'function'); const e = actionClient(), controller = new AbortController();
  const task = VTS.runAction(e.client, 'hit', { duration: 1 }, { signal: controller.signal, onImpact: () => setTimeout(() => controller.abort(), 10) });
  await assert.rejects(task, { name: 'AbortError' });
  const last = e.calls.filter(x => x.type === 'InjectParameterDataRequest').at(-1);
  assert.ok(last.data.parameterValues.every(x => x.value === 0));
});

test('kick restores exact captured position with absolute coordinates on completion and stop', async () => {
  assert.equal(typeof VTS.runAction, 'function');
  for (const stop of [false, true]) {
    const e = actionClient(), controller = new AbortController();
    const task = VTS.runAction(e.client, 'kick', { duration: .06 }, { signal: controller.signal, onImpact: () => { if (stop) setTimeout(() => controller.abort(), 5); } });
    if (stop) await assert.rejects(task, { name: 'AbortError' }); else await task;
    const moves = e.calls.filter(x => x.type === 'MoveModelRequest');
    assert.ok(moves.length >= 2);
    assert.equal(moves[0].data.valuesAreRelativeToModel, false);
    assert.equal(moves.at(-1).data.positionX, .23); assert.equal(moves.at(-1).data.positionY, -.41);
    assert.equal(moves.at(-1).data.rotation, 17); assert.equal(moves.at(-1).data.size, -8);
  }
});

test('model change during kick prevents restore or any later mutation to the new model', async () => {
  assert.equal(typeof VTS.runAction, 'function'); const e = actionClient(); let countAtChange;
  const task = VTS.runAction(e.client, 'kick', { duration: .1 }, { onImpact: () => setTimeout(() => {
    countAtChange = e.calls.filter(x => x.type === 'MoveModelRequest').length;
    e.client.model = model('model-b'); e.client.modelRevision++;
  }, 10) });
  await assert.rejects(task, /模型/);
  assert.ok(countAtChange > 0);
  assert.equal(e.calls.filter(x => x.type === 'MoveModelRequest').length, countAtChange);
});

test('disconnect during kick reports unable to restore and never queues replay', async () => {
  assert.equal(typeof VTS.runAction, 'function'); const e = actionClient(); let countAtDisconnect;
  const task = VTS.runAction(e.client, 'kick', { duration: .1 }, { onImpact: () => setTimeout(() => {
    countAtDisconnect = e.calls.filter(x => x.type === 'MoveModelRequest').length;
    e.client.authenticated = false; e.client.sessionId++;
  }, 10) });
  await assert.rejects(task, /断开|恢复/);
  e.client.authenticated = true; await pause(50);
  assert.ok(countAtDisconnect > 0);
  assert.equal(e.calls.filter(x => x.type === 'MoveModelRequest').length, countAtDisconnect);
});

test('fresh model check prevents using stale cached model for hit', async () => {
  const e = actionClient();
  e.client.request = async (type, data) => { e.calls.push({ type, data }); return type === 'CurrentModelRequest' ? model('model-b') : {}; };
  await assert.rejects(VTS.runAction(e.client, 'hit', { duration: .05 }), /模型/);
  assert.equal(e.calls.filter(x => x.type === 'InjectParameterDataRequest').length, 0);
});

test('abort during pending injection sends cleanup without waiting for its late reply', async () => {
  const e = actionClient(), controller = new AbortController(); let resolveInjection;
  e.client.request = (type, data) => {
    e.calls.push({ type, data });
    if (type === 'CurrentModelRequest') return Promise.resolve(model());
    if (type === 'InjectParameterDataRequest' && data.parameterValues.some(x => x.value !== 0)) return new Promise(resolve => { resolveInjection = resolve; });
    return Promise.resolve({});
  };
  const action = VTS.runAction(e.client, 'hit', { duration: 1 }, { signal: controller.signal });
  await pause(5); controller.abort();
  const result = await Promise.race([action.then(() => 'resolved', e => e.name), pause(70).then(() => 'hung')]);
  resolveInjection({});
  assert.equal(result, 'AbortError');
  assert.ok(e.calls.filter(x => x.type === 'InjectParameterDataRequest').at(-1).data.parameterValues.every(x => x.value === 0));
});

test('zero intensity preserves all model parameters while retaining visual impact', async () => {
  const e = actionClient(); let impact = 0;
  await VTS.runAction(e.client, 'hit', { intensity: 0, duration: .05 }, { onImpact: () => impact++ });
  assert.equal(impact, 1);
  assert.ok(e.calls.filter(x => x.type === 'InjectParameterDataRequest').every(x => x.data.parameterValues.every(p => p.value === 0)));
});

test('model event during real client action cancels before any mutation reaches the new model', async t => {
  const e = environment({ InjectParameterDataRequest: () => ({}) }); t.after(() => e.client.disconnect()); await e.client.connect();
  let snapshot;
  const action = VTS.runAction(e.client, 'hit', { duration: .3 }, { onImpact: () => setTimeout(() => {
    e.handlers.CurrentModelRequest = () => model('model-b');
    snapshot = e.sent.filter(x => x.messageType === 'InjectParameterDataRequest').length;
    e.sockets[0].onmessage({ data: JSON.stringify({ messageType: 'ModelLoadedEvent', data: { modelLoaded: true, modelID: 'model-b', modelName: 'B' } }) });
  }, 5) });
  await assert.rejects(action, /模型/); await pause(50);
  assert.equal(e.sent.filter(x => x.messageType === 'InjectParameterDataRequest').length, snapshot);
});

test('late refresh cannot overwrite a newer model event with an old model snapshot', async t => {
  const e = environment(); t.after(() => e.client.disconnect()); await e.client.connect();
  let release;
  e.handlers.CurrentModelRequest = () => new Promise(resolve => { release = resolve; });
  const stale = e.client.refresh(); const checked = assert.rejects(stale, /模型/);
  e.handlers.CurrentModelRequest = () => model('model-b');
  e.sockets[0].onmessage({ data: JSON.stringify({ messageType: 'ModelLoadedEvent', data: { modelLoaded: true, modelID: 'model-b', modelName: 'B' } }) });
  release(model('model-a')); await checked; await pause(5);
  assert.equal(e.client.model.modelID, 'model-b');
});

test('no-model connection stays authenticated and refuses actions without mutation', async t => {
  const e = environment({ CurrentModelRequest: () => model(null) }); t.after(() => e.client.disconnect()); await e.client.connect();
  assert.equal(e.client.authenticated, true); assert.equal(e.client.model, null);
  await assert.rejects(VTS.runAction(e.client, 'hit', {}), /模型/);
  assert.equal(e.sent.filter(x => /InjectParameter|MoveModel/.test(x.messageType)).length, 0);
});

test('action pre-abort and overlapping action are rejected without extra effects', async () => {
  const e = actionClient(), controller = new AbortController(); controller.abort();
  await assert.rejects(VTS.runAction(e.client, 'hit', {}, { signal: controller.signal }), { name: 'AbortError' });
  assert.equal(e.calls.length, 0);
  const one = VTS.runAction(e.client, 'hit', { duration: .08 });
  await assert.rejects(VTS.runAction(e.client, 'kick', {}), /已有动作/); await one;
  assert.equal(e.calls.filter(x => x.type === 'MoveModelRequest').length, 0);
});

test('hit and kick trigger their selected hotkey exactly once before their model movement', async () => {
  for (const kind of ['hit', 'kick']) {
    const e = actionClient();
    await VTS.runAction(e.client, kind, { duration: .05, hotkeyID: 'smile-id' });
    const hotkeys = e.calls.filter(x => x.type === 'HotkeyTriggerRequest');
    assert.equal(hotkeys.length, 1, kind + ' should trigger exactly once');
    assert.equal(hotkeys[0].data.hotkeyID, 'smile-id');
    const hotkeyIndex = e.calls.findIndex(x => x.type === 'HotkeyTriggerRequest');
    const effectIndex = e.calls.findIndex(x => x.type === (kind === 'kick' ? 'MoveModelRequest' : 'InjectParameterDataRequest'));
    assert.ok(hotkeyIndex < effectIndex);
  }
});

test('hit and kick reject a missing hotkey before sending any request', async () => {
  for (const kind of ['hit', 'kick']) {
    const e = actionClient();
    await assert.rejects(VTS.runAction(e.client, kind, { duration: .05, hotkeyID: 'missing-id' }), /热键/);
    assert.equal(e.calls.length, 0);
  }
});

test('all action kinds recheck the current model after a hotkey before mutating it', async () => {
  for (const kind of ['hit', 'pinch-left', 'kick']) {
    const e = actionClient(); let switched = false;
    e.client.request = async (type, data) => {
      e.calls.push({ type, data });
      if (type === 'HotkeyTriggerRequest') { switched = true; return {}; }
      if (type === 'CurrentModelRequest') return model(switched ? 'model-b' : 'model-a');
      return {};
    };
    await assert.rejects(VTS.runAction(e.client, kind, { duration: .05, hotkeyID: 'smile-id' }), /模型/);
    assert.equal(e.calls.filter(x => x.type === 'HotkeyTriggerRequest').length, 1);
    assert.equal(e.calls.filter(x => x.type === 'InjectParameterDataRequest' || x.type === 'MoveModelRequest').length, 0);
  }
});

test('hit reverses both head angles for right-side impact while preserving default left direction', async () => {
  for (const [direction, sign] of [[undefined, 1], ['left', 1], ['right', -1]]) {
    const e = actionClient();
    await VTS.runAction(e.client, 'hit', { direction, duration: .05 });
    const first = e.calls.find(x => x.type === 'InjectParameterDataRequest').data.parameterValues;
    assert.equal(Math.sign(first.find(p => p.id === 'FaceAngleX').value), sign);
    assert.equal(Math.sign(first.find(p => p.id === 'FaceAngleZ').value), sign);
    assert.ok(first.filter(p => p.id.startsWith('EyeOpen')).every(p => p.value < 0));
    assert.ok(e.calls.filter(x => x.type === 'InjectParameterDataRequest').at(-1).data.parameterValues.every(p => p.value === 0));
  }
});

test('kick reverses horizontal offset and rotation but keeps upward displacement and exact restore', async () => {
  for (const [direction, sign] of [['left', 1], ['right', -1]]) {
    const e = actionClient();
    await VTS.runAction(e.client, 'kick', { direction, intensity: 1, duration: .05 });
    const moves = e.calls.filter(x => x.type === 'MoveModelRequest');
    const sample=VTS.motionSample('kick',.55,1,direction).modelOffset;
    assert.equal(Math.sign(sample.positionX),sign); assert.ok(sample.positionY>0); assert.ok(sample.shrink>=.7);
    const spin=VTS.motionSample('kick',.25,1,direction).modelOffset.rotation;
    assert.equal(Math.sign(spin),sign);
    assert.equal(moves.at(-1).data.positionX, .23);
    assert.equal(moves.at(-1).data.rotation, 17);
  }
});

test('every pinch direction leaves head angle and position inputs untouched', async () => {
  for (const [kind, direction, sign] of [['pinch', undefined, 1], ['pinch', 'right', -1], ['pinch-left', 'right', -1], ['pinch-right', 'left', -1]]) {
    const e = actionClient();
    await VTS.runAction(e.client, kind, { direction, duration: .05 });
    const first = e.calls.find(x => x.type === 'InjectParameterDataRequest').data.parameterValues;
    assert.ok(first.every(p=>!/^Face(?:Angle|Position)/.test(p.id)));
    assert.equal(e.calls.filter(x=>x.type==='MoveModelRequest').length,0);
  }
});

test('unsupported direction rejects before any VTS request', async () => {
  for (const kind of ['hit', 'pinch', 'kick']) {
    const e = actionClient();
    await assert.rejects(VTS.runAction(e.client, kind, { direction: 'up', duration: .05 }), /方向/);
    assert.equal(e.calls.length, 0);
  }
});

test('hit motion has an exaggerated impact hold and small opposite recoil before returning to zero', () => {
  assert.equal(typeof VTS.motionSample, 'function');
  const impact = VTS.motionSample('hit', .1), hold = VTS.motionSample('hit', .22), recoil = VTS.motionSample('hit', .55);
  assert.equal(impact.parameters.FaceAngleX, 12); assert.equal(impact.parameters.FaceAngleZ, 9);
  assert.equal(hold.parameters.FaceAngleX, 12);
  assert.ok(recoil.parameters.FaceAngleX < -2 && recoil.parameters.FaceAngleX > -4);
  assert.ok(VTS.motionSample('hit', .72).parameters.FaceAngleX > 0);
  assert.ok(Object.values(VTS.motionSample('hit', 1).parameters).every(value => value === 0));
});

test('pinch retains grip and eye feedback without head motion or release recoil', () => {
  assert.equal(typeof VTS.motionSample, 'function');
  assert.equal(VTS.motionSample('pinch', .22).parameters.FaceAngleX, 0);
  assert.equal(VTS.motionSample('pinch', .22).parameters.FaceAngleZ, 0);
  const recoil = VTS.motionSample('pinch', .92).parameters;
  assert.equal(recoil.FaceAngleX,0);assert.equal(recoil.FaceAngleZ,0);
  assert.equal(VTS.motionSample('pinch', .22).parameterEnvelope, 1);
  assert.equal(VTS.motionSample('pinch', .78).parameterEnvelope, 1);
  assert.equal(VTS.motionSample('pinch', .90).parameterEnvelope, 0);
  assert.equal(VTS.motionSample('pinch', .92).parameterEnvelope, 0);
  for (let n = 0; n <= 100; n++) {
    const sample = VTS.motionSample('pinch', n / 100);
    assert.ok(sample.parameterEnvelope >= 0 && sample.parameterEnvelope <= 1);
    assert.equal(sample.parameters.FacePositionX, 0); assert.equal(sample.parameters.FacePositionY, 0);
    assert.equal(sample.parameters.FaceAngleX,0);assert.equal(sample.parameters.FaceAngleZ,0);
    assert.ok(sample.parameters.EyeOpenLeft >= -.65 && sample.parameters.EyeOpenLeft <= 0);
    if (n >= 22 && n <= 78) {
      assert.equal(sample.parameterEnvelope, 1);
      assert.equal(sample.parameters.FaceAngleX,0);
    }
  }
  assert.ok(Object.values(VTS.motionSample('pinch', 1).parameters).every(value => value === 0));
  assert.ok(VTS.motionSample('pinch', .5, 3).parameters.EyeOpenLeft >= -.65);
});

test('action defaults use four-second pinch and 3.2-second kick with a virtual clock', async () => {
  for (const [kind, expectedMilliseconds] of [['pinch', 4000], ['pinch-left', 4000], ['pinch-right', 4000], ['hit', 1000], ['kick', 3200]]) {
    const clock = virtualTimeVTS(), e = actionClient();
    await clock.api.runAction(e.client, kind, {});
    assert.equal(clock.now(), expectedMilliseconds, kind + ' default duration');
  }
});

test('fifteen-second pinch accepts immediate cancellation and rejects out-of-range durations', async () => {
  for (const kind of ['pinch', 'pinch-left', 'pinch-right']) {
    const e = actionClient(), controller = new AbortController();
    e.client.request = async (type, data) => {
      e.calls.push({ type, data });
      if (type === 'InjectParameterDataRequest' && data.parameterValues.some(p => p.value !== 0)) controller.abort();
      return type === 'CurrentModelRequest' ? model() : {};
    };
    await assert.rejects(VTS.runAction(e.client, kind, { duration: 15 }, { signal: controller.signal }), { name: 'AbortError' });
    const last = e.calls.filter(x => x.type === 'InjectParameterDataRequest').at(-1);
    assert.ok(last.data.parameterValues.every(p => p.value === 0));
    await assert.rejects(VTS.runAction(e.client, kind, { duration: 15.01 }), /时长/);
  }
  for (const kind of ['hit', 'kick']) await assert.rejects(VTS.runAction(actionClient().client, kind, { duration: 5.01 }), /时长/);
});

test('hit keeps its impact while kick starts flying after contact', () => {
  const hit = VTS.motionSample('hit', .1), kick = VTS.motionSample('kick', .1);
  assert.equal(hit.parameters.FaceAngleX, 12); assert.equal(hit.parameters.FaceAngleZ, 9);
  assert.equal(hit.parameters.FacePositionX, .08); assert.equal(hit.parameters.FacePositionY, -.04);
  assert.equal(hit.parameters.EyeOpenLeft, -1);
  assert.equal(kick.modelOffset.positionX, 0); assert.equal(kick.modelOffset.positionY, 0); assert.equal(kick.modelOffset.rotation, 0);
});

test('all sampled strengths keep angles bounded eyes nonpositive and zero intensity motionless', () => {
  assert.equal(typeof VTS.motionSample, 'function');
  for (const kind of ['hit', 'pinch', 'kick']) for (const intensity of [0, 1, 3]) for (let n = 0; n <= 100; n++) {
    const left = VTS.motionSample(kind, n / 100, intensity, 'left');
    const right = VTS.motionSample(kind, n / 100, intensity, 'right');
    assert.ok(Math.abs(left.parameters.FaceAngleX) <= 30 && Math.abs(left.parameters.FaceAngleZ) <= 30);
    assert.ok(left.parameters.EyeOpenLeft <= 0 && left.parameters.EyeOpenLeft >= -1);
    assert.ok(right.parameters.EyeOpenRight <= 0 && right.parameters.EyeOpenRight >= -1);
    assert.equal(right.parameters.FaceAngleX + left.parameters.FaceAngleX, 0);
    assert.equal(right.modelOffset.positionX + left.modelOffset.positionX, 0);
    assert.equal(right.modelOffset.positionY, left.modelOffset.positionY);
    if (intensity === 0) assert.ok([...Object.values(left.parameters), ...Object.values(left.modelOffset)].every(value => value === 0));
  }
});

test('emitted additive payloads keep their bounds and include optional face positions only when present', async () => {
  const e = actionClient();
  e.client.inputs.push({ name: 'FacePositionX', min: -10, max: 10 }, { name: 'FacePositionY', min: -10, max: 10 });
  await VTS.runAction(e.client, 'hit', { duration: .4 });
  const frames = e.calls.filter(x => x.type === 'InjectParameterDataRequest').map(x => x.data.parameterValues);
  const x = frames.map(frame => frame.find(p => p.id === 'FaceAngleX').value);
  // Curve extrema are tested at exact progress values above. Wall-clock
  // sampling may skip a short phase when another process delays this worker.
  assert.ok(frames.length >= 2);
  assert.ok(x.every(value => Number.isFinite(value) && Math.abs(value) <= 30));
  assert.ok(frames.every(frame => frame.some(p => p.id === 'FacePositionX' && Number.isFinite(p.value))));
  assert.ok(frames.every(frame => frame.filter(p => p.id.startsWith('EyeOpen')).every(p => p.value <= 0)));
  assert.ok(frames.at(-1).every(p => p.value === 0));
  const missing = actionClient(); await VTS.runAction(missing.client, 'hit', { duration: .05 });
  assert.ok(missing.calls.every(x => !x.data?.parameterValues?.some(p => p.id.startsWith('FacePosition'))));
});

test('pinch custom parameter preserves its configured sign in all emitted samples and ends at zero', async () => {
  for (const value of [1.25, -1.25]) {
    const e = actionClient(); await VTS.runAction(e.client, 'pinch', { duration: .24, parameter: 'CheekPull', parameterValue: value });
    const frames = e.calls.filter(x => x.type === 'InjectParameterDataRequest').map(x => x.data.parameterValues);
    // motionSample deterministically covers recoil and the separate grip
    // envelope. Integration checks every actual sample, without requiring a
    // timer to land inside the peak or recoil windows.
    assert.ok(frames.length >= 2);
    const custom = frames.map(frame => frame.find(p => p.id === 'CheekPull').value);
    assert.ok(custom.every(offset => value > 0 ? offset >= 0 && offset <= value : offset <= 0 && offset >= value));
    assert.equal(custom.at(-1), 0);
  }
});

test('kick flies up shrinks spins twice and restores its exact baseline without cumulative drift', async () => {
  const clock=virtualTimeVTS(),e = actionClient(); await clock.api.runAction(e.client, 'kick', { duration: 3.2 });
  const moves = e.calls.filter(x => x.type === 'MoveModelRequest').map(x => x.data);
  assert.ok(moves.length >= 90 && moves.length <= 101);
  assert.ok(moves.every(p => p.valuesAreRelativeToModel === false && p.timeInSeconds===0 && p.size>=-100 && p.size<=-8));
  assert.ok(moves.some(p=>p.positionX>=.4 && p.positionY>0 && p.size<-70));
  let total=0;for(let i=1;i<moves.length;i++){let delta=moves[i].rotation-moves[i-1].rotation;delta=((delta+540)%360)-180;assert.ok(Math.abs(delta)<50);total+=delta;}
  assert.ok(Math.abs(total-720)<1e-8);
  assert.deepEqual({ x: moves.at(-1).positionX, y: moves.at(-1).positionY, rot: moves.at(-1).rotation, size: moves.at(-1).size }, { x: .23, y: -.41, rot: 17, size: -8 });
  const zero = actionClient(); await VTS.runAction(zero.client, 'kick', { duration: .05, intensity: 0 });
  assert.ok(zero.calls.filter(x => x.type === 'MoveModelRequest').every(x => x.data.positionX === .23 && x.data.positionY === -.41 && x.data.rotation === 17));
});

test('stopping during kick recoil restores once and schedules no remaining segment', async () => {
  const e = actionClient(), controller = new AbortController(); let moves = 0;
  e.client.request = async (type, data) => {
    e.calls.push({ type, data });
    if (type === 'MoveModelRequest' && ++moves === 2) controller.abort();
    return type === 'CurrentModelRequest' ? model() : {};
  };
  await assert.rejects(VTS.runAction(e.client, 'kick', { duration: .1 }, { signal: controller.signal }), { name: 'AbortError' });
  const sent = e.calls.filter(x => x.type === 'MoveModelRequest');
  assert.equal(sent.length, 3); assert.equal(sent.at(-1).data.positionX, .23); assert.equal(sent.at(-1).data.rotation, 17);
  await pause(50); assert.equal(e.calls.filter(x => x.type === 'MoveModelRequest').length, 3);
});

test('head strikes nod downward with no sideways position and clear optional pitch on stop',async()=>{
 const peak=VTS.motionSample('hit',.1,1,'left','head').parameters;
 assert.equal(peak.FaceAngleX,0);assert.equal(peak.FaceAngleY,-22);assert.equal(peak.FacePositionX,0);
 const e=actionClient();e.client.inputs.push({name:'FaceAngleY',min:-30,max:30});
 const c=new AbortController();await assert.rejects(VTS.runAction(e.client,'hit',{hitTarget:'head',duration:1},{signal:c.signal,onImpact:()=>setTimeout(()=>c.abort(),8)}),{name:'AbortError'});
 const frames=e.calls.filter(x=>x.type==='InjectParameterDataRequest');assert.ok(frames.at(-1).data.parameterValues.every(p=>p.value===0));assert.ok(frames.at(-1).data.parameterValues.some(p=>p.id==='FaceAngleY'));
 await assert.rejects(VTS.runAction(actionClient().client,'hit',{hitTarget:'unknown'}),/部位/);
});
test('kick shrinking can be disabled independently from flying and rotation',async()=>{
 const clock=virtualTimeVTS(),e=actionClient();await clock.api.runAction(e.client,'kick',{kickShrink:0});
 const moves=e.calls.filter(x=>x.type==='MoveModelRequest');assert.ok(moves.every(x=>x.data.size===-8));assert.ok(moves.some(x=>x.data.positionX>.3));
});

test('pinch works visually with no eye inputs and cannot bind a standard head input',async()=>{
 const e=actionClient();e.client.inputs=e.client.inputs.filter(p=>!p.name.startsWith('EyeOpen'));let impacts=0;
 await VTS.runAction(e.client,'pinch',{duration:.05},{onImpact:()=>impacts++});assert.equal(impacts,1);assert.equal(e.calls.filter(c=>/InjectParameter|MoveModel/.test(c.type)).length,0);
 await assert.rejects(VTS.runAction(actionClient().client,'pinch',{parameter:'FaceAngleX',parameterValue:2}),/不再驱动头部/);
});
