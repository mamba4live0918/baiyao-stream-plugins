(function(root){
'use strict';
const Core=root.CowCore||(typeof module!=='undefined'&&module.exports?require('./core.js'):null);
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const own=(value,key)=>Object.hasOwn(value,key);
const controls=/[\u0000-\u001f\u007f-\u009f]/;
function integer(value,max){
 if(typeof value==='number')return Number.isSafeInteger(value)&&value>=0&&value<=max?value:null;
 if(typeof value!=='string'||!/^(?:0|[1-9][0-9]*)$/.test(value))return null;
 const ceiling=String(max);
 if(value.length>ceiling.length||value.length===ceiling.length&&value>ceiling)return null;
 return Number(value);
}
function text(value,max,allowEmpty=false){
 if(typeof value==='number')return Number.isSafeInteger(value)&&value>=0?String(value):null;
 if(typeof value!=='string'||value.length>max||controls.test(value)||value.trim()!==value||!allowEmpty&&!value)return null;
 return value;
}
function field(packet,data,key){return own(packet,key)?{present:true,value:packet[key]}:data!==packet&&own(data,key)?{present:true,value:data[key]}:{present:false};}
function receive(state,packet,options={}){
 const core=options.core||Core,now=options.now??Date.now(),reject=reason=>({accepted:false,reason});
 if(!object(state)||!object(packet)||!core||!Number.isSafeInteger(now)||now<0)return reject('invalid');
 if(own(packet,'type')&&packet.type!=='like')return reject('event-type');
 if(own(packet,'data')&&!object(packet.data))return reject('invalid-data');
 const data=own(packet,'data')?packet.data:packet;
 for(const row of data===packet?[packet]:[packet,data])if(own(row,'countMode')&&row.countMode!=='delta')return reject('count-mode');
 const values=[];
 for(const row of data===packet?[packet]:[packet,data])for(const key of ['count','likeCount'])if(own(row,key))values.push(integer(row[key],core.LIKE_CAP));
 if(!values.length)return reject('missing-count');
 const count=values[0];
 if(count===null||count<1||values.some(value=>value!==count))return reject('invalid-count');
 const timestamp=field(packet,data,'timestamp');
 if(timestamp.present){const at=integer(timestamp.value,Number.MAX_SAFE_INTEGER);if(at===null||at<now-60000||at>now+5000)return reject('timestamp');}
 const sourceField=field(packet,data,'source'),source=text(sourceField.present?sourceField.value:options.sourceHint||'unknown',64);
 if(source===null||!source)return reject('source');
 const roomField=field(packet,data,'roomId'),room=roomField.present?text(roomField.value,200,true):'';
 if(room===null)return reject('room');
 const event=field(packet,data,'eventId'),message=field(packet,data,'msgId'),identifier=event.present?event:message;
 let receipt=null;
 if(identifier.present){
  const id=text(identifier.value,200);
  if(id===null||id==='0')return reject('event-id');
  receipt=JSON.stringify([source,room,id]);
  if(receipt.length>800)return reject('event-id');
 }
 const receipts=core.cleanLikeReceipts(state.receivedLikeIds,now);
 if(receipt&&receipts.some(row=>row.id===receipt)){state.receivedLikeIds=receipts;return{accepted:false,reason:'duplicate',duplicate:true};}
 const before=core.cleanLikes(state.likes);
 if(before.total===core.LIKE_CAP&&before.carry===core.LIKE_CAP)return reject('capacity');
 if(!core.addLikes(state,count))return reject('invalid-count');
 // An identifier is consumed only after its delta has actually been accepted.
 state.receivedLikeIds=receipt?receipts.concat({id:receipt,at:now}).slice(-1000):receipts;
 return{accepted:true,increment:state.likes.carry-before.carry};
}
const api={receive};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.PetLikes=api;
})(typeof window==='undefined'?globalThis:window);
