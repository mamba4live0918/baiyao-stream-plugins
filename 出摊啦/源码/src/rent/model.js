/* Pure business-time rent ledger. No wall clock, storage, socket or rendering.
 * V1.5：加班都送去白曜加班机。交租差额和「加班」动作记成 route 'baiyao' 的待发（pending），送到了标 sent。
 * V1.6：也能记到插件自带的加班机——这时记成 route 'local'（已处理，不送），倒计时在 main.js 的自带加班机里加。
 * 旧存档里 V1.4 自带加班机的 'local'、V1.3 咩播的 'miebo' 都当已经处理过（'local'），不再送。 */
const MAX=Number.MAX_SAFE_INTEGER;
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const positive=(value,fallback)=>finite(value)&&value>0?value:fallback;
const nonnegative=(value,fallback=0)=>finite(value)&&value>=0?Math.min(MAX,value):fallback;
const whole=value=>Math.floor(nonnegative(value));
const money=value=>Number(value.toFixed(2));
const object=value=>value&&typeof value==='object'&&!Array.isArray(value)?value:{};
const identifier=value=>typeof value==='string'?value.trim():'';
const cappedAdd=(a,b)=>Math.min(MAX,a+b);
const shortText=(value,max)=>typeof value==='string'?Array.from(value.trim()).slice(0,max).join(''):'';

function options(raw={}){
 const x=object(raw);
 return {enabled:x.enabled!==false,intervalMs:Math.min(MAX,Math.max(1,positive(x.minutes,10)*60000)),
  coins:nonnegative(x.coins,100),perCoins:positive(x.perCoins,10),addMinutes:positive(x.addMinutes,1)};
}

export function defaultRentState(){
 return {version:2,started:false,elapsedMs:0,nextDueMs:600000,intervalMs:600000,
  sessionElapsedMs:0,sequence:0,overtimeSeconds:0,transactions:[],lastCharge:null,abandonSurcharge:0,
  lastSeenAt:null,closedAt:null,idleOpenMs:0,sessionId:'session-0',sessionGeneration:0};
}

export function sanitizeRentState(raw){
 const x=object(raw),d=defaultRentState(),seen=new Set();
 const transactions=(Array.isArray(x.transactions)?x.transactions:[]).flatMap(item=>{
  const t=object(item),id=identifier(t.id);
  if(!id||seen.has(id)||!finite(t.seconds)||t.seconds<=0)return [];
  seen.add(id);const route=t.route==='baiyao'?'baiyao':'local',user=shortText(t.user,20);
  return [{id,seconds:Math.min(MAX,Math.ceil(t.seconds)),source:t.source==='rent'?'rent':'action',route,
   status:route==='local'?'local':t.status==='sent'?'sent':'pending',...(user?{user}:{}),
   ...(finite(t.createdAt)&&t.createdAt>=0?{createdAt:t.createdAt}:{}),
   ...(finite(t.sentAt)&&t.sentAt>=0?{sentAt:t.sentAt}:{})}];
 });
 const intervalMs=Math.min(MAX,positive(x.intervalMs,d.intervalMs)),started=x.started===true;
 const last=object(x.lastCharge),lastId=identifier(last.id);
 return {version:2,started,elapsedMs:started?nonnegative(x.elapsedMs):0,
  nextDueMs:started?nonnegative(x.nextDueMs,intervalMs):intervalMs,intervalMs:Math.min(MAX,intervalMs),
  sessionElapsedMs:started?nonnegative(x.sessionElapsedMs):0,sequence:whole(x.sequence),abandonSurcharge:nonnegative(x.abandonSurcharge),
  overtimeSeconds:Math.max(nonnegative(x.overtimeSeconds),transactions.reduce((sum,t)=>cappedAdd(sum,t.seconds),0)),
  transactions,lastCharge:lastId?{id:lastId,dueAtMs:nonnegative(last.dueAtMs),paid:nonnegative(last.paid),shortfall:nonnegative(last.shortfall),seconds:whole(last.seconds)}:null,
  lastSeenAt:finite(x.lastSeenAt)&&x.lastSeenAt>=0?x.lastSeenAt:null,closedAt:finite(x.closedAt)&&x.closedAt>=0?x.closedAt:null,idleOpenMs:started?nonnegative(x.idleOpenMs):0,
  sessionId:identifier(x.sessionId)||d.sessionId,sessionGeneration:whole(x.sessionGeneration)};
}

const state=stats=>stats?.rent||defaultRentState();

export function startRent(stats,rentSettings={}){
 const r=state(stats);if(r.started)return stats;
 const {intervalMs}=options(rentSettings);
 return {...stats,rent:{...r,started:true,elapsedMs:0,nextDueMs:intervalMs,intervalMs,sessionElapsedMs:0}};
}

export function chargeRent(coins,rentSettings={}){
 const o=options(rentSettings),balance=finite(coins)?coins:0;
 const paid=money(Math.min(Math.max(0,balance),o.coins)),shortfall=money(Math.max(0,o.coins-paid));
 const seconds=shortfall>0?Math.min(MAX,Math.ceil(shortfall/o.perCoins*o.addMinutes*60)):0;
 return {balance:money(balance-paid),paid,shortfall,seconds};
}

function nextIdentity(r,idFactory,source){
 let sequence=Math.min(MAX,r.sequence+1);
 const candidate=typeof idFactory==='function'?identifier(idFactory(sequence,source)):'';
 const occupied=id=>r.lastCharge?.id===id||r.transactions.some(t=>t.id===id);
 if(candidate&&!occupied(candidate))return {sequence,id:candidate};
 const prefix=`chutan-${r.sessionId||'session-0'}-`;
 while(sequence<MAX&&occupied(prefix+sequence))sequence++;
 let fallback=prefix+sequence,suffix=0;
 while(occupied(fallback))fallback=prefix+sequence+'-'+(++suffix);
 return {sequence,id:fallback};
}

export function advanceRent(stats,deltaMs,rentSettings={},control={}){
 const original=state(stats);
 if(!original.started||control.running!==true||!finite(deltaMs)||deltaMs<=0)return {stats,charges:[]};
 const o=options(rentSettings),r={...original,sessionElapsedMs:cappedAdd(original.sessionElapsedMs,deltaMs)};
 let result={...stats,rent:r};const charges=[];
 if(!o.enabled)return {stats:result,charges};
 r.elapsedMs=cappedAdd(original.elapsedMs,deltaMs);
 // Keep the established deadline when settings change; use the new interval after it.
 while(r.elapsedMs>=r.nextDueMs){
  const chargeCoins=cappedAdd(o.coins,nonnegative(r.abandonSurcharge));
  const identity=nextIdentity(r,control.idFactory,'rent'),payment=chargeRent(result.coins,{...rentSettings,coins:chargeCoins});
  r.abandonSurcharge=0;
  r.sequence=identity.sequence;
  const charge={id:identity.id,dueAtMs:r.nextDueMs,paid:payment.paid,shortfall:payment.shortfall,seconds:payment.seconds};
  charges.push(charge);r.lastCharge=charge;result.coins=payment.balance;
  if(payment.seconds>0){
   const local=control.route==='local';charge.route=local?'local':'baiyao';
   r.transactions=[...r.transactions,{id:charge.id,seconds:payment.seconds,source:'rent',route:charge.route,status:local?'local':'pending'}];
   r.overtimeSeconds=cappedAdd(r.overtimeSeconds,payment.seconds);
  }
  r.intervalMs=o.intervalMs;
  const next=cappedAdd(r.nextDueMs,o.intervalMs);
  if(next<=r.nextDueMs)break;
  r.nextDueMs=next;
 }
 return {stats:result,charges};
}

/** user：送礼的观众（白曜明细里显示）；不填就只写「出摊啦」。 */
export function addOvertime(stats,seconds,{id,source='action',idFactory,user,route='baiyao'}={}){
 if(!finite(seconds)||seconds<=0)return {stats,transaction:null};
 const r=state(stats),provided=identifier(id),viewer=shortText(user,20);
 if(provided&&r.transactions.some(t=>t.id===provided))return {stats,transaction:null};
 const identity=nextIdentity(r,idFactory,source);
 const transaction={id:provided||identity.id,seconds:Math.min(MAX,Math.ceil(seconds)),source:source==='rent'?'rent':'action',
  route:route==='local'?'local':'baiyao',status:route==='local'?'local':'pending',...(viewer?{user:viewer}:{})};
 return {stats:{...stats,rent:{...r,sequence:identity.sequence,overtimeSeconds:cappedAdd(r.overtimeSeconds,transaction.seconds),transactions:[...r.transactions,transaction]}},transaction};
}

/** 还没送到白曜加班机的加班（按记下的先后）。 */
export function getPendingOvertime(stats){return state(stats).transactions.filter(t=>t.route==='baiyao'&&t.status==='pending');}

export function markOvertimeSent(stats,id,{at}={}){
 const r=state(stats),index=r.transactions.findIndex(t=>t.id===id&&t.route==='baiyao'&&t.status==='pending');
 if(index<0)return stats;
 return {...stats,rent:{...r,transactions:r.transactions.map((t,i)=>i===index?{...t,status:'sent',...(finite(at)&&at>=0?{sentAt:at}:{})}:t)}};
}

export function applyAbandonmentPenalty(stats,count,abandonConfig={}){
 const config=object(abandonConfig),people=whole(count);
 if(config.enabled!==true||people===0)return stats;
 const amount=whole(nonnegative(config.amount,10)),penalty=Math.min(MAX,people*amount);
 const next={...stats,abandoned:cappedAdd(whole(stats.abandoned),people)};
 if(config.penalty==='rent')next.rent={...state(stats),abandonSurcharge:cappedAdd(nonnegative(state(stats).abandonSurcharge),penalty)};
 else next.coins=money((finite(stats.coins)?stats.coins:0)-penalty);
 return next;
}

export function resetCounters(stats){return {...stats,coins:0,served:0,badReviews:0,abandoned:0};}

export function newRentSession(stats,rentSettings={},wallAt=null){
 const {intervalMs}=options(rentSettings);
 const sessionGeneration=Math.min(MAX,whole(state(stats).sessionGeneration)+1);
 const sessionId=`session-${sessionGeneration}-${finite(wallAt)&&wallAt>=0?wallAt:0}`;
 return {...stats,rent:{...defaultRentState(),intervalMs,nextDueMs:intervalMs,
  lastSeenAt:finite(wallAt)&&wallAt>=0?wallAt:null,sessionId,sessionGeneration}};
}

/** 交租牌要的数；overtimeSeconds 是本场一共记下的加班（送没送到都算），pendingCount 是还没送到白曜的笔数。 */
export function rentView(stats,rentSettings={}){
 const r=state(stats),o=options(rentSettings),remainingMs=r.started?Math.max(0,r.nextDueMs-r.elapsedMs):o.intervalMs;
 return {started:r.started,remainingMs,remainingSeconds:Math.ceil(remainingMs/1000),sessionElapsedMs:r.sessionElapsedMs,
  overtimeSeconds:r.overtimeSeconds,pendingCount:getPendingOvertime(stats).length,
  chargeCoins:cappedAdd(o.coins,nonnegative(r.abandonSurcharge)),abandonSurcharge:nonnegative(r.abandonSurcharge)};
}
