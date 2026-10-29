(function(root){
 'use strict';
 const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
 const text=(v,n=80)=>typeof v==='string'||typeof v==='number'?String(v).replace(/[\u0000-\u001f\u007f-\u009f]/g,'').trim().slice(0,n):'';
 const giftKey=v=>text(v).normalize('NFKC').replace(/[^\p{L}\p{N}]/gu,'').toLowerCase();
 const integer=(v,max=1000000)=>((typeof v==='number')||(typeof v==='string'&&/^\d+$/.test(v.trim())))&&Number.isSafeInteger(Number(v))&&Number(v)>=1&&Number(v)<=max;
 const first=(...v)=>v.find(x=>x!==undefined&&x!==null);
 const ignored=reason=>({status:'ignored',reason,increment:0,executions:0,queued:0});
 function analyzeGift(raw,source='sdk'){
  if(!object(raw))return ignored('not-object');const d=object(raw.data)?raw.data:raw,g=object(d.gift)?d.gift:d,u=object(d.user)?d.user:{};
  const type=text(first(raw.type,raw.msgType,raw.method,d.type)).toLowerCase();
  if((source==='ws'||type)&&!type.includes('gift')&&type!=='2')return ignored('not-gift');
  const name=text(first(d.giftName,g.giftName,g.name,d.name));if(!name)return ignored('missing-name');
  const effective=first(d.effectiveGiftCount,g.effectiveGiftCount,raw.effectiveGiftCount);
  if(effective===undefined&&(d.comboEnd===true||g.comboEnd===true||raw.comboEnd===true))return ignored('combo-end');
  if(effective===0||effective==='0')return ignored('no-increment');
  const count=first(effective,d.count,d.giftCount,g.count,g.giftCount,d.comboCount,d.repeatCount,1);if(!integer(count))return ignored('invalid-count');
  const cumulative=effective===undefined&&first(d.cumulative,g.cumulative,raw.cumulative)===true;
  const comboId=text(first(d.comboId,g.comboId,raw.comboId),150);if(cumulative&&!comboId)return ignored('missing-combo-id');
  return{...ignored(''),normalized:{name,count:Number(count),cumulative,comboId,id:text(first(raw.eventId,d.eventId,raw.event_id,d.event_id,raw.msgId,d.msgId),200),actor:text(first(d.nickName,d.nickname,u.nickname,u.nickName,d.userName),30)||'观众',uid:text(first(d.userId,d.uid,u.id,u.uid),120),room:text(first(d.roomId,raw.roomId),100)}};
 }
 function normalizeGift(raw,source='sdk'){return analyzeGift(raw,source).normalized||null;}
 class GameLiveInput{
  constructor(options){
   this.options=options;this.env=options.env||root;this.now=options.now||Date.now;this.effects=options.effects.map(e=>({...e}));this.ids=new Set(this.effects.map(e=>e.id));this.key=options.key||'overlay-live-gifts-v1';this.name=options.name||'直播小游戏';
   this.storage=options.storage;try{if(this.storage===undefined&&typeof document!=='undefined')this.storage=root.localStorage;}catch{}
   let saved={};try{saved=JSON.parse(this.storage?.getItem(this.key)||'{}')||{};}catch{}if(!object(saved))saved={};saved.rules=Array.isArray(saved.rules)?saved.rules.filter(object).slice(0,100):[];
   this.config={enabled:saved.enabled!==false,mode:saved.mode==='actions'?'actions':'gifts',forwarding:saved.forwarding===true,port:integer(saved.port,65535)?Number(saved.port):9910};
   this.rules=this.effects.map(e=>({effect:e.id,gift:text(saved.rules?.find?.(r=>r.effect===e.id)?.gift??e.gift??''),times:integer(saved.rules?.find?.(r=>r.effect===e.id)?.times,20)?Number(saved.rules.find(r=>r.effect===e.id).times):1}));
   const occupied=new Set();for(const r of this.rules){const k=giftKey(r.gift);if(k&&occupied.has(k))r.gift='';else if(k)occupied.add(k);}
   this.queue=[];this.maxUnits=options.maxUnits||2000;this.maxRecords=options.maxRecords||100;this.ttl=options.ttl||120000;this.seen=new Map();this.combos=new Map();this.listeners=new Set();this.stats={received:0,actions:0,unmatched:0,executed:0,rejected:0,expired:0,cleared:0,duplicate:0,failed:0};
   this.running=false;this.timer=null;this.socket=null;this.giftSub=null;this.actionSub=null;this.channel='none';this.last='等待礼物消息';this.serial=0;this.nextAt=0;this.nextConnect=0;this.failures=0;this.inFlight=false;this.epoch=0;this.lastSnapshot='';
  }
  pending(){return this.queue.reduce((n,r)=>n+r.count,0);}
  snapshot(){return{...this.config,running:this.running,channel:this.channel,giftBound:!!this.giftSub,actionBound:!!this.actionSub,queued:this.pending(),inFlight:this.inFlight,stats:{...this.stats},last:this.last,rules:this.rules.map(r=>({...r}))};}
  subscribe(fn){this.listeners.add(fn);fn(this.snapshot());return()=>this.listeners.delete(fn);}
  publish(){const s=this.snapshot(),key=JSON.stringify(s);if(key===this.lastSnapshot)return;this.lastSnapshot=key;for(const fn of this.listeners)try{fn(s);}catch{}}
  save(){try{this.storage?.setItem(this.key,JSON.stringify({...this.config,rules:this.rules}));}catch{}}
  configure(values){
   if('mode'in values&&!['gifts','actions'].includes(values.mode)||'port'in values&&!integer(values.port,65535))return false;
   const routeChanged=values.mode&&values.mode!==this.config.mode,portChanged='port'in values&&Number(values.port)!==this.config.port;
   for(const k of['enabled','forwarding'])if(k in values)this.config[k]=values[k]===true;
   if(values.mode)this.config.mode=values.mode;if('port'in values)this.config.port=Number(values.port);
   if(routeChanged)this.clearQueue('切换规则来源，旧候场已清理');if(portChanged)this.closeSocket();
   if(!this.config.enabled)this.clearQueue('已停止接收，候场已清理');this.nextConnect=0;this.save();this.tryBind();this.publish();return true;
  }
  setRule(effect,{gift,times}){
   if(!this.ids.has(effect)||!integer(times,20))return{ok:false,error:'每个礼物触发次数需为 1～20 的整数'};
   gift=text(gift);const k=giftKey(gift);if(gift&&!k)return{ok:false,error:'礼物名需要包含文字或数字'};
   if(k&&this.rules.some(r=>r.effect!==effect&&giftKey(r.gift)===k))return{ok:false,error:'这个礼物已经绑定了另一种效果'};
   const r=this.rules.find(r=>r.effect===effect);r.gift=gift;r.times=Number(times);this.save();this.publish();return{ok:true};
  }
  fresh(id){if(!id)return true;const now=this.now();if((this.seen.get(id)||0)>now){this.stats.duplicate++;return false;}this.seen.set(id,now+600000);if(this.seen.size>2000)this.seen.delete(this.seen.keys().next().value);return true;}
  receiveGift(raw,source='sdk',simulation=false){return this.processGift(raw,source,simulation).queued>0;}
  processGift(raw,source='sdk',simulation=false){
   if(!this.running)return ignored('stopped');if(!simulation&&!this.config.enabled)return ignored('disabled');
   // 规则来源是「白曜重工规则动作」时礼物不触发效果，但还要过一遍加班机的礼物加减表
   if(!simulation&&this.config.mode!=='gifts'&&!this.options.onGift)return ignored('mode');
   const report=analyzeGift(raw,source),gift=report.normalized;if(!gift)return report;
   const reject=(reason,status='ignored')=>({...report,status,reason});
   const id=gift.id?JSON.stringify(['gift',gift.room,gift.id,...(gift.cumulative?[gift.comboId,gift.count]:[])]):'';if(!this.fresh(id)){this.publish();return reject('duplicate','duplicate');}
   let count=gift.count;
   if(gift.cumulative){const key=JSON.stringify([gift.room,gift.uid||gift.actor,giftKey(gift.name),gift.comboId]),old=this.combos.get(key);const previous=old&&old.until>this.now()?old.count:0;if(count<=previous)return reject('no-increment');this.combos.set(key,{count,until:this.now()+600000});count-=previous;if(this.combos.size>1000)this.combos.delete(this.combos.keys().next().value);}
   report.increment=count;
   if(!simulation)this.stats.received+=count;
   // 加班机的礼物加减表（只在记到插件自带的加班机时生效）：和效果绑定互不影响，同一个礼物两边都能配
   let shifted=0;if(!simulation&&this.options.onGift){try{shifted=Number(this.options.onGift({name:gift.name,count,actor:gift.actor}))||0;}catch{}}
   const shiftText=shifted?`，加班机 ${shifted>0?'+':'−'}${Math.round(Math.abs(shifted)/60)} 分钟`:'';
   if(!simulation&&this.config.mode!=='gifts'){if(shifted){this.last=`收到 ${gift.name} ×${count}${shiftText}`;this.publish();}return reject('mode');}
   const rule=this.rules.find(r=>giftKey(r.gift)===giftKey(gift.name)&&r.gift);
   if(!rule){if(!shifted)this.stats.unmatched+=count;this.last=`收到 ${gift.name} ×${count}${shifted?shiftText:'，未绑定效果'}`;this.publish();return reject(shifted?'overtime':'unmatched');}
   return this.processEffect(report,{kind:rule.effect,count:count*rule.times,actor:gift.actor,gift:gift.name,source:simulation?'manual':'gift'},rule.times);
  }
  receiveAction(raw){return this.processAction(raw).queued>0;}
  processAction(raw){
   if(!this.running)return ignored('stopped');if(!this.config.enabled)return ignored('disabled');if(this.config.mode!=='actions')return ignored('mode');
   if(!object(raw))return ignored('not-object');if(!this.ids.has(raw.action))return ignored('unknown-action');
   const value=raw.value??1,repeat=raw.repeat??1;if(!integer(value)||!integer(repeat)||!integer(Number(value)*Number(repeat)))return ignored('invalid-count');
   const id=text(first(raw.actionId,raw.eventId),200),actor=text(raw.event?.user?.nickname,30)||'观众',count=Number(value)*Number(repeat);
   const report={...ignored(''),normalized:{action:raw.action,id,actor,count,value:Number(value),repeat:Number(repeat)}};
   if(!this.fresh(id?'action:'+id:'')){this.publish();return{...report,status:'duplicate',reason:'duplicate'};}
   this.stats.actions+=count;report.increment=count;return this.processEffect(report,{kind:raw.action,count,actor,source:raw.preview?'preview':'action'},1);
  }
  processEffect(report,spec,multiplier){
   this.expire();const before=this.pending();this.enqueue(spec);const queued=this.pending()-before;
   return{...report,status:queued===spec.count?'accepted':queued?'partial':'ignored',reason:queued<spec.count?'capacity':'',effect:spec.kind,multiplier,executions:spec.count,queued};
  }
  clearMessageTests(){this.messageTests={seen:new Map(),combos:new Map()};}
  diagnoseMessage(input,channel,{receive=false,trigger=false}={}){
   if(typeof input!=='string')return ignored('json');if(input.length>65536)return ignored('too-large');
   let raw;try{raw=JSON.parse(input);}catch{return ignored('json');}
   if(!['songlan-port','baiyao-port','baiyao-sdk','baiyao-action'].includes(channel))return ignored('channel');
   // A receiver with no start(), storage or host APIs shares the production path,
   // but its deduplication and combo state can never consume real gift IDs.
   const shadow=new GameLiveInput({effects:this.effects,storage:null,env:{},now:this.now,maxUnits:this.maxUnits,maxRecords:this.maxRecords,ttl:this.ttl});
   shadow.running=this.running;shadow.config={...this.config};shadow.rules=this.rules.map(r=>({...r}));
   shadow.seen=new Map(this.messageTests?.seen);shadow.combos=new Map(this.messageTests?.combos);
   shadow.queue=this.queue.filter(r=>r.expires>this.now()).map(r=>({...r}));
   const report=channel==='baiyao-action'?shadow.processAction(raw):shadow.processGift(raw,channel.endsWith('-port')?'ws':'sdk');
   if(receive)this.messageTests={seen:shadow.seen,combos:shadow.combos};
   const result={...report,channel,received:receive,admitted:report.queued,queued:0};
   if(receive&&trigger&&report.executions){
    this.expire();const before=this.pending();this.enqueue({kind:report.effect,count:report.executions,actor:report.normalized.actor,gift:report.normalized.name,source:'manual'});result.queued=this.pending()-before;
   }
   return result;
  }
  enqueue(spec){
   if(!this.ids.has(spec.kind)||!integer(spec.count,20000000))return false;
   this.expire();const available=Math.max(0,this.maxUnits-this.pending()),accepted=this.queue.length<this.maxRecords?Math.min(available,spec.count):0;
   this.stats.rejected+=spec.count-accepted;
   if(accepted)this.queue.push({...spec,count:accepted,actor:text(spec.actor,30)||'观众',expires:this.now()+this.ttl,id:++this.serial});
   this.last=`${spec.source==='manual'?'本地测试':spec.source==='auto'?'自动整活':'@'+text(spec.actor,30)} · ${this.effects.find(e=>e.id===spec.kind).label}，排队 ${accepted} 次${accepted<spec.count?`，队列已满，未接纳 ${spec.count-accepted} 次`:''}`;this.publish();return accepted>0;
  }
  simulateEffect(kind,source='manual'){return this.enqueue({kind,count:1,actor:'本地测试',source});}
  simulateGift(effect,count=1){const r=this.rules.find(r=>r.effect===effect);if(!r?.gift||!integer(count))return false;return this.receiveGift({giftName:r.gift,count,nickName:'本地测试',eventId:'test-'+this.now()+'-'+(++this.serial)},'sdk',true);}
  expire(){const now=this.now();let expired=0;this.queue=this.queue.filter(r=>{if(r.expires<=now){expired+=r.count;return false;}return true;});if(expired){this.stats.expired+=expired;this.last=`${expired} 次候场已超过 120 秒，已过期`;this.publish();}}
  clearQueue(message='旧候场已清理'){this.stats.cleared+=this.pending();this.queue=[];this.epoch++;this.nextAt=0;this.last=message;this.publish();}
  async tick(){
   this.expire();if(!this.running||this.inFlight||!this.queue.length||this.now()<this.nextAt||!this.options.canRun())return false;
   const record=this.queue[0],token=this.epoch;record.count--;if(!record.count)this.queue.shift();this.inFlight=true;this.publish();
   try{const accepted=await this.options.execute({...record,count:1});
    if(accepted===false){if(token===this.epoch&&record.expires>this.now()){const current=this.queue.find(r=>r.id===record.id);if(current)current.count++;else this.queue.unshift({...record,count:1});}else this.stats.cleared++;}
    else{this.stats.executed++;this.last=`${record.source==='manual'?'本地测试':record.source==='auto'?'自动整活':'@'+record.actor} · 已执行 ${this.effects.find(e=>e.id===record.kind).label}`;}
   }catch{this.stats.failed++;this.last='效果执行异常，这一次未自动重试';}
   finally{this.inFlight=false;this.nextAt=this.now()+900;this.publish();}return true;
  }
  start(){if(this.running)return;this.running=true;this.tryBind();this.timer=this.env.setInterval(()=>this.tryBind(),1500);this.publish();}
  tryBind(){
   if(!this.running)return;
   const candidate=typeof this.env.SonglanPlugin?.onGift==='function'?this.env.SonglanPlugin:typeof this.env.BaiyaoPlugin?.onGift==='function'?this.env.BaiyaoPlugin:null;
   if(candidate&&(!this.giftSub||this.giftSub.sdk!==candidate)){
    // Baiyao exposes the same gift list through both SDK names. Bind one only.
    const old=this.giftSub,binding={sdk:candidate,off:null};try{binding.off=candidate.onGift(raw=>{if(this.running&&this.giftSub===binding)this.receiveGift(raw,'sdk');});this.giftSub=binding;if(typeof old?.off==='function')old.off();}catch{}
   }
   const baiyao=this.env.BaiyaoPlugin;
   if(typeof baiyao?.onAction==='function'&&(!this.actionSub||this.actionSub.sdk!==baiyao)){
    const old=this.actionSub,binding={sdk:baiyao,off:null};try{binding.off=baiyao.onAction(raw=>{if(this.running&&this.actionSub===binding)this.receiveAction(raw);});this.actionSub=binding;if(typeof old?.off==='function')old.off();}catch{}
   }
   if(this.giftSub){this.closeSocket();this.channel=this.env.BaiyaoPlugin?'baiyao':'songlan';}
   else if(this.config.enabled&&this.config.forwarding&&this.config.mode==='gifts'){
    if(this.socket&&this.socket.readyState===0&&this.now()-this.socketStarted>6000)this.failSocket(this.socket);
    if(!this.socket&&this.now()>=this.nextConnect)this.openSocket();
   }else{this.closeSocket();this.channel='none';}
   this.publish();
  }
  openSocket(){
   let socket;try{socket=new this.env.WebSocket(`ws://localhost:${this.config.port}`);}catch{this.channel='waiting';this.nextConnect=this.now()+10000;return;}
   this.socket=socket;this.socketStarted=this.now();this.channel='connecting';const current=()=>this.running&&this.socket===socket&&!this.giftSub&&this.config.enabled&&this.config.forwarding&&this.config.mode==='gifts';
   socket.onopen=()=>{if(!current())return;this.channel='forwarder';this.failures=0;try{socket.send(JSON.stringify({action:'identify',module:this.name}));}catch{this.failSocket(socket);}this.publish();};
   socket.onmessage=e=>{if(!current()||typeof e.data!=='string'||e.data.length>65536)return;try{const raw=JSON.parse(e.data);this.receiveGift(raw,'ws');}catch{}};
   socket.onerror=()=>this.failSocket(socket);socket.onclose=()=>this.failSocket(socket);
  }
  failSocket(socket){if(this.socket!==socket)return;this.socket=null;try{socket.close();}catch{}this.channel='waiting';this.nextConnect=this.now()+[3000,5000,10000][Math.min(this.failures++,2)];this.publish();}
  closeSocket(){const old=this.socket;this.socket=null;if(old)try{old.close();}catch{}}
  stop(){this.running=false;if(this.timer!==null)this.env.clearInterval(this.timer);this.timer=null;this.closeSocket();for(const k of['giftSub','actionSub'])if(typeof this[k]?.off==='function'){try{this[k].off();}catch{}this[k]=null;}this.clearQueue('页面已离开，候场已清理');this.channel='none';this.publish();}
 }
 root.GameLiveInput=GameLiveInput;if(typeof module!=='undefined')module.exports={GameLiveInput,normalizeGift,giftKey};
})(typeof window!=='undefined'?window:globalThis);
