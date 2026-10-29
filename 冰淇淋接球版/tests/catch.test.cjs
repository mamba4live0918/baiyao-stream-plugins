const test = require('node:test');
const assert = require('node:assert/strict');
const { Game } = require('../src/engine.js');

function make(config = {}, random = () => .5) {
  return new Game({ random, levels: [{ id: 'catch-test', name: '接球测试', mode: 'classic',
    targetHeight: 10000, duration: 3600, count: 1, move: 900, fall: 1, size: 1,
    bowlWidth: 280, catchOverlap: .25, attemptMode: 'unlimited', spawnInterval: .65, ...config }] });
}
function advance(game, seconds) { for (let time = 0; time < seconds - 1e-8; time += 1 / 120) game.step(Math.min(1 / 120, seconds - time)); }
function until(game, check, maximum = 10) {
  for (let frame = 0; frame < maximum * 120 && !check(); frame++) game.step(1 / 120);
  assert.ok(check(), 'condition must resolve within the allotted simulation time');
}
function firstCatch(game) { game.start(); until(game, () => game.caught === 1); return game.scoops.find(scoop => scoop.locked); }

test('ready waits; start automatically spawns one random scoop and carries its identity in the event', () => {
  const game = make({ count: 10 }, () => .75);
  advance(game, 4); assert.equal(game.dropped, 0); assert.equal(game.timeLeft, 3600);
  game.start(); advance(game, .02);
  assert.equal(game.params.count, 1); assert.equal(game.dropped, 1); assert.equal(game.scoops.length, 1);
  const drop = game.events.find(event => event.type === 'drop');
  assert.equal(drop.bodyId, game.scoops[0].body.id); assert.equal(drop.batch, 0);
  assert.ok(game.scoops[0].body.position.x > 600);
});

test('the next single scoop waits for resolution and then the full configured interval', () => {
  const game = make(); const scoop = firstCatch(game);
  assert.equal(scoop.locked, true); assert.equal(game.dropped, 1);
  advance(game, .5); assert.equal(game.dropped, 1);
  advance(game, .2); assert.equal(game.dropped, 2);
  for (let frame = 0; frame < 1200; frame++) {
    game.step(1 / 120);
    assert.ok(game.scoops.filter(s => !s.locked && !s.blasted && !s.missed).length <= 1);
  }
});

test('pause freezes the plate, stack, falling scoop, spawn timer and countdown', () => {
  const game = make(); firstCatch(game); game.setPointerTarget(750); advance(game, .2);
  game.pause(); const before = JSON.stringify({ x: game.bowls[0].x, scoops: game.scoops, drops: game.dropped, next: game.nextSpawnIn, time: game.timeLeft });
  advance(game, 30);
  assert.equal(JSON.stringify({ x: game.bowls[0].x, scoops: game.scoops, drops: game.dropped, next: game.nextSpawnIn, time: game.timeLeft }), before);
});

test('pointer movement is bounded by speed and carries the entire fixed tower without inertia', () => {
  const game = make({ spawnInterval: 5 }); const scoop = firstCatch(game);
  const x = scoop.body.position.x, bowlX = game.bowls[0].x, height = game.progressHeight;
  game.setPointerTarget(900); assert.equal(game.bowls[0].x, bowlX);
  advance(game, .1); const moved = game.bowls[0].x - bowlX;
  assert.ok(Math.abs(moved - 90) < 1e-5); assert.ok(Math.abs(scoop.body.position.x - x - moved) < 1e-5);
  assert.equal(game.progressHeight, height); assert.equal(scoop.body.angle, 0);
});

test('keyboard movement stops on release and overrides a stale pointer target', () => {
  const game = make(); game.setPointerTarget(800); game.setMoveDirection(-1); advance(game, .1);
  assert.ok(Math.abs(game.bowls[0].x - 410) < 1e-5);
  game.setMoveDirection(0); const x = game.bowls[0].x; advance(game, .5); assert.equal(game.bowls[0].x, x);
  game.setPointerTarget(600); advance(game, .1); assert.ok(game.bowls[0].x > x);
});

test('viewport shrink keeps the attached stack together and its catch surface visible', () => {
  const game = make({ spawnInterval: 5 }); const scoop = firstCatch(game);
  const offset = scoop.body.position.x - game.bowls[0].x;
  game.setPointerTarget(850); advance(game, 1);
  game.viewLeft = 200; game.viewRight = 650; advance(game, .01);
  assert.ok(scoop.body.bounds.min.x >= 200 - 1e-5 && scoop.body.bounds.max.x <= 650 + 1e-5);
  assert.ok(Math.abs(scoop.body.position.x - game.bowls[0].x - offset) < 1e-5);
});

function contactCase(fraction, scoopX, direction = 1) {
  const game = make({ move: 5000, bowlWidth: 160, catchOverlap: .8, spawnInterval: 5 });
  game.start(); advance(game, 1 / 120); const scoop = game.scoops[0];
  const dt = 1 / 120, time = dt * fraction, velocity = 600;
  scoop.body.position.x = scoopX; scoop.body.position.y = game.bowlY - scoop.halfHeight - velocity * time - 500 * time * time;
  scoop.body.velocity.y = velocity; game._updateBounds(scoop); game.setMoveDirection(direction);
  advance(game, dt); return { game, scoop };
}

test('fast plate motion cannot catch a ball using a future plate position', () => {
  const { scoop } = contactCase(.1, 600);
  assert.equal(scoop.locked, false, 'the plate reaches this horizontal location only after the ball passed its rim');
});

test('a true swept catch remains valid even when the plate leaves the contact location in the same substep', () => {
  const { game, scoop } = contactCase(.1, 460);
  assert.equal(scoop.locked, true);
  const expected = 460 + (game.bowls[0].x - 500) * .9;
  assert.ok(Math.abs(scoop.body.position.x - expected) < 1e-5, 'the catch travels with the plate for the remainder of this substep');
});

test('misses never score and emit one miss event before the next spawn', () => {
  const game = make({ spawnInterval: 5 }, () => 0); game.start(); until(game, () => game.missed === 1);
  assert.equal(game.caught, 0); assert.equal(game.progressHeight, 0); assert.equal(game.dropped, 1);
  assert.equal(game.events.filter(event => event.type === 'miss').length, 1);
  advance(game, 2); assert.equal(game.missed, 1); assert.equal(game.dropped, 1);
});

test('an empty finite level can receive more attempts while ready, and legacy count gifts never change one-ball play', () => {
  const game = make({ attemptMode: 'limited', attempts: 0 }); assert.equal(game.start(), false); advance(game, 2);
  assert.equal(game.status, 'ready'); assert.equal(game.dropped, 0);
  game.effect('count_add', 3); assert.equal(game.attemptsLeft, 3); game.effect('count_sub', 1); assert.equal(game.attemptsLeft, 2);
  game.start(); advance(game, .02); assert.equal(game.params.count, 1); assert.equal(game.attemptsLeft, 1);
  const unlimited = make(); unlimited.effect('count_sub', 500); assert.equal(unlimited.attemptsLeft, Infinity); assert.equal(unlimited.params.count, 1);
});

test('the last finite catch can win; the last miss loses only after resolving', () => {
  const win = make({ targetHeight: 45, attemptMode: 'limited', attempts: 1 }); win.start(); advance(win, .2); assert.equal(win.status, 'playing');
  until(win, () => win.status === 'won'); assert.equal(win.caught, 1); advance(win, 3); assert.equal(win.dropped, 1);
  const miss = make({ attemptMode: 'limited', attempts: 1 }, () => 0); miss.start(); advance(miss, .2); assert.equal(miss.status, 'playing');
  until(miss, () => miss.status === 'lost'); assert.equal(miss.lossReason, 'attempts'); assert.equal(miss.missed, 1);
});

test('smaller scoops require more catches for the same actual-height goal', () => {
  const small = make({ targetHeight: 140, size: .6 }), large = make({ targetHeight: 140, size: 1.5 });
  small.start(); large.start(); until(small, () => small.status === 'won', 20); until(large, () => large.status === 'won', 20);
  assert.equal(small.caught, 5); assert.equal(large.caught, 2);
  assert.ok(small.progressHeight >= 140); assert.ok(large.progressHeight >= 140);
});

test('eating a bottom support refills the tower and postpones the next automatic scoop until after settling', () => {
  let pick = .5;
  const game = make({ spawnInterval: 5 }, () => pick); game.start(); until(game, () => game.caught === 3, 20);
  const top = game.scoops[2], previousY = top.body.position.y;
  pick = 0;
  game.effect('eat', 1); assert.equal(top.locked, false); assert.equal(top.body.position.y, previousY);
  const dropped = game.dropped; advance(game, .1); assert.equal(game.dropped, dropped); assert.ok(top.body.position.y > previousY);
  until(game, () => game.scoops.every(scoop => scoop.locked));
  assert.equal(game.caught, 3, 'refilling a previously caught scoop must not count it twice');
  advance(game, 4.8); assert.equal(game.dropped, dropped);
});

test('blasting removes support and debris without manufacturing misses or recatches', () => {
  const game = make({ spawnInterval: 5 }); game.start(); until(game, () => game.caught === 3, 20);
  const upper = game.scoops.slice(1), centerY = (upper[0].body.position.y + upper[1].body.position.y) / 2;
  assert.equal(game.blastAt(500, centerY, 25), 2); assert.equal(game.layers, 1);
  advance(game, 1); assert.equal(game.scoops.length, 1); assert.equal(game.caught, 3); assert.equal(game.missed, 0);
});

test('the camera follows a tall fixed tower up and follows lost height back down', () => {
  const game = make({ spawnInterval: .15 }); game.start(); until(game, () => game.caught === 14, 40);
  assert.ok(game.cameraY > 100); const camera = game.cameraY;
  game.pause(); game.effect('eat', 100); assert.equal(game.progressHeight, 0); game.resume();
  game.effect('attempts_sub', 100); game.setPointerTarget(140); advance(game, 3);
  assert.ok(game.cameraY < camera / 2);
});

test('injected randomness survives reset and samples stay inside the visible stage', () => {
  const game = make({}, () => 1); game.viewLeft = 200; game.viewRight = 800; game.start(); advance(game, .01);
  assert.ok(game.scoops[0].body.position.x + game.scoops[0].r <= 800);
  game.reset({ level: 1 }); game.start(); advance(game, .01);
  assert.ok(game.scoops[0].body.position.x > 650);
});

test('new airborne scoops do not contribute height and removing every scoop clears height immediately', () => {
  const game = make(); game.start(); advance(game, .2); assert.equal(game.height, 0); assert.equal(game.progressHeight, 0);
  until(game, () => game.caught === 1); assert.ok(game.progressHeight > 49);
  game.effect('eat', 100); assert.equal(game.progressHeight, 0); assert.equal(game.layers, 0);
});

test('the highest catch surface remains visible when a diagonal tower extends beyond the plate', () => {
  let randomX = .63;
  const game = make({ bowlWidth: 160, spawnInterval: .15 }, () => randomX);
  // These deliberate side catches form a fixed diagonal beyond the rim.
  game.setPointerTarget(500); game.start(); advance(game, .02);
  game.scoops[0].body.position.x = 580; game._updateBounds(game.scoops[0]);
  until(game, () => game.caught === 1);
  const [spawnLeft, spawnRight] = game._spawnBounds();
  randomX = (620 - spawnLeft) / (spawnRight - spawnLeft);
  until(game, () => game.caught === 2);
  const tip = game.scoops.find(scoop => scoop.supportLayer === 2), offset = tip.body.position.x - game.bowls[0].x;
  game.setPointerTarget(1000); advance(game, .5);
  assert.ok(tip.body.bounds.max.x <= 1000 + 1e-5);
  assert.ok(Math.abs(tip.body.position.x - game.bowls[0].x - offset) < 1e-5);
});

test('wind affects falling scoops while the fixed tower only follows player input', () => {
  const game = make({ mode: 'wind', windForce: 2, windPeriod: 4, gustDuration: 2.8, spawnInterval: 5 });
  advance(game, 1); game.start(); advance(game, .2);
  assert.ok(game.scoops[0].body.position.x > 500);
  until(game, () => game.caught === 1); const scoop = game.scoops[0], x = scoop.body.position.x;
  advance(game, 3); assert.equal(scoop.body.position.x, x);
});

test('giant sizes alternate for each individual scoop and gift size changes affect the next one', () => {
  const game = make({ mode: 'giant', largeScale: 1.35, smallScale: .8, spawnInterval: .15 }); game.start();
  until(game, () => game.dropped === 2); assert.ok(game.scoops[0].r > game.scoops[1].r);
  const previousRadius = game.scoops[0].r; game.effect('size_down', 40);
  until(game, () => game.dropped === 3); assert.ok(game.scoops[2].r < previousRadius);
  assert.equal(game.scoops[0].r, previousRadius);
});

test('speed gifts bound player motion and fall/time gifts continue to change their own rates', () => {
  const game = make(); game.effect('move_faster', 10000); assert.equal(game.params.move, 5000);
  game.effect('move_slower', 10000); assert.equal(game.params.move, 40);
  game.effect('fall_faster', 100); assert.equal(game.params.fall, 2);
  game.effect('time_faster', 100); assert.equal(game.params.timeRate, 2);
  game.start(); advance(game, 1); assert.ok(Math.abs(game.timeLeft - 3598) < 1e-7);
});

test('timeout and retry never leave an old automatic spawn or control direction queued', () => {
  const game = make({ duration: 1 }); game.start(); advance(game, 1.1); assert.equal(game.status, 'lost');
  const count = game.dropped; advance(game, 3); assert.equal(game.dropped, count);
  game.setMoveDirection(1); game.reset({ level: 1 }); advance(game, .5);
  assert.equal(game.dropped, 0); assert.equal(game.bowls[0].x, 500); assert.equal(game.caught, 0); assert.equal(game.missed, 0);
});

test('a 10000-height objective with minimum-size scoops is reachable without capacity deadlock', () => {
  const game = make({ targetHeight: 10000, size: .6, spawnInterval: .15 });
  assert.equal(game.scoops.length, 0); game.start(); until(game, () => game.status === 'won', 400);
  assert.equal(game.caught, Math.ceil(10000 / (28 * .6 * 1.78)));
  assert.ok(game.height >= 10000); assert.ok(game.cameraY > 9000); assert.equal(game.missed, 0);
});

test('the top of a carried tower uses the same exact contact-time sweep as the plate', () => {
  for (const [x, expectedCatch] of [[534, false], [500, true]]) {
    const game = make({ move: 5000, catchOverlap: .8, spawnInterval: .15 }); firstCatch(game);
    until(game, () => game.dropped === 2); const base = game.scoops[0], scoop = game.scoops[1];
    const dt = 1 / 120, hitTime = dt * .1, velocity = 600;
    scoop.body.position.x = x;
    scoop.body.position.y = base.body.bounds.min.y - scoop.halfHeight - velocity * hitTime - 500 * hitTime * hitTime;
    scoop.body.velocity.y = velocity; game._updateBounds(scoop); game.setMoveDirection(1); advance(game, dt);
    assert.equal(scoop.locked, expectedCatch); assert.equal(game.layers, expectedCatch ? 2 : 1);
  }
});

test('an almost-reached floating-point height does not stop spawning before it can win', () => {
  const game = make({ targetHeight: 49.840001, spawnInterval: .15 }); game.start();
  until(game, () => game.status === 'won'); assert.equal(game.caught, 2);
});
