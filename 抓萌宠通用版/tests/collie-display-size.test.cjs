const test=require('node:test'),assert=require('node:assert/strict'),C=require('../src/core.js'),m=require('../素材/manifest-v144.json'),{bootstrap}=require('./helpers/app-harness.cjs');
test('11ris native artwork gets a 1.5 display correction while other species keep their scale',async()=>{
 const f=await bootstrap(C.fresh(),null,{assets:m}),c=f.ctx.customInstance;
 assert.equal(c.cowScale(2000041),3);assert.equal(c.cowScale(2000040),2);assert.equal(c.cowScale(2000039),2);assert.equal(c.cowScale(0),2);
 assert.equal(c.cowSetting(2000041).scale,200,'Do not overwrite the viewer size setting');
});
test('saved size controls and uploaded replacement images retain their meaning',async()=>{
 const cfg={defaultsV116:true,tiers:C.defaultTiers(),cowSettings:m.cows.map(()=>({enabled:true,scale:100,fps:8,motion:'default'}))};
 const f=await bootstrap(C.fresh(),null,{assets:m,customSaved:cfg}),c=f.ctx.customInstance;
 assert.equal(c.cowScale(2000041),1.5);assert.equal(c.cowScale(2000039),1);
 c.records.set('cow:2000041',{type:'image',data:'data:image/png;base64,AA=='});
 assert.equal(c.cowScale(2000041),1,'Correction applies to native art, not a user replacement');
});
test('actual actor dimensions expand with the artwork so hit and movement sizing remain consistent',async()=>{
 const state=C.fresh();state.outside=2;state.positions=[{kind:2000041,x:.4,y:.5},{kind:2000039,x:.6,y:.5}];
 const f=await bootstrap(state,null,{assets:m,customSaved:{tiers:C.defaultTiers(),roamTop:10,roamBottom:90}}),actors=f.ctx.effectInstance.getCows();
 const collie=actors.find(x=>x.kind===2000041),other=actors.find(x=>x.kind===2000039);
 assert(Math.abs(collie.size/other.size-1.5)<1e-8);assert.equal(collie.el.style.width,collie.size+'px');assert.equal(collie.spriteMotion.frameWidth,256);assert.equal(collie.walkFrames,4);
});
