const test=require('node:test'),assert=require('node:assert/strict'),C=require('../src/core.js'),Motion=require('../src/motion.js');
const walk={type:'walk',frameWidth:256,fps:8,contactFrames:[0,2],advance:[9,9,9,9],offsetY:[0,1,0,1],mirror:true};
test('a standard walker already inside the expanded nest exits rather than oscillating at frame zero',()=>{
 const spec={type:'walk',frameWidth:256,fps:8,pivot:[128,192],contactFrames:[0,2],advance:[9,9,9,9],offsetY:[0,1,0,1],mirror:true};
 const p={x:450,y:450,facing:1,roamVX:1,roamVY:0,turnIn:1000,walkFrames:4,articulated:true,spriteMotion:spec},o={enabled:true,size:142,speed:45,radius:100,bounds:{left:0,right:1280,top:0,bottom:900},obstacle:{x:500,y:400,w:200,h:200}};
 const frames=new Set();let exited=false;
 for(let i=0;i<600;i++){const x=p.x,y=p.y;Motion.step(p,.03,o,'walk',C,()=>.5);frames.add(p.hopFrame);assert(Math.hypot(p.x-x,p.y-y)<=9*(142/256)*8*1.3*.03+1e-7,'escape must not teleport');if(p.x<=400||p.x>=800||p.y<=300||p.y>=700)exited=true;}
 assert(exited,'actor must actually exit instead of turning forever');assert(frames.size>1,'walking frames must advance');
});
test('reconstructed DOM failure position escapes the actual expanded nest at bounded speed',()=>{
 const spec={type:'walk',frameWidth:256,fps:8,pivot:[128,192],contactFrames:[0,2],advance:[9,9,9,9],offsetY:[0,1,0,1],mirror:true};
 const p={x:907.828125,y:501.8281555175781,facing:1,roamVX:1,roamVY:0,turnIn:2,walkFrames:4,articulated:true,spriteMotion:spec};
 const o={enabled:true,size:141.65625,speed:45,radius:100.159375,bounds:{left:38.4,right:1241.6,top:315,bottom:756},obstacle:{x:946.890625,y:534.25,w:231,h:200.75}};
 const left=o.obstacle.x-o.radius,frames=new Set();let exited=false;
 for(let i=0;i<600;i++){const x=p.x,y=p.y;Motion.step(p,.03,o,'walk',C,()=>.5);frames.add(p.hopFrame);assert(Math.hypot(p.x-x,p.y-y)<=9*(o.size/256)*8*1.3*.03+1e-7);if(p.x<=left+1e-8)exited=true;}
 assert(exited);assert(frames.size>1);assert(p.turnIn<1000,'normal roaming timer should not remain frozen');
});
test('an obstacle covering the entire accessible roam area leaves the pet stationary and finite',()=>{
 const spec={...walk,advance:[9,9,9,9],frameWidth:256},p={x:100,y:100,facing:1,roamVX:1,roamVY:0,turnIn:100,walkFrames:4,articulated:true,spriteMotion:spec};
 const o={enabled:true,size:100,speed:45,radius:20,bounds:{left:0,right:200,top:0,bottom:200},obstacle:{x:0,y:0,w:200,h:200}};
 for(let i=0;i<300;i++)Motion.step(p,.03,o,'walk',C,()=>.5);
 assert.deepEqual([p.x,p.y,p.hopFrame,p.motionStage],[100,100,0,'rest']);assert(Number.isFinite(p.x)&&Number.isFinite(p.y));
});
test('a standard walker approaching the expanded nest from outside does not enter it',()=>{
 const spec={...walk,advance:[9,9,9,9],frameWidth:256},p={x:399,y:450,facing:1,roamVX:1,roamVY:0,turnIn:1000,walkFrames:4,articulated:true,spriteMotion:spec},o={enabled:true,size:142,speed:45,radius:100,bounds:{left:0,right:1280,top:0,bottom:900},obstacle:{x:500,y:400,w:200,h:200}};
 for(let i=0;i<100;i++){Motion.step(p,.03,o,'walk',C,()=>.5);assert(p.x<=400+1e-7,'walker must stay outside expanded nest');}
});

