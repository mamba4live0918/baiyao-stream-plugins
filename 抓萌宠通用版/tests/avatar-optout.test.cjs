const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../src/app.js'),'utf8');

test('关闭头像模式时礼物记录不保存观众头像地址',()=>{
 const a=source.indexOf('function giftEvent('),b=source.indexOf('function attachSDK(',a);assert(a>=0&&b>a);
 const accepted=[];const ctx={prefs:{gift:'旧礼物'},PetBlindBox:require('../src/blind-box.js'),custom:{cfg:{avatarMode:false},boxTierForGift:()=>({id:'heart',name:'心心盒',gift:'小心心',mode:'fixed',count:1,min:1,max:1,enabled:true})},effects:null,C:{receiveGift(_s,g){accepted.push(g);return'accepted';}},state:{},avatarFromGift:()=>({url:'https://example.com/person.png',name:'小莓'}),saveGiftReceipt(){},drainGifts(){},toast(){},Math,Date};
 vm.runInNewContext(source.slice(a,b)+';globalThis.send=giftEvent;',ctx);
 ctx.send({giftName:'小心心',count:1,eventId:'a'});
 assert.equal(accepted[0].avatarUrl,undefined);
 assert.equal(accepted[0].nickName,undefined);
 ctx.custom.cfg.avatarMode=true;
 ctx.send({giftName:'小心心',count:1,eventId:'b'});
 assert.equal(accepted[1].avatarUrl,'https://example.com/person.png');
 assert.equal(accepted[1].nickName,'小莓');
});
