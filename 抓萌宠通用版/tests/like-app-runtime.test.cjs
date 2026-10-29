const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../src/core.js');
const {bootstrap,flushSave,dispatch}=require('./helpers/app-harness.cjs');

async function setup(state=null,prefs=null,extras={}){
 const listeners=[],sdk={onGift(){},onLike(fn){listeners.push(fn);}};
 const f=await bootstrap(state,prefs,{realEffects:true,likeInput:true,sdk,...extras});
 Object.assign(f.ctx.effectInstance.cfg,{likeEnabled:true,likeStep:10,likeAdd:1});
 f.like=data=>listeners[0](data);f.state=()=>f.ctx.effectInstance.getState();return f;
}
const packet=(id,count='23',source='songlan')=>({type:'like',count,countMode:'delta',source,roomId:'123',eventId:id,timestamp:Date.now()});

test('the actual SDK callback counts 23 real clicks once and updates the visible progress immediately',async()=>{
 const f=await setup();f.like(packet('twenty-three'));
 assert.equal(f.state().likes.total,23);assert.equal(f.state().likes.carry,3);assert.equal(f.state().outside,2);
 assert.match(f.document.getElementById('like-status').textContent,/23/);
 f.like(packet('twenty-three'));
 assert.equal(f.state().likes.total,23);assert.equal(f.state().outside,2);
});

test('legacy quantity-less packets and a room cumulative total do not fabricate one click and explain the missing data',async()=>{
 const f=await setup();f.like({type:'like',nickName:'Synthetic'});f.like({type:'like',total:'12345'});
 assert.deepEqual({...f.state().likes},{total:0,carry:0});
 const status=f.document.getElementById('like-source-status');assert(status);assert.match(status.textContent,/次数|增量/);
});

test('a configured large like threshold works for both a real packet and the existing manual one-tier button',async()=>{
 const f=await setup();Object.assign(f.ctx.effectInstance.cfg,{likeStep:200000,likeAdd:1});
 f.like(packet('large-valid','100001'));assert.equal(f.state().likes.total,100001);
 f.document.getElementById('like-test').click();assert.equal(f.state().likes.total,300001);
 assert.equal(f.state().likes.carry,100001);assert.equal(f.state().outside,1);
});

test('refresh retains only recent receipts and cannot award a retransmitted SDK event again',async()=>{
 const f=await setup();f.like(packet('reload'));const saved=flushSave(f.ctx,f.store);
 const next=await setup(saved);next.like(packet('reload'));
 assert.equal(next.state().likes.total,23);assert.equal(next.state().outside,2);
});

test('a committed session ending preserves short receipts but resets the visible like total',async()=>{
 const f=await setup();f.like(packet('late-after-end'));
 const end=f.document.getElementById('end-session');end.click();end.click();
 assert.equal(f.state().likes.total,0);assert.equal(f.state().outside,0);
 f.like(packet('late-after-end'));assert.equal(f.state().likes.total,0);assert.equal(f.state().outside,0);
});

test('a disabled rule leaves all counters untouched and gives an actionable received-data status',async()=>{
 const f=await setup();f.ctx.effectInstance.cfg.likeEnabled=false;f.like(packet('disabled'));
 assert.equal(f.state().likes.total,0);assert.equal(f.state().receivedLikeIds.length,0);
 const status=f.document.getElementById('like-source-status');assert(status);assert.match(status.textContent,/未启用/);
});

test('capacity protection keeps an earned like tier until there is room for the full award',async()=>{
 const state=C.fresh();state.outside=100000;const f=await setup(state,{sceneLimitEnabled:true,sceneLimit:1});
 f.like(packet('waiting-award','10'));assert.equal(f.state().likes.carry,10);assert.equal(f.state().outside,100000);
 f.state().outside=99999;f.ctx.frame(0);
 assert.equal(f.state().likes.carry,0);assert.equal(f.state().outside,100000);
});

test('one callback never discards more than ten thousand pending tiers',async()=>{
 const f=await setup();Object.assign(f.ctx.effectInstance.cfg,{likeStep:1,likeAdd:1});
 f.ctx.effectInstance.refresh=()=>{};f.like(packet('many-tiers','20001'));
 assert.equal(f.state().likes.carry,10001);assert.equal(f.state().outside,10000);
 f.ctx.frame(0);assert.equal(f.state().likes.carry,1);assert.equal(f.state().outside,20000);
});

test('stale and invalid incoming deltas do not change the current live round',async()=>{
 const f=await setup();f.like({...packet('stale'),timestamp:Date.now()-120000});
 f.like(packet('unsafe','9007199254740993'));f.like(packet('fraction','1.5'));
 assert.equal(f.state().likes.total,0);assert.equal(f.state().receivedLikeIds.length,0);
});

test('the actual WebSocket entry uses the same receiver when there is no SDK',async()=>{
 const sockets=[];class Socket{constructor(){this.readyState=0;sockets.push(this);}send(){}close(){this.readyState=3;this.onclose?.();}}
 const f=await bootstrap(null,{connect:true},{realEffects:true,likeInput:true,WebSocket:Socket});
 Object.assign(f.ctx.effectInstance.cfg,{likeEnabled:true,likeStep:10,likeAdd:1});
 assert.equal(sockets.length,1);sockets[0].onmessage({data:JSON.stringify(packet('ws'))});
 assert.equal(f.ctx.effectInstance.getState().likes.total,23);sockets[0].onmessage({data:JSON.stringify(packet('ws'))});
 assert.equal(f.ctx.effectInstance.getState().likes.total,23);
});

async function socketSetup(){
 const sockets=[];class Socket{constructor(){this.readyState=0;sockets.push(this);}send(){}close(){this.readyState=3;this.onclose?.();}}
 const f=await bootstrap(null,{connect:true},{realEffects:true,likeInput:true,WebSocket:Socket});
 Object.assign(f.ctx.effectInstance.cfg,{likeEnabled:true,likeStep:10,likeAdd:1});
 f.connect=enabled=>{const el=f.document.getElementById('connect');el.checked=enabled;dispatch(el,'change');};
 f.state=()=>f.ctx.effectInstance.getState();return {...f,sockets};
}

test('disabling the local channel rejects a saved late callback from the old connection',async()=>{
 const f=await socketSetup(),late=f.sockets[0].onmessage;f.connect(false);
 late({data:JSON.stringify(packet('late-disabled'))});
 assert.equal(f.state().likes.total,0);assert.equal(f.state().receivedLikeIds.length,0);
 assert.equal(f.document.getElementById('connection').textContent,'独立使用中');
});

test('old socket callbacks cannot close or replace a new enabled connection',async()=>{
 const f=await socketSetup(),old=f.sockets[0],error=old.onerror,close=old.onclose,open=old.onopen;
 f.connect(false);f.connect(true);const current=f.sockets[1];assert(current);
 error();assert.equal(current.readyState,0);
 close();open();assert.match(f.document.getElementById('connection').textContent,/正在连接/);
 f.connect(true);assert.equal(f.sockets.length,2);
 current.onmessage({data:JSON.stringify(packet('new-enabled'))});assert.equal(f.state().likes.total,23);
});

test('a like redemption crossing a deadline settles once and preserves its pending complete award',async()=>{
 const f=await setup(),effect=f.ctx.effectInstance,s=f.state();s.outside=99999;
 C.startChallenge(s,{seconds:1,target:1,penalty:1},1,1000);
 let clockCalls=0,settles=0;f.ctx.Date={now:()=>++clockCalls<3?1999:2000};
 const settle=effect.settle.bind(effect);effect.settle=at=>{settles++;return settle(at);};
 f.like({type:'like',count:10,countMode:'delta',source:'songlan'});
 assert.equal(settles,1);assert.equal(s.likes.carry,10);assert.equal(s.outside,100000);
 assert.equal(s.interactions.challenge,null,'The due penalty took the last slot, so the like award must remain pending');
});

test('a due challenge occupying the final slot leaves the complete like tier unredeemed',async()=>{
 const f=await setup(),s=f.state();s.outside=99999;s.likes={total:10,carry:10};
 C.startChallenge(s,{seconds:1,target:1,penalty:1},1,1000);f.ctx.Date={now:()=>2000};
 assert.equal(f.ctx.effectInstance.awardLikes(10,1),0);
 assert.equal(s.outside,100000);assert.equal(s.likes.carry,10);assert.equal(s.interactions.challenge,null);
});

test('a failed award display cannot discard its receipt or award the same tier again',async()=>{
 const f=await setup(),effect=f.ctx.effectInstance,refresh=effect.refresh.bind(effect);
 effect.refresh=()=>{throw new Error('Synthetic display failure');};
 assert.doesNotThrow(()=>f.like(packet('display-failed','10')));
 assert.equal(f.state().outside,1);assert.equal(f.state().likes.carry,0);
 const saved=JSON.parse(f.store.get('pet-catch-v1'));assert.equal(saved.outside,1);assert.equal(saved.likes.carry,0);
 effect.refresh=refresh;f.like(packet('display-failed','10'));f.ctx.frame(0);
 assert.equal(f.state().outside,1);assert.equal(f.state().likes.total,10);
});

test('insufficient capacity for a whole like award reports pending redemption without adding a partial pet tier',async()=>{
 const s=C.fresh();s.outside=99999;const f=await setup(s,{sceneLimitEnabled:true,sceneLimit:1});
 f.ctx.effectInstance.cfg.likeAdd=2;f.like(packet('partial-tier','10'));
 assert.equal(f.state().outside,99999);assert.equal(f.state().likes.carry,10);
 assert.match(f.document.getElementById('like-status').textContent,/待兑换/);
});
