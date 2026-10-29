import {safeName} from '../text.js';

export const EVENT_KINDS=Object.freeze(['fire','thief','blackout','cat','tour','boom','spice']);
export const FEEDBACK_KINDS=Object.freeze([...EVENT_KINDS,'helper','guard','extinguish','bonk','restorePower','removeCat','wipe','block','refund','serve','stolen','burnt']);
const MAX=Number.MAX_SAFE_INTEGER;
const count=value=>typeof value==='number'&&Number.isFinite(value)&&value>0?Math.min(MAX,Math.floor(value)):0;
const plus=(a,b)=>Math.min(MAX,a+b);
const money=n=>Number(n.toFixed(2));
const positive=(n,fallback)=>typeof n==='number'&&Number.isFinite(n)&&n>0?n:fallback;
const config=ctx=>{
 const c=ctx.config||{},ms=(v,d)=>Math.max(1,positive(v,d)*1000);
 return{fireMs:ms(c.fireSeconds,8),thiefMs:ms(c.thiefSeconds,6),blackoutMs:ms(c.blackoutSeconds,20),catMs:ms(c.catSeconds,4),helperMs:ms(c.helperInterval,.9),bannerMs:ms(c.bannerSeconds,2.4),tourSize:count(c.tourSize)||10,
  stealFraction:typeof c.stealFraction==='number'&&Number.isFinite(c.stealFraction)?Math.max(0,Math.min(1,c.stealFraction)):.3};
};
const map=make=>Object.fromEntries(EVENT_KINDS.map(k=>[k,make()]));
export function createEventState(){return{nextId:1,active:map(()=>null),queues:map(()=>[]),
 guard:{credits:0,nick:'观众',packs:[]},helper:{credits:0,nick:'观众',packs:[],nextAt:null},wanted:[],effects:[]};}

function work(s,c){return EVENT_KINDS.find(k=>s.active[k]&&['fire','thief','blackout','cat','spice','boom'].includes(k)&&(k!=='spice'||!c.pendingDish))||Boolean(c.orderKey);}
function spiceReady(c){return(c.hasDish??c.dishCount>0)&&!c.pendingDish;}
function queuedReady(s,c){return EVENT_KINDS.some(k=>!s.active[k]&&s.queues[k].length&&(k!=='spice'||spiceReady(c)));}
function needsTick(s,now,c){
 if(s.effects.some(e=>e.until<=now)||queuedReady(s,c))return true;
 const a=s.active;
 if(a.fire&&!a.fire.burnt&&a.fire.burnAt<=now||a.thief&&a.thief.dueAt<=now||a.blackout&&a.blackout.until<=now||a.cat&&(c.catHeld||a.cat.held||a.cat.nextEatAt<=now)||a.tour&&(!a.tour.unloaded&&a.tour.unloadAt<=now||a.tour.until<=now))return true;
 return s.helper.credits>0&&(s.helper.nextAt===null?Boolean(work(s,c)):s.helper.nextAt<=now||!work(s,c));
}

/** No storage, DOM or real clocks. Counts stay compressed until effects start. */
export function reduceEvents(previous,action,now=0,context={}){
 const type=action?.type;
 if(!Number.isFinite(now))return{state:previous,commands:[]};
 if(type==='reset')return{state:createEventState(),commands:[]};
 if(type==='tick'&&!needsTick(previous,now,context))return{state:previous,commands:[]};
 const s=structuredClone(previous),c={...context},cfg=config(c),commands=[];let changed=false;
 const id=prefix=>prefix+'-'+s.nextId++;
 const cmd=(type,fields={})=>{commands.push({type,...fields});changed=true;};
 function feedback(kind,nick,text,fields={}){
  const effect={id:id('feedback'),kind,nick:safeName(nick),text,startAt:now,until:now+cfg.bannerMs,...fields};
  s.effects.push(effect);cmd('feedback',{...effect});
 }
 function credit(who,amount,nick){
  who.packs.push({count:amount,nick});who.credits=plus(who.credits,amount);who.nick=who.packs[0].nick;changed=true;
 }
 function spend(who,amount){
  let left=amount;
  while(left>0&&who.packs.length){const p=who.packs[0],n=Math.min(left,p.count);p.count-=n;left-=n;if(!p.count)who.packs.shift();}
  who.credits=Math.max(0,who.credits-amount);if(who.packs.length)who.nick=who.packs[0].nick;changed=true;
 }
 function finish(kind){s.active[kind]=null;changed=true;}
 function startOne(kind){
  const pack=s.queues[kind][0];if(!pack)return;
  const spec={...pack},nick=spec.nick;pack.count--;if(!pack.count)s.queues[kind].shift();
  const object={id:id('event'),nick,uid:spec.uid,source:spec.source,startAt:now};
  if(kind==='fire'){
   const heat=spec.source==='heat';object.startAt=heat&&Number.isFinite(spec.heatStartedAt)?Math.min(now,spec.heatStartedAt):now;
   Object.assign(object,{burnAt:object.startAt+cfg.fireMs,burnt:Boolean(heat&&(spec.burnt||now>=object.startAt+cfg.fireMs))});
   if(!heat)cmd('igniteKitchen',{id:object.id,nick});
   else if(object.burnt)cmd('burnKitchen',{id:object.id,nick});
  }
  if(kind==='thief')Object.assign(object,{dueAt:now+cfg.thiefMs,hits:0,stealFraction:cfg.stealFraction});
  if(kind==='blackout')object.until=now+cfg.blackoutMs;
  if(kind==='cat')Object.assign(object,{nextEatAt:now+cfg.catMs,intervalMs:cfg.catMs,held:false,lastEatAt:null});
  if(kind==='tour')Object.assign(object,{unloadAt:now+1200,until:now+2400,unloaded:false,count:cfg.tourSize});
  if(kind==='boom')Object.assign(object,{remaining:8,shop:c.shop||'noodle'});
  if(kind==='spice'){Object.assign(object,{until:now+2400,applied:true});cmd('spiceFood',{id:object.id,nick});}
  s.active[kind]=object;changed=true;
  const texts={fire:'灶上起火了！',thief:'小偷混进来啦',blackout:'停电了！',cat:'野猫来偷吃',tour:'旅行团来啦',boom:'嘭！快擦脸',spice:'成品被乱加料了'};
  feedback(kind,nick,texts[kind]);
 }
 function pump(){for(const kind of EVENT_KINDS)if(!s.active[kind]&&s.queues[kind].length&&(kind!=='spice'||spiceReady(c)))startOne(kind);}
 function resolve(kind,feedbackKind,actorName){
  const a=s.active[kind];if(!a)return false;
  if(kind==='fire')cmd('repairKitchen',{id:a.id,nick:a.nick});
  if(kind==='spice'){cmd('discardFood',{id:a.id,nick:a.nick});c.dishCount=0;c.hasDish=false;}
  finish(kind);feedback(feedbackKind,actorName??a.nick,({extinguish:'火灭了，可以重做',bonk:'小偷被敲晕了',restorePower:'来电啦！',removeCat:'野猫被拎走了',wipe:'脸擦干净啦',spice:'坏菜已倒掉'})[feedbackKind]||'救场完成');return true;
 }
 const matching=kind=>s.active[kind]&&(!action.id||action.id===s.active[kind].id);
 if(type==='enqueue'){
  const spec=action.spec||{},amount=count(spec.count??1),kind=spec.kind;
  if(amount&&(EVENT_KINDS.includes(kind)||kind==='helper'||kind==='guard')){
   const nick=safeName(spec.nick);
   if(kind==='guard'){
    if(s.wanted.length){const wanted=s.wanted.shift();cmd('refund',{amount:wanted.amount,nick:wanted.nick,id:wanted.id});feedback('refund',nick,`追回 ${wanted.amount} 铜板`);}
    credit(s.guard,amount,nick);feedback('guard',nick,'保安到场！',{count:amount});
   }else if(kind==='helper'){credit(s.helper,amount,nick);feedback('helper',nick,'帮手来啦！',{count:amount});}
   else{
    const blocked=spec.source==='heat'?0:Math.min(amount,s.guard.credits),remaining=amount-blocked;
    if(blocked){const guardName=s.guard.nick;spend(s.guard,blocked);feedback('block',guardName,`挡下 ${blocked} 次捣乱`,{count:blocked});}
    if(remaining){
     if(kind==='spice'&&(!spiceReady(c)||s.active.spice))feedback('spice',nick,'盯上了下一份菜！',{count:remaining});
     const queue=s.queues[kind],p={count:remaining,nick,uid:String(spec.uid||''),source:String(spec.source||'sim'),id:String(spec.id||''),...(Number.isFinite(spec.heatStartedAt)?{heatStartedAt:spec.heatStartedAt}:{}),...(spec.burnt?{burnt:true}:{})};
     const last=queue.at(-1);if(last&&last.nick===p.nick&&last.uid===p.uid&&last.source===p.source&&last.id===p.id&&last.heatStartedAt===p.heatStartedAt&&last.burnt===p.burnt)last.count=plus(last.count,remaining);else queue.push(p);changed=true;}
   }
  }
 }else if(type==='bonk'&&matching('thief')){
  const a=s.active.thief;a.hits++;changed=true;feedback('bonk',a.nick,`敲到小偷 ${a.hits}/3`);if(a.hits>=3)finish('thief');
 }else if(type==='extinguish'&&matching('fire'))resolve('fire','extinguish');
 else if(type==='restorePower'&&matching('blackout'))resolve('blackout','restorePower');
 else if(type==='removeCat'&&matching('cat'))resolve('cat','removeCat');
 else if(type==='wipe'&&matching('boom')){
  const amount=positive(action.amount,1),a=s.active.boom;a.remaining=Math.max(0,a.remaining-amount);changed=true;
  if(!a.remaining){finish('boom');feedback('wipe',a.nick,'脸擦干净啦！');}
 }else if(type==='clearSpice'&&matching('spice'))finish('spice');

 // Expired feedback cannot keep the renderer alive. Persistent objects remain.
 const effects=s.effects.filter(e=>e.until>now);if(effects.length!==s.effects.length){s.effects=effects;changed=true;}
 pump();
 // Rescue before same-instant deadlines. Each reducer call performs one helper
 // job, so a fast-forward never emits duplicate serves for one stale orderKey.
 if(s.helper.credits>0){
  const hasWork=work(s,c);
  if(!hasWork){if(s.helper.nextAt!==null){s.helper.nextAt=null;changed=true;}}
  else if(s.helper.nextAt===null){s.helper.nextAt=now+cfg.helperMs;changed=true;}
  else if(now>=s.helper.nextAt){
   const nick=s.helper.nick;
   if(s.active.fire)resolve('fire','extinguish',nick);
   else if(s.active.thief)resolve('thief','bonk',nick);
   else if(s.active.blackout)resolve('blackout','restorePower',nick);
   else if(s.active.cat)resolve('cat','removeCat',nick);
   else if(s.active.spice&&!c.pendingDish)resolve('spice','spice',nick);
   else if(s.active.boom)resolve('boom','wipe',nick);
   else if(c.orderKey){cmd('serve',{orderKey:c.orderKey,nick});feedback('serve',nick,'帮手上菜！');}
   spend(s.helper,1);s.helper.nextAt=s.helper.credits>0&&work(s,c)?now+cfg.helperMs:null;changed=true;
  }
 }
 const a=s.active;
 if(a.fire&&!a.fire.burnt&&now>=a.fire.burnAt){a.fire.burnt=true;cmd('burnKitchen',{id:a.fire.id,nick:a.fire.nick});feedback('burnt',a.fire.nick,'烧坏了，先灭火再重做');}
 if(a.thief&&now>=a.thief.dueAt){const thief=a.thief,amount=money(Math.max(0,Number.isFinite(c.coins)?c.coins:0)*thief.stealFraction);s.wanted.push({id:thief.id,nick:thief.nick,amount});cmd('steal',{amount,nick:thief.nick,id:thief.id});finish('thief');feedback('stolen',thief.nick,`卷走 ${amount} 铜板`);}
 if(a.blackout&&now>=a.blackout.until)resolve('blackout','restorePower');
 if(a.cat){
  if(c.catHeld){a.cat.held=true;a.cat.nextEatAt=now+a.cat.intervalMs;changed=true;}
  else if(a.cat.held){a.cat.held=false;a.cat.nextEatAt=now+a.cat.intervalMs;changed=true;}
  else if(now>=a.cat.nextEatAt){const meals=Math.floor((now-a.cat.nextEatAt)/a.cat.intervalMs)+1;a.cat.nextEatAt+=meals*a.cat.intervalMs;a.cat.lastEatAt=now;cmd('eatFood',{count:meals,id:a.cat.id,nick:a.cat.nick});}
 }
 if(a.tour){
  if(!a.tour.unloaded&&now>=a.tour.unloadAt){a.tour.unloaded=true;cmd('addTour',{count:a.tour.count,nick:a.tour.nick,id:a.tour.id});}
  if(now>=a.tour.until)finish('tour');
 }
 pump();
 return{state:changed?s:previous,commands};
}

export function nextEventAt(state,now=0,context={}){
 const times=state.effects.map(e=>e.until),a=state.active;
 if(a.fire&&!a.fire.burnt)times.push(a.fire.burnAt);
 if(a.thief)times.push(a.thief.dueAt);if(a.blackout)times.push(a.blackout.until);if(a.cat)times.push(a.cat.nextEatAt);
 if(a.tour){if(!a.tour.unloaded)times.push(a.tour.unloadAt);times.push(a.tour.until);}
 if(state.helper.credits>0&&state.helper.nextAt!==null)times.push(state.helper.nextAt);
 const future=times.filter(t=>Number.isFinite(t)&&t>now);return future.length?Math.min(...future):null;
}
