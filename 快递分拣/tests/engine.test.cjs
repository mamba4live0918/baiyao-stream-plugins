const {test}=require('node:test');
const assert=require('node:assert/strict');
const {Game}=require('../src/engine.js');
test('correct sorting counts once; wrong parcels return without credit',()=>{
 const g=new Game(3);g.start(); const p=g.add(0,'观众');
 assert.equal(g.sort(p.id,1),'wrong');assert.equal(g.done,0);assert.equal(g.returns.length,1);
 g.tick(3);assert.ok(g.parcels.some(x=>x.id===p.id));
 assert.equal(g.sort(p.id,0),'correct');assert.equal(g.sort(p.id,0),'missing');assert.equal(g.done,1);
});
test('pause freezes motion, return timers and effect timers',()=>{
 const g=new Game();g.start();const p=g.add(1);g.effect('reverse');g.pause();let x=p.x;g.tick(5);
 assert.equal(p.x,x);assert.equal(g.effects.reverse,8);
});
test('target finishes shift and prevents post-finish gifts',()=>{
 const g=new Game(1);g.start();let p=g.add(0);g.sort(p.id,0);assert.equal(g.status,'complete');
 let n=g.parcels.length;assert.equal(g.effect('rush'),false);assert.equal(g.parcels.length,n);
});
test('off-belt parcels enter return queue in both directions',()=>{
 const g=new Game();g.start();const p=g.add(2);p.x=1.2;g.tick(.1);assert.equal(g.returns.length,1);
 const q=g.add(1);q.x=-.2;g.effect('reverse');g.tick(.1);assert.equal(g.returns.length,2);
});
test('robot handles at most three parcels and cannot exceed goal',()=>{
 const g=new Game(2);g.start();g.add(0);g.add(1);g.add(2);g.effect('robot');assert.equal(g.done,2);assert.equal(g.status,'complete');
});
test('held parcels do not move; cancellation can clear holding',()=>{
 const g=new Game();g.start();const p=g.add(0);g.held=p.id;g.tick(1);assert.equal(p.x,.02);g.held=null;g.tick(1);assert.ok(p.x>.02);
});
