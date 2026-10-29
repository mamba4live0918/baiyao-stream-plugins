'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const corePath = path.join(__dirname, '../src/core.js');
const Core = fs.existsSync(corePath) ? require(corePath) : {};
function api(name) {
  assert.equal(typeof Core[name], 'function', `PuppetCore.${name} must be implemented`);
  return Core[name];
}
function fixture() {
  return { version: 1, scene: { width: 1920, height: 1080 }, profiles: {},
    rules: [{ name: '', action: 'hit', count: 1 }], volume: 0.4, port: 8001 };
}
function memoryStorage(initial) {
  const map = new Map(initial ? Object.entries(initial) : []);
  return { getItem: key => map.has(key) ? map.get(key) : null,
    setItem: (key, value) => map.set(key, String(value)) };
}

test('resolution validation rejects coerced, fractional, nonfinite and out-of-range dimensions', () => {
  const valid = api('validateResolution');
  for (const pair of [[320, 320], [7680, 7680], [720, 1280], [3840, 2160]]) assert.equal(valid(...pair), true);
  for (const pair of [[319, 1080], [1920, 7681], [1920.5, 1080], ['1920', 1080], [NaN, 1080], [Infinity, 1080], [null, 1080]]) assert.equal(valid(...pair), false);
});

test('aspect keys share layouts across equal ratios and distinguish portrait', () => {
  const key = api('aspectKey');
  assert.equal(key(1920, 1080), '16:9');
  assert.equal(key(3840, 2160), '16:9');
  assert.equal(key(720, 1280), '9:16');
  assert.equal(key(7680, 320), '24:1');
  assert.throws(() => key(0, 1080), RangeError);
});

test('contain fitting reports actual letterbox offsets without DPR multiplication', () => {
  const fit = api('fitRect');
  assert.deepEqual(fit(1920, 1080, 1000, 1000), { left: 0, top: 218.75, width: 1000, height: 562.5, scale: 1000 / 1920 });
  assert.deepEqual(fit(1080, 1920, 1000, 1000), { left: 218.75, top: 0, width: 562.5, height: 1000, scale: 1000 / 1920 });
  assert.throws(() => fit(1920, 1080, 0, 1000), RangeError);
});

test('pointer mapping includes host and contain offsets and clamps outside points', () => {
  const convert = api('clientToNormalized');
  const rect = { left: 10, top: 238.75, width: 1000, height: 562.5 };
  assert.deepEqual(convert(510, 520, rect), { x: 0.5, y: 0.5 });
  assert.deepEqual(convert(-50, 9999, rect), { x: 0, y: 1 });
  assert.throws(() => convert(NaN, 10, rect), RangeError);
  assert.throws(() => convert(1, 1, { left: 0, top: 0, width: 0, height: 1 }), RangeError);
});

test('normalized anchor conversion scales independently of screen pixels', () => {
  const pixels = api('pointToPixels');
  assert.deepEqual(pixels({ x: 0.25, y: 0.75 }, 3840, 2160), { x: 960, y: 1620 });
  assert.deepEqual(pixels({ x: -1, y: 2 }, 720, 1280), { x: 0, y: 1280 });
  assert.throws(() => pixels({ x: undefined, y: 0 }, 720, 1280), RangeError);
});

test('models and aspect layouts isolate calibration without mutating inputs', () => {
  const profile = api('defaultProfile')('model-a', '模型 A');
  const other = api('defaultProfile')('model-b', '模型 B');
  const ensure = api('ensureLayout');
  const initial = ensure(profile, 1920, 1080);
  assert.equal(initial.calibrated, false);
  assert.deepEqual(Object.keys(initial.anchors), ['hit', 'hitHead', 'pinchLeft', 'pinchRight', 'kick']);
  initial.calibrated = true;
  initial.anchors.hit.x = 0.23;
  profile.layouts['16:9'] = initial;
  const same = ensure(profile, 3840, 2160);
  assert.equal(same.calibrated, true);
  assert.equal(same.anchors.hit.x, 0.23);
  same.anchors.hit.x = 0.77;
  same.settings.hit.size = 0.5;
  assert.equal(profile.layouts['16:9'].anchors.hit.x, 0.23);
  assert.equal(profile.layouts['16:9'].settings.hit.size, 0.16);
  assert.equal(ensure(profile, 1080, 1920).calibrated, false);
  assert.equal(ensure(other, 1920, 1080).calibrated, false);
  assert.deepEqual(Object.keys(profile.layouts), ['16:9']);
});

test('independent action defaults cannot leak edits across actions or profiles', () => {
  const p = api('defaultProfile')('a', 'A');
  const layout = api('ensureLayout')(p, 1920, 1080);
  assert.deepEqual(layout.settings.pinch, { size: 0.16, effectScale:1, intensity: 1, duration: 4, direction: 'left', variant: 'shoe', hotkeyID: '', parameter: '', parameterValue: 0, skinColor: '#ffe3d5', pinchMarkScale: 1, pinchMarkOpacity: 0.85, pinchStyleVersion: 1 });
  layout.settings.hit.intensity = 2;
  assert.equal(layout.settings.pinch.intensity, 1);
  assert.equal(api('ensureLayout')(p, 1920, 1080).settings.hit.intensity, 1);
});

function configuredFixture() {
  const d = fixture();
  d.profiles.a = api('defaultProfile')('a', 'A');
  d.profiles.a.layouts['16:9'] = api('ensureLayout')(d.profiles.a, 1920, 1080);
  return d;
}
function legacyPinch(d, duration) {
  const pinch = d.profiles.a.layouts['16:9'].settings.pinch;
  for (const field of ['pinchStyleVersion', 'skinColor', 'pinchMarkScale', 'pinchMarkOpacity']) delete pinch[field];
  pinch.duration = duration;
  return pinch;
}

test('pinch defaults last four seconds and its skin fields never leak into hit or kick', () => {
  const d = configuredFixture();
  const settings = d.profiles.a.layouts['16:9'].settings;
  assert.equal(settings.pinch.duration, 4);
  for (const kind of ['hit', 'kick']) {
    assert.equal(settings[kind].duration, kind === 'kick' ? 3.2 : 1);
    for (const field of ['pinchMarkScale', 'pinchMarkOpacity', 'pinchStyleVersion']) assert.equal(Object.hasOwn(settings[kind], field), false);
    Object.assign(settings[kind], { pinchMarkScale: -1, pinchMarkOpacity: 2, pinchStyleVersion: 99 });
  }
  const checked = api('validateConfig')(d);
  assert.equal(checked.ok, true);
  for (const kind of ['hit', 'kick']) {
    for (const field of ['pinchMarkScale', 'pinchMarkOpacity', 'pinchStyleVersion']) assert.equal(Object.hasOwn(checked.value.profiles.a.layouts['16:9'].settings[kind], field), false);
  }
});

test('legacy pinch duration is migrated once while anchors calibration variants and rules survive', () => {
  for (const [before, after] of [[0.1, 4], [1, 4], [4, 4], [4.5, 4.5], [5, 5]]) {
    const d = configuredFixture();
    const layout = d.profiles.a.layouts['16:9'];
    const pinch = legacyPinch(d, before);
    layout.calibrated = true;
    layout.anchors.pinchLeft = { x: 0.23, y: 0.37 };
    layout.settings.kick.variant = 'barefoot';
    d.rules = [{ name: '捏脸', action: 'pinch', count: 2 }, { name: '赤脚', action: 'kick', count: 3, variant: 'barefoot' }];
    const original = structuredClone(d);
    const checked = api('validateConfig')(d);
    assert.equal(checked.ok, true);
    const result = checked.value.profiles.a.layouts['16:9'];
    assert.equal(result.settings.pinch.duration, after);
    assert.equal(result.settings.pinch.pinchStyleVersion, 1);
    assert.equal(result.settings.pinch.skinColor, '#ffe3d5');
    assert.equal(result.settings.pinch.pinchMarkScale, 1);
    assert.equal(result.settings.pinch.pinchMarkOpacity, 0.85);
    assert.equal(result.calibrated, true);
    assert.deepEqual(result.anchors.pinchLeft, { x: 0.23, y: 0.37 });
    assert.equal(result.settings.kick.variant, 'barefoot');
    assert.deepEqual(checked.value.rules, original.rules);
    assert.deepEqual(d, original);
    assert.equal(Object.hasOwn(pinch, 'pinchStyleVersion'), false);
    result.settings.pinch.duration = 0.1;
    assert.equal(api('validateConfig')(checked.value).value.profiles.a.layouts['16:9'].settings.pinch.duration, 0.1);
  }
});

test('new pinch duration permits fifteen seconds and explicit short values while hit and kick keep their cap', () => {
  for (const duration of [0.1, 0.5, 4, 5.01, 15]) {
    const d = configuredFixture();
    Object.assign(d.profiles.a.layouts['16:9'].settings.pinch, { duration, pinchStyleVersion: 1 });
    const checked = api('validateConfig')(d);
    assert.equal(checked.ok, true, `pinch duration ${duration}`);
    assert.equal(checked.value.profiles.a.layouts['16:9'].settings.pinch.duration, duration);
  }
  for (const kind of ['hit', 'kick']) {
    const d = configuredFixture();
    d.profiles.a.layouts['16:9'].settings[kind].duration = 5;
    assert.equal(api('validateConfig')(d).ok, true);
    d.profiles.a.layouts['16:9'].settings[kind].duration = 5.01;
    assert.equal(api('validateConfig')(d).ok, false);
  }
});

test('legacy duration is validated before migration and invalid new durations or version markers are rejected', () => {
  for (const duration of [0, -1, 0.099, 5.01, NaN, Infinity, '1', null, undefined]) {
    const d = configuredFixture(); legacyPinch(d, duration);
    assert.equal(api('validateConfig')(d).ok, false, `legacy duration ${String(duration)}`);
  }
  for (const duration of [0, 0.099, 15.01, NaN, Infinity, '4', null, undefined]) {
    const d = configuredFixture();
    Object.assign(d.profiles.a.layouts['16:9'].settings.pinch, { duration, pinchStyleVersion: 1 });
    assert.equal(api('validateConfig')(d).ok, false, `new duration ${String(duration)}`);
  }
  for (const pinchStyleVersion of [0, 2, '1', null, undefined, true]) {
    const d = configuredFixture(); d.profiles.a.layouts['16:9'].settings.pinch.pinchStyleVersion = pinchStyleVersion;
    assert.equal(api('validateConfig')(d).ok, false, `version ${String(pinchStyleVersion)}`);
  }
});

test('skin color requires six hex digits and does not accept malformed explicit values even before migration', () => {
  for (const skinColor of ['url(example)', 'javascript:alert(1)', '<script>', 'peachpuff', '#fff', '#ffe3d500', 'ffe3d5', '#gg0000', ' #ffe3d5 ', '', null, undefined, 0]) {
    for (const legacy of [true, false]) {
      const d = configuredFixture();
      const pinch = legacy ? legacyPinch(d, 1) : d.profiles.a.layouts['16:9'].settings.pinch;
      pinch.skinColor = skinColor;
      assert.equal(api('validateConfig')(d).ok, false, `${legacy ? 'legacy' : 'new'} skin color ${String(skinColor)}`);
    }
  }
  const d = configuredFixture();
  d.profiles.a.layouts['16:9'].settings.pinch.skinColor = '#AbC09F';
  const checked = api('validateConfig')(d);
  assert.equal(checked.ok, true);
  assert.equal(checked.value.profiles.a.layouts['16:9'].settings.pinch.skinColor, '#abc09f');
  assert.equal(d.profiles.a.layouts['16:9'].settings.pinch.skinColor, '#AbC09F');
});

test('pinch mark scale and opacity enforce finite boundaries and only missing fields get defaults', () => {
  for (const [field, valid, invalid] of [
    ['pinchMarkScale', [0.5, 1, 2], [0.49, 2.01, null, undefined, '1', NaN, Infinity]],
    ['pinchMarkOpacity', [0, 0.85, 1], [-0.01, 1.01, null, undefined, '0.5', NaN, Infinity]]
  ]) {
    for (const value of valid) {
      const d = configuredFixture(); d.profiles.a.layouts['16:9'].settings.pinch[field] = value;
      const checked = api('validateConfig')(d);
      assert.equal(checked.ok, true);
      assert.equal(checked.value.profiles.a.layouts['16:9'].settings.pinch[field], value);
    }
    for (const value of invalid) {
      const d = configuredFixture(); d.profiles.a.layouts['16:9'].settings.pinch[field] = value;
      assert.equal(api('validateConfig')(d).ok, false, `${field} ${String(value)}`);
    }
  }
  const d = configuredFixture();
  const pinch = d.profiles.a.layouts['16:9'].settings.pinch;
  pinch.pinchStyleVersion = 1; pinch.duration = 0.1;
  for (const key of ['skinColor', 'pinchMarkScale', 'pinchMarkOpacity']) delete pinch[key];
  const checked = api('validateConfig')(d);
  assert.equal(checked.ok, true);
  assert.equal(checked.value.profiles.a.layouts['16:9'].settings.pinch.duration, 0.1);
  assert.equal(checked.value.profiles.a.layouts['16:9'].settings.pinch.skinColor, '#ffe3d5');
  assert.equal(checked.value.profiles.a.layouts['16:9'].settings.pinch.pinchMarkScale, 1);
  assert.equal(checked.value.profiles.a.layouts['16:9'].settings.pinch.pinchMarkOpacity, 0.85);
});

test('light and dark pinch skin settings round-trip through export import and storage without tokens', () => {
  for (const skinColor of ['#FFE3D5', '#60412A']) {
    const d = configuredFixture();
    const pinch = d.profiles.a.layouts['16:9'].settings.pinch;
    Object.assign(pinch, { skinColor, pinchMarkScale: 1.7, pinchMarkOpacity: 0.6, duration: 0.25, pinchStyleVersion: 1, token: 'PINCH-SECRET' });
    d.authenticationToken = 'ROOT-SECRET';
    const exported = api('exportConfig')(d);
    assert.equal(exported.ok, true);
    assert.equal(exported.text.includes('SECRET'), false);
    const imported = api('importConfig')(exported.text);
    assert.equal(imported.ok, true);
    const storage = memoryStorage();
    assert.equal(api('saveConfig')(storage, imported.value, 'skin').ok, true);
    const loaded = api('loadConfig')(storage, 'skin');
    assert.equal(loaded.ok, true);
    const actual = loaded.value.profiles.a.layouts['16:9'].settings.pinch;
    assert.equal(actual.skinColor, skinColor.toLowerCase());
    assert.equal(actual.duration, 0.25);
    assert.equal(actual.pinchMarkScale, 1.7);
    assert.equal(actual.pinchMarkOpacity, 0.6);
    assert.equal(actual.pinchStyleVersion, 1);
  }
});

test('loading a legacy pinch migrates the returned value without overwriting the saved record', () => {
  const d = configuredFixture(); legacyPinch(d, 1);
  const before = JSON.stringify(d);
  const storage = memoryStorage({ legacy: before });
  const loaded = api('loadConfig')(storage, 'legacy');
  assert.equal(loaded.ok, true);
  assert.equal(loaded.value.profiles.a.layouts['16:9'].settings.pinch.duration, 4);
  assert.equal(loaded.value.profiles.a.layouts['16:9'].settings.pinch.pinchStyleVersion, 1);
  assert.equal(storage.getItem('legacy'), before);
  const layout = api('ensureLayout')(d.profiles.a, 3840, 2160);
  assert.equal(layout.settings.pinch.duration, 4);
  assert.equal(layout.settings.pinch.pinchStyleVersion, 1);
});

test('legacy settings missing direction migrate to left without mutating the source', () => {
  const d = fixture();
  d.profiles.a = api('defaultProfile')('a', 'A');
  const layout = api('ensureLayout')(d.profiles.a, 1920, 1080);
  d.profiles.a.layouts['16:9'] = layout;
  for (const action of ['hit', 'pinch', 'kick']) delete layout.settings[action].direction;
  const checked = api('validateConfig')(d);
  assert.equal(checked.ok, true);
  for (const action of ['hit', 'pinch', 'kick']) {
    assert.equal(checked.value.profiles.a.layouts['16:9'].settings[action].direction, 'left');
    assert.equal(Object.hasOwn(layout.settings[action], 'direction'), false);
  }
  const ensured = api('ensureLayout')(d.profiles.a, 3840, 2160);
  assert.equal(ensured.settings.hit.direction, 'left');
});

test('direction preserves right in exported configuration and rejects every other supplied value', () => {
  const d = fixture();
  d.profiles.a = api('defaultProfile')('a', 'A');
  const layout = api('ensureLayout')(d.profiles.a, 1920, 1080);
  d.profiles.a.layouts['16:9'] = layout;
  for (const action of ['hit', 'pinch', 'kick']) layout.settings[action].direction = 'right';
  const exported = api('exportConfig')(d);
  assert.equal(exported.ok, true);
  const imported = api('importConfig')(exported.text);
  assert.equal(imported.ok, true);
  for (const action of ['hit', 'pinch', 'kick']) assert.equal(imported.value.profiles.a.layouts['16:9'].settings[action].direction, 'right');
  for (const direction of ['LEFT', 'up', '', null, undefined, 1, {}, []]) {
    layout.settings.hit.direction = direction;
    assert.equal(api('validateConfig')(d).ok, false, `supplied direction ${String(direction)} must be rejected`);
  }
});

test('default config has no bound real gifts and independent document instances', () => {
  const create = api('defaultConfig');
  const first = create();
  assert.deepEqual(first, fixture());
  first.rules[0].name = 'changed';
  assert.equal(create().rules[0].name, '');
});

test('config validation rejects invalid known fields without partially accepting input', () => {
  const validate = api('validateConfig');
  for (const mutate of [
    d => { d.version = 2; }, d => { d.scene.width = '1920'; },
    d => { d.volume = 1.1; }, d => { d.port = 0; },
    d => { d.rules[0].action = 'execute'; }, d => { d.rules[0].count = 0; },
    d => { d.rules[0].count = 1.1; }, d => { d.rules[0].count = 101; },
    d => { d.rules = Array.from({ length: 101 }, () => ({ name: '', action: 'hit', count: 1 })); },
    d => { delete d.scene; }
  ]) {
    const d = fixture(); mutate(d);
    const result = validate(d);
    assert.equal(result.ok, false);
    assert.equal(result.value, null);
    assert.ok(result.error);
  }
});

test('validated imports preserve anchors and settings while excluding all token fields', () => {
  const p = api('defaultProfile')('model-a', '模型 A');
  p.layouts['16:9'] = api('ensureLayout')(p, 1920, 1080);
  p.layouts['16:9'].calibrated = true;
  p.layouts['16:9'].settings.pinch.hotkeyID = 'expression-id';
  p.layouts['16:9'].settings.pinch.parameter = 'ExistingInput';
  p.layouts['16:9'].settings.pinch.parameterValue = -30;
  p.authenticationToken = 'PROFILE-SECRET';
  p.layouts['16:9'].settings.hit.token = 'NESTED-SECRET';
  const d = fixture(); d.profiles['model-a'] = p;
  d.token = 'ROOT-SECRET'; d.vts = { authenticationToken: 'VTS-SECRET' };
  d.rules[0].name = '  爱心  ';
  const exported = api('exportConfig')(d);
  assert.equal(exported.ok, true);
  assert.equal(exported.text.includes('SECRET'), false);
  const imported = api('importConfig')(exported.text);
  assert.equal(imported.ok, true);
  assert.equal(imported.value.profiles['model-a'].layouts['16:9'].calibrated, true);
  assert.equal(imported.value.profiles['model-a'].layouts['16:9'].settings.pinch.parameterValue, -30);
  assert.equal(imported.value.rules[0].name, '爱心');
  imported.value.profiles['model-a'].layouts['16:9'].anchors.hit.x = 0.99;
  assert.equal(p.layouts['16:9'].anchors.hit.x, 0.5);
});

test('invalid model records, unsafe keys and corrupt layouts are rejected', () => {
  const validate = api('validateConfig');
  const validProfile = api('defaultProfile')('a', 'A');
  validProfile.layouts['16:9'] = api('ensureLayout')(validProfile, 1920, 1080);
  for (const mutate of [
    p => { p.modelID = 'different'; },
    p => { p.layouts['16:9'].anchors.hit.x = 1.01; },
    p => { p.layouts['16:9'].calibrated = 'yes'; },
    p => { p.layouts['16:9'].settings.hit.duration = 0; },
    p => { p.layouts['16:9'].settings.hit.size = 1.01; },
    p => { p.layouts['16:9'].settings.hit.intensity = Infinity; },
    p => { p.layouts['32:18'] = p.layouts['16:9']; },
    p => { p.layouts['bad'] = p.layouts['16:9']; }
  ]) {
    const d = fixture(); const p = structuredClone(validProfile); mutate(p); d.profiles.a = p;
    assert.equal(validate(d).ok, false);
  }
  const malicious = JSON.parse('{"__proto__":{"polluted":true}}');
  const d = fixture(); d.profiles = malicious;
  assert.equal(validate(d).ok, false);
  assert.equal({}.polluted, undefined);
});

test('JSON import refuses malformed, oversized and nonobject input', () => {
  const parse = api('importConfig');
  for (const input of ['{', 'null', '[]', '1', ' '.repeat(1048577), '', {}]) {
    assert.equal(parse(input).ok, false);
  }
  assert.equal(parse(JSON.stringify(fixture())).ok, true);
});

test('first-run load succeeds without writing defaults', () => {
  const storage = memoryStorage();
  const loaded = api('loadConfig')(storage, 'test');
  assert.equal(loaded.ok, true);
  assert.equal(loaded.found, false);
  assert.deepEqual(loaded.value, fixture());
  assert.equal(storage.getItem('test'), null);
});

test('storage denial and malformed records report temporary defaults and preserve old text', () => {
  const denied = { getItem() { throw new Error('SecurityError'); }, setItem() { throw new Error('denied'); } };
  const readDenied = api('loadConfig')(denied);
  assert.equal(readDenied.ok, false);
  assert.deepEqual(readDenied.value, fixture());
  const storage = memoryStorage({ test: '{broken' });
  const corrupt = api('loadConfig')(storage, 'test');
  assert.equal(corrupt.ok, false);
  assert.equal(corrupt.found, true);
  assert.equal(storage.getItem('test'), '{broken');
});

test('save checks validity before writing and reports quota or interrupted write honestly', () => {
  const old = JSON.stringify(fixture());
  const quota = { getItem() { return old; }, setItem() { throw new Error('QuotaExceededError'); } };
  assert.equal(api('saveConfig')(quota, fixture()).ok, false);
  assert.equal(quota.getItem(), old);
  const dropped = { getItem() { return old; }, setItem() {} };
  const changed = fixture(); changed.volume = 0.7;
  assert.equal(api('saveConfig')(dropped, changed).ok, false);
  const storage = memoryStorage({ test: old });
  changed.scene.width = 0;
  assert.equal(api('saveConfig')(storage, changed, 'test').ok, false);
  assert.equal(storage.getItem('test'), old);
});

test('successful save and reload preserve per-model calibrations', () => {
  const storage = memoryStorage();
  const d = fixture();
  d.profiles.a = api('defaultProfile')('a', 'A');
  d.profiles.a.layouts['16:9'] = api('ensureLayout')(d.profiles.a, 1920, 1080);
  d.profiles.a.layouts['16:9'].calibrated = true;
  assert.equal(api('saveConfig')(storage, d, 'test').ok, true);
  const loaded = api('loadConfig')(storage, 'test');
  assert.equal(loaded.ok, true);
  assert.equal(loaded.found, true);
  assert.equal(loaded.value.profiles.a.layouts['16:9'].calibrated, true);
});

test('gift count uses current increment and never substitutes a cumulative combo count', () => {
  const normalize = api('normalizeGift');
  assert.deepEqual(normalize({ name: '  爱心  ', count: 2, comboCount: 99, nickname: '观众' }).value, { name: '爱心', count: 2 });
  assert.deepEqual(normalize({ giftName: '爱心', count: 100, eventId: 123 }).value, { name: '爱心', count: 100, eventId: '123' });
  assert.deepEqual(normalize({ gift: { name: '花' }, count: 1, eventId: 'event-a' }).value, { name: '花', count: 1, eventId: 'event-a' });
  assert.equal(normalize({ name: '爱心', comboCount: 2 }).ok, false);
});

test('gift validation rejects malformed counts and does not invent deduplication IDs', () => {
  const normalize = api('normalizeGift');
  for (const count of [0, -1, 1.5, 101, '2', NaN, Infinity, undefined]) assert.equal(normalize({ name: '花', count }).ok, false);
  for (const name of ['', '   ', null, 'x'.repeat(129)]) assert.equal(normalize({ name, count: 1 }).ok, false);
  assert.equal(normalize({ name: '花', count: 1, eventId: {} }).ok, false);
  assert.equal(normalize(null).ok, false);
  assert.deepEqual(normalize({ name: '花', count: 1, eventId: '', nickname: '观众' }).value, { name: '花', count: 1 });
});

test('browser UMD export works without requiring module or external scripts', () => {
  assert.equal(fs.existsSync(corePath), true, 'core script must exist');
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(corePath, 'utf8'), context);
  assert.equal(context.PuppetCore.aspectKey(1920, 1080), '16:9');
  assert.equal(context.PuppetCore.loadConfig().ok, false);
});

test('legacy kicks migrate once to readable flight duration and preserve calibration and variant',()=>{
 const d=fixture();d.profiles.a=api('defaultProfile')('a','A');const layout=api('ensureLayout')(d.profiles.a,1920,1080);d.profiles.a.layouts['16:9']=layout;
 layout.calibrated=true;layout.anchors.kick={x:.7,y:.6};layout.settings.kick.duration=1;layout.settings.kick.variant='barefoot';delete layout.settings.kick.kickFlightVersion;
 const result=api('validateConfig')(d);assert.equal(result.ok,true);const saved=result.value.profiles.a.layouts['16:9'];
 assert.equal(saved.settings.kick.duration,3.2);assert.equal(saved.settings.kick.variant,'barefoot');assert.deepEqual(saved.anchors.kick,{x:.7,y:.6});assert.equal(saved.calibrated,true);
 saved.settings.kick.duration=1.5;assert.equal(api('validateConfig')(result.value).value.profiles.a.layouts['16:9'].settings.kick.duration,1.5);assert.equal(layout.settings.kick.duration,1);
});

test('new size and contact controls roundtrip and old head anchors migrate without changing face anchor',()=>{
 const d=configuredFixture(),l=d.profiles.a.layouts['16:9'];delete l.anchors.hitHead;l.anchors.hit={x:.37,y:.43};
 Object.assign(l.settings.hit,{hitTarget:'head',contactScale:1.5,effectScale:.5,skinColor:'#AABBCC',size:.3});l.settings.kick.kickShrink=.2;
 const r=Core.validateConfig(d);assert.equal(r.ok,true);const saved=r.value.profiles.a.layouts['16:9'];assert.deepEqual(saved.anchors.hit,{x:.37,y:.43});assert.ok(Math.abs(saved.anchors.hitHead.y-.27)<1e-8);assert.equal(saved.settings.hit.skinColor,'#aabbcc');assert.equal(saved.settings.kick.kickShrink,.2);
 assert.deepEqual(Core.importConfig(Core.exportConfig(r.value).text).value,r.value);
 for(const [field,value]of [['effectScale',0],['contactScale',4],['hitTarget','body'],['skinColor','bad']]){const bad=structuredClone(d);bad.profiles.a.layouts['16:9'].settings.hit[field]=value;assert.equal(Core.validateConfig(bad).ok,false);}
});

test('gift payload from parent SDK realm remains valid without weakening object and field validation',()=>{
 const raw=vm.runInNewContext('({giftName:"小心心",count:1,nickName:"测试用户",avatarUrl:"",giftIcon:""})');
 const result=Core.normalizeGift(raw);assert.equal(result.ok,true,result.error);assert.deepEqual(result.value,{name:'小心心',count:1});
 for(const code of ['new (class Gift {constructor(){this.giftName="小心心";this.count=1}})()', 'Object.assign(Object.create({extra:true}),{giftName:"小心心",count:1})', '({giftName:"小心心",count:"1"})','JSON.parse(\'{"giftName":"小心心","count":1,"__proto__":{}}\')'])assert.equal(Core.normalizeGift(vm.runInNewContext(code)).ok,false);
});
