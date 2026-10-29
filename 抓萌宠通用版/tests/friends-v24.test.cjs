const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require('C:/Users/Mamba4live/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const Core = require('../src/core.js');
const Naming = require('../src/named-pets.js');
const { bootstrap, dispatch, flushSave } = require('./helpers/app-harness.cjs');
const root = path.resolve(__dirname, '..');
const {resolveDelivered}=require('./helpers/delivered.cjs');
const read = name => JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'));
const base = read('开发/云与铃铛黑猫-2026-10-10/preservation-baseline.json');
const ids = ['friend-cloud', 'friend-bell-black-cat'];
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function select(f, id, value) {
  const node = f.document.getElementById(id); node.value = value; dispatch(node, 'change');
}
function name(f, pet, value) {
  dispatch(pet.el, 'contextmenu'); assert.equal(f.document.getElementById('pet-panel').hidden, false);
  const input = f.document.getElementById('pet-name'); input.value = value; dispatch(input, 'input');
  f.document.getElementById('pet-name-save').click(); assert.equal(pet.petName, value);
}
test('only the original black-white dog changes group; new cloud and cat join friends', () => {
  const m = read('素材/manifest.json'), group = m.categories.find(c => c.id === 'xiaoyao'), furry = m.categories.find(c => c.id === 'xiaoyao-furry');
  assert.deepEqual(group.members, base.group.members.filter(id => id !== 'friend-dog').concat(ids));
  assert.deepEqual(furry.members, base.furry.members.concat('friend-dog'));
  assert.equal(group.members.length, 15); assert.equal(furry.members.length, 8);
  assert.equal(furry.labels['friend-dog'], '黑白小土狗'); assert(!Object.hasOwn(group.labels, 'friend-dog'));
  assert.equal(group.labels['friend-cloud'], '云宝宝'); assert.equal(group.labels['friend-bell-black-cat'], '铃铛黑猫');
  assert.deepEqual(read('素材/小曜自己人/group.json'), group);
  assert.deepEqual(read('素材/小曜自己人/furry-group.json'), furry);
});
test('the two new reserved kinds append after the immutable 110 old native records', () => {
  const m = read('素材/manifest.json'); assert.equal(m.cows.length, 112);
  assert.deepEqual(m.cows.slice(0, 110), base.manifest.cows);
  assert.deepEqual(m.cows.slice(110).map(pet => pet.id), ids);
  assert.deepEqual(m.cows.slice(110).map(pet => pet.kind), [2000015, 2000016]);
  assert.deepEqual(m.cows.slice(110).map(pet => pet.motion), ['float', 'prowl']);
  assert.deepEqual(m.barns, base.manifest.barns); assert.deepEqual(m.balls, base.manifest.balls);
  assert.deepEqual(m.categories.filter(c => !['xiaoyao', 'xiaoyao-furry'].includes(c.id)), base.manifest.categories.filter(c => !['xiaoyao', 'xiaoyao-furry'].includes(c.id)));
  assert.deepEqual(read('素材/小曜自己人/manifest.json').slice(0, 18), base.sourceFriends);
  assert.equal(new Set(m.cows.map((pet, index) => pet.kind ?? index)).size, 112);
});
test('all old art and all 59 prior manuals and archives remain byte exact', t => {
  const resolved=Object.keys(base.archives).map(file=>[file,resolveDelivered(file)]),missing=resolved.filter(([,p])=>!p).map(([file])=>file);if(missing.length)return t.skip('历史交付文件不在本机（已归档或已删除）：'+missing.join('、'));
  for (const [file, digest] of Object.entries(base.assets)) if (file !== '素材/manifest.json') assert.equal(hash(fs.readFileSync(path.join(root, file))), digest, file);
  assert.equal(Object.keys(base.archives).length, 59);
  for (const [file, source] of resolved) assert.equal(hash(fs.readFileSync(source)), base.archives[file].sha256, file);
});
test('dog selection and random entry use the furry group without changing old kind78', async () => {
  const f = await bootstrap(Core.fresh()), c = f.ctx.customInstance;
  select(f, 'activeCategory', 'xiaoyao-furry'); select(f, 'galleryCategory', 'xiaoyao-furry');
  const cards = f.document.getElementById('cow-gallery').children;
  assert.equal(cards.length, 8); assert(cards.some(card => Number(card.dataset.cow) === 78));
  assert(!c.categoryKinds('xiaoyao').includes(78)); assert(c.categoryKinds('xiaoyao-furry').includes(78));
  for (let i = 0; i < 80; i++) assert(c.categoryKinds('xiaoyao-furry').includes(c.randomCow()));
  assert.equal(c.eligibleKinds('all').length, 112); assert.equal(c.builtinCow(78).id, 'friend-dog');
});
for (const [index, id] of ids.entries()) test(id + ' manual addition animates its own 12-frame profile and can be named', async () => {
  const f = await bootstrap(Core.fresh(), null, { realEffects: true }); select(f, 'galleryCategory', 'xiaoyao');
  const kind = 2000015 + index, card = f.document.getElementById('cow-gallery').children.find(card => Number(card.dataset.cow) === kind);
  assert.equal(!!card, true, id + ' gallery card missing');
  const controls = card.querySelector('.species-add-controls'), input = controls.querySelector('input'); input.value = '1'; dispatch(input, 'input'); controls.querySelector('button').click();
  const pet = f.ctx.effectInstance.getCows().find(pet => pet.kind === kind); assert.equal(!!pet, true);
  const frames = new Set();
  for (let time = 0; time < 6500; time += 1000 / 60) { f.ctx.frame(time); if (!pet.airborne) frames.add(Number(pet.el.dataset.frame)); }
  assert.equal(pet.airborne, false); assert.equal(pet.walkFrames, 12); assert.equal(pet.articulated, true);
  assert.equal(pet.motionMode, index ? 'prowl' : 'float'); assert(frames.size >= (index ? 4 : 10), id + ' frame clock progresses');
  assert.equal(pet.sprite.hidden, pet.motionStage === 'rest');
  name(f, pet, index ? '小铃铛' : '小彩云');
  assert.equal(f.document.querySelector('.pet-nameplate').textContent, pet.petName);
  f.document.getElementById('clear-now').click(); assert.equal(pet.dead, false);
  const saved = flushSave(f.ctx, f.store); assert.equal(saved.naming.residents[0].kind, kind);
});
test('old named dog remains kind78 with its identity, name and scale after regrouping', async () => {
  const old = Core.fresh(); old.naming = Naming.apply(Naming.fresh('prior-v23'), { type: 'directName', kind: 78, name: '黑白守护', individualScale: 280, x: .35, y: .7 }).next;
  const expected = old.naming.residents[0], f = await bootstrap(old), saved = flushSave(f.ctx, f.store).naming.residents[0];
  for (const key of ['id', 'ownerId', 'name', 'kind', 'individualScale']) assert.equal(saved[key], expected[key]);
  assert.equal(f.document.querySelector('.pet-nameplate').textContent, expected.name);
  assert(f.ctx.customInstance.categoryKinds('xiaoyao-furry').includes(saved.kind));
});
test('cloud and cat strips contain twelve nonblank distinct alpha poses and safely framed posters', async () => {
  const m = read('素材/manifest.json');
  for (const id of ids) {
    const pet = m.cows.find(pet => pet.id === id); assert.equal(!!pet, true, id + ' missing');
    const strip = path.join(root, '素材', pet.walk), poster = path.join(root, '素材', pet.src);
    const stripMeta = await sharp(strip).metadata(), posterMeta = await sharp(poster).metadata();
    assert.deepEqual([stripMeta.width, stripMeta.height], [3072, 256]); assert.deepEqual([posterMeta.width, posterMeta.height], [256, 256]); assert(stripMeta.hasAlpha && posterMeta.hasAlpha);
    const hashes = [], images = [await sharp(poster).ensureAlpha().raw().toBuffer()];
    for (let frame = 0; frame < 12; frame++) { const raw = await sharp(strip).extract({ left: frame * 256, top: 0, width: 256, height: 256 }).ensureAlpha().raw().toBuffer(); images.push(raw); hashes.push(hash(raw)); }
    assert.equal(new Set(hashes).size, 12);
    for (const raw of images) { let count = 0; for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) { const alpha = raw[(y * 256 + x) * 4 + 3]; if (alpha >= 32) count++; if (x < 11 || x > 244 || y < 11 || y > 244) assert.equal(alpha, 0, id + ' safe border'); } assert(count > 1000, id + ' visible body'); }
  }
});
