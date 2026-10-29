import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultStats,sanitizeStats,saveStats,loadStats} from '../src/stats.js';
import {defaultRentState,sanitizeRentState,startRent,chargeRent,advanceRent,addOvertime,markOvertimeSent,resetCounters,rentView,getPendingOvertime} from '../src/rent/model.js';

const settings={enabled:true,minutes:10,coins:100,perCoins:10,addMinutes:1};
const running={running:true};
const started=coins=>startRent({...defaultStats(),coins,rent:{...defaultRentState(),lastSeenAt:1000}},settings);

test('first customer starts one persistent cycle; opening without a customer does not accrue',()=>{
 const fresh=defaultStats();
 assert.equal(advanceRent(fresh,600000,settings,running).stats.rent.started,false);
 const s=startRent(fresh,settings);
 assert.equal(s.rent.started,true);assert.equal(s.rent.nextDueMs,600000);
 assert.equal(startRent(s,settings),s);
 assert.equal(advanceRent(s,599999,settings,running).charges.length,0);
});

test('one due rent deducts only the rent and advances its persisted due point exactly once',()=>{
 const before=started(150);
 const result=advanceRent(before,600000,settings,{running:true,idFactory:n=>'bill-'+n});
 assert.equal(before.coins,150);assert.equal(before.rent.elapsedMs,0);
 assert.equal(result.stats.coins,50);assert.equal(result.charges.length,1);
 assert.deepEqual(result.charges[0],{id:'bill-1',dueAtMs:600000,paid:100,shortfall:0,seconds:0});
 assert.deepEqual(result.stats.rent.lastCharge,result.charges[0]);
 assert.equal(result.stats.rent.nextDueMs,1200000);
 assert.equal(advanceRent(result.stats,0,settings,running).charges.length,0);
});

test('rent shortfall is rounded upward to seconds, including fractional copper',()=>{
 assert.deepEqual(chargeRent(60,settings),{balance:0,paid:60,shortfall:40,seconds:240});
 assert.deepEqual(chargeRent(99.75,settings),{balance:0,paid:99.75,shortfall:.25,seconds:2});
 assert.deepEqual(chargeRent(100,settings),{balance:0,paid:100,shortfall:0,seconds:0});
 assert.equal(chargeRent(50,{...settings,perCoins:20,addMinutes:2}).seconds,300);
});

test('negative copper is retained as old debt, never paid as a negative rent or added to shortfall',()=>{
 assert.deepEqual(chargeRent(-7.5,settings),{balance:-7.5,paid:0,shortfall:100,seconds:600});
 assert.deepEqual(chargeRent(-7.5,{...settings,coins:0}),{balance:-7.5,paid:0,shortfall:0,seconds:0});
});

test('off duty pauses all business clocks; disabling rent pauses only rent clock',()=>{
 const s=started(0);
 assert.equal(advanceRent(s,600000,settings,{running:false}).stats,s);
 const off=advanceRent(s,300000,{...settings,enabled:false},running).stats;
 assert.equal(off.rent.elapsedMs,0);assert.equal(off.rent.sessionElapsedMs,300000);
 const resumed=advanceRent(off,600000,settings,running);
 assert.equal(resumed.charges.length,1);assert.equal(resumed.stats.rent.sessionElapsedMs,900000);
});

test('refresh serializes elapsed time but accrues no offline time or duplicate payment',()=>{
 let payload;const storage={getItem:()=>payload,setItem:(_,v)=>payload=v};
 const s=advanceRent(started(200),650000,settings,running).stats;
 assert.equal(saveStats(storage,s),true);
 const loaded=loadStats(storage,{wallNow:()=>10000}).stats;
 assert.equal(loaded.coins,100);assert.equal(loaded.rent.elapsedMs,650000);
 assert.equal(rentView(loaded,settings).remainingSeconds,550);
 assert.equal(advanceRent(loaded,9999999,settings,{running:false}).stats,loaded);
 assert.equal(advanceRent(loaded,550000,settings,running).stats.coins,0);
});

test('changing interval preserves the current due point and applies new length from the next cycle',()=>{
 const s=advanceRent(started(300),480000,settings,running).stats;
 const shorter={...settings,minutes:5};
 const before=advanceRent(s,119999,shorter,running);
 assert.equal(before.charges.length,0);assert.equal(before.stats.rent.nextDueMs,600000);
 const due=advanceRent(before.stats,1,shorter,running);
 assert.equal(due.charges.length,1);assert.equal(due.stats.rent.intervalMs,300000);
 assert.equal(due.stats.rent.nextDueMs,900000);
 assert.equal(advanceRent(due.stats,300000,shorter,running).charges.length,1);
});

test('a large active delta collects every crossed rent without discarding residual progress',()=>{
 const r=advanceRent(started(250),1900000,settings,{running:true,idFactory:n=>'cross-'+n});
 assert.equal(r.charges.length,3);assert.equal(r.stats.coins,0);
 assert.deepEqual(r.charges.map(c=>c.seconds),[0,0,300]);
 assert.equal(r.stats.rent.nextDueMs,2400000);assert.equal(r.stats.rent.elapsedMs,1900000);
 assert.equal(rentView(r.stats,settings).remainingSeconds,500);
});

test('a shortfall becomes one pending transaction for 白曜加班机 and duplicate action ids do not add twice',()=>{
 const r=advanceRent(started(60),600000,settings,{running:true,idFactory:n=>'rent-'+n});
 assert.deepEqual(getPendingOvertime(r.stats),[{id:'rent-1',seconds:240,source:'rent',route:'baiyao',status:'pending'}]);
 const a=addOvertime(r.stats,30,{id:'manual-1',source:'action',user:' 小鱼干 '});
 assert.deepEqual(a.transaction,{id:'manual-1',seconds:30,source:'action',route:'baiyao',status:'pending',user:'小鱼干'});
 assert.equal(a.stats.rent.overtimeSeconds,270);
 assert.equal(addOvertime(a.stats,30,{id:'manual-1',source:'action'}).stats,a.stats);
 assert.equal(r.stats.rent.overtimeSeconds,240);
});

test('V1.4 自带加班机 and V1.3 咩播 records stay settled: they are never sent to 白曜加班机',()=>{
 const rent=sanitizeRentState({...defaultRentState(),started:true,overtimeSeconds:90,transactions:[
  {id:'v14',seconds:60,source:'rent',route:'local',status:'local'},
  {id:'v13',seconds:30,source:'rent',route:'miebo',status:'pending'}]});
 assert.deepEqual(rent.transactions.map(t=>[t.id,t.route,t.status]),[['v14','local','local'],['v13','local','local']]);
 const old={...defaultStats(),rent};
 assert.equal(getPendingOvertime(old).length,0);assert.equal(markOvertimeSent(old,'v13'),old);
 const next=advanceRent(old,600000,settings,running).stats;
 assert.deepEqual(getPendingOvertime(next).map(t=>t.source),['rent']);assert.equal(next.rent.overtimeSeconds,90+600);
});

test('marking sent is idempotent, persistent and never changes totals',()=>{
 const r=advanceRent(started(0),600000,settings,running).stats,id=r.rent.transactions[0].id;
 const sent=markOvertimeSent(r,id,{at:5});
 assert.equal(getPendingOvertime(sent).length,0);assert.equal(sent.rent.overtimeSeconds,600);assert.equal(sent.rent.transactions[0].sentAt,5);
 assert.equal(markOvertimeSent(sent,id),sent);assert.equal(markOvertimeSent(sent,'missing'),sent);
 const restored=sanitizeStats(JSON.parse(JSON.stringify(sent)));
 assert.equal(restored.rent.transactions[0].status,'sent');assert.equal(getPendingOvertime(restored).length,0);
});

test('reset counters retains all rent progress and pending records',()=>{
 const a=advanceRent({...started(50),served:9,badReviews:2},640000,settings,running).stats;
 const reset=resetCounters(a);
 assert.equal(reset.coins,0);assert.equal(reset.served,0);assert.equal(reset.badReviews,0);
 assert.deepEqual(reset.rent,a.rent);assert.equal(getPendingOvertime(reset).length,1);
});

test('the rent view counts business time and how much overtime is still on its way to 白曜',()=>{
 const s=addOvertime(started(0),90,{id:'gift'}).stats;
 const r=advanceRent(s,60000,settings,running).stats;
 assert.deepEqual(rentView(r,settings),{started:true,remainingMs:540000,remainingSeconds:540,sessionElapsedMs:60000,overtimeSeconds:90,pendingCount:1,chargeCoins:100,abandonSurcharge:0});
 assert.equal(rentView(markOvertimeSent(r,'gift'),settings).pendingCount,0);
});

test('invalid deltas and zero overtime do not mutate or create empty transactions',()=>{
 const s=started(0);
 for(const value of [-1,NaN,Infinity,'60000'])assert.equal(advanceRent(s,value,settings,running).stats,s);
 for(const value of [-1,0,NaN,Infinity,'60'])assert.equal(addOvertime(s,value).stats,s);
 const fractional=addOvertime(s,.1,{id:'fraction'}).stats;
 assert.equal(fractional.rent.overtimeSeconds,1);
});

test('generated ids avoid existing ids even when migrated sequence is behind the ledger',()=>{
 const s=addOvertime(started(0),10,{id:'chutan-2'}).stats;
 const next=addOvertime(s,20).stats;
 assert.equal(next.rent.transactions.length,2);
 assert.equal(new Set(next.rent.transactions.map(t=>t.id)).size,2);
 assert.equal(next.rent.overtimeSeconds,30);
 const charge=advanceRent(next,600000,settings,{running:true,idFactory:()=>s.rent.transactions[0].id}).stats;
 assert.equal(new Set(charge.rent.transactions.map(t=>t.id)).size,3);
});

test('legacy stats migrate without losing money and nested rent state is sanitized independently',()=>{
 assert.deepEqual(sanitizeStats({coins:7.5,served:2,badReviews:1}).rent,defaultRentState());
 const raw={started:true,elapsedMs:50,nextDueMs:100,intervalMs:100,sessionElapsedMs:60,sequence:4,overtimeSeconds:12,transactions:[
  {id:'a',seconds:12,source:'rent',route:'miebo',status:'pending'},
  {id:'a',seconds:99,source:'rent',route:'miebo',status:'pending'},
  {id:'bad',seconds:Infinity,source:'rent',route:'miebo',status:'pending'},
  {id:'local',seconds:3,source:'action',route:'local',status:'pending'}
 ]};
 const clean=sanitizeRentState(raw);
 assert.equal(clean.transactions.length,2);assert.equal(clean.transactions[1].status,'local');
 assert.deepEqual([clean.transactions[0].route,clean.transactions[0].status],['local','local'],'V1.3 咩播的待发记录不会送去白曜');
 assert.equal(clean.overtimeSeconds,15);assert.equal(clean.nextDueMs,100);
 clean.transactions[0].status='sent';assert.equal(raw.transactions[0].status,'pending');
 assert.deepEqual(sanitizeRentState({elapsedMs:-1,started:'yes'}),defaultRentState());
});
