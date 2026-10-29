const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const Core=require('../src/core.js'),Motion=require('../src/motion.js');
const {bootstrap}=require('./helpers/app-harness.cjs');
const options={enabled:true,speed:45,size:170,radius:0,bounds:{left:0,right:10000,top:0,bottom:10000}};
function actor(strideScale){return{x:300,y:300,roamVX:1,roamVY:0,turnIn:100,wait:0,articulated:true,walkFrames:30,strideScale};}
test('a short-legged painted walk completes its cycle over the authored short step distance',()=>{
 const short=actor(.32),legacy=actor();for(let i=0;i<72;i++){Motion.step(short,1/60,options,'walk',Core);Motion.step(legacy,1/60,options,'walk',Core);}
 assert.equal(short.x,legacy.x);assert(short.poseClock>.98&&short.poseClock<1.01);
 assert(legacy.poseClock>.57&&legacy.poseClock<.59);
 const clock=short.poseClock;short.wait=2;Motion.step(short,1/60,options,'walk',Core);assert.equal(short.poseClock,clock);
});
test('new native stride reaches the actor while an uploaded replacement resets it',async()=>{
 const old=JSON.parse(fs.readFileSync(path.join(__dirname,'../素材/manifest-v131.json'),'utf8'));
 const {composeCatalog}=require('../开发/小棕熊与乔治-2026-10-13/integration/compose-catalog-v132.cjs');
 const assets=composeCatalog(old);const row=assets.cows.find(c=>c.kind===2000024);row.strideScale=.32;
 const f=await bootstrap(null,null,{assets,realEffects:true}),custom=f.ctx.customInstance;
 custom.onManualAdd(2000024,1);const p=f.ctx.effectInstance.getCows()[0];assert.equal(p.strideScale,.32);
 custom.records.set('cow:2000024',{type:'image',data:'data:image/png;base64,AQID'});custom.onChange();assert.equal(p.strideScale,undefined);
});
