import test from 'node:test';
import assert from 'node:assert/strict';
import {createRentController} from '../src/rent/controller.js';
import {defaultStats} from '../src/stats.js';
import {defaultSettings} from '../src/settings.js';

function fixture(){
 let clock=0,stats=defaultStats(),config=defaultSettings().rent,writes=0;
 const timers=new Map(),charges=[];let timerId=0;
 const controller=createRentController({now:()=>clock,wallNow:()=>0,getStats:()=>stats,setStats:s=>{stats=s;writes++;},getSettings:()=>config,
  onCharges:items=>charges.push(...items),setTimer:(fn,ms)=>{const id=++timerId;timers.set(id,{fn,ms});return id;},clearTimer:id=>timers.delete(id)});
 return {controller,timers,charges,get stats(){return stats;},get writes(){return writes;},advance:ms=>{controller.advance(ms);clock+=ms;},config:x=>{config={...config,...x};controller.refresh();}};
}
test('no rent clock before first customer; opening alone does not start it',()=>{
 const f=fixture();f.controller.setRunning(true);f.advance(600000);
 assert.equal(f.stats.rent.started,false);assert.equal(f.stats.rent.elapsedMs,0);assert.equal(f.charges.length,0);assert.equal(f.timers.size,0);
});
test('first customer starts exactly once; rent runs during an open empty shop',()=>{
 const f=fixture();f.controller.setRunning(true,{start:true});f.advance(599999);
 assert.equal(f.charges.length,0);f.advance(1);assert.equal(f.charges.length,1);
 assert.equal(f.stats.coins,0);assert.equal(f.charges[0].seconds,600);assert.equal(f.stats.rent.overtimeSeconds,600);
 f.controller.setRunning(true,{start:true});assert.equal(f.charges.length,1);assert.equal(f.timers.size,1);
});
test('closing and hiding stop elapsed; reopening preserves remaining time',()=>{
 const f=fixture();f.controller.setRunning(true,{start:true});f.advance(120000);f.controller.setRunning(false);
 const before=structuredClone(f.stats);f.advance(3600000);assert.deepEqual(f.stats,before);assert.equal(f.timers.size,1,'closed session keeps its one-hour expiry wakeup');
 f.controller.setRunning(true);f.advance(480000);assert.equal(f.charges.length,1);assert.equal(f.stats.rent.sessionElapsedMs,600000);
});
test('restore does not start running or count offline; next open resumes stored progress',()=>{
 const f=fixture();f.controller.setRunning(true,{start:true});f.advance(220000);f.controller.setRunning(false);
 let stats=JSON.parse(JSON.stringify(f.stats)),clock=999999999;
 const restored=createRentController({getStats:()=>stats,setStats:s=>stats=s,getSettings:()=>defaultSettings().rent,now:()=>clock,wallNow:()=>0,setTimer:()=>1,clearTimer:()=>{}});
 restored.tick();assert.equal(stats.rent.elapsedMs,220000);restored.setRunning(true);restored.advance(380000);clock+=380000;restored.tick();
 assert.equal(stats.rent.elapsedMs,600000);assert.equal(stats.rent.overtimeSeconds,600);restored.stop();
});
test('timer keeps one wakeup and stop clears it',()=>{
 const f=fixture();f.controller.setRunning(true,{start:true});for(let i=0;i<4;i++)f.advance(1000);
 assert.equal(f.timers.size,1);assert.equal([...f.timers.values()][0].ms,1000);f.controller.stop();assert.equal(f.timers.size,0);
});
test('rebasing a QA game clock does not add or erase persisted business time',()=>{
 const f=fixture();f.controller.setRunning(true,{start:true});f.advance(10000);f.controller.setRunning(false);
 f.controller.rebase();f.advance(1);assert.equal(f.stats.rent.elapsedMs,10000);
});
