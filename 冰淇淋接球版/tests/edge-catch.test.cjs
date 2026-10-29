const test = require('node:test');
const assert = require('node:assert/strict');
const { Game } = require('../src/engine.js');

const DT = 1 / 120;
function make(config = {}, view) {
  const game = new Game({ random: () => .5, levels: [{ targetHeight: 10000, duration: 3600,
    bowlWidth: 260, move: 900, fall: 1, catchOverlap: .25, spawnInterval: 5, ...config }] });
  if (view) [game.viewLeft, game.viewRight] = view;
  return game;
}
function advance(game, seconds) { for (let frame = 0; frame < seconds * 120; frame++) game.step(DT); }
function release(game, random) {
  game.start(); game._random = () => random; game.nextSpawnIn = 0;
  assert.equal(game.drop(), true, game.dropStatus);
  const scoop = game.scoops.at(-1);
  for (let frame = 0; frame < 1200 && !scoop.locked && !scoop.missed; frame++) game.step(DT);
  assert.equal(scoop.locked, true, 'the deliberately aligned scoop must be caught');
  advance(game, .3);
  return scoop;
}
function steer(game, side, input) {
  if (input === 'keyboard') game.setMoveDirection(side ? 1 : -1);
  else game.setPointerTarget(side ? 1000 : 0);
  advance(game, 1.5);
}

for (const [label, config, first, view] of [
  ['straight tower', {}, .5],
  ['left-offset tower', {}, .4],
  ['right-offset tower', {}, .6],
  ['wide plate with small scoop', { bowlWidth: 500, size: .6 }, .5],
  ['strict overlap', { catchOverlap: .8 }, .4],
  ['narrow viewport', {}, .5, [300, 700]],
  ['plate wider than viewport', { bowlWidth: 500, size: .6, catchOverlap: .8 }, .5, [300, 700]]
]) {
  for (const side of [0, 1]) test(`${label}: ${side ? 'right' : 'left'} edge grows the tower with both controls`, () => {
    for (const input of ['pointer', 'keyboard']) {
      const game = make(config, view);
      const base = release(game, first), before = game.height;
      steer(game, side, input);
      const scoop = release(game, side);
      assert.equal(scoop.supportLayer, 2, 'catching on the bare plate must not pass this regression');
      assert.ok(game.height >= before + scoop.halfHeight * 2 - 1e-6);
      assert.ok(Math.abs(scoop.body.position.x - base.body.position.x) < 1e-6,
        'the visible extreme must allow an exact tower-top alignment, including strict catches');
    }
  });
}

test('pointer targets cover the full legal range continuously for an offset tower', () => {
  const game = make({ catchOverlap: .8 }); release(game, .4);
  const targets = [];
  for (let x = 0; x <= 1000; x++) targets.push(game.setPointerTarget(x));
  const [min, max] = game._plateBounds();
  assert.ok(max > 975, 'the formerly unreachable inner-right strip must be playable');
  assert.ok(targets.every(x => x >= min - 1e-6 && x <= max + 1e-6));
  assert.ok(targets.some(x => Math.abs(x - 977) < 1));
  assert.ok(targets.slice(1).every((x, i) => x >= targets[i] && x - targets[i] < 2),
    'mapping must not jump across a strip of valid catch positions near the edge');
});

test('alternating sizes and size gifts never snap the plate or change a born scoop radius', () => {
  const game = make({ mode: 'giant', largeScale: .5, smallScale: 2, move: 40 });
  game.setPointerTarget(1000); advance(game, 13);
  game.start(); game._random = () => 1; game.nextSpawnIn = 0; assert.equal(game.drop(), true);
  const scoop = game.scoops[0], radius = scoop.r;
  const bounds = game._plateBounds();
  game.effect('size_up', 50);
  assert.deepEqual(game._plateBounds(), bounds, 'a size gift cannot change the born ball\'s catching range');
  for (let frame = 0; frame < 480; frame++) {
    const before = game.bowls[0].x;
    game.step(DT);
    assert.equal(scoop.r, radius);
    assert.ok(Math.abs(game.bowls[0].x - before) <= game.params.move * DT + 1e-6,
      'changing active radius or catching at the edge must respect the configured plate speed');
  }
  assert.equal(game.caught, 1);
});

test('a viewport narrower than the plate still has continuous player-controlled travel', () => {
  const game = make({ bowlWidth: 500, size: .6 }, [300, 700]);
  steer(game, 0, 'pointer'); const left = game.bowls[0].x;
  steer(game, 1, 'pointer'); const right = game.bowls[0].x;
  assert.ok(right - left > 300, 'a wide plate must not freeze when the window becomes narrow');
});

test('maximum outward wind cannot carry an edge drop offscreen or past the reachable tower top', () => {
  for (const side of [0, 1]) {
    const game = make({ mode: 'wind', windForce: 5, windPeriod: 60, gustDuration: 59.8, fall: .3, catchOverlap: .8 });
    game.setPointerTarget(side ? 1000 : 0); advance(game, 1.5);
    game.start();game._mechanicTime=(side?0:60)+29.9;game._random = () => side; game.nextSpawnIn = 0; assert.equal(game.drop(), true);
    const scoop = game.scoops[0];
    for (let frame = 0; frame < 720 && !scoop.locked && !scoop.missed; frame++) {
      game.step(DT);
      assert.ok(scoop.body.bounds.min.x >= -1e-6 && scoop.body.bounds.max.x <= 1000 + 1e-6,
        'outward wind must not push a fresh scoop outside the visible catching area');
    }
    assert.equal(scoop.locked, true); assert.equal(scoop.supportLayer, 1);
    advance(game, .3);
    const second = release(game, side);
    assert.equal(second.supportLayer, 2, 'outward wind must also allow height growth at the extreme');
  }
});

test('deleting an offset top changes the control range without translating the tower in one frame', () => {
  const game = make({ move: 40 }); release(game, .4);
  game.setPointerTarget(0); advance(game, 4);
  const previous = game.bowls[0].x;
  game.effect('eat', 1); game.step(DT);
  assert.ok(Math.abs(game.bowls[0].x - previous) <= game.params.move * DT + 1e-6);
});

test('equal-height tips use the most recently caught scoop as the next reachable surface', () => {
  const game = make(); const first = release(game, .4);
  const [left, right] = game._spawnBounds();
  const latest = release(game, (590.8 - left) / (right - left));
  assert.equal(first.supportLayer, 1); assert.equal(latest.supportLayer, 1);
  steer(game, 1, 'pointer'); const top = release(game, 1);
  assert.equal(top.supportLayer, 2);
  assert.deepEqual(top.supportIds, [latest.body.id]);
});

test('extreme diagonal towers remain steerable and catchable after a severe viewport crop', () => {
  for (const side of [0, 1]) {
    const game = make(); let tip = release(game, .5);
    // Build a legitimate diagonal: each 35-unit offset retains more than the
    // required overlap. Moving left leaves room to continue the diagonal.
    for (let index = 0; index < 15; index++) {
      steer(game, 0, 'pointer');
      const x = tip.body.position.x + 35, [left, right] = game._spawnBounds();
      tip = release(game, (x - left) / (right - left));
    }
    const offset = tip.body.position.x - game.bowls[0].x, height = game.height;
    assert.ok(offset > 500);
    game.viewLeft = 300; game.viewRight = 700; game.step(DT);
    assert.ok(Math.abs(tip.body.position.x - game.bowls[0].x - offset) < 1e-6);
    steer(game, side, 'pointer');
    assert.ok(game.bowls[0].x < game.viewLeft, 'the plate may leave a severe crop to keep its tower playable');
    const scoop = release(game, side);
    assert.equal(scoop.supportLayer, 17); assert.ok(game.height > height);
    assert.ok(scoop.body.bounds.min.x >= 300 && scoop.body.bounds.max.x <= 700);
  }
});

test('a fresh falling scoop keeps its birth corridor when the previous tower tip is eaten', () => {
  const game = make(); release(game, .4);
  game._random = () => 1; game.nextSpawnIn = 0; assert.equal(game.drop(), true);
  const scoop = game.scoops.at(-1), corridor = [...scoop.fallCorridor], x = scoop.body.position.x;
  game._random = () => 0; game.effect('eat', 1); game.step(DT);
  assert.deepEqual(scoop.fallCorridor, corridor); assert.equal(scoop.body.position.x, x);
});

test('wind-limited contact uses the same horizontal point for detection and the final catch', () => {
  const game = make({ mode: 'wind', windForce: 5, windPeriod: 60, gustDuration: 59.8, catchOverlap: .8 });
  advance(game, 30); steer(game, 1, 'pointer');
  game.start(); game._random = () => 1; game.nextSpawnIn = 0; assert.equal(game.drop(), true);
  const scoop = game.scoops[0], x = scoop.body.position.x, hitTime = DT * .1, velocity = 600;
  scoop.body.position.y = game.bowlY - scoop.halfHeight - velocity * hitTime - 500 * hitTime * hitTime;
  scoop.body.velocity.y = velocity; game._updateBounds(scoop);
  game.step(DT);
  assert.equal(scoop.locked, true);
  assert.ok(Math.abs(scoop.body.position.x - x) < 1e-6,
    'raw wind displacement must not be reapplied after a boundary-limited hit');
});
