import test from 'node:test';
import assert from 'node:assert/strict';
import {createKitchen,reduceKitchen,kitchenDishCount,kitchenHasDish} from '../src/cooking/kitchen.js';
const act=(s,type,now=0,fields={})=>reduceKitchen(s,{type,...fields},now);
function pot(scoops,now=0,options){let s=createKitchen('tea',options);for(let i=0;i<scoops;i++)s=act(s,'addPearls',now);return s;}

test('奶茶：珍珠先下进小锅，绿圈后才能一勺勺捞进杯子',()=>{
 let s=pot(2);
 assert.deepEqual([s.pot.amount,s.pot.status,s.pot.startedAt],[2,'raw',0]);
 assert.equal(s.tea.pearls,0,'点珍珠罐不再直接进杯子');
 assert.equal(act(s,'scoopPearls',3999).tea.pearls,0,'没熟不能捞');
 s=act(s,'scoopPearls',4000);assert.equal(s.pot.status,'ready');assert.equal(s.pot.amount,1);assert.equal(s.tea.pearls,1);assert.equal(s.tea.hadPearls,true);
 s=act(s,'scoopPearls',4001);assert.equal(s.pot.amount,0);assert.equal(s.pot.status,'empty');assert.equal(s.tea.pearls,2);
 assert.equal(act(s,'scoopPearls',4002).tea.pearls,2,'锅空了不能再捞');
 assert.equal(kitchenHasDish(s),false,'没封口不能端');
 s=act(s,'shake',4003);assert.equal(s.tea.shaken,true);s=act(s,'pourTea',4004);assert.equal(s.tea.sealed,true);assert.equal(kitchenDishCount(s),2);assert.equal(kitchenHasDish(s),true);
});

test('奶茶：杯里没珍珠不能摇；摇好后再捞一勺不用重摇；封口后不能再捞',()=>{
 let s=pot(3);
 assert.equal(act(s,'shake',4000).tea.shaken,false);
 s=act(s,'scoopPearls',4000);s=act(s,'shake',4001);s=act(s,'scoopPearls',4002);
 assert.equal(s.tea.pearls,2);assert.equal(s.tea.shaken,true);
 s=act(s,'pourTea',4003);assert.equal(s.tea.sealed,true);
 assert.equal(act(s,'scoopPearls',4004).tea.pearls,2);
 assert.equal(act(s,'addPearls',4005).pot.amount,2,'封好的杯子等着时，小锅可以接着下下一锅');
});

test('奶茶：再下一勺，整锅重新计时',()=>{
 let s=act(createKitchen('tea'),'addPearls',0);s=act(s,'addPearls',3000);
 assert.equal(s.pot.startedAt,3000);
 assert.equal(act(s,'scoopPearls',6999).tea.pearls,0);
 assert.equal(act(s,'scoopPearls',7000).tea.pearls,1);
});

test('奶茶：小锅过绿圈先冒烟（算一次做坏），点锅倒掉；不管就着火烧坏，修好能重煮',()=>{
 let s=pot(1);
 s=act(s,'tick',10000);assert.equal(s.pot.status,'smoking');assert.equal(s.spoilSerial,1);assert.equal(s.lastSpoilage.reason,'smoking');
 assert.equal(act(s,'scoopPearls',10001).tea.pearls,0,'冒烟的珍珠不能捞');
 const cleared=act(s,'clearPot',10001);assert.equal(cleared.pot.status,'empty');assert.equal(cleared.pot.amount,0);
 s=act(s,'tick',13000);assert.equal(s.pot.status,'fire');assert.equal(s.pot.fireSource,'heat');
 s=act(s,'tick',21000);assert.equal(s.pot.status,'burnt');assert.equal(s.stoveLocked,true);assert.equal(s.spoilSerial,1,'同一锅只算一次');
 assert.equal(act(s,'addPearls',21001).pot,s.pot,'锁灶时不能下锅');
 s=act(s,'repair',21002);assert.equal(s.stoveLocked,false);s=act(s,'addPearls',21003);assert.equal(s.pot.amount,1);assert.equal(s.pot.status,'raw');
});

test('奶茶：锅里冒烟不会连累杯里已经捞好的珍珠',()=>{
 let s=pot(2);s=act(s,'scoopPearls',4000);
 s=act(s,'tick',10000);assert.equal(s.pot.status,'smoking');
 s=act(s,'shake',10001);s=act(s,'pourTea',10002);assert.equal(s.tea.sealed,true);assert.equal(s.badDish,false);
});

test('奶茶：倒掉冒烟的锅再重煮，新的一锅坏了会再算一次',()=>{
 let s=pot(1);s=act(s,'tick',10000);assert.equal(s.spoilSerial,1);
 s=act(s,'clearPot',10001);s=act(s,'addPearls',10002);s=act(s,'tick',20002);
 assert.equal(s.pot.status,'smoking');assert.equal(s.spoilSerial,2);
});

test('奶茶：猫先吃杯里的珍珠，再吃锅里的',()=>{
 let s=pot(3);s=act(s,'scoopPearls',4000);
 s=act(s,'eat',4001,{count:2});assert.equal(s.tea.pearls,0);assert.equal(s.pot.amount,1);assert.equal(s.tea.hadPearls,true);
});

test('奶茶：锅的容量上限同样生效',()=>{
 const s=pot(5,0,{capacity:2});assert.equal(s.pot.amount,2);
});

test('奶茶：冒过烟的那锅捞进杯子算坏；杯子倒进垃圾桶后，下一杯是好的',()=>{
 let s=pot(1);s=act(s,'tick',10000);assert.equal(s.pot.status,'smoking');
 s=act(s,'addPearls',10001);s=act(s,'scoopPearls',14001);assert.equal(s.tea.pearls,1);assert.equal(s.badDish,true,'冒过烟那锅的珍珠是坏的');
 s=act(s,'clearWork',14002);assert.equal(s.tea.pearls,0);assert.equal(s.badDish,false,'杯子倒掉，坏料也没了');
 s=act(s,'clearPot',14002);assert.equal(s.pot.amount,0,'锅里剩下的那勺坏珍珠也倒掉');
 s=act(s,'addPearls',14003);s=act(s,'scoopPearls',18003);s=act(s,'shake',18004);s=act(s,'pourTea',18005);
 s=act(s,'takeDish',18006);assert.equal(s.pending.ruined,false,'新煮的一杯不该是黑暗料理');
});

test('奶茶：猫把没封口杯里的坏珍珠吃光，杯子不再算坏；封好的坏茶吃光珍珠还是坏',()=>{
 let s=pot(1);s=act(s,'tick',10000);s=act(s,'addPearls',10001);s=act(s,'scoopPearls',14001);assert.equal(s.badDish,true);
 const eaten=act(s,'eat',14002,{count:1});assert.equal(eaten.tea.pearls,0);assert.equal(eaten.badDish,false);
 let t=pot(2);t=act(t,'scoopPearls',4000);t=act(t,'shake',4001);t=act(t,'pourTea',4002);t=act(t,'spice',4003);assert.equal(t.badDish,true);
 t=act(t,'eat',4004,{count:1});assert.equal(t.tea.pearls,0);assert.equal(t.tea.sealed,true);assert.equal(t.badDish,true,'加过料的茶还在杯里');
});
