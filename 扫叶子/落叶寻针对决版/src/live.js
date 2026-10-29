(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.LeafLive=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
// 直播事件入口：菘蓝 SDK 优先；没有 SDK 时连本机 WebSocket，断线 3 秒重连。解析、去重、匹配规则后交给 apply，
// 顺带记本局捣乱王／护驾王（档位分 × 份数，点赞不计）和点赞累计。
const WS_URL='ws://localhost:10030',RETRY_MS=3000,RETRY_MAX_MS=30000,SDK_POLL_MS=1000,SDK_POLL_TIMES=15,MAX_PORTIONS=10000,MAX_LIKE_TIMES=50;
const isObj=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
function createLive({G,E,getConfig,apply,onChange=()=>{},now=()=>Date.now(),host=null,WebSocketImpl=null}){
  const dedupe=new G.Dedupe({windowMs:60000,cap:500}),likes=new G.LikeCounter();
  let kings=null,ws=null,wsState='off',timer=0,poll=0,fails=0,sdk=false,stopped=false;
  function resetRound(){kings={troll:{scores:new Map(),top:null},help:{scores:new Map(),top:null}};onChange();}
  function score(side,who,pts){
    const k=kings[side];if(!k)return;
    const e=k.scores.get(who.name)||{name:who.name,avatar:null,score:0};
    e.score+=pts;if(who.avatar)e.avatar=who.avatar;k.scores.set(who.name,e);
    if(!k.top||e===k.top||e.score>k.top.score)k.top=e; // 同分不换人：先到者优先
  }
  function gift(g){
    if(dedupe.seen(g.eventId,now()))return false;
    const cfg=getConfig(),rule=G.matchRule(cfg.rules,g.name),def=rule&&E.EFFECT_BY_ID[rule.effect];
    if(!def)return false;
    const portions=Math.min(MAX_PORTIONS,g.count*rule.portions),who={name:g.nickname,avatar:g.avatar};
    if(!apply(rule.effect,rule.tier,portions,who))return false;
    score(def.side,who,(E.TIER_SCORE[rule.tier]||0)*portions);onChange();return true;
  }
  function like(l){
    if(dedupe.seen(l.eventId,now()))return false;
    const L=getConfig().likes,times=likes.add(l.count,L.enabled?L.step:0);
    if(times>0)apply(L.effect,L.tier,L.portions*Math.min(times,MAX_LIKE_TIMES),{name:'点赞满 '+L.step,avatar:null,like:true});
    onChange();return true;
  }
  function receive(msg){
    if(Array.isArray(msg))return msg.map(receive).some(Boolean);
    const g=G.parseGift(msg);if(g)return gift(g);
    const l=G.parseLike(msg);return l?like(l):false;
  }
  const receiveGift=msg=>{const g=G.parseGift(msg);return g?gift(g):false;};
  // SDK 的点赞回调可能不带 type，按点赞补上再解析
  const receiveLike=msg=>{const l=G.parseLike(msg)||(isObj(msg)?G.parseLike({...msg,type:'like'}):null);return l?like(l):false;};
  function bindSdk(){
    const S=host&&host.SonglanPlugin;if(sdk||!S||typeof S.onGift!=='function')return sdk;
    try{S.onGift(receiveGift);if(typeof S.onLike==='function')S.onLike(receiveLike);}catch(e){return false;}
    sdk=true;closeWS();onChange();return true;
  }
  // 连上过又断开：3 秒重连；本机根本没开服务：逐步放慢到 30 秒一次，免得每 3 秒报一次连接失败
  function schedule(){clearTimeout(timer);if(!sdk&&!stopped)timer=setTimeout(connectWS,Math.min(RETRY_MAX_MS,RETRY_MS*2**Math.min(fails,4)));}
  function closeWS(){clearTimeout(timer);if(ws){const s=ws;ws=null;try{s.close();}catch{}}wsState='off';}
  function connectWS(){
    const WS=WebSocketImpl||(host&&host.WebSocket);
    if(sdk||stopped||!WS||(ws&&ws.readyState<=1))return;
    clearTimeout(timer);let s;
    try{s=new WS(WS_URL);}catch{wsState='closed';fails++;onChange();schedule();return;}
    ws=s;wsState='connecting';onChange();
    let opened=false;
    s.onopen=()=>{if(ws===s){opened=true;fails=0;wsState='open';onChange();}};
    s.onmessage=ev=>{if(ws!==s||sdk)return;let m;try{m=JSON.parse(ev.data);}catch{return;}receive(m);};
    s.onerror=()=>{};
    s.onclose=()=>{if(ws!==s)return;ws=null;wsState='closed';if(!opened)fails++;onChange();schedule();};
  }
  // 宿主可能稍晚才注入 SDK：先连 WebSocket，同时轮询 SDK 一阵，接上 SDK 后断开 WebSocket，免得同一礼物进来两次
  function start(){
    if(bindSdk())return;
    connectWS();let n=0;
    poll=setInterval(()=>{if(bindSdk()||++n>=SDK_POLL_TIMES)clearInterval(poll);},SDK_POLL_MS);
  }
  function stop(){stopped=true;clearInterval(poll);closeWS();}
  const view=k=>k.top?{name:k.top.name,avatar:k.top.avatar,score:k.top.score}:null;
  resetRound();
  return{
    receive,receiveGift,receiveLike,start,stop,resetRound,
    connectWS(){clearTimeout(timer);fails=0;connectWS();},
    kings:()=>({troll:view(kings.troll),help:view(kings.help)}),
    likeStatus:()=>likes.toJSON(),
    connection:()=>({sdk,ws:wsState,url:WS_URL})
  };
}
return{createLive,WS_URL,MAX_PORTIONS};
});
