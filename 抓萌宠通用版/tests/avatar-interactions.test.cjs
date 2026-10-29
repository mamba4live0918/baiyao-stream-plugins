const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const app=fs.readFileSync(path.join(__dirname,'../src/app.js'),'utf8');
const interactions=fs.readFileSync(path.join(__dirname,'../src/interactions.js'),'utf8');

test('礼物增加萌宠和翻倍传递送礼者头像及备用动物',()=>{
 const a=app.indexOf('function drainGifts()'),b=app.indexOf('function avatarFromGift(',a);
 assert(a>=0&&b>a);
 const passed=[],registered=[];
 const ctx={ready:true,state:{pendingGifts:[{kind:'add',value:3,count:1,name:'加宠',avatarUrl:'https://example.com/a.png',nickName:'小莓'}]},custom:{cfg:{avatarMode:true},randomCow:()=>30},C:{registerAvatar(_s,...args){registered.push(args);return 1000000;}},effects:{trigger(...args){passed.push(args);}},save(){},toast(){},requestRound(){}};
 vm.runInNewContext(app.slice(a,b)+';globalThis.drainGifts=drainGifts;',ctx);
 ctx.drainGifts();
 assert.deepEqual(registered[0],['https://example.com/a.png','小莓',30]);
 assert.equal(passed[0][3].avatarKind,1000000);
 ctx.state.pendingGifts.push({kind:'double',value:1,count:1,name:'翻倍',avatarUrl:'https://example.com/b.png',nickName:'小雨'});
 ctx.drainGifts();
 assert.equal(passed[1][3].avatarKind,1000000);
 ctx.custom.cfg.avatarMode=false;
 ctx.state.pendingGifts.push({kind:'add',value:2,count:1,name:'加宠',avatarUrl:'https://example.com/c.png'});
 ctx.drainGifts();
 assert.equal(registered.length,2);
 assert.equal(passed[2][3].avatarKind,undefined);
});

test('礼物加宠和翻倍在场内生成头像，手动操作保持动物',()=>{
 const a=interactions.indexOf(' tagNewKind('),b=interactions.indexOf(' gift(name,count)',a);
 assert(a>=0&&b>a);
 const ctx={Date,Math};
 vm.runInNewContext('class X {'+interactions.slice(a,b)+'}; globalThis.X=X;',ctx);
 const s={outside:0,pendingKinds:[],avatarKinds:[{kind:1000000}]},seen=[];
 const fx=new ctx.X();
 Object.assign(fx,{kinds:{add:['', '',10000],double:['','',1]},limit(kind){return this.kinds[kind]?.[2]||0;},canRun:()=>true,getState:()=>s,model:()=>({}),core:{add(_s,n){s.outside+=n;return n;}},settle(){},getCows:()=>[],refresh(){seen.push([...s.pendingKinds]);},markArrivals(){},showCue(){},toast(){},renderStatus(){},updateGrip(){}});
 assert.equal(fx.trigger('add',2,1,{avatarKind:1000000}),2);
 assert.deepEqual(s.pendingKinds,[1000000,1000000]);
 assert.deepEqual(seen[0],[1000000,1000000]);
 assert.equal(fx.trigger('double',1,1,{avatarKind:1000000}),2);
 assert.deepEqual(s.pendingKinds,[1000000,1000000,1000000,1000000]);
 fx.trigger('add',1);
 assert.equal(s.pendingKinds.length,4);
});
