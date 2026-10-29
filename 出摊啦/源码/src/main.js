import {defaultSettings,loadSettings,saveSettings,sanitizeSettings} from './settings.js';
import {defaultStats,loadStats,saveStats} from './stats.js';
import {defaultZone} from './zone.js';
import {SettingsUI} from './ui/settings-ui.js';
import {createZoneEditor} from './ui/zone-editor.js';
import {createControlVisibility} from './ui/visibility.js';
import {Live} from './live.js';
import {createInbox} from './inbox.js';
import {createEventId} from './rules.js';
import {CrowdScene,counterRect} from './crowd/renderer.js';
import {rectIntersectsZone} from './crowd/layout.js';
import {moodAt} from './crowd/behavior.js';
import {createKitchen,reduceKitchen,kitchenDishCount,kitchenHasDish} from './cooking/kitchen.js';
import {settle} from './cooking/settle.js';
import {rollNewSpoilages} from './cooking/spoilage.js';
import {collectAbandoned} from './crowd/departures.js';
import {CookingScene} from './cooking/scene.js';
import {createRentController} from './rent/controller.js';
import {rentView,addOvertime,resetCounters,applyAbandonmentPenalty,getPendingOvertime,markOvertimeSent} from './rent/model.js';
import {RentScene} from './rent/scene.js';
import {createEventState,reduceEvents} from './events/model.js';
import {EventScene} from './events/scene.js';
import {createAudio} from './audio.js';
import {loadExtras,saveExtras,sanitizeExtras} from './extras.js';
import {makeMovable,boardRect,onFace} from './ui/movable.js';
import './baiyao-overtime-client.cjs'; // 白曜加班机连接库（和白曜重工 docs/plugin-kit 里的那份一样），挂在 globalThis.BaiyaoOvertimeClient
import './local-overtime.cjs'; // V1.6 插件自带的加班机（和俄罗斯方块、萌宠消消乐同一份），挂在 globalThis.LocalOvertime

let storage;try{storage=localStorage;}catch{}
const loaded=loadSettings(storage),loadedStats=loadStats(storage);
let settings=loaded.settings||defaultSettings(),stats=loadedStats.stats||defaultStats();
let extras=loadExtras(storage).extras;
function applyExtras(next){extras=sanitizeExtras(next);if(!saveExtras(storage,extras))notify('设置暂未保存：浏览器不允许存储');rentScene?.resize();placeBoards();updateRentView();}
let open=false,preview=null,noticeTimer,scene,cookingScene,kitchen,pendingReceipt=null,generation=0,batching=false,simSerial=0;
let rentController,rentScene,ui,statsStorageWarned=false;
let eventState=createEventState(),eventScene,pendingTours=[],tourSerial=0,lastHeatReported=null,lastWorldWall=Date.now(),advancingEvents=false;
const audio=createAudio(()=>settings.audio);
const stage=document.querySelector('#stage'),trial=document.documentElement.dataset.trial==='true';
const count=trial?Object.assign(document.createElement('div'),{id:'count',className:'badge'}):null;
if(count)document.body.append(count);
const outside=document.querySelector('#crowd-outside');
const countText=count?count.appendChild(document.createElement('span')):null,outsideText=outside?outside.appendChild(document.createElement('span')):null;
/* V1.3：画面上的牌子按住拖动换位置、拖右下角改大小；位置按画面比例存在 extras.boards。 */
function placeDomBoard(node,board){
 const r=boardRect(board,{width:node.offsetWidth,height:node.offsetHeight},{width:innerWidth,height:innerHeight});
 if(r.x===null)Object.assign(node.style,{left:'',top:'',right:'',bottom:''});else Object.assign(node.style,{left:r.x+'px',top:r.y+'px',right:'auto',bottom:'auto'});
 node.style.transformOrigin='0 0';node.style.transform=r.scale===1?'':`scale(${r.scale})`;
}
function placeBoards(){if(count)placeDomBoard(count,extras.boards.count);if(outside)placeDomBoard(outside,extras.boards.outside);eventScene?.sync();}
function setupBoard(node,id){
 if(!node)return;node.dataset.board=id;
 makeMovable(node,{getRect:()=>{const r=node.getBoundingClientRect();return{rect:{x:r.left,y:r.top,width:r.width,height:r.height},scale:extras.boards[id]?.scale??1};},
  preview:next=>placeDomBoard(node,next||extras.boards[id]),commit:next=>applyExtras({...extras,boards:{...extras.boards,[id]:next}}),
  blocked:next=>{const viewport={width:innerWidth,height:innerHeight},r=boardRect(next,{width:node.offsetWidth,height:node.offsetHeight},viewport);return onFace(r,activeZone(),viewport);},
  onBlocked:()=>notify('牌子不能放在脸上，已放回原处')});
 placeDomBoard(node,extras.boards[id]);
}
setupBoard(count,'count');setupBoard(outside,'outside');
const inbox=createInbox(()=>settings,{now:()=>scene?scene.now():Date.now()});
const names={noodle:'面馆',sushi:'日料店',pancake:'煎饼摊',tea:'奶茶店'};
function activeZone(){return preview||(settings.display.zone.auto?{...settings.display.zone,pts:defaultZone(innerWidth/innerHeight).pts}:settings.display.zone);}
function notify(text){
 const n=document.querySelector('#notice'),u=Math.min(innerWidth,innerHeight)/1080;
 n.textContent=text;n.hidden=false;n.style.maxWidth=Math.min(innerWidth*.85,630*u)+'px';
 const measured=n.getBoundingClientRect(),w=measured.width,h=measured.height,z=activeZone();
 const candidates=[[innerWidth/2,16*u],[12*u+w/2,16*u],[innerWidth-12*u-w/2,16*u],[innerWidth/2,innerHeight-h-16*u]];
 let placed;
 for(const[cx,y]of candidates){const r={x:Math.max(4,Math.min(innerWidth-w-4,cx-w/2)),y:Math.max(4,y),width:w,height:h};if(!rectIntersectsZone(r,z,innerWidth,innerHeight,4*u)){placed=r;break;}}
 placed||={x:(innerWidth-w)/2,y:16*u,width:w,height:h};n.style.left=placed.x+w/2+'px';n.style.top=placed.y+'px';
 clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>n.hidden=true,2400);
}
function kitchenOptions(){const c=settings.cooking,h=c.heat[settings.shop]||c.heat.noodle,ms=s=>Math.min(Number.MAX_SAFE_INTEGER,Math.max(1,Math.round(s*1000)));return{capacity:c.capacity,fishPieces:c.fishPieces,cookMs:ms(h.cookSeconds),readyMs:ms(h.readySeconds),smokeMs:ms(h.smokeSeconds),fireMs:ms(settings.sabotage.fireSeconds)};}
function freshKitchen(){return createKitchen(settings.shop,kitchenOptions());}
function replaceKitchen(next){
 const old=kitchen;if(next===old)return false;kitchen=next;
 for(const result of rollNewSpoilages(old,next,settings.cooking)){
  if(result.coins)persistStats({...stats,coins:Number((stats.coins+result.coins).toFixed(2))});
  if(result.message)cookingScene?.announceSpoilage(result);
  updateRentView();updateHud();
 }
 return true;
}
function persistStats(next){
 stats=next;const ok=saveStats(storage,stats);
 if(!ok&&!statsStorageWarned){statsStorageWarned=true;notify('铜板和交租进度暂未保存：浏览器不允许存储');}else if(ok)statsStorageWarned=false;
 return ok;
}
function updateRentView(){rentScene?.sync(rentView(stats,settings.rent),settings.rent,{open});if(stats.rent.started)localOvertime.autoStart();refreshOvertimeClock();}
/* V1.5 加班都送去白曜加班机：交租差额和「加班」动作先记进账本（待发），这里负责送；送到了标已送，刷新也不重发。
 * 在白曜里直接送；不在白曜里要填白曜给的连接码（设置③）。上屏的字只写「加班机」，不带名字。 */
const overtimeLink=globalThis.BaiyaoOvertimeClient.createBaiyaoOvertime({plugin:'出摊啦',
 getPending:()=>getPendingOvertime(stats).map(t=>({id:t.id,seconds:t.seconds,label:t.source==='rent'?'交租差额':'加班',user:t.user||''})),
 onSent:id=>{persistStats(markOvertimeSent(stats,id,{at:Date.now()}));updateRentView();ui?.refreshOvertime();},
 onStatus:()=>ui?.refreshOvertime()});
/* V1.6 加班记到哪：auto（默认）= 在白曜里、或者填了连接码 → 白曜加班机，不然 → 插件自带的加班机；local / baiyao 固定。
 * 记到自带的：账本里记成已处理（route local，不送），倒计时在 localOvertime 里加；礼物加减时间表也只在这时生效。
 * 设置单独存一个键，旧版存设置不会把它冲掉。 */
const OVERTIME_KEY='chutan.v1_6.overtime',TARGETS=['auto','local','baiyao'];
const overtimePrefs=(()=>{try{const v=JSON.parse(storage?.getItem(OVERTIME_KEY)||'{}')||{};return {target:TARGETS.includes(v.target)?v.target:'auto'};}catch{return {target:'auto'};}})();
const localOvertime=globalThis.LocalOvertime.createLocalOvertime({key:'chutan.v1_6.local-overtime',storage});
function overtimeRoute(){const t=overtimePrefs.target;if(t!=='auto')return t;const s=overtimeLink.snapshot();return s.mode==='baiyao'||s.keyValid?'baiyao':'local';}
function setOvertimeTarget(value){if(!TARGETS.includes(value))return false;overtimePrefs.target=value;try{storage?.setItem(OVERTIME_KEY,JSON.stringify(overtimePrefs));}catch{}refreshOvertimeClock();ui?.refreshOvertime();return true;}
/* 交租牌上面的「距离下播」：只在记到自带加班机、并且勾了「画面上显示」时出现 */
function refreshOvertimeClock(){
 const l=localOvertime.snapshot(),visible=overtimeRoute()==='local'&&l.show,done=l.finished&&!l.fresh;
 rentScene?.setClock({visible,label:done?'下播时间到':'距离下播',time:l.clockText,net:l.netSeconds?l.netText:'',done});
}
localOvertime.subscribe((snapshot,event)=>{refreshOvertimeClock();if(event?.seconds&&overtimeRoute()==='local')rentScene?.flashClock(event.seconds,globalThis.LocalOvertime.spokenDuration(event.seconds));ui?.refreshOvertime();});
setInterval(()=>{refreshOvertimeClock();ui?.refreshOvertimeClock?.();},1000);
const overtimeNote=()=>overtimeRoute()==='local'||overtimeLink.snapshot().state==='ready'?'加到加班机':'先记下，连上加班机再加';
function advanceGame(ms){rentController?.advance(ms);scene.advance(ms);advanceEvents();cookingScene?.invalidate();eventScene?.sync();updateHud();}
function resetEvents(){eventState=createEventState();pendingTours=[];lastHeatReported=null;eventScene?.reset();audio.stop();}
function endSession(){
 open=false;generation++;pendingReceipt=null;inbox.orders.length=0;inbox.events.length=0;
 resetEvents();kitchen=freshKitchen();cookingScene?.reset();rentScene?.reset();scene?.clearDepartures();scene?.sync();updateHud();
}
function skipGameGap({gameGapMs=0}={}){if(scene&&gameGapMs>0)scene.clockOffset-=gameGapMs;updateRentView();}
function autoCloseSession(){open=false;updateRentView();updateHud();}
function fastForwardRent(){
 if(!open||!stats.rent.started||!settings.rent.enabled){notify('先点单开店，并开启交租，再快进');return false;}
 rentController.tick();advanceGame(rentView(stats,settings.rent).remainingMs);return true;
}
function updateHud(){
 document.querySelector('#status').textContent=names[settings.shop]+' · '+(open?'营业中':'准备开店');
 document.querySelector('#open-button').textContent=open?'打烊':'开店';
 const state=scene?.snapshot();if(countText)countText.textContent='待出 '+inbox.orders.length+' 单'+(state?' · 店内 '+state.visibleCount+' 人':'')+' · 已出 '+stats.served+' 单 · 跑单 '+stats.abandoned;
 if(outside){const n=state?.outsideCount||0,wasHidden=outside.hidden;outside.hidden=n===0;outsideText.textContent='门外还有 '+n+' 人';if(wasHidden&&n)placeDomBoard(outside,extras.boards.outside);}
 if(trial&&parent!==window)parent.postMessage({channel:'chutan-state-v1',queueCount:inbox.orders.length,eventsCount:inbox.events.length,served:stats.served,coins:stats.coins},'*');
}
function trigger(spec){
 if(spec?.kind==='rent')return fastForwardRent();
 if(!batching)rentController?.tick();
 if(!batching)processDepartures();
 const ok=inbox.accept(spec);if(!ok)return false;
 if(spec.kind==='order'&&inbox.orders.length){const start=!stats.rent.started||!open;open=true;if(start)rentController?.setRunning(true,{start:true});}
 if(spec.kind==='overtime'){
  const inputId=String(spec.id??'').trim();
  const route=overtimeRoute();
  const result=addOvertime(stats,spec.count*60,{id:inputId?'overtime:'+JSON.stringify([stats.rent.sessionId,spec.source||'action',inputId]):undefined,source:'action',user:settings.display.names?spec.nick:'',route});
  if(result.transaction){persistStats(result.stats);if(route==='local')localOvertime.shift(result.transaction.seconds,'加班');rentScene?.announceOvertime(result.transaction.seconds,{note:overtimeNote()});updateRentView();overtimeLink.flush();}
 }
 if(['fire','thief','blackout','cat','tour','boom','spice','helper','guard'].includes(spec.kind))dispatchEvent({type:'enqueue',spec});
 scene?.sync();if(!batching){eventScene?.sync();updateHud();}return true;
}
// 礼物加减时间表：只在记到插件自带的加班机时生效（用白曜加班机时礼物在白曜里配，免得加两遍）
const live=new Live(trigger,()=>settings,globalThis,()=>ui?.refreshLive(),{fallback:!trial,onGiftEvent:event=>overtimeRoute()==='local'?localOvertime.applyGift({name:event.gift.name,count:event.gift.count}):0});
function performAction(action){
 if(!kitchen)return false;const next=reduceKitchen(kitchen,action,scene.now());
 if(!replaceKitchen(next))return false;
 if(action.type==='clearDish')dispatchEvent({type:'clearSpice'});
 cookingScene?.sync();eventScene?.sync();return true;
}
function checkLongGap(){const wall=Date.now();if(wall-lastWorldWall>5000)rentController?.tick();lastWorldWall=wall;}
let processingDepartures=false;
function processDepartures(){
 if(!scene||processingDepartures||!settings.order.abandon.enabled)return;
 processingDepartures=true;
 try{
  checkLongGap();const due=collectAbandoned(inbox.orders,settings,scene.now());if(!due.length)return;
  scene.announceDepartures(due);
  const keys=new Set(due.map(o=>o.key));for(let i=inbox.orders.length-1;i>=0;i--)if(keys.has(inbox.orders[i].key))inbox.orders.splice(i,1);
  persistStats(applyAbandonmentPenalty(stats,due.length,settings.order.abandon));
  const amount=Number((due.length*settings.order.abandon.amount).toFixed(2));
  notify(due.length+' 人等急了走了 · '+(settings.order.abandon.penalty==='rent'?'下次交租 +':'−')+amount+' 铜板');
  scene.sync();cookingScene?.sync();eventScene?.sync();updateRentView();updateHud();
 }finally{processingDepartures=false;}
}
function advanceKitchen(){
 checkLongGap();if(!kitchen)return;
 const old=kitchen;replaceKitchen(reduceKitchen(kitchen,{type:'tick'},scene.now()));
 if(old!==kitchen)eventScene?.sync();
 const pot=kitchen.pot;
 if(pot.fireSource==='heat'&&pot.fireStartedAt!==null&&pot.fireStartedAt!==lastHeatReported){
  lastHeatReported=pot.fireStartedAt;dispatchEvent({type:'enqueue',spec:{kind:'fire',count:1,nick:'灶台',source:'heat',id:'heat-'+lastHeatReported,heatStartedAt:pot.fireStartedAt,burnt:pot.status==='burnt'}});
 }
}
function eventContext(){
 const order=inbox.orders.find(o=>o.key!==pendingReceipt?.orderKey);
 return{config:settings.sabotage,shop:settings.shop,coins:stats.coins,orderKey:order?.key,hasOrders:Boolean(order),dishCount:kitchen?kitchenDishCount(kitchen):0,hasDish:kitchen?kitchenHasDish(kitchen):false,pendingDish:Boolean(kitchen?.pending),catHeld:eventScene?.drag?.kind==='cat'};
}
function helperServe(key){
 const index=inbox.orders.findIndex(o=>o.key===key&&o.key!==pendingReceipt?.orderKey);if(index<0)return;
 const order=inbox.orders[index],wanted=order.quantities[settings.shop],result=settle({wanted,given:wanted,byHelper:true},settings.cooking);
 persistStats({...stats,coins:Number((stats.coins+result.coins).toFixed(2)),served:stats.served+1});
 const actor=scene.snapshot().actors.find(a=>a.key===key)||{x:innerWidth*.1,y:innerHeight*.6,width:40,height:40};
 inbox.orders.splice(index,1);scene.sync();cookingScene?.sync();cookingScene?.announce({...result,detail:'帮手给足，收全价'},actor);updateHud();
}
function executeEvent(command){
 const type=command.type;
 if(type==='feedback'){audio.play(command.kind);return;}
 if(type==='steal'||type==='refund'){
  persistStats({...stats,coins:Number((stats.coins+(type==='steal'?-1:1)*command.amount).toFixed(2))});cookingScene?.sync();updateHud();return;
 }
 if(type==='addTour'){pendingTours.push({remaining:command.count,nick:command.nick,id:command.id});return;}
 if(type==='serve'){helperServe(command.orderKey);return;}
 const actions={igniteKitchen:'ignite',burnKitchen:'burn',repairKitchen:'repair',eatFood:'eat',spiceFood:'spice',discardFood:'clearDish'};
 if(actions[type]&&kitchen){const wasRuined=kitchen.badDish,next=reduceKitchen(kitchen,{type:actions[type],count:command.count},scene.now());if(replaceKitchen(next)){if(wasRuined&&!kitchen.badDish&&eventState.active.spice)dispatchEvent({type:'clearSpice'});cookingScene?.sync();}}
}
function dispatchEvent(action){
 processDepartures();
 const result=reduceEvents(eventState,action,scene?.now()??Date.now(),eventContext());eventState=result.state;
 for(const command of result.commands)executeEvent(command);
 eventScene?.sync();
}
function admitTourGuests(){
 if(!pendingTours.length)return;let budget=50;batching=true;
 try{while(budget>0&&pendingTours.length){const pack=pendingTours[0],n=Math.min(budget,pack.remaining);
  for(let i=0;i<n;i++)trigger({kind:'order',uid:'tour:'+pack.id+':'+(++tourSerial),nick:pack.nick+'团',id:pack.id+':'+tourSerial,count:1,source:'tour'});
  pack.remaining-=n;budget-=n;if(pack.remaining<=0)pendingTours.shift();
 }}finally{batching=false;updateHud();}
 if(eventState.helper.credits>0&&eventState.helper.nextAt===null)dispatchEvent({type:'tick'});
}
function advanceEvents(){
 if(advancingEvents)return;advancingEvents=true;
 try{advanceKitchen();processDepartures();const result=reduceEvents(eventState,{type:'tick'},scene.now(),eventContext());eventState=result.state;for(const command of result.commands)executeEvent(command);admitTourGuests();}
 finally{advancingEvents=false;}
}
function beginReceipt(actor){
 processDepartures();
 if(!kitchen||kitchen.pending||pendingReceipt)return false;
 const order=inbox.orders.find(o=>o.key===actor.key);if(!order)return false;
 const next=reduceKitchen(kitchen,{type:'takeDish'},scene.now());if(!next.pending)return false;replaceKitchen(next);
 const now=scene.now();pendingReceipt={orderKey:order.key,wanted:order.quantities[settings.shop],given:kitchen.pending.given,
  mood:moodAt(now-order.receivedAt,settings.crowd.moodSeconds),sloppy:kitchen.pending.broken>0,ruined:Boolean(kitchen.pending.ruined),
  pricing:structuredClone(settings.cooking),dish:kitchen.pending,generation,shop:settings.shop,dueAt:now+600,
  cx:(actor.x+actor.width/2)/innerWidth,cy:(actor.y+actor.height/2)/innerHeight,actor};
 cookingScene.sync();return true;
}
function finishReceipt(receipt){
 rentController?.tick();
 processDepartures();
 if(receipt!==pendingReceipt||receipt.generation!==generation||!kitchen||kitchen.pending!==receipt.dish)return;
 if(scene.now()<receipt.dueAt)return;
 const index=inbox.orders.findIndex(o=>o.key===receipt.orderKey);
 if(index<0){replaceKitchen(reduceKitchen(kitchen,{type:'cancelDish',id:receipt.dish.id},scene.now()));pendingReceipt=null;notify('顾客已离开，这份菜留在工作台');cookingScene.sync();return;}
 const result=settle({wanted:receipt.wanted,given:receipt.given,mood:receipt.mood,ruined:receipt.ruined,sloppy:receipt.sloppy},receipt.pricing);
 replaceKitchen(reduceKitchen(kitchen,{type:'completeDish',id:receipt.dish.id},scene.now()));pendingReceipt=null;
 persistStats({...stats,coins:Number((stats.coins+result.coins).toFixed(2)),served:stats.served+1,badReviews:stats.badReviews+(result.caught?1:0)});
 inbox.orders.splice(index,1);
 if(eventState.active.spice)dispatchEvent({type:'clearSpice'});
 const detail=result.excess?'多给 '+result.excess+' 份 −'+result.deduction:result.shortage&&!result.caught?'少给 '+result.shortage+' 份 +'+Number((result.shortage*receipt.pricing.differenceCoins).toFixed(2)):result.reaction;
 scene.sync();cookingScene.announce({...result,detail},receipt.actor);updateHud();
}
const app={get settings(){return settings;},get stats(){return stats;},get extras(){return extras;},live,notify,
 applyExtras(next){applyExtras(next);},
 resetPanel(){applyExtras({...extras,panel:{x:null,y:null,scale:1},boards:{}});},
 applySettings(raw){
  rentController?.tick();const oldShop=settings.shop;settings=sanitizeSettings(raw);
  if(oldShop!==settings.shop){generation++;pendingReceipt=null;kitchen=freshKitchen();lastHeatReported=null;inbox.rerollQuantities(settings.shop);dispatchEvent({type:'clearSpice'});if(kitchen&&eventState.active.fire){kitchen=reduceKitchen(kitchen,{type:'ignite'},eventState.active.fire.startAt);if(eventState.active.fire.burnt)kitchen=reduceKitchen(kitchen,{type:'burn'},scene.now());}cookingScene?.reset();}
  else if(kitchen)kitchen={...kitchen,options:kitchenOptions()};
  if(!saveSettings(storage,settings))notify('设置暂未保存：浏览器不允许存储');live.refresh();if(!settings.audio.enabled)audio.stop();rentController?.refresh();scene?.sync();cookingScene?.sync();eventScene?.sync();updateHud();
 },
 resetStats(){rentController?.tick();if(persistStats(resetCounters(stats)))notify('铜板和出餐统计已清零，交租与加班记录保留');cookingScene?.sync();updateRentView();updateHud();},
 newSession(){rentController.newSession();localOvertime.reset();updateRentView();updateHud();},
 editZone(){ui.close();editor.open();},
 overtime:{route:overtimeRoute,target:()=>overtimePrefs.target,setTarget:setOvertimeTarget,local:localOvertime,snapshot:()=>overtimeLink.snapshot(),describe:()=>overtimeLink.describe(),pendingCount:()=>getPendingOvertime(stats).length,setKey:value=>overtimeLink.setKey(value),normalizeKey:value=>globalThis.BaiyaoOvertimeClient.normalizeKey(value),connect:()=>overtimeLink.start(),test:key=>overtimeLink.test(key===undefined?undefined:{key})}
};
ui=new SettingsUI(app);
const editor=createZoneEditor({getZone:activeZone,setZone:z=>{preview=null;app.applySettings({...settings,display:{...settings.display,zone:z}});},previewZone:z=>{preview=z;scene?.sync();cookingScene?.sync();rentScene?.resize();},onDone:()=>{preview=null;scene?.sync();cookingScene?.sync();rentScene?.resize();}});
scene=new CrowdScene(stage,{getOrders:()=>inbox.orders,getSettings:()=>settings,getZone:activeZone,onChange:updateHud,onTime:processDepartures});
kitchen=freshKitchen();
rentController=createRentController({getStats:()=>stats,setStats:persistStats,getSettings:()=>settings.rent,now:()=>scene.now(),getRoute:overtimeRoute,
 getQueueCount:()=>inbox.orders.length+pendingTours.reduce((n,p)=>n+p.remaining,0),onGap:skipGameGap,onAutoClose:autoCloseSession,onSessionEnd:endSession,
 onChange:updateRentView,onCharges:charges=>{for(const c of charges)if(c.seconds>0&&c.route==='local')localOvertime.shift(c.seconds,'交租差额');rentScene?.announce(charges,{note:charges.some(c=>c.seconds>0)?overtimeNote():''});overtimeLink.flush();cookingScene?.sync();updateHud();}
});
const ready=scene.ready.then(()=>{
 cookingScene=new CookingScene(document.querySelector('#kitchen-stage'),{bank:scene.bank,clock:()=>scene.now(),getKitchen:()=>kitchen,getSettings:()=>settings,getStats:()=>stats,getReceipt:()=>pendingReceipt,getZone:activeZone,getCounter:()=>counterRect(innerWidth,innerHeight),onAction:performAction,onTime:advanceKitchen,onServe:beginReceipt,onDue:finishReceipt,findCustomer:(x,y)=>scene.hitCustomer(x,y),notify});
 rentScene=new RentScene({bank:scene.bank,clock:()=>scene.now(),getCounter:()=>counterRect(innerWidth,innerHeight),getZone:activeZone,getPanel:()=>extras.panel,onPanelChange:panel=>applyExtras({...extras,panel}),onBlocked:()=>notify('牌子不能放在脸上，已放回原处')});updateRentView();
 eventScene=new EventScene({notify,getBoards:()=>extras.boards,saveBoard:(id,board)=>applyExtras({...extras,boards:{...extras.boards,[id]:board}}),bank:scene.bank,clock:()=>scene.now(),getState:()=>eventState,getKitchen:()=>kitchen,getSettings:()=>settings,getZone:activeZone,getCounter:()=>counterRect(innerWidth,innerHeight),getKitchenLayout:()=>cookingScene.layout(),getCrowdActors:()=>scene.snapshot().actors,hasPendingWork:()=>pendingTours.length>0,onTick:advanceEvents,onAction:dispatchEvent});
 return Promise.all([scene.settle(),cookingScene.settle()]);
});
ready.catch(error=>{document.querySelector('#asset-error').hidden=false;document.querySelector('#asset-error').textContent='素材加载失败：'+error.message;});
const controls=createControlVisibility({trial,onChange:visible=>{
 document.documentElement.dataset.controlsVisible=String(visible);
 [document.querySelector('#topbar')].filter(Boolean).forEach(node=>{node.inert=!visible;node.setAttribute('aria-hidden',String(!visible));});
}});
addEventListener('pointermove',controls.move,{passive:true});document.documentElement.addEventListener('pointerleave',controls.leave);addEventListener('blur',controls.leave);
document.addEventListener('pointerdown',()=>audio.unlock(),{passive:true,capture:true});
document.querySelector('#settings-button').onclick=()=>ui.toggle();
document.querySelector('#open-button').onclick=()=>{rentController.tick();open=!open;rentController.setRunning(open);updateHud();};
addEventListener('keydown',e=>{if(/INPUT|TEXTAREA|SELECT/.test(e.target.tagName))return;if(e.key.toLowerCase()==='s')ui.toggle();if(e.key==='Escape'){ui.close();editor.close();cookingScene?.cancelDrag();}});
addEventListener('resize',()=>{scene.resize();cookingScene?.resize();rentScene?.resize();eventScene?.resize();placeBoards();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){rentController.setRunning(false);scene.pause();cookingScene?.pause();rentScene?.pause();eventScene?.pause();audio.stop();}else{scene.resume();cookingScene?.resume();rentScene?.resume();eventScene?.resume();rentController.setRunning(open);}});
addEventListener('pagehide',()=>{live.stop();overtimeLink.stop();controls.stop();rentController.stop();scene.pause();cookingScene?.pause();rentScene?.pause();eventScene?.pause();audio.stop();clearTimeout(noticeTimer);});
addEventListener('pageshow',e=>{if(e.persisted){controls.reset();live.start();overtimeLink.start();scene.resume();scene.resize();cookingScene?.resume();cookingScene?.resize();rentScene?.resume();rentScene?.resize();eventScene?.resume();eventScene?.resize();rentController.setRunning(open);}});
function sim(spec){return spec?.kind==='rent'?trigger({...spec,source:'sim'}):live.sim(spec);}
function addMany(n){const total=Number.isFinite(n)?Math.max(0,Math.floor(n)):0;batching=true;try{for(let i=0;i<total;i++)sim({kind:'order',uid:'trial-'+createEventId(),nick:'顾客'+(++simSerial)});}finally{batching=false;eventScene?.sync();updateHud();}return inbox.orders.length;}
function dismiss(n=5){const removed=inbox.orders.splice(0,Math.max(0,Math.floor(n)));scene.sync();updateHud();return removed.length;}
function clear(){rentController.setRunning(false);inbox.orders.length=0;inbox.events.length=0;scene.clearDepartures();scene.clockOffset=0;rentController.rebase();generation++;pendingReceipt=null;resetEvents();kitchen=freshKitchen();cookingScene?.reset();scene.sync();open=false;updateRentView();updateHud();return settleAll();}
async function settleAll(){await ready;await Promise.all([scene.settle(),cookingScene.settle(),rentScene.settle(),eventScene.settle()]);return scene.snapshot();}
window.chutanDebug={ready,sim,addMany,dismiss,clear,advance:advanceGame,settle:settleAll,layout:()=>scene.layout(),perf:o=>scene.perf(o),probeCounter:()=>scene.requestCounterProof(),live,
 rent:{view:()=>rentController.snapshot(),fastForward:fastForwardRent,tick:()=>rentController.tick(),newSession:()=>app.newSession()},
 overtime:{link:()=>overtimeLink.snapshot(),pending:()=>structuredClone(getPendingOvertime(stats))},
 cooking:{layout:()=>cookingScene?.layout(),state:()=>cookingScene?.snapshot()},
 events:{layout:()=>eventScene?.snapshot().regions,state:()=>structuredClone(eventState),perf:o=>eventScene?.perf(o),tick:advanceEvents},
 state:()=>({extras:structuredClone(extras),queueCount:inbox.orders.length,eventsCount:inbox.events.length,renderCount:scene.renderCount,zone:activeZone(),counter:counterRect(innerWidth,innerHeight),settings:structuredClone(settings),open,trial,controlsVisible:document.documentElement.dataset.controlsVisible==='true',crowd:scene.snapshot(),renderer:scene.rendererState(),kitchen:structuredClone(kitchen),stats:structuredClone(stats),rent:{...rentController.snapshot(),scene:rentScene?.snapshot()},cooking:cookingScene?.snapshot(),cookingRenderCount:cookingScene?.renderCount||0,eventState:structuredClone(eventState),events:eventScene?.snapshot(),pendingTourVisitors:pendingTours.reduce((n,p)=>n+p.remaining,0),audio:audio.snapshot()})
};
addEventListener('message',e=>{
 if(!trial||e.source!==parent||parent===window||!e.data||e.data.channel!=='chutan-trial-v1')return;
 const a=e.data.action;if(a==='settings')ui.toggle();else if(a==='sim')sim(e.data.spec);else if(a==='fifty')addMany(50);else if(a==='dismiss')dismiss(5);
});
live.start();overtimeLink.start();updateHud();if(!loaded.readable||!loadedStats.readable)notify('设置或统计读取失败，本页先用默认值');

