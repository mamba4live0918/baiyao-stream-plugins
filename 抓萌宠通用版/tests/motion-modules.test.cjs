const test=require('node:test');
const assert=require('node:assert/strict');
const C=require('../src/core.js');
const Motion=require('../src/motion.js');

const options={enabled:true,speed:60,size:90,radius:20,bounds:{left:0,right:1000,top:0,bottom:700}};
const pet=()=>({x:300,y:400,size:90,held:false,airborne:false,roamVX:1,roamVY:0,turnIn:100,wait:0,animClock:0,motionClock:0});

test('六种默认运动模组呈现不同速度和身体姿态',()=>{
 const dog=pet(),cow=pet(),cat=pet(),slime=pet(),sheep=pet(),seal=pet();seal.hopWait=0;
 for(let i=0;i<45;i++)for(const [p,mode]of [[dog,'run'],[cow,'plod'],[cat,'prowl'],[slime,'squish'],[sheep,'hop'],[seal,'scoot']])Motion.step(p,1/60,options,mode,C,()=>.8);
 assert(dog.x>cow.x+25,'小狗应跑得比小牛快');
 assert.notEqual(dog.hopScaleX,cow.hopScaleX);
 assert(cat.motionStage==='prowl'||cat.motionStage==='pounce');
 assert(sheep.maxLift<-20,'小羊有明显跳跃');
 assert(seal.maxLift<-20,'海豹蓄力后有明显跳跃');
 assert.equal(slime.motionStage,'squish');
});

test('抓住、空中和关闭动画时停止自主运动并重置形变',()=>{
 for(const field of ['held','airborne']){const p=pet();p[field]=true;p.hopLift=-20;p.hopScaleX=1.2;const x=p.x;Motion.step(p,.1,options,'run',C,()=>.8);assert.equal(p.x,x);assert.equal(p.hopLift,0);assert.equal(p.hopScaleX,1);}
 const p=pet();p.hopLift=-10;Motion.step(p,.1,{...options,enabled:false},'scoot',C,()=>.8);assert.equal(p.hopLift,0);assert.equal(p.walking,false);
});

test('头像浮动模组保持平缓位移并有轻微上下漂浮',()=>{
 const p=pet();for(let i=0;i<30;i++)Motion.step(p,1/60,options,'float',C,()=>.8);
 assert(p.x>300&&p.x<345);
 assert(Math.abs(p.hopLift)>0&&Math.abs(p.hopLift)<15);
});
