const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {bootstrap}=require('./helpers/app-harness.cjs'),Core=require('../src/core.js');
const app=()=>fs.readFileSync(path.join(__dirname,'../src/app.js'),'utf8');
function renderer(){const source=app(),count={styles:0,data:0,hidden:0};
 const style=()=>new Proxy({},{set(o,k,v){count.styles++;o[k]=String(v).replaceAll(',',', ');return true;}});
 const node=()=>{let hidden=false;return{style:style(),dataset:new Proxy({},{set(o,k,v){count.data++;o[k]=v;return true;}}),isConnected:true,get hidden(){return hidden;},set hidden(v){count.hidden++;hidden=v;}};};
 const context={reduced:()=>false};vm.runInNewContext(source.slice(source.indexOf('function sequenceFrame('),source.indexOf('function penRect('))+';globalThis.render=renderCow;',context);
 return{count,render:context.render,pet:{el:node(),im:node(),sprite:node(),x:100,y:180,size:85,articulated:true,walkFrames:30,walkMode:'default',motionStage:'walk',hopFrame:4,facing:1,walking:true}};
}
test('unchanged poses do not repeatedly submit styles, hidden flags or frame attributes',()=>{
 const f=renderer();f.render(f.pet);Object.keys(f.count).forEach(k=>f.count[k]=0);
 for(let i=0;i<120;i++)f.render(f.pet);
 assert.deepEqual(f.count,{styles:0,data:0,hidden:0});
});
test('cached poses still update frames and repair styles changed by another interaction',()=>{
 const f=renderer(),p=f.pet;f.render(p);p.sprite.style.transform='scale(99)';f.render(p);assert.equal(p.sprite.style.transform,'scale(1, 1)');
 p.hopFrame=29;p.facing=-1;f.render(p);assert.equal(p.sprite.style.backgroundPosition,'100% 0');assert.equal(p.el.dataset.frame,29);assert.equal(p.im.style.transform,'scale(-1, 1)');
 p.held=true;f.render(p);assert.equal(p.im.hidden,false);assert.equal(p.sprite.hidden,true);assert.equal(p.el.dataset.frame,0);
});
test('one animation frame computes shared activity bounds once for many pets',async()=>{
 const s=Core.fresh();s.outside=200;s.positions=Array.from({length:200},()=>({kind:0,x:.3,y:.6}));const f=await bootstrap(s);
 for(let t=0;t<100;t+=16)f.ctx.frame(t);assert.equal(f.ctx.effectInstance.getCows().length,200);
 const pixels=f.ctx.PetRoamGeometry.pixels;let calls=0;f.ctx.PetRoamGeometry.pixels=(...args)=>{calls++;return pixels(...args);};f.ctx.frame(200);
 assert.equal(calls,1);
});
test('an entry batch synchronizes its positions once and retains every deferred kind',async()=>{
 const s=Core.fresh();s.outside=200;s.positions=Array.from({length:200},(_,i)=>({kind:i%80,x:.3,y:.6}));const f=await bootstrap(s),Type=f.ctx.PetPopulationView,original=Type.prototype.sync;let calls=0;
 Type.prototype.sync=function(){calls++;return original.call(this);};f.ctx.frame(100);
 assert.equal(calls,1);assert.equal(f.ctx.effectInstance.getState().positions.length,200);
 assert.deepEqual(Array.from(f.ctx.effectInstance.getState().positions,p=>p.kind),Array.from({length:200},(_,i)=>i%80));
});
