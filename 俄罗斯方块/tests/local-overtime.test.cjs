// 插件自带的加班机：自动分流（在白曜里或填了连接码 → 白曜加班机，不然 → 自带的）、礼物加减表、刷新接着走、暂停 / 重置。
const test=require('node:test'),assert=require('node:assert/strict');
const {createOvertimeLink}=require('../overtime.js');
const {createLocalOvertime,spokenDuration,clockText}=require('../local-overtime.js');
const STATE={remaining:'7200',remainingSeconds:7200,infinite:false};
function memoryStorage(){const m=new Map();return{m,getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v)};}
function fixture({env={},target,storage=memoryStorage(),clock={t:1_000_000},random}={}){
 const sockets=[];
 class Socket{constructor(url){this.url=url;this.readyState=0;this.sent=[];sockets.push(this);}send(t){if(this.readyState!==1)throw Error('closed');this.sent.push(JSON.parse(t));}open(){this.readyState=1;this.onopen?.({});}message(v){this.onmessage?.({data:JSON.stringify(v)});}close(){this.readyState=3;this.onclose?.({});}}
 if(target)storage.setItem('tetris-overtime-settings-v1',JSON.stringify({target}));
 const link=createOvertimeLink({plugin:'俄罗斯方块',settingsKey:'tetris-overtime-settings-v1',env,WebSocket:Socket,storage,now:()=>clock.t,random,setTimeout:()=>1,clearTimeout:()=>{}});
 return{link,sockets,storage,clock};
}
test('auto: outside 白曜 without a code, a loss goes straight onto the built-in clock',()=>{
 const f=fixture();f.link.connect();const s=f.sockets.at(-1);s.open();
 assert.equal(f.link.route(),'local');assert.equal(f.link.snapshot().statusText,'记到插件自带的加班机');
 const r=f.link.onLoss(f.link.beginRound());
 assert.deepEqual([r.seconds,r.status,r.route],[600,'sent','local']);
 assert.equal(s.sent.filter(m=>m.type==='add').length,0,'nothing goes to 白曜');
 const l=f.link.local.snapshot();assert.deepEqual([l.remainingSeconds,l.netSeconds,l.netText],[7800,600,'已加班 +10 分钟']);
 assert.deepEqual([f.link.snapshot().sentCount,f.link.snapshot().pendingCount],[1,0]);
});
test('auto: filling a code or running inside 白曜 switches to 白曜; target local stays on the built-in clock',async()=>{
 const f=fixture();f.link.connect();const s=f.sockets.at(-1);s.open();s.message({type:'hello',trusted:false,state:STATE});
 assert.equal(f.link.route(),'local');assert.equal(f.link.setKey('ABCD-2345'),true);assert.equal(f.link.route(),'baiyao');
 const calls=[];const env={BaiyaoPlugin:{overtime:{add:async(x,o)=>{calls.push(x);return x;},sub:async()=>'0',state:async()=>STATE}}};
 const g=fixture({env});g.link.connect();assert.equal(g.link.route(),'baiyao');g.link.onLoss(g.link.beginRound());await new Promise(r=>setImmediate(r));assert.deepEqual(calls,['600']);
 const h=fixture({env,target:'local'});h.link.connect();assert.equal(h.link.route(),'local');h.link.onLoss(h.link.beginRound());
 await new Promise(r=>setImmediate(r));assert.deepEqual(calls,['600'],'target local never calls 白曜');assert.equal(h.link.local.snapshot().netSeconds,600);
});
test('gift table: fixed and random minutes, several gifts at once, and only while on the built-in clock',()=>{
 const f=fixture({random:()=>0.999});
 assert.deepEqual(f.link.local.setGifts([{name:'玫瑰',mode:'add',min:5,max:5},{name:'小心心',mode:'sub',min:1,max:1},{name:'棒棒糖',mode:'add',min:1,max:3}]),{ok:true});
 assert.equal(f.link.onGift({name:'玫瑰',count:2}),600);
 assert.equal(f.link.onGift({name:'小心心',count:1}),-60);
 assert.equal(f.link.onGift({name:'棒 棒 糖',count:2}),360,'random picks within the range (max here); name match ignores spaces');
 assert.equal(f.link.onGift({name:'抖音',count:9}),0,'unlisted gifts do nothing');
 assert.equal(f.link.local.snapshot().netSeconds,900);
 assert.equal(f.link.local.setGifts([{name:'',mode:'add',min:1,max:1}]).ok,false,'a row needs a gift name');
 f.link.setTarget('baiyao');assert.equal(f.link.onGift({name:'玫瑰',count:1}),0,'on 白曜 the gift list lives in 白曜');
});
test('the clock keeps going across a refresh; pause keeps the remaining time; reset goes back to the preset',()=>{
 const storage=memoryStorage(),clock={t:5_000_000};
 const a=fixture({storage,clock});assert.equal(a.link.local.setPreset(90),true);assert.equal(a.link.local.snapshot().clockText,'1:30:00');
 assert.equal(a.link.local.autoStart(),true);clock.t+=600_000;assert.equal(a.link.local.snapshot().clockText,'1:20:00');
 const b=fixture({storage,clock});assert.equal(b.link.local.snapshot().running,true);clock.t+=60_000;assert.equal(b.link.local.snapshot().clockText,'1:19:00');
 b.link.local.pause();clock.t+=3_600_000;assert.equal(b.link.local.snapshot().clockText,'1:19:00','paused time does not run');
 assert.equal(b.link.local.autoStart(),false,'a manual pause is not undone by the game starting');
 b.link.local.shift(-2*3600,'手动');assert.deepEqual([b.link.local.snapshot().remainingSeconds,b.link.local.snapshot().finished],[0,true]);
 b.link.local.start();b.link.local.shift(300,'输了一局');assert.equal(b.link.local.snapshot().clockText,'5:00','time added after the end counts from now');
 b.link.local.reset();const r=b.link.local.snapshot();assert.deepEqual([r.clockText,r.running,r.netSeconds,r.fresh],['1:30:00',false,0,true]);
 assert.equal(b.link.local.setPreset(0),false);assert.equal(b.link.local.setPreset('100000'),false);
});
test('a broken or empty storage still gives a working clock with 120 minutes',()=>{
 const l=createLocalOvertime({storage:{getItem(){throw Error('denied');},setItem(){throw Error('denied');}},now:()=>0});
 assert.equal(l.snapshot().clockText,'2:00:00');l.shift(90,'x');assert.equal(l.snapshot().clockText,'2:01:30');
 assert.equal(spokenDuration(3900),'1 小时 5 分钟');assert.equal(spokenDuration(-30),'30 秒');assert.equal(clockText(59),'0:59');
});
