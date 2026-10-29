const test=require('node:test');
const assert=require('node:assert/strict');
const C=require('../src/core.js');

const one=[{id:'one',count:1,enabled:true}];
const round=s=>{const r=C.start(s,()=>0,0,one);assert(r);const added=C.resolve(s);C.finish(s);return{r,added};};

test('登记头像分配稳定种类，清理昵称并拒绝危险或过大图片来源',()=>{
 const s=C.fresh();
 assert.deepEqual(s.avatarKinds,[]);
 assert.deepEqual(s.roundSources,[]);
 assert.equal(s.nextAvatarKind,1000000);
 const a=C.registerAvatar(s,'https://example.com/avatar.png','  阿猫\n<script>  ');
 assert.equal(a,1000000);
 assert.equal(C.registerAvatar(s,'https://example.com/avatar.png','另一个名字'),a);
 assert.equal(s.avatarKinds.length,1);
 assert.equal(s.avatarKinds[0].name.includes('\n'),false);
 assert.equal(s.avatarKinds[0].name.length<=40,true);
 assert.equal(C.registerAvatar(s,'javascript:alert(1)','坏地址'),0);
 assert.equal(C.registerAvatar(s,'data:text/html;base64,PHNjcmlwdD4=','坏图片'),0);
 assert.equal(C.registerAvatar(s,'data:image/png;base64,'+'A'.repeat(1400000),'过大'),0);
 const b=C.registerAvatar(s,'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==','GIF头像');
 assert.equal(b,1000001);
});

test('每轮头像来源按礼物入队顺序持久化，结算只写一次且无效头像回退',()=>{
 const s=C.fresh();
 const a=C.registerAvatar(s,'https://example.com/a.png','A');
 const b=C.registerAvatar(s,'https://example.com/b.png','B');
 assert.equal(C.enqueue(s,2,a),2);
 assert.equal(C.enqueue(s,1,1888888),1);
 assert.equal(C.enqueue(s,1,b),1);
 assert.deepEqual(s.roundSources,[{kind:a,count:2},{kind:0,count:1},{kind:b,count:1}]);
 const saved=C.restore(JSON.stringify(s));
 assert.deepEqual(saved.roundSources,s.roundSources);
 for(const expected of [a,a,0,b]){
  const r=C.start(saved,()=>0,0,one);
  assert.equal(r.avatarKind,expected);
  assert.equal(C.resolve(saved),1);
  assert.equal(C.resolve(saved),0);
  C.finish(saved);
 }
 assert.deepEqual(saved.pendingKinds,[a,a,b]);
 assert.equal(saved.queue,0);
 assert.deepEqual(saved.roundSources,[]);
});

test('没有可用档位时不消费头像队列；手动开轮不继承排队头像',()=>{
 const s=C.fresh();const a=C.registerAvatar(s,'https://example.com/avatar.png','A');
 C.enqueue(s,1,a);
 assert.equal(C.start(s,()=>0,0,one,'missing'),null);
 assert.equal(s.queue,1);
 assert.deepEqual(s.roundSources,[{kind:a,count:1}]);
 assert.equal(round(s).r.avatarKind,a);
 assert.equal(round(s).r.avatarKind,0);
});

test('头像来源能穿过收回和爆炸历史，且存档保留头像编号',()=>{
 const s=C.fresh();const a=C.registerAvatar(s,'https://example.com/avatar.png','A');
 C.enqueue(s,1,a);round(s);
 const restored=C.restore(JSON.stringify(s));
 assert.deepEqual(restored.pendingKinds,[a]);
 restored.pendingKinds=[]; // Rendered pet has consumed the pending kind before it is collected.
 assert.equal(C.collect(restored,1,Date.now(),[a]),1);
 assert.equal(restored.recentHomes[0].kind,a);
 assert.deepEqual(C.burst(restored,30,Date.now()),[a]);
 assert.deepEqual(restored.pendingKinds,[a]);
 const after=C.restore(JSON.stringify(restored));
 assert.equal(after.recentHomes.length,0);
 assert(after.pendingKinds.every(k=>k===a));
});

test('旧存档缺少头像字段仍可读取，队列作为普通轮次迁移',()=>{
 const old=C.fresh();old.queue=3;delete old.avatarKinds;delete old.nextAvatarKind;delete old.roundSources;
 const s=C.restore(JSON.stringify(old));
 assert(s);
 assert.deepEqual(s.avatarKinds,[]);
 assert.equal(s.nextAvatarKind,1000000);
 assert.deepEqual(s.roundSources,[{kind:0,count:3}]);
 assert.equal(round(s).r.avatarKind,0);
});

test('头像编号在位置、待补与收回历史中最高保留到 1999999',()=>{
 const s=C.fresh();s.outside=2;s.home=1;
 s.positions=[{x:.1,y:.2,kind:1999999}];s.pendingKinds=[1999999];
 s.recentHomes=[{at:Date.now(),kind:1999999,count:1}];
 const r=C.restore(JSON.stringify(s));
 assert.equal(r.positions[0].kind,1999999);
 assert.equal(r.pendingKinds[0],1999999);
 assert.equal(r.recentHomes[0].kind,1999999);
});

test('头像地址净化 helper 与待处理礼物在刷新后保留安全头像和昵称',()=>{
 const url='https://example.com/live.png';
 assert.equal(C.safeAvatarUrl(url),url);
 assert.equal(C.safeAvatarUrl('javascript:alert(1)'),'');
 const s=C.fresh();
 assert.equal(C.receiveGift(s,{kind:'round',name:'礼物',count:1,eid:'gift-a',avatarUrl:url,nickName:'  小观众\n  '}),'accepted');
 assert.equal(C.receiveGift(s,{kind:'round',name:'礼物',count:1,eid:'gift-b',avatarUrl:'file:///private.png',nickName:'X'.repeat(100)}),'accepted');
 const r=C.restore(JSON.stringify(s));
 assert.equal(r.pendingGifts[0].avatarUrl,url);
 assert.equal(r.pendingGifts[0].nickName,'小观众');
 assert.equal('avatarUrl' in r.pendingGifts[1],false);
 assert.equal(r.pendingGifts[1].nickName.length,40);
});

test('刷新正在播放的头像轮次不重复结算，普通轮次仍随机选宠物',()=>{
 const s=C.fresh(),kind=C.registerAvatar(s,'https://example.com/viewer.webp','观众');
 C.enqueue(s,1,kind);
 C.start(s,()=>0,0,one);
 const reloaded=C.restore(JSON.stringify(s));
 assert.equal(reloaded.current.avatarKind,kind);
 assert.equal(reloaded.queue,0);
 assert.equal(C.resolve(reloaded),1);
 const settled=C.restore(JSON.stringify(reloaded));
 assert.equal(C.resolve(settled),0);
 assert.deepEqual(settled.pendingKinds,[kind]);
 C.finish(settled);
 settled.pendingKinds=[]; // Simulate on-screen render consuming the one queued avatar.
 C.enqueue(settled,1);
 assert.equal(C.start(settled,()=>0,0,one).avatarKind,0);
 assert.equal(C.resolve(settled),1);
 assert.deepEqual(settled.pendingKinds,[]);
});

test('头像记录上限 1000 个，刷新后编号不会重复分配',()=>{
 const s=C.fresh();
 for(let i=0;i<1000;i++)assert.equal(C.registerAvatar(s,`https://example.com/${i}.png`,`观众${i}`),1000000+i);
 s.queue=1000;
 s.roundSources=Array.from({length:1000},(_,i)=>({kind:1000000+i,count:1}));
 assert.equal(C.registerAvatar(s,'https://example.com/extra.png','额外'),0);
 const r=C.restore(JSON.stringify(s));
 assert.equal(r.avatarKinds.length,1000);
 assert.equal(r.nextAvatarKind,1001000);
 assert.equal(C.registerAvatar(r,'https://example.com/999.png','同一头像'),1000999);
 assert.equal(C.registerAvatar(r,'https://example.com/another.png','另一位'),0);
});

test('达到上限时复用最早且完全未被场内、候场、历史和队列引用的头像',()=>{
 const s=C.fresh();
 for(let i=0;i<1000;i++)C.registerAvatar(s,`https://example.com/${i}.png`,`观众${i}`);
 s.positions=[{x:.3,y:.6,kind:1000000}];
 s.pendingKinds=[1000001];
 s.recentHomes=[{at:Date.now(),kind:1000002,count:1}];
 s.current={avatarKind:1000003,cast:[1000004]};
 s.roundSources=[{kind:1000005,count:1}];
 const recycled=C.registerAvatar(s,'https://example.com/new.png','新观众',24);
 assert.equal(recycled,1000006);
 assert.equal(s.avatarKinds.length,1000);
 assert.equal(s.avatarKinds.some(row=>row.url==='https://example.com/6.png'),false);
 assert.deepEqual(s.avatarKinds.at(-1),{kind:1000006,url:'https://example.com/new.png',name:'新观众',fallbackKind:24});
 assert.equal(s.nextAvatarKind,1001000);
 assert.equal(C.registerAvatar(s,'https://example.com/next.png','下一位'),1000007);
});

test('过期回家历史不长期锁住头像编号，重新分配不覆盖仍引用的编号',()=>{
 const s=C.fresh();
 for(let i=0;i<1000;i++)C.registerAvatar(s,`https://example.com/${i}.png`,`观众${i}`);
 s.recentHomes=[{at:Date.now()-301000,kind:1000000,count:1},{at:Date.now(),kind:1000001,count:1}];
 assert.equal(C.registerAvatar(s,'https://example.com/after-expiry.png','新观众'),1000000);
 assert.equal(s.avatarKinds.find(row=>row.kind===1000001).url,'https://example.com/1.png');
 const restored=C.restore(JSON.stringify(s));
 assert.equal(restored.avatarKinds.find(row=>row.kind===1000000).url,'https://example.com/after-expiry.png');
 assert.equal(restored.avatarKinds.length,1000);
});

test('头像记录保存选中的动物备用种类，旧记录与非法编号回退到 0',()=>{
 const s=C.fresh();
 const avatar=C.registerAvatar(s,'https://example.com/pet.png','观众',24);
 assert.equal(s.avatarKinds.find(row=>row.kind===avatar).fallbackKind,24);
 const restored=C.restore(JSON.stringify(s));
 assert.equal(restored.avatarKinds.find(row=>row.kind===avatar).fallbackKind,24);
 assert.equal(C.registerAvatar(restored,'https://example.com/pet.png','观众'),avatar);
 assert.equal(restored.avatarKinds.find(row=>row.kind===avatar).fallbackKind,24);
 const invalid=C.registerAvatar(restored,'https://example.com/bad.png','观众',1999999);
 assert.equal(restored.avatarKinds.find(row=>row.kind===invalid).fallbackKind,0);
 const old=C.fresh();
 old.avatarKinds=[{kind:1000000,url:'https://example.com/old.png',name:'旧观众'}];
 old.nextAvatarKind=1000001;
 assert.equal(C.restore(JSON.stringify(old)).avatarKinds[0].fallbackKind,0);
});
