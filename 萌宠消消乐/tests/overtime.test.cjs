// 积分不够就加班 → 白曜加班机：在白曜里直接加；不在白曜里填连接码才加；一期只加一次，刷新不补发上一页的。
const test=require('node:test'),assert=require('node:assert/strict');
const {createOvertimeLink}=require('../overtime.js');
const settle=async(n=5)=>{for(let i=0;i<n;i++)await new Promise(r=>setImmediate(r));};
const STATE={remaining:'7200',remainingSeconds:7200,infinite:false};
function fixture(options={}){
 const sockets=[],timers=new Map();let serial=0;
 class Socket{
  constructor(url){this.url=url;this.readyState=0;this.sent=[];sockets.push(this);}
  send(text){if(this.readyState!==1)throw Error('closed');this.sent.push(JSON.parse(text));}
  open(){this.readyState=1;this.onopen?.({});}
  message(value){this.onmessage?.({data:JSON.stringify(value)});}
  close(){if(this.readyState===3)return;this.readyState=3;this.onclose?.({});}
 }
 // 这些测试测的是「加班记到白曜加班机」这条路；自动 / 自带加班机在 local-overtime.test.cjs
 const memory=new Map(),saved=options.saved?JSON.parse(options.saved):{};if(!('target'in saved))saved.target=options.target||'baiyao';
 memory.set('match3-overtime-settings-v1',JSON.stringify(saved));
 const storage=options.storage||{getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v)};
 const link=createOvertimeLink({plugin:'萌宠消消乐',settingsKey:'match3-overtime-settings-v1',roundPrefix:'match3-charge',label:'积分不够',env:options.env||{},WebSocket:Socket,storage,
  setTimeout:(fn,ms)=>{const id=++serial;timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id)});
 // 当一回白曜：收到招呼按连接码回话；收到加减回「加上了」
 const answer=(s,key='ABCD-2345')=>{for(const m of s.sent.splice(0)){if(m.type==='hello')s.message({type:'hello',trusted:m.key===key,state:STATE});else if(m.type==='add')s.message({type:'result',id:m.id,change:m.seconds,state:STATE});}};
 return{link,sockets,timers,memory,answer};
}
test('inside 白曜 a loss adds the minutes straight away, exactly once',async()=>{
 const calls=[];const env={BaiyaoPlugin:{overtime:{add:async(s,o)=>{calls.push([s,o.label]);return s;},sub:async()=>'0',state:async()=>STATE}}};
 const f=fixture({env});f.link.connect();
 const round=f.link.beginRound(),result=f.link.onLoss(round);assert.equal(result.seconds,600);
 await settle();
 assert.deepEqual(calls,[['600','积分不够']]);
 const s=f.link.snapshot();assert.deepEqual([s.mode,s.sentCount,s.pendingCount,s.last.status,s.statusText,s.timerText],['baiyao',1,0,'sent','已接上白曜加班机','2:00:00']);
 assert.equal(f.link.onLoss(round).duplicate,true);assert.equal(f.link.onLoss('another-round').ignored,true);
 await settle();assert.equal(calls.length,1);assert.equal(f.sockets.length,0,'inside 白曜 it never opens a socket');f.link.stop();
});
test('outside 白曜 a loss waits for the code, then is added once',()=>{
 const f=fixture();f.link.connect();const s=f.sockets.at(-1);assert.equal(s.url,'ws://127.0.0.1:47833/overtime');s.open();
 assert.deepEqual(s.sent,[{type:'hello',plugin:'萌宠消消乐',key:''}]);f.answer(s);
 assert.equal(f.link.snapshot().statusText,'连上白曜了，填上连接码才能加时间');assert.equal(f.link.snapshot().timerText,'2:00:00');
 const result=f.link.onLoss(f.link.beginRound());assert.equal(result.status,'pending');assert.deepEqual(s.sent,[],'no add without the code');
 assert.equal(f.link.setKey('abcd2345'),true);assert.deepEqual(s.sent[0],{type:'hello',plugin:'萌宠消消乐',key:'ABCD-2345'});
 f.answer(s);assert.deepEqual(s.sent,[{type:'add',id:result.roundId,seconds:'600',label:'积分不够',user:''}]);
 f.answer(s);const snap=f.link.snapshot();assert.deepEqual([snap.sentCount,snap.pendingCount,snap.last.status,snap.statusText],[1,0,'sent','已连上白曜加班机']);
 assert.equal(f.link.onLoss(result.roundId).duplicate,true);f.link.stop();
});
test('test connection only says hello and never adds, even with a loss waiting',async()=>{
 const f=fixture();f.link.onLoss(f.link.beginRound());
 const pending=f.link.testConnection();const s=f.sockets.at(-1);s.open();
 assert.deepEqual(s.sent,[{type:'hello',plugin:'萌宠消消乐',key:''}]);s.message({type:'hello',trusted:false,state:STATE});
 const result=await pending;assert.deepEqual([result.ok,result.trusted,result.error],[true,false,'还没填连接码']);
 assert.equal(s.sent.length,1);assert.equal(f.link.snapshot().pendingCount,1);assert.equal(f.link.snapshot().sentCount,0);
});
test('testing a typed code neither saves it nor lets a waiting loss out; only 连接 does',async()=>{
 const f=fixture();f.link.connect();const live=f.sockets.at(-1);live.open();f.answer(live);
 const loss=f.link.onLoss(f.link.beginRound());assert.equal(loss.status,'pending');
 const pending=f.link.testConnection('abcd2345');const probe=f.sockets.at(-1);assert.notEqual(probe,live,'the test uses its own socket');probe.open();
 assert.deepEqual(probe.sent,[{type:'hello',plugin:'萌宠消消乐',key:'ABCD-2345'}]);probe.message({type:'hello',trusted:true,state:STATE});
 const result=await pending;assert.deepEqual([result.ok,result.trusted],[true,true]);
 assert.deepEqual(live.sent,[],'nothing was sent on the real connection');assert.equal(f.link.snapshot().key,'');assert.equal(f.link.snapshot().pendingCount,1);
 assert.equal(f.link.setKey('abcd2345'),true);f.answer(live);assert.equal(live.sent.filter(m=>m.type==='add').length,1);f.link.stop();
});
test('minutes are checked, a switched-off link adds nothing, and broken storage is fine',()=>{
 const f=fixture({storage:{getItem(){throw Error('denied');},setItem(){throw Error('denied');}}});assert.equal(f.link.snapshot().minutes,10);
 assert.equal(f.link.setMinutes(0),false);assert.equal(f.link.setMinutes(NaN),false);assert.equal(f.link.setMinutes('181'),false);assert.equal(f.link.setMinutes(3),true);
 assert.equal(f.link.setKey('不是连接码'),false);
 f.link.setEnabled(true);const s=f.sockets.at(-1);s.open();assert.equal(f.link.setKey('ABCD-2345'),true);f.answer(s);f.answer(s);
 f.link.onLoss(f.link.beginRound());assert.equal(s.sent.at(-1).seconds,'180');
 f.link.setEnabled(false);assert.equal(f.link.onLoss(f.link.beginRound()).status,'disabled');assert.equal(f.link.snapshot().totalCount,1);
});
test('refresh keeps the settings (and the old 咩播 port for rollback) but never replays a loss',()=>{
 const f=fixture({saved:JSON.stringify({minutes:7,port:7896,enabled:true})});assert.equal(f.link.snapshot().minutes,7);assert.equal(f.link.snapshot().pendingCount,0);
 assert.equal(f.link.setMinutes(8),true);assert.deepEqual(JSON.parse(f.memory.get('match3-overtime-settings-v1')),{minutes:8,port:7896,enabled:true,target:'baiyao'});
 f.link.onLoss(f.link.beginRound());
 const g=fixture({saved:f.memory.get('match3-overtime-settings-v1')});g.link.connect();const s=g.sockets.at(-1);s.open();g.answer(s,'');
 assert.equal(s.sent.length,0);assert.equal(g.link.snapshot().totalCount,0);g.link.stop();
});
test('every loss while offline is sent once connected, none merged, lost or doubled',()=>{
 const f=fixture();for(let i=0;i<120;i++)f.link.onLoss(f.link.beginRound());assert.equal(f.link.snapshot().pendingCount,120);
 f.link.setKey('ABCD-2345');f.link.connect();const s=f.sockets.at(-1);s.open();f.answer(s);
 const adds=s.sent.filter(m=>m.type==='add');assert.equal(adds.length,120);assert.equal(new Set(adds.map(m=>m.id)).size,120);
 f.answer(s);assert.deepEqual([f.link.snapshot().sentCount,f.link.snapshot().sentSeconds,f.link.snapshot().pendingCount],[120,72000,0]);f.link.stop();
});
test('a connection that drops before 白曜 answers never makes 白曜 add that loss twice',()=>{
 const f=fixture();f.link.setKey('ABCD-2345');f.link.connect();let s=f.sockets.at(-1);s.open();f.answer(s);
 f.link.onLoss(f.link.beginRound());assert.equal(s.sent.filter(m=>m.type==='add').length,1);s.close();
 assert.equal(f.link.snapshot().pendingCount,0,'unclear ones count as sent');
 const retry=[...f.timers.values()].at(-1);retry.fn();s=f.sockets.at(-1);s.open();f.answer(s);
 assert.equal(s.sent.filter(m=>m.type==='add').length,0);f.link.stop();
});
