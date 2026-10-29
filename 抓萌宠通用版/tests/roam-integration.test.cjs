const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const G=require('../src/roam-geometry.js'),C=require('../src/core.js'),Motion=require('../src/motion.js'),Toolbar=require('../src/test-toolbar.js');
const app=fs.readFileSync(path.join(__dirname,'../src/app.js'),'utf8'),line=name=>app.split('\n').find(x=>x.startsWith('function '+name+'('));
function scene(){
 let disabled=false;const bounds={roamLeft:25,roamRight:65,roamTop:20,roamBottom:70},pet={x:10,y:900,size:85,targetY:850,kind:0,held:false,dead:false,airborne:false,el:{style:{}},motionMode:'squish',walkMode:'default'},state=C.fresh();
 const ctx={population:null,W:1000,H:500,C,PetMotion:Motion,PetRoamGeometry:G,custom:{cfg:{...bounds,wander:false,runSpeed:45},cowScale:()=>1},prefs:{size:85},cows:[pet],residentCows:[],runEpoch:0,reduced:()=>disabled,renderCow(){},ballVisuals:new Set(),effects:null,state,previewRound:null,auto:false,requestAnimationFrame:()=>1,$:()=>({getBoundingClientRect:()=>({left:800,top:200,width:160,height:160})})};
 // Roam-only scenes have no pending like awards, but use the unchanged actual tick.
 ctx.drainLikes=()=>{};
 const start=app.indexOf('function tick('),end=app.indexOf('function openSettings(',start);vm.runInNewContext(['allActors','size','roamRect','confineCow','setCowSize'].map(line).join('\n')+'\n'+app.slice(start,end),ctx);
 return{ctx,pet,bounds,setReduced:v=>disabled=v};
}
test('actual tick confines idle and reduced-motion pets even while the frame is hidden',()=>{
 const f=scene();f.ctx.tick(1000);assert(f.pet.x>=250&&f.pet.x<=650);assert(f.pet.y>=100&&f.pet.y<=350);
 f.pet.x=-100;f.pet.y=900;f.setReduced(true);f.ctx.tick(1016);assert(f.pet.x>=250&&f.pet.y<=350);assert.equal(f.pet.hopLift,0);
});
test('resizing restores the requested pet size and repositions old or oversized pets',()=>{
 const f=scene();f.ctx.custom.cfg.roamRight=30;f.ctx.custom.cfg.roamBottom=25;f.ctx.setCowSize(f.pet);assert(f.pet.size<85);assert(f.pet.x>=250&&f.pet.x<=300);
 Object.assign(f.ctx.custom.cfg,G.DEFAULTS);f.ctx.setCowSize(f.pet);assert.equal(f.pet.size,85);
});
test('actual drag release repairs its destination but still sends a batch to a nest outside the frame',()=>{
 for(const hit of [false,true]){
  const f=scene();f.pet.held=true;f.pet.x=900;f.pet.y=400;f.ctx.drag={id:7,list:[f.pet],x:900,y:400};let credited=0;
  Object.assign(f.ctx,{inPen:()=>hit,collectCows:list=>credited+=list.length,replenish(){},save(){},$:()=>({classList:{remove(){}},releasePointerCapture(){}})});f.pet.el.classList={remove(){}};
  vm.runInNewContext(line('releaseDrag'),f.ctx);f.ctx.releaseDrag();assert.equal(credited,hit?1:0);assert(f.pet.targetY<=350);assert.equal(f.pet.held,false);
 }
});
test('actual menu transitions reveal the toolbar only while the menu is open',()=>{
 const classes=new Set(),body={dataset:{}},bar={ownerDocument:{},setAttribute(){},contains:()=>false},toolbar=new Toolbar({toolbar:bar,body});
 const nodes={shade:{classList:{add:k=>classes.add(k),remove:k=>classes.delete(k)}},close:{focus(){}},'visibleLimitInput':{},'settings-btn':{focus(){}}};
 const ctx={controls:null,testToolbar:toolbar,$:id=>nodes[id],prefs:{visibleLimit:240},releaseDrag(){},applyPrefs(){},hud:null,custom:null,effects:null};
 vm.runInNewContext(line('openSettings')+'\n'+line('closeSettings'),ctx);assert(bar.hidden);ctx.openSettings();assert.equal(bar.hidden,false);toolbar.hide();assert(bar.hidden);ctx.openSettings();assert.equal(bar.hidden,false);ctx.closeSettings();assert(bar.hidden);toolbar.toggle();assert(bar.hidden);
});
test('Tab crosses from menu controls to the toolbar and wraps without reaching hidden frame handles',()=>{
 const controls=Array.from({length:4},()=>({disabled:false,closest:()=>null,getClientRects:()=>[{}],focus(){document.activeElement=this;}}));
 const document={activeElement:controls[1],addEventListener(k,fn){this.handler=fn;}};
 const nodes={shade:{classList:{contains:()=>true}},settings:{querySelectorAll:()=>controls.slice(0,2)},toolbar:{querySelectorAll:()=>controls.slice(2)}};
 const source=app.split('\n').find(x=>x.startsWith("document.addEventListener('keydown',e=>{if(e.key!=='Tab'"));vm.runInNewContext(source,{document,$:id=>nodes[id]});
 let prevented=0;const tab=shiftKey=>document.handler({key:'Tab',shiftKey,preventDefault(){prevented++;}});
 tab(false);assert.equal(document.activeElement,controls[2]);document.activeElement=controls[3];tab(false);assert.equal(document.activeElement,controls[0]);tab(true);assert.equal(document.activeElement,controls[3]);assert.equal(prevented,3);
});
