const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const target=path.join(__dirname,'../src/flight-particles.js'),P=fs.existsSync(target)?require(target):{};
const actor=(id=1,style='butterfly')=>({id,kind:2000023,visualKind:2000023,x:300,y:250,size:100,facing:1,particleStyle:style,motionMode:'fly',walkMode:'default',el:{isConnected:true}});
function field(){assert.equal(typeof P.Field,'function','native flight effect engine is available');return new P.Field({random:()=>.5});}
const opts={enabled:true,styles:new Set(['butterfly','dragon'])};
test('bitmap flight particles originate behind the real position and drift apart while fading out',()=>{
 const f=field(),a=actor();f.step([a],.05,opts);assert(f.particles.length>0);const p=f.particles[0],x=p.x,y=p.y,alpha=p.alpha;assert(x<a.x-20);assert(y>=a.y);a.x+=100;f.step([a],.05,opts);assert(p.x<x);assert(p.alpha<alpha);assert.equal(p.owner,a);assert(f.particles.some(n=>n.x>x+50));
 for(let i=0;i<25;i++)f.step([], .05,opts);assert.equal(f.particles.length,0);
});
test('particles follow both directions, enforce a global cap and never create per-pet nodes',()=>{
 const f=field(),a={...actor(),facing:-1};f.step([a],.05,opts);assert(f.particles[0].x>a.x+20);assert(f.particles[0].vx>0);
 const swarm=Array.from({length:20000},(_,i)=>actor(i));for(let i=0;i<150;i++){f.step(swarm,.05,opts);assert(f.particles.length<=96);}assert.equal(f.particles.length>0,true);
});
test('grab, recall, clear, burst, hidden avatars, uploads, duck proxies and disabled animation suppress old effects immediately',()=>{
 for(const update of [{held:true},{dead:true},{airborne:true},{ballEmerging:true},{windActive:true},{boxFlight:{}},{walkMode:'sequence'},{visualKind:1000000},{motionMode:'walk'},{particleStyle:null}]){const f=field(),a=actor();f.step([a],.05,opts);Object.assign(a,update);f.step([a],.05,opts);assert.equal(f.particles.length,0,JSON.stringify(update));}
 const f=field(),a=actor();f.step([a],.05,opts);f.step([a],.05,{...opts,enabled:false});assert.equal(f.particles.length,0);f.step([a],.05,opts);f.remove(a);assert.equal(f.particles.length,0);f.step([a],.05,opts);f.clear();assert.equal(f.particles.length,0);
});
test('delayed frames and malformed actor metadata cannot create an unbounded emission burst',()=>{
 const f=field(),a=actor();f.step([a],10,opts);assert(f.particles.length<=4);f.clear();f.step([{...a,x:NaN},{...a,size:-5},{...a,particleStyle:'other'}],.05,opts);assert.equal(f.particles.length,0);
});
test('the renderer paints decoded bitmap pixels onto one transparent canvas and clears it without blocking the host',async()=>{
 const {createCanvas,Image}=require('C:/Users/Mamba4live/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@napi-rs/canvas');
 assert.equal(typeof P.Renderer,'function');const bitmap=createCanvas(8,8),b=bitmap.getContext('2d');b.fillStyle='#96dfff';b.fillRect(2,2,4,4);const source=bitmap.toDataURL('image/png');
 const host={children:[],append(n){this.children.push(n);}},document={createElement(){const n=createCanvas(1,1);n.style={};n.setAttribute=()=>{};return n;}};
 const renderer=new P.Renderer({host,sprites:{butterfly:source},viewport:()=>({w:600,h:400}),document,Image,random:()=>.5});
 for(let i=0;i<50&&!renderer.styles.size;i++)await new Promise(r=>setTimeout(r,5));
 renderer.step([actor()],.05);assert.equal(host.children.length,1);assert.equal(renderer.canvas.style.pointerEvents,'none');assert.equal(renderer.canvas.style.background,'transparent');
 const pixels=renderer.context.getImageData(0,0,600,400).data,alpha=[];for(let i=3;i<pixels.length;i+=4)if(pixels[i])alpha.push(i);assert(alpha.length>0);assert.equal(pixels[3],0);
 const first=renderer.field.particles[0];renderer.step([first.owner],.05);assert(renderer.field.particles[0].alpha<1);renderer.clear();assert.equal(renderer.context.getImageData(270,263,1,1).data[3],0);assert.equal(renderer.field.particles.length,0);
});
test('an idle field and removal of unrelated pets do not repaint a fullscreen transparent canvas',async()=>{
 const {createCanvas,Image}=require('C:/Users/Mamba4live/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@napi-rs/canvas'),bitmap=createCanvas(4,4);bitmap.getContext('2d').fillRect(0,0,4,4);
 const host={append(){}},document={createElement(){const c=createCanvas(1,1);c.style={};c.setAttribute=()=>{};return c;}},renderer=new P.Renderer({host,sprites:{butterfly:bitmap.toDataURL('image/png')},viewport:()=>({w:600,h:400}),document,Image});
 for(let i=0;i<50&&!renderer.styles.size;i++)await new Promise(r=>setTimeout(r,5));let clears=0;const clear=renderer.context.clearRect.bind(renderer.context);renderer.context.clearRect=(...args)=>{clears++;clear(...args);};
 for(let i=0;i<100;i++)renderer.step([],1/60);assert.equal(clears,0);
 const own=actor();renderer.step([own],.05);assert.equal(clears,1);for(let i=0;i<20000;i++)renderer.remove(actor(i+2));assert.equal(clears,1);renderer.remove(own);assert.equal(clears,2);assert.equal(renderer.field.particles.length,0);
});
