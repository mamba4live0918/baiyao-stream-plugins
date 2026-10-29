/* 出摊啦 · 无DOM/存储/真实时钟的不可变制作状态。 */
const object=value=>value&&typeof value==='object'&&!Array.isArray(value)?value:{};
const integer=(value,fallback,min=0)=>Number.isSafeInteger(value)&&value>=min?value:fallback;
const emptyPot=()=>({amount:0,status:'empty',startedAt:null});
const emptyPancake=()=>({loaded:false,spread:false,eggs:0,hadEgg:false,bag:null});
const emptyTea=()=>({pearls:0,hadPearls:false,shaken:false,sealed:false});
export function kitchenDishCount(s){
 if(s?.shop==='noodle')return s.bowl;
 if(s?.shop==='sushi')return s.plate.length;
 if(s?.shop==='pancake')return s.pancake?.bag?.eggs??0;
 if(s?.shop==='tea')return s.tea?.sealed?s.tea.pearls:0;
 return 0;
}
export function kitchenHasDish(s){
 if(s?.shop==='pancake')return Boolean(s.pancake?.bag);
 if(s?.shop==='tea')return Boolean(s.tea?.sealed);
 return kitchenDishCount(s)>0;
}
function hasWorkFood(s){
 if(s.shop==='noodle')return s.pot.amount>0;
 if(s.shop==='pancake')return s.pancake.loaded;
 if(s.shop==='sushi')return s.block>0||s.slices.length>0;
 // 奶茶：只有小锅里正在煮的珍珠算工作台；杯里已捞好的珍珠不受锅冒烟连累。
 return s.pot.amount>0;
}
function spoil(state,reason,area='work'){
 const key=area==='work'?'workSpoilageChecked':'dishSpoilageChecked';
 if(state[key]||!(area==='work'?hasWorkFood(state):kitchenHasDish(state)))return state;
 const id=state.spoilSerial+1;return{...state,[key]:true,spoilSerial:id,lastSpoilage:{id,reason}};
}

export function createKitchen(shop,options={}){
 if(!['noodle','sushi','pancake','tea'].includes(shop))throw new RangeError('未知店铺');
 const c=object(options);
 return{shop,options:{capacity:integer(c.capacity,0),cookMs:integer(c.cookMs,4000),readyMs:integer(c.readyMs,6000,1),fishPieces:integer(c.fishPieces,8,1),smokeMs:integer(c.smokeMs,3000,1),fireMs:integer(c.fireMs,8000,1)},
  pot:emptyPot(),bowl:0,block:0,slices:[],plate:[],pancake:emptyPancake(),tea:emptyTea(),pending:null,nextDishId:1,badDish:false,stoveLocked:false,
  spoilSerial:0,lastSpoilage:null,workSpoilageChecked:false,dishSpoilageChecked:false};
}
function burn(state,now){
 if(state.stoveLocked&&state.pot.status==='burnt')return state;
 state=spoil(state,'fire');
 return{...state,stoveLocked:true,badDish:state.badDish||(state.shop!=='tea'&&kitchenHasDish(state)),
  dishSpoilageChecked:state.dishSpoilageChecked||(state.shop!=='tea'&&kitchenHasDish(state)),
  pot:{...state.pot,status:'burnt',fireStartedAt:state.pot.fireStartedAt??now,fireSource:state.pot.fireSource||'external'}};
}
function advanceHeat(state,now){
 const p=state.pot;
 if(p.status==='burnt'||state.stoveLocked)return state;
 if(p.status==='fire')return now>=p.fireStartedAt+state.options.fireMs?burn(state,now):state;
 if(!['noodle','pancake','tea'].includes(state.shop)||!p.amount||p.startedAt===null)return state;
 const readyAt=p.startedAt+state.options.cookMs,smokeAt=readyAt+state.options.readyMs,fireAt=smokeAt+state.options.smokeMs,burnAt=fireAt+state.options.fireMs;
 const phase=now>=burnAt?'burnt':now>=fireAt?'fire':now>=smokeAt?'smoking':now>=readyAt?'ready':'raw';
 const rank={raw:0,ready:1,smoking:2,fire:3,burnt:4};
 if(rank[phase]<=rank[p.status])return state;
 let heated={...state,pot:{...p,status:phase,...(phase==='fire'||phase==='burnt'?{fireStartedAt:fireAt,fireSource:'heat'}:{})}};
 if(['smoking','fire','burnt'].includes(phase))heated=spoil(heated,'smoking');
 return phase==='burnt'?burn(heated,now):heated;
}
function takeDish(state){
 if(!kitchenHasDish(state))return state;
 const shop=state.shop,given=kitchenDishCount(state),items=shop==='sushi'?state.plate:null;
 const payload=shop==='pancake'?{eggs:given}:shop==='tea'?{...state.tea}:null;
 const pending={id:state.nextDishId,shop,given,broken:shop==='sushi'?items.filter(i=>i.broken).length:0,items,ruined:Boolean(state.badDish),spoilageChecked:state.dishSpoilageChecked,...(payload?{payload}:{})};
 const cleared=shop==='noodle'?{bowl:0}:shop==='sushi'?{plate:[]}:shop==='pancake'?{pancake:{...state.pancake,bag:null}}:{tea:emptyTea()};
 return{...state,pending,nextDishId:state.nextDishId+1,badDish:false,dishSpoilageChecked:false,...cleared};
}
function restoreDish(state){
 const p=state.pending,restored=state.shop==='noodle'?{bowl:p.given}:state.shop==='sushi'?{plate:p.items}:state.shop==='pancake'?{pancake:{...state.pancake,bag:{...p.payload}}}:{tea:{...p.payload}};
 return{...state,pending:null,badDish:Boolean(p.ruined),dishSpoilageChecked:Boolean(p.spoilageChecked),...restored};
}
function eat(state,amount){
 if(!amount)return state;
 let left=amount;
 if(state.shop==='noodle'){
  const fromBowl=Math.min(left,state.bowl);left-=fromBowl;
  const fromPot=Math.min(left,state.pot.amount),remaining=state.pot.amount-fromPot,bowl=state.bowl-fromBowl;
  if(!fromBowl&&!fromPot)return state;
  const stillFire=['fire','burnt'].includes(state.pot.status);
  return{...state,bowl,pot:remaining||stillFire?{...state.pot,amount:remaining}:emptyPot(),badDish:bowl>0&&state.badDish};
 }
 if(state.shop==='pancake'){
  const p=state.pancake;
  if(p.bag){const eggs=Math.max(0,p.bag.eggs-left);return eggs===p.bag.eggs?state:{...state,pancake:{...p,bag:{eggs}}};}
  if(!p.loaded)return state;
  const fromEggs=Math.min(left,p.eggs);left-=fromEggs;
  if(left>0){const fire=['fire','burnt'].includes(state.pot.status);return{...state,pancake:emptyPancake(),pot:fire?{...state.pot,amount:0}:emptyPot()};}
  return fromEggs?{...state,pancake:{...p,eggs:p.eggs-fromEggs}}:state;
 }
 if(state.shop==='tea'){
  const fromCup=Math.min(left,state.tea.pearls);left-=fromCup;
  const fromPot=Math.min(left,state.pot.amount),remaining=state.pot.amount-fromPot;
  if(!fromCup&&!fromPot)return state;
  const stillFire=['fire','burnt'].includes(state.pot.status);
  return{...state,tea:{...state.tea,pearls:state.tea.pearls-fromCup},pot:remaining||stillFire?{...state.pot,amount:remaining}:emptyPot(),badDish:state.badDish&&(state.tea.sealed||state.tea.pearls-fromCup>0)};
 }
 const fromPlate=Math.min(left,state.plate.length);left-=fromPlate;
 const fromSlices=Math.min(left,state.slices.length);left-=fromSlices;
 const fromBlock=Math.min(left,state.block);
 if(!fromPlate&&!fromSlices&&!fromBlock)return state;
 const plate=state.plate.slice(fromPlate);
 return{...state,plate,slices:state.slices.slice(fromSlices),block:state.block-fromBlock,badDish:plate.length>0&&state.badDish};
}

/** now comes from the shared pause-aware game clock. */
function reduceKitchenAction(previous,action,now=0){
 const state=advanceHeat(previous,now),type=action?.type;
 // These alter the workspace, not a receipt already locked in flight.
 if(type==='ignite'){
  if(state.stoveLocked||state.pot.status==='fire')return state;
  return spoil({...state,pot:{...state.pot,status:'fire',fireStartedAt:now,fireSource:'external'}},'fire');
 }
 if(type==='burn')return burn(state,now);
 if(type==='repair'){
  if(!state.stoveLocked&&!['fire','burnt','smoking'].includes(state.pot.status))return state;
  return{...state,stoveLocked:false,pot:emptyPot(),...(state.shop==='pancake'?{pancake:{...emptyPancake(),bag:state.pancake.bag}}:{})};
 }
 if(state.pending){
  if(action?.id!==state.pending.id)return state;
  if(type==='completeDish')return{...state,pending:null};
  if(type==='cancelDish')return restoreDish(state);
  return state;
 }
 if(type==='takeDish')return takeDish(state);
 if(type==='spice')return kitchenHasDish(state)&&!state.badDish?spoil({...state,badDish:true},'spice','dish'):state;
 if(type==='eat')return eat(state,action.count===undefined?1:integer(action.count,0));
 if(type==='clearDish'){
  if(!kitchenHasDish(state)&&!state.badDish)return state;
  const cleared=state.shop==='noodle'?{bowl:0}:state.shop==='sushi'?{plate:[]}:state.shop==='pancake'?{pancake:{...state.pancake,bag:null}}:{tea:emptyTea()};
  return{...state,badDish:false,...cleared};
 }
 if(type==='clearWork'&&state.shop==='pancake'&&state.pancake.loaded){
  const fire=['fire','burnt'].includes(state.pot.status)||state.stoveLocked;
  return{...state,pancake:{...emptyPancake(),bag:state.pancake.bag},pot:fire?{...state.pot,amount:0}:emptyPot()};
 }
 if(type==='clearWork'&&state.shop==='tea'&&!state.tea.sealed&&(state.tea.hadPearls||state.tea.pearls||state.tea.shaken))return{...state,tea:emptyTea(),badDish:false};
 if(type==='clearPot'&&['noodle','tea'].includes(state.shop)&&state.pot.amount&&!state.stoveLocked&&state.pot.status!=='fire')return{...state,pot:emptyPot()};
 if(type==='clearBoard'&&state.shop==='sushi'&&(state.block||state.slices.length))return{...state,block:0,slices:[]};
 if(state.stoveLocked||state.pot.status==='fire')return state;
 if(state.shop==='noodle'){
  const p=state.pot;
  if(type==='load'){
   if(state.options.capacity>0&&p.amount>=state.options.capacity)return state;
   return{...state,pot:{amount:p.amount+1,status:'raw',startedAt:now}};
  }
  if(type==='scoop'&&p.status==='ready')return{...state,pot:p.amount>1?{...p,amount:p.amount-1}:emptyPot(),bowl:state.bowl+1};
  return state;
 }
 if(state.shop==='pancake'){
  const p=state.pancake;
  if(type==='loadBatter'&&!p.loaded&&!p.bag)return{...state,pancake:{...emptyPancake(),loaded:true},pot:{amount:1,status:'raw',startedAt:null}};
  if(type==='spread'&&p.loaded&&!p.spread)return{...state,pancake:{...p,spread:true}};
  if(type==='addEgg'&&p.loaded&&p.spread)return{...state,pancake:{...p,eggs:p.eggs+1,hadEgg:true},pot:{amount:1,status:'raw',startedAt:now}};
  if(type==='liftPancake'&&p.loaded&&p.hadEgg&&state.pot.status==='ready')return{...state,pancake:{...emptyPancake(),bag:{eggs:p.eggs}},pot:emptyPot()};
  return state;
 }
 if(state.shop==='tea'){
  // ①珍珠下进小锅（和面一样再下一勺整锅重煮）→ ②熟了一勺勺捞进杯子 → ③摇好倒进杯子封口。
  const t=state.tea,p=state.pot;
  if(type==='addPearls'){
   if(state.options.capacity>0&&p.amount>=state.options.capacity)return state;
   return{...state,pot:{amount:p.amount+1,status:'raw',startedAt:now}};
  }
  if(t.sealed)return state;
  if(type==='scoopPearls'&&p.status==='ready'&&p.amount>0)return{...state,pot:p.amount>1?{...p,amount:p.amount-1}:emptyPot(),tea:{...t,pearls:t.pearls+1,hadPearls:true}};
  if(type==='shake'&&t.hadPearls&&!t.shaken)return{...state,tea:{...t,shaken:true}};
  if(type==='pourTea'&&t.shaken&&t.hadPearls)return{...state,tea:{...t,sealed:true}};
  return state;
 }
 if(type==='load'&&!state.block)return{...state,block:state.options.fishPieces};
 if(type==='slice'&&state.block&&(action.direction===undefined||action.direction==='down'))return{...state,block:state.block-1,slices:[...state.slices,{broken:action.broken===true}]};
 if(type==='plate'&&state.slices.length)return{...state,slices:state.slices.slice(1),plate:[...state.plate,state.slices[0]]};
 return state;
}

export function reduceKitchen(previous,action,now=0){
 let state=reduceKitchenAction(previous,action,now);
 if(state===previous)return state;
 // Moving a checked batch into a container keeps its identity. Adding new food
 // to an occupied batch or an already dirty dish never creates another roll.
 const moved=action?.type==='scoop'?state.bowl>previous.bowl:action?.type==='plate'?state.plate.length>previous.plate.length:action?.type==='liftPancake'?!previous.pancake.bag&&state.pancake.bag:action?.type==='scoopPearls'?state.tea.pearls>previous.tea.pearls:false;
 if(moved&&previous.workSpoilageChecked){
  state={...state,dishSpoilageChecked:true,badDish:true};
 }
 const work=hasWorkFood(state)?state.workSpoilageChecked:false,dish=kitchenHasDish(state)?state.dishSpoilageChecked:false;
 return work===state.workSpoilageChecked&&dish===state.dishSpoilageChecked?state:{...state,workSpoilageChecked:work,dishSpoilageChecked:dish};
}
