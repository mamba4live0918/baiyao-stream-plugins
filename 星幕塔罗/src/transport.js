(function(root){'use strict';
const key=v=>String(v??'').normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu,'');
function normalizeGift(raw,sdk=false){if(!raw||typeof raw!=='object')return null;const d=raw.data&&typeof raw.data==='object'?raw.data:{};const type=String(raw.type??raw.msgType??raw.method??'').toLowerCase();if(!sdk&&!type.includes('gift')&&type!=='2')return null;
 const g=raw.gift||d.gift||{};const u=raw.user||d.user||raw.userInfo||d.userInfo||{};
 const gift=raw.giftName||g.giftName||g.name||d.giftName||d.name||raw.name;
 const name=u.nickName||u.nickname||u.displayName||u.name||raw.nickName||raw.nickname||raw.username||raw.userName||d.nickName||d.nickname||d.username||d.userName;
 const count=Number(raw.giftCount??raw.count??raw.comboCount??raw.repeatCount??g.giftCount??g.count??g.repeatCount??d.giftCount??d.count??d.comboCount??1);
 if(!gift||!name||!Number.isFinite(count)||count<1)return null;
 return {gift:String(gift).trim().slice(0,80),name:String(name).trim().slice(0,40),uid:String(u.id??u.userId??u.uid??raw.userId??raw.uid??d.userId??d.uid??'').slice(0,100),count:Math.min(999999,Math.floor(count)),eid:String(raw.eventId??raw.event_id??raw.msgId??d.eventId??d.event_id??d.msgId??'').slice(0,150)};
}
function makeDeduper(now=Date.now){const seen=new Map();return x=>{const t=now(),id=x.eid?'e:'+x.eid:'k:'+JSON.stringify([x.uid||x.name,key(x.gift),x.count]),ttl=x.eid?600000:1200;const until=seen.get(id);if(until!==undefined&&until>t)return true;seen.set(id,t+ttl);if(seen.size>500){for(const [k,v]of seen)if(v<=t)seen.delete(k);if(seen.size>1000)seen.delete(seen.keys().next().value);}return false;};}
function connect({getSettings,onGift,onStatus,onUnknown}){let socket=null,sdkBound=false,closed=false,sdkFailed=false;const duplicate=makeDeduper();
 function receive(raw,sdk=false){const x=normalizeGift(raw,sdk);const st=getSettings();if(!st.giftEnabled)return false;if(!x){if(sdk||String(raw?.type??'').toLowerCase().includes('gift'))onUnknown?.();return false;}if(key(x.gift)!==key(st.giftName)||x.count<st.giftMin||duplicate(x))return false;onGift(x);return true;}
 function tick(){if(closed)return;const st=getSettings();if(!st.giftEnabled){if(socket){socket.close();socket=null;}onStatus('礼物排队已暂停');return;}
 if(!sdkBound&&!sdkFailed&&root.SonglanPlugin&&typeof root.SonglanPlugin.onGift==='function'){try{root.SonglanPlugin.onGift(data=>receive(data,true));sdkBound=true;}catch(e){sdkFailed=true;onStatus('SDK 接入失败，尝试本机通道');}}
 if(sdkBound){if(socket){socket.close();socket=null;}onStatus('菘蓝已连接');return;}
 if(socket&&socket._port!==st.wsPort){socket.close();socket=null;}
 if(socket&&socket.readyState<=1)return;
 try{const ws=new root.WebSocket('ws://localhost:'+st.wsPort);socket=ws;ws._port=st.wsPort;onStatus('等待直播连接');ws.onopen=()=>{if(socket===ws)onStatus('本机通道已连接');};ws.onmessage=e=>{if(sdkBound||!getSettings().giftEnabled)return;try{receive(JSON.parse(e.data),false);}catch(err){onStatus('收到无效消息，已忽略');}};ws.onerror=()=>{if(socket===ws)onStatus('未连接 · 可手动排队');};ws.onclose=()=>{if(socket===ws){socket=null;if(!sdkBound&&!closed)onStatus('未连接 · 可手动排队');}};}catch(e){onStatus('连接不可用 · 可手动排队');}}
 const timer=root.setInterval(tick,3000);tick();return {receive,refresh:tick,stop(){closed=true;root.clearInterval(timer);if(socket)socket.close();}};
}
const out={key,normalizeGift,makeDeduper,connect};if(typeof module!=='undefined'&&module.exports)module.exports=out;else root.TarotTransport=out;
})(typeof globalThis!=='undefined'?globalThis:this);
