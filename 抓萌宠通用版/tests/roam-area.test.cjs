const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),Area=require('../src/roam-area.js'),G=require('../src/roam-geometry.js'),Core=require('../src/core.js');
class Node{
 constructor(){this.listeners={};this.style={setProperty(k,v){this[k]=v;}};this.classList={toggle(){},add(){},remove(){}};this.hidden=false;this.checked=false;this.captured=new Set();this.dataset={};this.attrs={};this.value='';this.offsetWidth=330;this.offsetHeight=80;this.naturalWidth=100;this.naturalHeight=100;this.rect={left:100,top:100,width:330,height:80};}
 addEventListener(k,fn){(this.listeners[k]??=[]).push(fn);}emit(k,e={}){for(const fn of this.listeners[k]||[])fn(e);}
 setPointerCapture(id){this.captured.add(id);}hasPointerCapture(id){return this.captured.has(id);}releasePointerCapture(id){this.captured.delete(id);}
 setAttribute(k,v){this.attrs[k]=String(v);}getAttribute(k){return this.attrs[k]??null;}getBoundingClientRect(){return this.rect;}focus(){}querySelector(){return new Node();}
 closest(){return this.dataset.roamHandle?this:null;}
}
function fixture(){
 const nodes=new Map(),doc={getElementById(id){if(!nodes.has(id))nodes.set(id,new Node());return nodes.get(id);}},win=new Node();win.innerWidth=1000;win.innerHeight=500;
 let bounds={...G.DEFAULTS},commits=0,editStarts=0,allowed=true;
 const area=new Area({document:doc,window:win,getBounds:()=>bounds,onChange:b=>bounds={...b},onCommit:()=>commits++,onEditStart:()=>editStarts++,canEdit:()=>allowed});
 const event=(x,y,handle='move',id=7)=>({clientX:x,clientY:y,pointerId:id,button:0,isPrimary:true,target:{closest:()=>handle?{dataset:{roamHandle:handle}}:null},preventDefault(){},stopPropagation(){}});
 return{area,win,$:id=>doc.getElementById(id),event,get bounds(){return bounds;},get commits(){return commits;},get editStarts(){return editStarts;},setAllowed:v=>allowed=v};
}
test('frame is initially hidden; toggling visibility never disables or changes the stored bounds',()=>{
 const f=fixture();assert(f.$('roam-area').hidden);const before={...f.bounds};f.area.setVisible(true);assert(!f.$('roam-area').hidden);
 f.area.setVisible(false);assert(f.$('roam-area').hidden);assert.deepEqual(f.bounds,before);assert.equal(f.commits,0);
});
test('dragging moves the whole frame, updates live, and saves once at pointer release',()=>{
 const f=fixture(),frame=f.$('roam-area');f.area.setVisible(true);frame.emit('pointerdown',f.event(100,200));frame.emit('pointermove',f.event(300,210));
 assert.equal(f.bounds.roamRight,100);assert.equal(f.bounds.roamLeft,6);assert.equal(f.bounds.roamTop,37);assert.equal(f.commits,0);
 frame.emit('pointerup',f.event(300,210));frame.emit('pointerup',f.event(300,210));assert.equal(f.commits,1);assert.equal(frame.captured.size,0);
});
test('corner resizing keeps the opposite edges and cancellation restores the prior frame',()=>{
 const f=fixture(),frame=f.$('roam-area'),before={...f.bounds};f.area.setVisible(true);frame.emit('pointerdown',f.event(30,175,'nw'));frame.emit('pointermove',f.event(450,350,'nw'));
 assert.equal(f.bounds.roamRight,97);assert.equal(f.bounds.roamBottom,84);assert.equal(f.bounds.roamLeft,45);assert.equal(f.bounds.roamTop,70);
 frame.emit('pointercancel');assert.deepEqual(f.bounds,before);assert.equal(f.commits,0);assert.equal(frame.captured.size,0);
});
test('a tiny uncommitted drag restores its preview instead of leaving an unsaved boundary',()=>{
 const f=fixture(),frame=f.$('roam-area');f.area.setVisible(true);frame.emit('pointerdown',f.event(100,200));frame.emit('pointermove',f.event(102,200));assert.notEqual(f.bounds.roamLeft,3);
 frame.emit('pointerup',f.event(102,200));assert.deepEqual(f.bounds,G.DEFAULTS);assert.equal(f.commits,0);
});
test('reverse box selection commits at release; a click or Escape-style cancel preserves the original bounds',()=>{
 const f=fixture(),surface=f.$('roam-select');f.area.startSelection();assert.equal(f.editStarts,1);assert(!surface.hidden);
 surface.emit('pointerdown',f.event(800,400,null));surface.emit('pointermove',f.event(200,100,null));assert.deepEqual(f.bounds,G.DEFAULTS);
 surface.emit('pointerup',f.event(200,100,null));assert.deepEqual(f.bounds,{roamLeft:20,roamRight:80,roamTop:20,roamBottom:80});assert.equal(f.commits,1);assert(surface.hidden);
 f.area.startSelection();surface.emit('pointerdown',f.event(100,100,null));surface.emit('pointerup',f.event(100,100,null));assert.equal(f.commits,1);
 f.area.startSelection();surface.emit('pointerdown',f.event(100,100,null));surface.emit('pointermove',f.event(600,300,null));f.area.cancel();assert.equal(f.bounds.roamRight,80);assert(surface.hidden);
});
test('hidden bounds survive viewport resizing and blur cancels an incomplete move without saving',()=>{
 const f=fixture(),frame=f.$('roam-area');f.area.setVisible(true);frame.emit('pointerdown',f.event(100,200));frame.emit('pointermove',f.event(90,210));f.win.emit('blur');assert.deepEqual(f.bounds,G.DEFAULTS);assert.equal(f.commits,0);
 f.area.setVisible(false);f.win.innerWidth=400;f.win.innerHeight=800;f.win.emit('resize');assert(frame.hidden);assert.equal(frame.style.left,'3%');assert.equal(frame.style.height,'49%');
});
test('roam handle arrows never edit the bounds while pointer handles remain usable',()=>{
 const f=fixture(),frame=f.$('roam-area'),before={...f.bounds};let prevented=0,stopped=0;f.area.setVisible(true);frame.emit('pointerdown',f.event(200,200,null));assert.equal(frame.captured.size,0);
 for(const handle of ['move','nw','se'])for(const shiftKey of [false,true])for(const key of ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight']){
  frame.emit('keydown',{...f.event(0,0,handle),key,shiftKey,preventDefault(){prevented++;},stopPropagation(){stopped++;}});assert.deepEqual(f.bounds,before);assert.equal(f.commits,0);
 }
 assert.equal(prevented,0);assert.equal(stopped,0);
 frame.emit('pointerdown',f.event(100,200));frame.emit('pointermove',f.event(90,210));frame.emit('pointerup',f.event(90,210));assert.deepEqual(f.bounds,{roamLeft:2,roamRight:96,roamTop:37,roamBottom:86});assert.equal(f.commits,1);
 f.setAllowed(false);f.area.startSelection();assert(f.$('roam-select').hidden);
});

function layoutFixture(file,type){
 const nodes=new Map(),writes=[],win=new Node(),document={getElementById(id){if(!nodes.has(id))nodes.set(id,new Node());return nodes.get(id);}};
 const ctx={document,window:win,innerWidth:1000,innerHeight:500,structuredClone,localStorage:{getItem:()=>null,setItem:(key,value)=>writes.push([key,JSON.parse(value)])}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src',file),'utf8')+';globalThis.Type='+type+';',ctx);
 return{Type:ctx.Type,win,writes,$:id=>document.getElementById(id)};
}
function penFixture(){
 const f=layoutFixture('customize.js','CowCustomizer'),c=Object.create(f.Type.prototype);
 Object.assign(c,{core:Core,assets:{barns:[{src:'data:image/png;base64,AA'}]},records:new Map(),onChange(){},toast(){},canManipulatePen:()=>true,canShowChant:()=>true,cfg:{theme:'cream',barn:0,penWidth:330,penX:50,penY:50,penLocked:false,showWidth:440,showX:50,showY:34,activeCategory:'all',wander:true,avatarMode:false,avatarMotion:'float',ballMode:false,ballSize:64}});
 f.$('pen').rect={left:100,top:100,width:330,height:330};c.bindPenManipulation();return{...f,c};
}
function hudFixture(){const f=layoutFixture('hud.js','CowHud'),hud=new f.Type({core:Core,toast(){}});return{...f,hud};}
function layoutEvent(x=265,y=140,resize=false){return{clientX:x,clientY:y,pointerId:7,button:0,isPrimary:true,target:{id:resize?'pen-resize':'pen',closest:selector=>resize&&['#pen-resize','.hud-resize'].includes(selector)?{}:null},preventDefault(){},stopPropagation(){}};}
function assertNoLayoutKeys(node,getConfig,writes){
 const before=JSON.stringify(getConfig());let prevented=0,stopped=0;
 for(const resize of [false,true])for(const shiftKey of [false,true])for(const key of ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight']){
  node.emit('keydown',{...layoutEvent(0,0,resize),key,shiftKey,preventDefault(){prevented++;},stopPropagation(){stopped++;}});assert.equal(JSON.stringify(getConfig()),before);assert.equal(writes.length,0);
 }
 assert.equal(prevented,0);assert.equal(stopped,0);
}
test('pen arrows never move or resize the layout and pointer dragging still saves',()=>{
 const f=penFixture(),pen=f.$('pen');assertNoLayoutKeys(pen,()=>f.c.cfg,f.writes);
 pen.emit('pointerdown',layoutEvent(265,265));pen.emit('pointermove',layoutEvent(315,275));assert.equal(f.c.cfg.penX,31.5);assert(Math.abs(f.c.cfg.penY-55)<1e-8);assert.equal(f.writes.length,0);
 pen.emit('pointerup',layoutEvent(315,275));assert.equal(f.writes.length,1);assert.equal(pen.captured.size,0);
 pen.emit('pointerdown',layoutEvent(265,265,true));pen.emit('pointermove',layoutEvent(285,285,true));assert.equal(f.c.cfg.penWidth,350);assert.equal(f.writes.length,1);
 pen.emit('pointerup',layoutEvent(285,285,true));assert.equal(f.writes.length,2);assert.equal(pen.captured.size,0);
});
test('HUD arrows never move or resize either panel and pointer dragging still saves',()=>{
 const f=hudFixture();for(const id of ['stats-hud','status'])assertNoLayoutKeys(f.$(id),()=>f.hud.cfg,f.writes);
 const stats=f.$('stats-hud');stats.emit('pointerdown',layoutEvent());stats.emit('pointermove',layoutEvent(315,150));assert.equal(f.hud.cfg.stats.x,31.5);assert.equal(f.hud.cfg.stats.y,30);assert.equal(f.writes.length,0);
 stats.emit('pointerup',layoutEvent(315,150));assert.equal(f.writes.length,1);assert.equal(stats.captured.size,0);
 stats.emit('pointerdown',layoutEvent(265,140,true));stats.emit('pointermove',layoutEvent(298,148,true));assert.equal(f.hud.cfg.stats.scale,120);assert.equal(f.writes.length,1);
 stats.emit('pointerup',layoutEvent(298,148,true));assert.equal(f.writes.length,2);assert.equal(stats.captured.size,0);
});
test('HUD Escape ignores active IME composition and otherwise finishes its pointer drag',()=>{
 const f=hudFixture(),stats=f.$('stats-hud');stats.emit('pointerdown',layoutEvent());stats.emit('pointermove',layoutEvent(315,150));
 stats.emit('keydown',{key:'Escape',isComposing:true});assert.equal(f.hud.dragging,'stats');assert.equal(f.writes.length,0);assert.equal(stats.captured.size,1);
 stats.emit('keydown',{key:'Escape'});assert.equal(f.hud.dragging,false);assert.equal(f.writes.length,1);assert.equal(stats.captured.size,0);
});
