(function(root){
'use strict';
const plain=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
const copy=v=>typeof structuredClone==='function'?structuredClone(v):JSON.parse(JSON.stringify(v));
const integer=v=>Number.isSafeInteger(v)&&v>=1;
const session=v=>typeof v==='string'&&/^[\w-]{1,100}$/.test(v);
const coordinate=v=>Number.isFinite(v)&&v>=0&&v<=1;
const kind=v=>Number.isSafeInteger(v)&&v>=0&&v<=2099999;
function fresh(sessionId){if(!session(sessionId))throw Error('本场编号无效');return{schema:1,sessionId,nextOwner:1,nextResident:1,owners:[],residents:[],quarantine:null};}
function validateText(text,max){
 if(typeof text!=='string'||!integer(max))throw Error('名字无效');
 const s=text.trim();
 if(!s||/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/.test(s)||!/[\p{L}\p{N}\p{P}\p{S}]/u.test(s))throw Error('请输入可见名字，不含控制字符');
 const parts=typeof Intl!=='undefined'&&typeof Intl.Segmenter==='function'?[...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(s)]:Array.from(s);
 if(parts.length>max)throw Error('名字最多 '+max+' 个字符');
 return s;
}
const labelKey=text=>text.normalize('NFKC').trim().toLowerCase();
const validScale=v=>typeof v==='number'&&Number.isFinite(v)&&v>=25&&v<=1000&&Math.abs(v*100-Math.round(v*100))<1e-7;
function firstNameScale(scale){if(!validScale(scale))throw Error('单只大小须为25–1000%，最多两位小数');const v=Math.round(scale*150)/100;return{value:Math.min(1000,v),clamped:v>1000};}
function apply(naming,command){
 if(!plain(naming)||naming.schema!==1||!session(naming.sessionId)||!Array.isArray(naming.owners)||!Array.isArray(naming.residents)||!plain(command))throw Error('本场记录无效');
 const n=copy(naming),owner=n.owners.find(o=>o.id===command.ownerId),resident=n.residents.find(r=>r.id===command.residentId);
 const blocked=id=>n.quarantine?.blockAll||n.quarantine?.blockedOwnerIds?.includes(id);
 const label=()=>{const text=validateText(command.label,40);if(n.owners.some(o=>o.id!==command.ownerId&&labelKey(o.label)===labelKey(text)))throw Error('已有同名观众，请选择已有名额或使用不同备注');return text;};
 const scale=()=>{if(!validScale(command.individualScale))throw Error('单只大小须为25–1000%，最多两位小数');return command.individualScale;};
 switch(command.type){
 case 'directName':{
  // Keep schema-1 ownership anchors private so existing named pets still restore.
  if(blocked()||!integer(n.nextOwner))throw Error('本场取名记录待核对，请先结束本场');
  let label='pet-'+n.nextOwner;
  while(n.owners.some(o=>labelKey(o.label)===labelKey(label))){if(n.nextOwner>=Number.MAX_SAFE_INTEGER-1)throw Error('宠物记录编号已满');label='pet-'+(++n.nextOwner);}
  const granted=apply(n,{type:'grant',label});
  return apply(granted.next,{...command,type:'promote',ownerId:granted.next.owners.at(-1).id});
 }
 case 'grant':{
  if(blocked()||!integer(n.nextOwner)||n.nextOwner===Number.MAX_SAFE_INTEGER)throw Error('本场记录待核对，不能新增名额');
  const text=label(),id=n.sessionId+'-o-'+n.nextOwner++;n.owners.push({id,label:text});break;
 }
 case 'renameOwner':if(!owner)throw Error('观众名额不存在');owner.label=label();break;
 case 'revoke':if(!owner||blocked(owner.id)||n.residents.some(r=>r.ownerId===owner.id))throw Error('已使用或待核对名额不能撤销');n.owners=n.owners.filter(o=>o.id!==owner.id);break;
 case 'promote':{
  if(!owner||blocked(owner.id)||n.residents.some(r=>r.ownerId===owner.id))throw Error('该观众没有可用取名名额');
  if(!kind(command.kind)||!coordinate(command.x)||!coordinate(command.y)||!integer(n.nextResident)||n.nextResident===Number.MAX_SAFE_INTEGER)throw Error('所选宠物无效');
  const r={id:n.sessionId+'-r-'+n.nextResident++,ownerId:owner.id,name:validateText(command.name,30),kind:command.kind,individualScale:scale(),x:command.x,y:command.y};n.residents.push(r);return{next:n,resident:r};
 }
 case 'editResident':{
  if(!resident||Object.hasOwn(command,'ownerId')&&command.ownerId!==resident.ownerId)throw Error('不能更换专属宠物的主人');
  resident.name=validateText(command.name,30);resident.individualScale=scale();return{next:n,resident};
 }
 case 'deleteResident':{
  if(!resident)throw Error('专属宠物不存在，请刷新列表');
  n.residents=n.residents.filter(r=>r.id!==resident.id);break;
 }
 default:throw Error('不支持的名额操作');
 }
 return{next:n};
}
function isolate(n,original,ownerId,unknown=false){
 if(!n.quarantine)n.quarantine={original:copy(original),blockedOwnerIds:[],blockAll:false};
 if(typeof ownerId==='string'&&!n.quarantine.blockedOwnerIds.includes(ownerId))n.quarantine.blockedOwnerIds.push(ownerId);
 if(unknown)n.quarantine.blockAll=true;
}
function restore(raw,fallbackSession){
 const n=fresh(session(raw?.sessionId)?raw.sessionId:fallbackSession),issues=[];
 if(raw===undefined)return{value:n,issues};
 if(!plain(raw)||raw.schema!==1||!session(raw.sessionId)||!Array.isArray(raw.owners)||!Array.isArray(raw.residents)){isolate(n,raw,null,true);return{value:n,issues:['本场取名记录无法核对，已保留原数据；请结束本场后重新授权']};}
 if(raw.quarantine!=null){
  const q=raw.quarantine;
  if(plain(q)&&Object.hasOwn(q,'original')&&Array.isArray(q.blockedOwnerIds)&&q.blockedOwnerIds.every(x=>typeof x==='string'&&x.startsWith(n.sessionId+'-o-')&&integer(Number(x.slice((n.sessionId+'-o-').length))))&&typeof q.blockAll==='boolean')n.quarantine={original:copy(q.original),blockedOwnerIds:[...new Set(q.blockedOwnerIds)],blockAll:q.blockAll};
  else{isolate(n,raw,null,true);issues.push('隔离记录无效，已暂停新增名额');}
  const original=n.quarantine.original;
  // Rebuild occupied ownership from the preserved evidence, not just the saved mask.
  if(plain(original)&&original.schema===1&&original.sessionId===n.sessionId&&Array.isArray(original.owners)&&Array.isArray(original.residents)){
   const originalIds=new Set(original.owners.map(o=>o?.id));
   for(const r of original.residents)if(typeof r?.ownerId==='string'&&originalIds.has(r.ownerId)){if(!n.quarantine.blockedOwnerIds.includes(r.ownerId))n.quarantine.blockedOwnerIds.push(r.ownerId);}else n.quarantine.blockAll=true;
  }else n.quarantine.blockAll=true;
 }
 const ids=new Set(),labels=new Map();
 for(const o of raw.owners){
  try{
   if(!plain(o)||typeof o.id!=='string'||!o.id.startsWith(n.sessionId+'-o-')||!integer(Number(o.id.slice((n.sessionId+'-o-').length))))throw Error();
   const label=validateText(o.label,40),key=labelKey(label);
   if(ids.has(o.id)||labels.has(key)){isolate(n,raw,o.id);if(labels.has(key))isolate(n,raw,labels.get(key));throw Error();}
   ids.add(o.id);labels.set(key,o.id);n.owners.push({id:o.id,label});
  }catch{isolate(n,raw,o?.id,!o||typeof o.id!=='string');issues.push('部分观众名额待核对');}
 }
 const residents=new Set(),owners=new Set();
 for(const r of raw.residents){
  try{
   if(!plain(r)||typeof r.id!=='string'||!r.id.startsWith(n.sessionId+'-r-')||!integer(Number(r.id.slice((n.sessionId+'-r-').length)))||!ids.has(r.ownerId)||!kind(r.kind)||!coordinate(r.x)||!coordinate(r.y)||!validScale(r.individualScale)||residents.has(r.id)||owners.has(r.ownerId))throw Error();
   const name=validateText(r.name,30);residents.add(r.id);owners.add(r.ownerId);n.residents.push({id:r.id,ownerId:r.ownerId,name,kind:r.kind,individualScale:r.individualScale,x:r.x,y:r.y});
  }catch{isolate(n,raw,r?.ownerId,!ids.has(r?.ownerId));issues.push('部分专属宠物待核对，名额不会重新开放');}
 }
 const highest=(rows,prefix)=>rows.reduce((m,row)=>Math.max(m,Number(row.id.slice(prefix.length))+1),1);
 n.nextOwner=Math.max(integer(raw.nextOwner)?raw.nextOwner:1,highest(n.owners,n.sessionId+'-o-'));
 n.nextResident=Math.max(integer(raw.nextResident)?raw.nextResident:1,highest(n.residents,n.sessionId+'-r-'));
 return{value:n,issues:[...new Set(issues)]};
}
function validateKinds(naming,hasKind){
 const n=copy(naming),issues=[];
 n.residents=n.residents.filter(r=>{if(hasKind(r.kind))return true;isolate(n,naming,r.ownerId);issues.push('专属宠物素材缺失，原记录已保留，名额暂不可使用');return false;});
 return{value:n,issues:[...new Set(issues)]};
}
const api={fresh,validateText,labelKey,validScale,firstNameScale,apply,restore,validateKinds};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.PetNamedPets=api;
})(typeof window==='undefined'?globalThis:window);
