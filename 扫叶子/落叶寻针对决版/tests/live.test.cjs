const {test}=require('node:test'),assert=require('node:assert/strict');
const G=require('../src/gifts.js'),{createLive}=require('../src/live.js');
const E={EFFECT_BY_ID:{drift:{side:'troll'},tornado:{side:'troll'},sweep:{side:'help'}},TIER_SCORE:{small:1,medium:5,large:20}};
function setup(over={}){
  const calls=[],cfg={rules:[{gift:'玫瑰',effect:'drift',tier:'small',portions:2},{gift:'抖音',effect:'sweep',tier:'medium',portions:1},{gift:'珍爱玫瑰',effect:'tornado',tier:'large',portions:1}],likes:{enabled:true,step:1000,effect:'drift',tier:'small',portions:2},...over};
  const live=createLive({G,E,getConfig:()=>cfg,apply:(...a)=>{calls.push(a);return true;}});
  return{live,calls,cfg};
}

test('a gift matches its rule loosely and multiplies portions by the gift count',()=>{
  const {live,calls}=setup();
  assert.equal(live.receive({type:'gift',giftName:' 玫 瑰 ',count:3,nickname:'小枫',eventId:'e1'}),true);
  assert.deepEqual(calls[0].slice(0,3),['drift','small',6]);assert.equal(calls[0][3].name,'小枫');
  assert.equal(live.receive({type:'gift',giftName:'不认识',count:1,eventId:'e2'}),false);assert.equal(calls.length,1);
});
test('the same event id only counts once',()=>{
  const {live,calls}=setup(),m={type:'gift',giftName:'玫瑰',nickname:'a',eventId:'dup'};
  live.receive(m);live.receive(JSON.stringify(m));assert.equal(calls.length,1);
});
test('kings score tier weight times portions and keep the first to reach a tie',()=>{
  const {live}=setup();
  live.receive({type:'gift',giftName:'珍爱玫瑰',nickname:'A',eventId:'1'});            // 20
  live.receive({type:'gift',giftName:'玫瑰',count:10,nickname:'B',eventId:'2'});       // 1×20 = 20，同分不换
  live.receive({type:'gift',giftName:'抖音',nickname:'C',eventId:'3'});
  const k=live.kings();assert.deepEqual([k.troll.name,k.troll.score],['A',20]);assert.deepEqual([k.help.name,k.help.score],['C',5]);
  live.receive({type:'gift',giftName:'玫瑰',nickname:'B',eventId:'4'});assert.equal(live.kings().troll.name,'B');
  live.resetRound();assert.deepEqual(live.kings(),{troll:null,help:null});
});
test('likes fire once per full step, keep the remainder and never score',()=>{
  const {live,calls,cfg}=setup();
  live.receive({type:'like',count:600});assert.equal(calls.length,0);
  live.receive({type:'like',count:500});assert.deepEqual(calls[0].slice(0,3),['drift','small',2]);assert.equal(calls[0][3].like,true);
  assert.deepEqual(live.likeStatus(),{total:1100,carry:100});
  live.receive({type:'like',count:2900});assert.deepEqual(calls[1].slice(0,3),['drift','small',6]);
  cfg.likes.enabled=false;live.receive({type:'like',count:5000});assert.equal(calls.length,2);
  assert.deepEqual(live.kings(),{troll:null,help:null});
});
test('the SDK wins over WebSocket and the socket routes JSON messages',()=>{
  const sockets=[];class FakeWS{constructor(url){this.url=url;this.readyState=0;sockets.push(this);}close(){this.readyState=3;this.closed=true;}}
  const calls=[],host={},cfg={rules:[{gift:'玫瑰',effect:'drift',tier:'small',portions:1}],likes:{enabled:false,step:1000,effect:'drift',tier:'small',portions:1}};
  const live=createLive({G,E,host,WebSocketImpl:FakeWS,getConfig:()=>cfg,apply:(...a)=>{calls.push(a);return true;}});
  live.start();assert.equal(sockets.length,1);assert.equal(sockets[0].url,'ws://localhost:10030');
  sockets[0].readyState=1;sockets[0].onopen();assert.equal(live.connection().ws,'open');
  sockets[0].onmessage({data:JSON.stringify({type:'gift',giftName:'玫瑰',eventId:'w1'})});assert.equal(calls.length,1);
  let cb=null;host.SonglanPlugin={onGift:f=>{cb=f;}};
  live.connectWS();live.stop();
  const live2=createLive({G,E,host,WebSocketImpl:FakeWS,getConfig:()=>cfg,apply:(...a)=>{calls.push(a);return true;}});
  live2.start();assert.equal(sockets.length,1);assert.equal(live2.connection().sdk,true);
  cb({giftName:'玫瑰',eventId:'s1'});assert.equal(calls.length,2);live2.stop();
});
test('a missing local server backs off up to 30 s, a dropped connection retries in 3 s',()=>{
  const timers=[],realSet=global.setTimeout,realClear=global.clearTimeout;
  global.setTimeout=(fn,ms)=>{timers.push({fn,ms});return timers.length;};global.clearTimeout=()=>{};
  try{
    const sockets=[];class FakeWS{constructor(){this.readyState=0;sockets.push(this);}close(){}}
    const live=createLive({G,E,WebSocketImpl:FakeWS,getConfig:()=>({rules:[],likes:{enabled:false,step:1}}),apply:()=>true});
    live.connectWS();
    for(let k=0;k<4;k++){sockets.at(-1).onclose();timers.at(-1).fn();}
    const s=sockets.at(-1);s.onopen();s.onclose();
    assert.deepEqual(timers.map(t=>t.ms),[6000,12000,24000,30000,3000]);
    assert.equal(sockets.length,5);
  }finally{global.setTimeout=realSet;global.clearTimeout=realClear;}
});
