const test = require('node:test');
const assert = require('node:assert/strict');
const { Game } = require('../src/engine.js');

function make(random = () => .5) {
  return new Game({ random, levels: [{ id: 'area-blast', mode: 'classic', targetHeight: 10000,
    duration: 3600, bowlWidth: 280, move: 900, spawnInterval: 5 }] });
}
let nextId = 100000;
function add(game, x, y, r = 28, locked = false) {
  const scoop = { body: { id: nextId++, position: { x, y }, velocity: { x: 0, y: 0 },
    angle: 0, bounds: { min: {}, max: {} } }, r, halfHeight: r * .89, born: 0,
    flavor: 0, locked, hasLanded: locked, opacity: 1, stableFor: 0,
    supportLayer: locked ? 1 : 0, supportByBowl: [locked ? 1 : 0], supportIds: locked ? ['bowl-0'] : [] };
  game._updateBounds(scoop); game.scoops.push(scoop); return scoop;
}
function stack(game, count, x = 500) {
  const scoops = [];
  for (let i = 0; i < count; i++) scoops.push(add(game, x, game.bowlY - 24.92 - i * 49.84, 28, true));
  game._reconcileSupports(); return scoops;
}
function advance(game, seconds) { for (let t = 0; t < seconds - 1e-8; t += 1 / 120) game.step(Math.min(1 / 120, seconds - t)); }

test('a blast hits horizontal, vertical and falling scoops by geometry, not by support layer', () => {
  const game = make();
  const horizontal = add(game, 600, 400), vertical = add(game, 500, 500), falling = add(game, 480, 340);
  const cornerOutside = add(game, 610, 510), farSameLayer = add(game, 800, 400);
  for (const s of game.scoops) s.supportLayer = 3;
  assert.equal(game.blastAt(500, 400, 100), 3);
  assert.ok([horizontal, vertical, falling].every(s => s.blasted));
  assert.ok([cornerOutside, farSameLayer].every(s => !s.blasted));
  const event = game.events.at(-1);
  assert.deepEqual(event, { type: 'blast', x: 500, y: 400, radius: 100, count: 3,
    bodyIds: [horizontal, vertical, falling].map(s => s.body.id) });
});

test('exact boundary contact and a large partially overlapping scoop are hit, but a just-outside scoop is spared', () => {
  const game = make();
  const edge = add(game, 610, 400, 10), large = add(game, 645, 400, 50), outside = add(game, 610.01, 400, 10);
  assert.equal(game.blastAt(500, 400, 100), 2);
  assert.ok(edge.blasted && large.blasted); assert.ok(!outside.blasted);
});

test('gift explosion uses the actual visible offset tower position and intersects camera-adjusted bounds', () => {
  const game = make(() => 0);
  const offscreenY = add(game, 600, 200, 28, true), offscreenX = add(game, 100, -400, 28, true);
  const falling = add(game, 550, -300), caught = add(game, 720, -400, 28, true);
  game.cameraY = 500; game.viewLeft = 300; game.viewRight = 900; game.viewTop = 80; game.viewBottom = 500;
  assert.equal(game.effect('blast', 30), 1);
  const event = game.events.at(-1);
  assert.deepEqual([event.x, event.y, event.radius], [720, -400, 30]);
  assert.ok(caught.blasted); assert.ok([offscreenY, offscreenX, falling].every(s => !s.blasted));
});

test('partially visible scoops qualify; an entirely offscreen caught scoop never takes priority over a visible falling one', () => {
  const game = make(() => 0); game.cameraY = 900;
  const hidden = add(game, 500, 0, 28, true), partial = add(game, 650, -920);
  assert.equal(game.effect('blast', 10), 1);
  assert.ok(partial.blasted); assert.ok(!hidden.blasted);
  assert.equal(game.events.at(-1).y, -920);
});

test('gift blast falls back to live offscreen scoops and never selects missed or already blasted debris', () => {
  const game = make(() => 1);
  const live = add(game, 550, -500), missed = add(game, 550, 300), debris = add(game, 550, 310);
  missed.missed = true; debris.blasted = true;
  assert.equal(game.effect('blast', 20), 1); assert.ok(live.blasted);
  assert.equal(game.events.at(-1).y, -500);
});

test('outward impact follows the explosion center and is stronger near its center', () => {
  const game = make(); const left = add(game, 440, 400), right = add(game, 560, 400);
  const up = add(game, 500, 380), down = add(game, 500, 470), center = add(game, 500, 400);
  game.blastAt(500, 400, 100);
  assert.ok(left.body.velocity.x < 0 && right.body.velocity.x > 0);
  assert.ok(up.body.velocity.y < 0 && down.body.velocity.y > 0);
  assert.ok(Math.abs(up.body.velocity.y) > Math.abs(down.body.velocity.y));
  assert.ok(Number.isFinite(center.body.velocity.x) && Number.isFinite(center.body.velocity.y));
  assert.ok(Math.hypot(center.body.velocity.x, center.body.velocity.y) > 0);
});

test('damaging a bottom support lowers height immediately and waits for the intact upper stack to refill', () => {
  const game = make(), [bottom, middle, top] = stack(game, 3);
  game.caught = 3; game.start(); game.nextSpawnIn = 0; game._spawnWaiting = true;
  assert.equal(game.blastAt(bottom.body.position.x, bottom.body.position.y, 1), 1);
  assert.ok(bottom.blasted); assert.ok(!middle.locked && !top.locked);
  assert.equal(game.progressHeight, 0); assert.equal(game._winHold, 0);
  const y = top.body.position.y, dropped = game.dropped;
  advance(game, .1); assert.ok(top.body.position.y > y); assert.equal(game.dropped, dropped);
  advance(game, .7); assert.ok(middle.locked && top.locked); assert.equal(game.layers, 2);
  assert.ok(Math.abs(game.progressHeight - 99.68) < 1e-6);
  assert.equal(game.caught, 3); assert.equal(game.missed, 0);
  assert.equal(game.scoops.length, 2); assert.equal(game.dropped, dropped);
});

test('paused blasts apply damage but freeze the debris until the game resumes', () => {
  const game = make(), [scoop] = stack(game, 1); game.start(); game.pause();
  assert.equal(game.effect('blast', 100), 1); assert.equal(game.progressHeight, 0);
  const before = JSON.stringify({ position: scoop.body.position, opacity: scoop.opacity, elapsed: game.elapsed });
  advance(game, 2);
  assert.equal(JSON.stringify({ position: scoop.body.position, opacity: scoop.opacity, elapsed: game.elapsed }), before);
  game.resume(); advance(game, .1); assert.ok(scoop.opacity < 1); assert.notEqual(scoop.body.position.y, 685.08);
});

test('blast radius defaults to 100, clamps at 1000, and zero never fires', () => {
  const game = make(); add(game, 500, 400);
  assert.equal(game.effect('blast', 0), 0); assert.equal(game.events.length, 0);
  assert.equal(game.effect('blast'), 1); assert.equal(game.events.at(-1).radius, 100);
  const large = make(); add(large, 500, 400); large.effect('blast', 100000); assert.equal(large.events.at(-1).radius, 1000);
  const tiny = make(); add(tiny, 500, 400); tiny.effect('blast', .5); assert.equal(tiny.events.at(-1).radius, 1);
});

test('an empty blast spot emits its real circle without changing score, win hold or automatic timing', () => {
  const game = make(); stack(game, 1); game._winHold = .2; game.nextSpawnIn = 1.2; game._spawnWaiting = true;
  const before = { height: game.progressHeight, hold: game._winHold, next: game.nextSpawnIn, waiting: game._spawnWaiting };
  assert.equal(game.blastAt(100, 200, 40), 0);
  assert.deepEqual({ height: game.progressHeight, hold: game._winHold, next: game.nextSpawnIn, waiting: game._spawnWaiting }, before);
  assert.deepEqual(game.events.at(-1), { type: 'blast', x: 100, y: 200, radius: 40, count: 0, bodyIds: [] });
  const empty = make(); assert.equal(empty.effect('blast', 100), 0); assert.equal(empty.events.length, 0);
  assert.equal(empty.blastAt(500, 400, 100), 0); assert.equal(empty.events.length, 0);
});

test('won and lost rounds ignore gift blasts and direct blast requests', () => {
  for (const status of ['won', 'lost']) {
    const game = make(); stack(game, 1); game.status = status;
    const before = JSON.stringify({ scoops: game.scoops, height: game.progressHeight, events: game.events });
    assert.equal(game.effect('blast', 100), 0); assert.equal(game.blastAt(500, 685, 100), 0);
    assert.equal(JSON.stringify({ scoops: game.scoops, height: game.progressHeight, events: game.events }), before);
  }
});
