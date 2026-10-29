const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const sharp = require('C:/Users/Mamba4live/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const root = path.resolve(__dirname, '..');
const read = name => JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'));
const before = read('开发/自己人扩充-2026-10-09/preservation-baseline.json');
const v23Base = read('开发/云与铃铛黑猫-2026-10-10/preservation-baseline.json');
const moved = ['dog-10', 'dog-07', 'friend-tabby', 'cat-08', 'cat-01', 'friend-rat', 'friend-hamster'];
const currentFurry = moved.concat('friend-dog');
const added = ['friend-lynx', 'friend-starry-whale', 'friend-world-pet'];
const v24Added = ['friend-cloud', 'friend-bell-black-cat'];
const names = ['猞猁', '星空鲸鱼', '世界之外小宠物'];
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function fixture(saved) {
  const assets = read('素材/manifest.json');
  const storage = new Map(saved ? [['pet-catch-v1-custom', JSON.stringify(saved)]] : []);
  const context = { structuredClone, console, PetRoamGeometry: require('../src/roam-geometry.js'), PetRoster: require('../src/roster.js'), localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) } };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'src/customize.js'), 'utf8') + ';globalThis.Type=CowCustomizer;', context);
  for (const name of ['bind', 'bindPenManipulation', 'render', 'renderCows']) context.Type.prototype[name] = () => {};
  context.Type.prototype.loadMedia = async () => {};
  return new context.Type({ assets, core: require('../src/core.js'), toast() {}, onChange() {} });
}
test('eight existing friends share a selectable furry group with no duplicate roster', async () => {
  const c = fixture(); await c.ready;
  const manifest = c.assets;
  const furry = manifest.categories.find(category => category.id === 'xiaoyao-furry');
  assert.equal(!!furry, true, 'the furry group is missing');
  assert.equal(furry.name, '小曜自己人的毛孩子');
  assert.deepEqual(furry.members, currentFurry);
  assert.equal(c.setActiveCategory(furry.id), true);
  assert.deepEqual(Array.from(c.categoryKinds(furry.id), kind => c.builtinCow(kind).id), currentFurry);
  assert.deepEqual(Array.from(c.categoryKinds(furry.id), kind => c.cowName(kind)), ['边牧', '萨摩耶', 'Echo*（狸花猫）', '蓝猫', '布偶猫', '花枝鼠', '金丝熊', '黑白小土狗']);
  for (let n = 0; n < 100; n++) assert(currentFurry.includes(c.builtinCow(c.randomCow()).id));
  assert.equal(c.eligibleKinds('all').length, 112);
  assert.equal(new Set(c.eligibleKinds('all')).size, 112);
  assert(c.categoryKinds('dog').includes(9));
  assert(c.categoryKinds('cat').includes(24));
});
test('the current friend group evolves from V22 through the exact V23 and V24 changes', () => {
  const manifest = read('素材/manifest.json');
  const group = manifest.categories.find(category => category.id === 'xiaoyao');
  const v23Members = before.group.members.filter(id => !moved.includes(id)).concat(added);
  assert.deepEqual(v23Base.group.members, v23Members);
  assert.equal(v23Base.group.members.length, 14);
  assert.deepEqual(group.members, v23Members.filter(id => id !== 'friend-dog').concat(v24Added));
  assert.equal(group.members.length, 15);
  for (const id of currentFurry.concat(['friend-chicken', 'friend-duck', 'friend-goose'])) assert(!group.members.includes(id));
  for (let index = 0; index < added.length; index++) assert.equal(group.labels[added[index]], names[index]);
});
test('new friends only append reserved native kinds and preserve every old metadata record and bitmap', () => {
  const manifest = read('素材/manifest.json');
  assert.equal(manifest.cows.length, 112);
  assert.deepEqual(manifest.cows.slice(0, 107), before.manifest.cows);
  assert.equal(v23Base.manifest.cows.length, 110);
  assert.deepEqual(manifest.cows.slice(0, 110), v23Base.manifest.cows);
  assert.deepEqual(manifest.cows.slice(107, 110).map(pet => pet.id), added);
  assert.deepEqual(manifest.cows.slice(107, 110).map(pet => pet.kind), [2000012, 2000013, 2000014]);
  const sourceFriends = read('素材/小曜自己人/manifest.json');
  assert.equal(v23Base.sourceFriends.length, 18);
  assert.equal(sourceFriends.length, 20);
  assert.deepEqual(sourceFriends.slice(0, 18), v23Base.sourceFriends);
  assert.deepEqual(sourceFriends.slice(15, 18).map(pet => pet.id), added);
  assert.deepEqual(manifest.barns, before.manifest.barns);
  assert.deepEqual(manifest.balls, before.manifest.balls);
  assert.deepEqual(manifest.categories.filter(category => !['xiaoyao', 'xiaoyao-furry'].includes(category.id)), before.manifest.categories.filter(category => category.id !== 'xiaoyao'));
  for (const [name, expected] of Object.entries(before.assets)) if (name !== '素材/manifest.json') assert.equal(hash(fs.readFileSync(path.join(root, name))), expected, name);
});
test('old media, per-pet sizes and named residents keep the moved kind identities after regrouping', async () => {
  const settings = before.manifest.cows.map((pet, index) => ({ enabled: index !== 9, scale: index === 72 ? 175 : 200, fps: 8, motion: 'default' }));
  const c = fixture({ tiers: require('../src/core.js').defaultTiers(), cowSettings: settings, defaultsV116: true, activeCategory: 'xiaoyao', customCows: [{ kind: 100, name: '用户自定义', category: 'xiaoyao', enabled: true, scale: 150 }] }); await c.ready;
  c.records.set('cow:72', { data: 'data:image/png;base64,AAAA' });
  assert.equal(c.cfg.cowSettings.length, 112);
  assert.equal(c.cowSetting(9).enabled, false);
  assert.equal(c.cowScale(72), 1.75);
  assert.equal(c.cowSource(72), 'data:image/png;base64,AAAA');
  assert.equal(c.cfg.customCows[0].kind, 100);
  assert(c.categoryKinds('xiaoyao-furry').includes(72));
  assert(!c.categoryKinds('xiaoyao').includes(72));
  const naming = require('../src/named-pets.js');
  const named = naming.apply(naming.fresh('old-session'), { type: 'directName', kind: 72, name: 'Echo的名字', individualScale: 300, x: .3, y: .7 }).next;
  const restored = naming.validateKinds(naming.restore(JSON.parse(JSON.stringify(named)), 'fallback').value, kind => c.hasCowKind(kind));
  assert.deepEqual(restored.value.residents, named.residents);
});
test('both selectors expose the furry group and new characters keep their intended motion profiles', async () => {
  const html = fs.readFileSync(path.join(root, 'src/settings.html'), 'utf8');
  assert.equal((html.match(/<option value="xiaoyao-furry">小曜自己人的毛孩子<\/option>/g) || []).length, 2);
  const c = fixture(); await c.ready;
  for (const [index, kind] of [2000012, 2000013, 2000014].entries()) {
    assert.equal(c.hasCowKind(kind), true);
    assert.equal(c.cowMotion(kind), ['prowl', 'swim', 'walk'][index]);
    assert.equal(c.cowFrameMeta(kind).frames, 12);
    assert.equal(c.cowFrameMeta(kind).articulated, true);
    assert.equal(c.cowScale(kind), 2);
  }
});
test('three new strips contain twelve nonblank distinct poses with safe alpha borders', async () => {
  const manifest = read('素材/manifest.json');
  for (const id of added) {
    const pet = manifest.cows.find(pet => pet.id === id);
    assert.equal(!!pet, true, id + ' missing');
    const strip = path.join(root, '素材', pet.walk), poster = path.join(root, '素材', pet.src);
    const stripMeta = await sharp(strip).metadata(), posterMeta = await sharp(poster).metadata();
    assert.deepEqual([stripMeta.width, stripMeta.height], [3072, 256]);
    assert.deepEqual([posterMeta.width, posterMeta.height], [256, 256]);
    assert(stripMeta.hasAlpha && posterMeta.hasAlpha);
    const hashes = [];
    for (let frame = 0; frame < 12; frame++) {
      const raw = await sharp(strip).extract({ left: frame * 256, top: 0, width: 256, height: 256 }).ensureAlpha().raw().toBuffer();
      hashes.push(hash(raw)); let occupied = 0;
      for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
        const alpha = raw[(y * 256 + x) * 4 + 3];
        if (alpha >= 32) occupied++;
        if (x < 11 || x > 244 || y < 11 || y > 244) assert.equal(alpha, 0, id + ' margin ' + frame);
      }
      assert(occupied > 1000, id + ' nonblank pose ' + frame);
    }
    assert.equal(new Set(hashes).size, 12, id + ' twelve real poses');
  }
});
