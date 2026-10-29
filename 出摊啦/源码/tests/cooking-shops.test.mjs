import test from 'node:test';
import assert from 'node:assert/strict';
import {createKitchen,reduceKitchen,kitchenDishCount,kitchenHasDish} from '../src/cooking/kitchen.js';
const act=(s,type,now=0,fields={})=>reduceKitchen(s,{type,...fields},now);
function pancake(eggs=1){let s=createKitchen('pancake');s=act(s,'loadBatter');s=act(s,'spread');for(let i=0;i<eggs;i++)s=act(s,'addEgg');return s;}
function bag(eggs=1){return act(pancake(eggs),'liftPancake',4000);}
// V1.3：珍珠先下进小锅，煮熟（默认 4 秒）后一勺勺捞进杯子。
function tea(pearls=1){let s=createKitchen('tea');for(let i=0;i<pearls;i++)s=act(s,'addPearls');for(let i=0;i<pearls;i++)s=act(s,'scoopPearls',4000);return s;}
function cup(pearls=1){return act(act(tea(pearls),'shake'),'pourTea');}

test('煎饼先下糊摊开再逐个加蛋，不能提前铲',()=>{
 let s=createKitchen('pancake');assert.equal(act(s,'addEgg').pancake.eggs,0);assert.equal(act(s,'spread').pancake.loaded,false);
 s=act(s,'loadBatter');assert.equal(s.pancake.loaded,true);assert.equal(act(s,'addEgg').pancake.eggs,0);assert.equal(act(s,'takeDish').pending,null);
 s=act(s,'spread');s=act(s,'addEgg');s=act(s,'addEgg',1000);assert.equal(s.pancake.eggs,2);assert.equal(s.pot.startedAt,1000);
 assert.equal(act(s,'liftPancake',4999).pancake.bag,null);s=act(s,'liftPancake',5000);assert.deepEqual(s.pancake.bag,{eggs:2});assert.equal(s.pancake.loaded,false);assert.equal(s.pot.status,'empty');
 assert.equal(kitchenDishCount(s),2);assert.equal(kitchenHasDish(s),true);assert.equal(act(s,'loadBatter',5001).pancake.loaded,false);
});
test('煎饼过绿窗先烟后火，普通清工作台不能解锁，灭火清理后可重新下糊',()=>{
 let s=pancake();s=act(s,'tick',10000);assert.equal(s.pot.status,'smoking');assert.equal(act(s,'clearWork',10001).pancake.loaded,false);
 s=act(s,'tick',13000);assert.equal(s.pot.status,'fire');assert.equal(s.pot.fireSource,'heat');assert.equal(s.pot.fireStartedAt,13000);
 s=act(s,'tick',21000);assert.equal(s.stoveLocked,true);assert.equal(s.pot.status,'burnt');
 s=act(s,'clearWork',21001);assert.equal(s.stoveLocked,true);assert.equal(act(s,'loadBatter',21002).pancake.loaded,false);
 s=act(s,'repair',21003);assert.equal(s.stoveLocked,false);assert.equal(s.pancake.loaded,false);assert.equal(act(s,'loadBatter',21004).pancake.loaded,true);
});
test('煎饼数量不受图片两蛋显示限制，猫先扣成品蛋，零蛋袋仍可上菜',()=>{
 let s=bag(500);assert.equal(kitchenDishCount(s),500);s=act(s,'eat',4001,{count:500});assert.equal(kitchenDishCount(s),0);assert.equal(kitchenHasDish(s),true);
 s=act(s,'spice',4002);assert.equal(s.badDish,true);s=act(s,'takeDish',4003);assert.equal(s.pending.given,0);assert.equal(s.pending.ruined,true);assert.equal(kitchenHasDish(s),false);
 const pending=s.pending;s=act(s,'eat',4004,{count:100});assert.equal(s.pending,pending);s=act(s,'cancelDish',4005,{id:pending.id});assert.equal(kitchenHasDish(s),true);assert.equal(kitchenDishCount(s),0);assert.equal(s.badDish,true);
 s=act(s,'clearDish',4006);assert.equal(s.pancake.bag,null);assert.equal(s.badDish,false);
});
test('猫吃掉鏊子上的蛋后，曾加蛋的饼仍能铲成零蛋袋',()=>{
 let s=pancake(1);s=act(s,'eat',1000);assert.equal(s.pancake.eggs,0);assert.equal(s.pancake.loaded,true);s=act(s,'liftPancake',4000);assert.deepEqual(s.pancake.bag,{eggs:0});
 const noEgg=act(act(createKitchen('pancake'),'loadBatter'),'spread');assert.equal(act(noEgg,'liftPancake',4000).pancake.bag,null);
});
test('奶茶捞好珍珠、摇茶、倒茶封口后才能端，不能跳步或封口后加料',()=>{
 let s=createKitchen('tea');assert.equal(act(s,'shake').tea.shaken,false);assert.equal(act(s,'pourTea').tea.sealed,false);
 s=tea(2);assert.equal(s.tea.pearls,2);assert.equal(kitchenHasDish(s),false);assert.equal(act(s,'takeDish').pending,null);
 s=act(s,'shake');assert.equal(s.tea.shaken,true);s=act(s,'pourTea');assert.equal(s.tea.sealed,true);assert.equal(kitchenDishCount(s),2);assert.equal(kitchenHasDish(s),true);
 assert.equal(act(s,'addPearls').tea.pearls,2);assert.equal(act(s,'pourTea').tea.sealed,true);
 s=act(s,'takeDish');assert.equal(s.pending.given,2);assert.equal(s.tea.sealed,false);s=act(s,'cancelDish',0,{id:s.pending.id});assert.equal(s.tea.sealed,true);assert.equal(s.tea.pearls,2);
});
test('奶茶摇好后再捞珍珠不用重摇，猫吃光后仍可封零珍珠杯并污染结算',()=>{
 let s=act(tea(2),'shake');s=act(s,'addPearls',4000);s=act(s,'scoopPearls',8000);assert.equal(s.tea.pearls,3);assert.equal(s.tea.shaken,true);
 s=act(s,'shake');s=act(s,'eat',0,{count:3});assert.equal(s.tea.pearls,0);assert.equal(s.tea.shaken,true);s=act(s,'pourTea');assert.equal(kitchenHasDish(s),true);assert.equal(kitchenDishCount(s),0);
 s=act(s,'spice');assert.equal(s.badDish,true);s=act(s,'takeDish');assert.equal(s.pending.given,0);assert.equal(s.pending.ruined,true);
 s=act(s,'cancelDish',0,{id:s.pending.id});assert.equal(s.tea.sealed,true);assert.equal(s.tea.pearls,0);assert.equal(s.badDish,true);
 s=act(s,'clearDish');assert.equal(kitchenHasDish(s),false);assert.deepEqual(s.tea,{pearls:0,hadPearls:false,shaken:false,sealed:false});assert.equal(s.badDish,false);
});
test('封好的奶茶不受小锅影响，锅的外部火不会追溯毁掉封好的茶',()=>{
 let s=cup(3);s=act(s,'tick',1000000);assert.equal(s.tea.sealed,true);assert.equal(s.pot.status,'empty');assert.equal(s.badDish,false);
 s=act(s,'ignite',1000000);assert.equal(s.pot.status,'fire');assert.equal(s.pot.fireSource,'external');s=act(s,'burn',1008000);assert.equal(s.stoveLocked,true);assert.equal(s.badDish,false);
 s=act(s,'takeDish',1008001);assert.equal(s.pending.given,3);assert.equal(s.pending.ruined,false);s=act(s,'repair',1008002);assert.equal(s.stoveLocked,false);assert.equal(s.pending.ruined,false);
});
test('新两店在途菜份数和污染不被猫或后续火改变，完成仅匹配id',()=>{
 for(const shop of ['pancake','tea']){
  let s=shop==='pancake'?bag(2):cup(2);s=act(s,'spice',4000);s=act(s,'takeDish',4001);const p=s.pending;
  s=act(s,'eat',4002,{count:100});s=act(s,'spice',4002);s=act(s,'ignite',4002);s=act(s,'burn',12002);s=act(s,'repair',12003);assert.equal(s.pending,p);assert.equal(p.given,2);assert.equal(p.ruined,true);
  assert.equal(act(s,'completeDish',12004,{id:999}).pending,p);s=act(s,'completeDish',12004,{id:p.id});assert.equal(s.pending,null);assert.equal(kitchenHasDish(s),false);
 }
});
test('煎饼外火会烧坏已装袋成品，修复不洗白坏菜',()=>{
 let s=bag(1);s=act(s,'ignite',5000);s=act(s,'burn',13000);assert.equal(s.badDish,true);s=act(s,'repair',13001);assert.equal(s.badDish,true);assert.equal(kitchenHasDish(s),true);assert.equal(act(s,'takeDish',13002).pending.ruined,true);
});
test('clearWork只清未完成工作台，不消掉袋杯且不绕过火锁',()=>{
 let p=act(pancake(),'clearWork',1000);assert.equal(p.pancake.loaded,false);assert.equal(p.pot.status,'empty');p=act(bag(),'clearWork',4001);assert.equal(kitchenHasDish(p),true);
 let t=act(act(tea(3),'shake'),'clearWork');assert.deepEqual(t.tea,{pearls:0,hadPearls:false,shaken:false,sealed:false});t=act(cup(),'clearWork');assert.equal(kitchenHasDish(t),true);
 t=act(t,'ignite');t=act(t,'burn',8000);t=act(t,'clearWork',8001);assert.equal(t.stoveLocked,true);assert.equal(kitchenHasDish(t),true);
});
