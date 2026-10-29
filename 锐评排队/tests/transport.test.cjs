'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const file = path.join(__dirname, '../src/transport.js');
const api = fs.existsSync(file) ? require(file) : {};
const gift = (extra = {}) => ({ type: 'gift', giftName: '小心心', count: 1, user: { id: 'a', nickname: '观众' }, ...extra });

test('transport exposes normalizer, receiver and connection', () => {
  for (const key of ['normalizeGift', 'createReceiver', 'connect']) assert.equal(typeof api[key], 'function');
});
test('normalization preserves long user IDs and nested nickname/avatar variants', () => {
  const x = api.normalizeGift({type:'WebcastGiftMessage', data:{gift:{name:'玫瑰', count:'3'}, user:{id:'98765432109876543210', displayName:'小明', avatar:{url_list:['https://example.com/a.png']}}}});
  assert.deepEqual(x, {name:'玫瑰',count:3,userId:'98765432109876543210',nickname:'小明',avatar:'https://example.com/a.png',eventId:null,comboId:null,cumulative:false});
  for (const key of ['id','userId','uid']) assert.equal(api.normalizeGift(gift({user:{[key]:'123',name:'名字'}})).userId,'123');
  for (const key of ['nickname','nickName','displayName','name']) assert.equal(api.normalizeGift(gift({user:{id:'a',[key]:'名字'}})).nickname,'名字');
  assert.equal(api.normalizeGift(gift({user:undefined,uid:'42',username:'顶层',avatarUrl:'https://example.com/u.png'})).nickname,'顶层');
  assert.equal(api.normalizeGift(gift({user:undefined})).nickname,'');
  assert.equal(api.normalizeGift(gift({user:{id:98765432109876543210}})).userId,'');
});
test('counts and protocol type are validated without coercing malformed values', () => {
  for (const count of [0,-1,0.5,1.2,'',null,true,{},[],Infinity,NaN,'3x','1e3']) {const x=api.normalizeGift(gift({count}));assert.equal(x?.count,0,String(count));assert.ok(x.quantityIssue);assert.equal(typeof x.rawCount,'string');assert.ok(x.rawCount.length<=100);}
  assert.equal(api.normalizeGift(gift({count:'3'})).count,3);
  assert.equal(api.normalizeGift(gift({count:10000000})).count,0);
  assert.equal(api.normalizeGift({giftName:'花'}),null);
  assert.equal(api.normalizeGift({giftName:'花'},true).count,1);
  assert.equal(api.normalizeGift(gift({type:'chat'})),null);
});
test('oversized and nonnumeric quantities are retained once and do not modify combo totals',()=>{const got=[];let r=api.createReceiver(x=>got.push(x));const combo={comboId:'c',isCumulative:true};r.receive(gift({...combo,eventId:'normal',count:1}));const before=r.exportState().comboTotals;assert.equal(r.receive(gift({...combo,eventId:'bad',count:12000})),true);assert.equal(r.receive(gift({...combo,eventId:'bad',count:12000})),false);assert.equal(got[1].rawCount,'12000');assert.equal(got[1].count,0);assert.deepEqual(r.exportState().comboTotals,before);r=api.createReceiver(x=>got.push(x),{savedState:r.exportState()});assert.equal(r.receive(gift({...combo,eventId:'bad',count:12000})),false);r.receive(gift({...combo,eventId:'next',count:3}));assert.equal(got[2].count,2);r.receive(gift({eventId:'text',count:'many'}));assert.equal(got[3].rawCount,'many');assert.ok(got[3].quantityIssue);});
test('quantity anomaly sharing an earlier cumulative event ID remains actionable',()=>{const got=[];const r=api.createReceiver(x=>got.push(x));r.receive(gift({eventId:'same',comboId:'c',isCumulative:true,count:1}));r.receive(gift({eventId:'same',comboId:'c',isCumulative:true,count:12000}));assert.equal(got.length,2);assert.ok(got[1].quantityIssue);assert.equal(r.receive(gift({eventId:'same',comboId:'c',isCumulative:true,count:12000})),false);});
test('a malformed resend of a processed noncumulative event cannot create a second pending gift',()=>{const got=[];const r=api.createReceiver(x=>got.push(x));assert.equal(r.receive(gift({eventId:'evt',count:2})),true);assert.equal(r.receive(gift({eventId:'evt',count:null})),false);assert.equal(got.length,1);assert.equal(got[0].count,2);});
test('avatar safety permits long raster URLs and rejects script/SVG schemes', () => {
  const long='https://example.com/'+ 'x'.repeat(800);
  assert.equal(api.normalizeGift(gift({user:{avatar:long}})).avatar,long);
  assert.equal(api.normalizeGift(gift({user:{avatar_thumb:{url_list:['https://example.com/t.webp']}}})).avatar,'https://example.com/t.webp');
  for(const avatar of ['javascript:alert(1)','file:///x.png','data:image/svg+xml;base64,PHN2Zz4=','data:image/bmp;base64,YQ==','data:image/avif;base64,YQ==','data:image/jpg;base64,YQ==','https://x/'+ 'x'.repeat(4096)]) assert.equal(api.normalizeGift(gift({user:{avatar}})).avatar,'');
  assert.equal(api.normalizeGift(gift({user:{avatar:'data:image/png;base64,YQ=='}})).avatar,'data:image/png;base64,YQ==');
});
test('event dedup preserves independent users and no-ID repeat gifts', () => {
  const got=[]; const r=api.createReceiver(x=>got.push(x));
  assert.equal(r.receive(gift({eventId:'e1'})),true);
  assert.equal(r.receive(gift({eventId:'e1'})),false);
  r.receive(gift({eventId:'e2',user:{id:'b',nickname:'观众'}}));
  r.receive(gift()); r.receive(gift());
  assert.equal(got.length,4);
  assert.equal(got[1].userId,'b');
});
test('explicit cumulative combos deliver 1 then 2 even with a shared event ID', () => {
  const got=[]; const r=api.createReceiver(x=>got.push(x.count));
  const combo={comboId:'c',isCumulative:true,eventId:'same'};
  assert.equal(r.receive(gift({...combo,count:1})),true);
  assert.equal(r.receive(gift({...combo,count:3})),true);
  assert.equal(r.receive(gift({...combo,count:3})),false);
  assert.equal(r.receive(gift({...combo,count:2,eventId:'older'})),false);
  assert.deepEqual(got,[1,2]);
});
test('combo namespace separates users and gift names and does not infer cumulative mode', () => {
  const got=[]; const r=api.createReceiver(x=>got.push(x.count));
  r.receive(gift({comboId:'c',count:1,isCumulative:true}));
  r.receive(gift({comboId:'c',count:3,isCumulative:true,user:{id:'b',nickname:'观众'}}));
  r.receive(gift({comboId:'c',count:4,isCumulative:true,giftName:'玫瑰'}));
  r.receive(gift({comboId:'ordinary',count:1}));
  r.receive(gift({comboId:'ordinary',count:3}));
  assert.deepEqual(got,[1,3,4,1,3]);
});
test('saved dedup expires, resumes cumulative growth, validates entries and stays bounded', () => {
  let time=1000; const got=[];
  let r=api.createReceiver(x=>got.push(x.count),{now:()=>time,ttl:100});
  r.receive(gift({eventId:'a'})); r.receive(gift({eventId:'b',comboId:'c',isCumulative:true,count:1}));
  r=api.createReceiver(x=>got.push(x.count),{now:()=>time,ttl:100,savedState:JSON.parse(JSON.stringify(r.exportState()))});
  assert.equal(r.receive(gift({eventId:'a'})),false);
  r.receive(gift({eventId:'b',comboId:'c',isCumulative:true,count:3}));
  assert.deepEqual(got,[1,1,2]);
  time=1101; assert.equal(r.receive(gift({eventId:'a'})),true);
  const bad={version:1,seenEvents:[null,{id:'a',time:Infinity},{id:'a',time:999999999}],comboTotals:[{id:'c',total:-1,time:time}]};
  assert.equal(api.createReceiver(()=>{},{now:()=>time,savedState:bad}).receive(gift({eventId:'a'})),true);
  for(let i=0;i<3000;i++)r.receive(gift({eventId:'e'+i,comboId:'c'+i,isCumulative:true}));
  assert.ok(r.exportState().seenEvents.length<=2048); assert.ok(r.exportState().comboTotals.length<=2048);
});

function environment() {
  let time=0; let serial=0; const tasks=new Map(); const sockets=[];
  const root={setTimeout(fn,delay){const id=++serial;tasks.set(id,{fn,at:time+delay,interval:0});return id;},clearTimeout(id){tasks.delete(id);},setInterval(fn,delay){const id=++serial;tasks.set(id,{fn,at:time+delay,interval:delay});return id;},clearInterval(id){tasks.delete(id);},WebSocket:class{constructor(url){this.url=url;this.readyState=0;sockets.push(this);}send(data){this.sent=data;}close(){this.readyState=3;this.onclose?.();}}};
  function advance(ms){const end=time+ms;for(let guard=0;guard<10000;guard++){let next=null;for(const [id,t]of tasks)if(t.at<=end&&(!next||t.at<next[1].at))next=[id,t];if(!next)break;const[id,t]=next;time=t.at;if(t.interval)t.at+=t.interval;else tasks.delete(id);t.fn();}time=end;}
  return {root,sockets,advance,tasks};
}
test('SDK is preferred and cleanup prevents further gifts', () => {
  const e=environment();const got=[];let callback;let unbound=false;
  e.root.SonglanPlugin={onGift(fn){callback=fn;return()=>{unbound=true;};}};
  const stop=api.connect({root:e.root,onGift:x=>got.push(x)});
  assert.equal(e.sockets.length,0);callback({giftName:'花',user:{id:'a'}});assert.equal(got.length,1);
  stop();callback({giftName:'花'});assert.equal(got.length,1);assert.equal(unbound,true);assert.equal(stop.receive(gift()),false);assert.equal(e.tasks.size,0);
});
test('late SDK takes over WS and stale socket callbacks cannot deliver or reconnect', () => {
  const e=environment();const got=[];const stop=api.connect({root:e.root,onGift:x=>got.push(x)});
  assert.equal(e.sockets[0].url,'ws://localhost:9910');const old=e.sockets[0];const staleMessage=old.onmessage;const staleClose=old.onclose;
  old.readyState=1;old.onopen();old.onmessage({data:JSON.stringify(gift({eventId:'one'}))});
  let callback;e.root.SonglanPlugin={onGift(fn){callback=fn;}};e.advance(500);
  staleMessage({data:JSON.stringify(gift({eventId:'two'}))});staleClose();callback(gift({eventId:'three'}));e.advance(5000);
  assert.deepEqual(got.map(x=>x.eventId),['one','three']);assert.equal(e.sockets.length,1);assert.equal(old.readyState,3);stop();
});
test('failed SDK registration uses WS, socket errors reconnect even without close callback', () => {
  const e=environment();const got=[];e.root.SonglanPlugin={onGift(){throw Error('not ready');}};
  const stop=api.connect({root:e.root,onGift:x=>got.push(x)});const old=e.sockets[0];const stale=old.onmessage;
  old.close=function(){this.readyState=3;};old.onerror();e.advance(3000);
  assert.equal(e.sockets.length,2);stale({data:JSON.stringify(gift({eventId:'stale'}))});e.sockets[1].onmessage({data:JSON.stringify(gift({eventId:'valid'}))});
  assert.deepEqual(got.map(x=>x.eventId),['valid']);stop();e.advance(10000);assert.equal(e.sockets.length,2);
});
test('browser script exposes ReviewTransport without CommonJS', () => {
  const context={};vm.runInNewContext(fs.readFileSync(file,'utf8'),context);assert.equal(typeof context.ReviewTransport.normalizeGift,'function');
});
