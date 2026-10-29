import {startRent,advanceRent,rentView,newRentSession} from './model.js';

const HOUR=3600000,MAX_TICK=5000;
const active=r=>r.started||r.overtimeSeconds>0||r.transactions.length>0;
const interval=settings=>Math.max(1,(settings.minutes||10)*60000);

// The game clock only supplies short business increments. Wall time detects
// sleeping/closed sessions; an explicit debug advance bypasses that increment cap.
export function createRentController({getStats,setStats,getSettings,now=Date.now,wallNow=Date.now,getQueueCount=()=>1,
 onCharges=()=>{},onChange=()=>{},getRoute=()=>'baiyao',onAutoClose=()=>{},onSessionEnd=()=>{},onGap=()=>{},setTimer=setTimeout,clearTimer=clearTimeout}){
 let running=false,mark=now(),wallMark=wallNow(),timer=null,stopped=false,inTick=false,endSerial=0;
 const cancel=()=>{if(timer!==null)clearTimer(timer);timer=null;};
 const publish=()=>onChange(rentView(getStats(),getSettings()));
 const patch=values=>setStats({...getStats(),rent:{...getStats().rent,...values}});
 function close(reason,atWall=wallNow(),gapMs=0){
  running=false;
  patch({closedAt:getStats().rent.closedAt??atWall,idleOpenMs:0,lastSeenAt:wallNow()});
  onAutoClose(reason,{gapMs});
 }
 function end(reason,gapMs=0){
  endSerial++;running=false;setStats(newRentSession(getStats(),getSettings(),wallNow()));onSessionEnd(reason,{gapMs});
 }
 function schedule(){
  cancel();if(stopped)return;const r=getStats().rent;if(!active(r))return;
  let wait;
  if(running&&r.started){
   const view=rentView(getStats(),getSettings());
   wait=getSettings().enabled?Math.min(1000,Math.max(1,view.remainingMs)):1000;
  }else{
   const closedAt=r.closedAt??r.lastSeenAt??wallNow();
   wait=Math.max(1,HOUR-Math.max(0,wallNow()-closedAt));
  }
  timer=setTimer(()=>{timer=null;tick();},Math.min(2147483647,wait));
 }
 function business(delta){
  if(stopped||!running||!getStats().rent.started||delta<=0)return;
  const r=getStats().rent,empty=getQueueCount()<=0;
  const remaining=empty?Math.max(0,interval(getSettings())-(r.idleOpenMs||0)):Infinity;
  const used=Math.min(delta,remaining),result=advanceRent(getStats(),used,getSettings(),{running:true,route:getRoute()});
  const idleOpenMs=empty?(r.idleOpenMs||0)+used:0;
  setStats({...result.stats,rent:{...result.stats.rent,idleOpenMs,lastSeenAt:wallNow(),closedAt:null}});
  if(result.charges.length)onCharges(result.charges);
  if(empty&&used>=remaining)close('empty');
 }
 function tick(){
  if(inTick)return;inTick=true;
  try{
   const current=now(),wall=wallNow(),delta=Math.max(0,current-mark),wallGap=Math.max(0,wall-wallMark);mark=current;wallMark=wall;
   if(!stopped){
    const r=getStats().rent;
    if(running&&active(r)&&(delta>MAX_TICK||wallGap>MAX_TICK)){
     const since=r.lastSeenAt??Math.max(0,wall-wallGap),gapMs=Math.max(delta,wallGap);
     if(wall-since>=HOUR)end('expired',gapMs);
     else{
      // A brief stall/sleep discards that interval, but is not a shop-close.
      // The caller can rewind the shared visual clock in onGap; re-read it
      // before the next heartbeat so business resumes immediately.
      onGap({gapMs,gameGapMs:delta,wallGapMs:wallGap});mark=now();wallMark=wall;
      patch({lastSeenAt:wall,closedAt:null});
     }
    }else if(running)business(delta);
    const state=getStats().rent;
    if(!running&&active(state)){
     const closedAt=state.closedAt??state.lastSeenAt??wall;
     if(wall-closedAt>=HOUR)end('expired',Math.max(delta,wallGap));
     else patch({closedAt,lastSeenAt:wall});
    }else if(active(state))patch({lastSeenAt:wall});
   }
   publish();schedule();
  }finally{inTick=false;}
 }
 return {
  tick,
  setRunning(value,{start=false}={}){
   const before=endSerial;tick();const wall=wallNow();
   if(endSerial!==before&&!start)value=false;
   if(start){const stats=startRent(getStats(),getSettings());if(stats!==getStats())setStats(stats);}
   running=Boolean(value);stopped=false;mark=now();wallMark=wall;
   if(active(getStats().rent))patch({lastSeenAt:wall,closedAt:running?null:getStats().rent.closedAt??wall,idleOpenMs:0});
   publish();schedule();
  },
  advance(ms){
   tick();if(!Number.isFinite(ms)||ms<0)return;
   business(ms);mark=now()+ms;wallMark=wallNow();publish();schedule();
  },
  newSession(){cancel();end('manual');mark=now();wallMark=wallNow();publish();schedule();},
  refresh(){tick();},
  rebase(){mark=now();wallMark=wallNow();publish();schedule();},
  stop(){tick();stopped=true;running=false;if(active(getStats().rent))patch({closedAt:getStats().rent.closedAt??wallNow(),lastSeenAt:wallNow()});cancel();},
  snapshot:()=>({running,scheduled:timer!==null,closedAt:getStats().rent.closedAt,lastSeenAt:getStats().rent.lastSeenAt,idleOpenMs:getStats().rent.idleOpenMs,...rentView(getStats(),getSettings())})
 };
}
