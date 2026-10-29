(function(root){
'use strict';
const Named=root.PetNamedPets||(typeof module!=='undefined'&&module.exports?require('./named-pets.js'):null);
const validIndividualScale=v=>typeof v==='number'&&Number.isFinite(v)&&v>=25&&v<=1000&&Math.abs(v*100-Math.round(v*100))<1e-7;
const COUNTS=Object.freeze([1,2,5,11,15,20,40,50,80,100]);
const MAX_VISIBLE=500;
const MAX_COW_KIND=2099999;
const FIRST_AVATAR_KIND=1000000;
const MAX_AVATAR_KIND=1999999;
const FIRST_NATIVE_EXTENSION=2000000;
const MAX_AVATAR_KINDS=1000;
function planPopulation(state,list,limit=null){
 if(!state||!valid(state.outside,100000)||!Array.isArray(list))throw Error('在外数量或宠物列表无效');
 if(limit!==null&&(!Number.isInteger(limit)||limit<1||limit>100000))throw Error('场内最高数量须为1–100000的整数');
 const active=[...new Set(list.filter(c=>c&&typeof c==='object'&&!Array.isArray(c)&&!c.dead))];
 if(limit===null)return{kept:active,parked:[],missing:Math.max(0,state.outside-active.length)};
 const target=Math.min(limit,state.outside),held=active.filter(c=>c.held&&!c.ballEmerging),chosen=new Set(held);
 for(const c of active){if(chosen.size>=target)break;chosen.add(c);}
 const kept=active.filter(c=>chosen.has(c)),parked=active.filter(c=>!chosen.has(c));
 return{kept,parked,missing:Math.max(0,target-kept.length)};
}
function rebalancePopulation(state,list,limit){if(limit===undefined)return planPopulation(state,list);if(!Number.isInteger(limit)||limit<1||limit>MAX_VISIBLE)throw Error('场内上限须为1–500的整数');const active=list.filter(c=>!c.dead),held=active.filter(c=>c.held),target=Math.min(limit,state.outside),keepSet=new Set([...held,...active.filter(c=>!c.held)].slice(0,Math.max(target,held.length))),kept=active.filter(c=>keepSet.has(c)),parked=active.filter(c=>!keepSet.has(c));state.pendingKinds=parked.map(c=>validKind(c.kind)?c.kind:0).concat(state.pendingKinds||[]).slice(0,Math.max(0,state.outside-kept.length));return{kept,parked,missing:Math.max(0,target-kept.length)};}
const DEFAULT_TIMES=Object.freeze([0,1050,2100,3500,5400]);
const BOX_TIMES=Object.freeze([0,200,850,1550,2500]);
const phaseAt=(elapsed,times=DEFAULT_TIMES)=>elapsed<times[1]?0:elapsed<times[2]?1:elapsed<times[3]?2:elapsed<times[4]?3:4;
const defaultTiers=()=>[1,2,3,5,8,10,11,15,20,25,30,40,50,66,80,100,150,200,300,500].map(count=>({id:'default-'+count,count,enabled:true}));
function validateTiers(list){if(!Array.isArray(list)||!list.length||list.length>100)throw Error('档位须为 1–100 条');const ids=new Set(),counts=new Set(),out=[];for(const t of list){if(!t||!Number.isInteger(t.count)||t.count<1||t.count>10000)throw Error('每档数量须为 1–10000 的整数');if(typeof t.id!=='string'||!/^[\w-]{1,60}$/.test(t.id)||ids.has(t.id))throw Error('档位标识无效');if(counts.has(t.count))throw Error('同一个数量只保留一档');ids.add(t.id);counts.add(t.count);out.push({id:t.id,count:t.count,enabled:t.enabled!==false});}if(!out.some(t=>t.enabled))throw Error('至少保留一个开启的档位');return out;}
function makeTimeline(durations){const mins=[1050,1050,1400,1900],times=[0];for(let i=0;i<4;i++){const d=Number(durations?.[i]);times.push(times.at(-1)+Math.max(mins[i],Number.isFinite(d)&&d>0?Math.min(d,120)*1000+200:0));}return times;}
const valid=(n,max=1000000)=>Number.isSafeInteger(n)&&n>=0&&n<=max;
const validKind=n=>valid(n,MAX_COW_KIND);
const validAvatarKind=n=>Number.isSafeInteger(n)&&n>=FIRST_AVATAR_KIND&&n<=MAX_AVATAR_KIND;
const validAnimalKind=n=>valid(n,FIRST_AVATAR_KIND-1)||Number.isSafeInteger(n)&&n>=FIRST_NATIVE_EXTENSION&&n<=MAX_COW_KIND;
function cleanAvatarName(name){return String(name??'').normalize('NFKC').replace(/[\u0000-\u001f\u007f-\u009f]/g,' ').trim().slice(0,40)||'观众';}
function validAvatarUrl(url){
 if(typeof url!=='string'||!url)return false;
 if(/^https?:\/\//i.test(url)){
  if(url.length>2048||/[\s\u0000-\u001f\u007f]/.test(url))return false;
  try{const u=new URL(url);return(u.protocol==='http:'||u.protocol==='https:')&&!!u.hostname;}catch{return false;}
 }
 if(url.length>1400000)return false;
 const match=/^data:image\/(?:png|jpeg|webp|gif);base64,([A-Za-z0-9+/]+={0,2})$/i.exec(url);
 if(!match)return false;
 const payload=match[1],padding=payload.endsWith('==')?2:payload.endsWith('=')?1:0;
 return payload.length%4===0&&payload.length*3/4-padding<=1024*1024;
}
function safeAvatarUrl(value){return validAvatarUrl(value)?value:'';}
function safeBoxSnapshot(row){
 if(!row||typeof row!=='object'||Array.isArray(row)||typeof row.id!=='string'||!/^[\w-]{1,60}$/.test(row.id)||typeof row.name!=='string'||typeof row.gift!=='string'||typeof row.enabled!=='boolean'||!['fixed','random'].includes(row.mode))return null;
 const controls=/[\u0000-\u001f\u007f-\u009f]/,name=row.name.trim(),gift=row.gift.normalize('NFKC').trim();
 if(!name||Array.from(name).length>40||Array.from(gift).length>100||controls.test(row.name)||controls.test(row.gift))return null;
 const min=row.mode==='fixed'?row.count:row.min,max=row.mode==='fixed'?row.count:row.max;
 if(!valid(min,100000)||min<1||!valid(max,100000)||max<min)return null;
 return{id:row.id,name,gift,mode:row.mode,count:min,min,max,enabled:row.enabled};
}
function safeBoxFall(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;
 const finite=(key,low,high)=>Number.isFinite(raw[key])&&raw[key]>=low&&raw[key]<=high;
 if(!finite('w',1,100000)||!finite('h',1,100000))return null;const extent=4*Math.max(raw.w,raw.h);
 if(!finite('x',-extent,extent)||!finite('y',-extent,extent)||!finite('vx',-1000000,1000000)||!finite('vy',-1000000,1000000)||!finite('angle',-1000000,1000000)||!finite('angularVelocity',-100000,100000)||!valid(raw.bounces,3)||typeof raw.done!=='boolean'||!finite('squash',0,.24)||!finite('elapsed',0,6)||!finite('targetY',0,100000)||Math.abs(raw.targetY-raw.h/2)>1e-6)return null;
 return Object.fromEntries(['x','y','vx','vy','angle','angularVelocity','bounces','done','squash','w','h','elapsed','targetY'].map(key=>[key,raw[key]]));
}
function sanitizeGift(g){const safe={...g},url=safeAvatarUrl(g.avatarUrl);delete safe.avatarUrl;delete safe.nickName;delete safe.tierSnapshot;if(g.kind==='box')safe.box=safeBoxSnapshot(g.box??g.tierSnapshot);else delete safe.box;if(url)safe.avatarUrl=url;if(typeof g.nickName==='string')safe.nickName=cleanAvatarName(g.nickName);return safe;}
function referencedAvatarKinds(s,now=Date.now()){
 const used=new Set(),add=kind=>{if(validAvatarKind(kind))used.add(kind);};
 for(const row of Array.isArray(s.positions)?s.positions:[])add(row?.kind);
 for(const kind of Array.isArray(s.pendingKinds)?s.pendingKinds:[])add(kind);
 for(const row of Array.isArray(s.recentHomes)?s.recentHomes:[])if(Number.isFinite(row?.at)&&row.at>=now-300000&&row.at<=now+5000&&row.count>0)add(row.kind);
 add(s.current?.avatarKind);
 for(const kind of Array.isArray(s.current?.cast)?s.current.cast:[])add(kind);
 for(const row of Array.isArray(s.roundSources)?s.roundSources:[])if(row?.count>0)add(row.kind);
 for(const row of Array.isArray(s.naming?.residents)?s.naming.residents:[])add(row.kind);
 return used;
}
function registerAvatar(s,url,name,fallbackKind=0){
 if(!safeAvatarUrl(url))return 0;
 s.avatarKinds??=[];
 const prior=s.avatarKinds.find(row=>validAvatarKind(row.kind)&&row.url===url);
 if(prior){if(arguments.length>=4)prior.fallbackKind=validAnimalKind(fallbackKind)?fallbackKind:0;return prior.kind;}
 if(s.avatarKinds.length>MAX_AVATAR_KINDS)return 0;
 const used=referencedAvatarKinds(s),record={url,name:cleanAvatarName(name),fallbackKind:validAnimalKind(fallbackKind)?fallbackKind:0};
 if(s.avatarKinds.length===MAX_AVATAR_KINDS){
  const oldestFree=s.avatarKinds.findIndex(row=>validAvatarKind(row.kind)&&!used.has(row.kind));
  if(oldestFree<0)return 0;
  const [previous]=s.avatarKinds.splice(oldestFree,1);
  s.avatarKinds.push({kind:previous.kind,...record});
  return previous.kind;
 }
 const occupied=new Set(s.avatarKinds.map(row=>row.kind));
 const next=Math.max(FIRST_AVATAR_KIND,Number.isSafeInteger(s.nextAvatarKind)?s.nextAvatarKind:FIRST_AVATAR_KIND);
 let kind=next;
 while(kind<=MAX_AVATAR_KIND&&(occupied.has(kind)||used.has(kind)))kind++;
 if(kind>MAX_AVATAR_KIND){kind=FIRST_AVATAR_KIND;while(kind<next&&kind<=MAX_AVATAR_KIND&&(occupied.has(kind)||used.has(kind)))kind++;}
 if(!validAvatarKind(kind)||occupied.has(kind)||used.has(kind))return 0;
 s.avatarKinds.push({kind,...record});
 s.nextAvatarKind=Math.min(MAX_AVATAR_KIND+1,kind+1);
 return kind;
}
const fresh=()=>({version:1,outside:0,home:0,queue:0,serial:0,current:null,positions:[],recentHomes:[],pendingKinds:[],avatarKinds:[],nextAvatarKind:FIRST_AVATAR_KIND,roundSources:[],interactions:restoreInteractions(null),tornadoUntil:0,tornadoPos:{x:.45,y:.65},pendingGifts:[],receivedGiftIds:[],receivedLikeIds:[],likes:{total:0,carry:0}});
function availableSlots(s){return Math.max(0,100000-s.outside-(s.current?.success&&!s.current.applied?s.current.count:0));}
function effectRuleValue(r,rng=Math.random){if(r?.kind!=='add')return Number.isInteger(r?.value)&&r.value>0?r.value:0;const min=r.min??r.value,max=r.max??r.value;if(!Number.isInteger(min)||!Number.isInteger(max)||min<1||max<min||max>10000)return 0;const x=Math.max(0,Math.min(.999999,Number(rng())||0));return min+Math.floor(x*(max-min+1));}
function validGift(g){const kinds=['round','box','add','recall','tornado','boom','ban','grip','clear','double','challenge'];if(!(g&&kinds.includes(g.kind)&&typeof g.name==='string'&&g.name.length<=100&&valid(g.count,10000)&&g.count>0&&(g.kind==='round'||g.kind==='box'||valid(g.value,['add','recall'].includes(g.kind)?10000:['ban','grip','challenge'].includes(g.kind)?3600:300)&&g.value>0)&&(g.kind!=='challenge'||valid(g.target,10000)&&valid(g.penalty,10000)&&g.penalty>0)&&(g.eid==null||typeof g.eid==='string'&&g.eid.length<=200)))return false;if(g.kind!=='box')return true;const box=safeBoxSnapshot(g.box??g.tierSnapshot);return !!box&&box.enabled&&(!box.gift||box.gift===g.name.normalize('NFKC').trim());}
function receiveGift(s,g,now=Date.now()){if(!validGift(g))return'invalid';s.pendingGifts??=[];s.receivedGiftIds=(s.receivedGiftIds||[]).filter(r=>r.at>=now-60000);if(g.eid&&(s.receivedGiftIds.some(r=>r.id===g.eid)||s.pendingGifts.some(r=>r.eid===g.eid)))return'duplicate';if(s.pendingGifts.length>=1000)return'full';s.pendingGifts.push(sanitizeGift(g));if(g.eid)s.receivedGiftIds.push({id:g.eid,at:now});s.receivedGiftIds=s.receivedGiftIds.slice(-1000);return'accepted';}
function restoreInteractions(raw,now=Date.now()){
 const a=raw&&typeof raw==='object'?raw:{},m={windQueue:[],windNextAt:0,windBanUntil:0,timerNextAt:0,gripUntil:0,gambleUntil:0,windToken:0,challenge:null};
 for(const k of ['windNextAt','windBanUntil','timerNextAt','gripUntil','gambleUntil'])if(Number.isSafeInteger(a[k])&&a[k]>=0)m[k]=Math.min(a[k],now+86400000);
 m.windQueue=Array.isArray(a.windQueue)?a.windQueue.filter(n=>valid(n,300)&&n>0).slice(0,1000):[];
 if(valid(a.windToken,Number.MAX_SAFE_INTEGER))m.windToken=a.windToken;
 const c=a.challenge;if(c&&valid(c.until,Number.MAX_SAFE_INTEGER)&&c.until>0&&valid(c.target,1000000)&&valid(c.penalty,100000)&&valid(c.baseHome,1000000))m.challenge={until:Math.min(c.until,now+86400000),target:c.target,penalty:c.penalty,baseHome:c.baseHome,clearMode:c.clearMode===true};return m;
}
function interactionState(s){return s.interactions??(s.interactions=restoreInteractions(null));}
function queueWind(s,seconds,now=Date.now()){
 if(!valid(seconds,300)||seconds<1)return'invalid';const m=interactionState(s);if(m.windBanUntil>now)return'banned';
 if(s.tornadoUntil>now||m.windNextAt>now||m.windQueue.length){if(m.windQueue.length>=1000)return'full';m.windQueue.push(seconds);return'queued';}
 s.tornadoUntil=now+seconds*1000;m.windNextAt=s.tornadoUntil+1000;m.windToken++;return'started';
}
function advanceWind(s,now=Date.now()){const m=interactionState(s);if(m.windBanUntil>now||s.tornadoUntil>now||!m.windQueue.length||m.windNextAt>now)return false;const seconds=m.windQueue.shift();s.tornadoUntil=now+seconds*1000;m.windNextAt=s.tornadoUntil+1000;m.windToken++;return true;}
function banWind(s,seconds,now=Date.now()){if(!valid(seconds,86400)||seconds<1)return;const m=interactionState(s);m.windBanUntil=Math.min(now+86400000,Math.max(now,m.windBanUntil)+seconds*1000);m.windQueue=[];m.windNextAt=0;s.tornadoUntil=0;}
function startChallenge(s,r,times=1,now=Date.now()){
 if(!valid(r?.seconds,3600)||r.seconds<1||!valid(r.target,10000)||!valid(r.penalty,10000)||r.penalty<1||!valid(times,10000)||times<1)return false;
 const m=interactionState(s),c=m.challenge;
 if(c&&c.until>now){c.until=Math.min(now+86400000,c.until+r.seconds*times*1000);c.target=Math.min(1000000,c.target+r.target*times);c.penalty=Math.min(100000,c.penalty+r.penalty*times);c.clearMode=c.clearMode||r.target===0;}
 else{if(c)return false;m.challenge={until:now+Math.min(86400,r.seconds*times)*1000,target:Math.min(1000000,r.target*times),penalty:Math.min(100000,r.penalty*times),baseHome:s.home,clearMode:r.target===0};}return true;
}
function settleChallenge(s,now=Date.now()){const m=interactionState(s),c=m.challenge;if(!c||now<c.until)return null;const success=c.clearMode?s.outside===0:Math.max(0,s.home-c.baseHome)>=c.target;m.challenge=null;const added=success?0:add(s,c.penalty);return{success,requested:c.penalty,added};}
function pickOne(cows,id){const c=cows.find(c=>c.id===id&&!c.dead);return c?[c]:[];}
function enqueue(s,n=1,avatarKind=0){if(!valid(n,10000))return 0;const v=Math.min(n,10000-s.queue);if(!v)return 0;const kind=validAvatarKind(avatarKind)&&s.avatarKinds?.some(row=>row.kind===avatarKind)?avatarKind:0;s.queue+=v;s.roundSources??=[];const last=s.roundSources.at(-1);if(last?.kind===kind&&!Object.hasOwn(last,'box'))last.count+=v;else s.roundSources.push({kind,count:v});return v;}
function enqueueBox(s,n,avatarKind,tier,boxModule=root.PetBlindBox){
 if(!valid(n,10000))return 0;let box;try{box=safeBoxSnapshot(boxModule?.snapshot?boxModule.snapshot(tier):tier);}catch{return 0;}if(!box||!box.enabled)return 0;
 const count=Math.min(n,10000-s.queue);if(!count)return 0;const kind=validAvatarKind(avatarKind)&&s.avatarKinds?.some(row=>row.kind===avatarKind)?avatarKind:0;
 s.queue+=count;s.roundSources??=[];const last=s.roundSources.at(-1);
 if(last?.kind===kind&&last.box&&JSON.stringify(last.box)===JSON.stringify(box))last.count+=count;else s.roundSources.push({kind,count,box});return count;
}
function consumeRoundSource(s){let kind=0;if(s.queue){s.queue--;const source=s.roundSources?.[0];if(source){kind=validAvatarKind(source.kind)&&s.avatarKinds?.some(row=>row.kind===source.kind)?source.kind:0;if(--source.count<=0)s.roundSources.shift();}}return kind;}
function constructRound(s,tierId,count,success,avatarKind){return s.current={id:++s.serial,tierId,count,success,applied:false,phase:0,times:[...DEFAULT_TIMES],avatarKind};}
function start(s,rng=Math.random,miss=0,tiers=COUNTS.map(count=>({id:'default-'+count,count,enabled:true})),forcedId){
 if(s.current)return s.current;
 let eligible;try{eligible=validateTiers(tiers).filter(t=>t.enabled&&t.count<=100000-s.outside&&(!forcedId||t.id===forcedId));}catch{return null;}
 if(!eligible.length)return null;
 const avatarKind=consumeRoundSource(s);
 const r=()=>Math.max(0,Math.min(.999999,Number(rng())||0));
 const tier=eligible[Math.floor(r()*eligible.length)];return constructRound(s,tier.id,tier.count,r()*100>=miss,avatarKind);
}
function boxName(value,count){if(typeof value==='string'){const name=value.trim();if(name&&Array.from(name).length<=40&&!/[\u0000-\u001f\u007f-\u009f]/.test(value))return name;}return count+' 只';}
function startBox(s,rng=Math.random,rows,forcedId,boxModule=root.PetBlindBox){
 if(s.current)return s.current;
 const capacity=100000-s.outside,source=s.queue?s.roundSources?.[0]:null;let chosen,count;
 try{
  chosen=source&&Object.hasOwn(source,'box')?safeBoxSnapshot(source.box):boxModule?.choose(rows,capacity,forcedId,rng);
  chosen=safeBoxSnapshot(chosen);if(!chosen||!chosen.enabled||chosen.max>capacity)return null;
  count=boxModule?.roll?boxModule.roll(chosen,rng):chosen.mode==='fixed'?chosen.count:chosen.min+Math.floor(Math.max(0,Math.min(1-Number.EPSILON,Number(rng())||0))*(chosen.max-chosen.min+1));
 }catch{return null;}
 if(!valid(count,100000)||count<chosen.min||count>chosen.max)return null;
 const current=constructRound(s,chosen.id,count,true,consumeRoundSource(s));
 current.presentation='blindbox';current.boxName=chosen.name;current.box=chosen;current.times=[...BOX_TIMES];return current;
}
function upgradeCurrentBox(s,rows){
 const current=s.current;if(!current||current.presentation==='blindbox')return current||null;
 const row=Array.isArray(rows)?rows.find(row=>row?.id===current.tierId&&row.count===current.count):null;
 current.presentation='blindbox';current.boxName=boxName(row?.name,current.count);current.times=[...BOX_TIMES];return current;
}
function add(s,n){if(!valid(n,100000)||n===0)return 0;const v=Math.min(n,availableSlots(s));s.outside+=v;return v;}
function resolve(s){const r=s.current;if(!r||r.applied)return 0;r.applied=true;const added=r.success?add(s,r.count):0;if(added&&validAvatarKind(r.avatarKind)&&s.avatarKinds?.some(row=>row.kind===r.avatarKind)){s.pendingKinds??=[];for(let i=0;i<added;i++)s.pendingKinds.push(r.avatarKind);}return added;}
function cleanHistory(s,now=Date.now()){s.recentHomes=(Array.isArray(s.recentHomes)?s.recentHomes:[]).filter(r=>r&&valid(r.at,Number.MAX_SAFE_INTEGER)&&r.at>=now-300000&&r.at<=now+5000&&validKind(r.kind)&&valid(r.count,100000)&&r.count>0).slice(-5000);}
function collect(s,n,now=Date.now(),kinds=[]){if(!valid(n,100000)||!valid(s.outside,100000)||!valid(s.home,1000000))return 0;const v=Math.min(s.outside,n,1000000-s.home);if(!v)return 0;s.outside-=v;s.home+=v;cleanHistory(s,now);const byKind=new Map();for(let i=0;i<v;i++){const k=validKind(kinds[i])?kinds[i]:0;byKind.set(k,(byKind.get(k)||0)+1);}for(const[kind,count]of byKind)s.recentHomes.push({at:now,kind,count});s.recentHomes=s.recentHomes.slice(-5000);return v;}
function collectPending(s,n,visibleCount,now=Date.now()){if(!valid(n,100000)||!valid(visibleCount,100000)||!valid(s.outside,100000))return 0;const wanted=Math.min(n,Math.max(0,s.outside-visibleCount));if(!wanted)return 0;const kinds=Array.isArray(s.pendingKinds)?s.pendingKinds:[],actual=collect(s,wanted,now,kinds);if(actual){if(Array.isArray(s.pendingKinds))s.pendingKinds.splice(0,actual);else s.pendingKinds=[];}return actual;}
function burst(s,seconds,now=Date.now()){if(!Number.isFinite(seconds)||seconds<=0)return[];cleanHistory(s,now);const cutoff=now-Math.min(300,seconds)*1000,out=[];let room=Math.min(s.home,availableSlots(s));for(const r of s.recentHomes){if(r.at<cutoff||r.at>now||room<=0)continue;const n=Math.min(r.count,room);for(let i=0;i<n;i++)out.push(r.kind);r.count-=n;room-=n;}s.recentHomes=s.recentHomes.filter(r=>r.count>0);s.home-=out.length;s.outside+=out.length;s.pendingKinds??=[];s.pendingKinds=s.pendingKinds.concat(out);return out;}
function extendTornado(s,seconds,now=Date.now()){if(!Number.isFinite(seconds)||seconds<=0)return 0;s.tornadoUntil=Math.min(now+300000,Math.max(now,s.tornadoUntil||0)+seconds*1000);return s.tornadoUntil-now;}
function finish(s){s.current=null;}
function restoreAvatarState(s,a){
 const seenKinds=new Set(),seenUrls=new Set();
 for(const row of Array.isArray(a.avatarKinds)?a.avatarKinds.slice(0,MAX_AVATAR_KINDS):[]){
  if(!row||!validAvatarKind(row.kind)||!safeAvatarUrl(row.url)||seenKinds.has(row.kind)||seenUrls.has(row.url))continue;
  seenKinds.add(row.kind);seenUrls.add(row.url);s.avatarKinds.push({kind:row.kind,url:row.url,name:cleanAvatarName(row.name),fallbackKind:validAnimalKind(row.fallbackKind)?row.fallbackKind:0});
 }
 const highest=s.avatarKinds.reduce((max,row)=>Math.max(max,row.kind),FIRST_AVATAR_KIND-1);
 s.nextAvatarKind=Math.max(FIRST_AVATAR_KIND,highest+1,valid(a.nextAvatarKind,MAX_AVATAR_KIND+1)&&a.nextAvatarKind>=FIRST_AVATAR_KIND?a.nextAvatarKind:FIRST_AVATAR_KIND);
 const known=kind=>validAvatarKind(kind)&&seenKinds.has(kind);
 let remaining=s.queue;
 for(const row of Array.isArray(a.roundSources)?a.roundSources.slice(0,10000):[]){
  if(!remaining)break;
  const bound=row&&Object.hasOwn(row,'box'),box=bound?safeBoxSnapshot(row.box):null;
  if(bound&&(!box||!box.enabled||!valid(row.count,10000)||row.count<1))throw Error('Invalid queued box snapshot');
  if(!row||!valid(row.count,10000)||row.count<1)continue;
  const kind=known(row.kind)?row.kind:0,count=Math.min(row.count,remaining),last=s.roundSources.at(-1);
  const sameBox=bound?last?.box&&JSON.stringify(last.box)===JSON.stringify(box):last&&!Object.hasOwn(last,'box');
  if(last?.kind===kind&&sameBox)last.count+=count;else s.roundSources.push({kind,count,...(bound?{box}:{})});
  remaining-=count;
 }
 if(remaining){const last=s.roundSources.at(-1);if(last?.kind===0&&!Object.hasOwn(last,'box'))last.count+=remaining;else s.roundSources.push({kind:0,count:remaining});}
 if(s.current)s.current.avatarKind=known(a.current?.avatarKind)?a.current.avatarKind:0;
 s.pendingGifts=s.pendingGifts.map(sanitizeGift);
}
function restorePositions(rows,outside){
 const positions=[];
 if(!Array.isArray(rows)||!outside)return positions;
 for(const p of rows){
  if(!p||!Number.isFinite(p.x)||p.x<0||p.x>1||!Number.isFinite(p.y)||p.y<0||p.y>1||!validKind(p.kind))continue;
  positions.push({x:p.x,y:p.y,kind:p.kind,...(valid(p.windAttempt,Number.MAX_SAFE_INTEGER)?{windAttempt:p.windAttempt}:{}),...(validIndividualScale(p.individualScale)&&p.individualScale!==100?{individualScale:p.individualScale}:{})});
  if(positions.length===outside)break;
 }
 return positions;
}
function restore(raw){try{const a=JSON.parse(raw);if(!a||a.version!==1||!valid(a.outside,100000)||!valid(a.home)||!valid(a.queue,10000)||!valid(a.serial,Number.MAX_SAFE_INTEGER))return null;const s=fresh();Object.assign(s,{outside:a.outside,home:a.home,queue:a.queue,serial:a.serial});if(a.current){const r=a.current;if(!valid(r.id,Number.MAX_SAFE_INTEGER)||!valid(r.count,r.presentation==='blindbox'?100000:10000)||r.count<1||typeof r.success!=='boolean'||typeof r.applied!=='boolean'||!valid(r.phase,4))return null;let times=[...(r.presentation==='blindbox'?BOX_TIMES:DEFAULT_TIMES)];if(Array.isArray(r.times)&&r.times.length===5&&r.times[0]===0&&r.times.every((t,i)=>Number.isFinite(t)&&t>=0&&t<=500000&&(!i||t>r.times[i-1])))times=[...r.times];s.current={id:r.id,tierId:typeof r.tierId==='string'&&/^[\w-]{1,60}$/.test(r.tierId)?r.tierId:'default-'+r.count,count:r.count,success:r.success,applied:r.applied,phase:r.phase,times};if(r.presentation==='blindbox'){s.current.presentation='blindbox';s.current.boxName=boxName(r.boxName,r.count);if(Object.hasOwn(r,'box')){const box=safeBoxSnapshot(r.box);if(!box||!box.enabled||box.id!==s.current.tierId||r.count<box.min||r.count>box.max)return null;s.current.box=box;s.current.boxName=box.name;}const fall=safeBoxFall(r.boxFall);if(fall)s.current.boxFall=fall;if(Number.isFinite(r.boxAge)&&r.boxAge>=0&&r.boxAge<=6)s.current.boxAge=r.boxAge;}if(Array.isArray(r.cast))s.current.cast=r.cast.filter(k=>validKind(k)).slice(0,2);}s.positions=restorePositions(a.positions,s.outside);s.recentHomes=Array.isArray(a.recentHomes)?a.recentHomes.slice(-5000):[];cleanHistory(s);let credit=s.home;const history=[];for(let i=s.recentHomes.length-1;i>=0&&credit>0;i--){const row=s.recentHomes[i],count=Math.min(row.count,credit);history.push({...row,count});credit-=count;}s.recentHomes=history.reverse();s.pendingKinds=Array.isArray(a.pendingKinds)?a.pendingKinds.filter(k=>validKind(k)).slice(0,Math.max(0,s.outside-s.positions.length)):[];s.tornadoUntil=Number.isFinite(a.tornadoUntil)?Math.max(0,Math.min(Date.now()+300000,a.tornadoUntil)):0;if(a.tornadoPos&&Number.isFinite(a.tornadoPos.x)&&Number.isFinite(a.tornadoPos.y))s.tornadoPos={x:Math.max(0,Math.min(1,a.tornadoPos.x)),y:Math.max(0,Math.min(1,a.tornadoPos.y))};s.pendingGifts=Array.isArray(a.pendingGifts)?a.pendingGifts.filter(validGift).slice(0,1000):[];s.likes=cleanLikes(a.likes);s.receivedLikeIds=cleanLikeReceipts(a.receivedLikeIds);s.receivedGiftIds=Array.isArray(a.receivedGiftIds)?a.receivedGiftIds.filter(r=>r&&typeof r.id==='string'&&r.id.length<=200&&valid(r.at,Number.MAX_SAFE_INTEGER)&&r.at>=Date.now()-60000&&r.at<=Date.now()+5000).slice(-1000):[];if(s.current?.success&&!s.current.applied&&s.outside+s.current.count>100000)return null;s.interactions=restoreInteractions(a.interactions);restoreAvatarState(s,a);if(Object.hasOwn(a,'naming')){if(!Named)return null;s.naming=Named.restore(a.naming,'restored-session').value;}return s;}catch{return null;}}
function makeAssetGate(){const active=new Map();return{cancel(key){active.get(key)?.abort();active.delete(key);},async replace(key,prepare,persist,commit){active.get(key)?.abort();const ctl=new AbortController();active.set(key,ctl);try{const value=await prepare(ctl.signal);if(ctl.signal.aborted)return false;await persist(value,ctl.signal);if(ctl.signal.aborted)return false;commit(value);return true;}catch(e){if(ctl.signal.aborted)return false;throw e;}finally{if(active.get(key)===ctl)active.delete(key);}}};}
function ballPath(edge,x,y,W,H,scatter=.5){const width=Math.max(1,Number(W)||1),height=Math.max(1,Number(H)||1),v=Number.isFinite(scatter)?Math.max(0,Math.min(1,scatter)):.5,endX=Math.max(0,Math.min(width,Number(x)||0)),endY=Math.max(0,Math.min(height,Number(y)||0)),side=((Number(edge)||0)%4+4)%4,margin=80;let startX,startY;if(side===0){startX=-margin;startY=height*(.12+v*.72);}else if(side===1){startX=width+margin;startY=height*(.12+v*.72);}else if(side===2){startX=width*(.08+v*.84);startY=-margin;}else{startX=width*(.08+v*.84);startY=height+margin;}return{startX,startY,viaX:(startX+endX)/2,viaY:Math.max(15,Math.min(startY,endY)-height*.16),endX,endY};}
function stepBall(p,dt,floor,gravity=1300){
 if(p.done)return p;
 dt=Number.isFinite(dt)?Math.max(0,Math.min(.05,dt)):0;
 floor=Number.isFinite(floor)?floor:p.y;
 const g=Number.isFinite(gravity)&&gravity>0?gravity:1300;
 p.squash=Math.max(0,(p.squash||0)-dt*2.3);
 p.x+=p.vx*dt;
 p.y+=p.vy*dt+g*dt*dt/2;
 p.vy+=g*dt;
 p.angle+=(p.angularVelocity||0)*dt;
 if(p.y>=floor&&p.vy>=0){
  p.y=floor;
  p.bounces=(p.bounces||0)+1;
  const impact=p.vy;
  p.squash=Math.min(.24,.13+impact/7000);
  p.vx*=p.bounces===1?.06:.35;
  p.angularVelocity=(p.angularVelocity||0)*.63;
  if(p.bounces>=3||impact<110){p.vy=0;p.vx=0;p.angularVelocity=0;p.done=true;}
  else p.vy=-impact*(p.bounces===1?.42:.25);
 }
 return p;
}
function resetHop(p){p.hopStage='rest';p.hopTime=0;p.hopLift=0;p.hopScaleX=1;p.hopScaleY=1;p.hopFrame=0;p.walking=false;}
function stepHop(p,dt,o,rng=Math.random){
 if(!o.enabled||p.held||p.airborne){resetHop(p);return;}
 dt=Math.max(0,Math.min(.05,dt));p.hopStage??='rest';p.hopTime??=0;p.hopWait??=rng()*.9;
 p.hopLift=0;p.hopScaleX=1;p.hopScaleY=1;p.hopFrame=0;p.walking=false;
 if(p.hopStage==='rest'){p.hopWait-=dt;if(p.hopWait>0)return;p.hopStage='prep';p.hopTime=0;p.roamVX=(rng()<.5?-1:1)*(.8+rng()*.2);p.roamVY=(rng()-.5)*.6;}
 p.hopTime+=dt;const t=p.hopTime;
 if(p.hopStage==='prep'){const u=Math.min(1,t/.16);p.hopScaleX=1+.18*u;p.hopScaleY=1-.2*u;p.hopFrame=3;if(u===1){p.hopStage='flight';p.hopTime=0;}}
 else if(p.hopStage==='flight'){const u=Math.min(1,t/.5),arc=Math.sin(Math.PI*u);p.wait=0;p.turnIn=1000;stepRoam(p,dt,{...o,speed:o.speed*1.85*arc},rng);p.hopLift=-arc*Math.min(48,(o.size||80)*.38);p.hopScaleX=1-.09*arc;p.hopScaleY=1+.13*arc;p.hopFrame=u<.5?2:1;if(u===1){p.hopStage='land';p.hopTime=0;p.hopLift=0;}}
 else if(p.hopStage==='land'){const u=Math.min(1,t/.2),bounce=Math.sin(Math.PI*u);p.hopScaleX=1+.22*bounce;p.hopScaleY=1-.22*bounce;p.hopFrame=3;if(u===1){resetHop(p);p.hopWait=.16+rng()*.9;}}
}
function stepRoam(p,dt,o,rng=Math.random){p.walking=false;if(!o.enabled||p.held||p.airborne)return;p.wait=Math.max(0,(p.wait||0)-dt);if(p.wait>0)return;const b=o.bounds,r=o.radius||0,loX=Math.min(b.left+r,(b.left+b.right)/2),hiX=Math.max(b.right-r,(b.left+b.right)/2),loY=Math.min(b.top+r,(b.top+b.bottom)/2),hiY=Math.max(b.bottom-r,(b.top+b.bottom)/2);dt=Math.max(0,Math.min(.05,dt));p.turnIn=(p.turnIn||0)-dt;if(p.turnIn<=0){if(rng()<.16){p.wait=.5+rng()*1.7;return;}p.roamVX=(rng()<.5?-1:1)*(.7+rng()*.3);p.roamVY=(rng()-.5)*.8;p.turnIn=1.2+rng()*3.5;}let nx=p.x+p.roamVX*o.speed*dt,ny=p.y+p.roamVY*o.speed*dt;if(nx<loX||nx>hiX){p.roamVX=-p.roamVX;nx=Math.max(loX,Math.min(hiX,nx));}if(ny<loY||ny>hiY){p.roamVY=-p.roamVY;ny=Math.max(loY,Math.min(hiY,ny));}const q=o.obstacle;if(q&&nx>q.x-r&&nx<q.x+q.w+r&&ny>q.y-r&&ny<q.y+q.h+r){const edges=[{d:Math.abs(p.x-(q.x-r)),x:q.x-r,y:p.y},{d:Math.abs(p.x-(q.x+q.w+r)),x:q.x+q.w+r,y:p.y},{d:Math.abs(p.y-(q.y-r)),x:p.x,y:q.y-r},{d:Math.abs(p.y-(q.y+q.h+r)),x:p.x,y:q.y+q.h+r}].filter(e=>e.x>=loX&&e.x<=hiX&&e.y>=loY&&e.y<=hiY).sort((a,b)=>a.d-b.d);const e=edges[0];nx=e?e.x:p.x;ny=e?e.y:p.y;p.roamVX=-p.roamVX;p.roamVY=-p.roamVY;p.turnIn=.5;}p.x=nx;p.y=ny;p.walking=true;p.facing=p.roamVX<0?-1:1;p.animClock=(p.animClock||0)+dt*Math.max(3,Math.min(12,o.speed/7));}
function movePen(x,y,width,height,W,H){x=Math.max(width/2,Math.min(W-width/2,x));y=Math.max(height/2,Math.min(H-height/2-12,y));return{penX:x/Math.max(1,W)*100,penY:y/Math.max(1,H)*100};}
function penGeometry(cfg,W,H,aspect=1,scale=1){aspect=Number.isFinite(aspect)&&aspect>0?aspect:1;const width=Math.min(cfg.penWidth*scale,W*.65,H*.7/aspect),height=width*aspect;const p=movePen(W*cfg.penX/100,H*cfg.penY/100,width,height,W,H),g={width,height,x:p.penX/100*W,y:p.penY/100*H};if(scale<1||W/H<.9){g.x=Math.max(width/2+8,Math.min(W-width/2-8,g.x));g.y=Math.max(height/2+8,Math.min(H-height/2-8,g.y));}return g;}
function resizePen(width,dx,dy,W,H,aspect=1,scale=1){aspect=Number.isFinite(aspect)&&aspect>0?aspect:1;return Math.max(120*scale,Math.min(800*scale,W*.65,H*.7/aspect,width+2*(dx+aspect*dy)/(1+aspect*aspect)));}
function moveHud(x,y,width,height,W,H){const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));return{x:clamp(x,8+width/2,W-8-width/2)/Math.max(1,W)*100,y:clamp(y,8+height/2,H-8-height/2)/Math.max(1,H)*100};}
function hudGeometry(cfg,baseWidth,baseHeight,W,H,textScale=1){const factor=Math.min(Math.max(.5,Math.min(2.5,cfg.scale/100))*textScale,Math.max(1,W-16)/baseWidth,Math.max(1,H-16)/baseHeight),width=baseWidth*factor,height=baseHeight*factor;const p=moveHud(W*cfg.x/100,H*cfg.y/100,width,height,W,H);return{x:p.x/100*W,y:p.y/100*H,width,height,scale:factor*100};}
function resizeHud(baseWidth,baseHeight,startWidth,dx,dy,W,H,textScale=1){const aspect=baseHeight/baseWidth,w=startWidth+2*(dx+aspect*dy)/(1+aspect*aspect);return Math.max(50,Math.min(250,(W-16)/(baseWidth*textScale)*100,(H-16)/(baseHeight*textScale)*100,w/(baseWidth*textScale)*100));}
// 点赞累计：total 为本场总赞数，carry 为尚未兑换成萌宠的赞数
const LIKE_CAP=1e15;function cleanLikes(l){const ok=v=>Number.isSafeInteger(v)&&v>=0&&v<=LIKE_CAP;return{total:ok(l?.total)?l.total:0,carry:ok(l?.carry)?l.carry:0};}
function cleanLikeReceipts(rows,now=Date.now()){if(!valid(now,Number.MAX_SAFE_INTEGER)||!Array.isArray(rows))return[];return rows.slice(-1000).filter(r=>r&&typeof r.id==='string'&&r.id.length>0&&r.id.length<=800&&!/[\u0000-\u001f\u007f-\u009f]/.test(r.id)&&valid(r.at,Number.MAX_SAFE_INTEGER)&&r.at>=now-60000&&r.at<=now+5000).map(r=>({id:r.id,at:r.at}));}
function addLikes(s,count){if(!Number.isSafeInteger(count)||count<1)return false;s.likes=cleanLikes(s.likes);s.likes.total=Math.min(LIKE_CAP,s.likes.total+count);s.likes.carry=Math.min(LIKE_CAP,s.likes.carry+count);return true;}
function takeLikeAwards(s,step,maxAwards){if(!Number.isSafeInteger(step)||step<1||maxAwards!==undefined&&(!Number.isSafeInteger(maxAwards)||maxAwards<0))return 0;s.likes=cleanLikes(s.likes);const due=Math.min(Math.floor(s.likes.carry/step),maxAwards===undefined?Number.MAX_SAFE_INTEGER:maxAwards);s.likes.carry-=due*step;return due;}
function redeemLikes(s,step,per,maxAwards=10000){
 if(!Number.isSafeInteger(step)||step<1||!valid(per,10000)||per<1||!valid(maxAwards,10000))return 0;
 const likes=cleanLikes(s.likes),due=Math.min(Math.floor(likes.carry/step),Math.floor(availableSlots(s)/per),maxAwards);
 if(!due)return 0;
 const added=add(s,due*per);
 // Commit the full award and its carry before any renderer or persistence callbacks.
 s.likes={total:likes.total,carry:likes.carry-(added/per)*step};return added;
}
const api={validIndividualScale,enqueueBox,BOX_TIMES,startBox,upgradeCurrentBox,MAX_COW_KIND,FIRST_AVATAR_KIND,MAX_AVATAR_KIND,FIRST_NATIVE_EXTENSION,validKind,validAvatarKind,validAnimalKind,LIKE_CAP,cleanLikes,cleanLikeReceipts,addLikes,takeLikeAwards,redeemLikes,effectRuleValue,restoreInteractions,interactionState,queueWind,advanceWind,banWind,startChallenge,settleChallenge,COUNTS,MAX_VISIBLE,planPopulation,rebalancePopulation,DEFAULT_TIMES,defaultTiers,validateTiers,makeTimeline,makeAssetGate,stepRoam,ballPath,stepBall,stepHop,resetHop,penGeometry,movePen,resizePen,moveHud,hudGeometry,resizeHud,pickOne,cleanHistory,burst,extendTornado,availableSlots,receiveGift,phaseAt,fresh,safeAvatarUrl,registerAvatar,enqueue,start,add,resolve,collect,collectPending,finish,restore};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.CowCore=api;
})(typeof window==='undefined'?globalThis:window);
