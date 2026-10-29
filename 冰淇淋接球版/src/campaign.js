(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.GelatoCampaign=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function nextStep(currentLevel,completed,total=6){
    const cleared=new Set([...completed].filter(n=>Number.isInteger(n)&&n>=1&&n<=total));
    if(cleared.size===total)return {action:'restart',level:1,allClear:true};
    if(currentLevel<total)return {action:'next',level:currentLevel+1,allClear:false};
    const missing=Array.from({length:total},(_,i)=>i+1).find(n=>!cleared.has(n));
    return {action:'missing',level:missing,allClear:false};
  }
  return {nextStep};
});
