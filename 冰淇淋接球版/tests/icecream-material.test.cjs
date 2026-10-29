const {test}=require('node:test'),assert=require('node:assert/strict');
const {Game}=require('../src/engine.js'),Matter=require('../vendor/matter.min.js');
const material=require('../src/rigid-physics.js');
const make=mode=>new Game({physicsMode:mode,adhesion:.65,random:()=>.5,levels:[{id:'soft',mode:'classic',targetHeight:10000,duration:180,move:300,fall:1,bowlWidth:260,spawnInterval:5}]});
function settle(g){g.start();for(let i=0;i<600&&g.progressHeight<20;i++)g.step(1/120);assert(g.progressHeight>20);return g.scoops[0];}

test('ice cream lands without a rubber-ball rebound in either dynamic mode',()=>{
  for(const mode of ['realistic','sticky']){
    const g=make(mode);g.start();let contactY=null,minY=Infinity,up=0;
    for(let i=0;i<400;i++){g.step(1/120);const s=g.scoops[0];if(!s)continue;if(s.contacted&&contactY===null)contactY=s.body.position.y;if(contactY!==null){minY=Math.min(minY,s.body.position.y);up=Math.max(up,-s.body.velocity.y*60);}}
    assert(contactY!==null);assert(contactY-minY<2,mode+' rebounded '+(contactY-minY)+'px');assert(up<15,mode+' upward rebound '+up+'px/s');
  }
});

test('separated scoops release instead of being pulled back by stored spring extension',()=>{
  const g=make('sticky'),s=settle(g);assert(g.physics.bonds.size>0);
  Matter.Body.setPosition(s.body,{x:s.body.position.x,y:s.body.position.y-7});Matter.Body.setVelocity(s.body,{x:0,y:0});
  g.step(1/120);assert.equal(g.physics.bonds.size,0,'a visible air gap must end surface adhesion');assert(s.body.velocity.y*60<20,'former patch must not accelerate a separated scoop back');
});

test('a detached upper scoop does not pull the lower scoop into the air',()=>{
  const g=make('sticky'),lower=settle(g);g._pendingBatch=null;g._cooldown=0;g.nextSpawnIn=0;assert(g.drop());
  for(let i=0;i<600&&g.progressHeight<75;i++)g.step(1/120);assert(g.progressHeight>75);const upper=g.scoops[1],before=lower.body.position.y;
  Matter.Body.setPosition(upper.body,{x:upper.body.position.x,y:upper.body.position.y-8});Matter.Body.setVelocity(upper.body,{x:0,y:0});g.step(1/120);
  assert(![...g.physics.bonds.values()].some(b=>b.a===upper.body||b.b===upper.body));assert(lower.body.position.y>=before-.5);assert(-lower.body.velocity.y*60<10);
});

test('landing compression relaxes once and never stretches like a bouncing rubber ball',()=>{
  assert.equal(typeof material.compression,'function');let last=Infinity;
  for(let i=0;i<=120;i++){const shape=material.compression(i/120,1,true);assert(shape>=0&&shape<=.4);assert(shape<=last+1e-8,'compression oscillates');last=shape;}
  assert(material.compression(0,1,true)>material.compression(.3,1,true)+.1);assert.equal(material.compression(10,0,false),0);
});

test('moving plate rim cannot catapult a scoop that has already slipped below its top',()=>{
  const g=make('sticky'),s=settle(g);Matter.Body.setPosition(s.body,{x:642,y:693});Matter.Body.setVelocity(s.body,{x:0,y:0});
  g.setMoveDirection(1);let up=0;for(let i=0;i<12;i++){g.step(1/120);up=Math.max(up,-s.body.velocity.y*60);}assert(up<15,'side of plate launched fallen scoop at '+up+'px/s');
});
