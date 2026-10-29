const test=require('node:test'),assert=require('node:assert/strict');
const Hud=require('../src/effect-hud.js');
const {Game}=require('../src/engine.js');
test('HUD uses accumulated game time and freezes with the game',()=>{
 const g=new Game();g.effect('reverse',5);g.effect('freeze',3);g.effect('reverse',5);
 let rows=Hud.rows(g.tricks.snapshot());assert.equal(rows.length,2);assert.equal(rows[0].time,'00:10');assert.equal(rows[0].fraction,1);
 g.start();for(let i=0;i<120;i++)g.step(1/120);g.pause();const before=Hud.rows(g.tricks.snapshot());g.step(1);assert.deepEqual(Hud.rows(g.tricks.snapshot()),before);
 g.resume();for(let i=0;i<360;i++)g.step(1/120);rows=Hud.rows(g.tricks.snapshot());assert.equal(rows.length,1);assert.ok(rows[0].fraction<.7);
 g.effect('reverse',5);rows=Hud.rows(g.tricks.snapshot());assert.equal(rows[0].fraction,1);assert.ok(rows[0].remaining>10);
 g.reset();assert.deepEqual(Hud.rows(g.tricks.snapshot()),[]);
});
test('HUD normalizes old or malformed settings without sharing per-effect objects',()=>{
 const p=Hud.normalize({cards:{reverse:{size:90,x:2,y:-1},freeze:{size:32,x:.2,y:.3}},opacity:0});
 assert.equal(p.opacity,0);assert.equal(p.cards.reverse.size,64);assert.equal(p.cards.reverse.x,1);assert.equal(p.cards.reverse.y,0);assert.equal(p.cards.freeze.size,32);assert.equal(p.cards.ice.x,null);assert.notEqual(p.cards.ice,p.cards.melt);
 assert.deepEqual(Hud.normalize(null),Hud.normalize({}));
});
test('automatic HUD cards remain on screen without overlap at desktop and narrow sizes',()=>{
 for(const [w,h] of [[1280,720],[390,844],[320,480]]){
 const p=Hud.normalize();for(const v of Object.values(p.cards))v.size=64;
 const boxes=Hud.layout(Hud.ACTIONS,p,w,h);assert.equal(boxes.length,8);
 for(const b of boxes){assert.ok(b.x>=0&&b.y>=0);assert.ok(b.x+b.width<=w+.01&&b.y+b.height<=h+.01);}
 for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){const a=boxes[i],b=boxes[j];assert.ok(a.x+a.width<=b.x+.01||b.x+b.width<=a.x+.01||a.y+a.height<=b.y+.01||b.y+b.height<=a.y+.01);}
 }
});
test('a manually positioned HUD keeps its position while other effects enter and expire',()=>{
 const p=Hud.normalize({cards:{ice:{size:30,x:.2,y:.4}}});
 const one=Hud.layout(['ice'],p,1000,800)[0],many=Hud.layout(['reverse','freeze','ice'],p,1000,800).find(r=>r.action==='ice');assert.deepEqual(one,many);assert.equal(one.x,200);assert.equal(one.y,320);
});
test('time display rounds up active fractions and supports minutes',()=>{
 assert.equal(Hud.formatTime(.01),'00:01');assert.equal(Hud.formatTime(600),'10:00');assert.equal(Hud.formatTime(65.1),'01:06');
 assert.deepEqual(Hud.rows([{action:'blast',remaining:5},{action:'reverse',remaining:0}]),[]);
});
