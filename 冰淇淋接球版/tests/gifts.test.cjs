const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const modulePath = path.join(__dirname, '../src/gifts.js');
const gifts = require(modulePath);

test('normalizes punctuation, full width letters, case and common traditional gift names', () => {
  assert.equal(gifts.normalizeName('  禮物 ＡＢＣ！🌸 '), '礼物abc');
  assert.equal(gifts.normalizeName(null), '');
});

test('accepts existing top-level, nested and numeric-type gift protocols', () => {
  const fixtures = [
    [{type:'gift', giftName:' 小心心 ', giftCount:3, eventId:'g1'}, {name:'小心心',count:3,eventId:'g1'}],
    [{msgType:2, data:{gift:{name:'甜甜圈',repeatCount:'4'},msgId:'g2'}}, {name:'甜甜圈',count:4,eventId:'g2'}],
    [{method:'WebcastGiftMessage', data:{giftName:'大啤酒',num:2}}, {name:'大啤酒',count:2,eventId:null}],
    [{type:'Gift', gift:{giftName:'棒棒糖',comboCount:2.9}}, {name:'棒棒糖',count:2,eventId:null}]
  ];
  for (const [input, expected] of fixtures) assert.deepEqual(gifts.normalizeGift(input), expected);
});

test('only trusted SDK callbacks may omit the event type', () => {
  const event = {name:'小心心',count:2};
  assert.equal(gifts.normalizeGift(event), null);
  assert.deepEqual(gifts.normalizeGift(event,true), {name:'小心心',count:2,eventId:null});
  assert.equal(gifts.normalizeGift({type:'chat',name:'小心心'}), null);
});

test('uses a nested gift name before an envelope name belonging to the sender', () => {
  assert.deepEqual(gifts.normalizeGift({
    type:'gift', name:'观众昵称', data:{gift:{name:'小心心',count:2}}
  }), {name:'小心心',count:2,eventId:null});
});

test('rejects malformed gift data and constrains exceptionally large finite counts', () => {
  for (const event of [null, [], 'gift', {type:'gift',name:{}}, {type:'gift',name:'  '},
    ...[0,-3,Infinity,NaN,'wat'].map(count=>({type:'gift',name:'小心心',count}))]) {
    assert.equal(gifts.normalizeGift(event),null);
  }
  assert.deepEqual(gifts.normalizeGift({type:'gift',name:'小心心'}), {name:'小心心',count:1,eventId:null});
  assert.equal(gifts.normalizeGift({type:'gift',name:'小心心',count:1e30}).count,10000);
});

test('deduplicates stable event IDs across aliases while preserving real identical gift bursts', () => {
  const seen = [];
  const receiver = gifts.createReceiver(g=>seen.push(g));
  assert.equal(receiver.receive({type:'gift',name:'小心心',eventId:'one'}),true);
  assert.equal(receiver.receive({giftName:'小心心',msgId:'one'},true),false);
  assert.equal(receiver.receive({type:'gift',name:'小心心',eventId:'two'}),true);
  assert.equal(receiver.receive({type:'gift',name:'小心心'}),true);
  assert.equal(receiver.receive({type:'gift',name:'小心心'}),true);
  assert.equal(receiver.receive({type:'chat',name:'小心心'}),false);
  assert.equal(seen.length,4);
});

test('dispatches every matching rule exactly once using value times gift count', () => {
  const applied = [];
  const gift = {name:' 小心心! ',count:3,eventId:null};
  const count = gifts.dispatch(gift,[
    {name:'小心心',action:'reverse',value:2},
    {name:'小心心',action:'melt',value:5,duration:4},
    {name:'其他',action:'blast',value:9}
  ],(...args)=>applied.push(args));
  assert.equal(count,2);
  assert.deepEqual(applied,[['reverse',6,gift,{}],['melt',5,gift,{duration:12}]]);
});

test('dispatch ignores unknown gifts, unsupported actions and non-positive or non-finite rules', () => {
  const applied = [];
  const rules = [
    {name:'小心心',action:'deleteEverything',value:1},
    {name:'小心心',action:'count_add',value:1},
    {name:'小心心',action:'count_sub',value:1},
    {name:'小心心',action:'freeze',value:Infinity},
    {name:'小心心',action:'freeze',value:NaN},
    {name:'小心心',action:'freeze',value:0},
    {name:'小心心',action:'freeze',value:-3}
  ];
  assert.equal(gifts.dispatch({name:'小心心',count:3},rules,(...args)=>applied.push(args)),0);
  assert.equal(gifts.dispatch({name:'未配置',count:3},gifts.DEFAULT_RULES,(...args)=>applied.push(args)),0);
  assert.equal(gifts.dispatch({name:'小心心',count:Infinity},[{name:'小心心',action:'freeze',value:1}],()=>assert.fail()),0);
  assert.deepEqual(applied,[]);
});

test('dispatch caps effects and defaults cover only the nine replacement actions',()=>{
 const applied=[];gifts.dispatch({name:'礼物',count:10000},[{name:'礼物',action:'blast',value:1e300}],(...args)=>applied.push(args));assert.equal(applied[0][1],1000);
 const actions=[];for(const rule of gifts.DEFAULT_RULES)gifts.dispatch({name:rule.name,count:1},[rule],action=>actions.push(action));
 assert.deepEqual(actions.sort(),['blast','freeze','gust_left','gust_right','ice','melt','plate_narrow','plate_wide','reverse']);
});

test('blast defaults use a radius of 100 and keep the unit marker with the value', () => {
  const rule = gifts.DEFAULT_RULES.find(rule => rule.action === 'blast');
  assert.equal(rule.value,100);
  assert.equal(rule.blastUnit,'radius');
  assert.deepEqual(gifts.upgradeBlastRules(gifts.DEFAULT_RULES),gifts.DEFAULT_RULES);
});

test('upgrades legacy blast layers once without changing rule names, custom fields or input', () => {
  const original = Object.freeze([
    Object.freeze({name:'自定义炸弹一',action:'blast',value:2,note:'保留自定义'}),
    Object.freeze({name:'自定义炸弹二',action:'blast',value:'3'}),
    Object.freeze({name:'自定义吃球',action:'freeze',value:2.6,custom:true})
  ]);
  const expected = [
    {name:'自定义炸弹一',action:'blast',value:100,note:'保留自定义',blastUnit:'radius'},
    {name:'自定义炸弹二',action:'blast',value:150,blastUnit:'radius'},
    {name:'自定义吃球',action:'freeze',value:2.6,custom:true}
  ];
  const upgraded = gifts.upgradeBlastRules(original);
  assert.deepEqual(upgraded,expected);
  assert.notEqual(upgraded,original);
  upgraded.forEach((rule,index)=>assert.notEqual(rule,original[index]));
  assert.equal(original[0].value,2);
  assert.equal(original[0].blastUnit,undefined);
  assert.deepEqual(gifts.upgradeBlastRules(upgraded),expected);
  assert.deepEqual(gifts.upgradeBlastRules(original),expected);
  assert.deepEqual(gifts.upgradeBlastRules(JSON.parse(JSON.stringify(upgraded))),expected);
});

test('clamps migrated and already marked blast radii, rounds down, and preserves zero as disabled', () => {
  const values = [
    {value:0,expected:0},
    {value:-2,expected:0},
    {value:1e300,expected:1000},
    {value:2.25,expected:112},
    {value:160.8,blastUnit:'radius',expected:160},
    {value:99999,blastUnit:'radius',expected:1000},
    {value:0,blastUnit:'radius',expected:0}
  ];
  for (const {expected,...parameters} of values) {
    const [rule] = gifts.upgradeBlastRules([{name:'炸弹',action:'blast',...parameters}]);
    assert.equal(rule.value,expected);
    assert.equal(rule.blastUnit,'radius');
    assert.deepEqual(gifts.upgradeBlastRules([rule]),[rule]);
  }
  const disabled = gifts.upgradeBlastRules([{name:'炸弹',action:'blast',value:0}]);
  assert.equal(gifts.dispatch({name:'炸弹',count:100},disabled,()=>assert.fail('disabled blast dispatched')),0);
});

test('leaves invalid entries and unsupported rule values available for caller validation', () => {
  const original = [null,42,'bad',[],
    {name:'坏规则',action:'blast',value:'n/a'},
    {name:'空值规则',action:'blast',value:''},
    {name:'缺值规则',action:'blast'},
    {name:'无穷规则',action:'blast',value:Infinity},
    {name:'空值',action:'blast',value:null},
    {name:'布尔值',action:'blast',value:true},
    {name:'未知动作',action:'custom',value:2}
  ];
  assert.deepEqual(gifts.upgradeBlastRules(original),original);
});

test('blast gift quantity multiplies the radius through the unchanged dispatch route', () => {
  const rules = gifts.upgradeBlastRules([{name:'自定义炸弹',action:'blast',value:2}]);
  const applied=[];
  gifts.dispatch({name:'自定义炸弹',count:3},rules,(action,value)=>applied.push([action,value]));
  assert.deepEqual(applied,[['blast',300]]);
});

test('gift quantity extends duration without silently increasing strength',()=>{
 const applied=[];const gift={name:'礼物',count:3};
 for(const [action,value,duration] of [['reverse',5],['freeze',3],['ice',10],['plate_narrow',25,8],['gust_left',2,5],['melt',5,10]]){
  gifts.dispatch(gift,[{name:'礼物',action,value,duration}],(action,value,gift,options)=>applied.push([action,value,options.duration]));
 }
 assert.deepEqual(applied,[['reverse',15,undefined],['freeze',9,undefined],['ice',30,undefined],['plate_narrow',25,24],['gust_left',2,15],['melt',5,30]]);
});

test('retiring the old menu preserves blast bindings and replaces obsolete actions once',()=>{
 const original=[{name:'我的炸弹',action:'blast',value:2},{name:'旧加速',action:'move_faster',value:20},{name:'旧吃球',action:'eat',value:3}];
 const result=gifts.upgradeTrickRules(original);assert.equal(result.find(r=>r.name==='我的炸弹').value,100);
 assert.ok(!result.some(r=>r.action==='move_faster'||r.action==='eat'));assert.equal(result.length,9);
 assert.deepEqual(gifts.upgradeTrickRules(result),result);assert.equal(original[0].value,2);
 assert.deepEqual(gifts.upgradeTrickRules([]),[],'an intentionally empty rule list remains empty');
});

// Replace only the external transport and clock; execute the real connection lifecycle.
function browserHarness(initialSdk) {
  let timerId = 0;
  const timers = new Map(), sockets = [];
  class Socket {
    constructor(url) { this.url=url; this.readyState=0; sockets.push(this); }
    open() { this.readyState=1; this.onopen?.(); }
    message(value) { this.onmessage?.({data:JSON.stringify(value)}); }
    close() { this.readyState=3; this.onclose?.(); }
  }
  const context = {
    WebSocket:Socket, SonglanPlugin:initialSdk,GelatoTricks:require('../src/tricks.js'),
    setTimeout(fn,ms){const id=++timerId;timers.set(id,{fn,ms,repeat:false});return id;},
    clearTimeout(id){timers.delete(id);},
    setInterval(fn,ms){const id=++timerId;timers.set(id,{fn,ms,repeat:true});return id;},
    clearInterval(id){timers.delete(id);}
  };
  vm.runInNewContext(fs.readFileSync(modulePath,'utf8'),context);
  return {context,sockets,timers,api:context.GelatoGifts,
    tick(ms) { for (const [id,t] of [...timers]) if(t.ms<=ms && timers.has(id)) {if(!t.repeat)timers.delete(id);t.fn();} }
  };
}

test('prefers the SDK, receives direct SDK payloads and stops callbacks on cleanup', () => {
  let callback, registrations=0, disposed=0;
  const harness = browserHarness({onGift(fn){registrations++;callback=fn;return ()=>disposed++;}});
  const received=[], statuses=[];
  const cleanup=harness.api.connect({onGift:g=>received.push(g),onStatus:s=>statuses.push(s)});
  assert.equal(harness.sockets.length,0);
  callback({giftName:'小心心',count:2});
  assert.equal(received.length,1);
  assert.equal(received[0].count,2);
  harness.tick(10000);
  assert.equal(registrations,1);
  cleanup();cleanup();callback({giftName:'小心心',count:2});
  assert.equal(received.length,1);
  assert.equal(disposed,1);
  assert.equal(harness.timers.size,0);
  assert.ok(statuses.some(status=>status.includes('菘蓝')));
});

test('falls back to local WebSocket and cancels a pending reconnect when the SDK arrives late', () => {
  const harness=browserHarness();
  const received=[];
  const cleanup=harness.api.connect({onGift:g=>received.push(g)});
  assert.equal(harness.sockets[0].url,'ws://localhost:10030');
  harness.sockets[0].open();
  harness.sockets[0].message({type:'gift',giftName:'小心心',eventId:'once'});
  harness.sockets[0].close();
  let callback,registrations=0;
  harness.context.SonglanPlugin={onGift(fn){callback=fn;registrations++;}};
  harness.tick(1000);
  callback({giftName:'小心心',eventId:'once'});
  callback({giftName:'小心心',eventId:'twice'});
  harness.tick(10000);
  assert.equal(harness.sockets.length,1);
  assert.equal(registrations,1);
  assert.equal(received.length,2);
  cleanup();
  assert.equal(harness.timers.size,0);
});

test('reconnects once after disconnection and shuts down an active socket when SDK takes over', () => {
  const harness=browserHarness();
  const received=[];
  const cleanup=harness.api.connect({onGift:g=>received.push(g)});
  harness.sockets[0].close();
  harness.tick(1000);
  assert.equal(harness.sockets.length,1);
  harness.tick(3000);
  assert.equal(harness.sockets.length,2);
  const oldSocket=harness.sockets[1];oldSocket.open();
  harness.context.SonglanPlugin={onGift(){}};
  harness.tick(1000);
  assert.equal(oldSocket.readyState,3);
  oldSocket.message({type:'gift',name:'小心心'});
  harness.tick(10000);
  assert.equal(harness.sockets.length,2);
  assert.equal(received.length,0);
  cleanup();
});

test('SDK timed gifts reach dispatch with quantity multiplication, stable-ID deduplication, and unknown gifts ignored', () => {
  let callback;
  const harness=browserHarness({onGift(fn){callback=fn;}}),applied=[];
  const cleanup=harness.api.connect({onGift:gift=>harness.api.dispatch(gift,harness.api.DEFAULT_RULES,
    (action,amount,gift,options)=>applied.push([action,amount,options.duration]))});
  const event={gift:{giftName:'小心心',repeatCount:'2'},event_id:'sdk-attempts'};
  callback(event);callback(event);
  callback({giftName:'没有配置的礼物',count:99,eventId:'sdk-unknown'});
  assert.deepEqual(applied,[['plate_wide',25,16]]);
  assert.equal(harness.sockets.length,0);
  cleanup();
});

test('WebSocket timed gifts use the sweep-plugin payload and remain deduplicated after a late SDK takeover', () => {
  const harness=browserHarness(),applied=[];
  const cleanup=harness.api.connect({onGift:gift=>harness.api.dispatch(gift,harness.api.DEFAULT_RULES,
    (action,amount,gift,options)=>applied.push([action,amount,options.duration]))});
  const socket=harness.sockets[0];socket.open();
  const event={msgType:2,data:{gift:{name:'抖音',comboCount:4},msgId:'ws-attempts'}};
  socket.message(event);socket.message(event);
  socket.message({type:'chat',name:'小心心',count:10});
  socket.message({type:'gift',giftName:'未配置礼物',giftCount:20,eventId:'ws-unknown'});
  let callback;
  harness.context.SonglanPlugin={onGift(fn){callback=fn;}};harness.tick(1000);
  callback({giftName:'抖音',count:4,eventId:'ws-attempts'});
  callback({giftName:'小心心',count:2,eventId:'sdk-after-ws'});
  assert.deepEqual(applied,[['plate_narrow',25,32],['plate_wide',25,16]]);
  assert.equal(socket.readyState,3);
  cleanup();
});
