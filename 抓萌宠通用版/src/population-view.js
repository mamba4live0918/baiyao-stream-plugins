(function(root,factory){const Type=factory();if(typeof module==='object'&&module.exports)module.exports=Type;else root.PetPopulationView=Type;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 class PetPopulationView{
  constructor({core,getState,getCows,makeCow,snapshotCow,batchSize=64,reserve=()=>0,getLimit=()=>null}){
   Object.assign(this,{core,getState,getCows,makeCow,snapshotCow,reserve,getLimit});
   this.batchSize=Number.isInteger(batchSize)&&batchSize>0&&batchSize<=100000?batchSize:64;
   this.restoring=[];this.parkedActors=new WeakSet();this.beginFrame();
  }
  beginFrame(){this.budget=this.batchSize;}
  liveCows(){return this.getCows().filter(actor=>!this.parkedActors.has(actor));}
  plan(){return this.core.planPopulation(this.getState(),this.liveCows(),this.getLimit());}
  capacity(){const n=this.getState().outside;return Number.isInteger(n)&&n>=0&&n<=100000?n:0;}
  position(row){
   if(!row||!Number.isFinite(row.x)||row.x<0||row.x>1||!Number.isFinite(row.y)||row.y<0||row.y>1||!this.core.validKind(row.kind))return null;
   return{x:row.x,y:row.y,kind:row.kind,...(Number.isSafeInteger(row.windAttempt)&&row.windAttempt>=0?{windAttempt:row.windAttempt}:{}),...(this.core.validIndividualScale?.(row.individualScale)&&row.individualScale!==100?{individualScale:row.individualScale}:{})};
  }
  restore(rows){
   this.restoring=[];const limit=this.capacity();
   for(const row of Array.isArray(rows)?rows:[]){if(this.restoring.length>=limit)break;const saved=this.position(row);if(saved)this.restoring.push(saved);}
   this.sync();return this.restoring;
  }
  snapshotPositions(){
   const rows=[],limit=this.capacity();
   for(const actor of this.getCows()){if(rows.length>=limit)break;if(actor.dead||this.parkedActors.has(actor))continue;const row=this.position(this.snapshotCow(actor));if(row)rows.push(row);}
   for(const saved of this.restoring){if(rows.length>=limit)break;rows.push({...saved});}
   return rows;
  }
  sync(){return this.getState().positions=this.snapshotPositions();}
  rebalance(sync=true){
   const plan=this.plan(),saved=plan.parked.map(actor=>this.position(this.snapshotCow(actor)));
   if(saved.some(row=>!row))throw Error('退场位置快照无效');
   // Ownership moves before the caller removes DOM/flight objects; repeated calls must not enqueue them twice.
   for(const actor of plan.parked)this.parkedActors.add(actor);
   if(saved.length)this.restoring=saved.concat(this.restoring);
   if(sync)this.sync();return plan;
  }
  drain(grounded=false){
   const state=this.getState(),plan=this.plan(),reserved=Number(this.reserve());
   const allowance=Math.max(0,this.budget-(Number.isFinite(reserved)?Math.max(0,Math.floor(reserved)):0));
   const count=Math.min(plan.missing,allowance),created=[];let restored=0,pending=0;
   const kinds=Array.isArray(state.pendingKinds)?state.pendingKinds:[];
   try{
    for(let i=0;i<count;i++){
     const saved=this.restoring[restored],explicit=!saved&&pending<kinds.length;
     const actor=this.makeCow(saved?{...saved}:null,grounded,explicit?kinds[pending]:undefined);
     if(!actor)break;
     created.push(actor);this.budget--;if(saved)restored++;else if(explicit)pending++;
    }
   }finally{
    // Commit only successful creations, once per batch rather than shifting 100000-element queues repeatedly.
    if(restored)this.restoring.splice(0,restored);if(pending)kinds.splice(0,pending);this.sync();
   }
   return created;
  }
  admitNew(n,createCallback){
   const created=[],count=Number.isInteger(n)&&n>=0?Math.min(n,this.budget,this.plan().missing):0;
   try{for(let i=0;i<count;i++){const actor=createCallback(i);if(!actor)break;created.push(actor);this.budget--;}}
   finally{this.sync();}
   return created;
  }
  collectWaiting(n,visibleCount,now){
   const state=this.getState(),original=state.pendingKinds,oldKinds=Array.isArray(original)?original:[],prefix=this.restoring.map(row=>row.kind);
   state.pendingKinds=prefix.concat(oldKinds);let actual;
   try{actual=this.core.collectPending(state,n,visibleCount,now);}
   catch(error){state.pendingKinds=original;this.sync();throw error;}
   if(Number.isSafeInteger(actual)&&actual>0){
    this.restoring.splice(0,Math.min(actual,this.restoring.length));
    state.pendingKinds=state.pendingKinds.slice(this.restoring.length);
   }else{state.pendingKinds=original;actual=0;}
   this.sync();return actual;
  }
  retireKind(kind,fallback=0){const replacement=this.core.validKind(fallback)?fallback:0;for(const row of this.restoring)if(row.kind===kind)row.kind=replacement;this.sync();}
  clear(){this.restoring=[];this.parkedActors=new WeakSet();this.beginFrame();this.sync();}
 }
 return PetPopulationView;
});
