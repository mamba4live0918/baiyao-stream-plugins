const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Core = require('../src/core.js');
const { bootstrap, dispatch, flushSave } = require('./helpers/app-harness.cjs');
const root = path.resolve(__dirname, '..');
const members = [
  { id: 'friend-brown-bear', kind: 2000024, name: '小棕熊' },
  { id: 'friend-george-pig', kind: 2000025, name: '小猪乔治' },
];

function catalog(requireBitmaps = false) {
  const file = path.join(root, '素材/manifest-v132.json');
  if (!requireBitmaps && !fs.existsSync(file)) {
    const old = JSON.parse(fs.readFileSync(path.join(root, '素材/manifest-v131.json'), 'utf8'));
    return require('../开发/小棕熊与乔治-2026-10-13/integration/compose-catalog-v132.cjs').composeCatalog(old);
  }
  assert(fs.existsSync(file), 'V132 catalog is created only after the approved new bitmaps are ready');
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function select(f, id, value) {
  const input = f.document.getElementById(id);
  assert(input.options.some(row => row.value === value));
  input.value = value; dispatch(input, 'change');
}

function add(f, kind, quantity = 1) {
  const card = f.document.getElementById('cow-gallery').children.find(row => Number(row.dataset.cow) === kind);
  assert(card, 'real new-member gallery card');
  const controls = card.querySelector('.species-add-controls'), input = controls.querySelector('input');
  input.value = String(quantity); dispatch(input, 'input'); controls.querySelector('button').click();
  return f.ctx.effectInstance.getCows().filter(row => row.kind === kind);
}

function land(f) { for (let time = 0; time < 4500; time += 1000 / 60) f.ctx.frame(time); }

test('V132 adds only two complete 30-frame walking cartoons to own people', () => {
  const assets = catalog(true), old = JSON.parse(fs.readFileSync(path.join(root, '素材/manifest-v131.json'), 'utf8'));
  assert.equal(assets.cows.length, 121); assert.deepEqual(assets.cows.slice(0, 119), old.cows);
  const own = assets.categories.find(row => row.id === 'xiaoyao'), furry = assets.categories.find(row => row.id === 'xiaoyao-furry');
  assert.equal(own.members.length, 24); assert.equal(furry.members.length, 8);
  assert.deepEqual(furry, old.categories.find(row => row.id === 'xiaoyao-furry'));
  for (const member of members) {
    const row = assets.cows.find(row => row.kind === member.kind);
    assert.equal(row.id, member.id); assert.equal(row.name, member.name); assert.equal(row.category, 'xiaoyao');
    assert.equal(row.motion, 'walk'); assert.equal(row.frames, 30); assert.equal(row.articulated, true); assert.equal(row.sourceFacing, 1);
    assert(own.members.includes(row.id)); assert.equal(own.labels[row.id], row.name); assert(!furry.members.includes(row.id));
    for (const [field, width] of [['src', 256], ['walk', 7680]]) {
      const bytes = fs.readFileSync(path.join(root, '素材', row[field]));
      assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
      assert.equal(bytes.readUInt32BE(16), width); assert.equal(bytes.readUInt32BE(20), 256); assert.equal(bytes[25], 6);
    }
  }
});

for (const member of members) test(member.id + ' manual addition preserves random settings and naming protects only one instance', async () => {
  const f = await bootstrap(Core.fresh(), null, { assets: catalog(), realEffects: true });
  select(f, 'activeCategory', 'xiaoyao-furry'); select(f, 'galleryCategory', 'xiaoyao');
  const custom = f.ctx.customInstance, index = custom.builtinIndex(member.kind);
  assert.equal(custom.cfg.cowSettings[index].scale, 200);
  custom.cfg.cowSettings[index].enabled = false;
  const before = JSON.stringify(custom.cfg), [actor, other] = add(f, member.kind, 2);
  assert.equal(JSON.stringify(custom.cfg), before, 'manual addition does not change random category or enablement');
  land(f);
  for (const row of [actor, other]) {
    assert.equal(row.kind, member.kind); assert.equal(row.visualKind, member.kind); assert.equal(row.airborne, false);
    assert.equal(row.motionMode, 'walk'); assert.equal(row.walkFrames, 30); assert.equal(row.articulated, true); assert.equal(row.sourceFacing, 1);
    assert.equal(row.sprite.style.backgroundSize, '3000% 100%'); assert.equal(row.particleStyle, null);
  }
  dispatch(actor.el, 'contextmenu'); f.document.getElementById('pet-name').value = member.name + '专属';
  dispatch(f.document.getElementById('pet-name'), 'input'); f.document.getElementById('pet-name-save').click();
  assert.equal(actor.petName, member.name + '专属'); assert.equal(other.petName, undefined);
  const saved = flushSave(f.ctx, f.store), resident = saved.naming.residents[0];
  assert.equal(resident.kind, member.kind); assert.equal(resident.individualScale, 150); assert.equal(saved.naming.residents.length, 1);
  f.ctx.effectInstance.trigger('recall', 100);
  const recalled = flushSave(f.ctx, f.store);
  assert.equal(recalled.outside, 0); assert.equal(recalled.home, 1); assert.deepEqual(recalled.naming.residents[0], resident);
  assert.equal(actor.dead, false); assert.equal(actor.el.isConnected, true);
  const g = await bootstrap(recalled, null, { assets: catalog(), realEffects: true, customSaved: custom.cfg });
  assert.deepEqual(flushSave(g.ctx, g.store).naming.residents[0], resident);
  assert.equal(g.document.querySelector('.pet-nameplate').textContent, resident.name);
});

test('V132 extends 200% defaults without resetting old settings or explicit personal motion and frames', async () => {
  const assets = catalog(), settings = assets.cows.slice(0, 119).map(() => ({ enabled: true, scale: 200, fps: 8, motion: 'default' }));
  settings[118] = { enabled: false, scale: 145, fps: 11, motion: 'walk' };
  const saved = { defaultsV116: true, tiers: Core.defaultTiers(), cowSettings: settings, activeCategory: 'xiaoyao-furry', castA: 100,
    customCows: [{ kind: 100, name: 'My upload', category: 'xiaoyao', scale: 160, fps: 10, motion: 'fly' }],
    nextCowKind: 101 };
  const f = await bootstrap(Core.fresh(), null, { assets, customSaved: saved });
  const custom = f.ctx.customInstance;
  assert.equal(custom.cfg.cowSettings.length, 121);
  assert.deepEqual(JSON.parse(JSON.stringify(custom.cfg.cowSettings.slice(0, 119))), settings);
  assert.deepEqual(custom.cfg.cowSettings.slice(119).map(row => row.scale), [200, 200]);
  assert.equal(custom.cfg.activeCategory, saved.activeCategory); assert.equal(custom.cfg.castA, 100);
  assert.equal(custom.cfg.nextCowKind, 101); assert.equal(custom.cfg.customCows[0].kind, 100);
  assert.equal(custom.cfg.customCows[0].motion, 'fly'); assert.equal(custom.cfg.customCows[0].scale, 160);
  const record = { type: 'frames', frames: 17, data: 'data:image/png;base64,AA', poster: 'data:image/png;base64,AA' };
  custom.records.set('cow:100', record);
  assert.equal(custom.cowFrameMeta(100).frames, 17); assert.equal(custom.cowFrameMeta(100).kind, 'sequence');
  assert.equal(custom.cowMotion(100), 'fly'); assert.deepEqual(custom.cowRecord(100), record);
});
