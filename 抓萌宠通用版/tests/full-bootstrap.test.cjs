const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const {bootstrap,applyLimit,flushSave,runFrames}=require('./helpers/app-harness.cjs');

test('the entire app bootstraps against current markup, binds real customization, and runs a physical opening',async()=>{
 const {ctx,document}=await bootstrap();assert(ctx.customInstance.boxEditor);assert(ctx.customInstance.cfg.cowSettings.every(s=>s.scale===200));assert.equal(ctx.customInstance.cfg.boxTiers.length,1);assert.equal(ctx.customInstance.cfg.boxTiers[0].count,5);assert.equal(ctx.customInstance.boxEditor.draft.length,1);assert.equal(typeof ctx.frame,'function');assert.equal(typeof document.getElementById('start').onclick,'function');assert.equal(document.getElementById('miss'),null);
 ctx.customInstance.commitBoxTiers([{id:'one',name:'One box',gift:'Heart',mode:'fixed',count:3,min:3,max:3,enabled:true}]);document.getElementById('start').click();for(let t=0;t<3500;t+=1000/60)ctx.frame(t);assert.equal(document.getElementById('outside').textContent,'3');assert.equal(document.getElementById('show').hidden,true);
});
test('the real per-tier simulate-gift button reaches receipt, bound queue, physical burst and persistence',async()=>{
 const {ctx,document,store}=await bootstrap();ctx.customInstance.commitBoxTiers([{id:'gift',name:'Gift box',gift:'Heart',mode:'fixed',count:4,min:4,max:4,enabled:true}]);ctx.customInstance.boxEditor.reset();assert.equal(ctx.customInstance.boxEditor.testGift('gift'),true);for(let t=0;t<3500;t+=1000/60)ctx.frame(t);assert.equal(document.getElementById('outside').textContent,'4');const state=JSON.parse(store.get('pet-catch-v1'));assert.equal(state.outside,4);assert.equal(state.queue,0);assert.equal(state.current,null);assert.equal(state.receivedGiftIds.length,1);
});
test('an old 500 setting no longer strands 302 pets; all 802 enter while saved identities survive',async()=>{
 const Core=require('../src/core.js'),state=Core.fresh();state.outside=802;state.positions=Array.from({length:500},(_,i)=>({x:.2,y:.5,kind:i%2?2000000:0,windAttempt:i}));state.pendingKinds=Array.from({length:302},()=>2000005);
 const {ctx,document,store}=await bootstrap(state,{visibleLimit:500});assert.equal(document.getElementById('visibleLimitInput'),null);assert.equal(document.getElementById('sceneLimitEnabled').checked,false);ctx.intervals.find(x=>x.delay===2500).fn();const early=JSON.parse(store.get('pet-catch-v1'));assert.equal(early.positions.length,500);assert.equal(early.pendingKinds.length,302);
 for(let t=0;t<1000;t+=1000/60)ctx.frame(t);ctx.intervals.find(x=>x.delay===2500).fn();const saved=JSON.parse(store.get('pet-catch-v1'));assert.equal(saved.outside,802);assert.equal(saved.positions.length,802);assert.equal(saved.pendingKinds.length,0);assert.equal(saved.positions.filter(p=>p.kind===2000005).length,302);assert.match(document.getElementById('population-status').textContent,/场内 802 只/);assert(!document.getElementById('population-status').textContent.includes('/ 500'));
});
test('recalling not-yet-mounted saved pets consumes their real identities and cannot recreate them',async()=>{
 const Core=require('../src/core.js'),state=Core.fresh();state.outside=802;state.positions=Array.from({length:500},(_,i)=>({x:.2,y:.5,kind:i%2?2000000:0,windAttempt:i}));state.pendingKinds=Array(302).fill(2000005);
 const {ctx,store}=await bootstrap(state),fx=ctx.effectInstance,visible=fx.getCows().length;assert.equal(fx.collectWaiting(100,visible,Date.now()),100);fx.refresh();const early=JSON.parse(store.get('pet-catch-v1'));assert.equal(early.outside,702);assert.equal(early.positions.length,400);assert.equal(early.pendingKinds.length,302);assert.equal(early.home,100);assert(early.recentHomes.every(r=>r.count===50));
 for(let t=0;t<1000;t+=1000/60)ctx.frame(t);ctx.intervals.find(x=>x.delay===2500).fn();const saved=JSON.parse(store.get('pet-catch-v1'));assert.equal(saved.positions.length,702);assert.equal(saved.home,100);assert(saved.positions.every(p=>p.windAttempt===undefined||p.windAttempt<visible||p.windAttempt>=visible+100));
});
test('clearing the scene also cancels deferred restoration instead of respawning it later',async()=>{
 const Core=require('../src/core.js'),state=Core.fresh();state.outside=2000;state.positions=Array.from({length:2000},()=>({x:.2,y:.5,kind:0}));const {ctx,store}=await bootstrap(state);ctx.effectInstance.clearOutside();for(let t=0;t<500;t+=1000/60)ctx.frame(t);ctx.intervals.find(x=>x.delay===2500).fn();const saved=JSON.parse(store.get('pet-catch-v1'));assert.equal(saved.outside,0);assert.equal(saved.positions.length,0);assert.equal(saved.pendingKinds.length,0);assert.equal(ctx.effectInstance.getCows().length,0);
});
test('every native species can be added explicitly without changing the random pool',async()=>{
 const {ctx,store}=await bootstrap(),custom=ctx.customInstance;
 assert.equal(typeof custom.onManualAdd,'function');
 custom.cfg.activeCategory='aquarium';custom.cfg.cowSettings.forEach(s=>{s.enabled=false;});
 const before=JSON.stringify(custom.cfg),kinds=custom.assets.cows.map((_,i)=>custom.kindForIndex(i));
 for(const kind of kinds)assert.equal(custom.onManualAdd(kind,1),1);
 for(let t=0;t<150;t+=1000/60)ctx.frame(t);
 ctx.intervals.find(x=>x.delay===2500).fn();const state=JSON.parse(store.get('pet-catch-v1'));
 assert.equal(state.outside,112);assert.equal(state.positions.length,112);assert.equal(state.pendingKinds.length,0);
 assert.deepEqual(state.positions.map(p=>p.kind).sort((a,b)=>a-b),kinds.sort((a,b)=>a-b));
 assert.equal(JSON.stringify(custom.cfg),before);
});
test('personal kind 100 and native extension 2000005 remain separate through adding and refresh',async()=>{
 const {ctx,store}=await bootstrap(),custom=ctx.customInstance;
 assert.equal(typeof custom.onManualAdd,'function');
 custom.cfg.customCows.push({kind:100,name:'Personal pet',category:'custom',enabled:false,scale:200,fps:8,motion:'hop'});
 custom.records.set('cow:100',{type:'image',data:'data:image/png;base64,aA=='});
 assert.equal(custom.onManualAdd(100,70),70);assert.equal(custom.onManualAdd(2000005,130),130);
 for(let t=0;t<200;t+=1000/60)ctx.frame(t);
 ctx.intervals.find(x=>x.delay===2500).fn();const saved=JSON.parse(store.get('pet-catch-v1'));
 assert.equal(saved.outside,200);assert.equal(saved.positions.filter(p=>p.kind===100).length,70);
 assert.equal(saved.positions.filter(p=>p.kind===2000005).length,130);assert.equal(saved.pendingKinds.length,0);
 const Core=require('../src/core.js'),restored=Core.restore(JSON.stringify(saved));assert.equal(restored.positions.filter(p=>p.kind===100).length,70);
 assert.equal(restored.positions.filter(p=>p.kind===2000005).length,130);
});
test('explicit additions keep exact species behind deferred restoration and persist unmounted animals',async()=>{
 const Core=require('../src/core.js'),state=Core.fresh();state.outside=1000;
 state.positions=Array.from({length:1000},()=>({x:.2,y:.5,kind:7}));
 const {ctx,store}=await bootstrap(state),custom=ctx.customInstance;assert.equal(typeof custom.onManualAdd,'function');
 assert.equal(custom.onManualAdd(2000005,130),130);const early=JSON.parse(store.get('pet-catch-v1'));
 assert.equal(early.positions.length,1000);assert.equal(early.pendingKinds.length,130);
 const reloaded=await bootstrap(early);for(let t=0;t<500;t+=1000/60)reloaded.ctx.frame(t);
 reloaded.ctx.intervals.find(x=>x.delay===2500).fn();const saved=JSON.parse(reloaded.store.get('pet-catch-v1'));
 assert.equal(saved.outside,1130);assert.equal(saved.positions.length,1130);
 assert.equal(saved.positions.filter(p=>p.kind===7).length,1000);assert.equal(saved.positions.filter(p=>p.kind===2000005).length,130);
 assert.equal(saved.pendingKinds.length,0);
});
test('manual species additions tag only actual capacity and respect an opening box reservation',async()=>{
 const Core=require('../src/core.js'),Box=require('../src/blind-box.js'),state=Core.fresh();state.outside=99990;
 Core.enqueue(state,1);Core.startBox(state,()=>0,[{id:'reserved',name:'Reserved',gift:'',mode:'fixed',count:8,min:8,max:8,enabled:true}],null,Box);
 assert.equal(state.current.count,8);
 const {ctx,store}=await bootstrap(state),custom=ctx.customInstance;assert.equal(typeof custom.onManualAdd,'function');
 assert.equal(custom.onManualAdd(4,10),2);let saved=JSON.parse(store.get('pet-catch-v1'));
 assert.equal(saved.outside,99992);assert.equal(saved.pendingKinds.length,2);assert(saved.pendingKinds.every(k=>k===4));
 assert.equal(custom.onManualAdd(4,1),0);saved=JSON.parse(store.get('pet-catch-v1'));assert.equal(saved.pendingKinds.length,2);
});
test('invalid species, avatar kinds, bad counts and unavailable personal material never add animals',async()=>{
 const {ctx,store}=await bootstrap(),custom=ctx.customInstance;assert.equal(typeof custom.onManualAdd,'function');
 custom.cfg.customCows.push({kind:100,name:'Missing',category:'custom',enabled:false});
 for(const kind of [-1,95,999999,1000000,1999999,2000999,100,'0'])assert.equal(custom.onManualAdd(kind,1),0);
 for(const n of [0,-1,1.1,10001,NaN,Infinity,'1'])assert.equal(custom.onManualAdd(0,n),0);
 assert.equal(ctx.effectInstance.getState().outside,0);assert.equal(store.get('pet-catch-v1'),undefined);
});
test('Duck theme rejects non-ducks without replacing them silently and allows actual duck species',async()=>{
 const {ctx,document}=await bootstrap(),custom=ctx.customInstance;assert.equal(typeof custom.onManualAdd,'function');
 assert.equal(custom.setTheme('yajiji'),true);const before=JSON.stringify(custom.cfg);
 assert.equal(custom.onManualAdd(0,1),0);assert.match(document.getElementById('toast').textContent,/先切换主题/);
 assert.equal(custom.onManualAdd(2000005,2),2);assert.equal(JSON.stringify(custom.cfg),before);
 const cows=ctx.effectInstance.getCows();assert.equal(cows.length,2);assert(cows.every(c=>c.kind===2000005&&c.visualKind===2000005));
});
test('the actual gallery card quantity and plus button reach the saved species-specific population',async()=>{
 const {ctx,document,store}=await bootstrap(),custom=ctx.customInstance;
 custom.cfg.cowSettings[0].enabled=false;custom.renderCows();
 const card=document.getElementById('cow-gallery').children.find(c=>Number(c.dataset.cow)===0);
 assert(card);const controls=card.children.find(c=>c.className==='species-add-controls');assert(controls);
 const [quantity,button]=controls.children;quantity.value='7';button.click();
 const state=JSON.parse(store.get('pet-catch-v1'));assert.equal(state.outside,7);assert.equal(state.positions.length,7);
 assert(state.positions.every(p=>p.kind===0));assert.equal(custom.cfg.cowSettings[0].enabled,false);
 assert.equal(quantity.value,'7');assert.match(document.getElementById('toast').textContent,/已加入 7 只/);
});


test('enabling and lowering the scene limit parks real species without changing either ledger',async()=>{
 const {ctx,document,store}=await bootstrap();ctx.customInstance.onManualAdd(0,3);ctx.customInstance.onManualAdd(2000005,5);
 applyLimit(document,3);let saved=flushSave(ctx,store);
 assert.equal(ctx.effectInstance.getCows().length,3);assert.equal(saved.outside,8);assert.equal(saved.home,0);
 assert.equal(saved.positions.length,8);assert.equal(saved.positions.filter(p=>p.kind===2000005).length,5);
 assert.match(document.getElementById('population-status').textContent,/场内 3 \/ 3 只.*候场 5 只/);
 assert.equal(document.getElementById('waiting-label').textContent,'候场');
 ctx.customInstance.onManualAdd(4,2);runFrames(ctx);saved=flushSave(ctx,store);
 assert.equal(ctx.effectInstance.getCows().length,3);assert.equal(saved.outside,10);assert.deepEqual(saved.pendingKinds,[4,4]);
 assert.equal(JSON.parse(store.get('pet-catch-v1-settings')).sceneLimit,3);
});
test('a freed scene slot admits the parked species before newly added waiting species',async()=>{
 const {ctx,document,store}=await bootstrap();ctx.customInstance.onManualAdd(0,3);ctx.customInstance.onManualAdd(2000005,5);applyLimit(document,3);
 const fx=ctx.effectInstance;assert.equal(fx.collect([fx.getCows()[0]]),1);runFrames(ctx);const saved=flushSave(ctx,store);
 assert.equal(fx.getCows().length,3);assert.equal(saved.outside,7);assert.equal(saved.home,1);
 assert.equal(fx.getCows().filter(p=>p.kind===2000005).length,1);assert.equal(saved.positions.length,7);
});
test('disabling the optional limit admits every waiting pet without duplicates',async()=>{
 const {ctx,document,store}=await bootstrap();ctx.customInstance.onManualAdd(2000005,9);applyLimit(document,2);applyLimit(document,2,false);runFrames(ctx);
 const saved=flushSave(ctx,store);assert.equal(ctx.effectInstance.getCows().length,9);assert.equal(saved.positions.length,9);assert.equal(saved.outside,9);
 assert(saved.positions.every(p=>p.kind===2000005));assert.equal(saved.pendingKinds.length,0);
 assert.equal(JSON.parse(store.get('pet-catch-v1-settings')).sceneLimitEnabled,false);assert.equal(document.getElementById('sceneLimit').disabled,true);
});
test('new saved limits survive refresh with waiting coordinates and species intact',async()=>{
 const Core=require('../src/core.js'),state=Core.fresh();state.outside=8;state.positions=Array.from({length:8},(_,i)=>({x:.2,y:.5,kind:i<3?0:2000005,windAttempt:i}));
 const first=await bootstrap(state,{sceneLimitEnabled:true,sceneLimit:3});applyLimit(first.document,3);runFrames(first.ctx);const saved=flushSave(first.ctx,first.store);
 assert.equal(first.ctx.effectInstance.getCows().length,3);assert.equal(saved.positions.length,8);
 const second=await bootstrap(saved,JSON.parse(first.store.get('pet-catch-v1-settings')));runFrames(second.ctx);
 const again=flushSave(second.ctx,second.store);assert.equal(second.ctx.effectInstance.getCows().length,3);assert.equal(again.outside,8);assert.equal(again.positions.length,8);
 assert.deepEqual(again.positions.map(p=>p.windAttempt).sort((a,b)=>a-b),[0,1,2,3,4,5,6,7]);
});
test('invalid limit drafts never change an already committed cap or remove waiting animals',async()=>{
 const {ctx,document,store}=await bootstrap();ctx.customInstance.onManualAdd(0,6);applyLimit(document,3);
 for(const invalid of ['',0,-1,1.5,100001,'not a number']){applyLimit(document,invalid);runFrames(ctx);const saved=flushSave(ctx,store);
  assert.equal(ctx.effectInstance.getCows().length,3);assert.equal(saved.outside,6);assert.equal(saved.positions.length,6);
  assert.equal(JSON.parse(store.get('pet-catch-v1-settings')).sceneLimit,3);assert.equal(document.getElementById('sceneLimit').getAttribute('aria-invalid'),'true');
 }
});
test('a physically opening box finishes its ledger and queue while the scene is full',async()=>{
 const {ctx,document,store}=await bootstrap();ctx.customInstance.onManualAdd(0,2);applyLimit(document,2);
 ctx.customInstance.commitBoxTiers([{id:'full',name:'Full box',gift:'Heart',mode:'fixed',count:4,min:4,max:4,enabled:true}]);
 ctx.customInstance.boxEditor.reset();
 assert.equal(ctx.customInstance.boxEditor.testGift('full'),true);for(let t=0;t<3500;t+=1000/60)ctx.frame(t);
 const saved=flushSave(ctx,store);assert.equal(saved.outside,6);assert.equal(saved.current,null);assert.equal(saved.queue,0);assert.equal(ctx.effectInstance.getCows().length,2);
 applyLimit(document,2,false);runFrames(ctx);assert.equal(ctx.effectInstance.getCows().length,6);
});
test('recall consumes parked and newly queued pets once, even when requested count exceeds scene limit',async()=>{
 const {ctx,document,store}=await bootstrap();ctx.customInstance.onManualAdd(0,3);ctx.customInstance.onManualAdd(2000005,5);applyLimit(document,3);ctx.customInstance.onManualAdd(4,2);
 const fx=ctx.effectInstance;assert.equal(fx.collectWaiting(100,fx.getCows().length,Date.now()),7);fx.refresh();runFrames(ctx);
 let saved=flushSave(ctx,store);assert.equal(saved.outside,3);assert.equal(saved.home,7);assert.equal(saved.positions.length,3);assert.equal(saved.pendingKinds.length,0);
 assert.equal(saved.recentHomes.reduce((n,r)=>n+(r.kind===2000005?r.count:0),0),5);assert.equal(saved.recentHomes.reduce((n,r)=>n+(r.kind===4?r.count:0),0),2);
 assert.equal(fx.collect(fx.getCows().slice()),3);runFrames(ctx);saved=flushSave(ctx,store);assert.equal(saved.outside,0);assert.equal(saved.home,10);assert.equal(saved.positions.length,0);assert.equal(fx.getCows().length,0);
});
test('lowering the cap cancels parked ball visuals without revealing their detached actors later',async()=>{
 const {ctx,document,store}=await bootstrap();ctx.customInstance.cfg.ballMode=true;ctx.customInstance.onManualAdd(0,8);applyLimit(document,2);runFrames(ctx);
 const fx=ctx.effectInstance,saved=flushSave(ctx,store);assert.equal(fx.getCows().length,2);assert.equal(saved.outside,8);assert.equal(saved.positions.length,8);
 const active=document.all.filter(n=>n.className==='seal-ball-flight'&&n.isConnected);assert(active.length<=2);
});
test('malformed or missing stored limit values cannot silently enable a default cap',async()=>{
 const Core=require('../src/core.js'),state=Core.fresh();state.outside=300;state.pendingKinds=Array(300).fill(0);
 for(const invalid of ['bad',null,{},undefined,-1,100001]){
  const {ctx,document,store}=await bootstrap(state,{sceneLimitEnabled:true,sceneLimit:invalid});runFrames(ctx);
  assert.equal(document.getElementById('sceneLimitEnabled').checked,false);assert.equal(ctx.effectInstance.getCows().length,300);
  assert.equal(flushSave(ctx,store).outside,300);
 }
});
test('other settings changes preserve the unapplied scene-limit draft',async()=>{
 const {ctx,document}=await bootstrap();ctx.customInstance.onManualAdd(0,20);applyLimit(document,10);
 const input=document.getElementById('sceneLimit'),toggle=document.getElementById('sceneLimitEnabled'),bg=document.getElementById('bg');
 input.value='7';bg.value='checker';for(const listener of bg.events.change||[])listener({target:bg});
 assert.equal(input.value,'7');assert.equal(toggle.checked,true);assert.equal(ctx.effectInstance.getCows().length,10);
 document.getElementById('apply-scene-limit').click();assert.equal(ctx.effectInstance.getCows().length,7);
 toggle.checked=false;for(const listener of toggle.events.change||[])listener({target:toggle});
 bg.value='transparent';for(const listener of bg.events.change||[])listener({target:bg});
 assert.equal(toggle.checked,false);assert.equal(input.disabled,true);assert.equal(ctx.effectInstance.getCows().length,7);
 document.getElementById('apply-scene-limit').click();runFrames(ctx);assert.equal(ctx.effectInstance.getCows().length,20);
});
test('the app keeps each native accessory on the same actual pose frame and clears it for uploaded skins',async()=>{
 const {ctx,store}=await bootstrap(),custom=ctx.customInstance,fx=ctx.effectInstance;
 for(const kind of [72,74,79,92,93,94])custom.onManualAdd(kind,1);
 for(const c of fx.getCows()){assert(c.accessory&&!c.accessory.hidden);assert(c.accessory.style.backgroundImage.includes(c.accessoryAsset.src));c.airborne=false;c.roamVX=1;c.roamVY=0;c.turnIn=100;c.wait=0;c.x=400;c.y=c.targetY=450;}
 for(let t=0;t<2000;t+=1000/60){ctx.frame(t);for(const c of fx.getCows()){assert.equal(c.accessory.style.transform,c.sprite.style.transform);if(!c.sprite.hidden){assert.equal(c.accessory.style.backgroundPosition,c.sprite.style.backgroundPosition);assert.equal(c.accessory.style.backgroundSize,'1200% 100%');}}}
 const saved=flushSave(ctx,store);assert.equal(saved.outside,6);assert.deepEqual(saved.positions.map(p=>p.kind),[72,74,79,92,93,94]);
 custom.records.set('cow:93',{type:'image',data:'data:image/png;base64,aA=='});custom.onChange();
 assert.equal(fx.getCows().find(c=>c.kind===93).accessory.hidden,true);
 assert.equal(custom.cowPreview(93),'data:image/png;base64,aA==');
 assert.equal(custom.setTheme('yajiji'),true);assert(fx.getCows().every(c=>c.accessory.hidden));
});
test('new friend kinds preserve their motion routes through pending recall and refresh',async()=>{
 const {ctx,document,store}=await bootstrap(),custom=ctx.customInstance,fx=ctx.effectInstance,kinds=[2000008,2000009,2000010,2000011];
 applyLimit(document,3);for(const kind of kinds)assert.equal(custom.onManualAdd(kind,5),5);
 assert.deepEqual(kinds.map(k=>custom.cowMotion(k)),['hop','walk','prowl','scoot']);
 assert.equal(fx.getCows().length,3);assert.equal(fx.collectWaiting(6,3,Date.now()),6);fx.refresh();
 const saved=flushSave(ctx,store);assert.equal(saved.outside,14);assert.equal(saved.home,6);assert.equal(saved.recentHomes.reduce((n,r)=>n+(r.kind===2000008?r.count:0),0),2);assert.equal(saved.recentHomes.reduce((n,r)=>n+(r.kind===2000009?r.count:0),0),4);
 const next=await bootstrap(saved,JSON.parse(store.get('pet-catch-v1-settings')));runFrames(next.ctx);const again=flushSave(next.ctx,next.store);
 assert.equal(next.ctx.effectInstance.getCows().length,3);assert.equal(again.outside,14);assert.equal(again.home,6);
 assert.equal(again.positions.length+again.pendingKinds.length,14);assert(again.positions.every(p=>kinds.includes(p.kind)));assert(again.pendingKinds.every(k=>kinds.includes(k)));
});
