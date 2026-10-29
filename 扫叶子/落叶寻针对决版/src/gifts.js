(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.LeafGifts=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const MAX_COUNT=100000,NICK_MAX=24,DEFAULT_NICK='观众';
const SYMBOLS=/[\s·•・,，.。!！?？:：;；'"“”‘’()（）\[\]【】\-_~～]/g,AVATAR=/^(?:https?:\/\/|data:image\/)/i;
// 数字类型：5 按约定是礼物；2 是插件通用模板等处的礼物编号。两者都还要求有礼物名，无名的数字类型消息交给 parseLike。
const GIFT_CODES=['5','2'];
const isObj=v=>v!==null&&typeof v==='object'&&!Array.isArray(v),obj=v=>isObj(v)?v:{};
const present=v=>v!==undefined&&v!==null&&!(typeof v==='string'&&!v.trim());
const text=v=>typeof v==='string'?v.trim():typeof v==='number'&&Number.isFinite(v)?String(v):'';
// 超出安全整数的数字 id 已被 JSON 取整，不同事件可能撞成同一个，不拿来去重
const idText=v=>typeof v==='string'?v.trim():Number.isSafeInteger(v)?String(v):'';
const url=v=>{const s=typeof v==='string'?v.trim():'';return AVATAR.test(s)?s:'';};
const first=(f,list)=>{for(const v of list){const s=f(v);if(s)return s;}return'';};

function normalizeName(s){
  return(s==null?'':String(s)).trim()
    .replace(/[\uFF01-\uFF5E]/g,c=>String.fromCharCode(c.charCodeAt(0)-0xFEE0)).replace(/\u3000/g,' ')
    .toLowerCase().replace(SYMBOLS,'');
}
// 外层消息可为 JSON 字符串；data（对象或 JSON 字符串）里非空的字段盖到外层上。
// type 以外层为准（data 里的 type 常是子类型），外层没有才用 data.type；裸 id 只取外层（data 里的 id 常是礼物或用户编号）。
function unpack(msg){
  let top=msg;
  if(typeof top==='string'){try{top=JSON.parse(top);}catch{return null;}}
  if(!isObj(top))return null;
  let data=top.data;
  if(typeof data==='string'){
    if(!data.trim())data=null;
    else{try{data=JSON.parse(data);}catch{return null;}}
  }
  if(!isObj(data))data=null;
  const type=present(top.type)?top.type:data&&data.type;
  const m=data?{...top,...Object.fromEntries(Object.entries(data).filter(([,v])=>v!=null))}:top;
  return{m,type:present(type)?String(type).trim().toLowerCase():'',topId:top.id};
}
const giftNameOf=m=>{const g=obj(m.gift);return first(text,[m.giftName,g.name,g.giftName,m.name]);};
function countOf(v,fallback){
  if(!present(v))return fallback;
  if(typeof v==='string'){v=v.trim();if(!/^\d+$/.test(v))return null;v=Number(v);}
  return Number.isInteger(v)&&v>=1&&v<=MAX_COUNT?v:null;
}
function viewer(m,topId){
  const u=obj(m.user),g=obj(m.gift),nick=first(text,[m.nickname,m.nickName,m.userName,u.nickname,u.nickName,u.name]);
  return{
    eventId:first(idText,[m.eventId,m.msgId,topId])||null,
    nickname:nick?Array.from(nick).slice(0,NICK_MAX).join(''):DEFAULT_NICK,
    avatar:first(url,[u.avatar,m.avatar,m.avatarUrl,u.avatarUrl,g.avatar])||null
  };
}
function parseGift(msg){
  try{
    const u=unpack(msg);if(!u)return null;
    const m=u.m,name=giftNameOf(m),typed=u.type.includes('gift')||u.type.includes('礼物')||GIFT_CODES.includes(u.type);
    if(!name||(u.type&&!typed))return null;
    const count=countOf([m.count,m.giftCount,m.comboCount,m.repeatCount,obj(m.gift).count].find(present),1);
    return count===null?null:{name,count,...viewer(m,u.topId)};
  }catch{return null;}
}
// 写明 like／点赞 的消息缺数量时按 1 个；未写明时只认无类型或数字类型、带数量且没有礼物名的消息，
// 免得 gift、comment、online 等带 count 的消息被当成点赞。
function parseLike(msg){
  try{
    const u=unpack(msg);if(!u)return null;
    const m=u.m,raw=[m.count,m.likeCount].find(present),liked=u.type.includes('like')||u.type.includes('点赞');
    if(!liked&&(!/^\d*$/.test(u.type)||raw===undefined||giftNameOf(m)))return null;
    const count=countOf(raw,1);
    return count===null?null:{count,...viewer(m,u.topId)};
  }catch{return null;}
}

const idKey=id=>typeof id==='string'?id:Number.isSafeInteger(id)?String(id):'';
const evict=(map,cap)=>{while(map.size>cap)map.delete(map.keys().next().value);};
// 时间用 Date.now() 这类墙钟毫秒：记录会随存档保存，刷新后仍要可比
class Dedupe{
  constructor(opts){
    const{windowMs=60000,cap=500}=obj(opts);
    this.windowMs=Number.isFinite(windowMs)&&windowMs>0?windowMs:60000;
    this.cap=Number.isSafeInteger(cap)&&cap>=1?cap:500;
    this.ids=new Map();
  }
  prune(now){
    const t=Number.isFinite(now)?now:Date.now();
    for(const[k,at]of this.ids){if(t-at<this.windowMs)break;this.ids.delete(k);}
    return this;
  }
  // 窗口从首次记录算起，重复命中不续期
  seen(id,now){
    const k=idKey(id);if(!k)return false;
    const t=Number.isFinite(now)?now:Date.now();
    this.prune(t);
    if(this.ids.has(k)&&t-this.ids.get(k)<this.windowMs)return true;
    this.ids.delete(k);this.ids.set(k,t);evict(this.ids,this.cap);
    return false;
  }
  toJSON(){return Array.from(this.ids);}
  static fromJSON(arr,opts){
    const d=new Dedupe(opts),rows=[];
    if(Array.isArray(arr))for(const e of arr){const k=Array.isArray(e)?idKey(e[0]):'';if(k&&Number.isFinite(e[1]))rows.push([k,e[1]]);}
    rows.sort((a,b)=>a[1]-b[1]);
    for(const[k,t]of rows){d.ids.delete(k);d.ids.set(k,t);}
    evict(d.ids,d.cap);
    return d;
  }
}

const ruleKey=r=>isObj(r)?normalizeName(text(r.gift)):'';
function matchRule(rules,name){
  const key=normalizeName(text(name));
  return key&&Array.isArray(rules)?rules.find(r=>ruleKey(r)===key)||null:null;
}
function duplicateNames(rules){
  const counts=new Map();
  if(Array.isArray(rules))for(const r of rules){const k=ruleKey(r);if(k)counts.set(k,(counts.get(k)||0)+1);}
  return[...counts].filter(([,n])=>n>1).map(([k])=>k);
}

const whole=v=>Number.isSafeInteger(v)&&v>=0?v:0;
class LikeCounter{
  constructor(opts){const o=obj(opts);this.total=whole(o.total);this.carry=whole(o.carry);}
  // 返回本次应触发的次数。步长无效时只计入总数、不动零头，免得日后改回有效步长时一次补发一大批
  add(n,step){
    if(!Number.isSafeInteger(n)||n<0)return 0;
    this.total=Math.min(Number.MAX_SAFE_INTEGER,this.total+n);
    if(!Number.isSafeInteger(step)||step<1)return 0;
    const sum=this.carry+n;this.carry=sum%step;
    return Math.floor(sum/step);
  }
  toJSON(){return{total:this.total,carry:this.carry};}
  static fromJSON(o){return new LikeCounter(o);}
}
return{normalizeName,parseGift,parseLike,Dedupe,matchRule,duplicateNames,LikeCounter,MAX_COUNT};
});
