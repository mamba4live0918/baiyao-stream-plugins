import test from 'node:test';
import assert from 'node:assert/strict';
import {createRentController} from '../src/rent/controller.js';
import {defaultStats,loadStats,saveStats} from '../src/stats.js';
import {defaultSettings} from '../src/settings.js';
import {addOvertime,newRentSession,startRent,advanceRent} from '../src/rent/model.js';

function fixture({coins=160,queue=1,stats:given}={}){
 let game=1000,wall=1000,stats=given||{...defaultStats(),coins},people=queue;
 const timers=new Map(),charges=[],closed=[],ended=[],gaps=[];let serial=0;
 const controller=createRentController({getStats:()=>stats,setStats:s=>stats=s,getSettings:()=>defaultSettings().rent,
  now:()=>game,wallNow:()=>wall,getQueueCount:()=>people,onCharges:x=>charges.push(...x),onAutoClose:r=>closed.push(r),onSessionEnd:r=>ended.push(r),onGap:info=>{gaps.push(info);game-=info.gameGapMs;},
  setTimer:(fn,ms)=>{const id=++serial;timers.set(id,{fn,ms});return id;},clearTimer:id=>timers.delete(id)});
 return{controller,timers,charges,closed,ended,gaps,get stats(){return stats;},get wall(){return wall;},set stats(s){stats=s;},
  tick:ms=>{game+=ms;wall+=ms;controller.tick();},advance:ms=>{controller.advance(ms);game+=ms;},
  sleep:ms=>{game+=ms;wall+=ms;controller.tick();},jump:ms=>{game+=ms;wall+=ms;},wait:ms=>{wall+=ms;controller.tick();},people:n=>{people=n;controller.tick();}};
}
test('regular heartbeat counts at most five seconds and an eight-hour sleep never collects 48 rents',()=>{
 const f=fixture();f.controller.setRunning(true,{start:true});f.tick(4000);assert.equal(f.stats.rent.elapsedMs,4000);
 f.stats=addOvertime(f.stats,1200,{id:'yesterday'}).stats;
 f.sleep(8*3600000);
 assert.equal(f.charges.length,0);assert.equal(f.stats.coins,160);assert.equal(f.stats.rent.started,false);
 assert.equal(f.stats.rent.overtimeSeconds,0);assert.equal(f.stats.rent.transactions.length,0);assert.equal(f.controller.snapshot().running,false);
 assert.equal(f.ended.length,1);
 f.controller.setRunning(true,{start:true});assert.equal(f.controller.snapshot().remainingSeconds,600);assert.equal(f.controller.snapshot().overtimeSeconds,0);
});
for(const [label,gap]of [['six seconds',6000],['forty minutes',40*60000],['fifty-nine minutes',59*60000]])test('an open session survives a '+label+' gap and counts the next normal second',()=>{
 const f=fixture({coins:160,queue:3});f.controller.setRunning(true,{start:true});f.tick(1000);
 f.stats=addOvertime(f.stats,120,{id:'keep-current'}).stats;const before=structuredClone(f.stats);
 f.sleep(gap);
 assert.equal(f.controller.snapshot().running,true);assert.equal(f.closed.length,0);assert.equal(f.ended.length,0);
 assert.equal(f.charges.length,0);assert.equal(f.stats.coins,160);assert.equal(f.stats.rent.elapsedMs,before.rent.elapsedMs);
 assert.equal(f.stats.rent.overtimeSeconds,120);assert.equal(f.stats.rent.transactions.length,1);assert.equal(f.gaps.length,1);
 assert.equal(f.stats.rent.closedAt,null);f.tick(1000);assert.equal(f.stats.rent.elapsedMs,before.rent.elapsedMs+1000,'clock mark rebases after caller rewinds the visual clock');
});
test('a continuous one-hour open-session gap ends instead of preserving old overtime',()=>{
 const f=fixture({queue:3});f.controller.setRunning(true,{start:true});f.tick(1000);f.stats=addOvertime(f.stats,120,{id:'old'}).stats;
 f.sleep(3600000);assert.equal(f.controller.snapshot().running,false);assert.equal(f.stats.rent.started,false);assert.equal(f.stats.rent.overtimeSeconds,0);assert.equal(f.stats.coins,160);assert.equal(f.charges.length,0);assert.equal(f.ended.length,1);
});
test('an explicit debug advance still crosses active rent boundaries',()=>{
 const f=fixture({coins:250});f.controller.setRunning(true,{start:true});f.advance(1900000);
 assert.equal(f.charges.length,3);assert.equal(f.stats.rent.elapsedMs,1900000);assert.equal(f.stats.coins,0);
});
test('an empty open shop auto-closes after one continuous interval, collecting at most that interval',()=>{
 const f=fixture({queue:0,coins:200});f.controller.setRunning(true,{start:true});f.advance(599999);
 assert.equal(f.controller.snapshot().running,true);f.advance(1);assert.equal(f.closed.length,1);assert.equal(f.controller.snapshot().running,false);
 assert.equal(f.stats.coins,100);assert.equal(f.stats.rent.elapsedMs,600000);assert.equal(f.charges.length,1);
 f.advance(9999999);assert.equal(f.charges.length,1);
});
test('a customer arriving before the empty interval resets empty-shop progress',()=>{
 const f=fixture({queue:0});f.controller.setRunning(true,{start:true});f.advance(300000);f.people(1);f.advance(1000);f.people(0);f.advance(599999);
 assert.equal(f.closed.length,0);f.advance(1);assert.equal(f.closed.length,1);
});
test('one hour closed ends the entire session but retains copper and lifetime service counts',()=>{
 const f=fixture({coins:7.5});f.controller.setRunning(true,{start:true});f.advance(300000);f.stats={...addOvertime(f.stats,1200,{id:'old-pending'}).stats,served:8,badReviews:2};
 f.controller.setRunning(false);f.wait(3599999);assert.equal(f.stats.rent.started,true);f.wait(1);
 assert.equal(f.stats.rent.started,false);assert.equal(f.stats.rent.overtimeSeconds,0);assert.deepEqual(f.stats.rent.transactions,[]);
 assert.equal(f.stats.coins,7.5);assert.equal(f.stats.served,8);assert.equal(f.stats.badReviews,2);assert.equal(f.ended.length,1);
});
test('closing schedules an expiry wakeup and pagehide stop cancels it',()=>{
 const f=fixture();f.controller.setRunning(true,{start:true});f.controller.setRunning(false);
 assert.equal(f.timers.size,1);assert.equal([...f.timers.values()][0].ms,3600000);f.controller.stop();assert.equal(f.timers.size,0);
});
test('loading after one hour away clears prior overtime and pending records without touching copper',()=>{
 const f=fixture({coins:99});f.controller.setRunning(true,{start:true});f.advance(300000);f.stats=addOvertime(f.stats,1200,{id:'old'}).stats;f.controller.setRunning(false);
 let saved;const storage={setItem:(_,v)=>saved=v,getItem:()=>saved};saveStats(storage,f.stats);
 const within=loadStats(storage,{wallNow:()=>3599999}).stats;assert.equal(within.rent.overtimeSeconds,1200);
 const evening=loadStats(storage,{wallNow:()=>3601000}).stats;assert.equal(evening.coins,99);assert.equal(evening.rent.started,false);assert.equal(evening.rent.transactions.length,0);
});
test('legacy sessions without heartbeat timestamps cannot carry old overtime to the evening',()=>{
 const legacy={coins:22.5,served:3,badReviews:1,rent:{version:1,started:true,elapsedMs:5400000,nextDueMs:6000000,sessionElapsedMs:5400000,overtimeSeconds:1200,transactions:[{id:'old',seconds:1200,route:'miebo',status:'pending'}]}};
 const result=loadStats({getItem:()=>JSON.stringify(legacy)},{wallNow:()=>1000});
 assert.equal(result.stats.coins,22.5);assert.equal(result.stats.served,3);assert.equal(result.stats.rent.started,false);assert.equal(result.stats.rent.overtimeSeconds,0);assert.deepEqual(result.stats.rent.transactions,[]);
});
test('manual new session clears all rent state and closes without clearing copper',()=>{
 const f=fixture({coins:44});f.controller.setRunning(true,{start:true});f.advance(120000);f.stats=addOvertime(f.stats,30,{id:'pending'}).stats;
 f.controller.newSession();assert.equal(f.stats.coins,44);assert.equal(f.stats.rent.started,false);assert.equal(f.stats.rent.elapsedMs,0);assert.equal(f.stats.rent.overtimeSeconds,0);assert.deepEqual(f.stats.rent.transactions,[]);
 assert.equal(f.controller.snapshot().running,false);assert.equal(f.controller.snapshot().remainingSeconds,600);assert.equal(f.ended[0],'manual');
});
test('manual new session never collects a newly due rent as part of resetting',()=>{
 const f=fixture();f.controller.setRunning(true,{start:true});f.advance(599999);f.jump(1);f.controller.newSession();
 assert.equal(f.stats.coins,160);assert.equal(f.charges.length,0);assert.equal(f.stats.rent.started,false);
});
test('a stale resume-open value cannot reopen a session that expired inside setRunning',()=>{
 const f=fixture();f.controller.setRunning(true,{start:true});f.controller.setRunning(false);f.jump(3600000);
 f.controller.setRunning(true);assert.equal(f.stats.rent.started,false);assert.equal(f.controller.snapshot().running,false);
});
test('an explicit new customer may start after the closed session expires',()=>{
 const f=fixture();f.controller.setRunning(true,{start:true});f.controller.setRunning(false);f.jump(3600000);
 f.controller.setRunning(true,{start:true});assert.equal(f.stats.rent.started,true);assert.equal(f.controller.snapshot().running,true);assert.equal(f.controller.snapshot().remainingSeconds,600);
});
test('rent transaction ids remain distinct between new sessions even at the same wall millisecond',()=>{
 const settings=defaultSettings().rent;
 let first=advanceRent(startRent(defaultStats(),settings),600000,settings,{running:true}).stats;
 const firstId=first.rent.transactions[0].id;
 let next=newRentSession(first,settings,1000);
 next=advanceRent(startRent(next,settings),600000,settings,{running:true}).stats;
 const secondId=next.rent.transactions[0].id;
 let third=newRentSession(next,settings,1000);
 third=advanceRent(startRent(third,settings),600000,settings,{running:true}).stats;
 assert.equal(new Set([firstId,secondId,third.rent.transactions[0].id]).size,3);
});
