const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),app=fs.readFileSync(path.join(root,'src/app.js'),'utf8'),line=n=>app.split('\n').find(s=>s.startsWith('function '+n+'('));
const Core=require('../src/core.js');
test('bound gifts snapshot their specific tier ahead of old matching interaction rules',()=>{
 const state=Core.fresh(),tier={id:'heart',name:'红心盒',gift:'小心心',mode:'fixed',count:7,min:7,max:7,enabled:true},saved=[];
 const ctx={state,C:{receiveGift(s,g){saved.push(g);return'accepted';}},custom:{cfg:{avatarMode:false,theme:'cream'},boxTierForGift:name=>name==='小心心'?tier:null},effects:{ruleFor:()=>({kind:'add',value:99}),ruleValue:()=>99},prefs:{gift:'旧礼物'},PetBlindBox:{snapshot:r=>({...r})},saveGiftReceipt(){},drainGifts(){},toast(){},avatarFromGift:()=>({url:'',name:''})};
 vm.runInNewContext(line('giftEvent'),ctx);ctx.giftEvent({giftName:'小心心',count:2,eventId:'a'});assert.equal(saved[0].kind,'box');assert.equal(saved[0].box.id,'heart');assert.equal(saved[0].box.count,7);assert.equal(saved[0].count,2);tier.count=19;assert.equal(saved[0].box.count,7);
});
test('pet release starts at the box, bypasses roaming while flying, then lands inside the activity frame',()=>{
 const ctx={PetRoamGeometry:require('../src/roam-geometry.js'),reduced:()=>false,roamRect:()=>({left:900,right:1200,top:500,bottom:650})};vm.runInNewContext(line('confineCow'),ctx);
 const p={x:600,y:300,size:80,airborne:true,boxFlight:{}};ctx.confineCow(p);assert.equal(p.x,600);assert.equal(p.y,300);
});
test('new opening contains a persisted fall state instead of resolving on the old 850ms timer',()=>{
 const ctx={ready:true,state:Core.fresh(),C:{startBox(s){s.current={id:1,count:7,boxName:'盒子',phase:0,times:[0,200,850,1550,2500]};return s.current;}},PetBlindBox:{},custom:{cfg:{boxTiers:[]}},previewRound:null,chooseCast:()=>[0,1],setCast(){},roundStart:0,performance:{now:()=>100},save(){},showPhase(){},updateHUD(){},auto:false,queueBlocked:false,initBoxFlight(r){r.boxFall={x:600,y:-100,done:false};}};
 vm.runInNewContext(line('begin'),ctx);ctx.begin();assert(ctx.state.current.boxFall);assert.equal(ctx.state.current.boxFall.done,false);
});
test('freeing waiting capacity wakes the blocked front box without changing its gift tier',()=>{
 const Box=require('../src/blind-box.js'),state=Core.fresh();state.outside=100000;Core.enqueueBox(state,1,0,{id:'front',name:'前盒',gift:'心心',mode:'fixed',count:5,min:5,max:5,enabled:true},Box);assert.equal(Core.startBox(state,()=>0,[],null,Box),null);
 const context={queueBlocked:true,replenish(){},save(){},updateHUD(){}};const callback=app.match(/refresh:\(\)=>\{([^\n]+?)\},clearOutside/);assert(callback);vm.runInNewContext('globalThis.refresh=()=>{'+callback[1]+'};',context);assert.equal(Core.collectPending(state,10,1),10);context.refresh();assert.equal(context.queueBlocked,false);const r=Core.startBox(state,()=>0,[],null,Box);assert.equal(r.boxName,'前盒');assert.equal(r.count,5);assert.equal(state.queue,0);
});
