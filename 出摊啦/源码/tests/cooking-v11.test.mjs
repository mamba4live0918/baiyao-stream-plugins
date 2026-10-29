import test from 'node:test';
import assert from 'node:assert/strict';
import {createKitchen,reduceKitchen} from '../src/cooking/kitchen.js';
import {CookingScene} from '../src/cooking/scene.js';
import {eventDropAction} from '../src/events/scene.js';
const act=(s,type,now=0,fields={})=>reduceKitchen(s,{type,...fields},now);
const noodle=()=>act(createKitchen('noodle'),'load');
function pancake(){let s=act(createKitchen('pancake'),'loadBatter');s=act(s,'spread');return act(s,'addEgg');}
function dish(shop){let s=createKitchen(shop);if(shop==='noodle')return act(noodle(),'scoop',4000);if(shop==='pancake')return act(pancake(),'liftPancake',4000);if(shop==='tea'){s=act(s,'addPearls');s=act(s,'scoopPearls',4000);s=act(s,'shake',4000);return act(s,'pourTea',4000);}s=act(s,'load');s=act(s,'slice');return act(s,'plate');}

test('a portion rolls once at smoke, then fire and burn retain the same record',()=>{
 for(const shop of ['noodle','pancake']){let s=shop==='noodle'?noodle():pancake();assert.equal(s.spoilSerial,0);s=act(s,'tick',10000);assert.equal(s.spoilSerial,1);assert.equal(s.lastSpoilage.reason,'smoking');const id=s.lastSpoilage.id;s=act(s,'tick',13000);s=act(s,'burn',21000);assert.equal(s.spoilSerial,1);assert.equal(s.lastSpoilage.id,id);}
});
test('external fire counts only actual workspace food in four shops',()=>{
 for(const shop of ['noodle','pancake','sushi','tea']){let s=createKitchen(shop);s=act(s,'ignite');assert.equal(s.spoilSerial,0,`${shop} empty`);s=act(s,'burn',8000);assert.equal(s.spoilSerial,0);s=act(s,'repair',8001);s=act(s,shop==='pancake'?'loadBatter':shop==='tea'?'addPearls':'load',8002);s=act(s,'ignite',8003);assert.equal(s.spoilSerial,1,shop);assert.equal(s.lastSpoilage.reason,'fire');s=act(s,'burn',16003);assert.equal(s.spoilSerial,1);}
 assert.equal(act(dish('tea'),'ignite').spoilSerial,0,'sealed tea does not put food in the small pot');
});
test('spice counts the first contamination only, including zero-egg and zero-pearl dishes',()=>{
 for(const shop of ['noodle','sushi','pancake','tea']){let s=dish(shop);if(['pancake','tea'].includes(shop))s=act(s,'eat',4000,{count:999});s=act(s,'spice',4000);assert.equal(s.spoilSerial,1,shop);assert.equal(s.lastSpoilage.reason,'spice');assert.equal(s.badDish,true);s=act(s,'spice',4000);assert.equal(s.spoilSerial,1);s=act(s,'takeDish',4000);s=act(s,'cancelDish',4000,{id:s.pending.id});assert.equal(act(s,'spice',4000).spoilSerial,1);}
});
test('new ingredients in the same smoked pot do not reroll; clearing and refilling do',()=>{
 let s=act(noodle(),'tick',10000);s=act(s,'load',10001);s=act(s,'tick',20001);assert.equal(s.spoilSerial,1);s=act(s,'clearPot',20002);s=act(s,'load',20003);s=act(s,'tick',30003);assert.equal(s.spoilSerial,2);assert.equal(s.lastSpoilage.id,2);
});
test('clear, serve and cats emptying the work area allow the next real portion to roll',()=>{
 for(const shop of ['sushi','tea']){let s=act(createKitchen(shop),shop==='tea'?'addPearls':'load');s=act(s,'ignite');s=act(s,'repair',1);s=act(s,'eat',2,{count:999});s=act(s,shop==='tea'?'addPearls':'load',3);s=act(s,'ignite',4);assert.equal(s.spoilSerial,2,shop);}
 let s=act(dish('tea'),'spice');s=act(s,'takeDish');s=act(s,'completeDish',0,{id:s.pending.id});s=act(s,'addPearls');s=act(s,'scoopPearls',4000);s=act(s,'shake',4000);s=act(s,'pourTea',4000);assert.equal(act(s,'spice',4000).spoilSerial,2);
 s=act(dish('noodle'),'spice',4000);s=act(s,'clearDish',4000);s=act(s,'load',4001);s=act(s,'scoop',8001);assert.equal(act(s,'spice',8001).spoilSerial,2);
});
test('pending dishes cannot be retrospectively fined or contaminated',()=>{
 for(const shop of ['noodle','sushi','pancake','tea']){let s=act(dish(shop),'takeDish',4000),pending=s.pending;s=act(s,'spice',4000);s=act(s,'ignite',4000);s=act(s,'burn',12000);assert.equal(s.pending,pending);assert.equal(s.pending.ruined,false);assert.equal(s.spoilSerial,shop==='sushi'?1:0,shop);}
});
function scene(shop){const actions=[];const s=Object.assign(Object.create(CookingScene.prototype),{u:1,effects:[],now:()=>0,cancelDrag(){this.drag=null;},invalidate(){},notify(){},act(a){actions.push(a);return true;},regions:{dish:{x:500,y:500,width:110,height:85},griddle:{x:200,y:500,width:280,height:170},spatula:{width:160,height:65},shaker:{x:250,y:500,width:105,height:130}}});return{s,actions};}
function drop(s,kind,p){s.drag={kind,pointerId:1,start:{x:0,y:0},p};s.end({pointerId:1,clientX:p.x,clientY:p.y});}
test('strainer basket overlap serves when its grip is outside the bowl; grip alone does not',()=>{
 const {s,actions}=scene('noodle');drop(s,'scoop',{x:650,y:550});assert.deepEqual(actions,[{type:'scoop'}]);actions.length=0;drop(s,'scoop',{x:505,y:505});assert.deepEqual(actions,[]);
});
test('spatula blade overlap lifts into the bag while the grip remains outside',()=>{
 const {s,actions}=scene('pancake');s.regions.griddle.y=200;drop(s,'lift',{x:650,y:550});assert.deepEqual(actions,[{type:'liftPancake'}]);actions.length=0;drop(s,'lift',{x:505,y:505});assert.deepEqual(actions,[]);
});
test('rotated shaker mouth, not the cursor, decides pouring contact',()=>{
 const {s,actions}=scene('tea');drop(s,'pour',{x:600,y:590});assert.deepEqual(actions,[{type:'pourTea'}]);actions.length=0;drop(s,'pour',{x:450,y:450});assert.deepEqual(actions,[]);
});
test('extinguisher nozzle can touch fire with the cursor below it, but cursor alone fails',()=>{
 const r={unit:1,fire:{x:500,y:500,width:110,height:85},extinguisher:{x:10,y:10,width:50,height:140}};
 assert.deepEqual(eventDropAction('extinguisher',{x:0,y:0},{x:485,y:510},r),{type:'extinguish'});
 assert.equal(eventDropAction('extinguisher',{x:0,y:0},{x:600,y:580},r),null);
});

test('failed scoop from a checked pot cannot contaminate an independent fresh bowl',()=>{
 let s=act(createKitchen('noodle'),'load');s=act(s,'load');s=act(s,'scoop',4000);s=act(s,'tick',10000);assert.equal(s.workSpoilageChecked,true);assert.equal(s.badDish,false);s=act(s,'scoop',13000);assert.equal(s.badDish,false);assert.equal(s.dishSpoilageChecked,false);
});

import {rollSpoilage} from '../src/cooking/spoilage.js';
import {sourcePoint,cookingToolGeometry,extinguisherGeometry,workingEndTouchesRect} from '../src/cooking/tool-geometry.js';

test('spoilage probability zero disables RNG and feedback; one always charges the configured fine',()=>{
 const fail=()=>{throw new Error('RNG must not run at a fixed probability');};
 assert.deepEqual(rollSpoilage({spoilProbability:0,spoilFine:17},fail),{coins:0,charged:false,message:''});
 assert.deepEqual(rollSpoilage({spoilProbability:1,spoilFine:17},fail),{coins:-17,charged:true,message:'做坏了 −17'});
});
test('spoilage uses the exact half-probability boundary and emits one finite result per roll',()=>{
 let calls=0;const run=n=>rollSpoilage({spoilProbability:.5,spoilFine:10},()=>{calls++;return n;});
 assert.deepEqual(run(.499999),{coins:-10,charged:true,message:'做坏了 −10'});
 assert.deepEqual(run(.5),{coins:0,charged:false,message:'这次没罚'});assert.equal(calls,2);
 assert.equal(rollSpoilage({spoilProbability:1,spoilFine:0}).coins,0);
});
test('source attachment coordinates rotate around the same painted sprite centre',()=>{
 const p=sourcePoint({x:100,y:0},{width:200,height:100},{x:20,y:30,width:200,height:100},Math.PI/2);
 assert.ok(Math.abs(p.x-170)<1e-10);assert.ok(Math.abs(p.y-80)<1e-10);
 const tool=cookingToolGeometry('pour',{x:600,y:590},{unit:1,shaker:{width:105,height:130}});
 assert.ok(Math.abs(tool.workingEnd.x-617.5100221691771)<1e-8);assert.ok(Math.abs(tool.workingEnd.y-587.4404285110065)<1e-8);
 assert.equal(tool.angle,.55);assert.equal(tool.workingEnd.radius,19);
});
test('contact includes a grazing edge but excludes a real gap at desktop and narrow scales',()=>{
 for(const u of [1,480/1080]){
  const tool=cookingToolGeometry('scoop',{x:650*u,y:550*u},{unit:u},u);
  assert.ok(Math.abs(tool.workingEnd.x-582*u)<1e-9);assert.ok(Math.abs(tool.workingEnd.y-519*u)<1e-9);
  assert.equal(workingEndTouchesRect(tool.workingEnd,{x:500*u,y:500*u,width:60.5*u,height:85*u}),true);
  assert.equal(workingEndTouchesRect(tool.workingEnd,{x:500*u,y:500*u,width:60.49*u,height:85*u}),false);
 }
});
test('blade polygon handles a target crossing its edges and a tiny target wholly inside it',()=>{
 const tool=cookingToolGeometry('lift',{x:650,y:550},{spatula:{width:160,height:65}});
 assert.equal(workingEndTouchesRect(tool.workingEnd,{x:540,y:530,width:1,height:50}),true);
 assert.equal(workingEndTouchesRect(tool.workingEnd,{x:570,y:553,width:1,height:1}),true);
 assert.equal(workingEndTouchesRect(tool.workingEnd,{x:630,y:549,width:1,height:1}),false);
});
test('snapshot gives QA the real dragged working end with no mutation of kitchen state',()=>{
 const {s}=scene('noodle');s.getReceipt=()=>null;s.drag={kind:'scoop',p:{x:650,y:550}};
 const snap=s.snapshot();assert.deepEqual(snap.drag.workingEnd,{x:582,y:519,radius:21.5});assert.equal(snap.drag.toolRect.x,553);assert.equal(snap.drag.angle,0);
 const extinguisher=extinguisherGeometry({x:485,y:510},{extinguisher:{width:50,height:140}});
 assert.deepEqual(extinguisher.workingEnd,{x:504,y:541.5,radius:3.5});
});
test('spoilage feedback expires at 1600ms and leaves no idle animation or timer',()=>{
 let now=100,raf=0,timers=0,clipped=0;const originalRaf=globalThis.requestAnimationFrame,originalTimer=globalThis.setTimeout;
 globalThis.requestAnimationFrame=()=>++raf;globalThis.setTimeout=()=>++timers;
 try{
  const s=Object.assign(Object.create(CookingScene.prototype),{u:1,width:1920,height:1080,dpr:1,frame:0,timer:null,paused:false,inTick:false,renderCount:0,effects:[],regions:{pot:{x:600,y:800,width:220,height:140}},now:()=>now,invalidate(){},getReceipt:()=>null,getKitchen:()=>createKitchen('tea'),onTime(){},g:{setTransform(){},clearRect(){},save(){},restore(){}},clipFace(){clipped++;},paint(){}});
  s.announceSpoilage({coins:-10,charged:true,message:'做坏了 −10'});assert.equal(s.effects.length,1);assert.equal(s.effects[0].until,1700);
  s.tick();assert.equal(raf,1);assert.equal(clipped,1);now=1700;s.tick();assert.equal(s.effects.length,0);assert.equal(raf,1);assert.equal(timers,0);assert.equal(s.frame,0);
  s.announceSpoilage({coins:0,charged:false,message:''});assert.equal(s.effects.length,0);
 }finally{globalThis.requestAnimationFrame=originalRaf;globalThis.setTimeout=originalTimer;}
});
test('a checked batch moved to a fresh dish never rerolls when spiced, while a later fresh batch can',()=>{
 let s=act(createKitchen('sushi'),'load');s=act(s,'ignite');s=act(s,'repair',1);s=act(s,'slice',2);s=act(s,'plate',2);assert.equal(s.dishSpoilageChecked,true);assert.equal(act(s,'spice',2).spoilSerial,1);
 s=act(s,'clearBoard',3);s=act(s,'clearDish',3);s=act(s,'load',4);s=act(s,'slice',4);s=act(s,'plate',4);s=act(s,'spice',4);assert.equal(s.spoilSerial,2);
});
test('adding fresh slices to a dirty dish and reloading a dirty work area do not reroll',()=>{
 let s=dish('sushi');s=act(s,'spice');s=act(s,'slice');s=act(s,'plate');s=act(s,'spice');assert.equal(s.spoilSerial,1);
 s=act(createKitchen('sushi',{fishPieces:1}),'load');s=act(s,'ignite');s=act(s,'repair',1);s=act(s,'slice',2);s=act(s,'load',2);s=act(s,'ignite',3);assert.equal(s.spoilSerial,1);
});

test('only a real workspace portion burns: zero-egg batter counts, empty bowls and depleted tea do not',()=>{
 let p=pancake();p=act(p,'eat',1000);assert.equal(p.pancake.loaded,true);assert.equal(p.pancake.eggs,0);assert.equal(act(p,'ignite',1001).spoilSerial,1);
 let t=act(createKitchen('tea'),'addPearls');t=act(t,'scoopPearls',4000);t=act(t,'eat',4001);assert.equal(t.tea.hadPearls,true);assert.equal(t.tea.pearls,0);assert.equal(act(t,'ignite',4002).spoilSerial,0);
 const n=dish('noodle');assert.equal(n.bowl,1);assert.equal(n.pot.amount,0);assert.equal(act(n,'ignite',4001).spoilSerial,0);
 let fish=act(createKitchen('sushi',{fishPieces:1}),'load');fish=act(fish,'slice');fish=act(fish,'plate');assert.equal(act(fish,'ignite').spoilSerial,0);
});
test('spatula blade can touch the griddle with the grip outside, and no contact produces no action',()=>{
 const {s,actions}=scene('pancake');drop(s,'lift',{x:550,y:560});assert.deepEqual(actions,[{type:'liftPancake'}]);actions.length=0;drop(s,'lift',{x:900,y:300});assert.deepEqual(actions,[]);
});
test('pot and visible strainer both retain the ready-noodle drag entrance and pending lock',()=>{
 const original=globalThis.document;globalThis.document={documentElement:{dataset:{}}};
 try{
  for(const id of ['pot','strainer']){
   const s=Object.assign(Object.create(CookingScene.prototype),{u:1,regions:{pot:{x:0,y:0,width:220,height:140},strainer:{x:240,y:0,width:110,height:70}},getKitchen:()=>({shop:'noodle',pot:{status:'ready',amount:1}}),invalidate(){},notify(){}});
   s.start(id,{button:0,pointerId:8,clientX:250,clientY:30,preventDefault(){},currentTarget:{setPointerCapture(){}}});assert.equal(s.drag.kind,'scoop');
   s.drag=null;s.getKitchen=()=>({shop:'noodle',pot:{status:'ready',amount:1},pending:{id:1}});s.start(id,{button:0});assert.equal(s.drag,null);
  }
 }finally{globalThis.document=original;}
});
