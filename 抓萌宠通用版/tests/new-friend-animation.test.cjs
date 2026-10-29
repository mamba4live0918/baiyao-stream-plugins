const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require('C:/Users/Mamba4live/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const root = path.resolve(__dirname, '..');
const work = path.join(root, '开发/自己人动画-2026-10-08');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const base = read(path.join(work, 'preservation-baseline.json'));
const v22Base = read(path.join(root, '开发/自己人扩充-2026-10-09/preservation-baseline.json'));
const ids = ['friend-gray-upright', 'friend-call-duck', 'friend-nebulosa-tabby', 'friend-cherry-seal'];
const removed = ['friend-chicken', 'friend-duck', 'friend-goose'];
const movedFurry = ['dog-10', 'dog-07', 'friend-tabby', 'cat-08', 'cat-01', 'friend-rat', 'friend-hamster'];
const expandedFriends = ['friend-lynx', 'friend-starry-whale', 'friend-world-pet'];
const v24Friends = ['friend-cloud', 'friend-bell-black-cat'];
const currentFurry = movedFurry.concat('friend-dog');
const states = () => ({
  manifest: read(path.join(root, '素材/manifest.json')),
  group: read(path.join(root, '素材/小曜自己人/group.json')),
  sourceFriends: read(path.join(root, '素材/小曜自己人/manifest.json'))
});

test('four approved friends append stable kinds without changing any old native record or PNG', () => {
  const { manifest, sourceFriends } = states();
  assert.equal(manifest.cows.length, 112);
  assert.deepEqual(manifest.cows.slice(0, 103), base.manifest.cows);
  assert.deepEqual(manifest.cows.slice(0, 107), v22Base.manifest.cows);
  assert.deepEqual(manifest.barns, base.manifest.barns);
  assert.deepEqual(manifest.balls, base.manifest.balls);
  assert.deepEqual(manifest.cows.slice(103, 107).map(pet => pet.id), ids);
  assert.deepEqual(manifest.cows.slice(103, 107).map(pet => pet.kind), [2000008, 2000009, 2000010, 2000011]);
  assert.deepEqual(sourceFriends.slice(0, 11), base.sourceFriends);
  assert.equal(sourceFriends.length, 20);
  assert.deepEqual(sourceFriends.slice(0, 15), v22Base.sourceFriends);
  assert.deepEqual(sourceFriends.slice(11, 15), manifest.cows.slice(103, 107));
  assert.equal(manifest.cows[72].id, 'friend-tabby');
  for (const id of removed) assert(manifest.cows.some(pet => pet.id === id));
  for (const [file, digest] of Object.entries(base.originalFiles)) {
    assert.equal(hash(fs.readFileSync(path.join(root, '素材', file))), digest, file);
  }
});

test('V24 Xiaoyao preserves the V23 regrouping, moves the existing dog and appends two members', () => {
  const { manifest, group } = states();
  const v23Members = v22Base.group.members.filter(id => !movedFurry.includes(id)).concat(expandedFriends);
  const expectedMembers = v23Members.filter(id => id !== 'friend-dog').concat(v24Friends);
  assert.equal(group.members.length, 15);
  assert.deepEqual(group.members, expectedMembers);
  assert(!Object.hasOwn(group.labels, 'friend-tabby'));
  assert.equal(manifest.categories.find(category => category.id === 'xiaoyao-furry').labels['friend-tabby'], 'Echo*（狸花猫）');
  assert.equal(manifest.categories.find(category => category.id === 'xiaoyao-furry').labels['friend-dog'], '黑白小土狗');
  assert.equal(group.labels['friend-nebulosa-tabby'], '⋆Nebulosa⋆（狸花猫）');
  assert.equal(group.labels['friend-gray-upright'], '灰色立耳兔');
  assert.equal(group.labels['friend-call-duck'], '科尔鸭');
  assert.equal(group.labels['friend-cherry-seal'], '樱桃小海豹');
  assert.equal(group.labels['friend-lynx'], '猞猁');
  assert.equal(group.labels['friend-starry-whale'], '星空鲸鱼');
  assert.equal(group.labels['friend-world-pet'], '世界之外小宠物');
  assert.equal(group.labels['friend-cloud'], '云宝宝');
  assert.equal(group.labels['friend-bell-black-cat'], '铃铛黑猫');
  for (const id of removed) assert(!Object.hasOwn(group.labels, id));
  for (const id of currentFurry) assert(!Object.hasOwn(group.labels, id));
  for (const [id, label] of Object.entries(base.group.labels)) {
    if (!removed.includes(id) && !currentFurry.includes(id)) assert.equal(group.labels[id], label);
  }
  assert.deepEqual(manifest.categories.find(category => category.id === 'xiaoyao'), group);
  assert.deepEqual(manifest.categories.filter(category => category.id !== 'xiaoyao' && category.id !== 'xiaoyao-furry'), base.manifest.categories.filter(category => category.id !== 'xiaoyao'));
});

test('new posters and twelve-frame strips are nonblank true-alpha assets with complete safe borders', async () => {
  const { manifest } = states();
  assert.equal(manifest.cows.length, 112);
  const report = read(path.join(work, 'assembly-report.json'));
  for (const [index, id] of ids.entries()) {
    const pet = manifest.cows[103 + index];
    assert.equal(pet.id, id);
    assert.equal(pet.category, 'xiaoyao');
    assert.equal(pet.motion, ['hop', 'walk', 'prowl', 'scoot'][index]);
    assert.equal(pet.sourceFacing, 1);
    assert.equal(pet.frames, 12);
    assert.equal(pet.articulated, true);
    const strip = path.join(root, '素材', pet.walk);
    const poster = path.join(root, '素材', pet.src);
    const stripMeta = await sharp(strip).metadata();
    const posterMeta = await sharp(poster).metadata();
    assert.deepEqual([stripMeta.width, stripMeta.height], [3072, 256]);
    assert.deepEqual([posterMeta.width, posterMeta.height], [256, 256]);
    assert(stripMeta.hasAlpha && posterMeta.hasAlpha);
    const hashes = [];
    const images = [await sharp(poster).ensureAlpha().raw().toBuffer()];
    for (let frame = 0; frame < 12; frame++) {
      const pixels = await sharp(strip).extract({ left: frame * 256, top: 0, width: 256, height: 256 }).ensureAlpha().raw().toBuffer();
      hashes.push(hash(pixels));
      images.push(pixels);
    }
    for (const [frame, pixels] of images.entries()) {
      let occupied = 0, transparent = 0;
      for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
        const alpha = pixels[(y * 256 + x) * 4 + 3];
        if (alpha >= 32) occupied++;
        if (!alpha) transparent++;
        if (x < 11 || x > 244 || y < 11 || y > 244) assert.equal(alpha, 0, id + ' margin image ' + frame);
      }
      assert(occupied > 1000, id + ' visible body');
      assert(transparent > 15000, id + ' transparent area');
    }
    assert.equal(new Set(hashes).size, 12);
    const asset = report.assets.find(asset => asset.id === id);
    assert.deepEqual(hashes, asset.frameHashes);
    assert.equal(new Set(asset.transforms.map(transform => transform.scale)).size, 1);
    assert.equal(new Set(asset.transforms.map(transform => JSON.stringify(transform.targetAnchor))).size, 1);
    assert(asset.frames.every(frame => !frame.sourceTouchesCellEdge));
    assert.equal(asset.poster.approvedSourceRetained, true);
    assert.equal(asset.poster.sourceFacing, 1);
    assert.equal(asset.sourceFacing, 1);
    assert.equal(asset.completeTransparentBorders, true);
    assert.equal(asset.finalFrameBounds.length, 12);
    assert(asset.finalFrameBounds.every(frame => frame.minimumSafeMargin >= 11));
    assert(asset.poster.finalBounds.minimumSafeMargin >= 11);
    const gif = await sharp(path.join(work, id + '-motion.gif'), { animated: true }).metadata();
    assert.equal(gif.pages, 12);
    assert.equal(gif.delay.reduce((sum, delay) => sum + delay, 0), asset.cycleMs);
  }
  const neb = manifest.cows.find(pet => pet.id === 'friend-nebulosa-tabby');
  const nebPoster = await sharp(path.join(root, '素材', neb.src)).raw().toBuffer();
  const nebWalk0 = await sharp(path.join(root, '素材', neb.walk)).extract({ left: 0, top: 0, width: 256, height: 256 }).raw().toBuffer();
  assert.notEqual(hash(nebPoster), hash(nebWalk0), 'approved seated Nebulosa poster remains independent from its four-paw walking frame');
});

test('import registry planning is idempotent and rejects changed old records or unexpected tails', () => {
  const helperPath = path.join(work, 'import-friends.cjs');
  assert(fs.existsSync(helperPath), 'scoped importer is required');
  const { planRegistry } = require(helperPath);
  const { manifest, group, sourceFriends } = v22Base;
  assert.equal(manifest.cows.length, 107);
  assert.equal(group.members.length, 18);
  assert.equal(sourceFriends.length, 15);
  const entries = manifest.cows.slice(103, 107);
  assert.equal(entries.length, 4);
  const initial = planRegistry(base.manifest, base.group, base.sourceFriends, base, entries);
  assert.deepEqual(initial, { manifest, group, sourceFriends });
  assert.deepEqual(planRegistry(manifest, group, sourceFriends, base, entries), initial);
  const changed = structuredClone(manifest);
  changed.cows[72].name = 'replaced old body';
  assert.throws(() => planRegistry(changed, group, sourceFriends, base, entries), /old|prefix|preserv/i);
  const tail = structuredClone(manifest);
  tail.cows.push({ id: 'unexpected-friend' });
  assert.throws(() => planRegistry(tail, group, sourceFriends, base, entries), /tail|roster|length/i);
});

test('poster scale matching uses a visible eye rather than a tiny fur stripe', () => {
  const report = read(path.join(work, 'assembly-report.json'));
  for (const asset of report.assets) {
    assert(asset.poster.referenceWalkingEye.count >= 100, asset.id + ' walking anchor must be a visible eye');
    assert(asset.poster.selectedEye.count >= 100, asset.id + ' poster anchor must be a visible eye');
    assert(asset.poster.eyeScale >= 0.4 && asset.poster.eyeScale <= 1.7, asset.id + ' measured head scale must stay plausible');
  }
});

test('all previously delivered archives and manuals stay byte exact', t => {
  const {resolveDelivered}=require('./helpers/delivered.cjs'),resolved=Object.keys(base.archives).map(file=>[file,resolveDelivered(file)]),missing=resolved.filter(([,p])=>!p).map(([file])=>file);if(missing.length)return t.skip('历史交付文件不在本机（已归档或已删除）：'+missing.join('、'));
  for (const [file, expected] of Object.entries(base.archives)) {
    const bytes = fs.readFileSync(resolved.find(([name])=>name===file)[1]);
    assert.equal(bytes.length, expected.bytes, file);
    assert.equal(hash(bytes), expected.sha256, file);
  }
});
