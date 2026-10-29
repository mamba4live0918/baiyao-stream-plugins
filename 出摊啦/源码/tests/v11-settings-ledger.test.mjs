import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultSettings,sanitizeSettings,loadSettings,saveSettings,KEY_SETTINGS,KEY_STATS} from '../src/settings.js';
import {defaultStats,sanitizeStats,loadStats,saveStats} from '../src/stats.js';
import * as ledger from '../src/rent/model.js';

const rent={enabled:true,minutes:10,coins:100,perCoins:10,addMinutes:1,mode:'local',hours:2};
function storage(entries={}){
 const values=new Map(Object.entries(entries)),reads=[],writes=[];
 return{values,reads,writes,getItem(key){reads.push(key);return values.get(key)??null;},setItem(key,value){writes.push(key);values.set(key,value);}};
}

test('legacy custom settings are copied into isolated V1.1 storage once',()=>{
 const old={shop:'pancake',order:{keywords:['老板来饼'],perPerson:0},cooking:{cookSeconds:7.5,readySeconds:11,baseCoins:22,quantities:{tea:[5,5]}},sabotage:{smokeSeconds:4.5,catSeconds:2},rent:{coins:155},rules:{mess:[{name:'花花',min:2,max:4}]}};
 const store=storage({'chutan.v1.settings':JSON.stringify(old)}),loaded=loadSettings(store);
 assert.equal(KEY_SETTINGS,'chutan.v1_1.settings');assert.equal(KEY_STATS,'chutan.v1_1.stats');
 assert.equal(loaded.readable,true);assert.equal(loaded.settings.shop,'pancake');
 assert.deepEqual(loaded.settings.cooking.heat,{noodle:{cookSeconds:7.5,readySeconds:11,smokeSeconds:4.5},pancake:{cookSeconds:7.5,readySeconds:11,smokeSeconds:4.5},tea:{cookSeconds:7.5,readySeconds:11,smokeSeconds:4.5}});
 assert.deepEqual(loaded.settings.order.keywords,['老板来饼']);assert.equal(loaded.settings.order.perPerson,0);
 assert.equal(loaded.settings.cooking.baseCoins,22);assert.deepEqual(loaded.settings.cooking.quantities.tea,[5,5]);
 assert.equal(loaded.settings.sabotage.catSeconds,2);assert.equal(loaded.settings.rent.coins,155);
 assert.deepEqual(loaded.settings.rules.mess,[{name:'花花',min:2,max:4}]);
 assert.equal(loaded.settings.cooking.cookSeconds,undefined);assert.equal(loaded.settings.cooking.readySeconds,undefined);assert.equal(loaded.settings.sabotage.smokeSeconds,undefined);
 assert.deepEqual(store.writes,['chutan.v1_1.settings']);assert.deepEqual(JSON.parse(store.values.get('chutan.v1.settings')),old);
 store.values.set('chutan.v1.settings',JSON.stringify({shop:'sushi',cooking:{cookSeconds:99}}));
 assert.deepEqual(loadSettings(store).settings,loaded.settings);assert.deepEqual(store.reads,['chutan.v1_1.settings','chutan.v1.settings','chutan.v1_1.settings']);
 assert.equal(saveSettings(store,{...loaded.settings,shop:'tea'}),true);assert.deepEqual(store.writes,['chutan.v1_1.settings','chutan.v1_1.settings']);
});

test('new storage wins even when invalid and never falls back to old settings',()=>{
 const store=storage({'chutan.v1_1.settings':'{bad','chutan.v1.settings':JSON.stringify({shop:'sushi'})});
 assert.deepEqual(loadSettings(store),{settings:defaultSettings(),readable:false});
 assert.deepEqual(store.reads,['chutan.v1_1.settings']);assert.deepEqual(store.writes,[]);
});

test('each cooking shop owns independent heat and new settings validate penalty values',()=>{
 const defaults=defaultSettings();
 assert.deepEqual(defaults.cooking.heat,{noodle:{cookSeconds:4,readySeconds:6,smokeSeconds:3},pancake:{cookSeconds:4,readySeconds:6,smokeSeconds:3},tea:{cookSeconds:4,readySeconds:6,smokeSeconds:3}});
 defaults.cooking.heat.noodle.cookSeconds=12;
 assert.equal(defaults.cooking.heat.pancake.cookSeconds,4);assert.equal(defaultSettings().cooking.heat.noodle.cookSeconds,4);
 assert.deepEqual(defaultSettings().order.abandon,{enabled:false,angryWaitSeconds:60,penalty:'coins',amount:10});
 const clean=sanitizeSettings({cooking:{heat:{noodle:{cookSeconds:2.5,readySeconds:0,smokeSeconds:Infinity},pancake:{cookSeconds:8,readySeconds:9,smokeSeconds:5}},spoilProbability:2,spoilFine:0},order:{abandon:{enabled:true,angryWaitSeconds:0,penalty:'rent',amount:8.9}}});
 assert.deepEqual(clean.cooking.heat,{noodle:{cookSeconds:2.5,readySeconds:6,smokeSeconds:3},pancake:{cookSeconds:8,readySeconds:9,smokeSeconds:5},tea:{cookSeconds:4,readySeconds:6,smokeSeconds:3}});
 assert.equal(clean.cooking.spoilProbability,1);assert.equal(clean.cooking.spoilFine,0);
 assert.deepEqual(clean.order.abandon,{enabled:true,angryWaitSeconds:60,penalty:'rent',amount:8});
 const invalid=sanitizeSettings({cooking:{spoilProbability:NaN,spoilFine:-1},order:{abandon:{enabled:'true',angryWaitSeconds:-10,penalty:'other',amount:Infinity}}});
 assert.equal(invalid.cooking.spoilProbability,.5);assert.equal(invalid.cooking.spoilFine,10);assert.deepEqual(invalid.order.abandon,defaultSettings().order.abandon);
 assert.equal(sanitizeSettings({cooking:{spoilProbability:0}}).cooking.spoilProbability,0);
});

test('explicit shop heat overrides legacy times independently while missing fields migrate',()=>{
 const clean=sanitizeSettings({cooking:{cookSeconds:7,readySeconds:12,heat:{noodle:{cookSeconds:3,smokeSeconds:2},pancake:{readySeconds:5}}},sabotage:{smokeSeconds:8}});
 assert.deepEqual(clean.cooking.heat,{noodle:{cookSeconds:3,readySeconds:12,smokeSeconds:2},pancake:{cookSeconds:7,readySeconds:5,smokeSeconds:8},tea:{cookSeconds:7,readySeconds:12,smokeSeconds:8}});
});

test('legacy copper and ledger migrate once and later legacy saves cannot replace V1.1 statistics',()=>{
 const legacy={coins:-7.5,served:12,badReviews:3,rent:{version:2,started:true,lastSeenAt:1000,elapsedMs:450000,nextDueMs:600000,overtimeSeconds:120,transactions:[{id:'old',seconds:120,source:'rent',route:'miebo',status:'pending'}]}};
 const store=storage({'chutan.v1.stats':JSON.stringify(legacy)}),loaded=loadStats(store,{wallNow:()=>2000});
 assert.equal(loaded.readable,true);assert.equal(loaded.stats.coins,-7.5);assert.equal(loaded.stats.served,12);assert.equal(loaded.stats.badReviews,3);assert.equal(loaded.stats.abandoned,0);assert.equal(loaded.stats.rent.abandonSurcharge,0);
 assert.equal(loaded.stats.rent.elapsedMs,450000);assert.equal(loaded.stats.rent.transactions[0].id,'old');assert.deepEqual(store.writes,['chutan.v1_1.stats']);
 store.values.set('chutan.v1.stats',JSON.stringify({coins:9999}));
 assert.deepEqual(loadStats(store,{wallNow:()=>2000}).stats,loaded.stats);assert.deepEqual(store.reads,['chutan.v1_1.stats','chutan.v1.stats','chutan.v1_1.stats']);
 assert.equal(saveStats(store,{...loaded.stats,abandoned:9}),true);assert.deepEqual(store.writes,['chutan.v1_1.stats','chutan.v1_1.stats']);
 assert.equal(JSON.parse(store.values.get('chutan.v1.stats')).coins,9999);
});

test('new statistics validate abandonment counts and pending rent surcharge',()=>{
 const clean=sanitizeStats({coins:3.5,abandoned:12.9,rent:{abandonSurcharge:30}});
 assert.equal(clean.abandoned,12);assert.equal(clean.rent.abandonSurcharge,30);
 assert.equal(sanitizeStats({abandoned:-2,rent:{abandonSurcharge:-10}}).abandoned,0);
 assert.equal(sanitizeStats({rent:{abandonSurcharge:Infinity}}).rent.abandonSurcharge,0);
 const store=storage();saveStats(store,clean);assert.equal(loadStats(store).stats.rent.abandonSurcharge,30);
});

test('abandonment deducts coins for the entire batch without mutating the input ledger',()=>{
 assert.equal(typeof ledger.applyAbandonmentPenalty,'function');
 const before={...defaultStats(),coins:15.5,abandoned:2},next=ledger.applyAbandonmentPenalty(before,3,{enabled:true,penalty:'coins',amount:10});
 assert.equal(next.coins,-14.5);assert.equal(next.abandoned,5);assert.equal(next.rent.abandonSurcharge,0);assert.equal(before.coins,15.5);assert.equal(before.abandoned,2);
 for(const count of [0,-1,NaN,Infinity,'3'])assert.equal(ledger.applyAbandonmentPenalty(before,count,{enabled:true,penalty:'coins',amount:10}),before);
 assert.equal(ledger.applyAbandonmentPenalty(before,3,{enabled:false,penalty:'rent',amount:10}),before);
 const free=ledger.applyAbandonmentPenalty(before,2,{enabled:true,penalty:'coins',amount:0});assert.equal(free.coins,15.5);assert.equal(free.abandoned,4);
});

test('abandonment surcharge survives pauses and applies once even when one tick crosses several rents',()=>{
 assert.equal(typeof ledger.applyAbandonmentPenalty,'function');
 const before=ledger.startRent({...defaultStats(),coins:250},rent),next=ledger.applyAbandonmentPenalty(before,3,{enabled:true,penalty:'rent',amount:10});
 assert.equal(before.rent.abandonSurcharge,0);assert.equal(next.coins,250);assert.equal(next.rent.abandonSurcharge,30);assert.equal(next.abandoned,3);
 assert.equal(ledger.rentView(next,rent).chargeCoins,130);assert.equal(ledger.rentView(next,rent).abandonSurcharge,30);
 assert.equal(ledger.advanceRent(next,600000,rent,{running:false}).stats,next);
 const disabled=ledger.advanceRent(next,600000,{...rent,enabled:false},{running:true});assert.equal(disabled.stats.rent.abandonSurcharge,30);assert.equal(disabled.charges.length,0);
 const due=ledger.advanceRent(next,1800000,rent,{running:true});assert.deepEqual(due.charges.map(c=>[c.paid,c.shortfall,c.seconds]),[[130,0,0],[100,0,0],[20,80,480]]);
 assert.equal(due.stats.rent.abandonSurcharge,0);assert.equal(due.stats.coins,0);assert.equal(ledger.rentView(due.stats,rent).chargeCoins,100);assert.equal(due.stats.abandoned,3);
});

test('insufficient copper turns the whole surcharge into overtime and clears it after charging',()=>{
 const before=ledger.startRent({...defaultStats(),coins:60,rent:{...ledger.defaultRentState(),abandonSurcharge:30}},rent);
 const next=ledger.advanceRent(before,600000,rent,{running:true});
 assert.deepEqual(next.charges.map(c=>[c.paid,c.shortfall,c.seconds]),[[60,70,420]]);assert.equal(next.stats.rent.abandonSurcharge,0);
 assert.equal(ledger.rentView(next.stats,rent).chargeCoins,100);
});

test('new sessions clear surcharge while preserving cumulative abandoned count; counter reset clears abandoned only',()=>{
 const before=ledger.startRent({...defaultStats(),coins:42,served:8,badReviews:2,abandoned:9,rent:{...ledger.defaultRentState(),abandonSurcharge:30}},rent);
 const fresh=ledger.newRentSession(before,rent,1000);assert.equal(fresh.rent.abandonSurcharge,0);assert.equal(fresh.abandoned,9);assert.equal(fresh.coins,42);
 const reset=ledger.resetCounters(before);assert.equal(reset.abandoned,0);assert.equal(reset.coins,0);assert.deepEqual(reset.rent,before.rent);
});
