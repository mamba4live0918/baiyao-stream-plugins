const test=require('node:test'),assert=require('node:assert/strict');
const {Game}=require('../src/engine.js');
const make=(physicsMode='arcade',config={})=>new Game({physicsMode,random:()=>.5,levels:[{targetHeight:10000,duration:3600,spawnInterval:5,...config}]});
const step=(g,t)=>{for(let i=0;i<Math.round(t*120);i++)g.step(1/120);};
function catchOne(g){g.start();for(let i=0;i<1500&&!g.caught;i++)g.step(1/120);assert.equal(g.caught,1);step(g,.3);return g.scoops[0];}
test('reverse affects pointer and keys, expires and does not teleport the plate',()=>{
 const g=make();assert.equal(g.effect('reverse',1),true);g.setPointerTarget(900);step(g,.1);assert.ok(g.bowls[0].x<500);
 g.setMoveDirection(1);const x=g.bowls[0].x;step(g,.1);assert.ok(g.bowls[0].x<x);
 g.start();step(g,1.1);g.setMoveDirection(1);const after=g.bowls[0].x;step(g,.1);assert.ok(g.bowls[0].x>after);
});
for(const mode of ['arcade','realistic','sticky'])test(mode+': freeze stops only the plate; timer and falling balls keep moving',()=>{
 const g=make(mode);g.start();step(g,.1);const s=g.scoops[0],y=s.body.position.y,t=g.timeLeft;
 assert.equal(g.effect('freeze',.5),true);g.setMoveDirection(1);const x=g.bowls[0].x;step(g,.3);
 assert.equal(g.bowls[0].x,x);assert.ok(s.body.position.y>y);assert.ok(g.timeLeft<t);
 step(g,.4);assert.ok(g.bowls[0].x>x);
});
test('temporary plate width has a 1.5-diameter floor and restores its configured width',()=>{
 const g=make('sticky');assert.equal(g.effect('plate_narrow',99,{duration:.5}),true);
 assert.ok(g.bowls[0].width>=g.rowRadius*3);assert.ok(g.bowls[0].width<g.config.bowlWidth);
 assert.ok(Math.abs(g.physics.plate.bounds.max.x-g.physics.plate.bounds.min.x-g.bowls[0].width)<.001);
 g.start();step(g,.6);assert.equal(g.bowls[0].width,g.config.bowlWidth);
});
test('a gift gust works in a non-wind level and expires independently of the ambient mode',()=>{
 const g=make();g.start();step(g,.1);const s=g.scoops[0],x=s.body.position.x;
 assert.equal(g.effect('gust_left',2,{duration:.5}),true);step(g,.3);assert.ok(s.body.position.x<x-20);assert.equal(g.wind.direction,-1);
 step(g,.3);assert.equal(g.wind.direction,0);
});
for(const mode of ['arcade','realistic','sticky'])test(mode+': melting shrinks existing geometry and can remove scoops without recording misses',()=>{
 const g=make(mode);const s=catchOne(g),r=s.r,oldHeight=g.height;
 assert.equal(g.effect('melt',100,{duration:2}),true);step(g,.4);assert.ok(s.r<r*.7);
 assert.ok(s.body.bounds.max.x-s.body.bounds.min.x<r*2*.8);
 step(g,.7);assert.ok(!g.scoops.includes(s));assert.equal(g.missed,0);assert.ok(g.height<oldHeight);
});
for(const mode of ['arcade','realistic','sticky'])test(mode+': hard ice is round and bouncy, severs adhesion, then restores the selected material',()=>{
 const g=make(mode);const s=catchOne(g);assert.equal(g.effect('ice',1),true);
 assert.ok(g.physics);assert.equal(s.hardIce,true);assert.ok(s.body.circleRadius>0);assert.ok(s.body.restitution>=.4);assert.ok(s.body.friction<.1);assert.equal(g.physics.bonds.size,0);
 step(g,1.1);assert.equal(s.hardIce,false);assert.equal(g.physicsMode,mode);
 if(mode==='arcade')assert.equal(g.physics,null);else assert.equal(s.body.restitution,0);
});
test('pause freezes all effect clocks; retry clears effects and restores plate and material',()=>{
 const g=make();g.start();g.effect('melt',10,{duration:5});g.effect('freeze',3);g.effect('ice',5);g.effect('plate_wide',50,{duration:5});
 assert.ok(g.tricks);g.pause();const before=JSON.stringify(g.tricks.snapshot());step(g,10);assert.equal(JSON.stringify(g.tricks.snapshot()),before);
 g.reset({level:1});assert.deepEqual(g.tricks.snapshot(),[]);assert.equal(g.physics,null);assert.equal(g.bowls[0].width,g.config.bowlWidth);
});
test('repeat timed gifts extend their timer rather than toggling the effect off',()=>{
 const g=make();g.start();g.effect('freeze',1);step(g,.4);g.effect('freeze',1);g.setMoveDirection(1);
 const x=g.bowls[0].x;step(g,1.2);assert.equal(g.bowls[0].x,x);step(g,.5);assert.ok(g.bowls[0].x>x);
});
test('melting a fixed tower does not block subsequent automatic drops',()=>{
 const g=make('arcade',{spawnInterval:.15});g.start();while(g.caught<3)g.step(1/120);
 const original=g.scoops.slice(),count=g.dropped;g.effect('melt',10,{duration:4});step(g,3);
 assert.ok(g.dropped>count+1);assert.ok(original.every(s=>s.r<s.meltBaseRadius*.75));
 assert.ok(g.height>=0&&Number.isFinite(g.height));
});
test('ice conversion changes actual rebound and also affects new arrivals',()=>{
 const g=make();g.effect('ice',10);g.start();step(g,.1);const s=g.scoops[0];
 let rebound=false;for(let i=0;i<360;i++){g.step(1/120);if(s.contacted&&s.body.velocity.y<-1){rebound=true;break;}}
 assert.ok(rebound,'hard ice should physically bounce, not merely change colour');
 assert.ok(s.hardIce&&s.body.circleRadius);assert.equal(g.physics.bonds.size,0);
});
test('restoring arcade material keeps unique identities and lets automatic play resume',()=>{
 const g=make('arcade',{spawnInterval:.15});catchOne(g);g.effect('ice',1);step(g,1.2);
 assert.equal(g.physics,null);const dropped=g.dropped;step(g,4);
 assert.ok(g.dropped>dropped);assert.equal(new Set(g.scoops.map(s=>s.body.id)).size,g.scoops.length);
});
test('all timed effects can coexist with physical melting without non-finite bodies',()=>{
 const g=make('sticky');catchOne(g);g.effect('ice',1);g.effect('melt',40,{duration:2});g.effect('gust_right',2,{duration:1});g.effect('freeze',.3);g.effect('plate_narrow',99,{duration:1});
 step(g,3);assert.deepEqual(g.tricks.snapshot(),[]);assert.equal(g.physicsMode,'sticky');
 assert.ok(g.scoops.every(s=>Number.isFinite(s.body.position.x)&&Number.isFinite(s.body.position.y)&&s.r>0));
});
