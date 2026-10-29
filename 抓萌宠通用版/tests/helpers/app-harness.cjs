const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
class Node{
 constructor(tag,doc){this.tagName=tag.toUpperCase();this.ownerDocument=doc;this.children=[];this.attributes={};this.dataset=new Proxy({},{set:(data,key,value)=>{data[key]=String(value);this.attributes['data-'+key.replace(/[A-Z]/g,c=>'-'+c.toLowerCase())]=String(value);return true;},deleteProperty:(data,key)=>{delete data[key];delete this.attributes['data-'+key.replace(/[A-Z]/g,c=>'-'+c.toLowerCase())];return true;}});this.events={};this.hidden=false;this.isConnected=true;this.style={setProperty(k,v){this[k]=v;}};this._value='';this.textContent='';const flags=new Set();this.classList={add:(...s)=>s.forEach(x=>flags.add(x)),remove:(...s)=>s.forEach(x=>flags.delete(x)),contains:s=>flags.has(s),toggle(s,on){const value=on??!flags.has(s);value?flags.add(s):flags.delete(s);return value;}};}
 set value(v){this._value=String(v);}get value(){return this._value;}
 setAttribute(k,v){this.attributes[k]=String(v);if(k==='class')this.className=String(v);if(k==='id')this.id=String(v);if(k.startsWith('data-'))this.dataset[k.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=String(v);}
 getAttribute(k){return this.attributes[k]??null;}removeAttribute(k){delete this.attributes[k];if(k.startsWith('data-'))delete this.dataset[k.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())];}
 addEventListener(k,fn){(this.events[k]??=[]).push(fn);}removeEventListener(){}
 append(...nodes){this.children.push(...nodes);nodes.forEach(n=>{n.parentElement=this;});}replaceChildren(...nodes){this.children=[];this.append(...nodes);}
 insertBefore(n){this.append(n);}remove(){this.isConnected=false;if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(c=>c!==this);}
 hasAttribute(k){return Object.hasOwn(this.attributes,k);}contains(n){return n===this||this.children.some(c=>c.contains?.(n));}
 matches(selector){return selector.split(',').some(s=>{s=s.trim();if(!s)return false;const id=s.match(/#([\w-]+)/),classes=[...s.matchAll(/\.([\w-]+)/g)],tag=s.match(/^([a-z][\w-]*)/i),attr=s.match(/\[([\w-]+)(?:=["']?([^\]"']+)["']?)?\]/);return(!id||this.id===id[1])&&classes.every(cls=>(this.className||'').split(/\s+/).includes(cls[1])||this.classList.contains(cls[1]))&&(!tag||this.tagName===tag[1].toUpperCase())&&(!attr||this.hasAttribute(attr[1])&&(attr[2]===undefined||this.getAttribute(attr[1])===attr[2]));});}
 closest(s){for(let n=this;n;n=n.parentElement)if(n.matches?.(s))return n;return null;}
 querySelectorAll(s){return this.ownerDocument.all.filter(n=>n!==this&&n.isConnected&&this.contains(n)&&n.matches(s));}querySelector(s){return this.querySelectorAll(s)[0]||null;}
 focus(){this.ownerDocument.activeElement=this;}blur(){}click(){if(!this.disabled)dispatch(this,'click');}
 setPointerCapture(){}releasePointerCapture(){}hasPointerCapture(){return false;}
 cloneNode(deep){const n=this.ownerDocument.createElement(this.tagName);n.className=this.className;n.textContent=this.textContent;n.style={...this.style};if(deep)for(const c of this.children)n.append(c.cloneNode(true));return n;}
 get options(){return this.children.filter(n=>n.tagName==='OPTION');}
 getBoundingClientRect(){return this.rect||{left:750,top:460,x:750,y:460,width:240,height:180,right:990,bottom:640};}getClientRects(){return[{}];}
}
function dispatch(target,type,props={}){const e={target,type,button:0,isPrimary:true,pointerId:1,defaultPrevented:false,preventDefault(){this.defaultPrevented=true;},stopPropagation(){this.stopped=true;},stopImmediatePropagation(){this.stopped=true;this.immediate=true;},...props};for(const f of target.ownerDocument?.captureEvents?.[type]||[]){e.currentTarget=target.ownerDocument;f(e);if(e.stopped)return e;}for(let n=target;n;n=n.parentElement){e.currentTarget=n;n['on'+type]?.(e);for(const f of n.events?.[type]||[])f(e);if(e.stopped)return e;}for(const f of target.ownerDocument?.events?.[type]||[])f(e);return e;}
function documentFor(html){
 const doc={nodes:new Map(),all:[],events:{},captureEvents:{},createElement(tag){const n=new Node(tag,this);this.all.push(n);return n;},createTextNode(text){const n=this.createElement('text');n.textContent=text;return n;},getElementById(id){return this.nodes.get(id)||null;},addEventListener(k,fn,options){const bucket=options===true||options?.capture?this.captureEvents:this.events;(bucket[k]??=[]).push(fn);},querySelectorAll(s){return this.all.filter(n=>n.isConnected&&n.matches(s));},querySelector(s){return this.querySelectorAll(s)[0]||null;}};doc.body=doc.createElement('body');
 const stack=[doc.body],voids=new Set(['INPUT','IMG','META','LINK','BR','HR','SOURCE','WBR']);
 for(const match of html.matchAll(/<(\/?)([a-z][\w-]*)\b([^>]*?)>/gi)){
  const tag=match[2].toUpperCase();if(match[1]){const at=stack.findLastIndex(n=>n.tagName===tag);if(at>0)stack.length=at;continue;}
  if(tag==='BODY')continue;const n=doc.createElement(tag);for(const a of match[3].matchAll(/([\w-]+)(?:="([^"]*)")?/g)){n.setAttribute(a[1],a[2]??'');if(a[1]==='hidden')n.hidden=true;if(['type','value','min','max','step'].includes(a[1]))n[a[1]]=a[2]??'';}
  if(n.id)doc.nodes.set(n.id,n);stack.at(-1).append(n);if(!voids.has(tag)&&!match[3].endsWith('/'))stack.push(n);
 }
 return doc;
}
async function bootstrap(savedState=null,savedPrefs=null,options={}){
 const base=read('src/index.html'),html=base.slice(0,base.indexOf('<div id="shade">'))+read('src/settings.html')+read('src/pet-controls.html')+read('src/hud.html')+read('src/effects.html')+read('src/roam-area.html')+read('src/tornado.html')+'<button id="pen-lock"></button><button id="pen-resize"></button><button id="show-handle"></button><div id="boom-fx"></div><div id="interaction-panel"><strong id="challenge-clock"></strong><div id="challenge-progress"></div><small id="interaction-flags"></small></div>',document=documentFor(html),assets=options.assets?structuredClone(options.assets):JSON.parse(read('素材/manifest.json')),store=new Map();assets.audio={};assets.durations={};assets.blindBox={closed:'closed.png',open:'open.png'};assets.accessories??=Object.fromEntries(JSON.parse(read('素材/配饰/manifest.json')).map(p=>[p.kind,p]));
 if(options.canvasFactory){const create=document.createElement.bind(document);document.createElement=tag=>{const n=create(tag);if(tag==='canvas')Object.assign(n,options.canvasFactory(n));return n;};}
 if(savedState)store.set('pet-catch-v1',JSON.stringify(savedState));if(savedPrefs)store.set('pet-catch-v1-settings',JSON.stringify(savedPrefs));if(options.customSaved)store.set('pet-catch-v1-custom',JSON.stringify(options.customSaved));const intervals=[],handlers={};const ctx={document,innerWidth:1200,innerHeight:700,structuredClone,console,performance:{now:()=>0},matchMedia:()=>options.motionQuery||({matches:false,addEventListener(){}}),localStorage:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)},setTimeout:()=>0,clearTimeout(){},setInterval:(fn,delay)=>{intervals.push({fn,delay});return 0;},requestAnimationFrame:fn=>{ctx.frame=fn;return 1;},cancelAnimationFrame(){},addEventListener:(k,fn)=>{(handlers[k]??=[]).push(fn);},Option:class extends Node{constructor(text,value){super('option',document);this.textContent=text;this.value=value;}},Audio:class{pause(){}play(){return Promise.resolve();}addEventListener(){}},ASSETS:assets};ctx.window=ctx;ctx.intervals=intervals;ctx.handlers=handlers;if(options.Image)ctx.Image=options.Image;
 ctx.PetAudioMixer=class{mountMaster(){}mountLevel(){}attach(){}attachGain(){return()=>{};}};ctx.PetPenShape={HitRegion:class{syncMotion(){}invalidate(){}contains(){return false;}}};ctx.PetRoamArea=class{render(){}cancel(){}};
 ctx.CowHud=class{update(data){document.getElementById('outside').textContent=String(data.outside);}stopPreview(){}};
 ctx.CowEffects=class{constructor(hooks){Object.assign(this,hooks);this.cfg={likeEnabled:false};this.gripRing=document.createElement('div');ctx.effectInstance=this;}update(){}closePreview(){}ruleFor(){return null;}};
 if(options.sdk)ctx.SonglanPlugin=options.sdk;if(options.WebSocket)ctx.WebSocket=options.WebSocket;if(options.globals)Object.assign(ctx,options.globals);
 const context=vm.createContext(ctx);for(const file of ['named-pets.js','core.js','population-view.js','blind-box.js','box-settings.js','box-motion.js','box-display.js','motion.js','roam-geometry.js','themes.js','roster.js','hud.js','test-toolbar.js','customize.js','accessories.js','pet-controls.js'])vm.runInContext(read('src/'+file),context,{filename:file});
 if(options.flightParticles)vm.runInContext(read('src/flight-particles.js'),context,{filename:'flight-particles.js'});
 if(options.likeInput)vm.runInContext(read('src/like-input.js'),context,{filename:'like-input.js'});
 vm.runInContext('const RealCustomizer=CowCustomizer;CowCustomizer=class extends RealCustomizer{constructor(h){super(h);globalThis.customInstance=this;}};',context);
 vm.runInContext('const RealPetControls=PetControls;PetControls=class extends RealPetControls{constructor(h){super(h);globalThis.controlsInstance=this;}};',context);
 if(options.realEffects){ctx.PetTornado={draw(){}};vm.runInContext(read('src/interactions.js'),context,{filename:'interactions.js'});vm.runInContext('const RealEffects=CowEffects;CowEffects=class extends RealEffects{constructor(h){super(h);globalThis.effectInstance=this;}};',context);}
 vm.runInContext(read('src/app.js'),context,{filename:'app.js'});for(let i=0;i<8;i++)await Promise.resolve();return{ctx,document,store};
}
function applyLimit(document,value,enabled=true){
 const toggle=document.getElementById('sceneLimitEnabled'),input=document.getElementById('sceneLimit');
 assert(toggle&&input&&document.getElementById('apply-scene-limit'),'Optional scene limit controls must exist');
 toggle.checked=enabled;for(const listener of toggle.events.change||[])listener({target:toggle});
 input.value=value;document.getElementById('apply-scene-limit').click();
}
function flushSave(ctx,store){ctx.intervals.find(x=>x.delay===2500).fn();return JSON.parse(store.get('pet-catch-v1'));}
function runFrames(ctx){for(let t=0;t<800;t+=1000/60)ctx.frame(t);}

module.exports={Node,documentFor,dispatch,bootstrap,applyLimit,flushSave,runFrames};
