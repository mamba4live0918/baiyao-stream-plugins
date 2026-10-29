import test from 'node:test';
import assert from 'node:assert/strict';
import { PegGame } from '../src/game.js';

const pattern = {
  id: 'test', name: '测试', size: 16,
  cells: ['#ff0000', '#00ff00', null, ...Array(253).fill(null)]
};

test('wrong-color and extra beads have separate markers, corrected and fallen beads do not',()=>{
 const g=new PegGame({pattern});g.place('#0000ff',0,0);g.place('#00ff00',0,1);const extra=g.place('#ff0000',0,2);
 assert.deepEqual(g.errors.map(b=>b.type),['wrong','extra']);g.help(1);assert.deepEqual(g.errors.map(b=>b.id),[extra.id]);g.fall(extra.id);assert.deepEqual(g.errors,[]);
});
test('free creation is not marked wrong but a repeated free design is checked',()=>{
 const p={id:'free',mode:'free',size:16,cells:Array(256).fill(null)},g=new PegGame({pattern:p});g.place('#123456',0,0);assert.deepEqual(g.errors,[]);g.addRounds(1);g.completeRound();g.place('#654321',0,0);assert.equal(g.errors[0].type,'wrong');
});

test('must match every target and leave non-target pegs empty before finishing', () => {
  const game = new PegGame({ pattern, random: () => 0 });
  assert.equal(game.complete, false);
  game.place('#ff0000', 0, 0);
  game.place('#ff0000', 0, 1);
  assert.equal(game.complete, false);
  game.remove(0, 1);
  game.place('#00ff00', 0, 1);
  assert.equal(game.complete, true);
  game.place('#ff0000', 0, 2);
  assert.equal(game.complete, false);
});

test('help fills correct missing pegs and replace only genuinely wrong beads', () => {
  const game = new PegGame({ pattern, random: () => 0 });
  game.place('#0000ff', 0, 0);
  const changes = game.help(2);
  assert.deepEqual(changes.map(item => item.col), [0, 1]);
  assert.equal(game.placed[0].color, '#ff0000');
  assert.equal(game.placed[1].color, '#00ff00');
  assert.equal(game.complete, true);
});

test('a tray spill leaves placed board beads unchanged and restores five tray portions with discrete presses', () => {
  const game = new PegGame({ pattern, random: () => 0 });
  game.place('#ff0000', 0, 0);
  game.place('#00ff00', 0, 1);
  const before = game.placed.map(bead => bead && { ...bead });
  assert.equal(game.spill(), true);
  assert.deepEqual(game.placed, before);
  assert.equal(game.traySpilled, true);
  assert.equal(game.complete, false);
  assert.equal(game.pressRestore({ repeat: true }), 0);
  assert.equal(game.restoreProgress, 0);
  game.pressRestore({ repeat: false });
  game.tick(1);
  assert.ok(game.restoreProgress < 25 && game.restoreProgress > 0);
  const stages = [];
  for (let i = 0; i < 24 && game.traySpilled; i++) {
    const stage = game.pressRestore({ repeat: false });
    if (stage) stages.push(stage);
  }
  assert.deepEqual(stages, [1, 2, 3, 4, 5]);
  assert.deepEqual(game.placed, before);
  assert.equal(game.traySpilled, false);
  assert.equal(game.complete, true);
});

test('tray restoration progress survives reload without changing the board', () => {
  const game = new PegGame({ pattern });
  game.place('#ff0000', 0, 0);
  game.spill();
  for (let i = 0; i < 4; i++) game.pressRestore({ repeat: false });
  const resumed = PegGame.fromSnapshot(game.snapshot(), { pattern });
  assert.equal(resumed.traySpilled, true);
  assert.equal(resumed.trayRestoreStage, 1);
  assert.equal(resumed.placed[0].color, '#ff0000');
});

test('timed tools and hints expire, while extra round survives a snapshot', () => {
  let time = 1000;
  const game = new PegGame({ pattern, now: () => time });
  game.hideHint(2);
  game.confiscate(2);
  game.grantPen(3);
  game.addRounds(2);
  assert.equal(game.hintVisible, false);
  assert.equal(game.tweezersAvailable, false);
  assert.equal(game.penAvailable, true);
  const saved = game.snapshot();
  const resumed = PegGame.fromSnapshot(saved, { pattern, now: () => time });
  assert.equal(resumed.requiredRounds, 3);
  time = 5000;
  assert.equal(resumed.hintVisible, true);
  assert.equal(resumed.tweezersAvailable, true);
  assert.equal(resumed.penAvailable, false);
});

test('random replacement touches distinct placed beads within one gift', () => {
  const game = new PegGame({ pattern, random: () => 0 });
  game.place('#ff0000', 0, 0);
  game.place('#ff0000', 0, 1);
  const changed = game.swapRandom(2, ['#ff0000', '#00ff00']);
  assert.deepEqual(changed.map(bead => bead.id), ['b1', 'b2']);
  assert.equal(game.placed[0].color, '#00ff00');
  assert.equal(game.placed[1].color, '#00ff00');
});

test('an extra round after the final product requires rebuilding the picture', () => {
  const game = new PegGame({ pattern });
  game.place('#ff0000', 0, 0);
  game.place('#00ff00', 0, 1);
  assert.equal(game.completeRound(), 'final');
  assert.equal(game.addRounds(1), true);
  assert.equal(game.completedRounds, 1);
  assert.equal(game.requiredRounds, 2);
  assert.equal(game.complete, false);
  assert.equal(game.placed.some(Boolean), false);
});

test('shaken-off beads persist until the user picks them up, including after refresh',()=>{
 const game=new PegGame({pattern});const bead=game.place('#ff0000',0,0);
 game.fall(bead.id,{x:2,y:.2,z:3,rotation:{x:0,y:0,z:0,w:1}});
 assert.equal(game.placed[0],null);assert.equal(game.fallen.length,1);
 game.tick(60);assert.equal(game.fallen.length,1);
 const restored=PegGame.fromSnapshot(game.snapshot(),{pattern});assert.equal(restored.fallen[0].id,bead.id);
 restored.help(2);assert.equal(restored.complete,false);
 assert.equal(restored.pickupFallen(bead.id).color,'#ff0000');assert.equal(restored.fallen.length,0);assert.equal(restored.complete,true);
});
test('tray difficulty and pen capacity are fixed by the selected tier',()=>{
 const game=new PegGame({pattern});game.spill({presses:8,decay:12});
 for(let i=0;i<7;i++)assert.equal(game.pressRestore(),0);
 assert.equal(game.pressRestore(),1);game.grantPen(10,8);assert.equal(game.penCapacity,8);
 const restored=PegGame.fromSnapshot(game.snapshot(),{pattern});assert.equal(restored.trayPresses,8);assert.equal(restored.trayDecay,12);assert.equal(restored.penCapacity,8);
});

test('separate timed gifts add up instead of overlapping, capped at one hour', () => {
  let time = 0;
  const game = new PegGame({ pattern, now: () => time });
  game.hideHint(30);
  time = 3000;
  game.hideHint(30);
  assert.equal(game.hintHiddenUntil, 60000);
  game.confiscate(10); game.confiscate(10);
  assert.equal(game.tweezersLockedUntil, 23000);
  game.grantPen(20, 10); time = 5000; game.grantPen(20, 4);
  assert.equal(game.penUntil, 43000);
  assert.equal(game.penCapacity, 10, 'a weaker pen gift does not downgrade an active pen');
  for (let i = 0; i < 5; i++) game.hideHint(3600);
  assert.equal(game.hintHiddenUntil, time + 3600 * 1000);
  time = 100000;
  game.grantPen(5, 4);
  assert.equal(game.penCapacity, 4, 'after expiry the new gift sets its own capacity');
  assert.equal(game.penUntil, 105000);
});

test('help picks random missing positions rather than scanning from the top-left', () => {
  const cells = Array(256).fill('#ff0000');
  const g = new PegGame({ pattern: { id: 'full', size: 16, cells }, random: () => 0.999 });
  const changes = g.help(3);
  assert.deepEqual(changes.map(c => c.row * 16 + c.col), [255, 254, 253]);
});
