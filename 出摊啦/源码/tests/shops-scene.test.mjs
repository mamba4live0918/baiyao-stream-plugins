import test from 'node:test';
import assert from 'node:assert/strict';
import {CookingScene} from '../src/cooking/scene.js';
import shopMeta from '../assets/shops-meta.mjs';
import {layoutCrowd,rectIntersectsZone} from '../src/crowd/layout.js';
import {defaultZone} from '../src/zone.js';
import {createGesture} from '../src/cooking/gestures.js';
const contains=(p,r)=>p.x>=r.x&&p.x<=r.x+r.width&&p.y>=r.y&&p.y<=r.y+r.height;
const center=r=>({x:r.x+r.width/2,y:r.y+r.height/2});
function fixture(shop,w=1920,h=1080){
 let kitchen={shop,pending:null,pot:{amount:0,status:'empty',startedAt:null},bowl:0,plate:[],slices:[],pancake:{loaded:false,spread:false,eggs:0,hadEgg:false,bag:null},tea:{pearls:0,hadPearls:false,shaken:false,sealed:false}};
 const actions=[];const u=Math.min(w,h)/1080,cw=Math.min(w,Math.min(w,h)*2.2);
 const scene=Object.assign(Object.create(CookingScene.prototype),{u,width:w,height:h,effects:[],drag:null,getSettings:()=>({shop}),getKitchen:()=>kitchen,getCounter:()=>({x:(w-cw)/2,y:h-210*u,width:cw,height:210*u}),now:()=>1000,
  act:a=>{actions.push(a);return true;},invalidate(){},notify(){},cancelDrag(){this.drag=null;},findCustomer:()=>({key:'customer'}),onServe:()=>actions.push({type:'serve'})});
 scene.regions=scene.computeLayout();return{scene,actions,get kitchen(){return kitchen;},set kitchen(v){kitchen=v;}};
}
test('new shop geometry stays within all five viewports and tea heat source is independent',()=>{
 for(const[w,h]of [[1920,1080],[1080,1920],[2560,1080],[720,1280],[480,854]])for(const shop of ['pancake','tea']){
  const f=fixture(shop,w,h),r=f.scene.regions;
  for(const id of shop==='pancake'?['source','egg','griddle','spatula','dish']:['pearls','pot','shaker','cup']){const b=r[id];assert.ok(b,id);assert.ok(b.x>=0&&b.y>=0&&b.x+b.width<=w+.01&&b.y+b.height<=h+.01,id);assert.equal(rectIntersectsZone(b,defaultZone(w/h),w,h),false,`${id} leaves the face clear`);}
  if(shop==='pancake'){assert.deepEqual(r.pot,r.griddle);const m=shopMeta.griddle.anchor,cooking={x:r.griddle.x+m.x/shopMeta.griddle.sourceSize.width*r.griddle.width,y:r.griddle.y+m.y/shopMeta.griddle.sourceSize.height*r.griddle.height};assert.equal(contains(cooking,r.spatula),false,'spatula hitbox leaves the cooking center free');}
  else{assert.ok(r.pot.x+r.pot.width<r.shaker.x);assert.ok(r.shaker.x+r.shaker.width<r.cup.x);assert.deepEqual(r.cup,r.dish);}
 }
});
test('one customer retains a visible head-sized serving target in every shop and viewport',()=>{
 for(const[w,h]of [[1920,1080],[1080,1920],[2560,1080],[720,1280],[480,854]])for(const shop of ['noodle','sushi','pancake','tea']){
  const {scene,actions}=fixture(shop,w,h),zone=defaultZone(w/h),actor=layoutCrowd({width:w,height:h,zone,count:1,counterTop:scene.regions.counter.y}).slots[0];
  assert.ok(actor,`${shop} ${w}x${h} has a customer`);
  const radius=6*scene.u,targets=[];
  for(const xf of [.2,.35,.5,.65,.8])for(const yf of [.1,.2,.3,.4,.5]){
   const p={x:actor.x+actor.width*xf,y:actor.y+actor.height*yf};
   const square={x:p.x-radius,y:p.y-radius,width:radius*2,height:radius*2};
   if(p.y+radius<scene.regions.counter.y&&!rectIntersectsZone(square,zone,w,h))targets.push(p);
  }
  assert.ok(targets.length>0,`${shop} ${w}x${h}: a visible 12-unit head patch must remain available`);
  const p=targets[0];scene.findCustomer=(x,y)=>contains({x,y},actor)?actor:null;scene.drag={kind:'serve',pointerId:3,start:center(scene.regions.dish)};
  scene.end({pointerId:3,clientX:p.x,clientY:p.y});assert.deepEqual(actions,[{type:'serve'}],`${shop} ${w}x${h}: visible customer accepts the dish`);
 }
});
test('a zero-egg bag and sealed zero-pearl tea are real dishes, an unsealed cup is not',()=>{
 const a=fixture('pancake');a.kitchen.pancake.bag={eggs:0};assert.equal(a.scene.dishCount(),0);assert.equal(a.scene.hasDish(),true);
 const b=fixture('tea');b.kitchen.tea.sealed=true;assert.equal(b.scene.dishCount(),0);assert.equal(b.scene.hasDish(),true);b.kitchen.tea.sealed=false;b.kitchen.tea.pearls=2;assert.equal(b.scene.hasDish(),false);
});
test('smoking pancake click discards the work instead of starting another circle',()=>{
 const f=fixture('pancake');f.kitchen.pancake.loaded=true;f.kitchen.pot.status='smoking';f.scene.start('griddle',{button:0});assert.deepEqual(f.actions,[{type:'clearWork'}]);assert.equal(f.scene.drag,null);
});
test('spatula accepts griddle or bag, but releasing elsewhere cannot lift the pancake',()=>{
 for(const id of ['griddle','dish','outside']){const f=fixture('pancake'),p=id==='outside'?{x:100,y:500}:center(f.scene.regions[id]);f.scene.drag={kind:'lift',pointerId:1};f.scene.end({pointerId:1,clientX:p.x,clientY:p.y});assert.deepEqual(f.actions,id==='outside'?[]:[{type:'liftPancake'}]);}
});
test('shaken tea only pours into the cup and a repeated pointerup cannot submit twice',()=>{
 const f=fixture('tea'),p=center(f.scene.regions.dish);f.kitchen.tea.shaken=true;f.scene.drag={kind:'pour',pointerId:2};const e={pointerId:2,clientX:p.x,clientY:p.y};f.scene.end(e);f.scene.end(e);assert.deepEqual(f.actions,[{type:'pourTea'}]);
});
test('rough circles and horizontal shakes submit once on release; clicks and wrong paths do not',()=>{
 for(const kind of ['spread','shake'])for(const valid of [false,true]){
  const f=fixture(kind==='spread'?'pancake':'tea'),p=center(f.scene.regions[kind==='spread'?'griddle':'shaker']);
  f.scene.drag={kind,pointerId:8,start:p,p,gesture:createGesture(kind,p,{unit:f.scene.u,center:p})};
  const offsets=valid?(kind==='spread'?[[50,0],[50,50],[0,50]]:[[70,5],[-70,-4],[40,9]]):[[0,1],[0,60]];
  for(const[x,y]of offsets)f.scene.move({pointerId:8,clientX:p.x+x,clientY:p.y+y});
  assert.deepEqual(f.actions,[],'moves never submit');
  const last=f.scene.drag.p,e={pointerId:8,clientX:last.x,clientY:last.y};f.scene.end(e);f.scene.end(e);
  assert.deepEqual(f.actions,valid?[{type:kind}]:[],`${kind} valid=${valid}`);
 }
});
test('zero-quantity finished dishes start serving and cancel/reset never submit them',()=>{
 const original=globalThis.document;globalThis.document={documentElement:{dataset:{}}};
 try{
  for(const shop of ['pancake','tea']){
   const f=fixture(shop),p=center(f.scene.regions.dish);
   if(shop==='pancake')f.kitchen.pancake.bag={eggs:0};else f.kitchen.tea.sealed=true;
   const event={button:0,pointerId:4,clientX:p.x,clientY:p.y,preventDefault(){},currentTarget:{setPointerCapture(){}}};
   f.scene.start('dish',event);assert.equal(f.scene.drag.kind,'serve');
   CookingScene.prototype.cancelDrag.call(f.scene);f.scene.end({...event});assert.deepEqual(f.actions,[]);
   f.scene.start('dish',event);f.scene.sync=()=>{};f.scene.reset();f.scene.end({...event});assert.deepEqual(f.actions,[]);
  }
 }finally{globalThis.document=original;}
});
test('resting spatula stays on the counter and leaves the bag and griddle center free in five sizes',()=>{
 for(const[w,h]of [[1920,1080],[1080,1920],[2560,1080],[720,1280],[480,854]]){
  const {scene}=fixture('pancake',w,h),r=scene.regions,zone=defaultZone(w/h),m=shopMeta.griddle;
  const cooking={x:r.griddle.x+m.anchor.x/m.sourceSize.width*r.griddle.width,y:r.griddle.y+m.anchor.y/m.sourceSize.height*r.griddle.height};
  assert.ok(r.spatula.y>=r.counter.y,`${w}x${h}: spatula rests below counter top`);
  assert.equal(contains(cooking,r.spatula),false);assert.equal(contains(center(r.dish),r.spatula),false);
  assert.ok(r.spatula.x+r.spatula.width<r.dish.x,`${w}x${h}: no bag hitbox overlap`);
  assert.equal(rectIntersectsZone(r.spatula,zone,w,h),false,`${w}x${h}: face remains clear`);
 }
});
test('material layer registration uses declared reference rectangles',()=>{
 const {scene}=fixture('tea'),r=scene.regions.cup,drawn=[];scene.image=(g,id,b)=>drawn.push({id,...b});scene.layer({},'cup_tea',r,'cup_back');
 const a=shopMeta.cup_tea.layerRect,base=shopMeta.cup_back.sourceSize;
 assert.deepEqual(drawn[0],{id:'cup_tea',x:r.x+a.x/base.width*r.width,y:r.y+a.y/base.height*r.height,width:a.width/base.width*r.width,height:a.height/base.height*r.height});
});
test('cup layers preserve back, tea, pearl, front, lid order and use inner clipping',()=>{
 const {scene}=fixture('tea'),drawn=[];let clips=0;
 scene.image=(g,id)=>drawn.push(id);
 const g={save(){},restore(){},beginPath(){},moveTo(){},lineTo(){},closePath(){},rect(){},clip(){clips++;}};
 scene.drawCup(g,scene.regions.cup,{pearls:2,sealed:true});
 assert.deepEqual(drawn,['cup_back','cup_tea','cup_pearls_2','cup_front','cup_lid']);assert.equal(clips,2);
});
test('compacted griddle keeps batter registered and its heat ring finite',()=>{
 const {scene,kitchen}=fixture('pancake',1080,1920),drawn=[],ellipses=[];
 kitchen.pancake={loaded:true,spread:true,eggs:2,hadEgg:true,bag:null};kitchen.pot={status:'raw',startedAt:0};kitchen.options={cookMs:4000};
 scene.image=(g,id,r)=>drawn.push({id,...r});scene.label=()=>{};
 const g={beginPath(){},ellipse(...args){ellipses.push(args);},stroke(){}};
 scene.paintPancake(g,kitchen,scene.regions,1000);
 assert.ok(ellipses.flat().every(Number.isFinite));
 const batter=drawn.find(r=>r.id==='batter_disk_3'),griddle=scene.regions.griddle,a=shopMeta.batter_disk_3.layerRect;
 assert.equal(batter.height,griddle.height);assert.equal(batter.y,griddle.y+a.y/440*griddle.height);
});
