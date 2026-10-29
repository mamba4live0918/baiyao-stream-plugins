(function(root,factory){const Type=factory();if(typeof module==='object'&&module.exports)module.exports=Type;else root.PetBoxDisplay=Type;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 class PetBoxDisplay{
  constructor(hooks){Object.assign(this,hooks);}
  prepare(round){
   const {w,h}=this.viewport();round.boxFall=this.motion.restore(round.boxFall,w,h,this.size());
   round.boxAge=Number.isFinite(round.boxAge)?Math.max(0,Math.min(2,round.boxAge)):0;
   if(round.applied){round.phase=Math.max(2,round.phase||0);round.boxFall.done=true;round.boxFall.x=w/2;round.boxFall.y=h/2;}
   else if(round.phase>=2){round.phase=1;round.boxFall.done=true;round.boxFall.x=w/2;round.boxFall.y=h/2;}
   this.render(round);return round;
  }
  render(round){
   const size=this.size(),fall=round.boxFall;if(!fall)return;
   this.show.dataset.physicalBox='true';this.show.style.width=size+'px';this.show.style.height=(size/1.15+86)+'px';this.show.style.maxHeight='none';this.show.style.overflowX='visible';this.show.style.overflowY='visible';this.show.style.setProperty?.('--anim-width',size+'px');
   const destination=this.placement?.(size,size/1.15+86);
   this.show.style.left=(fall.x+(destination?destination.x-fall.w/2:0))+'px';this.show.style.top=(fall.y+(destination?destination.y-fall.h/2:0))+'px';
   if(destination){this.show.style.transform=`translate(-50%,-50%) scale(${destination.scale})`;this.show.style.zIndex=destination.abovePen?'21':'';}
   const squash=this.animate()?Math.max(0,Math.min(.24,fall.squash||0)):0,angle=this.animate()?fall.angle||0:0;
   this.art.style.transform=`rotate(${angle}deg) scale(${1+squash},${1-squash})`;
  }
  step(round,dt,preview=false){
   dt=Number.isFinite(dt)?Math.max(0,Math.min(.05,dt)):0;
   if(!round.boxFall)this.prepare(round);
   if(round.phase<2){
    this.motion.step(round.boxFall,dt,this.core,!this.animate());
    if(round.boxFall.done){
     round.phase=2;round.boxAge=0;this.onBurst(round,preview);this.onPhase(round,2,true);
    }else{const phase=round.boxFall.bounces>0?1:0;if(round.phase!==phase){round.phase=phase;this.onPhase(round,phase,false);}}
   }else{
    round.boxAge+=dt;
    if(round.boxAge>=.3&&round.phase===2){round.phase=3;this.onPhase(round,3,false);}
   }
   this.render(round);return round.phase>=2&&round.boxAge>=1.3;
  }
  resize(round){if(round?.boxFall){const {w,h}=this.viewport();this.motion.rebase(round.boxFall,w,h);this.render(round);}}
 }
 return PetBoxDisplay;
});
