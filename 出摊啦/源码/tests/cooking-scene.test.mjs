import test from 'node:test';
import assert from 'node:assert/strict';
import {CookingScene} from '../src/cooking/scene.js';

const center=r=>({x:r.x+r.width/2,y:r.y+r.height/2});
function fixture(shop,u=1){
 const actor={key:'guest'};
 const scene=Object.assign(Object.create(CookingScene.prototype),{u,hover:null,getSettings:()=>({shop}),getKitchen:()=>({shop}),getCounter:()=>({x:0,y:870*u,width:1920*u,height:210*u}),
  invalidate(){},cancelDrag(){this.drag=null;this.hover=null;},notify(){},act:()=>true,findCustomer:()=>actor,onServe(){}});
 scene.regions=scene.computeLayout();return scene;
}
function serveAt(scene,p,start=center(scene.regions.dish)){
 scene.drag={kind:'serve',pointerId:9,start,p:start};scene.end({pointerId:9,clientX:p.x,clientY:p.y});
}
test('finished dishes reach a customer over any non-trash tool in every shop',()=>{
 for(const[shop,ids]of Object.entries({noodle:['source','pot','stove','strainer','dish','jar'],sushi:['source','knife','stock','board','block','dish','jar'],pancake:['source','griddle','egg','spatula','dish','jar'],tea:['pearls','pot','stove','shaker','cup','jar']}))for(const id of ids){
  const scene=fixture(shop),r=scene.regions[id],start=center(scene.regions.dish);let p=center(r),served=null;
  if(Math.hypot(p.x-start.x,p.y-start.y)<12*scene.u)p={x:r.x+r.width*.85,y:r.y+r.height*.1};
  scene.onServe=actor=>served=actor;serveAt(scene,p,start);assert.equal(served?.key,'guest',`${shop} ${id}`);
 }
});
test('trash wins over a customer at the same drop point in every shop',()=>{
 for(const shop of ['noodle','sushi','pancake','tea']){
  const scene=fixture(shop),actions=[];let served=0,lookups=0;
  scene.act=a=>actions.push(a);scene.onServe=()=>served++;scene.findCustomer=()=>{lookups++;return{key:'guest'};};
  const p=center(scene.regions.trash);serveAt(scene,p);scene.end({pointerId:9,clientX:p.x,clientY:p.y});
  assert.deepEqual(actions,[{type:'clearDish'}]);assert.equal(served,0);assert.equal(lookups,0);
 }
});
test('hover follows customer targeting over tools, while trash and short motion do not highlight',()=>{
 for(const shop of ['noodle','sushi','pancake','tea']){
  const scene=fixture(shop),start=center(scene.regions.dish),actor={key:shop};scene.findCustomer=()=>actor;
  scene.drag={kind:'serve',pointerId:9,start,p:start};scene.move({pointerId:9,clientX:start.x+11,clientY:start.y});assert.equal(scene.hover,null,shop);
  const r=scene.regions[shop==='sushi'?'block':shop==='pancake'?'griddle':shop==='tea'?'shaker':'pot'],p=center(r);
  scene.move({pointerId:9,clientX:p.x,clientY:p.y});assert.equal(scene.hover,actor,shop);
  const trash=center(scene.regions.trash);scene.move({pointerId:9,clientX:trash.x,clientY:trash.y});assert.equal(scene.hover,null,shop);
 }
});
test('short serving motions neither serve, discard nor notify, including a short move into trash',()=>{
 for(const u of [1,480/1080])for(const shop of ['noodle','sushi','pancake','tea'])for(const overTrash of [false,true]){
  const scene=fixture(shop,u),start=center(overTrash?scene.regions.trash:scene.regions.dish),calls=[];
  scene.onServe=()=>calls.push('serve');scene.act=()=>calls.push('discard');scene.notify=()=>calls.push('notice');scene.findCustomer=()=>{calls.push('lookup');return{key:'guest'};};
  serveAt(scene,{x:start.x+11.99*u,y:start.y},start);assert.deepEqual(calls,[],`${shop} u=${u} trash=${overTrash}`);
 }
});
test('a 12-unit serving motion counts, while an empty target uses the common finished-dish prompt',()=>{
 for(const shop of ['noodle','sushi','pancake','tea']){
  const scene=fixture(shop),start=center(scene.regions.dish),notices=[];let served=0;
  scene.onServe=()=>served++;serveAt(scene,{x:start.x+12,y:start.y},start);assert.equal(served,1,shop);
  scene.findCustomer=()=>null;scene.notify=text=>notices.push(text);serveAt(scene,{x:100,y:400});assert.deepEqual(notices,['把成品拖到顾客身上'],shop);
 }
});
test('operator sentences appear on counter hover and clear when the pointer leaves',()=>{
 const scene=fixture('noodle');let redraws=0;scene.invalidate=()=>redraws++;
 scene.pointerHints({clientX:700,clientY:840});assert.equal(scene.hintsVisible,true);assert.equal(redraws,1);
 scene.pointerHints({clientX:701,clientY:841});assert.equal(redraws,1,'moving inside does not continuously repaint');
 scene.pointerHints({clientX:700,clientY:400});assert.equal(scene.hintsVisible,false);assert.equal(redraws,2);
});
test('a short sleep clock correction preserves the receipt remaining timer',()=>{
 let clock=31000,dueCalls=0,painted=null,delay=null;
 const original=globalThis.setTimeout;globalThis.setTimeout=(fn,ms)=>{delay=ms;return 1;};
 try{
  const scene=Object.assign(Object.create(CookingScene.prototype),{frame:0,timer:null,paused:false,inTick:false,dirty:false,effects:[],renderCount:0,dpr:1,width:1,height:1,
   now:()=>clock,onTime:()=>{clock=1000;},getReceipt:()=>({dueAt:1600}),onDue:()=>dueCalls++,getKitchen:()=>null,
   g:{setTransform(){},clearRect(){},save(){},restore(){}},clipFace(){},paint(g,now){painted=now;}});
  scene.tick();assert.equal(dueCalls,0,'corrected game time has not reached receipt');assert.equal(painted,1000);assert.equal(delay,600,'receipt resumes its remaining 600ms');
 }finally{globalThis.setTimeout=original;}
});
