export const INTERACTIONS = [
 {id:'shake',label:'摇桌子',gift:'摇摇乐',unit:'次',amounts:[1,1,2],max:10,description:'按本级别力度震动。礼物数量增加次数，不自动提高力度。'},
 {id:'swap',label:'随机换豆',gift:'换色豆',unit:'颗',amounts:[1,5,15],max:2304,description:'随机替换不同的已拼豆，同一份效果不重复选同一颗。'},
 {id:'help',label:'帮助拼豆',gift:'助力拼豆',unit:'颗',amounts:[2,8,25],max:2304,description:'从缺失或错色位置补入正确颜色。'},
 {id:'remove',label:'减豆子',gift:'拆豆豆',unit:'颗',amounts:[1,5,15],max:2304,description:'从已拼豆中随机移走指定数量。'},
 {id:'hide',label:'隐藏提示',gift:'遮图纸',unit:'秒',amounts:[10,30,60],max:3600,description:'暂时隐藏板面提示与色号，已拼豆仍然可见。多次赠送时间累加。'},
 {id:'spill',label:'打翻装豆托盘',gift:'掀翻托盘',unit:'次',amounts:[1,1,1],max:10,description:'只打翻库存豆；复原难度每级别独立。散落中再次触发会合并，不重置已完成进度。'},
 {id:'confiscate',label:'没收工具',gift:'没收镊子',unit:'秒',amounts:[10,30,60],max:3600,description:'没收主播的默认工具（设置里选的镊子或拼豆笔），期间不能取豆、放豆或拾豆；观众送的升级拼豆笔仍可使用。多次赠送时间累加。'},
 {id:'pen',label:'升级拼豆笔',gift:'拼豆笔',unit:'秒',amounts:[15,30,60],max:3600,description:'限时升级：一次取多颗同色豆，并可按住在板上划动连续放豆（放错、划出图案或豆用完即停）。容量低于默认拼豆笔时按默认容量。多次赠送时间累加，容量取较大一级别。'},
 {id:'extra',label:'再拼一个',gift:'再拼一个',unit:'遍',amounts:[1,2,3],max:20,description:'增加当前图案的必拼遍数。终局后触发会开始新的空板。'},
];

// Retained as migration metadata. New rules may have any number of named levels.
export const TIERS=[{id:'light',name:'轻档'},{id:'medium',name:'中档'},{id:'heavy',name:'重档'}];
export const MAX_INTERACTION_LEVELS=20;
const numericDefaults={strength:55,duration:2,presses:8,decay:10,capacity:10};
const legacyNumbers=[
 {strength:25,duration:1,presses:4,decay:7,capacity:6},
 numericDefaults,
 {strength:90,duration:3,presses:12,decay:15,capacity:15}
];
const integer=(n,min,max)=>Number.isSafeInteger(n)&&n>=min&&n<=max;
const effectFor=id=>INTERACTIONS.find(effect=>effect.id===id);
const knownId=id=>typeof id==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(id);

function exampleLevel(effect){
 return {id:'medium',name:'互动级别 1',enabled:true,giftName:effect.gift,amount:effect.amounts[1],...numericDefaults};
}

export function createInteractionLevel(effectId,existingLevels=[]){
 const effect=effectFor(effectId);
 if(!effect)throw new Error('未知的互动效果');
 if(!Array.isArray(existingLevels))throw new Error('互动级别列表无效');
 if(existingLevels.length>=MAX_INTERACTION_LEVELS)throw new Error(`每种互动最多 ${MAX_INTERACTION_LEVELS} 个级别`);
 const used=new Set(existingLevels.map(level=>level?.id));
 let number=1;
 while(used.has(`custom-${number}`))number++;
 return {id:`custom-${number}`,name:`互动级别 ${existingLevels.length+1}`,enabled:false,giftName:'',amount:effect.amounts[1],...numericDefaults};
}

function isLegacyLevelSet(levels){
 return Array.isArray(levels)&&levels.length===3&&levels.every(level=>level&&typeof level==='object'&&!Object.hasOwn(level,'name'))&&
  TIERS.every(tier=>levels.some(level=>level.id===tier.id));
}

// A missing levels array alone is not proof of an old file: new damaged files
// must not be mistaken for an old single-rule format.
export function isLegacyInteractionRules(saved){
 if(!Array.isArray(saved)||!saved.length||saved.length>INTERACTIONS.length)return false;
 const ids=new Set();
 for(const rule of saved){
  if(!rule||typeof rule!=='object'||!effectFor(rule.id)||ids.has(rule.id))return false;
  ids.add(rule.id);
  if(isLegacyLevelSet(rule.levels))continue;
  if(Object.hasOwn(rule,'levels')||!Object.hasOwn(rule,'giftName')||!Object.hasOwn(rule,'amount'))return false;
 }
 return true;
}

function legacyLevel(effect,old,index){
 const tier=TIERS[index],defaults=legacyNumbers[index];
 const giftName=typeof old?.giftName==='string'?old.giftName:effect.gift+(index===1?'':index===0?'（轻）':'（重）');
 return {
  id:tier.id,name:tier.name,enabled:old?.enabled!==false&&!!giftName.trim(),giftName,
  amount:integer(old?.amount,1,effect.max)?old.amount:effect.amounts[index],
  strength:integer(old?.strength,1,100)?old.strength:defaults.strength,
  duration:integer(old?.duration,1,15)?old.duration:defaults.duration,
  presses:integer(old?.presses,2,50)?old.presses:defaults.presses,
  decay:integer(old?.decay,0,50)?old.decay:defaults.decay,
  capacity:integer(old?.capacity,2,20)?old.capacity:defaults.capacity
 };
}

export function validateLegacyRuleSet(saved){
 if(!isLegacyInteractionRules(saved))return ['旧互动规则结构无效'];
 const issues=[];
 for(const rule of saved){
  const effect=effectFor(rule.id),levels=Array.isArray(rule.levels)?rule.levels:[rule];
  for(const level of levels){
   if(level.enabled!==undefined&&typeof level.enabled!=='boolean')issues.push(`${effect.label}启用状态无效`);
   if(level.giftName!==undefined&&(typeof level.giftName!=='string'||level.giftName.length>100))issues.push(`${effect.label}礼物名称无效`);
   if(!integer(level.amount,1,effect.max))issues.push(`${effect.label}用量无效`);
   for(const[key,min,max]of [['strength',1,100],['duration',1,15],['presses',2,50],['decay',0,50],['capacity',2,20]])
    if(level[key]!==undefined&&!integer(level[key],min,max))issues.push(`${effect.label}${key}无效`);
  }
 }
 return issues;
}

export function createInteractionRules(saved){
 if(saved===undefined)return INTERACTIONS.map(effect=>({id:effect.id,levels:[exampleLevel(effect)]}));
 if(!Array.isArray(saved))throw new Error('互动设置损坏：规则列表无效');
 if(!saved.length)throw new Error('互动设置损坏：规则列表为空');
 if(isLegacyInteractionRules(saved)){
  const rules=INTERACTIONS.map(effect=>{
   const old=saved.find(rule=>rule.id===effect.id);
   const levels=TIERS.map((tier,index)=>legacyLevel(effect,old?.levels?.find(level=>level.id===tier.id)||(index===1&&!old?.levels?old:null),index));
   return {id:effect.id,levels};
  });
  const issues=validateRuleSet(rules);
  if(issues.length)throw new Error(`互动设置损坏：${issues[0]}`);
  return rules;
 }
 const rules=structuredClone(saved);
 const issues=validateRuleSet(rules);
 if(issues.length)throw new Error(`互动设置损坏：${issues[0]}`);
 return rules;
}

export function validateRuleSet(rules){
 const issues=[],giftNames=new Set(),effectIds=new Set();
 if(!Array.isArray(rules)||rules.length!==INTERACTIONS.length)return ['互动效果列表不完整'];
 for(const rule of rules){
  const effect=effectFor(rule?.id);
  if(!effect||effectIds.has(rule.id)){issues.push('互动效果重复或未知');continue;}
  effectIds.add(rule.id);
  if(!Array.isArray(rule.levels)||rule.levels.length>MAX_INTERACTION_LEVELS){issues.push(`${effect.label}级别数量须为 0–${MAX_INTERACTION_LEVELS}`);continue;}
  const levelIds=new Set();
  for(const level of rule.levels){
   if(!level||typeof level!=='object'){issues.push(`${effect.label}级别损坏`);continue;}
   if(!knownId(level.id)||levelIds.has(level.id))issues.push(`${effect.label}级别 ID 无效或重复`);
   levelIds.add(level.id);
   if(typeof level.name!=='string'||!level.name.trim()||level.name.length>60)issues.push(`${effect.label}级别名称须为 1–60 字`);
   if(typeof level.enabled!=='boolean')issues.push(`${effect.label}启用状态无效`);
   if(typeof level.giftName!=='string'||level.giftName.length>100||level.enabled&&!level.giftName.trim())issues.push(`${effect.label}启用级别须填写礼物名称`);
   if(!integer(level.amount,1,effect.max))issues.push(`${effect.label}用量须为 1–${effect.max}`);
   for(const[key,min,max]of [['strength',1,100],['duration',1,15],['presses',2,50],['decay',0,50],['capacity',2,20]])
    if(!integer(level[key],min,max))issues.push(`${effect.label}${key}须为 ${min}–${max}`);
   if(level.enabled&&typeof level.giftName==='string'&&level.giftName.trim()){
    const name=level.giftName.trim();
    if(giftNames.has(name))issues.push(`礼物名称重复：${name}`);
    giftNames.add(name);
   }
  }
 }
 if(effectIds.size!==INTERACTIONS.length)issues.push('互动效果列表不完整');
 return issues;
}

export function resolveGiftRule(rules,gift){
 if(!gift||typeof gift.name!=='string'||!integer(gift.count,1,10000)||validateRuleSet(rules).length)return null;
 for(const effect of INTERACTIONS){
  const rule=rules.find(item=>item.id===effect.id);
  for(const level of rule?.levels||[]){
   if(!level.enabled||level.giftName.trim()!==gift.name)continue;
   return {...level,id:effect.id,tier:level.id,count:Math.min(effect.max,level.amount*gift.count)};
  }
 }
 return null;
}
