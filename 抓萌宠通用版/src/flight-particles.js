(function(root){
'use strict';
const STYLES=new Set(['butterfly','dragon']),MAX_PARTICLES=96,RATE=60;
const delta=dt=>Number.isFinite(dt)?Math.max(0,Math.min(.05,dt)):0;
function eligible(c,styles){return !!c&&STYLES.has(c.particleStyle)&&styles?.has(c.particleStyle)&&c.motionMode==='fly'&&c.walkMode==='default'&&c.visualKind===c.kind&&!c.held&&!c.dead&&!c.airborne&&!c.ballEmerging&&!c.boxFlight&&!c.windActive&&c.el?.isConnected!==false&&Number.isFinite(c.x)&&Number.isFinite(c.y)&&Number.isFinite(c.size)&&c.size>0;}
class Field{
 constructor({random=Math.random}={}){this.random=random;this.particles=[];this.credit=0;this.cursor=0;}
 clear(){this.particles=[];this.credit=0;this.cursor=0;}
 remove(owner){if(!this.particles.length)return false;const before=this.particles.length;this.particles=this.particles.filter(p=>p.owner!==owner);return this.particles.length!==before;}
 step(actors,dt,{enabled=true,styles=STYLES}={}){
  if(!enabled){this.clear();return;}
  const elapsed=delta(dt),active=this.particles.length?new Set(actors):null,sample=()=>{let n;try{n=this.random();}catch{}return Number.isFinite(n)?Math.max(0,Math.min(1,n)):.5;};
  this.particles=this.particles.filter(p=>{
   if(!active.has(p.owner)||!eligible(p.owner,styles)||p.style!==p.owner.particleStyle)return false;
   p.age+=elapsed;if(p.age>=p.life)return false;
   p.x+=p.vx*elapsed;p.y+=p.vy*elapsed;p.vy-=elapsed*3;p.angle+=p.spin*elapsed;p.alpha=(1-p.age/p.life)**2;return true;
  });
  this.credit=Math.min(4,this.credit+elapsed*RATE);
  const count=Math.min(4,Math.floor(this.credit),MAX_PARTICLES-this.particles.length);this.credit-=count;
  for(let i=0;i<count;i++){
   let owner=null;
   for(let searched=0;searched<actors.length;searched++){const c=actors[this.cursor++%actors.length];if(eligible(c,styles)){owner=c;break;}}
   if(!owner){this.credit=0;break;}
   const dragon=owner.particleStyle==='dragon',direction=owner.facing===-1?-1:1,spread=(sample()-.5)*owner.size*.1;
   this.particles.push({owner,style:owner.particleStyle,x:owner.x-direction*owner.size*(dragon?.37:.31),y:owner.y+(owner.hopLift||0)+owner.size*.13+spread,vx:-direction*(10+sample()*16),vy:(sample()-.65)*15,size:Math.min(8,owner.size*(dragon?.042:.026))*(.75+sample()*.5),age:0,life:.45+sample()*.35,alpha:1,angle:sample()*Math.PI*2,spin:(sample()-.5)*1.4});
  }
 }
}
class Renderer{
 constructor({host,sprites,viewport,document:doc=root.document,Image:ImageType=root.Image,random=Math.random}){
  this.field=new Field({random});this.viewport=viewport;this.images=new Map();this.styles=new Set();this.canvas=null;this.context=null;
  if(!host||!doc||typeof ImageType!=='function')return;
  const canvas=doc.createElement('canvas');let context;try{context=canvas.getContext('2d');}catch{}if(!context)return;
  canvas.className='pet-flight-particles';canvas.setAttribute('aria-hidden','true');Object.assign(canvas.style,{position:'absolute',inset:'0',width:'100%',height:'100%',pointerEvents:'none',background:'transparent',zIndex:'5'});host.append(canvas);this.canvas=canvas;this.context=context;
  for(const style of STYLES){const source=sprites?.[style];if(typeof source!=='string'||!/^data:image\/png;base64,/.test(source))continue;const image=new ImageType();image.onload=()=>{this.images.set(style,image);this.styles.add(style);};image.onerror=()=>{this.images.delete(style);this.styles.delete(style);};image.src=source;}
 }
 clear(){this.field.clear();if(this.context)this.context.clearRect(0,0,this.canvas.width,this.canvas.height);}
 remove(owner){if(this.field.remove(owner))this.draw();}
 step(actors,dt,enabled=true){if(!this.context)return;const before=this.field.particles.length;this.field.step(actors,dt,{enabled,styles:this.styles});if(before||this.field.particles.length)this.draw();}
 draw(){
  if(!this.context)return;const size=this.viewport(),w=Math.max(1,Math.round(size.w)),h=Math.max(1,Math.round(size.h));if(this.canvas.width!==w)this.canvas.width=w;if(this.canvas.height!==h)this.canvas.height=h;
  const ctx=this.context;ctx.clearRect(0,0,w,h);
  for(const p of this.field.particles){const image=this.images.get(p.style);if(!image)continue;ctx.save();ctx.globalAlpha=p.alpha;ctx.translate(p.x,p.y);ctx.rotate(p.angle);ctx.drawImage(image,-p.size,-p.size,p.size*2,p.size*2);ctx.restore();}
 }
}
const api={Field,Renderer};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.PetFlightParticles=api;
})(typeof window==='undefined'?globalThis:window);
