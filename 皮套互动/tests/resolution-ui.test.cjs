const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const C=require('../src/core.js');
const source=fs.readFileSync(path.join(__dirname,'../src/app.js'),'utf8');
function extract(name){
  const start=source.indexOf('function '+name+'(');
  if(start<0)return '';
  const next=source.indexOf('\nfunction ',start+1);
  return source.slice(start,next<0?source.length:next);
}
function fixture(){
  const elements={};
  for(const id of ['world','preview-shell','preview','canvas-info','scene-width','scene-height','resolution-select','custom-resolution'])elements[id]={style:{},value:'',hidden:false,clientWidth:602};
  elements['scene-width'].value='1920';elements['scene-height'].value='1080';elements['resolution-select'].value='1920x1080';elements['custom-resolution'].hidden=true;
  elements['resolution-select'].options=['1280x720','1920x1080','2560x1440','3840x2160','720x1280','1080x1920','custom'].map(value=>({value}));
  const context=vm.createContext({C,config:{scene:{width:1920,height:1080}},$:id=>elements[id],window:{innerWidth:1360,innerHeight:900},positionMarkers(){},stopAll(){},remember(){},loadProfile(){},renderAll(){},persist(){},toast(){}});
  context.key=()=>C.aspectKey(context.config.scene.width,context.config.scene.height);
  vm.runInContext(extract('syncResolutionControls')+'\n'+extract('renderScene')+'\n'+extract('applyResolution'),context);
  context.renderAll=()=>context.renderScene();
  const start=source.indexOf("$('resolution-select').onchange=");
  const end=source.indexOf("$('apply-resolution').onclick=",start);
  vm.runInContext(source.slice(start,end),context);
  return {elements,context};
}
test('selecting custom survives preview ResizeObserver redraw',()=>{
  const {elements:e,context:c}=fixture();e['resolution-select'].value='custom';e['resolution-select'].onchange();
  c.renderScene();assert.equal(e['resolution-select'].value,'custom');assert.equal(e['custom-resolution'].hidden,false);
});
test('unapplied dimensions survive window resize while geometry still updates',()=>{
  const {elements:e,context:c}=fixture();e['resolution-select'].value='custom';e['resolution-select'].onchange();e['scene-width'].value='1234';e['scene-height'].value='777';
  c.window.innerWidth=1000;c.window.innerHeight=750;c.renderScene();
  assert.equal(e['scene-width'].value,'1234');assert.equal(e['scene-height'].value,'777');
  assert.equal(e.world.style.left,'0px');assert.equal(e.world.style.top,'93.75px');
});
test('choosing already active preset exits custom mode intentionally',()=>{
  const {elements:e,context:c}=fixture();e['resolution-select'].value='custom';e['resolution-select'].onchange();e['scene-width'].value='1234';
  e['resolution-select'].value='1920x1080';e['resolution-select'].onchange();
  assert.equal(e['custom-resolution'].hidden,true);assert.equal(Number(e['scene-width'].value),1920);
});
test('applying valid custom dimensions updates config and control values',()=>{
  const {elements:e,context:c}=fixture();c.applyResolution(1600,900);
  assert.equal(c.config.scene.width,1600);assert.equal(c.config.scene.height,900);
  assert.equal(Number(e['scene-width'].value),1600);assert.equal(Number(e['scene-height'].value),900);assert.equal(e['resolution-select'].value,'custom');
});
test('invalid custom dimensions do not alter committed scene or erase draft',()=>{
  const {elements:e,context:c}=fixture();e['resolution-select'].value='custom';e['resolution-select'].onchange();e['scene-width'].value='0';
  c.applyResolution(0,900);assert.equal(c.config.scene.width,1920);assert.equal(e['scene-width'].value,'0');
});
