/* ReviewEngine v1 — dependency-free UMD / CommonJS immutable queue.
 * createState(): {version:1,current:null,waiting:[],history:[],serial:0,
 *   revision:0,profiles:[],pending:[],undo:null}. Optional paused:true is
 * persisted after finish({advance:false}); start clears it.
 * Person: {key,uid,name,avatar,note}. key is required, stable and supplied by
 * the caller; missing platform IDs require unique anonymous caller keys.
 * Entry adds {id,ticket,round,priority,source,joinedAt}; history adds
 * {status:'completed'|'removed',endedAt}. Profiles are separate bookmarks.
 * apply(state,action) validates and returns a fresh state (including no-ops),
 * or throws a Chinese error. join/repeat/priority: person, opportunities=1
 * (repeat only, 1..20), source='', now=Date.now(). First arrival starts unless
 * paused. Ordinary duplicates are no-ops. Priority promotes earliest waiting
 * opportunity into a FIFO priority block without preempting current. repeat
 * always adds ordinary opportunities at the entire waiting queue's end.
 * finish: advance boolean (default true), now; start; remove: id, now
 * (removing current pauses until start, avoiding accidental queue jumping);
 * move: id,direction (-1|1), within same priority class; edit: id,name?,note?;
 * profile: person (upsert); forgetProfile:key; pendingAdd:gift,reason;
 * pendingRemove:id; undo. Stored bookmark fields override future gift fields.
 * Undo compensates latest finish, retains later arrivals/profiles/pending,
 * and rejects after conflicting queue edits/start. Completion replaces the
 * prior undo with a new one. Undo is a single level, not a state snapshot.
 * validate(raw) strips unknown fields; rejects invalid records/unsafe avatar
 * URLs/nonfinite numbers/duplicate IDs; returns deep-owned bounded data.
 * Limits: active 500, history 2000, profiles 500, pending 200; no silent loss.
 */
(function(root,factory){
 'use strict';
 if(typeof module==='object'&&module.exports) module.exports=factory();
 else root.ReviewEngine=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const LIMIT={active:500,history:2000,profiles:500,pending:200};
 const fail=m=>{throw new Error(m);};
 const object=(v,label)=>{if(!v||typeof v!=='object'||Array.isArray(v))fail(label+'格式无效');return v;};
 function str(v,label,max,required=false){if(v===undefined&&!required)return '';if(typeof v!=='string'||v.length>max||(required&&!v.trim()))fail(label+'格式或长度无效');return v;}
 function integer(v,label,min=0,max=Number.MAX_SAFE_INTEGER-1){if(!Number.isSafeInteger(v)||v<min||v>max)fail(label+'必须是有效整数');return v;}
 function bool(v,label){if(typeof v!=='boolean')fail(label+'必须是布尔值');return v;}
 function stamp(v){if(typeof v!=='number'||!Number.isFinite(v)||v<0||v>8640000000000000)fail('时间无效');return v;}
 function avatar(v){v=str(v,'头像',2800000);if(v&&!/^(https?:\/\/[^\s]+|data:image\/(?:png|jpeg|webp|gif);base64,[a-zA-Z0-9+/=\r\n]+)$/i.test(v))fail('头像地址无效，仅允许 HTTP(S) 或内嵌图片');return v;}
 function person(v){object(v,'用户');return {key:str(v.key,'用户标识',200,true),uid:str(v.uid,'用户 ID',200),name:str(v.name,'昵称',200),avatar:avatar(v.avatar),note:str(v.note,'备注',2000)};}
 function entry(v,historical){object(v,'排队记录');const p=person(v);p.id=str(v.id,'记录 ID',200,true);p.ticket=integer(v.ticket,'排队编号',1);p.round=integer(v.round,'机会次数',1);p.priority=bool(v.priority,'优先状态');p.source=str(v.source,'来源',200);p.joinedAt=stamp(v.joinedAt);if(historical){if(v.status!=='completed'&&v.status!=='removed')fail('历史状态无效');p.status=v.status;p.endedAt=stamp(v.endedAt);}return p;}
 function list(v,label,max,map){if(!Array.isArray(v)||v.length>max)fail(label+'格式无效或超过 '+max+' 条上限');return v.map(map);}
 function jsonValue(v,depth=0,budget={n:0}){
  if(++budget.n>2000||depth>8)fail('待处理礼物内容过大或层级过深');
  if(v===null||typeof v==='boolean')return v;
  if(typeof v==='string')return str(v,'礼物字段',10000);
  if(typeof v==='number'){if(!Number.isFinite(v))fail('礼物数值无效');return v;}
  if(Array.isArray(v))return v.map(x=>jsonValue(x,depth+1,budget));
  object(v,'礼物');const out={};for(const k of Object.keys(v)){if(['__proto__','constructor','prototype'].includes(k))fail('礼物字段无效');if(k.length>200)fail('礼物字段过长');out[k]=jsonValue(v[k],depth+1,budget);}return out;
 }
 function pending(v){object(v,'待处理记录');const gift=jsonValue(v.gift);if(JSON.stringify(gift).length>64000)fail('待处理礼物过大');return {id:str(v.id,'待处理 ID',200,true),gift,reason:str(v.reason,'待处理原因',1000,true)};}
 function createState(){return {version:1,current:null,waiting:[],history:[],serial:0,revision:0,profiles:[],pending:[],undo:null};}
 function validate(raw){
  object(raw,'存档');if(raw.version!==1)fail('不支持此存档版本');
  const s=createState();s.serial=integer(raw.serial,'序号');s.revision=integer(raw.revision,'修订号');
  s.current=raw.current===null?null:entry(raw.current,false);
  s.waiting=list(raw.waiting,'等待队列',LIMIT.active,x=>entry(x,false));
  if(s.waiting.length+(s.current?1:0)>LIMIT.active)fail('活动队列超过 500 条上限');
  s.history=list(raw.history,'历史',LIMIT.history,x=>entry(x,true));
  s.profiles=list(raw.profiles,'资料',LIMIT.profiles,person);s.pending=list(raw.pending,'待处理',LIMIT.pending,pending);
  if(raw.paused!==undefined)s.paused=bool(raw.paused,'暂停状态');
  if(s.paused&&s.current)fail('暂停状态与正在评价记录冲突');
  const ids=new Set(),tickets=new Set();for(const p of [s.current,...s.waiting,...s.history].filter(Boolean)){if(ids.has(p.id)||tickets.has(p.ticket))fail('存在重复排队记录');if(p.ticket>s.serial)fail('排队序号超出存档序号');ids.add(p.id);tickets.add(p.ticket);}
  let ordinary=false;for(const p of s.waiting){if(!p.priority)ordinary=true;else if(ordinary)fail('优先队列顺序无效');}
  for(const [items,field,label] of [[s.profiles,'key','收藏资料'],[s.pending,'id','待处理记录']]){const seen=new Set();for(const p of items){if(seen.has(p[field]))fail(label+'重复');seen.add(p[field]);}}
  if(raw.undo!==null){const u=object(raw.undo,'撤销记录');s.undo={entry:entry(u.entry,false),nextId:u.nextId===null?null:str(u.nextId,'撤销下一位 ID',200,true),previousPaused:bool(u.previousPaused,'撤销暂停状态'),historyId:str(u.historyId,'撤销历史 ID',200,true),valid:bool(u.valid,'撤销状态')};
   if(s.undo.valid){const h=s.history.find(p=>p.id===s.undo.historyId);if(!h||h.status!=='completed'||h.id!==s.undo.entry.id||JSON.stringify(entry(h,false))!==JSON.stringify(s.undo.entry)||(s.current?.id||null)!==s.undo.nextId)fail('撤销记录与队列不一致');}
  }
  return s;
 }
 function apply(raw,action){
  const s=validate(raw);object(action,'操作');const type=action.type;
  const now=()=>stamp(action.now===undefined?Date.now():action.now);
  const active=()=>[s.current,...s.waiting].filter(Boolean);
  const invalidate=()=>{if(s.undo)s.undo.valid=false;};
  const changed=()=>{s.revision=integer(s.revision+1,'修订号');return s;};
  const capacity=n=>{if(active().length+n>LIMIT.active)fail('活动队列最多 500 条，请先处理现有记录');};
  const priorityEnd=()=>{const i=s.waiting.findIndex(p=>!p.priority);return i<0?s.waiting.length:i;};
  const add=(p,priority,time)=>{
   s.serial=integer(s.serial+1,'序号',1);const records=[...active(),...s.history];
   const round=integer(1+Math.max(0,...records.filter(x=>x.key===p.key).map(x=>x.round)),'机会次数',1);
   let id='q-'+s.serial;const ids=new Set(records.map(x=>x.id));let suffix=0;while(ids.has(id))id='q-'+s.serial+'-'+(++suffix);
   const e={...p,id,ticket:s.serial,round,priority,source:str(action.source,'来源',200),joinedAt:time};
   if(!s.current&&!s.paused){s.current=e;if(s.undo&&s.undo.valid)s.undo.nextId=e.id;}
   else if(priority)s.waiting.splice(priorityEnd(),0,e);else s.waiting.push(e);
  };
  const historyAdd=(p,status,time)=>{if(s.history.length>=LIMIT.history)fail('历史最多 2000 条，请先导出并整理记录');s.history.push({...p,status,endedAt:time});};
  if(type==='join'||type==='repeat'||type==='priority'){
   let p=person(action.person);const saved=s.profiles.find(x=>x.key===p.key);if(saved)p={...saved};
   const time=now();const opportunities=integer(action.opportunities===undefined?1:action.opportunities,'机会数',1,20);
   if(type!=='repeat'&&opportunities!==1)fail('普通排队和插队每次只处理一次机会');
   str(action.source,'来源',200);
   if(type==='join'&&active().some(x=>x.key===p.key))return s;
   if(type==='priority'){const i=s.waiting.findIndex(x=>x.key===p.key);if(i>=0){if(s.waiting[i].priority)return s;invalidate();const e=s.waiting.splice(i,1)[0];e.priority=true;s.waiting.splice(priorityEnd(),0,e);return changed();}}
   const count=type==='repeat'?opportunities:1;capacity(count);for(let i=0;i<count;i++)add(p,type==='priority',time);return changed();
  }
  if(type==='finish'){
   if(!s.current)fail('当前没有正在评价的观众');const advance=action.advance===undefined?true:bool(action.advance,'自动下一位');
   const e=s.current;const previousPaused=!!s.paused;historyAdd(e,'completed',now());s.current=advance?(s.waiting.shift()||null):null;s.paused=!advance;
   s.undo={entry:e,nextId:s.current?.id||null,previousPaused,historyId:e.id,valid:true};return changed();
  }
  if(type==='start'){if(s.current)return s;if(!s.waiting.length)fail('等待队列为空');invalidate();s.current=s.waiting.shift();s.paused=false;return changed();}
  if(type==='undo'){
   const u=s.undo;if(!u||!u.valid)fail('无法撤销：没有可撤销完成，或队列已发生冲突修改');
   if((s.current?.id||null)!==u.nextId)fail('无法撤销：当前观众已变化');capacity(1);
   const i=s.history.findIndex(x=>x.id===u.historyId&&x.status==='completed');if(i<0)fail('无法撤销：完成记录已变化');
   if(s.current){const e=s.current;if(e.priority)s.waiting.unshift(e);else s.waiting.splice(priorityEnd(),0,e);}
   s.current=u.entry;s.history.splice(i,1);s.paused=u.previousPaused;s.undo=null;return changed();
  }
  if(type==='remove'||type==='move'||type==='edit'){
   const id=str(action.id,'记录 ID',200,true);const i=s.waiting.findIndex(x=>x.id===id);const isCurrent=s.current?.id===id;const e=isCurrent?s.current:s.waiting[i];if(!e)fail('找不到这条排队记录');
   if(type==='remove'){historyAdd(e,'removed',now());if(isCurrent){s.current=null;s.paused=true;}else s.waiting.splice(i,1);invalidate();return changed();}
   if(type==='move'){if(isCurrent)fail('正在评价的观众不能移动');if(action.direction!==-1&&action.direction!==1)fail('移动方向无效');const j=i+action.direction;if(j<0||j>=s.waiting.length)return s;if(e.priority!==s.waiting[j].priority)fail('不能跨越优先区移动');[s.waiting[i],s.waiting[j]]=[s.waiting[j],s.waiting[i]];invalidate();return changed();}
   if(action.name!==undefined)e.name=str(action.name,'昵称',200);if(action.note!==undefined)e.note=str(action.note,'备注',2000);invalidate();return changed();
  }
  if(type==='profile'){const p=person(action.person);const i=s.profiles.findIndex(x=>x.key===p.key);if(i<0){if(s.profiles.length>=LIMIT.profiles)fail('收藏资料最多 500 条');s.profiles.push(p);}else s.profiles[i]=p;return changed();}
  if(type==='forgetProfile'){const key=str(action.key,'用户标识',200,true);const i=s.profiles.findIndex(x=>x.key===key);if(i<0)return s;s.profiles.splice(i,1);return changed();}
  if(type==='pendingAdd'){if(s.pending.length>=LIMIT.pending)fail('待处理记录最多 200 条');const id='p-'+(s.revision+1);if(s.pending.some(p=>p.id===id))fail('待处理记录编号冲突');s.pending.push(pending({id,gift:action.gift,reason:action.reason}));return changed();}
  if(type==='pendingRemove'){const id=str(action.id,'待处理 ID',200,true);const i=s.pending.findIndex(x=>x.id===id);if(i<0)return s;s.pending.splice(i,1);return changed();}
  fail('未知操作类型');
 }
 function queuePosition(state,id){
  if(state.current?.id===id)return {position:1,ahead:0};
  const index=state.waiting.findIndex(entry=>entry.id===id);
  if(index<0)return null;
  const position=index+1+(state.current?1:0);
  return {position,ahead:position-1};
 }
 return Object.freeze({createState,apply,validate,queuePosition});
});
