const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/core.js');
const P = require('../src/named-pets.js');
const { bootstrap, dispatch, flushSave } = require('./helpers/app-harness.cjs');

const furryIds = ['dog-10', 'dog-07', 'friend-tabby', 'cat-08', 'cat-01', 'friend-rat', 'friend-hamster'];
const furryKinds = [9, 6, 72, 31, 24, 73, 74];
const currentFurryIds = furryIds.concat('friend-dog');
const currentFurryKinds = furryKinds.concat(78);
const newMembers = [
  { id: 'friend-lynx', kind: 2000012, motion: 'prowl', name: '猞猁的新名字' },
  { id: 'friend-starry-whale', kind: 2000013, motion: 'swim', name: '星空鲸鱼的新名字' },
  { id: 'friend-world-pet', kind: 2000014, motion: 'walk', name: '世界之外的新名字' }
];

function select(f, id, value) {
  const input = f.document.getElementById(id);
  assert.equal(!!input, true, id + ' is present');
  assert.equal(input.options.some(option => option.value === value), true, id + ' exposes ' + value);
  input.value = value;
  dispatch(input, 'change');
}

function manualAdd(f, kind) {
  const card = f.document.getElementById('cow-gallery').children.find(node => Number(node.dataset.cow) === kind);
  assert.equal(!!card, true, 'real gallery card for kind ' + kind);
  const controls = card.querySelector('.species-add-controls');
  assert.equal(!!controls, true, 'manual controls for kind ' + kind);
  const input = controls.querySelector('input'), button = controls.querySelector('button');
  assert.equal(button.disabled, false, 'manual addition is enabled');
  input.value = '1';
  dispatch(input, 'input');
  button.click();
  const actor = f.ctx.effectInstance.getCows().find(pet => pet.kind === kind);
  assert.equal(!!actor, true, 'manual addition mounts the requested kind');
  return actor;
}

function land(f) {
  for (let time = 0; time < 4500; time += 1000 / 60) f.ctx.frame(time);
}

function name(f, actor, value) {
  dispatch(actor.el, 'contextmenu');
  assert.equal(f.document.getElementById('pet-panel').hidden, false, 'grounded actor opens the real naming panel');
  f.document.getElementById('pet-name').value = value;
  dispatch(f.document.getElementById('pet-name'), 'input');
  f.document.getElementById('pet-name-save').click();
  assert.equal(actor.petName, value);
  assert.equal(typeof actor.residentId, 'string');
}

function openResident(f, value) {
  const row = f.document.getElementById('named-pet-list').children.find(node => node.querySelector('span')?.textContent === value);
  assert.equal(!!row, true, 'saved resident appears in the real settings list');
  row.querySelector('button').click();
  const actor = f.ctx.controlsInstance.actor;
  assert.equal(!!actor, true, 'the real resident edit action finds its mounted actor');
  return actor;
}

function identity(resident) {
  return { id: resident.id, ownerId: resident.ownerId, name: resident.name, kind: resident.kind, individualScale: resident.individualScale };
}

test('furry selectors render eight existing identities and manual Echo naming refreshes as kind72', async () => {
  const f = await bootstrap(C.fresh());
  assert.equal(f.ctx.customInstance.assets.cows.length, 112);
  select(f, 'activeCategory', 'xiaoyao-furry');
  select(f, 'galleryCategory', 'xiaoyao-furry');
  assert.equal(f.ctx.customInstance.cfg.activeCategory, 'xiaoyao-furry');
  const cards = f.document.getElementById('cow-gallery').children;
  assert.deepEqual(cards.map(card => Number(card.dataset.cow)), currentFurryKinds);
  assert.deepEqual(cards.map(card => f.ctx.customInstance.builtinCow(Number(card.dataset.cow)).id), currentFurryIds);
  assert.equal(f.document.getElementById('custom-cow-gallery').children.length, 0);
  const configBefore = JSON.stringify(f.ctx.customInstance.cfg);
  const borderCollie = manualAdd(f, 9), echo = manualAdd(f, 72);
  land(f);
  assert.equal(borderCollie.airborne, false);
  assert.equal(echo.airborne, false);
  assert.equal(borderCollie.visualKind, 9);
  assert.equal(echo.visualKind, 72);
  assert.equal(f.ctx.customInstance.builtinCow(borderCollie.kind).id, 'dog-10');
  assert.equal(f.ctx.customInstance.builtinCow(echo.kind).id, 'friend-tabby');
  assert.equal(JSON.stringify(f.ctx.customInstance.cfg), configBefore, 'manual addition preserves random and gallery configuration');
  name(f, echo, 'Echo保留原身份');
  const saved = flushSave(f.ctx, f.store), expected = identity(saved.naming.residents[0]);
  assert.equal(expected.kind, 72);
  assert.equal(expected.individualScale, 150);
  assert.deepEqual(saved.positions.map(position => position.kind), [9]);
  assert.equal(f.document.querySelector('.pet-nameplate').textContent, expected.name);
  const g = await bootstrap(saved), restored = openResident(g, expected.name);
  assert.equal(restored.kind, 72);
  assert.equal(restored.visualKind, 72);
  assert.equal(restored.residentId, expected.id);
  assert.equal(restored.individualScale, 150);
  assert.deepEqual(identity(flushSave(g.ctx, g.store).naming.residents[0]), expected);
  assert.deepEqual(Array.from(g.ctx.effectInstance.getCows(), actor => actor.kind), [9]);
  assert.equal(g.document.querySelectorAll('.pet-nameplate').length, 1);
});

for (const member of newMembers) test('new native ' + member.id + ' lands, names independently and survives ordinary recall', async () => {
  const state = C.fresh();
  state.outside = 1;
  state.positions = [{ kind: 72, x: .3, y: .6 }];
  const f = await bootstrap(state, null, { realEffects: true });
  select(f, 'galleryCategory', 'xiaoyao');
  const actor = manualAdd(f, member.kind);
  land(f);
  assert.equal(actor.airborne, false);
  assert.equal(actor.kind, member.kind);
  assert.equal(actor.visualKind, member.kind);
  assert.equal(f.ctx.customInstance.builtinCow(actor.kind).id, member.id);
  assert.equal(actor.motionMode, member.motion);
  assert.equal(actor.aquatic, member.motion === 'swim');
  assert.equal(actor.walkFrames, 12);
  assert.equal(actor.articulated, true);
  assert.equal(actor.sourceFacing, 1);
  assert.equal(actor.walkSrc, f.ctx.customInstance.builtinCow(member.kind).walk);
  assert.equal(actor.sprite.style.backgroundSize, '1200% 100%');
  name(f, actor, member.name);
  assert.equal(f.document.querySelector('.pet-nameplate').textContent, member.name);
  assert.equal(actor.el.getAttribute('aria-label'), member.name + '，本场专属宠物');
  const expected = identity(flushSave(f.ctx, f.store).naming.residents[0]);
  f.ctx.effectInstance.trigger('recall', 100);
  const saved = flushSave(f.ctx, f.store);
  assert.equal(saved.outside, 0);
  assert.equal(saved.home, 1, 'ordinary Echo goes home while the new resident stays');
  assert.deepEqual(identity(saved.naming.residents[0]), expected);
  assert.equal(actor.dead, false);
  assert.equal(actor.el.isConnected, true);
  assert.equal(f.document.querySelector('.pet-nameplate').textContent, member.name);
  const g = await bootstrap(saved), restored = openResident(g, member.name);
  assert.equal(restored.kind, member.kind);
  assert.equal(restored.visualKind, member.kind);
  assert.equal(restored.motionMode, member.motion);
  assert.equal(restored.walkFrames, 12);
  assert.equal(restored.articulated, true);
  assert.equal(restored.sourceFacing, 1);
  assert.deepEqual(identity(flushSave(g.ctx, g.store).naming.residents[0]), expected);
});

test('V22 seven moved-kind residents restore their saved names IDs and scales across group and theme changes', async () => {
  const state = C.fresh();
  let naming = P.fresh('v22-seven-furry');
  for (const [index, kind] of furryKinds.entries()) naming = P.apply(naming, {
    type: 'directName', kind, name: 'V22宠物-' + kind, individualScale: 175 + index * 25, x: .12 + index * .1, y: .6
  }).next;
  state.naming = naming;
  const expected = naming.residents.map(identity), f = await bootstrap(state);
  assert.equal(f.document.querySelectorAll('.pet-nameplate').length, 7);
  select(f, 'activeCategory', 'xiaoyao');
  for (const category of ['xiaoyao', 'xiaoyao-furry']) {
    select(f, 'galleryCategory', category);
    const shownKinds = f.document.getElementById('cow-gallery').children.map(card => Number(card.dataset.cow));
    assert.equal(furryKinds.every(kind => shownKinds.includes(kind) === (category === 'xiaoyao-furry')), true);
    assert.deepEqual(flushSave(f.ctx, f.store).naming.residents.map(identity), expected);
  }
  for (const theme of ['aquarium', 'yajiji', 'cream']) {
    select(f, 'theme', theme);
    assert.equal(f.ctx.customInstance.cfg.theme, theme);
    for (const resident of expected) {
      const actor = openResident(f, resident.name);
      assert.equal(actor.kind, resident.kind);
      assert.equal(actor.visualKind, resident.kind, 'named moved kind is not replaced by the duck theme');
      assert.equal(actor.residentId, resident.id);
      assert.equal(actor.individualScale, resident.individualScale);
      assert.equal(actor.petName, resident.name);
      f.document.getElementById('pet-close').click();
    }
    assert.deepEqual(flushSave(f.ctx, f.store).naming.residents.map(identity), expected);
    assert.deepEqual(f.document.querySelectorAll('.pet-nameplate').map(plate => plate.textContent).sort(), expected.map(resident => resident.name).sort());
  }
  const g = await bootstrap(flushSave(f.ctx, f.store));
  assert.deepEqual(flushSave(g.ctx, g.store).naming.residents.map(identity), expected);
  assert.equal(g.document.querySelectorAll('.pet-nameplate').length, 7);
});

test('confirmed session ending clears all new residents while keeping furry group and configuration', async () => {
  const f = await bootstrap(C.fresh());
  select(f, 'activeCategory', 'xiaoyao-furry');
  select(f, 'galleryCategory', 'xiaoyao-furry');
  manualAdd(f, 72);
  select(f, 'galleryCategory', 'xiaoyao');
  const actors = newMembers.map(member => manualAdd(f, member.kind));
  land(f);
  for (const [index, actor] of actors.entries()) name(f, actor, newMembers[index].name);
  const before = flushSave(f.ctx, f.store);
  assert.equal(before.naming.residents.length, 3);
  assert.equal(before.outside, 1);
  f.store.set('pet-catch-effects-v1', 'KEEP-EFFECTS');
  f.store.set('pet-catch-hud-v1', 'KEEP-HUD');
  const configBefore = [...f.store].filter(([key]) => key !== 'pet-catch-v1');
  const customBefore = JSON.stringify(f.ctx.customInstance.cfg);
  const groupsBefore = JSON.stringify(f.ctx.customInstance.assets.categories);
  f.document.getElementById('end-session').click();
  assert.equal(f.ctx.effectInstance.getState().naming.residents.length, 3, 'the first click only asks for confirmation');
  f.document.getElementById('end-session').click();
  const saved = flushSave(f.ctx, f.store);
  assert.equal(saved.outside, 0);
  assert.equal(saved.home, 0);
  assert.equal(saved.naming.residents.length, 0);
  assert.equal(saved.naming.owners.length, 0);
  assert.notEqual(saved.naming.sessionId, before.naming.sessionId);
  assert.equal(f.ctx.effectInstance.getCows().length, 0);
  assert.equal(f.document.querySelectorAll('.pet-nameplate').length, 0);
  assert.equal(actors.every(actor => actor.dead && !actor.el.isConnected), true);
  assert.deepEqual([...f.store].filter(([key]) => key !== 'pet-catch-v1'), configBefore);
  assert.equal(JSON.stringify(f.ctx.customInstance.cfg), customBefore);
  assert.equal(JSON.stringify(f.ctx.customInstance.assets.categories), groupsBefore);
  select(f, 'galleryCategory', 'xiaoyao-furry');
  assert.deepEqual(f.document.getElementById('cow-gallery').children.map(card => Number(card.dataset.cow)), currentFurryKinds);
  const g = await bootstrap(saved);
  assert.equal(g.document.querySelectorAll('.pet-nameplate').length, 0);
  assert.equal(g.ctx.effectInstance.getState().naming.residents.length, 0);
});
