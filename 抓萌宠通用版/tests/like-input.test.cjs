const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Core=require('../src/core.js');
const modulePath=path.join(__dirname,'../src/like-input.js');
const Likes=fs.existsSync(modulePath)?require(modulePath):{};
const NOW=1800000000000;
const packet=(extra={})=>({type:'like',count:'23',countMode:'delta',source:'songlan',...extra});
const receive=(s,p,o={})=>Likes.receive(s,p,{now:NOW,...o});

test('host delta count adds all 23 likes rather than fabricating one',()=>{
 assert.equal(typeof Likes.receive,'function');
 const s=Core.fresh();
 const r=receive(s,packet());
 assert.equal(r.accepted,true);assert.equal(r.increment,23);
 assert.deepEqual(s.likes,{total:23,carry:23});
});
test('both confirmed hosts and nested SDK count fields retain numeric totals',()=>{
 const s=Core.fresh();
 for(const p of [packet({source:'baiyao',count:'17'}),{data:{count:9}},{data:{likeCount:'11'}},{likeCount:4}])assert.equal(receive(s,p,{sourceHint:'sdk'}).accepted,true);
 assert.deepEqual(s.likes,{total:41,carry:41});
});
test('explicit manual count is accepted without changing SDK assumptions',()=>{
 const s=Core.fresh();assert.equal(receive(s,{count:500},{sourceHint:'manual'}).accepted,true);
 assert.deepEqual(s.likes,{total:500,carry:500});
});
for(const [name,p] of [
 ['null',null],['array',[]],['primitive','23'],['number',23],
 ['missing count',{type:'like'}],['total only',{type:'like',total:'2000'}],
 ['counter diagnostics only',{type:'like',likeCounters:{count:'23',total:'5000'}}],
 ['zero',packet({count:0})],['negative',packet({count:-2})],['fraction',packet({count:1.5})],
 ['unsafe integer',packet({count:9007199254740992})],['over cap',packet({count:'1000000000000001'})],
 ['uint64 beyond cap',packet({count:'18446744073709551615'})],['NaN',packet({count:NaN})],
 ['infinity',packet({count:Infinity})],['boolean',packet({count:true})],['object count',packet({count:{}})],
 ['empty count',packet({count:''})],['whitespace count',packet({count:' 23 '})],
 ['decimal string',packet({count:'23.0'})],['exponent string',packet({count:'2e3'})],
 ['leading zeros',packet({count:'023'})],['negative string',packet({count:'-3'})],
 ['total mode',packet({count:'23',countMode:'total'})],['unknown mode',packet({countMode:'unknown'})],
 ['wrong event type',packet({type:'gift'})],['malformed nested data',{type:'like',data:[]}],
 ['conflicting count aliases',{type:'like',count:23,likeCount:24}],
 ['conflicting nested count',{type:'like',count:23,data:{count:24}}],
 ['conflicting count mode',packet({data:{countMode:'total'}})],
 ['expired timestamp',packet({eventId:'old',timestamp:NOW-60001})],
 ['future timestamp',packet({eventId:'future',timestamp:NOW+5001})],
 ['timestamp fraction',packet({timestamp:NOW+.5})],
 ['timestamp object',packet({timestamp:{}})]
])test('rejects '+name+' without awarding or consuming a receipt',()=>{
 const s=Core.fresh();s.likes={total:45,carry:8};
 const r=receive(s,p);assert.equal(r.accepted,false);
 assert.deepEqual(s.likes,{total:45,carry:8});assert.deepEqual(s.receivedLikeIds,[]);
});
test('cap count is exact while total diagnostic never contributes extra likes',()=>{
 const s=Core.fresh();const r=receive(s,packet({count:'1000000000000000',likeCounters:{count:'1000000000000000',total:'18446744073709551615'}}));
 assert.equal(r.accepted,true);assert.equal(r.increment,1000000000000000);
 assert.deepEqual(s.likes,{total:1000000000000000,carry:1000000000000000});
});
test('replayed event ID is rejected across WebSocket and SDK callbacks',()=>{
 const s=Core.fresh(),p=packet({eventId:'evt-1',roomId:'room-1',timestamp:String(NOW)});
 assert.equal(receive(s,p,{sourceHint:'ws'}).accepted,true);
 const r=receive(s,p,{sourceHint:'sdk'});assert.equal(r.accepted,false);assert.equal(r.duplicate,true);
 assert.deepEqual(s.likes,{total:23,carry:23});assert.equal(s.receivedLikeIds.length,1);
});
test('matching msgId and eventId share a receipt identity',()=>{
 const s=Core.fresh();receive(s,packet({msgId:'evt-2',roomId:'1'}));
 assert.equal(receive(s,packet({eventId:'evt-2',roomId:'1'})).duplicate,true);
 assert.equal(s.likes.total,23);
});
test('receipt identity is isolated by confirmed host and room without separator collisions',()=>{
 const s=Core.fresh();
 for(const p of [packet({eventId:'x',roomId:'1'}),packet({eventId:'x',roomId:'2'}),packet({eventId:'x',roomId:'1',source:'baiyao'}),packet({eventId:'b:c',roomId:'a'}),packet({eventId:'c',roomId:'a:b'})])assert.equal(receive(s,p).accepted,true);
 assert.equal(s.likes.total,115);assert.equal(s.receivedLikeIds.length,5);
});
test('two indistinguishable no-ID packets both award their actual delta',()=>{
 const s=Core.fresh(),p=packet();receive(s,p);receive(s,p);
 assert.deepEqual(s.likes,{total:46,carry:46});assert.deepEqual(s.receivedLikeIds,[]);
});
test('invalid packet leaves its ID available for a later valid packet',()=>{
 const s=Core.fresh();assert.equal(receive(s,packet({eventId:'retry',count:'-1'})).accepted,false);
 assert.equal(receive(s,packet({eventId:'retry'})).accepted,true);assert.equal(s.likes.total,23);
});
test('receipt expires after 60 seconds and duplicate traffic does not extend its age',()=>{
 const s=Core.fresh(),p=packet({eventId:'ttl'});receive(s,p);
 assert.equal(receive(s,p,{now:NOW+59000}).duplicate,true);
 assert.equal(receive(s,p,{now:NOW+60001}).accepted,true);assert.equal(s.likes.total,46);
});
test('receipt ring keeps the most recent 1000 identifiers',()=>{
 const s=Core.fresh();for(let i=0;i<1001;i++)assert.equal(receive(s,packet({eventId:'e'+i,count:'1'}),{now:NOW+i}).accepted,true);
 assert.equal(s.receivedLikeIds.length,1000);
 assert.equal(receive(s,packet({eventId:'e1000',count:'1'}),{now:NOW+1100}).duplicate,true);
 assert.equal(receive(s,packet({eventId:'e0',count:'1'}),{now:NOW+1100}).accepted,true);
 assert.equal(s.likes.total,1002);
});
test('fresh state initializes receipts separately from gift receipts',()=>{
 const s=Core.fresh();assert.deepEqual(s.receivedLikeIds,[]);s.receivedGiftIds.push({id:'gift',at:NOW});
 receive(s,packet({eventId:'gift'}));assert.equal(s.likes.total,23);assert.deepEqual(s.receivedGiftIds,[{id:'gift',at:NOW}]);
});
test('reload preserves recent IDs and prior total/carry without replaying likes',()=>{
 const now=Date.now(),s=Core.fresh();s.likes={total:77,carry:7};
 const p=packet({eventId:'reload',timestamp:now});assert.equal(Likes.receive(s,p,{now}).accepted,true);
 const restored=Core.restore(JSON.stringify(s));assert(restored);
 assert.deepEqual(restored.likes,{total:100,carry:30});
 assert.equal(Likes.receive(restored,p,{now:now+10}).duplicate,true);
 assert.deepEqual(restored.likes,{total:100,carry:30});
});
test('legacy state gets an empty receipt set without inferring historical likes',()=>{
 const s=Core.fresh();delete s.receivedLikeIds;s.likes={total:128,carry:28};
 const r=Core.restore(JSON.stringify(s));assert(r);assert.deepEqual(r.receivedLikeIds,[]);assert.deepEqual(r.likes,{total:128,carry:28});
});
test('malformed, expired and future receipts are discarded on restore',t=>{
 const now=Date.now();t.mock.method(Date,'now',()=>now);
 const s=Core.fresh();s.receivedLikeIds=[null,{}, {id:1,at:now},{id:'',at:now},{id:'x'.repeat(801),at:now},{id:'old',at:now-60001},{id:'future',at:now+5001},{id:'live',at:now}];
 const r=Core.restore(JSON.stringify(s));assert(r);assert.deepEqual(r.receivedLikeIds,[{id:'live',at:now}]);
});
test('saturated count does not consume a new receipt or pretend progress changed',()=>{
 const s=Core.fresh();s.likes={total:1000000000000000,carry:1000000000000000};
 const r=receive(s,packet({eventId:'full'}));assert.equal(r.accepted,false);assert.equal(r.reason,'capacity');
 assert.deepEqual(s.receivedLikeIds,[]);
});
test('long escaped identifiers cannot produce receipts that silently vanish on reload',()=>{
 const s=Core.fresh(),p=packet({source:'\\'.repeat(64),roomId:'\\'.repeat(200),eventId:'\\'.repeat(200)});
 const r=receive(s,p);assert.equal(r.accepted,false);assert.deepEqual(s.likes,{total:0,carry:0});assert.deepEqual(s.receivedLikeIds,[]);
});
test('metadata defaults and safe numeric room/message identifiers are stable across callbacks',()=>{
 const s=Core.fresh(),p={data:{likeCount:'3',roomId:7,msgId:17,timestamp:NOW}};
 assert.equal(receive(s,p,{sourceHint:'sdk'}).accepted,true);
 assert.equal(receive(s,p,{sourceHint:'sdk'}).duplicate,true);
 assert.equal(receive(s,p,{sourceHint:'manual'}).accepted,true);
 assert.deepEqual(s.likes,{total:6,carry:6});
});
test('invalid identity metadata is rejected without crashing or treating it as a shared ID',()=>{
 for(const extra of [{source:{}},{source:''},{roomId:{}},{eventId:{}},{eventId:''},{eventId:'0'},{eventId:0},{eventId:9007199254740992},{eventId:'x\n'},{timestamp:'01'}]){
  const s=Core.fresh();assert.equal(receive(s,packet(extra)).accepted,false);assert.deepEqual(s.likes,{total:0,carry:0});assert.deepEqual(s.receivedLikeIds,[]);
 }
});
test('a fresh accepted packet cleans expired receipts without resetting old like totals',()=>{
 const s=Core.fresh();s.likes={total:900,carry:10};s.receivedLikeIds=[{id:'expired',at:NOW-60001},{id:'valid',at:NOW}];
 assert.equal(receive(s,packet()).accepted,true);assert.deepEqual(s.likes,{total:923,carry:33});assert.deepEqual(s.receivedLikeIds,[{id:'valid',at:NOW}]);
});
test('the browser module uses the real CowCore without CommonJS or storage writes',()=>{
 const vm=require('node:vm'),window={};const context=vm.createContext({window,Date,console});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/core.js'),'utf8'),context);
 vm.runInContext(fs.readFileSync(modulePath,'utf8'),context);
 const s=window.CowCore.fresh(),r=window.PetLikes.receive(s,packet(),{now:NOW});assert.equal(r.accepted,true);assert.equal(s.likes.total,23);
});
test('a limited award redemption retains due carry for later available pet capacity',()=>{
 const s=Core.fresh();s.likes={total:100000100,carry:100000100};
 assert.equal(Core.takeLikeAwards(s,10000,2),2);assert.deepEqual(s.likes,{total:100000100,carry:99980100});
 assert.equal(Core.takeLikeAwards(s,10000,0),0);assert.equal(s.likes.carry,99980100);
 assert.equal(Core.takeLikeAwards(s,10000),9998);assert.equal(s.likes.carry,100);
});
test('invalid award limits cannot consume unredeemed likes',()=>{
 const s=Core.fresh();s.likes={total:50000,carry:50000};
 for(const max of [-1,1.5,NaN,Infinity,'2'])assert.equal(Core.takeLikeAwards(s,10000,max),0);
 assert.deepEqual(s.likes,{total:50000,carry:50000});
});

test('an atomic like redemption commits whole pet tiers and carry together',()=>{
 const s=Core.fresh();s.likes={total:35,carry:35};
 assert.equal(Core.redeemLikes(s,10,2),6);
 assert.equal(s.outside,6);assert.deepEqual(s.likes,{total:35,carry:5});
});

test('atomic redemption respects current box reservations and never commits a partial tier',()=>{
 const s=Core.fresh();s.outside=99996;s.current={success:true,applied:false,count:3};s.likes={total:10,carry:10};
 assert.equal(Core.redeemLikes(s,10,2),0);assert.equal(s.outside,99996);assert.equal(s.likes.carry,10);
 s.current.count=2;assert.equal(Core.redeemLikes(s,10,2),2);assert.equal(s.outside,99998);assert.equal(s.likes.carry,0);
});

test('atomic redemption preserves huge valid carry and limits each batch to ten thousand tiers',()=>{
 const s=Core.fresh();s.likes={total:1000000000000000,carry:1000000000000000};
 assert.equal(Core.redeemLikes(s,10000000,1),10000);
 assert.equal(s.likes.carry,999900000000000);assert.equal(s.likes.total,1000000000000000);
});

test('invalid atomic redemption parameters cannot change any state',()=>{
 for(const args of [[0,1],['10',1],[1,0],[1,10001],[1,1,-1],[1,1,1.5],[1,1,10001]]){
  const s=Core.fresh();s.likes={total:10,carry:10};const before=structuredClone(s);
  assert.equal(Core.redeemLikes(s,...args),0);assert.deepEqual(s,before);
 }
});
