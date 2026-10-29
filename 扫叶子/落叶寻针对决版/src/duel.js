(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.LeafDuel=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
class PullTracker{
  constructor({threshold=0.6,hold=1.5}={}){this.threshold=0.6;this.hold=1.5;this.configure({threshold,hold});this.reset();}
  configure({threshold=this.threshold,hold=this.hold}={}){this.threshold=Math.min(1,Math.max(0.1,Number(threshold)||0.6));this.hold=Math.min(5,Math.max(0.5,Number(hold)||1.5));return this;}
  reset(){this.active=false;this.progress=0;}
  canStart(exposure){return exposure>=this.threshold-1e-9;}
  start(exposure){if(!this.canStart(exposure))return false;this.active=true;this.progress=0;return true;}
  update(dt,{held,exposure}){
    if(!this.active)return'idle';
    if(!held||exposure<this.threshold-1e-9){this.reset();return'reset';}
    this.progress=Math.min(1,this.progress+dt/this.hold);
    if(this.progress>=1){this.active=false;return'done';}
    return'pulling';
  }
}
return{PullTracker};
});
