const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../src/app.js'),'utf8');

test('菘蓝模拟与真实礼物的头像字段都归一化，非法地址不用',()=>{
 const a=source.indexOf('function avatarFromGift('),b=source.indexOf('function giftEvent(',a);
 assert(a>=0&&b>a,'需要独立的观众头像字段适配入口');
 const ctx={C:{safeAvatarUrl:value=>/^https:\/\//.test(value||'')?value:''}};
 vm.runInNewContext(source.slice(a,b)+';globalThis.pick=avatarFromGift;',ctx);
 const sdk=ctx.pick({nickName:'小莓',avatarUrl:'https://example.com/a.png',giftName:'小心心'});
 const ws=ctx.pick({type:'gift',nickName:'小蓝',avatar:'https://example.com/b.png',giftName:'小心心'});
 assert.equal(sdk.url,'https://example.com/a.png');assert.equal(sdk.name,'小莓');
 assert.equal(ws.url,'https://example.com/b.png');assert.equal(ws.name,'小蓝');
 const nested=ctx.pick({type:'gift',data:{gift:{giftName:'小心心'},user:{nickName:'小花',avatarUrl:'https://example.com/c.png'}}});
 assert.equal(nested.url,'https://example.com/c.png');assert.equal(nested.name,'小花');
 assert.equal(ctx.pick({nickName:'坏链接',avatar:'javascript:alert(1)'}).url,'');
});
