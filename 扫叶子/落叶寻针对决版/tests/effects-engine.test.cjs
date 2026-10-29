const {test}=require('node:test'),assert=require('node:assert/strict');
const {EffectEngine,defaultConfig}=require('../src/effects.js');
const {Pile,rng,above}=require('../src/pile.js');
const {Camera}=require('../src/camera.js');
const {discs}=require('./helpers.cjs');
const cam=new Camera({elevation:60}),T0=10000;

// 固定种子：seed 7、1200 片时针在 (44,-9)，上方 16 层；目标点默认就在针上
function setup({seed=7,count=1200,needle=true,target=null,adjust=null,config=defaultConfig(),bucket=[],pileOpts={},...rest}={}){
  const pile=new Pile({masks:discs(),seed,count,...pileOpts}).generate();
  const n=needle?pile.placeNeedle({minCover:9,cameraPos:cam.position}):null;
  const calls=[],tg=target||(n?{x:n.x,y:n.y}:{x:30,y:10});
  const eng=new EffectEngine({pile,config,random:rng(seed*31+1),getTarget:()=>tg,adjustLanding:p=>{calls.push(p);return adjust?adjust(p):p;},bucket,cameraPos:()=>cam.position,...rest});
  return{pile,n,eng,calls,bucket,tg};
}
const run=(eng,from,to,step=50)=>{const ev=[];for(let t=from;t<=to;t+=step)ev.push(...eng.update(t));return ev;};
const falls=(ev,kind)=>ev.filter(e=>e.type==='fall'&&(!kind||e.kind===kind));
const flies=(ev,into)=>ev.filter(e=>e.type==='fly'&&(!into||e.into===into));
const dist=(p,q)=>Math.hypot(p[0]-q.x,p[1]-q.y);
// 一轮轮剥表层：被拿走的叶子，中心上方不能还压着没被拿走的叶子
const peeledFromTop=(pile,taken)=>taken.every(l=>!pile.leaves.some(o=>above(o,l)&&pile.maskAt(o,l.x,l.y)));
const dig=(pile,c,r)=>pile.removeMany(pile.leaves.filter(l=>Math.hypot(l.x-c.x,l.y-c.y)<r));
const spyDrops=pile=>{const out=[],orig=pile.dropLeaf.bind(pile);pile.dropLeaf=o=>{out.push(o);return orig(o);};return out;};
const bucketOf=n=>Array.from({length:n},(_,i)=>({x:(i%40)*20-400,y:Math.floor(i/40)*15-60,yaw:i*0.3,size:90+i%20,type:i%6,at:i}));

test('drift: count × portions new leaves aimed around the target, added to the pile only as each one lands',()=>{
  const {pile,eng,tg}=setup(),N=pile.leaves.length,drops=spyDrops(pile);
  const r=eng.trigger('drift','medium',1,T0),fs=falls(r.visual,'drift');
  assert.equal(r.ok,true);assert.equal(fs.length,15);assert.equal(r.visual.length,15);
  for(const e of fs){
    assert.ok(e.t0>=T0&&e.t0<e.t1&&e.t1>=T0+1000&&e.t1<=T0+1600,`${e.t0}–${e.t1}`);
    assert.ok(dist(e.to,tg)<=110+1e-9);assert.ok(e.from[2]>e.to[2]);
    assert.ok(e.leaf.size>=pile.sizeMin&&e.leaf.size<=pile.sizeMax&&Number.isInteger(e.leaf.type)&&e.leaf.type>=0&&e.leaf.type<6&&Number.isFinite(e.leaf.yaw));
  }
  assert.equal(pile.leaves.length,N,'nothing is in the pile while it falls');
  const mid=T0+1300,early=fs.filter(e=>e.t1<=mid).length;
  assert.ok(early>0&&early<15);eng.update(mid);assert.equal(pile.leaves.length,N+early);
  eng.update(T0+1600);assert.equal(pile.leaves.length,N+15);assert.equal(eng.pending.length,0);
  assert.deepEqual(drops.map(o=>[o.x,o.y]).sort(),fs.map(e=>[e.to[0],e.to[1]]).sort());
  const big=falls(setup().eng.trigger('drift','large',3,T0).visual),R=110*Math.sqrt(120/15);
  assert.equal(big.length,120);assert.ok(big.every(e=>dist(e.to,tg)<=R+1e-9));
  assert.ok(big.some(e=>dist(e.to,tg)>150),'a big batch spreads wider instead of stacking a tower');
});

test('several gifts only multiply the portions, never the tier',()=>{
  for(const [id,tier,count,pick] of [['drift','small',5,r=>falls(r.visual).length],['sweep','medium',8,r=>flies(r.visual,'bucket').length],['tailwind','small',25,r=>flies(r.visual,'away').length],['burst','medium',60,r=>falls(r.visual).length]]){
    const one=setup({bucket:bucketOf(400)}).eng.trigger(id,tier,1,T0),three=setup({bucket:bucketOf(400)}).eng.trigger(id,tier,3,T0);
    assert.deepEqual([pick(one),pick(three)],[count,3*count],id);
  }
  const {eng}=setup({needle:false,count:100});
  eng.trigger('frost','large',3,T0);assert.deepEqual(eng.state.frost.stack,[35,35,35]);
  eng.trigger('time','small',3,T0);assert.equal(eng.state.timeBonus,45);
  eng.trigger('quick','small',3,T0);assert.deepEqual(eng.state.quick,{until:T0+15000,layers:2});
});

test('sweep: the topmost leaves around the target fly into the bucket one by one',()=>{
  const {pile,eng,bucket,tg}=setup(),N=pile.leaves.length;
  const r=eng.trigger('sweep','medium',1,T0),fl=flies(r.visual);
  assert.equal(fl.length,8);assert.ok(fl.every(e=>e.into==='bucket'));assert.equal(pile.leaves.length,N-8);
  // 半径 80 内的叶子可能被中心在圈外的叶子压着，剥不动时扩到下一圈 140
  assert.ok(peeledFromTop(pile,fl.map(e=>e.leaf)));assert.ok(fl.every(e=>!pile.leaves.includes(e.leaf)&&dist([e.leaf.x,e.leaf.y],tg)<=140));
  assert.deepEqual(bucket.map(b=>[b.x,b.y,b.yaw,b.size,b.type,b.at]),fl.map(e=>[e.leaf.x,e.leaf.y,e.leaf.yaw,e.leaf.size,e.leaf.type,T0]));
  assert.ok(fl.every((e,i)=>!i||e.t0>fl[i-1].t0),'one after another');assert.ok(Math.max(...fl.map(e=>e.t1))<=T0+1500);
  assert.deepEqual(fl[0].to,eng.bucketPos);assert.deepEqual(fl[0].from,[fl[0].leaf.x,fl[0].leaf.y,fl[0].leaf.z]);
  const b=setup(),rb=flies(b.eng.trigger('sweep','large',30,T0).visual);
  assert.equal(rb.length,600,'the radius grows until there are enough');assert.equal(b.bucket.length,600);
  assert.ok(peeledFromTop(b.pile,rb.map(e=>e.leaf)));assert.ok(rb.every(e=>dist([e.leaf.x,e.leaf.y],tg)<=600));
  assert.ok(Math.max(...rb.map(e=>e.t1))<=T0+1500,'even a big sweep is over in about 1.5 s');
});

test('tailwind: blows the leaves off the target area and out of the view, not into the bucket',()=>{
  const {pile,eng,bucket}=setup(),N=pile.leaves.length,V=eng.view;
  const fl=flies(eng.trigger('tailwind','medium',1,T0).visual);
  assert.equal(fl.length,40);assert.ok(fl.every(e=>e.into==='away'));assert.equal(pile.leaves.length,N-40);assert.equal(bucket.length,0);
  assert.ok(peeledFromTop(pile,fl.map(e=>e.leaf)));
  const right=fl[0].to[0]>0;assert.ok(fl.every(e=>right?e.to[0]>V.x1:e.to[0]<V.x0),'all leave on one side, past the edge of the view');
  eng.flushAll();assert.equal(pile.leaves.length,N-40,'they never come back');
});

test('burst: the bucket bulges, then the latest picked leaves fall back onto their own spots',()=>{
  const bucket=bucketOf(100),last=bucket.slice(40).map(b=>({...b})),{pile,eng}=setup({bucket}),N=pile.leaves.length;
  const r=eng.trigger('burst','medium',1,T0);
  assert.deepEqual(r.visual[0],{type:'burst',t0:T0,t1:T0+500});assert.equal(bucket.length,40);
  const fs=falls(r.visual,'burst');assert.equal(fs.length,60);
  assert.ok(fs.every(e=>e.t0>=T0+500&&e.t1-e.t0>=500&&e.t1-e.t0<=1200));assert.deepEqual(fs[0].from,eng.bucketPos);
  const key=o=>[o.x,o.y,o.yaw,o.size,o.type].join();
  assert.deepEqual(fs.map(e=>key(e.leaf)).sort(),last.map(key).sort());
  eng.update(T0+999);assert.equal(pile.leaves.length,N);
  eng.flushAll();assert.equal(pile.leaves.length,N+60);
  for(const b of last)assert.ok(pile.leaves.some(l=>l.x===b.x&&l.y===b.y&&l.type===b.type),'back where it was picked');
  const few=setup({bucket:bucketOf(10)}),rf=few.eng.trigger('burst','large',2,T0);
  assert.equal(falls(rf.visual).length,10);assert.equal(few.bucket.length,0);assert.ok(!rf.capped,'an emptier bucket is not a cap');
  assert.deepEqual(setup().eng.trigger('burst','small',1,T0).visual.map(e=>e.type),['burst'],'an empty bucket still bulges');
});

test('gust: leaves upwind of the target slide into the pits next to it; the total stays the same',()=>{
  const {pile,eng,tg}=setup();dig(pile,tg,60);
  const N=pile.leaves.length,r=eng.trigger('gust','medium',1,T0),g=r.visual[0];
  assert.deepEqual([g.type,Math.abs(g.dir),g.center,g.t0,g.t1],['gust',1,{x:tg.x,y:tg.y},T0,T0+1400]);
  const fs=falls(r.visual,'gust'),up={x:tg.x-g.dir*300,y:tg.y};
  assert.equal(fs.length,40);assert.equal(pile.leaves.length,N-40);
  for(const e of fs){assert.ok(dist(e.from,up)<=150+1e-9,'taken upwind');assert.ok(dist(e.to,tg)<=146,'lands by the target');assert.ok(e.t0===T0&&e.t1>=T0+800&&e.t1<=T0+1400);}
  const inPit=fs.filter(e=>pile.isPit(e.to[0],e.to[1])).length;assert.ok(inPit>=20,`${inPit}/40 aimed at pits`);
  eng.update(T0+1400);assert.equal(pile.leaves.length,N);
});

test('rain: new leaves, seven in ten aimed at pits (the pile once pits are full), the rest anywhere in view',()=>{
  const view={x0:-700,y0:-300,x1:700,y1:600},{pile,eng,tg}=setup({view});dig(pile,tg,60);
  const N=pile.leaves.length,fs=falls(eng.trigger('rain','medium',1,T0).visual,'rain');
  assert.equal(fs.length,120);assert.ok(fs.every(e=>e.t0>=T0&&e.t0<e.t1&&e.t1>=T0+600&&e.t1<=T0+2200));
  const inPile=e=>(e.to[0]/pile.a)**2+(e.to[1]/pile.b)**2<=1,pit=e=>pile.isPit(e.to[0],e.to[1]);
  const pits=fs.filter(pit).length,aimed=fs.filter(e=>pit(e)||inPile(e)).length,out=fs.filter(e=>!pit(e)&&!inPile(e));
  assert.ok(pits>=10,`${pits} into the pit`);assert.ok(pits<84,'a filled pit stops taking leaves');assert.ok(aimed>=84,`${aimed} aimed`);
  assert.ok(out.length>=5,'some overflow outside the pile');assert.ok(out.every(e=>e.to[0]>=view.x0&&e.to[0]<=view.x1&&e.to[1]>=view.y0&&e.to[1]<=view.y1));
  const lastAt=Math.max(...fs.map(e=>e.t1));
  eng.update(lastAt-1);assert.equal(pile.leaves.length,N+119);eng.update(lastAt);assert.equal(pile.leaves.length,N+120);
});

test('scene effects queue per effect: the next starts 0.5 s after the previous ends; different effects run side by side',()=>{
  const {eng}=setup();
  const r=eng.trigger('rain','small',3,T0);
  assert.equal(falls(r.visual,'rain').length,60);assert.deepEqual(eng.queue,[{id:'rain',tier:'small'},{id:'rain',tier:'small'}]);
  assert.ok(eng.trigger('gust','small',1,T0+10).visual.some(e=>e.type==='gust'),'another effect starts right away');
  assert.ok(eng.trigger('sun','small',1,T0+20).visual.some(e=>e.type==='sun'));
  assert.equal(falls(eng.update(T0+2699),'rain').length,0);assert.equal(eng.queue.length,2);
  assert.equal(falls(eng.update(T0+2700),'rain').length,60);assert.equal(eng.queue.length,1);
  eng.update(T0+5399);assert.equal(eng.queue.length,1);
  assert.equal(falls(eng.update(T0+5400),'rain').length,60);assert.deepEqual(eng.queue,[]);
  eng.trigger('tornado','small',2,T0+6000);eng.trigger('tornado','large',1,T0+6000);
  assert.deepEqual(JSON.parse(JSON.stringify(eng.queue)),[{id:'tornado',tier:'small'},{id:'tornado',tier:'large'}],'waiting entries are plain {id,tier}');
});
test('tornado: comes in from outside the view and lifts leaves only where the funnel is, frame by frame',()=>{
  const {pile,eng,tg}=setup({needle:false}),N=pile.leaves.length;
  const tor=eng.trigger('tornado','medium',1,T0).visual[0];
  assert.deepEqual([tor.type,tor.radius,tor.t0,tor.t1],['tornado',100,T0,T0+6000]);
  const ends=[tor.path[0][0],tor.path.at(-1)[0]];
  assert.ok(Math.min(...ends)<eng.view.x0&&Math.max(...ends)>eng.view.x1,'enters and leaves outside the view');
  assert.ok(tor.path.some(p=>dist(p,tg)<=100),'passes the target');
  assert.equal(pile.leaves.length,N,'nothing is lifted before the funnel arrives');
  const gone=[],ev=[];
  for(let t=T0;t<T0+6000;t+=50){ev.push(...eng.update(t));gone.push(N-pile.leaves.length);}
  assert.equal(gone[10],0,'0.5 s in, the funnel is still on bare ground');
  const q=gone.length,marks=[gone[q/4|0],gone[q/2|0],gone[3*q/4|0]];
  assert.ok(marks[0]<marks[1]&&marks[1]<marks[2],`lifted so far ${marks}`);
  const lifted=flies(ev,'tornado');assert.equal(lifted.length,gone[q-1]);assert.ok(lifted.length>=60&&lifted.length<=120,`${lifted.length}`);
  assert.ok(lifted.every(e=>e.tornado===tor.id&&Math.hypot(e.from[0]-e.to[0],e.from[1]-e.to[1])<=100+1e-9),'taken from under the funnel');
  assert.ok(peeledFromTop(pile,lifted.map(e=>e.leaf)));
  const back=falls(eng.update(T0+6000),'tornado');
  assert.equal(back.length,lifted.length);assert.equal(eng.tornadoes.length,0);
  run(eng,T0+6050,T0+7200);assert.equal(pile.leaves.length,N,'every lifted leaf is scattered back');
});

test('tornado: needleDepth decides whether the needle goes; a tossed needle lands ≥ 250 away and is buried only after it lands',()=>{
  const a=setup(),ea=[...a.eng.trigger('tornado','small',1,T0).visual,...run(a.eng,T0,T0+4100)];
  assert.ok(!ea.some(e=>e.type==='needleToss'));assert.equal(a.pile.needle,a.n,'needleDepth 0 never takes the needle');
  const shallow=defaultConfig();shallow.params.tornado.large.needleDepth=3;
  const b=setup({config:shallow});b.eng.trigger('tornado','large',1,T0);
  assert.ok(!run(b.eng,T0,T0+9100).some(e=>e.type==='needleToss'),'a needle deeper than needleDepth stays');assert.equal(b.pile.needle,b.n);
  const deep=defaultConfig();deep.params.tornado.large.needleDepth=60;
  const {pile,n,eng}=setup({config:deep}),old=[n.x,n.y,n.z],N=pile.leaves.length,ev=[];
  eng.trigger('tornado','large',1,T0);
  for(let t=T0;t<=T0+9000&&!ev.some(e=>e.type==='needleToss');t+=50)ev.push(...eng.update(t));
  const toss=ev.find(e=>e.type==='needleToss'),m=pile.needle;
  assert.ok(toss,'the funnel passes over the needle');assert.notEqual(m,n);
  assert.deepEqual(toss.from,old);assert.deepEqual(toss.to,[m.x,m.y,m.z]);
  assert.ok(Math.hypot(m.x-old[0],m.y-old[1])>=250);assert.ok((m.x/pile.a)**2+(m.y/pile.b)**2<=1,'lands on the pile');
  const bury=falls(ev,'bury'),hid=eng.state.needleHiddenUntil;
  assert.ok(bury.length>0&&bury.length<=60);assert.equal(hid,Math.max(...bury.map(e=>e.t1)));
  assert.ok(bury.every(e=>e.t1>toss.t1&&Math.hypot(e.to[0]-m.x,e.to[1]-m.y)<=50+1e-6),'leaves fall along the needle after it lands');
  assert.equal(pile.minCover(),0,'until then nothing lies on it');
  eng.update(hid-1);assert.ok(eng.pending.length>0,'the last burying leaf is still in the air');assert.ok(eng.state.needleHiddenUntil>eng.now);
  eng.update(hid);assert.ok(pile.minCover()>=10,`minCover ${pile.minCover()}`);assert.equal(pile.exposure(cam.position).ratio,0);
  run(eng,hid,T0+10500);assert.equal(pile.leaves.length,N+bury.length,'lifted leaves come back, plus the ones that buried the needle');
});

test('flushAll lands everything now: a running tornado ends, a tossed needle is fully buried, waiting scenes stay queued',()=>{
  const deep=defaultConfig();deep.params.tornado.large.needleDepth=60;
  const {pile,eng}=setup({config:deep}),N=pile.leaves.length,ev=[];
  ev.push(...eng.trigger('tornado','large',2,T0).visual,...eng.trigger('drift','small',1,T0).visual);
  for(let t=T0;t<=T0+9000&&!ev.some(e=>e.type==='needleToss');t+=50)ev.push(...eng.update(t));
  assert.ok(ev.some(e=>e.type==='needleToss'));assert.ok(pile.leaves.length<N,'the funnel is carrying leaves');
  eng.flushAll();
  assert.deepEqual([eng.tornadoes.length,eng.pending.length],[0,0]);assert.deepEqual(eng.queue,[{id:'tornado',tier:'large'}]);
  assert.ok(pile.minCover()>=10);assert.equal(pile.exposure(cam.position).ratio,0);assert.ok(eng.state.needleHiddenUntil<=eng.now);
  assert.equal(pile.leaves.length,N+5+falls(ev,'bury').length);
  const now=eng.now;assert.ok(!eng.update(now+499).some(e=>e.type==='tornado'));assert.ok(eng.update(now+500).some(e=>e.type==='tornado'),'the next one keeps the 0.5 s gap');
});

test('frost: layers stack per portion, block picking, crack per click, break layer by layer, and creep back when left alone',()=>{
  const {eng}=setup({needle:false,count:100});
  assert.deepEqual(eng.frostClick(T0),[]);assert.equal(eng.canPick(),true);
  assert.deepEqual(eng.trigger('frost','medium',2,T0).visual,[{type:'frost',layers:2,need:20}]);assert.equal(eng.canPick(),false);
  eng.trigger('frost','small',1,T0);assert.deepEqual(eng.state.frost.stack,[20,20,10],'another tier only sets the new layer');
  let t=T0;const click=()=>eng.frostClick(t+=10);
  for(let i=1;i<20;i++)assert.deepEqual(click(),[{type:'frostCrack',progress:i,need:20,layers:3}]);
  assert.deepEqual(click(),[{type:'frostLayer',layers:2,need:20}]);
  for(let i=1;i<20;i++)click();assert.deepEqual(click(),[{type:'frostLayer',layers:1,need:10}]);
  for(let i=1;i<10;i++)click();assert.equal(eng.canPick(),false);
  assert.deepEqual(click(),[{type:'frostBreak'}]);assert.equal(eng.canPick(),true);
  assert.deepEqual(eng.state.frost,{layers:0,progress:0,need:0,stack:[],lastClick:t});
  eng.trigger('frost','small',1,t);for(let i=0;i<5;i++)click();
  const last=t,F=eng.state.frost;
  assert.deepEqual(eng.update(last+1499),[]);assert.equal(F.progress,5);
  assert.deepEqual(eng.update(last+1500),[{type:'frostCrack',progress:4,need:10,layers:1,decay:true}]);
  eng.update(last+1899);assert.equal(F.progress,4);eng.update(last+1900);assert.equal(F.progress,3);
  t=last+2000;click();assert.equal(F.progress,4);eng.update(t+1499);assert.equal(F.progress,4,'a click restarts the 1.5 s wait');
  eng.update(t+60000);assert.deepEqual([F.progress,F.layers],[0,1],'creeping back never melts a layer');
});

test('quick: seconds pile onto the remaining time, layers keep the larger value while it lasts, ten minutes at most',()=>{
  const {eng}=setup({needle:false,count:100});
  assert.equal(eng.pickLayers(T0),1);
  assert.deepEqual(eng.trigger('quick','medium',2,T0).visual,[{type:'quick',until:T0+20000,layers:3}]);assert.equal(eng.pickLayers(T0+19999),3);
  eng.trigger('quick','small',1,T0+1000);assert.deepEqual(eng.state.quick,{until:T0+25000,layers:3});
  eng.trigger('quick','large',1,T0+2000);assert.deepEqual(eng.state.quick,{until:T0+45000,layers:4});
  eng.update(T0+44999);assert.equal(eng.pickLayers(),4);
  eng.update(T0+45000);assert.deepEqual(eng.state.quick,{until:0,layers:1});assert.equal(eng.pickLayers(),1);
  eng.trigger('quick','small',1,T0+50000);assert.deepEqual(eng.state.quick,{until:T0+55000,layers:2},'once it ran out the old layers no longer count');
  const r=eng.trigger('quick','large',1000,T0+50000);assert.equal(r.capped,true);assert.deepEqual(eng.state.quick,{until:T0+650000,layers:4});
});

test('sun: a circle of area% of the pile that always contains the needle, cleared when its time is up',()=>{
  const {pile,n,eng}=setup(),R=Math.sqrt(0.25*pile.a*pile.b);
  const e=eng.trigger('sun','medium',1,T0).visual[0];
  assert.deepEqual([e.type,e.t0,e.t1],['sun',T0,T0+8000]);assert.ok(Math.abs(e.radius-R)<1e-9);
  assert.ok(Math.hypot(e.center.x-n.x,e.center.y-n.y)<=0.6*R+1e-9);
  assert.deepEqual(eng.state.sun,{until:T0+8000,center:e.center,radius:e.radius,start:T0});
  eng.update(T0+7999);assert.ok(eng.state.sun);eng.update(T0+8000);assert.equal(eng.state.sun,null);
  const offs=[];
  for(let s=1;s<=30;s++){const v=new EffectEngine({pile,random:rng(s)}).trigger('sun','large',1,T0).visual[0];assert.ok(Math.abs(v.radius-Math.sqrt(0.125*pile.a*pile.b))<1e-9);offs.push(Math.hypot(v.center.x-n.x,v.center.y-n.y)/v.radius);}
  assert.ok(Math.max(...offs)<=0.6+1e-9&&Math.max(...offs)>0.3,'the centre wanders but the needle stays inside');
  const bare=setup({needle:false}),b=bare.eng.trigger('sun','small',1,T0).visual[0];
  assert.ok((b.center.x/bare.pile.a)**2+(b.center.y/bare.pile.b)**2<=1,'with no needle it shines on a random spot of the pile');
});

test('time: seconds × portions add up',()=>{
  const {eng}=setup({needle:false,count:100});
  assert.deepEqual(eng.trigger('time','medium',2,T0).visual,[{type:'time',seconds:60}]);
  eng.trigger('time','small',1,T0);assert.equal(eng.state.timeBonus,75);
});

test('landing points are pushed when chosen and again just before landing, since the face circle may move meanwhile',()=>{
  let circle={x:0,y:0,r:0};
  const push=p=>{const dx=p.x-circle.x,dy=p.y-circle.y,d=Math.hypot(dx,dy);return d>=circle.r?p:d<1e-9?{x:circle.x+circle.r,y:circle.y}:{x:circle.x+dx/d*circle.r,y:circle.y+dy/d*circle.r};};
  const {pile,eng,calls,tg}=setup({adjust:p=>push(p)});
  circle={x:tg.x,y:tg.y,r:60};
  const fs=falls(eng.trigger('drift','large',1,T0).visual);
  assert.equal(calls.length,40);assert.ok(fs.every(e=>dist(e.to,circle)>=60-1e-6));
  circle={x:tg.x+100,y:tg.y,r:120};
  const before=pile.leaves.length;eng.update(T0+1600);
  assert.equal(calls.length,80);assert.ok(pile.leaves.slice(before).every(l=>Math.hypot(l.x-circle.x,l.y-circle.y)>=120-1e-6),'landed outside where the circle is now');
});

test('every effect sends its landing points through adjustLanding: once when chosen, once more just before landing',()=>{
  const deep=defaultConfig();deep.params.tornado.large.needleDepth=60;
  const snap=p=>({x:Math.round(p.x)+0.25,y:Math.round(p.y)+0.25}),frac=v=>v-Math.floor(v);
  const {pile,eng,calls}=setup({config:deep,adjust:snap,bucket:bucketOf(80)}),drops=spyDrops(pile),ev=[];
  for(const [id,tier] of [['drift','medium'],['gust','medium'],['rain','small'],['burst','small'],['tornado','large']])ev.push(...eng.trigger(id,tier,1,T0).visual);
  ev.push(...run(eng,T0,T0+11000,40));
  const bury=falls(ev,'bury').length;assert.ok(ev.some(e=>e.type==='needleToss')&&bury>0,'the tornado took the needle');
  assert.equal(eng.pending.length,0);
  assert.ok(drops.every(o=>frac(o.x)===0.25&&frac(o.y)===0.25),'nothing lands on a point adjustLanding did not give');
  assert.equal(drops.length-bury,falls(ev).length,'one real drop per falling leaf (the burial is simulated once beforehand)');
  assert.ok(calls.length>=2*falls(ev).length);
  assert.ok(falls(ev).every(e=>frac(e.to[0])===0.25&&frac(e.to[1])===0.25),'animations aim at the adjusted point');
});

test('landing points stay finite and inside the bounds with a hostile adjustLanding, a broken bucket and a target off the map',()=>{
  let k=0;const hostile=p=>[{x:p.x+1e6,y:-1e6},{x:NaN,y:p.y},null,{x:Infinity,y:p.y},{x:'1',y:2}][k++%5];
  const bucket=[{x:1e9,y:-1e9,yaw:NaN,size:'big',type:42,at:0},{x:NaN,y:5},{},null,...bucketOf(20)];
  const {pile,eng}=setup({adjust:hostile,bucket,target:{x:9e9,y:-9e9}}),drops=spyDrops(pile),ev=[];
  for(const id of ['drift','gust','rain','burst','tornado','sweep','tailwind','sun'])ev.push(...eng.trigger(id,'small',2,T0).visual);
  ev.push(...run(eng,T0,T0+12000,100));eng.flushAll();
  const P=pile,inside=(x,y)=>Number.isFinite(x)&&Number.isFinite(y)&&x>=P.x0+20&&x<=P.x0+P.w-20&&y>=P.y0+20&&y<=P.y0+P.h-20;
  assert.ok(drops.length>=24+120,`${drops.length} drops`);assert.ok(drops.every(o=>inside(o.x,o.y)),'every dropLeaf gets a clean point');
  assert.ok(falls(ev).every(e=>inside(e.to[0],e.to[1])&&e.from.every(Number.isFinite)));
  assert.ok(pile.leaves.every(l=>Number.isFinite(l.x+l.y+l.z+l.yaw)&&l.size>0&&Number.isInteger(l.type)&&l.type>=0&&l.type<6));
});

test('limits keep huge gifts bounded',()=>{
  assert.deepEqual(EffectEngine.LIMITS,{quantity:1500,sceneQueue:50,frost:99,quickMs:600000,leaves:8000,bury:60});
  const {eng}=setup({needle:false,count:300});
  let r=eng.trigger('drift','large',1e6,T0);assert.deepEqual([falls(r.visual).length,r.capped],[1500,true]);
  r=eng.trigger('tailwind','large',1e6,T0);assert.equal(r.capped,true);
  r=eng.trigger('rain','small',80,T0);assert.deepEqual([r.capped,r.dropped,eng.queue.length],[true,30,49]);
  r=eng.trigger('frost','small',500,T0);assert.deepEqual([r.capped,eng.state.frost.layers],[true,99]);
  const big=setup({needle:false,count:7900,pileOpts:{a:1100,b:440},bucket:bucketOf(50)});
  r=big.eng.trigger('drift','large',1e6,T0);assert.deepEqual([falls(r.visual).length,r.capped],[100,true],'pile + falling leaves stop at 8000');
  r=big.eng.trigger('rain','large',1,T0);assert.deepEqual([falls(r.visual).length,r.capped],[0,true]);
  r=big.eng.trigger('burst','medium',1,T0);assert.deepEqual([falls(r.visual).length,r.capped,big.bucket.length],[0,true,50],'leaves that cannot come back stay in the bucket');
  r=big.eng.trigger('gust','small',1,T0);assert.ok(falls(r.visual).length>0&&!r.capped,'moving leaves around is never capped');
  big.eng.flushAll();assert.equal(big.pile.leaves.length,8000);
});

test('trigger rejects unknown effects and tiers, portions that are not positive whole numbers, and a missing clock',()=>{
  const {pile,eng}=setup({needle:false,count:100}),N=pile.leaves.length;
  for(const [id,tier,p,now] of [['boom','small',1,T0],['constructor','small',1,T0],['drift','huge',1,T0],['drift','small',0,T0],['drift','small',1.5,T0],['drift','small','2',T0],['drift','small',-1,T0],['drift','small',1,NaN]]){
    const r=eng.trigger(id,tier,p,now);assert.deepEqual([r.ok,r.visual],[false,[]],`${id} ${tier} ${p}`);assert.ok(typeof r.reason==='string'&&r.reason.length>0);
  }
  assert.deepEqual([eng.pending.length,eng.queue.length,pile.leaves.length],[0,0,N]);assert.deepEqual(eng.update(NaN),[]);
});

test('setConfig changes later triggers only; leaves already in the air keep their numbers',()=>{
  const {pile,eng}=setup({needle:false,count:300}),N=pile.leaves.length;
  eng.trigger('drift','small',1,T0);
  const cfg=defaultConfig();cfg.params.drift.small.count=50;eng.setConfig(cfg);
  assert.equal(eng.pending.length,5);assert.equal(falls(eng.trigger('drift','small',1,T0).visual).length,50);
  eng.setConfig({params:{drift:{small:{count:9999}}}});assert.equal(eng.config.params.drift.small.count,5,'an invalid value falls back to the default');
  eng.flushAll();assert.equal(pile.leaves.length,N+55);
});
