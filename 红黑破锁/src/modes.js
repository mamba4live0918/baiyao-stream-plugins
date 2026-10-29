/* Independent V2.3 modes and count arithmetic. No DOM, storage, or wall-clock reads. */
const LockModes=(()=>{
  const model=typeof TypingLockModel==='object'?TypingLockModel:require('./core.js');
  const gifts=typeof LockGiftRules==='object'?LockGiftRules:require('./rules.js');
  const MAX_COUNT=Number.MAX_SAFE_INTEGER,MAX_BIG=BigInt(MAX_COUNT),modes=['lock','cage','count'];
  const integer=(n,min=0,max=MAX_COUNT)=>Number.isSafeInteger(n)&&n>=min&&n<=max;
  const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
  function copy(value,seen=new Set(),depth=0){
    if(value===undefined)return null;
    if(value===null||typeof value==='string'||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value))return value;
    if(typeof value!=='object'||depth>32||seen.has(value)||!Array.isArray(value)&&Object.getPrototypeOf(value)!==Object.prototype&&Object.getPrototypeOf(value)!==null)throw new TypeError('Invalid snapshot');
    seen.add(value);const out=Array.isArray(value)?[]:{};
    for(const key of Object.keys(value))Object.defineProperty(out,key,{value:copy(value[key],seen,depth+1),enumerable:true,writable:true,configurable:true});
    seen.delete(value);return out;
  }
  const modeFrom=s=>modes.includes(s?.mode)?s.mode:s?.challengeMode==='count'?'count':s?.sceneMode==='cage'?'cage':'lock';
  const validCount=s=>!!s&&integer(s.remaining)&&integer(s.pressed)&&model.keyValid(s.key)&&(s.remaining>0||s.pressed===0);
  function createCount(amount=0,options={}){
    if(!integer(amount))return null;
    try{return {remaining:amount,pressed:0,key:model.keyValid(options.key)?options.key==='NumpadEnter'?'Enter':options.key:'Space',source:copy(options.source)};}catch{return null;}
  }
  function restoreCount(raw){if(!validCount(raw))return null;try{return {remaining:raw.remaining,pressed:raw.pressed,key:raw.key==='NumpadEnter'?'Enter':raw.key,source:copy(raw.source)};}catch{return null;}}
  function outcome(before,s,capped=false){return {changed:before!==s.remaining,completed:before>0&&s.remaining===0,capped,applied:Math.abs(before-s.remaining)};}
  function addCount(s,amount,options={}){
    if(!validCount(s)||!integer(amount,1))return null;
    const before=s.remaining;
    if(!before){const fresh=createCount(0,options);if(!fresh)return null;Object.assign(s,fresh);}
    const total=BigInt(before)+BigInt(amount);s.remaining=Number(total>MAX_BIG?MAX_BIG:total);return outcome(before,s,total>MAX_BIG);
  }
  function pressCount(s){
    if(!validCount(s))return null;const before=s.remaining;
    if(before){s.remaining--;s.pressed=s.remaining?Math.min(MAX_COUNT,s.pressed+1):0;}
    return outcome(before,s);
  }
  function relieveCount(s,amount){
    if(!validCount(s)||!integer(amount))return null;const before=s.remaining;s.remaining=Math.max(0,before-amount);if(!s.remaining)s.pressed=0;return outcome(before,s);
  }
  function multiplyCount(s,factor,repetitions=1){
    if(!validCount(s)||!integer(factor,1,1000)||!integer(repetitions,1,99000000))return null;
    const before=s.remaining;let value=BigInt(before),capped=false;
    if(factor>1&&value>0n)for(let i=0;i<repetitions;i++){value*=BigInt(factor);if(value>MAX_BIG){value=MAX_BIG;capped=true;break;}}
    s.remaining=Number(value);return outcome(before,s,capped);
  }
  function clearCount(s){return relieveCount(s,MAX_COUNT);}
  function countProgress(s){return validCount(s)&&s.remaining?s.pressed/(s.pressed+s.remaining):0;}
  function bounds(rule,prefix,fallback,max){
    const ranged=own(rule,prefix+'Min')||own(rule,prefix+'Max');
    const parse=v=>typeof v==='number'||typeof v==='string'&&v.trim()!==''?Number(v):NaN;
    const min=parse(ranged?rule[prefix+'Min']:fallback),high=parse(ranged?rule[prefix+'Max']:fallback);
    return integer(min,1,max)&&integer(high,min,max)?{min,max:high}:null;
  }
  function normalizeCountRules(raw){
    if(!Array.isArray(raw)||raw.length>50)return null;
    try{return Array.from(raw,rule=>{
      if(!rule||typeof rule!=='object')throw Error('Invalid count rule');
      const limit={lock:MAX_COUNT,relief:MAX_COUNT,multiply:99,freeze:3600,clear:MAX_COUNT}[rule.kind];
      if(!limit)throw Error('Invalid kind');
      const values=bounds(rule,'value',rule.value??(rule.kind==='clear'?1:undefined),limit);if(!values)throw Error('Invalid count bounds');
      // Reuse established names, kinds, multiplier validation; count has no target pool.
      const canonical=gifts.normalizeInlineRules([{...rule,value:1,valueMin:1,valueMax:1,target:1,targetMin:1,targetMax:1,targetMode:'fixed',targetPool:undefined}]);
      if(!canonical)throw Error('Invalid count rule');
      return {...canonical[0],value:values.min,valueMin:values.min,valueMax:values.max};
    });}catch{return null;}
  }
  function migrateRulesToCount(raw,settings={}){
    const rules=gifts.normalizeInlineRules(raw,settings);if(!rules)return null;
    return normalizeCountRules(rules.map(rule=>rule.kind==='lock'?{...rule,value:rule.valueMin*rule.targetMin,valueMin:rule.valueMin*rule.targetMin,valueMax:rule.valueMax*rule.targetMax,targetMode:'fixed',targetPool:undefined}:rule));
  }
  const draw=(b,rng)=>{if(b.min===b.max)return b.min;const n=rng();return typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<1?Math.min(b.max,b.min+Math.floor(n*(b.max-b.min+1))):null;};
  function routeCountGift(raw,message,rng=Math.random){
    if(!message||!integer(Number(message.count),1,1000000)||!['number','string'].includes(typeof message.count))return null;
    const rules=normalizeCountRules(raw);if(!rules)return null;
    const name=String(message.giftName??'').trim(),fold=s=>s.normalize('NFKC').trim().toLocaleLowerCase();
    const rule=rules.find(r=>fold(r.name)===fold(name));if(!name||!rule)return null;
    let value,multiplier;try{value=draw({min:rule.valueMin,max:rule.valueMax},rng);multiplier=draw({min:rule.multiplierMin,max:rule.multiplierMax},rng);}catch{return null;}
    if(value===null||multiplier===null)return null;
    let total=BigInt(value)*BigInt(Number(message.count));if(rule.kind==='lock')total*=BigInt(multiplier);
    const capped=total>MAX_BIG,result={kind:rule.kind,value:Number(capped?MAX_BIG:total),name};
    if(rule.kind==='clear')return {kind:'clear',name};
    if(rule.kind==='multiply')result.multiplier=multiplier;
    if(rule.kind==='lock'||rule.kind==='relief')result.capped=capped;
    return result;
  }
  function profileSettings(settings,mode){return {...copy(settings),mode,sceneMode:mode==='cage'?'cage':'lock',challengeMode:mode==='count'?'count':'bar'};}
  function migrateConfig(settings={},rawRules=[]){
    try{
      // A V2.3 active-count mirror cannot recover the two absent layer profiles.
      // Leave those gift lists empty instead of inventing or truncating their gifts.
      const alreadyCount=settings.mode==='count',normal=alreadyCount?[]:gifts.normalizeInlineRules(rawRules,settings),count=alreadyCount?normalizeCountRules(rawRules):migrateRulesToCount(rawRules,settings);
      if(!count||!normal)return null;
      return {version:23,mode:modeFrom(settings),profiles:Object.fromEntries(modes.map(mode=>[mode,{settings:profileSettings(settings,mode),rules:copy(mode==='count'?count:normal)}]))};
    }catch{return null;}
  }
  function validateConfig(raw,validateSettings){
    if(!raw||raw.version!==23||!modes.includes(raw.mode)||!raw.profiles)return null;
    try{const profiles={};for(const mode of modes){
      const p=raw.profiles[mode];if(!p||!p.settings||typeof p.settings!=='object'||Array.isArray(p.settings))return null;
      const settings=validateSettings?validateSettings(copy(p.settings)):copy(p.settings);if(!settings)return null;
      const rules=mode==='count'?normalizeCountRules(p.rules):gifts.normalizeInlineRules(p.rules,settings);if(!rules)return null;
      profiles[mode]={settings:profileSettings(settings,mode),rules};
    }return {version:23,mode:raw.mode,profiles};}catch{return null;}
  }
  // FNV-1a supplies a stable first seed only for old waiting slots that were never drawn.
  function seedFor(value,index){const text=JSON.stringify(value)+':'+index;let hash=2166136261;for(let i=0;i<text.length;i++)hash=Math.imul(hash^text.charCodeAt(i),16777619)>>>0;return hash;}
  const step=n=>(Math.imul(n,1664525)+1013904223)>>>0;
  function legacyRemaining(state,waiting=[]){
    if(!Array.isArray(waiting)||waiting.length>500)return null;
    try{
      let restored=null;if(state){restored=model.restore(state,state.updatedAt);if(!restored)return null;}
      let total=0n,seededMissing=false,waitingLayers=0;
      const batches=restored?restored.queue.map((entry,index)=>({entry,credit:index===0?restored.progress+restored.relief:0})):[];
      for(let index=0;index<waiting.length;index++){
        const item=waiting[index];if(!item||!integer(item.layers,1)||!model.keyValid(item.key)||model.target(item.target)===null||!integer(item.multiplier??1,1,model.EFFECTIVE_TARGET_MAX))return null;
        // Match the old application's saved waiting capacity, before visiting any draws.
        waitingLayers+=item.layers;if(waitingLayers>10000000)return null;
        const entry={...copy(item),baseTarget:Number(item.target),multiplier:item.multiplier??1,drawn:false,targetAdjusted:false};
        if(entry.targetPool){entry.targetPool=model.cleanTargetPool(entry.targetPool);if(!entry.targetPool)return null;}
        if(entry.rngState!==undefined&&!integer(entry.rngState,0,4294967295))return null;
        if(entry.targetPool&&entry.rngState===undefined){entry.rngState=seedFor(item,index);seededMissing=true;}
        batches.push({entry,credit:0});
      }
      for(const {entry,credit} of batches){
        let count=entry.layers;
        const scaled=base=>Math.min(model.EFFECTIVE_TARGET_MAX,base*entry.multiplier);
        // The first drawn/adjusted layer is already resolved and may include relief.
        if(entry.drawn||entry.targetAdjusted||credit){total+=BigInt(Math.max(0,Math.ceil(entry.target-credit-1e-9)));count--;}
        if(!count)continue;
        if(!entry.targetPool){total+=BigInt(count)*BigInt(scaled(entry.baseTarget));continue;}
        const pool=entry.targetPool.filter(item=>item.enabled&&item.percent>0);
        const fixed=pool.every(item=>item.min===pool[0].min&&item.max===pool[0].min);
        if(fixed){total+=BigInt(count)*BigInt(scaled(pool[0].min));continue;}
        let seed=entry.rngState;const cumulative=[];let share=0;for(const item of pool){share+=Math.round(item.percent*100);cumulative.push(share/10000);}
        for(let i=0;i<count;i++){
          seed=step(seed);const a=seed/4294967296;seed=step(seed);const b=seed/4294967296;
          let selected=0;while(selected<pool.length-1&&a>=cumulative[selected])selected++;
          const item=pool[selected],base=item.min+Math.floor(b*(item.max-item.min+1));total+=BigInt(scaled(base));
          // Every remaining target is positive; the externally visible saturated result is now fixed.
          if(total>MAX_BIG)break;
        }
      }
      return {remaining:Number(total>MAX_BIG?MAX_BIG:total),capped:total>MAX_BIG,seededMissing};
    }catch{return null;}
  }
  return Object.freeze({MAX_COUNT,modeFrom,createCount,restoreCount,addCount,pressCount,relieveCount,multiplyCount,clearCount,countProgress,normalizeCountRules,migrateRulesToCount,routeCountGift,migrateConfig,validateConfig,legacyRemaining});
})();
if(typeof module==='object'&&module.exports)module.exports=LockModes;
