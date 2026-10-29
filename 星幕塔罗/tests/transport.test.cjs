const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
test('gift transport exists',()=>assert.ok(fs.existsSync(path.join(__dirname,'../src/transport.js')),'缺少礼物排队通道'));
if(fs.existsSync(path.join(__dirname,'../src/transport.js'))){const T=require('../src/transport.js');
test('SDK preserves viewer identity separately from gift name',()=>{const x=T.normalizeGift({giftName:'小心心',count:3,user:{id:'u12',nickName:'小鹿'},eventId:'evt'},true);assert.equal(x.name,'小鹿');assert.equal(x.gift,'小心心');assert.equal(x.uid,'u12');assert.equal(x.count,3);});
test('nested WS, reject non gift and nameless events',()=>{assert.equal(T.normalizeGift({type:'chat',name:'消息'}),null);assert.equal(T.normalizeGift({type:'gift',giftName:'小心心'}),null);const x=T.normalizeGift({type:2,data:{gift:{name:'小心心',count:2},user:{nickname:'晚风',userId:123},eventId:'x'}});assert.equal(x.name,'晚风');assert.equal(x.uid,'123');assert.equal(x.eid,'x');});
test('event dedup persists for 10 minutes and normalizes gift names',()=>{let clock=0;const seen=T.makeDeduper(()=>clock);const x={eid:'1',uid:'u',name:'小鹿',gift:'小心心',count:1};assert.equal(seen(x),false);assert.equal(seen(x),true);clock=600001;assert.equal(seen(x),false);assert.equal(T.key(' 小 心 心！'),'小心心');});
}
