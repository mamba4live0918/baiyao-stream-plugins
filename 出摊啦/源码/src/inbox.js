import { safeName } from './text.js';
import { createEventId } from './rules.js';
import { createCrowdOffset } from './crowd/variation.js';
import { SHOPS, sanitizeCooking } from './settings.js';
export const ACTION_NAMES = {order:'点单',fire:'放火',thief:'小偷',blackout:'停电',cat:'野猫',tour:'旅行团',boom:'爆锅糊脸',spice:'乱加料',helper:'帮手',guard:'保安',overtime:'加班',rent:'交租'};
// Queues stay in memory. Each admitted unit owns a stable key and arrival clock.
export function createInbox(getSettings, { now = Date.now, random = Math.random } = {}) {
  const orders=[],events=[];
  let orderSequence=0,urgeSequence=0;
  const roll=(low,high)=>{const v=Number(random());return low+Math.floor(Math.max(0,Math.min(1-Number.EPSILON,Number.isFinite(v)?v:0))*(high-low+1));};
  return {orders,events,rerollQuantities(shop){
    if(!SHOPS.includes(shop))return false;
    const range=sanitizeCooking(getSettings().cooking).quantities[shop];
    for(const order of orders)order.quantities[shop]=roll(...range);
    return true;
  },accept(spec){
    if(!spec || !Object.hasOwn(ACTION_NAMES,spec.kind))return false;
    const nick=safeName(spec.nick), source=spec.source||'live';
    const id=String(spec.id??'').trim()||createEventId();
    const uid=String(spec.uid??'').trim()||`event:${JSON.stringify([source,id])}`;
    if(spec.kind==='order'){
      // 送礼物点单（via:'gift'）全部进店；「每人同时几单」只限弹幕和白曜动作点单。
      const settings=getSettings(),cap=spec.via==='gift'?0:settings.order.perPerson;
      const owned=orders.filter(x=>x.uid===uid);
      const count=Number.isFinite(spec.count)&&spec.count>=1?Math.floor(spec.count):1;
      const admitted=cap>0?Math.min(count,Math.max(0,cap-owned.length)):count;
      const at=now();
      const ranges=admitted>0?sanitizeCooking(settings.cooking).quantities:null;
      for(let i=0;i<admitted;i++){const order={key:`order:${++orderSequence}`,uid,nick,id,urges:0,receivedAt:at,lastUrgedAt:null,urgeSerial:0,source,appearance:roll(1,16),quantities:{noodle:roll(...ranges.noodle),pancake:roll(...ranges.pancake),tea:roll(...ranges.tea),sushi:roll(...ranges.sushi)},crowdOffset:createCrowdOffset(random)};orders.push(order);owned.push(order);}
      if(admitted<count && owned[0]){
        owned[0].urges+=count-admitted;
        const serial=++urgeSequence;
        for(const order of owned){order.lastUrgedAt=at;order.urgeSerial=serial;}
      }
    }else events.push({...spec,nick,uid,id,source,count:Number.isFinite(spec.count)&&spec.count>0?spec.count:1});
    return true;
  }};
}
