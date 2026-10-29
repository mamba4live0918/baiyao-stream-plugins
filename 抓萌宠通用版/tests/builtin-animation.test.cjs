const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, '素材/manifest.json'), 'utf8'));

test('every shipped pet has a twelve-frame transparent PNG strip', () => {
  const missing = manifest.cows.filter(pet => !pet.walk || pet.frames !== 12 || !pet.articulated);
  assert.deepEqual(missing.map(pet => pet.id), [], 'Missing built-in animation strips');
  for (const pet of manifest.cows) {
    const bytes = fs.readFileSync(path.join(root, '素材', pet.walk));
    assert.equal(bytes.subarray(1, 4).toString(), 'PNG', pet.id);
    assert.equal(bytes.readUInt32BE(16), bytes.readUInt32BE(20) * pet.frames, pet.id);
    assert.equal(bytes[25], 6, pet.id + ' must retain RGBA transparency');
  }
});

test('category fragments preserve animation metadata when recomposing the manifest', () => {
  for (const folder of ['狗', '猫', '羊', '史莱姆']) {
    const fragment = JSON.parse(fs.readFileSync(path.join(root, '素材', folder, 'manifest.json'), 'utf8'));
    for (const pet of fragment) {
      assert.ok(pet.walk, pet.id);
      assert.equal(pet.frames, 12, pet.id);
      assert.equal(manifest.cows.find(item => item.id === pet.id).walk, pet.walk);
    }
  }
});

test('built-in frame rendering changes pose and pauses when held or motion is disabled', () => {
  const source = fs.readFileSync(path.join(root, 'src/app.js'), 'utf8');
  const start = source.indexOf('function sequenceFrame(');
  const end = source.indexOf('function penRect(', start);
  let disabled = false;
  const context = {reduced: () => disabled};
  vm.runInNewContext(source.slice(start, end) + ';globalThis.render = renderCow;', context);
  const pet = {x:100, y:100, size:80, walkMode:'default', walkFrames:4,
    el:{style:{}, dataset:{}}, sprite:{style:{}}, im:{style:{}}};
  const positions = [];
  for (let frame = 0; frame < 4; frame++) {
    pet.hopFrame = frame;
    context.render(pet);
    positions.push(pet.sprite.style.backgroundPosition);
  }
  assert.equal(new Set(positions).size, 4);
  pet.held = true;
  context.render(pet);
  assert.equal(pet.el.dataset.frame, 0);
  pet.held = false;
  disabled = true;
  context.render(pet);
  assert.equal(pet.el.dataset.frame, 0);
});
