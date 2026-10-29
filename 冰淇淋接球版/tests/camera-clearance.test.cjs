const test = require('node:test');
const assert = require('node:assert/strict');
const { Game } = require('../src/engine.js');

function make(config = {}) {
  const game = new Game({ random: () => .5, levels: [{ targetHeight: 10000, duration: 3600,
    count: 1, move: 900, fall: 3, spawnInterval: .15, ...config }] });
  game.spawnY = 234.68;
  game.fallClearance = 360;
  return game;
}
function inspectBirths(game) {
  for (const event of game.events.splice(0)) if (event.type === 'drop') {
    const scoop = game.scoops.find(s => s.body.id === event.bodyId);
    const required = Math.min(game.fallClearance, Math.max(0, game.bowlY - 20 - game.spawnY - scoop.halfHeight));
    assert.ok(game._framingTop() - scoop.body.bounds.max.y >= required - 1e-5,
      `drop ${game.dropped}: need ${required} clear height above the tower, got ${game._framingTop() - scoop.body.bounds.max.y}`);
  }
}
function reach(game, condition, dt = 1 / 120, seconds = 45) {
  for (let frame = 0; frame < seconds / dt && !condition(); frame++) { game.step(dt); inspectBirths(game); }
  assert.ok(condition(), 'the camera must leave the automatic game able to progress');
}

test('rapid maximum-size drops retain full bottom-edge clearance at all supported frame rates', () => {
  for (const dt of [1 / 120, 1 / 30, .25]) {
    const game = make({ mode: 'giant', size: 1.5, largeScale: 2, smallScale: 1.5 });
    game.start(); reach(game, () => game.caught === 25, dt);
    assert.ok(game.cameraY > 2000);
  }
});

test('a tall tower retains its height and a fresh runway after viewport and scoop-size changes', () => {
  const game = make(); game.start(); reach(game, () => game.caught === 12);
  for (const viewport of [{ spawnY: -650, fallClearance: 800 }, { spawnY: 30, fallClearance: 300 }, { spawnY: 100, fallClearance: 400 }]) {
    const before = game.height, caught = game.caught;
    Object.assign(game, viewport); game.effect('size_up', 50);
    assert.equal(game.height, before, 'changing the view must not rescale the physical tower');
    reach(game, () => game.caught === caught + 3);
  }
});

test('after a tower is eaten or blasted, the next drop still has a full fall above the remaining support', () => {
  const game = make(); game.start(); reach(game, () => game.caught === 12);
  const camera = game.cameraY;
  game.effect('eat', 3);
  const first = game.dropped; reach(game, () => game.dropped > first);
  game.effect('blast', 250);
  const second = game.dropped; reach(game, () => game.dropped > second);
  assert.ok(game.cameraY < camera, 'camera should still descend with the shortened tower');
});
