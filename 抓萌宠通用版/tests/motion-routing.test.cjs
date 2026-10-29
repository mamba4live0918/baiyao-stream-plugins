const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../src/app.js'),'utf8');

test('图鉴动作配置进入场内角色，身体倾斜显示在渲染姿态',()=>{
 const a=source.indexOf('function size()'),b=source.indexOf('function ballBurst(',a),c=source.indexOf('function sequenceFrame('),d=source.indexOf('function penRect(',c);
 assert(a>=0&&b>a&&c>b&&d>c);
 const ctx={C:require('../src/core.js'),PetRoamGeometry:require('../src/roam-geometry.js'),W:1280,H:720,prefs:{size:90},state:{avatarKinds:[]},custom:{cowScale:()=>1,cowWalk:()=>null,cowFrameMeta:()=>({kind:'image',frames:1,fps:0}),cowSource:()=> 'dog.png',cowStaticSource:()=> 'dog.png',cowName:()=> '小狗',cowMotion:()=> 'run'},reduced:()=>false};
 vm.runInNewContext(source.slice(a,b)+source.slice(c,d)+';globalThis.api={cowVisual,renderCow};',ctx);
 const pet={kind:0,x:300,y:400,size:90,held:false,airborne:false,facing:1,motionTilt:7,hopLift:0,hopScaleX:1,hopScaleY:1,el:{style:{},dataset:{},setAttribute(){}},im:{style:{}},sprite:{style:{}}};
 ctx.api.cowVisual(pet);ctx.api.renderCow(pet);
 assert.equal(pet.motionMode,'run');
 assert.match(pet.el.style.transform,/rotate\(7deg\)/);
 assert.equal(pet.el.dataset.motion,'run');
});
