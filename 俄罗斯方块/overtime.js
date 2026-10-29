(function(root){
  'use strict';
  /* 输了（萌宠消消乐：积分不够）就加班 N 分钟。俄罗斯方块和萌宠消消乐用同一份。
   * 加班记到哪（target）：auto（默认）= 在白曜 0.27.0 以上里、或者填了连接码 → 白曜加班机，不然 → 插件自带的加班机；
   * local = 一直用插件自带的；baiyao = 一直用白曜加班机（不在白曜里要填白曜「加班机 → 加班设置 → 插件连接」里的连接码）。
   * 记到白曜时待发的只记在这一页：没连上先攒着，连上自动补发；刷新就清空，不会补发上一页的。
   * 记到自带的（local-overtime.js）马上加上，礼物加减表也只在这时生效（用白曜加班机时礼物在白曜里配，免得加两遍）。 */
  const TARGETS=['auto','local','baiyao'];
  const validMinutes=value=>(typeof value==='number'||typeof value==='string'&&/^\d+$/.test(value.trim()))&&Number.isInteger(Number(value))&&Number(value)>=1&&Number(value)<=180;
  function createOvertimeLink(options={}){
    const settingsKey=options.settingsKey||'overtime-link-settings-v1',prefix=options.roundPrefix||'loss',label=options.label||'输了一局';
    const Client=options.client||root.BaiyaoOvertimeClient||(typeof require==='function'?require('./baiyao-overtime-client.js'):null);
    const Local=options.Local||root.LocalOvertime||(typeof require==='function'?require('./local-overtime.js'):null);
    let storage=options.storage;try{if(storage===undefined)storage=root.localStorage;}catch{storage=null;}
    let saved={};try{saved=JSON.parse(storage?.getItem(settingsKey)||'{}')||{};}catch{saved={};}
    const settings={minutes:validMinutes(saved.minutes)?Number(saved.minutes):10,enabled:typeof saved.enabled==='boolean'?saved.enabled:true,target:TARGETS.includes(saved.target)?saved.target:'auto'};
    const local=Local.createLocalOvertime({key:options.localKey||settingsKey+'-local',storage,...(options.now?{now:options.now}:{}),...(options.random?{random:options.random}:{})});
    const records=[];let totalCount=0,sentCount=0,totalSeconds=0,sentSeconds=0,sequence=0,round=null,handled=false,last=null,link={};
    // 旧版存的咩播端口不用了，但留在存档里，退回旧版还在
    const persist=()=>{try{storage?.setItem(settingsKey,JSON.stringify({...saved,...settings}));}catch{}};
    const route=()=>settings.target==='local'?'local':settings.target==='baiyao'?'baiyao':(link.mode==='baiyao'||link.keyValid)?'baiyao':'local';
    const snapshot=()=>({...settings,route:route(),mode:link.mode||'none',connection:link.state||'idle',
      statusText:route()==='local'?'记到插件自带的加班机':Client.describe(link),linkText:Client.describe(link),key:link.key||'',keyValid:!!link.keyValid,error:link.error||'',
      timerText:Client.remainingText(link.timer),totalCount,sentCount,totalSeconds,sentSeconds,pendingCount:records.length,last:last?{...last}:null});
    const publish=()=>{try{options.onChange?.(snapshot());}catch{}};
    const client=Client.createBaiyaoOvertime({
      plugin:options.plugin,storage,
      ...(options.env?{env:options.env}:{}),...('WebSocket' in options?{WebSocket:options.WebSocket}:{}),
      ...(options.setTimeout?{setTimeout:options.setTimeout}:{}),...(options.clearTimeout?{clearTimeout:options.clearTimeout}:{}),
      getPending:()=>records.map(r=>({id:r.id,seconds:r.seconds,label})),
      onSent:(id,change)=>{
        const index=records.findIndex(r=>r.id===id);if(index<0)return;
        const[record]=records.splice(index,1);sentCount++;sentSeconds+=record.seconds;
        if(last?.roundId===id)last={...last,status:'sent',change};publish();
      },
      onStatus:value=>{link=value;publish();}
    });
    link=client.snapshot();
    function beginRound(){
      const uuid=root.crypto?.randomUUID?.()||`${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
      round=`${prefix}-${uuid}-${++sequence}`;handled=false;return round;
    }
    function onLoss(id){
      if(!round||id!==round)return{ignored:true};
      if(handled)return{duplicate:true};handled=true;
      if(!settings.enabled)return{status:'disabled',seconds:0};
      const seconds=settings.minutes*60;
      if(route()==='local'){
        local.shift(seconds,label);totalCount++;sentCount++;totalSeconds+=seconds;sentSeconds+=seconds;
        last={roundId:round,seconds,status:'sent',change:String(seconds),route:'local'};publish();
        return{seconds,status:'sent',change:String(seconds),roundId:id,route:'local'};
      }
      records.push({id:round,seconds});totalCount++;totalSeconds+=seconds;last={roundId:round,seconds,status:'pending'};
      client.flush();publish();
      return{seconds,status:last.status,roundId:id};
    }
    function connect(){return settings.enabled?client.start():false;}
    function setEnabled(value){settings.enabled=value===true;persist();if(settings.enabled)client.start();else client.stop();publish();}
    function setMinutes(value){if(!validMinutes(value))return false;settings.minutes=Number(value);persist();publish();return true;}
    function setTarget(value){if(!TARGETS.includes(value))return false;settings.target=value;persist();publish();return true;}
    /* 礼物：只在记到自带加班机时按礼物加减表加减；返回加减的秒数 */
    function onGift(gift){return route()==='local'?local.applyGift(gift):0;}
    // 自带加班机一变就通知界面；订阅时那一次立即回调跳过（游戏页面这时还没准备好）
    let localReady=false;local.subscribe(()=>{if(localReady)publish();});localReady=true;
    return{beginRound,onLoss,connect,setEnabled,setMinutes,setTarget,onGift,route,local,snapshot,stop:()=>client.stop(),setKey:value=>client.setKey(value),
      pending:()=>records.map(r=>({...r})),testConnection:key=>client.test(key===undefined?undefined:{key})};
  }
  root.createOvertimeLink=createOvertimeLink;
  if(typeof module!=='undefined')module.exports={createOvertimeLink};
})(typeof window!=='undefined'?window:globalThis);
