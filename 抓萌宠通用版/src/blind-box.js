(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.PetBlindBox=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const TOTAL=10000,MAX_COUNT=100000,controls=/[\u0000-\u001f\u007f-\u009f]/;
 const amount=n=>Number.isInteger(n)&&n>=1&&n<=MAX_COUNT;
 function giftName(value){if(typeof value!=='string'||controls.test(value))throw Error('礼物名称格式无效');const name=value.normalize('NFKC').trim();if(Array.from(name).length>100)throw Error('礼物名称最多100个字符');return name;}
 function cleanRow(row,keepChance=true){
  if(!row||typeof row!=='object'||Array.isArray(row))throw Error('盲盒档位格式无效');
  if(typeof row.id!=='string'||! /^[\w-]{1,60}$/.test(row.id))throw Error('档位标识无效');
  if(typeof row.name!=='string')throw Error('请填写档位名称');
  const name=row.name.trim();
  if(!name||Array.from(name).length>40||controls.test(row.name))throw Error('档位名称须为1–40个字符，不含换行或控制字符');
  if(typeof row.enabled!=='boolean')throw Error('档位启用状态无效');
  const mode=row.mode===undefined?'fixed':row.mode;if(!['fixed','random'].includes(mode))throw Error('数量模式无效');
  const min=mode==='fixed'?row.count:row.min,max=mode==='fixed'?row.count:row.max;
  if(!amount(min)||!amount(max)||min>max)throw Error('每盒数量须为1–100000的整数，随机上限不得小于下限');
  const safe={id:row.id,name,gift:giftName(row.gift===undefined?'':row.gift),mode,count:min,min,max,enabled:row.enabled};
  if(keepChance&&row.chance!==undefined){if(!Number.isInteger(row.chance)||row.chance<0||row.chance>TOTAL)throw Error('旧概率格式无效');safe.chance=row.chance;}
  return safe;
 }
 function validateTiers(rows){
  if(!Array.isArray(rows))throw Error('盲盒档位格式无效');
  const ids=new Set(),gifts=new Set();
  return Array.from(rows,row=>{
   const safe=cleanRow(row);if(ids.has(safe.id))throw Error('档位标识重复');ids.add(safe.id);
   if(safe.enabled&&safe.gift){if(gifts.has(safe.gift))throw Error('同一礼物只能绑定一个启用档位');gifts.add(safe.gift);}
   return safe;
  });
 }
 function snapshot(row){return cleanRow(row,false);}
 function unit(rng){return Math.max(0,Math.min(1-Number.EPSILON,Number(rng())||0));}
 function roll(row,rng=Math.random){const safe=snapshot(row);return safe.mode==='fixed'?safe.count:safe.min+Math.floor(unit(rng)*(safe.max-safe.min+1));}
 function tierForGift(rows,name){let key;try{key=giftName(name);}catch{return null;}if(!key)return null;return validateTiers(rows).find(row=>row.enabled&&row.gift===key)||null;}
 function migrate(legacyTiers){
  if(!Array.isArray(legacyTiers))throw Error('旧数量档位无法转换为盲盒');
  return validateTiers(Array.from(legacyTiers,row=>{
   if(!row||typeof row!=='object')throw Error('旧数量档位格式无效');
   return {id:row.id,name:typeof row.name==='string'?row.name:row.count+' 只',gift:'',mode:'fixed',count:row.count,min:row.count,max:row.count,enabled:row.enabled!==false};
  }));
 }
 // Kept only for interim probability records; canonical gift tiers do not use a total.
 function normalizeProbabilities(rows){
  const output=validateTiers(rows),enabled=output.flatMap((row,index)=>row.enabled?[{row,index}]:[]);
  if(!enabled.length)throw Error('没有启用项可调整');
  const originalTotal=enabled.reduce((sum,item)=>sum+(item.row.chance||0),0),total=originalTotal||enabled.length;let used=0;
  for(const item of enabled){const numerator=(originalTotal?item.row.chance||0:1)*TOTAL;item.remainder=numerator%total;item.row.chance=Math.floor(numerator/total);used+=item.row.chance;}
  enabled.sort((a,b)=>b.remainder-a.remainder||a.index-b.index);
  for(let i=0;i<TOTAL-used;i++)enabled[i].row.chance++;
  return output;
 }
 function choose(rows,capacity,forcedId,rng=Math.random){
  const safe=validateTiers(rows);if(!Number.isSafeInteger(capacity)||capacity<0)return null;
  const available=safe.filter(row=>row.enabled&&row.max<=capacity);
  if(forcedId!==undefined&&forcedId!==null)return typeof forcedId==='string'?available.find(row=>row.id===forcedId)||null:null;
  const eligible=available.filter(row=>row.chance===undefined||row.chance>0);if(!eligible.length)return null;
  const total=eligible.reduce((sum,row)=>sum+(row.chance===undefined?1:row.chance),0),target=unit(rng)*total;let accumulated=0;
  for(const row of eligible){accumulated+=row.chance===undefined?1:row.chance;if(target<accumulated)return row;}
  return eligible.at(-1);
 }
 return {migrate,validateTiers,normalizeProbabilities,choose,tierForGift,snapshot,roll};
});
