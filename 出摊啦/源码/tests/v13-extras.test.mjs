import test from 'node:test';
import assert from 'node:assert/strict';
import {sanitizeExtras,loadExtras,saveExtras,KEY_EXTRAS,defaultExtras} from '../src/extras.js';
import {routeGift} from '../src/rules.js';

// V1.5 起加减时间交给白曜加班机：V1.3/V1.4 的加班礼物表和本场减班不再用，但存档照样清理、照样留着，退回旧版还在
test('旧的加班礼物表照样清理着存：名字、分钟范围和屏幕名字；同名只留第一条',()=>{
 const x=sanitizeExtras({overtimeGifts:[
  {name:' 咖啡 ',mode:'sub',min:5,max:2,label:'喝咖啡'},
  {name:'咖啡',min:1},{name:'',min:1},
  {name:'能量',mode:'x',min:-3,label:'盲盒大放送'},
  {name:'电话',label:'加V13800138000'}
 ]});
 assert.equal(x.overtimeGifts.length,3);
 assert.deepEqual(x.overtimeGifts[0],{name:'咖啡',mode:'sub',min:2,max:5,label:'喝咖啡'});
 assert.deepEqual(x.overtimeGifts[1],{name:'能量',mode:'add',min:1,max:1,label:''},'坏的分钟回到 1；名字里有「盲盒」不收');
 assert.equal(x.overtimeGifts[2].label,'','联系方式不收');
});

test('交租牌位置和大小：比例在 0～1，大小在 0.4～3 倍，坏值回默认',()=>{
 assert.deepEqual(sanitizeExtras({panel:{x:1.5,y:-1,scale:9}}).panel,{x:1,y:0,scale:3});
 assert.deepEqual(sanitizeExtras({panel:{x:'a',scale:0}}).panel,{x:null,y:null,scale:.4});
 assert.deepEqual(sanitizeExtras(null).panel,{x:null,y:null,scale:1});
});

test('旧的本场减班原样留在存档里（V1.5 不再用）',()=>{
 assert.deepEqual(sanitizeExtras({reduction:{sessionId:'s1',seconds:90.2}}).reduction,{sessionId:'s1',seconds:91});
 assert.deepEqual(sanitizeExtras({reduction:{seconds:-5}}).reduction,{sessionId:null,seconds:0});
});

test('新设置单独存一个键（旧版存设置不会冲掉），读坏了用默认值',()=>{
 const store=new Map(),storage={getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,v)};
 assert.equal(KEY_EXTRAS,'chutan.v1_3.extras');
 assert.ok(saveExtras(storage,{panel:{x:.5,y:.5,scale:1.5},overtimeGifts:[{name:'咖啡',min:1,max:2}]}));
 const back=loadExtras(storage).extras;assert.equal(back.panel.scale,1.5);assert.equal(back.overtimeGifts[0].name,'咖啡');
 store.set(KEY_EXTRAS,'{bad');assert.equal(loadExtras(storage).readable,false);assert.deepEqual(loadExtras(storage).extras,defaultExtras());
});

test('V1.5 礼物不再走加班礼物表：只按点单、捣乱、帮忙三张表算，加减时间在白曜加班机里设',()=>{
 const settings={rules:{pool:['fire'],mess:[{name:'咖啡',min:1,max:1}],help:[],order:[]},
  overtimeGifts:[{name:'咖啡',mode:'add',min:1,max:2,label:'喝咖啡加班'},{name:'奶茶',mode:'sub',min:3,max:3,label:''}]};
 const gift=(name,count=1)=>({kind:'gift',nick:'小明',uid:'u1',id:'e'+name+count,gift:{name,count}});
 assert.deepEqual(routeGift(settings,gift('咖啡'),()=>0).map(spec=>spec.kind),['fire']);
 assert.equal(routeGift(settings,gift('奶茶',2),()=>0),null,'只在旧加班礼物表里的礼物不再改时间');
 assert.equal(routeGift(settings,gift('啤酒')),null,'表里没有的礼物不触发');
});
