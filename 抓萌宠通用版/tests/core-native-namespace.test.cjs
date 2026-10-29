const test=require('node:test'),assert=require('node:assert/strict'),C=require('../src/core.js');
test('version-one restore preserves extension kinds in positions, waiting kinds, history and current cast',()=>{
 const s=C.fresh();s.outside=4;s.home=1;C.start(s,()=>0,0,[{id:'one',count:1,enabled:true}]);s.current.cast=[2000000,100];
 s.positions=[{x:.2,y:.3,kind:2000000},{x:.4,y:.5,kind:100}];s.pendingKinds=[2000007,2099999];s.recentHomes=[{at:Date.now(),kind:2000003,count:1}];
 const restored=C.restore(JSON.stringify(s));assert(restored);assert.equal(restored.version,1);
 assert.deepEqual(restored.positions.map(p=>p.kind),[2000000,100]);assert.deepEqual(restored.pendingKinds,[2000007,2099999]);assert.deepEqual(restored.current.cast,[2000000,100]);assert.equal(restored.recentHomes[0].kind,2000003);
});
test('collect, waiting collect, rebalance and burst retain extension identity without double credit',()=>{
 const now=Date.now(),s=C.fresh();s.outside=4;
 assert.equal(C.collect(s,2,now,[2000000,100]),2);assert.deepEqual(C.burst(s,30,now),[2000000,100]);assert.deepEqual(C.burst(s,30,now),[]);
 s.pendingKinds=[2000007,2099999];assert.equal(C.collectPending(s,2,2,now),2);assert.deepEqual(s.pendingKinds,[]);assert.deepEqual(C.burst(s,30,now),[2000007,2099999]);
 s.pendingKinds=[2000006];const active=[{kind:2000000},{kind:2000001},{kind:100}];C.rebalancePopulation(s,active,1);assert.deepEqual(s.pendingKinds,[2000001,100,2000006]);
 assert.equal(s.outside,4);assert.equal(s.home,0);
});
test('native extension can be an avatar fallback but can never be an avatar record or round source',()=>{
 const s=C.fresh(),a=C.registerAvatar(s,'https://example.com/avatar.png','A',2000007);assert.equal(a,1000000);assert.equal(s.avatarKinds[0].fallbackKind,2000007);
 assert.equal(C.registerAvatar(s,'https://example.com/avatar.png','A',2099999),a);assert.equal(s.avatarKinds[0].fallbackKind,2099999);
 s.avatarKinds.push({kind:2000000,url:'https://example.com/invalid.png',name:'bad',fallbackKind:0});C.enqueue(s,1,2000000);
 const restored=C.restore(JSON.stringify(s));assert.equal(restored.avatarKinds.length,1);assert.equal(restored.avatarKinds[0].fallbackKind,2099999);assert.deepEqual(restored.roundSources,[{kind:0,count:1}]);
});
test('avatar allocation wraps at the old two-million sentinel and skips referenced old avatar IDs',()=>{
 const s=C.fresh();s.nextAvatarKind=1999999;assert.equal(C.registerAvatar(s,'https://example.com/last.png','last'),1999999);assert.equal(s.nextAvatarKind,2000000);
 s.outside=2;s.positions=[{x:.3,y:.4,kind:1000000},{x:.4,y:.4,kind:2000000}];
 const restored=C.restore(JSON.stringify(s));assert.equal(restored.nextAvatarKind,2000000);
 assert.equal(C.registerAvatar(restored,'https://example.com/wrapped.png','new',2000000),1000001);assert.equal(restored.nextAvatarKind,1000002);
 assert.equal(restored.avatarKinds.every(row=>row.kind<=1999999),true);
});
test('invalid widened avatar cursors and avatar-domain fallbacks never enter the native extension',()=>{
 for(const cursor of [2000001,2099999,2100000]){const s=C.fresh();s.nextAvatarKind=cursor;const r=C.restore(JSON.stringify(s));assert.equal(r.nextAvatarKind,1000000);assert.equal(C.registerAvatar(r,'https://example.com/new.png','new'),1000000);}
 for(const fallback of [1000000,1999999,2100000,'2000000']){const s=C.fresh();C.registerAvatar(s,'https://example.com/new.png','new',fallback);assert.equal(s.avatarKinds[0].fallbackKind,0);}
});
test('extension ID boundaries reject out-of-range kinds while preserving generic unknown native kinds',()=>{
 const s=C.fresh();s.outside=3;s.positions=[{x:.5,y:.5,kind:2099999},{x:.5,y:.5,kind:2100000}];s.pendingKinds=[2000999];
 const r=C.restore(JSON.stringify(s));assert.deepEqual(r.positions.map(p=>p.kind),[2099999]);assert.deepEqual(r.pendingKinds,[2000999]);
});
test('even malformed in-memory avatar records cannot be reused as native IDs',()=>{
 const s=C.fresh();s.avatarKinds=[{kind:2000000,url:'https://example.com/same.png',name:'bad'}];
 assert.equal(C.registerAvatar(s,'https://example.com/same.png','good',2000001),1000000);
 const full=C.fresh();full.avatarKinds=Array.from({length:1000},(_,i)=>({kind:2000000+i,url:'https://example.com/'+i+'.png'}));assert.equal(C.registerAvatar(full,'https://example.com/new.png','new'),0);
});
