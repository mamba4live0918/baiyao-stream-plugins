const {test}=require('node:test'),assert=require('node:assert/strict');
const {PullTracker}=require('../src/duel.js');

test('cannot start below the exposure threshold',()=>{
  const p=new PullTracker({threshold:0.6,hold:1.5});
  assert.equal(p.start(0.5),false);assert.equal(p.active,false);assert.equal(p.start(0.6),true);
});
test('holding long enough finishes the pull',()=>{
  const p=new PullTracker({threshold:0.6,hold:1.5});p.start(0.8);
  assert.equal(p.update(1.0,{held:true,exposure:0.8}),'pulling');assert.ok(Math.abs(p.progress-2/3)<1e-9);
  assert.equal(p.update(0.6,{held:true,exposure:0.8}),'done');assert.equal(p.active,false);
});
test('releasing or losing exposure resets progress',()=>{
  const p=new PullTracker({threshold:0.6,hold:1.5});p.start(0.8);p.update(1,{held:true,exposure:0.8});
  assert.equal(p.update(0.1,{held:false,exposure:0.8}),'reset');assert.equal(p.progress,0);
  p.start(0.8);p.update(1,{held:true,exposure:0.8});
  assert.equal(p.update(0.1,{held:true,exposure:0.4}),'reset');assert.equal(p.progress,0);
});
test('settings are clamped to 10%–100% and 0.5–5 seconds',()=>{
  const p=new PullTracker({threshold:0.01,hold:9});assert.equal(p.threshold,0.1);assert.equal(p.hold,5);
  p.configure({threshold:2,hold:0.1});assert.equal(p.threshold,1);assert.equal(p.hold,0.5);
});
test('idle tracker reports idle',()=>{assert.equal(new PullTracker().update(1,{held:true,exposure:1}),'idle');});
