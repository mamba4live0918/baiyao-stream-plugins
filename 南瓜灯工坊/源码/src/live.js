/* 从出摊啦 Live 骨架复制改写：按 SDK 对象/方法分别绑定，晚注入时继续找。 */
import {normalizeGiftEvent,normalizeCommentEvent,routeGift,routeComment,specFromAction,createEventId} from './rules.js';
export class Live{
 constructor(trigger,getSettings,env=globalThis,onChange=()=>{},options={}){
  Object.assign(this,{trigger,getSettings,env,onChange,options});this.running=false;this.registrations=[];this.seen={gift:new Set(),comment:new Set(),action:new Set()};this.counts={gift:0,comment:0,action:0};this.timer=null;this.bindings={};this.lastGift=null;
 }
 start(){if(this.running)return this;this.running=true;this.tryBind();this.timer=this.env.setInterval?.(()=>this.tryBind(),1000);return this;}
 tryBind(){
  if(!this.running)return;
  // 白曜里 SonglanPlugin 和 BaiyaoPlugin 是同一路事件：有白曜就只接白曜那一路，免得一个礼物算两次（先接上的菘蓝那一路作废）
  const baiyao=this.env.BaiyaoPlugin;
  if(baiyao)for(const r of this.registrations)if(r.host==='songlan'&&r.active){r.active=false;delete this.bindings['songlan.'+r.method];}
  for(const [host,sdk]of [['songlan',this.env.SonglanPlugin],['baiyao',baiyao]]){
   if(host==='songlan'&&baiyao)continue;
   for(const [method,kind]of [['onGift','gift'],['onChat','comment'],['onComment','comment'],['onAction','action']]){
    if(method==='onAction'&&host!=='baiyao'||typeof sdk?.[method]!=='function'||this.registrations.some(r=>r.sdk===sdk&&r.method===method))continue;
    const r={sdk,method,active:true,host};
    try{r.off=sdk[method](raw=>{if(r.active&&this.running)this[kind==='gift'?'onGift':kind==='comment'?'onComment':'onAction'](raw,host);});this.registrations.push(r);this.bindings[host+'.'+method]=true;this.onChange(this);}catch{r.active=false;}
   }
  }
 }
 // 同一个事件编号只算一次，不管从哪一路来
 fresh(kind,id){if(!id)return true;const key=String(id),s=this.seen[kind];if(s.has(key))return false;s.add(key);if(s.size>2000)s.delete(s.values().next().value);return true;}
 receiving(){return this.getSettings().live?.receive!==false;}
 onGift(raw,host='sim'){
  if(!this.receiving())return false;const e=normalizeGiftEvent(raw);if(!e||!this.fresh('gift',e.id))return false;
  this.counts.gift++;const specs=routeGift(this.getSettings(),e);this.lastGift={name:e.gift.name,count:e.gift.count,matched:!!specs};this.onChange(this);return this.fire(specs);
 }
 onComment(raw,host='sim'){
  if(!this.receiving())return false;const e=normalizeCommentEvent(raw);if(!e||!this.fresh('comment',e.id))return false;
  this.counts.comment++;this.options.onChat?.(e);return this.fire(routeComment(this.getSettings(),e));
 }
 onAction(raw,host='baiyao'){if(!this.receiving())return false;const s=specFromAction(this.getSettings(),raw);if(!s||!this.fresh('action',s.id))return false;this.counts.action++;return this.fire(s);}
 fire(input){let result=false;for(const s of Array.isArray(input)?input:input?[input]:[])result=this.trigger(s)!==false||result;return result;}
 sim(s){return this.fire({...s,source:'sim',id:createEventId()});}
 simGift(name,count=1,nick='试玩观众'){const e=normalizeGiftEvent({giftName:name,count,nickname:nick,eventId:createEventId()});return this.fire(routeGift(this.getSettings(),e));}
 simComment(raw){const e=normalizeCommentEvent(raw);if(e)this.options.onChat?.(e);return this.fire(routeComment(this.getSettings(),e));}
 status(){return Object.keys(this.bindings).length?'已绑定 '+Object.keys(this.bindings).join(' · '):'等待白曜 / 菘蓝接口；离线可试玩';}
 stop(){this.running=false;this.env.clearInterval?.(this.timer);for(const r of this.registrations){r.active=false;try{r.off?.();}catch{}}this.registrations=[];this.bindings={};}
}
