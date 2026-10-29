const LockGiftRules=(()=>{
  const model=typeof TypingLockModel==='object'?TypingLockModel:typeof module==='object'&&module.exports?require('./core.js'):null;
  const cleanTargetPool=raw=>model?.cleanTargetPool(raw)??null;
  const normalizeTargetPool=raw=>model?.normalizeTargetPool(raw)??null;
  const drawTarget=(raw,rng)=>model?.drawTarget(raw,rng)??null;
  const targetOk=value=>Number.isSafeInteger(value)&&value>=1&&value<=99999;
  const normalized=value=>String(value??'').normalize('NFKC').trim().toLocaleLowerCase();
  const positive=(value,max)=>Number.isSafeInteger(Number(value))&&String(value).trim()!==''&&Number(value)>=1&&Number(value)<=max;
  const own=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);
  const valueLimits=Object.freeze({lock:20000,relief:10000000,clear:10000000,freeze:3600,multiply:99});
  function integer(value,max){if(!['number','string'].includes(typeof value)||String(value).trim()==='')return null;const number=Number(value);return Number.isSafeInteger(number)&&number>=1&&number<=max?number:null;}
  function hasRange(rule,prefix){return own(rule,prefix+'Min')||own(rule,prefix+'Max');}
  function range(rule,prefix,fallback,max){
    const ranged=hasRange(rule,prefix),min=integer(ranged?rule[prefix+'Min']:fallback,max),maxValue=integer(ranged?rule[prefix+'Max']:fallback,max);
    return min===null||maxValue===null||min>maxValue?null:{min,max:maxValue};
  }
  function drawRange(bounds,rng){if(bounds.min===bounds.max)return bounds.min;const sample=typeof rng==='function'?rng():NaN;return typeof sample==='number'&&Number.isFinite(sample)&&sample>=0&&sample<1?bounds.min+Math.floor(sample*(bounds.max-bounds.min+1)):null;}
  function legacyTarget(rule,settings){
    if(rule.target!==undefined)return rule.target;
    const tier=Array.isArray(settings?.tiers)?settings.tiers.find(item=>item?.id===rule.tier):null;
    if(tier)return tier.target;
    if(settings?.targets&&own(settings.targets,rule.tier))return settings.targets[rule.tier];
    const defaults={normal:60,rare:120,legendary:240};return own(defaults,rule.tier)?defaults[rule.tier]:60;
  }
  function normalizeInlineRules(raw,settings={}){
    if(!Array.isArray(raw)||raw.length>50)return null;
    try{return Array.from(raw,rule=>{
      if(!rule||typeof rule.name!=='string'||!rule.name.trim()||rule.name.trim().length>80||/[\u0000-\u001f\u007f]/.test(rule.name)||!own(valueLimits,rule.kind)||rule.targetMode!==undefined&&!['fixed','blindbox'].includes(rule.targetMode))throw Error('Invalid rule');
      let factor=rule.multiplier??1;
      if(rule.multiplierId!==undefined&&rule.multiplierId!==null){
        if(typeof rule.multiplierId!=='string'||!/^[A-Za-z0-9_-]{1,40}$/.test(rule.multiplierId))throw Error('Invalid multiplier reference');
        const matches=Array.isArray(settings?.multipliers)?settings.multipliers.filter(item=>item?.id===rule.multiplierId):[];
        if(matches.length!==1||integer(matches[0].factor,1000)===null)throw Error('Missing multiplier reference');
        factor=matches[0].factor;
      }
      const values=range(rule,'value',rule.value===undefined&&rule.kind==='clear'?1:rule.value,valueLimits[rule.kind]);
      let targets=range(rule,'target',legacyTarget(rule,settings),99999);
      const multipliers=range(rule,'multiplier',factor,1000);
      if(!values||!targets||!multipliers)throw Error('Invalid range');
      let pool=null;
      if(rule.targetMode==='blindbox'){
        pool=cleanTargetPool(rule.targetPool??settings?.targetPool);if(!pool)throw Error('Invalid legacy target pool');
        const enabled=pool.filter(item=>item.enabled&&item.percent>0);
        targets={min:Math.min(...enabled.map(item=>item.min)),max:Math.max(...enabled.map(item=>item.max))};
      }
      return {name:rule.name.trim(),kind:rule.kind,value:values.min,valueMin:values.min,valueMax:values.max,target:targets.min,targetMin:targets.min,targetMax:targets.max,multiplier:multipliers.min,multiplierMin:multipliers.min,multiplierMax:multipliers.max,...(pool?{targetMode:'blindbox',targetPool:pool}:{})};
    });}catch{return null;}
  }
  function routeGift(rules,message,rng=Math.random){
    if(!Array.isArray(rules)||rules.length>50||!message||!positive(message.count,1000000))return null;
    const name=String(message.giftName??'').trim(),rule=rules.find(item=>normalized(item?.name)===normalized(name));
    if(!name||!rule||!own(valueLimits,rule.kind))return null;
    const values=range(rule,'value',rule.value,valueLimits[rule.kind]),targets=range(rule,'target',rule.kind==='lock'?rule.target:60,99999),multipliers=range(rule,'multiplier',rule.multiplier??1,1000);
    if(!values||!targets||!multipliers||rule.targetMode!==undefined&&!['fixed','blindbox'].includes(rule.targetMode))return null;
    if(!hasRange(rule,'target')&&rule.kind==='lock'&&!targetOk(rule.target)||!hasRange(rule,'multiplier')&&!Number.isSafeInteger(rule.multiplier??1))return null;
    let pool=null;
    if(rule.kind==='lock'&&rule.targetMode==='blindbox'){
      pool=cleanTargetPool(rule.targetPool);if(!pool)return null;pool=pool.filter(item=>item.enabled);
    }else if(rule.kind==='lock'&&targets.min!==targets.max){
      pool=[{id:'inline_range',name:String(rule.name).trim().slice(0,40)||'随机次数',min:targets.min,max:targets.max,percent:100,enabled:true,look:'normal'}];
    }
    // Validate every bound and legacy pool before consuming any randomness.
    let perShare,multiplier;try{perShare=drawRange(values,rng);multiplier=drawRange(multipliers,rng);}catch{return null;}
    if(perShare===null||multiplier===null)return null;
    const value=perShare*Number(message.count);
    if(!Number.isSafeInteger(value)||value>(rule.kind==='multiply'?99000000:10000000))return null;
    if(rule.kind==='lock'){
      return {kind:'lock',target:targets.min,value,name,...(pool?{targetMode:'blindbox',targetPool:pool}:{}),...(multiplier!==1?{multiplier}:{})}; // 超过 2 万层的部分由插件排队，不在这里丢弃
    }
    if(rule.kind==='multiply')return {kind:'multiply',value,multiplier,name};
    if(rule.kind==='relief')return {kind:'relief',value,name};
    if(rule.kind==='clear')return {kind:'clear',name}; // 送一份即清空全部锁链，数量不影响效果
    if(rule.kind==='freeze')return {kind:'freeze',value,name}; // 禁用破锁键的秒数，礼物数量相乘，插件里总时长封顶
    return null;
  }
  function createDeduper(ttl=10000){
    const seen=new Map();
    return (id,now=Date.now())=>{
      if(id===null||id===undefined||id==='')return false;
      if(seen.size>300)for(const [key,time] of seen)if(now-time>ttl)seen.delete(key);
      const key=String(id),previous=seen.get(key);
      seen.set(key,now);
      return previous!==undefined&&now-previous<=ttl;
    };
  }
  return Object.freeze({routeGift,createDeduper,cleanTargetPool,normalizeTargetPool,drawTarget,normalizeInlineRules});
})();
if(typeof module==='object'&&module.exports)module.exports=LockGiftRules;
