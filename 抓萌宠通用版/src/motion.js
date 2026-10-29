(function(root){
'use strict';
const PROFILES=Object.freeze({run:'小狗快跑',plod:'小牛慢走',prowl:'小猫轻步',squish:'史莱姆弹跳',hop:'小羊跃步',scoot:'海豹跳跃',float:'头像漂浮',walk:'自然走路',swim:'水中游动',fly:'振翅飞行'});
function rest(p,core){core.resetHop(p);p.motionStage='rest';p.motionTilt=0;p.hopLift=0;p.hopScaleX=1;p.hopScaleY=1;p.hopFrame=0;p.walking=false;}
function standardFrame(spec,distance){
 let total=0;for(let i=0;i<spec.advance.length;i++){total+=spec.advance[i];if(distance<total-1e-9)return i;}return spec.advance.length-1;
}
function standardContact(spec,distance){
 const marks=[];let sum=0;for(let i=0;i<spec.advance.length;i++){if(spec.contactFrames.includes(i))marks.push({frame:i,distance:sum});sum+=spec.advance[i];}
 const current=standardFrame(spec,distance);
 if(spec.contactFrames.includes(current))return{frame:current,distance,remaining:0};
 for(const m of marks)if(m.distance>distance+1e-9)return{...m,remaining:m.distance-distance};
 return{...marks[0],remaining:sum-distance+marks[0].distance};
}
// Escape an overlapping nest at normal speed before resuming ordinary avoidance.
function standardEscape(p,options){
 const q=options.obstacle,b=options.bounds,r=options.radius||0;
 if(!q||!b||!(p.x>q.x-r&&p.x<q.x+q.w+r&&p.y>q.y-r&&p.y<q.y+q.h+r))return null;
 const midX=(b.left+b.right)/2,midY=(b.top+b.bottom)/2;
 const loX=Math.min(b.left+r,midX),hiX=Math.max(b.right-r,midX),loY=Math.min(b.top+r,midY),hiY=Math.max(b.bottom-r,midY);
 const edges=[{x:q.x-r,y:p.y},{x:q.x+q.w+r,y:p.y},{x:p.x,y:q.y-r},{x:p.x,y:q.y+q.h+r}]
  .filter(e=>e.x>=loX&&e.x<=hiX&&e.y>=loY&&e.y<=hiY)
  .sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y));
 return edges[0]||false;
}
function standardFinish(p,dt,spec){
 const f=p.spriteFinish,cycle=spec.advance.reduce((a,b)=>a+b,0);
 const amount=Math.min(f.remaining,dt*spec.fps*1.3*Math.min(...spec.advance));
 p.spriteDistance=((p.spriteDistance||0)+amount)%cycle;f.remaining-=amount;
 p.hopFrame=standardFrame(spec,p.spriteDistance);p.walking=false;p.motionStage='walk';
 if(f.remaining<=1e-8){
  p.spriteDistance=f.targetDistance;p.hopFrame=f.targetFrame;
  if(f.facing!==null)p.facing=f.facing;
  p.spriteFinish=null;p.spriteSettle=f.facing===null;
 }
}
function standardHop(p,dt,options,core,rng){
 const spec=p.spriteMotion,frames=p.walkFrames,fps=spec.fps,duration=frames/fps;
 if(p.spriteHopState==='complete'){
  p.spriteHopState='rest';p.spriteHopWait=.16+rng()*.9;p.hopFrame=0;p.hopLift=0;p.motionStage='rest';p.walking=false;return p;
 }
 if(!p.spriteHopState||p.spriteHopState==='rest'){
  p.spriteHopWait=Math.max(0,(p.spriteHopWait||0)-dt);
  if(p.spriteHopWait>0){p.motionStage='rest';p.hopFrame=0;p.hopLift=0;p.walking=false;return p;}
  p.spriteHopState='active';p.spriteHopElapsed=0;p.spriteHopPendingFacing=null;p.spriteHopBlocked=false;
  const direction=p.facing===-1?-1:1,vy=(rng()-.5)*.5,norm=Math.hypot(1,vy);
  p.roamVX=direction/norm;p.roamVY=vy/norm;
 }
 const speed=Number.isFinite(options.speed)?options.speed:0;
 const rate=speed>0?Math.min(1.3,Math.max(.7,speed/45)):0;
 let t=p.spriteHopElapsed||0;const end=Math.min(duration,t+dt*rate),scale=Math.max(.001,(options.size||spec.frameWidth)/spec.frameWidth);
 p.walking=false;
 while(t<end-1e-10){
  const frame=Math.min(frames-1,Math.floor(t*fps+1e-9)),boundary=(frame+1)/fps,segment=Math.min(end,boundary,t+.05)-t;
  if(segment<=1e-10)break;
  if(spec.phases[frame]==='flight'&&spec.advance[frame]>0&&!p.spriteHopBlocked){
   p.wait=0;p.turnIn=1000000;
   const facing=p.facing;
   core.stepRoam(p,segment,{...options,speed:spec.advance[frame]*scale*fps},rng);
   if(p.facing!==facing){if(spec.mirror!==false)p.spriteHopPendingFacing=p.facing;p.facing=facing;p.spriteHopBlocked=true;}
  }
  t+=segment;
 }
 p.spriteHopElapsed=end;p.hopFrame=Math.min(frames-1,Math.floor(end*fps+1e-9));
 const flightStart=spec.phases.indexOf('flight')/fps,flightEnd=(spec.phases.lastIndexOf('flight')+1)/fps;
 const arc=end>flightStart&&end<flightEnd?Math.sin(Math.PI*(end-flightStart)/(flightEnd-flightStart)):0;
 p.hopLift=arc?-arc*Math.min(48,(options.size||80)*.38):0;p.hopStage=spec.phases[p.hopFrame];p.motionStage='hop';
 if(p.hopStage==='land'&&(p.spriteHopPendingFacing===1||p.spriteHopPendingFacing===-1)){p.facing=p.spriteHopPendingFacing;p.spriteHopPendingFacing=null;}
 if(end>=duration-1e-9){p.spriteHopState='complete';p.hopLift=0;}
 return p;
}
function stepStandard(p,dt,options,mode,core,rng){
 const spec=p.spriteMotion,frames=p.walkFrames;
 if(dt<=0)return p;
 p.hopScaleX=1;p.hopScaleY=1;p.motionTilt=0;
 if(spec.type==='hop'){
  return standardHop(p,dt,options,core,rng);
 }else{
  if(p.spriteSettle){p.spriteSettle=false;p.motionStage='rest';p.walking=false;p.hopLift=0;return p;}
  if(p.spriteFinish){standardFinish(p,dt,spec);p.hopLift=0;return p;}
  const x=p.x,y=p.y,facing=p.facing||1,scale=Math.max(.001,(options.size||spec.frameWidth)/spec.frameWidth);
  // The smallest authored step gives a conservative cap even with uneven advances.
  // Limit movement itself, then derive the pose from the distance actually travelled.
  const maxSpeed=Math.min(...spec.advance)*scale*spec.fps*1.3;
  const speed=Math.min(Math.max(0,Number.isFinite(options.speed)?options.speed:0),maxSpeed/1.1);
  const escape=standardEscape(p,options);
  if(escape===false){p.spriteDistance=0;p.hopFrame=0;p.walking=false;p.motionStage='rest';p.hopLift=0;return p;}
  if(escape){
   const ex=escape.x-x,ey=escape.y-y,remaining=Math.hypot(ex,ey);
   const previousWait=p.wait,previousTurn=p.turnIn;
   p.roamVX=ex/remaining;p.roamVY=ey/remaining;p.wait=0;p.turnIn=1000000;
   core.stepRoam(p,dt,{...options,speed:Math.min(speed,remaining/dt),obstacle:null},rng);
   p.wait=previousWait;p.turnIn=previousTurn;
   if(Math.abs(ex)<1e-9)p.facing=facing;
  }else core.stepRoam(p,dt,{...options,speed},rng);
  const dx=p.x-x,dy=p.y-y,travel=Math.hypot(dx,dy),maxTravel=maxSpeed*dt;
  if(travel>maxTravel&&travel>0){p.x=x+dx*maxTravel/travel;p.y=y+dy*maxTravel/travel;}
  const proposedFacing=p.facing||facing,turn=proposedFacing!==facing&&spec.mirror!==false;
  if(spec.mirror===false)p.facing=facing;
  const distance=Math.hypot(p.x-x,p.y-y);
  if(!turn&&distance<=.00001&&(!p.motionStage||p.motionStage==='rest')){p.motionStage='rest';p.hopFrame??=0;p.walking=false;p.hopLift=0;return p;}
  if(turn||distance<=.00001){
   if(turn){p.x=x;p.y=y;p.facing=facing;}
   const target=standardContact(spec,p.spriteDistance||0);
   p.spriteFinish={remaining:target.remaining,targetDistance:target.distance,targetFrame:target.frame,facing:turn?proposedFacing:null};
   standardFinish(p,0,spec);p.hopLift=0;
  }else{
   const cycle=spec.advance.reduce((a,b)=>a+b,0),next=((p.spriteDistance||0)+distance/scale)%cycle;
   p.spriteDistance=next;p.hopFrame=standardFrame(spec,next);p.walking=true;p.motionStage='walk';
  }
  p.hopLift=0;
 }
 p.hopScaleX=1;p.hopScaleY=1;p.motionTilt=0;return p;
}
function stepArticulated(p,dt,options,mode,core,rng){
 const profile=PROFILES[mode]?mode:'squish',frames=p.walkFrames;
 if(profile==='squish'||profile==='hop'||profile==='scoot'){
  core.stepHop(p,dt,{...options,speed:options.speed*(profile==='hop'?.85:profile==='scoot'?.75:1)},rng);
  // Keep frame zero for rest and preserve the original 2:6:3 jumping phase balance.
  const phases=frames===30?{prep:[1,5,.16],flight:[6,16,.5],land:[22,8,.2]}:{prep:[1,2,.16],flight:[3,6,.5],land:[9,3,.2]},phase=phases[p.hopStage];
  p.hopFrame=phase?phase[0]+Math.min(phase[1]-1,Math.floor((p.hopTime||0)/phase[2]*phase[1])):0;
  p.motionStage=phase?profile:'rest';
 }else{
  const beforeX=p.x,beforeY=p.y,speed={run:2.2,plod:.68,prowl:1.08,float:.84,walk:1}[profile];
  core.stepRoam(p,dt,{...options,speed:options.speed*speed},rng);
  const distance=Math.hypot(p.x-beforeX,p.y-beforeY),active=distance>.00001||profile==='float';
  p.walking=distance>.00001;
  // One stride follows travelled distance; cap at two cycles per second.
  const stride=Number.isFinite(p.strideScale)&&p.strideScale>=.1&&p.strideScale<=1?p.strideScale:.55;
  if(active)p.poseClock=(p.poseClock||0)+(profile==='float'?dt*.7:Math.min(dt*2,distance/Math.max(16,(options.size||90)*stride)));
  p.motionStage=active?profile:'rest';
  p.hopFrame=active?Math.floor(((p.poseClock||0)%1)*frames):0;
  p.hopLift=profile==='float'?-Math.sin((p.poseClock||0)*Math.PI*2)*10:0;
 }
 p.hopScaleX=1;p.hopScaleY=1;p.motionTilt=0;
 p.maxLift=Math.min(p.maxLift||0,p.hopLift||0);return p;
}
function stepSwim(p,dt,options,core,rng){
 const beforeX=p.x,beforeY=p.y;core.stepRoam(p,dt,options,rng);
 const moving=Math.hypot(p.x-beforeX,p.y-beforeY)>.00001,cycle=Number.isFinite(p.swimCycleMs)?Math.max(500,p.swimCycleMs):1200;
 p.swimClock=(p.swimClock||0)+dt*1000/cycle*(moving?1:.35);
 p.hopFrame=Math.floor((p.swimClock%1)*Math.max(2,p.walkFrames||12));p.motionStage='swim';p.motionTilt=0;p.hopScaleX=1;p.hopScaleY=1;
 p.hopLift=Math.sin(p.swimClock*Math.PI*2)*Math.min(3,(options.size||80)*.035);return p;
}
function stepFly(p,dt,options,core,rng){
 if(!(options.animate??options.enabled)||p.held||p.airborne){rest(p,core);return p;}
 const beforeX=p.x,beforeY=p.y,beforeFacing=p.facing;core.stepRoam(p,dt,options,rng);
 p.walking=Math.hypot(p.x-beforeX,p.y-beforeY)>.00001;
 // A blocked roam attempt may reverse velocity without actually turning the flyer.
 if(!p.walking)p.facing=beforeFacing;
 const cycle=Number.isFinite(p.flyCycleMs)?Math.max(500,p.flyCycleMs):1200;
 p.flyClock=((p.flyClock||0)+dt*1000/cycle)%1;
 p.hopFrame=Math.min(Math.max(2,p.walkFrames||30)-1,Math.floor(p.flyClock*Math.max(2,p.walkFrames||30)+1e-9));
 const bank=Number.isFinite(p.flyBankDeg)?Math.max(0,Math.min(18,p.flyBankDeg)):0,target=p.walking&&Math.abs(p.x-beforeX)>.00001?Math.sign(p.x-beforeX)*bank:0;
 p.motionStage='fly';p.motionTilt=bank?(p.motionTilt||0)+(target-(p.motionTilt||0))*(1-Math.exp(-dt/.22)):0;p.hopScaleX=1;p.hopScaleY=1;
 p.flyHoverClock=((p.flyHoverClock||0)+dt/2.8)%1;
 p.hopLift=Math.sin(p.flyHoverClock*Math.PI*2)*Math.min(5,(options.size||80)*.05);
 return p;
}
function step(p,dt,options,mode,core,rng=Math.random){
 dt=Number.isFinite(dt)?Math.max(0,Math.min(.05,dt)):0;
 if(mode==='fly')return stepFly(p,dt,options,core,rng);
 if(!options.enabled||p.held||p.airborne){if(p.spriteMotion){p.spriteDistance=0;p.spriteFinish=null;p.spriteSettle=false;p.spriteHopState='rest';p.spriteHopElapsed=0;p.spriteHopWait=0;}rest(p,core);return p;}
 if(p.spriteMotion&&(p.spriteMotion.type==='walk'||p.spriteMotion.type==='hop'))return stepStandard(p,dt,options,mode,core,rng);
 if(mode==='swim')return stepSwim(p,dt,options,core,rng);
 if(p.articulated&&(p.walkFrames===12||p.walkFrames===30))return stepArticulated(p,dt,options,mode,core,rng);
 const profile=PROFILES[mode]?mode:'squish',t=p.motionClock=(p.motionClock||0)+dt;
 if(profile==='squish'||profile==='scoot'){core.stepHop(p,dt,profile==='scoot'?{...options,speed:options.speed*.75}:options,rng);p.motionStage=profile;p.motionTilt=0;p.maxLift=Math.min(p.maxLift||0,p.hopLift||0);return p;}
 const catBeat=t%2.7,sheepBeat=t%1.15,catLeap=profile==='prowl'&&catBeat<.5,sheepLeap=profile==='hop'&&sheepBeat<.63;
 const speed={run:2.2,plod:.68,prowl:catLeap?2.05:1.08,hop:sheepLeap?1.45:.25,float:.84,walk:1}[profile];
 core.stepRoam(p,dt,{...options,speed:options.speed*speed},rng);
 p.motionStage=catLeap?'pounce':profile;
 const active=p.walking||profile==='float',phase=t*({run:14,plod:5.5,prowl:6,hop:7,float:3,walk:7}[profile]);
 p.hopLift=0;p.hopScaleX=1;p.hopScaleY=1;p.motionTilt=0;p.hopFrame=0;
 if(!active){p.maxLift=Math.min(p.maxLift||0,0);return p;}
 if(profile==='run'){const beat=Math.abs(Math.sin(phase));p.hopLift=-beat*11;p.hopScaleX=1.04+beat*.06;p.hopScaleY=1.02-beat*.09;p.motionTilt=Math.sin(phase)*4;p.hopFrame=Math.floor(t*11)%4;}
 else if(profile==='plod'){const beat=Math.abs(Math.sin(phase));p.hopLift=-beat*3;p.hopScaleX=1+beat*.025;p.hopScaleY=1-beat*.025;p.motionTilt=Math.sin(phase)*2.5;p.hopFrame=Math.floor(t*5)%4;}
 else if(profile==='prowl'){const u=catBeat/.5,arc=catLeap?Math.sin(Math.PI*u):0;p.hopLift=catLeap?-arc*32:-Math.abs(Math.sin(phase))*2;p.hopScaleX=catLeap?1+arc*.1:1.1;p.hopScaleY=catLeap?1-arc*.07:.91;p.motionTilt=Math.sin(phase)*2;p.hopFrame=Math.floor(t*8)%4;}
 else if(profile==='hop'){const arc=sheepLeap?Math.sin(Math.PI*sheepBeat/.63):0;p.hopLift=-arc*38;p.hopScaleX=1-arc*.07;p.hopScaleY=1+arc*.11;p.motionTilt=Math.sin(phase)*3;p.hopFrame=Math.floor(t*7)%4;}
 else if(profile==='float'){p.hopLift=-Math.sin(phase)*10;p.hopScaleX=1+.025*Math.sin(phase);p.hopScaleY=1-.025*Math.sin(phase);p.motionTilt=Math.sin(phase)*5;p.hopFrame=Math.floor(t*3)%4;}
 else if(profile==='walk'){p.hopLift=-Math.abs(Math.sin(phase))*2;p.hopFrame=Math.floor(t*7)%4;}
 p.maxLift=Math.min(p.maxLift||0,p.hopLift);return p;
}
const api={PROFILES,step,rest};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.PetMotion=api;
})(typeof window==='undefined'?globalThis:window);
