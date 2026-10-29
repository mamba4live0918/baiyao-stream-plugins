import * as model from './seam.js';
import {layout,clamp,KIND_NAMES,NOMINAL} from './layout.js';
import {loadImages,makeRenderer,placeProfile,profileFor} from './renderer.js';
import {bindInput} from './input.js';
import {buildTuningUI} from './tuning-ui.js';
import {safeName} from './text.js';

const canvas=document.getElementById('stage'),renderer=makeRenderer(canvas),clock=()=>performance.now()/1000;
const saved=readSettings();let id=0,raf=0,timer=0,last=clock(),renderLast=last,accumulator=0,sleeping=false,ready=false,suspended=false,pausedAt=0;
const vm={state:model.createState({seed:20261029,tuning:saved.tuning}),L:null,waiting:[],visuals:new Map(),drag:null,now:last,
  openAmount:0,overBox:false,pullSwing:0,shipping:0,sent:0,handStyle:saved.handStyle||'paw',face:saved.face||null,editFace:false,card:null,
  hand:{x:0,y:0,visible:false,alpha:0,movedAt:0,downAt:0}};
vm.L=layout(innerWidth,innerHeight,vm.state.tuning.L,scaledFace(),vm.state.tuning.C);
function safeTuning(input){
  if(!input||typeof input!=='object'||Array.isArray(input))return {};
  const ranges={C:[80,600],g_zip:[0,50],S:[0,1000],L:[400,980],pressRise:[.03,3],helperWeight:[0,5],autoThreshold:[.1,1],autoDuration:[.03,3],compressTime:[.03,3],maxSlope:[1,100],burstCooldown:[.1,30]},out={};
  for(const [k,[lo,hi]]of Object.entries(ranges)){const v=input[k];if(typeof v==='number'&&Number.isFinite(v)&&v>=lo&&v<=hi)out[k]=v;}
  if(input.kinds&&typeof input.kinds==='object'){out.kinds={};for(const kind of Object.keys(KIND_NAMES)){const src=input.kinds[kind];if(!src||typeof src!=='object')continue;const dst={};for(const [k,[lo,hi]]of Object.entries({min:[.05,1],rebound:[0,10],damping:[.05,3],bulge:[1,3],length:[10,1000]})){const v=src[k];if(typeof v==='number'&&Number.isFinite(v)&&v>=lo&&v<=hi)dst[k]=v;}out.kinds[kind]=dst;}}
  return out;
}
function readSettings(){try{const src=JSON.parse(localStorage.getItem('luggage.v1.settings'));if(!src||typeof src!=='object'||Array.isArray(src))return {};const face=Array.isArray(src.face)&&src.face.length>=3&&src.face.length<=12&&src.face.every(p=>Array.isArray(p)&&p.length===2&&p.every(v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=1))?src.face:null;
  return {tuning:safeTuning(src.tuning),face,handStyle:['paw','glove','none'].includes(src.handStyle)?src.handStyle:'paw'};}catch{return {};}}
function save(){try{localStorage.setItem('luggage.v1.settings',JSON.stringify({tuning:vm.state.tuning,handStyle:vm.handStyle,face:vm.face}));}catch{}}
function scaledFace(){if(!vm?.face)return null;const u=Math.min(innerWidth,innerHeight)/1080;return vm.face.map(p=>[p[0]*innerWidth/u,p[1]*innerHeight/u]);}
function consume(next){
  const events=next.events;vm.state=next;
  for(const e of events){
    if(e.type==='cat-roll'){const v=vm.visuals.get(e.id);if(v){v.x+=e.shift*vm.L.colWidth;v.relative=(v.x+v.width/2-vm.L.x)/vm.L.L;}}
    if(e.type==='cat-waiting'){const item=vm.state.items.find(i=>i.id===e.id);if(item){vm.waiting.push({...item,cat:null,angle:0});vm.state=model.removeItem(vm.state,e.id);vm.visuals.delete(e.id);}}
    if(e.type==='bread-break'){
      const old=vm.visuals.get(e.id);if(old)for(let n=0;n<e.pieces.length;n++){
        const item=vm.state.items.find(i=>i.id===e.pieces[n]);if(!item)continue;
        const asset='baguette_half_'+(n?'r':'l'),piece={...item,asset},v=placeProfile(piece,old.x+(n+.5)*old.width/2,vm.L,0);
        v.relative=(v.x+v.width/2-vm.L.x)/vm.L.L;vm.visuals.set(item.id,v);
        vm.state=model.replaceItemProfile(vm.state,item.id,{heights:v.heights,asset,angle:0,length:item.length});
      }
      vm.visuals.delete(e.id);
    }
    if(e.type==='blocked'||e.type==='burst')vm.pullSwing=1;
  }
  if(!vm.state.items.some(i=>!i.cat||!['lid','waiting'].includes(i.cat.phase))&&vm.state.z>=1)vm.state=model.dragZip(vm.state,0);
  if(vm.state.completed&&!vm.shipping){if(vm.drag?.kind==='item'){vm.waiting.push({...vm.drag.item,angle:0});vm.visuals.delete(vm.drag.item.id);}vm.shipping=clock();vm.sent++;vm.drag=null;vm.overBox=false;vm.state=model.setHand(vm.state,null);}
}
function sync(){
  const now=clock(),dt=Math.max(0,now-last);last=now;vm.now=now;
  if(suspended)return;
  if(sleeping){vm.state={...vm.state,time:vm.state.time+dt,originTime:vm.state.originTime+dt};sleeping=false;consume(model.step(vm.state));return;}
  accumulator+=Math.min(dt,.15);
  while(accumulator>=model.FIXED_DT){consume(model.step(vm.state));accumulator-=model.FIXED_DT;}
}
function wake(){if(!ready)return;if(suspended){renderer.draw(vm);return;}clearTimeout(timer);timer=0;if(!raf)raf=requestAnimationFrame(frame);}
function pause(){
  if(!ready||suspended)return;sync();const d=vm.drag;
  if(d?.kind==='item'){vm.waiting.push({...d.item,angle:0});vm.visuals.delete(d.item.id);}
  if(d?.kind==='helper')consume(model.setHelperLifted(vm.state,d.id,false));
  consume(model.setHand(vm.state,null));vm.drag=null;vm.overBox=false;vm.hand.visible=false;vm.hand.alpha=0;
  cancelAnimationFrame(raf);clearTimeout(timer);raf=0;timer=0;suspended=true;pausedAt=clock();sleeping=false;renderer.draw(vm);
}
function resume(){if(!suspended)return;const now=clock(),elapsed=now-pausedAt;if(vm.shipping)vm.shipping+=elapsed;if(vm.card)vm.card.until+=elapsed;suspended=false;last=now;renderLast=now;vm.now=now;accumulator=0;wake();}
window.addEventListener('blur',pause);window.addEventListener('focus',resume);
document.addEventListener('visibilitychange',()=>document.hidden?pause():resume());
canvas.addEventListener('pointerdown',resume,{capture:true});
function frame(){
  raf=0;sync();const dt=clamp(vm.now-renderLast,0,.05),target=vm.overBox?1:0;renderLast=vm.now;
  vm.openAmount+=clamp(target-vm.openAmount,-dt*4,dt*4);if(Math.abs(target-vm.openAmount)<.001)vm.openAmount=target;
  vm.pullSwing*=.85;if(vm.pullSwing<.005)vm.pullSwing=0;
  const d=vm.drag;if(d?.kind==='item'){d.velocity+=((d.target-d.angle)*28-d.velocity*8)*dt;d.angle+=d.velocity*dt;if(Math.abs(d.target-d.angle)<.08&&Math.abs(d.velocity)<.08){d.angle=d.target;d.velocity=0;}}
  if(vm.shipping&&vm.now-vm.shipping>=1.5){vm.state=model.createState({seed:vm.state.seed,time:vm.state.time,tuning:vm.state.tuning});vm.visuals.clear();vm.shipping=0;}
  const handAge=vm.now-vm.hand.movedAt;vm.hand.alpha=vm.drag?1:clamp((2.25-handAge)/.25,0,1);if(vm.hand.alpha===0)vm.hand.visible=false;
  if(vm.card&&vm.now>=vm.card.until)vm.card=null;
  renderer.draw(vm);
  const settling=!model.isSettled(vm.state),handFade=vm.hand.visible&&!vm.drag&&handAge>=2&&handAge<2.25;
  const catWarning=vm.state.items.some(i=>i.cat&&['ear','tail'].includes(i.cat.phase));
  const active=settling||catWarning||vm.shipping||vm.openAmount!==target||vm.pullSwing>0||handFade||d?.kind==='press'||(d?.kind==='item'&&(d.velocity!==0||d.angle!==d.target));
  if(active){raf=requestAnimationFrame(frame);return;}
  sleeping=true;
  const deadlines=[model.nextWakeTime(vm.state)-vm.state.time];
  if(vm.hand.visible&&!vm.drag)deadlines.push(Math.max(.01,2-handAge));
  if(vm.card)deadlines.push(vm.card.until-vm.now);
  const delay=Math.min(...deadlines.filter(t=>t>0));
  if(Number.isFinite(delay))timer=setTimeout(wake,Math.max(8,delay*1000));
}
function resize(){
  const before=vm.L;vm.L=layout(innerWidth,innerHeight,vm.state.tuning.L,scaledFace(),vm.state.tuning.C);
  if(ready)for(const item of vm.state.items){const v=vm.visuals.get(item.id);if(!v)continue;const next=placeProfile(item,vm.L.x+(v.relative??.5)*vm.L.L,vm.L,item.angle);next.relative=(next.x+next.width/2-vm.L.x)/vm.L.L;vm.visuals.set(item.id,next);if(before.L!==vm.L.L)vm.state=model.replaceItemProfile(vm.state,item.id,{heights:next.heights});}
  wake();
}
function makeItem(kind='pillow',owner){
  const n=++id,colors=kind==='pillow'?['pink','mint','yellow','purple']:['yellow','blue','pink'];
  return {id:'luggage-'+n,kind,owner:{name:safeName(owner?.name||['小鹿','团子','阿青','七七','小橙','阿桃'][n%6]),uid:owner?.uid||'sample-'+n},asset:kind==='pillow'||kind==='jacket'?kind+'_'+colors[(n-1)%colors.length]:undefined,angle:0};
}
function addWaiting(kind='pillow',count=1,owner){for(let n=0;n<count;n++)vm.waiting.push(makeItem(kind,owner));wake();}
function pack(item,center,angle=0){
  const v=placeProfile(item,center,vm.L,angle);v.relative=(v.x+v.width/2-vm.L.x)/vm.L.L;vm.visuals.set(item.id,v);
  const next={...model.createItem({...item,heights:v.heights,length:item.broken?item.length:NOMINAL[item.kind][0],angle:v.angle}),broken:!!item.broken};
  consume(model.addItem(vm.state,next));wake();
}
const actions={wake,sync,
  press:col=>{sync();consume(model.setHand(vm.state,{col,down:true}));wake();},
  release:()=>{consume(model.setHand(vm.state,null));wake();},
  zip:z=>{sync();consume(model.dragZip(vm.state,z));if(vm.state.items.length===0&&z>=1)consume(model.dragZip(vm.state,0));vm.pullSwing=1;wake();},
  take:(item,packed)=>{if(packed)consume(model.removeItem(vm.state,item.id));else vm.waiting=vm.waiting.filter(i=>i.id!==item.id);},
  drop:(item,inside,x,angle)=>{if(inside)pack(item,x,angle);else{vm.waiting.push({...item,angle:0});vm.visuals.delete(item.id);}wake();},
  tapCat:id=>{consume(model.tapCat(vm.state,id));wake();},
  moveHelper:(id,col)=>{sync();consume(model.moveHelper(vm.state,id,col));wake();},
  liftHelper:id=>{sync();consume(model.setHelperLifted(vm.state,id,true));wake();},
  sitHelper:id=>{sync();consume(model.setHelperLifted(vm.state,id,false));wake();},
  moveStrap:(id,col)=>{sync();consume(model.moveStrap(vm.state,id,col));wake();},
  face:poly=>{vm.face=poly.map(p=>[p[0]/vm.L.W,p[1]/vm.L.H]);save();wake();},
  card:item=>{vm.card={owner:item.owner||{name:'阿桃'},message:item.kind==='helper'?'谢谢你！':vm.state.culpritId===item.id?'就是你！':'你的'+(KIND_NAMES[item.kind]||'行李')+(vm.state.items.some(i=>i.id===item.id)?'在箱子里':'在待装区'),until:clock()+2.5};wake();}
};
bindInput(canvas,vm,actions,renderer.hit);
const tuningAPI={get:()=>structuredClone(vm.state.tuning),set:patch=>{sync();consume(model.setTuning(vm.state,safeTuning(patch)));resize();save();tuningUI?.refresh();wake();},reset:()=>{sync();consume(model.setTuning(vm.state,model.DEFAULT_TUNING));resize();save();wake();}};
let tuningUI;
function openSettings(tuning=false){document.getElementById('settings').hidden=false;const details=document.getElementById('advanced');details.open=tuning;tuningUI.refresh();}
document.getElementById('settings-button').onclick=()=>openSettings();
document.getElementById('close-settings').onclick=()=>document.getElementById('settings').hidden=true;
document.getElementById('hand-style').value=vm.handStyle;
document.getElementById('hand-style').onchange=e=>{vm.handStyle=e.target.value;save();wake();};
document.getElementById('face-edit').onclick=()=>{document.getElementById('settings').hidden=true;vm.editFace=!vm.editFace;document.getElementById('face-done').hidden=!vm.editFace;wake();};
document.getElementById('face-done').onclick=()=>{vm.editFace=false;document.getElementById('face-done').hidden=true;resize();};
document.getElementById('face-reset').onclick=()=>{vm.face=null;save();resize();};
let buttonTimer;
document.addEventListener('pointermove',()=>{const b=document.getElementById('settings-button');b.classList.add('visible');clearTimeout(buttonTimer);buttonTimer=setTimeout(()=>b.classList.remove('visible'),2200);});
window.addEventListener('resize',resize);
function reset(initial=true){vm.waiting=[];vm.visuals.clear();vm.drag=null;vm.overBox=false;vm.shipping=0;vm.sent=0;vm.state=model.createState({seed:20261029,time:vm.state.time,tuning:vm.state.tuning});if(initial)Object.keys(KIND_NAMES).forEach(k=>addWaiting(k));wake();}
function helper(){sync();const col=vm.state.gap.indexOf(Math.max(...vm.state.gap));consume(model.addHelper(vm.state,{id:'helper-'+(++id),col,until:vm.state.time+18,owner:{name:'阿桃'}}));wake();}
function strap(){sync();const col=vm.state.gap.indexOf(Math.max(...vm.state.gap));consume(model.addStrap(vm.state,{id:'strap-'+(++id),col,owner:{name:'小鹿'}}));wake();}
function practice(){reset(false);const center=vm.L.x+vm.L.L*.52;pack(makeItem('pillow',{name:'小鹿'}),center);pack(makeItem('pillow',{name:'团子'}),center);addWaiting('jacket');addWaiting('bread');wake();}
const sim={add:addWaiting,pack:(kind='pillow',relative=.5,angle=0)=>{sync();pack(makeItem(kind),vm.L.x+relative*vm.L.L,angle);},helper,strap,
  inflate:()=>{sync();const it=vm.state.items.find(i=>vm.state.tuning.kinds[i.kind].min<1);if(it)consume(model.inflateItem(vm.state,it.id));wake();},
  vacuum:()=>{sync();consume(model.vacuum(vm.state));wake();},
  wakeCat:()=>{sync();let cat=vm.state.items.find(i=>i.kind==='cat');if(!cat){pack(makeItem('cat'),vm.L.x+vm.L.L*.65);cat=vm.state.items.at(-1);}consume(model.wakeCat(vm.state,cat.id,{name:'七七'}));wake();},
  reset,practice,batch:()=>{for(let i=0;i<10;i++)addWaiting(Object.keys(KIND_NAMES)[i%6]);},
  wave:()=>{for(let i=0;i<20;i++)addWaiting(Object.keys(KIND_NAMES)[i%6]);}};
function screenState(){const r=renderer.hit,u=vm.L.u,box=v=>({...v,x:v.x*u,y:v.y*u,w:v.w*u,h:v.h*u,item:v.item?{id:v.item.id,kind:v.item.kind}:undefined});
  return {ready,state:structuredClone(vm.state),...structuredClone(vm.state),waiting:vm.waiting.map(i=>({...i})),sent:vm.sent,shipping:!!vm.shipping,drag:vm.drag?{kind:vm.drag.kind,id:vm.drag.item?.id||vm.drag.id,angle:vm.drag.angle}:null,
    screen:{u,box:{x:vm.L.x*u,y:(vm.L.seam-108)*u,width:vm.L.L*u,seam:vm.L.seam*u},face:vm.L.face.map(p=>p.map(n=>n*u)),zip:r.zip?box(r.zip):null,waiting:r.waiting.map(v=>({id:v.item.id,kind:v.item.kind,x:v.x*u,y:v.y*u,w:v.w*u,h:v.h*u})),exposed:r.packed.map(box),helpers:r.helpers.map(box),straps:r.straps.map(box),cats:r.cats.map(box),labels:r.labels.map(box)}};
}
window.luggageDemo={state:screenState,renders:renderer.renders,sim,tuning:tuningAPI,openSettings,openTuning:()=>openSettings(true),ready:loadImages().then(()=>{ready=true;tuningUI=buildTuningUI(document.getElementById('tuning'),tuningAPI);reset();wake();return true;})};
