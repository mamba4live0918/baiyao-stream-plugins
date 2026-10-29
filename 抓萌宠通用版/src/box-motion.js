(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.PetBoxMotion=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const MAX_DIMENSION=100000,MAX_AGE=6,FIELDS=Object.freeze(['x','y','vx','vy','angle','angularVelocity','bounces','done','squash','w','h','elapsed','targetY']);
 const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
 const dimension=(value,fallback)=>Number.isFinite(value)&&value>0?clamp(value,1,MAX_DIMENSION):fallback;
 const delta=dt=>Number.isFinite(dt)?clamp(dt,0,.05):0;
 function create(W=1280,H=720,size=240){
  const w=dimension(W,1280),h=dimension(H,720),edge=Number.isFinite(size)&&size>0?clamp(size,1,2*Math.max(w,h)):Math.min(240,2*Math.max(w,h));
  return{x:w/2,y:-edge/2,vx:0,vy:0,angle:12,angularVelocity:-18,bounces:0,done:false,squash:0,w,h,elapsed:0,targetY:h/2};
 }
 function settle(r){
  r.x=r.w/2;r.y=r.targetY;r.vx=0;r.vy=0;r.angle=0;r.angularVelocity=0;r.squash=0;r.done=true;return r;
 }
 function step(r,dt,core,reduced=false){
  if(r.done)return r;
  if(reduced)return settle(r);
  const elapsed=delta(dt);if(!elapsed)return r;
  r.elapsed=Math.min(MAX_AGE,r.elapsed+elapsed);
  core.stepBall(r,elapsed,r.targetY);
  if(r.elapsed>=MAX_AGE-1e-9){r.elapsed=MAX_AGE;settle(r);}
  else if(r.done)settle(r);
  return r;
 }
 function rebase(r,W,H){
  const w=dimension(W,r.w),h=dimension(H,r.h),sx=w/r.w,sy=h/r.h;
  r.x*=sx;r.y*=sy;r.vx*=sx;r.vy*=sy;r.w=w;r.h=h;r.targetY=h/2;
  r.squash=Number.isFinite(r.squash)?clamp(r.squash,0,.24):0;return r;
 }
 function validSnapshot(raw){
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||typeof raw.done!=='boolean')return false;
  if(!FIELDS.filter(k=>k!=='done').every(k=>Number.isFinite(raw[k])))return false;
  if(raw.w<1||raw.w>MAX_DIMENSION||raw.h<1||raw.h>MAX_DIMENSION)return false;
  const extent=4*Math.max(raw.w,raw.h);
  return Math.abs(raw.x)<=extent&&Math.abs(raw.y)<=extent&&Math.abs(raw.vx)<=1000000&&Math.abs(raw.vy)<=1000000
   &&Math.abs(raw.angle)<=1000000&&Math.abs(raw.angularVelocity)<=100000&&Number.isInteger(raw.bounces)&&raw.bounces>=0&&raw.bounces<=3
   &&raw.squash>=0&&raw.squash<=.24&&raw.elapsed>=0&&raw.elapsed<=MAX_AGE&&Math.abs(raw.targetY-raw.h/2)<=1e-6;
 }
 function restore(raw,W,H,size=240){
  if(!validSnapshot(raw))return create(W,H,size);
  const r={};for(const key of FIELDS)r[key]=raw[key];
  rebase(r,W,H);
  if(!validSnapshot(r))return create(W,H,size);
  // A completed record is a settled visual, even if an older snapshot retained spin.
  return r.done?settle(r):r;
 }
 const coordinate=value=>Number.isFinite(value)?clamp(value,-1000000,1000000):0;
 function petFlight(from,to,seed=0){
  const x0=coordinate(from?.x),y0=coordinate(from?.y),targetX=coordinate(to?.x),targetY=coordinate(to?.y);
  const integer=Number.isFinite(seed)?Math.trunc(seed):0,unit=((integer%1009)+1009)%1009/1008,duration=.7+unit*.5,gravity=900;
  return{x0,y0,targetX,targetY,vx:(targetX-x0)/duration,vy:(targetY-y0-gravity*duration*duration/2)/duration,gravity,duration,elapsed:0};
 }
 function stepPet(p,dt,reduced=false){
  p.elapsed=reduced?p.duration:Math.min(p.duration,p.elapsed+delta(dt));
  if(p.elapsed>=p.duration)return{x:p.targetX,y:p.targetY,done:true};
  const t=p.elapsed;return{x:p.x0+p.vx*t,y:p.y0+p.vy*t+p.gravity*t*t/2,done:false};
 }
 return{create,step,rebase,restore,validSnapshot,petFlight,stepPet};
});

