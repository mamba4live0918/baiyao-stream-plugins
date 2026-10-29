import test from 'node:test';
import assert from 'node:assert/strict';
import {createEventState,reduceEvents,nextEventAt,FEEDBACK_KINDS} from '../src/events/model.js';

const ctx=(extra={})=>({config:{fireSeconds:8,smokeSeconds:3,thiefSeconds:6,stealFraction:.3,blackoutSeconds:20,catSeconds:4,tourSize:10,helperInterval:.9,bannerSeconds:2.4},shop:'noodle',coins:100,hasOrders:true,orderKey:'order-1',dishCount:1,pendingDish:false,...extra});
const step=(s,action,now=0,c=ctx())=>reduceEvents(s,action,now,c);
const add=(s,kind,count=1,now=0,c=ctx(),extra={})=>step(s,{type:'enqueue',spec:{kind,count,nick:'阿强',id:'source-'+kind,source:'sim',...extra}},now,c);
const types=r=>r.commands.map(c=>c.type);
test('queued spice immediately names the viewer watching the next dish',()=>{
 const r=add(createEventState(),'spice',1,0,ctx({dishCount:0,hasDish:false}),{nick:'辣椒王'});
 assert.equal(r.state.active.spice,null);assert.equal(r.state.queues.spice[0].count,1);
 assert.ok(r.state.effects.some(e=>e.nick==='辣椒王'&&e.text==='盯上了下一份菜！'));
});
test('helper rescue feedback names the helper instead of the saboteur',()=>{
 let s=add(createEventState(),'fire',1,0,ctx(),{nick:'放火的A'}).state;
 s=add(s,'helper',1,0,ctx(),{nick:'救场的B'}).state;
 const r=step(s,{type:'tick'},900,ctx());
 assert.equal(r.state.active.fire,null);assert.equal(r.state.effects.findLast(e=>e.kind==='extinguish').nick,'救场的B');
});
test('spice recognizes a zero-pearl finished drink as an actual dish',()=>{
 const r=add(createEventState(),'spice',1,0,ctx({shop:'tea',dishCount:0,hasDish:true}));
 assert.ok(r.state.active.spice);assert.ok(types(r).includes('spiceFood'));
});
test('helper discarding a spiced dish keeps the next spice queued for new food',()=>{
 const c=ctx({shop:'tea',dishCount:1,hasDish:true});
 let s=add(createEventState(),'spice',2,0,c).state;
 s=add(s,'helper',1,0,c,{nick:'帮手'}).state;
 const cleaned=step(s,{type:'tick'},900,c);
 assert.ok(types(cleaned).includes('discardFood'));assert.equal(cleaned.state.active.spice,null);
 assert.equal(cleaned.state.queues.spice.reduce((sum,p)=>sum+p.count,0),1);
 assert.ok(!types(cleaned).includes('spiceFood'),'cannot contaminate a dish the helper just discarded');
 const next=step(cleaned.state,{type:'tick'},1000,c);
 assert.ok(next.state.active.spice);assert.ok(types(next).includes('spiceFood'));
});

test('a million identical events occupy one active and one compact pack, with no swallowed remainder',()=>{
 const r=add(createEventState(),'fire',1000000);
 assert.equal(r.state.active.fire.nick,'阿强');assert.equal(r.state.queues.fire.length,1);assert.equal(r.state.queues.fire[0].count,999999);
 assert.equal(types(r).filter(x=>x==='igniteKitchen').length,1);
});
test('a guard blocks N incoming sabotages in bulk including tour, with exact remaining credits',()=>{
 let s=add(createEventState(),'guard',500000).state;
 const blocked=add(s,'tour',500003);
 assert.equal(blocked.state.guard.credits,0);assert.ok(blocked.state.active.tour);assert.equal(blocked.state.queues.tour[0].count,2);
 assert.equal(blocked.state.effects.find(e=>e.kind==='block').count,500000);
});
test('natural heat bypasses guard and preserves an old already-burnt deadline without igniting again',()=>{
 let s=add(createEventState(),'guard',2).state;
 const r=add(s,'fire',1,20000,ctx(),{source:'heat',heatStartedAt:1000,burnt:true});
 assert.equal(r.state.guard.credits,2);assert.equal(r.state.active.fire.startAt,1000);assert.equal(r.state.active.fire.burnAt,9000);assert.equal(r.state.active.fire.burnt,true);
 assert.ok(!types(r).includes('igniteKitchen'));assert.ok(types(r).includes('burnKitchen'));
});
test('external fire burns at eight seconds once; queued fire begins only after extinguishing',()=>{
 let r=add(createEventState(),'fire',2);assert.equal(r.state.active.fire.burnt,false);
 r=step(r.state,{type:'tick'},7999);assert.ok(!types(r).includes('burnKitchen'));
 r=step(r.state,{type:'tick'},8000);assert.equal(types(r).filter(t=>t==='burnKitchen').length,1);
 const unchanged=step(r.state,{type:'tick'},9000);assert.ok(!types(unchanged).includes('burnKitchen'));
 r=step(unchanged.state,{type:'extinguish'},9000);assert.ok(types(r).includes('repairKitchen'));assert.ok(types(r).includes('igniteKitchen'));
 assert.equal(r.state.active.fire.startAt,9000);assert.equal(r.state.queues.fire.length,0);
});
test('three bonks prevent theft, old ids cannot bonk the next thief',()=>{
 let s=add(createEventState(),'thief',2).state;const first=s.active.thief.id;
 for(let i=0;i<3;i++)s=step(s,{type:'bonk',id:first},i*50).state;
 assert.notEqual(s.active.thief.id,first);assert.equal(s.active.thief.hits,0);assert.equal(s.wanted.length,0);
 assert.equal(step(s,{type:'bonk',id:first},200).state,s);
});
test('thief takes only positive copper, and arriving guard returns exactly one wanted amount',()=>{
 let s=add(createEventState(),'thief').state;let r=step(s,{type:'tick'},6000,ctx({coins:7.5}));
 assert.deepEqual(r.commands.find(c=>c.type==='steal').amount,2.25);assert.equal(r.state.wanted[0].amount,2.25);
 r=add(r.state,'guard',3,6100);assert.equal(r.commands.find(c=>c.type==='refund').amount,2.25);assert.equal(r.state.wanted.length,0);assert.equal(r.state.guard.credits,3);
 s=add(createEventState(),'thief').state;r=step(s,{type:'tick'},6000,ctx({coins:-10}));assert.equal(r.commands.find(c=>c.type==='steal').amount,0);
});
test('blackout automatically clears after twenty seconds without another redraw deadline',()=>{
 let s=add(createEventState(),'blackout').state;s=step(s,{type:'tick'},19999).state;assert.ok(s.active.blackout);
 let r=step(s,{type:'tick'},20000);assert.equal(r.state.active.blackout,null);assert.ok(r.state.effects.some(e=>e.kind==='restorePower'));
 r=step(r.state,{type:'tick'},22401);assert.equal(nextEventAt(r.state,22401,ctx()),null);
});
test('cat elapsed damage is one counted command, not an expanded list, and held cat cannot eat',()=>{
 let s=add(createEventState(),'cat').state;let r=step(s,{type:'tick'},4000);
 assert.equal(r.commands.find(c=>c.type==='eatFood').count,1);
 r=step(r.state,{type:'tick'},400000);assert.equal(r.commands.filter(c=>c.type==='eatFood').length,1);assert.equal(r.commands.find(c=>c.type==='eatFood').count,99);
 r=step(r.state,{type:'tick'},400001,ctx({catHeld:true}));assert.ok(!types(r).includes('eatFood'));
 r=step(r.state,{type:'tick'},900000,ctx({catHeld:true}));assert.ok(!types(r).includes('eatFood'));
 r=step(r.state,{type:'tick'},900001,ctx({catHeld:false}));assert.equal(r.state.active.cat.nextEatAt,904001);
 r=step(r.state,{type:'removeCat'},900002);assert.equal(r.state.active.cat,null);
});
test('tour unloads ten customers once with filtered leader identity, then leaves',()=>{
 let s=add(createEventState(),'tour').state;let r=step(s,{type:'tick'},1199);assert.ok(!types(r).includes('addTour'));
 r=step(r.state,{type:'tick'},1200);assert.equal(r.commands.find(c=>c.type==='addTour').count,10);assert.equal(r.commands.find(c=>c.type==='addTour').nick,'阿强');
 r=step(r.state,{type:'tick'},2000);assert.ok(!types(r).includes('addTour'));
 r=step(r.state,{type:'tick'},2400);assert.equal(r.state.active.tour,null);
});
test('spice waits for an actual unlocked dish and stays dirty after the hand animation',()=>{
 let r=add(createEventState(),'spice',1,0,ctx({dishCount:0}));assert.equal(r.state.active.spice,null);assert.equal(r.state.queues.spice[0].count,1);
 r=step(r.state,{type:'tick'},100,ctx({pendingDish:true}));assert.equal(r.state.active.spice,null);
 r=step(r.state,{type:'tick'},200,ctx());assert.ok(types(r).includes('spiceFood'));assert.ok(r.state.active.spice);
 r=step(r.state,{type:'tick'},10000);assert.ok(r.state.active.spice);r=step(r.state,{type:'clearSpice'},10001);assert.equal(r.state.active.spice,null);
});
test('gunk persists through quiet time and needs repeated wiping',()=>{
 let s=add(createEventState(),'boom').state;assert.equal(s.active.boom.remaining,8);
 s=step(s,{type:'tick'},999999).state;assert.equal(s.active.boom.remaining,8);
 s=step(s,{type:'wipe',amount:3},1000000).state;assert.equal(s.active.boom.remaining,5);
 s=step(s,{type:'wipe',amount:5},1000001).state;assert.equal(s.active.boom,null);
});
test('helper rescue priority is fire, thief, blackout, cat, spice, gunk, then serving',()=>{
 let s=createEventState();for(const kind of ['boom','spice','cat','blackout','thief','fire'])s=add(s,kind).state;
 s=add(s,'helper',7).state;
 const resolved=[];for(let i=1;i<=7;i++){const r=step(s,{type:'tick'},i*900);s=r.state;resolved.push(r.commands.filter(c=>c.type!=='feedback').map(c=>c.type));}
 assert.deepEqual(resolved,[['repairKitchen'],[],[],[],['discardFood'],[],['serve']]);assert.equal(s.helper.credits,0);assert.equal(s.active.boom,null);assert.equal(s.active.spice,null);
});
test('helper credits do not disappear or poll when there is nothing to do',()=>{
 let s=add(createEventState(),'helper',1000000,0,ctx({hasOrders:false,orderKey:null,dishCount:0})).state;
 assert.equal(s.helper.credits,1000000);assert.equal(s.helper.nextAt,null);
 s=step(s,{type:'tick'},2401,ctx({hasOrders:false,orderKey:null,dishCount:0})).state;
 const r=step(s,{type:'tick'},999999,ctx({hasOrders:false,orderKey:null,dishCount:0}));assert.equal(r.state,s);assert.equal(r.commands.length,0);
 s=step(r.state,{type:'tick'},1000000,ctx()).state;assert.equal(s.helper.nextAt,1000900);
 const served=step(s,{type:'tick'},1000900,ctx());assert.equal(served.commands.find(c=>c.type==='serve').orderKey,'order-1');assert.equal(served.state.helper.credits,999999);
});
test('immutable state and feedback enum never rely on original comment text',()=>{
 const original=createEventState();Object.freeze(original);const r=add(original,'boom',1,0,ctx(),{nick:'https://evil.example'});
 assert.equal(original.active.boom,null);assert.equal(r.state.active.boom.nick,'观众');
 for(const effect of r.state.effects)assert.ok(FEEDBACK_KINDS.includes(effect.kind));
 const expired=step(r.state,{type:'tick'},2401);assert.equal(expired.state.effects.length,0);assert.ok(expired.state.active.boom);
});
test('helper keeps its credit while the only spiced dish is already pending',()=>{
 let s=add(createEventState(),'spice').state;
 const inFlight=ctx({pendingDish:true,dishCount:0,hasOrders:false,orderKey:null});
 s=add(s,'helper',1,0,inFlight).state;
 const r=step(s,{type:'tick'},900,inFlight);
 assert.equal(r.state.helper.credits,1);assert.equal(r.state.helper.nextAt,null);assert.ok(r.state.active.spice);
 assert.ok(!types(r).includes('discardFood'));assert.ok(!types(r).includes('serve'));
});
test('helper skips pending spice and rescues persistent face gunk instead',()=>{
 let s=add(createEventState(),'spice').state;s=add(s,'boom').state;
 const inFlight=ctx({pendingDish:true,dishCount:0,hasOrders:false,orderKey:null});
 s=add(s,'helper',1,0,inFlight).state;const r=step(s,{type:'tick'},900,inFlight);
 assert.equal(r.state.helper.credits,0);assert.equal(r.state.active.boom,null);assert.ok(r.state.active.spice);
 assert.ok(!types(r).includes('discardFood'));assert.ok(r.state.effects.some(e=>e.kind==='wipe'));
});
test('helper may serve a different order while a spiced receipt is pending',()=>{
 let s=add(createEventState(),'spice').state;
 const otherOrder=ctx({pendingDish:true,dishCount:0,hasOrders:true,orderKey:'other-order'});
 s=add(s,'helper',1,0,otherOrder).state;const r=step(s,{type:'tick'},900,otherOrder);
 assert.equal(r.state.helper.credits,0);assert.ok(r.state.active.spice);
 assert.equal(r.commands.find(c=>c.type==='serve')?.orderKey,'other-order');assert.ok(!types(r).includes('discardFood'));
});
